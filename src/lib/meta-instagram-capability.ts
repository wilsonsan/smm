import { env } from "@/lib/env";

export const META_INSTAGRAM_UNAVAILABLE_MESSAGE = "Instagram publishing is currently unavailable.";
export const META_INSTAGRAM_NOT_ENABLED_MESSAGE = "Instagram publishing is not enabled for this application.";
export const META_INSTAGRAM_REMOVE_AND_RETRY_MESSAGE =
  "This post includes an Instagram destination that is currently unavailable. Remove Instagram and try again.";

export function isMetaInstagramEnabled() {
  return env.META_INSTAGRAM_ENABLED;
}
