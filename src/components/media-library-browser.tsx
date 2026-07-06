"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { CustomSelect, type CustomSelectOption } from "@/components/custom-select";
import { MediaUploadModal, type MediaUploadResult } from "@/components/media-upload-modal";
import {
  ChevronDownIcon,
  GalleryIcon,
} from "@/components/dashboard-icons";
import { MediaCategoryIcon } from "@/components/media-category-icon";
import { MediaPostedBadges } from "@/components/media-posted-badges";
import {
  buildGalleryCategorySummaries,
  type GalleryCategorySummary,
  getFallbackDisplayCategory,
} from "@/lib/media-gallery";
import type { MediaAssetGallerySummary } from "@/lib/media-presentation";
import {
  formatBytes,
  getGalleryPreviewVariant,
  getGalleryThumbnailVariant,
  getMediaVariantUrl,
  getOriginalVariant,
} from "@/lib/media-presentation";
import {
  FALLBACK_MEDIA_CATEGORY_SLUG,
  FALLBACK_MEDIA_CATEGORY_NAME,
  MEDIA_CATEGORY_COLOR_OPTIONS,
  MEDIA_CATEGORY_ICON_OPTIONS,
} from "@/lib/media-categories";

type MediaLibraryBrowserProps = {
  assets: MediaAssetGallerySummary[];
  categories: GalleryCategorySummary[];
  timezone: string;
  canManageCategories: boolean;
  trackedStorageBytes: number;
  galleryStorageLimitGb: number;
};

type StatusFilterValue = "ALL" | "USED" | "UNUSED";
type TypeFilterValue = "ALL_TYPES" | "IMAGES" | "VIDEOS";
type SortOrderValue = "NEWEST" | "OLDEST" | "MOST_USED" | "LEAST_USED";
type BulkActionValue = "assignCategories" | "deleteSelected";
type CategoryActionMode = "single-assign" | "single-replace" | "bulk-assign" | "bulk-replace";

type CategoryEditorDraft = {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
};

type CategoryDialogState = {
  mode: CategoryActionMode;
  mediaAssetIds: string[];
  categoryIds: string[];
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "ALL", label: "All Status" },
  { value: "USED", label: "Used" },
  { value: "UNUSED", label: "Unused" },
];

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilterValue; label: string }> = [
  { value: "ALL_TYPES", label: "All Types" },
  { value: "IMAGES", label: "Images" },
  { value: "VIDEOS", label: "Videos" },
];

const SORT_OPTIONS: Array<{ value: SortOrderValue; label: string }> = [
  { value: "NEWEST", label: "Newest First" },
  { value: "OLDEST", label: "Oldest First" },
  { value: "MOST_USED", label: "Most Used" },
  { value: "LEAST_USED", label: "Least Used" },
];

const BULK_ACTION_OPTIONS: Array<{ value: BulkActionValue; label: string }> = [
  { value: "assignCategories", label: "Assign Category" },
  { value: "deleteSelected", label: "Delete Selected" },
];

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48];

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 16V5.5" />
      <path d="m8.5 9 3.5-3.5L15.5 9" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

function QuestionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9.2 9a2.8 2.8 0 1 1 5 1.8c-.8.6-1.4 1.1-1.7 1.5-.3.4-.5.8-.5 1.7" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 6.5h5l2 2h9v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5Z" />
    </svg>
  );
}

function LayersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </svg>
  );
}

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ArrowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatUploadDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function sortAssets(assets: MediaAssetGallerySummary[], sortOrder: SortOrderValue) {
  const copy = [...assets];
  copy.sort((left, right) => {
    switch (sortOrder) {
      case "OLDEST":
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      case "MOST_USED":
        return right.usage.totalUses - left.usage.totalUses || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      case "LEAST_USED":
        return left.usage.totalUses - right.usage.totalUses || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      case "NEWEST":
      default:
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
  });
  return copy;
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const normalized = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((left, right) => left - right);
  const result: Array<number | "ELLIPSIS"> = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const page = normalized[index];
    const previous = normalized[index - 1];
    if (previous && page - previous > 1) {
      result.push("ELLIPSIS");
    }
    result.push(page);
  }

  return result;
}

function buildEmptyCategoryDraft(): CategoryEditorDraft {
  return {
    categoryId: null,
    name: "",
    color: "#5b8cff",
    icon: "OTHER",
  };
}

function getTypeLabel(asset: MediaAssetGallerySummary) {
  if (asset.mimeType.startsWith("video/")) {
    return "VIDEO";
  }
  return asset.originalFilename.split(".").pop()?.toUpperCase() || asset.mimeType.replace(/^image\//, "").toUpperCase();
}

function dedupeAssets(assets: MediaAssetGallerySummary[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) {
      return false;
    }
    seen.add(asset.id);
    return true;
  });
}

function getCurrentMediaAssetUrl(mediaAssetId: string) {
  return `/api/admin/media-assets/${mediaAssetId}/current`;
}

