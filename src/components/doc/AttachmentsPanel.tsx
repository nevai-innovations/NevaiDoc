"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, Copy, ImageIcon, Network, Pencil, Trash2, Upload, X } from "lucide-react";
import { useConfirm, useLightbox, useToast } from "@/components/providers";
import { btn, input, Spinner } from "@/components/ui";
import { api, formatBytes, timeAgo } from "@/lib/client";
import type { Attachment, AttachmentKind } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";

/** Validates in the browser first (fast feedback), then uploads. */
export async function uploadAttachment(
  pageId: string,
  file: File,
  kind: AttachmentKind,
  caption = ""
): Promise<Attachment> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” is larger than 4 MB`);
  if (file.type && !ACCEPT.split(",").includes(file.type)) {
    throw new Error(`“${file.name}” isn't a PNG, JPEG, GIF, WebP or SVG image`);
  }
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  form.append("caption", caption);
  const { attachment } = await api<{ attachment: Attachment }>(`/api/pages/${pageId}/attachments`, { form });
  return attachment;
}

export function attachmentMarkdown(a: Attachment): string {
  const alt = (a.caption || a.filename.replace(/\.[a-z0-9]+$/i, "")).replace(/[[\]]/g, "");
  return `![${alt}](${a.url})`;
}

export default function AttachmentsPanel({
  pageId,
  attachments,
  onChange,
}: {
  pageId: string;
  attachments: Attachment[];
  onChange: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const openLightbox = useLightbox();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AttachmentKind>("diagram");
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<"all" | AttachmentKind>("all");

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setUploading((n) => n + list.length);
    let ok = 0;
    for (const file of list) {
      try {
        await uploadAttachment(pageId, file, kind);
        ok++;
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ok) {
      toast("success", `Uploaded ${ok} ${kind === "diagram" ? "diagram" : "image"}${ok === 1 ? "" : "s"}`);
      onChange();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    upload(e.dataTransfer.files);
  };

  const shown = attachments.filter((a) => filter === "all" || a.kind === filter);
  const diagrams = attachments.filter((a) => a.kind === "diagram").length;

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragOver ? "border-brand-500 bg-brand-50" : "border-line bg-slate-50/60"
        }`}
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
          {uploading ? <Spinner className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
        </div>
        <p className="mt-3 text-sm font-medium text-slate-800">
          {uploading ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…` : "Drop images here, or choose files"}
        </p>
        <p className="mt-1 text-xs text-muted">PNG, JPEG, GIF, WebP or SVG · up to 4 MB each</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-sm" role="radiogroup" aria-label="Upload as">
            {(["diagram", "image"] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${
                  kind === k ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {k === "diagram" ? <Network className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                {k === "diagram" ? "Architecture diagram" : "Image"}
              </button>
            ))}
          </div>
          <button className={btn.primary} onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
            <Upload className="h-4 w-4" /> Choose files
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ["all", `All (${attachments.length})`],
              ["diagram", `Diagrams (${diagrams})`],
              ["image", `Images (${attachments.length - diagrams})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 font-medium ${
                filter === k ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {attachments.length ? "Nothing in this filter." : "No images or diagrams uploaded yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a, i) => (
            <AttachmentCard
              key={a.id}
              attachment={a}
              onOpen={() =>
                openLightbox(
                  shown.map((s) => ({ src: s.url, alt: s.caption || s.filename, caption: s.caption, filename: s.filename })),
                  i
                )
              }
              onChanged={onChange}
              onDelete={async () => {
                const ok = await confirm({
                  title: `Delete ${a.kind === "diagram" ? "diagram" : "image"}?`,
                  message: (
                    <>
                      <strong className="text-slate-900">{a.filename}</strong> will be permanently deleted. Anywhere this
                      document embeds it will show a broken image. This can&apos;t be undone.
                    </>
                  ),
                });
                if (!ok) return;
                try {
                  await api(`/api/attachments/${a.id}`, { method: "DELETE" });
                  toast("success", "Deleted");
                  onChange();
                } catch (e) {
                  toast("error", e instanceof Error ? e.message : "Delete failed");
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentCard({
  attachment: a,
  onOpen,
  onChanged,
  onDelete,
}: {
  attachment: Attachment;
  onOpen: () => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(a.caption);
  const [copied, setCopied] = useState(false);

  const save = async (updates: { caption?: string; kind?: AttachmentKind }) => {
    try {
      await api(`/api/attachments/${a.id}`, { method: "PATCH", body: updates });
      setEditing(false);
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't save");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(attachmentMarkdown(a));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "Couldn't copy to the clipboard");
    }
  };

  return (
    <li className="group overflow-hidden rounded-xl border border-line bg-white">
      <button
        onClick={onOpen}
        className="relative flex aspect-[4/3] w-full cursor-zoom-in items-center justify-center bg-[linear-gradient(45deg,#f1f4f9_25%,transparent_25%),linear-gradient(-45deg,#f1f4f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f4f9_75%),linear-gradient(-45deg,transparent_75%,#f1f4f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]"
        aria-label={`Preview ${a.filename}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.caption || a.filename} loading="lazy" className="max-h-full max-w-full object-contain p-2" />
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            a.kind === "diagram" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
          }`}
        >
          {a.kind === "diagram" ? <Network className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {a.kind === "diagram" ? "Diagram" : "Image"}
        </span>
      </button>
      <div className="space-y-2 p-3">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save({ caption });
            }}
            className="flex gap-1.5"
          >
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className={`${input} py-1.5`}
              placeholder="Caption"
              maxLength={300}
              autoFocus
            />
            <button type="submit" className={btn.icon} aria-label="Save caption">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={btn.icon}
              aria-label="Cancel"
              onClick={() => {
                setCaption(a.caption);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <div>
            <p className="truncate text-sm font-medium text-slate-800" title={a.caption || a.filename}>
              {a.caption || a.filename}
            </p>
            <p className="truncate text-xs text-muted">
              {a.caption ? `${a.filename} · ` : ""}
              {formatBytes(a.size)} · {timeAgo(a.createdAt)}
            </p>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          <button className={btn.icon} onClick={() => setEditing(true)} title="Edit caption" aria-label="Edit caption">
            <Pencil className="h-4 w-4" />
          </button>
          <button className={btn.icon} onClick={copy} title="Copy Markdown to embed it" aria-label="Copy Markdown">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => save({ kind: a.kind === "diagram" ? "image" : "diagram" })}
          >
            Mark as {a.kind === "diagram" ? "image" : "diagram"}
          </button>
          <button
            className={`${btn.icon} ml-auto hover:bg-red-50 hover:text-red-600`}
            onClick={onDelete}
            title="Delete"
            aria-label={`Delete ${a.filename}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
