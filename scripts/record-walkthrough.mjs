/**
 * Records the "See it in motion" walkthrough video for gantryanalytics.com
 * straight from the live demo at https://demo.gantryanalytics.com.
 *
 *   npm install            (once, installs playwright)
 *   npx playwright install chromium   (once)
 *   node scripts/record-walkthrough.mjs
 *
 * Produces, at the repo root:
 *   gantry-platform.mp4   H.264 / yuv420p / faststart
 *   gantry-platform.webm  VP9
 *
 * Requires ffmpeg on PATH (brew install ffmpeg).
 *
 * The run is strictly read only: it navigates via the top nav links and never
 * clicks Process, Save, Export, or any other control that mutates demo state,
 * and it leaves the state selector on whatever the demo loads by default.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Raw capture goes to the OS temp dir on purpose. This repo lives inside Google
// Drive, and Chromium's video writes silently land as a zero byte file there.
const RAW_DIR = path.join(tmpdir(), 'gantry-walkthrough-raw');
const BASE_URL = 'https://demo.gantryanalytics.com';
const WIDTH = 1440;
const HEIGHT = 810;

/** Scroll to an absolute Y over `duration` ms in small steps, eased at both ends. */
async function smoothScrollTo(page, targetY, duration) {
  await page.evaluate(
    async ([targetY, duration]) => {
      const startY = window.scrollY;
      const delta = targetY - startY;
      const start = performance.now();
      // easeInOutSine — no abrupt starts or stops.
      const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
      await new Promise((resolve) => {
        function step(now) {
          const t = Math.min(1, (now - start) / duration);
          window.scrollTo(0, startY + delta * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    },
    [targetY, duration]
  );
}

/** Wait until every Chart.js canvas has painted and animations have settled. */
async function waitForCharts(page, settleMs = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .waitForFunction(
      () => {
        const canvases = [...document.querySelectorAll('canvas')];
        if (canvases.length === 0) return true;
        return canvases.every((c) => c.width > 0 && c.height > 0);
      },
      null,
      { timeout: 20000 }
    )
    .catch(() => {});
  await page.waitForTimeout(settleMs);
}

/**
 * Click a top nav link by its visible label and wait for the new page to settle.
 * The settle is deliberately short: the page load itself already reads as a pause
 * on camera, so a long settle here just adds dead air to the runtime.
 */
async function navTo(page, label) {
  // The nav bar is not sticky, so Playwright would snap the page to the top to
  // reach the link — an instant jump on camera. Glide back up first instead.
  const y = await page.evaluate(() => window.scrollY);
  if (y > 0) {
    await smoothScrollTo(page, 0, Math.min(1400, Math.max(600, y / 4)));
    await page.waitForTimeout(250);
  }
  await Promise.all([
    page.waitForLoadState('load'),
    page.locator('nav.main-nav a.nav-link', { hasText: new RegExp(`^${label}$`) }).first().click(),
  ]);
  await waitForCharts(page, 1200);
}

function ffmpeg(args) {
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

// ---------------------------------------------------------------- record ----

rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW_DIR, size: { width: WIDTH, height: HEIGHT } },
});
const contextStart = Date.now();
const page = await context.newPage();

// --- 1. Dashboard (~9s) ---------------------------------------------------
console.log('→ Dashboard');
await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
await waitForCharts(page, 3500);

// Everything before this instant is page load and is trimmed off later.
const sequenceStart = Date.now();

await page.waitForTimeout(2600); // hold on the impact tiles / review queue
await smoothScrollTo(page, 700, 3000); // ease down to the chart row
await page.waitForTimeout(1300); // hold: corridors, speeders, deterrence trend
await smoothScrollTo(page, 900, 900);
await page.waitForTimeout(900);

// --- 2. Insights (~13s) ---------------------------------------------------
console.log('→ Insights');
await navTo(page, 'Insights');

await page.waitForTimeout(1000); // hold on the hero KPI strip
await smoothScrollTo(page, 560, 1400); // bring up Most Dangerous Corridors
await page.waitForTimeout(1800); // linger on the marquee chart
await smoothScrollTo(page, 4500, 5200); // one continuous pass through the themed sections
await page.waitForTimeout(300);

// --- 3. Settings (~8s) ----------------------------------------------------
console.log('→ Settings');
await navTo(page, 'Settings');

// The whole control set — System Status, Leniency, Dedup, Repeat Offender — fits
// in one viewport here, so this stays a hold rather than a scroll.
await page.waitForTimeout(1400);
// Hover the leniency field to show it is interactive. Deliberately hover only:
// these inputs carry onchange="saveSettings()", so nothing here is clicked or edited.
await page.locator('#leniency').hover().catch(() => {});
await page.waitForTimeout(1000);
await smoothScrollTo(page, 130, 1600); // slight drift, keeping every control in frame
await page.waitForTimeout(1800); // final hold, so the loop back to Dashboard lands softly

const sequenceEnd = Date.now();

// Playwright finalizes the video asynchronously; closing the page then the context
// starts the flush, but the file can still be zero bytes for a moment afterwards.
const rawPath = await page.video().path();
await page.close();
await context.close();
await browser.close();

let lastSize = -1;
for (let i = 0; i < 120; i++) {
  const size = existsSync(rawPath) ? statSync(rawPath).size : 0;
  if (size > 0 && size === lastSize) break; // written and no longer growing
  lastSize = size;
  await sleep(500);
}
if (lastSize <= 0) throw new Error('Playwright wrote no video data to ' + rawPath);

const trimStart = (sequenceStart - contextStart) / 1000;
const duration = (sequenceEnd - sequenceStart) / 1000;
console.log(`raw capture: trim ${trimStart.toFixed(2)}s from start, keep ${duration.toFixed(2)}s`);

// ---------------------------------------------------------------- encode ----

const mp4 = path.join(ROOT, 'gantry-platform.mp4');
const webm = path.join(ROOT, 'gantry-platform.webm');

// Trim the load-in frames off the head and any stray frames off the tail, then
// re-encode. -ss before -i seeks fast; the raw capture is all keyframe-friendly VP8.
const trimArgs = ['-y', '-ss', trimStart.toFixed(2), '-t', duration.toFixed(2), '-i', rawPath];

console.log('→ encoding gantry-platform.mp4');
ffmpeg([
  ...trimArgs,
  '-an',
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '29',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  mp4,
]);

console.log('→ encoding gantry-platform.webm');
ffmpeg([
  ...trimArgs,
  '-an',
  '-c:v', 'libvpx-vp9',
  '-crf', '38',
  '-b:v', '0',
  '-row-mt', '1',
  '-deadline', 'good',
  '-cpu-used', '2',
  '-pix_fmt', 'yuv420p',
  webm,
]);

// KEEP_RAW=1 leaves the capture in place so the encode can be retuned without
// re-recording the whole run.
if (!process.env.KEEP_RAW) rmSync(RAW_DIR, { recursive: true, force: true });
else console.log('raw kept at ' + rawPath);

for (const f of [mp4, webm]) {
  if (!existsSync(f)) throw new Error('encode failed: ' + f);
  const probe = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration,size',
    '-of', 'default=nw=1',
    f,
  ]).toString().trim().replace(/\n/g, '  ');
  console.log(path.basename(f) + '  ' + probe);
}
console.log('\nDone. Bump the ?v= cache buster on both <source> tags in index.html.');
