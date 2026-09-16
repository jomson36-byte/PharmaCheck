export type AppRelease = {
  version: string;
  date: string;
  current?: boolean;
  changes: string[];
};

export const APP_VERSION = "0.1.0";

export const APP_RELEASES: AppRelease[] = [
  {
    version: "0.1.0",
    date: "15 กันยายน 2569",
    current: true,
    changes: [
      "เปิดตัวแบบตรวจ GPP ที่บันทึกข้อมูลในอุปกรณ์แบบ Local-first",
      "เพิ่มการเชื่อมต่อและสำรองข้อมูลไปยัง Google Sheets",
      "ปรับการใช้งานบนมือถือและ iPad รวมถึงการเข้าถึงผ่านเครือข่าย LAN",
      "เพิ่มการเผยแพร่แอปผ่าน GitHub Pages",
      "เพิ่มการจัดการข้อมูล แบบตรวจ และไอคอนแอป PharmaCheck",
    ],
  },
];
