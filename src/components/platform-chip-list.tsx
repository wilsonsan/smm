"use client";

import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import {
  FacebookIcon,
  GoogleBusinessIcon,
  InstagramIcon,
} from "@/components/dashboard-icons";

function getPlatformLabel(platform: SocialPlatform) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return "Facebook";
    case SocialPlatform.INSTAGRAM:
      return "Instagram";
    case SocialPlatform.GOOGLE_BUSINESS:
      return "Google";
    default:
      return platform;
  }
}

function getPlatformClassName(platform: SocialPlatform) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return "is-facebook";
    case SocialPlatform.INSTAGRAM:
      return "is-instagram";
    case SocialPlatform.GOOGLE_BUSINESS:
      return "is-google";
    default:
      return "";
  }
}

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return <FacebookIcon />;
    case SocialPlatform.INSTAGRAM:
      return <InstagramIcon />;
    case SocialPlatform.GOOGLE_BUSINESS:
      return <GoogleBusinessIcon />;
    default:
      return null;
  }
}

function getPlatformStatusTone(status: SocialPostStatus) {
  switch (status) {
    case SocialPostStatus.PUBLISHED:
      return "published";
    case SocialPostStatus.FAILED:
    case SocialPostStatus.CANCELLED:
      return "failed";
    case SocialPostStatus.PUBLISHING:
      return "publishing";
    case SocialPostStatus.SCHEDULED:
      return "scheduled";
    default:
      return "draft";
  }
}

export function PlatformChipList({
  platforms,
  iconsOnly = false,
  className = "",
}: {
  platforms: Array<{
    platform: SocialPlatform;
    status?: SocialPostStatus;
  }>;
  iconsOnly?: boolean;
  className?: string;
}) {
  if (platforms.length === 0) {
    return <span className="muted">None</span>;
  }

  return (
    <div className={`platform-chip-list${iconsOnly ? " is-icons-only" : ""} ${className}`.trim()}>
      {platforms.map((item) => (
        <span
          key={`${item.platform}-${item.status ?? "none"}`}
          className={`platform-chip ${getPlatformClassName(item.platform)} ${item.status ? `is-${getPlatformStatusTone(item.status)}` : ""}`.trim()}
          title={item.status ? `${getPlatformLabel(item.platform)} - ${item.status}` : getPlatformLabel(item.platform)}
          aria-label={item.status ? `${getPlatformLabel(item.platform)} - ${item.status}` : getPlatformLabel(item.platform)}
        >
          <span className="platform-chip-icon" aria-hidden="true">
            <PlatformIcon platform={item.platform} />
          </span>
          {iconsOnly ? null : <span>{getPlatformLabel(item.platform)}</span>}
          {item.status && !iconsOnly ? <small>{item.status}</small> : null}
        </span>
      ))}
    </div>
  );
}

export function PlatformLinkButtons({
  links,
}: {
  links: Array<{
    platform: SocialPlatform;
    url: string;
  }>;
}) {
  if (links.length === 0) {
    return <span className="muted">No links</span>;
  }

  return (
    <div className="platform-link-list">
      {links.map((item) => (
        <a
          key={`${item.platform}-${item.url}`}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className={`platform-link-button ${getPlatformClassName(item.platform)}`.trim()}
        >
          <span className="platform-link-button-icon" aria-hidden="true">
            <PlatformIcon platform={item.platform} />
          </span>
          <span>Open {getPlatformLabel(item.platform)}</span>
        </a>
      ))}
    </div>
  );
}
