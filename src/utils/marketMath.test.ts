import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBollingerBands,
  calculateEMASeries,
  calculateFibonacciLevels,
  calculateMACD,
  calculatePortfolioAnalytics,
  calculateRSI,
  calculateShariahZakatAndPurification,
  calculateSMA,
  computeMarketSentimentIndex,
  computeStockSentiment,
  diffLiveTicks,
  evaluatePriceAlerts,
  formatQarPrice,
  getDayChange,
  getQseMarketStatus,
  mergeLiveQseSnapshot,
  parsePortfolioCsv,
  simulateMarketTick,
} from './marketMath';
import { normalizeBarsForTradingView } from './chartSeries';
import {
  generateHistoricalSeries,
  INITIAL_INVESTOR_FLOWS,
  INITIAL_PORTFOLIO_HOLDINGS,
  INITIAL_QSE_INDICES,
  INITIAL_QSE_SECURITIES,
} from '../data/qseData';
import type { PriceAlert } from '../types/market';

test('getDayChange computes exact price delta and percentage', () => {
  const res = getDayChange(20.84, 20.48);
  assert.equal(res.change, 0.36);
  assert.equal(res.changePct, 1.76);
});

test('calculatePortfolioAnalytics computes total value, P&L, Shariah split, and dividend income', () => {
  const analytics = calculatePortfolioAnalytics(INITIAL_PORTFOLIO_HOLDINGS, INITIAL_QSE_SECURITIES);
  assert.ok(analytics.totalValueQar > 100000);
  assert.ok(analytics.totalCostQar > 90000);
  assert.equal(
    Math.round(analytics.shariahPct + analytics.conventionalPct),
    100,
    'Shariah + Conventional percentages should sum to 100%',
  );
  assert.ok(analytics.shariahPct > 70, 'Starter portfolio should be majority Shariah compliant');
  assert.ok(analytics.projectedAnnualDividendQar > 4000);
  assert.equal(analytics.holdings.length, INITIAL_PORTFOLIO_HOLDINGS.length);
  assert.ok(analytics.bestPerformer !== null);
  assert.ok(analytics.worstPerformer !== null);
});

test('calculateSMA and calculateRSI return accurate technical values', () => {
  const series = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const sma5 = calculateSMA(series, 5);
  assert.equal(sma5[0], null);
  assert.equal(sma5[3], null);
  assert.equal(sma5[4], 12);
  assert.equal(sma5[series.length - 1], 23);

  const rsi = calculateRSI(series, 14);
  assert.equal(rsi, 100, 'Monotonically rising series should yield RSI 100');

  const macd = calculateMACD(
    Array.from({ length: 40 }, (_, i) => 10 + i * 0.25 + Math.sin(i) * 0.1),
  );
  assert.ok(macd.macdLine > 0);
});

test('computeStockSentiment and computeMarketSentimentIndex return valid 0-100 scores', () => {
  const qibk = INITIAL_QSE_SECURITIES.find((s) => s.ticker === 'QIBK')!;
  const bars = generateHistoricalSeries('QIBK', qibk.price, '3M');
  const stockSent = computeStockSentiment(qibk, bars, { bullish: 140, neutral: 20, bearish: 10 });
  assert.ok(stockSent.compositeScore >= 0 && stockSent.compositeScore <= 100);
  assert.ok(stockSent.rsi14 >= 0 && stockSent.rsi14 <= 100);

  const marketSent = computeMarketSentimentIndex(INITIAL_QSE_SECURITIES, INITIAL_INVESTOR_FLOWS);
  assert.ok(marketSent.compositeScore >= 0 && marketSent.compositeScore <= 100);
  assert.equal(
    marketSent.advancers + marketSent.decliners + marketSent.unchanged,
    INITIAL_QSE_SECURITIES.length,
  );
});

