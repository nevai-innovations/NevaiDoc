import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db";
import { slugify, randomSuffix } from "@/lib/slug";
import type { PageDetail, PageTreeNode } from "@/lib/types";

type Row = {
  id: string;
  title: string;
  slug: string;
  content: string;
  order: number;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toDetail(row: Row): PageDetail {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    order: row.order,
    parentId: row.parent_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function uniqueSlug(title: string, ignoreId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM pages WHERE slug = $1",
      [candidate]
    );
    if (!existing || existing.id === ignoreId) return candidate;
    candidate = `${base}-${randomSuffix(4)}`;
  }
  return `${base}-${randomSuffix(8)}`;
}

export async function getTree(): Promise<PageTreeNode[]> {
  const rows = await query<Pick<Row, "id" | "title" | "slug" | "order" | "parent_id">>(
    `SELECT id, title, slug, "order", parent_id FROM pages`
  );

  const byId = new Map<string, PageTreeNode>();
  rows.forEach((r) =>
    byId.set(r.id, {
      id: r.id,
      title: r.title,
      slug: r.slug,
      order: r.order,
      parentId: r.parent_id,
      children: [],
    })
  );
  const roots: PageTreeNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: PageTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export async function getPage(id: string): Promise<PageDetail | null> {
  const row = await queryOne<Row>("SELECT * FROM pages WHERE id = $1", [id]);
  return row ? toDetail(row) : null;
}

export async function createPage(input: {
  title: string;
  content?: string;
  parentId: string | null;
}): Promise<PageDetail> {
  const title = input.title.trim() || "Untitled page";

  if (input.parentId) {
    const parent = await queryOne("SELECT id FROM pages WHERE id = $1", [input.parentId]);
    if (!parent) throw new Error("PARENT_NOT_FOUND");
  }

  const [{ count }] = await query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM pages WHERE parent_id IS NOT DISTINCT FROM $1",
    [input.parentId]
  );

  const slug = await uniqueSlug(title);
  const id = randomUUID();

  const row = await queryOne<Row>(
    `INSERT INTO pages (id, title, slug, content, "order", parent_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, title, slug, input.content ?? "", Number(count), input.parentId]
  );
  return toDetail(row!);
}

/** True if `candidateAncestorId` is `id` itself or one of its descendants. */
async function isSelfOrDescendant(id: string, candidateAncestorId: string): Promise<boolean> {
  if (id === candidateAncestorId) return true;
  const children = await query<{ id: string }>("SELECT id FROM pages WHERE parent_id = $1", [id]);
  for (const child of children) {
    if (await isSelfOrDescendant(child.id, candidateAncestorId)) return true;
  }
  return false;
}

export async function updatePage(
  id: string,
  updates: { title?: string; content?: string; parentId?: string | null; order?: number }
): Promise<PageDetail> {
  const existing = await queryOne<Row>("SELECT * FROM pages WHERE id = $1", [id]);
  if (!existing) throw new Error("NOT_FOUND");

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.title !== undefined && updates.title.trim() && updates.title.trim() !== existing.title) {
    const title = updates.title.trim();
    sets.push(`title = $${i++}`);
    values.push(title);
    const slug = await uniqueSlug(title, id);
    sets.push(`slug = $${i++}`);
    values.push(slug);
  }

  if (updates.content !== undefined) {
    sets.push(`content = $${i++}`);
    values.push(updates.content);
  }

  if (updates.parentId !== undefined) {
    const newParentId = updates.parentId;
    if (newParentId) {
      if (await isSelfOrDescendant(id, newParentId)) {
        throw new Error("INVALID_PARENT");
      }
      const parent = await queryOne("SELECT id FROM pages WHERE id = $1", [newParentId]);
      if (!parent) throw new Error("PARENT_NOT_FOUND");
    }
    sets.push(`parent_id = $${i++}`);
    values.push(newParentId);
  }

  if (updates.order !== undefined) {
    sets.push(`"order" = $${i++}`);
    values.push(updates.order);
  }

  sets.push(`updated_at = now()`);

  values.push(id);
  const row = await queryOne<Row>(
    `UPDATE pages SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return toDetail(row!);
}

export async function deletePage(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM pages WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}
