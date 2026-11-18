import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Search, X } from 'lucide-react';
import {
  INITIAL_ALERTS,
  INITIAL_INVESTOR_FLOWS,
  INITIAL_PORTFOLIO_HOLDINGS,
  INITIAL_QSE_INDICES,
  INITIAL_QSE_SECURITIES,
  INITIAL_SENTIMENT_VOTES,
  INITIAL_WATCHLIST,
  QSE_DIVIDENDS,
  QSE_NEWS,
} from './data/qseData';
import type {
  AlertCondition,
  MarketIndex,
  NavSection,
  PortfolioHolding,
  PriceAlert,
  QseSecurity,
  SentimentVoteState,
  TriggeredAlert,
} from './types/market';
import {
  calculatePortfolioAnalytics,
  computeMarketSentimentIndex,
  diffLiveTicks,
  evaluatePriceAlerts,
  mergeLiveQseSnapshot,
  type LiveQseSnapshotPayload,
} from './utils/marketMath';
import {
  dispatchPushNotification,
  getNotificationPermission,
  playAlertChime,
  requestBrowserNotificationPermission,
  type NotificationPermissionState,
} from './utils/notifications';
import {
  buildPageSeo,
  parseRouteState,
} from './utils/seo';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MarketTickerStrip } from './components/MarketTickerStrip';
import { OverviewView } from './components/OverviewView';
import { MarketScreenerView } from './components/MarketScreenerView';
import { GoldRatesView } from './components/GoldRatesView';
import { EtfShariahView } from './components/EtfShariahView';
import { DividendsView } from './components/DividendsView';
import { NewsView } from './components/NewsView';
import { PortfolioView } from './components/PortfolioView';
import { SentimentView } from './components/SentimentView';
import { AlertsView } from './components/AlertsView';
import { LegalProView, type LegalProTab } from './components/LegalProView';
import { AddPositionModal, ImportPortfolioModal, NewAlertModal } from './components/Modals';

function loadStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getInitialUrlParams(): { section: NavSection; ticker: string; searchQuery: string } {
  if (typeof window === 'undefined') {
    return { section: 'overview', ticker: 'QIBK', searchQuery: '' };
  }
  return parseRouteState(window.location.pathname, window.location.search);
}

