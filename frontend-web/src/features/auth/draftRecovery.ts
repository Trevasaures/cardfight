/** Only a verified account's explicitly supplied draft may enter this envelope.
 * Legacy unscoped local/session storage is never scanned, claimed, or deleted.
 */
export const RECOVERY_KEY = "cardfight.auth.draft-recovery.v1";
export const RECOVERY_LIFETIME = 30 * 60 * 1000;
const MAX_RECOVERY_BYTES = 64 * 1024;

export type RecoveryEnvelope = {
  schema: 1;
  accountId: string;
  route: string;
  createdAt: number;
  expiresAt: number;
  drafts: { kind: string; recordId: string | null; versionId: string | null; value: unknown }[];
};
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function clearDraftRecovery(storage: RecoveryStorage): boolean {
  try { storage.removeItem(RECOVERY_KEY); return true; } catch { return false; }
}

export function saveDraftRecovery(storage: RecoveryStorage, envelope: RecoveryEnvelope): boolean {
  try {
    if (!envelope.accountId || envelope.schema !== 1 || !envelope.drafts.length || envelope.expiresAt <= envelope.createdAt || envelope.expiresAt - envelope.createdAt > RECOVERY_LIFETIME) return false;
    const serialized = JSON.stringify(envelope);
    if (new TextEncoder().encode(serialized).length > MAX_RECOVERY_BYTES) return false;
    storage.setItem(RECOVERY_KEY, serialized);
    return storage.getItem(RECOVERY_KEY) === serialized;
  } catch { return false; }
}

export function readDraftRecovery(storage: RecoveryStorage, now = Date.now()): RecoveryEnvelope | null {
  try {
    const raw = storage.getItem(RECOVERY_KEY);
    if (!raw || new TextEncoder().encode(raw).length > MAX_RECOVERY_BYTES) return null;
    const value = JSON.parse(raw) as RecoveryEnvelope;
    if (value.schema !== 1 || typeof value.accountId !== "string" || !value.accountId || typeof value.route !== "string" || !value.route.startsWith("/") || value.route.startsWith("//") || !Array.isArray(value.drafts) || !value.drafts.length || !Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) || value.createdAt > now || value.expiresAt <= now || value.expiresAt - value.createdAt > RECOVERY_LIFETIME) {
      clearDraftRecovery(storage);
      return null;
    }
    return value;
  } catch { return null; }
}

export function recoveryAccess(envelope: RecoveryEnvelope | null, verifiedAccountId: string | null): "none" | "same-account" | "different-account" {
  if (!envelope || !verifiedAccountId) return "none";
  return envelope.accountId === verifiedAccountId ? "same-account" : "different-account";
}
