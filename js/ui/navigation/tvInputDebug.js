// js/ui/navigation/tvInputDebug.js
// Diagnostic overlay for Smart TV browsers. Enable it with ?tvdebug=1 (or #tvdebug)
// to see which key codes the TV actually delivers to the page.

import { PluginManager } from "../../core/player/pluginManager.js";

function isDebugEnabled() {
  try {
    const search = String(globalThis.location?.search || "");
    const hash = String(globalThis.location?.hash || "");
    return /(?:^|[?&])tvdebug=1(?:&|$)/.test(search) || hash.indexOf("tvdebug") !== -1;
  } catch (_) {
    return false;
  }
}

function currentScreenId() {
  try {
    const screens = Array.from(document.querySelectorAll(".screen"));
    for (const screen of screens) {
      const style = globalThis.getComputedStyle?.(screen);
      if (style && style.display !== "none" && style.visibility !== "hidden") {
        return screen.id || "(isimsiz)";
      }
    }
  } catch (_) {
    // ignore
  }
  return "-";
}

function currentFocusLabel() {
  try {
    const active = document.activeElement;
    if (!active) return "-";
    return active.id || active.className || active.tagName || "-";
  } catch (_) {
    return "-";
  }
}

function describeKey(event) {
  const parts = [
    "key=" + String(event?.key ?? ""),
    "code=" + String(event?.code ?? ""),
    "keyCode=" + Number(event?.keyCode ?? 0),
    "which=" + Number(event?.which ?? 0),
    "keyName=" + String(event?.keyName ?? event?.detail?.keyName ?? "")
  ];
  return parts.join(" ");
}

export function installTvInputDebug() {
  if (!isDebugEnabled() || globalThis.__NUVIO_TV_INPUT_DEBUG__) {
    return;
  }
  globalThis.__NUVIO_TV_INPUT_DEBUG__ = true;

  const panel = document.createElement("div");
  panel.id = "nuvio-tv-debug";
  panel.style.cssText =
    "position:fixed;left:0;top:0;right:0;z-index:2147483600;" +
    "background:rgba(0,0,0,0.88);color:#7dff7d;font:14px/1.35 monospace;" +
    "padding:8px 12px;pointer-events:none;white-space:pre-wrap;word-break:break-word;";
  document.body.appendChild(panel);

  let keyCount = 0;
  let lastKey = "(henuz tus gelmedi)";
  const errors = [];

  const render = () => {
    const ua = String(globalThis.navigator?.userAgent || "");
    let pluginLine = "eklenti: " + (globalThis.__NUVIO_ALLOW_BROWSER_PLUGIN_RUNTIME__ === true ? "acik" : "kapali");
    try {
      const capability = PluginManager.getCapabilitySnapshot();
      pluginLine += "  durum: " + (capability.executable ? "hazir" : String(capability.runtimeStatus || "bekliyor"));
      if (capability.runtimeError) {
        pluginLine += "  hata: " + String(capability.runtimeError).slice(0, 140);
      }
    } catch (_) {
      // ignore
    }
    const lines = [
      "NUVIO TV DEBUG  |  ekran: " + currentScreenId() + "  |  odak: " + currentFocusLabel(),
      "tus sayisi: " + keyCount + "  |  son tus: " + lastKey,
      "platform: " + String(globalThis.__NUVIO_PLATFORM__ || "(otomatik)") +
        "  |  " + String(globalThis.innerWidth) + "x" + String(globalThis.innerHeight),
      "runtime: Worker=" + (typeof globalThis.Worker === "function" ? "var" : "YOK") +
        "  WebAssembly=" + (typeof globalThis.WebAssembly === "object" ? "var" : "YOK") +
        "  fetch=" + (typeof globalThis.fetch === "function" ? "var" : "YOK"),
      pluginLine,
      "UA: " + ua.slice(0, 220)
    ];
    if (errors.length) {
      lines.push("HATA: " + errors[errors.length - 1].slice(0, 260));
    }
    panel.textContent = lines.join("\n");
  };

  const onKey = (event) => {
    keyCount += 1;
    lastKey = describeKey(event);
    render();
  };

  const onError = (event) => {
    const message = String(event?.message || event?.reason?.message || event?.reason || event?.error || "");
    if (message) {
      errors.push(message);
      render();
    }
  };

  globalThis.addEventListener("keydown", onKey, true);
  globalThis.addEventListener("error", onError, true);
  globalThis.addEventListener("unhandledrejection", onError, true);
  globalThis.setInterval?.(render, 1000);
  render();
}
