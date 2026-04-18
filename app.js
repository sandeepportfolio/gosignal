const CACHE_KEY = 'gosignal-air:last'

const PROFILES = [
  {
    id: 'sensitive',
    label: 'Sensitive lungs',
    icon: '◎',
    blurb: 'Best for asthma, smoke-sensitive days, and general air caution.',
    weights: { aqi: 2.1, pm: 2.2, pollen: 0.8, uv: 0.4, temp: 0.5, humidity: 0.5, wind: 0.3, rain: 0.4 },
    idealTemp: [16, 24],
    placeSets: {
      safer: [{ key: 'leisure', value: 'park' }, { key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'cafe' }],
      shelter: [{ key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'hospital' }, { key: 'amenity', value: 'library' }, { key: 'amenity', value: 'cafe' }],
    },
  },
  {
    id: 'allergy',
    label: 'Seasonal allergy',
    icon: '✿',
    blurb: 'Prioritizes pollen, wind, and air irritants that can stack quickly.',
    weights: { pollen: 2.4, wind: 1.0, aqi: 0.9, pm: 0.9, uv: 0.4, temp: 0.4, humidity: 0.3, rain: 0.5 },
    idealTemp: [16, 24],
    placeSets: {
      safer: [{ key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'cafe' }, { key: 'leisure', value: 'park' }],
      shelter: [{ key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'library' }, { key: 'amenity', value: 'cafe' }],
    },
  },
  {
    id: 'baby',
    label: 'Kid outside',
    icon: '◌',
    blurb: 'Balances air, UV, heat, and rain for short family outings.',
    weights: { aqi: 1.8, pm: 1.9, uv: 1.2, temp: 1.0, humidity: 0.6, rain: 0.9, pollen: 0.7, wind: 0.5 },
    idealTemp: [17, 23],
    placeSets: {
      safer: [{ key: 'leisure', value: 'playground' }, { key: 'amenity', value: 'library' }, { key: 'amenity', value: 'cafe' }],
      shelter: [{ key: 'amenity', value: 'library' }, { key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'cafe' }],
    },
  },
  {
    id: 'runner',
    label: 'Outdoor run',
    icon: '↗',
    blurb: 'Rewards cleaner air, lower UV, good running temps, and lighter wind.',
    weights: { aqi: 1.5, pm: 1.5, uv: 1.1, temp: 1.3, humidity: 0.8, wind: 0.7, rain: 0.9, pollen: 0.6 },
    idealTemp: [10, 18],
    placeSets: {
      safer: [{ key: 'leisure', value: 'park' }, { key: 'leisure', value: 'fitness_station' }, { key: 'amenity', value: 'drinking_water' }],
      shelter: [{ key: 'amenity', value: 'cafe' }, { key: 'amenity', value: 'pharmacy' }, { key: 'amenity', value: 'library' }],
    },
  },
]

const state = {
  profileId: 'sensitive',
  city: '',
  coords: null,
  location: null,
  snapshot: null,
  hours: [],
  places: [],
  savedAt: null,
}

