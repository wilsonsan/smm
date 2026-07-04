"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type SVGProps } from "react";
import { createPortal } from "react-dom";
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
  MEDIA_CATEGORY_COLOR_OPTIONS,
  MEDIA_CATEGORY_ICON_OPTIONS,
} from "@/lib/media-categories";

type MediaLibraryBrowserProps = {
  assets: MediaAssetGallerySummary[];
  categories: GalleryCategorySummary[];
  timezone: string;
  canManageCategories: boolean;
  trackedStorageBytes: number;
};

type StatusFilterValue = "ALL" | "USED" | "UNUSED";
type TypeFilterValue = "ALL_TYPES" | "IMAGES" | "VIDEOS";
type SortOrderValue = "NEWEST" | "OLDEST" | "MOST_USED" | "LEAST_USED";
type ViewModeValue = "GRID" | "LIST";
type BulkActionValue = "assignCategories" | "replaceCategories" | "clearCategories" | "deleteSelected";
type CategoryActionMode = "single-assign" | "single-replace" | "bulk-assign" | "bulk-replace";

type QueuedUpload = {
  id: string;
  file: File;
  previewUrl: string;
};

type UploadApiPayload = {
  error?: string;
  status?: "uploaded" | "duplicate";
  mediaAsset?: MediaAssetGallerySummary;
};

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
  { value: "assignCategories", label: "Assign Categories" },
  { value: "replaceCategories", label: "Replace Categories" },
  { value: "clearCategories", label: "Clear Categories" },
  { value: "deleteSelected", label: "Delete Selected" },
];

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48];

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 16V5.5" />
      <path d="m8.5 9 3.5-3.5L15.5 9" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4.5" y="4.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="14" y="4.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="4.5" y="14" width="5.5" height="5.5" rx="1.2" />
      <rect x="14" y="14" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 7h12" />
      <path d="M8 12h12" />
      <path d="M8 17h12" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
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

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4.5 7.5h15" />
      <path d="M9 7.5V5.4h6v2.1" />
      <path d="M7.5 7.5 8.2 19h7.6l.7-11.5" />
      <path d="M10 11v5.5" />
      <path d="M14 11v5.5" />
    </svg>
  );
}

function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 20h4.3l9.9-9.9a2.1 2.1 0 0 0 0-3l-1.3-1.3a2.1 2.1 0 0 0-3 0L4 15.7V20Z" />
      <path d="m12.8 6.8 4.4 4.4" />
    </svg>
  );
}

function TagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 13 11 22l-8-8V4h10l7 7Z" />
      <circle cx="7.5" cy="8.5" r="1.2" />
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

