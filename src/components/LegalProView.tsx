import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export type LegalProTab = 'seo' | 'monetization' | 'disclaimer' | 'privacy' | 'terms';

interface SeoStatusPayload {
  baseUrl: string;
  sitemapUrl: string;
  robotsUrl: string;
  indexedUrlsCount: number;
  hasVerificationToken: boolean;
  hasAdsenseId: boolean;
  isPublicUrlConfigured: boolean;
}

interface LegalProViewProps {
  initialTab?: LegalProTab;
  onInspectCalculator: () => void;
}

export const LegalProView: React.FC<LegalProViewProps> = ({
  initialTab = 'seo',
  onInspectCalculator,
}) => {
  const [activeTab, setActiveTab] = useState<LegalProTab>(initialTab);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [seoStatus, setSeoStatus] = useState<SeoStatusPayload | null>(null);
  const [copiedSitemap, setCopiedSitemap] = useState(false);
  const [verificationInput, setVerificationInput] = useState('');
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [savingVerification, setSavingVerification] = useState(false);
  const [adsenseInput, setAdsenseInput] = useState(() =>
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('qmm_adsense_client_id') || '').trim()
      : '',
  );
  const [adsenseMsg, setAdsenseMsg] = useState<string | null>(null);
  const [adsenseError, setAdsenseError] = useState<string | null>(null);
  const [savingAdsense, setSavingAdsense] = useState(false);

  const envAdsenseId = (import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined)?.trim() || '';
  const activeAdsenseId = envAdsenseId || adsenseInput.trim();
  const adsenseConfigured = /^ca-pub-\d{8,}$/i.test(activeAdsenseId);

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : seoStatus?.baseUrl || '';
  const liveSitemapUrl = currentOrigin ? `${currentOrigin}/sitemap.xml` : seoStatus?.sitemapUrl || '/sitemap.xml';
  const googleSearchQueryUrl = `https://www.google.com/search?q=${encodeURIComponent('"Qatar Money Markets" Qatar Stock Exchange')}`;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    fetch('/api/newsletter/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { subscriberCount?: number } | null) => {
        if (typeof d?.subscriberCount === 'number') {
          setSubscriberCount(d.subscriberCount);
        }
      })
      .catch(() => {
        // Ignore offline status error
      });

    fetch('/api/seo/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: (SeoStatusPayload & { adsenseClientId?: string }) | null) => {
        if (d && d.sitemapUrl) {
          setSeoStatus(d);
          if (d.adsenseClientId && !adsenseInput) {
            setAdsenseInput(d.adsenseClientId);
          }
        }
      })
      .catch(() => {
        // Ignore offline status error
      });
  }, []);

  const handleCopySitemap = async () => {
    try {
      await navigator.clipboard.writeText(liveSitemapUrl);
      setCopiedSitemap(true);
      window.setTimeout(() => setCopiedSitemap(false), 2500);
    } catch {
      setCopiedSitemap(false);
    }
  };

  const handleSaveVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationMsg(null);
    setVerificationError(null);
    const trimmed = verificationInput.trim();
    if (!trimmed) {
      setVerificationError('Paste your Google Search Console HTML tag or token first.');
      return;
    }
    setSavingVerification(true);
    try {
      const res = await fetch('/api/seo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleSiteVerification: trimmed }),
      });
      const data = (await res.json()) as {
        saved?: boolean;
        hasVerificationToken?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setVerificationError(data.error || 'Could not save verification token.');
      } else {
        setVerificationMsg('Search Console meta tag saved. You can click Verify in Google Search Console now.');
        setVerificationInput('');
        setSeoStatus((prev) =>
          prev ? { ...prev, hasVerificationToken: Boolean(data.hasVerificationToken) } : prev,
        );
      }
    } catch {
      setVerificationError('Network error while saving verification token.');
    } finally {
      setSavingVerification(false);
    }
  };

  const handleSaveAdsense = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdsenseMsg(null);
    setAdsenseError(null);
    const cleaned = adsenseInput.trim();
    if (cleaned && !/^ca-pub-\d{8,}$/i.test(cleaned)) {
      setAdsenseError('Must start with ca-pub- followed by digits (e.g. ca-pub-1234567890123456).');
      return;
    }
    setSavingAdsense(true);
    try {
      const res = await fetch('/api/seo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adsenseClientId: cleaned }),
      });
      const data = (await res.json()) as { saved?: boolean; error?: string };
      if (!res.ok) {
        setAdsenseError(data.error || 'Could not save AdSense Publisher ID.');
      } else {
        if (cleaned) {
          window.localStorage.setItem('qmm_adsense_client_id', cleaned);
          setAdsenseMsg('AdSense Publisher ID activated across ad placements.');
        } else {
          window.localStorage.removeItem('qmm_adsense_client_id');
          setAdsenseMsg('Cleared AdSense Publisher ID (placeholder banners restored).');
        }
        window.dispatchEvent(new Event('qmm-monetization-updated'));
      }
    } catch {
      setAdsenseError('Network error while saving AdSense ID.');
    } finally {
      setSavingAdsense(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribeMsg(null);
    setSubscribeError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setSubscribeError('Please enter an email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as {
        subscribed?: boolean;
        alreadyExists?: boolean;
        subscriberCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setSubscribeError(data.error || 'Could not subscribe at the moment.');
      } else {
        setSubscribeMsg(
          data.alreadyExists
            ? 'This email is already subscribed to the Morning Doha Brief.'
            : 'Subscribed to the Morning Doha QSE Brief (Sun–Thu pre-open).',
        );
        if (typeof data.subscriberCount === 'number') {
          setSubscriberCount(data.subscriberCount);
        }
        setEmail('');
      }
    } catch {
      setSubscribeError('Network error while subscribing.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Monetization, Qatar Money Markets Plus & Legal Compliance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Morning QSE digest, Pro feature tier, AdSense readiness checklist, and QFMA disclosures
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800"
          role="tablist"
          aria-label="Pro and legal sections"
        >
          {(
            [
              { id: 'seo', label: 'Google Search & SEO' },
              { id: 'monetization', label: 'Plus & AdSense' },
              { id: 'disclaimer', label: 'QFMA Disclaimer' },
              { id: 'privacy', label: 'Privacy Policy' },
              { id: 'terms', label: 'Terms' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-[#8A1538] shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'seo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Google Search Live Snippet Preview & One-Click Links */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8A1538] dark:text-rose-400">
                <Search className="h-4 w-4" />
                <span>Google Search Result Preview</span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                How Qatar Money Markets Appears on Google
              </h3>

              {/* Simulated Google SERP Result Card */}
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8A1538] text-[10px] font-bold text-white">
                    QM
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      Qatar Money Markets
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {currentOrigin || 'https://qatarmoneymarkets.com'} › QSE Live Tracker
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-base font-semibold text-blue-700 dark:text-sky-400">
                  Qatar Money Markets — QSE Live Stocks & Halal ETFs
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Track real-time Qatar Stock Exchange (QSE) prices, QATR Halal ETF, Shariah-compliant
                  stocks, upcoming dividends, Zakat purification, and portfolio analytics.
                </p>

                {/* Google Sitelinks Preview */}
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-4 dark:border-slate-800">
                  {[
                    { label: 'QIBK Live Quote', path: '/stock/QIBK' },
                    { label: 'QATR Halal ETF', path: '/shariah-etf' },
                    { label: 'QSE Dividends', path: '/dividends' },
                    { label: 'Daily QSE News', path: '/news' },
                  ].map((sitelink) => (
                    <a
                      key={sitelink.path}
                      href={sitelink.path}
                      className="rounded border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-[#8A1538] hover:border-[#8A1538]/40 dark:border-slate-800 dark:bg-slate-900 dark:text-rose-400"
                    >
                      {sitelink.label}
                    </a>
                  ))}
                </div>
              </div>

              {/* One-Click Search & Sitemap Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <a
                  href={googleSearchQueryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#8A1538] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#70102D]"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Check on Google Search</span>
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>

                <a
                  href="https://search.google.com/search-console"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#8A1538]/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#8A1538] hover:bg-rose-50/60 dark:border-rose-800 dark:bg-slate-800 dark:text-rose-300"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Open Google Search Console</span>
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </a>

                <button
                  type="button"
                  onClick={handleCopySitemap}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedSitemap ? 'Copied Sitemap URL' : 'Copy Sitemap URL'}</span>
                </button>
              </div>
            </section>

            {/* Indexing Status & 3-Step Launch Checklist */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Technical Google Crawlability</span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                Indexing Readiness ({seoStatus?.indexedUrlsCount ?? 26} Pages)
              </h3>

              <ul className="mt-3 space-y-2.5 text-xs">
                {[
                  {
                    done: true,
                    label: 'Server-injected <title>, canonical URL, OpenGraph card & WebSite SearchAction JSON-LD',
                  },
                  {
                    done: true,
                    label: 'Clean indexable stock URLs (/stock/QIBK .. /stock/MCCS) in /sitemap.xml',
                  },
                  {
                    done: true,
                    label: 'Crawler directives enabled in /robots.txt (Allow: /)',
                  },
                  {
                    done: Boolean(seoStatus?.isPublicUrlConfigured),
                    label: seoStatus?.isPublicUrlConfigured
                      ? `Public host detected (${seoStatus.baseUrl})`
                      : 'Publish / Deploy app to get your public HTTPS domain',
                  },
                  {
                    done: Boolean(seoStatus?.hasVerificationToken),
                    label: seoStatus?.hasVerificationToken
                      ? 'Google Search Console meta tag active'
                      : 'Optional: Paste your Google Search Console HTML token below after deploying',
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSaveVerification} className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label
                  htmlFor="gsc-token-input"
                  className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  Google Search Console Verification Token (optional)
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="gsc-token-input"
                    type="text"
                    value={verificationInput}
                    onChange={(e) => setVerificationInput(e.target.value)}
                    placeholder="Paste token or full <meta ...> tag"
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#8A1538] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={savingVerification}
                    className="shrink-0 rounded-md bg-[#8A1538] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#70102D] disabled:opacity-60"
                  >
                    {savingVerification ? 'Saving...' : 'Save Token'}
                  </button>
                </div>
                {verificationMsg && (
                  <p className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {verificationMsg}
                  </p>
                )}
                {verificationError && (
                  <p className="mt-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                    {verificationError}
                  </p>
                )}
              </form>

              <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <a
                  href="/sitemap.xml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[#8A1538] hover:underline dark:text-rose-400"
                >
                  <span>Inspect /sitemap.xml</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="/robots.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[#8A1538] hover:underline dark:text-rose-400"
                >
                  <span>Inspect /robots.txt</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === 'monetization' && (
        <div className="space-y-6">
          {/* Morning QSE Digest + AdSense Checklist */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Morning Brief Newsletter Capture */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8A1538] dark:text-rose-400">
                <Mail className="h-4 w-4" />
                <span>Audience & Newsletter Capture</span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Morning Doha Market Brief
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Pre-open QSE summary delivered Sun–Thu at 09:00 AST: QE Index & QERI levels,
                upcoming ex-dividend dates, QATR Halal ETF spreads, and institutional flow highlights.
                Builds daily repeat visits for AdSense and sponsor revenue.
              </p>

              <form onSubmit={handleSubscribe} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address for Morning Doha Brief
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investor@example.com"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#8A1538] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shrink-0 whitespace-nowrap rounded-md bg-[#8A1538] px-4 py-2 text-xs font-semibold text-white hover:bg-[#70102D] disabled:opacity-60 dark:bg-rose-700 dark:hover:bg-rose-600"
                >
                  {submitting ? 'Subscribing...' : 'Subscribe Free'}
                </button>
              </form>

              {subscribeMsg && (
                <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="newsletter-success">
                  {subscribeMsg}
                </p>
              )}
              {subscribeError && (
                <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-400">
                  {subscribeError}
                </p>
              )}

              <div className="mt-4 border-t border-slate-100 pt-3 font-mono text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Registered Brief Subscribers:{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {subscriberCount ?? 0}
                </span>
              </div>
            </section>

            {/* AdSense & SEO Readiness Checklist */}
            <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>AdSense & SEO Launch Checklist</span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                Publisher Approval & Crawlability Status
              </h3>

              <ul className="mt-3 space-y-2.5 text-xs">
                {[
                  {
                    done: true,
                    label: 'Schema.org JSON-LD + OpenGraph & dynamic per-ticker titles',
                  },
                  {
                    done: true,
                    label: 'Dynamic /sitemap.xml & /robots.txt covering all 20 QSE tickers',
                  },
                  {
                    done: true,
                    label: 'Mandatory Privacy Policy (AdSense cookies), Terms & QFMA Disclaimer',
                  },
                  {
                    done: true,
                    label: 'Non-intrusive AdSlot containers placed in News & Dividends views',
                  },
                  {
                    done: adsenseConfigured,
                    label: adsenseConfigured
                      ? `AdSense Publisher ID active (${activeAdsenseId})`
                      : 'Optional: Add your AdSense ca-pub-... ID below after domain approval',
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSaveAdsense} className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label
                  htmlFor="adsense-id-input"
                  className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  Google AdSense Publisher ID (optional)
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="adsense-id-input"
                    type="text"
                    value={adsenseInput}
                    onChange={(e) => setAdsenseInput(e.target.value)}
                    placeholder="ca-pub-1234567890123456"
                    className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#8A1538] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={savingAdsense}
                    className="shrink-0 rounded-md bg-[#8A1538] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#70102D] disabled:opacity-60"
                  >
                    {savingAdsense ? 'Saving...' : 'Apply'}
                  </button>
                </div>
                {adsenseMsg && (
                  <p className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {adsenseMsg}
                  </p>
                )}
                {adsenseError && (
                  <p className="mt-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                    {adsenseError}
                  </p>
                )}
              </form>
            </section>
          </div>

          {/* Freemium Plan Structure */}
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8A1538] dark:text-rose-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Recurring Revenue Blueprint</span>
                </div>
                <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Free Market Tier vs. Qatar Money Markets Plus (29 QAR / month)
                </h3>
              </div>
              <button
                type="button"
                onClick={onInspectCalculator}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Open Live Zakat & Purification Tool
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Free Investor Tier (Ad-Supported)
                  </h4>
                  <span className="font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">
                    0 QAR
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <li>· Live QSE benchmark & 20 blue-chip equity/ETF quotes</li>
                  <li>· Shariah compliance audit & QATR vs QETF comparison</li>
                  <li>· Upcoming QSE dividend calendar & daily news briefs</li>
                  <li>· Up to 2 browser price alerts + single-browser portfolio</li>
                </ul>
              </div>

              <div className="rounded-md border border-[#8A1538]/40 bg-rose-50/30 p-4 dark:border-rose-800/60 dark:bg-rose-950/20">
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Qatar Money Markets Plus (Ad-Free Pro)
                  </h4>
                  <span className="font-mono text-sm font-semibold text-[#8A1538] dark:text-rose-400">
                    29 QAR / mo
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                  <li>· Ad-free terminal experience & multi-device cloud portfolio sync</li>
                  <li>· Unlimited WhatsApp / Email / Push price & ex-dividend alerts</li>
                  <li>· Automated Zakat & Shariah Dividend Purification PDF statements</li>
                  <li>· Direct CB Waseet / QNBFS CSV trade history bulk import</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'disclaimer' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8A1538] dark:text-rose-400">
            <FileText className="h-4 w-4" />
            <span>Regulatory & Financial Disclaimer (QFMA Notice)</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
            Market Information Only — Not Investment Advice
          </h3>
          <div className="mt-4 space-y-3 text-xs sm:text-sm">
            <p>
              Qatar Money Markets is an independent financial information and portfolio analytics tool. Neither
              Qatar Money Markets nor its operators are licensed by the Qatar Financial Markets Authority
              (QFMA), Qatar Central Bank (QCB), or Qatar Financial Centre Regulatory Authority
              (QFCRA) as an investment advisor, broker-dealer, or portfolio manager.
            </p>
            <p>
              All Qatar Stock Exchange (QSE) quotes, index levels, dividend announcements, investor
              sentiment indicators, and technical ratios (RSI, MACD, Moving Averages) are provided
              strictly for informational and educational purposes. Market data is sourced from third-party
              public feeds and may be delayed or differ from official QSE / licensed broker order books.
            </p>
            <p>
              <strong>Shariah Screening & Zakat Disclaimer:</strong> Shariah compliance status and
              dividend purification / Zakat calculations follow widely used AAOIFI and Al Rayan
              methodologies as general estimates. Investors should verify final Shariah rulings and
              Zakat obligations with a qualified Islamic scholar or certified Sharia supervisory board.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'privacy' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Privacy Policy & Advertising Cookie Disclosure
          </h3>
          <div className="mt-4 space-y-3 text-xs sm:text-sm">
            <p>
              <strong>Local Portfolio Storage:</strong> Watchlists, portfolio holdings, price alerts,
              and theme preferences are stored locally in your browser via <code className="font-mono">localStorage</code>.
              We do not collect brokerage credentials or execute trades on your behalf.
            </p>
            <p>
              <strong>Morning Brief Email Subscriptions:</strong> When you voluntarily subscribe to
              the Morning Doha Brief, your email address is stored solely to deliver market summaries
              and can be removed on request at any time.
            </p>
            <p>
              <strong>Third-Party Advertising (Google AdSense):</strong> When advertising is active on
              this domain, third-party vendors including Google use cookies to serve ads based on a
              user&apos;s prior visits to this website or other websites. Users may opt out of
              personalized advertising by visiting Google Ads Settings.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'terms' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Terms of Service
          </h3>
          <div className="mt-4 space-y-3 text-xs sm:text-sm">
            <p>
              By accessing Qatar Money Markets, you agree that all market figures, historical charts, and
              analytical calculations are provided on an &ldquo;as-is&rdquo; and &ldquo;as-available&rdquo; basis without
              warranties of completeness, accuracy, or uninterrupted real-time uptime.
            </p>
            <p>
              You remain solely responsible for investment decisions, broker execution, tax/Zakat
              reporting, and verifying price thresholds prior to placing trades on the Qatar Stock
              Exchange.
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