const $ = (id) => document.getElementById(id)
const els = {
  locationLine: $('locationLine'),
  scoreOrb: $('scoreOrb'),
  scoreValue: $('scoreValue'),
  scoreHint: $('scoreHint'),
  statusBadge: $('statusBadge'),
  summary: $('summary'),
  reasonChips: $('reasonChips'),
  refreshBtn: $('refreshBtn'),
  locateBtn: $('locateBtn'),
  cityInput: $('cityInput'),
  searchBtn: $('searchBtn'),
  shareBtn: $('shareBtn'),
  installBtn: $('installBtn'),
  profiles: $('profiles'),
  profileBlurb: $('profileBlurb'),
  windowsList: $('windowsList'),
  timelineNote: $('timelineNote'),
  metricsGrid: $('metricsGrid'),
  planList: $('planList'),
  placesList: $('placesList'),
  placesNote: $('placesNote'),
  offlineLine: $('offlineLine'),
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function fmtTemp(value) {
  return value == null ? 'n/a' : `${Math.round(value)}°`
}

function fmtTime(value) {
  return new Intl.DateTimeFormat([], { hour: 'numeric' }).format(new Date(value))
}

function fmtDistance(value) {
  if (value == null) return 'nearby'
  return value < 1000 ? `${Math.round(value)} m away` : `${(value / 1000).toFixed(1)} km away`
}

function fmtMapUrl(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}

function currentProfile() {
  return PROFILES.find((profile) => profile.id === state.profileId) || PROFILES[0]
}

function weightedAverage(parts, weights) {
  let sum = 0
  let total = 0
  Object.entries(parts).forEach(([key, value]) => {
    if (value == null) return
    const weight = weights[key] || 0
    if (!weight) return
    sum += value * weight
    total += weight
  })
  if (!total) return 58
  return clamp(Math.round(sum / total), 0, 100)
}

function steppedScore(value, steps, fallback = 60) {
  if (value == null || Number.isNaN(value)) return fallback
  for (const [limit, score] of steps) {
    if (value <= limit) return score
  }
  return steps[steps.length - 1][1]
}

function rangeScore(value, low, high, floor = 20) {
  if (value == null || Number.isNaN(value)) return 60
  if (value >= low && value <= high) return 100
  const distance = value < low ? low - value : value - high
  return clamp(100 - distance * 8, floor, 100)
}

function scoreAQI(value) {
  return steppedScore(value, [[30, 100], [50, 92], [75, 75], [100, 55], [150, 30], [999, 12]])
}

function scorePM(value) {
  return steppedScore(value, [[8, 100], [12, 88], [20, 72], [35, 45], [55, 24], [999, 10]])
}

function scoreUV(value) {
  return steppedScore(value, [[2, 100], [5, 78], [7, 58], [10, 32], [99, 12]])
}

function scorePollen(value) {
  return steppedScore(value, [[2, 100], [20, 78], [80, 45], [160, 24], [9999, 10]], null)
}

function scoreRain(value) {
  return steppedScore(value, [[0, 100], [0.3, 88], [1, 68], [3, 38], [999, 12]])
}

function scoreWind(value, profileId) {
  if (value == null) return 60
  if (profileId === 'allergy') return steppedScore(value, [[10, 100], [18, 82], [26, 55], [40, 28], [999, 12]])
  if (profileId === 'runner') return steppedScore(value, [[8, 100], [14, 84], [22, 60], [30, 36], [999, 18]])
  return steppedScore(value, [[10, 100], [18, 84], [26, 64], [34, 40], [999, 20]])
}

function bestPollen(hour) {
  const options = [
    ['Alder', hour.alder_pollen],
    ['Birch', hour.birch_pollen],
    ['Grass', hour.grass_pollen],
    ['Ragweed', hour.ragweed_pollen],
    ['Olive', hour.olive_pollen],
    ['Mugwort', hour.mugwort_pollen],
  ].filter((item) => item[1] != null)

  if (!options.length) return null
  return options.sort((a, b) => b[1] - a[1])[0]
}

function toneFromScore(score) {
  if (score >= 82) return { key: 'good', badge: 'Clear to go', orb: 'Green light' }
  if (score >= 68) return { key: 'okay', badge: 'Pretty good', orb: 'Mostly clear' }
  if (score >= 52) return { key: 'warn', badge: 'Use caution', orb: 'Mixed signal' }
  return { key: 'bad', badge: 'Better to wait', orb: 'High exposure' }
}

function exposureModel(hour, profile) {
  const pollen = bestPollen(hour)
  const parts = {
    aqi: scoreAQI(hour.us_aqi),
    pm: scorePM(hour.pm2_5),
    uv: scoreUV(hour.uv_index),
    pollen: scorePollen(pollen?.[1] ?? null),
    temp: rangeScore(hour.apparent_temperature ?? hour.temperature_2m, profile.idealTemp[0], profile.idealTemp[1]),
    humidity: rangeScore(hour.relative_humidity_2m, 35, 65),
    wind: scoreWind(hour.wind_speed_10m, profile.id),
    rain: scoreRain(hour.precipitation),
  }

  const score = weightedAverage(parts, profile.weights)
  const factors = [
    {
      id: 'aqi',
      label: 'AQI',
      value: hour.us_aqi == null ? 'n/a' : `${Math.round(hour.us_aqi)}`,
      note: hour.us_aqi == null ? 'No AQI reading' : hour.us_aqi <= 50 ? 'Low irritation' : hour.us_aqi <= 100 ? 'Moderate load' : 'Air is rough',
      chip: hour.us_aqi == null ? null : hour.us_aqi <= 50 ? 'AQI calm' : `AQI ${Math.round(hour.us_aqi)}`,
      score: parts.aqi,
    },
    {
      id: 'pm',
      label: 'PM2.5',
      value: hour.pm2_5 == null ? 'n/a' : `${hour.pm2_5.toFixed(1)} µg/m³`,
      note: hour.pm2_5 == null ? 'No fine particle reading' : hour.pm2_5 <= 12 ? 'Low particle load' : hour.pm2_5 <= 35 ? 'Noticeable particles' : 'Particles are elevated',
      chip: hour.pm2_5 == null ? null : hour.pm2_5 <= 12 ? 'PM2.5 low' : `PM2.5 ${hour.pm2_5.toFixed(0)}`,
      score: parts.pm,
    },
    {
      id: 'pollen',
      label: pollen ? `${pollen[0]} pollen` : 'Pollen',
      value: pollen ? `${Number(pollen[1]).toFixed(1)} grains/m³` : 'n/a',
      note: pollen ? pollen[1] <= 2 ? 'Quiet pollen level' : pollen[1] <= 20 ? 'Manageable pollen' : pollen[1] <= 80 ? 'Pollen is active' : 'Heavy pollen signal' : 'Unavailable in this area right now',
      chip: pollen ? pollen[1] <= 2 ? `${pollen[0]} calm` : `${pollen[0]} ${Number(pollen[1]).toFixed(0)}` : 'Pollen unavailable',
      score: parts.pollen,
    },
    {
      id: 'uv',
      label: 'UV index',
      value: hour.uv_index == null ? 'n/a' : `${Number(hour.uv_index).toFixed(1)}`,
      note: hour.uv_index == null ? 'No UV reading' : hour.uv_index <= 2 ? 'Low UV load' : hour.uv_index <= 5 ? 'Moderate UV' : hour.uv_index <= 7 ? 'High UV' : 'Very high UV',
      chip: hour.uv_index == null ? null : hour.uv_index <= 2 ? 'UV low' : `UV ${Number(hour.uv_index).toFixed(1)}`,
      score: parts.uv,
    },
    {
      id: 'temp',
      label: 'Feels like',
      value: fmtTemp(hour.apparent_temperature ?? hour.temperature_2m),
      note: (hour.apparent_temperature ?? hour.temperature_2m) == null ? 'No temperature reading' : parts.temp >= 85 ? 'Comfortable range' : parts.temp >= 60 ? 'Usable with care' : 'Temp stress is rising',
      chip: (hour.apparent_temperature ?? hour.temperature_2m) == null ? null : `Feels ${fmtTemp(hour.apparent_temperature ?? hour.temperature_2m)}`,
      score: parts.temp,
    },
    {
      id: 'humidity',
      label: 'Humidity',
      value: hour.relative_humidity_2m == null ? 'n/a' : `${Math.round(hour.relative_humidity_2m)}%`,
      note: hour.relative_humidity_2m == null ? 'No humidity reading' : parts.humidity >= 80 ? 'Comfortable humidity' : parts.humidity >= 60 ? 'A bit sticky or dry' : 'Humidity may feel rough',
      chip: hour.relative_humidity_2m == null ? null : `Humidity ${Math.round(hour.relative_humidity_2m)}%`,
      score: parts.humidity,
    },
    {
      id: 'wind',
      label: 'Wind',
      value: hour.wind_speed_10m == null ? 'n/a' : `${Math.round(hour.wind_speed_10m)} km/h`,
      note: hour.wind_speed_10m == null ? 'No wind reading' : parts.wind >= 80 ? 'Light enough' : parts.wind >= 55 ? 'Some gusts' : 'Wind is pushing triggers around',
      chip: hour.wind_speed_10m == null ? null : `Wind ${Math.round(hour.wind_speed_10m)} km/h`,
      score: parts.wind,
    },
    {
      id: 'rain',
      label: 'Rain',
      value: hour.precipitation == null ? 'n/a' : `${Number(hour.precipitation).toFixed(1)} mm`,
      note: hour.precipitation == null ? 'No precipitation reading' : hour.precipitation === 0 ? 'Dry right now' : hour.precipitation <= 1 ? 'Light precipitation' : 'Wet conditions',
      chip: hour.precipitation == null ? null : hour.precipitation === 0 ? 'Dry outside' : `Rain ${Number(hour.precipitation).toFixed(1)} mm`,
      score: parts.rain,
    },
  ]

  return { score, tone: toneFromScore(score), factors }
}

function mergeByTime(weather, air) {
  const airIndex = new Map((air.hourly?.time || []).map((time, index) => [time, index]))
  const hours = (weather.hourly?.time || []).map((time, index) => {
    const airPos = airIndex.get(time)
    return {
      time,
      temperature_2m: weather.hourly.temperature_2m?.[index],
      apparent_temperature: weather.hourly.apparent_temperature?.[index],
      relative_humidity_2m: weather.hourly.relative_humidity_2m?.[index],
      precipitation: weather.hourly.precipitation?.[index],
      wind_speed_10m: weather.hourly.wind_speed_10m?.[index],
      us_aqi: airPos == null ? null : air.hourly.us_aqi?.[airPos],
      pm2_5: airPos == null ? null : air.hourly.pm2_5?.[airPos],
      uv_index: airPos == null ? weather.hourly.uv_index?.[index] : air.hourly.uv_index?.[airPos],
      alder_pollen: airPos == null ? null : air.hourly.alder_pollen?.[airPos],
      birch_pollen: airPos == null ? null : air.hourly.birch_pollen?.[airPos],
      grass_pollen: airPos == null ? null : air.hourly.grass_pollen?.[airPos],
      ragweed_pollen: airPos == null ? null : air.hourly.ragweed_pollen?.[airPos],
      olive_pollen: airPos == null ? null : air.hourly.olive_pollen?.[airPos],
      mugwort_pollen: airPos == null ? null : air.hourly.mugwort_pollen?.[airPos],
    }
  })

  const current = {
    time: weather.current?.time || air.current?.time,
    temperature_2m: weather.current?.temperature_2m,
    apparent_temperature: weather.current?.apparent_temperature,
    relative_humidity_2m: weather.current?.relative_humidity_2m,
    precipitation: weather.current?.precipitation,
    wind_speed_10m: weather.current?.wind_speed_10m,
    us_aqi: air.current?.us_aqi,
    pm2_5: air.current?.pm2_5,
    uv_index: air.current?.uv_index ?? weather.current?.uv_index,
    alder_pollen: air.current?.alder_pollen,
    birch_pollen: air.current?.birch_pollen,
    grass_pollen: air.current?.grass_pollen,
    ragweed_pollen: air.current?.ragweed_pollen,
    olive_pollen: air.current?.olive_pollen,
    mugwort_pollen: air.current?.mugwort_pollen,
  }

  return { current, hours }
}

function nextHours() {
  if (!state.hours.length) return []
  const currentKey = state.snapshot?.current?.time?.slice(0, 16)
  const start = currentKey ? state.hours.findIndex((hour) => hour.time >= currentKey) : 0
  const safeStart = start >= 0 ? start : 0
  return state.hours.slice(safeStart, safeStart + 12)
}

function topReasons(model) {
  const scored = model.factors.filter((factor) => factor.chip)
  const trouble = scored.filter((factor) => factor.score != null && factor.score < 70).sort((a, b) => a.score - b.score)
  if (trouble.length) return trouble.slice(0, 4).map((factor) => factor.chip)
  return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 4).map((factor) => factor.chip)
}

