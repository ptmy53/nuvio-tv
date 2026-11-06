// Keeps every client on the newest published build without changing the URL
// the operator opens on the TV. The fixed address always stays
// `.../nuvio-tv/?tvdebug=1`; when a deploy happens the running page detects the
// new version.json, reloads itself once with a throwaway cache-buster and then
// restores the clean address.

const VERSION_ENDPOINT = "version.json";

function loadedBuildVersion() {
  try {
    const script = Array.from(document.scripts).find((entry) =>
      String(entry.src || "").includes("app.bundle.js")
    );
    if (!script) return "";
    return new URL(script.src, location.href).searchParams.get("v") || "";
  } catch (_) {
    return "";
  }
}

function stripVolatileParams() {
  try {
    const url = new URL(location.href);
    let changed = false;
    for (const key of ["_", "v", "t"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) history.replaceState(history.state, "", url.toString());
  } catch (_) {
    // history may be unavailable in some embeddings
  }
}

export function currentBuildVersion() {
  return loadedBuildVersion();
}

function refreshAlreadyAttempted(flag) {
  try {
    if (sessionStorage.getItem(flag)) return true;
  } catch (_) {
    // storage blocked: fall through to window.name
  }
  try {
    return String(globalThis.name || "").includes(flag);
  } catch (_) {
    return false;
  }
}

function markRefreshAttempted(flag) {
  try {
    sessionStorage.setItem(flag, "1");
  } catch (_) {
    // ignore
  }
  // window.name survives navigations in the same tab even when the TV browser
  // blocks storage, so it still prevents a reload loop.
  try {
    globalThis.name = `${String(globalThis.name || "")}|${flag}`.slice(-512);
  } catch (_) {
    // ignore
  }
}

export async function ensureLatestBuild() {
  // Drop a leftover cache-buster from a previous self-refresh so the address
  // bar always shows the same clean URL.
  stripVolatileParams();

  const current = loadedBuildVersion();
  if (!current) return;

  let latest = "";
  try {
    const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const info = await response.json();
    latest = String(info?.version || "").trim();
  } catch (_) {
    return;
  }
  if (!latest || latest === current) return;

  // One refresh attempt per published version, so a stale CDN response cannot
  // put the TV into a reload loop.
  const flag = `nuvio.buildRefreshed.${latest}`;
  if (refreshAlreadyAttempted(flag)) return;
  markRefreshAttempted(flag);

  try {
    const next = new URL(location.href);
    next.searchParams.delete("v");
    next.searchParams.set("_", String(Date.now()));
    location.replace(next.toString());
  } catch (_) {
    // ignore
  }
}

export async function publishedBuildVersion() {
  try {
    const response = await fetch(`${VERSION_ENDPOINT}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return "";
    const info = await response.json();
    return String(info?.version || "").trim();
  } catch (_) {
    return "";
  }
}
