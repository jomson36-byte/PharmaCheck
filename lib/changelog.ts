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
    ],
  },
  {
    version: "0.1.1",
    date: "15 กันยายน 2569",
    changes: [
      "ปรับการใช้งานบนมือถือและ iPad รวมถึงการเข้าถึงผ่านเครือข่าย LAN",
      "เพิ่มการเผยแพร่แอปผ่าน GitHub Pages",
    ],
  },
  {
    version: "0.1.0",
    date: "14 กันยายน 2569",
    changes: [
      "เปิดตัวแบบตรวจ GPP ที่บันทึกข้อมูลในอุปกรณ์แบบ Local-first",
      "เพิ่มการเชื่อมต่อและสำรองข้อมูลไปยัง Google Sheets",
      "เพิ่มการจัดการข้อมูล แบบตรวจ และไอคอนแอป PharmaCheck",
    ],
  },
];
