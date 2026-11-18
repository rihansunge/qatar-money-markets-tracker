import React, { useMemo, useState } from 'react';
import type { OhlcBar, Timeframe } from '../types/market';
import { calculateSMA, formatQarPrice } from '../utils/marketMath';

interface HistoricalChartProps {
  title: string;
  subtitle?: string;
  bars: OhlcBar[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  unitLabel?: string;
  benchmarkLabel?: string;
  height?: number;
}

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y', '3Y', '5Y'];

export const HistoricalChart: React.FC<HistoricalChartProps> = ({
  title,
  subtitle,
  bars,
  timeframe,
  onTimeframeChange,
  unitLabel = 'QAR',
  benchmarkLabel = 'QE Index (QSI)',
  height = 290,
}) => {
  const [chartMode, setChartMode] = useState<'area' | 'candles'>('area');
  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const svgWidth = 820;
  const svgHeight = height;
  const padLeft = 10;
  const padRight = 58;
  const padTop = 16;
  const volHeight = 36;
  const padBottom = 26;
  const plotHeight = svgHeight - padTop - padBottom - volHeight;
  const plotWidth = svgWidth - padLeft - padRight;

  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  const sma20 = useMemo(() => calculateSMA(closes, 20), [closes]);
  const sma50 = useMemo(() => calculateSMA(closes, 50), [closes]);

  const normalizedBench = useMemo(() => {
    if (!showBenchmark || bars.length === 0 || !bars[0].benchmarkClose) return null;
    const baseAsset = bars[0].close || 1;
    const baseBench = bars[0].benchmarkClose || 1;
    return bars.map((b) => ((b.benchmarkClose ?? baseBench) / baseBench) * baseAsset);
  }, [bars, showBenchmark]);

  const { minVal, maxVal, maxVol } = useMemo(() => {
    if (bars.length === 0) return { minVal: 0, maxVal: 1, maxVol: 1 };
    let min = Infinity;
    let max = -Infinity;
    let volMax = 0;

    bars.forEach((b, idx) => {
      min = Math.min(min, b.low);
      max = Math.max(max, b.high);
      volMax = Math.max(volMax, b.volume);
      if (showSma20 && sma20[idx] !== null) {
        min = Math.min(min, sma20[idx]!);
        max = Math.max(max, sma20[idx]!);
      }
      if (showSma50 && sma50[idx] !== null) {
        min = Math.min(min, sma50[idx]!);
        max = Math.max(max, sma50[idx]!);
      }
      if (normalizedBench && normalizedBench[idx] !== undefined) {
        min = Math.min(min, normalizedBench[idx]);
        max = Math.max(max, normalizedBench[idx]);
      }
    });

    const padding = (max - min) * 0.08 || max * 0.02 || 0.1;
    return {
      minVal: min - padding,
      maxVal: max + padding,
      maxVol: volMax || 1,
    };
  }, [bars, showSma20, showSma50, sma20, sma50, normalizedBench]);

  if (bars.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No historical bars available for this timeframe.
      </div>
    );
  }

  const firstClose = bars[0].close;
  const lastClose = bars[bars.length - 1].close;
  const periodChange = lastClose - firstClose;
  const periodChangePct = firstClose > 0 ? (periodChange / firstClose) * 100 : 0;
  const isPositive = periodChange >= 0;

  const activeIdx = hoverIdx !== null && bars[hoverIdx] ? hoverIdx : bars.length - 1;
  const activeBar = bars[activeIdx];
  const activeBarReturnPct =
    firstClose > 0 ? ((activeBar.close - firstClose) / firstClose) * 100 : 0;

