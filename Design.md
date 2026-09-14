# Design.md - GPP Inspection Form for iPad (Phase 1)

## 1. Document Status

เอกสารนี้เป็นข้อกำหนดสำหรับการพัฒนา **Phase 1** ของระบบ PharmaCheck โดยยึดแบบตรวจ GPP สำหรับร้านขายยาแผนปัจจุบันจำนวน 7 หน้าเป็นแหล่งข้อมูลหลัก

Phase 1 มุ่งสร้างแบบฟอร์มที่ใช้งานบน iPad ได้แม้ไม่มีอินเทอร์เน็ต เก็บข้อมูลทั้งหมดในเครื่อง และให้ผู้ใช้ส่งสำเนาข้อมูลไปยัง Google Sheets ผ่าน Google OAuth เมื่อพร้อม

รายละเอียดระบบเต็ม เช่น การคำนวณคะแนน Critical Defect, PDF, ลายเซ็น และ Reviewer Workflow แยกไว้ใน `Product-Vision.md`

---

## 2. Product Decision

Phase 1 ใช้แนวทาง:

```text
Local-first iPad PWA
+
IndexedDB
+
Google OAuth
+
Google Sheets API
```

หลักการสำคัญ:

1. การกรอกแบบตรวจต้องไม่ขึ้นกับอินเทอร์เน็ต
2. ทุกการเปลี่ยนแปลงต้องบันทึกใน iPad โดยอัตโนมัติ
3. Google Sheets เป็นปลายทางสำหรับสำรองและนำข้อมูลไปใช้ต่อ ไม่ใช่ฐานข้อมูลหลักของแอป
4. ผู้ใช้ต้องเห็นชัดเจนว่าข้อมูลใดอยู่ในเครื่อง ข้อมูลใดกำลังรอส่ง และข้อมูลใดส่งสำเร็จแล้ว
5. โครงสร้างข้อมูลต้องพร้อมสำหรับการเพิ่มระบบคะแนนและย้ายไป Backend จริงในอนาคต

---

## 3. Phase 1 Goals

- ใช้แบบฟอร์มบน iPad ทั้งแนวตั้งและแนวนอน
- เปิดจาก Home Screen และใช้งานในลักษณะเดียวกับแอป
- กรอกข้อมูลสถานประกอบการและแบบประเมิน GPP ครบ 5 หมวด
- เลือกคำตอบ `0`, `1`, `2` หรือ `N/A`
- เพิ่มหมายเหตุรายข้อ
- บันทึกแบบร่างอัตโนมัติในเครื่อง
- ปิดและเปิดแอปกลับมาทำต่อได้
- ทำงานได้เมื่ออินเทอร์เน็ตหลุดหรือไม่มีอินเทอร์เน็ต
- เชื่อมบัญชี Google ผ่าน OAuth เมื่อต้องการส่งข้อมูล
- ส่งข้อมูลเข้า Google Sheets โดยไม่สร้างข้อมูลซ้ำจากการ Retry
- ส่งออกและนำเข้าไฟล์สำรองได้

---

## 4. Out of Scope

รายการต่อไปนี้ยังไม่ทำใน Phase 1:

- การคำนวณคะแนนรายข้อ รายหมวด และคะแนนรวม
- การตัดสินผลผ่านหรือไม่ผ่าน
- Logic บังคับของ Critical Defect
- การแนบรูปหลักฐาน
- ลายมือชื่อบนหน้าจอ
- การสร้าง PDF
- Reviewer, Approval และ Return for Correction
- Audit Trail ฝั่ง Server
- การแก้ Inspection เดียวกันจากหลายอุปกรณ์
- Dashboard Analytics
- Notification

ระบบอาจแสดงน้ำหนักและป้าย `Critical Defect` จากแบบต้นฉบับเพื่อให้ข้อมูลแก่ผู้ตรวจ แต่ยังไม่นำข้อมูลเหล่านี้ไปตัดสินหรือคำนวณผล

---

## 5. Source Form Structure

แบบตรวจประกอบด้วย 5 หมวด:

1. สถานที่
2. อุปกรณ์
3. บุคลากร
4. การควบคุมคุณภาพยา
5. การปฏิบัติตามวิธีปฏิบัติทางเภสัชกรรมชุมชน

