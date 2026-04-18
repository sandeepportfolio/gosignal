# GoSignal Air

A mobile-first PWA that gives allergy, asthma, and air-sensitive people a fast answer to one practical question:

**Is now a good time to step outside?**

## What it does
- Uses live Open-Meteo weather and air-quality data
- Includes pollen signals where available
- Supports four quick profiles:
  - Sensitive lungs
  - Seasonal allergy
  - Kid outside
  - Outdoor run
- Scores current conditions and the next 12 hours
- Explains what is driving the score in plain language
- Surfaces nearby helpful places from OpenStreetMap / Overpass
- Works as an installable static PWA with offline snapshot caching

## Stack
- Plain HTML, CSS, and JavaScript
- No backend
- GitHub Pages friendly

## Data sources
- Open-Meteo geocoding and reverse geocoding
- Open-Meteo weather forecast/current conditions
- Open-Meteo air quality and pollen
- OpenStreetMap Overpass nearby places

## Run locally
Any static server works.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy
The repo is ready to publish directly from the repository root on GitHub Pages.
