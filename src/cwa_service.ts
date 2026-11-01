import { Env, Cwa7DayResponse, Cwa36HourResponse, Dataset7Day, Dataset36Hour, Forecast7Day, Forecast36Hour } from './types';

const BASE_URL = 'https://opendata.cwa.gov.tw/fileapi/v1/opendataapi';

async function fetchCwaData<T>(datasetId: string, apiKey: string): Promise<T> {
  const url = `${BASE_URL}/${datasetId}?Authorization=${apiKey}&format=JSON`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`CWA API returned ${response.status}`);
  return await response.json() as T;
}

function normalizeTime7Day(time: string): string {
  // Convert +0800 to +08:00
  return time.replace(/(\+\d{2})(\d{2})$/, '$1:$2');
}

export async function get7DayForecastData(env: Env, ctx: ExecutionContext): Promise<Dataset7Day> {
  console.log(`[DEBUG] Fetching 7-day forecast data...`);
  const cacheKey = new Request(new URL(BASE_URL + '/F-C0032-003').toString());
  const cachedResponse = await caches.default.match(cacheKey);
  
  let rawData: Cwa7DayResponse;
  if (cachedResponse) {
    console.log(`[DEBUG] Using cached 7-day data`);
    rawData = await cachedResponse.json();
  } else {
    console.log(`[DEBUG] Fetching fresh 7-day data from CWA API...`);
    rawData = await fetchCwaData<Cwa7DayResponse>('F-C0032-003', env.CWA_API_KEY);
    ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(rawData), {
      headers: { 'Cache-Control': 'public, max-age=1800' }
    })));
  }

  console.log(`[DEBUG] Parsing 7-day data...`);
  const info = rawData.cwaopendata.Dataset.DatasetInfo;
  const index = new Map<string, Forecast7Day[]>();

  for (const loc of rawData.cwaopendata.Dataset.Locations.Location) {
    const name = loc.LocationName;
    const elements = loc.WeatherElement;
    
    // Find indices for Wx, MaxT, MinT
    const wxIdx = elements.findIndex(e => e.ElementName === '天氣現象');
    const maxTIdx = elements.findIndex(e => e.ElementName === '最高溫度');
    const minTIdx = elements.findIndex(e => e.ElementName === '最低溫度');

    const days: Forecast7Day[] = [];
    const timeEntries = elements[wxIdx].Time;

    for (let i = 0; i < timeEntries.length; i++) {
      const tWx = timeEntries[i];
      const tMax = elements[maxTIdx].Time[i];
      const tMin = elements[minTIdx].Time[i];

      days.push({
        date: normalizeTime7Day(tWx.StartTime),
        wx: tWx.ElementValue.Weather,
        maxT: parseFloat(tMax.ElementValue.MaxTemperature) || null,
        minT: parseFloat(tMin.ElementValue.MinTemperature) || null,
      });
    }
    index.set(name, days);
  }

  return {
    issuedAt: info.IssueTime,
    updatedAt: info.Update,
    stale: false, // Simplified for now
    index
  };
}

export async function get36HourForecastData(env: Env, ctx: ExecutionContext): Promise<Dataset36Hour> {
  const cacheKey = new Request(new URL(BASE_URL + '/F-C0032-001').toString());
  const cachedResponse = await caches.default.match(cacheKey);

  let rawData: Cwa36HourResponse;
  if (cachedResponse) {
    rawData = await cachedResponse.json();
  } else {
    rawData = await fetchCwaData<Cwa36HourResponse>('F-C0032-001', env.CWA_API_KEY);
    ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(rawData), {
      headers: { 'Cache-Control': 'public, max-age=1800' }
    })));
  }

  const info = rawData.cwaopendata.dataset.datasetInfo;
  const index = new Map<string, Forecast36Hour[]>();

  for (const loc of rawData.cwaopendata.dataset.location) {
    const name = loc.locationName;
    const elements = loc.weatherElement;

    // Find indices for Wx, MaxT, MinT, CI, PoP
    const wxIdx = elements.findIndex(e => e.elementName === 'Wx');
    const maxTIdx = elements.findIndex(e => e.elementName === 'MaxT');
    const minTIdx = elements.findIndex(e => e.elementName === 'MinT');
    const ciIdx = elements.findIndex(e => e.elementName === 'CI');
    const popIdx = elements.findIndex(e => e.elementName === 'PoP');

    const periods: Forecast36Hour[] = [];
    const timeEntries = elements[wxIdx].time;

    for (let i = 0; i < timeEntries.length; i++) {
      const tWx = timeEntries[i];
      const tMax = elements[maxTIdx].time[i];
      const tMin = elements[minTIdx].time[i];
      const tCi = elements[ciIdx].time[i];
      const tPop = elements[popIdx].time[i];

      periods.push({
        startTime: tWx.startTime,
        endTime: tWx.endTime,
        weather: tWx.parameter.parameterName,
        weatherCode: tWx.parameter.parameterValue || '',
        maxT: parseFloat(tMax.parameter.parameterName) || null,
        minT: parseFloat(tMin.parameter.parameterName) || null,
        comfort: tCi.parameter.parameterName,
        pop: parseFloat(tPop.parameter.parameterName) || null,
      });
    }
    index.set(name, periods);
  }

  return {
    issuedAt: info.issueTime,
    updatedAt: info.update,
    stale: false,
    index
  };
}
