import React from 'react';
import { Globe, HelpCircle } from 'lucide-react';
import type { NavSection } from '../types/market';
import { SEO_TICKERS, getSectionFaqs, getSectionKeywords } from '../utils/seo';

interface SeoFaqSectionProps {
  section: NavSection;
  ticker?: string;
  priceQar?: number;
  dividendYieldPct?: number;
  heading?: string;
}

export const SeoFaqSection: React.FC<SeoFaqSectionProps> = ({
  section,
  ticker = 'QIBK',
  priceQar,
  dividendYieldPct,
  heading,
}) => {
  const tickerMeta = SEO_TICKERS.find((t) => t.ticker === ticker.toUpperCase());
  const faqs = getSectionFaqs(section, tickerMeta, { priceQar, dividendYieldPct });
  const keywords = getSectionKeywords(section, tickerMeta);

  return (
    <section
      aria-label="Frequently Asked Questions & Bilingual Search Topics"
      data-testid={`seo-faq-${section}`}
      className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {heading ?? 'Market Guide & Frequently Asked Questions (EN / العربية)'}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <Globe className="h-3.5 w-3.5" />
          <span>Qatar Market Reference · أسئلة شائعة</span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {faqs.map((item) => (
          <article
            key={item.question}
            className="rounded-md border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50"
          >
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {item.question}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {item.answer}
            </p>

            {item.questionAr && item.answerAr && (
              <div
                dir="rtl"
                lang="ar"
                className="mt-3 border-t border-slate-200/70 pt-2.5 text-right dark:border-slate-800"
              >
                <h4 className="text-xs font-semibold text-[#8A1538] dark:text-rose-300">
                  {item.questionAr}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {item.answerAr}
                </p>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Topics (EN):</span>
          <span>{keywords.en.join(' · ')}</span>
        </div>
        <div
          dir="rtl"
          lang="ar"
          className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-right"
        >
          <span className="font-semibold text-slate-700 dark:text-slate-300">كلمات البحث:</span>
          <span>{keywords.ar.join(' · ')}</span>
        </div>
      </div>
    </section>
  );
};
