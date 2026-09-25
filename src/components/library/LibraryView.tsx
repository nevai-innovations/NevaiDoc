"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import FolderSelect, { flattenFolders } from "@/components/FolderSelect";
import Menu from "@/components/Menu";
import NewDocumentDialog from "@/components/NewDocumentDialog";
import FolderTree, { type FolderSelection } from "@/components/library/FolderTree";
import { DocIcon, useDeleteDocument } from "@/components/common";
import { useConfirm, useSettings, useToast } from "@/components/providers";
import { btn, card, EmptyState, ErrorBanner, Field, input, Modal, PageLoading, Spinner, STATUS_META, StatusBadge, Tag } from "@/components/ui";
import { api, formatBytes, timeAgo, useFetch } from "@/lib/client";
import { ANY_ACCEPT, SUPPORTED_SUMMARY } from "@/lib/file-types";
import { checkFile, uploadAsDocument } from "@/lib/upload";
import { PAGE_STATUSES, type Folder, type PageSummary } from "@/lib/types";

export default function LibraryView() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const deleteDocument = useDeleteDocument();

  const selected: FolderSelection = sp.get("folder") || "all";
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const sort = sp.get("sort") ?? "updated";

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const listUrl = useMemo(() => {
    const p = new URLSearchParams({ list: "1", sort });
    if (q) p.set("q", q);
    else if (selected !== "all") p.set("folder", selected);
    if (status) p.set("status", status);
    return `/api/pages?${p}`;
  }, [q, selected, status, sort]);

  const docs = useFetch<{ pages: PageSummary[] }>(listUrl);
  const folders = useFetch<{ folders: Folder[] }>("/api/folders");
  const allDocs = useFetch<{ pages: PageSummary[] }>("/api/pages?list=1&limit=500");

  const folderList = folders.data?.folders ?? [];
  const currentFolder = folderList.find((f) => f.id === selected) ?? null;
  const subFolders = currentFolder
    ? folderList.filter((f) => f.parentId === currentFolder.id).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const totalCount = allDocs.data?.pages.length ?? 0;
  const unfiledCount = allDocs.data?.pages.filter((p) => !p.folderId).length ?? 0;

  const refresh = () => {
    docs.reload();
    folders.reload();
    allDocs.reload();
  };

  // Folder path for the heading breadcrumb.
  const path: Folder[] = [];
  for (let f = currentFolder; f; f = folderList.find((x) => x.id === f!.parentId) ?? null) {
    path.unshift(f);
    if (path.length > 50) break;
  }

  const [newDoc, setNewDoc] = useState(0);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create"; parentId: string | null } | { mode: "rename"; folder: Folder } | null>(null);
  const [folderDialogKey, setFolderDialogKey] = useState(0);
  const [moving, setMoving] = useState<PageSummary | null>(null);
  const [uploading, setUploading] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const { uploads } = useSettings();
  const [dragOver, setDragOver] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);

  /** Each file becomes its own document (in the current folder) that previews the file. */
  const uploadDocuments = async (files: File[]) => {
    if (!files.length) return;
    setUploading((n) => n + files.length);
    const created: PageSummary["id"][] = [];
    for (const file of files) {
      try {
        checkFile(file, uploads.maxUploadBytes);
        const page = await uploadAsDocument(file, currentFolder?.id ?? null, setProgress);
        created.push(page.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : `Couldn't upload “${file.name}”`);
      } finally {
        setUploading((n) => n - 1);
        setProgress(null);
      }
    }
    if (!created.length) return;
    if (files.length === 1) {
      router.push(`/docs/${created[0]}`);
    } else {
      toast("success", `Uploaded ${created.length} document${created.length === 1 ? "" : "s"}`);
      refresh();
    }
  };

  const openFolderDialog = (d: NonNullable<typeof folderDialog>) => {
    setFolderDialog(d);
    setFolderDialogKey((k) => k + 1);
  };

  const deleteFolder = async (folder: Folder) => {
    const descendants: Folder[] = [];
    const walk = (id: string) =>
      folderList.filter((f) => f.parentId === id).forEach((f) => {
        descendants.push(f);
        walk(f.id);
      });
    walk(folder.id);
    const docCount = [folder, ...descendants].reduce((n, f) => n + f.documentCount, 0);
    const ok = await confirm({
      title: "Delete folder?",
      message: (
        <>
          <strong className="text-slate-900">“{folder.name}”</strong>
          {descendants.length ? ` and its ${descendants.length} sub-folder${descendants.length === 1 ? "" : "s"}` : ""} will be
          deleted.{" "}
          {docCount
            ? `The ${docCount} document${docCount === 1 ? "" : "s"} inside won't be deleted — they'll move to Unfiled.`
            : "It doesn't contain any documents."}
        </>
      ),
      confirmLabel: "Delete folder",
    });
    if (!ok) return;
    try {
      await api(`/api/folders/${folder.id}`, { method: "DELETE" });
      toast("success", `Deleted folder “${folder.name}”`);
      if (selected === folder.id || descendants.some((d) => d.id === selected)) setParams({ folder: null });
      refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Delete failed");
    }
  };

  const heading = q ? `Search results for “${q}”` : selected === "all" ? "All documents" : selected === "root" ? "Unfiled" : currentFolder?.name ?? "Folder";
  const list = docs.data?.pages;
  const showFolderColumn = !!q || selected === "all";

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Document Library</h1>
          <p className="mt-1 text-sm text-muted">Browse folders, search and manage every document.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn.secondary} onClick={() => openFolderDialog({ mode: "create", parentId: currentFolder?.id ?? null })}>
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
          <button
            className={btn.secondary}
            onClick={() => uploadInput.current?.click()}
            disabled={uploading > 0}
            title={`Upload ${SUPPORTED_SUMMARY} files as documents (up to ${formatBytes(uploads.maxUploadBytes)} each)`}
          >
            {uploading ? <Spinner /> : <Upload className="h-4 w-4" />} {uploading ? `Uploading${progress !== null ? ` ${Math.round(progress * 100)}%` : "…"}` : "Upload files"}
          </button>
          <input
            ref={uploadInput}
            type="file"
            accept={ANY_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              uploadDocuments([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button className={btn.primary} onClick={() => setNewDoc((n) => n + 1)}>
            <Plus className="h-4 w-4" /> New document
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className={`${card} h-max p-3 lg:sticky lg:top-[100px]`}>
          <div className="lg:hidden">
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="folder-picker">
              Folder
            </label>
            <select
              id="folder-picker"
              className={input}
              value={selected}
              onChange={(e) => setParams({ folder: e.target.value === "all" ? null : e.target.value, q: null })}
            >
              <option value="all">All documents ({totalCount})</option>
              <option value="root">Unfiled ({unfiledCount})</option>
              {folderList.length > 0 && (
                <optgroup label="Folders">
                  {FolderSelectOptions(folderList)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="hidden lg:block">
            <FolderTree
              folders={folderList}
              selected={q ? "" : selected}
              totalCount={totalCount}
              unfiledCount={unfiledCount}
              onSelect={(s) => setParams({ folder: s === "all" ? null : s, q: null })}
              onCreate={(parentId) => openFolderDialog({ mode: "create", parentId })}
              onRename={(folder) => openFolderDialog({ mode: "rename", folder })}
              onDelete={deleteFolder}
            />
          </div>
        </aside>

        <section
          className="relative min-w-0"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragOver(false);
            uploadDocuments([...e.dataTransfer.files]);
          }}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/90">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <Upload className="h-5 w-5" /> Drop to upload into {currentFolder ? `“${currentFolder.name}”` : "the library"}
              </p>
            </div>
          )}
          <div className={`${card} p-4 sm:p-5`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <SearchBox initial={q} onSearch={(term) => setParams({ q: term || null })} />
              <div className="flex gap-2">
                <select className={`${input} w-auto`} value={status} onChange={(e) => setParams({ status: e.target.value || null })} aria-label="Filter by status">
                  <option value="">Any status</option>
                  {PAGE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
                <select className={`${input} w-auto`} value={sort} onChange={(e) => setParams({ sort: e.target.value === "updated" ? null : e.target.value })} aria-label="Sort">
                  <option value="updated">Recently updated</option>
                  <option value="created">Recently created</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-1 text-sm">
              {path.length > 0 && !q ? (
                <>
                  <button className="text-muted hover:text-slate-900" onClick={() => setParams({ folder: null })}>
                    All documents
                  </button>
                  {path.map((f, i) => (
                    <span key={f.id} className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                      {i === path.length - 1 ? (
                        <span className="font-semibold text-slate-900">{f.name}</span>
                      ) : (
                        <button className="text-muted hover:text-slate-900" onClick={() => setParams({ folder: f.id })}>
                          {f.name}
                        </button>
                      )}
                    </span>
                  ))}
                </>
              ) : (
                <span className="font-semibold text-slate-900">{heading}</span>
              )}
              {list && <span className="ml-2 text-muted">· {list.length} document{list.length === 1 ? "" : "s"}</span>}
              {q && (
                <button className="ml-auto text-sm font-medium text-brand-600 hover:text-brand-800" onClick={() => setParams({ q: null })}>
                  Clear search
                </button>
              )}
            </div>

            {!q && subFolders.length > 0 && (
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {subFolders.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => setParams({ folder: f.id })}
                      className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-left hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <FolderIcon className="h-5 w-5 shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{f.name}</span>
                      <span className="text-xs text-muted">{f.documentCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4">
              {docs.error && !list ? (
                <ErrorBanner message={docs.error} onRetry={docs.reload} />
              ) : !list ? (
                <PageLoading />
              ) : list.length === 0 ? (
                <EmptyState
                  icon={q ? <Search className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                  title={q ? "No matching documents" : status ? "No documents with this status" : "No documents here yet"}
                  action={
                    !q && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <button className={btn.secondary} onClick={() => uploadInput.current?.click()} disabled={uploading > 0}>
                          <Upload className="h-4 w-4" /> Upload files
                        </button>
                        <button className={btn.primary} onClick={() => setNewDoc((n) => n + 1)}>
                          <Plus className="h-4 w-4" /> New document
                        </button>
                      </div>
                    )
                  }
                >
                  {q
                    ? "Try a different word, or search by tag."
                    : "Write a new document, upload files (or drag them here), or move a document into this folder."}
                </EmptyState>
              ) : (
                <DocTable
                  docs={list}
                  showFolder={showFolderColumn}
                  loading={docs.loading}
                  onEdit={(d) => router.push(`/docs/${d.id}?edit=1`)}
                  onMove={setMoving}
                  onDelete={async (d) => {
                    if (await deleteDocument(d)) refresh();
                  }}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      <NewDocumentDialog
        key={`new-${newDoc}`}
        open={newDoc > 0}
        onClose={() => setNewDoc(0)}
        folderId={currentFolder?.id ?? null}
        onUploaded={refresh}
      />
      {folderDialog && (
        <FolderDialog
          key={folderDialogKey}
          state={folderDialog}
          folders={folderList}
          onClose={() => setFolderDialog(null)}
          onDone={(folder) => {
            setFolderDialog(null);
            refresh();
            if (folderDialog.mode === "create") setParams({ folder: folder.id, q: null });
          }}
        />
      )}
      {moving && (
        <MoveDialog
          key={moving.id}
          doc={moving}
          folders={folderList}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function FolderSelectOptions(folders: Folder[]) {
  return flattenFolders(folders).map(({ folder, depth }) => (
    <option key={folder.id} value={folder.id}>
      {"  ".repeat(depth * 2)}
      {depth ? "└ " : ""}
      {folder.name} ({folder.documentCount})
    </option>
  ));
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  // Follow external changes to the query (e.g. the header search) without
  // remounting, so typing here never loses focus.
  const [synced, setSynced] = useState(initial);
  if (initial !== synced) {
    setSynced(initial);
    if (initial !== value.trim()) setValue(initial);
  }
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Search as you type (debounced).
  useEffect(() => {
    if (value.trim() === initial) return;
    const t = setTimeout(() => onSearchRef.current(value.trim()), 350);
    return () => clearTimeout(t);
  }, [value, initial]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };
  return (
    <form onSubmit={submit} className="relative flex-1" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        className={`${input} pl-9`}
        placeholder="Search titles, content and tags…"
        aria-label="Search documents"
      />
    </form>
  );
}

function DocTable({
  docs,
  showFolder,
  loading,
  onEdit,
  onMove,
  onDelete,
}: {
  docs: PageSummary[];
  showFolder: boolean;
  loading: boolean;
  onEdit: (d: PageSummary) => void;
  onMove: (d: PageSummary) => void;
  onDelete: (d: PageSummary) => void;
}) {
  const router = useRouter();
  const menu = (d: PageSummary) => (
    <Menu
      label={`Actions for ${d.title}`}
      triggerClassName={btn.icon}
      trigger={<MoreHorizontal className="h-5 w-5" />}
      items={[
        { label: "Open", icon: <ExternalLink />, onSelect: () => router.push(`/docs/${d.id}`) },
        { label: "Edit", icon: <Pencil />, onSelect: () => onEdit(d) },
        { label: "Move to folder…", icon: <FolderInput />, onSelect: () => onMove(d) },
        "separator",
        { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => onDelete(d) },
      ]}
    />
  );

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      {/* Cards on small screens */}
      <ul className="divide-y divide-line md:hidden">
        {docs.map((d) => (
          <li key={d.id} className="flex items-start gap-3 py-3">
            <DocIcon />
            <Link href={`/docs/${d.id}`} className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{d.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {showFolder && d.folderName ? `${d.folderName} · ` : ""}
                {timeAgo(d.updatedAt)} · v{d.version} · {formatBytes(d.size)}
              </p>
              <div className="mt-1.5">
                <StatusBadge status={d.status} />
              </div>
            </Link>
            {menu(d)}
          </li>
        ))}
      </ul>

      {/* Table on larger screens */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="bg-slate-50 text-left text-xs text-muted">
            <th className="rounded-l-lg px-3 py-2.5 font-medium">Name</th>
            {showFolder && <th className="px-3 py-2.5 font-medium">Folder</th>}
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Updated</th>
            <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Version</th>
            <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Size</th>
            <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Owner</th>
            <th className="w-10 rounded-r-lg px-3 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {docs.map((d) => (
            <tr key={d.id} className="group hover:bg-slate-50/70">
              <td className="w-full max-w-0 px-3 py-3">
                <Link href={`/docs/${d.id}`} className="flex items-center gap-3">
                  <DocIcon />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">{d.title}</span>
                      {d.attachmentCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted" title={`${d.attachmentCount} attachment(s)`}>
                          <Paperclip className="h-3 w-3" />
                          {d.attachmentCount}
                        </span>
                      )}
                    </span>
                    {(d.description || d.tags.length > 0) && (
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                        {d.description && <span className="truncate">{d.description}</span>}
                        {!d.description && d.tags.slice(0, 3).map((t) => <Tag key={t}>#{t}</Tag>)}
                      </span>
                    )}
                  </span>
                </Link>
              </td>
              {showFolder && <td className="whitespace-nowrap px-3 py-3 text-muted">{d.folderName ?? "—"}</td>}
              <td className="px-3 py-3">
                <StatusBadge status={d.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{timeAgo(d.updatedAt)}</td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-muted xl:table-cell">v{d.version}</td>
              <td className="hidden whitespace-nowrap px-3 py-3 text-muted lg:table-cell">{formatBytes(d.size)}</td>
              <td className="hidden max-w-[10rem] truncate px-3 py-3 text-muted xl:table-cell">{d.owner || "—"}</td>
              <td className="px-3 py-3 text-right">{menu(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FolderDialog({
  state,
  folders,
  onClose,
  onDone,
}: {
  state: { mode: "create"; parentId: string | null } | { mode: "rename"; folder: Folder };
  folders: Folder[];
  onClose: () => void;
  onDone: (f: Folder) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(state.mode === "rename" ? state.folder.name : "");
  const [parentId, setParentId] = useState<string | null>(state.mode === "create" ? state.parentId : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { folder } =
        state.mode === "create"
          ? await api<{ folder: Folder }>("/api/folders", { body: { name, parentId } })
          : await api<{ folder: Folder }>(`/api/folders/${state.folder.id}`, { method: "PATCH", body: { name } });
      toast("success", state.mode === "create" ? `Created “${folder.name}”` : "Folder renamed");
      onDone(folder);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={state.mode === "create" ? "New folder" : "Rename folder"}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="folder-form" className={btn.primary} disabled={busy || !name.trim()}>
            {busy && <Spinner />} {state.mode === "create" ? "Create folder" : "Save"}
          </button>
        </>
      }
    >
      <form id="folder-form" onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} maxLength={120} required data-autofocus />
        </Field>
        {state.mode === "create" && (
          <Field label="Inside">
            <FolderSelect folders={folders} value={parentId} onChange={setParentId} noneLabel="Top level" />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function MoveDialog({
  doc,
  folders,
  onClose,
  onDone,
}: {
  doc: PageSummary;
  folders: Folder[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [folderId, setFolderId] = useState<string | null>(doc.folderId);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/pages/${doc.id}`, { method: "PUT", body: { folderId } });
      toast("success", "Document moved");
      onDone();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't move the document");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Move to folder"
      description={<>“{doc.title}”</>}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="move-form" className={btn.primary} disabled={busy || folderId === doc.folderId}>
            {busy && <Spinner />} Move
          </button>
        </>
      }
    >
      <form id="move-form" onSubmit={submit}>
        <Field label="Folder">
          <FolderSelect folders={folders} value={folderId} onChange={setFolderId} />
        </Field>
      </form>
    </Modal>
  );
}
