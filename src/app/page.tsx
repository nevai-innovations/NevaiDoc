"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  ImageIcon,
  LayoutTemplate,
  Plus,
} from "lucide-react";
import NewDocumentDialog from "@/components/NewDocumentDialog";
import { useSettings } from "@/components/providers";
import { btn, card, EmptyState, ErrorBanner, PageLoading, StatusBadge } from "@/components/ui";
import { ActivityList, DocIcon } from "@/components/common";
import { formatBytes, greeting, timeAgo, useFetch } from "@/lib/client";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const { settings } = useSettings();
  const { data, error, reload } = useFetch<DashboardData>("/api/dashboard");
  const [newDoc, setNewDoc] = useState(0);

  const name = settings.displayName.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" suppressHydrationWarning>
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="mt-1.5 text-base text-muted">Here&apos;s what&apos;s happening in {settings.workspaceName} today.</p>
        </div>
        <button className={`${btn.primary} px-5 py-2.5 text-base`} onClick={() => setNewDoc((n) => n + 1)}>
          <Plus className="h-5 w-5" /> New document
        </button>
      </div>

      {error && !data && (
        <div className="mt-6">
          <ErrorBanner message={error} onRetry={reload} />
        </div>
      )}

      {!data && !error ? (
        <PageLoading />
      ) : data ? (
        <>
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              href="/library"
              icon={<FileText className="h-6 w-6" />}
              iconClass="bg-brand-50 text-brand-600"
              label="Total Documents"
              value={data.stats.documents}
              sub={`${data.stats.documentsThisWeek} added this week`}
            />
            <StatCard
              href="/library"
              icon={<FolderIcon className="h-6 w-6" />}
              iconClass="bg-violet-50 text-violet-600"
              label="Folders"
              value={data.stats.folders}
              sub="Organise docs by team or topic"
            />
            <StatCard
              href="/reviews"
              icon={<Clock className="h-6 w-6" />}
              iconClass="bg-emerald-50 text-emerald-600"
              label="Pending Approvals"
              value={data.stats.pendingApprovals}
              sub={
                data.stats.changesRequested
                  ? `${data.stats.changesRequested} with changes requested`
                  : "Nothing waiting on changes"
              }
            />
            <StatCard
              href="/library"
              icon={<ImageIcon className="h-6 w-6" />}
              iconClass="bg-amber-50 text-amber-600"
              label="Images & Diagrams"
              value={data.stats.attachments}
              sub={`${data.stats.diagrams} architecture diagram${data.stats.diagrams === 1 ? "" : "s"}`}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className={`${card} p-5 sm:p-6`}>
              <SectionHeader
                icon={<FileText className="h-6 w-6" />}
                title="Document Library"
                subtitle="Recently updated documents"
                href="/library"
              />
              {data.recent.length === 0 ? (
                <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents yet">
                  Create your first document to get started.
                </EmptyState>
              ) : (
                <div className="-mx-2 mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-medium text-muted">
                        <th className="rounded-l-lg px-3 py-2.5 font-medium">Name</th>
                        <th className="px-3 py-2.5 font-medium">Updated</th>
                        <th className="px-3 py-2.5 font-medium">Size</th>
                        <th className="rounded-r-lg px-3 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.recent.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="px-3 py-3">
                            <Link href={`/docs/${p.id}`} className="flex items-center gap-3 font-medium text-slate-800 hover:text-brand-700">
                              <DocIcon />
                              <span className="truncate">{p.title}</span>
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted">{timeAgo(p.updatedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted">{formatBytes(p.size)}</td>
                          <td className="px-3 py-3">
                            <StatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`${card} p-5 sm:p-6`}>
              <SectionHeader
                icon={<CheckCircle2 className="h-6 w-6" />}
                title="Reviews & Approvals"
                subtitle="Documents awaiting review"
                href="/reviews"
              />
              {data.awaitingReview.length === 0 ? (
                <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="All caught up">
                  No documents are waiting for review.
                </EmptyState>
              ) : (
                <ul className="mt-4 divide-y divide-line">
                  {data.awaitingReview.map((p) => (
                    <li key={p.id}>
                      <Link href={`/docs/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-slate-50">
                        <DocIcon />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{p.title}</p>
                          <p className="truncate text-sm text-muted">
                            {p.owner ? `Requested by ${p.owner}` : "Submitted for review"}
                            {p.reviewer ? ` · Reviewer: ${p.reviewer}` : ""}
                          </p>
                        </div>
                        <span className="hidden whitespace-nowrap text-sm text-muted sm:block">{timeAgo(p.updatedAt)}</span>
                        <StatusBadge status={p.status} />
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {data.activity.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent activity</p>
                  <ActivityList events={data.activity.slice(0, 4)} />
                </div>
              )}
            </section>
          </div>

          <section className="mt-6 flex flex-col items-start gap-4 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 via-brand-50/60 to-violet-50 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-slate-900">Keep knowledge moving</h2>
              <p className="text-sm text-muted">
                Organise, version and get approvals — all in one place with {settings.workspaceName}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/templates" className={btn.secondary}>
                <LayoutTemplate className="h-4 w-4" /> Browse templates
              </Link>
              <button className={btn.primary} onClick={() => setNewDoc((n) => n + 1)}>
                New document
              </button>
            </div>
          </section>
        </>
      ) : null}

      <NewDocumentDialog key={newDoc} open={newDoc > 0} onClose={() => setNewDoc(0)} />
    </div>
  );
}

function StatCard({
  href,
  icon,
  iconClass,
  label,
  value,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Link href={href} className={`${card} group flex items-center gap-4 p-5 transition-shadow hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${iconClass}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <span className="block text-3xl font-bold tracking-tight text-slate-900">{value.toLocaleString()}</span>
        <span className="block truncate text-sm text-muted">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-3 text-xl font-semibold text-slate-900">
          <span className="text-slate-800">{icon}</span>
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-800">
        View all <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
