import { NextRequest, NextResponse } from "next/server";
import { getTree, createPage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export async function GET() {
  const tree = await getTree();
  return NextResponse.json({ tree });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled page";
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  const content = typeof body.content === "string" ? body.content : "";

  try {
    const page = await createPage({ title, content, parentId });
    return NextResponse.json({ page }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "PARENT_NOT_FOUND") {
      return NextResponse.json({ error: "Parent page not found" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
  }
}
