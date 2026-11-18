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
