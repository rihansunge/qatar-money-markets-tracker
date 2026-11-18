import React, { useEffect, useRef } from 'react';

interface AdSlotProps {
  slotId: string;
  label?: string;
  onConfigureClick?: () => void;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

function resolveAdsenseClientId(): string {
  const envId = (import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined)?.trim() || '';
  const storedId =
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('qmm_adsense_client_id') || '').trim()
      : '';
  const candidate = envId || storedId;
  return /^ca-pub-\d{8,}$/i.test(candidate) ? candidate : '';
}

export const AdSlot: React.FC<AdSlotProps> = ({
  slotId,
  label = 'Advertisement · AdSense Placement',
  onConfigureClick,
}) => {
  const [clientId, setClientId] = React.useState<string>(() => resolveAdsenseClientId());
  const pushedRef = useRef(false);

  useEffect(() => {
    const syncId = () => setClientId(resolveAdsenseClientId());
    window.addEventListener('qmm-monetization-updated', syncId);
    window.addEventListener('storage', syncId);
    return () => {
      window.removeEventListener('qmm-monetization-updated', syncId);
      window.removeEventListener('storage', syncId);
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-dohaborsa-adsense="true"]',
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        clientId,
      )}`;
      script.crossOrigin = 'anonymous';
      script.dataset.dohaborsaAdsense = 'true';
      document.head.appendChild(script);
    }

    if (!pushedRef.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushedRef.current = true;
      } catch {
        // Ignore until AdSense script hydrates on an approved custom domain
      }
    }
  }, [clientId]);

  if (clientId) {
    return (
      <aside
        aria-label="Sponsored advertisement"
        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {label}
        </div>
        <ins
          className="adsbygoogle block min-h-[90px] w-full"
          style={{ display: 'block' }}
          data-ad-client={clientId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </aside>
    );
  }

  return (
    <aside
      aria-label="Advertisement slot preview"
      data-testid={`ad-slot-${slotId}`}
      className="flex flex-col items-start justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900/60"
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </div>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          Responsive Display Unit (728×90 Desktop · 320×100 Mobile) — ready for{' '}
          <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
            VITE_ADSENSE_CLIENT_ID
          </code>{' '}
          or direct Qatari fintech sponsors.
        </p>
      </div>
      {onConfigureClick && (
        <button
          type="button"
          onClick={onConfigureClick}
          className="shrink-0 whitespace-nowrap rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Monetization Setup
        </button>
      )}
    </aside>
  );
};
