import React, { useMemo } from 'react';
import { ThumbsDown, ThumbsUp, Minus } from 'lucide-react';
import type {
  InvestorFlowGroup,
  MarketSentimentSummary,
  QseSecurity,
  SentimentVoteState,
} from '../types/market';
import { computeStockSentiment, formatQarPrice } from '../utils/marketMath';
import { useLiveHistory } from '../utils/useLiveHistory';

interface SentimentViewProps {
  securities: QseSecurity[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  marketSentiment: MarketSentimentSummary;
  investorFlows: InvestorFlowGroup[];
  sentimentVotes: Record<string, SentimentVoteState>;
  onVoteSentiment: (ticker: string, vote: 'bullish' | 'neutral' | 'bearish') => void;
}

export const SentimentView: React.FC<SentimentViewProps> = ({
  securities,
  selectedTicker,
  onSelectTicker,
  marketSentiment,
  investorFlows,
  sentimentVotes,
  onVoteSentiment,
}) => {
  const activeSecurity =
    securities.find((s) => s.ticker === selectedTicker) ?? securities[0];

  const { bars } = useLiveHistory(activeSecurity.ticker, '3M', activeSecurity.price, 10107);

  const stockSentiment = useMemo(() => {
    return computeStockSentiment(activeSecurity, bars, sentimentVotes[activeSecurity.ticker]);
  }, [activeSecurity, bars, sentimentVotes]);

  const votes = sentimentVotes[activeSecurity.ticker] ?? {
    bullish: activeSecurity.analystBuyPct,
    neutral: activeSecurity.analystHoldPct,
    bearish: activeSecurity.analystSellPct,
  };
  const totalVotes = Math.max(1, votes.bullish + votes.neutral + votes.bearish);

  // Arc math for SVG semi-circular sentiment gauge (0-100)
  const scoreAngle = -90 + (marketSentiment.compositeScore / 100) * 180;
  const maxAbsFlow = Math.max(...investorFlows.map((f) => Math.abs(f.netMillionQar)), 10);

  return (
    <div className="space-y-6">
      {/* Row 1: Market Sentiment Gauge + QSE Investor Classification Net Flows */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Market Fear & Greed Gauge */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            QSE Market Sentiment Index
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Composite of advance/decline breadth, 52W highs/lows, and institutional net flow
          </p>

          <div className="mt-4 flex flex-col items-center">
            <svg viewBox="0 0 220 125" className="w-56" aria-label={`Market Sentiment Score ${marketSentiment.compositeScore} out of 100`}>
              {/* Background Arc */}
              <path
                d="M 20 110 A 90 90 0 0 1 200 110"
                fill="none"
                stroke="currentColor"
                className="text-slate-100 dark:text-slate-800"
                strokeWidth="16"
                strokeLinecap="round"
              />
              {/* Colored Segments */}
              <path
                d="M 20 110 A 90 90 0 0 1 75 27"
                fill="none"
                stroke="#C81E32"
                strokeWidth="16"
                strokeLinecap="round"
                opacity="0.75"
              />
              <path
                d="M 80 25 A 90 90 0 0 1 140 25"
                fill="none"
                stroke="#D97706"
                strokeWidth="16"
                opacity="0.75"
              />
              <path
                d="M 145 27 A 90 90 0 0 1 200 110"
                fill="none"
                stroke="#0D7A5F"
                strokeWidth="16"
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* Needle */}
              <g transform={`translate(110, 110) rotate(${scoreAngle})`}>
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="-72"
                  stroke="currentColor"
                  className="text-slate-900 dark:text-white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="0" r="5" className="fill-slate-900 dark:fill-white" />
              </g>
            </svg>

            <div className="-mt-2 text-center">
              <div className="font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {marketSentiment.compositeScore}
              </div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {marketSentiment.regime}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-800">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Breadth Ratio</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {marketSentiment.breadthRatio.toFixed(2)}x
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {marketSentiment.advancers}↑ / {marketSentiment.decliners}↓
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Near 52W High</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {marketSentiment.near52WeekHighCount}
              </div>
              <div className="text-[11px] text-slate-400">stocks</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Near 52W Low</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                {marketSentiment.near52WeekLowCount}
              </div>
              <div className="text-[11px] text-slate-400">stocks</div>
            </div>
          </div>
        </section>

        {/* QSE Investor Classification Net Flow */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                QSE Institutional & Retail Net Flows (QAR Millions)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily Qatari vs. Foreign buy/sell balance reported across QSE trading desks
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Foreign Net +{marketSentiment.netForeignFlowMillionQar}M QAR
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {investorFlows.map((flow) => {
              const positive = flow.netMillionQar >= 0;
              const widthPct = Math.min(100, (Math.abs(flow.netMillionQar) / maxAbsFlow) * 100);
              return (
                <div key={flow.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {flow.category}{' '}
                      <span className="text-slate-400">
                        ({flow.shareOfTurnoverPct.toFixed(1)}% vol)
                      </span>
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        positive
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {positive ? '+' : ''}
                      {flow.netMillionQar.toFixed(1)}M QAR
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="h-2 w-full flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          positive ? 'bg-emerald-600' : 'bg-rose-600'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-slate-500 sm:text-right dark:text-slate-400">
                      Buy {flow.buyMillionQar.toFixed(1)}M / Sell {flow.sellMillionQar.toFixed(1)}M
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Row 2: Per-Stock Technical & Community Sentiment Analyzer */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Single-Stock Technical & Crowd Sentiment Analyzer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspect RSI(14), MACD momentum, Moving Average alignment, analyst consensus, and vote
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor="sentiment-ticker-select"
              className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Security
            </label>
            <select
              id="sentiment-ticker-select"
              value={activeSecurity.ticker}
              onChange={(e) => onSelectTicker(e.target.value)}
              className="w-full min-w-0 max-w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 focus:border-[#8A1538] focus:outline-none sm:w-auto dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {securities.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} — {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Technical Indicators */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-7">
            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sentiment Score</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {stockSentiment.compositeScore}/100
              </div>
              <div className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {stockSentiment.regime}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">RSI (14-Period)</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {stockSentiment.rsi14.toFixed(1)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {stockSentiment.rsi14 > 70
                  ? 'Overbought Zone'
                  : stockSentiment.rsi14 < 30
                    ? 'Oversold Zone'
                    : 'Healthy Momentum'}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">MACD Signal</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {stockSentiment.macdHistogram >= 0 ? '+' : ''}
                {stockSentiment.macdHistogram.toFixed(3)}
              </div>
              <div className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                {stockSentiment.macdSignal}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">SMA 20 Position</div>
              <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatQarPrice(stockSentiment.sma20)} QAR
              </div>
              <div
                className={`mt-0.5 text-xs font-medium ${
                  activeSecurity.price >= stockSentiment.sma20
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                Price {activeSecurity.price >= stockSentiment.sma20 ? 'Above' : 'Below'} SMA 20
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">SMA 50 Position</div>
              <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatQarPrice(stockSentiment.sma50)} QAR
              </div>
              <div
                className={`mt-0.5 text-xs font-medium ${
                  activeSecurity.price >= stockSentiment.sma50
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                Price {activeSecurity.price >= stockSentiment.sma50 ? 'Above' : 'Below'} SMA 50
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Institutional Bias</div>
              <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                {stockSentiment.institutionalBias}
              </div>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {activeSecurity.institutionalFlowMillionQar >= 0 ? '+' : ''}
                {activeSecurity.institutionalFlowMillionQar.toFixed(1)}M QAR flow
              </div>
            </div>
          </div>

          {/* Analyst Consensus & Interactive Investor Poll */}
          <div className="space-y-4 rounded-md border border-slate-200 p-4 lg:col-span-5 dark:border-slate-800">
            <div>
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Analyst Coverage Split ({activeSecurity.ticker})
              </h3>
              <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="bg-emerald-600"
                  style={{ width: `${activeSecurity.analystBuyPct}%` }}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${activeSecurity.analystHoldPct}%` }}
                />
                <div
                  className="bg-rose-600"
                  style={{ width: `${activeSecurity.analystSellPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                <span>Buy {activeSecurity.analystBuyPct}%</span>
                <span>Hold {activeSecurity.analystHoldPct}%</span>
                <span>Sell {activeSecurity.analystSellPct}%</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Investor Community Poll
                </h3>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {totalVotes} votes
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onVoteSentiment(activeSecurity.ticker, 'bullish')}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium transition-colors ${
                    votes.userVote === 'bullish'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>Bullish</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {Math.round((votes.bullish / totalVotes) * 100)}%
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onVoteSentiment(activeSecurity.ticker, 'neutral')}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium transition-colors ${
                    votes.userVote === 'neutral'
                      ? 'border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Minus className="h-4 w-4" />
                  <span>Neutral</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {Math.round((votes.neutral / totalVotes) * 100)}%
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onVoteSentiment(activeSecurity.ticker, 'bearish')}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium transition-colors ${
                    votes.userVote === 'bearish'
                      ? 'border-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>Bearish</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {Math.round((votes.bearish / totalVotes) * 100)}%
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
