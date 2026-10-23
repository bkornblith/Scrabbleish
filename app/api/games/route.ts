import { NextResponse } from "next/server";
import { createGame, type Settings } from "@/lib/engine";
import { gameCode, newId, newToken } from "@/lib/ids";
import { saveGame } from "@/lib/store";
import { errorResponse } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; settings?: Partial<Settings> };
    const playerId = newId();
    const token = newToken();
    for (let i = 0; i < 5; i++) {
      const game = createGame(gameCode(), body.name ?? "", playerId, token, body.settings);
      if (await saveGame(game, -1)) return NextResponse.json({ gameId: game.id, token });
    }
    throw new Error("Could not allocate a game code");
  } catch (e) {
    return errorResponse(e);
  }
}
