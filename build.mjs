// ---------------------------------------------------------------------------
// Optimizing Humanity's Outlook This Century — series site generator.
//
//   node build.mjs            →  dist/   (published reports only)
//   node build.mjs --drafts   →  dist/   (also builds records marked draft)
//
// No dependencies. Reads content/reports/*.json plus public/, and emits a
// static site in which every report has its own page carrying the abstract,
// structured metadata, Google Scholar citation tags and a button that opens
// the PDF in the browser.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config, { isProduction } from './site.config.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const SITE = config.siteUrl;
const WITH_DRAFTS = process.argv.includes('--drafts');

// Cloudflare Pages rejects any single file above 25 MiB.
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

// Fingerprint assets so a changed file gets a new URL; /assets is cached for a week.
const assetVersion = (file) =>
  crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'assets', file))).digest('hex').slice(0, 8);
const CSS_VERSION = assetVersion('styles.css');
const JS_VERSION = assetVersion('site.js');

const FONTS =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&display=swap';

/* ------------------------------------------------------------------ utils */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Strip inline markdown for use inside meta tag content.
const plain = (s) =>
  String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');

// Minimal inline markdown: **strong**, *em*, [text](url with balanced parens).
function inline(s) {
  let out = esc(s);
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:[^()\s]|\((?:[^()\s]*)\))*)\)/g,
    (_m, label, href) => `<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
const LANGUAGES = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese' };

function fmtDate(iso, short = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]} ${y}`;
}
const year = (iso) => iso.slice(0, 4);
const scholarDate = (iso) => iso.replace(/-/g, '/');
const fmtBytes = (b) => (b >= 1e6 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pad2 = (n) => String(n).padStart(2, '0');
const seriesNo = (r) => `No. ${pad2(r.seriesNumber)}`;
const bareDoi = (doi) => doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');

function write(rel, contents) {
  const dest = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
}

// Copies a directory tree, leaving out any file whose path (relative to the
// top of the tree) is in `exclude`.
function copyDir(from, to, exclude = new Set(), rel = '') {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) n += copyDir(src, dst, exclude, relPath);
    else if (!exclude.has(relPath)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++; }
  }
  return n;
}

// Width and height of a JPEG, read from its frame header, so cover images can
// reserve their space before they load.
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/* ------------------------------------------------------------------- data */

const REQUIRED = ['slug', 'seriesNumber', 'number', 'title', 'authors', 'published', 'pdf', 'pages', 'dek', 'abstract', 'keywords'];
const isPlaceholder = (v) => typeof v === 'string' && /\bTODO\b/.test(v);

function validate(r, file) {
  const errs = [];
  const bad = (msg) => errs.push(`${file}: ${msg}`);
  const pending = (v) => r.draft && isPlaceholder(v);   // drafts may still hold placeholders
  for (const k of REQUIRED) {
    const v = r[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) bad(`missing "${k}"`);
  }
  if (r.slug && `${r.slug}.json` !== file) bad(`slug "${r.slug}" must match the file name`);
  if (r.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug)) bad('slug must be lower-case words joined by hyphens');
  if (r.seriesNumber !== undefined && !(Number.isInteger(r.seriesNumber) && r.seriesNumber > 0)) bad('"seriesNumber" must be a whole number, 1 or more');
  if (r.number && !pending(r.number) && !/^HH-\d{4}-\d{2,}$/.test(r.number)) bad(`"number" should look like HH-2026-65, got "${r.number}"`);
  for (const k of ['published', 'updated']) {
    if (r[k] && (!/^\d{4}-\d{2}-\d{2}$/.test(r[k]) || Number.isNaN(Date.parse(r[k])))) bad(`"${k}" must be a YYYY-MM-DD date`);
  }
  if (r.pages !== undefined && !(Number.isInteger(r.pages) && r.pages > 0)) bad('"pages" must be a whole number');
  if (r.license && !config.licenses[r.license]) bad(`unknown licence "${r.license}" (known: ${Object.keys(config.licenses).join(', ')})`);
  if (r.doi && !pending(r.doi) && !/^10\.\d{4,9}\/\S+$/.test(bareDoi(r.doi))) bad(`"doi" does not look like a DOI: ${r.doi}`);
  if (!r.draft && /\bTODO\b/.test(JSON.stringify(r))) bad('still contains TODO placeholders (fill them in, or keep "draft": true)');
  if (r.pdf) {
    const pdfPath = path.join(ROOT, 'public/pdf', r.pdf);
    if (!fs.existsSync(pdfPath)) bad(`PDF not found at public/pdf/${r.pdf}`);
    else if (fs.statSync(pdfPath).size > MAX_ASSET_BYTES)
      bad(`public/pdf/${r.pdf} is ${fmtBytes(fs.statSync(pdfPath).size)}; Cloudflare Pages accepts files up to 25 MB, so compress it first`);
  }
  return errs;
}

function loadReports() {
  const dir = path.join(ROOT, 'content/reports');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const errors = [];
  const skipped = [];
  const reports = [];

  for (const file of files) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch (e) { errors.push(`${file}: not valid JSON (${e.message})`); continue; }
    if (r.draft && !WITH_DRAFTS) { skipped.push({ slug: r.slug || file.replace(/\.json$/, ''), pdf: r.pdf }); continue; }
    const errs = validate(r, file);
    if (errs.length) { errors.push(...errs); continue; }

    const pdfPath = path.join(ROOT, 'public/pdf', r.pdf);
    const coverRel = `covers/${r.slug}.jpg`;
    const coverPath = path.join(ROOT, 'public', coverRel);
    const cover = fs.existsSync(coverPath)
      ? { url: `/${coverRel}`, absUrl: `${SITE}/${coverRel}`, ...(jpegSize(coverPath) || {}) }
      : null;

    reports.push({
      language: 'en',
      topics: [],
      findings: [],
      contents: [],
      ...r,
      doi: isPlaceholder(r.doi) ? null : r.doi,
      updated: r.updated || r.published,
      url: `/reports/${r.slug}/`,
      absUrl: `${SITE}/reports/${r.slug}/`,
      pdfUrl: `/pdf/${r.pdf}`,
      pdfAbsUrl: `${SITE}/pdf/${r.pdf}`,
      bytes: fs.statSync(pdfPath).size,
      cover,
    });
  }

  for (const key of ['slug', 'seriesNumber', 'number']) {
    const seen = new Map();
    for (const r of reports) {
      if (isPlaceholder(r[key])) continue;
      if (seen.has(r[key])) errors.push(`${r.slug}.json: "${key}" ${r[key]} is already used by ${seen.get(r[key])}.json`);
      seen.set(r[key], r.slug);
    }
  }

  if (errors.length) {
    console.error(`\n  Build stopped: ${plural(errors.length, 'problem')} in content/reports\n`);
    for (const e of errors) console.error(`    ✗ ${e}`);
    console.error('');
    process.exit(1);
  }
  if (!reports.length) {
    console.error('\n  Build stopped: there are no published reports in content/reports.\n');
    process.exit(1);
  }

  // Newest first: highest series number at the top.
  reports.sort((a, b) => b.seriesNumber - a.seriesNumber);
  return { reports, skipped };
}

