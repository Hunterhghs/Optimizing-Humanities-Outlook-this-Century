# Optimizing Humanity's Outlook This Century

The website for the H Heuristics research report series of the same name. It is a
small static site generator with no dependencies: each report is one JSON record plus
one PDF, and every report gets its own page with the abstract, key findings, metadata,
citations and a button that opens the PDF in the browser.

```bash
npm run build     # → dist/  (what Cloudflare Pages runs)
npm run dev       # build including drafts, then serve on http://localhost:4321
```

Node 18 or newer is the only requirement. There is nothing to install.

## Publishing a new report

1. **Scaffold it from the PDF.**

   ```bash
   npm run new -- "~/path/to/HH-2026-33.pdf" my-report-slug --number HH-2026-33
   ```

   This copies the PDF to `public/pdf/my-report-slug.pdf`, renders page 1 as the cover
   (`public/covers/my-report-slug.jpg`), reads the page count and any title, subtitle
   and keywords stamped in the PDF, and writes `content/reports/my-report-slug.json`
   with the next series number. The slug is optional (it defaults to the title) and
   becomes the page address: `/reports/my-report-slug/`.

2. **Fill in the record.** Open the new JSON file and replace every `TODO`.

   | Field | What it is |
   | --- | --- |
   | `title`, `subtitle` | As on the cover. `subtitle` is optional |
   | `number` | The H Heuristics report ID, e.g. `HH-2026-33` |
   | `seriesNumber` | Position in this series (1, 2, 3 …). Set for you |
   | `published` | `YYYY-MM-DD`. Add `updated` later if the PDF is revised |
   | `dek` | One or two sentences for cards, search results and social previews |
   | `abstract` | One array item per paragraph |
   | `findings` | Key findings, each with its numbers. Optional |
   | `topics` | Two to four short labels. They become the filters on `/reports/` |
   | `keywords` | The report's keyword line, as an array |
   | `method` | The data and method note. Optional |
   | `contents`, `backmatter` | Section titles for the on-page table of contents. Optional |
   | `doi` | e.g. `10.5281/zenodo.24224458`. Delete the line if there is none |
   | `license` | A key from `licenses` in `site.config.mjs`. Defaults to CC BY 4.0 |

   `abstract`, `findings` and `method` accept `*italic*`, `**bold**` and
   `[text](https://url)`.

3. **Preview.** `npm run dev` builds drafts too and shows them with a "Draft" label.

4. **Publish.** Delete the `"draft": true` line, then commit and push. Cloudflare
   Pages rebuilds and the report goes live.

The build refuses to run if a published record still contains `TODO`, is missing a
required field, has a malformed date, DOI or report ID, reuses a slug or number, or
points at a PDF that is missing or larger than 25 MB (the Cloudflare Pages limit).
A draft's PDF and cover are left out of production builds, so nothing unpublished
goes online by accident.

To replace a report's PDF, overwrite `public/pdf/<slug>.pdf`, update `pages` and add
an `updated` date. To remove a report, delete its JSON record, PDF and cover.

## Deploying on Cloudflare Pages

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(repository root)* |

**Set the site's address before going live.** `CANONICAL_ORIGIN` at the top of
`site.config.mjs` must be the permanent public domain. Canonical links, the sitemap,
the RSS feed and the Google Scholar `citation_pdf_url` are all built from it, so
whatever it says is what gets indexed and cited. Alternatively, set a `SITE_URL`
environment variable in the Pages project, which overrides it.

Preview deployments (any branch other than `main`) are marked `noindex` and get a
`Disallow: /` robots file.

## What each report page carries

- Google Scholar tags (`citation_title`, `citation_author`, `citation_pdf_url`,
  `citation_technical_report_number`, `citation_doi` and the rest of the
  technical-report profile)
- Dublin Core tags, Open Graph tags with the cover image, and schema.org `Report`
  and `BreadcrumbList` data
- Citations in APA, Chicago and BibTeX, with a copy button
- "Open PDF in browser", "Download", and an optional on-page reader

PDFs are served with `Content-Disposition: inline`, so they open in the browser's
own viewer.

## What gets generated

```
dist/
  index.html                    series home
  reports/index.html            all reports (search and topic filters appear at 6+)
  reports/<slug>/index.html     one page per report
  about/index.html
  pdf/<slug>.pdf                full text
  covers/<slug>.jpg             cover images
  sitemap.xml  feed.xml  robots.txt  reports.json  _headers  404.html
```

## Layout

```
build.mjs               the generator: validation, templates, metadata, feeds
site.config.mjs         series name, domain, home-page text and figures, links
content/reports/*.json  one record per report
public/                 copied to dist/ as is (PDFs, covers, favicon)
assets/                 styles.css and site.js
scripts/                new-report.mjs, serve.mjs
```

The home page's text, the 2026–2100 timeline and the scenario chart are all set in
`site.config.mjs`. The figures there come from Report No. 01; update or remove them
(`century: null`, `benchmark: null`) as the series develops.

## Design

A sun on the horizon of the century: evergreen ink, sunrise amber, Instrument Sans
for reading, Instrument Serif italic for emphasis and IBM Plex Mono for the record.
Light and dark modes follow the reader's system setting.

## Licence

Site code: all rights reserved. Reports: each states its own licence (CC BY 4.0 by
default).
