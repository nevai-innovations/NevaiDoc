"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, X } from "lucide-react";
import MarkdownView from "@/components/MarkdownView";
import { FileIcon, fileLabel } from "@/components/files/FileIcon";
import { Spinner } from "@/components/ui";
import { formatBytes } from "@/lib/client";
import { categoryOf, extensionOf } from "@/lib/file-types";

export type PreviewFile = { url: string; filename: string; mimeType?: string; size?: number };

const MAX_ROWS = 1000;
const MAX_COLS = 60;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

// ---------- Data loading ----------

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

/** Fetches the file once and runs `parse` on it (both cancelled on unmount). */
function useParsed<T>(url: string, parse: (res: Response) => Promise<T>): Load<T> {
  const [state, setState] = useState<{ url: string; load: Load<T> }>({ url, load: { status: "loading" } });
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "This file no longer exists." : `Couldn't load the file (${res.status}).`);
        return parse(res);
      })
      .then((data) => !cancelled && setState({ url, load: { status: "ready", data } }))
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ url, load: { status: "error", message: e instanceof Error ? e.message : "Couldn't preview this file." } });
        }
      });
    return () => {
      cancelled = true;
    };
    // `parse` is a stable module-level function per viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state.url === url ? state.load : { status: "loading" };
}

function Loading({ label = "Preparing preview…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-60 items-center justify-center gap-2 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

function Unavailable({ file, message }: { file: PreviewFile; message: ReactNode }) {
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <FileIcon filename={file.filename} mimeType={file.mimeType} className="h-16 w-16" />
      <div>
        <p className="font-semibold text-slate-900">{file.filename}</p>
        <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      </div>
      <a href={`${file.url}?download=1`} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        <Download className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

// ---------- Viewers ----------

type Sheet = { name: string; rows: string[][]; totalRows: number; totalCols: number };

async function parseSpreadsheet(res: Response, isCsv: boolean): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const wb = isCsv
    ? XLSX.read(await res.text(), { type: "string", raw: false })
    : XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    const range = ref ? XLSX.utils.decode_range(ref) : null;
    const totalRows = range ? range.e.r - range.s.r + 1 : 0;
    const totalCols = range ? range.e.c - range.s.c + 1 : 0;
    const limited = range
      ? XLSX.utils.encode_range({
          s: range.s,
          e: { r: Math.min(range.e.r, range.s.r + MAX_ROWS - 1), c: Math.min(range.e.c, range.s.c + MAX_COLS - 1) },
        })
      : undefined;
    const rows = limited
      ? XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: true, range: limited })
      : [];
    return { name, rows: rows.map((r) => r.map((c) => String(c ?? ""))), totalRows, totalCols };
  });
}

const parseXlsx = (res: Response) => parseSpreadsheet(res, false);
const parseCsv = (res: Response) => parseSpreadsheet(res, true);

