"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  FilePlus2,
  FileText,
  History,
  ImageIcon,
  LayoutTemplate,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Menu from "@/components/Menu";
import MarkdownView from "@/components/MarkdownView";
import NewDocumentDialog from "@/components/NewDocumentDialog";
import PageEditor from "@/components/PageEditor";
import TemplateDialog from "@/components/TemplateDialog";
import AttachmentsPanel from "@/components/doc/AttachmentsPanel";
import { ApprovalCard, ReviewTimeline } from "@/components/doc/ReviewPanel";
import VersionHistory from "@/components/doc/VersionHistory";
import { useDeleteDocument } from "@/components/common";
import { btn, card, EmptyState, ErrorBanner, PageLoading, StatusBadge, Tag } from "@/components/ui";
import { formatBytes, formatDate, timeAgo, useFetch, wordCount } from "@/lib/client";
import type { ApprovalEvent, Attachment, Folder, PageFull, PageVersion } from "@/lib/types";

type Tab = "document" | "attachments" | "history" | "activity";

export default function DocumentPage({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deleteDocument = useDeleteDocument();

  const doc = useFetch<{ page: PageFull; descendantCount: number }>(`/api/pages/${id}`);
  const files = useFetch<{ attachments: Attachment[] }>(`/api/pages/${id}/attachments`);
  const versions = useFetch<{ versions: PageVersion[] }>(`/api/pages/${id}/versions`);
  const events = useFetch<{ events: ApprovalEvent[] }>(`/api/pages/${id}/review`);
  const folders = useFetch<{ folders: Folder[] }>("/api/folders");

  const editing = searchParams.get("edit") === "1";
  const [tab, setTab] = useState<Tab>("document");
  const [subPage, setSubPage] = useState(0);
  const [saveTemplate, setSaveTemplate] = useState(0);

  const page = doc.data?.page;
  const attachments = files.data?.attachments ?? [];
  const versionList = versions.data?.versions ?? [];
  const eventList = events.data?.events ?? [];

  const setEditing = (on: boolean) => router.replace(on ? `${pathname}?edit=1` : pathname, { scroll: false });

  const applyPage = (p: PageFull) => {
    doc.setData((prev) => ({ page: p, descendantCount: prev?.descendantCount ?? 0 }));
    versions.reload();
    events.reload();
  };

  if (doc.error && !page) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {doc.error === "Not found" ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Document not found"
            action={
              <Link href="/library" className={btn.primary}>
                Go to the library
              </Link>
            }
          >
            It may have been deleted or the link is wrong.
          </EmptyState>
        ) : (
          <ErrorBanner message={doc.error} onRetry={doc.reload} />
        )}
      </div>
    );
  }
  if (!page) return <PageLoading label="Loading document…" />;

  if (editing) {
    return (
      <PageEditor
        key={page.id}
        page={page}
        folders={folders.data?.folders ?? []}
        onSaved={(p) => {
          applyPage(p);
          folders.reload();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
        onUploaded={files.reload}
      />
    );
  }

  const diagrams = attachments.filter((a) => a.kind === "diagram").length;
  const words = wordCount(page.content);

  const tabs: { id: Tab; label: string; icon: typeof FileText; count?: number }[] = [
    { id: "document", label: "Document", icon: FileText },
    { id: "attachments", label: "Images & diagrams", icon: ImageIcon, count: attachments.length },
    { id: "history", label: "Version history", icon: History, count: versionList.length },
    { id: "activity", label: "Review activity", icon: MessageSquare, count: eventList.length },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/library" className="hover:text-slate-900">
          Document Library
        </Link>
        {page.folderPath.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <Link href={`/library?folder=${f.id}`} className="hover:text-slate-900">
              {f.name}
            </Link>
          </span>
        ))}
        {page.parent && (
          <span className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            <Link href={`/docs/${page.parent.id}`} className="hover:text-slate-900">
              {page.parent.title}
            </Link>
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="truncate font-medium text-slate-700">{page.title}</span>
      </nav>

      <header className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{page.title}</h1>
              <StatusBadge status={page.status} />
            </div>
            {page.description && <p className="mt-2 max-w-3xl text-base text-muted">{page.description}</p>}
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {page.owner && (
                <span>
                  Owner <span className="font-medium text-slate-700">{page.owner}</span>
                </span>
              )}
              <span title={formatDate(page.updatedAt)}>Updated {timeAgo(page.updatedAt)}</span>
              <span>Version {page.version}</span>
              <span>{words.toLocaleString()} words</span>
            </p>
            {page.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {page.tags.map((t) => (
                  <Link key={t} href={`/library?q=${encodeURIComponent(t)}`}>
                    <Tag>#{t}</Tag>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className={btn.primary} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <Menu
              label="More actions"
              triggerClassName={`${btn.secondary} px-2.5`}
              trigger={<MoreHorizontal className="h-5 w-5" />}
              items={[
                { label: "Add sub-page", icon: <FilePlus2 />, onSelect: () => setSubPage((n) => n + 1) },
                { label: "Save as template", icon: <LayoutTemplate />, onSelect: () => setSaveTemplate((n) => n + 1) },
                "separator",
                {
                  label: "Delete document",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: async () => {
                    if (await deleteDocument(page)) {
                      router.push(page.folderId ? `/library?folder=${page.folderId}` : "/library");
                    }
                  },
                },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="nv-scroll -mx-1 mb-4 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Document sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium ${
                  tab === t.id ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`rounded-full px-1.5 text-xs ${tab === t.id ? "bg-white/20" : "bg-slate-200 text-slate-700"}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <section className={`${card} p-5 sm:p-8`} role="tabpanel">
            {tab === "document" &&
              (page.content.trim() ? (
                <MarkdownView content={page.content} />
              ) : (
                <EmptyState
                  icon={<Pencil className="h-6 w-6" />}
                  title="This document is empty"
                  action={
                    <button className={btn.primary} onClick={() => setEditing(true)}>
                      Start writing
                    </button>
                  }
                />
              ))}
            {tab === "attachments" && <AttachmentsPanel pageId={page.id} attachments={attachments} onChange={files.reload} />}
            {tab === "history" && <VersionHistory page={page} versions={versionList} onRestored={applyPage} />}
            {tab === "activity" && <ReviewTimeline events={eventList} />}
          </section>
        </div>

        <aside className="space-y-6">
          <ApprovalCard page={page} onChanged={applyPage} />

          <section className={`${card} p-5`}>
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Detail label="Folder">
                {page.folderPath.length ? (
                  <Link href={`/library?folder=${page.folderId}`} className="text-brand-700 hover:underline">
                    {page.folderPath.map((f) => f.name).join(" / ")}
                  </Link>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Owner">{page.owner || "—"}</Detail>
              <Detail label="Version">v{page.version}</Detail>
              <Detail label="Created">{formatDate(page.createdAt)}</Detail>
              <Detail label="Updated">{formatDate(page.updatedAt)}</Detail>
              <Detail label="Size">
                {formatBytes(new Blob([page.content]).size + attachments.reduce((s, a) => s + a.size, 0))}
              </Detail>
              <Detail label="Attachments">
                {attachments.length ? `${diagrams} diagram${diagrams === 1 ? "" : "s"}, ${attachments.length - diagrams} image${attachments.length - diagrams === 1 ? "" : "s"}` : "None"}
              </Detail>
            </dl>
          </section>

          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Sub-pages</h2>
              <button className="text-sm font-medium text-brand-600 hover:text-brand-800" onClick={() => setSubPage((n) => n + 1)}>
                + Add
              </button>
            </div>
            {page.children.length ? (
              <ul className="mt-2 space-y-0.5">
                {page.children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/docs/${c.id}`} className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{c.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No sub-pages.</p>
            )}
          </section>
        </aside>
      </div>

      <NewDocumentDialog
        key={`sub-${subPage}`}
        open={subPage > 0}
        onClose={() => setSubPage(0)}
        parent={{ id: page.id, title: page.title }}
      />
      {saveTemplate > 0 && (
        <TemplateDialog
          key={`tpl-${saveTemplate}`}
          initial={{ name: page.title, description: page.description, category: "General", content: page.content }}
          onClose={() => setSaveTemplate(0)}
          onSaved={() => setSaveTemplate(0)}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-slate-800">{children}</dd>
    </div>
  );
}
