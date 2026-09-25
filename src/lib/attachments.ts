import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import { extensionOf, fileTypeOf, type FileCategory } from "@/lib/file-types";
import {
  deleteObject,
  objectSize,
  promoteObject,
  readObject,
  S3_MAX_UPLOAD_BYTES,
  safeKeyName,
  TMP_KEY,
} from "@/lib/s3";
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

/**
 * Plain UTF-8 text: decodes strictly and contains no NUL bytes (i.e. not
 * binary). `partial` = buf is only the start of the file, so it may end
 * mid-character.
 */
function isUtf8Text(buf: Buffer, partial = false): boolean {
  if (buf.subarray(0, 65536).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf, { stream: partial });
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
export function detectFileType(
  buf: Buffer,
  filename: string,
  partial = false
): { mime: string; category: FileCategory } | null {
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
      ok = type.category === "text" || ext === "csv" ? isUtf8Text(buf, partial) : false;
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

/** How many leading bytes of an S3 upload are read to check its type. */
const SNIFF_BYTES = 64 * 1024;

type Source = { data: Buffer } | { s3TmpKey: string };

/**
 * Stores an upload, after checking its real type. The bytes come either
 * inline (`data`, kept in Postgres) or from an object the browser already
 * put in S3's tmp/ area (`s3TmpKey`), which is moved to files/ once checked.
 */
export async function createAttachment(
  input: {
    /** Optional pre-generated id (lets a caller reference the file before it exists). */
    id?: string;
    pageId: string;
    kind: AttachmentKind;
    filename: string;
    caption: string;
  } & Source
): Promise<Attachment> {
  const page = await queryOne("SELECT id FROM pages WHERE id = $1", [input.pageId]);
  if (!page) throw new Error("NOT_FOUND");
  const filename = input.filename.replace(/[\\/\r\n\t"]/g, "_").trim().slice(0, 200) || "upload";
  const id = input.id ?? randomUUID();

  const checked = "data" in input ? checkInline(input.data, filename) : await checkS3Upload(input.s3TmpKey, filename);
  const mime = checked.detected.mime;
  // Images and diagrams are pictures; everything else is stored as a file.
  if (input.kind !== "file" && checked.detected.category !== "image") {
    if ("s3TmpKey" in input) await deleteObject(input.s3TmpKey).catch(() => {});
    throw new Error("NOT_AN_IMAGE");
  }

  let s3Key: string | null = null;
  if ("s3TmpKey" in input) {
    s3Key = `files/${id}/${safeKeyName(filename)}`;
    await promoteObject(input.s3TmpKey, s3Key, mime);
  }

  try {
    const row = await queryOne<Row>(
      `INSERT INTO attachments (id, page_id, kind, filename, mime_type, size, caption, data, storage, s3_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, page_id, kind, filename, mime_type, size, caption, created_at`,
      [
        id,
        input.pageId,
        input.kind,
        filename,
        mime,
        checked.size,
        input.caption.trim().slice(0, 300),
        "data" in input ? input.data : null,
        s3Key ? "s3" : "db",
        s3Key,
      ]
    );
    return toAttachment(row!);
  } catch (e) {
    if (s3Key) await deleteObject(s3Key).catch(() => {});
    throw e;
  }
}

function checkInline(data: Buffer, filename: string) {
  if (data.length === 0) throw new Error("EMPTY_FILE");
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  const detected = detectFileType(data, filename);
  if (!detected) throw new Error("UNSUPPORTED_TYPE");
  return { detected, size: data.length };
}

async function checkS3Upload(tmpKey: string, filename: string) {
  if (!TMP_KEY.test(tmpKey)) throw new Error("INVALID_UPLOAD");
  const size = await objectSize(tmpKey);
  if (size === null) throw new Error("UPLOAD_NOT_FOUND");
  const reject = async (code: string) => {
    await deleteObject(tmpKey).catch(() => {});
    return new Error(code);
  };
  if (size === 0) throw await reject("EMPTY_FILE");
  if (size > S3_MAX_UPLOAD_BYTES) throw await reject("FILE_TOO_LARGE_S3");
  const head = await readObject(tmpKey, Math.min(size, SNIFF_BYTES));
  const detected = detectFileType(head, filename, size > head.length);
  if (!detected) throw await reject("UNSUPPORTED_TYPE");
  return { detected, size };
}

export type StoredFile = {
  mimeType: string;
  filename: string;
  size: number;
} & ({ storage: "db"; data: Buffer } | { storage: "s3"; s3Key: string });

export async function getAttachmentData(id: string): Promise<StoredFile | null> {
  const row = await queryOne<{
    mime_type: string;
    filename: string;
    size: number;
    storage: string;
    s3_key: string | null;
    data: Buffer | null;
  }>("SELECT mime_type, filename, size, storage, s3_key, data FROM attachments WHERE id = $1", [id]);
  if (!row) return null;
  const base = { mimeType: row.mime_type, filename: row.filename, size: row.size };
  return row.storage === "s3" && row.s3_key
    ? { ...base, storage: "s3", s3Key: row.s3_key }
    : { ...base, storage: "db", data: row.data ?? Buffer.alloc(0) };
}

/** S3 keys of every attachment on a page and all of its sub-pages (for cleanup on delete). */
export async function s3KeysForPageTree(pageId: string): Promise<string[]> {
  const rows = await query<{ s3_key: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM pages WHERE id = $1
       UNION ALL
       SELECT p.id FROM pages p JOIN tree t ON p.parent_id = t.id
     )
     SELECT a.s3_key FROM attachments a JOIN tree t ON a.page_id = t.id WHERE a.s3_key IS NOT NULL`,
    [pageId]
  );
  return rows.map((r) => r.s3_key);
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

/** Deletes the row; returns its S3 key (for the caller to remove), or false if it didn't exist. */
export async function deleteAttachment(id: string): Promise<{ s3Key: string | null } | false> {
  const row = await queryOne<{ s3_key: string | null }>("DELETE FROM attachments WHERE id = $1 RETURNING s3_key", [id]);
  return row ? { s3Key: row.s3_key } : false;
}
