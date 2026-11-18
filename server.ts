import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { SEO_TICKERS, injectSeoIntoHtml } from './src/utils/seo.ts';
import {
  computeObservedMalabarKaratSpreadsPct,
  computeObservedMalabarSpreadPct,
  convertMalabarUsdToQatarBoard,
} from './src/utils/goldMath.ts';
import type { GoldRatesSnapshot } from './src/types/market.ts';

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
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  benchmarkClose?: number;
  dma45?: number | null;
  dma200?: number | null;
}

function roundTo(val: number, decimals = 3): number {
  const f = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * f) / f;
}

// Short-lived in-memory caches:
// - liveCache: 1s max TTL for real-time official QSE quote updates
// - tvMetaCache: 5m TTL for beta & index range metadata
// - sparklineCache: 5m TTL for 10-point daily sparklines
let liveCache: { expiresAt: number; payload: LiveSnapshotResponse } | null = null;
let tvMetaCache: {
  expiresAt: number;
  indexBounds: Record<string, { dayHigh: number; dayLow: number; week52High?: number; week52Low?: number }>;
  betas: Record<string, number>;
} | null = null;
const indexIntradayBounds = new Map<string, { dayHigh: number; dayLow: number }>();
const historyCache = new Map<string, { expiresAt: number; bars: OhlcBar[] }>();
const dailyDmaCache = new Map<
  string,
  {
    expiresAt: number;
    entries: Array<{ date: string; dma45: number | null; dma200: number | null }>;
    byDate: Map<string, { dma45: number | null; dma200: number | null }>;
    latest: { dma45: number | null; dma200: number | null };
  }
