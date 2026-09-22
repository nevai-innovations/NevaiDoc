import { randomUUID } from "crypto";
import { query, queryOne, withTransaction, type Tx } from "@/lib/db";
import { slugify, randomSuffix } from "@/lib/slug";
import {
  PAGE_STATUSES,
  type ApprovalAction,
  type ApprovalEvent,
  type FolderRef,
  type PageDetail,
  type PageFull,
  type PageStatus,
  type PageSummary,
  type PageTreeNode,
  type PageVersion,
  type PageVersionDetail,
} from "@/lib/types";

type Row = {
  id: string;
  title: string;
  slug: string;
  content: string;
  order: number;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
  folder_id: string | null;
  description: string;
  tags: string[];
  owner: string;
  status: string;
  reviewer: string;
  version: number;
};

type SummaryRow = Omit<Row, "content"> & {
  folder_name: string | null;
  size: number;
  attachment_count: number;
};

function toStatus(s: string): PageStatus {
  return (PAGE_STATUSES as readonly string[]).includes(s) ? (s as PageStatus) : "draft";
}

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
    folderId: row.folder_id,
    description: row.description,
    tags: row.tags,
    owner: row.owner,
    status: toStatus(row.status),
    reviewer: row.reviewer,
    version: row.version,
  };
}

function toSummary(row: SummaryRow): PageSummary {
  const { content: _content, ...rest } = toDetail({ ...row, content: "" });
  void _content;
  return {
    ...rest,
    folderName: row.folder_name,
    size: row.size,
    attachmentCount: row.attachment_count,
  };
}

/** Trims, de-duplicates and caps a list of tags. */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const tag = t.trim().slice(0, 40);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 20);
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

const SUMMARY_SELECT = `
  SELECT p.id, p.title, p.slug, p."order", p.parent_id, p.created_at, p.updated_at,
         p.folder_id, p.description, p.tags, p.owner, p.status, p.reviewer, p.version,
         f.name AS folder_name,
         (octet_length(p.content) + COALESCE(a.bytes, 0))::int AS size,
         COALESCE(a.n, 0)::int AS attachment_count
  FROM pages p
  LEFT JOIN folders f ON f.id = p.folder_id
  LEFT JOIN (
    SELECT page_id, SUM(size) AS bytes, COUNT(*) AS n FROM attachments GROUP BY page_id
  ) a ON a.page_id = p.id`;

export type ListOptions = {
  q?: string;
  /** A folder id, "root" for documents not in any folder, or undefined for all. */
  folderId?: string;
  status?: PageStatus;
  sort?: "updated" | "title" | "created";
  limit?: number;
};

export async function listPages(opts: ListOptions = {}): Promise<PageSummary[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(p.title ILIKE $${i} OR p.description ILIKE $${i} OR p.content ILIKE $${i} OR array_to_string(p.tags, ' ') ILIKE $${i})`
    );
    values.push(like);
    i++;
  }
  if (opts.folderId === "root") {
    where.push("p.folder_id IS NULL");
  } else if (opts.folderId) {
    where.push(`p.folder_id = $${i++}`);
    values.push(opts.folderId);
  }
  if (opts.status) {
    where.push(`p.status = $${i++}`);
    values.push(opts.status);
  }

  const orderBy =
    opts.sort === "title"
      ? "p.title ASC"
      : opts.sort === "created"
        ? "p.created_at DESC"
        : "p.updated_at DESC";

  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
  const rows = await query<SummaryRow>(
    `${SUMMARY_SELECT}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${orderBy}
     LIMIT ${limit}`,
    values
  );
  return rows.map(toSummary);
}

export async function getPage(id: string): Promise<PageDetail | null> {
  const row = await queryOne<Row>("SELECT * FROM pages WHERE id = $1", [id]);
  return row ? toDetail(row) : null;
}

async function folderPath(folderId: string | null): Promise<FolderRef[]> {
  if (!folderId) return [];
  const rows = await query<{ id: string; name: string; depth: number }>(
    `WITH RECURSIVE chain AS (
       SELECT id, name, parent_id, 0 AS depth FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id, f.name, f.parent_id, c.depth + 1
       FROM folders f JOIN chain c ON f.id = c.parent_id
       WHERE c.depth < 50
     )
     SELECT id, name, depth FROM chain ORDER BY depth DESC`,
    [folderId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function getPageFull(id: string): Promise<PageFull | null> {
  const page = await getPage(id);
  if (!page) return null;
  const [path, parent, children] = await Promise.all([
    folderPath(page.folderId),
    page.parentId
      ? queryOne<{ id: string; title: string }>("SELECT id, title FROM pages WHERE id = $1", [
          page.parentId,
        ])
      : Promise.resolve(null),
    query<{ id: string; title: string }>(
      `SELECT id, title FROM pages WHERE parent_id = $1 ORDER BY "order", title`,
      [id]
    ),
  ]);
  return { ...page, folderPath: path, parent, children };
}

async function insertVersion(
  tx: Tx,
  pageId: string,
  version: number,
  title: string,
  content: string,
  author: string,
  note: string
) {
  await tx.query(
    `INSERT INTO page_versions (id, page_id, version, title, content, author, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), pageId, version, title, content, author, note]
  );
}

