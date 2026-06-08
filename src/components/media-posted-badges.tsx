import type { ReactNode } from "react";
import { ClockIcon, FacebookIcon, SuccessIcon } from "@/components/dashboard-icons";
import type { MediaAssetPostedPlatformFlags } from "@/lib/media-presentation";

function InstagramPostedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.3" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.05" cy="6.95" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GoogleBusinessPostedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.2 2.8-7.2Z" />
      <path fill="#34A853" d="M12 21c2.5 0 4.6-.8 6.2-2.2l-3.1-2.5c-.9.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.6V16c1.6 3 4.7 5 8.4 5Z" />
      <path fill="#FBBC04" d="M6.9 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.6A9 9 0 0 0 3 11.6c0 1.6.4 3.1 1.1 4.4l2.8-2.5Z" />
      <path fill="#EA4335" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.6 2.8 14.5 2 12 2 8.3 2 5.2 4 3.6 7.2l3.3 2.5c.7-2.2 2.7-3.8 5.1-3.8Z" />
    </svg>
  );
}

function buildOverlayBadges(postedPlatforms: MediaAssetPostedPlatformFlags) {
  return [
    postedPlatforms.postedAnywhere
      ? postedPlatforms.publishedAnywhere
        ? { key: "check", label: "Posted successfully", accentClass: "is-check", icon: <SuccessIcon /> }
        : { key: "scheduled", label: "Scheduled to post", accentClass: "is-scheduled", icon: <ClockIcon /> }
      : null,
    postedPlatforms.postedToFacebook
      ? { key: "facebook", label: "Posted to Facebook", accentClass: "is-facebook", icon: <FacebookIcon /> }
      : null,
    postedPlatforms.postedToInstagram
      ? { key: "instagram", label: "Posted to Instagram", accentClass: "is-instagram", icon: <InstagramPostedIcon /> }
      : null,
    postedPlatforms.postedToGoogle
      ? { key: "google", label: "Posted to Google", accentClass: "is-google", icon: <GoogleBusinessPostedIcon /> }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; accentClass: string; icon: ReactNode }>;
}

export function MediaPostedBadges({
  postedPlatforms,
  className = "gallery-posted-badges",
}: {
  postedPlatforms: MediaAssetPostedPlatformFlags;
  className?: string;
}) {
  const badges = buildOverlayBadges(postedPlatforms);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`gallery-posted-badge ${badge.accentClass}`.trim()}
          title={badge.label}
          aria-label={badge.label}
        >
          {badge.icon}
        </span>
      ))}
    </div>
  );
}
