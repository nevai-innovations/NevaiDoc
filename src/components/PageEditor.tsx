"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { PageDetail } from "@/lib/types";

type Props = {
  page: PageDetail;
  onSave: (updates: { title?: string; content?: string }) => Promise<void>;
  onDelete: () => void;
};

export default function PageEditor({ page, onSave, onDelete }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Note: the parent renders this component with `key={page.id}`, so React
  // remounts it (resetting all state above) whenever the selected page
  // changes — no effect needed to sync local state with `page`.

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ title, content });
      setDirty(false);
      setMode("view");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4">
        {mode === "edit" ? (
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="text-xl font-semibold flex-1 outline-none border-b border-transparent focus:border-zinc-300 pb-0.5"
            placeholder="Page title"
          />
        ) : (
          <h1 className="text-xl font-semibold text-zinc-900">{page.title}</h1>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {mode === "view" ? (
            <button
              onClick={() => setMode("edit")}
              className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 hover:bg-zinc-50"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setTitle(page.title);
                  setContent(page.content);
                  setMode("view");
                  setDirty(false);
                }}
                className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="text-sm px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="text-sm px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {mode === "edit" ? (
          <div className="grid grid-cols-2 h-full divide-x divide-zinc-200">
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              placeholder="Write in Markdown…"
              className="w-full h-full resize-none outline-none p-6 font-mono text-sm leading-relaxed"
              spellCheck={false}
            />
            <div className="overflow-y-auto p-6">
              <MarkdownView content={content} />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-8">
            {page.content.trim() ? (
              <MarkdownView content={page.content} />
            ) : (
              <p className="text-zinc-400 italic">
                This page is empty. Click “Edit” to add content.
              </p>
            )}
          </div>
        )}
      </div>

      {mode === "edit" && dirty && (
        <div className="px-6 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
          You have unsaved changes.
        </div>
      )}
    </div>
  );
}

function MarkdownView({ content }: { content: string }) {
  return (
    <article className="prose prose-zinc max-w-none prose-pre:bg-zinc-900 prose-pre:text-zinc-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
