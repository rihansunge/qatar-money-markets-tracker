import type {
  HoldingValuation,
  InvestorFlowGroup,
  MarketIndex,
  MarketSentimentSummary,
  OhlcBar,
  PortfolioAnalytics,
  PortfolioHolding,
  PriceAlert,
  QseSecurity,
  Sector,
  SentimentVoteState,
  StockSentimentAnalysis,
  TriggeredAlert,
} from '../types/market';

export function roundTo(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function getDayChange(price: number, previousClose: number): {
  change: number;
  changePct: number;
} {
  if (previousClose <= 0) {
    return { change: 0, changePct: 0 };
  }
  const change = roundTo(price - previousClose, 3);
  const changePct = roundTo(((price - previousClose) / previousClose) * 100, 2);
  return { change, changePct };
}

export function calculatePortfolioAnalytics(
  holdings: PortfolioHolding[],
  securities: QseSecurity[],
): PortfolioAnalytics {
  const securityMap = new Map(securities.map((s) => [s.ticker, s]));
  const rawValuations: Array<Omit<HoldingValuation, 'weightPct'>> = [];

  let totalValueQar = 0;
  let totalCostQar = 0;
  let dayChangeQar = 0;
  let shariahValueQar = 0;
  let conventionalValueQar = 0;
  let etfValueQar = 0;
  let projectedAnnualDividendQar = 0;
  let weightedBetaSum = 0;

  const sectorTotals = new Map<Sector, number>();

  for (const holding of holdings) {
    const security = securityMap.get(holding.ticker);
    if (!security || holding.shares <= 0) continue;

    const marketValueQar = holding.shares * security.price;
    const costBasisQar = holding.shares * holding.avgCostQar;
    const unrealizedPnlQar = marketValueQar - costBasisQar;
    const unrealizedPnlPct = costBasisQar > 0 ? (unrealizedPnlQar / costBasisQar) * 100 : 0;
    const holdingDayChange = holding.shares * (security.price - security.previousClose);
    const holdingDayChangePct =
      security.previousClose > 0
        ? ((security.price - security.previousClose) / security.previousClose) * 100
        : 0;
    const annualDiv = holding.shares * security.lastDividendQar;

    totalValueQar += marketValueQar;
    totalCostQar += costBasisQar;
    dayChangeQar += holdingDayChange;
    projectedAnnualDividendQar += annualDiv;
    weightedBetaSum += marketValueQar * security.beta;

    if (security.shariah.isCompliant) {
      shariahValueQar += marketValueQar;
    } else {
      conventionalValueQar += marketValueQar;
    }

    if (security.assetType === 'etf') {
      etfValueQar += marketValueQar;
    }

    sectorTotals.set(security.sector, (sectorTotals.get(security.sector) ?? 0) + marketValueQar);

    rawValuations.push({
      holding,
      security,
      marketValueQar: roundTo(marketValueQar, 2),
      costBasisQar: roundTo(costBasisQar, 2),
      unrealizedPnlQar: roundTo(unrealizedPnlQar, 2),
      unrealizedPnlPct: roundTo(unrealizedPnlPct, 2),
      dayChangeQar: roundTo(holdingDayChange, 2),
      dayChangePct: roundTo(holdingDayChangePct, 2),
      projectedAnnualDividendQar: roundTo(annualDiv, 2),
    });
  }

  const valuations: HoldingValuation[] = rawValuations
    .map((item) => ({
      ...item,
      weightPct: totalValueQar > 0 ? roundTo((item.marketValueQar / totalValueQar) * 100, 1) : 0,
    }))
    .sort((a, b) => b.marketValueQar - a.marketValueQar);

  const prevTotalValue = totalValueQar - dayChangeQar;
  const dayChangePct = prevTotalValue > 0 ? (dayChangeQar / prevTotalValue) * 100 : 0;
  const unrealizedPnlQar = totalValueQar - totalCostQar;
  const unrealizedPnlPct = totalCostQar > 0 ? (unrealizedPnlQar / totalCostQar) * 100 : 0;

  const sectorAllocations = Array.from(sectorTotals.entries())
    .map(([sector, valueQar]) => ({
      sector,
      valueQar: roundTo(valueQar, 2),
      weightPct: totalValueQar > 0 ? roundTo((valueQar / totalValueQar) * 100, 1) : 0,
    }))
    .sort((a, b) => b.valueQar - a.valueQar);

  let bestPerformer: HoldingValuation | null = null;
  let worstPerformer: HoldingValuation | null = null;
  for (const item of valuations) {
    if (!bestPerformer || item.unrealizedPnlPct > bestPerformer.unrealizedPnlPct) {
      bestPerformer = item;
    }
    if (!worstPerformer || item.unrealizedPnlPct < worstPerformer.unrealizedPnlPct) {
      worstPerformer = item;
    }
  }

  return {
    totalValueQar: roundTo(totalValueQar, 2),
    totalCostQar: roundTo(totalCostQar, 2),
    unrealizedPnlQar: roundTo(unrealizedPnlQar, 2),
    unrealizedPnlPct: roundTo(unrealizedPnlPct, 2),
    dayChangeQar: roundTo(dayChangeQar, 2),
    dayChangePct: roundTo(dayChangePct, 2),
    shariahValueQar: roundTo(shariahValueQar, 2),
    shariahPct: totalValueQar > 0 ? roundTo((shariahValueQar / totalValueQar) * 100, 1) : 0,
    conventionalValueQar: roundTo(conventionalValueQar, 2),
    conventionalPct:
      totalValueQar > 0 ? roundTo((conventionalValueQar / totalValueQar) * 100, 1) : 0,
    etfValueQar: roundTo(etfValueQar, 2),
    etfPct: totalValueQar > 0 ? roundTo((etfValueQar / totalValueQar) * 100, 1) : 0,
    projectedAnnualDividendQar: roundTo(projectedAnnualDividendQar, 2),
    portfolioYieldPct:
      totalValueQar > 0 ? roundTo((projectedAnnualDividendQar / totalValueQar) * 100, 2) : 0,
    weightedBeta: totalValueQar > 0 ? roundTo(weightedBetaSum / totalValueQar, 2) : 1,
    holdings: valuations,
    sectorAllocations,
    bestPerformer,
    worstPerformer,
  };
}

export function calculateSMA(closes: number[], period: number): Array<number | null> {
  if (period <= 0) return closes.map(() => null);
  const result: Array<number | null> = [];
  let runningSum = 0;

  for (let i = 0; i < closes.length; i++) {
    runningSum += closes[i];
    if (i >= period) {
      runningSum -= closes[i - period];
    }
    if (i < period - 1) {
      result.push(null);
    } else {
      result.push(roundTo(runningSum / period, 3));
    }
  }

  return result;
}

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return roundTo(100 - 100 / (1 + rs), 1);
}

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateMACD(closes: number[]): {
  macdLine: number;
  signalLine: number;
  histogram: number;
  signalLabel: 'Bullish Crossover' | 'Positive Momentum' | 'Neutral' | 'Bearish Pressure';
} {
  if (closes.length < 26) {
    return { macdLine: 0, signalLine: 0, histogram: 0, signalLabel: 'Neutral' };
  }
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdSeries = ema12.map((val, idx) => val - ema26[idx]);
  const signalSeries = calculateEMA(macdSeries, 9);

  const lastIdx = macdSeries.length - 1;
  const macdLine = roundTo(macdSeries[lastIdx], 3);
  const signalLine = roundTo(signalSeries[lastIdx], 3);
  const histogram = roundTo(macdLine - signalLine, 3);
  const prevHist = macdSeries[lastIdx - 1] - signalSeries[lastIdx - 1];

  let signalLabel: 'Bullish Crossover' | 'Positive Momentum' | 'Neutral' | 'Bearish Pressure' =
    'Neutral';
  if (histogram > 0 && prevHist <= 0) {
    signalLabel = 'Bullish Crossover';
  } else if (histogram > 0.005) {
    signalLabel = 'Positive Momentum';
  } else if (histogram < -0.005) {
    signalLabel = 'Bearish Pressure';
  }

  return { macdLine, signalLine, histogram, signalLabel };
}

