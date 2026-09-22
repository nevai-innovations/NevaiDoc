"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import PageEditor from "@/components/PageEditor";
import type { PageDetail, PageTreeNode } from "@/lib/types";

export default function Home() {
  const [tree, setTree] = useState<PageTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<PageDetail | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived rather than tracked in state: true exactly while we've picked a
  // page but haven't yet fetched its content.
  const loadingPage = selectedId !== null && selectedPage?.id !== selectedId;

  const loadTree = useCallback(async (): Promise<PageTreeNode[]> => {
    const res = await fetch("/api/pages");
    if (!res.ok) throw new Error("Failed to load pages");
    const data = await res.json();
    setTree(data.tree);
    return data.tree as PageTreeNode[];
  }, []);

  const loadPage = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/pages/${id}`);
      if (!res.ok) throw new Error("Failed to load page");
      const data = await res.json();
      setSelectedPage(data.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, []);

  const findFirstId = (nodes: PageTreeNode[]): string | null => {
    if (nodes.length === 0) return null;
    return nodes[0].id;
  };

  useEffect(() => {
    (async () => {
      try {
        setLoadingTree(true);
        const initialTree = await loadTree();
        const firstId = findFirstId(initialTree);
        if (firstId) {
          setSelectedId(firstId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoadingTree(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Fetching data in response to a prop/state change is the documented,
    // recommended use of an effect (see react.dev "You Might Not Need an
    // Effect" — data fetching is one of the exceptions). `loadPage` only
    // sets state after its `await`, i.e. asynchronously, so this doesn't
    // actually cause the synchronous cascading-render pattern the rule
    // below guards against; the linter just can't see through the callback.
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPage(selectedId);
    } else {
      setSelectedPage(null);
    }
  }, [selectedId, loadPage]);

  const handleCreateChild = async (parentId: string | null) => {
    setError(null);
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled page", parentId }),
    });
    if (!res.ok) {
      setError("Failed to create page");
      return;
    }
    const data = await res.json();
    await loadTree();
    setSelectedId(data.page.id);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/pages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Failed to delete page");
      return;
    }
    const newTree = await loadTree();
    if (selectedId === id) {
      setSelectedId(findFirstId(newTree));
    }
  };

  const handleSave = async (updates: { title?: string; content?: string }) => {
    if (!selectedId) return;
    setError(null);
    const res = await fetch(`/api/pages/${selectedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      setError("Failed to save page");
      return;
    }
    const data = await res.json();
    setSelectedPage(data.page);
    await loadTree();
  };

  return (
    <div className="flex flex-1 min-h-0">
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-zinc-50/50">
        {loadingTree ? (
          <p className="px-4 py-4 text-sm text-zinc-400">Loading…</p>
        ) : (
          <Sidebar
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreateChild={handleCreateChild}
            onDelete={handleDelete}
          />
        )}
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {error && (
          <div className="px-6 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {error}
          </div>
        )}
        {loadingPage ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
            Loading…
          </div>
        ) : selectedPage ? (
          <PageEditor
            key={selectedPage.id}
            page={selectedPage}
            onSave={handleSave}
            onDelete={() => handleDelete(selectedPage.id)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6">
            <h2 className="text-lg font-medium text-zinc-700">Welcome to NevaiDoc</h2>
            <p className="text-sm text-zinc-500 max-w-sm">
              Create your first page from the sidebar to start writing documentation.
            </p>
            <button
              onClick={() => handleCreateChild(null)}
              className="mt-2 text-sm px-4 py-2 rounded-md bg-zinc-900 text-white hover:bg-zinc-700"
            >
              + New page
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
