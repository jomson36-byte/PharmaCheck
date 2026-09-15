export type AnswerValue = 0 | 1 | 2 | "NA" | null;

export type InspectionStatus =
  | "LOCAL_DRAFT"
  | "READY_TO_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "SYNC_ERROR";

export type InspectionSignatureRole = "licensee" | "duty_officer" | "assessor_1" | "assessor_2" | "witness_1" | "witness_2";

export interface InspectionSignature {
  role: InspectionSignatureRole;
  name: string;
  signature: string;
  signedAt: string;
}

export interface Inspection {
  id: string;
  schemaVersion: string;
  templateVersion: string;
  deviceId: string;
  inspectionDate: string;
  startTime: string;
  inspector1: string;
  inspector2: string;
  licenseNumber: string;
  licenseHolderName: string;
  operatorName: string;
  pharmacyName: string;
  address: string;
  telephone: string;
  fax: string;
  mobile: string;
  deficiencies?: string;
  signatures: InspectionSignature[];
  status: InspectionStatus;
  localRevision: number;
  lastSyncedRevision?: number;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

export interface ResponsiblePerson {
  id: string;
  inspectionId: string;
  name: string;
  licenseNumber: string;
  workStartTime: string;
  workEndTime: string;
}

export interface Answer {
  id: string;
  inspectionId: string;
  questionCode: string;
  questionTextSnapshot: string;
  categoryCode: string;
  selectedValue: AnswerValue;
  weightSnapshot: number;
  isCriticalSnapshot: boolean;
  isExcludableSnapshot: boolean;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  syncBatchId: string;
  inspectionId: string;
  revision: number;
  payloadHash: string;
  payloadSnapshot: SubmissionPayload;
  status: "PENDING" | "SYNCING" | "SYNCED" | "ERROR";
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  lastAttemptAt?: string;
  syncedAt?: string;
  googleUpdatedRange?: string;
}

export interface AppSetting {
  key: string;
  value: string;
}

export interface SubmissionPayload {
  inspection: Inspection;
  answers: Answer[];
  responsiblePersons: ResponsiblePerson[];
  exportedAt: string;
}

export interface BackupFile {
  format: "pharmacheck-backup";
  schemaVersion: string;
  exportedAt: string;
  inspections: Inspection[];
  answers: Answer[];
  responsiblePersons: ResponsiblePerson[];
  syncQueue: SyncQueueItem[];
}