export function computeStockSentiment(
  security: QseSecurity,
  bars: OhlcBar[],
  voteState?: SentimentVoteState,
): StockSentimentAnalysis {
  const closes = bars.map((b) => b.close);
  const rsi14 = calculateRSI(closes, 14);
  const sma20Arr = calculateSMA(closes, 20);
  const sma50Arr = calculateSMA(closes, 50);
  const sma20 = sma20Arr[sma20Arr.length - 1] ?? security.price;
  const sma50 = sma50Arr[sma50Arr.length - 1] ?? security.price;
  const macd = calculateMACD(closes);

  const totalVotes = voteState ? voteState.bullish + voteState.neutral + voteState.bearish : 0;
  const communityBullishPct =
    totalVotes > 0 && voteState
      ? roundTo(((voteState.bullish + voteState.neutral * 0.5) / totalVotes) * 100, 1)
      : security.analystBuyPct;

  // Score components (0 - 100)
  let techScore = 50;
  if (security.price > sma20) techScore += 12;
  else techScore -= 10;
  if (security.price > sma50) techScore += 12;
  else techScore -= 10;
  if (rsi14 >= 50 && rsi14 <= 70) techScore += 10;
  else if (rsi14 > 70) techScore += 4; // strong momentum but stretched
  else if (rsi14 < 35) techScore -= 12;
  if (macd.histogram > 0) techScore += 10;
  else techScore -= 8;

  const analystScore = security.analystBuyPct * 0.9 + security.analystHoldPct * 0.45;
  const flowScore = Math.max(0, Math.min(100, 50 + security.institutionalFlowMillionQar * 1.4));
  const compositeScore = Math.round(
    Math.max(5, Math.min(98, techScore * 0.45 + analystScore * 0.3 + flowScore * 0.15 + communityBullishPct * 0.1)),
  );

  let regime: StockSentimentAnalysis['regime'] = 'Neutral';
  if (compositeScore >= 75) regime = 'Strong Bullish';
  else if (compositeScore >= 60) regime = 'Bullish';
  else if (compositeScore >= 45) regime = 'Neutral';
  else if (compositeScore >= 32) regime = 'Cautious';
  else regime = 'Bearish';

  let institutionalBias: StockSentimentAnalysis['institutionalBias'] = 'Balanced';
  if (security.institutionalFlowMillionQar >= 3) institutionalBias = 'Net Accumulation';
  else if (security.institutionalFlowMillionQar <= -3) institutionalBias = 'Net Distribution';

  return {
    ticker: security.ticker,
    compositeScore,
    regime,
    rsi14,
    sma20: roundTo(sma20, 3),
    sma50: roundTo(sma50, 3),
    macdHistogram: macd.histogram,
    macdSignal: macd.signalLabel,
    communityBullishPct,
    institutionalBias,
  };
}

