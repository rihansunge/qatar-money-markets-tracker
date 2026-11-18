import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { SEO_TICKERS, injectSeoIntoHtml } from './src/utils/seo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const TRACKED_TICKERS = [
  'QIBK',
  'QATR',
  'QNBK',
  'QETF',
  'IQCD',
  'QGTS',
  'MARK',
  'ORDS',
  'VFQS',
  'CBQK',
  'QIIK',
  'QEWS',
  'QFLS',
  'BRES',
  'MPHC',
  'GISS',
  'DHBK',
  'ERES',
  'QATI',
  'MCCS',
] as const;

interface LiveIndexPatch {
  symbol: 'QSI' | 'QERI' | 'QEAS';
  value: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  week52High?: number;
  week52Low?: number;
  sparkline?: number[];
}

interface LiveQuotePatch {
  ticker: string;
  price: number;
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  week52High?: number;
  week52Low?: number;
  volume: number;
  turnoverQar: number;
  marketCapMillionQar?: number;
  peRatio?: number | null;
  pbRatio?: number | null;
  beta?: number;
  sparkline?: number[];
}

interface OhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  benchmarkClose?: number;
}

function roundTo(val: number, decimals = 3): number {
  const f = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * f) / f;
}

// Short-lived in-memory caches:
// - liveCache: 2s max TTL for near-real-time quote updates
// - sparklineCache: 5m TTL for 10-point daily sparklines (avoids fetching 1mo history every 2s)
let liveCache: { expiresAt: number; payload: LiveSnapshotResponse } | null = null;
const historyCache = new Map<string, { expiresAt: number; bars: OhlcBar[] }>();
const sparklineCache = new Map<
  string,
  { expiresAt: number; sparkline: number[]; meta: Record<string, number> }
>();

interface LiveSnapshotResponse {
  source: string;
  provider: string;
  fetchedAt: string;
  delayNote: string;
  indices: LiveIndexPatch[];
  quotes: Record<string, LiveQuotePatch>;
}

async function fetchYahooChart(
  yahooSymbol: string,
  interval: string,
  range: string,
): Promise<{
  meta: Record<string, unknown>;
  bars: OhlcBar[];
} | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QatarMoneyMarkets/1.0)' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  if (!result || !result.meta) return null;

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const bars: OhlcBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c)) continue;
    const o = opens[i] ?? c;
    const h = highs[i] ?? Math.max(o, c);
    const l = lows[i] ?? Math.min(o, c);
    const v = volumes[i] ?? 0;

    // Convert UTC epoch to Doha AST (UTC+3)
    const dohaDate = new Date((timestamps[i] + 3 * 3600) * 1000);
    const label =
      range === '1d' || range === '5d'
        ? `${String(dohaDate.getUTCHours()).padStart(2, '0')}:${String(
            dohaDate.getUTCMinutes(),
          ).padStart(2, '0')}`
        : dohaDate.toISOString().slice(0, 10);

    bars.push({
      date: label,
      open: roundTo(o, 3),
      high: roundTo(h, 3),
      low: roundTo(l, 3),
      close: roundTo(c, 3),
      volume: Math.round(v),
    });
  }

  return { meta: result.meta, bars };
}

async function getSparklineAndYahooMeta(ticker: string) {
  const now = Date.now();
  const cached = sparklineCache.get(ticker);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const yahooSym = `${ticker}.QA`;
  const chart = await fetchYahooChart(yahooSym, '1d', '1mo');
  if (!chart) return null;

  const closes = chart.bars.map((b) => b.close).slice(-10);
  const m = chart.meta;
  const price = Number(m.regularMarketPrice ?? closes[closes.length - 1] ?? 0);
  const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
  const entry = {
    expiresAt: now + 300_000, // 5 minutes for 10-day sparkline background
    sparkline: closes,
    meta: {
      price: roundTo(price, 3),
      previousClose: roundTo(prev, 3),
      dayHigh: roundTo(Number(m.regularMarketDayHigh ?? price), 3),
      dayLow: roundTo(Number(m.regularMarketDayLow ?? price), 3),
      week52High: roundTo(Number(m.fiftyTwoWeekHigh ?? price), 3),
      week52Low: roundTo(Number(m.fiftyTwoWeekLow ?? price), 3),
      volume: Math.round(Number(m.regularMarketVolume ?? 0)),
    },
  };
  sparklineCache.set(ticker, entry);
  return entry;
}

