import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function LogoSparkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 16.5 10.2 11l3.6 3.5L20 8" />
      <path d="M14 8h6v6" />
      <path d="M4 20h16" />
    </BaseIcon>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 12.5 12 5l8 7.5" />
      <path d="M6.5 10.5V19h11v-8.5" />
      <path d="M10 19v-5h4v5" />
    </BaseIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
      <path d="M3.5 9.5h17" />
      <path d="M8 13h.01" />
      <path d="M12 13h.01" />
      <path d="M16 13h.01" />
    </BaseIcon>
  );
}

export function ComposeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 20h4.3l9.9-9.9a2.1 2.1 0 0 0 0-3l-1.3-1.3a2.1 2.1 0 0 0-3 0L4 15.7V20Z" />
      <path d="m12.8 6.8 4.4 4.4" />
    </BaseIcon>
  );
}

export function GalleryIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="8.2" cy="9.2" r="1.4" />
      <path d="m5.5 17 4.2-4.4 3.4 3 2.5-2.1 2.9 3.5" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2H9a1 1 0 0 0 .6-.9V5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1V9c0 .4.4.7.9.7h.2a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.7Z" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 18h8" />
      <path d="M10 21h4" />
      <path d="M6.7 10.2A5.3 5.3 0 0 1 12 5a5.3 5.3 0 0 1 5.3 5.2v2.7l1.2 2.1c.4.7-.1 1.5-.9 1.5H6.4c-.8 0-1.3-.8-.9-1.5l1.2-2.1v-2.7Z" />
    </BaseIcon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </BaseIcon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </BaseIcon>
  );
}

export function PostsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" />
      <path d="M14 4.5V9h4" />
      <path d="M9 12.5h6" />
      <path d="M9 16h5" />
    </BaseIcon>
  );
}

export function AnalyticsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 18.5h14" />
      <path d="M7.5 18.5V11" />
      <path d="M12 18.5V7.5" />
      <path d="M16.5 18.5V13.5" />
      <path d="M5 6.5 9.4 10l4.2-5 5.4 4.3" />
    </BaseIcon>
  );
}

export function DraftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" />
      <path d="M14 4.5V9h4" />
      <path d="m9 16 1.7-1.7 2 2L15.5 13" />
    </BaseIcon>
  );
}

export function ScheduleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
      <path d="M4 9.5h16" />
      <path d="M12 12v3l2 1.2" />
      <circle cx="12" cy="14" r="4" />
    </BaseIcon>
  );
}

export function FailureIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4.5 20 18.5H4L12 4.5Z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17h.01" />
    </BaseIcon>
  );
}

export function SnapshotIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 14c1.4 0 2.1-4 3.5-4s2.1 7 3.5 7 2.1-12 3.5-12 2.1 6 3.5 6H20" />
    </BaseIcon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.8v4.7l3 1.6" />
    </BaseIcon>
  );
}

export function SuccessIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12.4 2.2 2.2 4.8-5.2" />
    </BaseIcon>
  );
}

export function QueueIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 7.5h14" />
      <path d="M5 12h10" />
      <path d="M5 16.5h8" />
      <path d="m17 14 2 2-2 2" />
    </BaseIcon>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.33 21v-8.2h2.77l.42-3.2h-3.19V7.56c0-.92.26-1.54 1.58-1.54h1.69V3.16c-.29-.04-1.3-.12-2.47-.12-2.44 0-4.11 1.49-4.11 4.23V9.6H7.25v3.2h2.77V21h3.31Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="dashboardInstagramGradient" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f58529" />
          <stop offset="38%" stopColor="#feda77" />
          <stop offset="62%" stopColor="#dd2a7b" />
          <stop offset="100%" stopColor="#8134af" />
        </linearGradient>
      </defs>
      <rect
        x="4.2"
        y="4.2"
        width="15.6"
        height="15.6"
        rx="4.4"
        stroke="url(#dashboardInstagramGradient)"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3.5" stroke="url(#dashboardInstagramGradient)" strokeWidth="2" />
      <circle cx="17.1" cy="6.9" r="1" fill="url(#dashboardInstagramGradient)" />
    </svg>
  );
}

export function GoogleBusinessIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.2 2.8-7.2Z" />
      <path fill="#34A853" d="M12 21c2.5 0 4.6-.8 6.2-2.2l-3.1-2.5c-.9.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.6V16c1.6 3 4.7 5 8.4 5Z" />
      <path fill="#FBBC04" d="M6.9 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.6A9 9 0 0 0 3 11.6c0 1.6.4 3.1 1.1 4.4l2.8-2.5Z" />
      <path fill="#EA4335" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.6 2.8 14.5 2 12 2 8.3 2 5.2 4 3.6 7.2l3.3 2.5c.7-2.2 2.7-3.8 5.1-3.8Z" />
    </svg>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M14.8 4.2c2.6 0 4.8 2.2 4.8 4.8 0 4.7-3.7 8.9-8.3 9.9l-2.6.6.6-2.6C10.3 12.3 14.5 8.6 19.2 8.6" />
      <path d="m9.3 14.7-3.1 3.1" />
      <path d="M10.5 8.5 15.5 13.5" />
      <path d="M8.4 17.6c-1.5.1-2.7 1.3-2.8 2.8" />
    </BaseIcon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8.2" r="3.1" />
      <path d="M6 19c1.3-2.7 3.4-4 6-4s4.7 1.3 6 4" />
    </BaseIcon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 20s-6.8-4.2-8.4-8.2A4.8 4.8 0 0 1 8.2 5c1.5 0 2.9.7 3.8 1.9A4.8 4.8 0 0 1 15.8 5a4.8 4.8 0 0 1 4.6 6.8C18.8 15.8 12 20 12 20Z" />
    </BaseIcon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4v10" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </BaseIcon>
  );
}
