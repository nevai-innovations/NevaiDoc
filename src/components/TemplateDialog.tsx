"use client";

import { useState, type FormEvent } from "react";
import MarkdownView from "@/components/MarkdownView";
import { useToast } from "@/components/providers";
import { btn, Field, input, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import type { Template } from "@/lib/types";

export type TemplateDraft = Pick<Template, "name" | "description" | "category" | "content"> & { id?: string };

/** Create or edit a template. Render with a changing `key` per opening. */
export default function TemplateDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: TemplateDraft;
  onClose: () => void;
  onSaved: (t: Template) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const { template } = await api<{ template: Template }>(
        initial.id ? `/api/templates/${initial.id}` : "/api/templates",
        { method: initial.id ? "PUT" : "POST", body: draft }
      );
      toast("success", initial.id ? "Template saved" : "Template created");
      onSaved(template);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't save the template");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={initial.id ? "Edit template" : "New template"}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="template-form" className={btn.primary} disabled={busy || !draft.name.trim()}>
            {busy && <Spinner />} {initial.id ? "Save template" : "Create template"}
          </button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} maxLength={120} required data-autofocus />
          </Field>
          <Field label="Category">
            <input
              value={draft.category}
              onChange={(e) => set({ category: e.target.value })}
              className={input}
              maxLength={60}
              placeholder="e.g. Engineering"
              list="template-categories"
            />
            <datalist id="template-categories">
              {["Engineering", "Product", "Operations", "General"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Description">
          <input value={draft.description} onChange={(e) => set({ description: e.target.value })} className={input} maxLength={500} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Content (Markdown)</span>
            <div className="inline-flex rounded-lg border border-line bg-slate-50 p-0.5 text-xs">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 font-medium capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {tab === "write" ? (
            <textarea
              value={draft.content}
              onChange={(e) => set({ content: e.target.value })}
              className={`${input} min-h-72 font-mono text-[13px] leading-relaxed`}
              spellCheck={false}
            />
          ) : (
            <div className="min-h-72 rounded-lg border border-line p-4">
              {draft.content.trim() ? <MarkdownView content={draft.content} /> : <p className="italic text-muted">Empty template</p>}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
