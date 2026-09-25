import { NextRequest, NextResponse } from "next/server";
import { deleteAttachment, getAttachmentData, updateAttachment } from "@/lib/attachments";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Serves the raw file. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const file = await getAttachmentData(id);
    if (!file) return new NextResponse("Not found", { status: 404 });

    const download = request.nextUrl.searchParams.has("download");
    const isText = file.mimeType.startsWith("text/") || file.mimeType === "application/json";
    const headers = new Headers({
      "Content-Type": isText ? `${file.mimeType}; charset=utf-8` : file.mimeType,
      "Content-Length": String(file.data.length),
      // An attachment's bytes never change after upload (only its caption can).
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
    // SVGs can carry scripts. Inside <img> they never run, but this also
    // neuters them (and anything else) if someone opens the file URL
    // directly. PDFs are the exception: a sandboxed document can't use the
    // browser's built-in PDF viewer, which the in-app preview relies on.
    if (file.mimeType !== "application/pdf") {
      headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src 'self'; sandbox");
    }
    return new NextResponse(new Uint8Array(file.data), { headers });
  } catch (e) {
    return errorResponse(e, "Failed to load file");
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  const kind = str(body.kind);
  try {
    const attachment = await updateAttachment(id, {
      caption: str(body.caption),
      kind: kind === "diagram" || kind === "image" || kind === "file" ? kind : undefined,
    });
    return NextResponse.json({ attachment });
  } catch (e) {
    return errorResponse(e, "Failed to update attachment");
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteAttachment(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Failed to delete attachment");
  }
}
