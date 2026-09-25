import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import { extensionOf, fileTypeOf, type FileCategory } from "@/lib/file-types";
import type { Attachment, AttachmentKind } from "@/lib/types";

/** Vercel rejects request bodies over 4.5 MB, so stay safely under it. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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

type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";

function sniffImage(buf: Buffer): ImageMime | null {
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
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

function startsWith(buf: Buffer, bytes: number[], offset = 0) {
  return buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
}

/** Plain UTF-8 text: decodes strictly and contains no NUL bytes (i.e. not binary). */
function isUtf8Text(buf: Buffer): boolean {
  if (buf.subarray(0, 65536).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Works out what a file really is from its first bytes and checks that it
 * matches its extension, rather than trusting the browser-supplied
 * Content-Type. E.g. an HTML page renamed to .pdf or .csv is rejected.
 */
export function detectFileType(buf: Buffer, filename: string): { mime: string; category: FileCategory } | null {
  const image = sniffImage(buf);
  if (image) return { mime: image, category: "image" };

  const type = fileTypeOf(filename);
  if (!type || type.category === "image") return null;
  const ext = extensionOf(filename);

  const zip = startsWith(buf, [0x50, 0x4b, 0x03, 0x04]);
  const ole = startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  let ok = false;
  switch (ext) {
    case "pdf":
      ok = buf.subarray(0, 1024).toString("latin1").includes("%PDF-");
      break;
    case "xlsx":
    case "docx":
    case "pptx":
      ok = zip && buf.includes("[Content_Types].xml");
      break;
    case "xls":
    case "doc":
    case "ppt":
      ok = ole;
      break;
    case "mp4":
      ok = buf.subarray(4, 8).toString("latin1") === "ftyp";
      break;
    case "webm":
      ok = startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3]);
      break;
    case "mp3":
      ok = buf.subarray(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
      break;
    case "wav":
      ok = buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WAVE";
      break;
    default:
      // csv, txt, log, md, json, yaml
      ok = type.category === "text" || ext === "csv" ? isUtf8Text(buf) : false;
  }
  return ok ? { mime: type.mime, category: type.category } : null;
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
  /** Optional pre-generated id (lets a caller reference the file before it exists). */
  id?: string;
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
  const detected = detectFileType(input.data, input.filename);
  if (!detected) throw new Error("UNSUPPORTED_TYPE");
  // Images and diagrams are pictures; everything else is stored as a file.
  if (input.kind !== "file" && detected.category !== "image") throw new Error("NOT_AN_IMAGE");
  const mime = detected.mime;

  const filename = input.filename.replace(/[\\/\r\n\t"]/g, "_").trim().slice(0, 200) || "upload";
  const row = await queryOne<Row>(
    `INSERT INTO attachments (id, page_id, kind, filename, mime_type, size, caption, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, page_id, kind, filename, mime_type, size, caption, created_at`,
    [input.id ?? randomUUID(), input.pageId, input.kind, filename, mime, input.data.length, input.caption.trim().slice(0, 300), input.data]
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
    // Only pictures can switch between "image" and "diagram".
    if (updates.kind === "file") throw new Error("NOT_AN_IMAGE");
    const row = await queryOne<{ mime_type: string }>("SELECT mime_type FROM attachments WHERE id = $1", [id]);
    if (!row) throw new Error("NOT_FOUND");
    if (!row.mime_type.startsWith("image/")) throw new Error("NOT_AN_IMAGE");
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
