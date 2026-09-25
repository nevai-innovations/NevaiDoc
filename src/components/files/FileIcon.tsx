"use client";

import { File, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { categoryOf, extensionOf, fileTypeOf, type FileCategory } from "@/lib/file-types";

const ICONS: Record<FileCategory, { icon: typeof File; className: string }> = {
  pdf: { icon: FileText, className: "bg-red-50 text-red-600" },
  spreadsheet: { icon: FileSpreadsheet, className: "bg-emerald-50 text-emerald-600" },
  document: { icon: FileText, className: "bg-brand-50 text-brand-600" },
  presentation: { icon: Presentation, className: "bg-orange-50 text-orange-600" },
  text: { icon: FileText, className: "bg-slate-100 text-slate-600" },
  image: { icon: FileImage, className: "bg-amber-50 text-amber-600" },
  video: { icon: FileVideo, className: "bg-violet-50 text-violet-600" },
  audio: { icon: FileAudio, className: "bg-pink-50 text-pink-600" },
};

export function FileIcon({
  filename,
  mimeType = "",
  className = "h-10 w-10",
}: {
  filename: string;
  mimeType?: string;
  className?: string;
}) {
  const cat = categoryOf(mimeType, filename);
  const { icon: Icon, className: tone } = cat ? ICONS[cat] : { icon: File, className: "bg-slate-100 text-slate-500" };
  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-lg ${tone} ${className}`}>
      <Icon className="h-1/2 w-1/2" />
      <span className="absolute -bottom-1 rounded bg-white px-1 text-[9px] font-bold uppercase leading-tight text-slate-600 shadow-sm ring-1 ring-line">
        {extensionOf(filename) || "file"}
      </span>
    </span>
  );
}

export function fileLabel(filename: string): string {
  return fileTypeOf(filename)?.label ?? "File";
}
