"use client";

import { useCallback, useEffect, useState } from "react";

/** fetch() wrapper for our JSON API: throws an Error carrying the API's message. */
export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      (res.status === 413 ? "Files must be 4 MB or smaller" : `Request failed (${res.status})`);
    throw new Error(message);
  }
  return data as T;
}

type FetchState<T> = { url: string | null; key: string | null; data?: T; error?: string };

/**
 * Loads JSON from `url` (null = don't load). Keeps showing the previous data
 * for the same URL while a reload is in flight, and exposes `setData` so a
 * mutation's response can be applied without a round trip.
 */
export function useFetch<T>(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<FetchState<T>>({ url: null, key: null });
  const key = url ? `${url}#${nonce}` : null;

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const k = `${url}#${nonce}`;
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
        setState({ url, key: k, data: body as T });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((prev) => ({
          url,
          key: k,
          data: prev.url === url ? prev.data : undefined,
          error: e instanceof Error ? e.message : "Something went wrong",
        }));
      });
    return () => ctrl.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (update: (prev: T | undefined) => T) =>
      setState((prev) => ({ ...prev, data: update(prev.url === url ? prev.data : undefined) })),
    [url]
  );

  const sameUrl = state.url === url;
  return {
    data: sameUrl ? state.data : undefined,
    error: sameUrl && state.key === key ? state.error : undefined,
    loading: key !== null && state.key !== key,
    reload,
    setData,
  };
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

export function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  if (abs < 45) return "just now";
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf ? rtf.format(Math.round(diff / secs), unit) : `${Math.round(abs / secs)} ${unit}s ago`;
  }
  return rtf ? rtf.format(Math.round(diff / 60), "minute") : "just now";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function wordCount(markdown: string): number {
  const text = markdown.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~\-|[\]()!]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