export function MediaLibraryBrowser({
  assets,
  categories,
  timezone,
  canManageCategories,
  trackedStorageBytes,
}: MediaLibraryBrowserProps) {
  const router = useRouter();
  const [localAssets, setLocalAssets] = useState(() => dedupeAssets(assets));
  const [localCategories, setLocalCategories] = useState<GalleryCategorySummary[]>(categories);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("ALL_TYPES");
  const [sortOrder, setSortOrder] = useState<SortOrderValue>("NEWEST");
  const [viewMode, setViewMode] = useState<ViewModeValue>("GRID");
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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
  const [isRunningQuickDelete, setIsRunningQuickDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setLocalAssets(dedupeAssets(assets));
  }, [assets]);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

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

  useEffect(() => {
    return () => {
      queuedUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [queuedUploads]);

  const categorySummaries = useMemo(
    () => buildGalleryCategorySummaries({ categories: localCategories, assets: localAssets }),
    [localAssets, localCategories],
  );

  const filteredAssets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortAssets(
      localAssets.filter((asset) => {
        if (normalizedSearch && !asset.originalFilename.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

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
  }, [categoryFilter, localAssets, searchTerm, sortOrder, statusFilter, typeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter, typeFilter, sortOrder, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / itemsPerPage));
  const clampedCurrentPage = Math.min(currentPage, totalPages);
  const visibleAssets = filteredAssets.slice((clampedCurrentPage - 1) * itemsPerPage, clampedCurrentPage * itemsPerPage);
  const pageNumbers = getPageNumbers(clampedCurrentPage, totalPages);
  const openAsset = localAssets.find((asset) => asset.id === openAssetId) ?? null;
  const selectedCount = selectedAssetIds.length;
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selectedAssetIds.includes(asset.id));
  function closeAssetModal() {
    setOpenAssetId(null);
    setDeleteError(null);
    setIsDeleteConfirming(false);
  }

  function resetUploadState() {
    queuedUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setQueuedUploads([]);
    setUploadError(null);
    setUploadProgressLabel(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  }

  function appendQueuedFiles(files: Iterable<File>) {
    const newEntries: QueuedUpload[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        continue;
      }

      const duplicate = queuedUploads.some(
        (item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified,
      );
      if (duplicate) {
        continue;
      }

      newEntries.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (newEntries.length > 0) {
      setQueuedUploads((current) => [...current, ...newEntries]);
      setUploadError(null);
    }
  }

  function removeQueuedFile(uploadId: string) {
    setQueuedUploads((current) => {
      const removed = current.find((item) => item.id === uploadId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return current.filter((item) => item.id !== uploadId);
    });
  }

  async function handleUploadConfirm() {
    if (queuedUploads.length === 0) {
      setUploadError("Select one or more files to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSummary(null);

    try {
      let uploadedCount = 0;
      let skippedDuplicateCount = 0;
      const uploadedAssets: MediaAssetGallerySummary[] = [];

      for (let index = 0; index < queuedUploads.length; index += 1) {
        const queuedUpload = queuedUploads[index];
        setUploadProgressLabel(`Uploading ${index + 1} of ${queuedUploads.length}...`);

        const response = await fetch("/api/admin/uploads", {
          method: "POST",
          headers: {
            "Content-Type": queuedUpload.file.type || "application/octet-stream",
            "X-Upload-Filename": encodeURIComponent(queuedUpload.file.name),
            "X-Upload-Mime-Type": queuedUpload.file.type || "application/octet-stream",
          },
          body: queuedUpload.file,
        });

        const payload = (await response
          .json()
          .catch(async () => ({ error: await response.text().catch(() => "Upload failed.") }))) as UploadApiPayload | null;

        if (!response.ok || !payload?.mediaAsset) {
          throw new Error(payload?.error || `Upload failed for ${queuedUpload.file.name}.`);
        }

        uploadedAssets.push(payload.mediaAsset);
        if (payload.status === "duplicate") {
          skippedDuplicateCount += 1;
        } else {
          uploadedCount += 1;
        }
      }

      setLocalAssets((current) => dedupeAssets([...uploadedAssets, ...current]));
      setIsUploadModalOpen(false);
      resetUploadState();

      if (uploadedCount > 0 && skippedDuplicateCount > 0) {
        setUploadSummary(
          `Uploaded ${uploadedCount} item${uploadedCount === 1 ? "" : "s"} and reused ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
        );
      } else if (uploadedCount > 0) {
        setUploadSummary(`Uploaded ${uploadedCount} item${uploadedCount === 1 ? "" : "s"}.`);
      } else if (skippedDuplicateCount > 0) {
        setUploadSummary(
          `Skipped ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
        );
      }

      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
      setIsUploading(false);
      setUploadProgressLabel(null);
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

  async function handleDeleteUnused() {
    if (!window.confirm("Delete all media not currently used in any posts?")) {
      return;
    }

    setIsRunningQuickDelete(true);
    setUploadError(null);
    setUploadSummary(null);

    try {
      const response = await fetch("/api/admin/media-assets/delete-unused", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        deletedCount?: number;
        blockedCount?: number;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete unused media.");
      }

      setUploadSummary(
        `Deleted ${payload?.deletedCount ?? 0} unused item${payload?.deletedCount === 1 ? "" : "s"}${payload?.blockedCount ? ` and skipped ${payload.blockedCount} blocked item${payload.blockedCount === 1 ? "" : "s"}` : ""}.`,
      );
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not delete unused media.");
    } finally {
      setIsRunningQuickDelete(false);
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

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= localCategories.length) {
      return;
    }

    const nextOrder = [...localCategories];
    const [moved] = nextOrder.splice(currentIndex, 1);
    nextOrder.splice(nextIndex, 0, moved);
    setLocalCategories(nextOrder.map((category, index) => ({ ...category, sortOrder: (index + 1) * 10 })));

    try {
      const response = await fetch("/api/admin/media-categories/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderedCategoryIds: nextOrder.map((category) => category.id),
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
      setUploadError("Select one or more media items first.");
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
            mode: categoryDialog.mode === "single-assign" ? "assign" : "replace",
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
        const action =
          categoryDialog.mode === "bulk-assign"
            ? "assignCategories"
            : categoryDialog.mode === "bulk-replace"
              ? "replaceCategories"
              : "clearCategories";
        const response = await fetch("/api/admin/media-assets/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mediaAssetIds: categoryDialog.mediaAssetIds,
            action,
            categoryIds: categoryDialogSelection,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not update categories.");
        }
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
      setUploadError("Select one or more media items first.");
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
      setSelectedAssetIds([]);
      setBulkMenuOpen(false);
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not delete selected media.");
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
  const openAssetOriginalVariant = openAsset ? getOriginalVariant(openAsset.variants) : null;
  const openAssetPreviewUrl = openAssetPreviewVariant ? getMediaVariantUrl(openAssetPreviewVariant.id) : null;
  const openAssetOriginalUrl = openAssetOriginalVariant ? getMediaVariantUrl(openAssetOriginalVariant.id) : openAssetPreviewUrl;

  return (
    <>
      <section className="gallery-v2-shell">
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

                        if (option.value === "clearCategories") {
                          setCategoryDialog({
                            mode: "bulk-replace",
                            mediaAssetIds: selectedAssetIds,
                            categoryIds: [],
                          });
                          setCategoryDialogSelection([]);
                          setBulkMenuOpen(false);
                          return;
                        }

                        openBulkCategoryDialog(option.value === "assignCategories" ? "bulk-assign" : "bulk-replace");
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
                <label className="gallery-search-field">
                  <SearchIcon />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search media"
                  />
                </label>

                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="gallery-filter-select">
                  <option value="ALL">All Categories</option>
                  {categorySummaries.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)} className="gallery-filter-select">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilterValue)} className="gallery-filter-select">
                  {TYPE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrderValue)} className="gallery-filter-select">
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <div className="gallery-view-toggle" role="group" aria-label="Gallery view mode">
                  <button type="button" className={`gallery-view-toggle-button${viewMode === "GRID" ? " is-active" : ""}`.trim()} onClick={() => setViewMode("GRID")} aria-pressed={viewMode === "GRID"}>
                    <GridIcon />
                  </button>
                  <button type="button" className={`gallery-view-toggle-button${viewMode === "LIST" ? " is-active" : ""}`.trim()} onClick={() => setViewMode("LIST")} aria-pressed={viewMode === "LIST"}>
                    <ListIcon />
                  </button>
                </div>
              </div>
            </section>

            <div className="gallery-v2-summary-row">
              <span>{filteredAssets.length} item{filteredAssets.length === 1 ? "" : "s"}</span>
              {selectedCount > 0 ? <strong>{selectedCount} selected</strong> : null}
            </div>

            {uploadSummary ? <p className="success-text">{uploadSummary}</p> : null}
            {uploadError ? <p className="error-text">{uploadError}</p> : null}

            {visibleAssets.length === 0 ? (
              <section className="panel">
                <div className="panel-body">
                  <p className="muted">No media items match the current filters.</p>
                </div>
              </section>
            ) : viewMode === "GRID" ? (
              <section className="gallery-v2-grid">
                {visibleAssets.map((asset) => {
                  const previewVariant = getGalleryThumbnailVariant(asset.variants) ?? getGalleryPreviewVariant(asset.variants) ?? getOriginalVariant(asset.variants);
                  const displayCategory = getFallbackDisplayCategory(categorySummaries, asset.categories);
                  const isSelected = selectedAssetIds.includes(asset.id);

                  return (
                    <article key={asset.id} className={`gallery-v2-card${isSelected ? " is-selected" : ""}`.trim()}>
                      <div className="gallery-v2-card-thumb-wrap">
                        <label className="gallery-v2-card-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              setSelectedAssetIds((current) =>
                                current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id],
                              )
                            }
                          />
                          <span />
                        </label>

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
                            <button type="button" className="gallery-v2-menu-item" onClick={() => openCategoryDialogForAsset(asset.id, "single-replace")}>Assign Categories</button>
                            <button type="button" className="gallery-v2-menu-item" onClick={() => { setRenameAssetDraft({ mediaAssetId: asset.id, originalFilename: asset.originalFilename }); setActiveMenuAssetId(null); }}>Rename</button>
                            <button type="button" className="gallery-v2-menu-item is-danger" onClick={() => { setOpenAssetId(asset.id); setActiveMenuAssetId(null); }}>Delete</button>
                          </div>
                        ) : null}

                        <button type="button" className="gallery-v2-card-thumb-button" onClick={() => setOpenAssetId(asset.id)}>
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
            ) : (
              <section className="gallery-v2-list panel">
                <div className="panel-body">
                  {visibleAssets.map((asset) => {
                    const previewVariant = getGalleryThumbnailVariant(asset.variants) ?? getGalleryPreviewVariant(asset.variants) ?? getOriginalVariant(asset.variants);
                    const displayCategory = getFallbackDisplayCategory(categorySummaries, asset.categories);
                    const isSelected = selectedAssetIds.includes(asset.id);

                    return (
                      <article key={asset.id} className={`gallery-v2-list-row${isSelected ? " is-selected" : ""}`.trim()}>
                        <label className="gallery-v2-card-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              setSelectedAssetIds((current) =>
                                current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id],
                              )
                            }
                          />
                          <span />
                        </label>
                        <button type="button" className="gallery-v2-list-thumb-button" onClick={() => setOpenAssetId(asset.id)}>
                          {previewVariant ? (
                            <img
                              src={getMediaVariantUrl(previewVariant.id)}
                              alt={asset.originalFilename}
                              className="gallery-v2-list-thumb"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="gallery-v2-card-thumb-fallback">No preview</div>
                          )}
                        </button>
                        <div className="gallery-v2-list-copy">
                          <strong>{asset.originalFilename}</strong>
                          <div className="gallery-v2-card-meta">
                            <span>{getTypeLabel(asset)}</span>
                            <span>{formatBytes(asset.sizeBytes)}</span>
                            <span>{formatUploadDate(asset.createdAt, timezone)}</span>
                          </div>
                        </div>
                        <span className="gallery-v2-category-pill" style={{ "--category-color": displayCategory.color } as CSSProperties}>
                          <MediaCategoryIcon icon={displayCategory.icon} className="gallery-v2-category-icon" />
                          <span>{displayCategory.name}</span>
                        </span>
                        <button type="button" className="gallery-v2-card-menu-button" onClick={() => setOpenAssetId(asset.id)} aria-label={`Open details for ${asset.originalFilename}`}>
                          <MoreIcon />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="gallery-pagination panel">
              <div className="panel-body gallery-pagination-body">
                <div className="gallery-pagination-controls">
                  <button type="button" className="gallery-page-button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={clampedCurrentPage === 1}>
                    <ArrowLeftIcon />
                    <span>Previous</span>
                  </button>
                  <div className="gallery-page-numbers">
                    {pageNumbers.map((page, index) =>
                      page === "ELLIPSIS" ? (
                        <span key={`ellipsis-${index}`} className="gallery-page-ellipsis">...</span>
                      ) : (
                        <button key={page} type="button" className={`gallery-page-number${page === clampedCurrentPage ? " is-active" : ""}`.trim()} onClick={() => setCurrentPage(page)}>
                          {page}
                        </button>
                      ),
                    )}
                  </div>
                  <button type="button" className="gallery-page-button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={clampedCurrentPage === totalPages}>
                    <span>Next</span>
                    <ArrowRightIcon />
                  </button>
                </div>

                <label className="gallery-items-per-page">
                  <span>Items per page</span>
                  <select value={String(itemsPerPage)} onChange={(event) => setItemsPerPage(Number(event.target.value))}>
                    {ITEMS_PER_PAGE_OPTIONS.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </div>

          <aside className="gallery-v2-sidebar">
            <section className="panel gallery-v2-sidebar-card">
              <div className="panel-body">
                <div className="gallery-v2-sidebar-card-head">
                  <strong>Categories</strong>
                  {canManageCategories ? (
                    <button type="button" className="ghost-link-button" onClick={() => setIsCategoryManagerOpen(true)}>
                      Manage
                    </button>
                  ) : null}
                </div>

                {canManageCategories ? (
                  <button type="button" className="secondary-button gallery-v2-sidebar-action" onClick={() => setCategoryEditorDraft(buildEmptyCategoryDraft())}>
                    + Add Category
                  </button>
                ) : null}

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
                  <strong>Quick Actions</strong>
                </div>
                <button type="button" className="gallery-v2-quick-action" onClick={() => openBulkCategoryDialog("bulk-assign")}>
                  <TagIcon />
                  <span>Bulk Edit Categories</span>
                </button>
                {canManageCategories ? (
                  <button type="button" className="gallery-v2-quick-action is-danger" onClick={() => void handleDeleteUnused()} disabled={isRunningQuickDelete}>
                    <TrashIcon />
                    <span>{isRunningQuickDelete ? "Deleting..." : "Delete Unused"}</span>
                  </button>
                ) : null}
              </div>
            </section>

            <section className="panel gallery-v2-sidebar-card">
              <div className="panel-body">
                <div className="gallery-v2-sidebar-card-head">
                  <strong>Storage Usage</strong>
                </div>
                <div className="gallery-v2-storage-card">
                  <div className="gallery-v2-storage-bar">
                    <span style={{ width: "24%" }} />
                  </div>
                  <strong>{formatBytes(trackedStorageBytes)} tracked</strong>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>

      {isUploadModalOpen && hasMounted
        ? createPortal(
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload media">
              <button type="button" className="modal-dismiss-surface" aria-label="Close upload modal" onClick={() => { if (!isUploading) { setIsUploadModalOpen(false); resetUploadState(); } }} />
              <div className="modal-card gallery-upload-modal">
                <div className="preview-header">
                  <div>
                    <strong>Upload Media</strong>
                    <p className="muted">Select one or more images, review them here, then confirm the upload.</p>
                  </div>
                  <button type="button" className="ghost-link-button" onClick={() => { if (!isUploading) { setIsUploadModalOpen(false); resetUploadState(); } }} disabled={isUploading}>
                    Close
                  </button>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { appendQueuedFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { appendQueuedFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />

                <button type="button" className="gallery-upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); appendQueuedFiles(Array.from(event.dataTransfer.files ?? [])); }} onClick={() => fileInputRef.current?.click()}>
                  <span className="gallery-upload-dropzone-icon"><UploadIcon /></span>
                  <strong>Drag &amp; drop images here</strong>
                  <span>or tap to browse your photos</span>
                  <span className="gallery-upload-dropzone-button">Choose photos</span>
                  <small className="gallery-upload-dropzone-help">Bulk uploads automatically skip duplicate files already in the gallery.</small>
                </button>

                <div className="gallery-upload-mobile-actions">
                  <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Choose From Library</button>
                  <button type="button" className="gallery-upload-button" onClick={() => cameraInputRef.current?.click()} disabled={isUploading}>
                    <UploadIcon />
                    <span>Take Photo</span>
                  </button>
                </div>

                {queuedUploads.length > 0 ? (
                  <div className="gallery-upload-queue">
                    <div className="gallery-upload-queue-header">
                      <strong>Ready to upload</strong>
                      <span>{queuedUploads.length} file(s)</span>
                    </div>
                    <div className="gallery-upload-queue-grid">
                      {queuedUploads.map((item) => (
                        <article key={item.id} className="gallery-upload-queue-card">
                          <div className="gallery-upload-queue-thumb-wrap">
                            <img src={item.previewUrl} alt={`${item.file.name} preview`} className="gallery-upload-queue-thumb" />
                            <button type="button" className="gallery-upload-queue-remove" onClick={(event) => { event.stopPropagation(); removeQueuedFile(item.id); }} disabled={isUploading} aria-label={`Remove ${item.file.name}`}>
                              <CloseIcon />
                            </button>
                          </div>
                          <div className="gallery-upload-queue-meta">
                            <strong title={item.file.name}>{item.file.name}</strong>
                            <span>{formatBytes(item.file.size)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted">No files selected yet.</p>
                )}

                {uploadError ? <p className="inline-error">{uploadError}</p> : null}
                {uploadProgressLabel ? <p className="hint">{uploadProgressLabel}</p> : null}

                <div className="gallery-upload-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => { if (!isUploading) { setIsUploadModalOpen(false); resetUploadState(); } }} disabled={isUploading}>Cancel</button>
                  <button type="button" className="gallery-upload-button" onClick={() => void handleUploadConfirm()} disabled={isUploading || queuedUploads.length === 0}>
                    <UploadIcon />
                    <span>{isUploading ? "Uploading..." : "Upload"}</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
                      <a href={openAssetOriginalUrl ?? openAssetPreviewUrl} target="_blank" rel="noopener noreferrer" className="media-modal-image-link" title="Open original image in a new tab">
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
                      <strong>Category</strong>
                      <p>{getFallbackDisplayCategory(categorySummaries, openAsset.categories).name}</p>
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
                      <button type="button" className="secondary-button" onClick={() => openCategoryDialogForAsset(openAsset.id, "single-replace")}>
                        Assign Categories
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
                        <span>
                          <strong>{category.name}</strong>
                          <small>{category.assetCount} item{category.assetCount === 1 ? "" : "s"}</small>
                        </span>
                      </span>
                      <div className="gallery-manage-category-actions">
                        <button type="button" className="ghost-link-button" onClick={() => handleReorderCategory(category.id, -1)} disabled={index === 0}>Up</button>
                        <button type="button" className="ghost-link-button" onClick={() => handleReorderCategory(category.id, 1)} disabled={index === categorySummaries.length - 1}>Down</button>
                        <button type="button" className="ghost-link-button" onClick={() => setCategoryEditorDraft({ categoryId: category.id, name: category.name, color: category.color, icon: category.icon })}>Edit</button>
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
                    <strong>{categoryDialog.mediaAssetIds.length === 1 ? "Assign Categories" : "Bulk Category Update"}</strong>
                    <p className="muted">Select the categories you want applied to the chosen media.</p>
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
                          current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id],
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
                    <span>{isSavingCategoryDialog ? "Saving..." : "Save Categories"}</span>
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
