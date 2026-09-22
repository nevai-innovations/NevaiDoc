import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import type { Attachment, AttachmentKind } from "@/lib/types";

/** Vercel rejects request bodies over 4.5 MB, so stay safely under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

type Row = {
  id: string;
  page_id: string;
  kind: AttachmentKind;
  filename: string;
  mime_type: string;
  size: number;
  caption: string;
  created_at: Date;
};

function toAttachment(r: Row): Attachment {
  return {
    id: r.id,
    pageId: r.page_id,
    kind: r.kind,
    filename: r.filename,
    mimeType: r.mime_type,
    size: r.size,
    caption: r.caption,
    url: `/api/attachments/${r.id}`,
    createdAt: r.created_at.toISOString(),
  };
}

/**
 * Works out the real type from the file's first bytes rather than trusting
 * the browser-supplied Content-Type, so e.g. an HTML file renamed to .png
 * can't be uploaded and later served as something else.
 */
export function sniffImageType(buf: Buffer): (typeof ALLOWED_MIME_TYPES)[number] | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

export async function listAttachments(pageId: string): Promise<Attachment[]> {
  const rows = await query<Row>(
    `SELECT id, page_id, kind, filename, mime_type, size, caption, created_at
     FROM attachments WHERE page_id = $1 ORDER BY created_at DESC`,
    [pageId]
  );
  return rows.map(toAttachment);
}

export async function createAttachment(input: {
  pageId: string;
  kind: AttachmentKind;
  filename: string;
  caption: string;
  data: Buffer;
}): Promise<Attachment> {
  const page = await queryOne("SELECT id FROM pages WHERE id = $1", [input.pageId]);
  if (!page) throw new Error("NOT_FOUND");
  if (input.data.length === 0) throw new Error("EMPTY_FILE");
  if (input.data.length > MAX_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  const mime = sniffImageType(input.data);
  if (!mime) throw new Error("UNSUPPORTED_TYPE");

  const filename = input.filename.replace(/[\\/\r\n\t"]/g, "_").trim().slice(0, 200) || "upload";
  const row = await queryOne<Row>(
    `INSERT INTO attachments (id, page_id, kind, filename, mime_type, size, caption, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, page_id, kind, filename, mime_type, size, caption, created_at`,
    [randomUUID(), input.pageId, input.kind, filename, mime, input.data.length, input.caption.trim().slice(0, 300), input.data]
  );
  return toAttachment(row!);
}

export async function getAttachmentData(
  id: string
): Promise<{ mimeType: string; filename: string; data: Buffer } | null> {
  const row = await queryOne<{ mime_type: string; filename: string; data: Buffer }>(
    "SELECT mime_type, filename, data FROM attachments WHERE id = $1",
    [id]
  );
  return row ? { mimeType: row.mime_type, filename: row.filename, data: row.data } : null;
}

export async function updateAttachment(
  id: string,
  updates: { caption?: string; kind?: AttachmentKind }
): Promise<Attachment> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.caption !== undefined) {
    sets.push(`caption = $${i++}`);
    values.push(updates.caption.trim().slice(0, 300));
  }
  if (updates.kind !== undefined) {
    sets.push(`kind = $${i++}`);
    values.push(updates.kind);
  }
  if (!sets.length) throw new Error("NOTHING_TO_UPDATE");
  values.push(id);
  const row = await queryOne<Row>(
    `UPDATE attachments SET ${sets.join(", ")} WHERE id = $${i}
     RETURNING id, page_id, kind, filename, mime_type, size, caption, created_at`,
    values
  );
  if (!row) throw new Error("NOT_FOUND");
  return toAttachment(row);
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM attachments WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
