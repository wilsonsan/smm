import { SocialPlatform } from "@prisma/client";

export const MULTI_IMAGE_PLATFORM_LIMIT = 10;

export function normalizeSelectedPlatforms(platforms: string[]) {
  const normalized = platforms
    .map((platform) => platform.trim().toUpperCase())
    .filter((platform): platform is SocialPlatform =>
      Object.values(SocialPlatform).includes(platform as SocialPlatform),
    );

  return Array.from(new Set(normalized));
}

export function getMaxMediaCountForPlatforms(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  if (normalizedPlatforms.includes(SocialPlatform.GOOGLE_BUSINESS)) {
    return 1;
  }

  return MULTI_IMAGE_PLATFORM_LIMIT;
}

export function getPlatformMediaLimitMessage(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  if (normalizedPlatforms.includes(SocialPlatform.GOOGLE_BUSINESS)) {
    return "Google Business posts can only use 1 image. Remove extra images or deselect Google.";
  }

  return `You can attach up to ${MULTI_IMAGE_PLATFORM_LIMIT} images for the selected platforms.`;
}

export function areSelectedPlatformsPublishableNow(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  return normalizedPlatforms.length > 0 && normalizedPlatforms.every((platform) => platform === SocialPlatform.FACEBOOK);
}