export function computeMarketSentimentIndex(
  securities: QseSecurity[],
  flows: InvestorFlowGroup[],
): MarketSentimentSummary {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let near52WeekHighCount = 0;
  let near52WeekLowCount = 0;

  for (const s of securities) {
    const { change } = getDayChange(s.price, s.previousClose);
    if (change > 0.001) advancers++;
    else if (change < -0.001) decliners++;
    else unchanged++;

    const range = s.week52High - s.week52Low;
    if (range > 0) {
      const pos = (s.price - s.week52Low) / range;
      if (pos >= 0.8) near52WeekHighCount++;
      if (pos <= 0.2) near52WeekLowCount++;
    }
  }

  const totalMoved = advancers + decliners;
  const breadthRatio = totalMoved > 0 ? roundTo(advancers / Math.max(1, decliners), 2) : 1;
  const breadthScore = totalMoved > 0 ? (advancers / totalMoved) * 100 : 50;

  const netInstitutionalFlowMillionQar = roundTo(
    flows
      .filter((f) => f.category.includes('Institutional'))
      .reduce((acc, f) => acc + f.netMillionQar, 0),
    1,
  );
  const netForeignFlowMillionQar = roundTo(
    flows
      .filter((f) => f.category.includes('Foreign'))
      .reduce((acc, f) => acc + f.netMillionQar, 0),
    1,
  );

  const flowScore = Math.max(0, Math.min(100, 50 + netInstitutionalFlowMillionQar * 0.8));
  const highLowScore =
    securities.length > 0
      ? 50 + ((near52WeekHighCount - near52WeekLowCount) / securities.length) * 80
      : 50;

  const compositeScore = Math.round(
    Math.max(5, Math.min(95, breadthScore * 0.45 + flowScore * 0.35 + highLowScore * 0.2)),
  );

  let regime: MarketSentimentSummary['regime'] = 'Neutral';
  if (compositeScore >= 75) regime = 'Greed';
  else if (compositeScore >= 58) regime = 'Optimistic';
  else if (compositeScore >= 42) regime = 'Neutral';
  else if (compositeScore >= 26) regime = 'Cautious';
  else regime = 'Fear';

  return {
    compositeScore,
    regime,
    advancers,
    decliners,
    unchanged,
    breadthRatio,
    near52WeekHighCount,
    near52WeekLowCount,
    netInstitutionalFlowMillionQar,
    netForeignFlowMillionQar,
  };
}

