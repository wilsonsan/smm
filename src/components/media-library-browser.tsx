"use client";

/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { CalendarIcon, GalleryIcon } from "@/components/dashboard-icons";
import { MediaPostedBadges } from "@/components/media-posted-badges";
import {
  formatBytes,
  formatDimensions,
  getVariantByType,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  type MediaAssetGallerySummary,
} from "@/lib/media-presentation";

type MediaLibraryBrowserProps = {
  assets: MediaAssetGallerySummary[];
  timezone: string;
};

type StatusFilterValue =
  | "ALL"
  | "NOT_POSTED"
  | "POSTED_ANYWHERE"
  | "POSTED_TO_FACEBOOK"
  | "POSTED_TO_INSTAGRAM"
  | "POSTED_TO_GOOGLE"
  | "POSTED_EVERYWHERE";

type SortOrderValue = "NEWEST" | "OLDEST" | "FILENAME_ASC" | "FILENAME_DESC";
type ViewModeValue = "GRID" | "LIST";

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

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "ALL", label: "All Status" },
  { value: "NOT_POSTED", label: "Not Posted" },
  { value: "POSTED_ANYWHERE", label: "Posted Anywhere" },
  { value: "POSTED_TO_FACEBOOK", label: "Posted to Facebook" },
  { value: "POSTED_TO_INSTAGRAM", label: "Posted to Instagram" },
  { value: "POSTED_TO_GOOGLE", label: "Posted to Google" },
  { value: "POSTED_EVERYWHERE", label: "Posted Everywhere" },
];

const SORT_OPTIONS: Array<{ value: SortOrderValue; label: string }> = [
  { value: "NEWEST", label: "Newest First" },
  { value: "OLDEST", label: "Oldest First" },
  { value: "FILENAME_ASC", label: "Filename A-Z" },
  { value: "FILENAME_DESC", label: "Filename Z-A" },
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

function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" />
      <path d="M14 4.5V9h4" />
    </svg>
  );
}

function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m9 18 6-6-6-6" />
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

function getMimeTypeLabel(asset: MediaAssetGallerySummary) {
  const extension = asset.originalFilename.split(".").pop()?.toUpperCase();
  if (extension) {
    return extension;
  }

  return asset.mimeType.replace("image/", "").toUpperCase();
}

