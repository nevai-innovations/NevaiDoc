"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FilePen, Upload, X } from "lucide-react";
import FolderSelect from "@/components/FolderSelect";
import { FileIcon } from "@/components/files/FileIcon";
import { useSettings, useToast } from "@/components/providers";
import { btn, Field, input, Modal, Spinner } from "@/components/ui";
import { api, formatBytes, useFetch } from "@/lib/client";
import { ANY_ACCEPT, SUPPORTED_SUMMARY } from "@/lib/file-types";
import { checkFile, uploadAsDocument } from "@/lib/upload";
import type { Folder, PageDetail, Template } from "@/lib/types";

/**
 * Creates a document — written (blank or from a template, optionally as a
 * sub-page) or by uploading files — and opens it. Render it with a `key`
 * that changes per opening so the form starts fresh each time.
 */
export default function NewDocumentDialog({
  open,
  onClose,
  folderId = null,
  templateId = "",
  parent,
  initialMode = "write",
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  folderId?: string | null;
  templateId?: string;
  parent?: { id: string; title: string };
  initialMode?: "write" | "upload";
  /** Called after several files were uploaded (a single file opens directly). */
  onUploaded?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { uploads } = useSettings();
  const { data: folderData } = useFetch<{ folders: Folder[] }>(open ? "/api/folders" : null);
  const { data: templateData } = useFetch<{ templates: Template[] }>(open ? "/api/templates" : null);

  // Sub-pages are always written; uploads become top-level documents in a folder.
  const [mode, setMode] = useState<"write" | "upload">(parent ? "write" : initialMode);
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState<string | null>(folderId);
  const [template, setTemplate] = useState(templateId);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const templates = templateData?.templates ?? [];
  const chosen = templates.find((t) => t.id === template);

  const addFiles = (list: FileList | File[]) => {
    const next: File[] = [];
    for (const f of list) {
      try {
        checkFile(f, uploads.maxUploadBytes);
        next.push(f);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : `Can't upload “${f.name}”`);
      }
    }
    setFiles((prev) => [...prev, ...next.filter((n) => !prev.some((p) => p.name === n.name && p.size === n.size))]);
  };

  const createWritten = async () => {
    const { page } = await api<{ page: PageDetail }>("/api/pages", {
      body: {
        title: title.trim(),
        templateId: template || undefined,
        parentId: parent?.id ?? null,
        // Sub-pages inherit their parent's folder on the server.
        ...(parent ? {} : { folderId: folder }),
      },
    });
    onClose();
    router.push(`/docs/${page.id}?edit=1`);
  };

  const uploadFiles = async () => {
    const created: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const page = await uploadAsDocument(file, folder, (f) =>
          setProgress(`${files.length > 1 ? `${i + 1}/${files.length} · ` : ""}${Math.round(f * 100)}%`)
        );
        created.push(page.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : `Couldn't upload “${file.name}”`);
      }
    }
    setProgress(null);
    if (!created.length) {
      setBusy(false);
      return;
    }
    onClose();
    if (created.length === 1) {
      router.push(`/docs/${created[0]}`);
    } else {
      toast("success", `Uploaded ${created.length} documents`);
      onUploaded?.();
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "upload" && !files.length) return;
    setBusy(true);
    try {
      if (mode === "write") await createWritten();
      else await uploadFiles();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't create the document");
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={parent ? "New sub-page" : "New document"}
      description={parent ? <>Inside “{parent.title}”</> : "Write one from scratch or a template, or upload a file."}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="new-doc-form" className={btn.primary} disabled={busy || (mode === "upload" && !files.length)}>
            {busy && <Spinner />}
            {mode === "write"
              ? "Create & edit"
              : busy && progress
                ? `Uploading ${progress}`
                : `Upload${files.length > 1 ? ` ${files.length} files` : ""}`}
          </button>
        </>
      }
    >
      <form id="new-doc-form" onSubmit={submit} className="space-y-4">
        {!parent && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="How to create it">
            {(
              [
                ["write", FilePen, "Write a document"],
                ["upload", Upload, "Upload file"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                disabled={busy}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}

        {mode === "write" ? (
          <Field label="Title" hint={chosen && !title.trim() ? `Defaults to “${chosen.name}”` : undefined}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={input}
              placeholder="e.g. Payments Service Architecture"
              maxLength={200}
              data-autofocus
            />
          </Field>
        ) : (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragOver ? "border-brand-500 bg-brand-50" : "border-line bg-slate-50/60"
              }`}
            >
              <Upload className="mx-auto h-6 w-6 text-brand-600" />
              <p className="mt-2 text-sm font-medium text-slate-800">Drop files here, or</p>
              <button type="button" className={`${btn.secondary} mt-2`} onClick={() => fileInput.current?.click()} disabled={busy} data-autofocus>
                Choose files
              </button>
              <p className="mt-2 text-xs text-muted">
                {SUPPORTED_SUMMARY} · up to {formatBytes(uploads.maxUploadBytes)} each. Each file becomes its own document.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept={ANY_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                {files.map((f) => (
                  <li key={f.name + f.size} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                    <FileIcon filename={f.name} className="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{f.name}</span>
                      <span className="block text-xs text-muted">{formatBytes(f.size)}</span>
                    </span>
                    <button
                      type="button"
                      className={btn.icon}
                      onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                      disabled={busy}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!parent && (
          <Field label="Folder">
            <FolderSelect folders={folderData?.folders ?? []} value={folder} onChange={setFolder} />
          </Field>
        )}

        {mode === "write" && (
          <>
            <Field label="Template">
              <select value={template} onChange={(e) => setTemplate(e.target.value)} className={input}>
                <option value="">Blank document</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category} — {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {chosen?.description && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">{chosen.description}</p>}
          </>
        )}
      </form>
    </Modal>
  );
}
