#!/usr/bin/env node
/*
 * Browser driver for the Nikki Technologies app.
 *
 * There is no `chromium-cli` in this container, so this is the harness.
 * It wraps playwright-core around the Chromium that ships at
 * PLAYWRIGHT_BROWSERS_PATH and papers over three things that otherwise
 * make this specific app impossible to automate:
 *
 *   1. The app can reload itself out from under the driver. main.tsx
 *      compares a compiled-in __BUILD_ID__ against /build-version.json and
 *      calls location.reload() on a mismatch, which surfaces in Playwright
 *      as "Execution context was destroyed, most likely because of a
 *      navigation". main.tsx now skips this entirely in dev (it used to
 *      loop ~13x/sec there), but a production build still reloads on a
 *      mismatch, so every page here stubs the route to a 404 regardless.
 *
 *   2. waitUntil:'networkidle' never resolves. Supabase is unreachable from
 *      the sandbox, and its client retries; the network never goes quiet.
 *      Use domcontentloaded plus an explicit settle.
 *
 *   3. playwright-core cannot find its own browser. It looks for a
 *      chromium-<revision> directory matching the revision IT was built
 *      against; the image ships a different one. Resolve the path by glob.
 *
 * Commands:
 *   node driver.mjs shot [route] [outfile]   screenshot a route
 *   node driver.mjs audit [route]            accessibility audit
 *   node driver.mjs smoke                    full pass/fail check of the app
 *   node driver.mjs repl                     stdin REPL (drive it from tmux)
 */
import { chromium } from 'playwright-core';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const BASE = process.env.NT_BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.NT_SHOTS || '/tmp/shots';

/* ---------------------------------------------------------------- browser */

function findChromium() {
  if (process.env.NT_CHROME && existsSync(process.env.NT_CHROME)) return process.env.NT_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(root)) {
    // Prefer full chromium over headless_shell: headless_shell cannot do
    // anything that needs a real browser context (downloads, some dialogs).
    const dirs = readdirSync(root).sort();
    for (const pattern of ['chromium-', 'chromium_headless_shell-']) {
      for (const d of dirs.filter(x => x.startsWith(pattern))) {
        for (const bin of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
          const p = join(root, d, bin);
          if (existsSync(p)) return p;
        }
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `No Chromium found under ${root}. Set NT_CHROME=/path/to/chrome, or install one.`
  );
}

async function open() {
  const executablePath = findChromium();
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const logs = [];
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  // Gotcha 1: kill the stale-build reload loop before it can navigate.
  await page.route('**/build-version.json*', r => r.fulfill({ status: 404, body: 'stubbed by driver' }));

  return { browser, page, logs, executablePath };
}

async function goto(page, route = '/') {
  const url = route.startsWith('http') ? route : BASE + route;
  // Gotcha 2: never networkidle here.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // The app is a lazy-loaded SPA; the route chunk has to arrive and mount.
  await page.waitForTimeout(Number(process.env.NT_SETTLE_MS || 4000));
  return url;
}

async function assertServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(
      `Cannot reach ${BASE} (${e.message}).\n\n` +
      `Start it first:\n` +
      `  npm run dev > /tmp/nt-dev.log 2>&1 &\n\n` +
      `The port is 3000 (vite.config.ts, strictPort), not Vite's default 5173.`
    );
    process.exit(1);
  }
}

/* --------------------------------------------------------------- commands */

async function cmdShot(route = '/', outfile) {
  await assertServer();
  mkdirSync(SHOTS, { recursive: true });
  const out = outfile || join(SHOTS, (route.replace(/[^\w]+/g, '_') || 'root') + '.png');
  const { browser, page, logs, executablePath } = await open();
  const url = await goto(page, route);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`chromium: ${executablePath}`);
  console.log(`url:      ${url}`);
  console.log(`saved:    ${out}`);
  if (logs.length) console.log(`\nconsole:\n${logs.slice(0, 12).join('\n')}`);
}