function formatUploadDate(value: string, timezone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getTypeFilterLabel(asset: MediaAssetGallerySummary) {
  if (asset.mimeType === "image/jpeg") {
    return "JPEG";
  }
  if (asset.mimeType === "image/png") {
    return "PNG";
  }
  if (asset.mimeType === "image/webp") {
    return "WebP";
  }
  if (asset.mimeType === "image/heic" || asset.mimeType === "image/heif") {
    return "HEIC / HEIF";
  }

  return asset.mimeType;
}

function matchesStatusFilter(asset: MediaAssetGallerySummary, filter: StatusFilterValue) {
  switch (filter) {
    case "NOT_POSTED":
      return !asset.postedPlatforms.postedAnywhere;
    case "POSTED_ANYWHERE":
      return asset.postedPlatforms.postedAnywhere;
    case "POSTED_TO_FACEBOOK":
      return asset.postedPlatforms.postedToFacebook;
    case "POSTED_TO_INSTAGRAM":
      return asset.postedPlatforms.postedToInstagram;
    case "POSTED_TO_GOOGLE":
      return asset.postedPlatforms.postedToGoogle;
    case "POSTED_EVERYWHERE":
      return asset.postedPlatforms.postedEverywhere;
    default:
      return true;
  }
}

function sortAssets(assets: MediaAssetGallerySummary[], sortOrder: SortOrderValue) {
  const copy = [...assets];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case "OLDEST":
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      case "FILENAME_ASC":
        return left.originalFilename.localeCompare(right.originalFilename, undefined, { sensitivity: "base" });
      case "FILENAME_DESC":
        return right.originalFilename.localeCompare(left.originalFilename, undefined, { sensitivity: "base" });
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

export function MediaLibraryBrowser({ assets, timezone }: MediaLibraryBrowserProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queuedUploadsRef = useRef<QueuedUpload[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL_TYPES");
  const [sortOrder, setSortOrder] = useState<SortOrderValue>("NEWEST");
  const [viewMode, setViewMode] = useState<ViewModeValue>("GRID");
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [currentPage, setCurrentPage] = useState(1);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const typeOptions = useMemo(() => {
    const labels = Array.from(new Set(assets.map(getTypeFilterLabel))).sort((left, right) => left.localeCompare(right));
    return [{ value: "ALL_TYPES", label: "All Types" }, ...labels.map((label) => ({ value: label, label }))];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortAssets(
      assets.filter((asset) => {
        if (normalizedSearch && !asset.originalFilename.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

        if (typeFilter !== "ALL_TYPES" && getTypeFilterLabel(asset) !== typeFilter) {
          return false;
        }

        return matchesStatusFilter(asset, statusFilter);
      }),
      sortOrder,
    );
  }, [assets, searchTerm, typeFilter, statusFilter, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, sortOrder, itemsPerPage]);

  useEffect(() => {
    if (!openAssetId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenAssetId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openAssetId]);

  useEffect(() => {
    if (!isUploadModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isUploading) {
        setIsUploadModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUploadModalOpen, isUploading]);

  useEffect(() => {
    if (!isDeleteConfirming) {
      return;
    }

    const timeoutId = window.setTimeout(() => setIsDeleteConfirming(false), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [isDeleteConfirming]);

  useEffect(() => {
    queuedUploadsRef.current = queuedUploads;
  }, [queuedUploads]);

  useEffect(() => {
    if (!isUploadModalOpen && !openAssetId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isUploadModalOpen, openAssetId]);

  useEffect(() => {
    return () => {
      queuedUploadsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / itemsPerPage));
  const clampedCurrentPage = Math.min(currentPage, totalPages);
  const visibleAssets = filteredAssets.slice(
    (clampedCurrentPage - 1) * itemsPerPage,
    clampedCurrentPage * itemsPerPage,
  );
  const pageNumbers = getPageNumbers(clampedCurrentPage, totalPages);
  const openAsset = assets.find((asset) => asset.id === openAssetId) ?? null;
  const openAssetOriginalVariant = openAsset ? getVariantByType(openAsset.variants, "ORIGINAL") : null;
  const openAssetDisplayVariant =
    openAssetOriginalVariant && openAssetOriginalVariant.mimeType !== "image/heic" && openAssetOriginalVariant.mimeType !== "image/heif"
      ? openAssetOriginalVariant
      : openAsset
        ? getPreferredPreviewVariant(openAsset.variants)
        : null;
  const openAssetMediaUrl = openAssetDisplayVariant ? getMediaVariantUrl(openAssetDisplayVariant.id) : null;

  function resetUploadState() {
    queuedUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setQueuedUploads([]);
    setUploadError(null);
    setUploadProgressLabel(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function closeUploadModal() {
    if (isUploading) {
      return;
    }

    setIsUploadModalOpen(false);
    resetUploadState();
  }

  function appendQueuedFiles(files: Iterable<File>) {
    const newEntries: QueuedUpload[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        errors.push(`${file.name} is not a supported image file.`);
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

    if (errors.length > 0) {
      setUploadError(errors[0]);
    } else {
      setUploadError(null);
    }

    if (newEntries.length > 0) {
      setQueuedUploads((current) => [...current, ...newEntries]);
    }
  }

  function removeQueuedFile(uploadId: string) {
    setQueuedUploads((current) => {
      const next = current.filter((item) => item.id !== uploadId);
      const removed = current.find((item) => item.id === uploadId);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });
  }

  async function handleUploadConfirm() {
    if (queuedUploads.length === 0) {
      setUploadError("Select one or more images to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSummary(null);

    try {
      let uploadedCount = 0;
      let skippedDuplicateCount = 0;

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
        if (!response.ok) {
          throw new Error(payload?.error || `Upload failed for ${queuedUpload.file.name}.`);
        }

        if (payload?.status === "duplicate") {
          skippedDuplicateCount += 1;
        } else {
          uploadedCount += 1;
        }
      }

      setIsUploadModalOpen(false);
      resetUploadState();
      if (uploadedCount > 0 && skippedDuplicateCount > 0) {
        setUploadSummary(
          `Uploaded ${uploadedCount} image${uploadedCount === 1 ? "" : "s"} and skipped ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
        );
      } else if (uploadedCount > 0) {
        setUploadSummary(`Uploaded ${uploadedCount} image${uploadedCount === 1 ? "" : "s"}.`);
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

  async function handleDeleteAsset() {
    if (!openAsset) {
      return;
    }

    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${openAsset.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete this media asset.");
      }

      setOpenAssetId(null);
      setIsDeleteConfirming(false);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete this media asset.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handlePostFromAsset() {
    if (!openAsset) {
      return;
    }

    void fetch("/api/admin/audit/gallery-post-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mediaAssetId: openAsset.id }),
      keepalive: true,
    }).catch(() => undefined);

    setOpenAssetId(null);
    setDeleteError(null);
    setIsDeleteConfirming(false);
    router.push(`/dashboard/posts/new?mediaId=${encodeURIComponent(openAsset.id)}`);
  }

  return (
    <>
      <section className="gallery-shell">
        <header className="gallery-header">
          <div className="gallery-header-copy">
            <div className="gallery-title-row">
              <span className="gallery-title-icon">
                <GalleryIcon />
              </span>
              <div>
                <h2>Gallery</h2>
              </div>
            </div>
          </div>

          <button type="button" className="gallery-upload-button" onClick={() => setIsUploadModalOpen(true)}>
            <UploadIcon />
            <span>Upload</span>
          </button>
        </header>

        <section className="gallery-toolbar panel">
          <div className="panel-body gallery-toolbar-body">
            <label className="gallery-search-field">
              <SearchIcon />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search media assets..."
              />
            </label>

            <select
              className="gallery-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="gallery-filter-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="gallery-filter-select"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrderValue)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="gallery-view-toggle" role="group" aria-label="Gallery view mode">
              <button
                type="button"
                className={`gallery-view-toggle-button${viewMode === "GRID" ? " is-active" : ""}`.trim()}
                onClick={() => setViewMode("GRID")}
                aria-pressed={viewMode === "GRID"}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                className={`gallery-view-toggle-button${viewMode === "LIST" ? " is-active" : ""}`.trim()}
                onClick={() => setViewMode("LIST")}
                aria-pressed={viewMode === "LIST"}
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </section>

        {uploadSummary ? <p className="success-text">{uploadSummary}</p> : null}

        {visibleAssets.length === 0 ? (
          <section className="panel">
            <div className="panel-body">
              <p className="muted">No media assets match the current filters.</p>
            </div>
          </section>
        ) : (
          <section className={`gallery-assets-grid ${viewMode === "LIST" ? "is-list" : ""}`.trim()}>
            {visibleAssets.map((asset) => {
              const originalVariant = getVariantByType(asset.variants, "ORIGINAL");
              const assetPreviewVariant =
                originalVariant && originalVariant.mimeType !== "image/heic" && originalVariant.mimeType !== "image/heif"
                  ? originalVariant
                  : getPreferredPreviewVariant(asset.variants);

              return (
                <article key={asset.id} className="gallery-asset-card">
                  <button type="button" className="gallery-asset-thumb-wrap" onClick={() => setOpenAssetId(asset.id)}>
                    {assetPreviewVariant ? (
                      <span
                        aria-hidden="true"
                        className="gallery-asset-thumb"
                        style={{ backgroundImage: `url(${getMediaVariantUrl(assetPreviewVariant.id)})` }}
                      />
                    ) : (
                      <div className="gallery-asset-thumb-fallback">No preview</div>
                    )}

                    <MediaPostedBadges postedPlatforms={asset.postedPlatforms} />
                  </button>

                  <div className="gallery-asset-body">
                    <div className="gallery-asset-head">
                      <strong title={asset.originalFilename}>{asset.originalFilename}</strong>
                      <button
                        type="button"
                        className="gallery-asset-menu"
                        onClick={() => setOpenAssetId(asset.id)}
                        aria-label={`Open details for ${asset.originalFilename}`}
                      >
                        <MoreIcon />
                      </button>
                    </div>

                    <div className="gallery-asset-meta">
                      <span>
                        <FileIcon />
                        <span>{getMimeTypeLabel(asset)}</span>
                      </span>
                      <span>{formatBytes(asset.sizeBytes)}</span>
                      <span>{formatDimensions(asset.width, asset.height)}</span>
                    </div>

                    <div className="gallery-asset-date">
                      <CalendarIcon />
                      <span>{formatUploadDate(asset.createdAt, timezone)}</span>
                    </div>

                    <div className="gallery-asset-footer">
                      <button type="button" className="gallery-open-link" onClick={() => setOpenAssetId(asset.id)}>
                        Open Details
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className="gallery-pagination panel">
          <div className="panel-body gallery-pagination-body">
            <div className="gallery-pagination-controls">
              <button
                type="button"
                className="gallery-page-button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={clampedCurrentPage === 1}
              >
                <ChevronLeftIcon />
                <span>Previous</span>
              </button>

              <div className="gallery-page-numbers">
                {pageNumbers.map((page, index) =>
                  page === "ELLIPSIS" ? (
                    <span key={`ellipsis-${index}`} className="gallery-page-ellipsis">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      className={`gallery-page-number${page === clampedCurrentPage ? " is-active" : ""}`.trim()}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ),
                )}
              </div>

              <button
                type="button"
                className="gallery-page-button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={clampedCurrentPage === totalPages}
              >
                <span>Next</span>
                <ChevronRightIcon />
              </button>
            </div>

            <label className="gallery-items-per-page">
              <span>Items per page</span>
              <select value={String(itemsPerPage)} onChange={(event) => setItemsPerPage(Number(event.target.value))}>
                {ITEMS_PER_PAGE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </section>

      {isUploadModalOpen && hasMounted
        ? createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload media">
          <button
            type="button"
            className="modal-dismiss-surface"
            aria-label="Close upload modal"
            onClick={closeUploadModal}
          />
          <div className="modal-card gallery-upload-modal">
            <div className="preview-header">
              <div>
                <strong>Upload media</strong>
                <p className="muted">Select one or more images, review them here, then confirm the upload.</p>
              </div>
              <button type="button" className="ghost-link-button" onClick={closeUploadModal} disabled={isUploading}>
                Close
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                appendQueuedFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              className="gallery-upload-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                appendQueuedFiles(Array.from(event.dataTransfer.files ?? []));
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="gallery-upload-dropzone-icon">
                <UploadIcon />
              </span>
              <strong>Drag &amp; drop images here</strong>
              <span>or click to browse files</span>
            </button>

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
                        <button
                          type="button"
                          className="gallery-upload-queue-remove"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeQueuedFile(item.id);
                          }}
                          disabled={isUploading}
                          aria-label={`Remove ${item.file.name}`}
                        >
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
              <button type="button" className="secondary-button" onClick={closeUploadModal} disabled={isUploading}>
                Cancel
              </button>
              <button type="button" className="gallery-upload-button" onClick={handleUploadConfirm} disabled={isUploading || queuedUploads.length === 0}>
                <UploadIcon />
                <span>{isUploading ? "Uploading..." : "Upload"}</span>
              </button>
            </div>
          </div>
        </div>
          ,
          document.body,
        )
        : null}

      {openAsset && hasMounted
        ? createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${openAsset.originalFilename} details`}>
          <button
            type="button"
            className="modal-dismiss-surface"
            aria-label="Close media details"
            onClick={() => {
              setOpenAssetId(null);
              setDeleteError(null);
              setIsDeleteConfirming(false);
            }}
          />
          <div className="modal-card media-modal-card">
            <div className="preview-header">
              <div>
                <strong>{openAsset.originalFilename}</strong>
                <p className="muted">Original image details.</p>
              </div>
              <button
                type="button"
                className="ghost-link-button"
                onClick={() => {
                  setOpenAssetId(null);
                  setDeleteError(null);
                  setIsDeleteConfirming(false);
                }}
              >
                Close
              </button>
            </div>

              <div className="media-modal-layout">
              <div className="media-modal-preview">
                {openAssetMediaUrl ? (
                  <a
                    href={openAssetMediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="media-modal-image-link"
                    title="Open original image in a new tab"
                  >
                    <span
                      aria-hidden="true"
                      className="media-modal-image"
                      style={{ backgroundImage: `url(${openAssetMediaUrl})` }}
                    />
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
                  <strong>Uploaded</strong>
                  <p>{formatUploadDate(openAsset.createdAt, timezone)}</p>
                </div>
                <div className="media-variant-info-card">
                  <strong>Dimensions</strong>
                  <p>{formatDimensions(openAsset.width, openAsset.height)}</p>
                </div>
                <div className="media-variant-info-card">
                  <strong>File size</strong>
                  <p>{formatBytes(openAsset.sizeBytes)}</p>
                </div>
                <div className="media-variant-info-card">
                  <strong>MIME type</strong>
                  <p>{openAsset.mimeType}</p>
                </div>

                {deleteError ? <p className="inline-error">{deleteError}</p> : null}

                <div className="media-modal-actions">
                  <button
                    type="button"
                    className="media-post-button"
                    onClick={handlePostFromAsset}
                  >
                    Post
                  </button>
                  <button
                    type="button"
                    className={`media-delete-button${isDeleteConfirming ? " is-confirming" : ""}`.trim()}
                    onClick={handleDeleteAsset}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : isDeleteConfirming ? "Confirm Delete" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
          ,
          document.body,
        )
        : null}
    </>
  );
}
