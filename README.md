# GoSignal

A static, mobile-first PWA that turns live weather, air quality, and nearby places into a simple go / wait / skip recommendation.

## Features
- Plain HTML, CSS, and JS only
- Live Open-Meteo weather, air quality, and geocoding
- Nearby places from OpenStreetMap Overpass
- Geolocation with manual city search fallback
- Task chips for coffee, grocery, dog walk, run, picnic, photography, and open windows
- Installable PWA with manifest, service worker, offline shell, and cached last data

## Run locally
Any static server works. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages
This repo is ready to publish from the repo root. Set GitHub Pages to serve from the default branch root.

## Notes
- Uses relative asset paths throughout for GitHub Pages safety.
- Service worker caches the app shell and last fetched data for offline use.
- If geolocation is blocked, use city search.