>();
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
    const dohaEpoch = timestamps[i] + 3 * 3600;
    const dohaDate = new Date(dohaEpoch * 1000);
    const hhmm = `${String(dohaDate.getUTCHours()).padStart(2, '0')}:${String(
      dohaDate.getUTCMinutes(),
    ).padStart(2, '0')}`;
    const isIntraday = interval.endsWith('m') || interval === '1h';
    const label =
      range === '1d'
        ? hhmm
        : isIntraday
          ? `${dohaDate.toISOString().slice(5, 10)} ${hhmm}`
          : dohaDate.toISOString().slice(0, 10);

    bars.push({
      date: label,
      timestamp: dohaEpoch,
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

const QE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Referer: 'https://www.qe.com.qa/',
  Origin: 'https://www.qe.com.qa',
  Accept: 'application/json, text/javascript, */*; q=0.01',
};

interface QeMarketWatchRow {
  Symbol?: string;
  LastPrice?: string | number;
  PrevClosing?: string | number;
  OpenPrice?: string | number;
  High?: string | number;
  Low?: string | number;
  W52High?: string | number;
  W52Low?: string | number;
  Volume?: string | number;
  Value?: string | number;
  CompMarketCap?: string | number;
  PERatio?: string | number;
  PriceBook?: string | number;
}

interface QeIndexRow {
  Symbol?: string;
  CurrentIndex?: string | number;
  PrevClosing?: string | number;
}

function toPosNum(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function getTvBackgroundMeta() {
  const now = Date.now();
  if (tvMetaCache && tvMetaCache.expiresAt > now) {
    return tvMetaCache;
  }

  try {
    const tvSymbols = [
      'QSE:GNRI',
      'QSE:QERI',
      'QSE:QEAS',
      ...TRACKED_TICKERS.map((t) => `QSE:${t}`),
    ];
    const res = await fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; QatarMoneyMarkets/1.0)',
      },
      body: JSON.stringify({
        symbols: { tickers: tvSymbols },
        columns: ['name', 'high', 'low', 'price_52_week_high', 'price_52_week_low', 'beta_1_year'],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return tvMetaCache;
    const json = (await res.json()) as {
      data?: Array<{ s: string; d: Array<string | number | null> }>;
    };
    const indexBounds: Record<
      string,
      { dayHigh: number; dayLow: number; week52High?: number; week52Low?: number }
    > = {};
    const betas: Record<string, number> = {};

    for (const row of json.data ?? []) {
      const [rawName, highVal, lowVal, w52HighVal, w52LowVal, betaVal] = row.d;
      const sym = String(rawName ?? '');
      if (sym === 'GNRI' || sym === 'QERI' || sym === 'QEAS') {
        const mapped = sym === 'GNRI' ? 'QSI' : sym;
        const dh = toPosNum(highVal);
        const dl = toPosNum(lowVal);
        if (dh && dl) {
          indexBounds[mapped] = {
            dayHigh: roundTo(dh, 2),
            dayLow: roundTo(dl, 2),
            week52High: toPosNum(w52HighVal) ? roundTo(Number(w52HighVal), 2) : undefined,
            week52Low: toPosNum(w52LowVal) ? roundTo(Number(w52LowVal), 2) : undefined,
          };
        }
      } else if (betaVal !== null && betaVal !== undefined && Number.isFinite(Number(betaVal))) {
        betas[sym] = roundTo(Number(betaVal), 2);
      }
    }

    tvMetaCache = {
      expiresAt: now + 300_000,
      indexBounds,
      betas,
    };
    return tvMetaCache;
  } catch {
    return tvMetaCache;
  }
}

let sparkRefreshInFlight = false;
function refreshBackgroundMetaIfNeeded() {
  const now = Date.now();
  const needsSpark = TRACKED_TICKERS.some((t) => {
    const c = sparklineCache.get(t);
    return !c || c.expiresAt <= now;
  });
  if (needsSpark && !sparkRefreshInFlight) {
    sparkRefreshInFlight = true;
    Promise.allSettled(TRACKED_TICKERS.map((t) => getSparklineAndYahooMeta(t))).finally(() => {
      sparkRefreshInFlight = false;
    });
  }
  if (!tvMetaCache || tvMetaCache.expiresAt <= now) {
    void getTvBackgroundMeta();
  }
}

async function fetchOfficialQseSnapshot(): Promise<LiveSnapshotResponse | null> {
  refreshBackgroundMetaIfNeeded();

  const [mwRes, idxRes] = await Promise.all([
    fetch('https://www.qe.com.qa/wp/mw_app/mw.php', {
      method: 'POST',
      headers: QE_HEADERS,
      body: 'f=MarketWatch',
      signal: AbortSignal.timeout(9000),
    }),
    fetch('https://www.qe.com.qa/wp/mw_app/mw.php', {
      method: 'POST',
      headers: QE_HEADERS,
      body: 'f=Indices',
      signal: AbortSignal.timeout(9000),
    }),
  ]);

  if (!mwRes.ok || !idxRes.ok) return null;

  const [mwJson, idxJson] = (await Promise.all([mwRes.json(), idxRes.json()])) as [
    { rows?: QeMarketWatchRow[] },
    { rows?: QeIndexRow[] },
  ];
  const mwRows = mwJson.rows ?? [];
  const idxRows = idxJson.rows ?? [];
  if (mwRows.length === 0 || idxRows.length === 0) return null;

  const tvMeta = tvMetaCache;
  const yahooMap = sparklineCache;

  const indices: LiveIndexPatch[] = [];
  for (const row of idxRows) {
    const rawSym = String(row.Symbol ?? '');
    if (rawSym !== 'QE20' && rawSym !== 'QERI' && rawSym !== 'QEAS') continue;
    const mappedSym: 'QSI' | 'QERI' | 'QEAS' = rawSym === 'QE20' ? 'QSI' : rawSym;
    const prev = toPosNum(row.PrevClosing) ?? 0;
    const val = toPosNum(row.CurrentIndex) ?? prev;
    if (!val) continue;

    const tvB = tvMeta?.indexBounds[mappedSym];
    const trackedB = indexIntradayBounds.get(mappedSym);
    const dayHigh = roundTo(
      Math.max(val, prev || val, tvB?.dayHigh ?? val, trackedB?.dayHigh ?? val),
      2,
    );
    const dayLow = roundTo(
      Math.min(val, prev || val, tvB?.dayLow ?? val, trackedB?.dayLow ?? val),
      2,
    );
    indexIntradayBounds.set(mappedSym, { dayHigh, dayLow });

    const proxy = mappedSym === 'QERI' ? yahooMap.get('QATR') : yahooMap.get('QETF');
    let sparkline: number[] | undefined;
    if (proxy && proxy.sparkline.length > 1) {
      const lastProxy = proxy.sparkline[proxy.sparkline.length - 1] || 1;
      sparkline = [
        ...proxy.sparkline.slice(0, -1).map((v) => roundTo((v / lastProxy) * val, 2)),
        roundTo(val, 2),
      ];
    }

    indices.push({
      symbol: mappedSym,
      value: roundTo(val, 2),
      previousClose: roundTo(prev || val, 2),
      dayHigh,
      dayLow,
      week52High: tvB?.week52High,
      week52Low: tvB?.week52Low,
      sparkline,
    });
  }

  const trackedSet = new Set<string>(TRACKED_TICKERS);
  const quotes: Record<string, LiveQuotePatch> = {};

  for (const row of mwRows) {
    const sym = String(row.Symbol ?? '').trim().toUpperCase();
    if (!trackedSet.has(sym)) continue;

    const prevClose = toPosNum(row.PrevClosing) ?? 0;
    const price = toPosNum(row.LastPrice) ?? prevClose;
    if (!price) continue;

    const open = toPosNum(row.OpenPrice) ?? (prevClose || price);
    const high = toPosNum(row.High) ?? Math.max(open, price);
    const low = toPosNum(row.Low) ?? Math.min(open, price);
    const volume = Math.max(0, Math.round(Number(row.Volume ?? 0)));
    const turnoverQar = Math.max(0, Math.round(Number(row.Value ?? volume * price)));
    const w52High = toPosNum(row.W52High);
    const w52Low = toPosNum(row.W52Low);
    const mcap = toPosNum(row.CompMarketCap);
    const pe = toPosNum(row.PERatio);
    const pb = toPosNum(row.PriceBook);
    const y = yahooMap.get(sym);

    quotes[sym] = {
      ticker: sym,
      price: roundTo(price, 3),
      previousClose: roundTo(prevClose || price, 3),
      open: roundTo(open, 3),
      dayHigh: roundTo(Math.max(high, price), 3),
      dayLow: roundTo(Math.min(low, price), 3),
      week52High: w52High ? roundTo(w52High, 3) : y?.meta.week52High,
      week52Low: w52Low ? roundTo(w52Low, 3) : y?.meta.week52Low,
      volume,
      turnoverQar,
      marketCapMillionQar: mcap ? Math.round(mcap / 1_000_000) : undefined,
      peRatio: pe ? roundTo(pe, 1) : undefined,
      pbRatio: pb ? roundTo(pb, 2) : undefined,
      beta: tvMeta?.betas[sym],
      sparkline: y?.sparkline ? [...y.sparkline.slice(0, -1), roundTo(price, 3)] : undefined,
    };
  }

  if (Object.keys(quotes).length === 0) return null;

  return {
    source: 'live',
    provider: 'Official Qatar Stock Exchange (qe.com.qa Real-Time Feed)',
    fetchedAt: new Date().toISOString(),
    delayNote: 'Real-time QSE feed (matches licensed broker terminals like CBQ Waseet)',
    indices,
    quotes,
  };
}

async function fetchLiveQseSnapshot(forceRefresh = false): Promise<LiveSnapshotResponse> {
  const now = Date.now();
  if (!forceRefresh && liveCache && liveCache.expiresAt > now) {
    return liveCache.payload;
  }

  // Primary: Official Zero-Delay Qatar Stock Exchange Feed (qe.com.qa)
  try {
    const official = await fetchOfficialQseSnapshot();
    if (official) {
      liveCache = { expiresAt: now + 1_000, payload: official };
      return official;
    }
  } catch {
    // Fall back to TradingView + Yahoo Finance below if qe.com.qa is temporarily unreachable
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
    provider: 'QSE Public Fallback (TradingView + Yahoo Finance)',
    fetchedAt: new Date().toISOString(),
    delayNote: '15-min delayed fallback feed',
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
  '5M': { interval: '5m', range: '1d' },
  '15M': { interval: '15m', range: '5d' },
  '1H': { interval: '1h', range: '1mo' },
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
  const httpServer = http.createServer(app);
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
      { loc: `${base}/gold`, priority: '0.9', changefreq: 'hourly' },
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
    let bakedVerificationToken = '';
    try {
      const indexPath =
        process.env.NODE_ENV === 'production'
          ? path.resolve(__dirname, 'dist', 'index.html')
          : path.resolve(__dirname, 'index.html');
      const indexHtml = await fs.readFile(indexPath, 'utf8');
      const match = /<meta\s+name="google-site-verification"\s+content="([^"]+)"/i.exec(indexHtml);
      bakedVerificationToken = (match?.[1] ?? '').trim();
    } catch {
      bakedVerificationToken = '';
    }
    const verificationToken =
      (process.env.GOOGLE_SITE_VERIFICATION || '').trim() ||
      (runtimeCfg.googleSiteVerification || '').trim() ||
      bakedVerificationToken;
    const adsenseId =
      (process.env.VITE_ADSENSE_CLIENT_ID || '').trim() ||
      (runtimeCfg.adsenseClientId || '').trim();
    res.json({
      baseUrl: base,
      sitemapUrl: `${base}/sitemap.xml`,
      robotsUrl: `${base}/robots.txt`,
      indexedUrlsCount: 7 + SEO_TICKERS.length,
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
    }, 2_000);
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

  async function getDailyDmaContext(yahooSymbol: string, dailyRange: '2y' | '5y') {
    const cacheKey = `${yahooSymbol}:${dailyRange}`;
    const now = Date.now();
    const cached = dailyDmaCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached;
    }

    const dailyChart = await fetchYahooChart(yahooSymbol, '1d', dailyRange).catch(() => null);
    if (!dailyChart || dailyChart.bars.length === 0) {
      return null;
    }

    const closes = dailyChart.bars.map((b) => b.close);
    const computeRollingSma = (period: number): Array<number | null> => {
      const out: Array<number | null> = [];
      let sum = 0;
      for (let i = 0; i < closes.length; i++) {
        sum += closes[i];
        if (i >= period) sum -= closes[i - period];
        out.push(i < period - 1 ? null : sum / period);
      }
      return out;
    };

    const sma45 = computeRollingSma(45);
    const sma200 = computeRollingSma(200);
    const entries: Array<{ date: string; dma45: number | null; dma200: number | null }> = [];
    const byDate = new Map<string, { dma45: number | null; dma200: number | null }>();

    for (let i = 0; i < dailyChart.bars.length; i++) {
      const dateStr = dailyChart.bars[i].date.slice(0, 10);
      const val = { dma45: sma45[i], dma200: sma200[i] };
      entries.push({ date: dateStr, ...val });
      byDate.set(dateStr, val);
    }

    const latest = entries[entries.length - 1]
      ? { dma45: entries[entries.length - 1].dma45, dma200: entries[entries.length - 1].dma200 }
      : { dma45: null, dma200: null };

    const result = {
      expiresAt: now + 300_000,
      entries,
      byDate,
      latest,
    };
    dailyDmaCache.set(cacheKey, result);
    return result;
  }

  function resolveDmaForBar(
    bar: OhlcBar,
    ctx: Awaited<ReturnType<typeof getDailyDmaContext>>,
  ): { dma45: number | null; dma200: number | null } {
    if (!ctx) return { dma45: null, dma200: null };
    const dateKey = bar.timestamp
      ? new Date(bar.timestamp * 1000).toISOString().slice(0, 10)
      : bar.date.slice(0, 10);
    const exact = ctx.byDate.get(dateKey);
    if (exact) return exact;

    // For weekly or weekend-aligned bars, pick the latest daily entry on or before dateKey
    let lo = 0;
    let hi = ctx.entries.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ctx.entries[mid].date <= dateKey) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best >= 0) {
      return { dma45: ctx.entries[best].dma45, dma200: ctx.entries[best].dma200 };
    }
    return ctx.latest;
  }

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
      const dailyRange: '2y' | '5y' = tf === '3Y' || tf === '5Y' ? '5y' : '2y';

      const [assetChart, benchChart, dmaCtx] = await Promise.all([
        fetchYahooChart(yahooSym, cfg.interval, cfg.range),
        yahooSym === 'QETF.QA'
          ? Promise.resolve(null)
          : fetchYahooChart('QETF.QA', cfg.interval, cfg.range),
        getDailyDmaContext(yahooSym, dailyRange),
      ]);

      if (!assetChart || assetChart.bars.length === 0) {
        return res.status(404).json({ error: `No historical bars found for ${rawTicker}` });
      }

      // Anchor final bar to official real-time QSE feed (stocks and indices)
      let scale = 1;
      let liveQuotePrice: number | null = null;
      let liveQuoteHigh: number | null = null;
      let liveQuoteLow: number | null = null;
      const liveSnapshot = await fetchLiveQseSnapshot(false).catch(() => null);

      if (isIndex) {
        const liveIdx = liveSnapshot?.indices?.find((i) => i.symbol === rawTicker);
        const lastBarClose = assetChart.bars[assetChart.bars.length - 1].close || 1;
        if (liveIdx) {
          scale = liveIdx.value / lastBarClose;
          liveQuotePrice = liveIdx.value;
          liveQuoteHigh = liveIdx.dayHigh;
          liveQuoteLow = liveIdx.dayLow;
        } else {
          scale = rawTicker === 'QSI' ? 1014 : rawTicker === 'QERI' ? 2390 : 404;
        }
      } else {
        const liveQuote = liveSnapshot?.quotes?.[rawTicker];
        if (liveQuote && liveQuote.price > 0) {
          liveQuotePrice = liveQuote.price;
          liveQuoteHigh = liveQuote.dayHigh;
          liveQuoteLow = liveQuote.dayLow;
        }
      }

      const benchByDate = new Map<string, number>();
      const benchBars = benchChart?.bars ?? (yahooSym === 'QETF.QA' ? assetChart.bars : []);
      for (const b of benchBars) {
        benchByDate.set(b.date, roundTo(b.close * 1013.7, 2));
      }

      const precision = isIndex ? 2 : 3;
      const bars: OhlcBar[] = assetChart.bars.map((b) => {
        const dma = resolveDmaForBar(b, dmaCtx);
        return {
          date: b.date,
          timestamp: b.timestamp,
          open: roundTo(b.open * scale, precision),
          high: roundTo(b.high * scale, precision),
          low: roundTo(b.low * scale, precision),
          close: roundTo(b.close * scale, precision),
          volume: b.volume,
          benchmarkClose: benchByDate.get(b.date),
          dma45: dma.dma45 !== null ? roundTo(dma.dma45 * scale, precision) : null,
          dma200: dma.dma200 !== null ? roundTo(dma.dma200 * scale, precision) : null,
        };
      });

      if (bars.length > 0 && liveQuotePrice !== null && liveQuotePrice > 0) {
        const last = bars[bars.length - 1];
        const isDailyBar = tf === '1M' || tf === '3M' || tf === '1Y';
        last.close = roundTo(liveQuotePrice, precision);
        last.high = roundTo(
          Math.max(last.high, liveQuotePrice, isDailyBar && liveQuoteHigh ? liveQuoteHigh : last.high),
          precision,
        );
        last.low = roundTo(
          Math.min(last.low, liveQuotePrice, isDailyBar && liveQuoteLow ? liveQuoteLow : last.low),
          precision,
        );
      }

      const isIntradayTf = tf === '5M' || tf === '15M' || tf === '1H' || tf === '1D' || tf === '1W';
      historyCache.set(cacheKey, { expiresAt: Date.now() + (isIntradayTf ? 10_000 : 30_000), bars });
      return res.json({ source: 'live', ticker: rawTicker, timeframe: tf, bars });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch history';
      return res.status(502).json({ error: message });
    }
  });

  // ---------------------------------------------------------------------------
  // Live Gold Rates (XE.com + Real-Time XAU/USD + USD/QAR + Malabar Gold Qatar)
  // ---------------------------------------------------------------------------
  let goldLiveCache: { expiresAt: number; payload: GoldRatesSnapshot } | null = null;
  let xeRatesCache: {
    expiresAt: number;
    xauUsd: number | null;
    usdQar: number | null;
    timestampMs: number;
  } | null = null;
  let malabarCache: {
    expiresAt: number;
    data: {
      rates: { '24K': number; '22K': number; '18K': number; '21K'?: number } | null;
      usdPerGram: { '24K': number; '22K': number; '18K': number } | null;
      updatedText: string;
      sourceLabel: string;
    };
  } | null = null;
  const goldHistoryCache = new Map<string, { expiresAt: number; bars: OhlcBar[] }>();

  async function fetchXeMidMarketSnapshot(forceRefresh = false): Promise<{
    xauUsd: number | null;
    usdQar: number | null;
    timestampMs: number;
  }> {
    const now = Date.now();
    if (!forceRefresh && xeRatesCache && xeRatesCache.expiresAt > now) {
      return {
        xauUsd: xeRatesCache.xauUsd,
        usdQar: xeRatesCache.usdQar,
        timestampMs: xeRatesCache.timestampMs,
      };
    }

    try {
      const url = 'https://www.xe.com/currencyconverter/convert/?Amount=1&From=XAU&To=USD';
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (r.ok) {
        const html = await r.text();
        let xauUsd: number | null = null;
        let usdQar: number | null = null;
        let timestampMs = 0;

        const nextMatch = /__NEXT_DATA__[^>]*>([^<]+)</.exec(html);
        if (nextMatch) {
          try {
            const parsed = JSON.parse(nextMatch[1]) as {
              props?: {
                pageProps?: {
                  initialRatesData?: { timestamp?: number; rates?: Record<string, number> };
                };
              };
            };
            const ratesData = parsed?.props?.pageProps?.initialRatesData;
            const rates = ratesData?.rates;
            if (typeof ratesData?.timestamp === 'number') {
              timestampMs = ratesData.timestamp;
            }
            if (rates && typeof rates.XAU === 'number' && rates.XAU > 0) {
              xauUsd = 1 / rates.XAU;
            }
            if (rates && typeof rates.QAR === 'number' && rates.QAR > 0) {
              usdQar = rates.QAR;
            }
          } catch {
            // Fall back to visible text extraction below
          }
        }

        if (!xauUsd) {
          const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          const m = /1\s*XAU\s*=\s*([\d,]+(?:\.\d+)?)\s*USD/i.exec(text);
          if (m) {
            const val = Number(m[1].replace(/,/g, ''));
            if (Number.isFinite(val) && val > 0) xauUsd = val;
          }
        }

        xeRatesCache = {
          expiresAt: now + 15_000,
          xauUsd,
          usdQar,
          timestampMs,
        };
        return { xauUsd, usdQar, timestampMs };
      }
    } catch {
      // Keep last cached XE rate if request fails
    }

    return {
      xauUsd: xeRatesCache?.xauUsd ?? null,
      usdQar: xeRatesCache?.usdQar ?? null,
      timestampMs: xeRatesCache?.timestampMs ?? 0,
    };
  }

  async function fetchRealtimeSpotXauUsd(): Promise<{
    price: number;
    previousClose: number;
    source: string;
  } | null> {
    try {
      const res = await fetch('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; QatarMoneyMarkets/1.0)',
        },
        body: JSON.stringify({
          symbols: { tickers: ['FX_IDC:XAUUSD', 'OANDA:XAUUSD', 'TVC:GOLD'] },
          columns: ['name', 'close', 'change_abs'],
        }),
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: Array<{ s: string; d: Array<string | number | null> }>;
      };
      const row =
        json.data?.find((d) => d.s === 'FX_IDC:XAUUSD' && Number(d.d?.[1]) > 0) ??
        json.data?.find((d) => d.s === 'OANDA:XAUUSD' && Number(d.d?.[1]) > 0) ??
        json.data?.find((d) => Number(d.d?.[1]) > 0);
      if (!row) return null;
      const close = Number(row.d[1]);
      const changeAbs = Number(row.d[2] ?? 0);
      if (!Number.isFinite(close) || close <= 0) return null;
      return {
        price: close,
        previousClose: Number.isFinite(changeAbs) ? close - changeAbs : close,
        source: 'Live XAU/USD Spot Feed (XE.com Linked)',
      };
    } catch {
      return null;
    }
  }

  async function fetchMalabarQatarRates(
    usdQar: number,
    forceRefresh = false,
  ): Promise<{
    rates: { '24K': number; '22K': number; '18K': number; '21K'?: number } | null;
    usdPerGram: { '24K': number; '22K': number; '18K': number } | null;
    updatedText: string;
    sourceLabel: string;
  }> {
    const now = Date.now();
    if (!forceRefresh && malabarCache && malabarCache.expiresAt > now && malabarCache.data.rates) {
      return malabarCache.data;
    }

    // Primary: Official Malabar Gold & Diamonds live currentGoldRate endpoint
    try {
      const r = await fetch(
        'https://www.malabargoldanddiamonds.com/uk/malabarprice/index/currentGoldRate/',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Accept: 'application/json, text/javascript, */*; q=0.01',
          },
          signal: AbortSignal.timeout(7000),
        },
      );
      if (r.ok) {
        const json = (await r.json()) as { data?: string };
        const html = String(json.data ?? '');
        const m24 = /24\s*KT\([^)]*\)\s*-\s*<\/td>\s*<td>\s*USD\s*([\d,.]+)\s*\/g/i.exec(html);
        const m22 = /22\s*KT\([^)]*\)\s*-\s*<\/td>\s*<td>\s*USD\s*([\d,.]+)\s*\/g/i.exec(html);
        const m18 = /18\s*KT\([^)]*\)\s*-\s*<\/td>\s*<td>\s*USD\s*([\d,.]+)\s*\/g/i.exec(html);
        const dtMatch = /Updated on\s*:\s*([^<]+)/i.exec(html);
        const tmMatch = /class="tm"[^>]*>\s*([^<]+)/i.exec(html);

        const usd24 = m24 ? Number(m24[1].replace(/,/g, '')) : 0;
        const usd22 = m22 ? Number(m22[1].replace(/,/g, '')) : 0;
        const usd18 = m18 ? Number(m18[1].replace(/,/g, '')) : 0;

        if (usd24 > 0 && usd22 > 0 && usd18 > 0) {
          const qarRates = convertMalabarUsdToQatarBoard({ usd24, usd22, usd18, usdQar });
          const updatedStr = [dtMatch?.[1]?.trim(), tmMatch?.[1]?.trim()]
            .filter(Boolean)
            .join(' · ');
          const result = {
            rates: qarRates,
            usdPerGram: {
              '24K': roundTo(usd24, 2),
              '22K': roundTo(usd22, 2),
              '18K': roundTo(usd18, 2),
            },
            updatedText: updatedStr ? `Malabar Official (${updatedStr})` : 'Malabar Official Live Board',
            sourceLabel: 'Malabar Gold & Diamonds Official Feed (Qatar Retail Board)',
          };
          malabarCache = { expiresAt: now + 30_000, data: result };
          return result;
        }
      }
    } catch {
      // Fall through to Dubai City of Gold GCC retail benchmark below
    }

    // Secondary GCC fallback: Dubai Gold & Jewellery Group (AED / 3.6725 -> USD/g -> Malabar Qatar parity)
    try {
      const r2 = await fetch('https://dubaicityofgold.com/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (r2.ok) {
        const text = (await r2.text())
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ');
        const m = /24K Gold AED\s*([\d,.]+)\s*22K Gold AED\s*([\d,.]+).*?18K Gold AED\s*([\d,.]+)/i.exec(
          text,
        );
        if (m) {
          const usd24 = Number(m[1].replace(/,/g, '')) / 3.6725;
          const usd22 = Number(m[2].replace(/,/g, '')) / 3.6725;
          const usd18 = Number(m[3].replace(/,/g, '')) / 3.6725;
          if (usd24 > 0 && usd22 > 0 && usd18 > 0) {
            const result = {
              rates: convertMalabarUsdToQatarBoard({ usd24, usd22, usd18, usdQar }),
              usdPerGram: {
                '24K': roundTo(usd24, 2),
                '22K': roundTo(usd22, 2),
                '18K': roundTo(usd18, 2),
              },
              updatedText: 'GCC Retail Board Fallback',
              sourceLabel: 'GCC Retail Jewellery Board (dubaicityofgold.com)',
            };
            malabarCache = { expiresAt: now + 30_000, data: result };
            return result;
          }
        }
      }
    } catch {
      // Return null if both live feeds fail
    }

    return (
      malabarCache?.data ?? {
        rates: null,
        usdPerGram: null,
        updatedText: 'Malabar counter feed temporarily unavailable',
        sourceLabel: 'Malabar Gold & Diamonds (unavailable)',
      }
    );
  }

  async function fetchLiveGoldSnapshot(forceRefresh = false): Promise<GoldRatesSnapshot> {
    const now = Date.now();
    if (!forceRefresh && goldLiveCache && goldLiveCache.expiresAt > now) {
      return goldLiveCache.payload;
    }

    const [xeMid, realtimeSpot, gcChart] = await Promise.all([
      fetchXeMidMarketSnapshot(forceRefresh),
      fetchRealtimeSpotXauUsd(),
      fetchYahooChart('GC=F', '1m', '1d').catch(() => null),
    ]);

    const usdQar = xeMid.usdQar ?? 3.64;
    const malabar = await fetchMalabarQatarRates(usdQar, forceRefresh);

    const gcBars = gcChart?.bars ?? [];
    const gcLatest = Number(gcChart?.meta?.regularMarketPrice ?? gcBars[gcBars.length - 1]?.close ?? 0);
    const gcPrev = Number(
      gcChart?.meta?.chartPreviousClose ??
        gcChart?.meta?.previousClose ??
        (gcBars.length >= 2 ? gcBars[0].open : gcLatest),
    );

    const xeIsFresh =
      Boolean(xeMid.xauUsd && xeMid.xauUsd > 0) &&
      xeMid.timestampMs > 0 &&
      now - xeMid.timestampMs <= 90_000;

    let xauUsd = 0;
    let previousXauUsd = 0;
    let xauUsdSource = '';

    if (xeIsFresh && xeMid.xauUsd) {
      xauUsd = xeMid.xauUsd;
      previousXauUsd = realtimeSpot?.previousClose ?? (gcPrev > 0 ? gcPrev : xauUsd);
      xauUsdSource = 'XE.com Live Mid-Market Rate (XAU/USD)';
    } else if (realtimeSpot && realtimeSpot.price > 0) {
      xauUsd = realtimeSpot.price;
      previousXauUsd = realtimeSpot.previousClose > 0 ? realtimeSpot.previousClose : xauUsd;
      xauUsdSource = realtimeSpot.source;
    } else if (xeMid.xauUsd && xeMid.xauUsd > 0) {
      xauUsd = xeMid.xauUsd;
      previousXauUsd = gcPrev > 0 ? gcPrev : xauUsd;
      xauUsdSource = 'XE.com Mid-Market Rate (XAU/USD)';
    } else if (gcLatest > 0) {
      xauUsd = gcLatest;
      previousXauUsd = gcPrev > 0 ? gcPrev : gcLatest;
      xauUsdSource = 'COMEX Gold Futures Live (GC=F)';
    }

    if (xauUsd <= 0) {
      throw new Error('Unable to fetch live XAU/USD gold rate from XE.com or fallback market feed');
    }

    const usdQarSource = xeMid.usdQar ? 'XE.com Live Rate (USD/QAR)' : 'QCB Official Peg (3.64 QAR)';

    const calibratedKaratSpreadsPct = computeObservedMalabarKaratSpreadsPct(
      xauUsd,
      usdQar,
      malabar.rates,
    );
    const calibratedSpreadPct = computeObservedMalabarSpreadPct(
      xauUsd,
      usdQar,
      malabar.rates,
      4.87,
    );

    const payload: GoldRatesSnapshot = {
      fetchedAt: new Date().toISOString(),
      xauUsd: roundTo(xauUsd, 2),
      previousXauUsd: roundTo(previousXauUsd > 0 ? previousXauUsd : xauUsd, 2),
      xauUsdSource,
      usdQar: roundTo(usdQar, 4),
      usdQarSource,
      xauQar: roundTo(xauUsd * usdQar, 2),
      xeChartUrl: 'https://www.xe.com/currencycharts/?from=XAU&to=USD',
      xeConverterUrl: 'https://www.xe.com/currencyconverter/convert/?Amount=1&From=XAU&To=USD',
      xeQarConverterUrl: 'https://www.xe.com/currencyconverter/convert/?Amount=1&From=XAU&To=QAR',
      malabarOfficialUrl: 'https://www.malabargoldanddiamonds.com/ae/',
      malabarStoresUrl: 'https://www.malabargoldanddiamonds.com/uk/stores/qatar',
      malabarSourceLabel: malabar.sourceLabel,
      malabarUpdatedText: malabar.updatedText,
      malabarUsdPerGram: malabar.usdPerGram,
      malabarRatesQarPerGram: malabar.rates,
      calibratedSpreadPct,
      calibratedKaratSpreadsPct,
    };

    goldLiveCache = { expiresAt: now + 1_500, payload };
    return payload;
  }

  function getGoldSignature(s: GoldRatesSnapshot): string {
    const r = s.malabarRatesQarPerGram;
    return `${s.xauUsd}|${s.usdQar}|${r?.['24K'] ?? ''}|${r?.['22K'] ?? ''}|${r?.['18K'] ?? ''}`;
  }

  const goldSseClients = new Set<express.Response>();
  let goldStreamTimer: ReturnType<typeof setInterval> | null = null;
  let lastGoldBroadcastSig = '';
  let goldStreamInFlight = false;

  const startGoldStreamLoop = () => {
    if (goldStreamTimer) return;
    goldStreamTimer = setInterval(async () => {
      if (goldSseClients.size === 0 || goldStreamInFlight) return;
      goldStreamInFlight = true;
      try {
        const snapshot = await fetchLiveGoldSnapshot(false);
        const sig = getGoldSignature(snapshot);
        if (sig !== lastGoldBroadcastSig) {
          lastGoldBroadcastSig = sig;
          const frame = `event: tick\ndata: ${JSON.stringify(snapshot)}\n\n`;
          for (const client of goldSseClients) {
            client.write(frame);
          }
        } else {
          const heartbeat = `event: heartbeat\ndata: ${JSON.stringify({ fetchedAt: snapshot.fetchedAt })}\n\n`;
          for (const client of goldSseClients) {
            client.write(heartbeat);
          }
        }
      } catch {
        // Keep gold SSE stream alive across transient upstream hiccups
      } finally {
        goldStreamInFlight = false;
      }
    }, 2_500);
  };

  const stopGoldStreamLoopIfIdle = () => {
    if (goldSseClients.size === 0 && goldStreamTimer) {
      clearInterval(goldStreamTimer);
      goldStreamTimer = null;
    }
  };

  app.get('/api/gold/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    goldSseClients.add(res);
    startGoldStreamLoop();

    try {
      const initial = await fetchLiveGoldSnapshot(false);
      lastGoldBroadcastSig = getGoldSignature(initial);
      res.write(`event: tick\ndata: ${JSON.stringify(initial)}\n\n`);
    } catch {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ fetchedAt: new Date().toISOString() })}\n\n`);
    }

    req.on('close', () => {
      goldSseClients.delete(res);
      stopGoldStreamLoopIfIdle();
    });
  });

  app.get('/api/gold/live', async (req, res) => {
    try {
      const force = req.query.refresh === '1';
      const payload = await fetchLiveGoldSnapshot(force);
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch live gold rates';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/gold/history', async (req, res) => {
    const tf = String(req.query.tf || '1M').toUpperCase();
    const cfg = TIMEFRAME_MAP[tf] ?? TIMEFRAME_MAP['1M'];
    const isIntradayTf = tf === '5M' || tf === '15M' || tf === '1H' || tf === '1D' || tf === '1W';
    const cached = goldHistoryCache.get(tf);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ source: 'xe-anchored', symbol: 'XAU/USD', timeframe: tf, bars: cached.bars });
    }

    try {
      const dailyRange: '2y' | '5y' = tf === '3Y' || tf === '5Y' ? '5y' : '2y';
      const [goldChart, dmaCtx, liveSnapshot] = await Promise.all([
        fetchYahooChart('GC=F', cfg.interval, cfg.range),
        getDailyDmaContext('GC=F', dailyRange),
        fetchLiveGoldSnapshot(false).catch(() => null),
      ]);

      if (!goldChart || goldChart.bars.length === 0) {
        return res.status(404).json({ error: 'No historical XAU/USD bars found' });
      }

      const rawLastClose = goldChart.bars[goldChart.bars.length - 1].close || 1;
      const scale = liveSnapshot && liveSnapshot.xauUsd > 0 ? liveSnapshot.xauUsd / rawLastClose : 1;

      const bars: OhlcBar[] = goldChart.bars.map((b) => {
        const dma = resolveDmaForBar(b, dmaCtx);
        return {
          date: b.date,
          timestamp: b.timestamp,
          open: roundTo(b.open * scale, 2),
          high: roundTo(b.high * scale, 2),
          low: roundTo(b.low * scale, 2),
          close: roundTo(b.close * scale, 2),
          volume: b.volume,
          dma45: dma.dma45 !== null ? roundTo(dma.dma45 * scale, 2) : null,
          dma200: dma.dma200 !== null ? roundTo(dma.dma200 * scale, 2) : null,
        };
      });

      if (bars.length > 0 && liveSnapshot && liveSnapshot.xauUsd > 0) {
        const last = bars[bars.length - 1];
        last.close = roundTo(liveSnapshot.xauUsd, 2);
        last.high = roundTo(Math.max(last.high, last.close), 2);
        last.low = roundTo(Math.min(last.low, last.close), 2);
      }

      goldHistoryCache.set(tf, { expiresAt: Date.now() + (isIntradayTf ? 10_000 : 20_000), bars });
      return res.json({ source: 'xe-anchored', symbol: 'XAU/USD', timeframe: tf, bars });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch gold chart history';
      return res.status(502).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });

    const seoHtmlRoutes = [
      '/',
      '/market',
      '/gold',
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Qatar Money Markets QSE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
