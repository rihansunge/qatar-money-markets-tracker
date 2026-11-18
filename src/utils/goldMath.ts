import type { GoldKarat } from '../types/market';

export const TROY_OUNCE_IN_GRAMS = 31.1034768;

export const KARAT_PURITY: Record<GoldKarat, number> = {
  '24K': 1.0,
  '22K': 22 / 24,
  '18K': 18 / 24,
};

/**
 * Doha physical bullion & retail differential over Malabar's international/GCC base USD/g board
 * (verified against Malabar Qatar live showroom board: 24K Qr.457.50, 22K Qr.424.00).
 */
export const MALABAR_QATAR_FACTOR: Record<GoldKarat, number> = {
  '24K': 1.01172,
  '22K': 1.01254,
  '18K': 1.0126,
};

export const DEFAULT_DOHA_KARAT_SPREADS_PCT: Record<GoldKarat, number> = {
  '24K': 3.94,
  '22K': 5.09,
  '18K': 5.57,
};

export interface SpotGoldQarBreakdown {
  xauQarPerOunce: number;
  '24K': number;
  '22K': number;
  '18K': number;
}

export interface EstimatedMalabarRow {
  karat: GoldKarat;
  purityLabel: string;
  purityFactor: number;
  appliedSpreadPct: number;
  xeSpotQarPerGram: number;
  xeEstimatedMalabarQarPerGram: number;
  malabarCurrentQarPerGram: number | null;
  diffVsMalabarQar: number | null;
  diffVsMalabarPct: number | null;
  impliedMarkupPct: number | null;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Rounds to Doha jewelry counter board steps (0.50 QAR / 0.25 QAR per gram),
 * or exact 0.01 QAR when boardStepQar <= 0.01.
 */
export function roundToBoardStep(value: number, boardStepQar = 0.5): number {
  if (!Number.isFinite(value)) return 0;
  if (boardStepQar <= 0.01) return roundTo(value, 2);
  const rounded = Math.round((value + Number.EPSILON) / boardStepQar) * boardStepQar;
  return roundTo(rounded, 2);
}

/**
 * Converts Malabar's live international USD/g board (`malabarprice/index/currentGoldRate`)
 * into Doha Qatar retail counter QAR/g rates snapped to 0.50 QAR steps.
 */
export function convertMalabarUsdToQatarBoard(params: {
  usd24: number;
  usd22: number;
  usd18: number;
  usdQar?: number;
}): { '24K': number; '22K': number; '18K': number } {
  const fx = params.usdQar && params.usdQar > 0 ? params.usdQar : 3.64;
  return {
    '24K': roundToBoardStep(params.usd24 * fx * MALABAR_QATAR_FACTOR['24K'], 0.5),
    '22K': roundToBoardStep(params.usd22 * fx * MALABAR_QATAR_FACTOR['22K'], 0.5),
    '18K': roundToBoardStep(params.usd18 * fx * MALABAR_QATAR_FACTOR['18K'], 0.5),
  };
}

/**
 * Converts live XE.com XAU/USD + USD/QAR into pure interbank spot QAR per gram
 * across 24K, 22K, and 18K purities.
 */
export function calculateSpotGoldQarPerGram(
  xauUsd: number,
  usdQar = 3.64,
): SpotGoldQarBreakdown {
  if (!Number.isFinite(xauUsd) || xauUsd <= 0 || !Number.isFinite(usdQar) || usdQar <= 0) {
    return { xauQarPerOunce: 0, '24K': 0, '22K': 0, '18K': 0 };
  }
  const xauQarPerOunce = xauUsd * usdQar;
  const raw24 = xauQarPerOunce / TROY_OUNCE_IN_GRAMS;
  return {
    xauQarPerOunce: roundTo(xauQarPerOunce, 2),
    '24K': roundTo(raw24 * KARAT_PURITY['24K'], 2),
    '22K': roundTo(raw24 * KARAT_PURITY['22K'], 2),
    '18K': roundTo(raw24 * KARAT_PURITY['18K'], 2),
  };
}

/**
 * Measures the observed per-karat markup (%) that Malabar Gold's Doha counter rate
 * currently carries above raw XE.com interbank spot parity.
 */
export function computeObservedMalabarKaratSpreadsPct(
  xauUsd: number,
  usdQar: number,
  malabarRates: { '24K': number; '22K': number; '18K': number } | null,
): Record<GoldKarat, number> {
  if (!malabarRates || xauUsd <= 0 || usdQar <= 0) {
    return { ...DEFAULT_DOHA_KARAT_SPREADS_PCT };
  }
  const spot = calculateSpotGoldQarPerGram(xauUsd, usdQar);
  const calc = (k: GoldKarat): number => {
    const m = malabarRates[k];
    const s = spot[k];
    if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(s) || s <= 0) {
      return DEFAULT_DOHA_KARAT_SPREADS_PCT[k];
    }
    const pct = ((m / s) - 1) * 100;
    if (!Number.isFinite(pct) || pct < -2 || pct > 12) {
      return DEFAULT_DOHA_KARAT_SPREADS_PCT[k];
    }
    return roundTo(pct, 2);
  };

