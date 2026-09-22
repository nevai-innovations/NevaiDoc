"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import FolderSelect from "@/components/FolderSelect";
import { useToast } from "@/components/providers";
import { btn, Field, input, Modal, Spinner } from "@/components/ui";
import { api, useFetch } from "@/lib/client";
import type { Folder, PageDetail, Template } from "@/lib/types";

/**
 * Creates a document (optionally from a template or as a sub-page) and opens
 * it in the editor. Render it with a `key` that changes per opening so the
 * form starts fresh each time.
 */
export default function NewDocumentDialog({
  open,
  onClose,
  folderId = null,
  templateId = "",
  parent,
}: {
  open: boolean;
  onClose: () => void;
  folderId?: string | null;
  templateId?: string;
  parent?: { id: string; title: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: folderData } = useFetch<{ folders: Folder[] }>(open ? "/api/folders" : null);
  const { data: templateData } = useFetch<{ templates: Template[] }>(open ? "/api/templates" : null);

  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState<string | null>(folderId);
  const [template, setTemplate] = useState(templateId);
  const [busy, setBusy] = useState(false);

  const templates = templateData?.templates ?? [];
  const chosen = templates.find((t) => t.id === template);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
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
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't create the document");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={parent ? "New sub-page" : "New document"}
      description={parent ? <>Inside “{parent.title}”</> : "Start blank or from a template."}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-doc-form" className={btn.primary} disabled={busy}>
            {busy && <Spinner />} Create &amp; edit
          </button>
        </>
      }
    >
      <form id="new-doc-form" onSubmit={submit} className="space-y-4">
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
        {!parent && (
          <Field label="Folder">
            <FolderSelect folders={folderData?.folders ?? []} value={folder} onChange={setFolder} />
          </Field>
        )}
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
      </form>
    </Modal>
  );
}
