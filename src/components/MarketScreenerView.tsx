import React, { useMemo, useState } from 'react';
import { Bell, Plus, Star } from 'lucide-react';
import type { QseSecurity, Sector, Timeframe } from '../types/market';
import { formatQarPrice, getDayChange } from '../utils/marketMath';
import { useLiveHistory } from '../utils/useLiveHistory';
import { HistoricalChart } from './HistoricalChart';
import { Sparkline } from './Sparkline';

interface MarketScreenerViewProps {
  securities: QseSecurity[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  watchlistTickers: string[];
  onToggleWatchlist: (ticker: string) => void;
  searchQuery: string;
  onOpenNewAlert: (ticker: string) => void;
  onOpenAddHolding: (ticker: string) => void;
  benchmarkValue: number;
  liveFeedEnabled: boolean;
  lastLiveSyncAt: string | null;
  priceFlashes?: Record<string, 'up' | 'down'>;
}

type FilterMode = 'all' | 'shariah' | 'etf' | 'halal-etf' | 'conventional';
type SortField = 'ticker' | 'price' | 'changePct' | 'turnoverQar' | 'dividendYieldPct' | 'marketCap';

export const MarketScreenerView: React.FC<MarketScreenerViewProps> = ({
  securities,
  selectedTicker,
  onSelectTicker,
  watchlistTickers,
  onToggleWatchlist,
  searchQuery,
  onOpenNewAlert,
  onOpenAddHolding,
  benchmarkValue,
  liveFeedEnabled,
  lastLiveSyncAt,
  priceFlashes = {},
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sectorFilter, setSectorFilter] = useState<'ALL' | Sector>('ALL');
  const [sortField, setSortField] = useState<SortField>('turnoverQar');
  const [sortAsc, setSortAsc] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('3M');

  const sectors = useMemo(
    () => Array.from(new Set(securities.map((s) => s.sector))),
    [securities],
  );

  const filteredSecurities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return securities
      .filter((s) => {
        if (filterMode === 'shariah' && !s.shariah.isCompliant) return false;
        if (filterMode === 'etf' && s.assetType !== 'etf') return false;
        if (filterMode === 'halal-etf' && !(s.assetType === 'etf' && s.shariah.isCompliant))
          return false;
        if (filterMode === 'conventional' && s.shariah.isCompliant) return false;
        if (sectorFilter !== 'ALL' && s.sector !== sectorFilter) return false;
        if (q) {
          const hay = `${s.ticker} ${s.name} ${s.sector} ${s.arabicName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
        else if (sortField === 'price') cmp = a.price - b.price;
        else if (sortField === 'changePct')
          cmp =
            getDayChange(a.price, a.previousClose).changePct -
            getDayChange(b.price, b.previousClose).changePct;
        else if (sortField === 'turnoverQar') cmp = a.turnoverQar - b.turnoverQar;
        else if (sortField === 'dividendYieldPct') cmp = a.dividendYieldPct - b.dividendYieldPct;
        else if (sortField === 'marketCap') cmp = a.marketCapMillionQar - b.marketCapMillionQar;
        return sortAsc ? cmp : -cmp;
      });
  }, [securities, filterMode, sectorFilter, searchQuery, sortField, sortAsc]);

  const activeSecurity =
    securities.find((s) => s.ticker === selectedTicker) ?? filteredSecurities[0] ?? securities[0];

  const { bars } = useLiveHistory(
    activeSecurity.ticker,
    timeframe,
    activeSecurity.price,
    benchmarkValue,
    {
      liveFeedEnabled,
      liveDayVolume: activeSecurity.volume,
      precision: 3,
    },
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const range52Pct =
    activeSecurity.week52High > activeSecurity.week52Low
      ? Math.max(
          0,
          Math.min(
            100,
            ((activeSecurity.price - activeSecurity.week52Low) /
              (activeSecurity.week52High - activeSecurity.week52Low)) *
              100,
          ),
        )
      : 50;

  return (
    <div className="space-y-6">
      {/* Selected Security Chart + Fundamentals Panel */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <HistoricalChart
            title={`${activeSecurity.ticker} · ${activeSecurity.name}`}
            subtitle={`${activeSecurity.sector} · ${
              activeSecurity.shariah.isCompliant ? 'Shariah Compliant' : 'Conventional'
            }${activeSecurity.assetType === 'etf' ? ' · ETF' : ''}`}
            bars={bars}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            unitLabel="QAR"
            height={280}
            isLive={liveFeedEnabled}
            lastUpdatedAt={lastLiveSyncAt}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 xl:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-50">
                  {activeSecurity.ticker}
                </h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {activeSecurity.arabicName}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{activeSecurity.name}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggleWatchlist(activeSecurity.ticker)}
              aria-label={
                watchlistTickers.includes(activeSecurity.ticker)
                  ? `Remove ${activeSecurity.ticker} from watchlist`
                  : `Add ${activeSecurity.ticker} to watchlist`
              }
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Star
                className={`h-4 w-4 ${
                  watchlistTickers.includes(activeSecurity.ticker)
                    ? 'fill-amber-500 text-amber-500'
                    : ''
                }`}
              />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Day High / Low</div>
              <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {formatQarPrice(activeSecurity.dayHigh)} / {formatQarPrice(activeSecurity.dayLow)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Market Cap</div>
              <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {(activeSecurity.marketCapMillionQar / 1000).toFixed(2)}B QAR
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">P/E · P/B Ratio</div>
              <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {activeSecurity.peRatio?.toFixed(1) ?? '—'}x ·{' '}
                {activeSecurity.pbRatio?.toFixed(2) ?? '—'}x
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Dividend Yield</div>
              <div className="mt-0.5 font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                {activeSecurity.dividendYieldPct.toFixed(2)}% ({activeSecurity.lastDividendQar.toFixed(2)}{' '}
                QAR)
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Shariah Status</div>
              <div
                className={`mt-0.5 font-medium ${
                  activeSecurity.shariah.isCompliant
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {activeSecurity.shariah.isCompliant ? 'Shariah Compliant' : 'Conventional'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Inst. Net Flow</div>
              <div
                className={`mt-0.5 font-mono font-medium tabular-nums ${
                  activeSecurity.institutionalFlowMillionQar >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {activeSecurity.institutionalFlowMillionQar >= 0 ? '+' : ''}
                {activeSecurity.institutionalFlowMillionQar.toFixed(1)}M QAR
              </div>
            </div>
          </div>

          {/* 52-Week Range */}
          <div className="mt-4 border-t border-slate-100 pt-3.5 dark:border-slate-800">
            <div className="flex justify-between font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              <span>52W Low {formatQarPrice(activeSecurity.week52Low)}</span>
              <span>52W High {formatQarPrice(activeSecurity.week52High)}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[#8A1538] dark:bg-rose-500"
                style={{ width: `${range52Pct}%` }}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenAddHolding(activeSecurity.ticker)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#8A1538] px-3 py-2 text-xs font-semibold text-white hover:bg-[#70102D] whitespace-nowrap dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add to Portfolio</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenNewAlert(activeSecurity.ticker)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Set Alert</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Market Table */}
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div
            className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Security compliance and asset filter"
          >
            {(
              [
                { id: 'all', label: 'All Listed' },
                { id: 'shariah', label: 'Shariah Compliant' },
                { id: 'etf', label: 'ETFs' },
                { id: 'halal-etf', label: 'Halal ETFs' },
                { id: 'conventional', label: 'Conventional' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`whitespace-nowrap shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterMode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="sector-filter" className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Sector
            </label>
            <select
              id="sector-filter"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value as 'ALL' | Sector)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">All Sectors</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {filteredSecurities.length} items
            </span>
          </div>
        </div>

        {filteredSecurities.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No QSE stocks or ETFs match the current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3 pl-4 pr-2">Watch</th>
                  <th className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort('ticker')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      Ticker / Company
                    </button>
                  </th>
                  <th className="px-3 py-3">Classification</th>
                  <th className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('price')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      Price (QAR)
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('changePct')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      Change
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('turnoverQar')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      Turnover
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('dividendYieldPct')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      Div Yield
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('marketCap')}
                      className="hover:text-slate-900 dark:hover:text-white"
                    >
                      MCap
                    </button>
                  </th>
                  <th className="py-3 pr-4 pl-3 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSecurities.map((sec) => {
                  const { change, changePct } = getDayChange(sec.price, sec.previousClose);
                  const positive = change >= 0;
                  const isWatched = watchlistTickers.includes(sec.ticker);
                  const isSelected = activeSecurity.ticker === sec.ticker;
                  return (
                    <tr
                      key={sec.ticker}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <button
                          type="button"
                          onClick={() => onToggleWatchlist(sec.ticker)}
                          aria-label={
                            isWatched
                              ? `Remove ${sec.ticker} from watchlist`
                              : `Add ${sec.ticker} to watchlist`
                          }
                          className="rounded p-1 text-slate-400 hover:text-amber-500"
                        >
                          <Star
                            className={`h-4 w-4 ${isWatched ? 'fill-amber-500 text-amber-500' : ''}`}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => onSelectTicker(sec.ticker)}
                          className="text-left focus-visible:outline-2 focus-visible:outline-rose-800"
                        >
                          <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {sec.ticker}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{sec.name}</div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="text-slate-700 dark:text-slate-300">{sec.sector}</div>
                        <div
                          className={
                            sec.shariah.isCompliant
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {sec.shariah.isCompliant ? 'Shariah Compliant' : 'Conventional'}
                          {sec.assetType === 'etf' ? ' · ETF' : ''}
                        </div>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-medium tabular-nums transition-colors duration-300 ${
                          priceFlashes[sec.ticker] === 'up'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : priceFlashes[sec.ticker] === 'down'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {formatQarPrice(sec.price)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono text-xs font-medium tabular-nums ${
                          positive
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {positive ? '+' : ''}
                        {formatQarPrice(change)} ({positive ? '+' : ''}
                        {changePct.toFixed(2)}%)
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {(sec.turnoverQar / 1_000_000).toFixed(2)}M
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {sec.dividendYieldPct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {sec.marketCapMillionQar >= 1000
                          ? `${(sec.marketCapMillionQar / 1000).toFixed(1)}B`
                          : `${sec.marketCapMillionQar}M`}
                      </td>
                      <td className="py-2.5 pr-4 pl-3 text-right">
                        <div className="inline-flex justify-end">
                          <Sparkline data={sec.sparkline} positive={positive} width={68} height={22} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
