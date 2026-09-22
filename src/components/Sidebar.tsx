"use client";

import { useState } from "react";
import type { PageTreeNode } from "@/lib/types";

type Props = {
  tree: PageTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string | null) => void;
  onDelete: (id: string) => void;
};

export default function Sidebar({ tree, selectedId, onSelect, onCreateChild, onDelete }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200">
        <span className="text-sm font-semibold text-zinc-700">Pages</span>
        <button
          onClick={() => onCreateChild(null)}
          className="text-xs px-2 py-1 rounded-md bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          title="New top-level page"
        >
          + New
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-1">
        {tree.length === 0 ? (
          <p className="px-3 py-4 text-sm text-zinc-400">
            No pages yet. Click “+ New” to create your first page.
          </p>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))
        )}
      </nav>
    </div>
  );
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onCreateChild,
  onDelete,
}: {
  node: PageTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hover, setHover] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`group flex items-center gap-1 rounded-md pr-1 cursor-pointer text-sm ${
          isSelected ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-600 hover:bg-zinc-50"
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0 ${
            hasChildren ? "" : "invisible"
          }`}
          tabIndex={-1}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <span onClick={() => onSelect(node.id)} className="flex-1 truncate py-1.5">
          {node.title}
        </span>
        {hover && (
          <span className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateChild(node.id);
              }}
              title="Add sub-page"
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200"
            >
              +
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${node.title}" and all of its sub-pages?`)) {
                  onDelete(node.id);
                }
              }}
              title="Delete page"
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-red-600 hover:bg-red-50"
            >
              ×
            </button>
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
