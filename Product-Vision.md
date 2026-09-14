# Product Vision - GPP Inspection Management System

## Purpose

เอกสารนี้เก็บทิศทางระยะยาวของ PharmaCheck หลังจาก Phase 1 ซึ่งเริ่มจากแบบฟอร์ม Local-first บน iPad และสำรองข้อมูลไปยัง Google Sheets

เป้าหมายระยะยาวคือพัฒนาจากแบบฟอร์มบันทึกข้อมูลให้เป็น **GPP Inspection Management System** ที่รองรับวงจรการตรวจทั้งหมด

---

## Product Direction

```text
เลือกสถานประกอบการ
        ↓
เริ่มการตรวจ
        ↓
ประเมิน 5 หมวด
        ↓
เก็บหลักฐาน
        ↓
ตรวจ Critical Defect
        ↓
คำนวณคะแนน
        ↓
Review
        ↓
ลงลายเซ็น
        ↓
Submit
        ↓
Generate PDF
        ↓
เก็บประวัติและตรวจซ้ำ
```

---

## Long-term Capabilities

- ผู้ใช้และสิทธิ์ Inspector, Reviewer และ Administrator
- Pharmacy master data
- Template versioning
- คะแนน 0 / 1 / 2 / N/A และการตัดฐานคะแนน
- Weighted score และคะแนนรายหมวด
- Rule Engine สำหรับ Pass / Fail
- Critical Defect พร้อมหลักฐานบังคับ
- รูปภาพและหมายเหตุรายข้อ
- Findings และ Corrective Actions
- ลายมือชื่อหลายบทบาท
- Submission locking และ Revision History
- Official PDF และ Digital Inspection Report
- Audit Trail ที่แก้ไขไม่ได้จาก UI
- Re-inspection และเปรียบเทียบผลครั้งก่อน
- Dashboard Analytics
- Notifications และ Due Dates

---

## Recommended Future Architecture

```text
iPad / PWA
    ↓
Local Offline Database
    ↓
Background Sync
    ↓
Application API
    ├── PostgreSQL / Supabase
    ├── Object Storage
    ├── Authentication
    └── Server-side PDF Generator
```

Google Sheets สามารถคงอยู่ในฐานะ Export และ Reporting Integration แต่ไม่ควรเป็น Source of Truth เมื่อระบบเข้าสู่ Multi-user Workflow

---

## Scoring Work Required Before Phase 2

ต้องจัดทำ `Scoring-Rules.md` และยืนยันกับผู้รับผิดชอบก่อนเขียนระบบคะแนน โดยเฉพาะ:

- สูตรร้อยละเฉลี่ยรวม
- เงื่อนไขการ Trigger Critical Defect
- Critical Defect ทำให้ไม่ผ่านอัตโนมัติหรือไม่
- วิธีใช้คะแนน 0 / 1 / 2
- วิธีและสิทธิ์ในการเลือก N/A
- ความไม่สอดคล้องของน้ำหนักรวมหมวด 5 ในแบบต้นฉบับ
- Mandatory conditions ที่อยู่นอกสูตรคะแนน

---

## Suggested Roadmap

### Phase 1 - Local Form and Google Sheets Backup

- iPad PWA
- IndexedDB Autosave
- Offline form
- Google OAuth
- Google Sheets export
- JSON backup and restore

### Phase 2 - Scoring and Evidence

- Automatic scoring
- Dynamic denominator for N/A
- Critical Defect rules
- Photo evidence
- Category and overall summary
- Validation before submission

### Phase 3 - Managed Workflow

- Backend database
- User authentication and RBAC
- Reviewer workflow
- Signatures
- PDF generation
- Audit Trail
- Findings and corrective actions
- Re-inspection

### Phase 4 - Reporting and Automation

- Analytics
- Notifications
- Advanced search and reporting
- Template editor
- OCR, QR Code and GPS
- AI-assisted finding summaries

---

## Long-term Design Principles

```text
iPad First
Offline First
Autosave First
Evidence Based
Audit Ready
Template Versioned
```