function buildPlan(currentModel, bestHour, profile) {
  const items = []
  const bestModel = bestHour ? exposureModel(bestHour, profile) : null

  if (bestHour && bestModel && bestModel.score >= currentModel.score + 8) {
    items.push({
      title: `Wait for ${fmtTime(bestHour.time)}`,
      copy: `${profile.label} conditions look materially better then, with a score of ${bestModel.score}.`,
    })
  } else if (currentModel.score >= 68) {
    items.push({
      title: 'Now is a solid window',
      copy: `Conditions are aligned for ${profile.label.toLowerCase()} right now. Keep an eye on the top trigger chips before you head out.`,
    })
  } else {
    items.push({
      title: 'Keep this outing short',
      copy: 'If you still go now, cut exposure time down and use your usual meds or gear if that is part of your routine.',
    })
  }

  const worstFactor = [...currentModel.factors].filter((factor) => factor.score != null).sort((a, b) => a.score - b.score)[0]
  if (worstFactor) {
    items.push({
      title: `Watch ${worstFactor.label.toLowerCase()}`,
      copy: worstFactor.note,
    })
  }

  items.push({
    title: 'Save this view to your home screen',
    copy: 'The app keeps your last successful snapshot offline, so your usual city reopens fast.',
  })

  return items.slice(0, 3)
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search)
  params.set('profile', state.profileId)

  if (state.city) {
    params.set('city', state.city)
    params.delete('lat')
    params.delete('lon')
  } else if (state.coords) {
    params.set('lat', state.coords.lat.toFixed(2))
    params.set('lon', state.coords.lon.toFixed(2))
    params.delete('city')
  }

  history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
}

