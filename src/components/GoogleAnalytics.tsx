"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_KEY, CONSENT_REGIONS, COOKIE_SETTINGS_EVENT, GA_ID } from "@/lib/consent";

type Choice = "granted" | "denied";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function storedChoice(): Choice | null {
  try {
    const c = localStorage.getItem(CONSENT_KEY);
    return c === "granted" || c === "denied" ? c : null;
  } catch {
    return null;
  }
}

// Saying no also removes any Analytics cookies already set (a visitor outside the
// consent regions who later opts out on the privacy page).
function clearAnalyticsCookies() {
  const host = location.hostname;
  const domains = [host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

// Google Analytics with consent mode. Advertising signals are always off. Analytics
// cookies are off by default in the consent regions until the visitor says yes, and
// on elsewhere; a stored choice, either way, is applied before the first hit.
export function GoogleAnalytics() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!GA_ID) return;
    const show = () => setOpen(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, show);
    if (storedChoice() === null) {
      fetch("/api/region")
        .then((r) => r.json())
        .then((d: { consentRequired?: boolean }) => {
          if (d.consentRequired) setOpen(true);
        })
        .catch(() => {});
    }
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, show);
  }, []);

  if (!GA_ID) return null;

  const choose = (choice: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, choice);
    } catch {}
    window.gtag?.("consent", "update", { analytics_storage: choice });
    if (choice === "denied") clearAnalyticsCookies();
    setOpen(false);
  };

  return (
    <>
      <Script id="ga-consent" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
gtag('consent', 'default', { analytics_storage: 'denied', region: ${JSON.stringify(CONSENT_REGIONS)}, wait_for_update: 500 });
try { var c = localStorage.getItem('${CONSENT_KEY}'); if (c === 'granted' || c === 'denied') gtag('consent', 'update', { analytics_storage: c }); } catch (e) {}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      {open && (
        <div role="dialog" aria-label="Cookie choice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-pop)]">
          <p className="text-sm">
            We&apos;d like to use Google Analytics cookies to count visits and see which pages get read. No advertising, and the site works the same
            either way. <Link href="/privacy" className="underline">Privacy policy</Link>
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => choose("denied")} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)]">
              No thanks
            </button>
            <button type="button" onClick={() => choose("granted")} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]">
              Allow analytics
            </button>
          </div>
        </div>
      )}
    </>
  );
}
