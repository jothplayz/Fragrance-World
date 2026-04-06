export type GeocodeResult = {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
};

export type WeatherToday = {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipProbMax: number;
  weatherCode: number;
  timezone: string;
};

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    /\s+/
  )
);

/** Open-Meteo often returns no hits for "City, ST"; derive a structured search. */
function geocodeVariants(query: string): Array<{ name: string; countryCode?: string }> {
  const trimmed = query.trim();
  const variants: Array<{ name: string; countryCode?: string }> = [{ name: trimmed }];

  const comma = trimmed.indexOf(",");
  if (comma <= 0) return variants;

  const left = trimmed.slice(0, comma).trim();
  const right = trimmed.slice(comma + 1).trim();
  if (!left) return variants;

  if (right.length === 2 && US_STATE_CODES.has(right.toUpperCase())) {
    variants.push({ name: left, countryCode: "US" });
  } else if (/^[A-Z]{2}$/i.test(right)) {
    let cc = right.toUpperCase();
    if (cc === "UK") cc = "GB";
    variants.push({ name: left, countryCode: cc });
  } else {
    variants.push({ name: left });
  }

  return variants;
}

function formatGeocodeLabel(first: {
  name: string;
  country?: string;
  admin1?: string;
}): string {
  if (first.admin1 && first.admin1 !== first.name) {
    return `${first.name}, ${first.admin1}`;
  }
  if (first.country) {
    return `${first.name}, ${first.country}`;
  }
  return first.name;
}

async function searchGeocode(
  name: string,
  countryCode?: string
): Promise<GeocodeResult | null> {
  const url = new URL(GEO);
  url.searchParams.set("name", name);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  if (countryCode) {
    url.searchParams.set("countryCode", countryCode);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      latitude: number;
      longitude: number;
      name: string;
      country?: string;
      admin1?: string;
    }>;
  };

  const first = data.results?.[0];
  if (!first) return null;

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    name: formatGeocodeLabel(first),
    country: first.country,
  };
}

export async function geocodeCity(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const tried = new Set<string>();
  for (const v of geocodeVariants(trimmed)) {
    const key = `${v.name}|${v.countryCode ?? ""}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const hit = await searchGeocode(v.name, v.countryCode);
    if (hit) return hit;
  }
  return null;
}

export async function fetchTodayWeather(
  latitude: number,
  longitude: number
): Promise<WeatherToday> {
  const url = new URL(FORECAST);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Weather failed: ${res.status}`);

  const data = (await res.json()) as {
    timezone?: string;
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
      weather_code: number[];
    };
  };

  const daily = data.daily;
  if (!daily?.time?.[0]) throw new Error("Unexpected weather response");

  const i = 0;
  return {
    date: daily.time[i],
    tempMaxC: daily.temperature_2m_max[i],
    tempMinC: daily.temperature_2m_min[i],
    precipProbMax: daily.precipitation_probability_max[i] ?? 0,
    weatherCode: daily.weather_code[i],
    timezone: data.timezone ?? "auto",
  };
}

/** Rough WMO: rain/drizzle/snow codes */
export function isWetCode(code: number): boolean {
  if (code === 51 || code === 53 || code === 55) return true; // drizzle
  if (code === 61 || code === 63 || code === 65) return true; // rain
  if (code === 71 || code === 73 || code === 75) return true; // snow
  if (code === 80 || code === 81 || code === 82) return true; // showers
  if (code === 95 || code === 96 || code === 99) return true; // thunderstorm
  return false;
}

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}
