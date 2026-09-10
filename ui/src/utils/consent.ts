const COOKIE_CONSENT_KEY = "cookieConsent";

export function hasCookieConsent(): boolean {
  return localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
}

export function setCookieConsent(): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
}
