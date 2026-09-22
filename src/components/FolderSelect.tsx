"use client";

import type { Folder } from "@/lib/types";
import { input } from "@/components/ui";

/** Folders in tree order, each with its depth, for indented pickers. */
export function flattenFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentId && folders.some((p) => p.id === f.parentId) ? f.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), f]);
  }
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default function FolderSelect({
  folders,
  value,
  onChange,
  id,
  noneLabel = "No folder (top level)",
}: {
  folders: Folder[];
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
  noneLabel?: string;
}) {
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={input}>
      <option value="">{noneLabel}</option>
      {flattenFolders(folders).map(({ folder, depth }) => (
        <option key={folder.id} value={folder.id}>
          {"  ".repeat(depth * 2)}
          {depth ? "└ " : ""}
          {folder.name}
        </option>
      ))}
    </select>
  );
}
