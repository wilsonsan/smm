import { env } from "@/lib/env";

export const META_INSTAGRAM_UNAVAILABLE_MESSAGE = "Instagram publishing is currently unavailable.";
export const META_INSTAGRAM_NOT_ENABLED_MESSAGE = "Instagram publishing is not enabled for this application.";
export const META_INSTAGRAM_REMOVE_AND_RETRY_MESSAGE =
  "This post includes an Instagram destination that is currently unavailable. Remove Instagram and try again.";
export const META_INSTAGRAM_COMMENTS_NOT_ENABLED_MESSAGE =
  "Instagram first-comment publishing is unavailable.";

export function isMetaInstagramPublishingEnabled() {
  return env.META_INSTAGRAM_PUBLISHING_ENABLED;
}

export function isMetaInstagramCommentsEnabled() {
  return env.META_INSTAGRAM_COMMENTS_ENABLED;
}
