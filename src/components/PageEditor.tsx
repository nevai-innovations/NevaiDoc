"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  Bold,
  ChevronDown,
  Code2,
  Columns2,
  Eye,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  Network,
  Paperclip,
  PenLine,
  Save,
  Table,
} from "lucide-react";
import FolderSelect from "@/components/FolderSelect";
import MarkdownView from "@/components/MarkdownView";
import { attachmentMarkdown, uploadAttachment } from "@/components/doc/AttachmentsPanel";
import { ANY_ACCEPT, IMAGE_ACCEPT } from "@/lib/file-types";
import { useConfirm, useToast } from "@/components/providers";
import { btn, card, Field, input, Spinner } from "@/components/ui";
import { api, wordCount } from "@/lib/client";
import type { AttachmentKind, Folder, PageFull } from "@/lib/types";

type Props = {
  page: PageFull;
  folders: Folder[];
  onSaved: (page: PageFull) => void;
  onCancel: () => void;
  /** Called after an image/diagram upload so the attachments list refreshes. */
  onUploaded: () => void;
};

type Edit = (value: string, start: number, end: number) => { value: string; start: number; end: number };

const wrap =
  (before: string, after = before, placeholder = "text"): Edit =>
  (value, start, end) => {
    const selected = value.slice(start, end) || placeholder;
    return {
      value: value.slice(0, start) + before + selected + after + value.slice(end),
      start: start + before.length,
      end: start + before.length + selected.length,
    };
  };

const linePrefix =
  (prefix: string): Edit =>
  (value, start, end) => {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const block = value.slice(lineStart, end);
    const prefixed = block
      .split("\n")
      .map((l) => prefix + l)
      .join("\n");
    return {
      value: value.slice(0, lineStart) + prefixed + value.slice(end),
      start: lineStart,
      end: lineStart + prefixed.length,
    };
  };

const insertBlock =
  (block: string): Edit =>
  (value, start) => {
    const before = value.slice(0, start);
    const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const text = `${lead}${block}\n`;
    return { value: before + text + value.slice(start), start: start + text.length, end: start + text.length };
  };

