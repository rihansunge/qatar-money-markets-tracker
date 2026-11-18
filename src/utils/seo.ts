import type { NavSection } from '../types/market';

export interface SeoTickerSummary {
  ticker: string;
  name: string;
  sector: string;
  isHalal: boolean;
  isEtf: boolean;
}

export const SEO_TICKERS: readonly SeoTickerSummary[] = [
  { ticker: 'QIBK', name: 'Qatar Islamic Bank', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'QATR', name: 'Al Rayan Qatar ETF', sector: 'Exchange Traded Fund', isHalal: true, isEtf: true },
  { ticker: 'QNBK', name: 'Qatar National Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'QETF', name: 'QE Index ETF', sector: 'Exchange Traded Fund', isHalal: false, isEtf: true },
  { ticker: 'IQCD', name: 'Industries Qatar', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'QGTS', name: 'Nakilat (Qatar Gas Transport)', sector: 'Energy & Transport', isHalal: true, isEtf: false },
  { ticker: 'MARK', name: 'Masraf Al Rayan', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'ORDS', name: 'Ooredoo', sector: 'Telecoms', isHalal: true, isEtf: false },
  { ticker: 'VFQS', name: 'Vodafone Qatar', sector: 'Telecoms', isHalal: true, isEtf: false },
  { ticker: 'CBQK', name: 'The Commercial Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'QIIK', name: 'Qatar International Islamic Bank', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'QEWS', name: 'Qatar Electricity & Water', sector: 'Energy & Transport', isHalal: true, isEtf: false },
  { ticker: 'QFLS', name: 'Qatar Fuel (Woqod)', sector: 'Consumer Goods', isHalal: true, isEtf: false },
  { ticker: 'BRES', name: 'Barwa Real Estate', sector: 'Real Estate', isHalal: true, isEtf: false },
  { ticker: 'MPHC', name: 'Mesaieed Petrochemical', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'GISS', name: 'Gulf International Services', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'DHBK', name: 'Doha Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'ERES', name: 'Ezdan Holding Group', sector: 'Real Estate', isHalal: true, isEtf: false },
  { ticker: 'QATI', name: 'Qatar Insurance', sector: 'Insurance', isHalal: false, isEtf: false },
  { ticker: 'MCCS', name: 'Mannai Corporation', sector: 'Consumer Goods', isHalal: true, isEtf: false },
] as const;

const TICKER_SET = new Set(SEO_TICKERS.map((t) => t.ticker));

const SECTION_FROM_PATH: Record<string, NavSection> = {
  '/': 'overview',
  '/market': 'market',
  '/shariah-etf': 'shariah-etf',
  '/dividends': 'dividends',
  '/news': 'news',
  '/portfolio': 'portfolio',
  '/sentiment': 'sentiment',
  '/alerts': 'alerts',
  '/plus': 'pro-legal',
  '/seo': 'pro-legal',
};

const VALID_SECTIONS: ReadonlySet<NavSection> = new Set([
  'overview',
  'market',
  'shariah-etf',
  'dividends',
  'news',
  'portfolio',
  'sentiment',
  'alerts',
  'pro-legal',
]);

export function parseRouteState(
  pathname: string,
  search: string,
): { section: NavSection; ticker: string; searchQuery: string } {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const rawQuery = (params.get('q') ?? '').trim();

  // Check clean /stock/:ticker route first
  const stockMatch = /^\/stock\/([a-zA-Z0-9]+)$/i.exec(cleanPath);
  if (stockMatch) {
    const candidate = stockMatch[1].toUpperCase();
    return {
      section: 'market',
      ticker: TICKER_SET.has(candidate) ? candidate : 'QIBK',
      searchQuery: rawQuery,
    };
  }

  const rawTicker = (params.get('ticker') ?? '').toUpperCase().trim();
  const validTicker = TICKER_SET.has(rawTicker) ? rawTicker : 'QIBK';

  if (cleanPath in SECTION_FROM_PATH && cleanPath !== '/') {
    return {
      section: SECTION_FROM_PATH[cleanPath],
      ticker: validTicker,
      searchQuery: rawQuery,
    };
  }

  const rawSection = params.get('section') as NavSection | null;
  if (rawSection && VALID_SECTIONS.has(rawSection)) {
    return {
      section: rawSection,
      ticker: validTicker,
      searchQuery: rawQuery,
    };
  }

  if (rawQuery) {
    return {
      section: 'market',
      ticker: TICKER_SET.has(rawQuery.toUpperCase()) ? rawQuery.toUpperCase() : validTicker,
      searchQuery: rawQuery,
    };
  }

  return {
    section: 'overview',
    ticker: validTicker,
    searchQuery: '',
  };
}

export function buildCanonicalPath(section: NavSection, ticker = 'QIBK'): string {
  const safeTicker = TICKER_SET.has(ticker.toUpperCase()) ? ticker.toUpperCase() : 'QIBK';
  switch (section) {
    case 'overview':
      return '/';
    case 'market':
      return `/stock/${safeTicker}`;
    case 'shariah-etf':
      return '/shariah-etf';
    case 'dividends':
      return '/dividends';
    case 'news':
      return '/news';
    case 'portfolio':
      return '/portfolio';
    case 'sentiment':
      return '/sentiment';
    case 'alerts':
      return '/alerts';
    case 'pro-legal':
      return '/plus';
  }
}

export interface PageSeoMetadata {
  title: string;
  description: string;
  canonicalPath: string;
  canonicalUrl: string;
  ogImageUrl: string;
  structuredData: Record<string, unknown>[];
}

export function buildPageSeo(options: {
  baseUrl: string;
  section: NavSection;
  ticker?: string;
  priceQar?: number;
  dividendYieldPct?: number;
}): PageSeoMetadata {
  const cleanBase = options.baseUrl.replace(/\/+$/, '');
  const safeTicker = (options.ticker || 'QIBK').toUpperCase();
  const tickerMeta = SEO_TICKERS.find((t) => t.ticker === safeTicker);
  const canonicalPath = buildCanonicalPath(options.section, safeTicker);
  const canonicalUrl = `${cleanBase}${canonicalPath}`;
  const ogImageUrl = `${cleanBase}/og-card.jpg`;

  let title = 'Qatar Money Markets — QSE Live Stocks & Halal ETFs';
  let description =
    'Track real-time Qatar Stock Exchange (QSE) prices, QATR Halal ETF, Shariah-compliant stocks, upcoming dividends, Zakat purification, and portfolio analytics.';

  if (options.section === 'market' && tickerMeta) {
    const priceSnippet =
      typeof options.priceQar === 'number' && options.priceQar > 0
        ? ` Live quote ${options.priceQar.toFixed(tickerMeta.isEtf || options.priceQar < 3 ? 3 : 2)} QAR`
        : '';
    const yieldSnippet =
      typeof options.dividendYieldPct === 'number'
        ? `, ${options.dividendYieldPct.toFixed(2)}% dividend yield`
        : '';
    const shariahLabel = tickerMeta.isHalal ? 'Shariah compliant' : 'conventional';
    title = `${tickerMeta.ticker} (${tickerMeta.name}) Live QSE Price — Qatar Money Markets`;
    description = `Track ${tickerMeta.ticker} (${tickerMeta.name}) on the Qatar Stock Exchange.${priceSnippet}${yieldSnippet}, historical chart, and ${shariahLabel} audit.`;
  } else if (options.section === 'shariah-etf') {
    title = 'QSE Halal ETFs (QATR) & Shariah Stocks — Qatar Money Markets';
    description =
      'Compare QATR Halal ETF vs QETF, screen 15 Shariah-compliant Qatar Stock Exchange equities, and calculate Zakat and dividend purification in QAR.';
  } else if (options.section === 'dividends') {
    title = 'Qatar Stock Exchange Dividends & Ex-Dates — Qatar Money Markets';
    description =
      'Upcoming Qatar Stock Exchange dividend calendar, ex-dividend dates, payout yields in QAR, and projected annual income for your QSE holdings.';
  } else if (options.section === 'news') {
    title = 'Qatar Stock Exchange News & Daily Updates — Qatar Money Markets';
    description =
      'Latest Qatar Stock Exchange corporate announcements, AGM resolutions, LNG shipping updates, QCB rate insights, and daily Doha market briefs.';
  } else if (options.section === 'portfolio') {
    title = 'QSE Portfolio & Dividend Analytics — Qatar Money Markets';
    description =
      'Analyze your Qatar Stock Exchange portfolio value, unrealized P&L, Shariah compliance split, sector allocation, and dividend yield in QAR.';
  } else if (options.section === 'sentiment') {
    title = 'QSE Investor Sentiment & Institutional Flows — Qatar Money Markets';
    description =
      'Track Qatar Stock Exchange Greed/Fear sentiment pulse, RSI momentum, foreign and institutional net QAR flows, and community market votes.';
  } else if (options.section === 'alerts') {
    title = 'QSE Live Price Alerts & Notifications — Qatar Money Markets';
    description =
      'Set instant target price alerts for QIBK, QNBK, QATR Halal ETF, and all top Qatar Stock Exchange equities with real-time push notifications.';
  } else if (options.section === 'pro-legal') {
    title = 'Qatar Money Markets Plus, SEO & QFMA Disclosures';
    description =
      'Subscribe to the Morning Doha QSE Brief, check Google Search indexing readiness, and review Qatar Money Markets Plus plans and QFMA disclosures.';
  }

  const webSiteSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Qatar Money Markets',
    alternateName: ['Qatar Stock Exchange Tracker', 'QSE Live Tracker'],
    url: `${cleanBase}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${cleanBase}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const webAppSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Qatar Money Markets',
    url: canonicalUrl,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'All',
    description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'QAR',
    },
  };

  return {
    title,
    description,
    canonicalPath,
    canonicalUrl,
    ogImageUrl,
    structuredData: [webSiteSchema, webAppSchema],
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function injectSeoIntoHtml(
  html: string,
  opts: {
    baseUrl: string;
    pathname: string;
    search: string;
    googleSiteVerification?: string;
  },
): string {
  const route = parseRouteState(opts.pathname, opts.search);
  const seo = buildPageSeo({
    baseUrl: opts.baseUrl,
    section: route.section,
    ticker: route.ticker,
  });

  const safeTitle = escapeHtmlAttr(seo.title);
  const safeDesc = escapeHtmlAttr(seo.description);
  const safeCanonical = escapeHtmlAttr(seo.canonicalUrl);
  const safeOgImg = escapeHtmlAttr(seo.ogImageUrl);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  out = out.replace(
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${safeTitle}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  );

  // Replace existing canonical / og:url / og:image / twitter:image or inject before </head>
  out = out.replace(/<link\s+rel="canonical"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+property="og:url"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+property="og:image"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+name="twitter:image"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+name="google-site-verification"[\s\S]*?\/>/i, '');
  out = out.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');

  const jsonLdScripts = seo.structuredData
    .map((schema) => `    <script type="application/ld+json">${JSON.stringify(schema)}</script>`)
    .join('\n');

  const gscMeta = opts.googleSiteVerification?.trim()
    ? `    <meta name="google-site-verification" content="${escapeHtmlAttr(opts.googleSiteVerification.trim())}" />\n`
    : '';

  const injectedBlock = `${gscMeta}    <link rel="canonical" href="${safeCanonical}" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta property="og:image" content="${safeOgImg}" />
    <meta name="twitter:image" content="${safeOgImg}" />
${jsonLdScripts}
  </head>`;

  return out.replace(/<\/head>/i, injectedBlock);
}
