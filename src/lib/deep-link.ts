"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Shareable URL state for panels that open and close inside a page.
 *
 * The quality lab is one long page whose review items are collapsed by default,
 * so a link to it landed every teaching fellow at the top with nothing open and
 * eighteen assigned items to hunt for. These helpers make each panel addressable:
 * `/?open=2019-final-kate` opens that card and scrolls to it.
 *
 * The query string is the state, not a mirror of it. A useState copy would have
 * to be seeded from an effect — which the React Compiler lint correctly rejects,
 * and which lets the two drift. Reading through useSyncExternalStore instead
 * gives an SSR-safe empty snapshot, a real one after hydration, and back/forward
 * navigation for free.
 *
 * Deliberately not useSearchParams: reading params through the router opts the
 * subtree into a client-side bailout needing a Suspense boundary, and this is
 * pure view sugar that must never touch the server render.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function getSnapshot(): string {
  return window.location.search;
}

/** No query string during SSR; the real one arrives on the first client pass. */
function getServerSnapshot(): string {
  return "";
}

/**
 * replaceState, not pushState: opening a card is not a navigation, and a dozen
 * expand clicks should not bury the previous page under a dozen back presses.
 * The browser fires no event for a scripted history write, so notify by hand.
 */
function writeParam(param: string, value: string | null): void {
  window.history.replaceState(null, "", withParam(window.location.href, param, value));
  for (const listener of [...listeners]) listener();
}

/**
 * The ids a query string names, in order. Tolerant of hand-written links —
 * these get typed into emails — so stray spaces and empty slots are dropped
 * rather than opening a panel called "".
 */
export function parseParam(search: string, param: string): string[] {
  const raw = new URLSearchParams(search).get(param) ?? "";
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

/** `href` with `param` set to `value`, or removed when value is null. */
export function withParam(href: string, param: string, value: string | null): string {
  const url = new URL(href);
  if (value) url.searchParams.set(param, value);
  else url.searchParams.delete(param);
  return url.toString();
}

/**
 * A stable, human-readable element id for a panel.
 *
 * Built from a submission's own identity — exam plus reviewer label — never from
 * its run id, which is regenerated every time the round is re-run on a new
 * prompt version. A link a reviewer bookmarks has to survive that.
 */
export function slugify(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Absolute URL that opens one panel and nothing else.
 *
 * Deliberately replaces whatever was open rather than appending: the point of
 * the copy button is to send someone to one item, and inheriting the sender's
 * dozen expanded cards would defeat that. The hash is dropped for the same
 * reason — it would win the scroll race against the panel being linked to.
 */
export function panelUrl(param: string, slug: string): string {
  const url = new URL(withParam(window.location.href, param, slug));
  url.hash = "";
  return url.toString();
}

/**
 * The set of open panel ids, held in a comma-separated query parameter.
 *
 * A hand-written link can list several ids to open a reviewer's whole
 * assignment at once; the page writes the live set back on every toggle, so the
 * address bar always describes what is on screen and can be copied as-is.
 */
export function useOpenPanels(param: string) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ids = useMemo(() => parseParam(search, param), [search, param]);
  const open = useMemo(() => new Set(ids), [ids]);

  // Reads live rather than closing over `open`, so two toggles in one tick
  // cannot clobber each other with a stale set.
  const setOpen = useCallback((update: (current: Set<string>) => Set<string>) => {
    const next = update(new Set(parseParam(window.location.search, param)));
    writeParam(param, next.size ? [...next].join(",") : null);
  }, [param]);

  const toggle = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setOpen]);

  // Mount-only: scroll to the first id the URL arrived with. Deliberately reads
  // the location instead of `open`, which would also fire on ordinary clicks and
  // yank the page every time a reviewer expanded something. The target is the
  // card wrapper, present whether or not it is open, so its top edge is already
  // final and there is nothing to wait for beyond the next frame.
  useEffect(() => {
    const first = parseParam(window.location.search, param)[0];
    if (!first) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(first)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [param]);

  return { open, setOpen, toggle } as const;
}

/**
 * A single-choice tab whose selection lives in the URL.
 *
 * Same contract as useOpenPanels, minus the set. An unrecognised value falls
 * back to the default rather than rendering an empty panel, and the default is
 * left out of the URL so the plain address stays clean.
 */
export function useTabParam<T extends string>(param: string, keys: readonly T[], fallback: T) {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const raw = new URLSearchParams(search).get(param);
  const active = raw && (keys as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setActive = useCallback((next: T) => {
    writeParam(param, next === fallback ? null : next);
  }, [param, fallback]);

  return [active, setActive] as const;
}

/** Copies text, reporting whether it landed so the button can confirm. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