มีรายการที่ให้คำตอบประมาณ 39 รายการ และมีบางรายการที่ระบุว่า `ตัดฐานคะแนนได้`

แม้ Phase 1 ยังไม่คำนวณคะแนน ระบบต้องรองรับค่าคำตอบตั้งแต่ต้น:

```text
0   ปรับปรุง
1   พอใช้
2   ดี
N/A ไม่เกี่ยวข้อง / ตัดฐานคะแนน
```

เมื่อเลือก `N/A` ต้องระบุเหตุผล เพื่อให้ Phase การคำนวณคะแนนสามารถตัดรายการออกจากตัวหารได้อย่างตรวจสอบย้อนกลับได้

ข้อที่มีเกณฑ์ย่อย เช่น 1.9, 5.3 และ 5.4 ต้องจัดเก็บเป็นหนึ่งคำถามที่ให้คำตอบหนึ่งครั้ง และมีรายการเกณฑ์ย่อยสำหรับช่วยตรวจสอบ ไม่แยกเกณฑ์ย่อยเป็นคะแนนอิสระ

---

## 6. Target Platform

Primary target:

```text
iPad 10-13 inch
Safari / Home Screen Web App
Portrait and Landscape
```

Secondary target:

```text
Desktop browser
Android tablet
```

ไม่ต้องออกแบบสำหรับโทรศัพท์มือถือเป็นอันดับแรก

---

## 7. Recommended Technology

- Application: Progressive Web App
- Frontend: Next.js + TypeScript
- UI styling: CSS Modules + CSS Variables
- Accessible UI primitives: Radix Primitives
- App cache: Service Worker
- Local database: IndexedDB
- IndexedDB wrapper: Dexie หรือไลบรารีขนาดเล็กที่มี Transaction Support
- Authentication for export: Google Identity Services OAuth 2.0
- Cloud destination: Google Sheets API v4
- Backup format: Versioned JSON

Phase 1 ไม่มี Application Backend และไม่เก็บ Google refresh token ใน iPad

---

## 8. High-Level Architecture

```text
┌──────────────────────────────────┐
│        iPad Home Screen PWA      │
│                                  │
│ Form UI / Validation / Status UI │
└────────────────┬─────────────────┘
                 │
                 ▼
┌──────────────────────────────────┐
│            IndexedDB             │
│                                  │
│ inspections / answers / queue    │
│ settings / backup metadata       │
└────────────────┬─────────────────┘
                 │ Online + OAuth
                 ▼
┌──────────────────────────────────┐
│       Google Sheets API v4       │
│                                  │
│     Append inspection revision   │
└──────────────────────────────────┘
```

IndexedDB เป็นแหล่งข้อมูลหลักขณะทำงาน ส่วน Google Sheets เก็บ Snapshot ที่ผู้ใช้ส่งออกจากอุปกรณ์

---

## 9. Main Navigation

```text
หน้าแรก
├── เริ่มการตรวจใหม่
├── แบบร่างในเครื่อง
├── รายการรอส่ง
├── รายการที่ส่งแล้ว
├── สำรอง / กู้คืนข้อมูล
└── ตั้งค่า Google Sheets
```

Inspection flow:

```text
ข้อมูลสถานประกอบการ
        ↓
หมวด 1 สถานที่
        ↓
หมวด 2 อุปกรณ์
        ↓
หมวด 3 บุคลากร
        ↓
หมวด 4 การควบคุมคุณภาพยา
        ↓
หมวด 5 วิธีปฏิบัติทางเภสัชกรรมชุมชน
        ↓
ตรวจความครบถ้วน
        ↓
เตรียมส่ง / ส่งเข้า Google Sheets
```

---

## 10. Dashboard

หน้าแรกต้องแสดง:

- ปุ่ม `เริ่มการตรวจใหม่`
- ปุ่ม `ส่ง Google Sheets` ที่เปิดรายการแบบตรวจพร้อมส่งทั้งหมด
- แบบร่างล่าสุด
- จำนวนรายการที่รอส่ง
- เวลา Sync สำเร็จล่าสุด
- สถานะ Online / Offline
- สถานะการเชื่อมต่อ Google
- คำเตือนเมื่อมีข้อมูลที่ยังไม่เคยสำรอง

ตัวอย่าง:

