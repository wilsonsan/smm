export type MediaVariantTypeValue =
  | "ORIGINAL"
  | "FACEBOOK_FEED"
  | "GOOGLE_BUSINESS_SAFE"
  | "INSTAGRAM_FEED_PLACEHOLDER";

export type MediaVariantSummary = {
  id: string;
  variantType: MediaVariantTypeValue;
  mimeType: string;
  sizeBytes: string;
  width: number;
  height: number;
};

export type MediaAssetSummary = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: string;
  width: number;
  height: number;
  variants: MediaVariantSummary[];
};

export type MediaAssetPostedPlatformFlags = {
  postedToFacebook: boolean;
  postedToInstagram: boolean;
  postedToGoogle: boolean;
  postedAnywhere: boolean;
  postedEverywhere: boolean;
  publishedAnywhere: boolean;
};

export type MediaAssetUsageSummary = {
  totalUses: number;
  facebookUses: number;
  instagramUses: number;
  googleUses: number;
  lastUsedAt: string | null;
};

export type MediaCategorySummary = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type MediaAssetGallerySummary = MediaAssetSummary & {
  createdAt: string;
  categories: MediaCategorySummary[];
  postedPlatforms: MediaAssetPostedPlatformFlags;
  usage: MediaAssetUsageSummary;
};

const variantLabels: Record<MediaVariantTypeValue, string> = {
  ORIGINAL: "Original",
  FACEBOOK_FEED: "Facebook feed",
  GOOGLE_BUSINESS_SAFE: "Google Business safe",
  INSTAGRAM_FEED_PLACEHOLDER: "Instagram placeholder",
};

const variantSortOrder: Record<MediaVariantTypeValue, number> = {
  ORIGINAL: 0,
  FACEBOOK_FEED: 1,
  GOOGLE_BUSINESS_SAFE: 2,
  INSTAGRAM_FEED_PLACEHOLDER: 3,
};

export function getMediaVariantLabel(variantType: MediaVariantTypeValue) {
  return variantLabels[variantType] ?? variantType;
}

export function sortMediaVariants<T extends { variantType: MediaVariantTypeValue }>(variants: T[]) {
  return [...variants].sort((left, right) => variantSortOrder[left.variantType] - variantSortOrder[right.variantType]);
}