test('evaluatePriceAlerts triggers alerts when price crosses target thresholds', () => {
  const alerts: PriceAlert[] = [
    {
      id: 'a1',
      ticker: 'QIBK',
      condition: 'above',
      targetValue: 20.5, // QIBK is 20.84 -> should trigger
      note: 'Test above trigger',
      active: true,
      pushEnabled: true,
      createdAt: '2026-11-15T00:00:00Z',
    },
    {
      id: 'a2',
      ticker: 'QATR',
      condition: 'below',
      targetValue: 2.1, // QATR is 2.54 -> should NOT trigger
      note: 'Test below hold',
      active: true,
      pushEnabled: true,
      createdAt: '2026-11-15T00:00:00Z',
    },
  ];

  const { updatedAlerts, newlyTriggered } = evaluatePriceAlerts(
    alerts,
    INITIAL_QSE_SECURITIES,
    '2026-11-15T10:00:00Z',
  );

  assert.equal(newlyTriggered.length, 1);
  assert.equal(newlyTriggered[0].ticker, 'QIBK');
  assert.equal(updatedAlerts[0].active, false);
  assert.equal(updatedAlerts[1].active, true);
});

test('simulateMarketTick keeps prices bounded and updates index levels', () => {
  const { securities, indices } = simulateMarketTick(
    INITIAL_QSE_SECURITIES,
    INITIAL_QSE_INDICES,
    1,
  );
  assert.equal(securities.length, INITIAL_QSE_SECURITIES.length);
  assert.equal(indices.length, INITIAL_QSE_INDICES.length);
  for (const sec of securities) {
    assert.ok(sec.price > 0);
    assert.ok(sec.dayHigh >= sec.price);
    assert.ok(sec.dayLow <= sec.price);
  }
});

test('formatQarPrice preserves 3 decimals for sub-dirham quotes and 2 decimals otherwise', () => {
  assert.equal(formatQarPrice(4.237), '4.237');
  assert.equal(formatQarPrice(2.089), '2.089');
  assert.equal(formatQarPrice(21.8), '21.80');
  assert.equal(formatQarPrice(18.3), '18.30');
});

test('mergeLiveQseSnapshot updates index levels and stock prices from live payload', () => {
  const { indices, securities } = mergeLiveQseSnapshot(
    INITIAL_QSE_INDICES,
    INITIAL_QSE_SECURITIES,
    {
      source: 'live',
      fetchedAt: '2026-11-16T13:00:00Z',
      indices: [
        {
          symbol: 'QSI',
          value: 10107.0,
          previousClose: 9847.91,
          dayHigh: 10107.0,
          dayLow: 9847.24,
        },
      ],
      quotes: {
        QIBK: {
          ticker: 'QIBK',
          price: 21.8,
          previousClose: 21.01,
          open: 21.0,
          dayHigh: 21.8,
          dayLow: 21.0,
          volume: 2249160,
          turnoverQar: 49031688,
        },
      },
    },
  );
  assert.equal(indices[0].value, 10107.0);
  const qibk = securities.find((s) => s.ticker === 'QIBK')!;
  assert.equal(qibk.price, 21.8);
  assert.equal(qibk.volume, 2249160);
});

test('calculateShariahZakatAndPurification computes 2.5% Zakat and dividend purification', () => {
  const summaryLong = calculateShariahZakatAndPurification(
    INITIAL_PORTFOLIO_HOLDINGS,
    INITIAL_QSE_SECURITIES,
    'long_term',
    10000,
  );
  assert.ok(summaryLong.shariahCompliantValueQar > 0);
  assert.ok(summaryLong.estimatedZakatQar > 0);
  assert.ok(summaryLong.totalPurificationQar > 0);

  const summaryTrade = calculateShariahZakatAndPurification(
    INITIAL_PORTFOLIO_HOLDINGS,
    INITIAL_QSE_SECURITIES,
    'trading',
    0,
  );
  assert.ok(summaryTrade.estimatedZakatQar > summaryLong.estimatedZakatQar);
});

test('parsePortfolioCsv parses valid QSE holdings and flags invalid lines', () => {
  const valid = new Set(INITIAL_QSE_SECURITIES.map((s) => s.ticker));
  const csv = [
    'Ticker,Shares,AvgCost,Date',
    'QIBK.QA,1500,20.50,2026-09-01',
    'QATR,5000,2.089',
    'BADTICKER,100,5.0',
  ].join('\n');

  const { parsed, skippedLines } = parsePortfolioCsv(csv, valid);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].ticker, 'QIBK');
  assert.equal(parsed[0].shares, 1500);
  assert.equal(parsed[1].ticker, 'QATR');
  assert.equal(parsed[1].avgCostQar, 2.089);
  assert.equal(skippedLines.length, 1);
});

