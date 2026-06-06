"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon, FacebookIcon } from "@/components/dashboard-icons";

type NotificationProvider = "FACEBOOK" | "INSTAGRAM" | "GOOGLE_BUSINESS" | null;
type NotificationSeverity = "INFO" | "WARNING" | "ERROR";

type NotificationMenuItem = {
  id: string;
  title: string;
  message: string;
  actionUrl: string | null;
  provider: NotificationProvider;
  severity: NotificationSeverity;
  createdLabel: string;
};

type DashboardNotificationMenuProps = {
  unreadCount: number;
  notifications: NotificationMenuItem[];
  openNotificationAction: (formData: FormData) => void | Promise<void>;
};

function ProviderIcon({ provider }: { provider: NotificationProvider }) {
  if (provider === "FACEBOOK") {
    return (
      <span className="notification-provider-icon is-facebook" aria-label="Facebook">
        <FacebookIcon />
      </span>
    );
  }

  if (provider === "INSTAGRAM") {
    return <span className="notification-provider-icon is-instagram" aria-label="Instagram">IG</span>;
  }

  if (provider === "GOOGLE_BUSINESS") {
    return <span className="notification-provider-icon is-google" aria-label="Google Business">G</span>;
  }

  return <span className="notification-provider-icon is-generic" aria-hidden="true">i</span>;
}

export function DashboardNotificationMenu({
  unreadCount,
  notifications,
  openNotificationAction,
}: DashboardNotificationMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="dashboard-notification-menu" ref={containerRef}>
      <button
        type="button"
        className="dashboard-toolbar-button dashboard-notification-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Notifications"
        onClick={() => setIsOpen((current) => !current)}
      >
        <BellIcon />
        {unreadCount > 0 ? <span className="dashboard-notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="dashboard-notification-popover" role="menu" aria-label="Notifications">
          <div className="dashboard-notification-popover-head">
            <div>
              <strong>Notifications</strong>
              <span>{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
            </div>
          </div>

          <div className="dashboard-notification-list">
            {notifications.length === 0 ? (
              <div className="dashboard-notification-empty">
                <strong>No unread notifications</strong>
                <span>Facebook token issues and worker alerts will show up here.</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <form key={notification.id} action={openNotificationAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <input type="hidden" name="actionUrl" value={notification.actionUrl || ""} />
                  <button type="submit" className={`dashboard-notification-item is-${notification.severity.toLowerCase()}`.trim()}>
                    <ProviderIcon provider={notification.provider} />
                    <span className="dashboard-notification-copy">
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>{notification.createdLabel}</small>
                    </span>
                  </button>
                </form>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