function buildTopics(reports) {
  const map = new Map();
  for (const r of reports) for (const t of r.topics) map.set(t, (map.get(t) || 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// "published between X and Y", or "published on X" when everything shares a date.
function publishedSpan(reports) {
  const first = reports.at(-1).published;
  const last = reports[0].published;
  return first === last ? `published on ${fmtDate(first)}` : `published between ${fmtDate(first)} and ${fmtDate(last)}`;
}

/* ---------------------------------------------------------------- citation */

const licenceOf = (r) => config.licenses[r.license] || config.license;
const doiUrl = (r) => (r.doi ? `https://doi.org/${bareDoi(r.doi)}` : null);

function surnameFirst(name) {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop();
  return parts.length ? `${last}, ${parts.join(' ')}` : last;
}
const initialise = (name) => {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop();
  return `${last}, ${parts.map((p) => p[0] + '.').join(' ')}`;
};
const surname = (name) => name.trim().split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '');

function citations(r) {
  const y = year(r.published);
  const apaAuthors = r.authors.map(initialise);
  const authorsApa = apaAuthors.length > 1
    ? `${apaAuthors.slice(0, -1).join(', ')}, & ${apaAuthors.at(-1)}`
    : apaAuthors[0];
  const authorsChi = [surnameFirst(r.authors[0]), ...r.authors.slice(1)].join(', and ');
  const key = `${surname(r.authors[0])}${y}${r.slug.split('-')[0]}`;
  const locator = doiUrl(r) || r.absUrl;   // a DOI is the stabler citation target
  return {
    APA: `${authorsApa} (${y}). ${r.title} (${config.citationSeries} No. ${r.number}). ${config.publisher}. ${locator}`,
    Chicago: `${authorsChi}. "${r.title}." ${config.citationSeries} ${r.number}. ${config.publisher}, ${y}. ${locator}.`,
    BibTeX: [
      `@techreport{${key},`,
      `  title       = {${r.title}},`,
      `  author      = {${r.authors.join(' and ')}},`,
      `  institution = {${config.publisher}},`,
      `  type        = {${config.citationSeries}},`,
      `  number      = {${r.number}},`,
      `  year        = {${y}},`,
      `  month       = {${MONTHS[Number(r.published.slice(5, 7)) - 1].toLowerCase().slice(0, 3)}},`,
      ...(r.doi ? [`  doi         = {${bareDoi(r.doi)}},`] : []),
      `  url         = {${r.absUrl}}`,
      `}`,
    ].join('\n'),
  };
}

/* ------------------------------------------------------------------- marks */

const ICON = {
  open: `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.25 3.75H3.75v8.5h8.5v-2.5M9.25 3.75h3v3M12.25 3.75 7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2.75v7.5M4.75 7.25 8 10.5l3.25-3.25M3.25 13.25h9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrow: `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// The series mark: a sun on the horizon.
const GLYPH = `<svg class="glyph" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" fill="var(--glyph-bg, #0E4A38)"/><path d="M9 20.5a7 7 0 0 1 14 0z" fill="#F5A93B"/><path d="M6 20.5h20" stroke="#F2F6F3" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/* ------------------------------------------------------------------ layout */

function layout({ title, description, canonical, head = '', body, cls = '', activeNav = '', noindex = false, latest }) {
  const fullTitle = title === config.series ? `${config.series} · ${config.org}` : `${title} · ${config.seriesShort} · ${config.org}`;
  const nav = config.nav
    .map((n) => `<a href="${n.href}"${activeNav === n.href ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
    .join('');
  const contact = config.email
    ? `<a href="mailto:${esc(config.email)}">Contact</a>`
    : `<a href="${esc(config.contactUrl)}" rel="noopener">Contact</a>`;

  return `<!doctype html>
<html lang="${config.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${isProduction && !noindex ? '' : '<meta name="robots" content="noindex, nofollow">\n'}<meta name="theme-color" content="#F3F5F1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#08130F" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.series)} — ${esc(config.org)}" href="${SITE}/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS.replace(/&/g, '&amp;')}">
<link rel="stylesheet" href="/assets/styles.css?v=${CSS_VERSION}">
${head}<meta property="og:site_name" content="${esc(config.series)} · ${esc(config.org)}">
<meta property="og:locale" content="en_GB">
</head>
<body class="${cls}">
<a class="skip" href="#main">Skip to content</a>

<header class="top">
  <div class="wrap top__inner">
    <a class="brand" href="/" aria-label="${esc(config.series)} — home">
      ${GLYPH}
      <span class="brand__text" aria-hidden="true">
        <span class="brand__name"><span class="brand__full">${esc(config.series)}</span><span class="brand__short">${esc(config.seriesShort)}</span></span>
        <span class="brand__by">An ${esc(config.org)} research series</span>
      </span>
    </a>
    <nav class="nav" aria-label="Primary">
      ${nav}
      ${latest ? `<a class="btn btn--solid btn--sm nav__cta" href="${latest.url}">Latest report ${ICON.arrow}</a>` : ''}
    </nav>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="foot">
  <div class="wrap">
    <div class="foot__top">
      <div class="foot__brand">
        ${GLYPH}
        <p class="foot__name">${esc(config.series)}</p>
        <p class="foot__note">An open-access research report series by ${esc(config.org)}. Concepts are offered as proposed frameworks open to testing; projections are scenarios, not forecasts.</p>
      </div>
      <nav class="foot__col" aria-label="The series">
        <h2 class="foot__h">The series</h2>
        <a href="/reports/">All reports</a>
        <a href="/about/">About the series</a>
        <a href="/about/#citation">How to cite</a>
        <a href="/feed.xml">RSS feed</a>
        <a href="/reports.json">Metadata (JSON)</a>
      </nav>
      <nav class="foot__col" aria-label="${esc(config.org)}">
        <h2 class="foot__h">${esc(config.org)}</h2>
        ${config.elsewhere.map((x) => `<a href="${esc(x.url)}" rel="noopener">${esc(x.name)}</a>`).join('\n        ')}
        ${contact}
      </nav>
    </div>
    <div class="foot__legal">
      <p>© ${new Date().getFullYear()} ${esc(config.org)} · ${esc(config.author)}</p>
      <p>Open access · each report states its own licence</p>
    </div>
  </div>
</footer>

<script src="/assets/site.js?v=${JS_VERSION}" defer></script>
</body>
</html>
`;
}

/* --------------------------------------------------------------- fragments */

function topicChips(r, linked) {
  if (!r.topics.length) return '';
  return `<ul class="tags">${r.topics
    .map((t) =>
      linked
        ? `<li><a class="tag" href="/reports/?topic=${encodeURIComponent(t)}">${esc(t)}</a></li>`
        : `<li><span class="tag">${esc(t)}</span></li>`
    )
    .join('')}</ul>`;
}

// The cover image, or a typeset stand-in when a report has no cover file.
function coverArt(r, { lazy = true } = {}) {
  if (r.cover) {
    const dims = r.cover.width ? ` width="${r.cover.width}" height="${r.cover.height}"` : '';
    return `<img src="${r.cover.url}" alt="Cover of ${esc(r.title)}"${dims}${lazy ? ' loading="lazy"' : ''} decoding="async">`;
  }
  return `<span class="coverph"><span class="coverph__no">${seriesNo(r)}</span><span class="coverph__title">${esc(r.title)}</span><span class="coverph__by">${esc(config.org)}</span></span>`;
}

const openPdf = (r, cls = 'btn btn--sun', label = 'Open PDF in browser') =>
  `<a class="${cls}" href="${r.pdfUrl}" target="_blank" rel="noopener" type="application/pdf">${ICON.open}<span>${label}</span></a>`;

const draftFlag = (r) => (r.draft ? ' <span class="flag">Draft</span>' : '');

const kicker = (n, label) => `<p class="kicker"><span class="kicker__n">${pad2(n)}</span>${esc(label)}</p>`;

function card(r) {
  return `<article class="card" data-entry data-topics="${esc(r.topics.join('|'))}" data-search="${esc(
    [r.title, r.subtitle || '', r.dek, r.number, r.keywords.join(' '), r.topics.join(' ')].join(' ').toLowerCase()
  )}">
  <a class="card__cover" href="${r.url}" tabindex="-1" aria-hidden="true">${coverArt(r)}</a>
  <div class="card__body">
    <p class="card__meta"><span class="card__no">${seriesNo(r)}</span><time datetime="${r.published}">${fmtDate(r.published, true)}</time><span>${r.pages} pp</span></p>
    <h3 class="card__title"><a href="${r.url}">${esc(r.title)}</a>${draftFlag(r)}</h3>
    ${r.subtitle ? `<p class="card__sub">${esc(r.subtitle)}</p>` : ''}
    <p class="card__dek">${esc(r.dek)}</p>
    <p class="card__links">
      ${openPdf(r, 'btn btn--sun btn--sm', 'Open PDF')}
      <a class="more" href="${r.url}">Abstract &amp; details ${ICON.arrow}</a>
    </p>
  </div>
</article>`;
}

function centuryBlock() {
  const c = config.century;
  if (!c) return '';
  const pos = (y) => (((y - c.start) / (c.end - c.start)) * 100).toFixed(2);
  const major = new Set([c.start, c.end, Math.round((c.start + c.end) / 2 / 10) * 10 - 10]);
  return `
<section class="century" aria-label="The century, ${c.start} to ${c.end}">
  <div class="wrap">
    <div class="century__axis" aria-hidden="true">
      ${c.ticks
        .map((y, i) => {
          const cls = ['tick', major.has(y) ? 'tick--major' : '', i === 0 ? 'tick--first' : '', i === c.ticks.length - 1 ? 'tick--last' : '']
            .filter(Boolean).join(' ');
          return `<span class="${cls}" style="left:${pos(y)}%"><i></i><b>${y}</b></span>`;
        })
        .join('')}
    </div>
    <ul class="century__windows">
      ${c.windows
        .map(
          (w) => `<li>
        <span class="century__track"><span class="century__bar" style="width:${pos(w.to)}%"></span></span>
        <p><strong>${esc(w.name)}</strong> ${esc(w.text)}</p>
      </li>`
        )
        .join('\n      ')}
    </ul>
    <p class="century__note">${esc(c.note)}</p>
  </div>
</section>`;
}

function benchmarkBlock(n) {
  const b = config.benchmark;
  if (!b) return '';
  const max = b.max || Math.max(...b.rows.map((x) => x.value));
  const fmt = (v) => (b.unit === '%' ? `<b>${v}</b>%` : `<b>${v}</b> ${esc(b.unit)}`);
  return `
<section class="band" id="benchmark">
  <div class="wrap">
    <header class="sechead">
      ${kicker(n, 'The scenarios')}
      <h2 class="sechead__h">${esc(b.measure)}</h2>
    </header>
    <div class="bench">
      <dl class="bench__rows">
        ${b.rows
          .map(
            (x) => `<div class="bench__row${x.highlight ? ' is-pick' : ''}${x.muted ? ' is-muted' : ''}">
          <dt>${x.when ? `<span class="bench__when">${esc(x.when)}</span>` : ''}${esc(x.label)}</dt>
          <dd>
            <span class="bench__track"><span class="bench__bar" style="width:${((x.value / max) * 100).toFixed(1)}%"></span></span>
            <span class="bench__val">${fmt(x.value)}</span>
          </dd>
        </div>`
          )
          .join('\n        ')}
      </dl>
      <aside class="bench__gap">
        ${b.gap ? `<p class="bench__gapnum">${esc(b.gap.value)}</p><p class="bench__gaptext">${esc(b.gap.text)}</p>` : ''}
        <p class="bench__note">${esc(b.note)}${b.source ? ` <a href="${b.source}">See the report</a>.` : ''}</p>
      </aside>
    </div>
  </div>
</section>`;
}

/* ------------------------------------------------------------------- pages */

function pageHome(reports, linkTopics) {
  const [lead, ...others] = reports;
  const rest = others.slice(0, config.homeCount);
  const allCcBy = reports.every((r) => licenceOf(r).name === 'CC BY 4.0');
  const allDoi = reports.every((r) => r.doi);
  let n = 0;

  const body = `
<section class="hero">
  <div class="sun" aria-hidden="true"></div>
  <div class="wrap hero__inner">
    <p class="hero__kicker">${esc(config.kicker)}</p>
    <h1 class="hero__title">${inline(config.hero.title)}</h1>
    <p class="hero__lede">${esc(config.hero.lede)}</p>
    <p class="hero__actions">
      <a class="btn btn--solid" href="${lead.url}">Read the latest report ${ICON.arrow}</a>
      <a class="btn btn--line" href="/reports/">${reports.length > 1 ? `Browse all ${reports.length} reports` : 'Browse the series'}</a>
    </p>
    <ul class="hero__facts">
      <li><b>${reports.length}</b> ${reports.length === 1 ? 'report' : 'reports'}</li>
      <li>Open access</li>
      ${allCcBy ? '<li>CC BY 4.0</li>' : ''}
      ${allDoi ? '<li>DOI-registered</li>' : ''}
    </ul>
  </div>
</section>
${centuryBlock()}

<section class="band" id="latest">
  <div class="wrap">
    <header class="sechead">
      ${kicker(++n, 'Latest report')}
    </header>
    <article class="feature">
      <a class="feature__cover" href="${lead.url}" tabindex="-1" aria-hidden="true">${coverArt(lead, { lazy: false })}</a>
      <div class="feature__body">
        <p class="feature__meta"><span>${seriesNo(lead)}</span><span>${esc(lead.number)}</span><time datetime="${lead.published}">${fmtDate(lead.published)}</time><span>${lead.pages} pages</span></p>
        <h3 class="feature__title"><a href="${lead.url}">${esc(lead.title)}</a>${draftFlag(lead)}</h3>
        ${lead.subtitle ? `<p class="feature__sub">${esc(lead.subtitle)}</p>` : ''}
        <p class="feature__dek">${esc(lead.dek)}</p>
        <p class="feature__actions">
          ${openPdf(lead)}
          <a class="btn btn--onpanel" href="${lead.url}">Abstract &amp; details</a>
        </p>
      </div>
    </article>
  </div>
</section>

<section class="band band--alt" id="question">
  <div class="wrap">
    <header class="sechead">
      ${kicker(++n, 'What the series asks')}
    </header>
    <div class="question">
      <div class="question__main">
        <p class="question__lede">${esc(config.question.lede)}</p>
        <p class="question__text">${esc(config.question.text)}</p>
        <p><a class="more" href="/about/">About the series ${ICON.arrow}</a></p>
      </div>
      <ol class="threads" aria-label="Lines of inquiry">
        ${config.threads
          .map((t, i) => `<li><span class="threads__n">${i + 1}</span><h3>${esc(t.name)}</h3><p>${esc(t.text)}</p></li>`)
          .join('\n        ')}
      </ol>
    </div>
  </div>
</section>
${benchmarkBlock(config.benchmark ? ++n : n)}

<section class="band${config.benchmark ? ' band--alt' : ''}" id="reports">
  <div class="wrap">
    <header class="sechead sechead--row">
      <div>
        ${kicker(++n, 'The series')}
        <h2 class="sechead__h">${rest.length ? 'More reports' : 'One report so far, more to come'}</h2>
      </div>
      ${reports.length > 1 ? `<a class="more" href="/reports/">All ${reports.length} reports ${ICON.arrow}</a>` : ''}
    </header>
    ${
      rest.length
        ? `<div class="cards">${rest.map(card).join('\n')}</div>${
            others.length > rest.length ? `<p class="cards__more"><a class="btn btn--line" href="/reports/">Browse all ${reports.length} reports</a></p>` : ''
          }`
        : `<p class="upcoming">${esc(seriesNo(lead))} opens the series. Further reports are published one at a time, and each gets its own page here with its abstract, metadata and full PDF. New reports are announced on the <a href="/feed.xml">RSS feed</a>.</p>`
    }
  </div>
</section>`;

  const head = `<meta property="og:type" content="website">
<meta property="og:title" content="${esc(config.series)}">
<meta property="og:description" content="${esc(config.description)}">
<meta property="og:url" content="${SITE}/">
${lead.cover ? `<meta property="og:image" content="${lead.cover.absUrl}">\n` : ''}<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        name: config.series,
        url: `${SITE}/`,
        description: config.description,
        inLanguage: config.language,
        publisher: { '@id': `${SITE}/#publisher` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE}/#publisher`,
        name: config.org,
        url: config.orgUrl,
        slogan: config.orgTagline,
        founder: { '@type': 'Person', name: config.author },
      },
      {
        '@type': 'CreativeWorkSeries',
        '@id': `${SITE}/#series`,
        name: config.series,
        url: `${SITE}/`,
        description: config.description,
        publisher: { '@id': `${SITE}/#publisher` },
        hasPart: reports.map((r) => ({ '@type': 'Report', name: r.title, url: r.absUrl, position: r.seriesNumber })),
      },
    ],
  })}</script>
