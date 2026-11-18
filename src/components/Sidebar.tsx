import React from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Briefcase,
  CalendarClock,
  Coins,
  LayoutDashboard,
  Newspaper,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { NavSection, QseSecurity } from '../types/market';
import { formatQarPrice, getDayChange } from '../utils/marketMath';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  watchlistTickers: string[];
  securities: QseSecurity[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  unreadAlertCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'market', label: 'Market Screener', icon: BarChart3 },
  { id: 'gold', label: 'Gold Rates', icon: Coins },
  { id: 'shariah-etf', label: 'Shariah & ETFs', icon: ShieldCheck },
  { id: 'dividends', label: 'Dividends', icon: CalendarClock },
  { id: 'news', label: 'News & Briefs', icon: Newspaper },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { id: 'sentiment', label: 'Sentiment', icon: Activity },
  { id: 'alerts', label: 'Price Alerts', icon: Bell },
  { id: 'pro-legal', label: 'Plus & Legal', icon: Sparkles },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  watchlistTickers,
  securities,
  selectedTicker,
  onSelectTicker,
  unreadAlertCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const securityMap = new Map(securities.map((s) => [s.ticker, s]));
  const watchedSecurities = watchlistTickers
    .map((t) => securityMap.get(t))
    .filter((s): s is QseSecurity => Boolean(s));

  const handleNavClick = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const handleWatchClick = (ticker: string) => {
    onSelectTicker(ticker);
    onSelectSection('market');
    onCloseMobile();
  };

  const sidebarBody = (
    <div className="flex h-full flex-col justify-between bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div>
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleNavClick('overview')}
            className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-rose-800"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#8A1538] text-xs font-bold tracking-tight text-white">
              QM
            </span>
            <span className="whitespace-nowrap text-[14.5px] font-bold tracking-tight text-slate-900 dark:text-white">
              Qatar Money Markets
            </span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="px-3 py-4" aria-label="Main navigation">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#8A1538]/10 text-[#8A1538] dark:bg-rose-950/60 dark:text-rose-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'alerts' && unreadAlertCount > 0 && (
                    <span className="font-mono text-xs font-semibold text-[#8A1538] dark:text-rose-300">
                      {unreadAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Pinned Watchlist */}
        <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Pinned Watchlist
            </h2>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
              {watchedSecurities.length}
            </span>
          </div>

          {watchedSecurities.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pin stocks in Market Screener to track them here.
            </p>
          ) : (
            <div className="space-y-1">
              {watchedSecurities.map((sec) => {
                const { changePct } = getDayChange(sec.price, sec.previousClose);
                const isSelected = selectedTicker === sec.ticker && activeSection === 'market';
                return (
                  <button
                    key={sec.ticker}
                    type="button"
                    onClick={() => handleWatchClick(sec.ticker)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {sec.ticker}
                        </span>
                        {sec.shariah.isCompliant && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            Halal
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {sec.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {formatQarPrice(sec.price)}
                      </div>
                      <div
                        className={`text-[11px] ${
                          changePct >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {changePct >= 0 ? '+' : ''}
                        {changePct.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Session Info */}
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div>Qatar Stock Exchange · QAR</div>
        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          Sun–Thu · 09:30–13:15 AST
        </div>
        <button
          type="button"
          onClick={() => handleNavClick('pro-legal')}
          className="mt-1.5 text-[11px] font-medium text-[#8A1538] hover:underline dark:text-rose-400"
        >
          QFMA Disclaimer · Privacy · Terms
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 lg:block dark:border-slate-800">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarBody}</div>
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-[82vw] border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
};
