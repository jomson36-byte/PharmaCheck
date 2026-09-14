import Dexie, { type EntityTable } from "dexie";
import type { Answer, AppSetting, BackupFile, Inspection, ResponsiblePerson, SyncQueueItem } from "./models";
import { questions } from "./questions";

class PharmaCheckDatabase extends Dexie {
  inspections!: EntityTable<Inspection, "id">;
  answers!: EntityTable<Answer, "id">;
  responsiblePersons!: EntityTable<ResponsiblePerson, "id">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;
  settings!: EntityTable<AppSetting, "key">;

  constructor() {
    super("pharmacheck");
    this.version(1).stores({
      inspections: "id, status, updatedAt, inspectionDate, licenseNumber",
      answers: "id, inspectionId, [inspectionId+questionCode], categoryCode, updatedAt",
      responsiblePersons: "id, inspectionId",
      syncQueue: "id, syncBatchId, inspectionId, status, createdAt",
      settings: "key",
    });
    this.version(2).stores({
      inspections: "id, status, updatedAt, inspectionDate, licenseNumber",
      answers: "id, inspectionId, [inspectionId+questionCode], categoryCode, updatedAt",
      responsiblePersons: "id, inspectionId",
      syncQueue: "id, syncBatchId, inspectionId, status, createdAt",
      settings: "key",
    }).upgrade(async (transaction) => {
      const fullTextByCode = new Map(questions.map((question) => [question.code, question.fullText]));
      await transaction.table("answers").toCollection().modify((answer: Answer) => {
        answer.questionTextSnapshot = fullTextByCode.get(answer.questionCode) ?? answer.questionTextSnapshot;
      });
      await transaction.table("inspections").toCollection().modify((inspection: Inspection) => {
        inspection.templateVersion = "GPP-2014-v2";
      });
    });
  }
}

export const db = new PharmaCheckDatabase();

function localDateParts() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - offset).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceId() {
  const existing = await db.settings.get("deviceId");
  if (existing) return existing.value;
  const value = newId();
  await db.settings.put({ key: "deviceId", value });
  return value;
}

export async function createInspection() {
  const now = new Date().toISOString();
  const { date, time } = localDateParts();
  const inspection: Inspection = {
    id: newId(),
    schemaVersion: "1",
    templateVersion: "GPP-2014-v2",
    deviceId: await getDeviceId(),
    inspectionDate: date,
    startTime: time,
    inspector1: "",
    inspector2: "",
    licenseNumber: "",
    licenseHolderName: "",
    operatorName: "",
    pharmacyName: "",
    address: "",
    telephone: "",
    fax: "",
    mobile: "",
    signatures: [],
    status: "LOCAL_DRAFT",
    localRevision: 1,
    createdAt: now,
    updatedAt: now,
  };

  const answers: Answer[] = questions.map((question) => ({
    id: newId(),
    inspectionId: inspection.id,
    questionCode: question.code,
    questionTextSnapshot: question.fullText,
    categoryCode: question.categoryCode,
    selectedValue: null,
    weightSnapshot: question.weight,
    isCriticalSnapshot: Boolean(question.critical),
    isExcludableSnapshot: Boolean(question.excludable),
    notApplicableReason: "",
    notes: "",
    updatedAt: now,
  }));

  await db.transaction("rw", db.inspections, db.answers, async () => {
    await db.inspections.add(inspection);
    await db.answers.bulkAdd(answers);
  });

  return inspection.id;
}

export async function touchInspection(inspectionId: string) {
  const inspection = await db.inspections.get(inspectionId);
  if (!inspection) return;
  await db.inspections.update(inspectionId, {
    status: inspection.status === "SYNCING" ? "LOCAL_DRAFT" : inspection.status === "SYNCED" ? "LOCAL_DRAFT" : inspection.status,
    localRevision: inspection.localRevision + 1,
    updatedAt: new Date().toISOString(),
  });
}

export async function exportBackup(): Promise<BackupFile> {
  const [inspections, answers, responsiblePersons, syncQueue] = await Promise.all([
    db.inspections.toArray(),
    db.answers.toArray(),
    db.responsiblePersons.toArray(),
    db.syncQueue.toArray(),
  ]);

  return {
    format: "pharmacheck-backup",
    schemaVersion: "1",
    exportedAt: new Date().toISOString(),
    inspections,
    answers,
    responsiblePersons,
    syncQueue,
  };
}

export async function importBackup(backup: BackupFile) {
  if (backup.format !== "pharmacheck-backup" || backup.schemaVersion !== "1") {
    throw new Error("ไฟล์สำรองนี้ไม่ใช่รูปแบบที่รองรับ");
  }

  await db.transaction("rw", db.inspections, db.answers, db.responsiblePersons, db.syncQueue, async () => {
    await db.inspections.bulkPut(backup.inspections);
    await db.answers.bulkPut(backup.answers);
    await db.responsiblePersons.bulkPut(backup.responsiblePersons);
    await db.syncQueue.bulkPut(backup.syncQueue);
  });
}