`;

  return layout({ title: config.series, description: config.description, canonical: `${SITE}/`, head, body, cls: 'page-home', latest: lead });
}

function pageReports(reports, topics) {
  const filters = reports.length >= config.filterThreshold;

  const body = `
<section class="pagehead">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Reports</span></nav>
    <h1 class="pagehead__title">Every report in the <em>series</em></h1>
    <p class="pagehead__lede">${plural(reports.length, 'report')}, ${publishedSpan(reports)}${reports.length > 1 ? ', newest first' : ''}. Each has its own page with the abstract, key findings and metadata, and a button that opens the full PDF in your browser.</p>
  </div>
</section>

<section class="band band--flush">
  <div class="wrap">
    ${
      filters
        ? `<form class="filters" role="search" data-filters>
      <div class="filters__search">
        <label class="sr-only" for="q">Search reports</label>
        <input id="q" type="search" placeholder="Search titles, topics, keywords…" autocomplete="off" data-filter-input>
      </div>
      ${
        topics.length > 1
          ? `<div class="filters__topics" role="group" aria-label="Filter by topic">
        <button type="button" class="chip is-active" data-topic="">All</button>
        ${topics.map((t) => `<button type="button" class="chip" data-topic="${esc(t.name)}">${esc(t.name)}</button>`).join('')}
      </div>`
          : ''
      }
    </form>
    <div class="listbar">
      <p class="filters__count" data-filter-count hidden></p>
      <nav class="pager" aria-label="Report pages" data-pager hidden></nav>
    </div>`
        : ''
    }
    <div class="cards"${filters ? ` data-filter-list data-page-size="${config.pageSize}"` : ''}>${reports.map(card).join('\n')}</div>
    ${filters ? `<p class="empty" data-filter-empty hidden>No reports match that filter.</p>
    <nav class="pager pager--foot" aria-label="Report pages" data-pager hidden></nav>` : ''}
  </div>
