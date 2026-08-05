# Deploying for live student grading

The **Feedback Quality Report** (`/`) and **Review Dossier** (`/audit`) deploy fine to
Vercel — they read committed snapshots and are safe to share read-only. But **live student
grading (`/practice`) cannot run on Vercel**: a full run takes ~10–15 minutes and Vercel
serverless functions are capped far below that (the request is killed and the browser shows a
generic platform error). To let students submit on a live link, run the app on a host that
keeps a long-lived Node server and gives it a writable, durable disk.

Only one secret is required: **`ANTHROPIC_API_KEY`**. There is no OpenAI key and no separate
search index — retrieval reads `content/course` directly at startup.

## Recommended: Render (no Docker)

1. The repo is already on GitHub: `ll-catacomb/civ-pro-feedback`.
2. Render → **New → Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm ci && npm run build`
   - **Start command:** `npm run start`
   - **Instance type:** Starter or higher. (A persistent disk requires a paid instance; the
     free tier works for a quick test, but its filesystem is wiped on every deploy and it
     sleeps after inactivity.)
4. **Environment variables:**
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `FEEDBACK_DATA_DIR` = `/var/data`
   - (Render sets `PORT` automatically; `next start` uses it.)
5. **Add a persistent disk:** mount path `/var/data`, size 1 GB. Runs, failures, and evaluator
   sweeps are stored there as JSON (via `FEEDBACK_DATA_DIR`), so they survive restarts and
   redeploys.
6. Deploy. The first build takes a few minutes. Open the service URL and go to `/practice`.

Render runs the app as a long-lived server (not serverless), so it can handle much longer
requests than Vercel.

## Railway

Same idea: connect the repo (it auto-detects Next.js), set the same env vars, add a **volume**
mounted at `/var/data`, and set `FEEDBACK_DATA_DIR=/var/data`. Build `npm ci && npm run build`,
start `npm run start`.

## Fly.io

Fly needs a container image. Ask me and I'll add a `Dockerfile` + `fly.toml` (standalone build,
a mounted volume for `/var/data`, and an extended proxy timeout).

## Caveats worth knowing

- **The 13-minute wait is one long HTTP request.** These hosts allow it, but a request that
  sends no bytes for 13 minutes can still be dropped by an intermediary — most commonly a CDN
  or proxy placed in front (e.g., Cloudflare) that closes idle connections. If you see dropped
  connections, tell me: the fixes are a lightweight keep-alive stream, or the async pattern
  (submit → background worker → emailed link) so no one waits on an open tab.
- **Storage.** The JSON store on a mounted disk is fine for a single instance and a pilot. If
  you scale to multiple instances or want to query runs with SQL, move the store to Postgres —
  a contained change behind the existing store interface that I can make when needed.
- **Fresh disk = snapshot fallback.** Before any runs exist on a new disk, the report and
  dossier fall back to the committed snapshots (same as on Vercel); they switch to live data as
  runs accumulate.
- **Node version** is pinned to 22.x via `.node-version` / `package.json` `engines`
  (needs ≥ 20.19).