function saveCache() {
  const payload = {
    profileId: state.profileId,
    city: state.city,
    coords: state.coords,
    location: state.location,
    snapshot: state.snapshot,
    hours: state.hours,
    places: state.places,
    savedAt: Date.now(),
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
}

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, ...init })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function lookupCity(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
  const data = await fetchJson(url)
  return data.results?.[0] || null
}

async function reverseLookup(lat, lon) {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`
  const data = await fetchJson(url)
  return data.results?.[0] || null
}

async function getWeather(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'uv_index'].join(','),
    hourly: ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'uv_index'].join(','),
    forecast_days: '2',
    timezone: 'auto',
  }).toString()
  return fetchJson(url)
}

async function getAir(lat, lon) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality')
  url.search = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: ['us_aqi', 'pm2_5', 'uv_index', 'alder_pollen', 'birch_pollen', 'grass_pollen', 'ragweed_pollen', 'olive_pollen', 'mugwort_pollen'].join(','),
    hourly: ['us_aqi', 'pm2_5', 'uv_index', 'alder_pollen', 'birch_pollen', 'grass_pollen', 'ragweed_pollen', 'olive_pollen', 'mugwort_pollen'].join(','),
    timezone: 'auto',
  }).toString()
  return fetchJson(url)
}

function distance(lat1, lon1, lat2, lon2) {
  const R = 6371e3
  const p = Math.PI / 180
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function placeQuery(lat, lon, tags) {
  const blocks = tags.flatMap(({ key, value }) => [
    `node["${key}"="${value}"](around:2400,${lat},${lon});`,
    `way["${key}"="${value}"](around:2400,${lat},${lon});`,
    `relation["${key}"="${value}"](around:2400,${lat},${lon});`,
  ])
  return `[out:json][timeout:20];(${blocks.join('')});out center 24;`
}

async function getPlaces(lat, lon, profileId, score) {
  const profile = PROFILES.find((item) => item.id === profileId) || PROFILES[0]
  const tags = score >= 60 ? profile.placeSets.safer : profile.placeSets.shelter
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(placeQuery(lat, lon, tags))}`,
  })
  const data = await response.json()
  const seen = new Set()
  return (data.elements || [])
    .map((element) => {
      const lat2 = element.lat ?? element.center?.lat
      const lon2 = element.lon ?? element.center?.lon
      if (lat2 == null || lon2 == null) return null
      const name = element.tags?.name || element.tags?.amenity || element.tags?.leisure || 'place'
      const kind = element.tags?.amenity || element.tags?.leisure || 'place'
      const key = `${name}-${lat2.toFixed(4)}-${lon2.toFixed(4)}`
      if (seen.has(key)) return null
      seen.add(key)
      return {
        name,
        kind: kind.replaceAll('_', ' '),
        lat: lat2,
        lon: lon2,
        distance: distance(lat, lon, lat2, lon2),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6)
}

function renderProfiles() {
  const template = $('profileTpl')
  els.profiles.innerHTML = ''
  PROFILES.forEach((profile) => {
    const node = document.importNode(template.content, true)
    const button = node.querySelector('button')
    button.dataset.profile = profile.id
    button.setAttribute('aria-selected', String(profile.id === state.profileId))
    button.querySelector('.profile-icon').textContent = profile.icon
    button.querySelector('.profile-text').textContent = profile.label
    button.onclick = () => changeProfile(profile.id)
    els.profiles.appendChild(button)
  })
  els.profileBlurb.textContent = currentProfile().blurb
}

function renderReasons(chips) {
  els.reasonChips.innerHTML = ''
  chips.forEach((chip) => {
    const item = document.createElement('span')
    item.className = 'reason-chip'
    item.textContent = chip
    els.reasonChips.appendChild(item)
  })
}

function renderWindows(hours, profile) {
  els.windowsList.innerHTML = ''
  if (!hours.length) {
    els.windowsList.innerHTML = '<div class="empty-state">No forecast windows available yet.</div>'
    els.timelineNote.textContent = 'Waiting on forecast data.'
    return
  }

  const scored = hours.map((hour) => ({ hour, model: exposureModel(hour, profile) }))
  const best = [...scored].sort((a, b) => b.model.score - a.model.score)[0]
  els.timelineNote.textContent = best ? `Best near ${fmtTime(best.hour.time)} with a score of ${best.model.score}.` : 'Live outlook loaded.'

  const template = $('windowTpl')
  scored.forEach(({ hour, model }) => {
    const node = document.importNode(template.content, true)
    const card = node.querySelector('.window-card')
    card.classList.add(model.tone.key)
    card.querySelector('.window-time').textContent = fmtTime(hour.time)
    card.querySelector('.window-score').textContent = `${model.score}`
    card.querySelector('.window-state').textContent = model.tone.badge
    const lead = model.factors.filter((factor) => factor.chip).sort((a, b) => (a.score || 0) - (b.score || 0))[0]
    card.querySelector('.window-meta').textContent = lead ? lead.note : 'Stable conditions.'
    els.windowsList.appendChild(card)
  })
}

function renderMetrics(model) {
  const template = $('metricTpl')
  els.metricsGrid.innerHTML = ''
  model.factors.forEach((factor) => {
    const node = document.importNode(template.content, true)
    node.querySelector('.metric-label').textContent = factor.label
    node.querySelector('.metric-value').textContent = factor.value
    node.querySelector('.metric-note').textContent = factor.note
    els.metricsGrid.appendChild(node)
  })
}

function renderPlans(items) {
  const template = $('planTpl')
  els.planList.innerHTML = ''
  items.forEach((item) => {
    const node = document.importNode(template.content, true)
    node.querySelector('.plan-title').textContent = item.title
    node.querySelector('.plan-copy').textContent = item.copy
    els.planList.appendChild(node)
  })
}

function renderPlaces() {
  const template = $('placeTpl')
  els.placesList.innerHTML = ''
  if (!state.places.length) {
    els.placesList.innerHTML = '<div class="empty-state">No nearby places loaded yet. Try refresh or switch location.</div>'
    return
  }

  state.places.forEach((place) => {
    const node = document.importNode(template.content, true)
    const card = node.querySelector('.place-card')
    card.href = fmtMapUrl(place.lat, place.lon)
    node.querySelector('.place-name').textContent = place.name
    node.querySelector('.place-meta').textContent = `${place.kind} • ${fmtDistance(place.distance)}`
    els.placesList.appendChild(node)
  })
}

function renderAll() {
  renderProfiles()

  if (!state.snapshot?.current) return

  const profile = currentProfile()
  const currentModel = exposureModel(state.snapshot.current, profile)
  const tone = currentModel.tone
  const next = nextHours()
  const bestHour = [...next].sort((a, b) => exposureModel(b, profile).score - exposureModel(a, profile).score)[0]
  const bestModel = bestHour ? exposureModel(bestHour, profile) : null

  els.locationLine.textContent = `${state.location?.name || 'Current location'}${state.location?.admin1 ? `, ${state.location.admin1}` : ''}${state.location?.country ? ` • ${state.location.country}` : ''}`
  els.scoreValue.textContent = currentModel.score
  els.scoreHint.textContent = tone.orb
  els.statusBadge.className = `status-badge ${tone.key}`
  els.statusBadge.textContent = tone.badge

  const reason = [...currentModel.factors].filter((factor) => factor.score != null).sort((a, b) => a.score - b.score)[0]
  if (currentModel.score >= 68) {
    els.summary.textContent = bestHour && bestModel ? `${profile.label} looks good right now. ${fmtTime(bestHour.time)} is the strongest window in the next 12 hours.` : `${profile.label} looks good right now.`
  } else if (bestHour && bestModel && bestModel.score > currentModel.score) {
    els.summary.textContent = `${reason?.label || 'Conditions'} are dragging the score down. Waiting until ${fmtTime(bestHour.time)} should feel better.`
  } else {
    els.summary.textContent = `${reason?.label || 'Conditions'} are the main pressure point right now. If you go, keep it brief and watch symptoms.`
  }

  renderReasons(topReasons(currentModel))
  renderWindows(next, profile)
  renderMetrics(currentModel)
  renderPlans(buildPlan(currentModel, bestHour, profile))
  renderPlaces()

  els.placesNote.textContent = currentModel.score >= 60 ? 'Useful nearby options if you want to make the most of this window.' : 'Fallback indoor or support spots if conditions feel rough.'
  els.offlineLine.textContent = `Last successful check saved ${new Date(state.savedAt || Date.now()).toLocaleString()}.`

  saveCache()
  syncUrl()
}

async function loadLocation(lat, lon, cityLabel = '') {
  state.coords = { lat, lon }
  state.city = cityLabel || ''
  state.places = []
  els.locationLine.textContent = cityLabel ? `Loading ${cityLabel}...` : `Loading ${lat.toFixed(2)}, ${lon.toFixed(2)}...`
  els.summary.textContent = 'Pulling live weather and air data...'
  els.placesNote.textContent = 'Loading nearby places...'
  els.placesList.innerHTML = '<div class="empty-state">Loading nearby places...</div>'

  const [weather, air, reverse] = await Promise.all([
    getWeather(lat, lon),
    getAir(lat, lon),
    cityLabel ? Promise.resolve(null) : reverseLookup(lat, lon).catch(() => null),
  ])

  const merged = mergeByTime(weather, air)
  state.snapshot = merged
  state.hours = merged.hours
  state.location = cityLabel
    ? { name: cityLabel, admin1: '', country: '' }
    : reverse
      ? { name: reverse.name, admin1: reverse.admin1 || '', country: reverse.country || '' }
      : { name: 'Current location', admin1: '', country: '' }
  state.savedAt = Date.now()
  renderAll()

  const profile = currentProfile()
  const currentModel = exposureModel(state.snapshot.current, profile)
  try {
    state.places = await getPlaces(lat, lon, state.profileId, currentModel.score)
    renderPlaces()
  } catch {
    els.placesList.innerHTML = '<div class="empty-state">Nearby places could not load right now.</div>'
  }
  saveCache()
}

async function changeProfile(profileId) {
  state.profileId = profileId
  renderAll()
  if (state.coords && state.snapshot?.current) {
    els.placesNote.textContent = 'Refreshing nearby places for this profile...'
    try {
      const profile = currentProfile()
      const currentModel = exposureModel(state.snapshot.current, profile)
      state.places = await getPlaces(state.coords.lat, state.coords.lon, state.profileId, currentModel.score)
      renderPlaces()
      els.placesNote.textContent = currentModel.score >= 60 ? 'Useful nearby options if you want to make the most of this window.' : 'Fallback indoor or support spots if conditions feel rough.'
      saveCache()
      syncUrl()
    } catch {
      els.placesNote.textContent = 'Nearby places could not refresh right now.'
    }
  }
}

async function locate() {
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }))
    await loadLocation(position.coords.latitude, position.coords.longitude)
  } catch {
    const cache = loadCache()
    if (cache?.snapshot?.current) {
      Object.assign(state, cache)
      renderAll()
      els.locationLine.textContent = 'Location blocked, showing your last saved snapshot.'
    } else {
      els.locationLine.textContent = 'Location blocked. Search a city instead.'
      els.summary.textContent = 'Search a city to get a live exposure read.'
    }
  }
}

