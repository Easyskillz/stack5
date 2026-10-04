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

export const COUNTRY_CATALOG = [
  ['MA', 'Morocco', 'NAFR', '🇲🇦'],
  ['DZ', 'Algeria', 'NAFR', '🇩🇿'],
  ['TN', 'Tunisia', 'NAFR', '🇹🇳'],
  ['LY', 'Libya', 'NAFR', '🇱🇾'],
  ['EG', 'Egypt', 'NAFR', '🇪🇬'],
  ['FR', 'France', 'EU', '🇫🇷'],
  ['ES', 'Spain', 'EU', '🇪🇸'],
  ['DE', 'Germany', 'EU', '🇩🇪'],
  ['GB', 'United Kingdom', 'EU', '🇬🇧'],
  ['IT', 'Italy', 'EU', '🇮🇹'],
  ['BE', 'Belgium', 'EU', '🇧🇪'],
  ['NL', 'Netherlands', 'EU', '🇳🇱'],
  ['PT', 'Portugal', 'EU', '🇵🇹'],
  ['US', 'United States', 'NA', '🇺🇸'],
  ['CA', 'Canada', 'NA', '🇨🇦'],
  ['BR', 'Brazil', 'SA', '🇧🇷'],
  ['AR', 'Argentina', 'SA', '🇦🇷'],
  ['CL', 'Chile', 'SA', '🇨🇱'],
  ['AU', 'Australia', 'OCE', '🇦🇺'],
  ['NZ', 'New Zealand', 'OCE', '🇳🇿'],
  ['JP', 'Japan', 'ASIA', '🇯🇵'],
  ['KR', 'South Korea', 'ASIA', '🇰🇷'],
  ['SG', 'Singapore', 'SEA', '🇸🇬'],
  ['MY', 'Malaysia', 'SEA', '🇲🇾'],
  ['TH', 'Thailand', 'SEA', '🇹🇭'],
  ['SA', 'Saudi Arabia', 'MENA', '🇸🇦'],
  ['AE', 'United Arab Emirates', 'MENA', '🇦🇪'],
  ['IL', 'Israel', 'MENA', '🇮🇱'],
  ['ZA', 'South Africa', 'AFRICA', '🇿🇦'],
  ['NG', 'Nigeria', 'AFRICA', '🇳🇬'],
];

export function getRegion(id) {
  return REGION_CATALOG.find(r => r.id === id) || REGION_CATALOG[0];
}

export function getCountry(code) {
  const row = COUNTRY_CATALOG.find(c => c[0] === code);
  if (!row) return null;
  return { code: row[0], name: row[1], region: row[2], flag: row[3] };
}
