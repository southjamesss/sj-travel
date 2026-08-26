const typeSizes = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  7: 1,
  9: 4,
  10: 8,
};

function readAscii(view, offset, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (code === 0) break;
    value += String.fromCharCode(code);
  }

  return value.trim();
}

function readUint16(view, offset, littleEndian) {
  return view.getUint16(offset, littleEndian);
}

function readUint32(view, offset, littleEndian) {
  return view.getUint32(offset, littleEndian);
}

function getValueOffset(view, tiffStart, entryOffset, type, count, littleEndian) {
  const size = (typeSizes[type] ?? 1) * count;
  if (size <= 4) return entryOffset + 8;
  return tiffStart + readUint32(view, entryOffset + 8, littleEndian);
}

function readIfdEntries(view, tiffStart, ifdOffset, littleEndian) {
  if (!ifdOffset) return new Map();

  const offset = tiffStart + ifdOffset;
  if (offset + 2 > view.byteLength) return new Map();

  const count = readUint16(view, offset, littleEndian);
  const entries = new Map();

  for (let index = 0; index < count; index += 1) {
    const entryOffset = offset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = readUint16(view, entryOffset, littleEndian);
    const type = readUint16(view, entryOffset + 2, littleEndian);
    const valueCount = readUint32(view, entryOffset + 4, littleEndian);
    const valueOffset = getValueOffset(view, tiffStart, entryOffset, type, valueCount, littleEndian);

    entries.set(tag, {
      type,
      count: valueCount,
      offset: valueOffset,
    });
  }

  return entries;
}

function readEntryAscii(view, entry) {
  if (!entry || entry.type !== 2) return '';
  return readAscii(view, entry.offset, entry.count);
}

function readRational(view, offset, littleEndian) {
  const numerator = readUint32(view, offset, littleEndian);
  const denominator = readUint32(view, offset + 4, littleEndian);
  if (!denominator) return 0;
  return numerator / denominator;
}

function readRationalArray(view, entry, littleEndian) {
  if (!entry || entry.type !== 5) return [];

  return Array.from({ length: entry.count }, (_, index) =>
    readRational(view, entry.offset + index * 8, littleEndian),
  );
}

function parseExifDate(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseGpsCoordinate(values, ref) {
  if (values.length < 3) return null;

  const coordinate = values[0] + values[1] / 60 + values[2] / 3600;
  if (ref === 'S' || ref === 'W') return -coordinate;
  return coordinate;
}

function parseTiff(view, tiffStart) {
  const byteOrder = readAscii(view, tiffStart, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return {};

  if (readUint16(view, tiffStart + 2, littleEndian) !== 42) return {};

  const ifd0Offset = readUint32(view, tiffStart + 4, littleEndian);
  const ifd0 = readIfdEntries(view, tiffStart, ifd0Offset, littleEndian);
  const gpsPointer = ifd0.get(0x8825);
  const exifPointer = ifd0.get(0x8769);
  const gps = gpsPointer ? readIfdEntries(view, tiffStart, readUint32(view, gpsPointer.offset, littleEndian), littleEndian) : null;
  const exif = exifPointer ? readIfdEntries(view, tiffStart, readUint32(view, exifPointer.offset, littleEndian), littleEndian) : null;

  const latitudeRef = readEntryAscii(view, gps?.get(0x0001));
  const longitudeRef = readEntryAscii(view, gps?.get(0x0003));
  const latitudeValues = readRationalArray(view, gps?.get(0x0002), littleEndian);
  const longitudeValues = readRationalArray(view, gps?.get(0x0004), littleEndian);
  const latitude = parseGpsCoordinate(latitudeValues, latitudeRef);
  const longitude = parseGpsCoordinate(longitudeValues, longitudeRef);
  const dateValue =
    readEntryAscii(view, exif?.get(0x9003)) ||
    readEntryAscii(view, exif?.get(0x9004)) ||
    readEntryAscii(view, ifd0.get(0x0132));

  return {
    latitude,
    longitude,
    takenAt: parseExifDate(dateValue),
  };
}

function extractJpegExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return {};

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;

    if (marker === 0xe1 && readAscii(view, segmentStart, 6) === 'Exif') {
      return parseTiff(view, segmentStart + 6);
    }

    offset += 2 + segmentLength;
  }

  return {};
}

export async function readPhotoMetadata(file) {
  const buffer = await file.arrayBuffer();
  const metadata = extractJpegExif(buffer);

  return {
    latitude: Number.isFinite(metadata.latitude) ? metadata.latitude : null,
    longitude: Number.isFinite(metadata.longitude) ? metadata.longitude : null,
    takenAt: metadata.takenAt ?? null,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('ไม่สามารถอ่านรูปนี้ได้'));
    };
    image.src = objectUrl;
  });
}

function canvasToDataUrl(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL(type, quality));
          return;
        }

        resolve(await readFileAsDataUrl(blob));
      },
      type,
      quality,
    );
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function replaceFileExtension(fileName, extension) {
  const cleanedName = String(fileName || 'travel-photo').replace(/\.[^.]+$/, '');
  return `${cleanedName}.${extension}`;
}

async function drawFileToCanvas(file, maxSide = 1600) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

export async function prepareImageUpload(file) {
  try {
    const canvas = await drawFileToCanvas(file);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);

    if (!blob) throw new Error('ไม่สามารถย่อรูปนี้ได้');

    return {
      file: blob,
      mimeType: blob.type || 'image/jpeg',
      uploadFileName: replaceFileExtension(file.name, 'jpg'),
    };
  } catch {
    return {
      file,
      mimeType: file.type || 'application/octet-stream',
      uploadFileName: file.name,
    };
  }
}

export async function prepareImageDataUrl(file) {
  try {
    const canvas = await drawFileToCanvas(file);
    return canvasToDataUrl(canvas, 'image/jpeg', 0.82);
  } catch {
    return readFileAsDataUrl(file);
  }
}