// The accessibility state this app was recently fixed for. Regressions here
// are the most likely thing a UI change breaks, and they are invisible in a
// screenshot -- hence a real check rather than eyeballing.
async function auditPage(page) {
  return page.evaluate(() => {
    const unnamedControls = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.type === 'hidden' || el.offsetParent === null) continue;
      const name =
        el.getAttribute('aria-label') ||
        (el.labels && el.labels.length ? [...el.labels].map(l => l.textContent.trim()).join(' ') : '') ||
        el.getAttribute('title') || '';
      if (!name.trim()) unnamedControls.push(`${el.tagName.toLowerCase()}[type=${el.type}].${el.className.slice(0, 40)}`);
    }
    const unnamedButtons = [];
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      if (b.offsetParent === null) continue;
      const name = (b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || '').trim();
      if (!name) unnamedButtons.push(b.className.slice(0, 60));
    }
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map(d => ({
      name: d.getAttribute('aria-label') || d.getAttribute('aria-labelledby'),
      modal: d.getAttribute('aria-modal'),
    }));
    return {
      unnamedControls,
      unnamedButtons,
      dialogs,
      bodyOverflow: getComputedStyle(document.body).overflow,
      focused: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
    };
  });
}

async function cmdAudit(route = '/') {
  await assertServer();
  const { browser, page, logs } = await open();
  await goto(page, route);
  const r = await auditPage(page);
  console.log(`route: ${route}`);
  console.log(`unnamed form controls: ${r.unnamedControls.length}`);
  r.unnamedControls.forEach(x => console.log(`  - ${x}`));
  console.log(`unnamed buttons: ${r.unnamedButtons.length}`);
  r.unnamedButtons.forEach(x => console.log(`  - ${x}`));
  console.log(`open dialogs: ${JSON.stringify(r.dialogs)}`);
  if (logs.length) console.log(`\nconsole:\n${logs.slice(0, 12).join('\n')}`);
  await browser.close();
  if (r.unnamedControls.length || r.unnamedButtons.length) process.exit(1);
}