test('getQseMarketStatus computes Open and Closed accurately in Asia/Qatar (UTC+3)', () => {
  // Monday 2026-11-16 at 10:29 AM Doha AST (07:29 UTC) -> Open
  const duringSession = getQseMarketStatus(new Date('2026-11-16T07:29:00Z'));
  assert.equal(duringSession.isOpen, true);
  assert.equal(duringSession.statusLabel, 'Open');
  assert.equal(duringSession.openingTime, '09:30 AM');
  assert.equal(duringSession.closingTime, '01:15 PM');

  // Monday 2026-11-16 at 09:10 AM Doha AST (06:10 UTC) -> Closed (pre-open)
  const beforeOpen = getQseMarketStatus(new Date('2026-11-16T06:10:00Z'));
  assert.equal(beforeOpen.isOpen, false);
  assert.equal(beforeOpen.statusLabel, 'Closed');

  // Monday 2026-11-16 at 02:00 PM Doha AST (11:00 UTC) -> Closed (after close)
  const afterClose = getQseMarketStatus(new Date('2026-11-16T11:00:00Z'));
  assert.equal(afterClose.isOpen, false);
  assert.equal(afterClose.statusLabel, 'Closed');

  // Friday 2026-11-20 at 11:00 AM Doha AST (08:00 UTC) -> Closed (weekend)
  const friday = getQseMarketStatus(new Date('2026-11-20T08:00:00Z'));
  assert.equal(friday.isOpen, false);
  assert.equal(friday.statusLabel, 'Closed');
});

test('diffLiveTicks detects up and down index and security price movements', () => {
  const nextIndices = INITIAL_QSE_INDICES.map((i, idx) =>
    idx === 0 ? { ...i, value: i.value + 12.5 } : i,
  );
  const nextSecurities = INITIAL_QSE_SECURITIES.map((s) =>
    s.ticker === 'QIBK' ? { ...s, price: s.price - 0.1 } : s,
  );
  const flashes = diffLiveTicks(
    INITIAL_QSE_INDICES,
    INITIAL_QSE_SECURITIES,
    nextIndices,
    nextSecurities,
  );
  assert.equal(flashes.QSI, 'up');
  assert.equal(flashes.QIBK, 'down');
  assert.equal(flashes.QNBK, undefined);
});

test('calculateEMASeries, calculateBollingerBands, and calculateFibonacciLevels compute accurate studies', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 20 + i * 0.25);
  const ema20 = calculateEMASeries(closes, 20);
  assert.equal(ema20[18], null);
  assert.ok(typeof ema20[19] === 'number' && ema20[29]! > ema20[19]!);

  const bb = calculateBollingerBands(closes, 20, 2);
  assert.equal(bb[18], null);
  assert.ok(bb[29]!.upper > bb[29]!.middle && bb[29]!.middle > bb[29]!.lower);

  const fib = calculateFibonacciLevels(24.0, 20.0);
  assert.equal(fib.length, 7);
  assert.equal(fib[0].price, 24);
  assert.equal(fib[3].price, 22); // 50.0%
  assert.equal(fib[6].price, 20);
});

test('normalizeBarsForTradingView produces strictly ascending timestamps for 5m, 15m, 1H, and 1W', () => {
  for (const tf of ['5m', '15m', '1H', '1W'] as const) {
    const bars = generateHistoricalSeries('QIBK', 21.7, tf, 10000);
    const tvBars = normalizeBarsForTradingView(bars, tf);
    assert.equal(tvBars.length, bars.length);
    for (let i = 1; i < tvBars.length; i++) {
      assert.ok(Number(tvBars[i].time) > Number(tvBars[i - 1].time));
    }
  }
});

test('generateHistoricalSeries populates 45 DMA and 200 DMA on every bar across short and long timeframes', () => {
  for (const tf of ['15m', '1M', '3M', '1Y'] as const) {
    const bars = generateHistoricalSeries('QIBK', 20.84, tf, 10107);
    assert.ok(bars.length > 0);
    for (const bar of bars) {
      assert.equal(typeof bar.dma45, 'number');
      assert.equal(typeof bar.dma200, 'number');
      assert.ok((bar.dma45 ?? 0) > 0);
      assert.ok((bar.dma200 ?? 0) > 0);
    }
  }
});
