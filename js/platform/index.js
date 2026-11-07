import { browserAdapter } from "./adapters/browserAdapter.js";
import { webosAdapter } from "./adapters/webosAdapter.js";
import { tizenAdapter } from "./adapters/tizenAdapter.js";

const ADAPTERS = {
  browser: browserAdapter,
  webos: webosAdapter,
  tizen: tizenAdapter
};

let cachedWebOsMajorVersion = null;

function parseWebOsMajorVersion() {
  const candidates = [
    String(globalThis.PalmSystem?.deviceInfo || ""),
    String(globalThis.webOSSystem?.deviceInfo || ""),
    String(globalThis.navigator?.userAgent || "")
  ].filter(Boolean);

  const patterns = [
    /web0s\.tv[\s/-]?(\d{1,2})/i,
    /webos\.tv[\s/-]?(\d{1,2})/i,
    /web0s[\s/-]?(\d{1,2})/i,
    /webos[\s/-]?(\d{1,2})/i,
    /chromium\/(\d{2,3})/i,
    /chrome\/(\d{2,3})/i
  ];

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (!match) {
        continue;
      }
      const value = Number(match[1] || 0);
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      if (/chrom(e|ium)\//i.test(pattern.source)) {
        if (value <= 53) return 3;
        if (value <= 68) return 4;
        if (value <= 79) return 5;
        if (value <= 87) return 6;
        if (value <= 94) return 22;
        if (value <= 108) return 23;
        if (value <= 120) return 24;
        return 25;
      }
      return value;
    }
  }
  return 0;
}

function detectPlatformName() {
  const override = String(globalThis.__NUVIO_PLATFORM__ || "")
    .trim()
    .toLowerCase();
  if (override && ADAPTERS[override]) {
    return override;
  }
  const searchParams = String(globalThis.location?.search || "").toLowerCase();
  if (searchParams.includes("wrapper=tizen")) {
    return "tizen";
  }
  const userAgent = String(globalThis.navigator?.userAgent || "").toLowerCase();
  if (globalThis.webOS || globalThis.PalmSystem || globalThis.webOSSystem) {
    return "webos";
  }
  if (userAgent.includes("webos") || userAgent.includes("web0s")) {
    return "webos";
  }
  const webapis = globalThis.webapis || {};
  if (
    globalThis.tizen ||
    globalThis.avplay ||
    webapis.avplay ||
    webapis.avPlay ||
    webapis.productinfo ||
    userAgent.includes("tizen")
  ) {
    return "tizen";
  }
  return "browser";
}

function getAdapter() {
  if (!Platform.current) {
    Platform.current = ADAPTERS[detectPlatformName()];
  }
  return Platform.current;
}

