import { createId, db } from "./db";
import type { Answer, InspectionSignatureRole, SubmissionPayload, SyncQueueItem } from "./models";
import { questions } from "./questions";

const SHEET_NAME = "Submissions";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");
const SIGNATURE_ROLES: InspectionSignatureRole[] = ["licensee", "duty_officer", "assessor_1", "assessor_2", "witness_1", "witness_2"];

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleIdentityError = { type?: string; error?: string; message?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
export type GoogleAccount = { accessToken: string; email: string; name?: string; picture?: string };

export type GoogleSpreadsheet = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
  capabilities?: { canEdit?: boolean };
};

export class GoogleSheetsPermissionError extends Error {
  constructor() {
    super("บัญชี Google นี้ไม่มีสิทธิ์แก้ไขไฟล์ที่เลือก กรุณาเปลี่ยนบัญชี เลือกไฟล์ที่แก้ไขได้ หรือสร้าง Google Sheets ใหม่");
    this.name = "GoogleSheetsPermissionError";
  }
}

type GooglePullItem = {
  payload: SubmissionPayload;
  revision: number;
  syncedAt: string;
  localUpdatedAt?: string;
};

export type GooglePullPreview = {
  additions: GooglePullItem[];
  updates: GooglePullItem[];
  conflicts: GooglePullItem[];
  unchanged: number;
};

let cachedToken: { clientId: string; accessToken: string; expiresAt: number } | null = null;

export function hasValidGoogleAccessToken(clientId: string) {
  return Boolean(
    cachedToken?.clientId === clientId &&
    cachedToken.expiresAt > Date.now() + 60_000,
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: GoogleIdentityError) => void;
          }) => TokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

export const sheetHeaders = [
  "sync_batch_id",
  "inspection_id",
  "revision",
  "payload_hash",
  "schema_version",
  "template_version",
  "device_id",
  "inspection_date",
  "start_time",
  "inspector_1",
  "inspector_2",
  "license_number",
  "license_holder_name",
  "operator_name",
  "pharmacy_name",
  "address",
  "telephone",
  "fax",
  "mobile",
  "responsible_persons_json",
  ...questions.map((question) => `Q_${question.code.replace(".", "_")}`),
  "notes_json",
  "na_reasons_json",
  "created_at",
  "updated_at",
  "synced_at",
  "payload_json",
  ...SIGNATURE_ROLES.map((role) => `signature_${role}_json`),
  "deficiencies",
];

function canonicalPayload(payload: SubmissionPayload) {
  const { signatures: _signatures, ...inspectionWithoutSignatures } = payload.inspection;
  return JSON.stringify({
    ...payload,
    inspection: inspectionWithoutSignatures,
    answers: [...payload.answers].sort((a, b) => a.questionCode.localeCompare(b.questionCode, undefined, { numeric: true })),
    responsiblePersons: [...payload.responsiblePersons].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

function hashablePayload(payload: SubmissionPayload) {
  const {
    status: _status,
    lastSyncedRevision: _lastSyncedRevision,
    lastSyncedAt: _lastSyncedAt,
    ...inspectionData
  } = payload.inspection;

  return JSON.stringify({
    inspection: inspectionData,
    answers: [...payload.answers].sort((a, b) => a.questionCode.localeCompare(b.questionCode, undefined, { numeric: true })),
    responsiblePersons: [...payload.responsiblePersons].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareInspectionForSync(inspectionId: string) {
  const [inspection, answers, responsiblePersons] = await Promise.all([
    db.inspections.get(inspectionId),
    db.answers.where("inspectionId").equals(inspectionId).toArray(),
    db.responsiblePersons.where("inspectionId").equals(inspectionId).toArray(),
  ]);

  if (!inspection) throw new Error("ไม่พบแบบตรวจในเครื่อง");

  const payload: SubmissionPayload = {
    inspection,
    answers: answers.map((answer) => {
      const { notes: _legacyNotes, notApplicableReason: _legacyNaReason, ...answerWithoutLegacyFields } = answer as Answer & {
        notes?: string;
        notApplicableReason?: string;
      };
      return answerWithoutLegacyFields;
    }),
    responsiblePersons,
    exportedAt: new Date().toISOString(),
  };
  const payloadHash = await sha256(hashablePayload(payload));
  const existing = await db.syncQueue
    .where("inspectionId")
    .equals(inspectionId)
    .filter((item) => item.payloadHash === payloadHash && item.status !== "ERROR")
    .first();

  if (existing) return existing;

  const now = new Date().toISOString();
  const item: SyncQueueItem = {
    id: createId(),
    syncBatchId: createId(),
    inspectionId,
    revision: (inspection.lastSyncedRevision ?? 0) + 1,
    payloadHash,
    payloadSnapshot: payload,
    status: "PENDING",
    attemptCount: 0,
    createdAt: now,
  };

  await db.transaction("rw", db.syncQueue, db.inspections, async () => {
    await db.syncQueue.add(item);
    await db.inspections.update(inspectionId, { status: "READY_TO_SYNC" });
  });
  return item;
}

export function loadGoogleIdentityServices() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("โหลด Google Sign-in ไม่สำเร็จ")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("โหลด Google Sign-in ไม่สำเร็จ"));
    document.head.appendChild(script);
  });
}

export async function requestGoogleAccessToken(clientId: string, selectAccount = false, loginHint?: string) {
  if (!selectAccount && hasValidGoogleAccessToken(clientId) && cachedToken) {
    return cachedToken.accessToken;
  }
  await loadGoogleIdentityServices();
  if (!window.google?.accounts.oauth2) throw new Error("Google Sign-in ยังไม่พร้อมใช้งาน");

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      hint: loginHint,
      callback: (response) => {
        if (response.access_token) {
          cachedToken = {
            clientId,
            accessToken: response.access_token,
            expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
          };
          resolve(response.access_token);
        }
        else {
          const code = response.error || "unknown_token_error";
          const detail = response.error_description ? ` — ${response.error_description}` : "";
          reject(new Error(`Google OAuth token error: ${code}${detail}`));
        }
      },
      error_callback: (error) => {
        const code = error.type || error.error || "unknown_identity_error";
        const detail = error.message || error.error_description;
        reject(new Error(`Google Identity Services error: ${code}${detail ? ` — ${detail}` : ""}`));
      },
    });
    client.requestAccessToken({ prompt: selectAccount ? "select_account" : "" });
  });
}