async function fetchYahooFastQuote(ticker: string) {
  const chart = await fetchYahooChart(`${ticker}.QA`, '1m', '1d');
  if (!chart) return null;
  const m = chart.meta;
  const lastBar = chart.bars[chart.bars.length - 1];
  const price = Number(m.regularMarketPrice ?? lastBar?.close ?? 0);
  const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
  return {
    price: roundTo(price, 3),
    previousClose: roundTo(prev, 3),
    open: roundTo(Number(chart.bars[0]?.open ?? prev), 3),
    dayHigh: roundTo(Number(m.regularMarketDayHigh ?? lastBar?.high ?? price), 3),
    dayLow: roundTo(Number(m.regularMarketDayLow ?? lastBar?.low ?? price), 3),
    week52High: m.fiftyTwoWeekHigh ? roundTo(Number(m.fiftyTwoWeekHigh), 3) : undefined,
    week52Low: m.fiftyTwoWeekLow ? roundTo(Number(m.fiftyTwoWeekLow), 3) : undefined,
    volume: Math.round(Number(m.regularMarketVolume ?? 0)),
  };
}

async function fetchLiveQseSnapshot(forceRefresh = false): Promise<LiveSnapshotResponse> {
  const now = Date.now();
  if (!forceRefresh && liveCache && liveCache.expiresAt > now) {
    return liveCache.payload;
  }

  const tvSymbols = [
    'QSE:GNRI',
    'QSE:QERI',
    'QSE:QEAS',
    ...TRACKED_TICKERS.map((t) => `QSE:${t}`),
  ];

  const tvPromise = fetch('https://scanner.tradingview.com/global/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; QatarMoneyMarkets/1.0)',
    },
    body: JSON.stringify({
      symbols: { tickers: tvSymbols },
      columns: [
        'name',
        'close',
        'open',
        'high',
        'low',
        'change_abs',
        'volume',
        'Value.Traded',
        'market_cap_basic',
        'price_earnings_ttm',
        'price_book_fq',
        'price_52_week_high',
        'price_52_week_low',
        'beta_1_year',
      ],
    }),
    signal: AbortSignal.timeout(7000),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`TradingView HTTP ${r.status}`);
    return (await r.json()) as {
      data?: Array<{ s: string; d: Array<string | number | null> }>;
    };
  });

  // Fetch cached 5m sparklines AND fresh 1m live quotes for ETFs (QATR, QETF) in parallel
  const yahooSparkPromise = Promise.allSettled(
    TRACKED_TICKERS.map(async (t) => ({
      ticker: t,
      data: await getSparklineAndYahooMeta(t),
    })),
  );
  const etfFastPromise = Promise.allSettled([
    fetchYahooFastQuote('QATR').then((q) => ({ ticker: 'QATR', q })),
    fetchYahooFastQuote('QETF').then((q) => ({ ticker: 'QETF', q })),
  ]);

  const [tvResult, yahooResults, etfResults] = await Promise.all([
    tvPromise,
    yahooSparkPromise,
    etfFastPromise,
  ]);

  const yahooMap = new Map<string, NonNullable<Awaited<ReturnType<typeof getSparklineAndYahooMeta>>>>();
  for (const res of yahooResults) {
    if (res.status === 'fulfilled' && res.value.data) {
      yahooMap.set(res.value.ticker, res.value.data);
    }
  }

  const etfFastMap = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchYahooFastQuote>>>>();
  for (const res of etfResults) {
    if (res.status === 'fulfilled' && res.value.q) {
      etfFastMap.set(res.value.ticker, res.value.q);
    }
  }

  const indices: LiveIndexPatch[] = [];
  const quotes: Record<string, LiveQuotePatch> = {};

  for (const row of tvResult.data ?? []) {
    const [
      rawName,
      closeVal,
      openVal,
      highVal,
      lowVal,
      changeAbsVal,
      volumeVal,
      turnoverVal,
      mcapVal,
      peVal,
      pbVal,
      w52HighVal,
      w52LowVal,
      betaVal,
    ] = row.d;

    const sym = String(rawName ?? '');
    const close = Number(closeVal ?? 0);
    const changeAbs = Number(changeAbsVal ?? 0);
    const prevClose = roundTo(close - changeAbs, 3);
    const open = Number(openVal ?? prevClose);
    const high = Number(highVal ?? close);
    const low = Number(lowVal ?? close);

    if (sym === 'GNRI' || sym === 'QERI' || sym === 'QEAS') {
      const mappedSym = sym === 'GNRI' ? 'QSI' : (sym as 'QERI' | 'QEAS');
      const proxy = mappedSym === 'QERI' ? yahooMap.get('QATR') : yahooMap.get('QETF');
      let sparkline: number[] | undefined;
      if (proxy && proxy.sparkline.length > 1) {
        const lastProxy = proxy.sparkline[proxy.sparkline.length - 1] || 1;
        sparkline = [...proxy.sparkline.slice(0, -1).map((v) => roundTo((v / lastProxy) * close, 2)), roundTo(close, 2)];
      }

      indices.push({
        symbol: mappedSym,
        value: roundTo(close, 2),
        previousClose: roundTo(prevClose, 2),
        dayHigh: roundTo(high, 2),
        dayLow: roundTo(low, 2),
        week52High: w52HighVal ? roundTo(Number(w52HighVal), 2) : undefined,
        week52Low: w52LowVal ? roundTo(Number(w52LowVal), 2) : undefined,
        sparkline,
      });
    } else if ((TRACKED_TICKERS as readonly string[]).includes(sym)) {
      const y = yahooMap.get(sym);
      const volume = Math.round(Number(volumeVal ?? y?.meta.volume ?? 0));
      const turnoverQar = Math.round(Number(turnoverVal ?? volume * close));
      const liveSparkline = y?.sparkline
        ? [...y.sparkline.slice(0, -1), roundTo(close, 3)]
        : undefined;
      quotes[sym] = {
        ticker: sym,
        price: roundTo(close, 3),
        previousClose: prevClose,
        open: roundTo(open, 3),
        dayHigh: roundTo(high, 3),
        dayLow: roundTo(low, 3),
        week52High: w52HighVal ? roundTo(Number(w52HighVal), 3) : y?.meta.week52High,
        week52Low: w52LowVal ? roundTo(Number(w52LowVal), 3) : y?.meta.week52Low,
        volume,
        turnoverQar,
        marketCapMillionQar: mcapVal ? Math.round(Number(mcapVal) / 1_000_000) : undefined,
        peRatio: peVal !== null && peVal !== undefined ? roundTo(Number(peVal), 1) : undefined,
        pbRatio: pbVal !== null && pbVal !== undefined ? roundTo(Number(pbVal), 2) : undefined,
        beta: betaVal !== null && betaVal !== undefined ? roundTo(Number(betaVal), 2) : undefined,
        sparkline: liveSparkline,
      };
    }
  }

  // Fill ETFs (QATR, QETF) or any ticker absent from TradingView using fast 1m Yahoo live data
  for (const ticker of TRACKED_TICKERS) {
    if (!quotes[ticker]) {
      const fast = etfFastMap.get(ticker);
      const y = yahooMap.get(ticker);
      if (fast && fast.price > 0) {
        const sparkline = y?.sparkline
          ? [...y.sparkline.slice(0, -1), fast.price]
          : undefined;
        quotes[ticker] = {
          ticker,
          price: fast.price,
          previousClose: fast.previousClose,
          open: fast.open,
          dayHigh: fast.dayHigh,
          dayLow: fast.dayLow,
          week52High: fast.week52High ?? y?.meta.week52High,
          week52Low: fast.week52Low ?? y?.meta.week52Low,
          volume: fast.volume,
          turnoverQar: Math.round(fast.volume * fast.price),
          sparkline,
        };
      } else if (y) {
        const prev =
          y.sparkline.length >= 2 ? y.sparkline[y.sparkline.length - 2] : y.meta.previousClose;
        quotes[ticker] = {
          ticker,
          price: y.meta.price,
          previousClose: prev,
          open: prev,
          dayHigh: y.meta.dayHigh,
          dayLow: y.meta.dayLow,
          week52High: y.meta.week52High,
          week52Low: y.meta.week52Low,
          volume: y.meta.volume,
          turnoverQar: Math.round(y.meta.volume * y.meta.price),
          sparkline: y.sparkline,
        };
      }
    }
  }

  const payload: LiveSnapshotResponse = {
    source: 'live',
    provider: 'QSE Public Stream (TradingView + Yahoo Finance)',
    fetchedAt: new Date().toISOString(),
    delayNote: 'Exchange public feed (15-min QSE delay vs licensed brokers like CB Waseet)',
    indices,
    quotes,
  };

  liveCache = { expiresAt: now + 2_000, payload };
  return payload;
}

