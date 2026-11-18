import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQatarGoldComparisonRows,
  calculateSpotGoldQarPerGram,
  computeObservedMalabarKaratSpreadsPct,
  computeObservedMalabarSpreadPct,
  convertMalabarUsdToQatarBoard,
  roundToBoardStep,
} from './goldMath';

test('calculateSpotGoldQarPerGram converts live XE XAU/USD and USD/QAR to 24K/22K/18K QAR/g', () => {
  const spot = calculateSpotGoldQarPerGram(3761.1, 3.64);
  assert.equal(spot.xauQarPerOunce, 13690.4);
  assert.equal(spot['24K'], 440.16);
  assert.equal(spot['22K'], 403.48);
  assert.equal(spot['18K'], 330.12);
});

test('convertMalabarUsdToQatarBoard maps live Malabar international USD/g to Qatar 0.50 QAR board', () => {
  const qar = convertMalabarUsdToQatarBoard({
    usd24: 124.23,
    usd22: 115.04,
    usd18: 94.55,
    usdQar: 3.64,
  });
  assert.equal(qar['24K'], 457.5);
  assert.equal(qar['22K'], 424.0);
  assert.equal(qar['18K'], 348.5);
});

test('roundToBoardStep snaps rates to 0.50 QAR and 0.25 QAR jewelry board increments cleanly', () => {
  assert.equal(roundToBoardStep(457.49, 0.5), 457.5);
  assert.equal(roundToBoardStep(423.99, 0.5), 424.0);
  assert.equal(roundToBoardStep(442.39, 0.25), 442.5);
  assert.equal(roundToBoardStep(442.39, 0.01), 442.39);
});

test('computeObservedMalabarKaratSpreadsPct measures real per-karat Malabar Doha markup over XE spot', () => {
  const perKarat = computeObservedMalabarKaratSpreadsPct(3761.1, 3.64, {
    '24K': 457.5,
    '22K': 424.0,
    '18K': 348.5,
  });
  // 24K: 457.50 / 440.16 = +3.94%, 22K: 424.00 / 403.48 = +5.09%, 18K: 348.50 / 330.12 = +5.57%
  assert.equal(perKarat['24K'], 3.94);
  assert.equal(perKarat['22K'], 5.09);
  assert.equal(perKarat['18K'], 5.57);

  const avg = computeObservedMalabarSpreadPct(3761.1, 3.64, {
    '24K': 457.5,
    '22K': 424.0,
    '18K': 348.5,
  });
  assert.equal(avg, 4.87);
});

test('buildQatarGoldComparisonRows returns aligned 24K, 22K, and 18K rows comparing Malabar and XE estimate', () => {
  const karatSpreads = computeObservedMalabarKaratSpreadsPct(3761.1, 3.64, {
    '24K': 457.5,
    '22K': 424.0,
    '18K': 348.5,
  });
  const rows = buildQatarGoldComparisonRows({
    xauUsd: 3761.1,
    usdQar: 3.64,
    malabarRates: { '24K': 457.5, '22K': 424.0, '18K': 348.5 },
    retailSpreadPct: 4.87,
    karatSpreadsPct: karatSpreads,
    boardStepQar: 0.5,
  });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].malabarCurrentQarPerGram, 457.5);
  assert.equal(rows[0].xeEstimatedMalabarQarPerGram, 457.5);
  assert.equal(rows[1].malabarCurrentQarPerGram, 424.0);
  assert.equal(rows[1].xeEstimatedMalabarQarPerGram, 424.0);
  assert.equal(rows[2].malabarCurrentQarPerGram, 348.5);
  assert.equal(rows[2].xeEstimatedMalabarQarPerGram, 348.5);
});
