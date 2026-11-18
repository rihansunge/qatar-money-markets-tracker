# Qatar Money Markets

Real-time Qatar Stock Exchange (QSE) market tracker, Shariah compliance & QATR Halal ETF analytics, dividend calendar, portfolio tracker, and price alerts.

## Requirements

- **Node.js** `>=22.12.0`

## Run Locally

```bash
npm install
npm run dev
```

The server listens on `http://localhost:3000`.

## Build & Run in Production

```bash
npm install
npm run build
npm start
```

## Deploying from GitHub (Render / Railway / Cloud Run)

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Port:** `3000` (or `process.env.PORT` provided automatically by the host)
- **Optional Environment Variables:**
  - `APP_URL`: Your public HTTPS URL (e.g., `https://qatarmoneymarkets.com`)
  - `GOOGLE_SITE_VERIFICATION`: Google Search Console verification token (also configurable inside **Plus & Legal → Google Search & SEO**)
  - `VITE_ADSENSE_CLIENT_ID`: Google AdSense Publisher ID `ca-pub-...` (also configurable inside **Plus & Legal → Plus & AdSense**)
