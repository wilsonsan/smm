"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminUserRole } from "@prisma/client";
import type { SVGProps } from "react";
import {
  CalendarIcon,
  ComposeIcon,
  DashboardIcon,
  GalleryIcon,
  SettingsIcon,
} from "@/components/dashboard-icons";

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

type DashboardMobileNavProps = {
  role: AdminUserRole;
};

export function DashboardMobileNav({ role }: DashboardMobileNavProps) {
  const pathname = usePathname();
  const moreHref = role === AdminUserRole.ADMIN ? "/dashboard/settings" : "/dashboard/account";

  return (
    <nav className="dashboard-mobile-nav" aria-label="Mobile navigation">
      <Link
        href="/dashboard"
        className={`dashboard-mobile-nav-item${pathname === "/dashboard" ? " is-active" : ""}`.trim()}
      >
        <span className="dashboard-mobile-nav-icon">
          <DashboardIcon />
        </span>
        <span>Dashboard</span>
      </Link>

      <Link
        href="/dashboard/calendar"
        className={`dashboard-mobile-nav-item${pathname.startsWith("/dashboard/calendar") ? " is-active" : ""}`.trim()}
      >
        <span className="dashboard-mobile-nav-icon">
          <CalendarIcon />
        </span>
        <span>Calendar</span>
      </Link>

      <Link href="/dashboard/posts/new" className="dashboard-mobile-nav-plus" aria-label="New Post">
        <PlusIcon />
      </Link>

      <Link
        href="/dashboard/media"
        className={`dashboard-mobile-nav-item${pathname.startsWith("/dashboard/media") ? " is-active" : ""}`.trim()}
      >
        <span className="dashboard-mobile-nav-icon">
          <GalleryIcon />
        </span>
        <span>Gallery</span>
      </Link>

      <Link
        href={moreHref}
        className={`dashboard-mobile-nav-item${pathname.startsWith("/dashboard/settings") || pathname.startsWith("/dashboard/account") ? " is-active" : ""}`.trim()}
      >
        <span className="dashboard-mobile-nav-icon">
          <SettingsIcon />
        </span>
        <span>More</span>
      </Link>
    </nav>
  );
}
