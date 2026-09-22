import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import type { Folder } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  parent_id: string | null;
  document_count: number;
  created_at: Date;
};

function toFolder(r: Row): Folder {
  return {
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    documentCount: r.document_count,
    createdAt: r.created_at.toISOString(),
  };
}

function cleanName(name: string): string {
  const n = name.trim().slice(0, 120);
  if (!n) throw new Error("NAME_REQUIRED");
  return n;
}

export async function listFolders(): Promise<Folder[]> {
  const rows = await query<Row>(
    `SELECT f.id, f.name, f.parent_id, f.created_at,
            (SELECT COUNT(*)::int FROM pages p WHERE p.folder_id = f.id) AS document_count
     FROM folders f
     ORDER BY lower(f.name)`
  );
  return rows.map(toFolder);
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  if (parentId) {
    const parent = await queryOne("SELECT id FROM folders WHERE id = $1", [parentId]);
    if (!parent) throw new Error("PARENT_NOT_FOUND");
  }
  const row = await queryOne<Row>(
    `INSERT INTO folders (id, name, parent_id) VALUES ($1, $2, $3)
     RETURNING id, name, parent_id, created_at, 0 AS document_count`,
    [randomUUID(), cleanName(name), parentId]
  );
  return toFolder(row!);
}

/** True if `candidateAncestorId` is `id` itself or one of its descendants. */
async function isSelfOrDescendant(id: string, candidateAncestorId: string): Promise<boolean> {
  const [{ hit }] = await query<{ hit: boolean }>(
    `WITH RECURSIVE d AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN d ON f.parent_id = d.id
     )
     SELECT EXISTS (SELECT 1 FROM d WHERE id = $2) AS hit`,
    [id, candidateAncestorId]
  );
  return hit;
}

export async function updateFolder(
  id: string,
  updates: { name?: string; parentId?: string | null }
): Promise<Folder> {
  const existing = await queryOne("SELECT id FROM folders WHERE id = $1", [id]);
  if (!existing) throw new Error("NOT_FOUND");

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(cleanName(updates.name));
  }
  if (updates.parentId !== undefined) {
    if (updates.parentId) {
      if (await isSelfOrDescendant(id, updates.parentId)) throw new Error("INVALID_PARENT");
      const parent = await queryOne("SELECT id FROM folders WHERE id = $1", [updates.parentId]);
      if (!parent) throw new Error("PARENT_NOT_FOUND");
    }
    sets.push(`parent_id = $${i++}`);
    values.push(updates.parentId);
  }
  sets.push("updated_at = now()");
  values.push(id);
  await query(`UPDATE folders SET ${sets.join(", ")} WHERE id = $${i}`, values);
  const [folder] = (await listFolders()).filter((f) => f.id === id);
  return folder;
}

/**
 * Deletes a folder and its sub-folders. Documents inside any of them are
 * kept and moved to the top level (folder_id ON DELETE SET NULL).
 */
export async function deleteFolder(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM folders WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
