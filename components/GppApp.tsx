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
  applyGoogleSheetPull,
  connectGoogleAccount,
  createGoogleSpreadsheet,
  listGoogleSpreadsheets,
  prepareInspectionForSync,
  previewGoogleSheetPull,
  requestGoogleAccessToken,
  syncQueueItem,
} from "@/lib/googleSheets";
import type { GooglePullPreview, GoogleSpreadsheet } from "@/lib/googleSheets";
import type { Answer, AnswerValue, BackupFile, Inspection, InspectionSignature, InspectionSignatureRole, ResponsiblePerson } from "@/lib/models";
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

function getDisplayedRevision(inspection: Inspection) {
  const lastSyncedRevision = inspection.lastSyncedRevision ?? 0;
  return inspection.status === "SYNCED" ? Math.max(1, lastSyncedRevision) : lastSyncedRevision + 1;
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
      <img className={styles.brandMark} src="/icons/pharmacheck-192.png" alt="" width="44" height="44" />
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
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
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
    setDataManagerOpen(false);
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
      setDataManagerOpen(false);
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
            <button className={`${styles.secondaryButton} ${styles.dataManageButton}`} onClick={() => setDataManagerOpen(true)}>
              <span aria-hidden="true">↕</span> จัดการข้อมูล
            </button>
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
                  <span className={styles.inspectionStatusGroup}>
                    <span className={styles.revisionPill}>Rev. {getDisplayedRevision(inspection)}</span>
                    <span className={`${styles.statusPill} ${styles[`status_${inspection.status}`]}`}>{statusLabels[inspection.status]}</span>
                  </span>
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
      <Dialog.Root open={dataManagerOpen} onOpenChange={setDataManagerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={`${styles.dialogContent} ${styles.dataManagerDialog}`}>
            <div className={styles.dialogHeading}>
              <div>
                <p className={styles.eyebrow}>ข้อมูลในอุปกรณ์</p>
                <Dialog.Title>จัดการข้อมูล</Dialog.Title>
              </div>
              <Dialog.Close className={styles.iconButton} aria-label="ปิด">×</Dialog.Close>
            </div>
            <Dialog.Description>สำรองข้อมูลทั้งหมดหรือกู้คืนจากไฟล์ที่เคยบันทึกไว้</Dialog.Description>
            <div className={styles.dataActionList}>
              <button className={styles.dataActionButton} onClick={handleExport} disabled={!inspections.length}>
                <span className={styles.dataActionIcon} aria-hidden="true">↓</span>
                <span><strong>ส่งออกไฟล์สำรอง</strong><small>บันทึกแบบตรวจทั้งหมดเป็นไฟล์ JSON</small></span>
                <b aria-hidden="true">›</b>
              </button>
              <button className={styles.dataActionButton} onClick={() => fileInput.current?.click()}>
                <span className={styles.dataActionIcon} aria-hidden="true">↑</span>
                <span><strong>นำเข้าไฟล์สำรอง</strong><small>กู้คืนแบบตรวจจากไฟล์ที่เคยส่งออก</small></span>
                <b aria-hidden="true">›</b>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  const editorTopRef = useRef<HTMLDivElement>(null);

  const answered = answers.filter((answer) => answer.selectedValue !== null).length;
  const progress = Math.round((answered / questions.length) * 100);
  const tabOrder = ["info", ...categories.map((category) => category.code), "review"];
  const currentIndex = tabOrder.indexOf(activeTab);

  function navigateToStep(targetTab: string) {
    setActiveTab(targetTab);
    setNotice(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const firstIncomplete = questionsByCategory[targetTab]?.find((question) => {
          const answer = answers.find((item) => item.questionCode === question.code);
          return !answer || answer.selectedValue === null || (answer.selectedValue === "NA" && !answer.notApplicableReason.trim());
        });
        if (firstIncomplete) {
          const card = document.querySelector<HTMLElement>(`[data-question-code="${firstIncomplete.code}"]`);
          card?.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => card?.querySelector<HTMLElement>('[role="radio"]')?.focus({ preventScroll: true }), 450);
          return;
        }
        editorTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function handleNextStep() {
    navigateToStep(tabOrder[Math.min(tabOrder.length - 1, currentIndex + 1)]);
  }

  function handlePreviousStep() {
    navigateToStep(tabOrder[Math.max(0, currentIndex - 1)]);
  }

  if (inspection === undefined) {
    return <main className={styles.loadingScreen}>กำลังเปิดแบบตรวจ...</main>;
  }
  if (!inspection) {
    return <main className={styles.loadingScreen}><p>ไม่พบแบบตรวจนี้ใน iPad</p><button onClick={onBack}>กลับหน้าแรก</button></main>;
  }

  async function saveInspectionChanges(changes: Partial<Inspection>) {
    await db.inspections.where("id").equals(inspectionId).modify((record) => {
      Object.assign(record, changes);
      record.localRevision += 1;
      record.updatedAt = new Date().toISOString();
      if (record.status === "SYNCED" || record.status === "SYNC_ERROR") record.status = "LOCAL_DRAFT";
    });
  }

  async function saveInspectionField(field: keyof Inspection, value: string) {
    const signatureRole = field === "inspector1" ? "assessor_1" : field === "inspector2" ? "assessor_2" : null;
    if (!signatureRole) {
      await saveInspectionChanges({ [field]: value });
      return;
    }

    const signatures = inspection?.signatures ?? [];
    await saveInspectionChanges({
      [field]: value,
      signatures: [
        ...signatures.filter((signature) => signature.role !== signatureRole),
        { role: signatureRole, name: value, signature: "", signedAt: "" },
      ],
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
    const licenseeSignature = inspection?.signatures?.find((signature) => signature.role === "licensee");
    if (requiredMissing.length || unanswered || missingNaReasons || !licenseeSignature?.name.trim() || !licenseeSignature.signature || !licenseeSignature.signedAt) {
      setActiveTab("review");
      setNotice({ tone: "warning", text: "กรุณาตรวจข้อมูลและให้เจ้าของร้านลงชื่อรับรองก่อนส่ง" });
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

      <div className={styles.progressWrap} ref={editorTopRef}>
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
            const complete = categoryAnswers.length > 0 && categoryAnswers.every((answer) =>
              answer.selectedValue !== null && (answer.selectedValue !== "NA" || answer.notApplicableReason.trim()),
            );
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
              responsiblePersons={responsiblePersons}
              requiredMissing={requiredMissing}
              unanswered={unanswered}
              missingNaReasons={missingNaReasons}
              online={online}
              syncing={syncing}
              onSync={handleSync}
              onSaveCertification={saveInspectionChanges}
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
          onClick={handlePreviousStep}
        >
          ← ก่อนหน้า
        </button>
        <span>{currentIndex + 1} / {tabOrder.length}</span>
        <button
          className={styles.primaryButton}
          disabled={currentIndex === tabOrder.length - 1}
          onClick={handleNextStep}
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
    <article
      className={`${styles.questionCard} ${answer.selectedValue !== null ? styles.questionAnswered : ""}`}
      data-question-code={question.code}
    >
      <div className={styles.questionTopline}>
        <span className={styles.questionCode}>ข้อ {question.code}</span>
        <div className={styles.tagRow}>
          {question.critical && <span className={styles.criticalTag}>⚠ Critical Defect</span>}
          {question.excludable && <span className={styles.optionalTag}>ตัดฐานได้</span>}
          <span className={styles.weightTag}>น้ำหนัก {question.weight}</span>
        </div>
      </div>
      <h2>{question.text}</h2>
      <details className={styles.sourceTextDisclosure}>
        <summary>ดูข้อความตามเอกสารต้นฉบับ <span>หน้า {question.sourcePage}</span></summary>
        <p>{question.fullText}</p>
      </details>
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

function SignaturePad({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = 138;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#073f38";
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, width, height);
      image.src = value;
    }
  }, [value]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function finishDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const output = document.createElement("canvas");
    output.width = 600;
    output.height = 180;
    const context = output.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(event.currentTarget, 0, 0, output.width, output.height);
    onChange(output.toDataURL("image/jpeg", 0.72));
  }

  return (
    <div className={styles.signaturePadWrap}>
      <canvas
        ref={canvasRef}
        className={styles.signaturePad}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        aria-label="พื้นที่สำหรับเซ็นชื่อ"
      />
      <span className={styles.signatureLine}>{label}</span>
      {value && <button type="button" className={styles.signatureClearButton} onClick={() => onChange("")}>ล้างลายเซ็น</button>}
    </div>
  );
}

const signatureRoles: Array<{ role: InspectionSignatureRole; label: string; required?: boolean }> = [
  { role: "licensee", label: "ผู้รับอนุญาต / ผู้ดำเนินกิจการ", required: true },
  { role: "duty_officer", label: "ผู้มีหน้าที่ปฏิบัติการ" },
  { role: "assessor_1", label: "ผู้ประเมิน 1" },
  { role: "assessor_2", label: "ผู้ประเมิน 2" },
  { role: "witness_1", label: "พยาน 1" },
  { role: "witness_2", label: "พยาน 2" },
];

function ReviewPanel({
  inspection,
  answers,
  responsiblePersons,
  requiredMissing,
  unanswered,
  missingNaReasons,
  online,
  syncing,
  onSync,
  onSaveCertification,
  onOpenSettings,
  onDeleted,
}: {
  inspection: Inspection;
  answers: Answer[];
  responsiblePersons: ResponsiblePerson[];
  requiredMissing: string[];
  unanswered: number;
  missingNaReasons: number;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
  onSaveCertification: (changes: Partial<Inspection>) => void;
  onOpenSettings: () => void;
  onDeleted: () => void;
}) {
  const signatures = inspection.signatures ?? [];
  const licenseeSignature = signatures.find((signature) => signature.role === "licensee");
  const certified = Boolean(licenseeSignature?.name.trim() && licenseeSignature.signature && licenseeSignature.signedAt);
  const ready = !requiredMissing.length && !unanswered && !missingNaReasons && certified;
  const answerByCode = new Map(answers.map((answer) => [answer.questionCode, answer]));
  function updateSignature(role: InspectionSignatureRole, changes: Partial<InspectionSignature>) {
    const existing = signatures.find((signature) => signature.role === role);
    const defaults: Record<InspectionSignatureRole, string> = {
      licensee: inspection.licenseHolderName,
      duty_officer: "",
      assessor_1: inspection.inspector1,
      assessor_2: inspection.inspector2,
      witness_1: "",
      witness_2: "",
    };
    const linkedInspectorName = role === "assessor_1" ? inspection.inspector1 : role === "assessor_2" ? inspection.inspector2 : null;
    const next: InspectionSignature = {
      role,
      name: linkedInspectorName ?? existing?.name ?? defaults[role] ?? "",
      signature: existing?.signature ?? "",
      signedAt: existing?.signedAt ?? "",
      ...changes,
    };
    onSaveCertification({ signatures: [...signatures.filter((signature) => signature.role !== role), next] });
  }

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
    <section className={styles.reviewPage}>
      <div className={styles.reviewToolbar}>
        <span className={styles.revisionPill}>Revision {getDisplayedRevision(inspection)}</span>
        <button type="button" className={`${styles.secondaryButton} ${styles.printButton}`} onClick={() => window.print()}>
          พิมพ์ / บันทึก PDF
        </button>
      </div>
      <div className={styles.reviewPaper}>
        <header className={styles.documentHeader}>
          <p>บันทึกการประเมินวิธีปฏิบัติทางเภสัชกรรมชุมชน</p>
          <h1>ในสถานที่ขายยาแผนปัจจุบัน</h1>
          <span>ตามประกาศกระทรวงสาธารณสุข เรื่อง การกำหนดเกี่ยวกับสถานที่ อุปกรณ์<br />และวิธีปฏิบัติทางเภสัชกรรมชุมชน ในสถานที่ขายยาแผนปัจจุบัน ตามกฎหมายว่าด้วยยา พ.ศ. ๒๕๕๗</span>
        </header>
      <section className={styles.ownerSummaryCard}>
        <dl className={styles.ownerDetails}>
          <div><dt>วันที่ตรวจประเมิน</dt><dd>{formatDate(inspection.inspectionDate)}</dd></div>
          <div><dt>เวลา</dt><dd>{inspection.startTime ? `${inspection.startTime} น.` : "—"}</dd></div>
          <div className={styles.ownerDetailWide}><dt>ผู้ประเมิน ๑</dt><dd>{inspection.inspector1 || "—"}</dd></div>
          <div className={styles.ownerDetailWide}><dt>ผู้ประเมิน ๒</dt><dd>{inspection.inspector2 || "—"}</dd></div>
          <div><dt>เลขที่ใบอนุญาต</dt><dd>{inspection.licenseNumber || "—"}</dd></div>
          <div><dt>ชื่อผู้รับอนุญาต</dt><dd>{inspection.licenseHolderName || "—"}</dd></div>
          <div className={styles.ownerDetailWide}><dt>โดยมี</dt><dd>{inspection.operatorName || "—"}<span className={styles.ownerDetailSuffix}>เป็นผู้ดำเนินกิจการ (เฉพาะกรณีนิติบุคคล)</span></dd></div>
          <div className={styles.ownerDetailWide}><dt>สถานประกอบการชื่อ</dt><dd>{inspection.pharmacyName || "—"}</dd></div>
          <div className={styles.ownerDetailWide}><dt>ที่อยู่</dt><dd>{inspection.address || "—"}</dd></div>
          <div className={`${styles.ownerDetailWide} ${styles.ownerContactRow}`}>
            <span><dt>โทรศัพท์</dt><dd>{inspection.telephone || "—"}</dd></span>
            <span><dt>โทรสาร</dt><dd>{inspection.fax || "—"}</dd></span>
            <span><dt>มือถือ</dt><dd>{inspection.mobile || "—"}</dd></span>
          </div>
          <div className={styles.ownerDetailWide}>
            <dt>ผู้มีหน้าที่ปฏิบัติการ {responsiblePersons.length} คน ได้แก่</dt>
            <dd className={styles.responsibleSummary}>
              {responsiblePersons.length ? responsiblePersons.map((person, index) => (
                <span key={person.id}>{index + 1}. {person.name || "ยังไม่ระบุชื่อ"} {person.licenseNumber && `ภ. ${person.licenseNumber}`} · เวลาปฏิบัติการ {person.workStartTime || "—"} - {person.workEndTime || "—"} น.</span>
              )) : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.surveyReviewSection}>
        <div className={styles.surveyReviewHeading}>
          <div><p className={styles.eyebrow}>แบบสำรวจ</p><h2>ข้อกำหนดและผลที่บันทึก</h2></div>
          <span>{answers.length - unanswered}/{questions.length} ข้อ</span>
        </div>
        <div className={styles.surveyCategoryStack}>
          {categories.map((category) => {
            const categoryQuestions = questionsByCategory[category.code];
            return (
              <article className={styles.surveyCategory} key={category.code}>
                <h3>{category.code}. {category.name}</h3>
                <div className={styles.surveyTableScroll}>
                  <table className={styles.surveyTable}>
                    <thead><tr><th>ข้อกำหนดตามแบบตรวจ</th><th>ปรับปรุง<br />(0)</th><th>พอใช้<br />(1)</th><th>ดี<br />(2)</th><th>N/A</th><th>น้ำหนัก</th></tr></thead>
                    <tbody>
                      {categoryQuestions.map((question) => {
                        const answer = answerByCode.get(question.code);
                        return (
                          <tr key={question.code}>
                            <td><strong>{question.code}</strong><span>{question.fullText}</span>{question.critical && <b>Critical Defect</b>}{question.excludable && <b className={styles.excludableBadge}>ตัดฐานได้</b>}</td>
                            {[0, 1, 2, "NA"].map((value) => (
                              <td key={String(value)} className={answer?.selectedValue === value ? styles.surveySelected : undefined}>
                                {value === "NA" && !question.excludable ? <span className={styles.notApplicableCell}>—</span> : answer?.selectedValue === value ? "✓" : ""}
                              </td>
                            ))}
                            <td>{question.weight}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.certificationCard}>
        <p className={styles.certificationStatement}>ในการตรวจครั้งนี้ ผู้ประเมินและคณะมิได้ทำให้ทรัพย์สินของผู้รับอนุญาต / ผู้ดำเนินกิจการ / ผู้มีหน้าที่ปฏิบัติการ รวมถึงผู้เกี่ยวข้อง สูญหายหรือเสียหายแต่อย่างใด ข้าพเจ้าได้อ่าน / อ่านให้ฟังแล้ว รับรองว่าถูกต้อง จึงได้ลงลายมือชื่อไว้เป็นสำคัญ</p>
        <div className={styles.signatureGrid}>
          {signatureRoles.map(({ role, label, required }) => {
            const entry = signatures.find((signature) => signature.role === role);
            const suggestedName = role === "licensee" ? inspection.licenseHolderName : role === "assessor_1" ? inspection.inspector1 : role === "assessor_2" ? inspection.inspector2 : "";
            const linkedInspectorName = role === "assessor_1" ? inspection.inspector1 : role === "assessor_2" ? inspection.inspector2 : null;
            return (
              <div className={styles.signatureBlock} key={role}>
                <div className={styles.signatureRole}><strong>{label}</strong>{required && <span>จำเป็น</span>}</div>
                <SignaturePad
                  value={entry?.signature ?? ""}
                  label={`ลงชื่อ ${label}`}
                  onChange={(signature) => updateSignature(role, { signature, signedAt: signature ? new Date().toISOString() : "" })}
                />
                <label className={`${styles.field} ${styles.signatureNameField}`}>
                  <span>ชื่อ–นามสกุล {linkedInspectorName !== null && <small>จากข้อมูลแบบตรวจ</small>}</span>
                  <input
                    value={linkedInspectorName ?? entry?.name ?? suggestedName}
                    placeholder={`ชื่อ${label}`}
                    readOnly={linkedInspectorName !== null}
                    onChange={(event) => linkedInspectorName === null && updateSignature(role, { name: event.target.value, signature: "", signedAt: "" })}
                  />
                </label>
                {entry?.signedAt && <small className={styles.certifiedAt}>ลงนามเมื่อ {formatDateTime(entry.signedAt)}</small>}
              </div>
            );
          })}
        </div>
      </section>
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
  const licenseeSignature = inspection.signatures?.find((signature) => signature.role === "licensee");
  const certified = Boolean(licenseeSignature?.name.trim() && licenseeSignature.signature && licenseeSignature.signedAt);
  return headerComplete && answersComplete && naReasonsComplete && certified;
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
  const [pulling, setPulling] = useState(false);
  const [pullPreview, setPullPreview] = useState<GooglePullPreview | null>(null);
  const unsynced = inspections.filter((inspection) => inspection.status !== "SYNCED");
  const ready = unsynced.filter((inspection) =>
    inspectionIsReady(inspection, allAnswers.filter((answer) => answer.inspectionId === inspection.id)),
  );

  useEffect(() => {
    if (!open) setPullPreview(null);
  }, [open]);

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

  async function previewPull() {
    if (!online) {
      onNotice({ tone: "warning", text: "ยังไม่มีอินเทอร์เน็ต ไม่สามารถดึงข้อมูลจาก Google Sheets ได้" });
      onOpenChange(false);
      return;
    }

    const clientId = await getConfiguredGoogleClientId();
    const spreadsheetId = (await db.settings.get("spreadsheetId"))?.value;
    if (!clientId || !spreadsheetId) {
      setSettingsOpen(true);
      return;
    }

    setPulling(true);
    try {
      const token = await requestGoogleAccessToken(clientId);
      setPullPreview(await previewGoogleSheetPull(spreadsheetId, token));
    } catch (error) {
      onNotice({ tone: "danger", text: error instanceof Error ? error.message : "ดึงข้อมูลจาก Google Sheets ไม่สำเร็จ" });
      onOpenChange(false);
    } finally {
      setPulling(false);
    }
  }

  async function confirmPull() {
    if (!pullPreview) return;
    setPulling(true);
    try {
      const result = await applyGoogleSheetPull(pullPreview);
      onNotice({
        tone: result.conflicts ? "warning" : "success",
        text: `ดึงข้อมูลแล้ว: เพิ่มใหม่ ${result.added} · อัปเดต ${result.updated} · ข้ามข้อมูลขัดแย้ง ${result.conflicts}`,
      });
      setPullPreview(null);
      onOpenChange(false);
    } catch (error) {
      onNotice({ tone: "danger", text: error instanceof Error ? error.message : "นำข้อมูลเข้า iPad ไม่สำเร็จ" });
      onOpenChange(false);
    } finally {
      setPulling(false);
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

            {pullPreview && (
              <section className={styles.pullPreview} aria-label="สรุปข้อมูลที่จะดึงจาก Google Sheets">
                <div className={styles.pullPreviewHeading}>
                  <div><strong>ตรวจพบข้อมูลจาก Google Sheets</strong><span>ตรวจสอบรายการก่อนนำเข้าลง iPad</span></div>
                  <button className={styles.iconButton} onClick={() => setPullPreview(null)} aria-label="ย้อนกลับ">←</button>
                </div>
                <div className={styles.homeSyncSummary}>
                  <div><strong>{pullPreview.additions.length}</strong><span>รายการใหม่</span></div>
                  <div><strong>{pullPreview.updates.length}</strong><span>อัปเดตได้</span></div>
                  <div><strong>{pullPreview.conflicts.length}</strong><span>ขัดแย้ง (ไม่ทับ)</span></div>
                </div>
                <p>รายการขัดแย้งจะถูกเก็บไว้ใน iPad ตามเดิม ระบบจะไม่นำข้อมูลจาก Google มาทับ</p>
              </section>
            )}

            {!pullPreview && (
              <div className={styles.syncTransferActions}>
                <button
                  className={`${styles.secondaryButton} ${styles.syncTransferButton}`}
                  onClick={previewPull}
                  disabled={pulling || syncing}
                >
                  <span className={styles.syncTransferIcon}>↓</span>
                  <span><strong>{pulling ? "กำลังตรวจข้อมูล..." : "ดึงข้อมูลลง iPad"}</strong><small>รับแบบตรวจจาก Google Sheets</small></span>
                </button>
                <button
                  className={`${styles.primaryButton} ${styles.syncTransferButton}`}
                  disabled={!ready.length || syncing || pulling}
                  onClick={syncAllReady}
                >
                  <span className={styles.syncTransferIcon}>↑</span>
                  <span><strong>{syncing ? "กำลังส่งข้อมูล..." : `ส่งขึ้น Google ${ready.length} แบบ`}</strong><small>{ready.length ? "สำรองแบบตรวจที่กรอกครบ" : "ยังไม่มีแบบตรวจที่พร้อมส่ง"}</small></span>
                </button>
              </div>
            )}

            {pullPreview && (
              <button
                className={`${styles.primaryButton} ${styles.pullConfirmButton}`}
                onClick={confirmPull}
                disabled={pulling || pullPreview.additions.length + pullPreview.updates.length === 0}
              >
                {pulling ? "กำลังนำเข้าข้อมูล..." : `ยืนยันนำเข้า ${pullPreview.additions.length + pullPreview.updates.length} รายการ`}
              </button>
            )}

            <div className={styles.syncDialogFooter}>
              <button className={styles.ghostButton} onClick={() => setSettingsOpen(true)}>⚙ ตั้งค่า Google</button>
              <Dialog.Close asChild><button className={styles.secondaryButton}>ปิด</button></Dialog.Close>
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

  async function getAccessTokenForAction() {
    if (accessToken) return accessToken;

    const clientId = await getConfiguredGoogleClientId();
    if (!clientId) {
      throw new Error("ระบบเชื่อมต่อ Google ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ");
    }

    const token = await requestGoogleAccessToken(clientId);
    setAccessToken(token);
    return token;
  }

  async function chooseSpreadsheet() {
    setPicking(true);
    setError("");
    try {
      const token = await getAccessTokenForAction();
      const files = await listGoogleSpreadsheets(token);
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
    if (!title) return;
    setCreatingSheet(true);
    setError("");
    try {
      const token = await getAccessTokenForAction();
      const sheet = await createGoogleSpreadsheet(token, title);
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
                <button className={styles.secondaryButton} onClick={() => setShowCreateSheet(true)} disabled={creatingSheet}>
                  ＋ สร้างใหม่
                </button>
                <button className={styles.primaryButton} onClick={chooseSpreadsheet} disabled={picking}>
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