</section>`;

  const description = `All ${plural(reports.length, 'report')} in the ${config.series} series from ${config.org}, each with its abstract, metadata and full PDF.`;
  const head = `<meta property="og:type" content="website">
<meta property="og:title" content="Reports · ${esc(config.series)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}/reports/">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Reports — ${config.series}`,
    url: `${SITE}/reports/`,
    isPartOf: { '@type': 'WebSite', name: config.series, url: `${SITE}/` },
    hasPart: reports.map((r) => ({ '@type': 'Report', name: r.title, url: r.absUrl, position: r.seriesNumber })),
  })}</script>
`;

  return layout({ title: 'Reports', description, canonical: `${SITE}/reports/`, head, body, activeNav: '/reports/', latest: reports[0] });
}

function tocRow(raw) {
  const m = String(raw).match(/^(\d+)[.)]?\s+(.*)$/);
  return `<li><span class="toc__n">${m ? pad2(m[1]) : '·'}</span><span>${esc(m ? m[2] : String(raw))}</span></li>`;
}

function pageReport(r, reports, linkTopics) {
  const cite = citations(r);
  const lic = licenceOf(r);
  const doi = doiUrl(r);
  const idx = reports.indexOf(r);
  const newer = reports[idx - 1];
  const older = reports[idx + 1];
  const abstractText = r.abstract.map(plain).join(' ');
  const backmatter = r.backmatter || [];

  // Google Scholar citation metadata (technical-report profile) + Dublin Core.
  const head = `<meta name="citation_title" content="${esc(r.title)}">
${r.authors.map((a) => `<meta name="citation_author" content="${esc(surnameFirst(a))}">`).join('\n')}
<meta name="citation_author_institution" content="${esc(config.publisher)}">
<meta name="citation_publication_date" content="${scholarDate(r.published)}">
<meta name="citation_online_date" content="${scholarDate(r.published)}">
<meta name="citation_technical_report_institution" content="${esc(config.publisher)}">
<meta name="citation_technical_report_number" content="${esc(r.number)}">
<meta name="citation_publisher" content="${esc(config.publisher)}">
<meta name="citation_language" content="${r.language}">
<meta name="citation_keywords" content="${esc(r.keywords.join('; '))}">
<meta name="citation_abstract_html_url" content="${r.absUrl}">
<meta name="citation_pdf_url" content="${r.pdfAbsUrl}">
<meta name="citation_firstpage" content="1">
<meta name="citation_lastpage" content="${r.pages}">
${r.doi ? `<meta name="citation_doi" content="${esc(bareDoi(r.doi))}">\n` : ''}
<meta name="DC.title" content="${esc(r.title)}">
${r.authors.map((a) => `<meta name="DC.creator" content="${esc(a)}">`).join('\n')}
<meta name="DC.date" content="${r.published}">
<meta name="DC.publisher" content="${esc(config.publisher)}">
<meta name="DC.type" content="Text">
<meta name="DC.format" content="application/pdf">
<meta name="DC.identifier" content="${r.absUrl}">
${doi ? `<meta name="DC.identifier" scheme="DCTERMS.URI" content="${doi}">\n` : ''}<meta name="DC.language" content="${r.language}">
<meta name="DC.rights" content="${esc(lic.name)}">
<meta name="DC.relation.ispartof" content="${esc(config.series)}">
<meta name="DC.description" content="${esc(plain(r.abstract[0]))}">
<meta name="DC.subject" content="${esc(r.keywords.join('; '))}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(r.title)}">
<meta property="og:description" content="${esc(r.dek)}">
<meta property="og:url" content="${r.absUrl}">
${r.cover ? `<meta property="og:image" content="${r.cover.absUrl}">\n${r.cover.width ? `<meta property="og:image:width" content="${r.cover.width}">\n<meta property="og:image:height" content="${r.cover.height}">\n` : ''}` : ''}<meta property="article:published_time" content="${r.published}">
<meta property="article:modified_time" content="${r.updated}">
${r.authors.map((a) => `<meta property="article:author" content="${esc(a)}">`).join('\n')}
${r.topics.map((t) => `<meta property="article:tag" content="${esc(t)}">`).join('\n')}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(r.title)}">
<meta name="twitter:description" content="${esc(r.dek)}">
<link rel="alternate" type="application/pdf" href="${r.pdfAbsUrl}" title="${esc(r.title)} (PDF)">
${newer ? `<link rel="next" href="${newer.absUrl}">\n` : ''}${older ? `<link rel="prev" href="${older.absUrl}">\n` : ''}<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Report',
    headline: r.title,
    name: r.title,
    ...(r.subtitle ? { alternativeHeadline: r.subtitle } : {}),
    abstract: abstractText,
    description: r.dek,
    reportNumber: r.number,
    position: r.seriesNumber,
    datePublished: r.published,
    dateModified: r.updated,
    inLanguage: r.language,
    keywords: r.keywords.join(', '),
    ...(r.topics.length ? { about: r.topics } : {}),
    numberOfPages: r.pages,
    isAccessibleForFree: true,
    license: lic.url,
    url: r.absUrl,
    ...(r.cover ? { image: r.cover.absUrl } : {}),
    ...(doi ? { identifier: doi, sameAs: doi } : {}),
    isPartOf: { '@type': 'CreativeWorkSeries', name: config.series, url: `${SITE}/` },
    author: r.authors.map((a) => ({ '@type': 'Person', name: a })),
    publisher: { '@type': 'Organization', name: config.publisher, url: config.orgUrl },
    encoding: {
      '@type': 'MediaObject',
      contentUrl: r.pdfAbsUrl,
      encodingFormat: 'application/pdf',
      contentSize: String(r.bytes),
    },
    mainEntityOfPage: r.absUrl,
  })}</script>
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Reports', item: `${SITE}/reports/` },
      { '@type': 'ListItem', position: 3, name: r.title, item: r.absUrl },
    ],
  })}</script>
`;

  // Sections present on this page, in order; they also drive the side navigation.
  const sections = [
    ['abstract', 'Abstract'],
    ...(r.findings.length ? [['findings', 'Key findings']] : []),
    ...(r.contents.length ? [['contents', 'Contents']] : []),
    ...(r.method ? [['method', 'Data and method']] : []),
    ['record', 'Report record'],
    ['cite', 'Cite this report'],
  ];

  const record = [
    ['Series', `<a href="/">${esc(config.series)}</a>`],
    ['Series number', seriesNo(r)],
    ['Report ID', esc(r.number)],
    ['Published', `<time datetime="${r.published}">${fmtDate(r.published)}</time>`],
    ...(r.updated !== r.published ? [['Updated', `<time datetime="${r.updated}">${fmtDate(r.updated)}</time>`]] : []),
    [r.authors.length > 1 ? 'Authors' : 'Author', r.authors.map(esc).join(', ')],
    ['Publisher', `<a href="${esc(config.orgUrl)}" rel="noopener">${esc(config.publisher)}</a>`],
    ['Pages', String(r.pages)],
    ['Format', `PDF, ${fmtBytes(r.bytes)}`],
    ['Language', esc(LANGUAGES[r.language] || r.language)],
    ...(doi ? [['DOI', `<a href="${doi}" rel="noopener" target="_blank">${esc(bareDoi(r.doi))}</a>`]] : []),
    ['Licence', `<a href="${lic.url}" rel="license noopener" target="_blank">${esc(lic.name)}</a>`],
  ];

  const facts = [
    ['Published', `<time datetime="${r.published}">${fmtDate(r.published)}</time>`],
    ['Length', `${r.pages} pages`],
    ['Report ID', esc(r.number)],
    ...(doi ? [['DOI', `<a href="${doi}" rel="noopener" target="_blank">${esc(bareDoi(r.doi))}</a>`]] : []),
    ['Licence', `<a href="${lic.url}" rel="license noopener" target="_blank">${esc(lic.name)}</a>`],
  ];

  const seriesNav = newer || older
    ? `<nav class="pn" aria-label="Other reports in the series">
      ${older ? `<a class="pn__link" href="${older.url}" rel="prev"><span class="pn__dir">← Previous · ${seriesNo(older)}</span><span class="pn__title">${esc(older.title)}</span></a>` : '<span></span>'}
      ${newer ? `<a class="pn__link pn__link--next" href="${newer.url}" rel="next"><span class="pn__dir">Next · ${seriesNo(newer)} →</span><span class="pn__title">${esc(newer.title)}</span></a>` : '<span></span>'}
    </nav>`
    : '';

  const body = `
<article class="report">
${r.draft ? '<p class="draftbar">Draft preview. This report stays out of production builds until "draft" is removed from its record.</p>' : ''}
<header class="rhead">
  <div class="wrap">
    <nav class="crumbs crumbs--onpanel" aria-label="Breadcrumb">
      <a href="/">Home</a><span>/</span><a href="/reports/">Reports</a><span>/</span><span aria-current="page">${seriesNo(r)}</span>
    </nav>
    <div class="rhead__grid">
      <a class="rhead__cover" href="${r.pdfUrl}" target="_blank" rel="noopener" aria-label="Open the PDF of ${esc(r.title)} in the browser">${coverArt(r, { lazy: false })}</a>
      <div class="rhead__main">
        <p class="rhead__kicker"><span>Report ${seriesNo(r)}</span><span>${esc(config.seriesShort)}</span></p>
        <h1 class="rhead__title">${esc(r.title)}</h1>
        ${r.subtitle ? `<p class="rhead__sub">${esc(r.subtitle)}</p>` : ''}
        <p class="rhead__dek">${esc(r.dek)}</p>
        <p class="rhead__by">By ${r.authors.map(esc).join(', ')}</p>
        <p class="rhead__actions">
          ${openPdf(r, 'btn btn--sun btn--lg')}
          <a class="btn btn--onpanel btn--lg" href="${r.pdfUrl}" download="${esc(r.pdf)}">${ICON.download}<span>Download</span> <span class="btn__hint">${fmtBytes(r.bytes)}</span></a>
          <button class="btn btn--textpanel" type="button" data-preview-toggle aria-expanded="false" aria-controls="pdf-preview" hidden>Read on this page</button>
        </p>
      </div>
    </div>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n      ')}
    </dl>
  </div>
</header>

<div class="wrap rbody">
  <aside class="side" aria-label="On this page">
    <p class="side__h">On this page</p>
    <ol class="side__nav" data-spy>
      ${sections.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('\n      ')}
    </ol>
    ${openPdf(r, 'btn btn--sun btn--sm side__btn', 'Open PDF')}
    ${topicChips(r, linkTopics)}
  </aside>

  <div class="rmain">

    <section class="sect" id="pdf-preview" data-preview hidden>
      <h2 class="sect__h">Full text</h2>
      <div class="pdfframe" data-preview-mount data-src="${r.pdfUrl}" data-title="${esc(r.title)} (PDF)"></div>
      <p class="pdfframe__fallback">Trouble viewing? <a href="${r.pdfUrl}" target="_blank" rel="noopener">Open the PDF in a new tab</a>.</p>
    </section>

    <section class="sect" id="abstract">
      <h2 class="sect__h">Abstract</h2>
      <div class="prose prose--abstract">
        ${r.abstract.map((p) => `<p>${inline(p)}</p>`).join('\n        ')}
      </div>
    </section>
${
  r.findings.length
    ? `
    <section class="sect" id="findings">
      <h2 class="sect__h">Key findings</h2>
      <ol class="findings">
        ${r.findings.map((f, i) => `<li><span class="findings__n">${i + 1}</span><p>${inline(f)}</p></li>`).join('\n        ')}
      </ol>
    </section>`
    : ''
}${
  r.contents.length
    ? `
    <section class="sect" id="contents">
      <h2 class="sect__h">Contents</h2>
      <ol class="toc">
        ${[...r.contents, ...backmatter].map((c) => tocRow(c)).join('\n        ')}
      </ol>
    </section>`
    : ''
}${
  r.method
    ? `
    <section class="sect" id="method">
      <h2 class="sect__h">Data and method</h2>
      <div class="prose prose--note"><p>${inline(r.method)}</p></div>
    </section>`
    : ''
}

    <section class="sect" id="record">
      <h2 class="sect__h">Report record</h2>
      <dl class="record">
        ${record.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n        ')}
        <div class="record__wide"><dt>Keywords</dt><dd><ul class="keywords">${r.keywords.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></dd></div>
      </dl>
    </section>

    <section class="sect" id="cite">
      <h2 class="sect__h">Cite this report</h2>
      <div class="cite" data-cite>
        <div class="cite__bar">
          <div class="cite__tabs" role="tablist">
            ${Object.keys(cite)
              .map(
                (k, i) =>
                  `<button type="button" role="tab" class="cite__tab${i === 0 ? ' is-active' : ''}" data-cite-tab="${k}" aria-selected="${i === 0}">${k}</button>`
              )
              .join('')}
          </div>
          <button type="button" class="cite__copy" data-cite-copy>Copy</button>
        </div>
        ${Object.entries(cite)
          .map(([k, v], i) => `<pre class="cite__body" data-cite-panel="${k}"${i === 0 ? '' : ' hidden'}><code>${esc(v)}</code></pre>`)
          .join('')}
      </div>
    </section>

    <section class="readbox">
      <div>
        <p class="readbox__h">Read the full report</p>
        <p class="readbox__spec">PDF · ${r.pages} pages · ${fmtBytes(r.bytes)} · ${esc(lic.name)} · free to read and share</p>
      </div>
      <p class="readbox__actions">
        ${openPdf(r)}
        <a class="btn btn--onpanel" href="${r.pdfUrl}" download="${esc(r.pdf)}">${ICON.download}<span>Download PDF</span></a>
      </p>
    </section>

    ${seriesNav}

  </div>
</div>
</article>`;

  return layout({
    title: r.title,
    description: r.dek,
    canonical: r.absUrl,
    head,
    body,
    cls: 'page-report',
    activeNav: '/reports/',
    noindex: Boolean(r.draft),
  });
}

