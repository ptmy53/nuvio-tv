import { Platform } from "./index.js";

export const Environment = {
  isWebOS() {
    return Platform.isWebOS();
  },

  isTizen() {
    return Platform.isTizen();
  },

  isBrowser() {
    return Platform.isBrowser();
  },

  isLegacyFoxxum() {
    return Platform.isLegacyFoxxum();
  },

  setLegacyFoxxumPlayerActive(active) {
    return Platform.setLegacyFoxxumPlayerActive?.(active);
  },

  isBackEvent(event) {
    return Platform.isBackEvent(event);
  },

  getDeviceLabel() {
    return Platform.getDeviceLabel();
  }
};
