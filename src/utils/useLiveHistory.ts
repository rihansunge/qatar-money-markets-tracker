import { useEffect, useMemo, useState } from 'react';
import type { OhlcBar, Timeframe } from '../types/market';
import { generateHistoricalSeries } from '../data/qseData';
import { applyLiveTickToBars } from './chartSeries';

export interface LiveHistoryOptions {
  liveFeedEnabled?: boolean;
  liveDayVolume?: number;
  precision?: number;
}

export function useLiveHistory(
  ticker: string,
  timeframe: Timeframe,
  fallbackPrice: number,
  benchmarkValue: number,
  options: LiveHistoryOptions = {},
): { bars: OhlcBar[]; isLiveHistory: boolean } {
  const { liveFeedEnabled = true, liveDayVolume, precision = 3 } = options;
  const [liveBars, setLiveBars] = useState<{
    key: string;
    bars: OhlcBar[];
  } | null>(null);

  const requestKey = `${ticker}:${timeframe}`;

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const loadHistory = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await fetch(
          `/api/qse/history/${encodeURIComponent(ticker)}?tf=${encodeURIComponent(timeframe)}`,
          { signal: controller.signal },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { bars?: OhlcBar[] };
        if (!cancelled && data?.bars && data.bars.length >= 2) {
          setLiveBars({ key: requestKey, bars: data.bars });
        }
      } catch {
        // Retain previous bars / fallback series on abort or transient network glitch
      }
    };

    void loadHistory();

    if (!liveFeedEnabled) {
      return () => {
        cancelled = true;
        activeController?.abort();
      };
    }

    const isIntraday =
      timeframe === '5m' ||
      timeframe === '15m' ||
      timeframe === '1H' ||
      timeframe === '1D' ||
      timeframe === '1W';
    const intervalId = window.setInterval(() => {
      void loadHistory();
    }, isIntraday ? 15_000 : 45_000);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(intervalId);
    };
  }, [ticker, timeframe, requestKey, liveFeedEnabled]);

  const syncedLiveBars = useMemo(() => {
    if (!liveBars || liveBars.key !== requestKey || liveBars.bars.length === 0) return null;
    if (!Number.isFinite(fallbackPrice) || fallbackPrice <= 0) return liveBars.bars;
    return applyLiveTickToBars(liveBars.bars, {
      timeframe,
      livePrice: fallbackPrice,
      liveDayVolume,
      benchmarkValue,
      precision,
    });
  }, [liveBars, requestKey, timeframe, fallbackPrice, liveDayVolume, benchmarkValue, precision]);

  if (syncedLiveBars) {
    return { bars: syncedLiveBars, isLiveHistory: true };
  }

  return {
    bars: generateHistoricalSeries(ticker, fallbackPrice, timeframe, benchmarkValue),
    isLiveHistory: false,
  };
}
