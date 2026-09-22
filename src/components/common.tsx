"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { useConfirm, useToast } from "@/components/providers";
import { api, timeAgo } from "@/lib/client";
import type { ApprovalEvent } from "@/lib/types";

/**
 * Asks for confirmation (spelling out what else goes with it), then deletes
 * the document. Resolves to true if it was deleted.
 */
export function useDeleteDocument() {
  const confirm = useConfirm();
  const toast = useToast();
  return async (doc: { id: string; title: string }): Promise<boolean> => {
    let descendants = 0;
    let attachments = 0;
    try {
      const [detail, files] = await Promise.all([
        api<{ descendantCount: number }>(`/api/pages/${doc.id}`),
        api<{ attachments: unknown[] }>(`/api/pages/${doc.id}/attachments`),
      ]);
      descendants = detail.descendantCount;
      attachments = files.attachments.length;
    } catch {
      // Still let the user decide; the generic warning below applies.
    }
    const extras = [
      descendants ? `${descendants} sub-page${descendants === 1 ? "" : "s"}` : null,
      attachments ? `${attachments} image${attachments === 1 ? "" : "s"}/diagram${attachments === 1 ? "" : "s"}` : null,
      "all version history and review activity",
    ].filter(Boolean);

    const ok = await confirm({
      title: "Delete document?",
      message: (
        <>
          <strong className="text-slate-900">“{doc.title}”</strong> will be permanently deleted, along with{" "}
          {extras.join(", ").replace(/, ([^,]*)$/, " and $1")}. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete document",
    });
    if (!ok) return false;
    try {
      await api(`/api/pages/${doc.id}`, { method: "DELETE" });
      toast("success", `Deleted “${doc.title}”`);
      return true;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Delete failed");
      return false;
    }
  };
}

export function DocIcon() {
  return (
    <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white shadow-sm">
      <FileText className="h-4 w-4" />
    </span>
  );
}

const ACTION_TEXT: Record<ApprovalEvent["action"], string> = {
  submitted: "submitted for review",
  approved: "approved",
  changes_requested: "requested changes on",
  reopened: "moved back to draft",
};

export function ActivityList({ events }: { events: ApprovalEvent[] }) {
  return (
    <ul className="space-y-2.5">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-sm">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
              e.action === "approved"
                ? "bg-emerald-500"
                : e.action === "changes_requested"
                  ? "bg-amber-500"
                  : e.action === "submitted"
                    ? "bg-brand-500"
                    : "bg-slate-400"
            }`}
          />
          <p className="min-w-0 flex-1 text-slate-600">
            <span className="font-medium text-slate-800">{e.actor || "Someone"}</span> {ACTION_TEXT[e.action]}{" "}
            {e.pageTitle ? (
              <Link href={`/docs/${e.pageId}`} className="font-medium text-brand-700 hover:underline">
                {e.pageTitle}
              </Link>
            ) : (
              "this document"
            )}
            {e.comment && <span className="block truncate text-muted">“{e.comment}”</span>}
          </p>
          <span className="shrink-0 whitespace-nowrap text-xs text-muted">{timeAgo(e.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
