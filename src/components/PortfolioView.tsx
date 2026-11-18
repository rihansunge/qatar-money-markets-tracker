import React, { useMemo, useState } from 'react';
import { Calculator, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import type { OhlcBar, PortfolioAnalytics, Timeframe } from '../types/market';
import { generateHistoricalSeries } from '../data/qseData';
import { formatQarPrice, roundTo } from '../utils/marketMath';
import { HistoricalChart } from './HistoricalChart';

interface PortfolioViewProps {
  analytics: PortfolioAnalytics;
  benchmarkValue: number;
  onOpenAddPosition: () => void;
  onOpenImportModal: () => void;
  onRemoveHolding: (holdingId: string) => void;
  onClearPortfolio: () => void;
  onResetPortfolio: () => void;
  onOpenZakat: () => void;
  onSelectTicker: (ticker: string) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  analytics,
  benchmarkValue,
  onOpenAddPosition,
  onOpenImportModal,
  onRemoveHolding,
  onClearPortfolio,
  onResetPortfolio,
  onOpenZakat,
  onSelectTicker,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('3M');

  const portfolioBars = useMemo<OhlcBar[]>(() => {
    if (analytics.holdings.length === 0 || analytics.totalValueQar <= 0) return [];
    const seriesByTicker = analytics.holdings.map((h) => ({
      shares: h.holding.shares,
      bars: generateHistoricalSeries(h.holding.ticker, h.security.price, timeframe, benchmarkValue),
    }));

    const length = seriesByTicker[0].bars.length;
    const aggregated: OhlcBar[] = [];
    for (let i = 0; i < length; i++) {
      let open = 0;
      let close = 0;
      let high = 0;
      let low = 0;
      let volume = 0;
      for (const s of seriesByTicker) {
        const bar = s.bars[i];
        open += bar.open * s.shares;
        close += bar.close * s.shares;
        high += bar.high * s.shares;
        low += bar.low * s.shares;
        volume += bar.volume;
      }
      aggregated.push({
        date: seriesByTicker[0].bars[i].date,
        open: roundTo(open, 2),
        high: roundTo(high, 2),
        low: roundTo(low, 2),
        close: roundTo(close, 2),
        volume: Math.round(volume / seriesByTicker.length),
        benchmarkClose: seriesByTicker[0].bars[i].benchmarkClose,
      });
    }
    return aggregated;
  }, [analytics.holdings, analytics.totalValueQar, timeframe, benchmarkValue]);

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Portfolio Performance & Risk Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time QSE valuation, Shariah compliance mix, sector concentration, and dividend
            forecast
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenZakat}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50/60 whitespace-nowrap dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <Calculator className="h-3.5 w-3.5" />
            <span>Zakat & Purification</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportModal}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import CSV</span>
          </button>
          {analytics.holdings.length > 0 && (
            <button
              type="button"
              onClick={onClearPortfolio}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50/60 whitespace-nowrap dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All</span>
            </button>
          )}
          <button
            type="button"
            onClick={onResetPortfolio}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Starter</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddPosition}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#8A1538] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#70102D] whitespace-nowrap dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Position</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Portfolio Value</div>
          <div
            className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50"
            data-testid="portfolio-total-value"
          >
            {analytics.totalValueQar.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Cost Basis {analytics.totalCostQar.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
            QAR
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Unrealized P&L</div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              analytics.unrealizedPnlQar >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {analytics.unrealizedPnlQar >= 0 ? '+' : ''}
            {analytics.unrealizedPnlQar.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            QAR
          </div>
          <div
            className={`mt-0.5 font-mono text-xs tabular-nums ${
              analytics.unrealizedPnlPct >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {analytics.unrealizedPnlPct >= 0 ? '+' : ''}
            {analytics.unrealizedPnlPct.toFixed(2)}% total return · Today{' '}
            {analytics.dayChangePct >= 0 ? '+' : ''}
            {analytics.dayChangePct.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Projected Annual Dividends
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {analytics.projectedAnnualDividendQar.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-emerald-700 tabular-nums dark:text-emerald-400">
            {analytics.portfolioYieldPct.toFixed(2)}% forward portfolio yield
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Shariah Share & Portfolio Beta
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {analytics.shariahPct.toFixed(1)}%{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Halal</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Beta {analytics.weightedBeta.toFixed(2)} · ETFs {analytics.etfPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {analytics.holdings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Your QSE portfolio is currently empty
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add your first Qatar Stock Exchange equity or Halal ETF position to track real-time P&L,
            dividend income, and Shariah compliance allocation.
          </p>
          <button
            type="button"
            onClick={onOpenAddPosition}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#8A1538] px-4 py-2 text-xs font-semibold text-white hover:bg-[#70102D] dark:bg-rose-700"
          >
            <Plus className="h-4 w-4" />
            <span>Log First Position</span>
          </button>
        </div>
      ) : (
        <>
          {/* Historical Portfolio Growth + Allocation Breakdown */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <HistoricalChart
                title="Portfolio Historical Valuation"
                subtitle="Weighted holdings performance vs QE Index (QSI)"
                bars={portfolioBars}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                unitLabel="QAR"
                height={275}
              />
            </div>

            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 xl:col-span-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Shariah vs Conventional Split
                </h3>
                <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="bg-emerald-600"
                    style={{ width: `${analytics.shariahPct}%` }}
                    title={`Shariah Compliant ${analytics.shariahPct.toFixed(1)}%`}
                  />
                  <div
                    className="bg-slate-400 dark:bg-slate-600"
                    style={{ width: `${analytics.conventionalPct}%` }}
                    title={`Conventional ${analytics.conventionalPct.toFixed(1)}%`}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-xs tabular-nums">
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Shariah {analytics.shariahPct.toFixed(1)}% (
                    {analytics.shariahValueQar.toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}{' '}
                    QAR)
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Conv. {analytics.conventionalPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="mb-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Sector Allocation
                </h3>
                <div className="space-y-2.5">
                  {analytics.sectorAllocations.map((sec) => (
                    <div key={sec.sector} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-300">{sec.sector}</span>
                        <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {sec.weightPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-[#8A1538] dark:bg-rose-500"
                          style={{ width: `${sec.weightPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {analytics.bestPerformer && analytics.worstPerformer && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Top Gainer</div>
                    <div className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      {analytics.bestPerformer.security.ticker} +
                      {analytics.bestPerformer.unrealizedPnlPct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Laggard</div>
                    <div
                      className={`mt-0.5 font-mono font-semibold ${
                        analytics.worstPerformer.unrealizedPnlPct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {analytics.worstPerformer.security.ticker}{' '}
                      {analytics.worstPerformer.unrealizedPnlPct >= 0 ? '+' : ''}
                      {analytics.worstPerformer.unrealizedPnlPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Holdings Table */}
          <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Holdings Breakdown ({analytics.holdings.length} positions)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm" data-testid="portfolio-holdings-table">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-3 pl-5 pr-3">Ticker</th>
                    <th className="px-3 py-3 text-right">Shares</th>
                    <th className="px-3 py-3 text-right">Avg Cost</th>
                    <th className="px-3 py-3 text-right">Live Price</th>
                    <th className="px-3 py-3 text-right">Market Value</th>
                    <th className="px-3 py-3 text-right">Unrealized P&L</th>
                    <th className="px-3 py-3 text-right">Weight</th>
                    <th className="px-3 py-3 text-right">Est. Annual Div</th>
                    <th className="py-3 pr-5 pl-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analytics.holdings.map((item) => {
                    const gainPos = item.unrealizedPnlQar >= 0;
                    return (
                      <tr
                        key={item.holding.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-3 pl-5 pr-3">
                          <button
                            type="button"
                            onClick={() => onSelectTicker(item.security.ticker)}
                            className="text-left hover:underline"
                          >
                            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {item.security.ticker}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {item.security.name}
                              {item.security.shariah.isCompliant ? ' · Shariah' : ''}
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                          {item.holding.shares.toLocaleString('en-US')}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {formatQarPrice(item.holding.avgCostQar)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {formatQarPrice(item.security.price)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {item.marketValueQar.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono text-xs font-medium tabular-nums ${
                            gainPos
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {gainPos ? '+' : ''}
                          {item.unrealizedPnlQar.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          ({gainPos ? '+' : ''}
                          {item.unrealizedPnlPct.toFixed(2)}%)
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                          {item.weightPct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                          {item.projectedAnnualDividendQar.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          QAR
                        </td>
                        <td className="py-3 pr-5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => onRemoveHolding(item.holding.id)}
                            aria-label={`Remove ${item.security.ticker} position`}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
