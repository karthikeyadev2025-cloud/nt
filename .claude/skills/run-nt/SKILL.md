---
name: run-nt
description: Build, run, and drive the Nikki Technologies app (nt) — the public marketing site plus the Supabase-backed staff portal. Use when asked to start or serve nt, build it, typecheck or lint it, take a screenshot of its UI, click through the running app, check accessibility, or call its internal TypeScript directly.
---

React 18 + Vite + TypeScript + Tailwind + Supabase. Drive it with
`.claude/skills/run-nt/driver.mjs` (Playwright over the bundled Chromium —
there is no `chromium-cli` in this image), and call internal modules without
a browser via `.claude/skills/run-nt/tsrun.sh`.

All paths below are relative to the repo root.

## Prerequisites

Nothing to `apt-get` in this image. Verified present:

```bash
node -v          # v22.22.2
npm -v           # 10.9.7
tmux -V          # tmux 3.4
echo $PLAYWRIGHT_BROWSERS_PATH   # /opt/pw-browsers  (Chromium lives here)
```

## Setup

`npm install` **fails outright** here — `package.json` pins `xlsx` to a
tarball on `cdn.sheetjs.com`, the agent proxy answers 403, and npm aborts
the entire install leaving `node_modules` empty. Use the setup script; it
installs everything else and stubs `xlsx`:

```bash
bash .claude/skills/run-nt/setup.sh
```

Idempotent, ~10s, leaves the repo clean (it restores `package.json` and
`package-lock.json`, which npm rewrites). It also installs `playwright-core`
into the skill directory for the driver.

No `.env` is needed to run and drive the app. It boots without Supabase
credentials, logs one `[Nikki] Supabase is not configured` error, and
degrades honestly — the public site works, `/login` renders and says
"Sign-in isn't configured yet."

## Build

```bash
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run lint         # eslint .
npm run build        # vite build -> dist/
```

All three pass clean on `main`. There is **no test suite** — no vitest, no
jest, no `test` script. Typecheck + lint is the whole static check; the
driver below is the only thing that verifies runtime behavior.

## Run (agent path)

```bash
npm run dev > /tmp/nt-dev.log 2>&1 &
sleep 6 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # -> 200
```

Port is **3000**, set by `vite.config.ts` with `strictPort: true`. It is not
Vite's default 5173.

`npm run dev` is the right server for driving the app — no build step, and
HMR. Use `npm run build && npm run preview` (same port) only when you need to
check something that differs in a production bundle: minification, code
splitting, or the post-deploy stale-tab reload, which is disabled in dev.

The driver passes all 12 smoke checks against either server.

### One-shot commands

```bash
node .claude/skills/run-nt/driver.mjs smoke              # 12 pass/fail checks, exit 1 on failure
node .claude/skills/run-nt/driver.mjs shot /login        # screenshot a route
node .claude/skills/run-nt/driver.mjs audit /            # unnamed controls/buttons, exit 1 if any
```

`smoke` output on a clean `main`:

```
PASS  public site renders  -- Nikki Technologies
PASS  page did not self-reload
PASS  dialog opens with role=dialog
PASS  dialog has aria-modal
PASS  dialog has an accessible name  -- "General application"
PASS  background scroll locked
PASS  focus moved into dialog
PASS  focus trap holds over 12 Tabs
PASS  Escape closes dialog
PASS  focus restored to trigger
PASS  every visible form control is named
PASS  every visible button is named
```

Screenshots land in `/tmp/shots/` (override with `NT_SHOTS`). **Open the PNG
and look at it** — the app renders a full-height page (`public-site.png` is
1280x11372), so a short image means it died early.

### Interactive REPL

For anything the one-shot commands don't cover, drive the app from tmux. The
driver prints `READY <url>` once on startup and `OK` after every command.
**Poll for those markers — do not `sleep`.** A click that has to load a lazy
route chunk takes longer than any sleep you will guess, and a short sleep
captures a half-finished pane.

Start it:

```bash
tmux new-session -d -s nt -x 200 -y 50
tmux send-keys -t nt 'node .claude/skills/run-nt/driver.mjs repl' Enter
timeout 60 bash -c 'until tmux capture-pane -t nt -p | grep -q "^READY"; do sleep 0.3; done'
```

