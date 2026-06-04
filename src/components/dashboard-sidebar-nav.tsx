"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  iconLabel: string;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    iconLabel: "DB",
    isActive: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    iconLabel: "CL",
    isActive: (pathname) => pathname.startsWith("/dashboard/calendar") || pathname.startsWith("/dashboard/posts"),
  },
  {
    href: "/dashboard/media",
    label: "Gallery",
    iconLabel: "GL",
    isActive: (pathname) => pathname.startsWith("/dashboard/media"),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    iconLabel: "ST",
    isActive: (pathname) =>
      pathname === "/dashboard/settings" ||
      pathname.startsWith("/dashboard/settings/channels/facebook") ||
      pathname.startsWith("/dashboard/settings/site") ||
      pathname.startsWith("/dashboard/settings/channels/google") ||
      pathname.startsWith("/dashboard/settings/channels/instagram"),
  },
];

export function DashboardSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Dashboard navigation">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);

        return (
          <Link
            key={item.href}
            className={`sidebar-link ${active ? "is-active" : ""}`.trim()}
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            <span className="sidebar-link-icon" aria-hidden="true">
              {item.iconLabel}
            </span>
            <span className="sidebar-link-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