```text
PharmaCheck

[ + เริ่มการตรวจใหม่ ]

แบบร่างในเครื่อง             2
รอส่งเข้า Google Sheets      1
ส่งล่าสุด     14 ก.ย. 2569 16:20

○ Offline
ข้อมูลของคุณยังบันทึกใน iPad เครื่องนี้แล้ว
```

---

## 11. Pharmacy and Inspection Information

ข้อมูลส่วนหัว:

- วันที่ตรวจประเมิน
- เวลาเริ่มตรวจ
- ผู้ประเมิน 1
- ผู้ประเมิน 2
- เลขที่ใบอนุญาต
- ชื่อผู้รับอนุญาต
- ผู้ดำเนินกิจการ
- ชื่อสถานประกอบการ
- ที่อยู่
- โทรศัพท์
- โทรสาร
- มือถือ
- ผู้มีหน้าที่ปฏิบัติการหลายรายการ

ผู้มีหน้าที่ปฏิบัติการแต่ละรายการเก็บ:

- ชื่อ
- เลขใบประกอบวิชาชีพ
- เวลาเริ่มปฏิบัติการ
- เวลาสิ้นสุดปฏิบัติการ

วันที่และเวลาเริ่มตรวจให้ Default จากเวลาของอุปกรณ์ แต่ผู้ใช้แก้ไขได้

---

## 12. Assessment Item UX

ใช้ Card Layout ไม่ใช้ตารางแบบ PDF

```text
┌─────────────────────────────────────┐
│ ข้อ 1.7              Critical Defect│
│                                     │
│ สถานที่ขายยาต้องมีสภาพเหมาะสม...  │
│                                     │
│ น้ำหนัก 2                           │
│                                     │
│ [0 ปรับปรุง] [1 พอใช้] [2 ดี] [N/A]│
│                                     │
│ หมายเหตุ                            │
│ ................................... │
└─────────────────────────────────────┘
```

ข้อกำหนด UI:

- Touch target ไม่น้อยกว่า 44 x 44 px
- ปุ่มคะแนนสูงประมาณ 56-64 px
- Question text อย่างน้อย 18 px
- ไม่ใช้สีอย่างเดียวในการสื่อสถานะ
- ใช้ทั้งข้อความ ไอคอน และสี
- Navigation ด้านล่างต้อง Sticky
- รองรับการพิมพ์ด้วย Keyboard, Dictation และ Apple Pencil Scribble

เมื่อเลือก `N/A` ให้เปิดช่องเหตุผลทันที

---

## 13. Local Data Model

### inspections

```text
id                       UUID
schema_version           string
template_version         string
device_id                UUID
inspection_date          date
start_time               time
inspector_1              string
inspector_2              string?
license_number           string
license_holder_name      string
operator_name            string?
pharmacy_name            string
address                  string
telephone                string?
fax                      string?
mobile                   string?
status                   InspectionStatus
local_revision           integer
last_synced_revision     integer?
created_at               datetime
updated_at               datetime
last_synced_at           datetime?
```

### responsible_persons

```text
id                       UUID
inspection_id            UUID
name                     string
license_number           string?
work_start_time          time?
work_end_time            time?
```

### answers

```text
id                       UUID
inspection_id            UUID
question_code            string
question_text_snapshot   string
category_code            string
selected_value           0 | 1 | 2 | "NA" | null
weight_snapshot          number
is_critical_snapshot     boolean
is_excludable_snapshot   boolean
not_applicable_reason    string?
notes                    string?
updated_at               datetime
```

### sync_queue

```text
id                       UUID
sync_batch_id            UUID
inspection_id            UUID
revision                 integer
payload_hash             string
payload_snapshot         object
status                   PENDING | SYNCING | SYNCED | ERROR
attempt_count            integer
last_error               string?
created_at               datetime
last_attempt_at          datetime?
synced_at                datetime?
google_updated_range     string?
```

### app_settings

```text
device_id
spreadsheet_id
spreadsheet_name
last_backup_at
last_successful_sync_at
schema_version
```

Google OAuth access token ต้องเก็บในหน่วยความจำชั่วคราวเท่านั้น และไม่เก็บใน IndexedDB หรือ localStorage

---

## 14. Autosave

ทุกการเปลี่ยนแปลงต้องเขียนลง IndexedDB ก่อนอัปเดตสถานะบน UI

