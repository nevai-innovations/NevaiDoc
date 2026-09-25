"use client";

import { api, formatBytes } from "@/lib/client";
import { fileTypeOf, SUPPORTED_SUMMARY } from "@/lib/file-types";
import type { Attachment, AttachmentKind, PageDetail } from "@/lib/types";

type Target = { mode: "db" } | { mode: "s3"; key: string; url: string; headers: Record<string, string> };

export type Progress = (fraction: number) => void;

/** Quick checks in the browser before anything is sent. */
export function checkFile(file: File, maxBytes: number) {
  if (!fileTypeOf(file.name)) throw new Error(`“${file.name}” isn't a supported type (${SUPPORTED_SUMMARY})`);
  if (file.size > maxBytes) throw new Error(`“${file.name}” is larger than ${formatBytes(maxBytes)}`);
  if (file.size === 0) throw new Error(`“${file.name}” is empty`);
}

/** PUT to the presigned S3 URL, reporting progress (fetch can't). */
function putToS3(target: Extract<Target, { mode: "s3" }>, file: File, onProgress?: Progress): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload to file storage failed (${xhr.status}). Please try again.`));
    // A network-level failure here is almost always the bucket's CORS rules.
    xhr.onerror = () => reject(new Error("Couldn't reach file storage (check the S3 bucket's CORS settings)."));
    xhr.send(file);
  });
}

/**
 * Sends the file to wherever it's stored — straight to S3 when configured,
 * otherwise as a multipart body — then calls `finish` with the matching body.
 */
async function send<T>(
  file: File,
  finish: (body: { json: Record<string, unknown> } | { form: FormData }) => Promise<T>,
  fields: Record<string, string>,
  onProgress?: Progress
): Promise<T> {
  const target = await api<Target>("/api/uploads", { body: { filename: file.name, size: file.size } });
  if (target.mode === "s3") {
    await putToS3(target, file, onProgress);
    return finish({ json: { ...fields, s3Key: target.key, filename: file.name } });
  }
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  onProgress?.(0.5);
  const result = await finish({ form });
  onProgress?.(1);
  return result;
}

/** Attaches a file/image/diagram to a document. */
export async function uploadToPage(
  pageId: string,
  file: File,
  kind: AttachmentKind,
  opts: { caption?: string; onProgress?: Progress } = {}
): Promise<Attachment> {
  // Anything that isn't a picture is always stored as a "file".
  const effectiveKind = fileTypeOf(file.name)?.category === "image" ? kind : "file";
  const { attachment } = await send(
    file,
    (b) => api<{ attachment: Attachment }>(`/api/pages/${pageId}/attachments`, "json" in b ? { body: b.json } : { form: b.form }),
    { kind: effectiveKind, caption: opts.caption ?? "" },
    opts.onProgress
  );
  return attachment;
}

/** Uploads a file as a new document of its own (optionally into a folder). */
export async function uploadAsDocument(file: File, folderId: string | null, onProgress?: Progress): Promise<PageDetail> {
  const { page } = await send(
    file,
    (b) => api<{ page: PageDetail }>("/api/pages/upload", "json" in b ? { body: b.json } : { form: b.form }),
    folderId ? { folderId } : {},
    onProgress
  );
  return page;
}
