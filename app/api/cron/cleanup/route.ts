import { NextResponse } from "next/server";
import { cleanupExpired, storageBackend } from "@/lib/store";

export const dynamic = "force-dynamic";

// Runs daily (see vercel.json). Deletes games with no moves for 7 days, and the database query
// also counts as activity, which keeps a free Supabase project from being paused when idle.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await cleanupExpired();
    return NextResponse.json({ ok: true, backend: storageBackend, deleted });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