export function formatBytes(sizeBytes: string | number | bigint) {
  const value = typeof sizeBytes === "bigint" ? Number(sizeBytes) : Number(sizeBytes);
  if (!Number.isFinite(value) || value < 0) {
    return "Unknown size";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDimensions(width: number, height: number) {
  return `${width}x${height}`;
}

export function getMediaVariantUrl(variantId: string) {
  return `/api/admin/media/${variantId}`;
}

export function getVariantByType<T extends { variantType: MediaVariantTypeValue }>(
  variants: T[],
  variantType: MediaVariantTypeValue,
) {
  return variants.find((variant) => variant.variantType === variantType) ?? null;
}

function isBrowserPreviewFriendlyMimeType(mimeType: string | undefined) {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

export function getPreferredPreviewVariant<
  T extends { variantType: MediaVariantTypeValue; mimeType?: string | undefined },
>(variants: T[]) {
  const original = getVariantByType(variants, "ORIGINAL");
  if (original && isBrowserPreviewFriendlyMimeType(original.mimeType)) {
    return original;
  }

  return (
    original ??
    getVariantByType(variants, "FACEBOOK_FEED") ??
    getVariantByType(variants, "GOOGLE_BUSINESS_SAFE") ??
    variants[0] ??
    null
  );
}

export function getAvailableVariantSummary(variants: Array<{ variantType: MediaVariantTypeValue }>) {
  const items: string[] = ["Original"];

  if (getVariantByType(variants, "FACEBOOK_FEED")) {
    items.push("Facebook ready");
  } else {
    items.push("Facebook at publish time");
  }

  if (getVariantByType(variants, "GOOGLE_BUSINESS_SAFE")) {
    items.push("Google safe");
  } else {
    items.push("Google at publish time");
  }

  return items;
}

export function toMediaAssetSummary(asset: {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: bigint;
  width: number;
  height: number;
  variants: Array<{
    id: string;
    variantType: MediaVariantTypeValue;
    mimeType: string;
    sizeBytes: bigint;
    width: number;
    height: number;
  }>;
}): MediaAssetSummary {
  return {
    id: asset.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    width: asset.width,
    height: asset.height,
    variants: sortMediaVariants(
      asset.variants.map((variant) => ({
        id: variant.id,
        variantType: variant.variantType,
        mimeType: variant.mimeType,
        sizeBytes: variant.sizeBytes.toString(),
        width: variant.width,
        height: variant.height,
      })),
    ),
  };
}

export function resolvePostedPlatformFlags(platforms: Array<{ platform: string; status: string }>) {
  const activePostingStatuses = new Set(["SCHEDULED", "PUBLISHING", "PUBLISHED"]);
  const publishedStatuses = new Set(["PUBLISHED"]);
  const postedToFacebook = platforms.some(
    (platform) => platform.platform === "FACEBOOK" && activePostingStatuses.has(platform.status),
  );
  const postedToInstagram = platforms.some(
    (platform) => platform.platform === "INSTAGRAM" && activePostingStatuses.has(platform.status),
  );
  const postedToGoogle = platforms.some(
    (platform) => platform.platform === "GOOGLE_BUSINESS" && activePostingStatuses.has(platform.status),
  );
  const postedAnywhere = postedToFacebook || postedToInstagram || postedToGoogle;
  const postedEverywhere = postedToFacebook && postedToInstagram && postedToGoogle;
  const publishedAnywhere = platforms.some((platform) => publishedStatuses.has(platform.status));

  return {
    postedToFacebook,
    postedToInstagram,
    postedToGoogle,
    postedAnywhere,
    postedEverywhere,
    publishedAnywhere,
  };
}

function buildUsageSummary(
  posts: Array<{
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    updatedAt: Date;
    platforms: Array<{
      platform: string;
      status: string;
    }>;
  }>,
): MediaAssetUsageSummary {
  const activeStatuses = new Set(["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"]);
  let facebookUses = 0;
  let instagramUses = 0;
  let googleUses = 0;
  let lastUsedAt: Date | null = null;

  for (const post of posts) {
    const countedPlatforms = post.platforms.filter((platform) => activeStatuses.has(platform.status));
    if (countedPlatforms.length === 0) {
      continue;
    }

    const candidateLastUsedAt = post.publishedAt ?? post.scheduledAt ?? post.updatedAt;
    if (candidateLastUsedAt && (!lastUsedAt || candidateLastUsedAt.getTime() > lastUsedAt.getTime())) {
      lastUsedAt = candidateLastUsedAt;
    }

    for (const platform of countedPlatforms) {
      if (platform.platform === "FACEBOOK") {
        facebookUses += 1;
      } else if (platform.platform === "INSTAGRAM") {
        instagramUses += 1;
      } else if (platform.platform === "GOOGLE_BUSINESS") {
        googleUses += 1;
      }
    }
  }

  return {
    totalUses: facebookUses + instagramUses + googleUses,
    facebookUses,
    instagramUses,
    googleUses,
    lastUsedAt: lastUsedAt ? lastUsedAt.toISOString() : null,
  };
}

export function toMediaAssetGallerySummary(asset: {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: bigint;
  width: number;
  height: number;
  createdAt: Date;
  categoryAssignments: Array<{
    mediaCategory: {
      id: string;
      name: string;
      slug: string;
      color: string;
      icon: string;
      sortOrder: number;
    };
  }>;
  variants: Array<{
    id: string;
    variantType: MediaVariantTypeValue;
    mimeType: string;
    sizeBytes: bigint;
    width: number;
    height: number;
  }>;
  posts: Array<{
    id: string;
    platforms: Array<{
      platform: string;
      status: string;
    }>;
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    updatedAt: Date;
  }>;
  attachedToPosts: Array<{
    socialPost: {
      id: string;
      status: string;
      scheduledAt: Date | null;
      publishedAt: Date | null;
      updatedAt: Date;
      platforms: Array<{
        platform: string;
        status: string;
      }>;
    };
  }>;
}): MediaAssetGallerySummary {
  const uniquePosts = new Map<
    string,
    {
      status: string;
      scheduledAt: Date | null;
      publishedAt: Date | null;
      updatedAt: Date;
      platforms: Array<{
        platform: string;
        status: string;
      }>;
    }
  >();

  for (const post of asset.posts) {
    uniquePosts.set(post.id, post);
  }

  for (const relation of asset.attachedToPosts) {
    uniquePosts.set(relation.socialPost.id, relation.socialPost);
  }

  const normalizedPosts = [...uniquePosts.values()];

  return {
    ...toMediaAssetSummary(asset),
    createdAt: asset.createdAt.toISOString(),
    categories: [...asset.categoryAssignments]
      .map((assignment) => assignment.mediaCategory)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
      })),
    postedPlatforms: resolvePostedPlatformFlags(
      normalizedPosts.flatMap((post) => post.platforms),
    ),
    usage: buildUsageSummary(normalizedPosts),
  };
}