async function doSearch() {
  const query = els.cityInput.value.trim()
  if (!query) return
  els.summary.textContent = 'Searching for that city...'
  const hit = await lookupCity(query)
  if (!hit) {
    els.summary.textContent = 'No match found. Try a larger nearby city.'
    return
  }
  await loadLocation(hit.latitude, hit.longitude, hit.name)
}

async function shareView() {
  const url = window.location.href
  const title = 'GoSignal Air'
  const text = 'Live allergy and air exposure guidance.'
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return
    } catch {
      return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    els.shareBtn.textContent = 'Link copied'
    setTimeout(() => { els.shareBtn.textContent = 'Share' }, 1600)
  } catch {
    window.prompt('Copy this link', url)
  }
}

function setupInstall() {
  let deferred
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event
    els.installBtn.classList.remove('hidden')
  })

  els.installBtn.onclick = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    deferred = null
    els.installBtn.classList.add('hidden')
  }
}

function hydrateFromCache() {
  const cache = loadCache()
  if (!cache?.snapshot?.current) return
  Object.assign(state, cache)
  renderAll()
}

async function bootstrapFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const requestedProfile = params.get('profile')
  if (requestedProfile && PROFILES.some((profile) => profile.id === requestedProfile)) {
    state.profileId = requestedProfile
  }

  const city = params.get('city')
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))

  if (city) {
    els.cityInput.value = city
    const hit = await lookupCity(city)
    if (hit) {
      await loadLocation(hit.latitude, hit.longitude, hit.name)
      return true
    }
  }

  if (!Number.isNaN(lat) && !Number.isNaN(lon) && lat && lon) {
    await loadLocation(lat, lon)
    return true
  }

  return false
}

async function init() {
  renderProfiles()
  hydrateFromCache()
  setupInstall()

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }

  els.searchBtn.onclick = () => doSearch().catch((error) => { els.summary.textContent = `Unable to search: ${error.message}` })
  els.cityInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSearch().catch((error) => { els.summary.textContent = `Unable to search: ${error.message}` })
  })
  els.refreshBtn.onclick = () => state.coords ? loadLocation(state.coords.lat, state.coords.lon, state.city).catch((error) => { els.summary.textContent = `Unable to refresh: ${error.message}` }) : locate()
  els.locateBtn.onclick = () => locate()
  els.shareBtn.onclick = () => shareView()

  const loadedFromUrl = await bootstrapFromUrl().catch(() => false)
  if (!loadedFromUrl && !state.snapshot?.current) {
    await locate()
  }
}

init().catch((error) => {
  els.summary.textContent = `Unable to load live data: ${error.message}`
})
