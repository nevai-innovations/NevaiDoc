import { NextRequest, NextResponse } from "next/server";
import { createTemplate, listTemplates } from "@/lib/templates";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (e) {
    return errorResponse(e, "Failed to load templates");
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  try {
    const template = await createTemplate({
      name: str(body.name) ?? "",
      description: str(body.description),
      category: str(body.category),
      content: str(body.content),
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (e) {
    return errorResponse(e, "Failed to create template");
  }
}
