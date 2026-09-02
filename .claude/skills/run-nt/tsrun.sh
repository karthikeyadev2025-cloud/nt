#!/usr/bin/env bash
# Run a TypeScript snippet against this app's real source, with no browser
# and no Supabase login.
#
# Why this exists: everything past the login screen -- leads, HR, payroll,
# admin, ~90% of the codebase -- is unreachable in the sandbox because
# sign-in needs live Supabase credentials. Most changes here land in that
# region. This is the way to exercise that code directly.
#
# There is no test runner in this project (no vitest/jest) and none can be
# installed (npm cannot resolve the tree; see SKILL.md). But esbuild is
# already present as a Vite dependency, so bundle-and-run costs nothing new.
#
# Usage:
#   .claude/skills/run-nt/tsrun.sh <file.ts>     run a scratch TS file
#   .claude/skills/run-nt/tsrun.sh -e '<code>'   run an inline snippet
#
# Import app modules by path from the unit root, e.g.
#   import { waLink } from './src/lib/phone';
set -euo pipefail

UNIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$UNIT"

TMP="$(mktemp -d)"
INLINE=""
cleanup() { rm -rf "$TMP"; [ -n "$INLINE" ] && rm -f "$INLINE"; }
trap cleanup EXIT

if [ "${1:-}" = "-e" ]; then
  # The entry file must live inside the unit, not in /tmp: esbuild resolves
  # relative imports against the entry's own directory, so an entry in /tmp
  # cannot see ./src/lib/*. `.tsrun-*.ts` is gitignored.
  INLINE="$UNIT/.tsrun-$$.ts"
  ENTRY="$INLINE"
  printf '%s\n' "$2" > "$ENTRY"
else
  ENTRY="$1"
fi

# --platform=node so node builtins resolve; --bundle so relative TS imports
# are followed. React components will pull in react/supabase from
# node_modules, which is fine -- they just must not be *rendered*.
# The banner matters: @supabase/postgrest-js ships CJS that calls
# require('stream'), and esbuild's ESM output replaces `require` with a stub
# that throws "Dynamic require of \"stream\" is not supported". Handing it a
# real createRequire fixes every module that transitively imports supabase --
# which is most of this app.
node_modules/.bin/esbuild "$ENTRY" \
  --bundle --platform=node --format=esm --log-level=warning \
  --outfile="$TMP/out.mjs" \
  --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
  --define:import.meta.env.VITE_SUPABASE_URL='"https://stub.supabase.co"' \
  --define:import.meta.env.VITE_SUPABASE_ANON_KEY='"stub"' \
  --define:__BUILD_ID__='"tsrun"'

node "$TMP/out.mjs"
