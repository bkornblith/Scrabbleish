import { NextResponse } from "next/server";
import { isAdmin, summarize } from "@/lib/admin";
import { deleteGames, listGames } from "@/lib/store";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

const denied = () => NextResponse.json({ error: "Wrong admin password" }, { status: 401 });

export async function GET(req: Request) {
  if (!isAdmin(req)) return denied();
  try {
    const games = (await listGames()).map(summarize).sort((a, b) => b.lastActivity - a.lastActivity);
    return NextResponse.json({ games });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) return denied();
  try {
    const { ids } = (await req.json()) as { ids?: unknown };
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "Expected { ids: string[] }" }, { status: 400 });
    }
    const deleted = await deleteGames(ids.map((id) => id.toUpperCase()));
    return NextResponse.json({ deleted });
  } catch (e) {
    return errorResponse(e);
  }
}
