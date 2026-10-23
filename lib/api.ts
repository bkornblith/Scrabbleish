import { NextResponse } from "next/server";
import { GameError } from "./engine";
import { NotFound } from "./store";

export function errorResponse(e: unknown) {
  if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof NotFound) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
}

export const tokenOf = (req: Request) => req.headers.get("x-player-token");
