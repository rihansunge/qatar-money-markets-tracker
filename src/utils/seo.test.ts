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
  assert.equal(buildCanonicalPath('dividends'), '/dividends');
  assert.equal(buildCanonicalPath('pro-legal'), '/plus');
});

test('buildPageSeo generates SearchAction WebSite schema and ticker-specific metadata', () => {
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
  assert.equal(seo.structuredData.length, 2);
  assert.equal(seo.structuredData[0]['@type'], 'WebSite');
  assert.equal(seo.structuredData[1]['@type'], 'WebApplication');
});

test('injectSeoIntoHtml injects canonical, OG image, verification tag, and dynamic title into HTML', () => {
  const sampleHtml = `<!doctype html><html><head><title>Old</title><meta name="description" content="Old" /><meta property="og:title" content="Old" /><meta property="og:description" content="Old" /><meta name="twitter:title" content="Old" /><meta name="twitter:description" content="Old" /></head><body></body></html>`;
  const result = injectSeoIntoHtml(sampleHtml, {
    baseUrl: 'https://qatarmoneymarkets.com',
    pathname: '/stock/QIBK',
    search: '',
    googleSiteVerification: 'abc123token',
  });

  assert.ok(result.includes('<title>QIBK (Qatar Islamic Bank) Live QSE Price — Qatar Money Markets</title>'));
  assert.ok(result.includes('<link rel="canonical" href="https://qatarmoneymarkets.com/stock/QIBK" />'));
  assert.ok(result.includes('<meta property="og:image" content="https://qatarmoneymarkets.com/og-card.jpg" />'));
  assert.ok(result.includes('<meta name="google-site-verification" content="abc123token" />'));
  assert.ok(result.includes('SearchAction'));
  assert.equal(SEO_TICKERS.length, 20);
});
