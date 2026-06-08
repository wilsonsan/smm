import { SocialPlatform } from "@prisma/client";

export const MULTI_IMAGE_PLATFORM_LIMIT = 10;
export const DEFAULT_CAPTION_MAX = 63206;

export type PlatformCaptionRule = {
  platform: SocialPlatform;
  label: string;
  maxChars: number;
  idealMin: number;
  idealMax: number;
  visibleChars: number;
};

const PLATFORM_CAPTION_RULES: Record<SocialPlatform, PlatformCaptionRule> = {
  [SocialPlatform.FACEBOOK]: {
    platform: SocialPlatform.FACEBOOK,
    label: "Facebook",
    maxChars: 63206,
    idealMin: 40,
    idealMax: 80,
    visibleChars: 125,
  },
  [SocialPlatform.INSTAGRAM]: {
    platform: SocialPlatform.INSTAGRAM,
    label: "Instagram",
    maxChars: 2200,
    idealMin: 138,
    idealMax: 150,
    visibleChars: 125,
  },
  [SocialPlatform.GOOGLE_BUSINESS]: {
    platform: SocialPlatform.GOOGLE_BUSINESS,
    label: "Google Business",
    maxChars: 1500,
    idealMin: 150,
    idealMax: 300,
    visibleChars: 150,
  },
};

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

export function getCaptionRulesForPlatforms(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));
  return normalizedPlatforms.map((platform) => PLATFORM_CAPTION_RULES[platform]);
}

export function getCaptionMaxForPlatforms(platforms: Array<SocialPlatform | string>) {
  const rules = getCaptionRulesForPlatforms(platforms);

  if (rules.length === 0) {
    return DEFAULT_CAPTION_MAX;
  }

  return Math.min(...rules.map((rule) => rule.maxChars));
}

export function getCaptionMaxLabelForPlatforms(platforms: Array<SocialPlatform | string>) {
  const rules = getCaptionRulesForPlatforms(platforms);

  if (rules.length === 0) {
    return `Select a platform to see its ideal range. Absolute max: ${DEFAULT_CAPTION_MAX.toLocaleString()} characters.`;
  }

  const lowestRule = rules.reduce((currentLowest, rule) =>
    rule.maxChars < currentLowest.maxChars ? rule : currentLowest,
  );

  if (rules.length === 1) {
    return `${lowestRule.label} allows up to ${lowestRule.maxChars.toLocaleString()} characters.`;
  }

  return `Selected platforms are capped at ${lowestRule.maxChars.toLocaleString()} characters by ${lowestRule.label}.`;
}

export function getCaptionLimitErrorMessage(platforms: Array<SocialPlatform | string>) {
  const rules = getCaptionRulesForPlatforms(platforms);

  if (rules.length === 0) {
    return `Caption must be ${DEFAULT_CAPTION_MAX.toLocaleString()} characters or less.`;
  }

  const lowestRule = rules.reduce((currentLowest, rule) =>
    rule.maxChars < currentLowest.maxChars ? rule : currentLowest,
  );

  if (rules.length === 1) {
    return `${lowestRule.label} captions must be ${lowestRule.maxChars.toLocaleString()} characters or less.`;
  }

  return `Selected platforms allow up to ${lowestRule.maxChars.toLocaleString()} characters. ${lowestRule.label} sets the lowest limit.`;
}

export function getPlatformMediaLimitMessage(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  if (normalizedPlatforms.includes(SocialPlatform.GOOGLE_BUSINESS)) {
    return "Google Business posts can only use 1 image. Remove extra images or deselect Google.";
  }

  return `You can attach up to ${MULTI_IMAGE_PLATFORM_LIMIT} images for the selected platforms.`;
}

export function doSelectedPlatformsRequireMedia(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));
  return normalizedPlatforms.includes(SocialPlatform.INSTAGRAM);
}

export function getRequiredMediaMessageForPlatforms(platforms: Array<SocialPlatform | string>) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  if (normalizedPlatforms.includes(SocialPlatform.INSTAGRAM)) {
    return "Instagram posts require at least 1 image. Add media or remove Instagram.";
  }

  return "Add at least 1 image for the selected platforms.";
}

export function areSelectedPlatformsPublishableNow(
  platforms: Array<SocialPlatform | string>,
  intent: "schedule" | "publish" = "publish",
) {
  const normalizedPlatforms = normalizeSelectedPlatforms(platforms.map((platform) => String(platform)));

  if (intent === "schedule") {
    return (
      normalizedPlatforms.length === 1 &&
      (normalizedPlatforms[0] === SocialPlatform.FACEBOOK ||
        normalizedPlatforms[0] === SocialPlatform.GOOGLE_BUSINESS)
    );
  }

  return (
    normalizedPlatforms.length === 1 &&
    (normalizedPlatforms[0] === SocialPlatform.FACEBOOK ||
      normalizedPlatforms[0] === SocialPlatform.INSTAGRAM ||
      normalizedPlatforms[0] === SocialPlatform.GOOGLE_BUSINESS)
  );
}
