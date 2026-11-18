import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEO_TICKERS,
  buildCanonicalPath,
  buildPageSeo,
  injectSeoIntoHtml,
  parseRouteState,
} from './seo';

test('parseRouteState parses clean /stock/:ticker and section paths', () => {
  assert.deepEqual(parseRouteState('/stock/QIBK', ''), {
    section: 'market',
    ticker: 'QIBK',
    searchQuery: '',
  });
  assert.deepEqual(parseRouteState('/stock/qatr/', ''), {
    section: 'market',
    ticker: 'QATR',
    searchQuery: '',
  });
  assert.deepEqual(parseRouteState('/dividends', ''), {
    section: 'dividends',
    ticker: 'QIBK',
    searchQuery: '',
  });
  assert.deepEqual(parseRouteState('/shariah-etf', ''), {
    section: 'shariah-etf',
    ticker: 'QIBK',
    searchQuery: '',
  });
  assert.deepEqual(parseRouteState('/gold', ''), {
    section: 'gold',
    ticker: 'QIBK',
    searchQuery: '',
  });
});

test('parseRouteState preserves query parameter backward compatibility and Google SearchAction ?q=', () => {
  assert.deepEqual(parseRouteState('/', '?section=market&ticker=QGTS'), {
    section: 'market',
    ticker: 'QGTS',
    searchQuery: '',
  });
  assert.deepEqual(parseRouteState('/', '?q=QNBK'), {
    section: 'market',
    ticker: 'QNBK',
    searchQuery: 'QNBK',
  });
});

test('buildCanonicalPath produces clean indexable URLs', () => {
  assert.equal(buildCanonicalPath('overview'), '/');
  assert.equal(buildCanonicalPath('market', 'qibk'), '/stock/QIBK');
  assert.equal(buildCanonicalPath('gold'), '/gold');
  assert.equal(buildCanonicalPath('dividends'), '/dividends');
  assert.equal(buildCanonicalPath('pro-legal'), '/plus');
});

test('buildPageSeo generates SearchAction WebSite, WebApplication, FAQPage schemas and bilingual keywords', () => {
  const seo = buildPageSeo({
    baseUrl: 'https://qatarmoneymarkets.example.com/',
    section: 'market',
    ticker: 'QATR',
    priceQar: 2.089,
    dividendYieldPct: 5.27,
  });

  assert.equal(seo.canonicalUrl, 'https://qatarmoneymarkets.example.com/stock/QATR');
  assert.equal(seo.ogImageUrl, 'https://qatarmoneymarkets.example.com/og-card.jpg');
  assert.ok(seo.title.includes('QATR'));
  assert.ok(seo.title.includes('Qatar Money Markets'));
  assert.ok(seo.description.includes('2.089 QAR'));
  assert.ok(seo.description.includes('5.27%'));
  assert.ok(seo.keywords.includes('QATR share price QAR'));
  assert.ok(seo.keywords.includes('سعر سهم QATR'));
  assert.equal(seo.structuredData.length, 3);
  assert.equal(seo.structuredData[0]['@type'], 'WebSite');
  assert.equal(seo.structuredData[1]['@type'], 'WebApplication');
  assert.equal(seo.structuredData[2]['@type'], 'FAQPage');

  const goldSeo = buildPageSeo({
    baseUrl: 'https://qatarmoneymarkets.example.com',
    section: 'gold',
  });
  const goldFaq = goldSeo.structuredData[2] as { mainEntity: Array<{ name: string }> };
  assert.ok(goldSeo.keywords.includes('سعر الذهب اليوم في قطر'));
  assert.ok(goldSeo.keywords.includes('Malabar Gold Qatar rate today'));
  assert.ok(goldFaq.mainEntity.some((q) => q.name.includes('24K, 22K, and 18K')));
  assert.ok(goldFaq.mainEntity.some((q) => q.name.includes('سعر الذهب اليوم')));
});

test('injectSeoIntoHtml injects canonical, OG image, FAQPage JSON-LD, keywords, and preserves verification tag when not overridden', () => {
  const sampleHtml = `<!doctype html><html><head><title>Old</title><meta name="description" content="Old" /><meta name="keywords" content="Old" /><meta name="google-site-verification" content="bakedToken123" /><meta property="og:title" content="Old" /><meta property="og:description" content="Old" /><meta name="twitter:title" content="Old" /><meta name="twitter:description" content="Old" /></head><body></body></html>`;
  const preserved = injectSeoIntoHtml(sampleHtml, {
    baseUrl: 'https://qatarmoneymarkets.com',
    pathname: '/gold',
    search: '',
  });

  assert.ok(preserved.includes('<meta name="google-site-verification" content="bakedToken123" />'));
  assert.ok(preserved.includes('"@type":"FAQPage"'));
  assert.ok(preserved.includes('سعر الذهب اليوم في قطر'));
  assert.ok(preserved.includes('<link rel="canonical" href="https://qatarmoneymarkets.com/gold" />'));

  const overridden = injectSeoIntoHtml(sampleHtml, {
    baseUrl: 'https://qatarmoneymarkets.com',
    pathname: '/stock/QIBK',
    search: '',
    googleSiteVerification: 'abc123token',
  });

  assert.ok(overridden.includes('<title>QIBK (Qatar Islamic Bank) Live QSE Price — Qatar Money Markets</title>'));
  assert.ok(overridden.includes('<link rel="canonical" href="https://qatarmoneymarkets.com/stock/QIBK" />'));
  assert.ok(overridden.includes('<meta property="og:image" content="https://qatarmoneymarkets.com/og-card.jpg" />'));
  assert.ok(overridden.includes('<meta name="google-site-verification" content="abc123token" />'));
  assert.ok(!overridden.includes('bakedToken123'));
  assert.ok(overridden.includes('SearchAction'));
  assert.equal(SEO_TICKERS.length, 20);
});