async function cmdSmoke() {
  await assertServer();
  mkdirSync(SHOTS, { recursive: true });
  const { browser, page, logs } = await open();
  const results = [];
  const ok = (n, c, extra = '') => {
    results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? '  -- ' + extra : ''}`);
    return c;
  };

  await goto(page, '/');
  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  ok('public site renders', !!h1, h1?.slice(0, 40));
  await page.screenshot({ path: join(SHOTS, 'public-site.png'), fullPage: true });

  // The app reload-loops without the route stub; prove the stub holds.
  const urlBefore = page.url();
  await page.waitForTimeout(2500);
  ok('page did not self-reload', page.url() === urlBefore);

  // Dialog behavior -- the job-application modal is the one dialog reachable
  // without a Supabase login.
  const trigger = page.getByRole('button', { name: 'Submit a general career application' });
  if (await trigger.count()) {
    await trigger.focus();
    await trigger.press('Enter');
    await page.waitForTimeout(700);

    const dlg = page.locator('[role="dialog"]');
    ok('dialog opens with role=dialog', (await dlg.count()) > 0);
    ok('dialog has aria-modal', (await dlg.first().getAttribute('aria-modal')) === 'true');
    ok('dialog has an accessible name', !!(await dlg.first().getAttribute('aria-label')),
      JSON.stringify(await dlg.first().getAttribute('aria-label')));
    ok('background scroll locked', (await page.evaluate(() => getComputedStyle(document.body).overflow)) === 'hidden');
    ok('focus moved into dialog', await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    }));
    await page.screenshot({ path: join(SHOTS, 'dialog-open.png'), fullPage: false });

    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    ok('focus trap holds over 12 Tabs', await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && d.contains(document.activeElement);
    }));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok('Escape closes dialog', (await page.locator('[role="dialog"]').count()) === 0);
    ok('focus restored to trigger',
      (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ===
      'Submit a general career application');
  } else {
    results.push('SKIP  dialog checks -- trigger button not found');
  }

  const a = await auditPage(page);
  ok('every visible form control is named', a.unnamedControls.length === 0, a.unnamedControls.join(' | ').slice(0, 160));
  ok('every visible button is named', a.unnamedButtons.length === 0, a.unnamedButtons.join(' | ').slice(0, 160));

  console.log(results.join('\n'));
  console.log(`\nscreenshots -> ${SHOTS}`);
  const realErrors = logs.filter(l =>
    !l.includes('Supabase is not configured') &&
    !l.includes('ERR_TUNNEL_CONNECTION_FAILED') &&
    !l.includes('Failed to load resource') &&
    !l.includes('was preloaded using link preload'));
  console.log(`\nunexpected console output: ${realErrors.length ? '\n' + realErrors.join('\n') : '(none)'}`);
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
}

/* ------------------------------------------------------------------- repl */

const HELP = `commands:
  goto <route>          navigate (default /)
  click <selector>      click by CSS selector
  clickrole <name>      click a button by accessible name
  type <sel> <text>     fill an input
  press <key>           keyboard press, e.g. Escape, Tab, Enter
  text <selector>       print textContent of first match
  count <selector>      print match count
  attr <sel> <name>     print an attribute
  eval <js>             evaluate JS in the page, print the result
  audit                 run the accessibility audit
  ss [name]             screenshot -> ${SHOTS}/<name>.png
  console               dump collected console errors/warnings
  url                   print current url
  help | quit`;

async function cmdRepl() {
  await assertServer();
  mkdirSync(SHOTS, { recursive: true });
  const { browser, page, logs, executablePath } = await open();
  console.log(`chromium: ${executablePath}`);
  await goto(page, '/');
  console.log(`READY ${page.url()}`); // <- ready marker for tmux polling

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const raw = line.trim();
    if (!raw) continue;
    const [cmd, ...rest] = raw.split(/\s+/);
    const arg = rest.join(' ');
    try {
      switch (cmd) {
        case 'goto': console.log(await goto(page, arg || '/')); break;
        case 'click': await page.click(arg, { timeout: 5000 }); console.log('clicked'); break;
        case 'clickrole':
          await page.getByRole('button', { name: arg }).first().click({ timeout: 5000 });
          console.log('clicked'); break;
        case 'type': {
          const sel = rest[0], val = rest.slice(1).join(' ');
          await page.fill(sel, val); console.log('filled'); break;
        }
        case 'press': await page.keyboard.press(arg); console.log(`pressed ${arg}`); break;
        case 'text': console.log(await page.locator(arg).first().textContent()); break;
        case 'count': console.log(await page.locator(arg).count()); break;
        case 'attr': console.log(await page.locator(rest[0]).first().getAttribute(rest[1])); break;
        case 'eval': console.log(JSON.stringify(await page.evaluate(arg), null, 2)); break;
        case 'audit': console.log(JSON.stringify(await auditPage(page), null, 2)); break;
        case 'ss': {
          const out = join(SHOTS, (rest[0] || 'shot') + '.png');
          await page.screenshot({ path: out, fullPage: true });
          console.log(`saved ${out}`); break;
        }
        case 'console': console.log(logs.length ? logs.join('\n') : '(none)'); break;
        case 'url': console.log(page.url()); break;
        case 'help': console.log(HELP); break;
        case 'quit': case 'exit': await browser.close(); process.exit(0); break;
        default: console.log(`unknown: ${cmd}\n${HELP}`);
      }
    } catch (e) {
      console.log(`ERR ${e.message.split('\n')[0]}`);
    }
    console.log('OK'); // <- per-command completion marker for tmux polling
  }
  await browser.close();
}

/* ------------------------------------------------------------------- main */

const [, , cmd, ...args] = process.argv;
switch (cmd) {
  case 'shot': await cmdShot(args[0], args[1]); break;
  case 'audit': await cmdAudit(args[0]); break;
  case 'smoke': await cmdSmoke(); break;
  case 'repl': await cmdRepl(); break;
  default:
    console.log(`usage: node driver.mjs <shot|audit|smoke|repl> [args]\n\n${HELP}`);
    process.exit(cmd ? 1 : 0);
}
