import { useEffect, useMemo, useState } from 'react';
import type { OhlcBar, Timeframe } from '../types/market';
import { generateHistoricalSeries } from '../data/qseData';

export function useLiveHistory(
  ticker: string,
  timeframe: Timeframe,
  fallbackPrice: number,
  benchmarkValue: number,
): { bars: OhlcBar[]; isLiveHistory: boolean } {
  const [liveBars, setLiveBars] = useState<{
    key: string;
    bars: OhlcBar[];
  } | null>(null);

  const requestKey = `${ticker}:${timeframe}`;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/qse/history/${encodeURIComponent(ticker)}?tf=${encodeURIComponent(timeframe)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { bars?: OhlcBar[] };
      })
      .then((data) => {
        if (data?.bars && data.bars.length >= 2) {
          setLiveBars({ key: requestKey, bars: data.bars });
        }
      })
      .catch(() => {
        // Fallback to deterministic local series when offline/abort
      });

    return () => controller.abort();
  }, [ticker, timeframe, requestKey]);

  const syncedLiveBars = useMemo(() => {
    if (!liveBars || liveBars.key !== requestKey || liveBars.bars.length === 0) return null;
    if (!Number.isFinite(fallbackPrice) || fallbackPrice <= 0) return liveBars.bars;
    const copy = liveBars.bars.slice();
    const last = copy[copy.length - 1];
    copy[copy.length - 1] = {
      ...last,
      close: fallbackPrice,
      high: Math.max(last.high, fallbackPrice),
      low: Math.min(last.low, fallbackPrice),
      benchmarkClose:
        Number.isFinite(benchmarkValue) && benchmarkValue > 0
          ? benchmarkValue
          : last.benchmarkClose,
    };
    return copy;
  }, [liveBars, requestKey, fallbackPrice, benchmarkValue]);

  if (syncedLiveBars) {
    return { bars: syncedLiveBars, isLiveHistory: true };
  }

  return {
    bars: generateHistoricalSeries(ticker, fallbackPrice, timeframe, benchmarkValue),
    isLiveHistory: false,
  };
}