  return {
    '24K': calc('24K'),
    '22K': calc('22K'),
    '18K': calc('18K'),
  };
}

/**
 * Derives the average observed percentage premium (%) that Malabar Gold's Doha counter rate
 * currently carries above raw XE.com interbank spot parity.
 */
export function computeObservedMalabarSpreadPct(
  xauUsd: number,
  usdQar: number,
  malabarRates: { '24K': number; '22K': number; '18K': number } | null,
  fallbackSpreadPct = 4.87,
): number {
  if (!malabarRates || xauUsd <= 0 || usdQar <= 0) {
    return fallbackSpreadPct;
  }
  const byKarat = computeObservedMalabarKaratSpreadsPct(xauUsd, usdQar, malabarRates);
  const avg = (byKarat['24K'] + byKarat['22K'] + byKarat['18K']) / 3;
  if (!Number.isFinite(avg) || avg < -2 || avg > 12) return fallbackSpreadPct;
  return roundTo(avg, 2);
}

/**
 * Builds the 24K, 22K, 18K side-by-side comparison table between:
 *  1) Current Malabar Gold & Diamonds Qatar retail rate (live QAR/g)
 *  2) XE.com Conversion Estimation reflecting how Malabar prices QAR retail rates
 *     from live XAU/USD * USD/QAR / 31.1034768 * purity * (1 + spreadPct / 100)
 *  3) Raw XE.com interbank melt value (0% markup)
 */
export function buildQatarGoldComparisonRows(options: {
  xauUsd: number;
  usdQar: number;
  malabarRates: { '24K': number; '22K': number; '18K': number } | null;
  retailSpreadPct: number;
  karatSpreadsPct?: Record<GoldKarat, number>;
  boardStepQar?: number;
}): EstimatedMalabarRow[] {
  const spot = calculateSpotGoldQarPerGram(options.xauUsd, options.usdQar);
  const step = options.boardStepQar ?? 0.5;

  const meta: Array<{ karat: GoldKarat; purityLabel: string }> = [
    { karat: '24K', purityLabel: '999.9 Fine (Bullion / Coins)' },
    { karat: '22K', purityLabel: '916 Purity (GCC Jewelry Std)' },
    { karat: '18K', purityLabel: '750 Purity (Diamond / Studded)' },
  ];

  return meta.map(({ karat, purityLabel }) => {
    const xeSpot = spot[karat];
    const appliedSpreadPct = options.karatSpreadsPct
      ? options.karatSpreadsPct[karat]
      : options.retailSpreadPct;
    const spreadFactor = 1 + appliedSpreadPct / 100;
    const xeEstimated = roundToBoardStep(xeSpot * spreadFactor, step);
    const malabarVal =
      options.malabarRates && Number.isFinite(options.malabarRates[karat]) && options.malabarRates[karat] > 0
        ? roundTo(options.malabarRates[karat], 2)
        : null;
    const diffQar = malabarVal !== null ? roundTo(xeEstimated - malabarVal, 2) : null;
    const diffPct =
      malabarVal !== null && malabarVal > 0 ? roundTo(((xeEstimated - malabarVal) / malabarVal) * 100, 2) : null;
    const impliedMarkupPct =
      malabarVal !== null && xeSpot > 0 ? roundTo(((malabarVal - xeSpot) / xeSpot) * 100, 2) : null;

    return {
      karat,
      purityLabel,
      purityFactor: roundTo(KARAT_PURITY[karat], 4),
      appliedSpreadPct: roundTo(appliedSpreadPct, 2),
      xeSpotQarPerGram: xeSpot,
      xeEstimatedMalabarQarPerGram: xeEstimated,
      malabarCurrentQarPerGram: malabarVal,
      diffVsMalabarQar: diffQar,
      diffVsMalabarPct: diffPct,
      impliedMarkupPct,
    };
  });
}

export function formatQarRate(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
