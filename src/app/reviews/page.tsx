"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { ActivityList, DocIcon } from "@/components/common";
import { card, EmptyState, ErrorBanner, PageLoading, STATUS_META, StatusBadge } from "@/components/ui";
import { timeAgo, useFetch } from "@/lib/client";
import type { DashboardData, PageStatus, PageSummary } from "@/lib/types";

const TABS: { status: PageStatus; empty: string }[] = [
  { status: "in_review", empty: "No documents are waiting for review." },
  { status: "changes_requested", empty: "No documents have outstanding change requests." },
  { status: "approved", empty: "No approved documents yet." },
  { status: "draft", empty: "No drafts." },
];

export default function ReviewsPage() {
  const [status, setStatus] = useState<PageStatus>("in_review");
  const all = useFetch<{ pages: PageSummary[] }>("/api/pages?list=1&limit=500");
  const dash = useFetch<DashboardData>("/api/dashboard");

  const pages = all.data?.pages;
  const counts = Object.fromEntries(TABS.map((t) => [t.status, pages?.filter((p) => p.status === t.status).length ?? 0]));
  const shown = pages?.filter((p) => p.status === status) ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reviews &amp; Approvals</h1>
      <p className="mt-1 text-sm text-muted">Track every document through draft, review and approval.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setStatus(t.status)}
            aria-pressed={status === t.status}
            className={`${card} p-4 text-left transition-shadow hover:shadow-md ${
              status === t.status ? "ring-2 ring-brand-500" : ""
            }`}
          >
            <StatusBadge status={t.status} />
            <p className="mt-2 text-2xl font-bold text-slate-900">{pages ? counts[t.status] : "–"}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className={`${card} p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-slate-900">{STATUS_META[status].label}</h2>
          {all.error && !pages ? (
            <div className="mt-4">
              <ErrorBanner message={all.error} onRetry={all.reload} />
            </div>
          ) : !pages ? (
            <PageLoading />
          ) : shown.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nothing here">
              {TABS.find((t) => t.status === status)!.empty}
            </EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link href={`/docs/${p.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-slate-50">
                    <DocIcon />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{p.title}</p>
                      <p className="truncate text-sm text-muted">
                        {[
                          p.owner && `Owner: ${p.owner}`,
                          p.reviewer && status !== "draft" && `Reviewer: ${p.reviewer}`,
                          p.folderName,
                          `v${p.version}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="hidden whitespace-nowrap text-sm text-muted sm:block">{timeAgo(p.updatedAt)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} h-max p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
          <div className="mt-4">
            {!dash.data ? (
              <PageLoading />
            ) : dash.data.activity.length ? (
              <ActivityList events={dash.data.activity} />
            ) : (
              <p className="text-sm text-muted">No review activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
