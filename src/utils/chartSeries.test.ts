import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLiveTickToBars, normalizeBarsForTradingView } from './chartSeries';
import type { OhlcBar } from '../types/market';

const SAMPLE_BARS: OhlcBar[] = [
  {
    date: '11:00',
    timestamp: 1794999600, // Doha AST aligned (300s multiple)
    open: 3770.0,
    high: 3772.0,
    low: 3769.5,
    close: 3771.0,
    volume: 1200,
    benchmarkClose: 10040,
  },
  {
    date: '11:05',
    timestamp: 1794999900, // +300s
    open: 3771.0,
    high: 3773.0,
    low: 3770.5,
    close: 3771.5,
    volume: 1500,
    benchmarkClose: 10042,
  },
];

test('applyLiveTickToBars updates active candle high, low, and close within current bucket', () => {
  // Exact same bucket as 1794999900 (remember +3*3600 Doha offset in applyLiveTickToBars)
  const utcMs = (1794999900 - 3 * 3600 + 60) * 1000;
  const updated = applyLiveTickToBars(SAMPLE_BARS, {
    timeframe: '5m',
    livePrice: 3775.25,
    benchmarkValue: 10055,
    nowMs: utcMs,
    precision: 2,
  });

  assert.equal(updated.length, 2);
  assert.equal(updated[1].close, 3775.25);
  assert.equal(updated[1].high, 3775.25);
  assert.equal(updated[1].low, 3770.5);
  assert.equal(updated[1].benchmarkClose, 10055);
  // Original array must remain immutable
  assert.equal(SAMPLE_BARS[1].close, 3771.5);
});

test('applyLiveTickToBars rolls into a new intraday candle when bucket boundary crosses', () => {
  // Next 5m bucket: 1794999900 + 300 = 1795000200
  const utcMs = (1794999900 + 310 - 3 * 3600) * 1000;
  const rolled = applyLiveTickToBars(SAMPLE_BARS, {
    timeframe: '5m',
    livePrice: 3768.4,
    nowMs: utcMs,
    precision: 2,
  });

  assert.equal(rolled.length, 3);
  assert.equal(rolled[2].timestamp, 1795000200);
  assert.equal(rolled[2].open, 3771.5);
  assert.equal(rolled[2].high, 3771.5);
  assert.equal(rolled[2].low, 3768.4);
  assert.equal(rolled[2].close, 3768.4);

  const tvNormalized = normalizeBarsForTradingView(rolled, '5m');
  assert.equal(tvNormalized.length, 3);
  assert.ok(Number(tvNormalized[2].time) > Number(tvNormalized[1].time));
});

test('applyLiveTickToBars updates daily volume monotonically on daily timeframes', () => {
  const dailyBars: OhlcBar[] = [
    {
      date: '2026-11-18',
      timestamp: 1795000000,
      open: 21.5,
      high: 21.8,
      low: 21.4,
      close: 21.7,
      volume: 100000,
    },
  ];
  const next = applyLiveTickToBars(dailyBars, {
    timeframe: '3M',
    livePrice: 21.85,
    liveDayVolume: 250000,
    precision: 3,
  });

  assert.equal(next.length, 1);
  assert.equal(next[0].close, 21.85);
  assert.equal(next[0].high, 21.85);
  assert.equal(next[0].volume, 250000);
});
