import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAttachment, detectFileType, MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { createPage, deletePage } from "@/lib/pages";
import { getSettings } from "@/lib/settings";
import { errorResponse } from "@/lib/api";
import { fileTypeOf } from "@/lib/file-types";

export const dynamic = "force-dynamic";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Uploads a file (PDF, Word, Excel, …) as a new document of its own:
 * multipart/form-data with `file` and optional `folderId`.
 * The document's content links to the file, and the viewer previews it.
 */
export async function POST(request: NextRequest) {
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
  const folderId = typeof form.get("folderId") === "string" && form.get("folderId") ? String(form.get("folderId")) : null;

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) return errorResponse(new Error("EMPTY_FILE"), "");
  if (data.length > MAX_UPLOAD_BYTES) return errorResponse(new Error("FILE_TOO_LARGE"), "");
  // Validate before creating anything, so a rejected file leaves no empty document behind.
  if (!detectFileType(data, file.name)) return errorResponse(new Error("UNSUPPORTED_TYPE"), "");

  const attachmentId = randomUUID();
  const title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim() || file.name;
  const label = fileTypeOf(file.name)?.label ?? "File";
  const safeName = file.name.replace(/[[\]]/g, "");

  let pageId: string | null = null;
  try {
    const { displayName } = await getSettings();
    const page = await createPage({
      title,
      content: `[${safeName}](/api/attachments/${attachmentId})\n`,
      parentId: null,
      folderId,
      description: `${label} · ${formatSize(data.length)}`,
      owner: displayName,
      author: displayName,
    });
    pageId = page.id;
    await createAttachment({ id: attachmentId, pageId, kind: "file", filename: file.name, caption: "", data });
    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    if (pageId) await deletePage(pageId).catch(() => {});
    return errorResponse(e, "Failed to upload file");
  }
}
