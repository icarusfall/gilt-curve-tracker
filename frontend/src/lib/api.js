const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function getLatestCurves(curveType) {
  const params = curveType ? `?curve_type=${curveType}` : '';
  return fetchJson(`/api/curves/latest${params}`);
}

export function getCurvesForDate(date, curveType) {
  const params = curveType ? `?curve_type=${curveType}` : '';
  return fetchJson(`/api/curves/${date}${params}`);
}

export function compareCurves(dates, curveType = 'nominal') {
  return fetchJson(`/api/curves/compare?dates=${dates.join(',')}&curve_type=${curveType}`);
}

export function getCurveRange(start, end, curveType = 'nominal', maturity = 120) {
  return fetchJson(`/api/curves/range?start=${start}&end=${end}&curve_type=${curveType}&maturity=${maturity}`);
}

export function getPresets() {
  return fetchJson('/api/presets');
}

export function getAvailableDates() {
  return fetchJson('/api/curves/dates');
}

export function getHealth() {
  return fetchJson('/api/health');
}
