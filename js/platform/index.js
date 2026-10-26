import { browserAdapter } from "./adapters/browserAdapter.js";
import { webosAdapter } from "./adapters/webosAdapter.js";
import { tizenAdapter } from "./adapters/tizenAdapter.js";

const ADAPTERS = {
  browser: browserAdapter,
  webos: webosAdapter,
  tizen: tizenAdapter
};

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
    return parseWebOsMajorVersion();
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

  applyLegacyFoxxumViewportScale() {
    if (!this.isLegacyFoxxum() || !globalThis.document?.documentElement) return 1;
    const root = globalThis.document.documentElement;
    root.classList.add("foxxum-tv");

    // Vewd on Vestel/MB180 renders a small logical surface (often 1280x720)
    // and upscales it to the 4K panel, which makes a 1920x1080 design look
    // ~1.5x too large. Two-stage fix:
    //   1. ask the engine for the design viewport via the viewport meta tag;
    //   2. if the engine ignores it, zoom a 1920x1080 canvas into the space
    //      the browser actually gives us.
    const applyDesignCanvas = () => {
      const cssWidth = Number(globalThis.innerWidth || 0);
      const cssHeight = Number(globalThis.innerHeight || 0);
      if (!(cssWidth > 0 && cssHeight > 0)) return;
      if (cssWidth >= 1700) {
        // The viewport meta was honoured; native 1920x1080 layout.
        root.style.removeProperty("--foxxum-viewport-scale");
        root.style.removeProperty("--foxxum-logical-width");
        root.style.removeProperty("--foxxum-logical-height");
        return;
      }
      const scale = Math.max(0.4, Math.min(1, cssWidth / 1920));
      root.style.setProperty("--foxxum-viewport-scale", String(scale));
      root.style.setProperty("--foxxum-logical-width", "1920px");
      root.style.setProperty("--foxxum-logical-height", "1080px");
    };

    try {
      let viewport = globalThis.document.querySelector("meta[name='viewport']");
      if (!viewport) {
        viewport = globalThis.document.createElement("meta");
        viewport.name = "viewport";
        globalThis.document.head.appendChild(viewport);
      }
      viewport.setAttribute(
        "content",
        "width=1920, height=1080, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      );
    } catch (_) {
      // ignore: the zoom fallback below still applies
    }

    applyDesignCanvas();
    // The meta change reflows asynchronously; re-check after it settles.
    try {
      globalThis.setTimeout(applyDesignCanvas, 350);
      globalThis.setTimeout(applyDesignCanvas, 1200);
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
