import type { NavSection } from '../types/market';

export interface SeoTickerSummary {
  ticker: string;
  name: string;
  sector: string;
  isHalal: boolean;
  isEtf: boolean;
}

export interface FaqItem {
  question: string;
  answer: string;
  questionAr?: string;
  answerAr?: string;
}

export const SEO_TICKERS: readonly SeoTickerSummary[] = [
  { ticker: 'QIBK', name: 'Qatar Islamic Bank', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'QATR', name: 'Al Rayan Qatar ETF', sector: 'Exchange Traded Fund', isHalal: true, isEtf: true },
  { ticker: 'QNBK', name: 'Qatar National Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'QETF', name: 'QE Index ETF', sector: 'Exchange Traded Fund', isHalal: false, isEtf: true },
  { ticker: 'IQCD', name: 'Industries Qatar', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'QGTS', name: 'Nakilat (Qatar Gas Transport)', sector: 'Energy & Transport', isHalal: true, isEtf: false },
  { ticker: 'MARK', name: 'Masraf Al Rayan', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'ORDS', name: 'Ooredoo', sector: 'Telecoms', isHalal: true, isEtf: false },
  { ticker: 'VFQS', name: 'Vodafone Qatar', sector: 'Telecoms', isHalal: true, isEtf: false },
  { ticker: 'CBQK', name: 'The Commercial Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'QIIK', name: 'Qatar International Islamic Bank', sector: 'Banks & Financial', isHalal: true, isEtf: false },
  { ticker: 'QEWS', name: 'Qatar Electricity & Water', sector: 'Energy & Transport', isHalal: true, isEtf: false },
  { ticker: 'QFLS', name: 'Qatar Fuel (Woqod)', sector: 'Consumer Goods', isHalal: true, isEtf: false },
  { ticker: 'BRES', name: 'Barwa Real Estate', sector: 'Real Estate', isHalal: true, isEtf: false },
  { ticker: 'MPHC', name: 'Mesaieed Petrochemical', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'GISS', name: 'Gulf International Services', sector: 'Industrials', isHalal: true, isEtf: false },
  { ticker: 'DHBK', name: 'Doha Bank', sector: 'Banks & Financial', isHalal: false, isEtf: false },
  { ticker: 'ERES', name: 'Ezdan Holding Group', sector: 'Real Estate', isHalal: true, isEtf: false },
  { ticker: 'QATI', name: 'Qatar Insurance', sector: 'Insurance', isHalal: false, isEtf: false },
  { ticker: 'MCCS', name: 'Mannai Corporation', sector: 'Consumer Goods', isHalal: true, isEtf: false },
] as const;

const TICKER_SET = new Set(SEO_TICKERS.map((t) => t.ticker));

const SECTION_FROM_PATH: Record<string, NavSection> = {
  '/': 'overview',
  '/market': 'market',
  '/gold': 'gold',
  '/shariah-etf': 'shariah-etf',
  '/dividends': 'dividends',
  '/news': 'news',
  '/portfolio': 'portfolio',
  '/sentiment': 'sentiment',
  '/alerts': 'alerts',
  '/plus': 'pro-legal',
  '/seo': 'pro-legal',
};

const VALID_SECTIONS: ReadonlySet<NavSection> = new Set([
  'overview',
  'market',
  'gold',
  'shariah-etf',
  'dividends',
  'news',
  'portfolio',
  'sentiment',
  'alerts',
  'pro-legal',
]);

export function parseRouteState(
  pathname: string,
  search: string,
): { section: NavSection; ticker: string; searchQuery: string } {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const rawQuery = (params.get('q') ?? '').trim();

  // Check clean /stock/:ticker route first
  const stockMatch = /^\/stock\/([a-zA-Z0-9]+)$/i.exec(cleanPath);
  if (stockMatch) {
    const candidate = stockMatch[1].toUpperCase();
    return {
      section: 'market',
      ticker: TICKER_SET.has(candidate) ? candidate : 'QIBK',
      searchQuery: rawQuery,
    };
  }

  const rawTicker = (params.get('ticker') ?? '').toUpperCase().trim();
  const validTicker = TICKER_SET.has(rawTicker) ? rawTicker : 'QIBK';

  if (cleanPath in SECTION_FROM_PATH && cleanPath !== '/') {
    return {
      section: SECTION_FROM_PATH[cleanPath],
      ticker: validTicker,
      searchQuery: rawQuery,
    };
  }

  const rawSection = params.get('section') as NavSection | null;
  if (rawSection && VALID_SECTIONS.has(rawSection)) {
    return {
      section: rawSection,
      ticker: validTicker,
      searchQuery: rawQuery,
    };
  }

  if (rawQuery) {
    return {
      section: 'market',
      ticker: TICKER_SET.has(rawQuery.toUpperCase()) ? rawQuery.toUpperCase() : validTicker,
      searchQuery: rawQuery,
    };
  }

  return {
    section: 'overview',
    ticker: validTicker,
    searchQuery: '',
  };
}

export function buildCanonicalPath(section: NavSection, ticker = 'QIBK'): string {
  const safeTicker = TICKER_SET.has(ticker.toUpperCase()) ? ticker.toUpperCase() : 'QIBK';
  switch (section) {
    case 'overview':
      return '/';
    case 'market':
      return `/stock/${safeTicker}`;
    case 'gold':
      return '/gold';
    case 'shariah-etf':
      return '/shariah-etf';
    case 'dividends':
      return '/dividends';
    case 'news':
      return '/news';
    case 'portfolio':
      return '/portfolio';
    case 'sentiment':
      return '/sentiment';
    case 'alerts':
      return '/alerts';
    case 'pro-legal':
      return '/plus';
  }
}

export function getSectionKeywords(
  section: NavSection,
  tickerMeta?: SeoTickerSummary,
): { en: string[]; ar: string[] } {
  if (section === 'gold') {
    return {
      en: [
        'Qatar gold rate today',
        '22K gold price Qatar QAR per gram',
        '24K gold rate Doha',
        '18K gold price Qatar',
        'Malabar Gold Qatar rate today',
        'XE.com XAU USD live chart',
      ],
      ar: [
        'سعر الذهب اليوم في قطر',
        'سعر الذهب عيار 22 في قطر',
        'سعر الذهب عيار 24 قطر',
        'سعر الذهب عيار 18 الدوحة',
        'سعر جرام الذهب مالابار قطر',
        'سعر أونصة الذهب XE مباشر',
      ],
    };
  }

  if (section === 'shariah-etf') {
    return {
      en: [
        'Qatar Halal ETF QATR',
        'Shariah compliant stocks Qatar Stock Exchange',
        'QSE Islamic shares list',
        'Qatar stock Zakat calculator',
        'QATR vs QETF comparison',
      ],
      ar: [
        'الأسهم الحلال في بورصة قطر',
        'صندوق الريان القطري QATR',
        'الأسهم المتوافقة مع الشريعة قطر',
        'حاسبة زكاة الأسهم في قطر',
        'تطهير أرباح الأسهم قطر',
      ],
    };
  }

  if (section === 'dividends') {
    return {
      en: [
        'Qatar Stock Exchange dividends 2026',
        'QSE ex-dividend dates calendar',
        'highest dividend yield stocks Qatar',
        'QIBK QNBK IQCD dividend QAR',
      ],
      ar: [
        'توزيعات أرباح بورصة قطر',
        'مواعيد استحقاق الأرباح قطر',
        'أعلى الأسهم توزيعاً للأرباح في قطر',
      ],
    };
  }

  if (section === 'market' && tickerMeta) {
    return {
      en: [
        `${tickerMeta.ticker} share price QAR`,
        `${tickerMeta.name} live QSE chart`,
        `${tickerMeta.ticker} candlestick chart`,
        `${tickerMeta.ticker} dividend yield`,
        tickerMeta.isHalal
          ? `${tickerMeta.ticker} Halal Shariah status`
          : `${tickerMeta.ticker} Qatar Stock Exchange quote`,
      ],
      ar: [
        `سعر سهم ${tickerMeta.ticker} اليوم`,
        `سهم ${tickerMeta.name} بورصة قطر`,
        `توزيعات أرباح ${tickerMeta.ticker}`,
        tickerMeta.isHalal ? `هل سهم ${tickerMeta.ticker} حلال شرعي` : `تحليل سهم ${tickerMeta.ticker}`,
      ],
    };
  }

  return {
    en: [
      'Qatar Money Markets',
      'Qatar Stock Exchange live prices',
      'QE Index QSE today',
      'QATR Halal ETF',
      'Qatar gold rate 22K 24K today',
      'QIBK QNBK IQCD QGTS live chart',
    ],
    ar: [
      'أسعار أسهم بورصة قطر مباشر',
      'مؤشر بورصة قطر اليوم',
      'سعر الذهب اليوم في قطر عيار 22 و 24',
      'الأسهم الحلال في قطر',
      'أسواق المال القطرية',
    ],
  };
}

export function getSectionFaqs(
  section: NavSection,
  tickerMeta?: SeoTickerSummary,
  options?: { priceQar?: number; dividendYieldPct?: number },
): FaqItem[] {
  if (section === 'gold') {
    return [
      {
        question: 'What are today’s 24K, 22K, and 18K gold rates in Qatar (QAR/g)?',
        answer:
          'Qatar Money Markets tracks live 24K, 22K, and 18K gold prices per gram in Qatari Riyals (QAR) synced with Malabar Gold Qatar’s official board rate and real-time XE.com XAU/USD conversion (USD/QAR pegged at 3.64).',
        questionAr: 'ما هو سعر الذهب اليوم عيار 24 و 22 و 18 في قطر بالريال القطري؟',
        answerAr:
          'يعرض موقع أسواق المال القطرية أسعار الذهب المباشرة لعيارات 24 و 22 و 18 بالريال القطري لكل جرام، متزامنة مع أسعار مالابار جولد قطر الرسمية وتقديرات التحويل اللحظية من XE.com.',
      },
      {
        question: 'How is the XE.com to Malabar Gold Qatar retail rate estimated?',
        answer:
          'The estimator converts live XAU/USD per troy ounce into QAR per gram using (XAU/USD × 3.64) ÷ 31.1035, adjusts by karat purity (24K 99.9%, 22K 91.67%, 18K 75.0%), and applies Malabar’s GCC bullion/retail spread snapped to 0.50 QAR steps.',
        questionAr: 'كيف يتم حساب السعر التقديري لذهب مالابار قطر من سعر أونصة XE.com؟',
        answerAr:
          'يتم تحويل سعر الأونصة العالمي (XAU/USD × 3.64 ÷ 31.1035) ثم ضربه في نسبة النقاء لكل عيار وإضافة هامش التجزئة الخليجي المعتمد في الدوحة مع التقريب لأقرب 0.50 ريال قطري.',
      },
      {
        question: 'Does the Gold page include a live XAU/USD candlestick chart?',
        answer:
          'Yes. The Gold Rates page streams live XAU/USD price ticks into an interactive TradingView-style candlestick chart supporting 5m, 15m, 1H, 1D, and 1W timeframes with Moving Averages (45 DMA, 200 DMA), Fibonacci retracements, and RSI.',
        questionAr: 'هل يوجد شارت شموع يابانية مباشر لسعر أونصة الذهب مقابل الدولار؟',
        answerAr:
          'نعم، تتوفر رسوم بيانية تفاعلية بالشموع اليابانية لسعر أونصة الذهب (XAU/USD) مع تحديث لحظي، وفواصل زمنية متعددة ومؤشرات المتوسطات المتحركة وفيبوناتشي.',
      },
      {
        question: 'Why does Doha retail 22K gold differ from raw XE.com spot value?',
        answer:
          'Raw XE.com spot reflects wholesale unfabricated bullion per gram, whereas Doha jewelers such as Malabar Gold include GCC bullion import, assaying, and retail showroom spreads (typically 3.9%–5.6% depending on karat).',
        questionAr: 'لماذا يختلف سعر جرام الذهب عيار 22 في الدوحة عن السعر الفوري في XE؟',
        answerAr:
          'يعكس السعر الفوري في XE قيمة الذهب الخام عالمياً، بينما تشمل أسعار محلات المجوهرات في قطر مثل مالابار تكاليف الاستيراد والفحص وهامش التجزئة المعتمد في الدوحة.',
      },
    ];
  }

  if (section === 'shariah-etf') {
    return [
      {
        question: 'Which ETFs and stocks on the Qatar Stock Exchange (QSE) are Shariah compliant?',
        answer:
          'Al Rayan Qatar ETF (QATR) is QSE’s dedicated Shariah-compliant ETF, alongside screened Islamic equities including QIBK, MARK, QIIK, IQCD, QGTS, ORDS, VFQS, QEWS, and QFLS checked against AAOIFI debt and non-halal revenue thresholds.',
        questionAr: 'ما هي الصناديق والأسهم المتوافقة مع الشريعة الإسلامية في بورصة قطر؟',
        answerAr:
          'يُعد صندوق الريان القطري (QATR) الصندوق المتداول المتوافق مع الشريعة في بورصة قطر، إلى جانب أسهم إسلامية مثل مصرف قطر الإسلامي (QIBK) ومصرف الريان (MARK) وصناعات قطر (IQCD) وناقلات (QGTS) وأريدُ (ORDS).',
      },
      {
        question: 'What is the difference between QATR Halal ETF and QETF on QSE?',
        answer:
          'QATR tracks the FTSE QE Qatar Islamic Index and excludes conventional interest-bearing banks, while QETF tracks the broader QE Index including conventional financials such as QNBK and CBQK.',
        questionAr: 'ما الفرق بين صندوق QATR الإسلامي وصندوق QETF في بورصة قطر؟',
        answerAr:
          'يتتبع صندوق QATR مؤشر الأسهم الإسلامية المتوافقة مع الضوابط الشرعية، بينما يتتبع صندوق QETF مؤشر بورصة قطر العام الذي يضم بنوكاً تقليدية.',
      },
      {
        question: 'How does the QSE Zakat and dividend purification calculator work?',
        answer:
          'The built-in calculator estimates annual 2.5% Zakat using either the AAOIFI 25% liquid-asset proxy for long-term holdings or 100% market value for active trading, plus per-stock charitable dividend purification in QAR.',
        questionAr: 'كيف تعمل حاسبة زكاة الأسهم وتطهير الأرباح في بورصة قطر؟',
        answerAr:
          'تحسب الأداة زكاة الأسهم بنسبة 2.5% سواء للمستثمر طويل الأجل (نسبة 25% وفق معايير أيوفي) أو للمضارب النشط، كما تحسب مبلغ تطهير الأرباح النقدية بالريال القطري.',
      },
      {
        question: 'What debt and non-halal revenue thresholds are used for QSE Shariah screening?',
        answer:
          'Stocks pass screening when interest-bearing debt is at or below 33% of market capitalization and non-compliant interest or non-operating income remains at or below 5% of total revenue.',
        questionAr: 'ما هي نسب المديونية والدخل غير التشغيلي المعتمدة لفحص الأسهم الشرعية؟',
        answerAr:
          'يتوافق السهم مع الضوابط الشرعية عندما لا تتجاوز الديون الربوية 33% من القيمة السوقية وألا يتجاوز الدخل غير المتوافق 5% من إجمالي الإيرادات.',
      },
    ];
  }

  if (section === 'dividends') {
    return [
      {
        question: 'Where can I check upcoming Qatar Stock Exchange (QSE) dividend dates?',
        answer:
          'The QSE Dividends calendar lists announced cash dividend payouts in QAR, ex-dividend dates, payment dates, and annual dividend yields across QIBK, QNBK, IQCD, QGTS, QATR, and other Qatar equities.',
        questionAr: 'أين يمكنني متابعة مواعيد توزيعات أرباح أسهم بورصة قطر؟',
        answerAr:
          'يعرض تقويم الأرباح في الموقع قيمة التوزيع النقدي بالريال القطري، وتاريخ الاستحقاق، وتاريخ الصرف، ونسبة العائد السنوي لجميع أسهم وصناديق بورصة قطر.',
      },
    ];
  }

  if (section === 'market' && tickerMeta) {
    const priceText =
      typeof options?.priceQar === 'number' && options.priceQar > 0
        ? ` Its latest tracked price is ${options.priceQar.toFixed(tickerMeta.isEtf || options.priceQar < 3 ? 3 : 2)} QAR.`
        : '';
    const yieldText =
      typeof options?.dividendYieldPct === 'number'
        ? ` Current annual dividend yield is ${options.dividendYieldPct.toFixed(2)}%.`
        : '';
    const complianceText = tickerMeta.isHalal
      ? `${tickerMeta.ticker} is screened as Shariah compliant under QSE Islamic screening thresholds.`
      : `${tickerMeta.ticker} is classified as a conventional equity/ETF on the Qatar Stock Exchange.`;

    return [
      {
        question: `What is the live ${tickerMeta.ticker} (${tickerMeta.name}) share price on QSE?`,
        answer: `You can view live ${tickerMeta.ticker} (${tickerMeta.name}) quotes in QAR, intraday candlestick charts, and session volume on Qatar Money Markets.${priceText}${yieldText}`,
        questionAr: `ما هو سعر سهم ${tickerMeta.ticker} (${tickerMeta.name}) المباشر في بورصة قطر؟`,
        answerAr: `يمكنك متابعة السعر المباشر لسهم ${tickerMeta.ticker} (${tickerMeta.name}) بالريال القطري مع شارت الشموع اليابانية وحجم التداول لحظياً عبر أسواق المال القطرية.`,
      },
      {
        question: `Is ${tickerMeta.ticker} (${tickerMeta.name}) Shariah compliant / Halal?`,
        answer: complianceText,
        questionAr: `هل سهم ${tickerMeta.ticker} متوافق مع الشريعة الإسلامية (حلال)؟`,
        answerAr: tickerMeta.isHalal
          ? `نعم، يُصنف سهم ${tickerMeta.ticker} ضمن الأسهم المتوافقة مع الضوابط الشرعية في بورصة قطر وفق فحص المديونية والدخل غير التشغيلي.`
          : `يُصنف ${tickerMeta.ticker} ضمن الأدوات المالية التقليدية في بورصة قطر.`,
      },
      {
        question: `Can I analyze ${tickerMeta.ticker} with TradingView candlesticks, 45 DMA, 200 DMA, and Fibonacci?`,
        answer: `Yes. Open the ${tickerMeta.ticker} chart above to switch timeframes (5m, 15m, 1H, 1D, 1W, 1M, 3M, 1Y) and toggle Moving Averages (SMA 20/50/200, EMA 20, 45 DMA), Bollinger Bands, RSI, and Fibonacci retracements.`,
        questionAr: `هل يمكن تحليل سهم ${tickerMeta.ticker} بمؤشرات المتوسطات المتحركة وفيبوناتشي؟`,
        answerAr: `نعم، يتيح الرسم البياني أعلاه اختيار الفواصل الزمنية وتفعيل المتوسطات المتحركة (45 و 200 يوم) ومؤشر القوة النسبية ومستويات فيبوناتشي.`,
      },
      {
        question: `Which sector does ${tickerMeta.ticker} belong to on the Qatar Stock Exchange?`,
        answer: `${tickerMeta.ticker} (${tickerMeta.name}) trades in the ${tickerMeta.sector} sector on the Qatar Stock Exchange (QSE) in Qatari Riyals (QAR).`,
        questionAr: `ما هو قطاع سهم ${tickerMeta.ticker} في بورصة قطر؟`,
        answerAr: `يتداول سهم ${tickerMeta.ticker} (${tickerMeta.name}) ضمن قطاع ${tickerMeta.sector} في بورصة قطر بالريال القطري.`,
      },
    ];
  }

  return [
    {
      question: 'Where can I track live Qatar Stock Exchange (QSE) stocks and the QE Index?',
      answer:
        'Qatar Money Markets streams live QSE prices in QAR for the QE Index and 20 leading equities and ETFs including QIBK, QNBK, IQCD, QGTS, ORDS, QATR, and QETF, complete with interactive TradingView candlestick charts.',
      questionAr: 'كيف أتابع أسعار أسهم بورصة قطر ومؤشر بورصة قطر لحظياً؟',
      answerAr:
        'يوفر موقع أسواق المال القطرية أسعار أسهم بورصة قطر مباشر بالريال القطري لمؤشر QE Index وأبرز 20 سهماً وصندوقاً متداولاً مثل QIBK و QNBK و IQCD و QATR مع شارت شموع يابانية تفاعلي.',
    },
    {
      question: 'What are the Qatar Stock Exchange (QSE) trading hours in Doha?',
      answer:
        'The Qatar Stock Exchange trades Sunday through Thursday from 09:30 AM to 01:15 PM Doha time (AST / UTC+3), following pre-open auction from 09:00 AM to 09:30 AM.',
      questionAr: 'ما هي أوقات وساعات التداول الرسمية في بورصة قطر؟',
      answerAr:
        'تفتح بورصة قطر من الأحد إلى الخميس، وتبدأ جلسة التداول المستمر من الساعة 9:30 صباحاً حتى 1:15 ظهراً بتوقيت الدوحة.',
    },
    {
      question: 'Does Qatar Money Markets also track live Qatar 22K/24K Gold and Halal ETFs?',
      answer:
        'Yes. Switch to Gold Rates (/gold) for live XE.com XAU/USD charts alongside Malabar Gold Qatar 24K, 22K, and 18K QAR/g prices, or visit Shariah & ETFs (/shariah-etf) for QATR Halal ETF screening and Zakat purification.',
      questionAr: 'هل يعرض الموقع أيضاً أسعار الذهب في قطر عيار 22 و 24 والأسهم الحلال؟',
      answerAr:
        'نعم، يوفر قسم أسعار الذهب (/gold) سعر جرام الذهب عيار 24 و 22 و 18 في قطر مقارنة بمؤشر مالابار و XE.com، كما يضم قسم الأسهم الحلال (/shariah-etf) صندوق QATR وحاسبة الزكاة.',
    },
    {
      question: 'Can I set price alerts and track QSE dividend yields in QAR?',
      answer:
        'Yes. Click Price Alert on any stock to get triggered target notifications, or open the Dividends calendar (/dividends) and Portfolio analytics (/portfolio) to project annual QAR dividend payouts.',
      questionAr: 'هل يمكن تفعيل تنبيهات الأسعار ومتابعة عوائد التوزيعات في بورصة قطر؟',
      answerAr:
        'نعم، يمكنك ضبط تنبيهات الأسعار لأي سهم في بورصة قطر ومتابعة تقويم الأرباح السنوية ومحفظتك بالريال القطري.',
    },
  ];
}

export interface PageSeoMetadata {
  title: string;
  description: string;
  keywords: string;
  canonicalPath: string;
  canonicalUrl: string;
  ogImageUrl: string;
  faqs: FaqItem[];
  structuredData: Record<string, unknown>[];
}

export function buildPageSeo(options: {
  baseUrl: string;
  section: NavSection;
  ticker?: string;
  priceQar?: number;
  dividendYieldPct?: number;
}): PageSeoMetadata {
  const cleanBase = options.baseUrl.replace(/\/+$/, '');
  const safeTicker = (options.ticker || 'QIBK').toUpperCase();
  const tickerMeta = SEO_TICKERS.find((t) => t.ticker === safeTicker);
  const canonicalPath = buildCanonicalPath(options.section, safeTicker);
  const canonicalUrl = `${cleanBase}${canonicalPath}`;
  const ogImageUrl = `${cleanBase}/og-card.jpg`;

  let title = 'Qatar Money Markets — QSE Live Stocks & Halal ETFs';
  let description =
    'Track real-time Qatar Stock Exchange (QSE) prices, QATR Halal ETF, Shariah-compliant stocks, upcoming dividends, Zakat purification, and portfolio analytics.';

  if (options.section === 'market' && tickerMeta) {
    const priceSnippet =
      typeof options.priceQar === 'number' && options.priceQar > 0
        ? ` Live quote ${options.priceQar.toFixed(tickerMeta.isEtf || options.priceQar < 3 ? 3 : 2)} QAR`
        : '';
    const yieldSnippet =
      typeof options.dividendYieldPct === 'number'
        ? `, ${options.dividendYieldPct.toFixed(2)}% dividend yield`
        : '';
    const shariahLabel = tickerMeta.isHalal ? 'Shariah compliant' : 'conventional';
    title = `${tickerMeta.ticker} (${tickerMeta.name}) Live QSE Price — Qatar Money Markets`;
    description = `Track ${tickerMeta.ticker} (${tickerMeta.name}) on the Qatar Stock Exchange.${priceSnippet}${yieldSnippet}, historical chart, and ${shariahLabel} audit.`;
  } else if (options.section === 'gold') {
    title = 'Qatar Gold Rates (24K, 22K, 18K QAR/g) & Live XAU/USD Chart — Qatar Money Markets';
    description =
      'Live Gold Ounce to USD (XAU/USD) chart synced to XE.com alongside Malabar Gold Qatar 24K, 22K, and 18K per gram rates and XE.com retail estimates in QAR.';
  } else if (options.section === 'shariah-etf') {
    title = 'QSE Halal ETFs (QATR) & Shariah Stocks — Qatar Money Markets';
    description =
      'Compare QATR Halal ETF vs QETF, screen 15 Shariah-compliant Qatar Stock Exchange equities, and calculate Zakat and dividend purification in QAR.';
  } else if (options.section === 'dividends') {
    title = 'Qatar Stock Exchange Dividends & Ex-Dates — Qatar Money Markets';
    description =
      'Upcoming Qatar Stock Exchange dividend calendar, ex-dividend dates, payout yields in QAR, and projected annual income for your QSE holdings.';
  } else if (options.section === 'news') {
    title = 'Qatar Stock Exchange News & Daily Updates — Qatar Money Markets';
    description =
      'Latest Qatar Stock Exchange corporate announcements, AGM resolutions, LNG shipping updates, QCB rate insights, and daily Doha market briefs.';
  } else if (options.section === 'portfolio') {
    title = 'QSE Portfolio & Dividend Analytics — Qatar Money Markets';
    description =
      'Analyze your Qatar Stock Exchange portfolio value, unrealized P&L, Shariah compliance split, sector allocation, and dividend yield in QAR.';
  } else if (options.section === 'sentiment') {
    title = 'QSE Investor Sentiment & Institutional Flows — Qatar Money Markets';
    description =
      'Track Qatar Stock Exchange Greed/Fear sentiment pulse, RSI momentum, foreign and institutional net QAR flows, and community market votes.';
  } else if (options.section === 'alerts') {
    title = 'QSE Live Price Alerts & Notifications — Qatar Money Markets';
    description =
      'Set instant target price alerts for QIBK, QNBK, QATR Halal ETF, and all top Qatar Stock Exchange equities with real-time push notifications.';
  } else if (options.section === 'pro-legal') {
    title = 'Qatar Money Markets Plus, SEO & QFMA Disclosures';
    description =
      'Subscribe to the Morning Doha QSE Brief, check Google Search indexing readiness, and review Qatar Money Markets Plus plans and QFMA disclosures.';
  }

  const keywordGroups = getSectionKeywords(options.section, tickerMeta);
  const keywords = [...keywordGroups.en, ...keywordGroups.ar].join(', ');
  const faqs = getSectionFaqs(options.section, tickerMeta, {
    priceQar: options.priceQar,
    dividendYieldPct: options.dividendYieldPct,
  });

  const webSiteSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Qatar Money Markets',
    alternateName: ['Qatar Stock Exchange Tracker', 'QSE Live Tracker', 'أسواق المال القطرية'],
    url: `${cleanBase}/`,
    inLanguage: ['en', 'ar'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${cleanBase}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const webAppSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Qatar Money Markets',
    url: canonicalUrl,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'All',
    inLanguage: ['en', 'ar'],
    description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'QAR',
    },
  };

  const faqMainEntity: Record<string, unknown>[] = [];
  for (const item of faqs) {
    faqMainEntity.push({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    });
    if (item.questionAr && item.answerAr) {
      faqMainEntity.push({
        '@type': 'Question',
        name: item.questionAr,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answerAr,
        },
      });
    }
  }

  const faqPageSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqMainEntity,
  };

  return {
    title,
    description,
    keywords,
    canonicalPath,
    canonicalUrl,
    ogImageUrl,
    faqs,
    structuredData: [webSiteSchema, webAppSchema, faqPageSchema],
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function injectSeoIntoHtml(
  html: string,
  opts: {
    baseUrl: string;
    pathname: string;
    search: string;
    googleSiteVerification?: string;
  },
): string {
  const route = parseRouteState(opts.pathname, opts.search);
  const seo = buildPageSeo({
    baseUrl: opts.baseUrl,
    section: route.section,
    ticker: route.ticker,
  });

  const safeTitle = escapeHtmlAttr(seo.title);
  const safeDesc = escapeHtmlAttr(seo.description);
  const safeKeywords = escapeHtmlAttr(seo.keywords);
  const safeCanonical = escapeHtmlAttr(seo.canonicalUrl);
  const safeOgImg = escapeHtmlAttr(seo.ogImageUrl);

  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  out = out.replace(
    /<meta\s+name="description"[\s\S]*?\/>/i,
    `<meta name="description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+name="keywords"[\s\S]*?\/>/i,
    `<meta name="keywords" content="${safeKeywords}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"[\s\S]*?\/>/i,
    `<meta property="og:title" content="${safeTitle}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/i,
    `<meta property="og:description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"[\s\S]*?\/>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  );

  // Replace existing canonical / og:url / og:image / twitter:image or inject before </head>
  out = out.replace(/<link\s+rel="canonical"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+property="og:url"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+property="og:image"[\s\S]*?\/>/i, '');
  out = out.replace(/<meta\s+name="twitter:image"[\s\S]*?\/>/i, '');
  out = out.replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');

  const hasKeywordsMeta = /<meta\s+name="keywords"/i.test(out);
  const keywordsMetaLine = hasKeywordsMeta
    ? ''
    : `    <meta name="keywords" content="${safeKeywords}" />\n`;

  let gscMeta = '';
  if (opts.googleSiteVerification?.trim()) {
    out = out.replace(/<meta\s+name="google-site-verification"[\s\S]*?\/>/i, '');
    gscMeta = `    <meta name="google-site-verification" content="${escapeHtmlAttr(opts.googleSiteVerification.trim())}" />\n`;
  }

  const jsonLdScripts = seo.structuredData
    .map(
      (schema) =>
        `    <script type="application/ld+json" data-qmm-seo="true">${JSON.stringify(schema)}</script>`,
    )
    .join('\n');

  const injectedBlock = `${gscMeta}${keywordsMetaLine}    <link rel="canonical" href="${safeCanonical}" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta property="og:image" content="${safeOgImg}" />
    <meta name="twitter:image" content="${safeOgImg}" />
${jsonLdScripts}
  </head>`;

  return out.replace(/<\/head>/i, injectedBlock);
}