export async function authorizeGoogleAccount(clientId: string, selectAccount = false, loginHint?: string): Promise<GoogleAccount> {
  const accessToken = await requestGoogleAccessToken(clientId, selectAccount, loginHint);
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("อ่านข้อมูลบัญชี Google ไม่สำเร็จ");
  const profile = await response.json() as { email?: string; name?: string; picture?: string };
  return { accessToken, email: profile.email ?? "บัญชี Google", name: profile.name, picture: profile.picture };
}

export function connectGoogleAccount(clientId: string) {
  return authorizeGoogleAccount(clientId, true);
}

export async function listGoogleSpreadsheets(accessToken: string) {
  const params = new URLSearchParams({
    q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    fields: "files(id,name,modifiedTime,webViewLink,capabilities(canEdit))",
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || "อ่านรายการ Google Sheets ไม่สำเร็จ");
  }
  const data = await response.json() as { files?: GoogleSpreadsheet[] };
  return (data.files ?? []).filter((file) => file.capabilities?.canEdit === true);
}

export async function createGoogleSpreadsheet(accessToken: string, title: string) {
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || "สร้าง Google Sheets ไม่สำเร็จ");
  }
  const spreadsheet = await response.json() as { spreadsheetId: string; spreadsheetUrl?: string };
  await ensureSubmissionsSheet(spreadsheet.spreadsheetId, accessToken);
  return {
    id: spreadsheet.spreadsheetId,
    name: title,
    webViewLink: spreadsheet.spreadsheetUrl,
  } satisfies GoogleSpreadsheet;
}

