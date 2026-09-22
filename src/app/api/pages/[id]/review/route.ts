import { NextRequest, NextResponse } from "next/server";
import { applyReviewAction, getPageFull, listEvents, type ReviewAction } from "@/lib/pages";
import { getSettings } from "@/lib/settings";
import { errorResponse, readJson, str } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS: ReviewAction[] = ["submit", "approve", "request_changes", "withdraw"];

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const events = await listEvents(id);
    return NextResponse.json({ events });
  } catch (e) {
    return errorResponse(e, "Failed to load review history");
  }
}

/** POST { action: submit|approve|request_changes|withdraw, comment?, reviewer? } */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await readJson(request);
  const action = str(body.action) as ReviewAction | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown review action" }, { status: 400 });
  }
  const comment = str(body.comment) ?? "";
  if (action === "request_changes" && !comment.trim()) {
    return NextResponse.json({ error: "Please say what needs to change" }, { status: 400 });
  }
  try {
    await applyReviewAction(id, action, {
      actor: (await getSettings()).displayName,
      comment,
      reviewer: str(body.reviewer),
    });
    const page = await getPageFull(id);
    return NextResponse.json({ page });
  } catch (e) {
    return errorResponse(e, "Failed to update review status");
  }
}
