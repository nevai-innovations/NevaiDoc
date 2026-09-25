/**
 * Supported upload types, keyed by file extension. Shared by the browser
 * (file pickers, icons, choosing a previewer) and the server (which also
 * checks the file's actual bytes — see detectFileType in attachments.ts).
 */
export type FileCategory =
  | "image"
  | "pdf"
  | "spreadsheet"
  | "document"
  | "presentation"
  | "text"
  | "video"
  | "audio";

export type FileTypeInfo = { mime: string; category: FileCategory; label: string };

export const FILE_TYPES: Record<string, FileTypeInfo> = {
  png: { mime: "image/png", category: "image", label: "PNG image" },
  jpg: { mime: "image/jpeg", category: "image", label: "JPEG image" },
  jpeg: { mime: "image/jpeg", category: "image", label: "JPEG image" },
  gif: { mime: "image/gif", category: "image", label: "GIF image" },
  webp: { mime: "image/webp", category: "image", label: "WebP image" },
  svg: { mime: "image/svg+xml", category: "image", label: "SVG image" },

  pdf: { mime: "application/pdf", category: "pdf", label: "PDF" },

  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "spreadsheet",
    label: "Excel workbook",
  },
  xls: { mime: "application/vnd.ms-excel", category: "spreadsheet", label: "Excel 97-2003 workbook" },
  csv: { mime: "text/csv", category: "spreadsheet", label: "CSV" },

  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
    label: "Word document",
  },
  doc: { mime: "application/msword", category: "document", label: "Word 97-2003 document" },

  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "presentation",
    label: "PowerPoint presentation",
  },
  ppt: { mime: "application/vnd.ms-powerpoint", category: "presentation", label: "PowerPoint 97-2003 presentation" },

  txt: { mime: "text/plain", category: "text", label: "Text file" },
  log: { mime: "text/plain", category: "text", label: "Log file" },
  md: { mime: "text/markdown", category: "text", label: "Markdown" },
  json: { mime: "application/json", category: "text", label: "JSON" },
  yaml: { mime: "text/plain", category: "text", label: "YAML" },
  yml: { mime: "text/plain", category: "text", label: "YAML" },

  mp4: { mime: "video/mp4", category: "video", label: "MP4 video" },
  webm: { mime: "video/webm", category: "video", label: "WebM video" },
  mp3: { mime: "audio/mpeg", category: "audio", label: "MP3 audio" },
  wav: { mime: "audio/wav", category: "audio", label: "WAV audio" },
};

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function fileTypeOf(filename: string): FileTypeInfo | null {
  return FILE_TYPES[extensionOf(filename)] ?? null;
}

/** Category from a stored MIME type, falling back to the filename. */
export function categoryOf(mimeType: string, filename: string): FileCategory | null {
  if (mimeType.startsWith("image/")) return "image";
  const byName = fileTypeOf(filename);
  if (byName) return byName.category;
  return Object.values(FILE_TYPES).find((t) => t.mime === mimeType)?.category ?? null;
}

/** For <input type="file" accept>: any supported type. */
export const ANY_ACCEPT = Object.keys(FILE_TYPES)
  .map((e) => `.${e}`)
  .join(",");

/** For <input type="file" accept>: images only. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

export const SUPPORTED_SUMMARY = "PDF, Word, Excel, CSV, PowerPoint, images, text, MP4 and MP3";