async function insertEvent(tx: Tx, pageId: string, action: ApprovalAction, actor: string, comment: string) {
  await tx.query(
    `INSERT INTO approval_events (id, page_id, action, actor, comment) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), pageId, action, actor, comment]
  );
}

export async function createPage(input: {
  title: string;
  content?: string;
  parentId: string | null;
  folderId?: string | null;
  description?: string;
  tags?: string[];
  owner?: string;
  author?: string;
}): Promise<PageDetail> {
  const title = input.title.trim() || "Untitled page";

  let folderId = input.folderId ?? null;
  if (input.parentId) {
    const parent = await queryOne<{ id: string; folder_id: string | null }>(
      "SELECT id, folder_id FROM pages WHERE id = $1",
      [input.parentId]
    );
    if (!parent) throw new Error("PARENT_NOT_FOUND");
    // Sub-pages live in their parent's folder unless told otherwise.
    if (input.folderId === undefined) folderId = parent.folder_id;
  }
  if (folderId) {
    const folder = await queryOne("SELECT id FROM folders WHERE id = $1", [folderId]);
    if (!folder) throw new Error("FOLDER_NOT_FOUND");
  }

  const [{ count }] = await query<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM pages WHERE parent_id IS NOT DISTINCT FROM $1",
    [input.parentId]
  );

  const slug = await uniqueSlug(title);
  const id = randomUUID();
  const content = input.content ?? "";
  const owner = (input.owner ?? input.author ?? "").trim();

  const row = await withTransaction(async (tx) => {
    const row = await tx.queryOne<Row>(
      `INSERT INTO pages (id, title, slug, content, "order", parent_id, folder_id, description, tags, owner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        title,
        slug,
        content,
        Number(count),
        input.parentId,
        folderId,
        (input.description ?? "").trim(),
        normalizeTags(input.tags ?? []),
        owner,
      ]
    );
    await insertVersion(tx, id, 1, title, content, input.author ?? "", "Created");
    return row!;
  });
  return toDetail(row);
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

export type PageUpdates = {
  title?: string;
  content?: string;
  parentId?: string | null;
  order?: number;
  folderId?: string | null;
  description?: string;
  tags?: string[];
  owner?: string;
  /** Who is saving, recorded on the new version. */
  author?: string;
  /** Optional "what changed" note recorded on the new version. */
  note?: string;
};

