// ---------------------------------------------------------------------------
// Site-wide configuration for the series site.
//
// CANONICAL_ORIGIN is load-bearing: Google Scholar requires an absolute
// citation_pdf_url, and canonical links, the sitemap, the feed and every
// citation tag are built from it. Whatever it says is what gets indexed and
// cited, so it must be the permanent public domain of this site.
//
//   → If the site is served from a different domain, change the one line below
//     (or set a SITE_URL environment variable in Cloudflare Pages).
//
// CF_PAGES_URL is deliberately NOT used on production builds. Cloudflare sets
// it to the per-deployment host (70c3490d.<project>.pages.dev), which changes
// on every deploy; canonicalising to it would publish citation URLs that break
// on the next push. Preview builds may use it: they are noindex anyway.
// ---------------------------------------------------------------------------

const CANONICAL_ORIGIN = 'https://globaloutlook.hheuristics.com';

export const isProduction =
  process.env.CF_PAGES_BRANCH === undefined ||
  process.env.CF_PAGES_BRANCH === 'main' ||
  process.env.CF_PAGES_BRANCH === 'master';

const resolvedOrigin =
  process.env.SITE_URL ||
  (isProduction ? CANONICAL_ORIGIN : process.env.CF_PAGES_URL || CANONICAL_ORIGIN);

