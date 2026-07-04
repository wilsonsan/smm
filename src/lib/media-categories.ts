export type MediaCategoryIconKey =
  | "KITCHENS"
  | "BATHROOMS"
  | "SHOWERS"
  | "BACKSPLASHES"
  | "FIREPLACES"
  | "FLOORS"
  | "OUTDOOR"
  | "OTHER";

export type MediaCategorySeed = {
  name: string;
  slug: string;
  color: string;
  icon: MediaCategoryIconKey;
  sortOrder: number;
};

export const DEFAULT_MEDIA_CATEGORIES: MediaCategorySeed[] = [
  { name: "Kitchens", slug: "kitchens", color: "#5b8cff", icon: "KITCHENS", sortOrder: 10 },
  { name: "Bathrooms", slug: "bathrooms", color: "#45c4ff", icon: "BATHROOMS", sortOrder: 20 },
  { name: "Showers", slug: "showers", color: "#39d98a", icon: "SHOWERS", sortOrder: 30 },
  { name: "Backsplashes", slug: "backsplashes", color: "#7d67ff", icon: "BACKSPLASHES", sortOrder: 40 },
  { name: "Fireplaces", slug: "fireplaces", color: "#ff8a3d", icon: "FIREPLACES", sortOrder: 50 },
  { name: "Floors", slug: "floors", color: "#f4c84c", icon: "FLOORS", sortOrder: 60 },
  { name: "Outdoor", slug: "outdoor", color: "#3fd1c6", icon: "OUTDOOR", sortOrder: 70 },
  { name: "Other", slug: "other", color: "#8f9bb3", icon: "OTHER", sortOrder: 999 },
] as const;

export const MEDIA_CATEGORY_ICON_OPTIONS: Array<{ value: MediaCategoryIconKey; label: string }> = [
  { value: "KITCHENS", label: "Kitchens" },
  { value: "BATHROOMS", label: "Bathrooms" },
  { value: "SHOWERS", label: "Showers" },
  { value: "BACKSPLASHES", label: "Backsplashes" },
  { value: "FIREPLACES", label: "Fireplaces" },
  { value: "FLOORS", label: "Floors" },
  { value: "OUTDOOR", label: "Outdoor" },
  { value: "OTHER", label: "Other" },
];

export const FALLBACK_MEDIA_CATEGORY_SLUG = "other";

export function normalizeMediaCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function slugifyMediaCategoryName(value: string) {
  return normalizeMediaCategoryName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isFallbackMediaCategorySlug(slug: string) {
  return slug.trim().toLowerCase() === FALLBACK_MEDIA_CATEGORY_SLUG;
}

export function getDefaultMediaCategoryBySlug(slug: string) {
  return DEFAULT_MEDIA_CATEGORIES.find((category) => category.slug === slug) ?? null;
}
