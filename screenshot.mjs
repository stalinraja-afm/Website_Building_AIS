import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

// Usage: node screenshot.mjs <url> [label] [--mobile] [--viewport] [--width=N] [--height=N] [--dpr=N]
const url = process.argv[2] || 'http://localhost:8080';
const rest = process.argv.slice(3);
const label = rest.find((a) => !a.startsWith('--'));
const flag = (name) => rest.includes(`--${name}`);
const num = (name, fallback) => {
  const hit = rest.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const mobile = flag('mobile');
const width = num('width', mobile ? 390 : 1440);
const height = num('height', mobile ? 844 : 900);
const dpr = num('dpr', mobile ? 2 : 1);
const fullPage = !flag('viewport');

const outDir = path.join(process.cwd(), 'temporary screenshots');
fs.mkdirSync(outDir, { recursive: true });

const used = fs
  .readdirSync(outDir)
  .map((f) => /^screenshot-(\d+)/.exec(f))
  .filter(Boolean)
  .map((m) => Number(m[1]));
const n = used.length ? Math.max(...used) + 1 : 1;

const outPath = path.join(outDir, label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`);

// Chrome silently corrupts captures taller than this, repeating slices of the page.
const MAX_CAPTURE_PX = 16384;

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  let scale = dpr;
  await page.setViewport({ width, height, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // Let the hero's staggered terminal reveal (up to ~2.1s of delays) finish before capturing.
  await new Promise((r) => setTimeout(r, num('wait', 2800)));
  const scrollY = num('scroll', 0);
  if (scrollY) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await new Promise((r) => setTimeout(r, 500));
  }
  if (fullPage) {
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const maxScale = Math.max(1, Math.floor(MAX_CAPTURE_PX / pageHeight));
    if (scale > maxScale) {
      console.warn(`Page is ${pageHeight}px tall; dropping scale ${scale}x -> ${maxScale}x to stay under the ${MAX_CAPTURE_PX}px capture limit.`);
      scale = maxScale;
      await page.setViewport({ width, height, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
    }
  }

  await page.screenshot({ path: outPath, fullPage });
  console.log(`Saved ${outPath}  (${width}x${height} @${scale}x, ${fullPage ? 'full page' : 'viewport'})`);
} finally {
  await browser.close();
}
