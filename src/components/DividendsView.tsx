import React, { useMemo, useState } from 'react';
import type { DividendEvent, PortfolioAnalytics } from '../types/market';
import { AdSlot } from './AdSlot';

interface DividendsViewProps {
  dividends: DividendEvent[];
  portfolio: PortfolioAnalytics;
  searchQuery: string;
  onSelectTicker: (ticker: string) => void;
  onOpenMonetization?: () => void;
}

type DivFilter = 'all' | 'upcoming' | 'shariah' | 'etf' | 'paid';

export const DividendsView: React.FC<DividendsViewProps> = ({
  dividends,
  portfolio,
  searchQuery,
  onSelectTicker,
  onOpenMonetization,
}) => {
  const [filter, setFilter] = useState<DivFilter>('all');

  const holdingSharesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of portfolio.holdings) {
      map.set(h.holding.ticker, (map.get(h.holding.ticker) ?? 0) + h.holding.shares);
    }
    return map;
  }, [portfolio.holdings]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return dividends.filter((d) => {
      if (filter === 'upcoming' && d.status === 'Paid') return false;
      if (filter === 'paid' && d.status !== 'Paid') return false;
      if (filter === 'shariah' && !d.isShariah) return false;
      if (filter === 'etf' && !d.isEtf) return false;
      if (q) {
        const hay = `${d.ticker} ${d.companyName} ${d.sector}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dividends, filter, searchQuery]);

  const upcomingEvents = dividends.filter((d) => d.status !== 'Paid');
  const nextEvent = upcomingEvents[0];
  const avgYield =
    upcomingEvents.length > 0
      ? upcomingEvents.reduce((acc, d) => acc + d.yieldAtAnnouncementPct, 0) / upcomingEvents.length
      : 0;
  const upcomingPortfolioCash = upcomingEvents.reduce((acc, d) => {
    const shares = holdingSharesMap.get(d.ticker) ?? 0;
    return acc + shares * d.dividendPerShareQar;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Upcoming Portfolio Cash Payout
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {upcomingPortfolioCash.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Across held QSE positions
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Projected Annual Portfolio Income
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {portfolio.projectedAnnualDividendQar.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
            Portfolio Yield {portfolio.portfolioYieldPct.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Avg. Upcoming QSE Yield</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {avgYield.toFixed(2)}%
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {upcomingEvents.length} scheduled distributions
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Next Ex-Dividend Date</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {nextEvent ? `${nextEvent.ticker} · ${nextEvent.exDividendDate}` : 'None'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {nextEvent
              ? `${nextEvent.dividendPerShareQar.toFixed(3)} QAR/share (${nextEvent.yieldAtAnnouncementPct.toFixed(2)}%)`
              : 'All distributions settled'}
          </div>
        </div>
      </div>

      {/* Calendar Table */}
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div
            className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Filter dividend calendar"
          >
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'upcoming', label: 'Upcoming & Approved' },
                { id: 'shariah', label: 'Shariah Compliant' },
                { id: 'etf', label: 'ETFs' },
                { id: 'paid', label: 'Paid' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`whitespace-nowrap shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} announcements
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pl-5 pr-3">Security</th>
                <th className="px-3 py-3">Status & Type</th>
                <th className="px-3 py-3 text-right">DPS (QAR)</th>
                <th className="px-3 py-3 text-right">Yield</th>
                <th className="px-3 py-3 text-right">Payout Ratio</th>
                <th className="px-3 py-3">Ex-Div Date</th>
                <th className="px-3 py-3">Payment Date</th>
                <th className="py-3 pr-5 pl-3 text-right">Your Est. Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((div) => {
                const heldShares = holdingSharesMap.get(div.ticker) ?? 0;
                const estCash = heldShares * div.dividendPerShareQar;
                return (
                  <tr key={div.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 pl-5 pr-3">
                      <button
                        type="button"
                        onClick={() => onSelectTicker(div.ticker)}
                        className="text-left hover:underline"
                      >
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {div.ticker}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {div.companyName} · {div.fiscalYear}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div
                        className={`font-medium ${
                          div.status === 'Ex-Date Soon'
                            ? 'text-amber-700 dark:text-amber-400'
                            : div.status === 'Paid'
                              ? 'text-slate-500 dark:text-slate-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {div.status}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {div.frequency}
                        {div.isShariah ? ' · Shariah' : ''}
                        {div.isEtf ? ' · ETF' : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {div.dividendPerShareQar.toFixed(3)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {div.yieldAtAnnouncementPct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {div.payoutRatioPct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                      {div.exDividendDate}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {div.paymentDate}
                    </td>
                    <td className="py-3 pr-5 pl-3 text-right font-mono text-xs tabular-nums">
                      {heldShares > 0 ? (
                        <div>
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {estCash.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            QAR
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {heldShares.toLocaleString()} sh
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AdSlot slotId="dohaborsa-dividends-leaderboard" onConfigureClick={onOpenMonetization} />
    </div>
  );
};
