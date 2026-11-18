import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Coins,
  ExternalLink,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { GoldKarat, GoldRatesSnapshot, OhlcBar, Timeframe } from '../types/market';
import {
  DEFAULT_DOHA_KARAT_SPREADS_PCT,
  TROY_OUNCE_IN_GRAMS,
  buildQatarGoldComparisonRows,
  calculateSpotGoldQarPerGram,
  formatQarRate,
} from '../utils/goldMath';
import { applyLiveTickToBars } from '../utils/chartSeries';
import { HistoricalChart } from './HistoricalChart';
import { SeoFaqSection } from './SeoFaqSection';

interface GoldRatesViewProps {
  liveFeedEnabled: boolean;
}

const WEIGHT_PRESETS: Array<{ label: string; grams: number }> = [
  { label: '1g', grams: 1 },
  { label: '8g (Sovereign)', grams: 8 },
  { label: '10g', grams: 10 },
  { label: '1 Tola (11.66g)', grams: 11.6638 },
  { label: '100g', grams: 100 },
];

export const GoldRatesView: React.FC<GoldRatesViewProps> = ({ liveFeedEnabled }) => {
  const [snapshot, setSnapshot] = useState<GoldRatesSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  const [spreadMode, setSpreadMode] = useState<
    'malabar-karat' | 'gcc-base' | 'flat-retail' | 'spot' | 'custom'
  >('malabar-karat');
  const [customSpreadPct, setCustomSpreadPct] = useState<number>(4.87);
  const [roundStepQar, setRoundStepQar] = useState<number>(0.5);
  const [selectedGrams, setSelectedGrams] = useState<number>(10);
  const [selectedKarat, setSelectedKarat] = useState<GoldKarat>('22K');

  const fetchLiveGold = useCallback(async (forceRefresh = false) => {
    try {
      const url = forceRefresh ? '/api/gold/live?refresh=1' : '/api/gold/live';
      const res = await fetch(url);
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GoldRatesSnapshot;
      setSnapshot(data);
      setSnapshotError(null);
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : 'Unable to load live gold rates');
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  const fetchGoldHistory = useCallback(async (tf: Timeframe) => {
    setLoadingChart(true);
    try {
      const res = await fetch(`/api/gold/history?tf=${encodeURIComponent(tf.toUpperCase())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { bars?: OhlcBar[] };
      if (Array.isArray(json.bars) && json.bars.length > 0) {
        setBars(json.bars);
      }
    } catch {
      // Retain existing bars if transient upstream glitch
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveGold(false);
  }, [fetchLiveGold]);

  useEffect(() => {
    fetchGoldHistory(timeframe);
  }, [timeframe, fetchGoldHistory]);

  // Connect real-time Gold SSE stream (/api/gold/stream) + periodic intraday bar refresh
  useEffect(() => {
    if (!liveFeedEnabled) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let fallbackPollId: number | null = null;

    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/gold/stream');
      es.addEventListener('tick', (evt) => {
        if (cancelled) return;
        try {
          const data = JSON.parse((evt as MessageEvent<string>).data) as GoldRatesSnapshot;
          if (data && Number.isFinite(data.xauUsd) && data.xauUsd > 0) {
            setSnapshot(data);
            setSnapshotError(null);
            setLoadingSnapshot(false);
          }
        } catch {
          // Ignore malformed SSE frame
        }
      });
      es.addEventListener('heartbeat', (evt) => {
        if (cancelled) return;
        try {
          const info = JSON.parse((evt as MessageEvent<string>).data) as { fetchedAt?: string };
          if (info.fetchedAt) {
            setSnapshot((prev) => (prev ? { ...prev, fetchedAt: info.fetchedAt! } : prev));
          }
        } catch {
          // Ignore malformed heartbeat
        }
      });
    } else {
      fallbackPollId = window.setInterval(() => {
        fetchLiveGold(false);
      }, 4_000);
    }

    const isIntraday =
      timeframe === '5m' ||
      timeframe === '15m' ||
      timeframe === '1H' ||
      timeframe === '1D' ||
      timeframe === '1W';
    const historyRefreshId = window.setInterval(() => {
      fetchGoldHistory(timeframe);
    }, isIntraday ? 15_000 : 45_000);

    return () => {
      cancelled = true;
      if (es) es.close();
      if (fallbackPollId) window.clearInterval(fallbackPollId);
      window.clearInterval(historyRefreshId);
    };
  }, [liveFeedEnabled, timeframe, fetchLiveGold, fetchGoldHistory]);

  // Keep XAU/USD TradingView chart bars anchored to every live SSE rate tick
  const liveBars = useMemo(() => {
    if (!snapshot || !Number.isFinite(snapshot.xauUsd) || snapshot.xauUsd <= 0) {
      return bars;
    }
    return applyLiveTickToBars(bars, {
      timeframe,
      livePrice: snapshot.xauUsd,
      precision: 2,
    });
  }, [bars, timeframe, snapshot]);

  const activeKaratSpreads = useMemo(() => {
    if (spreadMode === 'malabar-karat') {
      return snapshot?.calibratedKaratSpreadsPct ?? DEFAULT_DOHA_KARAT_SPREADS_PCT;
    }
    if (spreadMode === 'gcc-base') {
      return { '24K': 2.74, '22K': 3.79, '18K': 4.26 };
    }
    return undefined;
  }, [spreadMode, snapshot]);

  const activeSpreadPct = useMemo(() => {
    if (spreadMode === 'malabar-karat') return snapshot?.calibratedSpreadPct ?? 4.87;
    if (spreadMode === 'gcc-base') return 3.6;
    if (spreadMode === 'flat-retail') return 4.5;
    if (spreadMode === 'spot') return 0;
    return customSpreadPct;
  }, [spreadMode, customSpreadPct, snapshot]);

  const spotBreakdown = useMemo(() => {
    if (!snapshot) return null;
    return calculateSpotGoldQarPerGram(snapshot.xauUsd, snapshot.usdQar);
  }, [snapshot]);

  const comparisonRows = useMemo(() => {
    if (!snapshot) return [];
    return buildQatarGoldComparisonRows({
      xauUsd: snapshot.xauUsd,
      usdQar: snapshot.usdQar,
      malabarRates: snapshot.malabarRatesQarPerGram,
      retailSpreadPct: activeSpreadPct,
      karatSpreadsPct: activeKaratSpreads,
      boardStepQar: roundStepQar,
    });
  }, [snapshot, activeSpreadPct, activeKaratSpreads, roundStepQar]);

  const dayChangeUsd = snapshot ? snapshot.xauUsd - snapshot.previousXauUsd : 0;
  const dayChangePct =
    snapshot && snapshot.previousXauUsd > 0 ? (dayChangeUsd / snapshot.previousXauUsd) * 100 : 0;
  const isUp = dayChangeUsd >= 0;

  const malabar22 = snapshot?.malabarRatesQarPerGram?.['22K'] ?? null;
  const estimated22 = comparisonRows.find((r) => r.karat === '22K')?.xeEstimatedMalabarQarPerGram ?? null;
  const selectedRow = comparisonRows.find((r) => r.karat === selectedKarat) ?? comparisonRows[0];

  const safeGrams = Number.isFinite(selectedGrams) && selectedGrams > 0 ? selectedGrams : 0;
  const calcMalabarTotalQar =
    selectedRow?.malabarCurrentQarPerGram !== null && selectedRow?.malabarCurrentQarPerGram !== undefined
      ? selectedRow.malabarCurrentQarPerGram * safeGrams
      : null;
  const calcXeEstimateTotalQar = selectedRow
    ? selectedRow.xeEstimatedMalabarQarPerGram * safeGrams
    : null;
  const calcXeSpotTotalQar = selectedRow ? selectedRow.xeSpotQarPerGram * safeGrams : null;

  return (
    <div className="space-y-6" data-testid="gold-rates-view">
      {/* Section Header & Direct XE.com / Malabar Links */}
      <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5 lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Live Gold Rates · XAU/USD &amp; Qatar (18K / 22K / 24K)
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800">
              <Coins className="h-3.5 w-3.5" />
              XE.com + Malabar Official
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Live Gold Ounce to US Dollar chart linked to XE.com alongside Malabar Gold &amp; Diamonds
            Qatar counter rates (24K/22K/18K QAR/g) and XE.com retail conversion estimation.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap">
          <a
            href={snapshot?.xeChartUrl ?? 'https://www.xe.com/currencycharts/?from=XAU&to=USD'}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="xe-chart-link"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#8A1538]/30 bg-[#8A1538]/5 px-2.5 py-1.5 text-xs font-semibold text-[#8A1538] transition-colors hover:bg-[#8A1538]/10 dark:border-rose-700/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
          >
            <span>XE.com Chart</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={snapshot?.malabarOfficialUrl ?? 'https://www.malabargoldanddiamonds.com/ae/'}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="malabar-official-link"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span>Malabar Gold</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => {
              fetchLiveGold(true);
              fetchGoldHistory(timeframe);
            }}
            data-testid="refresh-gold-btn"
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[#8A1538] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#70102D] dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Live</span>
          </button>
        </div>
      </div>

      {snapshotError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          {snapshotError}
        </div>
      )}

      {/* Top Live KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Gold Ounce (XAU/USD)</span>
            <a
              href={snapshot?.xeConverterUrl ?? 'https://www.xe.com/currencyconverter/convert/?Amount=1&From=XAU&To=USD'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              XE.com Live ↗
            </a>
          </div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white"
            data-testid="gold-xau-usd-price"
          >
            {loadingSnapshot && !snapshot ? 'Loading...' : `$${formatQarRate(snapshot?.xauUsd)}`}
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-xs tabular-nums">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isUp ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {isUp ? '+' : ''}
              {dayChangeUsd.toFixed(2)} ({isUp ? '+' : ''}
              {dayChangePct.toFixed(2)}%)
            </span>
          </div>
          <p className="mt-1.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
            {snapshot?.xauUsdSource ?? 'Connecting to XE.com...'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>XE Ounce in QAR (XAU/QAR)</span>
            <a
              href={snapshot?.xeQarConverterUrl ?? 'https://www.xe.com/currencyconverter/convert/?Amount=1&From=XAU&To=QAR'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              XAU→QAR ↗
            </a>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {loadingSnapshot && !snapshot ? 'Loading...' : `${formatQarRate(snapshot?.xauQar)} QAR`}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300">
            1 USD = {snapshot ? snapshot.usdQar.toFixed(4) : '3.6400'} QAR
          </div>
          <p className="mt-1.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
            {snapshot?.usdQarSource ?? 'XE.com USD/QAR parity'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Malabar Qatar · 22K / Gram</span>
            <a
              href={snapshot?.malabarStoresUrl ?? 'https://www.malabargoldanddiamonds.com/uk/stores/qatar'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              Qatar Stores ↗
            </a>
          </div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#8A1538] dark:text-rose-300"
            data-testid="malabar-22k-rate"
          >
            {malabar22 !== null ? `${formatQarRate(malabar22)} QAR` : 'Unavailable'}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            24K: <strong className="font-mono">{formatQarRate(snapshot?.malabarRatesQarPerGram?.['24K'])}</strong> · 18K:{' '}
            <strong className="font-mono">{formatQarRate(snapshot?.malabarRatesQarPerGram?.['18K'])}</strong>
          </div>
          <p className="mt-1.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
            {snapshot?.malabarUpdatedText ?? 'Live Malabar Gold Qatar board'}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>XE Est. Malabar · 22K / Gram</span>
            <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              +{((activeKaratSpreads?.['22K'] ?? activeSpreadPct)).toFixed(2)}% spread
            </span>
          </div>
          <div
            className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white"
            data-testid="xe-est-22k-rate"
          >
            {estimated22 !== null ? `${formatQarRate(estimated22)} QAR` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Raw XE 22K Melt: <strong className="font-mono">{formatQarRate(spotBreakdown?.['22K'])} QAR</strong>
          </div>
          <p className="mt-1.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
            XE XAU/USD × QAR ÷ {TROY_OUNCE_IN_GRAMS.toFixed(2)}g + karat retail spread
          </p>
        </div>
      </div>

      {/* Live Gold Ounce to US Dollar (XAU/USD) Chart */}
      <div>
        {loadingChart && bars.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Loading live XAU/USD Gold Ounce chart linked to XE.com...
          </div>
        ) : (
          <HistoricalChart
            title="Gold Ounce to US Dollar (XAU/USD)"
            subtitle="Live XAU/USD mid-market spot linked to XE.com · Candlesticks, 45 DMA, 200 DMA & Fibonacci"
            bars={liveBars}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            unitLabel="USD/oz"
            benchmarkLabel="QSE Benchmark"
            height={340}
            isLive={liveFeedEnabled}
            lastUpdatedAt={snapshot?.fetchedAt}
          />
        )}
      </div>

      {/* Qatar Gold Rates Comparison: Malabar Gold Current Rate vs XE.com Estimated Rate (18K, 22K, 24K) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Qatar Gold Rates per Gram (24K, 22K, 18K)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Malabar Gold &amp; Diamonds Qatar counter rates (24K / 22K / 18K) compared against
                XE.com spot conversion estimation.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-400 dark:text-slate-500">
              <div>{snapshot?.malabarSourceLabel ?? 'Malabar Gold & Diamonds Official'}</div>
              {snapshot?.malabarUsdPerGram && (
                <div className="font-mono">
                  Malabar Base USD/g: 24K ${snapshot.malabarUsdPerGram['24K'].toFixed(2)} · 22K $
                  {snapshot.malabarUsdPerGram['22K'].toFixed(2)} · 18K $
                  {snapshot.malabarUsdPerGram['18K'].toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* Per-Karat Summary Cards */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {comparisonRows.map((row) => (
              <div
                key={row.karat}
                data-testid={`karat-card-${row.karat}`}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {row.karat} Gold
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {(row.purityFactor * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{row.purityLabel}</p>

                <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300">
                      Malabar Rate
                    </span>
                    <span className="whitespace-nowrap font-mono text-[15px] font-bold tabular-nums text-[#8A1538] dark:text-rose-300">
                      {formatQarRate(row.malabarCurrentQarPerGram)} QAR
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-300">
                      XE.com Est.
                    </span>
                    <span className="whitespace-nowrap font-mono text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatQarRate(row.xeEstimatedMalabarQarPerGram)} QAR
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="whitespace-nowrap">Raw XE Spot</span>
                    <span className="whitespace-nowrap font-mono tabular-nums">
                      {formatQarRate(row.xeSpotQarPerGram)} QAR
                    </span>
                  </div>

                  {row.diffVsMalabarQar !== null && (
                    <div className="flex items-baseline justify-between gap-2 border-t border-slate-200/60 pt-1.5 text-[11px] dark:border-slate-800">
                      <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                        Variance
                      </span>
                      <span
                        className={`whitespace-nowrap font-mono font-semibold tabular-nums ${
                          Math.abs(row.diffVsMalabarQar) <= 1.0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {row.diffVsMalabarQar >= 0 ? '+' : ''}
                        {row.diffVsMalabarQar.toFixed(2)} QAR ({row.diffVsMalabarPct! >= 0 ? '+' : ''}
                        {row.diffVsMalabarPct!.toFixed(2)}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Matrix Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Purity</th>
                  <th className="px-3 py-2 text-right font-semibold">Malabar Qatar (QAR/g)</th>
                  <th className="px-3 py-2 text-right font-semibold">XE Est. Malabar (QAR/g)</th>
                  <th className="px-3 py-2 text-right font-semibold">Raw XE Spot (QAR/g)</th>
                  <th className="py-2 pl-3 text-right font-semibold">Malabar Markup vs XE Spot</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums dark:divide-slate-800">
                {comparisonRows.map((row) => (
                  <tr key={row.karat} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                      {row.karat}{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        ({(row.purityFactor * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#8A1538] dark:text-rose-300">
                      {formatQarRate(row.malabarCurrentQarPerGram)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">
                      {formatQarRate(row.xeEstimatedMalabarQarPerGram)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {formatQarRate(row.xeSpotQarPerGram)}
                    </td>
                    <td className="py-2.5 pl-3 text-right text-emerald-700 dark:text-emerald-400">
                      {row.impliedMarkupPct !== null
                        ? `${row.impliedMarkupPct >= 0 ? '+' : ''}${row.impliedMarkupPct.toFixed(2)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How Malabar Sets Price from XE Spot + Weight Calculator */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                XE → Malabar Pricing Model
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Malabar converts XE XAU/USD × 3.64 ÷ 31.1035g and applies tiered GCC bullion &amp;
              jewelry spreads (typically ~3.9% on 24K, ~5.1% on 22K, ~5.6% on 18K) snapped to
              0.50 QAR board steps.
            </p>

            <div className="mt-3 space-y-2">
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Retail Markup Model
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpreadMode('malabar-karat')}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    spreadMode === 'malabar-karat'
                      ? 'border-[#8A1538] bg-[#8A1538] text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Malabar Doha (+{(snapshot?.calibratedSpreadPct ?? 4.87).toFixed(2)}%)
                </button>
                <button
                  type="button"
                  onClick={() => setSpreadMode('gcc-base')}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    spreadMode === 'gcc-base'
                      ? 'border-[#8A1538] bg-[#8A1538] text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  GCC Base (+3.60%)
                </button>
                <button
                  type="button"
                  onClick={() => setSpreadMode('flat-retail')}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    spreadMode === 'flat-retail'
                      ? 'border-[#8A1538] bg-[#8A1538] text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Flat Retail (+4.50%)
                </button>
                <button
                  type="button"
                  onClick={() => setSpreadMode('spot')}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    spreadMode === 'spot'
                      ? 'border-[#8A1538] bg-[#8A1538] text-white'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Raw XE Spot (0.00%)
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <label htmlFor="custom-gold-spread" className="text-xs text-slate-600 dark:text-slate-300">
                  Custom Flat Spread (%)
                </label>
                <input
                  id="custom-gold-spread"
                  type="number"
                  step="0.1"
                  min="-2"
                  max="15"
                  value={activeSpreadPct}
                  onChange={(e) => {
                    setSpreadMode('custom');
                    setCustomSpreadPct(Number(e.target.value) || 0);
                  }}
                  className="w-24 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right font-mono text-xs text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-300">Board Step</span>
                <div className="inline-flex rounded border border-slate-200 p-0.5 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setRoundStepQar(0.5)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      roundStepQar === 0.5
                        ? 'bg-[#8A1538] text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    0.50 QAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoundStepQar(0.25)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      roundStepQar === 0.25
                        ? 'bg-[#8A1538] text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    0.25 QAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoundStepQar(0.01)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      roundStepQar === 0.01
                        ? 'bg-[#8A1538] text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Exact
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grams Purchase Calculator */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Qatar Bullion &amp; Jewelry Estimator
              </h2>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['24K', '22K', '18K'] as GoldKarat[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedKarat(k)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    selectedKarat === k
                      ? 'bg-[#8A1538] text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {WEIGHT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSelectedGrams(p.grams)}
                  className={`rounded border px-2 py-1 text-[11px] font-medium ${
                    Math.abs(selectedGrams - p.grams) < 0.01
                      ? 'border-[#8A1538] bg-[#8A1538]/10 text-[#8A1538] dark:border-rose-500 dark:text-rose-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <label htmlFor="gold-weight-grams" className="text-xs text-slate-600 dark:text-slate-300">
                Weight (grams)
              </label>
              <input
                id="gold-weight-grams"
                data-testid="gold-weight-input"
                type="number"
                step="0.5"
                min="0.1"
                value={selectedGrams}
                onChange={(e) => setSelectedGrams(Number(e.target.value) || 0)}
                className="w-28 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-right font-mono text-xs text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div
              className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800"
              data-testid="gold-calc-summary"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Malabar ({safeGrams.toFixed(2)}g {selectedKarat})
                </span>
                <span className="font-mono font-bold text-[#8A1538] dark:text-rose-300">
                  {calcMalabarTotalQar !== null ? `${formatQarRate(calcMalabarTotalQar)} QAR` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">XE Est. Malabar</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {calcXeEstimateTotalQar !== null ? `${formatQarRate(calcXeEstimateTotalQar)} QAR` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Raw XE Spot Value (USD eq.)</span>
                <span className="font-mono">
                  {calcXeSpotTotalQar !== null && snapshot
                    ? `${formatQarRate(calcXeSpotTotalQar)} QAR ($${formatQarRate(
                        calcXeSpotTotalQar / snapshot.usdQar,
                      )})`
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <SeoFaqSection
        section="gold"
        heading="Qatar Gold Rate FAQ & Bilingual Guide (EN / العربية)"
      />
    </div>
  );
};
