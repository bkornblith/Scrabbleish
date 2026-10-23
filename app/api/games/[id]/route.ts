import { NextResponse } from "next/server";
import { viewFor } from "@/lib/engine";
import { loadGame, loadVersion, NotFound, realtimeConfig } from "@/lib/store";
import { errorResponse, tokenOf } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const since = new URL(req.url).searchParams.get("since");
    // Cheap poll: only the version number is read unless something changed.
    if (since != null) {
      const v = await loadVersion(id.toUpperCase());
      if (v == null) throw new NotFound();
      if (v === Number(since)) return NextResponse.json({ unchanged: true });
    }
    const game = await loadGame(id.toUpperCase());
    if (!game) throw new NotFound();
    return NextResponse.json({ game: viewFor(game, tokenOf(req)), realtime: realtimeConfig });
  } catch (e) {
    return errorResponse(e);
  }
}
