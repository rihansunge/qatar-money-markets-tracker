import React, { useMemo, useState } from 'react';
import { ArrowRight, Bell, Briefcase, CalendarClock, Newspaper, ShieldCheck } from 'lucide-react';
import type {
  DividendEvent,
  MarketIndex,
  MarketSentimentSummary,
  NavSection,
  NewsItem,
  PortfolioAnalytics,
  QseSecurity,
  Timeframe,
} from '../types/market';
import { getDayChange, formatQarPrice } from '../utils/marketMath';
import { useLiveHistory } from '../utils/useLiveHistory';
import { HistoricalChart } from './HistoricalChart';

interface OverviewViewProps {
  indices: MarketIndex[];
  securities: QseSecurity[];
  dividends: DividendEvent[];
  news: NewsItem[];
  portfolio: PortfolioAnalytics;
  marketSentiment: MarketSentimentSummary;
  watchlistTickers: string[];
  onNavigate: (section: NavSection) => void;
  onSelectTicker: (ticker: string) => void;
  onOpenNewAlert: (ticker?: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  indices,
  securities,
  dividends,
  news,
  portfolio,
  marketSentiment,
  watchlistTickers,
  onNavigate,
  onSelectTicker,
  onOpenNewAlert,
}) => {
  const [chartTarget, setChartTarget] = useState<'QSI' | 'QERI' | string>('QSI');
  const [timeframe, setTimeframe] = useState<Timeframe>('3M');

  const qsi = indices[0];
  const qeri = indices[1];

  const chartMeta = useMemo(() => {
    if (chartTarget === 'QSI') {
      return {
        ticker: 'QSI',
        fallbackPrice: qsi.value,
        title: 'QE Index (QSI)',
        subtitle: 'Qatar Stock Exchange Main Benchmark',
        unitLabel: 'PTS',
      };
    }
    if (chartTarget === 'QERI') {
      return {
        ticker: 'QERI',
        fallbackPrice: qeri.value,
        title: 'QE Al Rayan Islamic Index (QERI)',
        subtitle: 'Shariah-Compliant Benchmark',
        unitLabel: 'PTS',
      };
    }
    const sec = securities.find((s) => s.ticker === chartTarget) ?? securities[0];
    return {
      ticker: sec.ticker,
      fallbackPrice: sec.price,
      title: `${sec.ticker} · ${sec.name}`,
      subtitle: `${sec.sector}${sec.shariah.isCompliant ? ' · Shariah Compliant' : ''}`,
      unitLabel: 'QAR',
    };
  }, [chartTarget, qsi.value, qeri.value, securities]);

  const { bars: liveChartBars } = useLiveHistory(
    chartMeta.ticker,
    timeframe,
    chartMeta.fallbackPrice,
    qsi.value,
  );

  const chartConfig = {
    title: chartMeta.title,
    subtitle: chartMeta.subtitle,
    bars: liveChartBars,
    unitLabel: chartMeta.unitLabel,
  };

  const sortedByMove = useMemo(() => {
    return [...securities].sort((a, b) => {
      const aPct = getDayChange(a.price, a.previousClose).changePct;
      const bPct = getDayChange(b.price, b.previousClose).changePct;
      return bPct - aPct;
    });
  }, [securities]);

  const topGainers = sortedByMove.slice(0, 4);
  const topActive = useMemo(
    () => [...securities].sort((a, b) => b.turnoverQar - a.turnoverQar).slice(0, 4),
    [securities],
  );

  const upcomingDividends = dividends
    .filter((d) => d.status !== 'Paid')
    .slice(0, 4);

  const latestNews = news.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Chart Selector Pills (Functional Segmented Buttons) + Main Chart + Personalized Summary */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setChartTarget('QSI')}
                className={`whitespace-nowrap shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  chartTarget === 'QSI'
                    ? 'bg-[#8A1538] text-white dark:bg-rose-700'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                QE Index (QSI)
              </button>
              <button
                type="button"
                onClick={() => setChartTarget('QERI')}
                className={`whitespace-nowrap shrink-0 rounded px-3 py-1 text-xs font-medium transition-colors ${
                  chartTarget === 'QERI'
                    ? 'bg-[#8A1538] text-white dark:bg-rose-700'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Al Rayan Islamic (QERI)
              </button>
              {watchlistTickers.slice(0, 4).map((ticker) => (
                <button
                  key={ticker}
                  type="button"
                  onClick={() => setChartTarget(ticker)}
                  className={`whitespace-nowrap shrink-0 rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                    chartTarget === ticker
                      ? 'bg-[#8A1538] text-white dark:bg-rose-700'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {ticker}
                </button>
              ))}
            </div>
          </div>

          <HistoricalChart
            title={chartConfig.title}
            subtitle={chartConfig.subtitle}
            bars={chartConfig.bars}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            unitLabel={chartConfig.unitLabel}
            height={285}
          />
        </div>

        {/* Right Column: Portfolio Snapshot + Market Sentiment Pulse */}
        <div className="flex flex-col gap-4 xl:col-span-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <Briefcase className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
                <span>Personalized Portfolio</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('portfolio')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
              >
                <span>Analytics</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {portfolio.totalValueQar.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">QAR</span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
              <span
                className={
                  portfolio.dayChangeQar >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }
              >
                Today {portfolio.dayChangeQar >= 0 ? '+' : ''}
                {portfolio.dayChangeQar.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                ({portfolio.dayChangePct >= 0 ? '+' : ''}
                {portfolio.dayChangePct.toFixed(2)}%)
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span
                className={
                  portfolio.unrealizedPnlQar >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }
              >
                Total {portfolio.unrealizedPnlPct >= 0 ? '+' : ''}
                {portfolio.unrealizedPnlPct.toFixed(2)}%
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Shariah Compliant</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {portfolio.shariahPct.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Est. Annual Div</div>
                <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {portfolio.projectedAnnualDividendQar.toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })}{' '}
                  QAR ({portfolio.portfolioYieldPct.toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Investor Sentiment Summary Card */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                QSE Sentiment Pulse
              </span>
              <button
                type="button"
                onClick={() => onNavigate('sentiment')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
              >
                <span>Sentiment Tools</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {marketSentiment.compositeScore}
                <span className="text-sm font-normal text-slate-400">/100</span>
              </div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {marketSentiment.regime}
              </div>
            </div>

            {/* Clean linear meter */}
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all dark:bg-emerald-500"
                style={{ width: `${marketSentiment.compositeScore}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Breadth</div>
                <div className="mt-0.5 font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {marketSentiment.advancers}↑ / {marketSentiment.decliners}↓
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Inst. Net</div>
                <div
                  className={`mt-0.5 font-mono font-medium tabular-nums ${
                    marketSentiment.netInstitutionalFlowMillionQar >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {marketSentiment.netInstitutionalFlowMillionQar >= 0 ? '+' : ''}
                  {marketSentiment.netInstitutionalFlowMillionQar}M
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">Foreign Net</div>
                <div
                  className={`mt-0.5 font-mono font-medium tabular-nums ${
                    marketSentiment.netForeignFlowMillionQar >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {marketSentiment.netForeignFlowMillionQar >= 0 ? '+' : ''}
                  {marketSentiment.netForeignFlowMillionQar}M
                </div>
              </div>
            </div>
          </div>

          {/* Halal ETF Spotlight */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                <span>Halal ETF Spotlight</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('shariah-etf')}
                className="text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
              >
                Compare ETFs
              </button>
            </div>
            {(() => {
              const qatr = securities.find((s) => s.ticker === 'QATR');
              if (!qatr) return null;
              const { changePct } = getDayChange(qatr.price, qatr.previousClose);
              return (
                <div className="mt-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      QATR · Al Rayan Qatar ETF
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Shariah Compliant · Yield {qatr.dividendYieldPct.toFixed(2)}% · TER 0.50%
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatQarPrice(qatr.price)} QAR
                    </div>
                    <div
                      className={`text-xs ${
                        changePct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {changePct >= 0 ? '+' : ''}
                      {changePct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Row 2: Top Gainers & Turnover Leaders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Gainers */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daily Top Movers
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('market')}
              className="text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              View All {securities.length}
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {topGainers.map((sec) => {
              const { change, changePct } = getDayChange(sec.price, sec.previousClose);
              return (
                <div
                  key={sec.ticker}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTicker(sec.ticker);
                      onNavigate('market');
                    }}
                    className="min-w-0 text-left hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {sec.ticker}
                      </span>
                      <span className="truncate text-slate-600 dark:text-slate-400">
                        {sec.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {sec.sector} · {sec.shariah.isCompliant ? 'Shariah Compliant' : 'Conventional'}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right font-mono tabular-nums">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {formatQarPrice(sec.price)} QAR
                      </div>
                      <div
                        className={`text-xs ${
                          changePct >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {change >= 0 ? '+' : ''}
                        {formatQarPrice(change)} ({changePct >= 0 ? '+' : ''}
                        {changePct.toFixed(2)}%)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenNewAlert(sec.ticker)}
                      aria-label={`Set price alert for ${sec.ticker}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Most Active by Turnover */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Turnover Leaders (QAR)
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Session Liquidity</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {topActive.map((sec) => {
              const { changePct } = getDayChange(sec.price, sec.previousClose);
              return (
                <div
                  key={sec.ticker}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTicker(sec.ticker);
                      onNavigate('market');
                    }}
                    className="min-w-0 text-left hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {sec.ticker}
                      </span>
                      <span className="truncate text-slate-600 dark:text-slate-400">
                        {sec.name}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      Vol {(sec.volume / 1_000_000).toFixed(2)}M shares · Yield{' '}
                      {sec.dividendYieldPct.toFixed(2)}%
                    </div>
                  </button>
                  <div className="shrink-0 text-right font-mono tabular-nums">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {(sec.turnoverQar / 1_000_000).toFixed(2)}M QAR
                    </div>
                    <div
                      className={`text-xs ${
                        changePct >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {formatQarPrice(sec.price)} QAR ({changePct >= 0 ? '+' : ''}
                      {changePct.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Upcoming Dividends Preview + Daily Updates & News */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Upcoming QSE Dividends
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dividends')}
              className="text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              Full Calendar
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingDividends.map((div) => (
              <div
                key={div.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {div.ticker}
                    </span>
                    <span className="truncate text-slate-600 dark:text-slate-400">
                      {div.companyName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Ex-Date {div.exDividendDate} · Pay {div.paymentDate}
                    {div.isShariah ? ' · Shariah' : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {div.dividendPerShareQar.toFixed(3)} QAR
                  </div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    {div.yieldAtAnnouncementPct.toFixed(2)}% yield
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Daily Updates & Stock News
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('news')}
              className="text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
            >
              All Briefs
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {latestNews.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate('news')}
                className="block w-full py-2.5 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {item.category} · {item.publishedAt} · {item.relatedTickers.join(', ')}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
