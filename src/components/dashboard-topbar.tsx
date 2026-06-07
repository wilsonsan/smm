"use client";

import { usePathname } from "next/navigation";
import { DashboardNotificationMenu } from "@/components/dashboard-notification-menu";

type DashboardTopbarProps = {
  unreadCount: number;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    actionUrl: string | null;
    provider: "FACEBOOK" | "INSTAGRAM" | "GOOGLE_BUSINESS" | null;
    severity: "INFO" | "WARNING" | "ERROR";
    createdLabel: string;
  }>;
  openNotificationAction: (formData: FormData) => void | Promise<void>;
};

export function DashboardTopbar({
  unreadCount,
  notifications,
  openNotificationAction,
}: DashboardTopbarProps) {
  const pathname = usePathname();

  if (pathname !== "/dashboard") {
    return null;
  }

  return (
    <div className="dashboard-topbar">
      <DashboardNotificationMenu
        unreadCount={unreadCount}
        notifications={notifications}
        openNotificationAction={openNotificationAction}
      />
    </div>
  );
}
