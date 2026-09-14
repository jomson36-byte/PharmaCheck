"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as Progress from "@radix-ui/react-progress";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Tabs from "@radix-ui/react-tabs";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { createInspection, db, exportBackup, importBackup } from "@/lib/db";
import {
  connectGoogleAccount,
  createGoogleSpreadsheet,
  listGoogleSpreadsheets,
  prepareInspectionForSync,
  requestGoogleAccessToken,
  syncQueueItem,
} from "@/lib/googleSheets";
import type { GoogleSpreadsheet } from "@/lib/googleSheets";
import type { Answer, AnswerValue, BackupFile, Inspection, ResponsiblePerson } from "@/lib/models";
import { categories, questions, questionsByCategory, type Question } from "@/lib/questions";
import styles from "./GppApp.module.css";

type View = { type: "dashboard" } | { type: "inspection"; id: string };
type Notice = { tone: "success" | "warning" | "danger"; text: string } | null;

const statusLabels: Record<Inspection["status"], string> = {
  LOCAL_DRAFT: "แบบร่างใน iPad",
  READY_TO_SYNC: "พร้อมส่ง",
  SYNCING: "กำลังส่ง",
  SYNCED: "ส่งแล้ว",
  SYNC_ERROR: "ส่งไม่สำเร็จ",
};

