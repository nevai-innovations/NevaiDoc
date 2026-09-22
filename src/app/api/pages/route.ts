import { NextRequest, NextResponse } from "next/server";
import { getTree, createPage, listPages, normalizeTags } from "@/lib/pages";
import { getTemplate } from "@/lib/templates";
import { getSettings } from "@/lib/settings";
import { errorResponse, nullableId, readJson, str } from "@/lib/api";
import { PAGE_STATUSES, type PageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIST_PARAMS = ["list", "q", "folder", "status", "sort", "limit"];

/**
 * GET /api/pages               -> { tree }  (nested page tree, as before)
 * GET /api/pages?list=1&q=&folder=<id|root>&status=&sort=&limit=
 *                              -> { pages } (flat document list with metadata)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    if (!LIST_PARAMS.some((p) => sp.has(p))) {
      const tree = await getTree();
      return NextResponse.json({ tree });
    }
    const status = sp.get("status");
    const sort = sp.get("sort");
    const pages = await listPages({
      q: sp.get("q") ?? undefined,
      folderId: sp.get("folder") || undefined,
      status: status && (PAGE_STATUSES as readonly string[]).includes(status) ? (status as PageStatus) : undefined,
      sort: sort === "title" || sort === "created" ? sort : "updated",
      limit: Number(sp.get("limit")) || undefined,
    });
    return NextResponse.json({ pages });
  } catch (e) {
    return errorResponse(e, "Failed to load pages");
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  let title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "";
  let content = typeof body.content === "string" ? body.content : "";
  let description = str(body.description) ?? "";

  try {
    // Starting from a template copies its content (the template itself is untouched).
    const templateId = str(body.templateId);
    if (templateId) {
      const template = await getTemplate(templateId);
      if (!template) return NextResponse.json({ error: "Template not found" }, { status: 400 });
      content = template.content;
      title = title || template.name;
      description = description || template.description;
    }

    const { displayName } = await getSettings();
    const page = await createPage({
      title: title || "Untitled page",
      content,
      parentId,
      folderId: nullableId(body.folderId),
      description,
      tags: normalizeTags(body.tags),
      owner: str(body.owner) ?? displayName,
      author: displayName,
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Failed to create page");
  }
}
