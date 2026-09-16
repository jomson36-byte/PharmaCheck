export type AppRelease = {
  version: string;
  date: string;
  current?: boolean;
  changes: string[];
};

export const APP_VERSION = "0.2.0";

export const APP_RELEASES: AppRelease[] = [
  {
    version: "0.2.0",
    date: "16 กันยายน 2569",
    current: true,
    changes: [
      "เพิ่มหน้าต่างแสดงเวอร์ชันและประวัติการเปลี่ยนแปลงจากโลโก้ PharmaCheck",
      "ปรับขั้นตอนการตรวจและการส่งออก PDF ให้ใช้งานสะดวกขึ้น",
      "ปรับ UX การเชื่อมต่อ Google Sheets พร้อมตรวจสอบไฟล์ก่อนเลือก",
      "เพิ่มข้อความยืนยันบัญชีและการแจ้งเตือนเมื่ออุปกรณ์ Offline",
    ],
  },
  {
    version: "0.1.0",
    date: "15 กันยายน 2569",
    changes: [
      "เปิดตัวแบบตรวจ GPP ที่บันทึกข้อมูลในอุปกรณ์แบบ Local-first",
      "เพิ่มการเชื่อมต่อและสำรองข้อมูลไปยัง Google Sheets",
      "ปรับการใช้งานบนมือถือและ iPad รวมถึงการเข้าถึงผ่านเครือข่าย LAN",
      "เพิ่มการเผยแพร่แอปผ่าน GitHub Pages",
      "เพิ่มการจัดการข้อมูล แบบตรวจ และไอคอนแอป PharmaCheck",
    ],
  },
];
