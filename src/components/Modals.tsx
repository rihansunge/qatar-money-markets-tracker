import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AlertCondition, PortfolioHolding, QseSecurity } from '../types/market';
import { formatQarPrice, parsePortfolioCsv } from '../utils/marketMath';

interface NewAlertModalProps {
  open: boolean;
  initialTicker?: string;
  securities: QseSecurity[];
  onClose: () => void;
  onSubmit: (payload: {
    ticker: string;
    condition: AlertCondition;
    targetValue: number;
    note: string;
    pushEnabled: boolean;
  }) => void;
}

export const NewAlertModal: React.FC<NewAlertModalProps> = ({
  open,
  initialTicker,
  securities,
  onClose,
  onSubmit,
}) => {
  const [ticker, setTicker] = useState(initialTicker || securities[0]?.ticker || 'QIBK');
  const [condition, setCondition] = useState<AlertCondition>('above');
  const [targetValue, setTargetValue] = useState('');
  const [note, setNote] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const t = initialTicker || securities[0]?.ticker || 'QIBK';
      setTicker(t);
      const sec = securities.find((s) => s.ticker === t);
      if (sec) {
        setTargetValue((sec.price * 1.02).toFixed(2));
      }
      setCondition('above');
      setNote('');
      setError('');
    }
  }, [open, initialTicker, securities]);

  if (!open) return null;

  const selectedSec = securities.find((s) => s.ticker === ticker);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(targetValue);
    if (!Number.isFinite(num) || num <= 0) {
      setError('Enter a valid positive target price or percentage.');
      return;
    }
    onSubmit({
      ticker,
      condition,
      targetValue: num,
      note: note.trim(),
      pushEnabled,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-alert-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2
            id="new-alert-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-50"
          >
            Create Price Alert
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price alert modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="alert-ticker"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              QSE Security
            </label>
            <select
              id="alert-ticker"
              value={ticker}
              onChange={(e) => {
                const next = e.target.value;
                setTicker(next);
                const sec = securities.find((s) => s.ticker === next);
                if (sec && (condition === 'above' || condition === 'below')) {
                  setTargetValue((sec.price * (condition === 'above' ? 1.02 : 0.98)).toFixed(2));
                }
              }}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {securities.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} — {s.name} ({s.price.toFixed(2)} QAR)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="alert-condition"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Condition
              </label>
              <select
                id="alert-condition"
                value={condition}
                onChange={(e) => {
                  const nextCond = e.target.value as AlertCondition;
                  setCondition(nextCond);
                  if (nextCond === 'pct_up' || nextCond === 'pct_down') {
                    setTargetValue('2.00');
                  } else if (selectedSec) {
                    setTargetValue(
                      (selectedSec.price * (nextCond === 'above' ? 1.02 : 0.98)).toFixed(2),
                    );
                  }
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="above">Price Rises Above</option>
                <option value="below">Price Drops Below</option>
                <option value="pct_up">Daily Gain % ≥</option>
                <option value="pct_down">Daily Drop % ≥</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="alert-target"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {condition === 'above' || condition === 'below'
                  ? 'Target Price (QAR)'
                  : 'Threshold (%)'}
              </label>
              <input
                id="alert-target"
                type="number"
                step="0.01"
                value={targetValue}
                onChange={(e) => {
                  setTargetValue(e.target.value);
                  setError('');
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="alert-note"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Note (optional)
            </label>
            <input
              id="alert-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Pre-dividend entry level"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => setPushEnabled(e.target.checked)}
              className="rounded border-slate-300 text-[#8A1538] focus:ring-[#8A1538]"
            />
            <span>Send browser push notification when triggered</span>
          </label>

          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#8A1538] px-4 py-2 text-xs font-semibold text-white hover:bg-[#70102D] dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              Save Price Alert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddPositionModalProps {
  open: boolean;
  initialTicker?: string;
  securities: QseSecurity[];
  onClose: () => void;
  onSubmit: (payload: {
    ticker: string;
    shares: number;
    avgCostQar: number;
    purchasedAt: string;
  }) => void;
}

export const AddPositionModal: React.FC<AddPositionModalProps> = ({
  open,
  initialTicker,
  securities,
  onClose,
  onSubmit,
}) => {
  const [ticker, setTicker] = useState(initialTicker || securities[0]?.ticker || 'QIBK');
  const [shares, setShares] = useState('500');
  const [avgCost, setAvgCost] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('2026-11-15');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const t = initialTicker || securities[0]?.ticker || 'QIBK';
      setTicker(t);
      const sec = securities.find((s) => s.ticker === t);
      if (sec) setAvgCost(formatQarPrice(sec.price));
      setShares('500');
      setError('');
    }
  }, [open, initialTicker, securities]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedShares = Number(shares);
    const parsedCost = Number(avgCost);
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      setError('Enter a valid positive share quantity.');
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
      setError('Enter a valid positive purchase price in QAR.');
      return;
    }
    onSubmit({
      ticker,
      shares: Math.round(parsedShares),
      avgCostQar: parsedCost,
      purchasedAt,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-position-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2
            id="add-position-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-50"
          >
            Add QSE Portfolio Position
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add position modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="pos-ticker"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              QSE Stock / ETF
            </label>
            <select
              id="pos-ticker"
              value={ticker}
              onChange={(e) => {
                const next = e.target.value;
                setTicker(next);
                const sec = securities.find((s) => s.ticker === next);
                if (sec) setAvgCost(formatQarPrice(sec.price));
              }}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {securities.map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker} — {s.name} ({s.shariah.isCompliant ? 'Shariah' : 'Conv.'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="pos-shares"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Shares
              </label>
              <input
                id="pos-shares"
                type="number"
                min="1"
                step="1"
                value={shares}
                onChange={(e) => {
                  setShares(e.target.value);
                  setError('');
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>

            <div>
              <label
                htmlFor="pos-cost"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Avg Cost (QAR)
              </label>
              <input
                id="pos-cost"
                type="number"
                min="0.001"
                step="0.001"
                value={avgCost}
                onChange={(e) => {
                  setAvgCost(e.target.value);
                  setError('');
                }}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="pos-date"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Purchase Date
            </label>
            <input
              id="pos-date"
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#8A1538] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#8A1538] px-4 py-2 text-xs font-semibold text-white hover:bg-[#70102D] dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              Save Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ImportPortfolioModalProps {
  open: boolean;
  securities: QseSecurity[];
  onClose: () => void;
  onImport: (holdings: PortfolioHolding[], replaceExisting: boolean) => void;
}

export const ImportPortfolioModal: React.FC<ImportPortfolioModalProps> = ({
  open,
  securities,
  onClose,
  onImport,
}) => {
  const [csvText, setCsvText] = useState(
    'TICKER,SHARES,AVG_COST_QAR\nQIBK,1000,21.10\nQATR,5000,2.089',
  );
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [error, setError] = useState('');

  if (!open) return null;

  const validTickers = new Set(securities.map((s) => s.ticker));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { parsed, skippedLines } = parsePortfolioCsv(csvText, validTickers);
    if (parsed.length === 0) {
      setError('No valid QSE holdings found. Format each row as TICKER,SHARES,AVG_COST.');
      return;
    }
    if (skippedLines.length > 0) {
      setError(`Skipped ${skippedLines.length} unrecognized row(s), imported ${parsed.length}.`);
    }
    onImport(parsed, replaceExisting);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-csv-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 id="import-csv-title" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Import QSE Holdings (CSV / Paste)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV import modal"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="csv-import-text" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Paste rows from CB Waseet / Excel (<code className="font-mono">TICKER, SHARES, AVG_COST</code>)
            </label>
            <textarea
              id="csv-import-text"
              rows={5}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setError('');
              }}
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:border-[#8A1538] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded border-slate-300 text-[#8A1538] focus:ring-[#8A1538]"
            />
            <span>Replace current starter/existing portfolio with imported positions</span>
          </label>

          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#8A1538] px-4 py-2 text-xs font-semibold text-white hover:bg-[#70102D] dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              Import Holdings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