```text
User changes a field
        ↓
Validate field value
        ↓
Save in IndexedDB transaction
        ↓
Increment local_revision
        ↓
Show "บันทึกในเครื่องแล้ว ✓"
```

สำหรับช่องข้อความสามารถ Debounce ประมาณ 300-500 ms แต่ต้อง Flush ข้อมูลเมื่อ:

- ผู้ใช้เปลี่ยนหน้า
- แอปเข้าสู่ Background
- หน้าเว็บกำลังถูกปิด
- ผู้ใช้กดส่งข้อมูล

หาก IndexedDB เขียนไม่สำเร็จ ต้องแสดงข้อความเด่นชัดและห้ามแสดงคำว่า “บันทึกแล้ว”

---

## 15. Offline Application Behavior

Service Worker ต้อง Cache อย่างน้อย:

- Application shell
- Fonts และ icons ที่จำเป็น
- Question template เวอร์ชันที่ใช้งาน
- Static assets

เมื่อเปิดแอปครั้งแรกต้องมีอินเทอร์เน็ตเพื่อโหลดและติดตั้งทรัพยากร หลังจากนั้นต้องเปิดแบบร่างและกรอกต่อได้โดยไม่มีอินเทอร์เน็ต

แอปต้องเรียกใช้ Storage API เพื่อ:

- ขอ Persistent Storage เมื่อ Browser รองรับ
- ตรวจพื้นที่ใช้ไปและพื้นที่โดยประมาณ
- แจ้งเตือนเมื่อพื้นที่เหลือน้อย
- Handle `QuotaExceededError`

ห้ามรับประกันกับผู้ใช้ว่าข้อมูลใน Browser จะไม่มีวันถูกลบ

---

## 16. Google OAuth

OAuth ใช้เฉพาะเมื่อผู้ใช้ต้องการตั้งค่า Sheet หรือนำข้อมูลไปส่ง

Flow:

```text
[ เชื่อมต่อ Google ]
        ↓
Google Sign-in / Consent
        ↓
Receive short-lived access token
        ↓
Validate target spreadsheet
        ↓
Send pending revision
```

ข้อกำหนด:

- ขอ Scope เท่าที่จำเป็นต่อการเขียน Google Sheets
- ไม่เก็บ Password ของ Google
- ไม่เก็บ Refresh Token บน Client
- Access Token เก็บใน Memory เท่านั้น
- เมื่อ Token หมดอายุ ให้ผู้ใช้เชื่อมต่อใหม่โดยข้อมูลในเครื่องไม่เสียหาย
- ผู้ใช้ต้องเห็นชื่อบัญชีและชื่อ Spreadsheet ก่อนยืนยันส่ง
- การ Logout จาก Google ไม่ลบแบบตรวจในเครื่อง

---

## 17. Google Sheets Format

Phase 1 ใช้ Sheet หลักชื่อ `Submissions` โดยหนึ่งแถวแทน Snapshot ของ Inspection หนึ่ง Revision

แนวทางนี้ทำให้การส่งหนึ่ง Inspection ใช้การ Append หนึ่งชุด ลดปัญหาส่งสำเร็จเพียงบางตาราง

คอลัมน์หลัก:

```text
sync_batch_id
inspection_id
revision
payload_hash
schema_version
template_version
device_id
inspection_date
start_time
inspector_1
inspector_2
license_number
license_holder_name
operator_name
pharmacy_name
address
telephone
fax
mobile
responsible_persons_json
Q_1_1
Q_1_2
...
Q_5_12
notes_json
created_at
updated_at
synced_at
payload_json
```

ค่าคำตอบใช้:

```text
0
1
2
NA
```

`payload_json` เป็นข้อมูลสำรองฉบับเต็มของ Revision โดยใช้ `question_code` แทนการคัดลอกข้อความคำถามทั้งหมด เพื่อลดขนาดข้อมูล

หากต้องการ Sheet สำหรับอ่านง่ายเพิ่มเติม ให้สร้างเป็น Derived View หรือ Phase ต่อไป ไม่ให้กระทบเส้นทางการสำรองหลัก

---

## 18. Sync Strategy

การ Autosave และการ Sync เป็นคนละกระบวนการ:

- Autosave: ทำทุกครั้งและไม่ต้องมีอินเทอร์เน็ต
- Sync: ทำเมื่อผู้ใช้สั่ง หรือเมื่อมี Token และผู้ใช้เปิด Auto Sync

