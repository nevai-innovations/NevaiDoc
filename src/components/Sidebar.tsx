"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, FolderOpen, LayoutDashboard, LayoutTemplate, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/library", label: "Document Library", icon: FolderOpen },
  { href: "/reviews", label: "Reviews & Approvals", icon: CheckCircle2 },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // Documents belong to the library section.
  if (href === "/library") return pathname.startsWith("/library") || pathname.startsWith("/docs");
  return pathname.startsWith(href);
}

/** Primary navigation (desktop sidebar and mobile drawer). */
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const item = (href: string, label: string, Icon: typeof LayoutDashboard) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${active ? "text-brand-600" : "text-slate-500"}`} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      {NAV_ITEMS.map((n) => item(n.href, n.label, n.icon))}
      <div className="my-3 border-t border-line" />
      {item("/settings", "Settings", Settings)}
    </nav>
  );
}
