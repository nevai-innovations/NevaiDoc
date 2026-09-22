"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useSettings } from "@/components/providers";
import { initials } from "@/lib/client";

function HeaderSearch({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/library?q=${encodeURIComponent(term)}` : "/library");
    onDone?.();
  };
  return (
    <form onSubmit={submit} role="search" className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder="Search documents, folders, or keywords…"
        aria-label="Search documents"
        className="h-10 w-full rounded-xl border border-white/15 bg-white/10 pl-10 pr-4 text-sm text-white placeholder:text-white/55 focus:border-white/40 focus:bg-white/15 focus:outline-none"
      />
    </form>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  // Close the drawer with Escape.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const name = settings.displayName.trim();

  return (
    <div className="flex min-h-full flex-col">
      <header className="nv-header sticky top-0 z-40 text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:h-[76px]">
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/85 hover:bg-white/10 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-6 w-6" />
          </button>

          <Link href="/" className="flex shrink-0 items-center gap-4" aria-label={`${settings.workspaceName} home`}>
            {/* Official Nevai logo, used unmodified. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/nevai-logo.webp"
              alt="Nevai Innovations"
              width={1018}
              height={826}
              className="h-11 w-auto lg:h-[60px]"
            />
            <span className="hidden h-9 w-px bg-white/20 sm:block" aria-hidden />
            <span className="hidden truncate text-lg font-semibold tracking-tight sm:block lg:text-xl">
              {settings.workspaceName}
            </span>
          </Link>

          <div className="mx-auto hidden w-full max-w-xl md:block">
            <HeaderSearch key={pathname} />
          </div>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/85 hover:bg-white/10 md:hidden"
              onClick={() => setMobileSearch((v) => !v)}
              aria-label={mobileSearch ? "Close search" : "Search"}
              aria-expanded={mobileSearch}
            >
              {mobileSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
            <Link
              href="/settings"
              className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-white/10 sm:pr-3"
              title="Your profile & workspace settings"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-brand text-sm font-semibold lg:h-10 lg:w-10">
                {name ? initials(name) : "?"}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">
                {name || "Set your name"}
              </span>
            </Link>
          </div>
        </div>
        {mobileSearch && (
          <div className="px-3 pb-3 md:hidden">
            <HeaderSearch onDone={() => setMobileSearch(false)} />
          </div>
        )}
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-[76px] hidden h-[calc(100vh-76px)] w-64 shrink-0 border-r border-line bg-white lg:block">
          <Sidebar />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="nv-fade-in absolute inset-0 bg-navy-950/50" onClick={() => setDrawer(false)} />
            <div className="nv-pop-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
              <div className="nv-header flex h-16 items-center justify-between px-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/nevai-logo.webp" alt="Nevai Innovations" width={1018} height={826} className="h-11 w-auto" />
                <button
                  onClick={() => setDrawer(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/85 hover:bg-white/10"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="px-6 pt-4 text-sm font-semibold text-slate-900">{settings.workspaceName}</p>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