ก่อนส่งระบบต้องสร้าง Immutable Snapshot:

```text
sync_batch_id = UUID
revision = current local_revision
payload_hash = SHA-256(canonical payload)
payload_snapshot = current inspection data
```

ขั้นตอน Sync:

```text
Check internet
        ↓
Check Google access token
        ↓
Search target Sheet for sync_batch_id
        ├── Found → Mark local queue as SYNCED
        └── Not found
                ↓
           Append one revision row
                ↓
           Receive success response
                ↓
           Mark queue as SYNCED
```

หากคำขอ Timeout หลังส่ง ระบบต้องตรวจ `sync_batch_id` ใน Sheet ก่อน Retry เสมอ

ใช้ Exponential Backoff สำหรับข้อผิดพลาดชั่วคราว เช่น Rate Limit และ Server Error

ห้ามลบ Snapshot จาก Queue จนกว่าจะยืนยันได้ว่าข้อมูลปรากฏใน Google Sheets แล้ว

---

## 19. Revision Policy

Google Sheets ใช้รูปแบบ Append-only:

- การส่งครั้งแรกเป็น Revision 1
- หากแก้ไขหลังส่ง ให้สร้าง Revision ใหม่
- ไม่แก้ไขหรือลบแถว Revision เดิม
- รายการล่าสุดพิจารณาจาก `inspection_id` และค่า `revision` สูงสุด

วิธีนี้ช่วยรักษาประวัติขั้นต้นและลดความเสี่ยงจากการเขียนทับข้อมูล

Phase 1 ไม่รองรับการเปิด Inspection เดียวกันบนหลาย iPad หากต้องการแก้จากอีกเครื่องให้ Export/Import ไฟล์สำรองอย่างชัดเจน หรือรอระบบ Backend ใน Phase ต่อไป

---

## 20. Sync Status UX

สถานะหลัก:

```text
LOCAL_DRAFT     แบบร่างอยู่ใน iPad
READY_TO_SYNC   พร้อมส่ง
SYNCING         กำลังส่ง
SYNCED          ส่งสำเร็จแล้ว
SYNC_ERROR      ส่งไม่สำเร็จ
```

ตัวอย่างข้อความ:

```text
✓ บันทึกใน iPad แล้ว
⏳ รอส่งเข้า Google Sheets 1 รายการ
↻ กำลังส่งข้อมูล...
✓ ส่งสำเร็จเมื่อ 16:20 น.
⚠ ส่งไม่สำเร็จ ข้อมูลยังอยู่ใน iPad
```

ต้องไม่ใช้คำว่า “สำรองแล้ว” จนกว่าจะได้รับการยืนยันจาก Google Sheets API

---

## 21. Validation

ผู้ใช้เปลี่ยนหมวดได้โดยไม่ต้องตอบครบทุกข้อ

ก่อนเปลี่ยนสถานะเป็น `READY_TO_SYNC` ให้ตรวจขั้นต่ำ:

- วันที่ตรวจ
- ผู้ประเมิน 1
- เลขที่ใบอนุญาต
- ชื่อสถานประกอบการ
- คำตอบของรายการที่กำหนดว่าจำเป็น
- เหตุผลของทุกข้อที่เลือก `N/A`

หากข้อมูลไม่ครบ ให้แสดงรายการพร้อมปุ่ม Jump ไปยังช่องที่เกี่ยวข้อง

Phase 1 ตรวจเฉพาะความครบถ้วน ไม่ตัดสินคะแนนหรือผลผ่าน/ไม่ผ่าน

---

## 22. Backup and Restore

ต้องมีการสำรองสองทาง:

### Google Sheets Backup

- ส่ง Snapshot ผ่าน OAuth
- แสดงเวลาที่ส่งสำเร็จล่าสุด
- แสดงจำนวน Revision ที่ยังไม่ส่ง

### File Backup

- Export ข้อมูลทั้งหมดหรือ Inspection ที่เลือกเป็น JSON
- JSON ต้องมี `schema_version`, `exported_at` และ checksum
- Import ต้อง Preview จำนวน Inspection ก่อนเขียนข้อมูล
- หากพบ `inspection_id` ซ้ำ ให้ผู้ใช้เลือกเก็บทั้งสอง Revision หรือข้าม
- ห้ามเขียนทับข้อมูลเดิมโดยเงียบ

