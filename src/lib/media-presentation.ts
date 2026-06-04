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
    getVariantByType(variants, "FACEBOOK_FEED") ??
    getVariantByType(variants, "GOOGLE_BUSINESS_SAFE") ??
    original ??
    variants[0] ??
    null
  );
}

export function getAvailableVariantSummary(variants: Array<{ variantType: MediaVariantTypeValue }>) {
  const items: string[] = [];

  if (getVariantByType(variants, "ORIGINAL")) {
    items.push("Original");
  }

  if (getVariantByType(variants, "FACEBOOK_FEED")) {
    items.push("Facebook ready");
  }

  if (getVariantByType(variants, "GOOGLE_BUSINESS_SAFE")) {
    items.push("Google safe");
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
