import { NextRequest, NextResponse } from "next/server";
import { createAttachment, listAttachments, MAX_UPLOAD_BYTES } from "@/lib/attachments";
import { errorResponse } from "@/lib/api";

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

/** multipart/form-data: file, kind (image|diagram|file), caption? */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

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
  const requested = form.get("kind");
  const kind = requested === "diagram" || requested === "file" ? requested : "image";
  const caption = typeof form.get("caption") === "string" ? (form.get("caption") as string) : "";

  try {
    const attachment = await createAttachment({
      pageId: id,
      kind,
      filename: file.name,
      caption,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Failed to upload file");
  }
}
