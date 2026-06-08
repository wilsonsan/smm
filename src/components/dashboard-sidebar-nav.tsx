"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminUserRole } from "@prisma/client";
import type { ComponentType, SVGProps } from "react";
import {
  AnalyticsIcon,
  CalendarIcon,
  ComposeIcon,
  DashboardIcon,
  GalleryIcon,
  SettingsIcon,
} from "@/components/dashboard-icons";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: DashboardIcon,
    isActive: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/calendar",
    label: "Calendar",
    icon: CalendarIcon,
    isActive: (pathname) => pathname.startsWith("/dashboard/calendar"),
  },
  {
    href: "/dashboard/posts/new",
    label: "New Post",
    icon: ComposeIcon,
    isActive: (pathname) => pathname === "/dashboard/posts/new",
  },
  {
    href: "/dashboard/media",
    label: "Gallery",
    icon: GalleryIcon,
    isActive: (pathname) => pathname.startsWith("/dashboard/media"),
  },
  {
    href: "/dashboard/analytics",
    label: "Analytics",
    icon: AnalyticsIcon,
    isActive: (pathname) => pathname.startsWith("/dashboard/analytics"),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: SettingsIcon,
    isActive: (pathname) =>
      pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/"),
  },
];

type DashboardSidebarNavProps = {
  role: AdminUserRole;
};

export function DashboardSidebarNav({ role }: DashboardSidebarNavProps) {
  const pathname = usePathname();
  const visibleItems =
    role === AdminUserRole.ADMIN
      ? NAV_ITEMS
      : NAV_ITEMS.filter(
          (item) => item.href !== "/dashboard/settings" && item.href !== "/dashboard/analytics",
        );

  return (
    <nav className="sidebar-nav" aria-label="Dashboard navigation">
      {visibleItems.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            className={`sidebar-link ${active ? "is-active" : ""}`.trim()}
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            <span className="sidebar-link-icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="sidebar-link-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