async function sheetsFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) throw new GoogleSheetsPermissionError();
    const message = body?.error?.message || `Google Sheets ตอบกลับด้วยรหัส ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function ensureSubmissionsSheet(spreadsheetId: string, token: string) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metadata = await sheetsFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    `${base}?fields=sheets.properties.title`,
    token,
  );
  const exists = metadata.sheets?.some((sheet) => sheet.properties?.title === SHEET_NAME);
  if (!exists) {
    await sheetsFetch(base + ":batchUpdate", token, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
    });
  }

  const headerRange = encodeURIComponent(`${SHEET_NAME}!1:1`);
  const current = await sheetsFetch<{ values?: string[][] }>(`${base}/values/${headerRange}`, token);
  if (!current.values?.length) {
    await sheetsFetch(`${base}/values/${headerRange}?valueInputOption=RAW`, token, {
      method: "PUT",
      body: JSON.stringify({ values: [sheetHeaders] }),
    });
    return;
  }

  const currentHeaders = current.values[0];
  const isCompatiblePrefix = currentHeaders.every((header, index) => header === sheetHeaders[index]);
  if (!isCompatiblePrefix) {
    throw new Error("หัวตาราง Submissions ไม่ตรงกับเวอร์ชันของแอป กรุณาเลือก Spreadsheet ใหม่");
  }
  if (currentHeaders.length < sheetHeaders.length) {
    await sheetsFetch(`${base}/values/${headerRange}?valueInputOption=RAW`, token, {
      method: "PUT",
      body: JSON.stringify({ values: [sheetHeaders] }),
    });
  }
}

export async function validateGoogleSpreadsheetCompatibility(spreadsheetId: string, token: string) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const metadata = await sheetsFetch<{ sheets?: Array<{ properties?: { title?: string } }> }>(
    `${base}?fields=sheets.properties.title`,
    token,
  );
  const hasSubmissionsSheet = metadata.sheets?.some((sheet) => sheet.properties?.title === SHEET_NAME);
  if (!hasSubmissionsSheet) return;

  const headerRange = encodeURIComponent(`${SHEET_NAME}!1:1`);
  const current = await sheetsFetch<{ values?: string[][] }>(`${base}/values/${headerRange}`, token);
  if (!current.values?.length) return;

  const currentHeaders = current.values[0];
  const isCompatiblePrefix = currentHeaders.every((header, index) => header === sheetHeaders[index]);
  if (!isCompatiblePrefix) {
    throw new Error("ไฟล์นี้มีหัวตาราง Submissions ที่ไม่ตรงกับ PharmaCheck กรุณาเลือกไฟล์อื่นหรือสร้างไฟล์ใหม่");
  }
}

function createSheetRow(item: SyncQueueItem) {
  const { inspection, answers, responsiblePersons } = item.payloadSnapshot;
  const answerMap = new Map(answers.map((answer) => [answer.questionCode, answer]));
  const syncedAt = new Date().toISOString();

  return [
    item.syncBatchId,
    inspection.id,
    item.revision,
    item.payloadHash,
    inspection.schemaVersion,
    inspection.templateVersion,
    inspection.deviceId,
    inspection.inspectionDate,
    inspection.startTime,
    inspection.inspector1,
    inspection.inspector2,
    inspection.licenseNumber,
    inspection.licenseHolderName,
    inspection.operatorName,
    inspection.pharmacyName,
    inspection.address,
    inspection.telephone,
    inspection.fax,
    inspection.mobile,
    JSON.stringify(responsiblePersons),
    ...questions.map((question) => answerMap.get(question.code)?.selectedValue ?? ""),
    "{}",
    "{}",
    inspection.createdAt,
    inspection.updatedAt,
    syncedAt,
    canonicalPayload(item.payloadSnapshot),
    ...SIGNATURE_ROLES.map((role) => {
      const signature = inspection.signatures?.find((entry) => entry.role === role);
      return signature ? JSON.stringify(signature) : "";
    }),
    inspection.deficiencies ?? "",
  ];
}

export async function previewGoogleSheetPull(spreadsheetId: string, token: string): Promise<GooglePullPreview> {
  if (!navigator.onLine) throw new Error("ยังไม่มีอินเทอร์เน็ต ไม่สามารถดึงข้อมูลจาก Google Sheets ได้");

  await ensureSubmissionsSheet(spreadsheetId, token);
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  const range = encodeURIComponent(`${SHEET_NAME}!A:ZZ`);
  const data = await sheetsFetch<{ values?: unknown[][] }>(`${base}/values/${range}`, token);
  const [headers = [], ...rows] = data.values ?? [];
  const inspectionIdIndex = headers.indexOf("inspection_id");
  const revisionIndex = headers.indexOf("revision");
  const syncedAtIndex = headers.indexOf("synced_at");
  const payloadIndex = headers.indexOf("payload_json");

  if ([inspectionIdIndex, revisionIndex, payloadIndex].some((index) => index < 0)) {
    throw new Error("Google Sheets ไม่มีคอลัมน์สำหรับดึงข้อมูลกลับ กรุณาเลือกไฟล์ที่สร้างโดย PharmaCheck");
  }

  const latestByInspection = new Map<string, GooglePullItem>();
  for (const row of rows) {
    const inspectionId = String(row[inspectionIdIndex] ?? "");
    const revision = Number(row[revisionIndex]);
    if (!inspectionId || !Number.isInteger(revision) || revision < 1) continue;

    try {
      const payload = JSON.parse(String(row[payloadIndex] ?? "")) as SubmissionPayload;
      const signatures = SIGNATURE_ROLES.flatMap((role) => {
        const index = headers.indexOf(`signature_${role}_json`);
        if (index < 0 || !row[index]) return [];
        try {
          const signature = JSON.parse(String(row[index]));
          return signature?.role === role ? [signature] : [];
        } catch {
          return [];
        }
      });
      payload.inspection.signatures = signatures.length ? signatures : payload.inspection.signatures ?? [];
      if (
        payload?.inspection?.id !== inspectionId ||
        !Array.isArray(payload.answers) ||
        !Array.isArray(payload.responsiblePersons) ||
        payload.answers.some((answer) => !answer?.id || answer.inspectionId !== inspectionId) ||
        payload.responsiblePersons.some((person) => !person?.id || person.inspectionId !== inspectionId)
      ) continue;

      const item: GooglePullItem = {
        payload,
        revision,
        syncedAt: String(row[syncedAtIndex] ?? payload.exportedAt ?? new Date().toISOString()),
      };
      const current = latestByInspection.get(inspectionId);
      if (!current || item.revision > current.revision || (item.revision === current.revision && item.syncedAt > current.syncedAt)) {
        latestByInspection.set(inspectionId, item);
      }
    } catch {
      // Ignore malformed rows instead of risking corrupt local data.
    }
  }

  const preview: GooglePullPreview = { additions: [], updates: [], conflicts: [], unchanged: 0 };
  for (const item of latestByInspection.values()) {
    const local = await db.inspections.get(item.payload.inspection.id);
    if (!local) {
      preview.additions.push(item);
      continue;
    }

    const lastSyncedRevision = local.lastSyncedRevision ?? 0;
    if (item.revision <= lastSyncedRevision) {
      preview.unchanged += 1;
      continue;
    }

    item.localUpdatedAt = local.updatedAt;
    if (local.status === "SYNCED") preview.updates.push(item);
    else preview.conflicts.push(item);
  }

  return preview;
}

export async function applyGoogleSheetPull(preview: GooglePullPreview) {
  let added = 0;
  let updated = 0;
  let conflicts = preview.conflicts.length;

  await db.transaction("rw", db.inspections, db.answers, db.responsiblePersons, db.syncQueue, async () => {
    for (const [kind, items] of [["add", preview.additions], ["update", preview.updates]] as const) {
      for (const item of items) {
        const inspectionId = item.payload.inspection.id;
        const local = await db.inspections.get(inspectionId);
        if (kind === "add" ? Boolean(local) : !local || local.status !== "SYNCED" || local.updatedAt !== item.localUpdatedAt) {
          conflicts += 1;
          continue;
        }

        const inspection: SubmissionPayload["inspection"] = {
          ...item.payload.inspection,
          status: "SYNCED",
          lastSyncedRevision: item.revision,
          lastSyncedAt: item.syncedAt,
        };
        await db.answers.where("inspectionId").equals(inspectionId).delete();
        await db.responsiblePersons.where("inspectionId").equals(inspectionId).delete();
        await db.syncQueue.where("inspectionId").equals(inspectionId).delete();
        await db.inspections.put(inspection);
        if (item.payload.answers.length) await db.answers.bulkPut(item.payload.answers);
        if (item.payload.responsiblePersons.length) await db.responsiblePersons.bulkPut(item.payload.responsiblePersons);
        if (kind === "add") added += 1;
        else updated += 1;
      }
    }
  });

  return { added, updated, conflicts, unchanged: preview.unchanged };
}

export async function syncQueueItem(item: SyncQueueItem, spreadsheetId: string, token: string) {
  if (!navigator.onLine) throw new Error("ยังไม่มีอินเทอร์เน็ต ข้อมูลยังอยู่ใน iPad");
  const now = new Date().toISOString();
  await db.transaction("rw", db.syncQueue, db.inspections, async () => {
    await db.syncQueue.update(item.id, { status: "SYNCING", attemptCount: item.attemptCount + 1, lastAttemptAt: now });
    await db.inspections.update(item.inspectionId, { status: "SYNCING" });
  });

  try {
    await ensureSubmissionsSheet(spreadsheetId, token);
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const idRange = encodeURIComponent(`${SHEET_NAME}!A2:A`);
    const existing = await sheetsFetch<{ values?: string[][] }>(`${base}/values/${idRange}`, token);
    const duplicate = existing.values?.some((row) => row[0] === item.syncBatchId);
    let updatedRange = `${SHEET_NAME}!existing`;

    if (!duplicate) {
      const range = encodeURIComponent(`${SHEET_NAME}!A:ZZ`);
      const result = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
        `${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        token,
        { method: "POST", body: JSON.stringify({ values: [createSheetRow(item)] }) },
      );
      updatedRange = result.updates?.updatedRange || `${SHEET_NAME}!appended`;
    }

    const syncedAt = new Date().toISOString();
    await db.transaction("rw", db.syncQueue, db.inspections, async () => {
      await db.syncQueue.update(item.id, { status: "SYNCED", syncedAt, googleUpdatedRange: updatedRange, lastError: undefined });
      await db.inspections.update(item.inspectionId, {
        status: "SYNCED",
        lastSyncedRevision: item.revision,
        lastSyncedAt: syncedAt,
      });
    });
    return updatedRange;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ส่งข้อมูลไม่สำเร็จ";
    await db.transaction("rw", db.syncQueue, db.inspections, async () => {
      await db.syncQueue.update(item.id, { status: "ERROR", lastError: message });
      await db.inspections.update(item.inspectionId, { status: "SYNC_ERROR" });
    });
    throw error;
  }
}
