import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/templates";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const template = await getTemplate(id);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (e) {
    return errorResponse(e, "Failed to load template");
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  try {
    const template = await updateTemplate(id, {
      name: str(body.name) ?? "",
      description: str(body.description),
      category: str(body.category),
      content: str(body.content),
    });
    return NextResponse.json({ template });
  } catch (e) {
    return errorResponse(e, "Failed to update template");
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteTemplate(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Failed to delete template");
  }
}
