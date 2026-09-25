import { NextRequest, NextResponse } from "next/server";
import { createAttachment, listAttachments, MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { errorResponse } from "@/lib/api";
import type { AttachmentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const attachments = await listAttachments(id);
    return NextResponse.json({ attachments });
  } catch (e) {
    return errorResponse(e, "Failed to load attachments");
  }
}

function toKind(v: unknown): AttachmentKind {
  return v === "diagram" || v === "file" ? v : "image";
}

/**
 * Either:
 *  - application/json { s3Key, filename, kind, caption? } — the file was
 *    already PUT to S3 via /api/uploads, or
 *  - multipart/form-data: file, kind (image|diagram|file), caption? — the
 *    file is stored in Postgres (4 MB limit).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    if (typeof body.s3Key !== "string" || typeof body.filename !== "string") {
      return NextResponse.json({ error: "s3Key and filename are required" }, { status: 400 });
    }
    try {
      const attachment = await createAttachment({
        pageId: id,
        kind: toKind(body.kind),
        filename: body.filename,
        caption: typeof body.caption === "string" ? body.caption : "",
        s3TmpKey: body.s3Key,
      });
      return NextResponse.json({ attachment }, { status: 201 });
    } catch (e) {
      return errorResponse(e, "Failed to save file");
    }
  }

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
  const caption = typeof form.get("caption") === "string" ? (form.get("caption") as string) : "";

  try {
    const attachment = await createAttachment({
      pageId: id,
      kind: toKind(form.get("kind")),
      filename: file.name,
      caption,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Failed to upload file");
  }
}
