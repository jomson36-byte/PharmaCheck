# PharmaCheck

แบบตรวจ GPP สำหรับ iPad แบบ Local-first ตามข้อกำหนดใน `Design.md`

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

## Google Sheets setup

1. สร้างโปรเจกต์ใน Google Cloud Console
2. เปิดใช้งาน Google Sheets API
3. สร้าง OAuth 2.0 Client ID ประเภท Web application
4. เพิ่ม URL ของแอปใน Authorized JavaScript origins เช่น `http://localhost:3000`
5. สร้าง Google Spreadsheet เปล่า
6. เปิดแอป ไปที่หน้าตรวจสอบ แล้วเลือก `ตั้งค่า`
7. ใส่ OAuth Client ID และ Spreadsheet ID

แอปจะสร้างแท็บ `Submissions` และ Header ที่ต้องใช้ให้อัตโนมัติเมื่อส่งครั้งแรก

## Data safety

- แบบร่างถูกเก็บใน IndexedDB ของอุปกรณ์
- Google OAuth access token อยู่ในหน่วยความจำชั่วคราวเท่านั้น
- ควรส่งออก JSON backup หรือ Sync ไป Google Sheets อย่างสม่ำเสมอ
- อย่าล้างข้อมูล Safari หรือลบ Home Screen Web App ก่อนสำรองข้อมูล

## Commands

```bash
npm run dev
npm run typecheck
npm run build
npm start
```
