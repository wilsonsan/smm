"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminUserRole } from "@prisma/client";
import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import {
  AnalyticsIcon,
  CalendarIcon,
  ChevronDownIcon,
  ComposeIcon,
  DashboardIcon,
  GalleryIcon,
  LogoSparkIcon,
  SettingsIcon,
} from "@/components/dashboard-icons";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isActive: (pathname: string) => boolean;
};

type DashboardMobileNavProps = {
  role: AdminUserRole;
  avatarLabel: string;
  username: string;
  logoutAction: () => Promise<void>;
};

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function buildVisibleItems(role: AdminUserRole) {
  const navItems: NavItem[] = [
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
      isActive: (pathname) => pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/") || pathname.startsWith("/dashboard/account"),
    },
  ];

  return role === AdminUserRole.ADMIN
    ? navItems
    : navItems.filter((item) => item.href !== "/dashboard/analytics");
}

export function DashboardMobileNav({
  role,
  avatarLabel,
  username,
  logoutAction,
}: DashboardMobileNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const visibleItems = useMemo(() => buildVisibleItems(role), [role]);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <section className="dashboard-mobile-nav" aria-label="Mobile navigation">
      <div className="dashboard-mobile-nav-bar">
        <button
          type="button"
          className="dashboard-mobile-nav-toggle"
          aria-expanded={isOpen}
          aria-controls="dashboard-mobile-nav-menu"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setIsOpen((current) => !current)}
        >
          <MenuIcon />
        </button>

        <Link href="/dashboard" className="dashboard-mobile-nav-brand" aria-label="Dashboard home">
          <span className="dashboard-mobile-nav-brand-mark" aria-hidden="true">
            <LogoSparkIcon />
          </span>
          <span className="dashboard-mobile-nav-brand-copy">SMM</span>
        </Link>

        <Link href="/dashboard/account" className="dashboard-mobile-nav-profile" aria-label="Open account settings">
          <span className="dashboard-mobile-nav-avatar" aria-hidden="true">
            {avatarLabel}
          </span>
          <span className="dashboard-mobile-nav-profile-copy">@{username}</span>
          <ChevronDownIcon />
        </Link>
      </div>

      {isOpen ? (
        <div id="dashboard-mobile-nav-menu" className="dashboard-mobile-nav-menu">
          <div className="dashboard-mobile-nav-links">
            {visibleItems.map((item) => {
              const active = item.isActive(pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`dashboard-mobile-nav-link ${active ? "is-active" : ""}`.trim()}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setIsOpen(false)}
                >
                  <span className="dashboard-mobile-nav-link-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <form action={logoutAction} className="dashboard-mobile-nav-logout-form">
            <button type="submit" className="dashboard-mobile-nav-logout">
              Log Out
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