export default function PageEditor({ page, folders, onSaved, onCancel, onUploaded }: Props) {
  // Note: the parent renders this component with `key={page.id}`, so React
  // remounts it (resetting all state below) whenever the selected page
  // changes — no effect needed to sync local state with `page`.
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [description, setDescription] = useState(page.description);
  const [folderId, setFolderId] = useState<string | null>(page.folderId);
  const [owner, setOwner] = useState(page.owner);
  const [tagsText, setTagsText] = useState(page.tags.join(", "));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [view, setView] = useState<"write" | "preview" | "split">("split");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const diagramInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const tags = tagsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const dirty =
    title !== page.title ||
    content !== page.content ||
    description !== page.description ||
    folderId !== page.folderId ||
    owner !== page.owner ||
    tags.join("\u0000") !== page.tags.join("\u0000");

  // Warn before closing the tab / reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const apply = (edit: Edit) => {
    const ta = textRef.current;
    const start = ta?.selectionStart ?? content.length;
    const end = ta?.selectionEnd ?? content.length;
    const next = edit(content, start, end);
    setContent(next.value);
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(next.start, next.end);
    });
  };

  const upload = async (files: File[], kind: AttachmentKind) => {
    if (!files.length) return;
    const at = textRef.current?.selectionStart ?? content.length;
    setUploading((n) => n + files.length);
    const snippets: string[] = [];
    for (const file of files) {
      try {
        const a = await uploadAttachment(page.id, file, kind);
        snippets.push(attachmentMarkdown(a));
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (!snippets.length) return;
    let caret = at;
    setContent((value) => {
      const pos = Math.min(at, value.length);
      const before = value.slice(0, pos);
      const lead = before && !before.endsWith("\n") ? "\n\n" : before.endsWith("\n\n") || !before ? "" : "\n";
      const inserted = `${lead}${snippets.join("\n\n")}\n`;
      caret = pos + inserted.length;
      return before + inserted + value.slice(pos);
    });
    // Leave the cursor just after the inserted image(s), so the next insert follows it.
    requestAnimationFrame(() => textRef.current?.setSelectionRange(caret, caret));
    onUploaded();
    toast("success", `Inserted ${snippets.length} file${snippets.length === 1 ? "" : "s"}`);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      upload(files, "image");
    }
  };

  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = [...e.dataTransfer.files];
    if (files.length) {
      e.preventDefault();
      upload(files, "image");
    }
  };

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const { page: saved } = await api<{ page: PageFull }>(`/api/pages/${page.id}`, {
        method: "PUT",
        body: { title, content, description, folderId, owner, tags, note },
      });
      const newVersion = saved.version !== page.version;
      toast("success", newVersion ? `Saved as version ${saved.version}` : "Saved");
      onSaved(saved);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't save");
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard unsaved changes?",
        message: "Your edits to this document haven't been saved and will be lost.",
        confirmLabel: "Discard changes",
      }))
    )
      return;
    onCancel();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  };

  const tool = (label: string, Icon: typeof Bold, edit: Edit) => (
    <button type="button" className={btn.icon} title={label} aria-label={label} onClick={() => apply(edit)}>
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <div className="flex min-h-[calc(100vh-76px)] flex-col" onKeyDown={onKeyDown}>
      <div className="sticky top-16 z-20 border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:top-[76px] sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-xl font-semibold text-slate-900 outline-none hover:border-line focus:border-brand-500 sm:text-2xl"
            placeholder="Document title"
            aria-label="Document title"
            maxLength={200}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${input} w-full py-1.5 sm:w-64`}
              placeholder="Describe your change (optional)"
              aria-label="Version note"
              maxLength={300}
            />
            <button onClick={cancel} className={btn.secondary}>
              Cancel
            </button>
            <button onClick={save} disabled={saving || !title.trim() || !dirty} className={btn.primary} title="Save (Ctrl+S)">
              {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4 sm:px-6">
        <section className={`${card} mb-4`}>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800"
            aria-expanded={showDetails}
          >
            <span>
              Details
              <span className="ml-2 font-normal text-muted">
                {[folders.find((f) => f.id === folderId)?.name ?? "No folder", owner || "No owner", tags.length ? `${tags.length} tag(s)` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>
          {showDetails && (
            <div className="grid grid-cols-1 gap-4 border-t border-line px-4 py-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Summary" hint="Shown in the library and search results.">
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className={input} maxLength={500} placeholder="One line about this document" />
                </Field>
              </div>
              <Field label="Folder">
                <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
              </Field>
              <Field label="Owner">
                <input value={owner} onChange={(e) => setOwner(e.target.value)} className={input} maxLength={100} placeholder="Who maintains this?" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Tags" hint="Separate with commas, e.g. architecture, payments">
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={input} />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className={`${card} flex min-h-[60vh] flex-col overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-slate-50/70 px-2 py-1.5">
            {tool("Bold", Bold, wrap("**"))}
            {tool("Italic", Italic, wrap("*"))}
            {tool("Heading", Heading2, linePrefix("## "))}
            {tool("Link", Link2, wrap("[", "](https://)", "link text"))}
            {tool("Code block", Code2, wrap("```\n", "\n```", "code"))}
            {tool("Bulleted list", List, linePrefix("- "))}
            {tool("Checklist", ListChecks, linePrefix("- [ ] "))}
            {tool("Table", Table, insertBlock("| Column | Column |\n| ------ | ------ |\n| Cell   | Cell   |"))}
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <button type="button" className={`${btn.ghost} px-2 py-1.5`} onClick={() => imageInput.current?.click()} disabled={uploading > 0}>
              <ImageIcon className="h-4 w-4" /> Image
            </button>
            <button type="button" className={`${btn.ghost} px-2 py-1.5`} onClick={() => diagramInput.current?.click()} disabled={uploading > 0}>
              <Network className="h-4 w-4" /> Diagram
            </button>
            <button
              type="button"
              className={`${btn.ghost} px-2 py-1.5`}
              onClick={() => fileInput.current?.click()}
              disabled={uploading > 0}
              title="Attach a PDF, Word, Excel, PowerPoint or other file"
            >
              <Paperclip className="h-4 w-4" /> File
            </button>
            {uploading > 0 && (
              <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted">
                <Spinner className="h-3.5 w-3.5" /> Uploading…
              </span>
            )}
            <input
              ref={imageInput}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                upload([...(e.target.files ?? [])], "image");
                e.target.value = "";
              }}
            />
            <input
              ref={diagramInput}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                upload([...(e.target.files ?? [])], "diagram");
                e.target.value = "";
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept={ANY_ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                upload([...(e.target.files ?? [])], "file");
                e.target.value = "";
              }}
            />
            <div className="ml-auto inline-flex rounded-lg border border-line bg-white p-0.5" role="radiogroup" aria-label="Editor layout">
              {(
                [
                  ["write", PenLine, "Write"],
                  ["split", Columns2, "Split"],
                  ["preview", Eye, "Preview"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                    view === v ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  } ${v === "split" ? "hidden lg:inline-flex" : ""}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`grid flex-1 ${view === "split" ? "grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-line" : "grid-cols-1"}`}
          >
            <textarea
              ref={textRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={onPaste}
              onDrop={onDrop}
              placeholder="Write in Markdown… Paste or drop images and files (PDF, Excel, Word…) to upload them."
              className={`min-h-[55vh] w-full resize-none p-5 font-mono text-sm leading-relaxed text-slate-800 outline-none ${
                view === "preview" ? "hidden" : view === "split" ? "" : ""
              }`}
              spellCheck
              aria-label="Document content (Markdown)"
            />
            <div
              className={`nv-scroll overflow-y-auto p-5 sm:p-6 ${
                view === "write" ? "hidden" : view === "split" ? "hidden lg:block" : ""
              }`}
            >
              {content.trim() ? <MarkdownView content={content} /> : <p className="italic text-muted">Nothing to preview yet.</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50/70 px-4 py-2 text-xs text-muted">
            <span>
              {wordCount(content).toLocaleString()} words · Markdown · <kbd className="font-sans">Ctrl</kbd>+<kbd className="font-sans">S</kbd> to save
            </span>
            {dirty ? <span className="font-medium text-amber-700">Unsaved changes</span> : <span>No changes</span>}
          </div>
        </section>
      </div>
    </div>
  );
}
