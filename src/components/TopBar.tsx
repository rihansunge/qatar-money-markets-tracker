import React, { useEffect, useState } from 'react';
import { Bell, Clock, Menu, Moon, Pause, Play, Plus, Search, Sun } from 'lucide-react';
import type { NavSection } from '../types/market';
import { getQseMarketStatus } from '../utils/marketMath';

interface TopBarProps {
  activeSection: NavSection;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  liveFeedEnabled: boolean;
  onToggleLiveFeed: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  unreadAlertCount: number;
  onOpenAlerts: () => void;
  onOpenNewAlertModal: () => void;
  onOpenMobileMenu: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  overview: 'QSE Market Overview',
  market: 'Market Screener & Charts',
  'shariah-etf': 'Shariah Compliance & ETFs',
  dividends: 'Upcoming Dividends Calendar',
  news: 'Daily Updates & Stock News',
  portfolio: 'Portfolio Analytics',
  sentiment: 'Investor Sentiment Analysis',
  alerts: 'Price Alerts & Push Notifications',
  'pro-legal': 'Qatar Money Markets Plus, AdSense & Legal',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  searchQuery,
  onSearchChange,
  liveFeedEnabled,
  onToggleLiveFeed,
  isDark,
  onToggleTheme,
  unreadAlertCount,
  onOpenAlerts,
  onOpenNewAlertModal,
  onOpenMobileMenu,
}) => {
  const [marketStatus, setMarketStatus] = useState(() => getQseMarketStatus());

  useEffect(() => {
    const id = window.setInterval(() => {
      setMarketStatus(getQseMarketStatus());
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
      {/* Top Qatar Market Hours & Live Open/Closed Session Ribbon */}
      <div
        data-testid="qse-market-hours-bar"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-200/80 bg-[#8A1538]/[0.04] px-4 py-1.5 text-xs sm:px-6 dark:border-slate-800 dark:bg-slate-950/70"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            data-testid="qse-market-status"
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-semibold ${
              marketStatus.isOpen
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800'
                : 'bg-rose-50 text-[#8A1538] ring-1 ring-[#8A1538]/25 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                marketStatus.isOpen ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[#8A1538] dark:bg-rose-400'
              }`}
            />
            <span>Market: {marketStatus.statusLabel}</span>
          </span>

          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5 text-[#8A1538] dark:text-rose-400" />
            <span>
              QSE Hours ({marketStatus.tradingDays}):{' '}
              <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                Open {marketStatus.openingTime}
              </strong>{' '}
              ·{' '}
              <strong className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                Close {marketStatus.closingTime}
              </strong>{' '}
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400">(AST)</span>
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
          <span>
            Doha ({marketStatus.dohaDayShort}):{' '}
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              {marketStatus.dohaTime12}
            </strong>
          </span>
          <span className="hidden md:inline text-slate-300 dark:text-slate-700">|</span>
          <span className="hidden md:inline font-sans font-medium text-slate-700 dark:text-slate-300">
            {marketStatus.countdownText}
          </span>
        </div>
      </div>

      {/* Main Navigation & Action Row */}
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Mobile Menu + Breadcrumb Title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">Qatar Stock Exchange</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {SECTION_TITLES[activeSection]}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Global Ticker Search */}
        <div className="hidden max-w-sm flex-1 md:block">
          <label htmlFor="global-ticker-search" className="sr-only">
            Search QSE ticker or company
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="global-ticker-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search ticker, ETF, or sector (e.g. QIBK, QATR)..."
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#8A1538] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-rose-500 dark:focus:bg-slate-900"
            />
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleLiveFeed}
            aria-label={liveFeedEnabled ? 'Pause live market feed' : 'Resume live market feed'}
            className="hidden items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:inline-flex whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {liveFeedEnabled ? (
              <>
                <Pause className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Live Feed</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-slate-500" />
                <span>Paused</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="rounded-md border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenAlerts}
            aria-label={`Open price alerts (${unreadAlertCount} unread)`}
            className="relative rounded-md border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Bell className="h-4 w-4" />
            {unreadAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8A1538] px-1 font-mono text-[10px] font-semibold text-white">
                {unreadAlertCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNewAlertModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#8A1538] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#70102D] whitespace-nowrap shrink-0 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Price Alert</span>
          </button>
        </div>
      </div>
    </header>
  );
};