export const Platform = {
  current: null,

  init() {
    const adapter = getAdapter();
    adapter.init?.();
    return adapter;
  },

  getName() {
    return getAdapter().name;
  },

  isWebOS() {
    return this.getName() === "webos";
  },

  getWebOsMajorVersion() {
    if (!this.isWebOS()) {
      return 0;
    }
    // PalmSystem.deviceInfo is a native bridge call (~6 ms on a G5) and the
    // firmware cannot change while the app runs.
    if (cachedWebOsMajorVersion === null) {
      cachedWebOsMajorVersion = parseWebOsMajorVersion();
    }
    return cachedWebOsMajorVersion;
  },

  isTizen() {
    return this.getName() === "tizen";
  },

  isBrowser() {
    return this.getName() === "browser";
  },

  isLegacyFoxxum() {
    if (!this.isBrowser()) return false;
    const ua = String(globalThis.navigator?.userAgent || "").toLowerCase();
    return /vewd|foxxum|vestel|opera tv|smarttv|hbbtv/.test(ua);
  },

  // UI scale for Vewd/Foxxum. A 65" 4K panel viewed from the sofa makes the
  // 1920x1080 desktop web layout look small, and some Vewd builds also render
  // the surface 1:1 in the panel. `?scale=` (persisted) lets the value be
  // tuned on the TV without a rebuild.
  resolveLegacyFoxxumUiScale() {
    const MIN = 1;
    const MAX = 1.8;
    const clamp = (value) => Math.min(MAX, Math.max(MIN, value));
    try {
      const raw = new URL(globalThis.location.href).searchParams.get("scale");
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= MIN && parsed <= MAX) {
          try {
            globalThis.localStorage?.setItem("nuvio.uiScale", String(parsed));
          } catch (_) {
            // storage may be blocked; the URL value still applies
          }
          return clamp(parsed);
        }
      }
    } catch (_) {
      // ignore malformed URLs
    }
    try {
      const stored = Number(globalThis.localStorage?.getItem("nuvio.uiScale") || 0);
      if (Number.isFinite(stored) && stored >= MIN && stored <= MAX) return clamp(stored);
    } catch (_) {
      // ignore blocked storage
    }
    return 1.2;
  },

  // The player surface must map 1:1 to the Vewd viewport. The home UI is laid
  // out on a 1920/uiScale logical canvas and zoomed down, but the video plane
  // (and Vewd's hardware overlay) keeps the layout size of the element. If the
  // zoom stays on, a 100vw/100vh player renders at 1/uiScale of the screen and
  // sticks to the top-left corner, which is the "video is not fullscreen"
  // symptom. Drop the zoom while the player route is mounted.
  setLegacyFoxxumPlayerActive(active) {
    if (!this.isLegacyFoxxum() || !globalThis.document?.documentElement) return;
    globalThis.document.documentElement.classList.toggle("foxxum-player-active", active === true);
  },

  applyLegacyFoxxumViewportScale() {
    if (!this.isLegacyFoxxum() || !globalThis.document?.documentElement) return 1;
    const root = globalThis.document.documentElement;
    root.classList.add("foxxum-tv");
    const uiScale = this.resolveLegacyFoxxumUiScale();
    // Vewd renders the page into its own small surface (1280x720 on MB180) and
    // the TV upscales that to the 4K panel. Do NOT touch the viewport meta: an
    // explicit width made Vewd draw 1920 real pixels in the top-left corner of
    // a 3840 panel, which is the "small, not fullscreen" symptom. Lay the app
    // out on a 1920/uiScale canvas and zoom it down to the real surface.
    const logicalWidth = Math.round(1920 / uiScale);
    const logicalHeight = Math.round(logicalWidth * 0.5625);

    // ?canvas= lets one TV session test every rendering strategy when the
    // firmware behaves differently from what the debug numbers suggest.
    //   zoom  (default) logical canvas + CSS zoom into the surface
    //   meta  ask the engine for a 1920 layout at 2x (fills a 3840 panel)
    //   none  leave the app untouched (pure Vewd default surface)
    let canvasMode = "zoom";
    try {
      const requested = new URL(globalThis.location.href).searchParams.get("canvas");
      if (requested === "meta" || requested === "none" || requested === "zoom") {
        canvasMode = requested;
        try {
          globalThis.localStorage?.setItem("nuvio.canvasMode", requested);
        } catch (_) {
          // storage blocked: the URL value still applies for this load
        }
      } else {
        const stored = String(globalThis.localStorage?.getItem("nuvio.canvasMode") || "");
        if (stored === "meta" || stored === "none" || stored === "zoom") canvasMode = stored;
      }
    } catch (_) {
      // keep the default
    }

    const applyDesignCanvas = () => {
      // Some Vewd builds under-report innerWidth while the composited surface
      // is wider. Use the largest viewport figure the engine exposes so the
      // canvas always covers the painted area.
      const cssWidth = Math.max(
        Number(globalThis.innerWidth || 0),
        Number(globalThis.document?.documentElement?.clientWidth || 0),
        Number(globalThis.visualViewport?.width || 0)
      );
      if (!(cssWidth > 0)) return;
      if (canvasMode === "none") {
        root.style.removeProperty("--foxxum-viewport-scale");
        root.style.removeProperty("--foxxum-logical-width");
        root.style.removeProperty("--foxxum-logical-height");
        root.dataset.nuvioCanvas = "none";
        return;
      }
      if (canvasMode === "meta") {
        root.style.removeProperty("--foxxum-viewport-scale");
        root.style.removeProperty("--foxxum-logical-width");
        root.style.removeProperty("--foxxum-logical-height");
        root.dataset.nuvioCanvas = "meta";
        return;
      }
      // Always fill the surface. Capping the zoom at 1 left the app at its
      // logical size in the top-left corner (80% of the panel on some Vewd
      // sessions) whenever the engine reported a wider viewport than the
      // logical canvas.
      const zoom = Math.max(0.1, cssWidth / logicalWidth);
      root.dataset.nuvioCanvas = `${logicalWidth}@${zoom.toFixed(2)}`;
      root.style.setProperty("--foxxum-viewport-scale", String(zoom));
      root.style.setProperty("--foxxum-logical-width", `${logicalWidth}px`);
      root.style.setProperty("--foxxum-logical-height", `${logicalHeight}px`);
    };

    if (canvasMode === "meta") {
      try {
        let viewport = globalThis.document.querySelector("meta[name='viewport']");
        if (!viewport) {
          viewport = globalThis.document.createElement("meta");
          viewport.name = "viewport";
          globalThis.document.head.appendChild(viewport);
        }
        viewport.setAttribute("content", "width=1920, initial-scale=2, user-scalable=no");
      } catch (_) {
        // ignore
      }
    }

    applyDesignCanvas();
    // The surface size can settle after the browser chrome hides; re-apply.
    try {
      globalThis.setTimeout(applyDesignCanvas, 400);
      globalThis.setTimeout(applyDesignCanvas, 1500);
    } catch (_) {
      // ignore
    }
    return 1;
  },

  exitApp() {
    if (globalThis.document && typeof globalThis.CustomEvent === "function") {
      const beforeExitEvent = new CustomEvent("nuvio:beforeExitApp", {
        cancelable: true
      });
      globalThis.document.dispatchEvent(beforeExitEvent);
      if (beforeExitEvent.defaultPrevented) {
        return false;
      }
    }
    return getAdapter().exitApp();
  },

  isBackEvent(event) {
    return getAdapter().isBackEvent(event);
  },

  normalizeKey(event) {
    return getAdapter().normalizeKey(event);
  },

  getDeviceLabel() {
    return getAdapter().getDeviceLabel();
  },

  getCapabilities() {
    return getAdapter().getCapabilities();
  },

  prepareVideoElement(videoElement) {
    return getAdapter().prepareVideoElement?.(videoElement);
  }
};
