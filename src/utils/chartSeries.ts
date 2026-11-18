import type { UTCTimestamp } from 'lightweight-charts';
import type { OhlcBar, Timeframe } from '../types/market';

export interface NormalizedTvBar {
  time: UTCTimestamp;
  bar: OhlcBar;
  index: number;
}

function parseBarEpochSeconds(bar: OhlcBar, index: number, total: number, timeframe: Timeframe): number {
  if (typeof bar.timestamp === 'number' && Number.isFinite(bar.timestamp) && bar.timestamp > 0) {
    return Math.floor(bar.timestamp);
  }

  // Match 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD'
  const fullIsoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(bar.date.trim());
  if (fullIsoMatch) {
    const year = Number(fullIsoMatch[1]);
    const month = Number(fullIsoMatch[2]) - 1;
    const day = Number(fullIsoMatch[3]);
    const hour = fullIsoMatch[4] ? Number(fullIsoMatch[4]) : 13;
    const min = fullIsoMatch[5] ? Number(fullIsoMatch[5]) : 15;
    return Math.floor(Date.UTC(year, month, day, hour, min, 0) / 1000);
  }

  // Match 'MM-DD HH:MM'
  const mdHmMatch = /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(bar.date.trim());
  if (mdHmMatch) {
    const now = new Date();
    const month = Number(mdHmMatch[1]) - 1;
    const day = Number(mdHmMatch[2]);
    const hour = Number(mdHmMatch[3]);
    const min = Number(mdHmMatch[4]);
    return Math.floor(Date.UTC(now.getUTCFullYear(), month, day, hour, min, 0) / 1000);
  }

  // Match 'HH:MM' for intraday fallback bars
  const hmMatch = /^(\d{1,2}):(\d{2})$/.exec(bar.date.trim());
  if (hmMatch) {
    const now = new Date();
    const dohaAnchor = new Date(now.getTime() + 3 * 3600 * 1000);
    const hour = Number(hmMatch[1]);
    const min = Number(hmMatch[2]);
    const stepDaysBack = timeframe === '1W' ? Math.floor(((total - 1 - index) * 5) / Math.max(1, total)) : 0;
    const d = Date.UTC(
      dohaAnchor.getUTCFullYear(),
      dohaAnchor.getUTCMonth(),
      dohaAnchor.getUTCDate() - stepDaysBack,
      hour,
      min,
      0,
    );
    return Math.floor(d / 1000);
  }

  const base = Math.floor(Date.now() / 1000) - (total - index) * 86400;
  return base;
}

/**
 * Converts OhlcBar[] into strictly ascending UTCTimestamp points required by TradingView Lightweight Charts.
 */
export function normalizeBarsForTradingView(
  bars: OhlcBar[],
  timeframe: Timeframe,
): NormalizedTvBar[] {
  const result: NormalizedTvBar[] = [];
  let prevTime = -Infinity;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (
      !Number.isFinite(bar.open) ||
      !Number.isFinite(bar.high) ||
      !Number.isFinite(bar.low) ||
      !Number.isFinite(bar.close)
    ) {
      continue;
    }

    let epoch = parseBarEpochSeconds(bar, i, bars.length, timeframe);
    if (epoch <= prevTime) {
      const step =
        timeframe === '5m' || timeframe === '1D'
          ? 300
          : timeframe === '15m'
            ? 900
            : timeframe === '1H' || timeframe === '1W'
              ? 3600
              : 86400;
      epoch = prevTime + step;
    }
    prevTime = epoch;

    result.push({
      time: epoch as UTCTimestamp,
      bar,
      index: result.length,
    });
  }

  return result;
}

export function getTimeframeBucketSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case '5m':
    case '1D':
      return 300;
    case '15m':
      return 900;
    case '1H':
    case '1W':
      return 3600;
    case '3Y':
    case '5Y':
      return 604800;
    default:
      return 86400;
  }
}

function roundBarPrice(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function applyLiveTickToBars(
  bars: OhlcBar[],
  params: {
    timeframe: Timeframe;
    livePrice: number;
    liveDayVolume?: number;
    benchmarkValue?: number;
    nowMs?: number;
    precision?: number;
  },
): OhlcBar[] {
  const { timeframe, livePrice, liveDayVolume, benchmarkValue, nowMs = Date.now(), precision = 3 } =
    params;

  if (bars.length === 0 || !Number.isFinite(livePrice) || livePrice <= 0) {
    return bars;
  }

  const price = roundBarPrice(livePrice, precision);
  const last = bars[bars.length - 1];
  const validBenchmark =
    typeof benchmarkValue === 'number' && Number.isFinite(benchmarkValue) && benchmarkValue > 0
      ? benchmarkValue
      : last.benchmarkClose;

  const isIntraday =
    timeframe === '5m' ||
    timeframe === '15m' ||
    timeframe === '1H' ||
    timeframe === '1D' ||
    timeframe === '1W';
  const bucketSec = getTimeframeBucketSeconds(timeframe);
  const nowDohaSec = Math.floor(nowMs / 1000) + 3 * 3600;
  const currentBucket = Math.floor(nowDohaSec / bucketSec) * bucketSec;
  const lastBucket =
    typeof last.timestamp === 'number' && Number.isFinite(last.timestamp) && last.timestamp > 0
      ? Math.floor(last.timestamp / bucketSec) * bucketSec
      : 0;

  // Roll into a new intraday candle only when actively trading across a fresh bar boundary
  if (
    isIntraday &&
    lastBucket > 0 &&
    currentBucket > lastBucket &&
    currentBucket - lastBucket <= bucketSec * 4
  ) {
    const dohaDate = new Date(currentBucket * 1000);
    const hhmm = `${String(dohaDate.getUTCHours()).padStart(2, '0')}:${String(
      dohaDate.getUTCMinutes(),
    ).padStart(2, '0')}`;
    const label =
      timeframe === '5m' || timeframe === '1D'
        ? hhmm
        : `${dohaDate.toISOString().slice(5, 10)} ${hhmm}`;
    const open = roundBarPrice(last.close, precision);
    return [
      ...bars,
      {
        date: label,
        timestamp: currentBucket,
        open,
        high: roundBarPrice(Math.max(open, price), precision),
        low: roundBarPrice(Math.min(open, price), precision),
        close: price,
        volume: Math.max(1, Math.round((last.volume || 1000) * 0.15)),
        benchmarkClose: validBenchmark,
        dma45: last.dma45 ?? null,
        dma200: last.dma200 ?? null,
      },
    ];
  }

  const isDailyBar = timeframe === '1M' || timeframe === '3M' || timeframe === '1Y';
  const nextVolume =
    isDailyBar &&
    typeof liveDayVolume === 'number' &&
    Number.isFinite(liveDayVolume) &&
    liveDayVolume > last.volume
      ? Math.round(liveDayVolume)
      : last.volume;

  const copy = bars.slice();
  copy[copy.length - 1] = {
    ...last,
    high: roundBarPrice(Math.max(last.high, price), precision),
    low: roundBarPrice(Math.min(last.low, price), precision),
    close: price,
    volume: nextVolume,
    benchmarkClose: validBenchmark,
  };
  return copy;
}

