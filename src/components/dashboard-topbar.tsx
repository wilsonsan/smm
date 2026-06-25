"use client";

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

export function DashboardTopbar(_props: DashboardTopbarProps) {
  return null;
}
