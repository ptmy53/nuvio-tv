const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin, Referer",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
    "Access-Control-Max-Age": "86400"
  };
}

function isPublicTarget(target) {
  if (!/^https?:$/.test(target.protocol)) return false;
  const hostname = target.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
  // Do not allow a proxy request to address private IPv4 ranges.
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return false;
  return true;
}

function targetFromRequest(request) {
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("url") || requestUrl.searchParams.get("u");
  if (!raw) return null;
  try {
    const target = new URL(raw);
    return isPublicTarget(target) ? target : null;
  } catch (_) {
    return null;
  }
}

function proxiedUrl(request, target) {
  const base = new URL(request.url);
  base.search = "";
  base.searchParams.set("url", target.toString());
  return base.toString();
}

function rewriteHlsManifest(text, request, upstreamUrl) {
  const base = new URL(upstreamUrl);
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const rewrite = (raw) => {
        try {
          return proxiedUrl(request, new URL(raw, base));
        } catch (_) {
          return raw;
        }
      };
      if (/^\s*#EXT-X-KEY:/i.test(line)) {
        return line.replace(/URI="([^"]+)"/i, (_, raw) => `URI="${rewrite(raw)}"`);
      }
      if (!line.trim() || line.trim().startsWith("#")) return line;
      return rewrite(line.trim());
    })
    .join("\n");
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (!ALLOWED_METHODS.has(request.method)) return new Response("Method not allowed", { status: 405, headers: corsHeaders() });

    const target = targetFromRequest(request);
    if (!target) return new Response("Missing or invalid url", { status: 400, headers: corsHeaders() });

    const headers = new Headers();
    for (const name of ["accept", "range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("User-Agent", "Mozilla/5.0 NuvioTVProxy/1.0");

    try {
      const upstream = await fetch(target, { method: request.method, headers, redirect: "follow" });
      const responseHeaders = new Headers(corsHeaders());
      for (const name of ["accept-ranges", "cache-control", "content-length", "content-range", "content-type", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
      const isHls = contentType.includes("mpegurl") || contentType.includes("vnd.apple.mpegurl") || target.pathname.toLowerCase().endsWith(".m3u8");
      const body = request.method === "HEAD"
        ? null
        : isHls
          ? rewriteHlsManifest(await upstream.text(), request, upstream.url || target.toString())
          : upstream.body;
      if (isHls) responseHeaders.delete("content-length");
      return new Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    } catch (_) {
      return new Response("Upstream fetch failed", { status: 502, headers: corsHeaders() });
    }
  }
};
