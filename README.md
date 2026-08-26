# แผนที่ความทรงจำ + Express + Prisma + MySQL

## โครงสร้างโปรเจกต์

```text
frontend/  React + Vite สำหรับหน้าแผนที่ความทรงจำ
backend/   Express API + Prisma สำหรับตรวจสถานะฐานข้อมูล
.env       ค่าตั้งต้น MySQL และ API
```

## สิ่งที่ต้องมี

- Node.js 20+
- MySQL ที่ `127.0.0.1:3306`

## เริ่มระบบ

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev1
```

- หน้าเว็บ: http://localhost:5173
- API: http://localhost:3000/api/health

## Frontend ตอนนี้

ระบบเป็น Phase 1 ของ Travel Memory Map:

- แสดงแผนที่ประเทศไทยครบ 77 จังหวัดจากไฟล์ GeoJSON จริง
- จังหวัดทั้งหมดเป็น polygon ที่กดได้
- จังหวัดที่เคยไปมีสีต่างจากจังหวัดทั่วไป
- กด `ตราด` แล้วซูมเข้าแบบ smooth
- แสดงหมุด `เกาะช้าง`
- กดหมุดเพื่อดูรูปตัวอย่าง 3 รูป
- กดรูปเพื่อเปิดแกลเลอรี
- ปุ่มกลับทำงานจากสถานที่ → จังหวัด → ประเทศไทย โดยไม่ reload หน้า
- มีปุ่มสมัครสมาชิก/เข้าสู่ระบบ/ออกจากระบบ โดย backend ใช้ Prisma/MySQL เก็บผู้ใช้และ session token
- หลังเข้าสู่ระบบมีปุ่ม `นำเข้ารูป` เพื่อให้ browser ขออนุญาตเข้าถึงรูปที่เลือก
- ระบบอ่าน GPS EXIF จากรูปเพื่อหาว่าอยู่จังหวัดไหน แล้วเพิ่มจังหวัด/หมุด/แกลเลอรีให้อัตโนมัติ
- ถ้ารูปไม่มี GPS หรือ browser อ่าน GPS จาก HEIC ไม่ได้ ระบบจะเปิดหน้าตรวจรูปให้เลือกจังหวัดเองก่อนนำเข้า
- มีปุ่มซูมเข้า/ซูมออก/รีเซ็ตมุมมอง และลากแผนที่ด้วยเมาส์ได้
- ใช้เมาส์/trackpad scroll เพื่อซูมแผนที่ได้
- มีหน้าจัดการรูปที่นำเข้า เพื่อค้นหา กรองตามจังหวัด แก้ไขชื่อสถานที่/คำบรรยาย/จังหวัด และลบรูปออกจากบัญชี
- แก้พิกัดละติจูด/ลองจิจูดของรูปได้ เพื่อย้ายตำแหน่งหมุดเอง
- ลบรูปต้องกดยืนยันก่อนลบ ลดโอกาสลบพลาด
- ค้นหาจังหวัด สถานที่ หรือรูปจากแถบค้นหา แล้วซูมเข้าแผนที่ทันที
- มี Dashboard สรุปจำนวนจังหวัด รูปทั้งหมด พื้นที่เก็บรูป รูปล่าสุด และจังหวัดที่มีรูปมากที่สุด
- Export backup ได้ทั้ง JSON และ CSV จาก Dashboard
- แยก bundle ด้วย Vite manual chunks ให้ React/vendor, หน้าแผนที่, modal และข้อมูล GeoJSON โหลดเป็นส่วน ๆ

ไฟล์หลัก:

- `frontend/src/data/thailandProvinces.json`
- `frontend/src/data/travelMemoryData.js`
- `frontend/src/lib/mapGeometry.js`
- `frontend/src/components/travel-map/`
- `backend/prisma/schema.prisma`
- `backend/src/index.js`

ข้อมูลขอบเขตจังหวัดใช้ `provinces.geojson` จาก OpenGISData-Thailand: https://github.com/chingchai/OpenGISData-Thailand

## Auth / Prisma

ระบบเข้าสู่ระบบตอนนี้ใช้ตาราง:

- `User`
- `UserSession`
- `TravelPhoto`

API ที่มี:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/photos`
- `GET /api/profile/stats`
- `GET /api/export`
- `GET /api/export.csv`
- `POST /api/photos/import`
- `PATCH /api/photos/:id`
- `DELETE /api/photos/:id`

รหัสผ่านถูก hash ด้วย `crypto.scrypt` ของ Node.js, `login` ใช้เฉพาะบัญชีที่สมัครไว้แล้ว และ frontend เก็บเฉพาะ session token ใน `localStorage`

ระบบนำเข้ารูปจะอ่าน GPS EXIF จาก browser แล้วส่งไฟล์ด้วย `multipart/form-data` ไป backend จากนั้น backend เก็บไฟล์ไว้ที่ `backend/uploads/` และเก็บ metadata/URL/จังหวัดลง MySQL ผ่าน Prisma

backend มี security headers พื้นฐาน, ปิด `X-Powered-By`, rate limit สำหรับ `/api` และ rate limit แยกสำหรับ `/api/auth`

หมายเหตุ: browser ไม่อนุญาตให้เว็บเข้าถึง Photos Library เองโดยตรง ผู้ใช้ต้องกดเลือกไฟล์ก่อน ถ้ารูปไม่มี GPS EXIF หรือเป็น HEIC ที่ browser อ่าน metadata ไม่ได้ ผู้ใช้ยังเลือกจังหวัดเองเพื่อนำเข้าได้

ถ้าต้องการรันแยก:

```bash
npm run dev:frontend
npm run dev:backend
```
