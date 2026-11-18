import React, { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { PortfolioHolding, QseSecurity } from '../types/market';
import {
  calculateShariahZakatAndPurification,
  formatQarPrice,
  getDayChange,
  type ZakatMethod,
} from '../utils/marketMath';
import { SeoFaqSection } from './SeoFaqSection';

interface EtfShariahViewProps {
  securities: QseSecurity[];
  holdings: PortfolioHolding[];
  onSelectTicker: (ticker: string) => void;
  onInspectInMarket: (ticker: string) => void;
}

export const EtfShariahView: React.FC<EtfShariahViewProps> = ({
  securities,
  holdings,
  onSelectTicker,
  onInspectInMarket,
}) => {
  const [complianceTab, setComplianceTab] = useState<'all' | 'compliant' | 'non-compliant'>('all');
  const [zakatMethod, setZakatMethod] = useState<ZakatMethod>('long_term');
  const [cashReserveInput, setCashReserveInput] = useState<string>('0');

  const parsedCashReserve = Math.max(0, Number(cashReserveInput) || 0);
  const zakatSummary = useMemo(
    () =>
      calculateShariahZakatAndPurification(
        holdings,
        securities,
        zakatMethod,
        parsedCashReserve,
      ),
    [holdings, securities, zakatMethod, parsedCashReserve],
  );

  const etfs = securities.filter((s) => s.assetType === 'etf' && s.etf);
  const shariahStocks = securities.filter((s) => s.shariah.isCompliant);
  const filteredAuditList = securities.filter((s) => {
    if (complianceTab === 'compliant') return s.shariah.isCompliant;
    if (complianceTab === 'non-compliant') return !s.shariah.isCompliant;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ETF & Halal ETF Comparison Section */}
      <section aria-label="QSE Exchange Traded Funds Comparison">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              QSE Exchange-Traded Funds (Halal & Conventional)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Side-by-side comparison of QATR (Al Rayan Shariah-Compliant Halal ETF) and QETF (QE
              Index ETF)
            </p>
          </div>
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {shariahStocks.length} of {securities.length} tracked QSE securities are Shariah-compliant
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {etfs.map((etf) => {
            const details = etf.etf!;
            const { change, changePct } = getDayChange(etf.price, etf.previousClose);
            const premiumPct =
              details.navQar > 0 ? ((etf.price - details.navQar) / details.navQar) * 100 : 0;

            return (
              <div
                key={etf.ticker}
                className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      {details.isHalal ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Halal ETF · AAOIFI Shariah Compliant</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">
                          Conventional Benchmark ETF
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                      <span className="font-mono">{etf.ticker}</span> · {etf.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Managed by {details.fundManager} · Tracks {details.trackingIndex}
                    </p>
                  </div>

                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                      {formatQarPrice(etf.price)} QAR
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        change >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {change >= 0 ? '+' : ''}
                      {formatQarPrice(change)} ({changePct >= 0 ? '+' : ''}
                      {changePct.toFixed(2)}%)
                    </div>
                  </div>
                </div>

                {/* ETF Metrics */}
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">NAV / Premium</div>
                    <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {formatQarPrice(details.navQar)} ({premiumPct >= 0 ? '+' : ''}
                      {premiumPct.toFixed(2)}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">AUM</div>
                    <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {details.aumMillionQar.toFixed(1)}M QAR
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Expense Ratio</div>
                    <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {details.expenseRatioPct.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Div Yield</div>
                    <div className="mt-0.5 font-mono font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {etf.dividendYieldPct.toFixed(2)}% ({details.distributionFrequency})
                    </div>
                  </div>
                </div>

                {/* Top Constituents */}
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Top Constituent Weights
                  </div>
                  <div className="space-y-2">
                    {details.topHoldings.map((h) => (
                      <div key={h.ticker} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectTicker(h.ticker);
                              onInspectInMarket(h.ticker);
                            }}
                            className="font-medium text-slate-700 hover:text-[#8A1538] hover:underline dark:text-slate-300 dark:hover:text-rose-400"
                          >
                            <span className="font-mono font-semibold">{h.ticker}</span> · {h.name}
                          </button>
                          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                            {h.weightPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              details.isHalal ? 'bg-emerald-600' : 'bg-slate-600 dark:bg-slate-400'
                            }`}
                            style={{ width: `${Math.min(100, h.weightPct * 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTicker(etf.ticker);
                      onInspectInMarket(etf.ticker);
                    }}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Inspect {etf.ticker} Chart & Fundamentals
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Shariah Compliance Screening Matrix */}
      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Shariah Screening Audit (AAOIFI / QE Al Rayan Methodology)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Criteria: Permissible core activity · Conventional Debt / Market Cap ≤ 33% ·
              Non-Compliant Income ≤ 5%
            </p>
          </div>

          <div
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Filter Shariah audit table"
          >
            {(
              [
                { id: 'all', label: 'All Securities' },
                { id: 'compliant', label: 'Shariah Compliant' },
                { id: 'non-compliant', label: 'Non-Compliant' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setComplianceTab(tab.id)}
                className={`whitespace-nowrap shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  complianceTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pl-5 pr-3">Ticker / Security</th>
                <th className="px-3 py-3">Compliance Verdict</th>
                <th className="px-3 py-3">Business Activity</th>
                <th className="px-3 py-3 text-right">Debt / MCap (≤33%)</th>
                <th className="px-3 py-3 text-right">Non-Halal Rev (≤5%)</th>
                <th className="px-3 py-3 text-right">Liquid Assets %</th>
                <th className="py-3 pr-5 pl-3 text-right">Last Reviewed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAuditList.map((sec) => {
                const { shariah } = sec;
                return (
                  <tr key={sec.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 pl-5 pr-3">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTicker(sec.ticker);
                          onInspectInMarket(sec.ticker);
                        }}
                        className="text-left hover:underline"
                      >
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {sec.ticker}
                        </span>
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          {sec.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium">
                      {shariah.isCompliant ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Compliant</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>Non-Compliant</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                      {shariah.businessActivityStatus}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${
                        shariah.debtToMarketCapPct <= 33
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {shariah.debtToMarketCapPct.toFixed(1)}%
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${
                        shariah.nonCompliantIncomePct <= 5
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {shariah.nonCompliantIncomePct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {shariah.liquidAssetsToMarketCapPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-5 pl-3 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {shariah.lastReviewed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Zakat & Shariah Dividend Purification Calculator */}
      <section
        id="zakat-calculator"
        className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Calculator className="h-4 w-4" />
              <span>Halal Investor Utility</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Portfolio Zakat & Dividend Purification Calculator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Estimates annual 2.5% Zakat on Halal holdings plus per-stock charitable purification on
              permissible dividends
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
              role="group"
              aria-label="Zakat calculation methodology"
            >
              <button
                type="button"
                onClick={() => setZakatMethod('long_term')}
                className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  zakatMethod === 'long_term'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Long-Term Hold (25% Proxy)
              </button>
              <button
                type="button"
                onClick={() => setZakatMethod('trading')}
                className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  zakatMethod === 'trading'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Active Trading (100%)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="zakat-cash-input"
                className="text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Broker Cash (QAR)
              </label>
              <input
                id="zakat-cash-input"
                type="number"
                min="0"
                step="100"
                value={cashReserveInput}
                onChange={(e) => setCashReserveInput(e.target.value)}
                className="w-28 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Shariah Equity Value (+ Cash)
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {(zakatSummary.shariahCompliantValueQar + parsedCashReserve).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              QAR
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
              Zakatable Base:{' '}
              {zakatSummary.zakatableBaseQar.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              QAR
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Estimated Annual Zakat (2.5%)
            </div>
            <div
              className="mt-1 font-mono text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
              data-testid="zakat-estimated-total"
            >
              {zakatSummary.estimatedZakatQar.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              QAR
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {zakatMethod === 'long_term'
                ? 'AAOIFI 25% liquid-asset proxy on long-term shares'
                : 'Full market value for active trading positions'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Annual Dividend Purification
            </div>
            <div
              className="mt-1 font-mono text-xl font-semibold tabular-nums text-[#8A1538] dark:text-rose-400"
              data-testid="purification-estimated-total"
            >
              {zakatSummary.totalPurificationQar.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              QAR
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Donate to charity based on each stock&apos;s non-Halal income %
            </div>
          </div>
        </div>
      </section>

      <SeoFaqSection
        section="shariah-etf"
        heading="QSE Halal ETFs, Shariah Stocks & Zakat FAQ (EN / العربية)"
      />
    </div>
  );
};