ชื่อไฟล์ตัวอย่าง:

```text
pharmacheck-backup-2569-09-14.json
```

แจ้งเตือนผู้ใช้หากมีข้อมูลที่ไม่เคย Sync หรือ Export เกินระยะเวลาที่กำหนด

---

## 23. Local Data Protection

ข้อมูลในเครื่องอาจประกอบด้วยชื่อบุคคล เลขใบอนุญาต และข้อมูลสถานประกอบการ

ข้อกำหนดขั้นต่ำ:

- iPad ต้องตั้ง Passcode
- แนะนำใช้อุปกรณ์ขององค์กรหรืออุปกรณ์ที่เชื่อถือได้
- ไม่แสดงข้อมูลละเอียดบน Notification
- ไม่เก็บ Google OAuth Token แบบถาวร
- ปุ่มล้างข้อมูลต้องแสดงจำนวนรายการที่ยังไม่ Sync
- ห้ามล้างข้อมูลที่ยังไม่ Sync โดยไม่มีการยืนยันซ้ำ
- หลังล้างข้อมูลต้องแจ้งว่ากู้คืนได้จากแหล่งใด

หากเพิ่มข้อมูลสุขภาพ รูปภาพ หรือลายเซ็นในอนาคต ต้องทบทวนการเข้ารหัสและนโยบายเก็บรักษาข้อมูลใหม่

---

## 24. Error Handling

ระบบต้องรองรับอย่างน้อย:

- IndexedDB เปิดไม่ได้
- พื้นที่จัดเก็บเต็ม
- App cache ไม่สมบูรณ์
- ไม่มีอินเทอร์เน็ต
- OAuth ถูกยกเลิก
- OAuth Token หมดอายุ
- ไม่มีสิทธิ์เขียน Spreadsheet
- Spreadsheet ถูกลบหรือเปลี่ยนชื่อ
- Sheet `Submissions` ไม่มีหรือ Header ไม่ตรง
- Google API Rate Limit
- Timeout ที่ไม่ทราบว่าส่งสำเร็จหรือไม่
- JSON Backup เสียหายหรือ Schema Version ไม่รองรับ

ทุก Error ต้องบอกผู้ใช้ด้วยภาษาที่เข้าใจง่าย พร้อมยืนยันว่าข้อมูลในเครื่องยังอยู่หรือไม่

---

## 25. Performance Targets

```text
เปิดแอปจาก Cache             < 2 วินาที
เปลี่ยนคำถาม/หมวด           < 100 ms
Local autosave              < 100 ms โดยทั่วไป
แสดงสถานะบันทึก             < 300 ms
สร้าง Snapshot สำหรับ Sync   < 1 วินาที
```

การส่ง Google Sheets ห้าม Block การเปิดดูหรือแก้แบบฟอร์มอื่น

---

## 26. Accessibility

- Font ขนาดไม่น้อยกว่า 16 px
- Question text 18-20 px
- Contrast สูง
- Touch target ใหญ่
- ใช้ Icon คู่กับข้อความ
- Focus state ต้องเห็นชัดเมื่อใช้ Keyboard
- Error ต้องผูกกับชื่อ Field ที่ชัดเจน
- รองรับการขยายข้อความของ iPad ในระดับที่เหมาะสม

---

## 27. Suggested Folder Structure

```text
app/
├── page.tsx
├── inspections/
│   ├── new/
│   └── [id]/
│       ├── information/
│       ├── category/[code]/
│       └── review/
├── drafts/
├── sync/
├── backup/
└── settings/

components/
├── assessment/
│   ├── QuestionCard.tsx
│   ├── AnswerSelector.tsx
│   └── NotesField.tsx
├── inspection/
│   ├── ProgressBar.tsx
│   └── CategoryNavigation.tsx
└── sync/
    ├── SyncStatus.tsx
    └── GoogleConnectButton.tsx

lib/
├── db/
├── autosave/
├── backup/
├── google/
├── sync/
├── templates/
└── validation/

styles/
└── design-tokens (defined as CSS Variables in global styles)
```

---

## 28. Acceptance Criteria

Phase 1 ถือว่าสำเร็จเมื่อ:

