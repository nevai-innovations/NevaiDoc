"use client";

import { useState } from "react";
import { ChevronRight, Files, Folder as FolderIcon, FolderOpen, FolderPlus, Inbox, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Menu from "@/components/Menu";
import { btn } from "@/components/ui";
import type { Folder } from "@/lib/types";

export type FolderSelection = "all" | "root" | string;

export default function FolderTree({
  folders,
  selected,
  totalCount,
  unfiledCount,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: Folder[];
  selected: FolderSelection;
  totalCount: number;
  unfiledCount: number;
  onSelect: (s: FolderSelection) => void;
  onCreate: (parentId: string | null) => void;
  onRename: (f: Folder) => void;
  onDelete: (f: Folder) => void;
}) {
  const children = (parentId: string | null) =>
    folders
      .filter((f) => (parentId ? f.parentId === parentId : !f.parentId || !folders.some((p) => p.id === f.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name));

  const special = (key: FolderSelection, label: string, Icon: typeof Files, count: number) => (
    <button
      onClick={() => onSelect(key)}
      aria-current={selected === key ? "true" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium ${
        selected === key ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon className={`h-4 w-4 ${selected === key ? "text-brand-600" : "text-slate-500"}`} />
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="text-xs text-muted">{count}</span>
    </button>
  );

  return (
    <div className="space-y-1">
      {special("all", "All documents", Files, totalCount)}
      {special("root", "Unfiled", Inbox, unfiledCount)}
      <div className="flex items-center justify-between px-2.5 pb-1 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</span>
        <button className={`${btn.icon} h-7 w-7`} onClick={() => onCreate(null)} aria-label="New folder" title="New folder">
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted">No folders yet.</p>
      ) : (
        <ul role="tree" aria-label="Folders">
          {children(null).map((f) => (
            <Node
              key={f.id}
              folder={f}
              depth={0}
              childrenOf={children}
              selected={selected}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Node({
  folder,
  depth,
  childrenOf,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  folder: Folder;
  depth: number;
  childrenOf: (id: string | null) => Folder[];
  selected: FolderSelection;
  onSelect: (s: FolderSelection) => void;
  onCreate: (parentId: string | null) => void;
  onRename: (f: Folder) => void;
  onDelete: (f: Folder) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const kids = childrenOf(folder.id);
  const active = selected === folder.id;
  const Icon = active ? FolderOpen : FolderIcon;

  return (
    <li role="treeitem" aria-expanded={kids.length ? expanded : undefined} aria-selected={active}>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-1 text-sm ${
          active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700 ${
            kids.length ? "" : "invisible"
          }`}
          aria-label={expanded ? "Collapse" : "Expand"}
          tabIndex={kids.length ? 0 : -1}
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <button onClick={() => onSelect(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left font-medium">
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brand-600" : "text-amber-500"}`} />
          <span className="truncate">{folder.name}</span>
        </button>
        <span className="text-xs text-muted group-hover:hidden group-focus-within:hidden">{folder.documentCount || ""}</span>
        <div className="hidden group-hover:block group-focus-within:block">
          <Menu
            label={`Actions for ${folder.name}`}
            triggerClassName={`${btn.icon} h-7 w-7`}
            trigger={<MoreHorizontal className="h-4 w-4" />}
            items={[
              { label: "New sub-folder", icon: <FolderPlus />, onSelect: () => onCreate(folder.id) },
              { label: "Rename", icon: <Pencil />, onSelect: () => onRename(folder) },
              "separator",
              { label: "Delete folder", icon: <Trash2 />, danger: true, onSelect: () => onDelete(folder) },
            ]}
          />
        </div>
      </div>
      {expanded && kids.length > 0 && (
        <ul role="group">
          {kids.map((k) => (
            <Node
              key={k.id}
              folder={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              selected={selected}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
