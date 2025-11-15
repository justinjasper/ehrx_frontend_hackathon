type GlobalConfig = {
  API_BASE_URL?: string;
};

declare global {
  interface Window {
    __APP_CONFIG__?: GlobalConfig;
  }
}

const runtimeBaseUrl =
  window.__APP_CONFIG__?.API_BASE_URL &&
  window.__APP_CONFIG__?.API_BASE_URL?.trim() !== ""
    ? window.__APP_CONFIG__?.API_BASE_URL
    : undefined;

const buildTimeBaseUrl = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

const apiBaseUrl =
  runtimeBaseUrl ||
  buildTimeBaseUrl ||
  `${window.location.origin.replace(/\/$/, "")}`;

export const appConfig = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, "")
};