Then define this helper once and use it for every command. It waits for the
`OK` count to rise, and fails loudly instead of silently returning a stale
pane:

```bash
ntsend() {
  local n; n=$(tmux capture-pane -t nt -p -S - | grep -c '^OK$')
  tmux send-keys -t nt "$1" Enter
  timeout 30 bash -c "until [ \$(tmux capture-pane -t nt -p -S - | grep -c '^OK\$') -gt $n ]; do sleep 0.2; done" \
    || { echo "TIMEOUT waiting for: $1"; return 1; }
  tmux capture-pane -t nt -p -S - | grep -v '^$' | tail -n "${2:-3}"
}
```

The `grep -v '^$'` is required: `capture-pane` pads its output with the
pane's empty rows, so a bare `tail` returns blank lines.

```bash
ntsend 'clickrole Submit a general career application'
ntsend 'attr [role="dialog"] aria-label'    # -> General application
ntsend 'eval getComputedStyle(document.body).overflow'   # -> "hidden"
ntsend 'press Escape'
ntsend 'count [role="dialog"]'              # -> 0
ntsend 'ss my-shot'                         # -> saved /tmp/shots/my-shot.png

tmux send-keys -t nt 'quit' Enter; tmux kill-session -t nt
```

| command | what it does |
|---|---|
| `goto <route>` | navigate (default `/`) |
| `click <selector>` | click by CSS selector |
| `clickrole <name>` | click a button by accessible name |
| `type <sel> <text>` | fill an input |
| `press <key>` | `Escape`, `Tab`, `Enter`, … |
| `text <sel>` / `count <sel>` / `attr <sel> <name>` | read the DOM |
| `eval <js>` | evaluate JS in the page, print JSON |
| `audit` | accessibility audit of the current page |
| `ss [name]` | screenshot → `/tmp/shots/<name>.png` |
| `console` | dump collected console errors/warnings |
| `quit` | close browser and exit |

### Direct invocation (no browser, no login)

**Most changes here land in code you cannot reach through the browser.**
Everything past `/login` — leads, HR, payroll, admin, roughly 90% of `src/` —
needs live Supabase credentials that the sandbox does not have. Call that
code directly instead:

```bash
.claude/skills/run-nt/tsrun.sh -e '
import { normalizePhone, waLink } from "./src/lib/phone";
console.log(normalizePhone("+91 98765-43210"));   // 9876543210
console.log(waLink("9876543210", "hi"));          // https://wa.me/919876543210?text=hi
console.log(waLink("Pending Collection"));        // null
'
```

Also takes a file: `.claude/skills/run-nt/tsrun.sh scratch.ts`. It bundles
with the esbuild already vendored by Vite, so it needs no new dependencies,
and it shims `import.meta.env` — modules that import `./src/lib/supabase`
load fine (they just report `isSupabaseConfigured === false`).

Import paths are relative to **the entry file's own directory**. For `-e`
the entry is written to the repo root, so use `./src/...`.

## Run (human path)

```bash
npm run dev        # -> http://localhost:3000 with HMR, Ctrl-C to stop
```

For the production bundle instead: `npm run build && npm run preview`, same
port.

Stop a backgrounded server **by port**, never by name:

```bash
kill $(lsof -ti tcp:3000)
```

## Gotchas

- **The stale-tab reload check is disabled in dev, deliberately** — don't
  "restore" it. `vite.config.ts` sets `__BUILD_ID__` to `Date.now()` at
  config load, while the dev server serves `public/build-version.json`
  verbatim as `{"buildId": "dev"}`. Those can never be equal, so
  `src/main.tsx` used to conclude the tab was stale on every dev page load
  and call `location.reload()` — measured at **135 main-frame navigations in
  10 seconds**, which made `npm run dev` unusable in a browser and
  impossible to automate. It is now guarded by `if (import.meta.env.DEV)
  return;`. Production is unaffected: `vite build` writes
  `dist/build-version.json` with the same id it compiles in, and a mismatched
  id still triggers the reload (verified by serving a fake newer id against
  `npm run preview`).

