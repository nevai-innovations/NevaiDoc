import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJson, str } from "@/lib/api";
import { fileTypeOf } from "@/lib/file-types";
import { presignUpload, S3_MAX_UPLOAD_BYTES, s3Configured, safeKeyName } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Step 1 of an upload. POST { filename, size }
 *  -> { mode: "s3", key, url, headers }  PUT the file to `url` with `headers`,
 *     then send `key` to the attachments / upload endpoint to finish.
 *  -> { mode: "db" }  S3 isn't configured: send the file as multipart instead.
 */
export async function POST(request: NextRequest) {
  if (!s3Configured()) return NextResponse.json({ mode: "db" });

  const body = await readJson(request);
  const filename = (str(body.filename) ?? "").trim();
  const size = Number(body.size);
  const type = fileTypeOf(filename);
  if (!type) return errorResponse(new Error("UNSUPPORTED_TYPE"), "");
  if (!Number.isInteger(size) || size <= 0) return errorResponse(new Error("EMPTY_FILE"), "");
  if (size > S3_MAX_UPLOAD_BYTES) return errorResponse(new Error("FILE_TOO_LARGE_S3"), "");

  try {
    const key = `tmp/${randomUUID()}/${safeKeyName(filename)}`;
    const url = await presignUpload(key, type.mime, size);
    return NextResponse.json({ mode: "s3", key, url, headers: { "Content-Type": type.mime } });
  } catch (e) {
    return errorResponse(e, "Couldn't prepare the upload");
  }
}
