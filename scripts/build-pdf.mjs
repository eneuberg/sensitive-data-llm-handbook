// Renders the built site to a single PDF.
// Strategy: walk the built site, concatenate all page bodies into one HTML
// document, hand that to Playwright, and print to PDF.
// Requires: `npm run build` first, plus `npx playwright install chromium`.
//
// Run: node scripts/build-pdf.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '..', 'dist');
const OUT  = join(ROOT, '..', 'handbook.pdf');

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

// Order of sections in the PDF. Matches sidebar order.
const SECTION_ORDER = [
  '',                  // index, how-to-use, cheat-sheet (root)
  'mental-models',
  'threats',
  'architecture',
  'patterns',
  'decisions',
  'implementation',
  'appendix',
];

function listHtmlFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) continue;
    if (name === 'index.html') out.push(full);
  }
  // Subdirectories: each section's pages are in dist/<section>/<slug>/index.html
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listHtmlFiles(full));
  }
  return out;
}

// Collect HTML by section, in declared order.
const byBase = (rel) => rel.split('/')[0] || '';
const allHtml = listHtmlFiles(DIST);
const ordered = [];
for (const section of SECTION_ORDER) {
  const matches = allHtml.filter((f) => {
    const rel = relative(DIST, f);
    return byBase(rel) === section;
  });
  matches.sort();
  ordered.push(...matches);
}

// Extract <main> content from each Starlight page.
function extractMain(html) {
  const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : html;
}

const sections = ordered.map((file) => {
  const html = readFileSync(file, 'utf8');
  return `<section class="page-break">${extractMain(html)}</section>`;
});

const combined = `<!doctype html>
<html><head><meta charset="utf-8"><title>Handbook</title>
<style>
  body { font: 11pt/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  h1 { page-break-before: always; border-bottom: 2px solid #444; padding-bottom: 0.3rem; }
  h1:first-of-type { page-break-before: auto; }
  pre, code { font-family: "JetBrains Mono", Menlo, monospace; }
  pre { background: #f5f5f5; padding: 0.6rem; border-radius: 4px; overflow-x: auto; font-size: 9pt; }
  table { border-collapse: collapse; margin: 0.8rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.3rem 0.5rem; }
  .page-break { page-break-after: always; }
  a { color: #0366d6; text-decoration: none; }
  /* Hide Starlight chrome that survived the <main> extraction. */
  starlight-toc, .sl-link-button, .pagination-links { display: none; }
</style>
</head><body>
${sections.join('\n')}
</body></html>`;

const tmp = join(ROOT, '..', 'dist', '_pdf-source.html');
writeFileSync(tmp, combined);

const { chromium } = await import('playwright').catch(() => {
  console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(tmp).toString(), { waitUntil: 'networkidle' });
await page.pdf({
  path: OUT,
  format: 'A4',
  margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  printBackground: true,
});
await browser.close();

console.log(`Wrote ${OUT}`);