- **`driver.mjs` stubs `/build-version.json` to a 404 anyway.** Belt and
  braces: it keeps the driver immune to this whole mechanism, including
  against a production build where a stale bundle and a fresh
  `build-version.json` would loop.

- **`pkill -f vite` kills your own shell.** `pgrep -f` matches the agent
  shell's own command line, because that line contains the pattern you
  searched for. It exits 144 mid-session and you lose the terminal. Kill by
  port: `kill $(lsof -ti tcp:3000)`.

- **`npm install <anything>` fails, even with `node_modules` already
  populated** — npm re-resolves the whole tree and hits the blocked xlsx
  tarball. That is why `playwright-core` is installed into
  `.claude/skills/run-nt/` with its own `package.json` rather than into the
  app.

- **The xlsx stub is not xlsx.** Spreadsheet lead-import
  (`src/components/portal/leads-workflow.tsx`) throws if exercised. Typecheck,
  lint, build and every other feature are unaffected. The stub's `.d.ts` is
  deliberately typed rather than `any`: that file calls
  `XLSX.utils.sheet_to_json<XlsxRow>(...)` with an explicit type argument, and
  TypeScript rejects type arguments on an `any` call — `TS2347`.

- **`waitUntil: 'networkidle'` never resolves.** Supabase is unreachable and
  its client retries forever, so the network never goes quiet and Playwright
  times out at 30s. Use `domcontentloaded` plus an explicit settle — the
  driver does this and waits 4s (`NT_SETTLE_MS`) for the lazy route chunk.

- **playwright-core cannot find its own browser.** It looks for a
  `chromium-<revision>` directory matching the revision it was built against;
  the image ships a different one, and the path in Playwright's docs
  (`chromium/chrome-linux/chrome`) does not exist. The driver globs
  `$PLAYWRIGHT_BROWSERS_PATH/chromium-*/chrome-linux/chrome`. Override with
  `NT_CHROME=/path/to/chrome`.

- **These console errors are normal and not your bug:** `[Nikki] Supabase is
  not configured`, `ERR_TUNNEL_CONNECTION_FAILED` (Supabase + Google Fonts
  blocked by the proxy), and the font-preload warning. `driver.mjs smoke`
  filters exactly these and reports anything else.

- **`.claude/` is gitignored** except `.claude/skills/`, so this skill is
  tracked while local CLI state is not.

## Troubleshooting

- **`npm error 403 Forbidden - GET https://cdn.sheetjs.com/...`, then an
  empty `node_modules`**: the blocked xlsx tarball aborts the whole install.
  Run `bash .claude/skills/run-nt/setup.sh`.

- **`error TS2347: Untyped function calls may not accept type arguments`**:
  the xlsx stub lost its `index.d.ts`, or was replaced with an `any` export.
  Delete `node_modules/xlsx` and re-run `setup.sh`.

- **`page.evaluate: Execution context was destroyed, most likely because of
  a navigation`**: the page reloaded under you. Almost always the stale-tab
  check (see Gotchas) — check that the `import.meta.env.DEV` guard in
  `src/main.tsx` is intact, and that your script stubs
  `**/build-version.json*` the way `driver.mjs` does.

- **`page.goto: Timeout 30000ms exceeded` with `waiting until "networkidle"`**:
  see the networkidle gotcha. Use `domcontentloaded`.

- **`browserType.launch: Failed to launch chromium because executable doesn't
  exist at .../chromium/chrome-linux/chrome`**: the unversioned path is
  wrong. The driver globs for it; if you wrote your own script, do the same
  or set `NT_CHROME`.

- **`Error: Dynamic require of "stream" is not supported`** from `tsrun.sh`:
  `@supabase/postgrest-js` ships CJS. `tsrun.sh` passes an esbuild
  `--banner:js` that restores a real `require` via `createRequire`; keep it
  if you copy the command.

- **`ERR_MODULE_NOT_FOUND: playwright-core`**: you ran the driver with
  `NODE_PATH=…`, which ESM ignores. Run it by path
  (`node .claude/skills/run-nt/driver.mjs …`) so Node resolves upward into
  the skill's own `node_modules`.

- **Driver exits with "Cannot reach http://localhost:3000"**: no server, or
  you started it on 5173 out of habit. `npm run dev`, then re-check with
  `curl`.
