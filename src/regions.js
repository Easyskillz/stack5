export const REGION_CATALOG = [
  { id: 'EU', name: 'Europe', flag: '🇪🇺' },
  { id: 'NA', name: 'North America', flag: '🇺🇸' },
  { id: 'SA', name: 'South America', flag: '🇧🇷' },
  { id: 'LATAM', name: 'Latin America', flag: '🌎' },
  { id: 'ASIA', name: 'Asia', flag: '🌏' },
  { id: 'SEA', name: 'Southeast Asia', flag: '🌴' },
  { id: 'OCE', name: 'Oceania', flag: '🇦🇺' },
  { id: 'MENA', name: 'Middle East', flag: '🌍' },
  { id: 'NAFR', name: 'North Africa', flag: '🌍' },
  { id: 'AFRICA', name: 'Africa', flag: '🌍' },
];

// [code, name, region, flag, lat, lon]. The location is the country's main player hub (capital or largest city),
// used to keep matches between teams that are close enough for good ping.
export const COUNTRY_CATALOG = [
  ['MA', 'Morocco', 'NAFR', '🇲🇦', 33.57, -7.59],
  ['DZ', 'Algeria', 'NAFR', '🇩🇿', 36.75, 3.06],
  ['TN', 'Tunisia', 'NAFR', '🇹🇳', 36.8, 10.18],
  ['LY', 'Libya', 'NAFR', '🇱🇾', 32.89, 13.19],
  ['EG', 'Egypt', 'NAFR', '🇪🇬', 30.04, 31.24],
  ['FR', 'France', 'EU', '🇫🇷', 48.86, 2.35],
  ['ES', 'Spain', 'EU', '🇪🇸', 40.42, -3.7],
  ['DE', 'Germany', 'EU', '🇩🇪', 50.11, 8.68],
  ['GB', 'United Kingdom', 'EU', '🇬🇧', 51.51, -0.13],
  ['IT', 'Italy', 'EU', '🇮🇹', 41.9, 12.5],
  ['BE', 'Belgium', 'EU', '🇧🇪', 50.85, 4.35],
  ['NL', 'Netherlands', 'EU', '🇳🇱', 52.37, 4.9],
  ['PT', 'Portugal', 'EU', '🇵🇹', 38.72, -9.14],
  ['US', 'United States', 'NA', '🇺🇸', 39.5, -98.35],
  ['CA', 'Canada', 'NA', '🇨🇦', 43.65, -79.38],
  ['BR', 'Brazil', 'SA', '🇧🇷', -23.55, -46.63],
  ['AR', 'Argentina', 'SA', '🇦🇷', -34.6, -58.38],
  ['CL', 'Chile', 'SA', '🇨🇱', -33.45, -70.67],
  ['AU', 'Australia', 'OCE', '🇦🇺', -33.87, 151.21],
  ['NZ', 'New Zealand', 'OCE', '🇳🇿', -36.85, 174.76],
  ['JP', 'Japan', 'ASIA', '🇯🇵', 35.68, 139.69],
  ['KR', 'South Korea', 'ASIA', '🇰🇷', 37.57, 126.98],
  ['SG', 'Singapore', 'SEA', '🇸🇬', 1.35, 103.82],
  ['MY', 'Malaysia', 'SEA', '🇲🇾', 3.14, 101.69],
  ['TH', 'Thailand', 'SEA', '🇹🇭', 13.76, 100.5],
  ['SA', 'Saudi Arabia', 'MENA', '🇸🇦', 24.71, 46.68],
  ['AE', 'United Arab Emirates', 'MENA', '🇦🇪', 25.2, 55.27],
  ['IL', 'Israel', 'MENA', '🇮🇱', 32.08, 34.78],
  ['ZA', 'South Africa', 'AFRICA', '🇿🇦', -26.2, 28.05],
  ['NG', 'Nigeria', 'AFRICA', '🇳🇬', 6.52, 3.38],
];

export function getRegion(id) {
  return REGION_CATALOG.find(r => r.id === id) || REGION_CATALOG[0];
}

export function getCountry(code) {
  const row = COUNTRY_CATALOG.find(c => c[0] === code);
  if (!row) return null;
  return { code: row[0], name: row[1], region: row[2], flag: row[3] };
}

// Great-circle distance in km between two [lat, lon] points.
export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const rad = d => d * Math.PI / 180, dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// A team's home point: the average location of its players' countries (null if none is known).
export function homePoint(countryCodes) {
  const pts = countryCodes.map(c => COUNTRY_CATALOG.find(x => x[0] === c)).filter(Boolean).map(x => [x[4], x[5]]);
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

// Languages a player can list (they speak one or more). Teammates need a shared one; opponents don't.
export const LANGUAGE_CODES = ["EN", "FR", "AR", "ES", "DE", "PT", "IT", "NL", "TR", "RU"];
export function parseLanguages(v) {
  const list = (Array.isArray(v) ? v : String(v || "").split(",")).map(x => String(x).trim().toUpperCase()).filter(x => LANGUAGE_CODES.includes(x));
  return [...new Set(list)].slice(0, 5);
}