  const xFor = (i: number) =>
    padLeft + (bars.length > 1 ? (i / (bars.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (val: number) =>
    padTop + plotHeight - ((val - minVal) / (maxVal - minVal || 1)) * plotHeight;

  const linePoints = bars.map((b, i) => `${xFor(i).toFixed(1)},${yFor(b.close).toFixed(1)}`).join(' ');
  const areaPath = `M ${xFor(0).toFixed(1)},${(padTop + plotHeight).toFixed(1)} L ${bars
    .map((b, i) => `${xFor(i).toFixed(1)},${yFor(b.close).toFixed(1)}`)
    .join(' L ')} L ${xFor(bars.length - 1).toFixed(1)},${(padTop + plotHeight).toFixed(1)} Z`;

  const buildOverlayPath = (series: Array<number | null>) => {
    let path = '';
    series.forEach((val, idx) => {
      if (val === null) return;
      const cmd = path === '' ? 'M' : 'L';
      path += `${cmd} ${xFor(idx).toFixed(1)},${yFor(val).toFixed(1)} `;
    });
    return path.trim();
  };

  const sma20Path = showSma20 ? buildOverlayPath(sma20) : '';
  const sma50Path = showSma50 ? buildOverlayPath(sma50) : '';
  const benchPath = normalizedBench ? buildOverlayPath(normalizedBench) : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + (maxVal - minVal) * t);
  const xTickIndices = [
    0,
    Math.floor((bars.length - 1) * 0.25),
    Math.floor((bars.length - 1) * 0.5),
    Math.floor((bars.length - 1) * 0.75),
    bars.length - 1,
  ];

  const candleWidth = Math.max(2.5, Math.min(10, (plotWidth / bars.length) * 0.62));
  const strokeMain = isPositive ? '#0D7A5F' : '#C81E32';

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const clamped = Math.max(padLeft, Math.min(padLeft + plotWidth, relX));
    const ratio = (clamped - padLeft) / plotWidth;
    const idx = Math.round(ratio * (bars.length - 1));
    setHoverIdx(Math.max(0, Math.min(bars.length - 1, idx)));
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      data-testid="historical-chart"
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {subtitle && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-4 font-mono tabular-nums">
            <span className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {unitLabel === 'QAR' && activeBar.close < 100
                ? formatQarPrice(activeBar.close)
                : activeBar.close.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
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
          </div>
        </div>

        {/* Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2">
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
                className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator Toolbar & OHLC Readout */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span>{activeBar.date}</span>
          <span>O {unitLabel === 'QAR' && activeBar.open < 10 ? formatQarPrice(activeBar.open) : activeBar.open.toFixed(2)}</span>
          <span>H {unitLabel === 'QAR' && activeBar.high < 10 ? formatQarPrice(activeBar.high) : activeBar.high.toFixed(2)}</span>
          <span>L {unitLabel === 'QAR' && activeBar.low < 10 ? formatQarPrice(activeBar.low) : activeBar.low.toFixed(2)}</span>
          <span>C {unitLabel === 'QAR' && activeBar.close < 10 ? formatQarPrice(activeBar.close) : activeBar.close.toFixed(2)}</span>
          <span>Vol {(activeBar.volume / 1000).toFixed(0)}K</span>
          <span
            className={
              activeBarReturnPct >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }
          >
            From Start {activeBarReturnPct >= 0 ? '+' : ''}
            {activeBarReturnPct.toFixed(2)}%
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Chart display mode"
          >
            <button
              type="button"
              onClick={() => setChartMode('area')}
              className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === 'area'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Area
            </button>
            <button
              type="button"
              onClick={() => setChartMode('candles')}
              className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                chartMode === 'candles'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Candlestick
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowSma20((v) => !v)}
            className={`whitespace-nowrap shrink-0 rounded border px-2 py-1 text-xs font-medium transition-colors ${
              showSma20
                ? 'border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            SMA 20
          </button>
          <button
            type="button"
            onClick={() => setShowSma50((v) => !v)}
            className={`whitespace-nowrap shrink-0 rounded border px-2 py-1 text-xs font-medium transition-colors ${
              showSma50
                ? 'border-sky-500/40 bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            SMA 50
          </button>
          <button
            type="button"
            onClick={() => setShowBenchmark((v) => !v)}
            className={`whitespace-nowrap shrink-0 rounded border px-2 py-1 text-xs font-medium transition-colors ${
              showBenchmark
                ? 'border-rose-700/40 bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            vs {benchmarkLabel}
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="mt-3 w-full">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-auto w-full select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`${title} historical ${chartMode} chart for ${timeframe}`}
        >
          <defs>
            <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeMain} stopOpacity="0.18" />
              <stop offset="100%" stopColor={strokeMain} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines & Right Y-Axis */}
          {yTicks.map((val, i) => {
            const y = yFor(val);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotWidth}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200/80 dark:text-slate-800"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padLeft + plotWidth + 6}
                  y={y + 3.5}
                  fontSize="10.5"
                  className="fill-slate-500 font-mono dark:fill-slate-400"
                >
                  {val >= 1000 ? val.toFixed(0) : val < 10 && unitLabel === 'QAR' ? val.toFixed(3) : val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Volume Bars */}
          {bars.map((b, i) => {
            const h = (b.volume / maxVol) * (volHeight - 6);
            const x = xFor(i) - candleWidth / 2;
            const y = padTop + plotHeight + volHeight - h;
            const up = b.close >= b.open;
            return (
              <rect
                key={`vol-${i}`}
                x={x}
                y={y}
                width={candleWidth}
                height={Math.max(1, h)}
                fill={up ? 'rgba(13, 122, 95, 0.28)' : 'rgba(200, 30, 50, 0.28)'}
              />
            );
          })}

          {/* Main Series: Area or Candlestick */}
          {chartMode === 'area' ? (
            <>
              <path d={areaPath} fill="url(#chartAreaGrad)" />
              <polyline
                fill="none"
                stroke={strokeMain}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={linePoints}
              />
            </>
          ) : (
            bars.map((b, i) => {
              const x = xFor(i);
              const yOpen = yFor(b.open);
              const yClose = yFor(b.close);
              const yHigh = yFor(b.high);
              const yLow = yFor(b.low);
              const up = b.close >= b.open;
              const color = up ? '#0D7A5F' : '#C81E32';
              const bodyTop = Math.min(yOpen, yClose);
              const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
              return (
                <g key={`c-${i}`}>
                  <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.2" />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="0.5"
                  />
                </g>
              );
            })
          )}

          {/* Overlays */}
          {benchPath && (
            <path
              d={benchPath}
              fill="none"
              stroke="#9F1239"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
          {sma20Path && (
            <path d={sma20Path} fill="none" stroke="#D97706" strokeWidth="1.4" opacity="0.9" />
          )}
          {sma50Path && (
            <path d={sma50Path} fill="none" stroke="#0284C7" strokeWidth="1.4" opacity="0.9" />
          )}

          {/* Crosshair */}
          <line
            x1={xFor(activeIdx)}
            y1={padTop}
            x2={xFor(activeIdx)}
            y2={padTop + plotHeight + volHeight}
            stroke="currentColor"
            className="text-slate-400/70 dark:text-slate-500/70"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <circle
            cx={xFor(activeIdx)}
            cy={yFor(activeBar.close)}
            r="4"
            fill={strokeMain}
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* X-Axis Labels */}
          {xTickIndices.map((idx, pos) => {
            const x = xFor(idx);
            const anchor = pos === 0 ? 'start' : pos === xTickIndices.length - 1 ? 'end' : 'middle';
            return (
              <text
                key={`x-${idx}`}
                x={x}
                y={svgHeight - 6}
                textAnchor={anchor}
                fontSize="10.5"
                className="fill-slate-500 font-mono dark:fill-slate-400"
              >
                {bars[idx]?.date}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
