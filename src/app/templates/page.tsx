"use client";

import { useState } from "react";
import { FilePlus2, LayoutTemplate, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Menu from "@/components/Menu";
import NewDocumentDialog from "@/components/NewDocumentDialog";
import TemplateDialog, { type TemplateDraft } from "@/components/TemplateDialog";
import { useConfirm, useToast } from "@/components/providers";
import { btn, card, EmptyState, ErrorBanner, PageLoading } from "@/components/ui";
import { api, timeAgo, useFetch } from "@/lib/client";
import type { Template } from "@/lib/types";

const EMPTY: TemplateDraft = { name: "", description: "", category: "General", content: "# Title\n\n" };

export default function TemplatesPage() {
  const { data, error, reload } = useFetch<{ templates: Template[] }>("/api/templates");
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<{ draft: TemplateDraft; n: number } | null>(null);
  const [using, setUsing] = useState<{ id: string; n: number } | null>(null);
  const [category, setCategory] = useState("All");

  const templates = data?.templates ?? [];
  const categories = ["All", ...new Set(templates.map((t) => t.category))];
  const shown = templates.filter((t) => category === "All" || t.category === category);

  const remove = async (t: Template) => {
    const ok = await confirm({
      title: "Delete template?",
      message: (
        <>
          <strong className="text-slate-900">“{t.name}”</strong> will be permanently deleted. Documents already created
          from it are not affected.
        </>
      ),
      confirmLabel: "Delete template",
    });
    if (!ok) return;
    try {
      await api(`/api/templates/${t.id}`, { method: "DELETE" });
      toast("success", "Template deleted");
      reload();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Templates</h1>
          <p className="mt-1 text-sm text-muted">Start documents from a consistent structure.</p>
        </div>
        <button className={btn.primary} onClick={() => setEditing({ draft: EMPTY, n: Date.now() })}>
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {categories.length > 2 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                category === c ? "bg-navy-900 text-white" : "bg-white text-slate-600 ring-1 ring-line hover:bg-slate-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {error && !data ? (
          <ErrorBanner message={error} onRetry={reload} />
        ) : !data ? (
          <PageLoading />
        ) : templates.length === 0 ? (
          <div className={card}>
            <EmptyState
              icon={<LayoutTemplate className="h-6 w-6" />}
              title="No templates yet"
              action={
                <button className={btn.primary} onClick={() => setEditing({ draft: EMPTY, n: Date.now() })}>
                  <Plus className="h-4 w-4" /> New template
                </button>
              }
            >
              Create one here, or use “Save as template” on any document.
            </EmptyState>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <li key={t.id} className={`${card} flex flex-col p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-600">
                    <LayoutTemplate className="h-5 w-5" />
                  </span>
                  <Menu
                    label={`Actions for ${t.name}`}
                    triggerClassName={btn.icon}
                    trigger={<MoreHorizontal className="h-5 w-5" />}
                    items={[
                      {
                        label: "Edit template",
                        icon: <Pencil />,
                        onSelect: () => setEditing({ draft: t, n: Date.now() }),
                      },
                      "separator",
                      { label: "Delete template", icon: <Trash2 />, danger: true, onSelect: () => remove(t) },
                    ]}
                  />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">{t.category}</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">{t.name}</h2>
                <p className="mt-1 flex-1 text-sm text-muted">{t.description || "No description."}</p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">Updated {timeAgo(t.updatedAt)}</span>
                  <button className={btn.secondary} onClick={() => setUsing({ id: t.id, n: Date.now() })}>
                    <FilePlus2 className="h-4 w-4" /> Use template
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <TemplateDialog
          key={editing.n}
          initial={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {using && <NewDocumentDialog key={using.n} open onClose={() => setUsing(null)} templateId={using.id} />}
    </div>
  );
}