function pageAbout(reports) {
  const body = `
<section class="pagehead">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">About</span></nav>
    <h1 class="pagehead__title">About the <em>series</em></h1>
    <p class="pagehead__lede">${esc(config.series)} is a research report series by ${esc(config.org)}, published open access, one report at a time.</p>
  </div>
</section>

<section class="band band--flush">
  <div class="wrap about">
    <div class="prose prose--page">
      <p class="prose__lede">The series asks one question: which choices would most improve humanity's outlook over the rest of the twenty-first century? Each report takes a part of that question and works it through with public data and stated assumptions.</p>

      <p>The starting point is that the century can become more dangerous while lives still improve, provided development reduces exposure and vulnerability faster than hazards grow. The reports give priority to the Global South, where most future population growth, development opportunity and climate vulnerability meet.</p>

      <h2>What the series covers</h2>
      <ul>
        ${config.threads.map((t) => `<li><strong>${esc(t.name)}.</strong> ${esc(t.text)}</li>`).join('\n        ')}
      </ul>

      <h2>How the reports are written</h2>
      <p>Reports draw on public data and on institutional and peer-reviewed research, and they say what was computed and with which assumptions. Projections are scenarios, not forecasts. Cross-country associations are reported as associations, not as causal estimates. The concepts the series uses, among them Sustainable Convergence, Preventive Development Economics and Polycrisis Resilience, are proposed frameworks that are open to testing, criticism and revision.</p>

      <h2>Access and licensing</h2>
      <p>Every report is free to read and download, with no registration and no paywall. Each report page states the licence that governs that report; the series default is <a href="${config.license.url}" rel="license noopener" target="_blank">${esc(config.license.name)}</a>, which allows sharing and adaptation with attribution.</p>

      <h2 id="citation">How to cite</h2>
      <p>Each report page carries a ready-made citation in APA, Chicago and BibTeX form. Reports are numbered twice: once within this series (No. 01, No. 02 and so on) and once in the organisation-wide ${esc(config.citationSeries)} series (HH-2026-65, for example). Cite the HH number, and the DOI where a report has one, since the DOI is the most stable reference.</p>
      <p>Report pages also expose Google Scholar citation tags, Dublin Core tags and schema.org data, so the series can be indexed like any other working-paper series. Metadata for the whole series is available as <a href="/reports.json">JSON</a>, and new reports are announced on the <a href="/feed.xml">RSS feed</a>.</p>

      <h2>Contact</h2>
      <p>Corrections, questions and requests are welcome${
        config.email
          ? ` at <a href="mailto:${esc(config.email)}">${esc(config.email)}</a>.`
          : ` through <a href="${esc(config.contactUrl)}" rel="noopener">${esc(config.org)}</a>.`
      }</p>

      <p class="prose__meta">The series currently comprises ${plural(reports.length, 'report')}, ${publishedSpan(reports)}.</p>
    </div>

    <aside class="about__side">
      <div class="panelcard">
        <p class="panelcard__h">About ${esc(config.org)}</p>
        <p>${esc(config.org)} is an independent, founder-led research and strategic advisory organisation established by ${esc(config.author)}. Its work covers economic development, technology, environmental change, geopolitics and societal resilience.</p>
        <ul class="elsewhere">
          ${config.elsewhere.map((x) => `<li><a href="${esc(x.url)}" rel="noopener">${esc(x.name)} ${ICON.arrow}</a><span>${esc(x.note)}</span></li>`).join('\n          ')}
        </ul>
      </div>
    </aside>
  </div>
</section>
${
  (config.companions || []).length
    ? `
<section class="band band--alt" id="companions">
  <div class="wrap">
    <header class="sechead">
      ${kicker(1, 'Companion reports')}
      <h2 class="sechead__h">Related reports on the same question</h2>
      <p class="sechead__lede">Two earlier H Heuristics reports take on the same question from different angles. They are published on other H Heuristics sites.</p>
    </header>
    <ul class="companions">
      ${config.companions
        .map(
          (c) => `<li class="companion">
        <p class="companion__eyebrow">${esc(c.eyebrow)}</p>
        <h3 class="companion__title">${esc(c.title)}</h3>
        <p class="companion__text">${esc(c.text)}</p>
        <p class="companion__actions">
          <a class="btn btn--solid" href="${esc(c.url)}" target="_blank" rel="noopener">Read the report ${ICON.open}</a>
          <span class="companion__host">${esc(c.host)}</span>
        </p>
      </li>`
        )
        .join('\n      ')}
    </ul>
  </div>
</section>`
    : ''
}`;

  const description = `About ${config.series}, an open-access research report series by ${config.org}: what it covers, how the reports are written, licensing and how to cite.`;
  return layout({
    title: 'About the series',
    description,
    canonical: `${SITE}/about/`,
    head: `<meta property="og:type" content="website">\n<meta property="og:title" content="About · ${esc(config.series)}">\n<meta property="og:description" content="${esc(description)}">\n<meta property="og:url" content="${SITE}/about/">\n`,
    body,
    activeNav: '/about/',
    latest: reports[0],
  });
}

