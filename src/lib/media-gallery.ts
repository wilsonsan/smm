import type { AdminUserRole } from "@prisma/client";
import type { MediaAssetGallerySummary, MediaCategorySummary } from "@/lib/media-presentation";
import { FALLBACK_MEDIA_CATEGORY_NAME, FALLBACK_MEDIA_CATEGORY_SLUG } from "@/lib/media-categories";

export type GalleryCategorySummary = MediaCategorySummary & {
  assetCount: number;
};

function normalizeFallbackCategory<T extends MediaCategorySummary>(category: T): T {
  if (category.slug !== FALLBACK_MEDIA_CATEGORY_SLUG) {
    return category;
  }

  return {
    ...category,
    name: FALLBACK_MEDIA_CATEGORY_NAME,
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

export function getFallbackDisplayCategory(
  categories: GalleryCategorySummary[],
  assetCategories: MediaCategorySummary[],
) {
  if (assetCategories.length > 0) {
    return normalizeFallbackCategory(assetCategories[0]);
  }

  return (
    categories.find((category) => category.slug === FALLBACK_MEDIA_CATEGORY_SLUG) ?? {
      id: "fallback-other",
      name: FALLBACK_MEDIA_CATEGORY_NAME,
      slug: FALLBACK_MEDIA_CATEGORY_SLUG,
      color: "#8f9bb3",
      icon: "OTHER",
      sortOrder: Number.MAX_SAFE_INTEGER,
      assetCount: 0,
    }
  );
}

export function buildGalleryCategorySummaries(input: {
  categories: MediaCategorySummary[];
  assets: MediaAssetGallerySummary[];
}) {
  const counts = new Map<string, number>();

  for (const asset of input.assets) {
    if (asset.categories.length === 0) {
      counts.set(FALLBACK_MEDIA_CATEGORY_SLUG, (counts.get(FALLBACK_MEDIA_CATEGORY_SLUG) ?? 0) + 1);
      continue;
    }

    for (const category of asset.categories) {
      counts.set(category.slug, (counts.get(category.slug) ?? 0) + 1);
    }
  }

  const categories = input.categories.some((category) => category.slug === FALLBACK_MEDIA_CATEGORY_SLUG)
    ? input.categories
    : [
        ...input.categories,
        {
          id: "fallback-other",
          name: FALLBACK_MEDIA_CATEGORY_NAME,
          slug: FALLBACK_MEDIA_CATEGORY_SLUG,
          color: "#8f9bb3",
          icon: "OTHER",
          sortOrder: Number.MAX_SAFE_INTEGER,
        },
      ];

  return categories
    .map((category) => normalizeFallbackCategory(category))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .map((category) => ({
      ...category,
      assetCount: counts.get(category.slug) ?? 0,
    }));
}

export function getTrackedMediaStorageBytes(assets: MediaAssetGallerySummary[]) {
  return assets.reduce((total, asset) => total + Number(asset.sizeBytes || 0), 0);
}

export function canManageGalleryStructure(role: AdminUserRole) {
  return role === "ADMIN";
}
