import React from 'react';
import type { MarketIndex, QseSecurity } from '../types/market';
import { getDayChange } from '../utils/marketMath';
import { Sparkline } from './Sparkline';

interface MarketTickerStripProps {
  indices: MarketIndex[];
  securities: QseSecurity[];
  lastLiveSyncAt?: string | null;
  priceFlashes?: Record<string, 'up' | 'down'>;
  onSelectIndex?: (symbol: MarketIndex['symbol']) => void;
}

export const MarketTickerStrip: React.FC<MarketTickerStripProps> = ({
  indices,
  securities,
  lastLiveSyncAt,
  priceFlashes = {},
  onSelectIndex,
}) => {
  const totalTurnoverMillion =
    securities.reduce((acc, s) => acc + s.turnoverQar, 0) / 1_000_000;
  const shariahCount = securities.filter((s) => s.shariah.isCompliant).length;

  return (
    <section aria-label="Qatar Stock Exchange benchmark indices" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {indices.map((idx) => {
        const { change, changePct } = getDayChange(idx.value, idx.previousClose);
        const positive = change >= 0;
        const flash = priceFlashes[idx.symbol];
        const flashClass =
          flash === 'up'
            ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-950/30'
            : flash === 'down'
              ? 'border-rose-400 bg-rose-50/60 dark:border-rose-600 dark:bg-rose-950/30'
              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700';

        return (
          <button
            key={idx.symbol}
            type="button"
            onClick={() => onSelectIndex?.(idx.symbol)}
            className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-300 ${flashClass}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {idx.symbol}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{idx.name}</span>
              </div>
              <div
                className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50"
                data-testid={`index-value-${idx.symbol}`}
              >
                {idx.value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div
                className={`mt-0.5 font-mono text-xs font-medium tabular-nums ${
                  positive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {positive ? '+' : ''}
                {change.toFixed(2)} ({positive ? '+' : ''}
                {changePct.toFixed(2)}%)
              </div>
            </div>
            <Sparkline data={idx.sparkline} positive={positive} width={76} height={30} />
          </button>
        );
      })}

      {/* Market Turnover & Live Sync Summary */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400" data-testid="live-sync-label">
            Turnover ·{' '}
            {lastLiveSyncAt
              ? `Synced ${new Date(lastLiveSyncAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`
              : `${securities.length} Tracked`}
          </div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {totalTurnoverMillion.toFixed(1)}M{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {shariahCount} Halal · {securities.filter((s) => s.assetType === 'etf').length} ETFs ·
            15m QSE public feed
          </div>
        </div>
      </div>
    </section>
  );
};

