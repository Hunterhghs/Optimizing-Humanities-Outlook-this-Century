// Scaffold the next report in the series from its PDF:
//
//   npm run new -- "path/to/Report.pdf" [slug] [--number HH-2026-66]
//
// It copies the PDF to public/pdf/<slug>.pdf, renders page 1 as the cover
// (public/covers/<slug>.jpg), reads the page count and whatever title, subject
// and keywords are stamped in the PDF, and writes content/reports/<slug>.json
// with the next series number. The record starts as a draft: fill in the TODO
// fields, preview with `npm run dev`, then delete the "draft" line to publish.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

let number = '';
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--number') number = args[++i] || '';
  else if (args[i].startsWith('--number=')) number = args[i].slice('--number='.length);
  else positional.push(args[i]);
}
const [srcArg, slugArg] = positional;

const fail = (msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(1); };

if (!srcArg) fail('usage: npm run new -- "path/to/Report.pdf" [slug] [--number HH-2026-66]');
const src = srcArg.replace(/^~(?=\/)/, os.homedir());
if (!fs.existsSync(src)) fail(`No such file: ${src}`);
if (path.extname(src).toLowerCase() !== '.pdf') fail('The report must be a .pdf file.');
if (number && !/^HH-\d{4}-\d{2,}$/.test(number)) fail(`--number should look like HH-2026-66, got "${number}"`);

const slugify = (s) =>
  s.toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- what the PDF says about itself (needs poppler's pdfinfo; optional) ----
const info = {};
try {
  const out = execFileSync('pdfinfo', [src], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Za-z ]+?):\s+(.*)$/);
    if (m) info[m[1]] = m[2].trim();
  }
} catch {
  console.warn('\n  ! pdfinfo not found: set "pages" by hand (brew install poppler adds it).');
}

const fileTitle = path.basename(src, path.extname(src)).replace(/\s*[-–—]\s*H Heuristics$/i, '').trim();
const fullTitle = info.Title || fileTitle;
const cut = fullTitle.indexOf(': ');
const title = cut > 0 ? fullTitle.slice(0, cut).trim() : fullTitle;
const subtitle = cut > 0 ? fullTitle.slice(cut + 2).trim() : '';
const slug = slugArg ? slugify(slugArg) : slugify(title);
if (!slug) fail('Could not work out a slug: pass one as the second argument.');

const reportsDir = path.join(ROOT, 'content/reports');
const jsonPath = path.join(reportsDir, `${slug}.json`);
const pdfPath = path.join(ROOT, 'public/pdf', `${slug}.pdf`);
const coverPath = path.join(ROOT, 'public/covers', `${slug}.jpg`);
if (fs.existsSync(jsonPath)) fail(`content/reports/${slug}.json already exists. Choose another slug or edit that record.`);

const existing = fs.readdirSync(reportsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf8')));
const seriesNumber = Math.max(0, ...existing.map((r) => r.seriesNumber || 0)) + 1;
if (number && existing.some((r) => r.number === number)) fail(`${number} is already used in this series.`);

// ---- files ----
fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
fs.mkdirSync(path.dirname(coverPath), { recursive: true });
fs.copyFileSync(src, pdfPath);

// Cover = page 1 as a 900px-wide JPEG. pdftoppm first, macOS Quick Look second.
let cover = false;
try {
  execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '900', '-scale-to-y', '-1',
    '-jpeg', '-jpegopt', 'quality=86', pdfPath, coverPath.replace(/\.jpg$/, '')], { stdio: 'ignore' });
  cover = fs.existsSync(coverPath);
} catch { /* fall through */ }
if (!cover) {
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
    execFileSync('qlmanage', ['-t', '-s', '1200', '-o', tmp, pdfPath], { stdio: 'ignore' });
    const png = path.join(tmp, `${slug}.pdf.png`);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '86', '--resampleWidth', '900', png, '--out', coverPath], { stdio: 'ignore' });
    fs.rmSync(tmp, { recursive: true, force: true });
    cover = fs.existsSync(coverPath);
  } catch { /* no cover: the site works without one */ }
}

// ---- record ----
const today = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local time
const year = today.slice(0, 4);
const keywords = (info.Keywords || '').split(/[;,]/).map((k) => k.trim()).filter(Boolean);
const mb = fs.statSync(pdfPath).size / 1048576;

const record = {
  draft: true,
  slug,
  title,
  ...(subtitle ? { subtitle } : {}),
  authors: [(info.Author || 'Hunter Hughes').split(',')[0].trim()],
  published: today,
  language: 'en',
  pdf: `${slug}.pdf`,
  pages: Number(info.Pages || 0),
  dek: 'TODO: one or two sentences for cards, search results and social previews.',
  topics: ['TODO'],
  abstract: info.Subject ? [info.Subject, 'TODO: further abstract paragraphs, or delete this line.'] : ['TODO: abstract, one array item per paragraph.'],
  findings: ['TODO: a key finding, with its numbers.'],
  keywords: keywords.length ? keywords : ['TODO'],
  method: 'TODO: data and method note.',
  contents: ['TODO: 1. First section title'],
  backmatter: ['References'],
  doi: 'TODO: e.g. 10.5281/zenodo.1234567, or delete this line if there is no DOI',
  license: 'CC BY 4.0',
};
fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2) + '\n');

console.log(`\n  No. ${String(seriesNumber).padStart(2, '0')}  ${title}`);
console.log(`  ${'─'.repeat(46)}`);
console.log(`  pdf      public/pdf/${slug}.pdf  (${record.pages || '?'} pp, ${mb.toFixed(1)} MB)`);
console.log(`  cover    ${cover ? `public/covers/${slug}.jpg` : 'not generated (optional: add public/covers/' + slug + '.jpg)'}`);
console.log(`  record   content/reports/${slug}.json`);
if (mb > 25) console.log(`\n  ! The PDF is over 25 MB, which Cloudflare Pages will not accept. Compress it before publishing.`);
console.log(`\n  Next:`);
console.log(`    1. Fill in the TODO fields in content/reports/${slug}.json`);
console.log(`    2. npm run dev          preview at http://localhost:4321/reports/${slug}/`);
console.log(`    3. Delete the "draft": true line, then commit and push to publish\n`);
