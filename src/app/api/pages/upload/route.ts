import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAttachment, detectFileType, MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { createPage, deletePage, updatePage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";
import { errorResponse } from "@/lib/api";
import { fileTypeOf } from "@/lib/file-types";
import { deleteObject, TMP_KEY } from "@/lib/s3";

export const dynamic = "force-dynamic";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Uploads a file (PDF, Word, Excel, …) as a new document of its own. Either:
 *  - application/json { s3Key, filename, folderId? } — already PUT to S3 via /api/uploads, or
 *  - multipart/form-data with `file` and optional `folderId` — stored in Postgres (4 MB limit).
 * The document's content links to the file, and the viewer previews it.
 */
export async function POST(request: NextRequest) {
  let filename: string;
  let folderId: string | null;
  let source: { data: Buffer } | { s3TmpKey: string };

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    if (typeof body.s3Key !== "string" || typeof body.filename !== "string" || !TMP_KEY.test(body.s3Key)) {
      return NextResponse.json({ error: "s3Key and filename are required" }, { status: 400 });
    }
    filename = body.filename;
    folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
    source = { s3TmpKey: body.s3Key };
  } else {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "Files must be 4 MB or smaller" }, { status: 413 });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Expected a multipart form upload" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }
    filename = file.name;
    folderId = typeof form.get("folderId") === "string" && form.get("folderId") ? String(form.get("folderId")) : null;
    const data = Buffer.from(await file.arrayBuffer());
    if (data.length === 0) return errorResponse(new Error("EMPTY_FILE"), "");
    if (data.length > MAX_UPLOAD_BYTES) return errorResponse(new Error("FILE_TOO_LARGE"), "");
    // Validate before creating anything, so a rejected file leaves no empty document behind.
    if (!detectFileType(data, filename)) return errorResponse(new Error("UNSUPPORTED_TYPE"), "");
    source = { data };
  }

  const type = fileTypeOf(filename);
  if (!type) {
    if ("s3TmpKey" in source) await deleteObject(source.s3TmpKey).catch(() => {});
    return errorResponse(new Error("UNSUPPORTED_TYPE"), "");
  }

  const attachmentId = randomUUID();
  const title = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim() || filename;
  const safeName = filename.replace(/[[\]]/g, "");

  let pageId: string | null = null;
  try {
    const { displayName } = await getSettings();
    const page = await createPage({
      title,
      content: `[${safeName}](/api/attachments/${attachmentId})\n`,
      parentId: null,
      folderId,
      description: type.label,
      owner: displayName,
      author: displayName,
    });
    pageId = page.id;
    const attachment = await createAttachment({ id: attachmentId, pageId, kind: "file", filename, caption: "", ...source });
    // The size is only certain once the file has been checked.
    const described = await updatePage(pageId, { description: `${type.label} · ${formatSize(attachment.size)}` });
    return NextResponse.json({ page: described }, { status: 201 });
  } catch (e) {
    // createAttachment has already removed a rejected S3 upload.
    if (pageId) await deletePage(pageId).catch(() => {});
    return errorResponse(e, "Failed to upload file");
  }
}
