export const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 });
export const badRequest = (msg: string) => Response.json({ error: `Bad Request: ${msg}` }, { status: 400 });
export const notFound = () => Response.json({ error: 'Not Found' }, { status: 404 });
export const serverError = (msg: string) => Response.json({ error: `Upstream Error: ${msg}` }, { status: 502 });