export async function updatePage(id: string, updates: PageUpdates): Promise<PageDetail> {
  const existing = await queryOne<Row>("SELECT * FROM pages WHERE id = $1", [id]);
  if (!existing) throw new Error("NOT_FOUND");

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  let newTitle = existing.title;
  let newContent = existing.content;

  if (updates.title !== undefined && updates.title.trim() && updates.title.trim() !== existing.title) {
    const title = updates.title.trim();
    newTitle = title;
    sets.push(`title = $${i++}`);
    values.push(title);
    const slug = await uniqueSlug(title, id);
    sets.push(`slug = $${i++}`);
    values.push(slug);
  }

  if (updates.content !== undefined && updates.content !== existing.content) {
    newContent = updates.content;
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

  if (updates.folderId !== undefined) {
    if (updates.folderId) {
      const folder = await queryOne("SELECT id FROM folders WHERE id = $1", [updates.folderId]);
      if (!folder) throw new Error("FOLDER_NOT_FOUND");
    }
    sets.push(`folder_id = $${i++}`);
    values.push(updates.folderId);
  }

  if (updates.description !== undefined) {
    sets.push(`description = $${i++}`);
    values.push(updates.description.trim());
  }

  if (updates.tags !== undefined) {
    sets.push(`tags = $${i++}`);
    values.push(normalizeTags(updates.tags));
  }

  if (updates.owner !== undefined) {
    sets.push(`owner = $${i++}`);
    values.push(updates.owner.trim());
  }

  const bodyChanged = newTitle !== existing.title || newContent !== existing.content;
  const nextVersion = existing.version + 1;
  // Changing an approved document's text sends it back to draft: the
  // approval was for the old wording.
  const reopen = bodyChanged && existing.status === "approved";

  if (bodyChanged) {
    sets.push(`version = $${i++}`);
    values.push(nextVersion);
  }
  if (reopen) {
    sets.push(`status = 'draft'`);
  }

  sets.push(`updated_at = now()`);

  values.push(id);
  const row = await withTransaction(async (tx) => {
    const row = await tx.queryOne<Row>(
      `UPDATE pages SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (bodyChanged) {
      await insertVersion(
        tx,
        id,
        nextVersion,
        newTitle,
        newContent,
        updates.author ?? "",
        (updates.note ?? "").trim().slice(0, 300)
      );
    }
    if (reopen) {
      await insertEvent(tx, id, "reopened", updates.author ?? "", "Edited after approval");
    }
    return row!;
  });
  return toDetail(row);
}

export async function deletePage(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM pages WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

/** Number of pages nested (at any depth) under `id`. */
export async function countDescendants(id: string): Promise<number> {
  const [{ n }] = await query<{ n: number }>(
    `WITH RECURSIVE d AS (
       SELECT id FROM pages WHERE parent_id = $1
       UNION ALL
       SELECT p.id FROM pages p JOIN d ON p.parent_id = d.id
     )
     SELECT COUNT(*)::int AS n FROM d`,
    [id]
  );
  return n;
}

// ---------- Version history ----------

type VersionRow = {
  id: string;
  page_id: string;
  version: number;
  title: string;
  content: string;
  author: string;
  note: string;
  created_at: Date;
};

function toVersion(r: Omit<VersionRow, "content">): PageVersion {
  return {
    id: r.id,
    pageId: r.page_id,
    version: r.version,
    title: r.title,
    author: r.author,
    note: r.note,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listVersions(pageId: string): Promise<PageVersion[]> {
  const rows = await query<Omit<VersionRow, "content">>(
    `SELECT id, page_id, version, title, author, note, created_at
     FROM page_versions WHERE page_id = $1 ORDER BY version DESC`,
    [pageId]
  );
  return rows.map(toVersion);
}

export async function getVersion(pageId: string, version: number): Promise<PageVersionDetail | null> {
  const row = await queryOne<VersionRow>(
    "SELECT * FROM page_versions WHERE page_id = $1 AND version = $2",
    [pageId, version]
  );
  return row ? { ...toVersion(row), content: row.content } : null;
}

/** Restoring never rewrites history: it saves the old text as a new version. */
export async function restoreVersion(pageId: string, version: number, author: string): Promise<PageDetail> {
  const v = await getVersion(pageId, version);
  if (!v) throw new Error("VERSION_NOT_FOUND");
  const current = await getPage(pageId);
  if (!current) throw new Error("NOT_FOUND");
  if (current.title === v.title && current.content === v.content) return current;
  return updatePage(pageId, {
    title: v.title,
    content: v.content,
    author,
    note: `Restored from version ${version}`,
  });
}

// ---------- Approvals ----------

type EventRow = {
  id: string;
  page_id: string;
  page_title?: string;
  action: ApprovalAction;
  actor: string;
  comment: string;
  created_at: Date;
};

function toEvent(r: EventRow): ApprovalEvent {
  return {
    id: r.id,
    pageId: r.page_id,
    pageTitle: r.page_title,
    action: r.action,
    actor: r.actor,
    comment: r.comment,
    createdAt: r.created_at.toISOString(),
  };
}

export type ReviewAction = "submit" | "approve" | "request_changes" | "withdraw";

/** Which statuses each review action may be taken from. */
const TRANSITIONS: Record<ReviewAction, { from: PageStatus[]; to: PageStatus; event: ApprovalAction }> = {
  submit: { from: ["draft", "changes_requested", "approved"], to: "in_review", event: "submitted" },
  approve: { from: ["in_review"], to: "approved", event: "approved" },
  request_changes: { from: ["in_review"], to: "changes_requested", event: "changes_requested" },
  withdraw: { from: ["in_review"], to: "draft", event: "reopened" },
};

export async function applyReviewAction(
  pageId: string,
  action: ReviewAction,
  input: { actor: string; comment: string; reviewer?: string }
): Promise<PageDetail> {
  const t = TRANSITIONS[action];
  if (!t) throw new Error("INVALID_ACTION");
  const existing = await getPage(pageId);
  if (!existing) throw new Error("NOT_FOUND");
  if (!t.from.includes(existing.status)) throw new Error("INVALID_TRANSITION");

  const comment = input.comment.trim().slice(0, 2000);
  const actor = input.actor.trim().slice(0, 100);

  const row = await withTransaction(async (tx) => {
    const row = await tx.queryOne<Row>(
      action === "submit"
        ? `UPDATE pages SET status = $1, reviewer = $3 WHERE id = $2 RETURNING *`
        : `UPDATE pages SET status = $1 WHERE id = $2 RETURNING *`,
      action === "submit" ? [t.to, pageId, (input.reviewer ?? "").trim().slice(0, 100)] : [t.to, pageId]
    );
    await insertEvent(tx, pageId, t.event, actor, comment);
    return row!;
  });
  return toDetail(row);
}

export async function listEvents(pageId: string): Promise<ApprovalEvent[]> {
  const rows = await query<EventRow>(
    `SELECT * FROM approval_events WHERE page_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [pageId]
  );
  return rows.map(toEvent);
}

export async function recentEvents(limit = 20): Promise<ApprovalEvent[]> {
  const rows = await query<EventRow>(
    `SELECT e.*, p.title AS page_title
     FROM approval_events e JOIN pages p ON p.id = e.page_id
     ORDER BY e.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(toEvent);
}