function columnName(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function SpreadsheetViewer({ file, csv }: { file: PreviewFile; csv: boolean }) {
  const load = useParsed(file.url, csv ? parseCsv : parseXlsx);
  const [active, setActive] = useState(0);
  if (load.status === "loading") return <Loading label="Reading spreadsheet…" />;
  if (load.status === "error") return <Unavailable file={file} message={load.message} />;
  const sheets = load.data;
  if (!sheets.length) return <Unavailable file={file} message="This workbook has no sheets." />;
  const sheet = sheets[Math.min(active, sheets.length - 1)];
  const cols = Math.max(0, ...sheet.rows.map((r) => r.length));
  const truncated = sheet.totalRows > MAX_ROWS || sheet.totalCols > MAX_COLS;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="nv-scroll min-h-0 flex-1 overflow-auto">
        {sheet.rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">This sheet is empty.</p>
        ) : (
          <table className="border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 h-7 w-12 border-b border-r border-line bg-slate-100" />
                {Array.from({ length: cols }, (_, c) => (
                  <th
                    key={c}
                    className="sticky top-0 z-10 h-7 min-w-24 border-b border-r border-line bg-slate-100 px-2 text-center text-xs font-medium text-slate-500"
                  >
                    {columnName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className="hover:bg-brand-50/40">
                  <th className="sticky left-0 z-10 border-b border-r border-line bg-slate-50 px-2 text-right text-xs font-medium text-slate-500">
                    {r + 1}
                  </th>
                  {Array.from({ length: cols }, (_, c) => (
                    <td
                      key={c}
                      className={`max-w-80 truncate border-b border-r border-line px-2 py-1 text-slate-800 ${
                        r === 0 ? "font-semibold" : ""
                      } ${/^-?[\d,.]+%?$/.test(row[c] ?? "") ? "text-right tabular-nums" : ""}`}
                      title={row[c] && row[c].length > 40 ? row[c] : undefined}
                    >
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-line bg-slate-50 px-2 py-1.5">
        <div className="nv-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Sheets">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium ${
                i === active ? "bg-white text-emerald-700 shadow-sm ring-1 ring-line" : "text-slate-600 hover:bg-white"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <span className="shrink-0 px-2 text-xs text-muted">
          {sheet.totalRows.toLocaleString()} rows × {sheet.totalCols} cols
          {truncated && ` · showing first ${Math.min(sheet.totalRows, MAX_ROWS)} × ${Math.min(sheet.totalCols, MAX_COLS)}`}
        </span>
      </div>
    </div>
  );
}

async function parseDocx(res: Response): Promise<string> {
  const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([import("mammoth"), import("dompurify")]);
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() });
  // Word files are untrusted input: strip anything executable from the HTML.
  return DOMPurify.sanitize(value, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "button"] });
}

function DocxViewer({ file }: { file: PreviewFile }) {
  const load = useParsed(file.url, parseDocx);
  if (load.status === "loading") return <Loading label="Converting document…" />;
  if (load.status === "error") return <Unavailable file={file} message="This Word document couldn't be previewed. Download it to open it in Word." />;
  return (
    <div className="nv-scroll h-full overflow-auto bg-slate-100 px-3 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-sm bg-white px-6 py-10 shadow-sm ring-1 ring-line sm:px-14">
        {load.data.trim() ? (
          <article
            className="nv-prose prose prose-slate max-w-none"
            // Sanitised with DOMPurify in parseDocx.
            dangerouslySetInnerHTML={{ __html: load.data }}
          />
        ) : (
          <p className="italic text-muted">This document has no text.</p>
        )}
      </div>
    </div>
  );
}

type Slide = { index: number; paragraphs: string[] };

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

async function parsePptx(res: Response): Promise<Slide[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => a.n - b.n);
  const parser = new DOMParser();
  const slides: Slide[] = [];
  for (const { name, n } of slideFiles) {
    const xml = parser.parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const paragraphs = [...xml.getElementsByTagNameNS(DRAWING_NS, "p")]
      .map((p) => [...p.getElementsByTagNameNS(DRAWING_NS, "t")].map((t) => t.textContent ?? "").join(""))
      .map((t) => t.trim())
      .filter(Boolean);
    slides.push({ index: n, paragraphs });
  }
  return slides;
}

function PptxViewer({ file }: { file: PreviewFile }) {
  const load = useParsed(file.url, parsePptx);
  if (load.status === "loading") return <Loading label="Reading slides…" />;
  if (load.status === "error") return <Unavailable file={file} message="This presentation couldn't be previewed. Download it to open it in PowerPoint." />;
  if (!load.data.length) return <Unavailable file={file} message="No slides were found in this presentation." />;
  return (
    <div className="nv-scroll h-full overflow-auto bg-slate-100 px-3 py-6 sm:px-8">
      <p className="mx-auto mb-4 max-w-3xl text-xs text-muted">
        Text outline of {load.data.length} slide{load.data.length === 1 ? "" : "s"}. Download the file to see the full slide design.
      </p>
      <ol className="mx-auto max-w-3xl space-y-4">
        {load.data.map((s) => (
          <li key={s.index} className="aspect-video overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-line">
            <div className="flex h-full flex-col p-6 sm:p-8">
              <span className="text-xs font-semibold text-orange-600">Slide {s.index}</span>
              {s.paragraphs.length ? (
                <>
                  <h3 className="mt-2 text-lg font-bold text-slate-900 sm:text-xl">{s.paragraphs[0]}</h3>
                  <ul className="nv-scroll mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto text-sm text-slate-700">
                    {s.paragraphs.slice(1).map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm italic text-muted">No text on this slide.</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function parseText(res: Response): Promise<{ text: string; truncated: boolean }> {
  const buf = await res.arrayBuffer();
  const truncated = buf.byteLength > MAX_TEXT_BYTES;
  const text = new TextDecoder().decode(truncated ? buf.slice(0, MAX_TEXT_BYTES) : buf);
  return { text, truncated };
}

function TextViewer({ file }: { file: PreviewFile }) {
  const load = useParsed(file.url, parseText);
  const ext = extensionOf(file.filename);
  const pretty = useMemo(() => {
    if (load.status !== "ready" || ext !== "json") return null;
    try {
      return JSON.stringify(JSON.parse(load.data.text), null, 2);
    } catch {
      return null;
    }
  }, [load, ext]);
  if (load.status === "loading") return <Loading />;
  if (load.status === "error") return <Unavailable file={file} message={load.message} />;
  return (
    <div className="nv-scroll h-full overflow-auto bg-white">
      {ext === "md" ? (
        <div className="mx-auto max-w-3xl p-6 sm:p-10">
          <MarkdownView content={load.data.text} />
        </div>
      ) : (
        <pre className="min-w-max p-5 font-mono text-[13px] leading-relaxed text-slate-800">{pretty ?? load.data.text}</pre>
      )}
      {load.data.truncated && <p className="px-5 pb-4 text-xs text-muted">Showing the first 2 MB.</p>}
    </div>
  );
}

/** Picks the right viewer for the file. Fills its parent's height. */
export function FilePreviewBody({ file }: { file: PreviewFile }) {
  const cat = categoryOf(file.mimeType ?? "", file.filename);
  const ext = extensionOf(file.filename);

  switch (cat) {
    case "image":
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.url} alt={file.filename} className="max-h-full max-w-full rounded bg-white object-contain shadow" />
        </div>
      );
    case "pdf":
      return (
        <div className="flex h-full flex-col">
          <iframe src={file.url} title={file.filename} className="min-h-0 w-full flex-1 border-0 bg-slate-100" />
          <p className="border-t border-line bg-slate-50 px-3 py-1.5 text-center text-xs text-muted sm:hidden">
            PDF not showing? Some phone browsers can&apos;t display PDFs inline —{" "}
            <a href={file.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">
              open it in a new tab
            </a>
            .
          </p>
        </div>
      );
    case "spreadsheet":
      return <SpreadsheetViewer file={file} csv={ext === "csv"} />;
    case "document":
      return ext === "docx" ? (
        <DocxViewer file={file} />
      ) : (
        <Unavailable file={file} message="Older .doc files can't be previewed in the browser. Download it to open it in Word, or save it as .docx." />
      );
    case "presentation":
      return ext === "pptx" ? (
        <PptxViewer file={file} />
      ) : (
        <Unavailable file={file} message="Older .ppt files can't be previewed in the browser. Download it to open it in PowerPoint, or save it as .pptx." />
      );
    case "text":
      return <TextViewer file={file} />;
    case "video":
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video src={file.url} controls className="max-h-full max-w-full" />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full min-h-60 flex-col items-center justify-center gap-6 bg-slate-50 p-6">
          <FileIcon filename={file.filename} mimeType={file.mimeType} className="h-16 w-16" />
          <audio src={file.url} controls className="w-full max-w-md" />
        </div>
      );
    default:
      return <Unavailable file={file} message="There's no preview for this type of file." />;
  }
}

/** Header with name, type, size and actions — shared by the modal and inline previews. */
export function FilePreviewHeader({
  file,
  onClose,
  extra,
  dark = false,
}: {
  file: PreviewFile;
  onClose?: () => void;
  extra?: ReactNode;
  dark?: boolean;
}) {
  const tool = dark
    ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
    : "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <div className={`flex items-center gap-3 px-3 py-2 sm:px-4 ${dark ? "text-white" : "border-b border-line bg-white"}`}>
      <FileIcon filename={file.filename} mimeType={file.mimeType} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{file.filename}</p>
        <p className={`truncate text-xs ${dark ? "text-white/60" : "text-muted"}`}>
          {fileLabel(file.filename)}
          {file.size !== undefined ? ` · ${formatBytes(file.size)}` : ""}
        </p>
      </div>
      {extra}
      <a className={tool} href={file.url} target="_blank" rel="noreferrer" title="Open in a new tab">
        <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">Open</span>
      </a>
      <a className={tool} href={`${file.url}?download=1`} download={file.filename} title="Download">
        <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
      </a>
      {onClose && (
        <button className={`${tool} px-2`} onClick={onClose} aria-label="Close preview" title="Close (Esc)">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** Full-screen preview. Esc closes. */
export function FilePreviewModal({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="nv-fade-in fixed inset-0 z-[70] flex flex-col bg-navy-950" role="dialog" aria-modal="true" aria-label={`Preview: ${file.filename}`}>
      <FilePreviewHeader file={file} onClose={onClose} dark />
      <div className="min-h-0 flex-1 overflow-hidden bg-white sm:mx-4 sm:mb-4 sm:rounded-lg">
        <FilePreviewBody file={file} />
      </div>
    </div>,
    document.body
  );
}