export function evaluatePriceAlerts(
  alerts: PriceAlert[],
  securities: QseSecurity[],
  nowIso: string,
): { updatedAlerts: PriceAlert[]; newlyTriggered: TriggeredAlert[] } {
  const securityMap = new Map(securities.map((s) => [s.ticker, s]));
  const newlyTriggered: TriggeredAlert[] = [];

  const updatedAlerts = alerts.map((alert) => {
    if (!alert.active) return alert;
    const sec = securityMap.get(alert.ticker);
    if (!sec) return alert;

    const { changePct } = getDayChange(sec.price, sec.previousClose);
    let matched = false;
    let reason = '';

    if (alert.condition === 'above' && sec.price >= alert.targetValue) {
      matched = true;
      reason = `${sec.ticker} reached ${formatQarPrice(sec.price)} QAR (target ≥ ${formatQarPrice(alert.targetValue)} QAR)`;
    } else if (alert.condition === 'below' && sec.price <= alert.targetValue) {
      matched = true;
      reason = `${sec.ticker} dropped to ${formatQarPrice(sec.price)} QAR (target ≤ ${formatQarPrice(alert.targetValue)} QAR)`;
    } else if (alert.condition === 'pct_up' && changePct >= alert.targetValue) {
      matched = true;
      reason = `${sec.ticker} surged +${changePct.toFixed(2)}% today (threshold +${alert.targetValue.toFixed(2)}%)`;
    } else if (alert.condition === 'pct_down' && changePct <= -Math.abs(alert.targetValue)) {
      matched = true;
      reason = `${sec.ticker} fell ${changePct.toFixed(2)}% today (threshold -${Math.abs(alert.targetValue).toFixed(2)}%)`;
    }

    if (!matched) return alert;

    newlyTriggered.push({
      id: `trig-${alert.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alertId: alert.id,
      ticker: sec.ticker,
      securityName: sec.name,
      message: alert.note ? `${reason} — ${alert.note}` : reason,
      triggeredPrice: sec.price,
      triggeredAt: nowIso,
      read: false,
    });

    return {
      ...alert,
      active: false,
      lastTriggeredAt: nowIso,
    };
  });

  return { updatedAlerts, newlyTriggered };
}

export function simulateMarketTick(
  securities: QseSecurity[],
  indices: MarketIndex[],
  seedStep: number,
): { securities: QseSecurity[]; indices: MarketIndex[] } {
  let weightedMovePctSum = 0;
  let totalWeight = 0;
  let shariahWeightedMoveSum = 0;
  let shariahWeight = 0;

  const updatedSecurities = securities.map((sec, idx) => {
    // Deterministic-leaning micro oscillation so real-time ticks look organic without drifting wildly
    const phase = Math.sin(seedStep * 1.37 + idx * 2.13) * 0.55 + (Math.random() - 0.5) * 0.9;
    const stepPct = phase * 0.0022; // ~ +/- 0.3% max per tick
    const rawNext = sec.price * (1 + stepPct);
    const minBound = sec.previousClose * 0.94;
    const maxBound = sec.previousClose * 1.06;
    const nextPrice = roundTo(Math.max(minBound, Math.min(maxBound, rawNext)), 2);

    const volBump = Math.floor(Math.abs(phase) * (sec.assetType === 'etf' ? 4200 : 18500)) + 900;
    const nextVolume = sec.volume + volBump;
    const nextTurnover = roundTo(sec.turnoverQar + volBump * nextPrice, 0);
    const nextSparkline = [...sec.sparkline.slice(1), nextPrice];

    weightedMovePctSum += ((nextPrice - sec.price) / sec.price) * sec.marketCapMillionQar;
    totalWeight += sec.marketCapMillionQar;
    if (sec.shariah.isCompliant) {
      shariahWeightedMoveSum += ((nextPrice - sec.price) / sec.price) * sec.marketCapMillionQar;
      shariahWeight += sec.marketCapMillionQar;
    }

    return {
      ...sec,
      price: nextPrice,
      dayHigh: Math.max(sec.dayHigh, nextPrice),
      dayLow: Math.min(sec.dayLow, nextPrice),
      volume: nextVolume,
      turnoverQar: nextTurnover,
      sparkline: nextSparkline,
    };
  });

  const marketTickPct = totalWeight > 0 ? weightedMovePctSum / totalWeight : 0;
  const shariahTickPct = shariahWeight > 0 ? shariahWeightedMoveSum / shariahWeight : marketTickPct;

  const updatedIndices = indices.map((index) => {
    const pct = index.symbol === 'QERI' ? shariahTickPct : marketTickPct;
    const nextVal = roundTo(index.value * (1 + pct), 2);
    return {
      ...index,
      value: nextVal,
      dayHigh: Math.max(index.dayHigh, nextVal),
      dayLow: Math.min(index.dayLow, nextVal),
      sparkline: [...index.sparkline.slice(1), nextVal],
    };
  });

  return { securities: updatedSecurities, indices: updatedIndices };
}

export function formatQarPrice(price: number): string {
  const millis = Math.round(price * 1000);
  const hasThirdDecimal = millis % 10 !== 0;
  return price.toFixed(hasThirdDecimal ? 3 : 2);
}

export interface LiveQseSnapshotPayload {
  source: string;
  fetchedAt: string;
  indices: Array<{
    symbol: 'QSI' | 'QERI' | 'QEAS';
    value: number;
    previousClose: number;
    dayHigh: number;
    dayLow: number;
    sparkline?: number[];
  }>;
  quotes: Record<
    string,
    {
      ticker: string;
      price: number;
      previousClose: number;
      open: number;
      dayHigh: number;
      dayLow: number;
      week52High?: number;
      week52Low?: number;
      volume: number;
      turnoverQar: number;
      marketCapMillionQar?: number;
      peRatio?: number | null;
      pbRatio?: number | null;
      beta?: number;
      sparkline?: number[];
    }
  >;
}

export function mergeLiveQseSnapshot(
  currentIndices: MarketIndex[],
  currentSecurities: QseSecurity[],
  payload: LiveQseSnapshotPayload,
): { indices: MarketIndex[]; securities: QseSecurity[] } {
  const indexMap = new Map(payload.indices.map((i) => [i.symbol, i]));

  const nextIndices = currentIndices.map((idx) => {
    const patch = indexMap.get(idx.symbol);
    if (!patch || !Number.isFinite(patch.value) || patch.value <= 0) return idx;
    const nextSparkline =
      patch.sparkline && patch.sparkline.length >= 2
        ? [...patch.sparkline.slice(0, -1), patch.value]
        : idx.sparkline.length >= 2
          ? [...idx.sparkline.slice(0, -1), patch.value]
          : idx.sparkline;
    return {
      ...idx,
      value: patch.value,
      previousClose: patch.previousClose > 0 ? patch.previousClose : idx.previousClose,
      dayHigh: patch.dayHigh > 0 ? patch.dayHigh : idx.dayHigh,
      dayLow: patch.dayLow > 0 ? patch.dayLow : idx.dayLow,
      sparkline: nextSparkline,
    };
  });

  const nextSecurities = currentSecurities.map((sec) => {
    const patch = payload.quotes[sec.ticker];
    if (!patch || !Number.isFinite(patch.price) || patch.price <= 0) return sec;
    const dividendYieldPct =
      sec.lastDividendQar > 0
        ? roundTo((sec.lastDividendQar / patch.price) * 100, 2)
        : sec.dividendYieldPct;
    const nextSparkline =
      patch.sparkline && patch.sparkline.length >= 2
        ? [...patch.sparkline.slice(0, -1), patch.price]
        : sec.sparkline.length >= 2
          ? [...sec.sparkline.slice(0, -1), patch.price]
          : sec.sparkline;
    return {
      ...sec,
      price: patch.price,
      previousClose: patch.previousClose > 0 ? patch.previousClose : sec.previousClose,
      open: patch.open > 0 ? patch.open : sec.open,
      dayHigh: patch.dayHigh > 0 ? patch.dayHigh : sec.dayHigh,
      dayLow: patch.dayLow > 0 ? patch.dayLow : sec.dayLow,
      week52High: patch.week52High && patch.week52High > 0 ? patch.week52High : sec.week52High,
      week52Low: patch.week52Low && patch.week52Low > 0 ? patch.week52Low : sec.week52Low,
      volume: patch.volume > 0 ? patch.volume : sec.volume,
      turnoverQar: patch.turnoverQar > 0 ? patch.turnoverQar : sec.turnoverQar,
      marketCapMillionQar:
        patch.marketCapMillionQar && patch.marketCapMillionQar > 0
          ? patch.marketCapMillionQar
          : sec.marketCapMillionQar,
      peRatio:
        patch.peRatio !== undefined && patch.peRatio !== null && patch.peRatio > 0 && patch.peRatio < 120
          ? patch.peRatio
          : sec.peRatio,
      pbRatio:
        patch.pbRatio !== undefined && patch.pbRatio !== null && patch.pbRatio > 0
          ? patch.pbRatio
          : sec.pbRatio,
      beta: patch.beta && patch.beta > 0 ? patch.beta : sec.beta,
      dividendYieldPct,
      sparkline: nextSparkline,
    };
  });

  return { indices: nextIndices, securities: nextSecurities };
}

export function diffLiveTicks(
  prevIndices: MarketIndex[],
  prevSecurities: QseSecurity[],
  nextIndices: MarketIndex[],
  nextSecurities: QseSecurity[],
): Record<string, 'up' | 'down'> {
  const flashes: Record<string, 'up' | 'down'> = {};
  const prevIdxMap = new Map(prevIndices.map((i) => [i.symbol, i.value]));
  for (const idx of nextIndices) {
    const prev = prevIdxMap.get(idx.symbol);
    if (prev !== undefined && Math.abs(idx.value - prev) > 0.0005) {
      flashes[idx.symbol] = idx.value > prev ? 'up' : 'down';
    }
  }
  const prevSecMap = new Map(prevSecurities.map((s) => [s.ticker, s.price]));
  for (const sec of nextSecurities) {
    const prev = prevSecMap.get(sec.ticker);
    if (prev !== undefined && Math.abs(sec.price - prev) > 0.0005) {
      flashes[sec.ticker] = sec.price > prev ? 'up' : 'down';
    }
  }
  return flashes;
}

export type ZakatMethod = 'trading' | 'long_term';

export interface ShariahPurificationLine {
  ticker: string;
  name: string;
  shares: number;
  marketValueQar: number;
  projectedDividendQar: number;
  nonCompliantIncomePct: number;
  purificationQar: number;
  isCompliant: boolean;
}

export interface ShariahZakatSummary {
  method: ZakatMethod;
  totalPortfolioQar: number;
  shariahCompliantValueQar: number;
  zakatableBaseQar: number;
  estimatedZakatQar: number;
  totalPurificationQar: number;
  lines: ShariahPurificationLine[];
}

export function calculateShariahZakatAndPurification(
  holdings: PortfolioHolding[],
  securities: QseSecurity[],
  method: ZakatMethod = 'long_term',
  cashReserveQar = 0,
): ShariahZakatSummary {
  const securityMap = new Map(securities.map((s) => [s.ticker, s]));
  let totalPortfolioQar = 0;
  let shariahCompliantValueQar = 0;
  let totalPurificationQar = 0;
  const lines: ShariahPurificationLine[] = [];

  for (const h of holdings) {
    const sec = securityMap.get(h.ticker);
    if (!sec || h.shares <= 0) continue;
    const marketValueQar = roundTo(h.shares * sec.price, 2);
    const projectedDividendQar = roundTo(h.shares * sec.lastDividendQar, 2);
    const nonCompliantIncomePct = sec.shariah.nonCompliantIncomePct;
    const purificationQar = sec.shariah.isCompliant
      ? roundTo(projectedDividendQar * (nonCompliantIncomePct / 100), 2)
      : 0;

    totalPortfolioQar += marketValueQar;
    if (sec.shariah.isCompliant) {
      shariahCompliantValueQar += marketValueQar;
    }
    totalPurificationQar += purificationQar;

    lines.push({
      ticker: sec.ticker,
      name: sec.name,
      shares: h.shares,
      marketValueQar,
      projectedDividendQar,
      nonCompliantIncomePct,
      purificationQar,
      isCompliant: sec.shariah.isCompliant,
    });
  }

  // Standard AAOIFI 2.5% on full value for active trading, or 25% Zakatable liquid-asset proxy for long-term hold
  const safeCash = Math.max(0, Number.isFinite(cashReserveQar) ? cashReserveQar : 0);
  const equityZakatable =
    method === 'trading' ? shariahCompliantValueQar : shariahCompliantValueQar * 0.25;
  const zakatableBaseQar = roundTo(equityZakatable + safeCash, 2);
  const estimatedZakatQar = roundTo(zakatableBaseQar * 0.025, 2);

  return {
    method,
    totalPortfolioQar: roundTo(totalPortfolioQar, 2),
    shariahCompliantValueQar: roundTo(shariahCompliantValueQar, 2),
    zakatableBaseQar,
    estimatedZakatQar,
    totalPurificationQar: roundTo(totalPurificationQar, 2),
    lines,
  };
}

export function parsePortfolioCsv(
  rawText: string,
  validTickers: Set<string>,
  fallbackDate = '2026-11-16',
): {
  parsed: PortfolioHolding[];
  skippedLines: string[];
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: PortfolioHolding[] = [];
  const skippedLines: string[] = [];

  lines.forEach((line, index) => {
    const parts = line.split(/[,\t;]+/).map((p) => p.trim());
    if (parts.length < 3) {
      skippedLines.push(line);
      return;
    }
    const ticker = parts[0].toUpperCase().replace(/\.QA$/i, '');
    // Skip header row gracefully
    if (index === 0 && (ticker === 'TICKER' || ticker === 'SYMBOL')) {
      return;
    }
    const shares = Number(parts[1].replace(/,/g, ''));
    const avgCost = Number(parts[2].replace(/,/g, ''));
    const purchasedAt = parts[3] && /^\d{4}-\d{2}-\d{2}$/.test(parts[3]) ? parts[3] : fallbackDate;

    if (!validTickers.has(ticker) || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0) {
      skippedLines.push(line);
      return;
    }

    parsed.push({
      id: `hold-csv-${ticker}-${Date.now()}-${index}`,
      ticker,
      shares: Math.round(shares),
      avgCostQar: roundTo(avgCost, 3),
      purchasedAt,
    });
  });

  return { parsed, skippedLines };
}

export interface QseMarketStatus {
  isOpen: boolean;
  statusLabel: 'Open' | 'Closed';
  dohaTime24: string;
  dohaTime12: string;
  dohaDayShort: string;
  openingTime: string;
  closingTime: string;
  tradingDays: string;
  countdownText: string;
}

const QSE_OPEN_MINUTES = 9 * 60 + 30; // 09:30 AST
const QSE_CLOSE_MINUTES = 13 * 60 + 15; // 13:15 AST
const QSE_TRADING_DAYS = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);

export function getQseMarketStatus(now: Date = new Date()): QseMarketStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Qatar',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = getPart('weekday') || 'Sun';
  let hour = Number(getPart('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(getPart('minute'));
  const totalMinutes = hour * 60 + minute;

  const isTradingDay = QSE_TRADING_DAYS.has(weekday);
  const isOpen = isTradingDay && totalMinutes >= QSE_OPEN_MINUTES && totalMinutes < QSE_CLOSE_MINUTES;

  const dohaTime24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} AST`;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const amPm = hour >= 12 ? 'PM' : 'AM';
  const dohaTime12 = `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${amPm} AST`;

  let countdownText = 'Opens Sun 09:30 AM AST';
  if (isOpen) {
    const minsLeft = QSE_CLOSE_MINUTES - totalMinutes;
    const hLeft = Math.floor(minsLeft / 60);
    const mLeft = minsLeft % 60;
    countdownText = hLeft > 0 ? `Closes in ${hLeft}h ${mLeft}m` : `Closes in ${mLeft}m`;
  } else if (isTradingDay && totalMinutes < QSE_OPEN_MINUTES) {
    const minsUntil = QSE_OPEN_MINUTES - totalMinutes;
    const hUntil = Math.floor(minsUntil / 60);
    const mUntil = minsUntil % 60;
    countdownText =
      hUntil > 0 ? `Opens in ${hUntil}h ${mUntil}m` : `Pre-open · Opens in ${mUntil}m`;
  } else if (weekday === 'Thu' && totalMinutes >= QSE_CLOSE_MINUTES) {
    countdownText = 'Weekend · Opens Sun 09:30 AM';
  } else if (weekday === 'Fri' || weekday === 'Sat') {
    countdownText = 'Weekend · Opens Sun 09:30 AM';
  } else {
    countdownText = 'Opens tomorrow 09:30 AM';
  }

  return {
    isOpen,
    statusLabel: isOpen ? 'Open' : 'Closed',
    dohaTime24,
    dohaTime12,
    dohaDayShort: weekday,
    openingTime: '09:30 AM',
    closingTime: '01:15 PM',
    tradingDays: 'Sun–Thu',
    countdownText,
  };
}