const tabLabels: Record<string, string> = {
  "1": "สถานที่",
  "2": "อุปกรณ์",
  "3": "บุคลากร",
  "4": "คุณภาพยา",
  "5": "วิธีปฏิบัติ",
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

async function getConfiguredGoogleClientId() {
  if (GOOGLE_CLIENT_ID) return GOOGLE_CLIENT_ID;
  return (await db.settings.get("googleClientId"))?.value ?? "";
}

function formatDate(value: string) {
  if (!value) return "ยังไม่ระบุวันที่";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value?: string) {
  if (!value) return "ยังไม่เคยส่ง";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function GppApp() {
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (view.type === "inspection") {
    return <InspectionEditor inspectionId={view.id} online={online} onBack={() => setView({ type: "dashboard" })} />;
  }

  return <Dashboard online={online} onOpen={(id) => setView({ type: "inspection", id })} />;
}

function AppHeader({ online }: { online: boolean }) {
  return (
    <header className={styles.appHeader}>
      <div className={styles.brandMark} aria-hidden="true">+</div>
      <div>
        <strong className={styles.brandName}>PharmaCheck</strong>
        <span className={styles.brandTagline}>GPP Inspection</span>
      </div>
      <span className={`${styles.connectionBadge} ${online ? styles.online : styles.offline}`}>
        <span className={styles.statusDot} /> {online ? "Online" : "Offline"}
      </span>
    </header>
  );
}

function Dashboard({ online, onOpen }: { online: boolean; onOpen: (id: string) => void }) {
  const inspections = useLiveQuery(() => db.inspections.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const unsyncedCount = inspections.filter((inspection) => inspection.status !== "SYNCED").length;
  const latestSyncAt = inspections.reduce<string | undefined>((latest, inspection) => {
    if (!inspection.lastSyncedAt) return latest;
    return !latest || inspection.lastSyncedAt > latest ? inspection.lastSyncedAt : latest;
  }, undefined);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Inspection | null>(null);
  const [menuTarget, setMenuTarget] = useState<Inspection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const touchCreateLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      const id = await createInspection();
      onOpen(id);
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "สร้างแบบตรวจไม่สำเร็จ" });
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateTouch() {
    if (creating || touchCreateLock.current) return;
    touchCreateLock.current = true;
    try {
      await handleCreate();
    } finally {
      touchCreateLock.current = false;
    }
  }

  async function handleDeleteInspection() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await db.transaction("rw", db.inspections, db.answers, db.responsiblePersons, db.syncQueue, async () => {
        await db.answers.where("inspectionId").equals(target.id).delete();
        await db.responsiblePersons.where("inspectionId").equals(target.id).delete();
        await db.syncQueue.where("inspectionId").equals(target.id).delete();
        await db.inspections.delete(target.id);
      });
      setNotice({ tone: "success", text: `ลบแบบตรวจ "${target.pharmacyName || "แบบตรวจนี้"}" แล้ว` });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "ลบแบบตรวจไม่สำเร็จ" });
    } finally {
      setDeleteTarget(null);
      setDeleting(false);
    }
  }

  async function handleExport() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pharmacheck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    await db.settings.put({ key: "lastBackupAt", value: new Date().toISOString() });
    setNotice({ tone: "success", text: "สร้างไฟล์สำรองแล้ว กรุณาเก็บไว้ใน Files หรือ iCloud Drive" });
  }

  async function handleImport(file?: File) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as BackupFile;
      await importBackup(backup);
      setNotice({ tone: "success", text: `นำเข้าข้อมูล ${backup.inspections.length} แบบตรวจเรียบร้อยแล้ว` });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "นำเข้าไฟล์ไม่สำเร็จ" });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <main className={styles.shell}>
      <AppHeader online={online} />
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>แบบตรวจภาคสนาม</p>
          <h1>ตรวจ GPP ได้ต่อเนื่อง<br />แม้ไม่มีอินเทอร์เน็ต</h1>
          <p className={styles.heroText}>ข้อมูลจะถูกบันทึกลง iPad อัตโนมัติ และส่งไป Google Sheets เมื่อคุณพร้อม</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.heroSecondaryButton} onClick={() => setSyncCenterOpen(true)}>
            <span aria-hidden="true">↥</span> ส่ง Google Sheets
            {unsyncedCount > 0 && <b>{unsyncedCount}</b>}
          </button>
          <button
            className={styles.primaryButton}
            onClick={() => {
              if (!touchCreateLock.current) {
                handleCreate();
              }
            }}
            onTouchStart={handleCreateTouch}
            disabled={creating}
          >
            <span aria-hidden="true">＋</span> {creating ? "กำลังสร้าง..." : "เริ่มการตรวจใหม่"}
          </button>
        </div>
      </section>

      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}

      <section className={styles.metrics} aria-label="สถานะข้อมูล">
        <div className={styles.metricCard}>
          <span>แบบตรวจในเครื่อง</span>
          <strong>{inspections.length}</strong>
        </div>
        <button className={`${styles.metricCard} ${styles.metricButton}`} onClick={() => setSyncCenterOpen(true)}>
          <span>รายการรอส่ง</span>
          <strong className={unsyncedCount ? styles.warningText : undefined}>{unsyncedCount}</strong>
          <small>แตะเพื่อดูรายการ <b aria-hidden="true">›</b></small>
        </button>
        <div className={styles.metricCard}>
          <span>ส่ง Google ล่าสุด</span>
          <strong className={latestSyncAt ? styles.metricDate : styles.metricEmpty}>{latestSyncAt ? formatDateTime(latestSyncAt) : "ยังไม่เคยส่ง"}</strong>
        </div>
      </section>

      <section className={styles.contentSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ล่าสุด</p>
            <h2>แบบตรวจล่าสุด</h2>
          </div>
          <div className={styles.toolbar}>
            <details className={styles.dataMenu}>
              <summary>จัดการข้อมูล <span aria-hidden="true">⌄</span></summary>
              <div>
                <button onClick={handleExport} disabled={!inspections.length}>ส่งออกไฟล์สำรอง</button>
                <button onClick={() => fileInput.current?.click()}>นำเข้าไฟล์สำรอง</button>
              </div>
            </details>
            <input
              ref={fileInput}
              className={styles.hiddenInput}
              type="file"
              accept="application/json,.json"
              onChange={(event) => handleImport(event.target.files?.[0])}
            />
          </div>
        </div>

        {!inspections.length ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⌁</div>
            <h3>ยังไม่มีแบบตรวจ</h3>
            <p>เริ่มแบบตรวจแรกได้ทันที ข้อมูลทุกช่องจะบันทึกในเครื่องอัตโนมัติ</p>
          </div>
        ) : (
          <div className={styles.inspectionList}>
            {inspections.map((inspection) => (
              <div key={inspection.id} className={styles.inspectionListRow}>
                <button
                  type="button"
                  className={styles.inspectionRow}
                  onClick={() => onOpen(inspection.id)}
                >
                  <span className={styles.inspectionIcon}>{inspection.pharmacyName?.slice(0, 1) || "ร"}</span>
                  <span className={styles.inspectionMain}>
                    <strong>{inspection.pharmacyName || "แบบตรวจใหม่"}</strong>
                    <span>{inspection.licenseNumber || "ยังไม่ระบุเลขใบอนุญาต"} · {formatDate(inspection.inspectionDate)}</span>
                  </span>
                  <span className={`${styles.statusPill} ${styles[`status_${inspection.status}`]}`}>{statusLabels[inspection.status]}</span>
                </button>
                <button
                  type="button"
                  className={styles.inspectionMoreButton}
                  aria-label={`จัดการ ${inspection.pharmacyName || "แบบตรวจใหม่"}`}
                  onClick={() => setMenuTarget(inspection)}
                >•••</button>
              </div>
            ))}
          </div>
        )}
      </section>
      <Dialog.Root open={Boolean(menuTarget)} onOpenChange={(open) => !open && setMenuTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={`${styles.dialogContent} ${styles.inspectionMenuDialog}`}>
            <div className={styles.dialogHeading}>
              <div>
                <p className={styles.eyebrow}>จัดการแบบตรวจ</p>
                <Dialog.Title>{menuTarget?.pharmacyName || "แบบตรวจใหม่"}</Dialog.Title>
              </div>
              <Dialog.Close className={styles.iconButton} aria-label="ปิด">×</Dialog.Close>
            </div>
            <div className={styles.inspectionMenuActions}>
              <button className={styles.primaryButton} onClick={() => {
                if (!menuTarget) return;
                const target = menuTarget;
                setMenuTarget(null);
                onOpen(target.id);
              }}>เปิดแบบตรวจ</button>
              <button className={styles.dangerOutlineButton} onClick={() => {
                if (!menuTarget) return;
                setDeleteTarget(menuTarget);
                setMenuTarget(null);
              }}>ลบแบบตรวจ</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.dialogContent}>
            <AlertDialog.Title>ลบแบบตรวจนี้หรือไม่?</AlertDialog.Title>
            <AlertDialog.Description>
              {deleteTarget ? `${deleteTarget.pharmacyName || "แบบตรวจนี้"} จะถูกลบออกจาก iPad และรายการที่ยังไม่ส่งข้อมูลนั้น ๆ จะถูกลบตามไปด้วย` : ""}
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild><button className={styles.secondaryButton}>ยกเลิก</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className={styles.dangerButton} onClick={handleDeleteInspection} disabled={deleting}>
                  {deleting ? "กำลังลบ..." : "ยืนยันการลบ"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <HomeSyncDialog
        open={syncCenterOpen}
        onOpenChange={setSyncCenterOpen}
        inspections={inspections}
        online={online}
        onNotice={setNotice}
      />
    </main>
  );
}

