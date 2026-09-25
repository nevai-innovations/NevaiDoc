import { query } from "@/lib/db";
import { listPages, recentEvents } from "@/lib/pages";
import type { DashboardData } from "@/lib/types";

export async function getDashboard(): Promise<DashboardData> {
  const [[counts], recent, inReview, activity] = await Promise.all([
    query<{
      documents: number;
      documents_this_week: number;
      folders: number;
      pending: number;
      changes: number;
      attachments: number;
      diagrams: number;
      files: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM pages) AS documents,
         (SELECT COUNT(*)::int FROM pages WHERE created_at > now() - interval '7 days') AS documents_this_week,
         (SELECT COUNT(*)::int FROM folders) AS folders,
         (SELECT COUNT(*)::int FROM pages WHERE status = 'in_review') AS pending,
         (SELECT COUNT(*)::int FROM pages WHERE status = 'changes_requested') AS changes,
         (SELECT COUNT(*)::int FROM attachments) AS attachments,
         (SELECT COUNT(*)::int FROM attachments WHERE kind = 'diagram') AS diagrams,
         (SELECT COUNT(*)::int FROM attachments WHERE kind = 'file') AS files`
    ),
    listPages({ sort: "updated", limit: 6 }),
    listPages({ status: "in_review", sort: "updated", limit: 6 }),
    recentEvents(8),
  ]);

  return {
    stats: {
      documents: counts.documents,
      documentsThisWeek: counts.documents_this_week,
      folders: counts.folders,
      pendingApprovals: counts.pending,
      changesRequested: counts.changes,
      attachments: counts.attachments,
      diagrams: counts.diagrams,
      files: counts.files,
    },
    recent,
    awaitingReview: inReview,
    activity,
  };
}
