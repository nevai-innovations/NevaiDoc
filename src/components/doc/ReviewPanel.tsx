"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, MessageSquareWarning, Send, Undo2 } from "lucide-react";
import { useSettings, useToast } from "@/components/providers";
import { btn, card, Field, input, Modal, Spinner, StatusBadge } from "@/components/ui";
import { api, formatDate, timeAgo } from "@/lib/client";
import type { ApprovalEvent, PageFull } from "@/lib/types";

type Action = "submit" | "approve" | "request_changes" | "withdraw";

const ACTION_UI: Record<Action, { title: string; confirm: string; commentLabel: string; required?: boolean }> = {
  submit: { title: "Submit for review", confirm: "Submit", commentLabel: "Note for the reviewer (optional)" },
  approve: { title: "Approve document", confirm: "Approve", commentLabel: "Comment (optional)" },
  request_changes: {
    title: "Request changes",
    confirm: "Request changes",
    commentLabel: "What needs to change?",
    required: true,
  },
  withdraw: { title: "Withdraw from review", confirm: "Withdraw", commentLabel: "Reason (optional)" },
};

const STATUS_HELP: Record<PageFull["status"], string> = {
  draft: "This document hasn't been submitted for review.",
  in_review: "Waiting for a reviewer to approve it or request changes.",
  changes_requested: "The reviewer asked for changes. Edit it, then resubmit.",
  approved: "Approved. Editing the text will move it back to draft.",
};

export function ApprovalCard({ page, onChanged }: { page: PageFull; onChanged: (page: PageFull) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [nonce, setNonce] = useState(0);
  const open = (a: Action) => {
    setAction(a);
    setNonce((n) => n + 1);
  };

  return (
    <section className={`${card} p-5`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Approval status</h2>
        <StatusBadge status={page.status} />
      </div>
      <p className="mt-2 text-sm text-muted">{STATUS_HELP[page.status]}</p>
      {page.reviewer && (page.status === "in_review" || page.status === "changes_requested" || page.status === "approved") && (
        <p className="mt-2 text-sm text-slate-700">
          Reviewer: <span className="font-medium">{page.reviewer}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {page.status === "in_review" ? (
          <>
            <button className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} onClick={() => open("approve")}>
              <CheckCircle2 className="h-4 w-4" /> Approve
            </button>
            <button className={btn.secondary} onClick={() => open("request_changes")}>
              <MessageSquareWarning className="h-4 w-4" /> Request changes
            </button>
            <button className={btn.ghost} onClick={() => open("withdraw")}>
              <Undo2 className="h-4 w-4" /> Withdraw
            </button>
          </>
        ) : (
          <button className={page.status === "approved" ? btn.secondary : btn.primary} onClick={() => open("submit")}>
            <Send className="h-4 w-4" /> {page.status === "approved" ? "Request re-review" : "Submit for review"}
          </button>
        )}
      </div>
      {action && (
        <ReviewDialog
          key={nonce}
          page={page}
          action={action}
          onClose={() => setAction(null)}
          onDone={(p) => {
            setAction(null);
            onChanged(p);
          }}
        />
      )}
    </section>
  );
}

function ReviewDialog({
  page,
  action,
  onClose,
  onDone,
}: {
  page: PageFull;
  action: Action;
  onClose: () => void;
  onDone: (page: PageFull) => void;
}) {
  const toast = useToast();
  const { settings } = useSettings();
  const ui = ACTION_UI[action];
  const [comment, setComment] = useState("");
  const [reviewer, setReviewer] = useState(page.reviewer);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (ui.required && !comment.trim()) return;
    setBusy(true);
    try {
      const { page: updated } = await api<{ page: PageFull }>(`/api/pages/${page.id}/review`, {
        body: { action, comment, reviewer },
      });
      toast(
        "success",
        action === "approve"
          ? "Document approved"
          : action === "request_changes"
            ? "Changes requested"
            : action === "withdraw"
              ? "Withdrawn from review"
              : "Submitted for review"
      );
      onDone(updated);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={ui.title}
      description={<>“{page.title}”</>}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="review-form"
            className={action === "approve" ? `${btn.primary} bg-emerald-600 hover:bg-emerald-700` : btn.primary}
            disabled={busy || (ui.required && !comment.trim())}
          >
            {busy && <Spinner />} {ui.confirm}
          </button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit} className="space-y-4">
        {action === "submit" && (
          <Field label="Reviewer" hint="Who should review this document?">
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={input} placeholder="e.g. Priya" maxLength={100} />
          </Field>
        )}
        <Field label={ui.commentLabel}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={`${input} min-h-28`}
            maxLength={2000}
            required={ui.required}
            data-autofocus={action !== "submit" ? true : undefined}
          />
        </Field>
        {!settings.displayName && (
          <p className="text-xs text-muted">Tip: set your name in Settings so it&apos;s recorded against review actions.</p>
        )}
      </form>
    </Modal>
  );
}

const EVENT_TEXT: Record<ApprovalEvent["action"], string> = {
  submitted: "Submitted for review",
  approved: "Approved",
  changes_requested: "Requested changes",
  reopened: "Moved back to draft",
};

const EVENT_DOT: Record<ApprovalEvent["action"], string> = {
  submitted: "bg-brand-500",
  approved: "bg-emerald-500",
  changes_requested: "bg-amber-500",
  reopened: "bg-slate-400",
};

export function ReviewTimeline({ events }: { events: ApprovalEvent[] }) {
  if (!events.length) {
    return <p className="py-6 text-center text-sm text-muted">No review activity yet. Submit the document for review to start.</p>;
  }
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ${EVENT_DOT[e.action]}`} />
          <p className="text-sm text-slate-800">
            <span className="font-semibold">{EVENT_TEXT[e.action]}</span>
            {e.actor && <span className="text-muted"> by {e.actor}</span>}
          </p>
          <p className="text-xs text-muted" title={formatDate(e.createdAt)}>
            {timeAgo(e.createdAt)}
          </p>
          {e.comment && (
            <blockquote className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.comment}</blockquote>
          )}
        </li>
      ))}
    </ol>
  );
}