function NoticeBanner({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  return (
    <div className={`${styles.notice} ${styles[`notice_${notice.tone}`]}`} role="status">
      <span>{notice.tone === "success" ? "✓" : notice.tone === "warning" ? "!" : "×"}</span>
      <p>{notice.text}</p>
      <button onClick={onClose} aria-label="ปิดข้อความ">×</button>
    </div>
  );
}

function InspectionEditor({ inspectionId, online, onBack }: { inspectionId: string; online: boolean; onBack: () => void }) {
  const inspection = useLiveQuery(() => db.inspections.get(inspectionId), [inspectionId]);
  const answers = useLiveQuery(() => db.answers.where("inspectionId").equals(inspectionId).toArray(), [inspectionId]) ?? [];
  const responsiblePersons = useLiveQuery(
    () => db.responsiblePersons.where("inspectionId").equals(inspectionId).toArray(),
    [inspectionId],
  ) ?? [];
  const [activeTab, setActiveTab] = useState("info");
  const [notice, setNotice] = useState<Notice>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const answered = answers.filter((answer) => answer.selectedValue !== null).length;
  const progress = Math.round((answered / questions.length) * 100);
  const tabOrder = ["info", ...categories.map((category) => category.code), "review"];
  const currentIndex = tabOrder.indexOf(activeTab);

  if (inspection === undefined) {
    return <main className={styles.loadingScreen}>กำลังเปิดแบบตรวจ...</main>;
  }
  if (!inspection) {
    return <main className={styles.loadingScreen}><p>ไม่พบแบบตรวจนี้ใน iPad</p><button onClick={onBack}>กลับหน้าแรก</button></main>;
  }

  async function saveInspectionField(field: keyof Inspection, value: string) {
    await db.inspections.where("id").equals(inspectionId).modify((record) => {
      Object.assign(record, { [field]: value });
      record.localRevision += 1;
      record.updatedAt = new Date().toISOString();
      if (record.status === "SYNCED" || record.status === "SYNC_ERROR") record.status = "LOCAL_DRAFT";
    });
  }

  async function saveAnswer(answer: Answer, changes: Partial<Answer>) {
    const now = new Date().toISOString();
    await db.transaction("rw", db.answers, db.inspections, async () => {
      await db.answers.update(answer.id, { ...changes, updatedAt: now });
      await db.inspections.where("id").equals(inspectionId).modify((record) => {
        record.localRevision += 1;
        record.updatedAt = now;
        if (record.status === "SYNCED" || record.status === "SYNC_ERROR") record.status = "LOCAL_DRAFT";
      });
    });
  }

  async function addResponsiblePerson() {
    const person: ResponsiblePerson = {
      id: crypto.randomUUID(),
      inspectionId,
      name: "",
      licenseNumber: "",
      workStartTime: "",
      workEndTime: "",
    };
    await db.transaction("rw", db.responsiblePersons, db.inspections, async () => {
      await db.responsiblePersons.add(person);
      await db.inspections.where("id").equals(inspectionId).modify((record) => {
        record.localRevision += 1;
        record.updatedAt = new Date().toISOString();
      });
    });
  }

  async function updateResponsiblePerson(id: string, changes: Partial<ResponsiblePerson>) {
    await db.transaction("rw", db.responsiblePersons, db.inspections, async () => {
      await db.responsiblePersons.update(id, changes);
      await db.inspections.where("id").equals(inspectionId).modify((record) => {
        record.localRevision += 1;
        record.updatedAt = new Date().toISOString();
      });
    });
  }

  async function removeResponsiblePerson(id: string) {
    await db.responsiblePersons.delete(id);
  }

  const requiredMissing = [
    !inspection.inspectionDate && "วันที่ตรวจ",
    !inspection.inspector1.trim() && "ผู้ประเมิน 1",
    !inspection.licenseNumber.trim() && "เลขที่ใบอนุญาต",
    !inspection.pharmacyName.trim() && "ชื่อสถานประกอบการ",
  ].filter(Boolean) as string[];
  const unanswered = answers.filter((answer) => answer.selectedValue === null).length;
  const missingNaReasons = answers.filter((answer) => answer.selectedValue === "NA" && !answer.notApplicableReason.trim()).length;

  async function handleSync() {
    if (requiredMissing.length || unanswered || missingNaReasons) {
      setActiveTab("review");
      setNotice({ tone: "warning", text: "กรุณาตรวจรายการที่ยังไม่ครบก่อนส่งข้อมูล" });
      return;
    }
    const clientId = await getConfiguredGoogleClientId();
    const spreadsheetId = (await db.settings.get("spreadsheetId"))?.value;
    if (!clientId || !spreadsheetId) {
      setSettingsOpen(true);
      setNotice({ tone: "warning", text: "ตั้งค่า Google OAuth และ Spreadsheet ก่อนส่งข้อมูล" });
      return;
    }
    if (!online) {
      setNotice({ tone: "warning", text: "ยังไม่มีอินเทอร์เน็ต ข้อมูลทั้งหมดบันทึกอยู่ใน iPad แล้ว" });
      return;
    }

    setSyncing(true);
    try {
      const token = await requestGoogleAccessToken(clientId);
      const queueItem = await prepareInspectionForSync(inspectionId);
      const range = await syncQueueItem(queueItem, spreadsheetId, token);
      setNotice({ tone: "success", text: `ส่งเข้า Google Sheets สำเร็จ (${range})` });
    } catch (error) {
      setNotice({ tone: "danger", text: `${error instanceof Error ? error.message : "ส่งข้อมูลไม่สำเร็จ"} — ข้อมูลยังอยู่ใน iPad` });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className={styles.editorShell}>
      <header className={styles.editorHeader}>
        <button className={styles.backButton} onClick={onBack} aria-label="กลับหน้าแรก">‹</button>
        <div className={styles.editorTitle}>
          <span>แบบตรวจ GPP</span>
          <strong>{inspection.pharmacyName || "แบบตรวจใหม่"}</strong>
        </div>
        <div className={styles.saveState}>
          <span className={styles.savedIcon}>✓</span>
          <span><strong>บันทึกใน iPad แล้ว</strong><small>{online ? statusLabels[inspection.status] : "Offline"}</small></span>
        </div>
      </header>

      <div className={styles.progressWrap}>
        <Progress.Root className={styles.progressRoot} value={progress}>
          <Progress.Indicator className={styles.progressIndicator} style={{ transform: `translateX(-${100 - progress}%)` }} />
        </Progress.Root>
        <span>{answered}/{questions.length} ข้อ · {progress}%</span>
      </div>

      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className={styles.editorTabs}>
        <Tabs.List className={styles.tabList} aria-label="ส่วนของแบบตรวจ">
          <Tabs.Trigger className={styles.tabTrigger} value="info" aria-label="ข้อมูลร้าน">
            <span className={styles.tabNumber}>0</span><span className={styles.tabLabel}>ข้อมูลร้าน</span>
          </Tabs.Trigger>
          {categories.map((category) => {
            const categoryAnswers = answers.filter((answer) => answer.categoryCode === category.code);
            const complete = categoryAnswers.length > 0 && categoryAnswers.every((answer) => answer.selectedValue !== null);
            return (
              <Tabs.Trigger className={styles.tabTrigger} value={category.code} key={category.code} aria-label={category.name} title={category.name}>
                <span className={styles.tabNumber}>{complete ? "✓" : category.code}</span><span className={styles.tabLabel}>{tabLabels[category.code]}</span>
              </Tabs.Trigger>
            );
          })}
          <Tabs.Trigger className={styles.tabTrigger} value="review" aria-label="ตรวจสอบ">
            <span className={styles.tabNumber}>✓</span><span className={styles.tabLabel}>ตรวจสอบ</span>
          </Tabs.Trigger>
        </Tabs.List>

        <div className={styles.editorContent}>
          <Tabs.Content value="info">
            <InspectionInformation
              inspection={inspection}
              responsiblePersons={responsiblePersons}
              onChange={saveInspectionField}
              onAddPerson={addResponsiblePerson}
              onUpdatePerson={updateResponsiblePerson}
              onRemovePerson={removeResponsiblePerson}
            />
          </Tabs.Content>
          {categories.map((category) => (
            <Tabs.Content value={category.code} key={category.code}>
              <CategoryForm
                categoryCode={category.code}
                answers={answers}
                onSaveAnswer={saveAnswer}
              />
            </Tabs.Content>
          ))}
          <Tabs.Content value="review">
            <ReviewPanel
              inspection={inspection}
              answers={answers}
              requiredMissing={requiredMissing}
              unanswered={unanswered}
              missingNaReasons={missingNaReasons}
              online={online}
              syncing={syncing}
              onSync={handleSync}
              onOpenSettings={() => setSettingsOpen(true)}
              onDeleted={onBack}
            />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <nav className={styles.bottomNav}>
        <button
          className={styles.secondaryButton}
          disabled={currentIndex === 0}
          onClick={() => setActiveTab(tabOrder[Math.max(0, currentIndex - 1)])}
        >
          ← ก่อนหน้า
        </button>
        <span>{currentIndex + 1} / {tabOrder.length}</span>
        <button
          className={styles.primaryButton}
          disabled={currentIndex === tabOrder.length - 1}
          onClick={() => setActiveTab(tabOrder[Math.min(tabOrder.length - 1, currentIndex + 1)])}
        >
          ถัดไป →
        </button>
      </nav>

      <GoogleSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`${styles.field} ${wide ? styles.fieldWide : ""}`}>
      <span>{label}{required && <b aria-label="จำเป็น"> *</b>}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function InspectionInformation({
  inspection,
  responsiblePersons,
  onChange,
  onAddPerson,
  onUpdatePerson,
  onRemovePerson,
}: {
  inspection: Inspection;
  responsiblePersons: ResponsiblePerson[];
  onChange: (field: keyof Inspection, value: string) => void;
  onAddPerson: () => void;
  onUpdatePerson: (id: string, changes: Partial<ResponsiblePerson>) => void;
  onRemovePerson: (id: string) => void;
}) {
  return (
    <section>
      <PageTitle eyebrow="ขั้นตอน 0" title="ข้อมูลสถานประกอบการ" description="ข้อมูลทุกช่องจะถูกบันทึกลง iPad โดยอัตโนมัติ" />

      <div className={styles.formCard}>
        <h3>ข้อมูลการตรวจ</h3>
        <div className={styles.formGrid}>
          <Field label="วันที่ตรวจประเมิน" value={inspection.inspectionDate} type="date" required onChange={(value) => onChange("inspectionDate", value)} />
          <Field label="เวลาเริ่มตรวจ" value={inspection.startTime} type="time" onChange={(value) => onChange("startTime", value)} />
          <Field label="ผู้ประเมิน 1" value={inspection.inspector1} required onChange={(value) => onChange("inspector1", value)} />
          <Field label="ผู้ประเมิน 2" value={inspection.inspector2} onChange={(value) => onChange("inspector2", value)} />
        </div>
      </div>

      <div className={styles.formCard}>
        <h3>ใบอนุญาตและผู้ดำเนินกิจการ</h3>
        <div className={styles.formGrid}>
          <Field label="เลขที่ใบอนุญาต" value={inspection.licenseNumber} required onChange={(value) => onChange("licenseNumber", value)} />
          <Field label="ชื่อผู้รับอนุญาต" value={inspection.licenseHolderName} onChange={(value) => onChange("licenseHolderName", value)} />
          <Field label="ผู้ดำเนินกิจการ" value={inspection.operatorName} wide onChange={(value) => onChange("operatorName", value)} />
        </div>
      </div>

      <div className={styles.formCard}>
        <h3>สถานประกอบการ</h3>
        <div className={styles.formGrid}>
          <Field label="ชื่อสถานประกอบการ" value={inspection.pharmacyName} required wide onChange={(value) => onChange("pharmacyName", value)} />
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>ที่อยู่</span>
            <textarea value={inspection.address} rows={3} onChange={(event) => onChange("address", event.target.value)} />
          </label>
          <Field label="โทรศัพท์" value={inspection.telephone} type="tel" onChange={(value) => onChange("telephone", value)} />
          <Field label="โทรสาร" value={inspection.fax} type="tel" onChange={(value) => onChange("fax", value)} />
          <Field label="มือถือ" value={inspection.mobile} type="tel" onChange={(value) => onChange("mobile", value)} />
        </div>
      </div>

      <div className={styles.formCard}>
        <div className={styles.cardHeadingRow}>
          <div><h3>ผู้มีหน้าที่ปฏิบัติการ</h3><p>เพิ่มได้มากกว่าหนึ่งคน</p></div>
          <button className={styles.secondaryButton} onClick={onAddPerson}>＋ เพิ่มบุคคล</button>
        </div>
        {!responsiblePersons.length && <p className={styles.mutedMessage}>ยังไม่มีรายชื่อผู้มีหน้าที่ปฏิบัติการ</p>}
        {responsiblePersons.map((person, index) => (
          <div className={styles.personCard} key={person.id}>
            <div className={styles.personNumber}>{index + 1}</div>
            <div className={styles.personFields}>
              <Field label="ชื่อ" value={person.name} onChange={(value) => onUpdatePerson(person.id, { name: value })} />
              <Field label="เลขใบประกอบวิชาชีพ" value={person.licenseNumber} onChange={(value) => onUpdatePerson(person.id, { licenseNumber: value })} />
              <Field label="เวลาเริ่ม" value={person.workStartTime} type="time" onChange={(value) => onUpdatePerson(person.id, { workStartTime: value })} />
              <Field label="เวลาสิ้นสุด" value={person.workEndTime} type="time" onChange={(value) => onUpdatePerson(person.id, { workEndTime: value })} />
            </div>
            <button className={styles.iconButtonDanger} onClick={() => onRemovePerson(person.id)} aria-label={`ลบบุคคลที่ ${index + 1}`}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className={styles.pageTitle}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function CategoryForm({
  categoryCode,
  answers,
  onSaveAnswer,
}: {
  categoryCode: string;
  answers: Answer[];
  onSaveAnswer: (answer: Answer, changes: Partial<Answer>) => void;
}) {
  const category = categories.find((item) => item.code === categoryCode)!;
  const categoryQuestions = questionsByCategory[categoryCode];
  const answerByCode = new Map(answers.map((answer) => [answer.questionCode, answer]));
  const completed = categoryQuestions.filter((question) => answerByCode.get(question.code)?.selectedValue !== null).length;

  return (
    <section>
      <PageTitle
        eyebrow={`หมวด ${category.code} · ตอบแล้ว ${completed}/${categoryQuestions.length}`}
        title={category.name}
        description="แตะคำตอบที่ตรงกับผลการตรวจ เพิ่มหมายเหตุเมื่อจำเป็น"
      />
      <div className={styles.questionStack}>
        {categoryQuestions.map((question) => {
          const answer = answerByCode.get(question.code);
          if (!answer) return null;
          return <QuestionCard key={question.code} question={question} answer={answer} onSave={onSaveAnswer} />;
        })}
      </div>
    </section>
  );
}

function QuestionCard({ question, answer, onSave }: { question: Question; answer: Answer; onSave: (answer: Answer, changes: Partial<Answer>) => void }) {
  const choices: Array<{ value: AnswerValue; label: string; short: string }> = [
    { value: 0, label: "ปรับปรุง", short: "0" },
    { value: 1, label: "พอใช้", short: "1" },
    { value: 2, label: "ดี", short: "2" },
    ...(question.excludable ? [{ value: "NA" as const, label: "ไม่เกี่ยวข้อง", short: "N/A" }] : []),
  ];

  return (
    <article className={`${styles.questionCard} ${answer.selectedValue !== null ? styles.questionAnswered : ""}`}>
      <div className={styles.questionTopline}>
        <span className={styles.questionCode}>ข้อ {question.code}</span>
        <div className={styles.tagRow}>
          {question.critical && <span className={styles.criticalTag}>⚠ Critical Defect</span>}
          {question.excludable && <span className={styles.optionalTag}>ตัดฐานได้</span>}
          <span className={styles.weightTag}>น้ำหนัก {question.weight}</span>
        </div>
      </div>
      <h2>{question.text}</h2>
      {question.criteria && (
        <ul className={styles.criteriaList}>
          {question.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
        </ul>
      )}
      <RadioGroup.Root
        className={`${styles.scoreGroup} ${question.excludable ? styles.scoreGroupFour : ""}`}
        value={answer.selectedValue === null ? "" : String(answer.selectedValue)}
        onValueChange={(value) => onSave(answer, {
          selectedValue: value === "NA" ? "NA" : Number(value) as 0 | 1 | 2,
          ...(value !== "NA" ? { notApplicableReason: "" } : {}),
        })}
        aria-label={`ผลการประเมินข้อ ${question.code}`}
      >
        {choices.map((choice) => (
          <RadioGroup.Item className={styles.scoreChoice} value={String(choice.value)} key={String(choice.value)}>
            <span className={styles.scoreNumber}>{choice.short}</span>
            <span>{choice.label}</span>
            <RadioGroup.Indicator className={styles.radioIndicator}>✓</RadioGroup.Indicator>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>

      {answer.selectedValue === "NA" && (
        <label className={styles.inlineField}>
          <span>เหตุผลที่ไม่เกี่ยวข้อง <b>*</b></span>
          <input
            value={answer.notApplicableReason}
            placeholder="เช่น ไม่มีการเก็บยาที่ต้องควบคุมอุณหภูมิ"
            onChange={(event) => onSave(answer, { notApplicableReason: event.target.value })}
          />
        </label>
      )}

      <details className={styles.notesDisclosure} open={Boolean(answer.notes)}>
        <summary>＋ เพิ่มหมายเหตุ {answer.notes && <span>มีข้อมูลแล้ว</span>}</summary>
        <textarea
          value={answer.notes}
          rows={3}
          placeholder="บันทึกสิ่งที่พบ หรือใช้ Dictation บน iPad"
          onChange={(event) => onSave(answer, { notes: event.target.value })}
        />
      </details>
    </article>
  );
}

function ReviewPanel({
  inspection,
  answers,
  requiredMissing,
  unanswered,
  missingNaReasons,
  online,
  syncing,
  onSync,
  onOpenSettings,
  onDeleted,
}: {
  inspection: Inspection;
  answers: Answer[];
  requiredMissing: string[];
  unanswered: number;
  missingNaReasons: number;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onDeleted: () => void;
}) {
  const ready = !requiredMissing.length && !unanswered && !missingNaReasons;
  const perCategory = categories.map((category) => {
    const items = answers.filter((answer) => answer.categoryCode === category.code);
    return { ...category, complete: items.filter((answer) => answer.selectedValue !== null).length, total: items.length };
  });

  async function deleteInspection() {
    await db.transaction("rw", db.inspections, db.answers, db.responsiblePersons, db.syncQueue, async () => {
      await db.answers.where("inspectionId").equals(inspection.id).delete();
      await db.responsiblePersons.where("inspectionId").equals(inspection.id).delete();
      await db.syncQueue.where("inspectionId").equals(inspection.id).delete();
      await db.inspections.delete(inspection.id);
    });
    onDeleted();
  }

  return (
    <section>
      <PageTitle eyebrow="ขั้นตอนสุดท้าย" title="ตรวจความครบถ้วน" description="Phase 1 ยังไม่คำนวณคะแนนหรือผลผ่าน/ไม่ผ่าน" />
      <div className={`${styles.readinessCard} ${ready ? styles.ready : styles.notReady}`}>
        <div className={styles.readinessIcon}>{ready ? "✓" : "!"}</div>
        <div>
          <h2>{ready ? "แบบตรวจพร้อมส่ง" : "ยังมีข้อมูลไม่ครบ"}</h2>
          <p>{ready ? "ข้อมูลจะถูกส่งเป็น Revision ใหม่ไปยัง Google Sheets" : "ข้อมูลทั้งหมดบันทึกอยู่ใน iPad แล้ว คุณกลับไปกรอกต่อได้"}</p>
        </div>
      </div>

      <div className={styles.reviewGrid}>
        <div className={styles.formCard}>
          <h3>ความคืบหน้ารายหมวด</h3>
          <div className={styles.checkList}>
            {perCategory.map((category) => (
              <div key={category.code}>
                <span className={category.complete === category.total ? styles.checkDone : styles.checkPending}>
                  {category.complete === category.total ? "✓" : category.code}
                </span>
                <strong>{category.name}</strong>
                <small>{category.complete}/{category.total}</small>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.formCard}>
          <h3>รายการที่ต้องตรวจ</h3>
          <div className={styles.validationList}>
            <p><span>{requiredMissing.length ? "!" : "✓"}</span> ข้อมูลหลัก {requiredMissing.length ? `ขาด ${requiredMissing.join(", ")}` : "ครบแล้ว"}</p>
            <p><span>{unanswered ? "!" : "✓"}</span> คำตอบ {unanswered ? `ยังไม่ตอบ ${unanswered} ข้อ` : "ครบทุกข้อ"}</p>
            <p><span>{missingNaReasons ? "!" : "✓"}</span> เหตุผล N/A {missingNaReasons ? `ยังขาด ${missingNaReasons} ข้อ` : "ครบแล้ว"}</p>
          </div>
        </div>
      </div>

      <div className={styles.syncCard}>
        <div>
          <p className={styles.eyebrow}>สำรองข้อมูล</p>
          <h2>ส่งเข้า Google Sheets</h2>
          <p>{online ? "ระบบจะขอสิทธิ์ Google เฉพาะตอนส่งข้อมูล" : "ขณะนี้ Offline — ข้อมูลยังปลอดภัยอยู่ใน iPad"}</p>
          {inspection.lastSyncedAt && <small>ส่งล่าสุด {formatDateTime(inspection.lastSyncedAt)} · Revision {inspection.lastSyncedRevision}</small>}
        </div>
        <div className={styles.syncActions}>
          <button className={styles.ghostButton} onClick={onOpenSettings}>ตั้งค่า</button>
          <button className={styles.primaryButton} onClick={onSync} disabled={syncing || !ready}>
            {syncing ? "กำลังส่ง..." : inspection.lastSyncedAt ? "ตรวจและส่งอีกครั้ง" : "เชื่อม Google และส่ง"}
          </button>
        </div>
      </div>

      <AlertDialog.Root>
        <AlertDialog.Trigger asChild><button className={styles.deleteButton}>ลบแบบตรวจนี้</button></AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.dialogContent}>
            <AlertDialog.Title>ลบแบบตรวจนี้หรือไม่?</AlertDialog.Title>
            <AlertDialog.Description>แบบตรวจ คำตอบ และรายการรอส่งจะถูกลบจาก iPad หากยังไม่ได้สำรองจะไม่สามารถกู้คืนได้</AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild><button className={styles.secondaryButton}>ยกเลิก</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><button className={styles.dangerButton} onClick={deleteInspection}>ยืนยันการลบ</button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}

function inspectionIsReady(inspection: Inspection, inspectionAnswers: Answer[]) {
  const headerComplete = Boolean(
    inspection.inspectionDate &&
    inspection.inspector1.trim() &&
    inspection.licenseNumber.trim() &&
    inspection.pharmacyName.trim(),
  );
  const answersComplete =
    inspectionAnswers.length === questions.length &&
    inspectionAnswers.every((answer) => answer.selectedValue !== null);
  const naReasonsComplete = inspectionAnswers.every(
    (answer) => answer.selectedValue !== "NA" || Boolean(answer.notApplicableReason.trim()),
  );
  return headerComplete && answersComplete && naReasonsComplete;
}

function HomeSyncDialog({
  open,
  onOpenChange,
  inspections,
  online,
  onNotice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspections: Inspection[];
  online: boolean;
  onNotice: (notice: Notice) => void;
}) {
  const allAnswers = useLiveQuery(() => db.answers.toArray(), []) ?? [];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const unsynced = inspections.filter((inspection) => inspection.status !== "SYNCED");
  const ready = unsynced.filter((inspection) =>
    inspectionIsReady(inspection, allAnswers.filter((answer) => answer.inspectionId === inspection.id)),
  );

  async function syncAllReady() {
    if (!online) {
      onNotice({ tone: "warning", text: "ยังไม่มีอินเทอร์เน็ต ข้อมูลทั้งหมดบันทึกอยู่ใน iPad แล้ว" });
      onOpenChange(false);
      return;
    }
    if (!ready.length) return;

    const clientId = await getConfiguredGoogleClientId();
    const spreadsheetId = (await db.settings.get("spreadsheetId"))?.value;
    if (!clientId || !spreadsheetId) {
      setSettingsOpen(true);
      return;
    }

    setSyncing(true);
    let completed = 0;
    try {
      const token = await requestGoogleAccessToken(clientId);
      for (const inspection of ready) {
        const queueItem = await prepareInspectionForSync(inspection.id);
        await syncQueueItem(queueItem, spreadsheetId, token);
        completed += 1;
      }
      onNotice({ tone: "success", text: `ส่งข้อมูลเข้า Google Sheets สำเร็จ ${completed} แบบตรวจ` });
      onOpenChange(false);
    } catch (error) {
      onNotice({
        tone: "danger",
        text: `${error instanceof Error ? error.message : "ส่งข้อมูลไม่สำเร็จ"} — ส่งสำเร็จแล้ว ${completed} รายการ และข้อมูลที่เหลือยังอยู่ใน iPad`,
      });
      onOpenChange(false);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={`${styles.dialogContent} ${styles.syncDialogContent}`}>
            <div className={styles.dialogHeading}>
              <div>
                <p className={styles.eyebrow}>สำรองจากหน้าแรก</p>
                <Dialog.Title>ส่ง Google Sheets</Dialog.Title>
              </div>
              <Dialog.Close className={styles.iconButton} aria-label="ปิด">×</Dialog.Close>
            </div>
            <Dialog.Description>
              ระบบจะส่งแบบตรวจที่กรอกครบเป็น Revision ใหม่ ส่วนแบบร่างที่ยังไม่ครบจะยังอยู่ใน iPad
            </Dialog.Description>

            <div className={styles.homeSyncSummary}>
              <div><strong>{unsynced.length}</strong><span>ยังไม่ส่ง</span></div>
              <div><strong>{ready.length}</strong><span>พร้อมส่ง</span></div>
              <div><strong>{unsynced.length - ready.length}</strong><span>ยังกรอกไม่ครบ</span></div>
            </div>

            <div className={styles.homeSyncList}>
              {!unsynced.length && <p className={styles.mutedMessage}>ข้อมูลทั้งหมดส่งเข้า Google Sheets แล้ว</p>}
              {unsynced.map((inspection) => {
                const itemReady = inspectionIsReady(
                  inspection,
                  allAnswers.filter((answer) => answer.inspectionId === inspection.id),
                );
                return (
                  <div key={inspection.id}>
                    <span className={itemReady ? styles.checkDone : styles.checkPending}>{itemReady ? "✓" : "!"}</span>
                    <span><strong>{inspection.pharmacyName || "แบบตรวจใหม่"}</strong><small>{formatDate(inspection.inspectionDate)}</small></span>
                    <b className={itemReady ? styles.readyText : styles.warningText}>{itemReady ? "พร้อมส่ง" : "ยังไม่ครบ"}</b>
                  </div>
                );
              })}
            </div>

            <div className={styles.dialogActions}>
              <button className={styles.ghostButton} onClick={() => setSettingsOpen(true)}>ตั้งค่า Google</button>
              <Dialog.Close asChild><button className={styles.secondaryButton}>ไว้ภายหลัง</button></Dialog.Close>
              <button className={styles.primaryButton} disabled={!ready.length || syncing} onClick={syncAllReady}>
                {syncing ? `กำลังส่ง ${ready.length} รายการ...` : `ส่ง ${ready.length} แบบตรวจ`}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <GoogleSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function GoogleSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [spreadsheetName, setSpreadsheetName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [spreadsheets, setSpreadsheets] = useState<GoogleSpreadsheet[]>([]);
  const [showSpreadsheetList, setShowSpreadsheetList] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState("PharmaCheck GPP");
  const [connecting, setConnecting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([
      db.settings.get("spreadsheetId"),
      db.settings.get("spreadsheetName"),
      db.settings.get("googleAccountEmail"),
    ]).then(([sheet, sheetName, email]) => {
      setSpreadsheetId(sheet?.value ?? "");
      setSpreadsheetName(sheetName?.value ?? "");
      setAccountEmail(email?.value ?? "");
      setAccessToken("");
      setSpreadsheets([]);
      setShowSpreadsheetList(false);
      setShowCreateSheet(false);
      setError("");
    });
  }, [open]);

  async function chooseAccount() {
    const clientId = await getConfiguredGoogleClientId();
    if (!clientId) {
      setError("ระบบเชื่อมต่อ Google ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const account = await connectGoogleAccount(clientId);
      setAccessToken(account.accessToken);
      setAccountEmail(account.email);
      await db.settings.put({ key: "googleAccountEmail", value: account.email });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เชื่อมต่อบัญชี Google ไม่สำเร็จ");
    } finally {
      setConnecting(false);
    }
  }

  async function chooseSpreadsheet() {
    if (!accessToken) {
      setError("กรุณาเลือกบัญชี Google ก่อน");
      return;
    }
    setPicking(true);
    setError("");
    try {
      const files = await listGoogleSpreadsheets(accessToken);
      setSpreadsheets(files);
      setShowSpreadsheetList(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "อ่านรายการ Google Sheets ไม่สำเร็จ");
    } finally {
      setPicking(false);
    }
  }

  async function selectSpreadsheet(sheet: GoogleSpreadsheet) {
    setSpreadsheetId(sheet.id);
    setSpreadsheetName(sheet.name);
    setShowSpreadsheetList(false);
    await db.settings.bulkPut([
      { key: "spreadsheetId", value: sheet.id },
      { key: "spreadsheetName", value: sheet.name },
    ]);
  }

  async function createSpreadsheet() {
    const title = newSheetName.trim();
    if (!accessToken || !title) return;
    setCreatingSheet(true);
    setError("");
    try {
      const sheet = await createGoogleSpreadsheet(accessToken, title);
      await selectSpreadsheet(sheet);
      setShowCreateSheet(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "สร้าง Google Sheets ไม่สำเร็จ");
    } finally {
      setCreatingSheet(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.dialogContent}>
          <div className={styles.dialogHeading}>
            <div>
              <p className={styles.eyebrow}>Google Sheets</p>
              <Dialog.Title>ตั้งค่าการสำรองข้อมูล</Dialog.Title>
            </div>
            <Dialog.Close className={styles.iconButton} aria-label="ปิด">×</Dialog.Close>
          </div>
          <Dialog.Description>เลือกบัญชีและไฟล์ Google Sheets ที่ต้องการใช้สำรองข้อมูล โดยไม่ต้องคัดลอก Spreadsheet ID</Dialog.Description>

          <div className={styles.googleSetupSteps}>
            <section className={styles.googleSetupStep}>
              <span className={styles.stepNumber}>1</span>
              <div>
                <strong>เลือกบัญชี Google</strong>
                <p>{accountEmail || "ยังไม่ได้เชื่อมต่อบัญชี"}</p>
              </div>
              <button className={styles.secondaryButton} onClick={chooseAccount} disabled={connecting}>
                {connecting ? "กำลังเชื่อมต่อ..." : accountEmail ? "เปลี่ยนบัญชี" : "เลือกบัญชี Google"}
              </button>
            </section>

            <section className={styles.googleSetupStep}>
              <span className={styles.stepNumber}>2</span>
              <div>
                <strong>เลือก Google Sheets</strong>
                <p>{spreadsheetName || "ยังไม่ได้เลือกไฟล์"}</p>
              </div>
              <div className={styles.googleSheetActions}>
                <button className={styles.secondaryButton} onClick={() => setShowCreateSheet(true)} disabled={!accessToken || creatingSheet}>
                  ＋ สร้างใหม่
                </button>
                <button className={styles.primaryButton} onClick={chooseSpreadsheet} disabled={!accessToken || picking}>
                  {picking ? "กำลังเปิดรายการ..." : spreadsheetId ? "เปลี่ยนไฟล์" : "เลือก Google Sheets"}
                </button>
              </div>
            </section>
          </div>

          {showCreateSheet && (
            <div className={styles.googleCreateSheet}>
              <label className={styles.field}>
                <span>ชื่อ Google Sheets ใหม่</span>
                <input
                  value={newSheetName}
                  onChange={(event) => setNewSheetName(event.target.value)}
                  placeholder="PharmaCheck GPP"
                  autoFocus
                />
              </label>
              <div>
                <button className={styles.secondaryButton} onClick={() => setShowCreateSheet(false)} disabled={creatingSheet}>ยกเลิก</button>
                <button className={styles.primaryButton} onClick={createSpreadsheet} disabled={!newSheetName.trim() || creatingSheet}>
                  {creatingSheet ? "กำลังสร้าง..." : "สร้างและเลือกไฟล์นี้"}
                </button>
              </div>
            </div>
          )}

          {showSpreadsheetList && (
            <div className={styles.googleSheetList}>
              <div className={styles.googleSheetListHeading}>
                <strong>Google Sheets ของ {accountEmail}</strong>
                <button className={styles.iconButton} onClick={() => setShowSpreadsheetList(false)} aria-label="ปิดรายการ">×</button>
              </div>
              {!spreadsheets.length && <p className={styles.mutedMessage}>ไม่พบไฟล์ Google Sheets ในบัญชีนี้</p>}
              {spreadsheets.map((sheet) => (
                <button key={sheet.id} className={styles.googleSheetOption} onClick={() => selectSpreadsheet(sheet)}>
                  <span aria-hidden="true">▦</span>
                  <span>
                    <strong>{sheet.name}</strong>
                    <small>{sheet.modifiedTime ? `แก้ไขล่าสุด ${formatDateTime(sheet.modifiedTime)}` : "Google Sheets"}</small>
                  </span>
                  <b>{sheet.id === spreadsheetId ? "เลือกอยู่ ✓" : "เลือก"}</b>
                </button>
              ))}
            </div>
          )}

          {spreadsheetId && (
            <div className={styles.googleConnectedStatus}>
              <span>✓</span>
              <div><strong>พร้อมใช้งาน</strong><small>{spreadsheetName}</small></div>
            </div>
          )}
          {error && <p className={styles.googleSetupError}>{error}</p>}

          <div className={styles.dialogActions}>
            <Dialog.Close asChild><button className={styles.primaryButton} disabled={!spreadsheetId}>เสร็จสิ้น</button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
