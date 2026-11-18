import React from 'react';
import { Bell, BellRing, Check, Plus, Trash2, Volume2, VolumeX, Zap } from 'lucide-react';
import type { PriceAlert, QseSecurity, TriggeredAlert } from '../types/market';
import { formatQarPrice } from '../utils/marketMath';
import type { NotificationPermissionState } from '../utils/notifications';

interface AlertsViewProps {
  alerts: PriceAlert[];
  triggeredAlerts: TriggeredAlert[];
  securities: QseSecurity[];
  notificationPermission: NotificationPermissionState;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRequestPermission: () => void;
  onOpenNewAlertModal: () => void;
  onToggleAlertActive: (alertId: string) => void;
  onDeleteAlert: (alertId: string) => void;
  onSimulateTrigger: (alertId: string) => void;
  onMarkAllRead: () => void;
  onClearHistory: () => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  triggeredAlerts,
  securities,
  notificationPermission,
  soundEnabled,
  onToggleSound,
  onRequestPermission,
  onOpenNewAlertModal,
  onToggleAlertActive,
  onDeleteAlert,
  onSimulateTrigger,
  onMarkAllRead,
  onClearHistory,
}) => {
  const securityMap = new Map(securities.map((s) => [s.ticker, s]));

  const formatCondition = (alert: PriceAlert) => {
    if (alert.condition === 'above') return `Price ≥ ${formatQarPrice(alert.targetValue)} QAR`;
    if (alert.condition === 'below') return `Price ≤ ${formatQarPrice(alert.targetValue)} QAR`;
    if (alert.condition === 'pct_up') return `Daily Gain ≥ +${alert.targetValue.toFixed(2)}%`;
    return `Daily Drop ≤ -${Math.abs(alert.targetValue).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Push Notification Controls */}
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-[#8A1538] dark:text-rose-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Browser Push Notifications & Alert Audio
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Status:{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {notificationPermission === 'granted'
                ? 'Browser Push Enabled'
                : notificationPermission === 'denied'
                  ? 'Browser Notifications Blocked (In-app alerts remain active)'
                  : notificationPermission === 'unsupported'
                    ? 'In-App Push Active (Browser Notification API unavailable in this frame)'
                    : 'Ready to Enable Browser Push'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{soundEnabled ? 'Chime On' : 'Chime Muted'}</span>
          </button>

          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={onRequestPermission}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Enable Browser Push</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNewAlertModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#8A1538] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#70102D] whitespace-nowrap dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Price Alert</span>
          </button>
        </div>
      </section>

      {/* Configured Price Alerts */}
      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Configured Price Alerts ({alerts.length})
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Evaluated on every live market tick
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No price alerts configured. Create an alert to receive push notifications on QSE moves.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm" data-testid="alerts-table">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3">Security</th>
                  <th className="px-3 py-3 text-right">Current Price</th>
                  <th className="px-3 py-3">Trigger Rule</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Note</th>
                  <th className="py-3 pr-5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {alerts.map((alert) => {
                  const sec = securityMap.get(alert.ticker);
                  return (
                    <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 pl-5 pr-3">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {alert.ticker}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {sec?.name ?? alert.ticker}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {sec ? `${formatQarPrice(sec.price)} QAR` : '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                        {formatCondition(alert)}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <button
                          type="button"
                          onClick={() => onToggleAlertActive(alert.id)}
                          className={`font-medium hover:underline ${
                            alert.active
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {alert.active ? 'Armed' : 'Paused / Triggered'}
                        </button>
                      </td>
                      <td className="max-w-xs truncate px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {alert.note || '—'}
                      </td>
                      <td className="py-3 pr-5 pl-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSimulateTrigger(alert.id)}
                            title="Test push notification trigger"
                            aria-label={`Test trigger alert for ${alert.ticker}`}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Zap className="h-3 w-3 text-amber-600" />
                            <span>Test Push</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAlert(alert.id)}
                            aria-label={`Delete alert for ${alert.ticker}`}
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Triggered Notification History */}
      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Notification History ({triggeredAlerts.length})
          </h2>
          {triggeredAlerts.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Mark All Read</span>
              </button>
              <button
                type="button"
                onClick={onClearHistory}
                className="text-xs font-medium text-rose-700 hover:underline dark:text-rose-400"
              >
                Clear History
              </button>
            </div>
          )}
        </div>

        {triggeredAlerts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No alerts have fired yet. Click “Test Push” on any alert above or wait for a live price
            threshold cross.
          </div>
        ) : (
          <div
            className="divide-y divide-slate-100 dark:divide-slate-800"
            data-testid="triggered-alerts-list"
          >
            {triggeredAlerts.map((item) => (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-4 px-5 py-3.5 ${
                  item.read ? '' : 'bg-rose-50/40 dark:bg-rose-950/20'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {item.ticker}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.securityName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{new Date(item.triggeredAt).toLocaleTimeString()}</span>
                    {!item.read && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#8A1538] dark:text-rose-400">Unread</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{item.message}</p>
                </div>
                <div className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatQarPrice(item.triggeredPrice)} QAR
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
