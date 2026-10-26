const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

// Browsers cannot set User-Agent or Referer on their own fetches, and several
// stream sources reject requests without them. The Nuvio app encodes the
// required request headers (behaviorHints.proxyHeaders.request) into the
// `headers` query parameter as base64 JSON; this worker applies them upstream.
const HEADER_ALLOWLIST = new Set(["user-agent", "referer", "accept", "accept-language", "origin"]);
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) return false;
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

function headersFromRequest(requestUrl) {
  const raw = requestUrl.searchParams.get("headers");
  if (!raw) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(raw), (char) => char.charCodeAt(0)))
    );
    const kept = {};
    for (const [name, value] of Object.entries(json)) {
      const key = String(name || "").trim().toLowerCase();
      if (HEADER_ALLOWLIST.has(key) && typeof value === "string" && value.trim()) kept[key] = value;
    }
    return Object.keys(kept).length ? kept : null;
  } catch (_) {
    return null;
  }
}

function proxiedUrl(request, target) {
  const base = new URL(request.url);
  const headersParam = base.searchParams.get("headers");
  base.search = "";
  base.searchParams.set("url", target.toString());
  // Rewritten HLS segment/key URLs must carry the same required headers as
  // the manifest that referenced them.
  if (headersParam) base.searchParams.set("headers", headersParam);
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

    const requestUrl = new URL(request.url);
    const target = targetFromRequest(request);
    if (!target) return new Response("Missing or invalid url", { status: 400, headers: corsHeaders() });

    const headers = new Headers();
    for (const name of ["accept", "range", "if-none-match", "if-modified-since"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const required = headersFromRequest(requestUrl);
    headers.set("User-Agent", (required && required["user-agent"]) || DEFAULT_USER_AGENT);
    if (required && required["referer"]) headers.set("Referer", required["referer"]);
    if (required && required["origin"]) headers.set("Origin", required["origin"]);
    if (required && required["accept-language"]) headers.set("Accept-Language", required["accept-language"]);

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
