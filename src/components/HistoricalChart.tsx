import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { ChevronDown, Maximize2, SlidersHorizontal, X } from 'lucide-react';
import type { OhlcBar, Timeframe } from '../types/market';
import {
  calculateBollingerBands,
  calculateEMASeries,
  calculateFibonacciLevels,
  calculateRSI,
  calculateSMA,
  formatQarPrice,
} from '../utils/marketMath';
import { normalizeBarsForTradingView } from '../utils/chartSeries';

interface HistoricalChartProps {
  title: string;
  subtitle?: string;
  bars: OhlcBar[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  unitLabel?: string;
  benchmarkLabel?: string;
  height?: number;
  isLive?: boolean;
  lastUpdatedAt?: string | null;
}

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1H', '1D', '1W', '1M', '3M', '1Y', '3Y', '5Y'];

export const HistoricalChart: React.FC<HistoricalChartProps> = ({
  title,
  subtitle,
  bars,
  timeframe,
  onTimeframeChange,
  unitLabel = 'QAR',
  benchmarkLabel = 'QE Index (QSI)',
  height = 360,
  isLive,
  lastUpdatedAt,
}) => {
  const [chartMode, setChartMode] = useState<'candles' | 'area'>('candles');
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);

  // Clean chart by default; user can check 1 or multiple indicators to apply automatically
  const [showDma45, setShowDma45] = useState(false);
  const [showDma200, setShowDma200] = useState(false);
  const [showSma20, setShowSma20] = useState(false);
  const [showSma50, setShowSma50] = useState(false);
  const [showEma20, setShowEma20] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showFib, setShowFib] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);

  const [fibPickMode, setFibPickMode] = useState<'idle' | 'pick-first' | 'pick-second'>('idle');
  const [customFibRange, setCustomFibRange] = useState<{ p1: number; p2: number } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const dma45Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const dma200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const sma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const sma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const benchRef = useRef<ISeriesApi<'Line'> | null>(null);
  const fibLinesRef = useRef<IPriceLine[]>([]);
  const lastFitSigRef = useRef<string>('');
  const lastSeriesMetaRef = useRef<{
    baseSig: string;
    overlaysSig: string;
    len: number;
    firstTime: number;
    lastTime: number;
  } | null>(null);
  const prevCloseTrackerRef = useRef<{ sig: string; close: number } | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const fibPickModeRef = useRef<'idle' | 'pick-first' | 'pick-second'>('idle');
  const firstPickedPriceRef = useRef<number | null>(null);

  useEffect(() => {
    fibPickModeRef.current = fibPickMode;
  }, [fibPickMode]);

  // Close Indicators dropdown on outside click or Escape
  useEffect(() => {
    if (!indicatorsOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIndicatorsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndicatorsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [indicatorsOpen]);

  // Watch dark mode toggles on <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setIsDarkTheme(document.documentElement.classList.contains('dark'));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const normalized = useMemo(() => normalizeBarsForTradingView(bars, timeframe), [bars, timeframe]);

  const timeToIndexMap = useMemo(() => {
    const m = new Map<number, number>();
    normalized.forEach((pt, idx) => m.set(Number(pt.time), idx));
    return m;
  }, [normalized]);

  const timeToIndexRef = useRef<Map<number, number>>(timeToIndexMap);
  const normalizedRef = useRef(normalized);
  useEffect(() => {
    timeToIndexRef.current = timeToIndexMap;
    normalizedRef.current = normalized;
  }, [timeToIndexMap, normalized]);

  const closes = useMemo(() => normalized.map((n) => n.bar.close), [normalized]);
  const fallbackSma45 = useMemo(() => calculateSMA(closes, 45), [closes]);
  const fallbackSma200 = useMemo(() => calculateSMA(closes, 200), [closes]);

  const dma45Values = useMemo(
    () =>
      normalized.map((n, idx) =>
        typeof n.bar.dma45 === 'number' && Number.isFinite(n.bar.dma45)
          ? n.bar.dma45
          : fallbackSma45[idx],
      ),
    [normalized, fallbackSma45],
  );

  const dma200Values = useMemo(
    () =>
      normalized.map((n, idx) =>
        typeof n.bar.dma200 === 'number' && Number.isFinite(n.bar.dma200)
          ? n.bar.dma200
          : fallbackSma200[idx],
      ),
    [normalized, fallbackSma200],
  );

  const sma20 = useMemo(() => calculateSMA(closes, 20), [closes]);
  const sma50 = useMemo(() => calculateSMA(closes, 50), [closes]);
  const ema20 = useMemo(() => calculateEMASeries(closes, 20), [closes]);
  const bollinger = useMemo(() => calculateBollingerBands(closes, 20, 2), [closes]);
  const latestRsi14 = useMemo(() => calculateRSI(closes, 14), [closes]);

  const latestDma45 = useMemo(() => {
    for (let i = dma45Values.length - 1; i >= 0; i--) {
      if (dma45Values[i] !== null) return dma45Values[i];
    }
    return null;
  }, [dma45Values]);

  const latestDma200 = useMemo(() => {
    for (let i = dma200Values.length - 1; i >= 0; i--) {
      if (dma200Values[i] !== null) return dma200Values[i];
    }
    return null;
  }, [dma200Values]);

  const normalizedBench = useMemo(() => {
    if (!showBenchmark || normalized.length === 0 || !normalized[0].bar.benchmarkClose) return null;
    const baseAsset = normalized[0].bar.close || 1;
    const baseBench = normalized[0].bar.benchmarkClose || 1;
    return normalized.map((n) => ({
      time: n.time,
      value: ((n.bar.benchmarkClose ?? baseBench) / baseBench) * baseAsset,
    }));
  }, [normalized, showBenchmark]);

  // Auto or custom Fibonacci retracement levels
  const fibRange = useMemo(() => {
    if (customFibRange) {
      return {
        high: Math.max(customFibRange.p1, customFibRange.p2),
        low: Math.min(customFibRange.p1, customFibRange.p2),
        isCustom: true,
      };
    }
    if (normalized.length === 0) return { high: 0, low: 0, isCustom: false };
    let hi = -Infinity;
    let lo = Infinity;
    for (const pt of normalized) {
      hi = Math.max(hi, pt.bar.high);
      lo = Math.min(lo, pt.bar.low);
    }
    return { high: hi, low: lo, isCustom: false };
  }, [normalized, customFibRange]);

  const fibLevels = useMemo(
    () => (showFib && fibRange.high > fibRange.low ? calculateFibonacciLevels(fibRange.high, fibRange.low) : []),
    [showFib, fibRange],
  );

  // Clear custom fib when switching ticker or timeframe
  useEffect(() => {
    setCustomFibRange(null);
    setFibPickMode('idle');
    firstPickedPriceRef.current = null;
    setHoverIndex(null);
  }, [title, timeframe]);

  // Initialize TradingView Lightweight Chart instance once per chartMode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isIntraday =
      timeframe === '5m' || timeframe === '15m' || timeframe === '1H' || timeframe === '1D' || timeframe === '1W';

    const chart = createChart(container, {
      width: container.clientWidth || 720,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDarkTheme ? '#0f172a' : '#ffffff' },
        textColor: isDarkTheme ? '#94a3b8' : '#475569',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDarkTheme ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.7)' },
        horzLines: { color: isDarkTheme ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.7)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDarkTheme ? '#64748b' : '#94a3b8',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#8A1538',
        },
        horzLine: {
          color: isDarkTheme ? '#64748b' : '#94a3b8',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#8A1538',
        },
      },
      rightPriceScale: {
        borderColor: isDarkTheme ? '#1e293b' : '#e2e8f0',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: isDarkTheme ? '#1e293b' : '#e2e8f0',
        timeVisible: isIntraday,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const isSub10 = unitLabel === 'QAR' && (normalizedRef.current[0]?.bar.close ?? 10) < 10;
    const priceFormat = {
      type: 'price' as const,
      precision: isSub10 ? 3 : 2,
      minMove: isSub10 ? 0.001 : 0.01,
    };

    const mainSeries =
      chartMode === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: '#089981',
            downColor: '#F23645',
            borderUpColor: '#089981',
            borderDownColor: '#F23645',
            wickUpColor: '#089981',
            wickDownColor: '#F23645',
            priceFormat,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: '#089981',
            topColor: 'rgba(8, 153, 129, 0.24)',
            bottomColor: 'rgba(8, 153, 129, 0.0)',
            lineWidth: 2,
            priceFormat,
          });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const dma45Series = chart.addSeries(LineSeries, {
      color: '#EC4899',
      lineWidth: 2,
      title: '45 DMA',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    const dma200Series = chart.addSeries(LineSeries, {
      color: '#16A34A',
      lineWidth: 2,
      title: '200 DMA',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    const sma20Series = chart.addSeries(LineSeries, {
      color: '#D97706',
      lineWidth: 1,
      title: 'SMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    const sma50Series = chart.addSeries(LineSeries, {
      color: '#0284C7',
      lineWidth: 1,
      title: 'SMA 50',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#7C3AED',
      lineWidth: 1,
      title: 'EMA 20',
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: 'rgba(13, 148, 136, 0.75)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: 'rgba(13, 148, 136, 0.75)',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const benchSeries = chart.addSeries(LineSeries, {
      color: '#8A1538',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setHoverIndex(null);
        return;
      }
      const idx = timeToIndexRef.current.get(Number(param.time));
      setHoverIndex(typeof idx === 'number' ? idx : null);
    };

    const onChartClick = (param: MouseEventParams<Time>) => {
      const mode = fibPickModeRef.current;
      if (mode === 'idle' || !param.time) return;
      const idx = timeToIndexRef.current.get(Number(param.time));
      if (typeof idx !== 'number') return;
      const bar = normalizedRef.current[idx]?.bar;
      if (!bar) return;

      if (mode === 'pick-first') {
        firstPickedPriceRef.current = bar.low;
        setFibPickMode('pick-second');
      } else if (mode === 'pick-second' && firstPickedPriceRef.current !== null) {
        const p1 = firstPickedPriceRef.current;
        const p2 = bar.high >= p1 ? bar.high : bar.low;
        setCustomFibRange({ p1, p2 });
        setShowFib(true);
        setFibPickMode('idle');
        firstPickedPriceRef.current = null;
      }
    };

    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.subscribeClick(onChartClick);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) {
          chart.applyOptions({ width: w });
        }
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;
    volSeriesRef.current = volSeries;
    dma45Ref.current = dma45Series;
    dma200Ref.current = dma200Series;
    sma20Ref.current = sma20Series;
    sma50Ref.current = sma50Series;
    ema20Ref.current = ema20Series;
    bbUpperRef.current = bbUpperSeries;
    bbLowerRef.current = bbLowerSeries;
    benchRef.current = benchSeries;
    lastFitSigRef.current = '';
    lastSeriesMetaRef.current = null;

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeClick(onChartClick);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volSeriesRef.current = null;
      dma45Ref.current = null;
      dma200Ref.current = null;
      sma20Ref.current = null;
      sma50Ref.current = null;
      ema20Ref.current = null;
      bbUpperRef.current = null;
      bbLowerRef.current = null;
      benchRef.current = null;
      fibLinesRef.current = [];
      lastSeriesMetaRef.current = null;
    };
  }, [chartMode, height]);

  // Apply theme & intraday axis options without recreating chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isIntraday =
      timeframe === '5m' || timeframe === '15m' || timeframe === '1H' || timeframe === '1D' || timeframe === '1W';
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isDarkTheme ? '#0f172a' : '#ffffff' },
        textColor: isDarkTheme ? '#94a3b8' : '#475569',
      },
      grid: {
        vertLines: { color: isDarkTheme ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.7)' },
        horzLines: { color: isDarkTheme ? 'rgba(51, 65, 85, 0.35)' : 'rgba(226, 232, 240, 0.7)' },
      },
      crosshair: {
        vertLine: { color: isDarkTheme ? '#64748b' : '#94a3b8' },
        horzLine: { color: isDarkTheme ? '#64748b' : '#94a3b8' },
      },
      rightPriceScale: {
        borderColor: isDarkTheme ? '#1e293b' : '#e2e8f0',
      },
      timeScale: {
        borderColor: isDarkTheme ? '#1e293b' : '#e2e8f0',
        timeVisible: isIntraday,
      },
    });
  }, [isDarkTheme, timeframe]);

  // Push series data & technical studies (uses incremental .update() on live ticks to prevent flicker)
  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    const volSeries = volSeriesRef.current;
    const chart = chartRef.current;
    if (!mainSeries || !volSeries || !chart || normalized.length === 0) return;

    const baseSig = `${title}|${timeframe}|${chartMode}|${unitLabel}`;
    const overlaysSig = `${showDma45}|${showDma200}|${showSma20}|${showSma50}|${showEma20}|${showBollinger}|${Boolean(
      normalizedBench,
    )}`;
    const firstTime = Number(normalized[0].time);
    const lastIdx = normalized.length - 1;
    const lastPt = normalized[lastIdx];
    const lastTime = Number(lastPt.time);
    const prevMeta = lastSeriesMetaRef.current;

    const canIncrementalUpdate =
      prevMeta !== null &&
      prevMeta.baseSig === baseSig &&
      prevMeta.overlaysSig === overlaysSig &&
      prevMeta.firstTime === firstTime &&
      ((normalized.length === prevMeta.len && lastTime === prevMeta.lastTime) ||
        (normalized.length === prevMeta.len + 1 && lastTime > prevMeta.lastTime));

    if (canIncrementalUpdate) {
      if (chartMode === 'candles') {
        (mainSeries as ISeriesApi<'Candlestick'>).update({
          time: lastPt.time,
          open: lastPt.bar.open,
          high: lastPt.bar.high,
          low: lastPt.bar.low,
          close: lastPt.bar.close,
        });
      } else {
        (mainSeries as ISeriesApi<'Area'>).update({
          time: lastPt.time,
          value: lastPt.bar.close,
        });
      }

      volSeries.update({
        time: lastPt.time,
        value: lastPt.bar.volume,
        color:
          lastPt.bar.close >= lastPt.bar.open
            ? 'rgba(8, 153, 129, 0.32)'
            : 'rgba(242, 54, 69, 0.32)',
      });

      if (showDma45 && dma45Values[lastIdx] !== null) {
        dma45Ref.current?.update({ time: lastPt.time, value: dma45Values[lastIdx]! });
      }
      if (showDma200 && dma200Values[lastIdx] !== null) {
        dma200Ref.current?.update({ time: lastPt.time, value: dma200Values[lastIdx]! });
      }
      if (showSma20 && sma20[lastIdx] !== null) {
        sma20Ref.current?.update({ time: lastPt.time, value: sma20[lastIdx]! });
      }
      if (showSma50 && sma50[lastIdx] !== null) {
        sma50Ref.current?.update({ time: lastPt.time, value: sma50[lastIdx]! });
      }
      if (showEma20 && ema20[lastIdx] !== null) {
        ema20Ref.current?.update({ time: lastPt.time, value: ema20[lastIdx]! });
      }
      if (showBollinger && bollinger[lastIdx]) {
        bbUpperRef.current?.update({ time: lastPt.time, value: bollinger[lastIdx]!.upper });
        bbLowerRef.current?.update({ time: lastPt.time, value: bollinger[lastIdx]!.lower });
      }
      if (normalizedBench && normalizedBench[lastIdx]) {
        benchRef.current?.update(normalizedBench[lastIdx]);
      }

      lastSeriesMetaRef.current = {
        baseSig,
        overlaysSig,
        len: normalized.length,
        firstTime,
        lastTime,
      };
      return;
    }

    const isSub10 = unitLabel === 'QAR' && normalized[0].bar.close < 10;
    mainSeries.applyOptions({
      priceFormat: {
        type: 'price' as const,
        precision: isSub10 ? 3 : 2,
        minMove: isSub10 ? 0.001 : 0.01,
      },
    });

    if (chartMode === 'candles') {
      (mainSeries as ISeriesApi<'Candlestick'>).setData(
        normalized.map((n) => ({
          time: n.time,
          open: n.bar.open,
          high: n.bar.high,
          low: n.bar.low,
          close: n.bar.close,
        })),
      );
    } else {
      const periodUp = normalized[normalized.length - 1].bar.close >= normalized[0].bar.close;
      (mainSeries as ISeriesApi<'Area'>).applyOptions({
        lineColor: periodUp ? '#089981' : '#F23645',
        topColor: periodUp ? 'rgba(8, 153, 129, 0.24)' : 'rgba(242, 54, 69, 0.24)',
        bottomColor: periodUp ? 'rgba(8, 153, 129, 0.0)' : 'rgba(242, 54, 69, 0.0)',
      });
      (mainSeries as ISeriesApi<'Area'>).setData(
        normalized.map((n) => ({
          time: n.time,
          value: n.bar.close,
        })),
      );
    }

    volSeries.setData(
      normalized.map((n) => ({
        time: n.time,
        value: n.bar.volume,
        color:
          n.bar.close >= n.bar.open ? 'rgba(8, 153, 129, 0.32)' : 'rgba(242, 54, 69, 0.32)',
      })),
    );

    dma45Ref.current?.setData(
      showDma45
        ? normalized
            .map((n, idx) => (dma45Values[idx] !== null ? { time: n.time, value: dma45Values[idx]! } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    dma200Ref.current?.setData(
      showDma200
        ? normalized
            .map((n, idx) => (dma200Values[idx] !== null ? { time: n.time, value: dma200Values[idx]! } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    sma20Ref.current?.setData(
      showSma20
        ? normalized
            .map((n, idx) => (sma20[idx] !== null ? { time: n.time, value: sma20[idx]! } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    sma50Ref.current?.setData(
      showSma50
        ? normalized
            .map((n, idx) => (sma50[idx] !== null ? { time: n.time, value: sma50[idx]! } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    ema20Ref.current?.setData(
      showEma20
        ? normalized
            .map((n, idx) => (ema20[idx] !== null ? { time: n.time, value: ema20[idx]! } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    bbUpperRef.current?.setData(
      showBollinger
        ? normalized
            .map((n, idx) => (bollinger[idx] ? { time: n.time, value: bollinger[idx]!.upper } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    bbLowerRef.current?.setData(
      showBollinger
        ? normalized
            .map((n, idx) => (bollinger[idx] ? { time: n.time, value: bollinger[idx]!.lower } : null))
            .filter((x): x is { time: typeof normalized[number]['time']; value: number } => x !== null)
        : [],
    );
    benchRef.current?.setData(normalizedBench ?? []);

    lastSeriesMetaRef.current = {
      baseSig,
      overlaysSig,
      len: normalized.length,
      firstTime,
      lastTime,
    };

    // Fit content only when switching asset, timeframe, or mode (preserves zoom/pan on live ticks)
    const fitSig = `${title}|${timeframe}|${chartMode}|${firstTime}`;
    if (lastFitSigRef.current !== fitSig) {
      lastFitSigRef.current = fitSig;
      chart.timeScale().fitContent();
    }
  }, [
    normalized,
    chartMode,
    showDma45,
    showDma200,
    showSma20,
    showSma50,
    showEma20,
    showBollinger,
    normalizedBench,
    dma45Values,
    dma200Values,
    sma20,
    sma50,
    ema20,
    bollinger,
    title,
    timeframe,
    unitLabel,
  ]);

  // Flash headline rate subtly on live up/down ticks
  const latestBarClose = normalized.length > 0 ? normalized[normalized.length - 1].bar.close : 0;
  useEffect(() => {
    const assetSig = `${title}|${timeframe}`;
    const prev = prevCloseTrackerRef.current;
    if (prev && prev.sig === assetSig && latestBarClose !== prev.close && latestBarClose > 0) {
      setPriceFlash(latestBarClose > prev.close ? 'up' : 'down');
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setPriceFlash(null), 900);
    }
    prevCloseTrackerRef.current = { sig: assetSig, close: latestBarClose };
  }, [title, timeframe, latestBarClose]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Manage horizontal Fibonacci retracement price lines
  useEffect(() => {
    const mainSeries = mainSeriesRef.current;
    if (!mainSeries) return;

    for (const line of fibLinesRef.current) {
      try {
        mainSeries.removePriceLine(line);
      } catch {
        // Ignore already removed price line
      }
    }
    fibLinesRef.current = [];

    if (fibLevels.length === 0) return;

    const created: IPriceLine[] = [];
    for (const lvl of fibLevels) {
      created.push(
        mainSeries.createPriceLine({
          price: lvl.price,
          color: lvl.color,
          lineWidth: lvl.ratio === 0.618 || lvl.ratio === 0.5 ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Fib ${lvl.label}`,
        }),
      );
    }
    fibLinesRef.current = created;
  }, [fibLevels, chartMode]);

  if (normalized.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No historical bars available for this timeframe.
      </div>
    );
  }

  const firstClose = normalized[0].bar.close;
  const lastClose = normalized[normalized.length - 1].bar.close;
  const periodChange = lastClose - firstClose;
  const periodChangePct = firstClose > 0 ? (periodChange / firstClose) * 100 : 0;

  const activeIdx =
    hoverIndex !== null && normalized[hoverIndex] ? hoverIndex : normalized.length - 1;
  const activeBar = normalized[activeIdx].bar;
  const activeBarReturnPct =
    firstClose > 0 ? ((activeBar.close - firstClose) / firstClose) * 100 : 0;
  const barUp = activeBar.close >= activeBar.open;

  const formatNum = (val: number) =>
    unitLabel === 'QAR' && val < 100
      ? formatQarPrice(val)
      : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const activeStudyCount =
    Number(showDma45) +
    Number(showDma200) +
    Number(showSma20) +
    Number(showSma50) +
    Number(showEma20) +
    Number(showBollinger) +
    Number(showFib) +
    Number(showBenchmark);

  const clearAllIndicators = () => {
    setShowDma45(false);
    setShowDma200(false);
    setShowSma20(false);
    setShowSma50(false);
    setShowEma20(false);
    setShowBollinger(false);
    setShowFib(false);
    setShowBenchmark(false);
    setFibPickMode('idle');
    setCustomFibRange(null);
    firstPickedPriceRef.current = null;
  };

  const indicatorItems: Array<{
    id: string;
    label: string;
    sublabel: string;
    color: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    valueText?: string;
  }> = [
    {
      id: 'dma45',
      label: '45 DMA (45 DMS)',
      sublabel: '45-day daily moving average',
      color: '#EC4899',
      checked: showDma45,
      onChange: setShowDma45,
      valueText: latestDma45 !== null ? formatNum(latestDma45) : undefined,
    },
    {
      id: 'dma200',
      label: '200 DMA (200 MDA)',
      sublabel: '200-day daily moving average',
      color: '#16A34A',
      checked: showDma200,
      onChange: setShowDma200,
      valueText: latestDma200 !== null ? formatNum(latestDma200) : undefined,
    },
    {
      id: 'sma20',
      label: 'SMA 20',
      sublabel: '20-bar simple moving average',
      color: '#D97706',
      checked: showSma20,
      onChange: setShowSma20,
    },
    {
      id: 'sma50',
      label: 'SMA 50',
      sublabel: '50-bar simple moving average',
      color: '#0284C7',
      checked: showSma50,
      onChange: setShowSma50,
    },
    {
      id: 'ema20',
      label: 'EMA 20',
      sublabel: '20-bar exponential moving average',
      color: '#7C3AED',
      checked: showEma20,
      onChange: setShowEma20,
    },
    {
      id: 'bollinger',
      label: 'Bollinger Bands (20, 2)',
      sublabel: 'Upper & lower 2σ volatility bands',
      color: '#0D9488',
      checked: showBollinger,
      onChange: setShowBollinger,
    },
    {
      id: 'fibonacci',
      label: 'Fibonacci Retracement',
      sublabel: customFibRange ? 'Custom 2-point swing levels' : 'Auto swing high/low levels',
      color: '#8A1538',
      checked: showFib,
      onChange: setShowFib,
    },
    ...(normalized.some((n) => typeof n.bar.benchmarkClose === 'number')
      ? [
          {
            id: 'benchmark',
            label: `vs ${benchmarkLabel}`,
            sublabel: 'Normalized index comparison line',
            color: '#9F1239',
            checked: showBenchmark,
            onChange: setShowBenchmark,
          },
        ]
      : []),
  ];

  const activeLabels: string[] = [];
  if (showDma45) {
    activeLabels.push(latestDma45 !== null ? `45 DMA ${formatNum(latestDma45)}` : '45 DMA');
  }
  if (showDma200) {
    activeLabels.push(latestDma200 !== null ? `200 DMA ${formatNum(latestDma200)}` : '200 DMA');
  }
  if (showSma20) activeLabels.push('SMA 20');
  if (showSma50) activeLabels.push('SMA 50');
  if (showEma20) activeLabels.push('EMA 20');
  if (showBollinger) activeLabels.push('BB(20,2)');
  if (showFib) activeLabels.push('Fib');
  if (showBenchmark) activeLabels.push(`vs ${benchmarkLabel}`);

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      data-testid="historical-chart"
    >
      {/* Header & Intraday / Daily / Multi-Year Timeframes */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {isLive !== undefined && (
              <span
                data-testid="chart-live-status"
                className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isLive
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800'
                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLive ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                {isLive ? 'Live' : 'Paused'}
              </span>
            )}
            {subtitle && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-4 font-mono tabular-nums">
            <span
              data-testid="chart-headline-price"
              className={`rounded px-1 -mx-1 text-2xl font-semibold transition-colors duration-300 ${
                priceFlash === 'up'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : priceFlash === 'down'
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'text-slate-900 dark:text-slate-50'
              }`}
            >
              {formatNum(activeBar.close)}{' '}
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {unitLabel}
              </span>
            </span>
            <span
              className={`text-sm font-medium ${
                periodChange >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {periodChange >= 0 ? '+' : ''}
              {unitLabel === 'QAR' && Math.abs(periodChange) < 10
                ? formatQarPrice(periodChange)
                : periodChange.toFixed(2)}{' '}
              ({periodChangePct >= 0 ? '+' : ''}
              {periodChangePct.toFixed(2)}%) · {timeframe}
            </span>
            {lastUpdatedAt && (
              <span className="text-[11px] font-sans text-slate-400 dark:text-slate-500">
                Updated{' '}
                {new Date(lastUpdatedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        {/* Minutes, Hourly, Daily, Multi-Year Timeframe Controls */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Chart timeframe"
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`whitespace-nowrap shrink-0 rounded px-1.5 py-1 text-[11px] font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-[#8A1538] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            title="Reset chart zoom & pan"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Fit</span>
          </button>
        </div>
      </div>

      {/* TradingView OHLCV + RSI Readout & Compact Chart Mode + Indicators Multi-Select Dropdown */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{activeBar.date}</span>
          <span>
            O <strong className={barUp ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{formatNum(activeBar.open)}</strong>
          </span>
          <span>
            H <strong className={barUp ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{formatNum(activeBar.high)}</strong>
          </span>
          <span>
            L <strong className={barUp ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{formatNum(activeBar.low)}</strong>
          </span>
          <span>
            C <strong className={barUp ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{formatNum(activeBar.close)}</strong>
          </span>
          <span>Vol {(activeBar.volume / 1000).toFixed(0)}K</span>
          <span>RSI(14) {latestRsi14.toFixed(1)}</span>
          <span
            className={
              activeBarReturnPct >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }
          >
            {activeBarReturnPct >= 0 ? '+' : ''}
            {activeBarReturnPct.toFixed(2)}%
          </span>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {/* Chart Type Toggle */}
          <div
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Chart display mode"
          >
            <button
              type="button"
              onClick={() => setChartMode('candles')}
              className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === 'candles'
                  ? 'bg-white text-[#8A1538] shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Candlestick
            </button>
            <button
              type="button"
              onClick={() => setChartMode('area')}
              className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === 'area'
                  ? 'bg-white text-[#8A1538] shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Area
            </button>
          </div>

          {/* Active Draw Fib Pick Indicator (only while picking 2 swing points) */}
          {fibPickMode !== 'idle' && (
            <button
              type="button"
              onClick={() => {
                setFibPickMode('idle');
                firstPickedPriceRef.current = null;
              }}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/50 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
            >
              <span>
                {fibPickMode === 'pick-first' ? 'Click Swing 1 on chart' : 'Click Swing 2 on chart'}
              </span>
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Single Clean Multi-Select Indicators Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              data-testid="indicators-menu-btn"
              aria-haspopup="true"
              aria-expanded={indicatorsOpen}
              onClick={() => setIndicatorsOpen((o) => !o)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                indicatorsOpen || activeStudyCount > 0
                  ? 'border-[#8A1538]/40 bg-rose-50/70 text-[#8A1538] dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Indicators</span>
              {activeStudyCount > 0 && (
                <span className="rounded bg-[#8A1538] px-1.5 py-0.2 text-[10px] font-semibold text-white">
                  {activeStudyCount}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${indicatorsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {indicatorsOpen && (
              <div
                data-testid="indicators-menu"
                role="dialog"
                aria-label="Technical indicators selector"
                className="absolute right-0 top-full z-30 mt-1.5 w-80 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Technical Studies
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select multiple — applies automatically
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearAllIndicators}
                    disabled={activeStudyCount === 0}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#8A1538] hover:bg-rose-50 disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Clear All
                  </button>
                </div>

                <div className="mt-1.5 max-h-96 space-y-0.5 overflow-y-auto pr-0.5">
                  {indicatorItems.map((item) => (
                    <label
                      key={item.id}
                      data-testid={`indicator-option-${item.id}`}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors ${
                        item.checked
                          ? 'bg-slate-100/90 dark:bg-slate-800/90'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => item.onChange(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 accent-[#8A1538]"
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                            {item.label}
                          </span>
                          <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                            {item.sublabel}
                          </span>
                        </span>
                      </span>
                      {item.valueText && (
                        <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-slate-600 dark:text-slate-300">
                          {item.valueText}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    data-testid="draw-fib-menu-btn"
                    onClick={() => {
                      setFibPickMode('pick-first');
                      firstPickedPriceRef.current = null;
                      setIndicatorsOpen(false);
                    }}
                    className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Draw Custom Fib (2-Click)
                  </button>
                  {customFibRange && (
                    <button
                      type="button"
                      onClick={() => setCustomFibRange(null)}
                      className="rounded border border-rose-200 px-2 py-1 text-[11px] font-medium text-[#8A1538] hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      Reset Fib
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Fibonacci Price Levels Legend (visible only when Fibonacci is enabled) */}
      {showFib && fibLevels.length > 0 && (
        <div
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[11px] dark:border-slate-800 dark:bg-slate-800/60"
          data-testid="fib-levels-bar"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
            <span className="font-sans font-semibold text-slate-700 dark:text-slate-200">
              {fibRange.isCustom ? 'Custom Fib:' : 'Auto Swing Fib:'}
            </span>
            {fibLevels.map((lvl) => (
              <span key={lvl.label} style={{ color: lvl.color }}>
                {lvl.label} {formatNum(lvl.price)}
              </span>
            ))}
          </div>
          {fibRange.isCustom && (
            <button
              type="button"
              onClick={() => setCustomFibRange(null)}
              className="font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              Reset Auto Fib
            </button>
          )}
        </div>
      )}

      {/* TradingView Lightweight Charts Container */}
      <div className="mt-3 w-full overflow-hidden rounded-md border border-slate-100 dark:border-slate-800">
        <div
          ref={containerRef}
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`${title} TradingView ${chartMode} chart for ${timeframe}`}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-slate-500">
        <span>Scroll/pinch to zoom · Drag to pan · Hover for OHLCV crosshair</span>
        {activeLabels.length > 0 && (
          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {activeLabels.join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
};