function getSnapshotSignature(payload: LiveSnapshotResponse): string {
  const idxSig = payload.indices.map((i) => `${i.symbol}:${i.value}`).join('|');
  const quoteSig = Object.keys(payload.quotes)
    .sort()
    .map((k) => {
      const q = payload.quotes[k];
      return `${k}:${q.price}:${q.volume}`;
    })
    .join('|');
  return `${idxSig}__${quoteSig}`;
}

const TIMEFRAME_MAP: Record<string, { interval: string; range: string }> = {
  '1D': { interval: '5m', range: '1d' },
  '1W': { interval: '1h', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '1Y': { interval: '1d', range: '1y' },
  '3Y': { interval: '1wk', range: '3y' },
  '5Y': { interval: '1wk', range: '5y' },
};

const SUBSCRIBERS_FILE = path.resolve('/tmp', 'dohaborsa-subscribers.json');
const SEO_CONFIG_FILE = path.resolve('/tmp', 'qmm-seo-config.json');

interface SeoRuntimeConfig {
  googleSiteVerification?: string;
  adsenseClientId?: string;
}

async function loadSeoConfig(): Promise<SeoRuntimeConfig> {
  try {
    const raw = await fs.readFile(SEO_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SeoRuntimeConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSeoConfig(next: SeoRuntimeConfig): Promise<SeoRuntimeConfig> {
  const current = await loadSeoConfig();
  const merged: SeoRuntimeConfig = {
    ...current,
    ...next,
  };
  await fs.writeFile(SEO_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function extractVerificationToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const metaMatch = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  return (metaMatch ? metaMatch[1] : trimmed).trim();
}

async function loadSubscribers(): Promise<Array<{ email: string; subscribedAt: string }>> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getBaseUrl(req: express.Request): string {
  const envUrl = (process.env.APP_URL || '').trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/robots.txt', (req, res) => {
    const base = getBaseUrl(req);
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`,
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const base = getBaseUrl(req);
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: `${base}/`, priority: '1.0', changefreq: 'hourly' },
      { loc: `${base}/shariah-etf`, priority: '0.9', changefreq: 'daily' },
      { loc: `${base}/dividends`, priority: '0.9', changefreq: 'daily' },
      { loc: `${base}/news`, priority: '0.8', changefreq: 'daily' },
      { loc: `${base}/sentiment`, priority: '0.8', changefreq: 'daily' },
      { loc: `${base}/plus`, priority: '0.6', changefreq: 'weekly' },
      ...SEO_TICKERS.map((t) => ({
        loc: `${base}/stock/${t.ticker}`,
        priority: '0.9',
        changefreq: 'hourly',
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  app.get('/api/seo/status', async (req, res) => {
    const base = getBaseUrl(req);
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(base);
    const runtimeCfg = await loadSeoConfig();
    const verificationToken =
      (process.env.GOOGLE_SITE_VERIFICATION || '').trim() ||
      (runtimeCfg.googleSiteVerification || '').trim();
    const adsenseId =
      (process.env.VITE_ADSENSE_CLIENT_ID || '').trim() ||
      (runtimeCfg.adsenseClientId || '').trim();
    res.json({
      baseUrl: base,
      sitemapUrl: `${base}/sitemap.xml`,
      robotsUrl: `${base}/robots.txt`,
      indexedUrlsCount: 6 + SEO_TICKERS.length,
      hasVerificationToken: Boolean(verificationToken),
      hasAdsenseId: /^ca-pub-\d{8,}$/i.test(adsenseId),
      verificationTokenPreview: verificationToken ? `${verificationToken.slice(0, 8)}...` : '',
      adsenseClientId: /^ca-pub-\d{8,}$/i.test(adsenseId) ? adsenseId : '',
      isPublicUrlConfigured: !isLocalhost,
    });
  });

  app.post('/api/seo/config', async (req, res) => {
    const body = (req.body ?? {}) as {
      googleSiteVerification?: string;
      adsenseClientId?: string;
    };
    const update: SeoRuntimeConfig = {};
    if (typeof body.googleSiteVerification === 'string') {
      update.googleSiteVerification = extractVerificationToken(body.googleSiteVerification);
    }
    if (typeof body.adsenseClientId === 'string') {
      const cleaned = body.adsenseClientId.trim();
      if (cleaned && !/^ca-pub-\d{8,}$/i.test(cleaned)) {
        return res.status(400).json({
          error: 'AdSense Publisher ID must start with ca-pub- followed by digits (e.g., ca-pub-1234567890123456).',
        });
      }
      update.adsenseClientId = cleaned;
    }
    const saved = await saveSeoConfig(update);
    return res.json({
      saved: true,
      hasVerificationToken: Boolean(
        (process.env.GOOGLE_SITE_VERIFICATION || '').trim() || saved.googleSiteVerification,
      ),
      hasAdsenseId: /^ca-pub-\d{8,}$/i.test(
        (process.env.VITE_ADSENSE_CLIENT_ID || '').trim() || saved.adsenseClientId || '',
      ),
    });
  });

  app.get('/api/newsletter/status', async (_req, res) => {
    const list = await loadSubscribers();
    res.json({ subscriberCount: list.length });
  });

  app.post('/api/newsletter/subscribe', async (req, res) => {
    const rawEmail = String(req.body?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const list = await loadSubscribers();
    const alreadyExists = list.some((entry) => entry.email === rawEmail);
    if (!alreadyExists) {
      list.push({ email: rawEmail, subscribedAt: new Date().toISOString() });
      await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2), 'utf8');
    }
    return res.json({
      subscribed: true,
      alreadyExists,
      email: rawEmail,
      subscriberCount: list.length,
    });
  });

  const sseClients = new Set<express.Response>();
  let streamTimer: ReturnType<typeof setInterval> | null = null;
  let lastBroadcastSignature = '';
  let streamInFlight = false;

  const startStreamLoop = () => {
    if (streamTimer) return;
    streamTimer = setInterval(async () => {
      if (sseClients.size === 0 || streamInFlight) return;
      streamInFlight = true;
      try {
        const snapshot = await fetchLiveQseSnapshot(true);
        const sig = getSnapshotSignature(snapshot);
        const frame = `event: tick\ndata: ${JSON.stringify(snapshot)}\n\n`;
        // Always broadcast updates when any price/volume changed, or sync timestamp refresh
        if (sig !== lastBroadcastSignature) {
          lastBroadcastSignature = sig;
          for (const client of sseClients) {
            client.write(frame);
          }
        } else {
          // Push sync heartbeat timestamp so UI reflects continuous live connection
          const syncFrame = `event: heartbeat\ndata: ${JSON.stringify({ fetchedAt: snapshot.fetchedAt })}\n\n`;
          for (const client of sseClients) {
            client.write(syncFrame);
          }
        }
      } catch {
        // Keep SSE stream open on transient upstream errors
      } finally {
        streamInFlight = false;
      }
    }, 3_000);
  };

  const stopStreamLoopIfIdle = () => {
    if (sseClients.size === 0 && streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
  };

  app.get('/api/qse/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);
    startStreamLoop();

    try {
      const initial = await fetchLiveQseSnapshot(false);
      lastBroadcastSignature = getSnapshotSignature(initial);
      res.write(`event: tick\ndata: ${JSON.stringify(initial)}\n\n`);
    } catch {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ fetchedAt: new Date().toISOString() })}\n\n`);
    }

    req.on('close', () => {
      sseClients.delete(res);
      stopStreamLoopIfIdle();
    });
  });

  app.get('/api/qse/live', async (_req, res) => {
    try {
      const data = await fetchLiveQseSnapshot(false);
      res.json(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch live QSE feed';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/qse/history/:ticker', async (req, res) => {
    const rawTicker = String(req.params.ticker || 'QIBK').toUpperCase();
    const tf = String(req.query.tf || '3M').toUpperCase();
    const cfg = TIMEFRAME_MAP[tf] ?? TIMEFRAME_MAP['3M'];
    const cacheKey = `${rawTicker}:${tf}`;

    const cached = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ source: 'live', ticker: rawTicker, timeframe: tf, bars: cached.bars });
    }

    try {
      const isIndex = rawTicker === 'QSI' || rawTicker === 'QERI' || rawTicker === 'QEAS';
      const yahooSym = isIndex
        ? rawTicker === 'QERI'
          ? 'QATR.QA'
          : 'QETF.QA'
        : `${rawTicker}.QA`;

      const [assetChart, benchChart] = await Promise.all([
        fetchYahooChart(yahooSym, cfg.interval, cfg.range),
        yahooSym === 'QETF.QA'
          ? Promise.resolve(null)
          : fetchYahooChart('QETF.QA', cfg.interval, cfg.range),
      ]);

      if (!assetChart || assetChart.bars.length === 0) {
        return res.status(404).json({ error: `No historical bars found for ${rawTicker}` });
      }

      // If index, scale proxy ETF bars to the live index value
      let scale = 1;
      if (isIndex) {
        const live = (await fetchLiveQseSnapshot()) as { indices?: LiveIndexPatch[] };
        const liveIdx = live.indices?.find((i) => i.symbol === rawTicker);
        const lastBarClose = assetChart.bars[assetChart.bars.length - 1].close || 1;
        if (liveIdx) {
          scale = liveIdx.value / lastBarClose;
        } else {
          scale = rawTicker === 'QSI' ? 1014 : rawTicker === 'QERI' ? 2390 : 404;
        }
      }

      const benchByDate = new Map<string, number>();
      const benchBars = benchChart?.bars ?? (yahooSym === 'QETF.QA' ? assetChart.bars : []);
      for (const b of benchBars) {
        benchByDate.set(b.date, roundTo(b.close * 1013.7, 2));
      }

      const bars: OhlcBar[] = assetChart.bars.map((b) => ({
        date: b.date,
        open: roundTo(b.open * scale, isIndex ? 2 : 3),
        high: roundTo(b.high * scale, isIndex ? 2 : 3),
        low: roundTo(b.low * scale, isIndex ? 2 : 3),
        close: roundTo(b.close * scale, isIndex ? 2 : 3),
        volume: b.volume,
        benchmarkClose: benchByDate.get(b.date),
      }));

      historyCache.set(cacheKey, { expiresAt: Date.now() + 60_000, bars });
      return res.json({ source: 'live', ticker: rawTicker, timeframe: tf, bars });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch history';
      return res.status(502).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    const seoHtmlRoutes = [
      '/',
      '/market',
      '/stock/:ticker',
      '/shariah-etf',
      '/dividends',
      '/news',
      '/portfolio',
      '/sentiment',
      '/alerts',
      '/plus',
      '/seo',
    ];

    app.get(seoHtmlRoutes, async (req, res, next) => {
      try {
        const accept = req.headers.accept || '';
        if (!accept.includes('text/html')) return next();
        const rawTemplate = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const searchIndex = req.originalUrl.indexOf('?');
        const search = searchIndex >= 0 ? req.originalUrl.slice(searchIndex) : '';
        const runtimeCfg = await loadSeoConfig();
        const verificationToken =
          (process.env.GOOGLE_SITE_VERIFICATION || '').trim() ||
          (runtimeCfg.googleSiteVerification || '').trim();
        const finalHtml = injectSeoIntoHtml(transformed, {
          baseUrl: getBaseUrl(req),
          pathname: req.path,
          search,
          googleSiteVerification: verificationToken,
        });
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (req, res, next) => {
      try {
        const rawHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
        const searchIndex = req.originalUrl.indexOf('?');
        const search = searchIndex >= 0 ? req.originalUrl.slice(searchIndex) : '';
        const runtimeCfg = await loadSeoConfig();
        const verificationToken =
          (process.env.GOOGLE_SITE_VERIFICATION || '').trim() ||
          (runtimeCfg.googleSiteVerification || '').trim();
        const finalHtml = injectSeoIntoHtml(rawHtml, {
          baseUrl: getBaseUrl(req),
          pathname: req.path,
          search,
          googleSiteVerification: verificationToken,
        });
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(finalHtml);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Qatar Money Markets QSE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
