export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
export const badRequest = (msg: string) => Response.json({ error: `Bad Request: ${msg}` }, { status: 400, headers: corsHeaders });
export const notFound = () => Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
export const serverError = (msg: string) => Response.json({ error: `Upstream Error: ${msg}` }, { status: 502, headers: corsHeaders });
