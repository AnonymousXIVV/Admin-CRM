import { handleChainiqApi, headersToObject } from "../chainiq-api.mjs";

interface ApiEvent {
  url: URL;
  req: { method?: string; headers: Headers; json?: () => Promise<unknown>; text?: () => Promise<string> };
}

export default async function chainiqApiMiddleware(
  event: ApiEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const path = event.url.pathname;
  if (!path.startsWith("/api")) return next();

  const method = (event.req.method ?? "GET").toUpperCase();
  let rawBody = "";
  if (method !== "GET" && method !== "HEAD") {
    try {
      if (typeof event.req.text === "function") rawBody = await event.req.text();
    } catch {
      rawBody = "";
    }
  }

  const result = await handleChainiqApi({
    method,
    path,
    search: event.url.search,
    headers: headersToObject(event.req.headers),
    rawBody,
  });

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
