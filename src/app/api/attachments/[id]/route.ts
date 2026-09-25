import { NextRequest, NextResponse } from "next/server";
import { deleteAttachment, getAttachmentData, updateAttachment } from "@/lib/attachments";
import { errorResponse, readJson, str } from "@/lib/api";
import { deleteObjectsQuietly, presignDownload, readObject } from "@/lib/s3";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src 'self'; sandbox";

/** Serves the raw file (from Postgres, or via a short-lived link to S3). */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const file = await getAttachmentData(id);
    if (!file) return new NextResponse("Not found", { status: 404 });

    const download = request.nextUrl.searchParams.has("download");
    const isText = file.mimeType.startsWith("text/") || file.mimeType === "application/json";
    const contentType = isText ? `${file.mimeType}; charset=utf-8` : file.mimeType;
    const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`;

    let data: Buffer;
    if (file.storage === "s3") {
      // SVGs are small and can carry scripts: proxy them so they get the
      // sandbox header below (S3 can't send one). Everything else is
      // redirected to a signed S3 link, so big files never pass through Vercel.
      if (file.mimeType !== "image/svg+xml") {
        const url = await presignDownload(file.s3Key, { filename: file.filename, contentType, download });
        return new NextResponse(null, {
          status: 302,
          // Shorter than the signed link's 10-minute lifetime.
          headers: { Location: url, "Cache-Control": "private, max-age=300" },
        });
      }
      data = await readObject(file.s3Key);
    } else {
      data = file.data;
    }

    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      // An attachment's bytes never change after upload (only its caption can).
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": disposition,
    });
    // SVGs can carry scripts. Inside <img> they never run, but this also
    // neuters them (and anything else) if someone opens the file URL
    // directly. PDFs are the exception: a sandboxed document can't use the
    // browser's built-in PDF viewer, which the in-app preview relies on.
    if (file.mimeType !== "application/pdf") headers.set("Content-Security-Policy", SANDBOX_CSP);
    return new NextResponse(new Uint8Array(data), { headers });
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
    const deleted = await deleteAttachment(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (deleted.s3Key) await deleteObjectsQuietly([deleted.s3Key]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Failed to delete attachment");
  }
}
