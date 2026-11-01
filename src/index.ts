import { Env } from './types';
import { badRequest, notFound } from './utils';
import { get7DayForecastData, get36HourForecastData } from './cwa_service';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 0. Health Check
    if (path === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // 2. Routing for 7-Day Forecast (/api/7day/...)
    if (path.startsWith('/api/7day/')) {
      try {
        const data = await get7DayForecastData(env, ctx);
        
        if (path === '/api/7day/locations') {
          return Response.json({ locations: Array.from(data.index.keys()) });
        }
        
        if (path === '/api/7day/forecast') {
          const location = url.searchParams.get('location')?.trim();
          if (!location) return badRequest('location is required');
          
          const forecast = data.index.get(location);
          if (!forecast) {
            console.log(`[DEBUG] 7-Day Location Not Found: requested="${location}", availableKeys=[${Array.from(data.index.keys()).join(', ')}]`);
            return notFound();
          }
          
          return Response.json({ 
            location, 
            issuedAt: data.issuedAt, 
            updatedAt: data.updatedAt, 
            stale: data.stale, 
            days: forecast 
          });
        }
      } catch (e: any) {
        return new Response(`7-Day API Error: ${e.message}`, { status: 502 });
      }
    }

    // 3. Routing for 36-Hour Forecast (/api/36hour/...)
    if (path.startsWith('/api/36hour/')) {
      try {
        const data = await get36HourForecastData(env, ctx);
        
        if (path === '/api/36hour/locations') {
          return Response.json({ locations: Array.from(data.index.keys()) });
        }
        
        if (path === '/api/36hour/forecast') {
          const location = url.searchParams.get('location')?.trim();
          if (!location) return badRequest('location is required');
          
          const forecast = data.index.get(location);
          if (!forecast) return notFound();
          
          return Response.json({ 
            location, 
            issuedAt: data.issuedAt, 
            updatedAt: data.updatedAt, 
            stale: data.stale, 
            periods: forecast 
          });
        }
      } catch (e: any) {
        return new Response(`36-Hour API Error: ${e.message}`, { status: 502 });
      }
    }

    // 4. Default Not Found
    return notFound();
  }
};
