import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { NewsItem } from '../types/market';
import { AdSlot } from './AdSlot';

interface NewsViewProps {
  news: NewsItem[];
  searchQuery: string;
  onSelectTicker: (ticker: string) => void;
  onOpenMonetization?: () => void;
}

type NewsCategoryFilter = 'All' | NewsItem['category'];

const CATEGORIES: NewsCategoryFilter[] = [
  'All',
  'Daily Brief',
  'Dividends',
  'Shariah & ETF',
  'Earnings',
  'Macro & Energy',
];

export const NewsView: React.FC<NewsViewProps> = ({
  news,
  searchQuery,
  onSelectTicker,
  onOpenMonetization,
}) => {
  const [category, setCategory] = useState<NewsCategoryFilter>('All');
  const [activeArticle, setActiveArticle] = useState<NewsItem | null>(null);

  const filteredNews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return news.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (q) {
        const hay = `${item.title} ${item.summary} ${item.relatedTickers.join(' ')} ${item.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [news, category, searchQuery]);

  const dailyBrief = news.find((n) => n.category === 'Daily Brief') ?? news[0];

  return (
    <div className="space-y-6">
      {/* Daily Market Update Highlight */}
      {dailyBrief && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Daily QSE Update · {dailyBrief.publishedAt} · {dailyBrief.source}
            </span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {dailyBrief.sentiment} Tone
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
            {dailyBrief.title}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {dailyBrief.summary}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Mentioned:</span>
              {dailyBrief.relatedTickers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSelectTicker(t)}
                  className="font-mono font-semibold text-[#8A1538] hover:underline dark:text-rose-400"
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActiveArticle(dailyBrief)}
              className="text-xs font-semibold text-[#8A1538] hover:underline dark:text-rose-400"
            >
              Read Full Daily Brief
            </button>
          </div>
        </section>
      )}

      <AdSlot slotId="dohaborsa-news-leaderboard" onConfigureClick={onOpenMonetization} />

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
          role="group"
          aria-label="Filter news by category"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`whitespace-nowrap shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-[#8A1538] text-white dark:bg-rose-700'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {filteredNews.length} stories
        </span>
      </div>

      {/* News List */}
      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {filteredNews.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No QSE news articles match your search or category filter.
          </div>
        ) : (
          filteredNews.map((item) => (
            <article key={item.id} className="p-5 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {item.category}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.publishedAt}</span>
                <span aria-hidden="true">·</span>
                <span>{item.source}</span>
                <span aria-hidden="true">·</span>
                <span>{item.readTimeMin} min read</span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-medium ${
                    item.sentiment === 'Positive'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : item.sentiment === 'Cautious'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.sentiment}
                </span>
              </div>

              <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveArticle(item)}
                  className="text-left hover:text-[#8A1538] dark:hover:text-rose-400"
                >
                  {item.title}
                </button>
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{item.summary}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {item.relatedTickers.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSelectTicker(t)}
                      className="font-mono font-semibold text-slate-700 hover:text-[#8A1538] hover:underline dark:text-slate-300 dark:hover:text-rose-400"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveArticle(item)}
                  className="text-xs font-medium text-[#8A1538] hover:underline dark:text-rose-400"
                >
                  Open Story
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Article Reader Modal */}
      {activeArticle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-modal-title"
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {activeArticle.category} · {activeArticle.publishedAt} · {activeArticle.source}
                </div>
                <h2
                  id="article-modal-title"
                  className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  {activeArticle.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveArticle(null)}
                aria-label="Close article reader"
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {activeArticle.content.split('\n\n').map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Related Securities:</span>
                {activeArticle.relatedTickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setActiveArticle(null);
                      onSelectTicker(t);
                    }}
                    className="font-mono font-semibold text-[#8A1538] hover:underline dark:text-rose-400"
                  >
                    Inspect {t}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveArticle(null)}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
