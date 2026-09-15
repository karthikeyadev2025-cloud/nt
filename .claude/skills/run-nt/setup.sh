#!/usr/bin/env bash
# Install everything needed to build, run and drive this app.
#
# Exists because `npm install` cannot complete in a network-restricted
# sandbox: package.json pins xlsx to a tarball on cdn.sheetjs.com, which the
# agent proxy answers with 403, and npm then aborts the WHOLE install --
# node_modules ends up empty and nothing works, not even `tsc`.
#
# This script installs every other dependency, then hand-builds a minimal
# xlsx stub so typecheck/build/dev succeed. See SKILL.md "Gotchas" for what
# that costs you (the Excel lead-import feature is inert).
#
# Idempotent. Safe to re-run.
set -euo pipefail

UNIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$UNIT/.claude/skills/run-nt"
cd "$UNIT"

echo "==> unit: $UNIT"

# ---------------------------------------------------------------- app deps
if [ ! -d node_modules/react ]; then
  echo "==> installing app dependencies (without the blocked xlsx tarball)"

  # package.json AND package-lock.json are both rewritten by npm when we
  # drop a dependency, and both are tracked files. Restore them no matter
  # how this script exits, or we leave the repo dirty.
  cp package.json "$SKILL/.package.json.bak"
  cp package-lock.json "$SKILL/.package-lock.json.bak"
  restore() {
    mv -f "$SKILL/.package.json.bak" "$UNIT/package.json" 2>/dev/null || true
    mv -f "$SKILL/.package-lock.json.bak" "$UNIT/package-lock.json" 2>/dev/null || true
  }
  trap restore EXIT

  node -e '
    const p = require("./package.json");
    delete p.dependencies.xlsx;
    require("fs").writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
  '
  npm install --no-audit --no-fund
  restore
  trap - EXIT
else
  echo "==> app dependencies already present, skipping"
fi

# ------------------------------------------------------------- xlsx stub
# `import * as XLSX from 'xlsx'` appears in src/components/portal/leads-workflow.tsx.
# Without a module at that specifier, `tsc --noEmit` and `vite build` both fail.
# The .d.ts is not `any`: leads-workflow.tsx calls
# `XLSX.utils.sheet_to_json<XlsxRow>(...)` with an explicit type argument, and
# TypeScript rejects type arguments on an untyped (any) call -- TS2347.
if [ ! -f node_modules/xlsx/index.d.ts ]; then
  echo "==> writing xlsx stub (real package is network-blocked)"
  mkdir -p node_modules/xlsx
  cat > node_modules/xlsx/package.json <<'JSON'
{ "name": "xlsx", "version": "0.20.3-stub", "main": "index.js", "types": "index.d.ts" }
JSON
  cat > node_modules/xlsx/index.js <<'JS'
function unavailable() {
  throw new Error(
    '[run-nt] xlsx is a stub in this sandbox (cdn.sheetjs.com is network-blocked). ' +
    'Spreadsheet import will not work. See .claude/skills/run-nt/SKILL.md.'
  );
}
module.exports = {
  read: unavailable, write: unavailable, writeFile: unavailable,
  utils: new Proxy({}, { get: () => unavailable }),
};
JS
  cat > node_modules/xlsx/index.d.ts <<'DTS'
export declare function read(data: unknown, opts?: unknown): any;
export declare function write(wb: unknown, opts?: unknown): any;
export declare function writeFile(wb: unknown, filename: string, opts?: unknown): any;
export declare const utils: {
  sheet_to_json<T = any>(sheet: unknown, opts?: unknown): T[];
  json_to_sheet(data: unknown[], opts?: unknown): any;
  book_new(): any;
  book_append_sheet(wb: unknown, ws: unknown, name?: string): void;
  aoa_to_sheet(data: unknown[][], opts?: unknown): any;
  [k: string]: any;
};
DTS
else
  echo "==> xlsx stub already present, skipping"
fi

# ------------------------------------------------------- driver's own deps
# playwright-core is installed HERE, not in the app. Installing it into the
# app would re-run npm's tree resolution, which hits the blocked xlsx tarball
# and fails -- even though node_modules is already populated.
if [ ! -d "$SKILL/node_modules/playwright-core" ]; then
  echo "==> installing playwright-core for the driver"
  (cd "$SKILL" && npm install --no-audit --no-fund)
else
  echo "==> playwright-core already present, skipping"
fi

echo
echo "==> done. Sanity check:"
echo "    npm run typecheck && npm run lint && npm run build"
