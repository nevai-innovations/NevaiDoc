"use client";

import { useRef, useState, type DragEvent } from "react";
import { Check, Copy, Eye, FileUp, ImageIcon, Network, Pencil, Trash2, Upload, X } from "lucide-react";
import { FileIcon, fileLabel } from "@/components/files/FileIcon";
import { useConfirm, useFilePreview, useLightbox, useToast } from "@/components/providers";
import { btn, input, Spinner } from "@/components/ui";
import { api, formatBytes, timeAgo } from "@/lib/client";
import { ANY_ACCEPT, fileTypeOf, SUPPORTED_SUMMARY } from "@/lib/file-types";
import type { Attachment, AttachmentKind } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ACCEPT = ANY_ACCEPT;

const isPicture = (a: Pick<Attachment, "mimeType">) => a.mimeType.startsWith("image/");

/**
 * Validates in the browser first (fast feedback), then uploads. Anything
 * that isn't a picture is always stored as a "file", whatever was requested.
 */
export async function uploadAttachment(
  pageId: string,
  file: File,
  kind: AttachmentKind,
  caption = ""
): Promise<Attachment> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” is larger than 4 MB`);
  const type = fileTypeOf(file.name);
  if (!type) throw new Error(`“${file.name}” isn't a supported type (${SUPPORTED_SUMMARY})`);
  const form = new FormData();
  form.append("file", file);
  form.append("kind", type.category === "image" ? kind : "file");
  form.append("caption", caption);
  const { attachment } = await api<{ attachment: Attachment }>(`/api/pages/${pageId}/attachments`, { form });
  return attachment;
}

/** Markdown that embeds the attachment: an image, or a file card with preview. */
export function attachmentMarkdown(a: Attachment): string {
  if (a.kind === "file") return `[${a.filename.replace(/[[\]]/g, "")}](${a.url})`;
  const alt = (a.caption || a.filename.replace(/\.[a-z0-9]+$/i, "")).replace(/[[\]]/g, "");
  return `![${alt}](${a.url})`;
}

type Filter = "all" | AttachmentKind;

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
  const previewFile = useFilePreview();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AttachmentKind>("file");
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

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
      toast("success", `Uploaded ${ok} file${ok === 1 ? "" : "s"}`);
      onChange();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    upload(e.dataTransfer.files);
  };

  const count = (k: AttachmentKind) => attachments.filter((a) => a.kind === k).length;
  const shown = attachments.filter((a) => filter === "all" || a.kind === filter);
  const pictures = shown.filter(isPicture);

  const open = (a: Attachment) => {
    if (isPicture(a)) {
      openLightbox(
        pictures.map((s) => ({ src: s.url, alt: s.caption || s.filename, caption: s.caption, filename: s.filename })),
        pictures.indexOf(a)
      );
    } else {
      previewFile({ url: a.url, filename: a.filename, mimeType: a.mimeType, size: a.size });
    }
  };

  const kinds: [AttachmentKind, string, typeof Network][] = [
    ["file", "Document / file", FileUp],
    ["diagram", "Architecture diagram", Network],
    ["image", "Image", ImageIcon],
  ];

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
          {uploading ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…` : "Drop files here, or choose files"}
        </p>
        <p className="mt-1 text-xs text-muted">{SUPPORTED_SUMMARY} · up to 4 MB each</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg border border-line bg-white p-0.5 text-sm" role="radiogroup" aria-label="Upload as">
            {kinds.map(([k, label, Icon]) => (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${
                  kind === k ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
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
        {kind !== "file" && (
          <p className="mt-2 text-xs text-muted">Non-image files are always saved as documents/files.</p>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(
            [
              ["all", `All (${attachments.length})`],
              ["file", `Files (${count("file")})`],
              ["diagram", `Diagrams (${count("diagram")})`],
              ["image", `Images (${count("image")})`],
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
          {attachments.length ? "Nothing in this filter." : "No files, images or diagrams uploaded yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <AttachmentCard
              key={a.id}
              attachment={a}
              onOpen={() => open(a)}
              onChanged={onChange}
              onDelete={async () => {
                const what = a.kind === "file" ? "file" : a.kind;
                const ok = await confirm({
                  title: `Delete ${what}?`,
                  message: (
                    <>
                      <strong className="text-slate-900">{a.filename}</strong> will be permanently deleted. Anywhere this
                      document links to or embeds it will stop working. This can&apos;t be undone.
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

const CHECKERBOARD =
  "bg-[linear-gradient(45deg,#f1f4f9_25%,transparent_25%),linear-gradient(-45deg,#f1f4f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f4f9_75%),linear-gradient(-45deg,transparent_75%,#f1f4f9_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]";

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
  const picture = isPicture(a);

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

  const badge =
    a.kind === "diagram"
      ? { label: "Diagram", icon: Network, className: "bg-violet-100 text-violet-700" }
      : a.kind === "image"
        ? { label: "Image", icon: ImageIcon, className: "bg-slate-100 text-slate-700" }
        : { label: fileLabel(a.filename), icon: FileUp, className: "bg-brand-50 text-brand-700" };

  return (
    <li className="group overflow-hidden rounded-xl border border-line bg-white">
      <button
        onClick={onOpen}
        className={`relative flex aspect-[4/3] w-full items-center justify-center ${picture ? `cursor-zoom-in ${CHECKERBOARD}` : "bg-slate-50 hover:bg-slate-100"}`}
        aria-label={`Preview ${a.filename}`}
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.url} alt={a.caption || a.filename} loading="lazy" className="max-h-full max-w-full object-contain p-2" />
        ) : (
          <span className="flex flex-col items-center gap-3">
            <FileIcon filename={a.filename} mimeType={a.mimeType} className="h-16 w-16" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-line">
              <Eye className="h-3.5 w-3.5" /> Preview
            </span>
          </span>
        )}
        <span
          className={`absolute left-2 top-2 inline-flex max-w-[80%] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
        >
          <badge.icon className="h-3 w-3 shrink-0" />
          {badge.label}
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
          <button className={btn.icon} onClick={copy} title="Copy Markdown to embed it in a document" aria-label="Copy Markdown">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </button>
          {picture && (
            <button
              className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => save({ kind: a.kind === "diagram" ? "image" : "diagram" })}
            >
              Mark as {a.kind === "diagram" ? "image" : "diagram"}
            </button>
          )}
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
