import { SocialPlatform } from "@prisma/client";

export type HashtagGroup = {
  id: string;
  name: string;
  hashtags: string[];
};

export type HashtagSettings = {
  facebookDefaultLimit: number;
  groups: HashtagGroup[];
};

export const DEFAULT_FACEBOOK_HASHTAG_LIMIT = 5;
export const DEFAULT_HASHTAG_GROUPS: HashtagGroup[] = [
  {
    id: "bathrooms",
    name: "Bathrooms",
    hashtags: ["bathroomremodel", "tileinstallation", "customtile", "raleighnc"],
  },
  {
    id: "showers",
    name: "Showers",
    hashtags: ["customshower", "showerremodel", "tileinstallation", "raleighnc"],
  },
  {
    id: "fireplaces",
    name: "Fireplaces",
    hashtags: ["fireplacedesign", "tilefireplace", "customtile", "raleighnc"],
  },
  {
    id: "backsplashes",
    name: "Backsplashes",
    hashtags: ["backsplash", "kitchentile", "tileinstallation", "raleighnc"],
  },
  {
    id: "floors",
    name: "Floortile",
    hashtags: ["tilefloor", "flooring", "tileinstallation", "raleighnc"],
  },
  {
    id: "general",
    name: "General",
    hashtags: ["nctilepros", "tileinstallation", "customtile", "raleighnc"],
  },
];

export function normalizeHashtag(value: string | null | undefined) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "");

  return raw.replace(/[^a-z0-9_]/g, "");
}

export function normalizeHashtagList(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const hashtags: string[] = [];

  for (const value of values) {
    const normalized = normalizeHashtag(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    hashtags.push(normalized);
  }

  return hashtags;
}

export function formatInlineHashtags(hashtags: string[]) {
  return hashtags.map((tag) => `#${tag}`).join(" ");
}

export function formatStackedHashtags(hashtags: string[]) {
  return hashtags.map((tag) => `#${tag}`).join("\n");
}

export function appendContentBlock(baseText: string, suffixText: string) {
  const base = baseText.trim();
  const suffix = suffixText.trim();

  if (!base) {
    return suffix;
  }

  if (!suffix) {
    return base;
  }

  return `${base}\n\n${suffix}`;
}

export function buildEffectiveHashtagPayload(input: {
  platform: SocialPlatform;
  hashtags: string[];
  includeHashtagsInGoogle: boolean;
  facebookDefaultLimit: number;
}) {
  if (input.platform === SocialPlatform.FACEBOOK) {
    return {
      hashtagsUsed: input.hashtags.slice(0, Math.max(0, input.facebookDefaultLimit)),
      placement: "description" as const,
    };
  }

  if (input.platform === SocialPlatform.INSTAGRAM) {
    return {
      hashtagsUsed: input.hashtags,
      placement: "firstComment" as const,
    };
  }

  if (input.includeHashtagsInGoogle) {
    return {
      hashtagsUsed: input.hashtags,
      placement: "description" as const,
    };
  }

  return {
    hashtagsUsed: [] as string[],
    placement: "none" as const,
  };
}

export function applyHashtagsToPlatformContent(input: {
  platform: SocialPlatform;
  descriptionText: string;
  firstCommentText?: string;
  hashtags: string[];
  includeHashtagsInGoogle: boolean;
  facebookDefaultLimit: number;
}) {
  const payload = buildEffectiveHashtagPayload({
    platform: input.platform,
    hashtags: normalizeHashtagList(input.hashtags),
    includeHashtagsInGoogle: input.includeHashtagsInGoogle,
    facebookDefaultLimit: input.facebookDefaultLimit,
  });

  if (payload.placement === "none" || payload.hashtagsUsed.length === 0) {
    return {
      descriptionText: input.descriptionText.trim(),
      firstCommentText: (input.firstCommentText || "").trim(),
      hashtagsUsed: [] as string[],
      placement: payload.placement,
      hashtagDisplayText: "",
    };
  }

  if (payload.placement === "firstComment") {
    const hashtagBlock = formatStackedHashtags(payload.hashtagsUsed);
    return {
      descriptionText: input.descriptionText.trim(),
      firstCommentText: appendContentBlock(input.firstCommentText || "", hashtagBlock),
      hashtagsUsed: payload.hashtagsUsed,
      placement: payload.placement,
      hashtagDisplayText: hashtagBlock,
    };
  }

  const hashtagBlock = formatInlineHashtags(payload.hashtagsUsed);
  return {
    descriptionText: appendContentBlock(input.descriptionText, hashtagBlock),
    firstCommentText: (input.firstCommentText || "").trim(),
    hashtagsUsed: payload.hashtagsUsed,
    placement: payload.placement,
    hashtagDisplayText: hashtagBlock,
  };
}

export function parseStoredHashtagGroups(value: string | null | undefined) {
  if (!value?.trim()) {
    return DEFAULT_HASHTAG_GROUPS;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_HASHTAG_GROUPS;
    }

    const groups = parsed
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const maybeEntry = entry as { id?: unknown; name?: unknown; hashtags?: unknown };
        const name = String(maybeEntry.name || "").trim();
        if (!name) {
          return null;
        }

        const hashtags = Array.isArray(maybeEntry.hashtags)
          ? normalizeHashtagList(maybeEntry.hashtags.map((tag) => String(tag || "")))
          : [];

        return {
          id: String(maybeEntry.id || `group-${index + 1}`),
          name,
          hashtags,
        } satisfies HashtagGroup;
      })
      .filter((group): group is HashtagGroup => group !== null);

    return groups.length > 0 ? groups : DEFAULT_HASHTAG_GROUPS;
  } catch {
    return DEFAULT_HASHTAG_GROUPS;
  }
}

export function serializeHashtagGroups(groups: HashtagGroup[]) {
  return JSON.stringify(
    groups.map((group) => ({
      id: group.id,
      name: group.name.trim(),
      hashtags: normalizeHashtagList(group.hashtags),
    })),
  );
}

export function parseStoredFacebookHashtagLimit(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FACEBOOK_HASHTAG_LIMIT;
  }

  return Math.min(30, Math.max(0, parsed));
}
