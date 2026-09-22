import { query } from "@/lib/db";
import type { Settings } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  workspaceName: "Nevai Workspace",
  displayName: "",
};

const KEYS: Record<keyof Settings, string> = {
  workspaceName: "workspace_name",
  displayName: "display_name",
};

export async function getSettings(): Promise<Settings> {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    workspaceName: map.get(KEYS.workspaceName) || DEFAULT_SETTINGS.workspaceName,
    displayName: map.get(KEYS.displayName) ?? DEFAULT_SETTINGS.displayName,
  };
}

export async function updateSettings(updates: Partial<Settings>): Promise<Settings> {
  for (const field of Object.keys(KEYS) as (keyof Settings)[]) {
    const value = updates[field];
    if (typeof value !== "string") continue;
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [KEYS[field], value.trim().slice(0, 100)]
    );
  }
  return getSettings();
}

export type StorageUsage = {
  databaseBytes: number;
  documentBytes: number;
  attachmentBytes: number;
  attachmentCount: number;
};

export async function getStorageUsage(): Promise<StorageUsage> {
  const [row] = await query<{
    database_bytes: string;
    document_bytes: string | null;
    attachment_bytes: string | null;
    attachment_count: number;
  }>(
    `SELECT pg_database_size(current_database()) AS database_bytes,
            (SELECT SUM(octet_length(content)) FROM pages) AS document_bytes,
            (SELECT SUM(size) FROM attachments) AS attachment_bytes,
            (SELECT COUNT(*)::int FROM attachments) AS attachment_count`
  );
  return {
    databaseBytes: Number(row.database_bytes),
    documentBytes: Number(row.document_bytes ?? 0),
    attachmentBytes: Number(row.attachment_bytes ?? 0),
    attachmentCount: row.attachment_count,
  };
}
