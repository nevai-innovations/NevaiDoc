"use client";

import { useMemo, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import MarkdownView from "@/components/MarkdownView";
import { useConfirm, useToast } from "@/components/providers";
import { btn, Modal, PageLoading, Spinner } from "@/components/ui";
import { api, formatDate, timeAgo, useFetch } from "@/lib/client";
import { diffLines } from "@/lib/diff";
import type { PageFull, PageVersion, PageVersionDetail } from "@/lib/types";

export default function VersionHistory({
  page,
  versions,
  onRestored,
}: {
  page: PageFull;
  versions: PageVersion[];
  onRestored: (page: PageFull) => void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);

  if (!versions.length) {
    return <p className="py-6 text-center text-sm text-muted">No saved versions yet.</p>;
  }

  return (
    <>
      <ol className="relative space-y-1 border-l border-line pl-5">
        {versions.map((v) => {
          const current = v.version === page.version;
          return (
            <li key={v.id} className="relative">
              <span
                className={`absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-white ${
                  current ? "bg-brand-600" : "bg-slate-300"
                }`}
              />
              <button
                onClick={() => setViewing(v.version)}
                className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Version {v.version}</span>
                  {current && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Current</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                  {v.note || (v.title !== page.title ? `Titled “${v.title}”` : "No description")}
                </span>
                <span className="shrink-0 text-xs text-muted" title={formatDate(v.createdAt)}>
                  {v.author ? `${v.author} · ` : ""}
                  {timeAgo(v.createdAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {viewing !== null && (
        <VersionModal
          key={viewing}
          page={page}
          version={viewing}
          onClose={() => setViewing(null)}
          onRestored={(p) => {
            setViewing(null);
            onRestored(p);
          }}
        />
      )}
    </>
  );
}

function VersionModal({
  page,
  version,
  onClose,
  onRestored,
}: {
  page: PageFull;
  version: number;
  onClose: () => void;
  onRestored: (page: PageFull) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { data, error } = useFetch<{ version: PageVersionDetail }>(`/api/pages/${page.id}/versions/${version}`);
  const [tab, setTab] = useState<"preview" | "changes">("preview");
  const [busy, setBusy] = useState(false);
  const v = data?.version;
  const isCurrent = version === page.version;

  const diff = useMemo(() => (v && tab === "changes" ? diffLines(v.content, page.content) : null), [v, tab, page.content]);
  const changed = diff?.filter((d) => d.type !== "same").length ?? 0;

  const restore = async () => {
    const ok = await confirm({
      title: `Restore version ${version}?`,
      message: (
        <>
          The document&apos;s title and content will be replaced with version {version}. Nothing is lost — the current text
          stays in history and the restore is saved as a new version.
        </>
      ),
      confirmLabel: "Restore",
      tone: "primary",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { page: restored } = await api<{ page: PageFull }>(`/api/pages/${page.id}/versions`, {
        body: { restore: version },
      });
      toast("success", `Restored version ${version}`);
      onRestored(restored);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Restore failed");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <History className="h-5 w-5 text-brand-600" /> Version {version}
          {isCurrent && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Current</span>}
        </span>
      }
      description={
        v ? (
          <>
            {v.note || "No description"} · {v.author ? `${v.author}, ` : ""}
            {formatDate(v.createdAt)}
          </>
        ) : undefined
      }
      footer={
        <>
          <button className={btn.secondary} onClick={onClose}>
            Close
          </button>
          {!isCurrent && (
            <button className={btn.primary} onClick={restore} disabled={!v || busy}>
              {busy ? <Spinner /> : <RotateCcw className="h-4 w-4" />} Restore this version
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !v ? (
        <PageLoading />
      ) : (
        <>
          {!isCurrent && (
            <div className="mb-4 inline-flex rounded-lg border border-line bg-slate-50 p-0.5 text-sm">
              {(["preview", "changes"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 font-medium ${
                    tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t === "preview" ? "Preview" : "Compare with current"}
                </button>
              ))}
            </div>
          )}
          {tab === "preview" || isCurrent ? (
            <>
              <h1 className="mb-4 text-2xl font-bold text-slate-900">{v.title}</h1>
              {v.content.trim() ? <MarkdownView content={v.content} /> : <p className="italic text-muted">Empty</p>}
            </>
          ) : diff === null ? (
            <p className="text-sm text-muted">These versions are too large to compare in the browser.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {v.title !== page.title && (
                  <>
                    Title: <del className="text-red-700">{v.title}</del> → <ins className="text-emerald-700 no-underline">{page.title}</ins>
                    {" · "}
                  </>
                )}
                {changed
                  ? `${changed} line${changed === 1 ? "" : "s"} differ. Red lines are in version ${version} only; green lines are in the current version only.`
                  : "The content is identical to the current version."}
              </p>
              <pre className="nv-scroll max-h-[55vh] overflow-auto rounded-lg border border-line bg-slate-50 py-2 text-[13px] leading-6">
                {diff.map((d, i) => (
                  <div
                    key={i}
                    className={`px-3 ${
                      d.type === "add" ? "bg-emerald-50 text-emerald-900" : d.type === "del" ? "bg-red-50 text-red-900" : "text-slate-600"
                    }`}
                  >
                    <span className="mr-3 inline-block w-3 select-none text-slate-400">
                      {d.type === "add" ? "+" : d.type === "del" ? "−" : " "}
                    </span>
                    {d.text || " "}
                  </div>
                ))}
              </pre>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