function page404(reports) {
  return layout({
    title: 'Page not found',
    description: 'Page not found.',
    canonical: `${SITE}/404.html`,
    noindex: true,
    latest: reports[0],
    body: `
<section class="pagehead pagehead--solo">
  <div class="wrap">
    <p class="hero__kicker">Error 404</p>
    <h1 class="pagehead__title">Page <em>not found</em></h1>
    <p class="pagehead__lede">That page has moved or never existed. Every report in the series is listed on the reports page.</p>
    <p class="pagehead__actions"><a class="btn btn--solid" href="/reports/">Browse the reports</a><a class="btn btn--line" href="/">Home</a></p>
  </div>
</section>`,
  });
}

/* --------------------------------------------------------------- machinery */

function sitemap(reports) {
  const latest = reports.map((r) => r.updated).sort().at(-1);
  const urls = [
    { loc: `${SITE}/`, pri: '1.0', freq: 'weekly', lastmod: latest },
    { loc: `${SITE}/reports/`, pri: '0.9', freq: 'weekly', lastmod: latest },
    { loc: `${SITE}/about/`, pri: '0.4', freq: 'yearly' },
    ...reports.map((r) => ({ loc: r.absUrl, pri: '0.8', freq: 'monthly', lastmod: r.updated })),
    ...reports.map((r) => ({ loc: r.pdfAbsUrl, pri: '0.7', freq: 'yearly', lastmod: r.updated })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`)
  .join('\n')}
</urlset>
`;
}

function feed(reports) {
  const rfc = (iso) => new Date(iso + 'T12:00:00Z').toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${esc(config.series)} — ${esc(config.org)}</title>
  <link>${SITE}/</link>
  <description>${esc(config.description)}</description>
  <language>${config.language}</language>
  <lastBuildDate>${rfc(reports.map((r) => r.updated).sort().at(-1))}</lastBuildDate>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${reports
  .map(
    (r) => `  <item>
    <title>${esc(r.title)}</title>
    <link>${r.absUrl}</link>
    <guid isPermaLink="true">${r.absUrl}</guid>
    <pubDate>${rfc(r.published)}</pubDate>
    <dc:creator>${esc(r.authors.join(', '))}</dc:creator>
${r.topics.map((t) => `    <category>${esc(t)}</category>`).join('\n')}
    <description>${esc(r.dek)}</description>
    <content:encoded><![CDATA[<p><strong>${seriesNo(r)} · ${esc(r.number)}</strong> · ${r.pages} pages</p>${r.abstract
      .map((p) => `<p>${esc(plain(p))}</p>`)
      .join('')}<p><a href="${r.pdfAbsUrl}">Open the PDF</a></p>]]></content:encoded>
    <enclosure url="${r.pdfAbsUrl}" length="${r.bytes}" type="application/pdf"/>
  </item>`
  )
  .join('\n')}
</channel>
</rss>
`;
}

function metadataJson(reports) {
  return JSON.stringify(
    {
      series: config.series,
      publisher: config.org,
      url: `${SITE}/`,
      license: config.license,
      updated: reports.map((r) => r.updated).sort().at(-1),
      count: reports.length,
      reports: reports.map((r) => ({
        seriesNumber: r.seriesNumber,
        number: r.number,
        slug: r.slug,
        title: r.title,
        subtitle: r.subtitle || null,
        authors: r.authors,
        published: r.published,
        updated: r.updated,
        language: r.language,
        pages: r.pages,
        bytes: r.bytes,
        topics: r.topics,
        keywords: r.keywords,
        dek: r.dek,
        abstract: r.abstract,
        url: r.absUrl,
        pdf: r.pdfAbsUrl,
        cover: r.cover ? r.cover.absUrl : null,
        doi: r.doi ? bareDoi(r.doi) : null,
        license: licenceOf(r).name,
      })),
    },
    null,
    2
  ) + '\n';
}

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; object-src 'self'; frame-src 'self'

/assets/*
  Cache-Control: public, max-age=604800

/covers/*
  Cache-Control: public, max-age=604800

/pdf/*
  Content-Type: application/pdf
  Content-Disposition: inline
  Cache-Control: public, max-age=86400
  X-Robots-Tag: all

/feed.xml
  Content-Type: application/rss+xml; charset=utf-8

/reports.json
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
`;

/* -------------------------------------------------------------------- main */

function build() {
  const t0 = Date.now();
  const { reports, skipped } = loadReports();   // validate before touching dist/
  const topics = buildTopics(reports);
  const linkTopics = reports.length >= config.filterThreshold && topics.length > 1;
  const published = reports.filter((r) => !r.draft);

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  write('index.html', pageHome(reports, linkTopics));
  write('reports/index.html', pageReports(reports, topics));
  write('about/index.html', pageAbout(reports));
  write('404.html', page404(reports));
  for (const r of reports) write(`reports/${r.slug}/index.html`, pageReport(r, reports, linkTopics));

  if (published.length) {
    write('sitemap.xml', sitemap(published));
    write('feed.xml', feed(published));
    write('reports.json', metadataJson(published));
  }
  write(
    'robots.txt',
    `# ${config.series} — ${config.org}\n${
      isProduction ? `User-agent: *\nAllow: /\nAllow: /pdf/\n` : `User-agent: *\nDisallow: /\n`
    }\nSitemap: ${SITE}/sitemap.xml\n`
  );
  write('_headers', HEADERS);

  const nAssets = copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  // A draft's PDF and cover stay out of the published site until the draft flag is removed.
  const held = new Set(skipped.flatMap((d) => [`covers/${d.slug}.jpg`, ...(d.pdf ? [`pdf/${d.pdf}`] : [])]));
  const nPublic = copyDir(path.join(ROOT, 'public'), DIST, held);
  const noCover = reports.filter((r) => !r.cover).map((r) => r.slug);

  console.log(`\n  ${config.series}`);
  console.log(`  ${'─'.repeat(46)}`);
  console.log(`  site url    ${SITE}${isProduction ? '' : '  (preview → noindex)'}`);
  console.log(`  reports     ${reports.length}${WITH_DRAFTS ? '  (drafts included)' : ''}`);
  console.log(`  pages       ${reports.length + 4} HTML`);
  console.log(`  files       ${nAssets} asset, ${nPublic} public`);
  console.log(`  output      dist/`);
  console.log(`  built in    ${Date.now() - t0} ms`);
  if (skipped.length) console.log(`\n  ! skipped ${plural(skipped.length, 'draft')}: ${skipped.map((d) => d.slug).join(', ')}  (remove "draft": true to publish)`);
  if (noCover.length) console.log(`\n  ! no cover image for: ${noCover.join(', ')}  (optional: public/covers/<slug>.jpg)`);
  console.log('');
}

build();
