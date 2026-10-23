# Scrabbleish

Multiplayer Scrabble for 2–5 players, built with Next.js and ready to deploy on Vercel.

## Rules implemented

- Official 15×15 board: 8 triple-word, 17 double-word (incl. the centre star), 12 triple-letter, 24 double-letter squares.
- Official English tile values and the 100-tile distribution (2 blanks).
- Draw for first turn (closest to A goes first, blank beats everything).
- First word must cover the centre star; every later word must connect. Tiles in one line, no gaps.
- Premium squares count only on the turn they're covered. Blanks score 0. Using all 7 tiles is a 50-point bingo.
- Exchange any subset of your rack on your turn, but only while at least 7 tiles are left in the bag
  (official rule). Passing is allowed.
- **Challenges (official Hasbro rule):** after a play, any opponent may challenge until the next player moves.
  If any word formed is not in the dictionary, the tiles go back to the player, they score 0 and lose the turn.
  If every word is valid, the challenger loses their next turn (the host can switch this to the tournament
  +5 rule or no penalty).
- Game ends when a player uses their last tile with the bag empty (they get everyone else's leftover tile
  values; others subtract their own), or after a run of scoreless turns (6, or 2 per player with 4–5 players).
- **5 players:** the official game supports 4. With 5, the standard 100-tile bag still works (65 tiles left
  after the deal); the host can choose a "double" 200-tile bag for a longer game.

Optional house rule: "Automatic" word checking rejects invalid words immediately instead of using challenges.

Bingos make a random critter dance across the screen (unicorn pig, disco sloth, tap-dancing penguin,
skateboarding llama); the winner gets the whole cast in a conga line. Toggle with "Celebrations" in the top
bar, or preview with `?celebrate=bingo` / `?celebrate=win` on any game URL.

## Dictionary

`data/nwl2023.txt` is the NASPA Word List 2023 (the North American tournament/club Scrabble dictionary).
To use another list (e.g. Collins), replace that file with one word per line.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # engine tests
```

Without database credentials the game state is kept in memory, which is fine for local play (open the game link
in a second browser window or another device on your network).

## Deploy on Vercel

1. In Vercel, **Add New → Project** and import this GitHub repo (framework: Next.js, no settings to change).
2. In the project, open **Storage → Supabase** (free plan) and connect it to the project with an empty
   custom prefix. This adds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which the app picks up automatically.
3. In the Supabase dashboard, open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql)
   (one `games` table, locked down so only the server's secret key can touch it).
4. Optional: add a `CRON_SECRET` env var (any long random string) so only Vercel can trigger the daily cleanup.
5. Redeploy. Create a game, share the link, play.

A database is needed because Vercel's serverless functions don't share memory. After every move the server
sends a tiny "game changed" broadcast over Supabase Realtime and each player re-fetches their own view
(racks are never broadcast). Clients still check every 20 seconds as a safety net, pause while the tab is
hidden, and stop when the game ends.

A daily Vercel cron (`/api/cron/cleanup`, see `vercel.json`) deletes games with no moves for 7 days. It also
keeps the Supabase project active, since free projects pause after about a week without traffic. If it ever
does pause, restore it from the Supabase dashboard.

Upstash Redis (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) is still supported as a fallback: without Supabase
the app stores games in Redis and polls every 1.5 seconds instead. Supabase wins when both are configured.

## Admin

`/admin` lists every stored game with its last activity, so stale games are easy to spot and delete.
The password comes from the `ADMIN_PASSWORD` env var and defaults to `admin`; set it in Vercel
(**Settings → Environment Variables**) to something else before sharing the site widely.

## Layout

- `lib/constants.ts`: board layout, tile values, distribution
- `lib/engine.ts`: pure game rules (placement, scoring, challenges, turn flow, per-player views)
- `lib/dictionary.ts`: word lookup
- `lib/store.ts`, `lib/backends/`: storage with compare-and-set (Supabase, Redis or in-memory)
- `lib/realtime.ts`: browser subscription to Supabase Realtime
- `app/api/games/...`: create / poll / action endpoints
- `app/g/[id]/`: the game screen
