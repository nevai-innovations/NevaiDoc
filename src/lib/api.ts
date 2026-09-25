import { NextResponse } from "next/server";

/** Maps the error codes thrown by src/lib/* to HTTP responses. */
const ERRORS: Record<string, [number, string]> = {
  NOT_FOUND: [404, "Not found"],
  PARENT_NOT_FOUND: [400, "Parent not found"],
  FOLDER_NOT_FOUND: [400, "Folder not found"],
  VERSION_NOT_FOUND: [404, "Version not found"],
  INVALID_PARENT: [400, "Cannot move an item under itself or one of its descendants"],
  INVALID_ACTION: [400, "Unknown review action"],
  INVALID_TRANSITION: [409, "That action isn't available for the document's current status"],
  NAME_REQUIRED: [400, "A name is required"],
  NOTHING_TO_UPDATE: [400, "Nothing to update"],
  EMPTY_FILE: [400, "The file is empty"],
  FILE_TOO_LARGE: [413, "Files must be 4 MB or smaller"],
  UNSUPPORTED_TYPE: [
    415,
    "That file type isn't supported, or the file doesn't match its extension. Supported: PDF, Word, Excel, CSV, PowerPoint, images, text, MP4 and MP3.",
  ],
  FILE_TOO_LARGE_S3: [413, "Files must be 100 MB or smaller"],
  INVALID_UPLOAD: [400, "Invalid upload reference"],
  UPLOAD_NOT_FOUND: [400, "The upload didn't reach storage. Please try again."],
  S3_NOT_CONFIGURED: [400, "S3 storage isn't configured"],
  NOT_AN_IMAGE: [415, "Images and diagrams must be PNG, JPEG, GIF, WebP or SVG. Upload other files as a File."],
};

export function errorResponse(e: unknown, fallback: string) {
  const code = e instanceof Error ? e.message : "";
  const known = ERRORS[code];
  if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
  console.error(e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** undefined = not provided, null = explicitly cleared. */
export function nullableId(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return String(v);
}