export default {
  siteUrl: resolvedOrigin.replace(/\/$/, ''),

  // ------------------------------------------------------------- identity --
  org: 'H Heuristics',
  orgUrl: 'https://www.hheuristics.com',
  orgTagline: 'Actionable intelligence for complex decisions',
  series: "Optimizing Humanity's Outlook This Century",
  seriesShort: "Optimizing Humanity's Outlook",
  kicker: 'H Heuristics · Research report series',
  description:
    "An open-access H Heuristics research report series on which choices would most improve humanity's outlook over the rest of the twenty-first century: sustainable convergence, innovation diffusion, stronger emerging economies and lower vulnerability to interconnected crises.",
  author: 'Hunter Hughes',
  publisher: 'H Heuristics',
  language: 'en',

  // Where "Contact" points. Set `email` to publish a mailto link instead.
  contactUrl: 'https://www.hheuristics.com/about',
  email: '',

  // The name reports are cited under. Every report carries an HH-YYYY-NN number
  // in the organisation-wide H Heuristics Research Report series; this site
  // adds its own running number (No. 01, No. 02, …).
  citationSeries: 'H Heuristics Research Report',

  // ------------------------------------------------------------ licensing --
  // Default licence. A report record may override it with a `license` naming
  // any key in `licenses`. For anything deposited with a DOI, the licence on
  // the deposit is the source of truth.
  license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  licenses: {
    'CC BY 4.0':       { name: 'CC BY 4.0',       url: 'https://creativecommons.org/licenses/by/4.0/' },
    'CC BY-NC 4.0':    { name: 'CC BY-NC 4.0',    url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
    'CC BY-NC-ND 4.0': { name: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  },

  // ------------------------------------------------------------ home page --
  hero: {
    // *asterisks* set a word in the serif italic.
    title: "Optimizing Humanity's *Outlook* This Century",
    lede:
      "Which choices would most improve humanity's outlook over the rest of the twenty-first century? This series works through that question one report at a time, with public data, stated assumptions and scenarios that are labelled as scenarios.",
  },

  // The timeline under the hero. `windows` are two periods taken from Report
  // No. 01 (HH-2026-32). Set to null to hide the block.
  century: {
    start: 2026,
    end: 2100,
    ticks: [2026, 2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100],
    windows: [
      { to: 2035, name: 'The decisive decade', text: 'to 2035, while the working-age wave in Africa and South Asia is still gathering scale.' },
      { to: 2050, name: 'The demographic window', text: 'to 2050, as more than one billion working-age people are added in Sub-Saharan Africa and South Asia.' },
    ],
    note: 'Two periods drawn from Report No. 01. A way of thinking about sequencing, not a forecast.',
  },

  question: {
    lede:
      'The century can become more dangerous while lives still improve, if development reduces exposure and vulnerability faster than hazards grow.',
    text:
      'The series asks which choices do the most to make that happen. Each report takes one part of the question and works it through with public data: where the gains are largest, which interventions pay several dividends at once, what should come first, and how progress can be counted in lives and in years of deprivation avoided. The concepts used are proposed frameworks, open to testing and revision.',
  },

  // The four lines of inquiry the series returns to.
  threads: [
    {
      name: 'Sustainable convergence',
      text: 'Closing the gap between richer and developing economies without repeating the environmental damage of past growth.',
    },
    {
      name: 'Diffusion of innovations',
      text: 'Getting proven technologies and practices, from clean cooking to digital public infrastructure, to the people who do not yet have them.',
    },
    {
      name: 'Emerging economies',
      text: 'Where most future population growth, development opportunity and climate vulnerability meet, and where the century will largely be decided.',
    },
    {
      name: 'Vulnerability and resilience',
      text: 'Reducing exposure to interconnected crises before they strike, and counting the lives and person-years of deprivation avoided.',
    },
  ],

  // The scenario chart on the home page. Values are scenarios from Report
  // No. 01 (HH-2026-32), not forecasts. Bars are drawn against `max`. Set to
  // null to hide the block.
  benchmark: {
    measure: 'Income per person in the Global South, as a share of the advanced-economy frontier',
    unit: '%',
    max: 100,
    rows: [
      { label: 'Starting point', when: '2026', value: 25.2, muted: true },
      { label: 'Fragmented stagnation', when: '2100', value: 34.5 },
      { label: 'Gradual baseline catch-up', when: '2100', value: 65.4 },
      { label: 'Accelerated coordinated convergence', when: '2100', value: 88.9, highlight: true },
    ],
    gap: { value: '$740T', text: 'Global South output in 2100 in the accelerated scenario, against $310 trillion on the fragmented path (purchasing power parity).' },
    note:
      'Three scenarios from Report No. 01, modelled under stated assumptions. They are scenarios, not forecasts.',
    source: '/reports/economics-of-global-convergence/',
  },

  // ---------------------------------------------------------------- lists --
  // Home shows this many reports under the latest one; /reports/ pages through
  // the full list this many at a time. Search and topic filters appear on
  // /reports/ once the series has at least `filterThreshold` reports.
  homeCount: 6,
  pageSize: 20,
  filterThreshold: 6,

  nav: [
    { href: '/reports/', label: 'Reports' },
    { href: '/about/', label: 'About' },
  ],

  // Related reports published elsewhere, shown as buttons on /about/.
  // Add, remove or reorder entries freely.
  companions: [
    {
      eyebrow: 'H Heuristics Research Reports · HH-2026-65',
      title: "Optimizing Humanity's Outlook This Century",
      text: 'Which choices would most improve humanity’s outlook this century? Public-data ledgers, a test of multiple development dividends across 131 economies, a ranking of twelve interventions and a six-dimension Century Outlook Dashboard.',
      url: 'https://researchreports.hheuristics.com/reports/optimizing-humanitys-outlook/',
      host: 'researchreports.hheuristics.com',
    },
    {
      eyebrow: 'Polycrisis Resilience Series · No. 56',
      title: "The Top Ways to Optimize Humanity's Outlook This Century",
      text: 'Ranks nine high-leverage interventions for the Global South with two scoring systems, and models three scenarios to 2100 under the idea of multidimensional optimization.',
      url: 'https://polycrisisresilience.hheuristics.com/reports/top-ways-to-optimize-humanitys-outlook/',
      host: 'polycrisisresilience.hheuristics.com',
    },
  ],

  // Other places H Heuristics publishes, listed on /about/ and in the footer.
  elsewhere: [
    { name: 'H Heuristics', url: 'https://www.hheuristics.com', note: 'The organisation and its advisory work' },
    { name: 'Research Reports', url: 'https://researchreports.hheuristics.com', note: 'The full H Heuristics Research Report series' },
    { name: 'Polycrisis Resilience Series', url: 'https://polycrisisresilience.hheuristics.com', note: 'Reports on reducing exposure to interconnected crises' },
    { name: 'Digital Reports', url: 'https://digitalreports.hheuristics.com', note: 'Web-native editions' },
    { name: 'Substack', url: 'https://hheuristics.substack.com', note: 'Essays and updates' },
  ],
};
