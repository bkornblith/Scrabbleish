import { NextResponse } from "next/server";
import * as engine from "@/lib/engine";
import { GameError, type Game, type Placement, type Settings } from "@/lib/engine";
import { isWord } from "@/lib/dictionary";
import { newId, newToken, secureRandom } from "@/lib/ids";
import { updateGame } from "@/lib/store";
import { errorResponse, tokenOf } from "@/lib/api";

type Action =
  | { type: "join"; name: string }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "start" }
  | { type: "play"; placements: Placement[] }
  | { type: "exchange"; tileIds: string[] }
  | { type: "pass" }
  | { type: "accept" }
  | { type: "challenge" };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const action = (await req.json()) as Action;
    const token = tokenOf(req);

    if (action.type === "join") {
      const playerId = newId();
      const newTok = newToken();
      const { game } = await updateGame(id.toUpperCase(), (g) => engine.addPlayer(g, action.name ?? "", playerId, newTok));
      return NextResponse.json({ token: newTok, game: engine.viewFor(game, newTok) });
    }

    const me = (g: Game) => {
      const p = g.players.find((pl) => pl.token === token);
      if (!token || !p) throw new GameError("You're not a player in this game");
      return p.id;
    };

    const { game, result } = await updateGame(id.toUpperCase(), (g) => {
      const pid = me(g);
      switch (action.type) {
        case "settings":
          return engine.updateSettings(g, pid, action.settings);
        case "start":
          return engine.startGame(g, pid, secureRandom);
        case "play":
          return engine.play(g, pid, action.placements ?? [], isWord);
        case "exchange":
          return engine.exchange(g, pid, action.tileIds ?? [], secureRandom);
        case "pass":
          return engine.pass(g, pid);
        case "accept":
          return engine.accept(g, pid);
        case "challenge":
          return engine.challenge(g, pid, isWord);
        default:
          throw new GameError("Unknown action");
      }
    });
    return NextResponse.json({ result: result ?? null, game: engine.viewFor(game, token) });
  } catch (e) {
    return errorResponse(e);
  }
}