1. ผู้ใช้ติดตั้งและเปิด PWA จาก Home Screen ได้
2. หลังเปิดออนไลน์ครั้งแรก สามารถเปิดและกรอกแบบตรวจโดยไม่มีอินเทอร์เน็ตได้
3. ทุก Field และคำตอบกลับมาเหมือนเดิมหลังปิดและเปิดแอป
4. แบบตรวจมีข้อครบตาม Template ที่ถอดจาก PDF
5. เลือก `0`, `1`, `2` และ `N/A` พร้อมเหตุผลได้
6. ผู้ใช้เห็นสถานะการบันทึกในเครื่องอย่างถูกต้อง
7. OAuth เชื่อมบัญชี Google ได้โดยไม่เก็บ Password หรือ Token ระยะยาว
8. ส่ง Snapshot เข้า Google Sheets ได้
9. Retry หลัง Timeout ไม่สร้าง Revision ซ้ำเมื่อพบ `sync_batch_id` เดิม
10. แก้ข้อมูลหลังส่งแล้วสร้าง Revision ใหม่โดยไม่เขียนทับของเดิม
11. Export และ Import ไฟล์ Backup ได้
12. ข้อมูลที่ยังไม่ Sync ไม่ถูกลบโดยไม่มีคำเตือนและการยืนยัน
13. ผ่านการทดสอบบน iPad ทั้ง Online, Offline, เน็ตหลุดระหว่างกรอก และเน็ตหลุดระหว่าง Sync

---

## 29. Test Scenarios

ต้องทดสอบอย่างน้อย:

```text
เปิดออนไลน์ครั้งแรก → ติดตั้ง → ปิดเน็ต → สร้างแบบตรวจ
กรอกครึ่งหนึ่ง → ปิดแอป → เปิดใหม่ → ทำต่อ
พิมพ์หมายเหตุ → สลับแอปทันที → เปิดกลับมา
ส่งข้อมูล → เน็ตหลุดก่อนรับ Response → Retry
OAuth Token หมดอายุระหว่างส่ง
Spreadsheet ไม่มีสิทธิ์เขียน
พื้นที่จัดเก็บใกล้เต็ม
Export → ล้างข้อมูลทดสอบ → Import Backup
แก้ Inspection หลัง Sync → ส่งเป็น Revision ใหม่
```

---

## 30. Migration Readiness

เพื่อให้ย้ายไป Supabase หรือ Backend อื่นได้ภายหลัง:

- ใช้ UUID ที่สร้างจาก Client
- เก็บ `schema_version` และ `template_version`
- เก็บ Snapshot ของข้อความคำถาม น้ำหนัก และสถานะ Critical
- แยก Local Repository ออกจาก UI
- แยก Sync Adapter สำหรับ Google Sheets
- ห้ามให้ Component เรียก Google Sheets API โดยตรง
- Canonical payload ต้องไม่ผูกกับตำแหน่งคอลัมน์ใน Sheet
- Google Sheets mapping ต้องอยู่ใน Adapter เท่านั้น

โครงสร้างที่ต้องการในอนาคต:

```text
UI
 ↓
Local Repository
 ↓
Sync Interface
 ├── Google Sheets Adapter (Phase 1)
 └── Supabase Adapter      (Future)
```

---

## 31. Phase 1 Final Workflow

```text
เปิดแอปบน iPad
        ↓
สร้างหรือเปิดแบบตรวจ
        ↓
กรอกข้อมูลและคำตอบ 5 หมวด
        ↓
Autosave ลง IndexedDB ทุกครั้ง
        ↓
ตรวจความครบถ้วน
        ↓
สร้าง Revision Snapshot
        ↓
เชื่อมต่อ Google ด้วย OAuth
        ↓
ส่งเข้า Google Sheets
        ↓
ยืนยันว่า Sync สำเร็จ
        ↓
เก็บข้อมูลใน iPad จนกว่าผู้ใช้จะล้างอย่างชัดเจน
```

---

## 32. Final Principles

```text
iPad First
Local First
Autosave First
Explicit Sync Status
Recoverable Data
Append-only Backup
Future-ready Schema
```

ทุกหน้าต้องตอบได้ว่า:

> หากอินเทอร์เน็ตหายตอนนี้ ข้อมูลล่าสุดของผู้ตรวจยังอยู่หรือไม่ และผู้ตรวจมองเห็นสถานะนั้นชัดเจนหรือไม่?