export default function App() {
  const initialUrl = useMemo(() => getInitialUrlParams(), []);
  const [activeSection, setActiveSection] = useState<NavSection>(initialUrl.section);
  const [selectedTicker, setSelectedTicker] = useState<string>(initialUrl.ticker);
  const [legalTab, setLegalTab] = useState<LegalProTab>('seo');
  const [searchQuery, setSearchQuery] = useState<string>(initialUrl.searchQuery);
  const [liveFeedEnabled, setLiveFeedEnabled] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [isDark, setIsDark] = useState<boolean>(() =>
    loadStored('qmm_white_maroon_dark', false),
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    loadStored('dohaborsa_sound_enabled', true),
  );

  const [indices, setIndices] = useState<MarketIndex[]>(INITIAL_QSE_INDICES);
  const [securities, setSecurities] = useState<QseSecurity[]>(INITIAL_QSE_SECURITIES);
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<string | null>(null);
  const [feedLabel, setFeedLabel] = useState<string>('Real-time QSE feed');
  const [priceFlashes, setPriceFlashes] = useState<Record<string, 'up' | 'down'>>({});
  const alertsRef = useRef<PriceAlert[]>([]);
  const indicesRef = useRef<MarketIndex[]>(INITIAL_QSE_INDICES);
  const securitiesRef = useRef<QseSecurity[]>(INITIAL_QSE_SECURITIES);
  const flashTimerRef = useRef<number | null>(null);

  const [watchlistTickers, setWatchlistTickers] = useState<string[]>(() =>
    loadStored('dohaborsa_watchlist', INITIAL_WATCHLIST),
  );
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(() =>
    loadStored('dohaborsa_portfolio', INITIAL_PORTFOLIO_HOLDINGS),
  );
  const [alerts, setAlerts] = useState<PriceAlert[]>(() =>
    loadStored('dohaborsa_alerts', INITIAL_ALERTS),
  );
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>(() =>
    loadStored('dohaborsa_triggered_alerts', []),
  );
  const [sentimentVotes, setSentimentVotes] = useState<Record<string, SentimentVoteState>>(() =>
    loadStored('dohaborsa_sentiment_votes', INITIAL_SENTIMENT_VOTES),
  );

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermission());

  const [activeToast, setActiveToast] = useState<TriggeredAlert | null>(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertModalTicker, setAlertModalTicker] = useState<string | undefined>(undefined);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionModalTicker, setPositionModalTicker] = useState<string | undefined>(undefined);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem('qmm_white_maroon_dark', JSON.stringify(isDark));
  }, [isDark]);

  // Dynamic SEO title, meta description, canonical URL, OpenGraph & shareable clean path sync
  useEffect(() => {
    const sec = securities.find((s) => s.ticker === selectedTicker);
    const seo = buildPageSeo({
      baseUrl: window.location.origin,
      section: activeSection,
      ticker: selectedTicker,
      priceQar: sec?.price,
      dividendYieldPct: sec?.dividendYieldPct,
    });

    document.title = seo.title;

    const setMeta = (selector: string, attr: 'content' | 'href', val: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', seo.description);
    setMeta('meta[name="keywords"]', 'content', seo.keywords);
    setMeta('meta[property="og:title"]', 'content', seo.title);
    setMeta('meta[property="og:description"]', 'content', seo.description);
    setMeta('meta[property="og:url"]', 'content', seo.canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'content', seo.title);
    setMeta('meta[name="twitter:description"]', 'content', seo.description);

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', seo.canonicalUrl);

    // Sync JSON-LD structured data (WebSite, WebApplication, FAQPage) for active view
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
    for (const schema of seo.structuredData) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-qmm-seo', 'true');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    if (window.location.pathname !== seo.canonicalPath || window.location.search) {
      window.history.replaceState({}, '', seo.canonicalPath);
    }
  }, [activeSection, selectedTicker, securities]);

  // Persist user data
  useEffect(() => {
    window.localStorage.setItem('dohaborsa_watchlist', JSON.stringify(watchlistTickers));
  }, [watchlistTickers]);

  useEffect(() => {
    window.localStorage.setItem('dohaborsa_portfolio', JSON.stringify(holdings));
  }, [holdings]);

  useEffect(() => {
    window.localStorage.setItem('dohaborsa_alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    window.localStorage.setItem('dohaborsa_triggered_alerts', JSON.stringify(triggeredAlerts));
  }, [triggeredAlerts]);

  useEffect(() => {
    window.localStorage.setItem('dohaborsa_sentiment_votes', JSON.stringify(sentimentVotes));
  }, [sentimentVotes]);

  useEffect(() => {
    window.localStorage.setItem('dohaborsa_sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  const emitAlertNotifications = (newlyTriggered: TriggeredAlert[], activeAlertsSnapshot: PriceAlert[]) => {
    if (newlyTriggered.length === 0) return;
    setTriggeredAlerts((prev) => [...newlyTriggered, ...prev].slice(0, 50));
    setActiveToast(newlyTriggered[0]);

    const alertMap = new Map(activeAlertsSnapshot.map((a) => [a.id, a]));
    for (const item of newlyTriggered) {
      const rule = alertMap.get(item.alertId);
      if (rule?.pushEnabled) {
        dispatchPushNotification(`Qatar Money Markets · ${item.ticker}`, item.message);
      }
    }
    if (soundEnabled) {
      playAlertChime();
    }
  };

  useEffect(() => {
    indicesRef.current = indices;
  }, [indices]);

  useEffect(() => {
    securitiesRef.current = securities;
  }, [securities]);

  // Connect real-time SSE stream (/api/qse/stream) + initial /api/qse/live snapshot when Live Feed is active
  useEffect(() => {
    let cancelled = false;

    const applyLivePayload = (payload: LiveQseSnapshotPayload) => {
      if (cancelled || !payload || !payload.quotes) return;
      const prevIdx = indicesRef.current;
      const prevSecs = securitiesRef.current;
      const merged = mergeLiveQseSnapshot(prevIdx, prevSecs, payload);

      const flashes = diffLiveTicks(prevIdx, prevSecs, merged.indices, merged.securities);
      if (Object.keys(flashes).length > 0) {
        setPriceFlashes(flashes);
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => {
          setPriceFlashes({});
        }, 1800);
      }

      indicesRef.current = merged.indices;
      securitiesRef.current = merged.securities;
      setIndices(merged.indices);
      setSecurities(merged.securities);
      setLastLiveSyncAt(payload.fetchedAt || new Date().toISOString());
      if (payload.delayNote?.includes('15-min')) {
        setFeedLabel('15m delayed fallback');
      } else {
        setFeedLabel('Real-time QSE feed');
      }

      const prevAlerts = alertsRef.current;
      const { updatedAlerts, newlyTriggered } = evaluatePriceAlerts(
        prevAlerts,
        merged.securities,
        new Date().toISOString(),
      );
      if (newlyTriggered.length > 0) {
        setAlerts(updatedAlerts);
        emitAlertNotifications(newlyTriggered, prevAlerts);
      }
    };

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/qse/live');
        if (!res.ok) return;
        const payload = (await res.json()) as LiveQseSnapshotPayload;
        applyLivePayload(payload);
      } catch {
        // Keep last valid state if network momentarily fails
      }
    };

    fetchOnce();

    if (!liveFeedEnabled) {
      return () => {
        cancelled = true;
      };
    }

    let es: EventSource | null = null;
    let fallbackInterval: number | null = null;

    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/qse/stream');
      es.addEventListener('tick', (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent<string>).data) as LiveQseSnapshotPayload;
          applyLivePayload(payload);
        } catch {
          // Ignore malformed frame
        }
      });
      es.addEventListener('heartbeat', (evt) => {
        try {
          const info = JSON.parse((evt as MessageEvent<string>).data) as { fetchedAt?: string };
          if (!cancelled && info.fetchedAt) {
            setLastLiveSyncAt(info.fetchedAt);
          }
        } catch {
          // Ignore malformed heartbeat
        }
      });
    } else {
      fallbackInterval = window.setInterval(fetchOnce, 4_000);
    }

    return () => {
      cancelled = true;
      if (es) es.close();
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, [liveFeedEnabled]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!activeToast) return;
    const id = window.setTimeout(() => setActiveToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [activeToast]);

  const portfolioAnalytics = useMemo(
    () => calculatePortfolioAnalytics(holdings, securities),
    [holdings, securities],
  );

  const marketSentiment = useMemo(
    () => computeMarketSentimentIndex(securities, INITIAL_INVESTOR_FLOWS),
    [securities],
  );

  const unreadAlertCount = useMemo(
    () => triggeredAlerts.filter((t) => !t.read).length,
    [triggeredAlerts],
  );

  const handleToggleWatchlist = (ticker: string) => {
    setWatchlistTickers((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    );
  };

  const handleCreateAlert = (payload: {
    ticker: string;
    condition: AlertCondition;
    targetValue: number;
    note: string;
    pushEnabled: boolean;
  }) => {
    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}`,
      ticker: payload.ticker,
      condition: payload.condition,
      targetValue: payload.targetValue,
      note: payload.note,
      active: true,
      pushEnabled: payload.pushEnabled,
      createdAt: new Date().toISOString(),
    };
    const nextAlerts = [newAlert, ...alerts];
    // Evaluate immediately in case user set an already-met threshold
    const { updatedAlerts, newlyTriggered } = evaluatePriceAlerts(
      nextAlerts,
      securities,
      new Date().toISOString(),
    );
    setAlerts(updatedAlerts);
    if (newlyTriggered.length > 0) {
      emitAlertNotifications(newlyTriggered, nextAlerts);
    }
  };

  const handleSimulateTrigger = (alertId: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;
    const sec = securities.find((s) => s.ticker === alert.ticker);
    if (!sec) return;
    const triggered: TriggeredAlert = {
      id: `trig-sim-${Date.now()}`,
      alertId: alert.id,
      ticker: sec.ticker,
      securityName: sec.name,
      message: `${sec.ticker} alert triggered at ${sec.price.toFixed(2)} QAR (target ${alert.targetValue.toFixed(2)})${alert.note ? ` — ${alert.note}` : ''}`,
      triggeredPrice: sec.price,
      triggeredAt: new Date().toISOString(),
      read: false,
    };
    emitAlertNotifications([triggered], alerts);
  };

  const handleAddPosition = (payload: {
    ticker: string;
    shares: number;
    avgCostQar: number;
    purchasedAt: string;
  }) => {
    setHoldings((prev) => [
      {
        id: `hold-${Date.now()}`,
        ticker: payload.ticker,
        shares: payload.shares,
        avgCostQar: payload.avgCostQar,
        purchasedAt: payload.purchasedAt,
      },
      ...prev,
    ]);
    setActiveSection('portfolio');
  };

  const handleImportPortfolio = (imported: PortfolioHolding[], replaceExisting: boolean) => {
    setHoldings((prev) => (replaceExisting ? imported : [...imported, ...prev]));
    setActiveSection('portfolio');
  };

  const openProLegal = (tab: LegalProTab = 'monetization') => {
    setLegalTab(tab);
    setActiveSection('pro-legal');
  };

  const handleVoteSentiment = (ticker: string, vote: 'bullish' | 'neutral' | 'bearish') => {
    setSentimentVotes((prev) => {
      const current = prev[ticker] ?? { bullish: 75, neutral: 20, bearish: 10 };
      if (current.userVote === vote) return prev;
      const next = { ...current };
      if (current.userVote) {
        next[current.userVote] = Math.max(0, next[current.userVote] - 1);
      }
      next[vote] = next[vote] + 1;
      next.userVote = vote;
      return { ...prev, [ticker]: next };
    });
  };

  const handleRequestNotificationPermission = async () => {
    const status = await requestBrowserNotificationPermission();
    setNotificationPermission(status);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim() && activeSection !== 'market' && activeSection !== 'dividends' && activeSection !== 'news') {
      setActiveSection('market');
    }
  };

  const jumpToSecurity = (ticker: string) => {
    setSelectedTicker(ticker);
    setActiveSection('market');
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        watchlistTickers={watchlistTickers}
        securities={securities}
        selectedTicker={selectedTicker}
        onSelectTicker={setSelectedTicker}
        unreadAlertCount={unreadAlertCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeSection={activeSection}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          liveFeedEnabled={liveFeedEnabled}
          onToggleLiveFeed={() => setLiveFeedEnabled((v) => !v)}
          isDark={isDark}
          onToggleTheme={() => setIsDark((v) => !v)}
          unreadAlertCount={unreadAlertCount}
          onOpenAlerts={() => setActiveSection('alerts')}
          onOpenNewAlertModal={() => {
            setAlertModalTicker(selectedTicker);
            setAlertModalOpen(true);
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 p-4 sm:p-6">
          <div className="md:hidden">
            <label htmlFor="mobile-ticker-search" className="sr-only">
              Search QSE ticker or company
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="mobile-ticker-search"
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search QSE ticker, ETF, or sector..."
                className="w-full rounded-md border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <MarketTickerStrip
            indices={indices}
            securities={securities}
            lastLiveSyncAt={lastLiveSyncAt}
            feedLabel={feedLabel}
            priceFlashes={priceFlashes}
            onSelectIndex={() => setActiveSection('overview')}
          />

          {activeSection === 'overview' && (
            <OverviewView
              indices={indices}
              securities={securities}
              dividends={QSE_DIVIDENDS}
              news={QSE_NEWS}
              portfolio={portfolioAnalytics}
              marketSentiment={marketSentiment}
              watchlistTickers={watchlistTickers}
              liveFeedEnabled={liveFeedEnabled}
              lastLiveSyncAt={lastLiveSyncAt}
              onNavigate={setActiveSection}
              onSelectTicker={setSelectedTicker}
              onOpenNewAlert={(t) => {
                setAlertModalTicker(t || selectedTicker);
                setAlertModalOpen(true);
              }}
            />
          )}

          {activeSection === 'market' && (
            <MarketScreenerView
              securities={securities}
              selectedTicker={selectedTicker}
              onSelectTicker={setSelectedTicker}
              watchlistTickers={watchlistTickers}
              onToggleWatchlist={handleToggleWatchlist}
              searchQuery={searchQuery}
              onOpenNewAlert={(t) => {
                setAlertModalTicker(t);
                setAlertModalOpen(true);
              }}
              onOpenAddHolding={(t) => {
                setPositionModalTicker(t);
                setPositionModalOpen(true);
              }}
              benchmarkValue={indices[0].value}
              liveFeedEnabled={liveFeedEnabled}
              lastLiveSyncAt={lastLiveSyncAt}
              priceFlashes={priceFlashes}
            />
          )}

          {activeSection === 'gold' && <GoldRatesView liveFeedEnabled={liveFeedEnabled} />}

          {activeSection === 'shariah-etf' && (
            <EtfShariahView
              securities={securities}
              holdings={holdings}
              onSelectTicker={setSelectedTicker}
              onInspectInMarket={jumpToSecurity}
            />
          )}

          {activeSection === 'dividends' && (
            <DividendsView
              dividends={QSE_DIVIDENDS}
              portfolio={portfolioAnalytics}
              searchQuery={searchQuery}
              onSelectTicker={jumpToSecurity}
              onOpenMonetization={() => openProLegal('monetization')}
            />
          )}

          {activeSection === 'news' && (
            <NewsView
              news={QSE_NEWS}
              searchQuery={searchQuery}
              onSelectTicker={jumpToSecurity}
              onOpenMonetization={() => openProLegal('monetization')}
            />
          )}

          {activeSection === 'portfolio' && (
            <PortfolioView
              analytics={portfolioAnalytics}
              benchmarkValue={indices[0].value}
              onOpenAddPosition={() => {
                setPositionModalTicker(selectedTicker);
                setPositionModalOpen(true);
              }}
              onOpenImportModal={() => setImportModalOpen(true)}
              onRemoveHolding={(id) => setHoldings((prev) => prev.filter((h) => h.id !== id))}
              onClearPortfolio={() => setHoldings([])}
              onResetPortfolio={() => setHoldings(INITIAL_PORTFOLIO_HOLDINGS)}
              onOpenZakat={() => setActiveSection('shariah-etf')}
              onSelectTicker={jumpToSecurity}
            />
          )}

          {activeSection === 'sentiment' && (
            <SentimentView
              securities={securities}
              selectedTicker={selectedTicker}
              onSelectTicker={setSelectedTicker}
              marketSentiment={marketSentiment}
              investorFlows={INITIAL_INVESTOR_FLOWS}
              sentimentVotes={sentimentVotes}
              onVoteSentiment={handleVoteSentiment}
            />
          )}

          {activeSection === 'alerts' && (
            <AlertsView
              alerts={alerts}
              triggeredAlerts={triggeredAlerts}
              securities={securities}
              notificationPermission={notificationPermission}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((v) => !v)}
              onRequestPermission={handleRequestNotificationPermission}
              onOpenNewAlertModal={() => {
                setAlertModalTicker(selectedTicker);
                setAlertModalOpen(true);
              }}
              onToggleAlertActive={(id) =>
                setAlerts((prev) =>
                  prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
                )
              }
              onDeleteAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
              onSimulateTrigger={handleSimulateTrigger}
              onMarkAllRead={() =>
                setTriggeredAlerts((prev) => prev.map((t) => ({ ...t, read: true })))
              }
              onClearHistory={() => setTriggeredAlerts([])}
            />
          )}

          {activeSection === 'pro-legal' && (
            <LegalProView
              initialTab={legalTab}
              onInspectCalculator={() => setActiveSection('shariah-etf')}
            />
          )}

          {/* Compact Compliance & Monetization Footer */}
          <footer className="flex flex-col items-start justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center dark:border-slate-800 dark:text-slate-400">
            <span>
              Market data for informational purposes only — not licensed QFMA investment advice.
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => openProLegal('seo')}
                className="font-medium text-[#8A1538] hover:underline dark:text-rose-400"
              >
                Google Search & SEO
              </button>
              <button
                type="button"
                onClick={() => openProLegal('monetization')}
                className="font-medium text-slate-600 hover:text-[#8A1538] hover:underline dark:text-slate-300 dark:hover:text-rose-400"
              >
                Morning Brief & Plus
              </button>
              <button
                type="button"
                onClick={() => openProLegal('disclaimer')}
                className="hover:text-slate-800 hover:underline dark:hover:text-slate-200"
              >
                QFMA Disclaimer
              </button>
              <button
                type="button"
                onClick={() => openProLegal('privacy')}
                className="hover:text-slate-800 hover:underline dark:hover:text-slate-200"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => openProLegal('terms')}
                className="hover:text-slate-800 hover:underline dark:hover:text-slate-200"
              >
                Terms
              </button>
            </div>
          </footer>
        </main>
      </div>

      {/* Live Price Alert Push Toast */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="alert-toast"
          className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[#8A1538] dark:text-rose-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Price Alert Triggered · {activeToast.ticker}
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              {activeToast.message}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveSection('alerts');
                setActiveToast(null);
              }}
              className="mt-1.5 text-xs font-semibold text-[#8A1538] hover:underline dark:text-rose-400"
            >
              View Alert History
            </button>
          </div>
          <button
            type="button"
            onClick={() => setActiveToast(null)}
            aria-label="Dismiss price alert notification"
            className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Modals */}
      <NewAlertModal
        open={alertModalOpen}
        initialTicker={alertModalTicker}
        securities={securities}
        onClose={() => setAlertModalOpen(false)}
        onSubmit={handleCreateAlert}
      />

      <AddPositionModal
        open={positionModalOpen}
        initialTicker={positionModalTicker}
        securities={securities}
        onClose={() => setPositionModalOpen(false)}
        onSubmit={handleAddPosition}
      />

      <ImportPortfolioModal
        open={importModalOpen}
        securities={securities}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportPortfolio}
      />
    </div>
  );
}