function normalizeLocalCategory(category: GalleryCategorySummary): GalleryCategorySummary {
  if (category.slug !== FALLBACK_MEDIA_CATEGORY_SLUG) {
    return category;
  }

  return {
    ...category,
    name: FALLBACK_MEDIA_CATEGORY_NAME,
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

function isSyntheticFallbackCategory(category: Pick<GalleryCategorySummary, "id" | "slug">) {
  return category.slug === FALLBACK_MEDIA_CATEGORY_SLUG && category.id === "fallback-other";
}

export function MediaLibraryBrowser({
  assets,
  categories,
  timezone,
  canManageCategories,
  trackedStorageBytes,
  galleryStorageLimitGb,
}: MediaLibraryBrowserProps) {
  const router = useRouter();
  const topRef = useRef<HTMLElement | null>(null);
  const [localAssets, setLocalAssets] = useState(() => dedupeAssets(assets));
  const [localCategories, setLocalCategories] = useState<GalleryCategorySummary[]>(() => categories.map(normalizeLocalCategory));
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("ALL_TYPES");
  const [sortOrder, setSortOrder] = useState<SortOrderValue>("NEWEST");
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryEditorDraft, setCategoryEditorDraft] = useState<CategoryEditorDraft | null>(null);
  const [categoryEditorError, setCategoryEditorError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
  const [categoryDialogSelection, setCategoryDialogSelection] = useState<string[]>([]);
  const [categoryDialogError, setCategoryDialogError] = useState<string | null>(null);
  const [isSavingCategoryDialog, setIsSavingCategoryDialog] = useState(false);
  const [renameAssetDraft, setRenameAssetDraft] = useState<{ mediaAssetId: string; originalFilename: string } | null>(null);
  const [renameAssetError, setRenameAssetError] = useState<string | null>(null);
  const [isRenamingAsset, setIsRenamingAsset] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setLocalAssets(dedupeAssets(assets));
  }, [assets]);

  useEffect(() => {
    setLocalCategories(categories.map(normalizeLocalCategory));
  }, [categories]);

  useEffect(() => {
    const validIds = new Set(localAssets.map((asset) => asset.id));
    setSelectedAssetIds((current) => current.filter((id) => validIds.has(id)));
  }, [localAssets]);

  useEffect(() => {
    if (!isUploadModalOpen && !openAssetId && !isCategoryManagerOpen && !categoryDialog && !renameAssetDraft) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [categoryDialog, isCategoryManagerOpen, isUploadModalOpen, openAssetId, renameAssetDraft]);

  const categorySummaries = useMemo(
    () => buildGalleryCategorySummaries({ categories: localCategories, assets: localAssets }),
    [localAssets, localCategories],
  );
  const galleryStorageLimitBytes = useMemo(
    () => galleryStorageLimitGb * 1024 * 1024 * 1024,
    [galleryStorageLimitGb],
  );
  const galleryStoragePercent = useMemo(() => {
    if (galleryStorageLimitBytes <= 0) {
      return 0;
    }

    return Math.min((trackedStorageBytes / galleryStorageLimitBytes) * 100, 100);
  }, [galleryStorageLimitBytes, trackedStorageBytes]);
  const categoryFilterOptions = useMemo<CustomSelectOption[]>(
    () => [
      { value: "ALL", label: "All Categories" },
      ...categorySummaries.map((category) => ({
        value: category.slug,
        label: category.name,
        trailing: <span className="app-select-option-count">{category.assetCount}</span>,
        icon: (
          <span className="app-select-category-swatch" style={{ backgroundColor: category.color }}>
            <MediaCategoryIcon icon={category.icon} className="app-select-category-icon" />
          </span>
        ),
      })),
    ],
    [categorySummaries],
  );
  const statusFilterOptions = useMemo<CustomSelectOption[]>(
    () => STATUS_FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const typeFilterOptions = useMemo<CustomSelectOption[]>(
    () => TYPE_FILTER_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const sortOptions = useMemo<CustomSelectOption[]>(
    () => SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const itemsPerPageOptions = useMemo<CustomSelectOption[]>(
    () => ITEMS_PER_PAGE_OPTIONS.map((value) => ({ value: String(value), label: String(value) })),
    [],
  );

  const filteredAssets = useMemo(() => {
    return sortAssets(
      localAssets.filter((asset) => {
        if (categoryFilter !== "ALL") {
          if (categoryFilter === FALLBACK_MEDIA_CATEGORY_SLUG) {
            if (asset.categories.length > 0 && !asset.categories.some((category) => category.slug === FALLBACK_MEDIA_CATEGORY_SLUG)) {
              return false;
            }
          } else if (!asset.categories.some((category) => category.slug === categoryFilter)) {
            return false;
          }
        }

        if (statusFilter === "USED" && asset.usage.totalUses === 0) {
          return false;
        }

        if (statusFilter === "UNUSED" && asset.usage.totalUses > 0) {
          return false;
        }

        if (typeFilter === "IMAGES" && !asset.mimeType.startsWith("image/")) {
          return false;
        }

        if (typeFilter === "VIDEOS" && !asset.mimeType.startsWith("video/")) {
          return false;
        }

        return true;
      }),
      sortOrder,
    );
  }, [categoryFilter, localAssets, sortOrder, statusFilter, typeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, statusFilter, typeFilter, sortOrder, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / itemsPerPage));
  const clampedCurrentPage = Math.min(currentPage, totalPages);
  const visibleAssets = filteredAssets.slice((clampedCurrentPage - 1) * itemsPerPage, clampedCurrentPage * itemsPerPage);
  const pageNumbers = getPageNumbers(clampedCurrentPage, totalPages);
  const openAsset = localAssets.find((asset) => asset.id === openAssetId) ?? null;
  const openAssetDisplayCategories = openAsset
    ? openAsset.categories.length > 0
      ? openAsset.categories
      : [getFallbackDisplayCategory(categorySummaries, openAsset.categories)]
    : [];
  const selectedCount = selectedAssetIds.length;
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selectedAssetIds.includes(asset.id));

  function scrollToTop() {
    if (typeof window === "undefined") {
      return;
    }

    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function changePage(nextPage: number | ((page: number) => number)) {
    setCurrentPage((currentPageValue) => {
      const resolvedPage = typeof nextPage === "function" ? nextPage(currentPageValue) : nextPage;
      const clampedPage = Math.min(Math.max(resolvedPage, 1), totalPages);
      if (clampedPage !== currentPageValue) {
        scrollToTop();
      }
      return clampedPage;
    });
  }

  function renderGalleryPagination(position: "top" | "bottom") {
    return (
      <section className={`gallery-pagination panel gallery-pagination--${position}`.trim()}>
        <div className="panel-body gallery-pagination-body">
          <div className="gallery-pagination-controls">
            <button type="button" className="gallery-page-button" onClick={() => changePage((page) => Math.max(1, page - 1))} disabled={clampedCurrentPage === 1}>
              <ArrowLeftIcon />
              <span>Previous</span>
            </button>
            <div className="gallery-page-numbers">
              {pageNumbers.map((page, index) =>
                page === "ELLIPSIS" ? (
                  <span key={`${position}-ellipsis-${index}`} className="gallery-page-ellipsis">...</span>
                ) : (
                  <button
                    key={`${position}-page-${page}`}
                    type="button"
                    className={`gallery-page-number${page === clampedCurrentPage ? " is-active" : ""}`.trim()}
                    onClick={() => changePage(page)}
                  >
                    {page}
                  </button>
                ),
              )}
            </div>
            <button type="button" className="gallery-page-button" onClick={() => changePage((page) => Math.min(totalPages, page + 1))} disabled={clampedCurrentPage === totalPages}>
              <span>Next</span>
              <ArrowRightIcon />
            </button>
          </div>

          <div className="gallery-pagination-side-actions">
            {selectedCount > 0 ? (
              <button
                type="button"
                className="ghost-link-button gallery-v2-assign-category-button"
                onClick={() => openBulkCategoryDialog("bulk-assign")}
              >
                Assign Category
              </button>
            ) : null}

            <label className="gallery-items-per-page">
              <span>Items per page</span>
              <CustomSelect
                value={String(itemsPerPage)}
                options={itemsPerPageOptions}
                onChange={(nextValue) => setItemsPerPage(Number(nextValue))}
                ariaLabel="Set gallery items per page"
                className="gallery-items-per-page-select"
                triggerClassName="gallery-items-per-page-trigger"
                menuClassName="gallery-items-per-page-menu"
              />
            </label>
          </div>
        </div>
      </section>
    );
  }

  function closeAssetModal() {
    setOpenAssetId(null);
    setDeleteError(null);
    setIsDeleteConfirming(false);
  }

  function toggleSelectedAsset(mediaAssetId: string) {
    setSelectedAssetIds((current) =>
      current.includes(mediaAssetId) ? current.filter((id) => id !== mediaAssetId) : [...current, mediaAssetId],
    );
  }

  function handleUploadCompleted(result: MediaUploadResult) {
    setUploadSummary(null);
    setLibraryError(null);
    setLocalAssets((current) => dedupeAssets([...result.uploadedAssets, ...current]));

    if (result.uploadedCount > 0 && result.skippedDuplicateCount > 0) {
      setUploadSummary(
        `Uploaded ${result.uploadedCount} item${result.uploadedCount === 1 ? "" : "s"} and reused ${result.skippedDuplicateCount} duplicate${result.skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
      );
    } else if (result.uploadedCount > 0) {
      setUploadSummary(`Uploaded ${result.uploadedCount} item${result.uploadedCount === 1 ? "" : "s"}.`);
    } else if (result.skippedDuplicateCount > 0) {
      setUploadSummary(
        `Skipped ${result.skippedDuplicateCount} duplicate${result.skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
      );
    }
  }

  async function handleDeleteAsset(mediaAssetId: string) {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${mediaAssetId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete this media asset.");
      }

      setLocalAssets((current) => current.filter((asset) => asset.id !== mediaAssetId));
      setSelectedAssetIds((current) => current.filter((id) => id !== mediaAssetId));
      closeAssetModal();
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this media asset.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSaveCategory() {
    if (!categoryEditorDraft) {
      return;
    }

    setIsSavingCategory(true);
    setCategoryEditorError(null);

    try {
      const endpoint = categoryEditorDraft.categoryId
        ? `/api/admin/media-categories/${categoryEditorDraft.categoryId}`
        : "/api/admin/media-categories";
      const method = categoryEditorDraft.categoryId ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: categoryEditorDraft.name,
          color: categoryEditorDraft.color,
          icon: categoryEditorDraft.icon,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
        category?: GalleryCategorySummary;
      } | null;

      if (!response.ok || !payload?.category) {
        throw new Error(payload?.fieldErrors?.name?.[0] || payload?.error || "Could not save category.");
      }

      setCategoryEditorDraft(null);
      router.refresh();
    } catch (error) {
      setCategoryEditorError(error instanceof Error ? error.message : "Could not save category.");
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!window.confirm("Delete this category? Media stays in the gallery and only loses the category tag.")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/media-categories/${categoryId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete category.");
      }

      router.refresh();
    } catch (error) {
      setCategoryEditorError(error instanceof Error ? error.message : "Could not delete category.");
    }
  }

  async function handleReorderCategory(categoryId: string, direction: -1 | 1) {
    const currentIndex = localCategories.findIndex((category) => category.id === categoryId);
    if (currentIndex === -1) {
      return;
    }

    if (localCategories[currentIndex]?.slug === FALLBACK_MEDIA_CATEGORY_SLUG) {
      return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= localCategories.length) {
      return;
    }

    const nextOrder = [...localCategories];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    setLocalCategories(nextOrder.map((category, index) => ({ ...category, sortOrder: (index + 1) * 10 })));

    const orderedCategoryIds = nextOrder
      .filter((category) => !isSyntheticFallbackCategory(category))
      .map((category) => category.id);

    try {
      const response = await fetch("/api/admin/media-categories/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderedCategoryIds,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not reorder categories.");
      }
      router.refresh();
    } catch (error) {
      setCategoryEditorError(error instanceof Error ? error.message : "Could not reorder categories.");
      setLocalCategories(categories);
    }
  }

  function openCategoryDialogForAsset(mediaAssetId: string, mode: CategoryActionMode) {
    const asset = localAssets.find((entry) => entry.id === mediaAssetId);
    if (!asset) {
      return;
    }

    setCategoryDialog({
      mode,
      mediaAssetIds: [mediaAssetId],
      categoryIds: asset.categories.map((category) => category.id),
    });
    setCategoryDialogSelection(asset.categories.map((category) => category.id));
    setCategoryDialogError(null);
    setActiveMenuAssetId(null);
  }

  function openBulkCategoryDialog(mode: CategoryActionMode) {
    if (selectedAssetIds.length === 0) {
      setLibraryError("Select one or more media items first.");
      return;
    }

    setCategoryDialog({
      mode,
      mediaAssetIds: selectedAssetIds,
      categoryIds: [],
    });
    setCategoryDialogSelection([]);
    setCategoryDialogError(null);
    setBulkMenuOpen(false);
    setLibraryError(null);
  }

  async function submitCategoryDialog() {
    if (!categoryDialog) {
      return;
    }

    setIsSavingCategoryDialog(true);
    setCategoryDialogError(null);

    try {
      if (categoryDialog.mediaAssetIds.length === 1) {
        const response = await fetch(`/api/admin/media-assets/${categoryDialog.mediaAssetIds[0]}/categories`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "replace",
            categoryIds: categoryDialogSelection,
          }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          mediaAsset?: MediaAssetGallerySummary;
        } | null;
        if (!response.ok || !payload?.mediaAsset) {
          throw new Error(payload?.error || "Could not update categories.");
        }

        setLocalAssets((current) =>
          current.map((asset) => (asset.id === payload.mediaAsset?.id ? payload.mediaAsset : asset)),
        );
      } else {
        const response = await fetch("/api/admin/media-assets/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaAssetIds: categoryDialog.mediaAssetIds,
            action: "assignCategories",
            categoryIds: categoryDialogSelection,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not update categories.");
        }
      }

      if (categoryDialog.mediaAssetIds.length > 1) {
        setSelectedAssetIds([]);
      }
      setCategoryDialog(null);
      setCategoryDialogSelection([]);
      router.refresh();
    } catch (error) {
      setCategoryDialogError(error instanceof Error ? error.message : "Could not update categories.");
    } finally {
      setIsSavingCategoryDialog(false);
    }
  }

  async function handleBulkDeleteSelected() {
    if (selectedAssetIds.length === 0) {
      setLibraryError("Select one or more media items first.");
      return;
    }

    if (!window.confirm(`Delete ${selectedAssetIds.length} selected media item${selectedAssetIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    try {
      const response = await fetch("/api/admin/media-assets/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaAssetIds: selectedAssetIds,
          action: "deleteSelected",
          categoryIds: [],
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        deletedCount?: number;
        blockedCount?: number;
        forbiddenCount?: number;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete selected media.");
      }

      setUploadSummary(
        `Deleted ${payload?.deletedCount ?? 0} selected item${payload?.deletedCount === 1 ? "" : "s"}${payload?.blockedCount ? `, skipped ${payload.blockedCount} blocked` : ""}${payload?.forbiddenCount ? `, and skipped ${payload.forbiddenCount} restricted` : ""}.`,
      );
      setLibraryError(null);
      setSelectedAssetIds([]);
      setBulkMenuOpen(false);
      router.refresh();
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not delete selected media.");
    }
  }

  async function handleRenameAssetSubmit() {
    if (!renameAssetDraft) {
      return;
    }

    setIsRenamingAsset(true);
    setRenameAssetError(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${renameAssetDraft.mediaAssetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originalFilename: renameAssetDraft.originalFilename,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        originalFilename?: string;
      } | null;

      if (!response.ok || !payload?.originalFilename) {
        throw new Error(payload?.error || "Could not rename media.");
      }

      setLocalAssets((current) =>
        current.map((asset) =>
          asset.id === renameAssetDraft.mediaAssetId
            ? {
                ...asset,
                originalFilename: payload.originalFilename ?? asset.originalFilename,
              }
            : asset,
        ),
      );
      setRenameAssetDraft(null);
      router.refresh();
    } catch (error) {
      setRenameAssetError(error instanceof Error ? error.message : "Could not rename media.");
    } finally {
      setIsRenamingAsset(false);
    }
  }

  const openAssetPreviewVariant = openAsset ? getGalleryPreviewVariant(openAsset.variants) ?? getOriginalVariant(openAsset.variants) : null;
  const openAssetPreviewUrl = openAssetPreviewVariant ? getMediaVariantUrl(openAssetPreviewVariant.id) : null;
  const openAssetCurrentUrl = openAsset ? getCurrentMediaAssetUrl(openAsset.id) : openAssetPreviewUrl;

  return (
    <>
      <section ref={topRef} className="gallery-v2-shell">
        <header className="gallery-v2-header">
            <div className="gallery-v2-header-copy">
              <div className="gallery-v2-title-pill">
                <GalleryIcon />
              </div>
              <div>
                <h1>Gallery</h1>
              </div>
            </div>

          <div className="gallery-v2-header-actions">
            <div className={`gallery-v2-bulk-menu${bulkMenuOpen ? " is-open" : ""}`.trim()}>
              <button
                type="button"
                className="secondary-button gallery-v2-bulk-button"
                onClick={() => setBulkMenuOpen((current) => !current)}
              >
                <LayersIcon />
                <span>Bulk Actions</span>
                <ChevronDownIcon />
              </button>
              {bulkMenuOpen ? (
                <div className="gallery-v2-popover">
                  {BULK_ACTION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="gallery-v2-menu-item"
                      onClick={() => {
                        if (option.value === "deleteSelected") {
                          void handleBulkDeleteSelected();
                          return;
                        }

                        openBulkCategoryDialog("bulk-assign");
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button type="button" className="gallery-upload-button" onClick={() => setIsUploadModalOpen(true)}>
              <UploadIcon />
              <span>Upload Media</span>
            </button>
          </div>
        </header>

        <div className="gallery-v2-layout">
          <div className="gallery-v2-main">
            <section className="gallery-v2-toolbar panel">
              <div className="panel-body gallery-v2-toolbar-grid">
                <CustomSelect
                  value={categoryFilter}
                  options={categoryFilterOptions}
                  onChange={setCategoryFilter}
                  ariaLabel="Filter gallery by category"
                  className="gallery-filter-select-wrap"
                  triggerClassName="gallery-filter-select-trigger"
                  menuClassName="gallery-filter-select-menu"
                />

                <CustomSelect
                  value={statusFilter}
                  options={statusFilterOptions}
                  onChange={(nextValue) => setStatusFilter(nextValue as StatusFilterValue)}
                  ariaLabel="Filter gallery by usage status"
                  className="gallery-filter-select-wrap"
                  triggerClassName="gallery-filter-select-trigger"
                  menuClassName="gallery-filter-select-menu"
                />

                <CustomSelect
                  value={typeFilter}
                  options={typeFilterOptions}
                  onChange={(nextValue) => setTypeFilter(nextValue as TypeFilterValue)}
                  ariaLabel="Filter gallery by media type"
                  className="gallery-filter-select-wrap"
                  triggerClassName="gallery-filter-select-trigger"
                  menuClassName="gallery-filter-select-menu"
                />

                <CustomSelect
                  value={sortOrder}
                  options={sortOptions}
                  onChange={(nextValue) => setSortOrder(nextValue as SortOrderValue)}
                  ariaLabel="Sort gallery media"
                  className="gallery-filter-select-wrap"
                  triggerClassName="gallery-filter-select-trigger"
                  menuClassName="gallery-filter-select-menu"
                />
              </div>
            </section>

            {selectedCount > 0 ? (
              <div className="gallery-v2-summary-row">
                <div className="gallery-v2-selection-summary">
                  <button
                    type="button"
                    className="ghost-link-button gallery-v2-assign-category-button"
                    onClick={() => openBulkCategoryDialog("bulk-assign")}
                  >
                    Assign Category
                  </button>
                  <button
                    type="button"
                    className="ghost-link-button gallery-v2-clear-selection-button"
                    onClick={() => setSelectedAssetIds([])}
                  >
                    Clear Selections
                  </button>
                  <strong>{selectedCount} selected</strong>
                </div>
              </div>
            ) : null}

            {uploadSummary ? <p className="success-text">{uploadSummary}</p> : null}
            {libraryError ? <p className="error-text">{libraryError}</p> : null}

            {visibleAssets.length > 0 ? renderGalleryPagination("top") : null}

            {visibleAssets.length === 0 ? (
              <section className="panel">
                <div className="panel-body">
                  <p className="muted">No media items match the current filters.</p>
                </div>
              </section>
            ) : (
              <section className="gallery-v2-grid">
                {visibleAssets.map((asset) => {
                  const previewVariant = getGalleryThumbnailVariant(asset.variants) ?? getGalleryPreviewVariant(asset.variants) ?? getOriginalVariant(asset.variants);
                  const displayCategory = getFallbackDisplayCategory(categorySummaries, asset.categories);
                  const isSelected = selectedAssetIds.includes(asset.id);

                  return (
                    <article key={asset.id} className={`gallery-v2-card${isSelected ? " is-selected" : ""}`.trim()}>
                      <div className="gallery-v2-card-thumb-wrap">
                        <label className="gallery-v2-card-check" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleSelectedAsset(asset.id)}
                          />
                          <span onClick={(event) => event.stopPropagation()} />
                        </label>

                        <button
                          type="button"
                          className="gallery-v2-card-info-button"
                          onClick={() => {
                            setOpenAssetId(asset.id);
                            setActiveMenuAssetId(null);
                          }}
                          aria-label={`Open details for ${asset.originalFilename}`}
                        >
                          <QuestionIcon />
                        </button>

                        <button
                          type="button"
                          className="gallery-v2-card-menu-button"
                          onClick={() => setActiveMenuAssetId((current) => (current === asset.id ? null : asset.id))}
                          aria-label={`Open media menu for ${asset.originalFilename}`}
                        >
                          <MoreIcon />
                        </button>

                        {activeMenuAssetId === asset.id ? (
                          <div className="gallery-v2-card-menu">
                            <button type="button" className="gallery-v2-menu-item" onClick={() => { setOpenAssetId(asset.id); setActiveMenuAssetId(null); }}>Open Details</button>
                            <button type="button" className="gallery-v2-menu-item" onClick={() => { router.push(`/dashboard/media/${encodeURIComponent(asset.id)}/edit`); setActiveMenuAssetId(null); }}>Edit</button>
                            <button type="button" className="gallery-v2-menu-item" onClick={() => openCategoryDialogForAsset(asset.id, "single-replace")}>Assign Category</button>
                            <button type="button" className="gallery-v2-menu-item" onClick={() => { setRenameAssetDraft({ mediaAssetId: asset.id, originalFilename: asset.originalFilename }); setActiveMenuAssetId(null); }}>Rename</button>
                            <button type="button" className="gallery-v2-menu-item is-danger" onClick={() => { setOpenAssetId(asset.id); setActiveMenuAssetId(null); }}>Delete</button>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className="gallery-v2-card-thumb-button"
                          onClick={() => {
                            toggleSelectedAsset(asset.id);
                            setActiveMenuAssetId(null);
                          }}
                          aria-pressed={isSelected}
                          aria-label={`${isSelected ? "Deselect" : "Select"} ${asset.originalFilename}`}
                        >
                          {previewVariant ? (
                            <img
                              src={getMediaVariantUrl(previewVariant.id)}
                              alt={asset.originalFilename}
                              className="gallery-v2-card-thumb"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="gallery-v2-card-thumb-fallback">No preview</div>
                          )}
                        </button>

                        <MediaPostedBadges postedPlatforms={asset.postedPlatforms} />
                      </div>

                      <div className="gallery-v2-card-body">
                        <strong className="gallery-v2-card-name" title={asset.originalFilename}>{asset.originalFilename}</strong>
                        <span className="gallery-v2-category-pill" style={{ "--category-color": displayCategory.color } as CSSProperties}>
                          <MediaCategoryIcon icon={displayCategory.icon} className="gallery-v2-category-icon" />
                          <span>{displayCategory.name}</span>
                        </span>
                        <div className="gallery-v2-card-meta">
                          <span>{getTypeLabel(asset)}</span>
                          <span>{formatBytes(asset.sizeBytes)}</span>
                          <span>{formatUploadDate(asset.createdAt, timezone)}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}

            {visibleAssets.length > 0 ? renderGalleryPagination("bottom") : null}
          </div>

          <aside className="gallery-v2-sidebar">
            <section className="panel gallery-v2-sidebar-card">
              <div className="panel-body">
                <div className="gallery-v2-sidebar-card-head">
                  <strong>Categories</strong>
                  {canManageCategories ? (
                    <div className="gallery-v2-sidebar-card-actions">
                      <button type="button" className="ghost-link-button" onClick={() => setCategoryEditorDraft(buildEmptyCategoryDraft())}>
                        +
                      </button>
                      <button type="button" className="ghost-link-button" onClick={() => setIsCategoryManagerOpen(true)}>
                        Manage
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="gallery-v2-category-list">
                  {categorySummaries.map((category) => (
                    <button key={category.id} type="button" className={`gallery-v2-category-row${categoryFilter === category.slug ? " is-active" : ""}`.trim()} onClick={() => setCategoryFilter(category.slug)}>
                      <span className="gallery-v2-category-row-copy">
                        <span className="gallery-v2-category-swatch" style={{ backgroundColor: category.color }}>
                          <MediaCategoryIcon icon={category.icon} className="gallery-v2-category-swatch-icon" />
                        </span>
                        <span>{category.name}</span>
                      </span>
                      <span>{category.assetCount}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel gallery-v2-sidebar-card">
              <div className="panel-body">
                <div className="gallery-v2-sidebar-card-head">
                  <strong>Storage Usage</strong>
                </div>
                <div className="gallery-v2-storage-card">
                  <div className="gallery-v2-storage-bar">
                    <span style={{ width: `${galleryStoragePercent}%` }} />
                  </div>
                  <div className="gallery-v2-storage-summary">
                    <strong>
                      {formatBytes(trackedStorageBytes)} of {galleryStorageLimitGb.toLocaleString()} GB used
                    </strong>
                    <div className="gallery-v2-storage-meta">
                      <span>{galleryStoragePercent.toFixed(1)}% used</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <MediaUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploaded={handleUploadCompleted}
      />

      {openAsset && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${openAsset.originalFilename} details`}>
              <button type="button" className="modal-dismiss-surface" aria-label="Close media details" onClick={closeAssetModal} />
              <div className="modal-card media-modal-card">
                <div className="preview-header">
                  <div>
                    <strong>{openAsset.originalFilename}</strong>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={closeAssetModal}>Close</button>
                </div>

                <div className="media-modal-layout">
                  <div className="media-modal-preview">
                    {openAssetPreviewUrl ? (
                      <a href={openAssetCurrentUrl ?? openAssetPreviewUrl} target="_blank" rel="noopener noreferrer" className="media-modal-image-link" title="Open image in a new tab">
                        <span aria-hidden="true" className="media-modal-image" style={{ backgroundImage: `url(${openAssetPreviewUrl})` }} />
                      </a>
                    ) : (
                      <div className="gallery-asset-thumb-fallback">No preview available</div>
                    )}
                  </div>

                  <div className="media-modal-details">
                    <div className="media-variant-info-card">
                      <strong>Filename</strong>
                      <p>{openAsset.originalFilename}</p>
                    </div>
                    <div className="media-variant-info-card">
                      <strong>Categories</strong>
                      <div className="media-modal-category-list">
                        {openAssetDisplayCategories.map((category) => (
                          <span
                            key={`${openAsset.id}-${category.id}-${category.slug}`}
                            className="media-modal-category-pill"
                            style={{ "--category-color": category.color } as CSSProperties}
                          >
                            <MediaCategoryIcon icon={category.icon} className="gallery-v2-category-icon" />
                            <span>{category.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="media-variant-info-card">
                      <strong>Uploaded</strong>
                      <p>{formatUploadDate(openAsset.createdAt, timezone)}</p>
                    </div>
                    <div className="media-variant-info-card">
                      <strong>Usage breakdown</strong>
                      <p>Facebook x{openAsset.usage.facebookUses} | Instagram x{openAsset.usage.instagramUses} | Google x{openAsset.usage.googleUses}</p>
                    </div>

                    {deleteError ? <p className="inline-error">{deleteError}</p> : null}

                    <div className="media-modal-actions is-stacked">
                      <button type="button" className="secondary-button" onClick={() => { closeAssetModal(); router.push(`/dashboard/posts/new?mediaId=${encodeURIComponent(openAsset.id)}`); }}>
                        Create Post
                      </button>
                      <button type="button" className="secondary-button" onClick={() => { closeAssetModal(); router.push(`/dashboard/media/${encodeURIComponent(openAsset.id)}/edit`); }}>
                        Edit
                      </button>
                      <button type="button" className="secondary-button" onClick={() => openCategoryDialogForAsset(openAsset.id, "single-replace")}>
                        Assign Category
                      </button>
                      <button type="button" className="secondary-button" onClick={() => setRenameAssetDraft({ mediaAssetId: openAsset.id, originalFilename: openAsset.originalFilename })}>
                        Rename
                      </button>
                      <button
                        type="button"
                        className={`media-delete-button${isDeleteConfirming ? " is-confirming" : ""}`.trim()}
                        onClick={() => {
                          if (!isDeleteConfirming) {
                            setIsDeleteConfirming(true);
                            return;
                          }
                          void handleDeleteAsset(openAsset.id);
                        }}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : isDeleteConfirming ? "Confirm Delete" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isCategoryManagerOpen && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Manage categories">
              <button type="button" className="modal-dismiss-surface" aria-label="Close category manager" onClick={() => setIsCategoryManagerOpen(false)} />
              <div className="modal-card gallery-manage-modal">
                <div className="preview-header">
                  <div>
                    <strong>Manage Categories</strong>
                    <p className="muted">Create, rename, recolor, and reorder categories without changing the stored media files.</p>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={() => setIsCategoryManagerOpen(false)}>Close</button>
                </div>

                {categoryEditorError ? <p className="error-text">{categoryEditorError}</p> : null}

                <div className="gallery-manage-category-list">
                  {categorySummaries.map((category, index) => (
                    <article key={category.id} className="gallery-manage-category-row">
                      <span className="gallery-v2-category-row-copy">
                        <span className="gallery-v2-category-swatch" style={{ backgroundColor: category.color }}>
                          <MediaCategoryIcon icon={category.icon} className="gallery-v2-category-swatch-icon" />
                        </span>
                        <span className="gallery-manage-category-copy">
                          <strong>{category.name}</strong>
                          <small>{category.assetCount} item{category.assetCount === 1 ? "" : "s"}</small>
                        </span>
                      </span>
                      <div className="gallery-manage-category-actions">
                        <button
                          type="button"
                          className="ghost-link-button gallery-manage-reorder-button"
                          onClick={() => handleReorderCategory(category.id, -1)}
                          disabled={index === 0 || category.slug === FALLBACK_MEDIA_CATEGORY_SLUG}
                          aria-label={`Move ${category.name} up`}
                        >
                          <ArrowUpIcon />
                        </button>
                        <button
                          type="button"
                          className="ghost-link-button gallery-manage-reorder-button"
                          onClick={() => handleReorderCategory(category.id, 1)}
                          disabled={index === categorySummaries.length - 1 || category.slug === FALLBACK_MEDIA_CATEGORY_SLUG}
                          aria-label={`Move ${category.name} down`}
                        >
                          <ArrowDownIcon />
                        </button>
                        {category.slug !== FALLBACK_MEDIA_CATEGORY_SLUG ? (
                          <button type="button" className="ghost-link-button" onClick={() => setCategoryEditorDraft({ categoryId: category.id, name: category.name, color: category.color, icon: category.icon })}>Edit</button>
                        ) : null}
                        {category.slug !== FALLBACK_MEDIA_CATEGORY_SLUG ? (
                          <button type="button" className="ghost-link-button is-danger" onClick={() => void handleDeleteCategory(category.id)}>Delete</button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {categoryEditorDraft && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Save category">
              <button type="button" className="modal-dismiss-surface" aria-label="Close category editor" onClick={() => setCategoryEditorDraft(null)} />
              <div className="modal-card gallery-category-editor-modal">
                <div className="preview-header">
                  <div>
                    <strong>{categoryEditorDraft.categoryId ? "Edit Category" : "Add Category"}</strong>
                    <p className="muted">Choose a name, color, and icon for this gallery category.</p>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={() => setCategoryEditorDraft(null)}>Close</button>
                </div>

                <div className="field">
                  <label>Category name</label>
                  <input value={categoryEditorDraft.name} onChange={(event) => setCategoryEditorDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Bathrooms" />
                </div>

                <div className="field">
                  <label>Color</label>
                  <div className="gallery-v2-color-grid">
                    {MEDIA_CATEGORY_COLOR_OPTIONS.map((colorOption) => (
                      <button
                        key={colorOption}
                        type="button"
                        className={`gallery-v2-color-choice${categoryEditorDraft.color === colorOption ? " is-active" : ""}`.trim()}
                        onClick={() => setCategoryEditorDraft((current) => current ? { ...current, color: colorOption } : current)}
                        aria-label={`Choose color ${colorOption}`}
                        style={{ backgroundColor: colorOption }}
                      />
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Icon</label>
                  <div className="gallery-v2-icon-grid">
                    {MEDIA_CATEGORY_ICON_OPTIONS.map((option) => (
                      <button key={option.value} type="button" className={`gallery-v2-icon-choice${categoryEditorDraft.icon === option.value ? " is-active" : ""}`.trim()} onClick={() => setCategoryEditorDraft((current) => current ? { ...current, icon: option.value } : current)}>
                        <MediaCategoryIcon icon={option.value} className="gallery-v2-icon-choice-icon" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {categoryEditorError ? <p className="error-text">{categoryEditorError}</p> : null}

                <div className="gallery-upload-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setCategoryEditorDraft(null)} disabled={isSavingCategory}>Cancel</button>
                  <button type="button" className="gallery-upload-button" onClick={() => void handleSaveCategory()} disabled={isSavingCategory}>
                    <span>{isSavingCategory ? "Saving..." : "Save Category"}</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {categoryDialog && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Assign categories">
              <button type="button" className="modal-dismiss-surface" aria-label="Close category assignment" onClick={() => setCategoryDialog(null)} />
              <div className="modal-card gallery-category-editor-modal">
                <div className="preview-header">
                  <div>
                    <strong>{categoryDialog.mediaAssetIds.length === 1 ? "Assign Category" : "Bulk Assign Category"}</strong>
                    <p className="muted">Choose one category to apply to the selected media.</p>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={() => setCategoryDialog(null)}>Close</button>
                </div>

                <div className="gallery-v2-chip-grid">
                  {categorySummaries.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`gallery-v2-category-chip${categoryDialogSelection.includes(category.id) ? " is-active" : ""}`.trim()}
                      onClick={() =>
                        setCategoryDialogSelection((current) =>
                          current.includes(category.id) ? [] : [category.id],
                        )
                      }
                    >
                      <MediaCategoryIcon icon={category.icon} className="gallery-v2-category-icon" />
                      <span>{category.name}</span>
                    </button>
                  ))}
                </div>

                {categoryDialogError ? <p className="error-text">{categoryDialogError}</p> : null}

                <div className="gallery-upload-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setCategoryDialog(null)} disabled={isSavingCategoryDialog}>Cancel</button>
                  <button type="button" className="gallery-upload-button" onClick={() => void submitCategoryDialog()} disabled={isSavingCategoryDialog}>
                    <span>{isSavingCategoryDialog ? "Saving..." : "Save Category"}</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {renameAssetDraft && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Rename media">
              <button type="button" className="modal-dismiss-surface" aria-label="Close rename dialog" onClick={() => setRenameAssetDraft(null)} />
              <div className="modal-card gallery-category-editor-modal">
                <div className="preview-header">
                  <div>
                    <strong>Rename Media</strong>
                    <p className="muted">Update the display filename without changing the stored file path.</p>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={() => setRenameAssetDraft(null)}>Close</button>
                </div>

                <div className="field">
                  <label>Filename</label>
                  <input value={renameAssetDraft.originalFilename} onChange={(event) => setRenameAssetDraft((current) => current ? { ...current, originalFilename: event.target.value } : current)} />
                </div>
                {renameAssetError ? <p className="error-text">{renameAssetError}</p> : null}

                <div className="gallery-upload-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setRenameAssetDraft(null)} disabled={isRenamingAsset}>Cancel</button>
                  <button type="button" className="gallery-upload-button" onClick={() => void handleRenameAssetSubmit()} disabled={isRenamingAsset}>
                    <span>{isRenamingAsset ? "Saving..." : "Save Name"}</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
