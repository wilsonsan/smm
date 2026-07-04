"use client";

import type { SVGProps } from "react";
import { MEDIA_CATEGORY_ICON_OPTIONS, type MediaCategoryIconKey } from "@/lib/media-categories";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

type MediaCategoryIconProps = {
  icon: string;
  className?: string;
};

export function MediaCategoryIcon({ icon, className }: MediaCategoryIconProps) {
  switch (icon as MediaCategoryIconKey) {
    case "KITCHENS":
      return (
        <BaseIcon className={className}>
          <path d="M4.5 7.5h15" />
          <path d="M6.5 7.5V18" />
          <path d="M17.5 7.5V18" />
          <path d="M9.5 12.5h5" />
          <path d="M4.5 18h15" />
        </BaseIcon>
      );
    case "BATHROOMS":
      return (
        <BaseIcon className={className}>
          <rect x="6" y="4.5" width="12" height="8" rx="2.5" />
          <path d="M8.5 12.5v4a3.5 3.5 0 0 0 7 0v-4" />
          <path d="M10 9h4" />
        </BaseIcon>
      );
    case "SHOWERS":
      return (
        <BaseIcon className={className}>
          <path d="M7 7.5a5 5 0 0 1 10 0" />
          <path d="M17 7.5v3" />
          <path d="M8 10.5 6 19.5" />
          <path d="M11 11.5l-1.5 6" />
          <path d="M14 10.5l-1 4.5" />
          <path d="M17 10.5l-.7 3.5" />
        </BaseIcon>
      );
    case "BACKSPLASHES":
      return (
        <BaseIcon className={className}>
          <rect x="4.5" y="5" width="15" height="14" rx="2.5" />
          <path d="M9.5 5v14" />
          <path d="M14.5 5v14" />
          <path d="M4.5 10h15" />
          <path d="M4.5 14.5h15" />
        </BaseIcon>
      );
    case "FIREPLACES":
      return (
        <BaseIcon className={className}>
          <path d="M6 8h12" />
          <path d="M7.5 8V19h9V8" />
          <path d="M10.2 15.8c0-1.7 1.1-2.4 1.1-4.1 1.8.7 2.7 2.1 2.7 3.6 0 1.3-1 2.7-2.7 2.7-1.3 0-2.1-.9-2.1-2.2Z" />
        </BaseIcon>
      );
    case "FLOORS":
      return (
        <BaseIcon className={className}>
          <path d="M4.5 18.5h15" />
          <path d="M4.5 14.5h15" />
          <path d="M7.5 10 4.5 14.5" />
          <path d="M12 10 9 14.5" />
          <path d="M16.5 10 13.5 14.5" />
          <path d="M19.5 10 16.5 14.5" />
        </BaseIcon>
      );
    case "OUTDOOR":
      return (
        <BaseIcon className={className}>
          <path d="M5.5 17.5 12 6l6.5 11.5" />
          <path d="M8.5 17.5v-4h7v4" />
          <path d="M12 9.2V6" />
        </BaseIcon>
      );
    case "STAR":
      return (
        <BaseIcon className={className}>
          <path d="m12 4 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.2l5-.7L12 4Z" />
        </BaseIcon>
      );
    case "SHIELD":
      return (
        <BaseIcon className={className}>
          <path d="M12 4.5 18 7v4.7c0 3.5-2.2 6.7-6 7.8-3.8-1.1-6-4.3-6-7.8V7l6-2.5Z" />
        </BaseIcon>
      );
    case "CHECK_CIRCLE":
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="m9.2 12.3 2 2.1 3.8-4.1" />
        </BaseIcon>
      );
    case "SPARKLE":
      return (
        <BaseIcon className={className}>
          <path d="m12 4 1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4Z" />
          <path d="m18.2 4.8.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8Z" />
          <path d="m5.3 14.8.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4Z" />
        </BaseIcon>
      );
    case "WRENCH":
      return (
        <BaseIcon className={className}>
          <path d="M15.7 6.1a3.5 3.5 0 0 1-4.8 4.8l-5 5a1.7 1.7 0 1 0 2.4 2.4l5-5a3.5 3.5 0 0 0 4.8-4.8l-2.1 2.1-2.7-.3-.3-2.7 2.7-1.5Z" />
        </BaseIcon>
      );
    case "HOME":
      return (
        <BaseIcon className={className}>
          <path d="m5.5 10.5 6.5-5 6.5 5" />
          <path d="M7.5 9.8V18h9V9.8" />
          <path d="M10.5 18v-4h3v4" />
        </BaseIcon>
      );
    case "CLOCK":
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8v4.2l2.8 1.8" />
        </BaseIcon>
      );
    default:
      return (
        <BaseIcon className={className}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8v4.5" />
          <path d="M12 16h.01" />
        </BaseIcon>
      );
  }
}
