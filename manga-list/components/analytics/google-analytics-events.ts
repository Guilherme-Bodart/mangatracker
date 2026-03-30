type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function trackEvent(eventName: string, params?: EventParams) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", eventName, params ?? {});
}

export function trackLogin(method: "email_password" | "google") {
  trackEvent("login", { method });
}

export function trackSignUp(method: "email_password" | "google") {
  trackEvent("sign_up", { method });
}

export type AddToListEventParams = {
  source: string;
  status: "READING" | "COMPLETED" | "PLAN_TO_READ" | "DROPPED";
  mal_id: number;
  anilist_id?: number;
  manga_title: string;
};

export function trackAddToList(params: AddToListEventParams) {
  trackEvent("add_to_list", params);
}
