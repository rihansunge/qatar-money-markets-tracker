export type NavSection =
  | 'overview'
  | 'market'
  | 'gold'
  | 'shariah-etf'
  | 'dividends'
  | 'news'
  | 'portfolio'
  | 'sentiment'
  | 'alerts'
  | 'pro-legal';

export type Sector =
  | 'Banks & Financial'
  | 'Industrials'
  | 'Telecoms'
  | 'Energy & Transport'
  | 'Real Estate'
  | 'Consumer Goods'
  | 'Insurance'
  | 'Exchange Traded Fund';

export type AssetType = 'stock' | 'etf';

export type Timeframe = '5m' | '15m' | '1H' | '1D' | '1W' | '1M' | '3M' | '1Y' | '3Y' | '5Y';

export interface ShariahAudit {
  isCompliant: boolean;
  standard: 'AAOIFI / QE Al Rayan' | 'Non-Compliant (Conventional)';
  debtToMarketCapPct: number; // Threshold <= 33%
  nonCompliantIncomePct: number; // Threshold <= 5%
  liquidAssetsToMarketCapPct: number;
  businessActivityStatus: 'Permissible' | 'Conventional Finance' | 'Conventional Insurance';
  lastReviewed: string;
}

export interface EtfDetails {
  fundManager: string;
  expenseRatioPct: number;
  aumMillionQar: number;
  navQar: number;
  trackingIndex: string;
  distributionFrequency: 'Semi-Annual' | 'Annual';
  isHalal: boolean;
  topHoldings: Array<{ ticker: string; name: string; weightPct: number }>;
}

export interface QseSecurity {
  ticker: string;
  name: string;
  arabicName: string;
  sector: Sector;
  assetType: AssetType;
  price: number; // Current QAR
  previousClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  week52High: number;
  week52Low: number;
  volume: number;
  turnoverQar: number;
  marketCapMillionQar: number;
  peRatio: number | null;
  pbRatio: number | null;
  dividendYieldPct: number;
  lastDividendQar: number;
  beta: number;
  institutionalFlowMillionQar: number; // + net buy, - net sell
  analystBuyPct: number;
  analystHoldPct: number;
  analystSellPct: number;
  shariah: ShariahAudit;
  etf?: EtfDetails;
  sparkline: number[];
}

export interface MarketIndex {
  symbol: 'QSI' | 'QERI' | 'QEAS';
  name: string;
  subtitle: string;
  value: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  ytdPct: number;
  sparkline: number[];
}

export interface OhlcBar {
  date: string;
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  benchmarkClose?: number;
  dma45?: number | null;
  dma200?: number | null;
}

export interface DividendEvent {
  id: string;
  ticker: string;
  companyName: string;
  sector: Sector;
  isShariah: boolean;
  isEtf: boolean;
  fiscalYear: string;
  dividendPerShareQar: number;
  yieldAtAnnouncementPct: number;
  payoutRatioPct: number;
  agmDate: string;
  exDividendDate: string;
  recordDate: string;
  paymentDate: string;
  status: 'Upcoming' | 'Ex-Date Soon' | 'Approved' | 'Paid';
  frequency: 'Annual' | 'Semi-Annual';
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: 'Daily Brief' | 'Earnings' | 'Dividends' | 'Shariah & ETF' | 'Macro & Energy';
  relatedTickers: string[];
  publishedAt: string;
  source: string;
  sentiment: 'Positive' | 'Neutral' | 'Cautious';
  readTimeMin: number;
}

export interface PortfolioHolding {
  id: string;
  ticker: string;
  shares: number;
  avgCostQar: number;
  purchasedAt: string;
}

export interface HoldingValuation {
  holding: PortfolioHolding;
  security: QseSecurity;
  marketValueQar: number;
  costBasisQar: number;
  unrealizedPnlQar: number;
  unrealizedPnlPct: number;
  dayChangeQar: number;
  dayChangePct: number;
  weightPct: number;
  projectedAnnualDividendQar: number;
}

export interface PortfolioAnalytics {
  totalValueQar: number;
  totalCostQar: number;
  unrealizedPnlQar: number;
  unrealizedPnlPct: number;
  dayChangeQar: number;
  dayChangePct: number;
  shariahValueQar: number;
  shariahPct: number;
  conventionalValueQar: number;
  conventionalPct: number;
  etfValueQar: number;
  etfPct: number;
  projectedAnnualDividendQar: number;
  portfolioYieldPct: number;
  weightedBeta: number;
  holdings: HoldingValuation[];
  sectorAllocations: Array<{ sector: Sector; valueQar: number; weightPct: number }>;
  bestPerformer: HoldingValuation | null;
  worstPerformer: HoldingValuation | null;
}

export type AlertCondition = 'above' | 'below' | 'pct_up' | 'pct_down';

export interface PriceAlert {
  id: string;
  ticker: string;
  condition: AlertCondition;
  targetValue: number; // Price in QAR or % move
  note: string;
  active: boolean;
  pushEnabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
}

export interface TriggeredAlert {
  id: string;
  alertId: string;
  ticker: string;
  securityName: string;
  message: string;
  triggeredPrice: number;
  triggeredAt: string;
  read: boolean;
}

export interface InvestorFlowGroup {
  category: 'Qatari Institutional' | 'Foreign Institutional' | 'Qatari Individual' | 'Foreign Individual';
  buyMillionQar: number;
  sellMillionQar: number;
  netMillionQar: number;
  shareOfTurnoverPct: number;
}

export interface SentimentVoteState {
  bullish: number;
  neutral: number;
  bearish: number;
  userVote?: 'bullish' | 'neutral' | 'bearish';
}

export interface StockSentimentAnalysis {
  ticker: string;
  compositeScore: number; // 0 to 100
  regime: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Cautious' | 'Bearish';
  rsi14: number;
  sma20: number;
  sma50: number;
  macdHistogram: number;
  macdSignal: 'Bullish Crossover' | 'Positive Momentum' | 'Neutral' | 'Bearish Pressure';
  communityBullishPct: number;
  institutionalBias: 'Net Accumulation' | 'Balanced' | 'Net Distribution';
}

export interface MarketSentimentSummary {
  compositeScore: number;
  regime: 'Greed' | 'Optimistic' | 'Neutral' | 'Cautious' | 'Fear';
  advancers: number;
  decliners: number;
  unchanged: number;
  breadthRatio: number;
  near52WeekHighCount: number;
  near52WeekLowCount: number;
  netInstitutionalFlowMillionQar: number;
  netForeignFlowMillionQar: number;
}

export type GoldKarat = '24K' | '22K' | '18K';

export interface GoldRatesSnapshot {
  fetchedAt: string;
  xauUsd: number;
  previousXauUsd: number;
  xauUsdSource: string;
  usdQar: number;
  usdQarSource: string;
  xauQar: number;
  xeChartUrl: string;
  xeConverterUrl: string;
  xeQarConverterUrl: string;
  malabarOfficialUrl: string;
  malabarStoresUrl: string;
  malabarSourceLabel: string;
  malabarUpdatedText: string;
  malabarUsdPerGram?: {
    '24K': number;
    '22K': number;
    '18K': number;
  } | null;
  malabarRatesQarPerGram: {
    '24K': number;
    '22K': number;
    '18K': number;
    '21K'?: number;
  } | null;
  calibratedSpreadPct: number;
  calibratedKaratSpreadsPct: {
    '24K': number;
    '22K': number;
    '18K': number;
  };
}
