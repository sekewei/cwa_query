# CWA Weather Forecast Worker

A Cloudflare Worker that wraps the Central Weather Administration (CWA) open data API to provide simplified weather forecasts for Power Apps custom connectors.

## Live demo

- GitHub Pages demo: https://sekewei.github.io/cwa_query/
- Remote Worker: https://cwa-forecast.sekewei.workers.dev/health

## Required runtime

This project is intended for Node.js 22 or newer.

- Recommended: Node.js 22 LTS
- Version pin: see [.nvmrc](.nvmrc)

## Repository purpose

The worker provides a unified API for two CWA datasets:
- **7-Day Forecast** (`F-C0032-003`): Provides daily forecasts (Wx, MaxT, MinT) for 25 locations.
- **36-Hour Forecast** (`F-C0032-001`): Provides 12-hour block forecasts (Wx, MaxT, MinT, CI, PoP) for 22 counties/cities.

The worker handles:
- Upstream CWA API authentication via `CWA_API_KEY`.
- Data normalization (e.g., converting `+0800` to `+08:00`).
- Flattening complex CWA JSON structures into clean, flat arrays.
- Caching upstream data for 30 minutes using Cloudflare Cache API.

## Local development

From the repository root:

```bat
run.bat
```

Optional reset mode when local Wrangler state is stale:

```bat
run.bat reset
```

This starts the worker locally with Wrangler on `http://127.0.0.1:8787`.

## Deploy to Cloudflare

```bat
deploy.bat
```

The deployment script runs `npx wrangler deploy` for the current project.

## Smoke test

Test the 7-day forecast for Taipei:
```bash
curl "http://127.0.0.1:8787/api/7day/forecast?location=臺北市"
```

Test the 36-hour forecast for Taipei:
```bash
curl "http://127.0.0.1:8787/api/36hour/forecast?location=臺北市"
```

## Project layout

- `src/index.ts` - Worker entry point and routing
- `src/cwa_service.ts` - CWA API fetching and data flattening logic
- `src/types.ts` - TypeScript interfaces for CWA responses and internal models
- `src/utils.ts` - Standardized error response helpers
- `design/cwa_7day_forecast.md` - Design spec for 7-day forecast
- `design/cwa_36hour_forecast.md` - Design spec for 36-hour forecast
- `run.bat` - local Worker launcher with optional reset mode
- `deploy.bat` - Cloudflare deployment script
- `test.bat` - quick client smoke test

## Notes

- The worker is designed to be used as a backend for Power Apps custom connectors.
- Upstream CWA API keys should be managed as Cloudflare Worker Secrets.
