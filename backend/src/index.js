import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: new URL('../../.env', import.meta.url) });

const srcDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(srcDirectory, '../uploads');
const execFileAsync = promisify(execFile);
const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT ?? 3000);
const sessionDays = 30;
const maxImportPhotos = 30;
const maxPhotoBytes = 4 * 1024 * 1024;
const maxImportRequestBytes = 180 * 1024 * 1024;
const maxUserStorageBytes = 250 * 1024 * 1024;
const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const apiRateLimit = {
  windowMs: 5 * 60 * 1000,
  maxRequests: 240,
};
const authRateLimit = {
  windowMs: 10 * 60 * 1000,
  maxRequests: 50,
};

app.disable('x-powered-by');
app.use(cors());
app.use(securityHeaders);
app.use('/api', createRateLimiter({ scope: 'api', ...apiRateLimit }));
app.use('/api/auth', createRateLimiter({ scope: 'auth', ...authRateLimit }));
app.use(express.json({ limit: '180mb' }));

function securityHeaders(_request, response, next) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  next();
}

function rateLimitKey(request, scope) {
  return `${scope}:${request.ip || request.socket.remoteAddress || 'unknown'}`;
}

function createRateLimiter({ scope, windowMs, maxRequests }) {
  const buckets = new Map();

  return (request, response, next) => {
    const now = Date.now();
    const key = rateLimitKey(request, scope);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return response.status(429).json({ error: 'มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }

    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    return next();
  };
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function getBaseUrl(request) {
  return `${request.protocol}://${request.get('host')}`;
}

function publicTravelPhoto(photo, request) {
  return {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    // Keep the list response small. The image endpoint is cacheable and reads the durable DB copy.
    imageData: null,
    imageUrl: photo.id ? `${getBaseUrl(request)}/api/photos/${photo.id}/image` : null,
    imageSize: photo.imageSize,
    takenAt: photo.takenAt?.toISOString() ?? null,
    latitude: photo.latitude === null ? null : Number(photo.latitude),
    longitude: photo.longitude === null ? null : Number(photo.longitude),
    provinceCode: photo.provinceCode,
    provinceName: photo.provinceName,
    placeName: photo.placeName,
    caption: photo.caption,
    createdAt: photo.createdAt.toISOString(),
  };
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function photosToCsv(photos, request) {
  const headers = [
    'id',
    'fileName',
    'provinceName',
    'placeName',
    'caption',
    'takenAt',
    'latitude',
    'longitude',
    'imageUrl',
    'imageSize',
  ];
  const rows = photos.map((photo) => {
    const publicPhoto = publicTravelPhoto(photo, request);
    return headers.map((key) => escapeCsvValue(publicPhoto[key])).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function exportFileName(extension) {
  const date = new Date().toISOString().slice(0, 10);
  return `travel-memory-backup-${date}.${extension}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash).split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getBearerToken(request) {
  const header = request.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

async function findSessionUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

async function requireSessionUser(request, response) {
  const user = await findSessionUser(request);
  if (!user) {
    response.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้' });
    return null;
  }

  return user;
}

function sanitizeText(value, fallback, maxLength) {
  const text = String(value ?? '').trim() || fallback;
  return text.slice(0, maxLength);
}

function parseNullableDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNullableCoordinate(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number.toFixed(7);
}

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function inferMimeTypeFromFileName(fileName) {
  const extension = path.extname(String(fileName ?? '')).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.heic') return 'image/heic';
  if (extension === '.heif') return 'image/heif';
  return '';
}

function normalizeImageMimeType(mimeType, fileName = '') {
  const normalizedMimeType = String(mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (normalizedMimeType === 'image/jpg') return 'image/jpeg';
  if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') return normalizedMimeType;
  return inferMimeTypeFromFileName(fileName);
}

function validateImageBuffer(mimeType, buffer, fileName = '') {
  const normalizedMimeType = normalizeImageMimeType(mimeType, fileName);
  if (!allowedImageMimeTypes.has(normalizedMimeType)) {
    throw new Error('รองรับเฉพาะ JPEG, PNG, WEBP, HEIC หรือ HEIF');
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('รูปภาพไม่มีข้อมูล');
  }

  if (buffer.length > maxPhotoBytes) {
    throw new Error(`รูปภาพแต่ละรูปต้องไม่เกิน ${Math.round(maxPhotoBytes / 1024 / 1024)}MB`);
  }

  return { mimeType: normalizedMimeType, buffer };
}

function parseDataUrlImage(imageData) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(imageData ?? ''));
  if (!match) {
    throw new Error('รูปภาพไม่ถูกต้อง');
  }

  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  return validateImageBuffer(mimeType, buffer);
}

function imageDataUrl(mimeType, buffer) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function imageExtension(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

function isHeicFileName(fileName) {
  return /\.(heic|heif)$/i.test(fileName);
}

function uploadFilePath(userId, fileName) {
  if (!/^\d+$/.test(String(userId)) || path.basename(fileName) !== fileName) return null;

  const filePath = path.resolve(uploadsRoot, String(userId), fileName);
  return filePath.startsWith(`${uploadsRoot}${path.sep}`) ? filePath : null;
}

async function createBrowserPreview(sourcePath) {
  const previewPath = `${sourcePath}.preview.png`;

  try {
    await fs.access(previewPath);
    return previewPath;
  } catch {
    // Quick Look reads iPhone HEIC reliably; cache its PNG rendition after the first visit.
  }

  if (process.platform !== 'darwin') {
    throw new Error('เซิร์ฟเวอร์นี้ยังไม่รองรับการแปลงไฟล์ HEIC');
  }

  const temporaryDirectory = path.join(path.dirname(sourcePath), `.preview-${crypto.randomUUID()}`);
  const generatedPath = path.join(temporaryDirectory, `${path.basename(sourcePath)}.png`);
  try {
    await fs.mkdir(temporaryDirectory);
    await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', '1600', '-o', temporaryDirectory, sourcePath]);
    await fs.rename(generatedPath, previewPath);
    return previewPath;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

app.get('/uploads/:userId/:fileName', asyncRoute(async (request, response, next) => {
  const { userId, fileName } = request.params;
  if (!isHeicFileName(fileName)) return next();

  const sourcePath = uploadFilePath(userId, fileName);
  if (!sourcePath) return response.sendStatus(404);

  try {
    const previewPath = await createBrowserPreview(sourcePath);
    response.type('png');
    response.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return response.sendFile(previewPath);
  } catch {
    return response.status(415).json({ error: 'ไม่สามารถแปลงไฟล์ HEIC เพื่อแสดงผลได้' });
  }
}));

app.use('/uploads', express.static(uploadsRoot, {
  immutable: true,
  maxAge: '7d',
}));

async function saveImageFile(userId, imageData) {
  const { mimeType, buffer } = parseDataUrlImage(imageData);
  return saveImageBuffer(userId, mimeType, buffer);
}

async function saveImageBuffer(userId, mimeType, buffer) {
  const validImage = validateImageBuffer(mimeType, buffer);
  const userDirectory = path.join(uploadsRoot, String(userId));
  const fileName = `${crypto.randomUUID()}.${imageExtension(validImage.mimeType)}`;

  await fs.mkdir(userDirectory, { recursive: true });
  await fs.writeFile(path.join(userDirectory, fileName), validImage.buffer);

  return {
    mimeType: validImage.mimeType,
    imagePath: `${userId}/${fileName}`,
    imageSize: validImage.buffer.length,
  };
}

async function removeStoredImage(imagePath) {
  if (!imagePath) return;

  const fullPath = path.resolve(uploadsRoot, imagePath);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) return;

  await fs.unlink(fullPath).catch(() => null);
}

async function readStoredImage(imagePath) {
  if (!imagePath) return null;

  const fullPath = path.resolve(uploadsRoot, imagePath);
  if (!fullPath.startsWith(`${uploadsRoot}${path.sep}`)) return null;

  try {
    return await fs.readFile(fullPath);
  } catch {
    return null;
  }
}

async function getUserStorageBytes(userId) {
  const result = await prisma.travelPhoto.aggregate({
    where: { userId },
    _sum: { imageSize: true },
  });

  return result._sum.imageSize ?? 0;
}

function normalizeImportedPhoto(photo) {
  const hasFileBuffer = Buffer.isBuffer(photo.fileBuffer);
  const imageData = hasFileBuffer ? '' : String(photo.imageData ?? '');
  const { mimeType, buffer } = hasFileBuffer
    ? validateImageBuffer(photo.mimeType, photo.fileBuffer, photo.fileName)
    : parseDataUrlImage(imageData);

  return {
    fileName: sanitizeText(photo.fileName, 'travel-photo.jpg', 255),
    imageData: hasFileBuffer ? null : imageData,
    fileBuffer: hasFileBuffer ? buffer : null,
    mimeType,
    imageSize: buffer.length,
    takenAt: parseNullableDate(photo.takenAt),
    latitude: parseNullableCoordinate(photo.latitude, -90, 90),
    longitude: parseNullableCoordinate(photo.longitude, -180, 180),
    provinceCode: photo.provinceCode ? sanitizeText(photo.provinceCode, '', 8) : null,
    provinceName: photo.provinceName ? sanitizeText(photo.provinceName, '', 120) : null,
    placeName: photo.placeName ? sanitizeText(photo.placeName, '', 160) : null,
    caption: photo.caption ? sanitizeText(photo.caption, '', 255) : null,
  };
}

function multipartBoundary(request) {
  const contentType = request.get('content-type') ?? '';
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match?.[1] ?? match?.[2] ?? '';
}

async function readRequestBuffer(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxImportRequestBytes) {
      throw statusError(413, 'ชุดรูปที่ส่งมาใหญ่เกินไป กรุณาเลือกรูปน้อยลงแล้วลองใหม่');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
  return {
    name: /(?:^|;\s*)name="([^"]*)"/i.exec(value)?.[1] ?? '',
    filename: /(?:^|;\s*)filename="([^"]*)"/i.exec(value)?.[1] ?? '',
  };
}

function parseMultipartParts(body, boundary) {
  const text = body.toString('latin1');
  const rawParts = text.split(`--${boundary}`);

  return rawParts
    .map((rawPart) => {
      let part = rawPart;
      if (!part || part === '--' || part === '--\r\n') return null;
      if (part.startsWith('\r\n')) part = part.slice(2);
      if (part.endsWith('\r\n')) part = part.slice(0, -2);
      if (part.endsWith('--')) part = part.slice(0, -2);

      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd < 0) return null;

      const headers = new Map();
      part.slice(0, headerEnd).split('\r\n').forEach((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex < 0) return;
        headers.set(line.slice(0, separatorIndex).trim().toLowerCase(), line.slice(separatorIndex + 1).trim());
      });

      const disposition = parseContentDisposition(headers.get('content-disposition') ?? '');
      return {
        ...disposition,
        contentType: headers.get('content-type') ?? '',
        data: Buffer.from(part.slice(headerEnd + 4), 'latin1'),
      };
    })
    .filter(Boolean);
}

async function parseMultipartImportRequest(request) {
  const boundary = multipartBoundary(request);
  if (!boundary) {
    throw statusError(400, 'รูปแบบ multipart ไม่ถูกต้อง');
  }

  const body = await readRequestBuffer(request);
  const parts = parseMultipartParts(body, boundary);
  const metadataPart = parts.find((part) => part.name === 'photos');
  const fileParts = parts.filter((part) => part.name === 'files');

  if (!metadataPart) {
    throw statusError(400, 'ไม่พบข้อมูลรูปภาพ');
  }

  let photos;
  try {
    photos = JSON.parse(metadataPart.data.toString('utf8'));
  } catch {
    throw statusError(400, 'ข้อมูลรูปภาพไม่ถูกต้อง');
  }

  if (!Array.isArray(photos)) {
    throw statusError(400, 'ข้อมูลรูปภาพต้องเป็นรายการ');
  }

  if (photos.length !== fileParts.length) {
    throw statusError(400, 'จำนวนไฟล์รูปไม่ตรงกับข้อมูลรูปภาพ');
  }

  return photos.map((photo, index) => ({
    ...photo,
    fileName: photo.fileName || fileParts[index].filename || `travel-photo-${index + 1}.jpg`,
    mimeType: photo.mimeType || fileParts[index].contentType,
    fileBuffer: fileParts[index].data,
  }));
}

async function getImportPhotos(request) {
  if (request.is('multipart/form-data')) {
    return parseMultipartImportRequest(request);
  }

  return Array.isArray(request.body.photos) ? request.body.photos : [];
}

function normalizePhotoUpdate(body) {
  return {
    placeName: body.placeName !== undefined ? sanitizeText(body.placeName, '', 160) || null : undefined,
    caption: body.caption !== undefined ? sanitizeText(body.caption, '', 255) || null : undefined,
    provinceCode: body.provinceCode !== undefined ? sanitizeText(body.provinceCode, '', 8) || null : undefined,
    provinceName: body.provinceName !== undefined ? sanitizeText(body.provinceName, '', 120) || null : undefined,
    latitude: body.latitude !== undefined ? parseNullableCoordinate(body.latitude, -90, 90) : undefined,
    longitude: body.longitude !== undefined ? parseNullableCoordinate(body.longitude, -180, 180) : undefined,
    takenAt: body.takenAt !== undefined ? parseNullableDate(body.takenAt) : undefined,
  };
}

app.get('/api/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = String(request.body.password ?? '');

  if (!email || !email.includes('@')) {
    return response.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  }

  if (password.length < 6) {
    return response.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return response.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  const session = await createSession(user.id);
  return response.json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
}));

app.post('/api/auth/register', asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = String(request.body.password ?? '');
  const name = String(request.body.name ?? '').trim();

  if (!name) {
    return response.status(400).json({ error: 'กรุณากรอกชื่อที่แสดง' });
  }

  if (!email || !email.includes('@')) {
    return response.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  }

  if (password.length < 6) {
    return response.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return response.status(409).json({ error: 'อีเมลนี้ถูกสมัครไว้แล้ว กรุณาเข้าสู่ระบบ' });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashPassword(password),
    },
  });

  const session = await createSession(user.id);
  return response.status(201).json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
}));

app.get('/api/auth/me', asyncRoute(async (request, response) => {
  const user = await findSessionUser(request);
  if (!user) return response.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });

  return response.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', asyncRoute(async (request, response) => {
  const token = getBearerToken(request);
  if (token) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  return response.json({ status: 'ok' });
}));

app.get('/api/photos', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photos = await prisma.travelPhoto.findMany({
    where: { userId: user.id },
    orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
  });

  return response.json({ photos: photos.map((photo) => publicTravelPhoto(photo, request)) });
}));

app.get('/api/photos/:id/image', asyncRoute(async (request, response) => {
  const photoId = Number(request.params.id);
  if (!Number.isInteger(photoId) || photoId < 1) return response.sendStatus(404);

  const photo = await prisma.travelPhoto.findUnique({ where: { id: photoId } });
  if (!photo) return response.sendStatus(404);

  let image = null;
  if (photo.imageData) {
    try {
      image = parseDataUrlImage(photo.imageData).buffer;
    } catch {
      image = null;
    }
  }

  image ??= await readStoredImage(photo.imagePath);
  if (!image) return response.sendStatus(404);

  response.type(photo.mimeType || 'image/jpeg');
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return response.send(image);
}));

app.get('/api/profile/stats', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photos = await prisma.travelPhoto.findMany({
    where: { userId: user.id },
    orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
  });
  const provinces = new Map();
  const storageBytes = photos.reduce((sum, photo) => sum + (photo.imageSize ?? 0), 0);

  photos.forEach((photo) => {
    if (!photo.provinceCode) return;
    const current = provinces.get(photo.provinceCode) ?? {
      provinceCode: photo.provinceCode,
      provinceName: photo.provinceName ?? 'ไม่ทราบจังหวัด',
      photoCount: 0,
    };
    current.photoCount += 1;
    provinces.set(photo.provinceCode, current);
  });

  return response.json({
    photoCount: photos.length,
    visitedProvinceCount: provinces.size,
    storageBytes,
    latestPhoto: photos[0] ? publicTravelPhoto(photos[0], request) : null,
    provinces: [...provinces.values()].sort((first, second) => second.photoCount - first.photoCount),
  });
}));

app.get('/api/export', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photos = await prisma.travelPhoto.findMany({
    where: { userId: user.id },
    orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
  });

  response.setHeader('Content-Disposition', `attachment; filename="${exportFileName('json')}"`);
  return response.json({
    exportedAt: new Date().toISOString(),
    user: publicUser(user),
    photos: photos.map((photo) => publicTravelPhoto(photo, request)),
  });
}));

app.get('/api/export.csv', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photos = await prisma.travelPhoto.findMany({
    where: { userId: user.id },
    orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
  });

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${exportFileName('csv')}"`);
  return response.send(photosToCsv(photos, request));
}));

app.post('/api/photos/import', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photos = await getImportPhotos(request);
  if (photos.length === 0) {
    return response.status(400).json({ error: 'กรุณาเลือกรูปอย่างน้อย 1 รูป' });
  }

  if (photos.length > maxImportPhotos) {
    return response.status(400).json({ error: `นำเข้าได้ครั้งละไม่เกิน ${maxImportPhotos} รูป` });
  }

  let normalizedPhotos;
  try {
    normalizedPhotos = photos.map(normalizeImportedPhoto);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const incomingBytes = normalizedPhotos.reduce((sum, photo) => sum + photo.imageSize, 0);
  const usedBytes = await getUserStorageBytes(user.id);
  if (usedBytes + incomingBytes > maxUserStorageBytes) {
    return response.status(400).json({ error: 'พื้นที่เก็บรูปของบัญชีนี้เต็มแล้ว กรุณาลบรูปเก่าก่อนนำเข้าเพิ่ม' });
  }

  const preparedPhotos = [];
  try {
    for (const photo of normalizedPhotos) {
      const storedImage = photo.fileBuffer
        ? await saveImageBuffer(user.id, photo.mimeType, photo.fileBuffer)
        : await saveImageFile(user.id, photo.imageData);
      const { fileBuffer, ...photoData } = photo;
      preparedPhotos.push({
        ...photoData,
        ...storedImage,
        // Render and deployments no longer depend on Render's temporary filesystem.
        imageData: photo.fileBuffer
          ? imageDataUrl(photo.mimeType, photo.fileBuffer)
          : photo.imageData,
      });
    }
  } catch (error) {
    await Promise.all(preparedPhotos.map((photo) => removeStoredImage(photo.imagePath)));
    return response.status(400).json({ error: error.message });
  }

  try {
    const savedPhotos = await prisma.$transaction(
      preparedPhotos.map((photo) =>
        prisma.travelPhoto.create({
          data: {
            ...photo,
            userId: user.id,
          },
        }),
      ),
    );

    return response.status(201).json({ photos: savedPhotos.map((photo) => publicTravelPhoto(photo, request)) });
  } catch (error) {
    await Promise.all(preparedPhotos.map((photo) => removeStoredImage(photo.imagePath)));
    throw error;
  }
}));

app.patch('/api/photos/:id', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photoId = Number(request.params.id);
  if (!Number.isInteger(photoId) || photoId < 1) {
    return response.status(400).json({ error: 'รหัสรูปภาพไม่ถูกต้อง' });
  }

  const data = normalizePhotoUpdate(request.body);
  const existingPhoto = await prisma.travelPhoto.findFirst({
    where: {
      id: photoId,
      userId: user.id,
    },
  });

  if (!existingPhoto) {
    return response.status(404).json({ error: 'ไม่พบรูปภาพนี้ในบัญชีของคุณ' });
  }

  const updatedPhoto = await prisma.travelPhoto.update({
    where: { id: existingPhoto.id },
    data,
  });

  return response.json({ photo: publicTravelPhoto(updatedPhoto, request) });
}));

app.delete('/api/photos/:id', asyncRoute(async (request, response) => {
  const user = await requireSessionUser(request, response);
  if (!user) return;

  const photoId = Number(request.params.id);
  if (!Number.isInteger(photoId) || photoId < 1) {
    return response.status(400).json({ error: 'รหัสรูปภาพไม่ถูกต้อง' });
  }

  const photo = await prisma.travelPhoto.findFirst({
    where: {
      id: photoId,
      userId: user.id,
    },
  });

  if (!photo) {
    return response.status(404).json({ error: 'ไม่พบรูปภาพนี้ในบัญชีของคุณ' });
  }

  await prisma.travelPhoto.delete({ where: { id: photo.id } });
  await removeStoredImage(photo.imagePath);

  return response.json({ status: 'ok' });
}));

app.use((error, _request, response, _next) => {
  if (error.statusCode) {
    return response.status(error.statusCode).json({ error: error.message });
  }

  if (error.type === 'entity.too.large') {
    return response.status(413).json({ error: 'ชุดรูปที่ส่งมาใหญ่เกินไป กรุณาเลือกรูปน้อยลงแล้วลองใหม่' });
  }

  console.error(error);
  return response.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
