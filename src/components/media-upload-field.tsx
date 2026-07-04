"use client";

/* eslint-disable @next/next/no-img-element */

import { CustomSelect, type CustomSelectOption } from "@/components/custom-select";
import { ChevronDownIcon, GalleryIcon } from "@/components/dashboard-icons";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { MediaCategoryIcon } from "@/components/media-category-icon";
import { MediaPostedBadges } from "@/components/media-posted-badges";
import { FALLBACK_MEDIA_CATEGORY_NAME, FALLBACK_MEDIA_CATEGORY_SLUG } from "@/lib/media-categories";
import {
  formatBytes,
  formatDimensions,
  getGalleryPreviewVariant,
  getGalleryThumbnailVariant,
  getMediaVariantUrl,
  getOriginalVariant,
  type MediaAssetGallerySummary,
} from "@/lib/media-presentation";

type MediaUploadFieldProps = {
  availableAssets: MediaAssetGallerySummary[];
  selectedMediaAssetIds: string[];
  onSelectedMediaAssetIdsChange: (mediaAssetIds: string[]) => void;
  onResolvedSelectionChange?: (assets: MediaAssetGallerySummary[]) => void;
  onSelectionSourceChange: (source: "upload" | "gallery" | "manual" | "") => void;
  maxMediaCount: number;
  mediaLimitMessage: string | null;
  disabled?: boolean;
};

const GALLERY_PAGE_SIZE = 12;

type PickerCategoryOption = {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  count: number;
};

type CategoryDropdownOption =
  | {
      kind: "option";
      slug: string;
      name: string;
      count: number;
      color: string;
      icon: string;
    }
  | { kind: "label"; key: string; label: string }
  | { kind: "divider"; key: string };

function UploadCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8.5 18.5h8a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7-1.1A4.2 4.2 0 0 0 8.5 18.5Z" />
      <path d="M12 8.5v8" />
      <path d="m9.2 11.3 2.8-2.8 2.8 2.8" />
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

function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4.5 6.5h15" />
      <path d="M7.5 12h9" />
      <path d="M10.5 17.5h3" />
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

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m5.5 12.5 4 4L18.5 7.5" />
    </svg>
  );
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

function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function getDisplayCategory(asset: MediaAssetGallerySummary) {
  return asset.categories[0] ?? {
    id: "uncategorized",
    name: FALLBACK_MEDIA_CATEGORY_NAME,
    slug: FALLBACK_MEDIA_CATEGORY_SLUG,
    color: "#8f9bb3",
    icon: "OTHER",
    sortOrder: 9999,
  };
}

export function MediaUploadField({
  availableAssets,
  selectedMediaAssetIds,
  onSelectedMediaAssetIdsChange,
  onResolvedSelectionChange,
  onSelectionSourceChange,
  maxMediaCount,
  mediaLimitMessage,
  disabled = false,
}: MediaUploadFieldProps) {
  const dedupedAssets = useMemo(() => dedupeAssets(availableAssets), [availableAssets]);
  const [mediaOptions, setMediaOptions] = useState<MediaAssetGallerySummary[]>(dedupedAssets);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [pendingGallerySelectionIds, setPendingGallerySelectionIds] = useState<string[]>(selectedMediaAssetIds);
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState("ALL");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [activeCategoryOptionIndex, setActiveCategoryOptionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null);
  const categoryDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
  const categoryOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setMediaOptions(dedupedAssets);
  }, [dedupedAssets]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setPendingGallerySelectionIds(selectedMediaAssetIds);
  }, [selectedMediaAssetIds, isGalleryOpen]);

  useEffect(() => {
    if (!isGalleryOpen) {
      return;
    }

    setGalleryCategoryFilter("ALL");
    setIsCategoryDropdownOpen(false);
  }, [isGalleryOpen]);

  const selectedMediaAssets = useMemo(
    () =>
      selectedMediaAssetIds
        .map((id) => mediaOptions.find((asset) => asset.id === id) ?? null)
        .filter((asset): asset is MediaAssetGallerySummary => asset !== null),
    [mediaOptions, selectedMediaAssetIds],
  );
  const attachedMediaOrderOptions = useMemo<CustomSelectOption[]>(
    () =>
      Array.from({ length: selectedMediaAssets.length }, (_, index) => ({
        value: String(index),
        label: `Photo ${index + 1}`,
      })),
    [selectedMediaAssets.length],
  );

  useEffect(() => {
    onResolvedSelectionChange?.(selectedMediaAssets);
  }, [onResolvedSelectionChange, selectedMediaAssets]);

  const galleryCategoryOptions = useMemo(() => {
    const categoryMap = new Map<string, PickerCategoryOption>();

    for (const asset of mediaOptions) {
      const categories = asset.categories.length > 0 ? asset.categories : [getDisplayCategory(asset)];

      for (const category of categories) {
        const existing = categoryMap.get(category.slug);
        if (existing) {
          existing.count += 1;
          continue;
        }

        categoryMap.set(category.slug, {
          id: category.id,
          name: category.name,
          slug: category.slug,
          color: category.color,
          icon: category.icon,
          count: 1,
        });
      }
    }

    return [...categoryMap.values()].sort((left, right) => {
      if (left.slug === FALLBACK_MEDIA_CATEGORY_SLUG) {
        return 1;
      }
      if (right.slug === FALLBACK_MEDIA_CATEGORY_SLUG) {
        return -1;
      }
      return left.name.localeCompare(right.name);
    });
  }, [mediaOptions]);

  const fallbackCategoryOption = useMemo(
    () =>
      galleryCategoryOptions.find((category) => category.slug === FALLBACK_MEDIA_CATEGORY_SLUG) ?? {
        id: "uncategorized",
        name: FALLBACK_MEDIA_CATEGORY_NAME,
        slug: FALLBACK_MEDIA_CATEGORY_SLUG,
        color: "#8f9bb3",
        icon: "OTHER",
        count: mediaOptions.filter((asset) => asset.categories.length === 0).length,
      },
    [galleryCategoryOptions, mediaOptions],
  );

  const standardCategoryOptions = useMemo(
    () => galleryCategoryOptions.filter((category) => category.slug !== FALLBACK_MEDIA_CATEGORY_SLUG),
    [galleryCategoryOptions],
  );

  const categoryDropdownItems = useMemo<CategoryDropdownOption[]>(
    () => [
      {
        kind: "option",
        slug: "ALL",
        name: "All Categories",
        count: mediaOptions.length,
        color: "#7d67ff",
        icon: "OTHER",
      },
      {
        kind: "option",
        slug: fallbackCategoryOption.slug,
        name: fallbackCategoryOption.name,
        count: fallbackCategoryOption.count,
        color: fallbackCategoryOption.color,
        icon: fallbackCategoryOption.icon,
      },
      { kind: "divider", key: "category-divider" },
      ...(standardCategoryOptions.length > 0 ? [{ kind: "label" as const, key: "category-label", label: "Categories" }] : []),
      ...standardCategoryOptions.map((category) => ({
        kind: "option" as const,
        slug: category.slug,
        name: category.name,
        count: category.count,
        color: category.color,
        icon: category.icon,
      })),
    ],
    [fallbackCategoryOption, mediaOptions.length, standardCategoryOptions],
  );

  const categoryDropdownOptions = useMemo(
    () => categoryDropdownItems.filter((item): item is Extract<CategoryDropdownOption, { kind: "option" }> => item.kind === "option"),
    [categoryDropdownItems],
  );

  const selectedCategoryDropdownOption = useMemo(
    () => categoryDropdownOptions.find((item) => item.slug === galleryCategoryFilter) ?? categoryDropdownOptions[0],
    [categoryDropdownOptions, galleryCategoryFilter],
  );

  const filteredGalleryAssets = useMemo(() => {
    return mediaOptions.filter((asset) => {
      if (galleryCategoryFilter === "ALL") {
        return true;
      }

      return (asset.categories.length > 0 ? asset.categories : [getDisplayCategory(asset)]).some(
        (category) => category.slug === galleryCategoryFilter,
      );
    });
  }, [galleryCategoryFilter, mediaOptions]);

  const galleryTotalPages = getPageCount(filteredGalleryAssets.length, GALLERY_PAGE_SIZE);
  const galleryVisibleAssets = filteredGalleryAssets.slice((galleryPage - 1) * GALLERY_PAGE_SIZE, galleryPage * GALLERY_PAGE_SIZE);

  useEffect(() => {
    setGalleryPage((current) => Math.min(current, galleryTotalPages));
  }, [galleryTotalPages]);

  useEffect(() => {
    setGalleryPage(1);
  }, [galleryCategoryFilter]);

  useEffect(() => {
    if (!isGalleryOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsGalleryOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGalleryOpen]);

  useEffect(() => {
    if (!isCategoryDropdownOpen) {
      return;
    }

    const selectedIndex = Math.max(
      0,
      categoryDropdownOptions.findIndex((option) => option.slug === galleryCategoryFilter),
    );
    setActiveCategoryOptionIndex(selectedIndex);
  }, [categoryDropdownOptions, galleryCategoryFilter, isCategoryDropdownOpen]);

  useEffect(() => {
    if (!isCategoryDropdownOpen) {
      return;
    }

    const option = categoryOptionRefs.current[activeCategoryOptionIndex];
    option?.focus();
  }, [activeCategoryOptionIndex, isCategoryDropdownOpen]);

  useEffect(() => {
    if (!isCategoryDropdownOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && categoryDropdownRef.current?.contains(target)) {
        return;
      }

      setIsCategoryDropdownOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isCategoryDropdownOpen]);

  useEffect(() => {
    if (!isGalleryOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isGalleryOpen]);

  function enforceMediaLimit(nextIds: string[]) {
    if (nextIds.length > maxMediaCount) {
      setError(mediaLimitMessage || `You can attach up to ${maxMediaCount} images for the selected platforms.`);
      return false;
    }

    return true;
  }

  function updateSelection(nextIds: string[], source: "upload" | "gallery" | "manual") {
    if (!enforceMediaLimit(nextIds)) {
      onSelectionSourceChange(source);
      return false;
    }

    onSelectedMediaAssetIdsChange(nextIds);
    onSelectionSourceChange(source);
    setError(null);
    return true;
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      setError("Choose one or more image files before uploading.");
      return;
    }

    if (selectedMediaAssetIds.length + files.length > maxMediaCount) {
      setError(mediaLimitMessage || `You can attach up to ${maxMediaCount} images for the selected platforms.`);
      onSelectionSourceChange("upload");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    const attachedMediaAssetIds = new Set(selectedMediaAssetIds);
    let uploadedCount = 0;
    let skippedDuplicateCount = 0;

    try {
      for (const file of files) {
        const response = await fetch("/api/admin/uploads", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Upload-Filename": encodeURIComponent(file.name),
            "X-Upload-Mime-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        const payload = (await response
          .json()
          .catch(async () => ({ error: await response.text().catch(() => "Upload failed.") }))) as {
          error?: string;
          status?: "uploaded" | "duplicate";
          mediaAsset?: MediaAssetGallerySummary;
        };
        if (!response.ok) {
          setError(payload.error || "Upload failed.");
          return;
        }

        if (!payload.mediaAsset) {
          setError("Upload failed.");
          return;
        }

        setMediaOptions((current) => dedupeAssets([payload.mediaAsset!, ...current]));
        attachedMediaAssetIds.add(payload.mediaAsset.id);

        if (payload.status === "duplicate") {
          skippedDuplicateCount += 1;
        } else {
          uploadedCount += 1;
        }
      }

      const nextIds = [...attachedMediaAssetIds];
      updateSelection(nextIds, "upload");

      if (uploadedCount > 0 && skippedDuplicateCount > 0) {
        setSuccessMessage(
          `Uploaded ${uploadedCount} image${uploadedCount === 1 ? "" : "s"} and reused ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`,
        );
      } else if (uploadedCount > 0) {
        setSuccessMessage(
          `Uploaded ${uploadedCount} image${uploadedCount === 1 ? "" : "s"}. Original images are stored locally and platform-ready images are generated only when publishing.`,
        );
      } else if (skippedDuplicateCount > 0) {
        setSuccessMessage(
          `Skipped ${skippedDuplicateCount} duplicate${skippedDuplicateCount === 1 ? "" : "s"} and attached the existing gallery image${skippedDuplicateCount === 1 ? "" : "s"} instead.`,
        );
      }
    } catch {
      setError("Upload failed. Check the server logs and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileSelection() {
    void uploadFiles(Array.from(fileInputRef.current?.files ?? []));
  }

  function handleBrowseClick() {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }

  function clearAllMedia() {
    onSelectedMediaAssetIdsChange([]);
    onSelectionSourceChange("manual");
    setError(null);
    setSuccessMessage(null);
  }

  function removeSingleMedia(mediaAssetId: string) {
    void updateSelection(
      selectedMediaAssetIds.filter((id) => id !== mediaAssetId),
      "manual",
    );
  }

  function moveMediaToIndex(mediaAssetId: string, nextIndex: number) {
    const currentIndex = selectedMediaAssetIds.indexOf(mediaAssetId);
    if (currentIndex === -1) {
      return;
    }

    if (nextIndex < 0 || nextIndex >= selectedMediaAssetIds.length || nextIndex === currentIndex) {
      return;
    }

    const nextIds = [...selectedMediaAssetIds];
    const [movedId] = nextIds.splice(currentIndex, 1);
    nextIds.splice(nextIndex, 0, movedId);
    void updateSelection(nextIds, "manual");
  }

  function togglePendingGallerySelection(mediaAssetId: string) {
    setPendingGallerySelectionIds((current) => {
      if (current.includes(mediaAssetId)) {
        return current.filter((id) => id !== mediaAssetId);
      }

      const nextIds = [...current, mediaAssetId];
      if (nextIds.length > maxMediaCount) {
        setError(mediaLimitMessage || `You can attach up to ${maxMediaCount} images for the selected platforms.`);
        onSelectionSourceChange("gallery");
        return current;
      }

      setError(null);
      return nextIds;
    });
  }

  function confirmGallerySelection() {
    const normalizedIds = pendingGallerySelectionIds.filter((id, index, array) => array.indexOf(id) === index);
    if (updateSelection(normalizedIds, "gallery")) {
      setIsGalleryOpen(false);
      setSuccessMessage(null);
    }
  }

  function selectGalleryCategory(slug: string) {
    setGalleryCategoryFilter(slug);
    setGalleryPage(1);
    setIsCategoryDropdownOpen(false);
    categoryDropdownButtonRef.current?.focus();
  }

  function handleCategoryDropdownKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const selectedIndex = Math.max(
        0,
        categoryDropdownOptions.findIndex((option) => option.slug === galleryCategoryFilter),
      );
      setActiveCategoryOptionIndex(selectedIndex);
      setIsCategoryDropdownOpen(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsCategoryDropdownOpen((current) => !current);
    }
  }

  function handleCategoryOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCategoryOptionIndex((optionIndex + 1) % categoryDropdownOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCategoryOptionIndex((optionIndex - 1 + categoryDropdownOptions.length) % categoryDropdownOptions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveCategoryOptionIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveCategoryOptionIndex(categoryDropdownOptions.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsCategoryDropdownOpen(false);
      categoryDropdownButtonRef.current?.focus();
    }
  }

  return (
    <div className="composer-media-stack">
      <div
        className={`composer-upload-zone${isDragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`.trim()}
        onDragOver={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          setIsDragging(false);
          void uploadFiles(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        <input
          ref={fileInputRef}
          id="mediaUpload"
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelection}
          disabled={disabled || isUploading}
          className="composer-hidden-file-input"
        />

        <div className="composer-upload-icon" aria-hidden="true">
          <UploadCloudIcon />
        </div>
        <strong>Drag &amp; drop images here</strong>
        <div className="composer-media-actions">
          <button
            type="button"
            className="composer-browse-button"
            onClick={handleBrowseClick}
            disabled={disabled || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload Images"}
          </button>
          <button
            type="button"
            className="composer-browse-button"
            onClick={() => {
              setPendingGallerySelectionIds(selectedMediaAssetIds);
              setGalleryPage(1);
              setIsGalleryOpen(true);
            }}
            disabled={disabled}
          >
            Browse Gallery
          </button>
        </div>
      </div>

      {selectedMediaAssets.length > 0 ? (
        <div className="composer-attached-media-section">
          <div className="composer-attached-media-header">
            <strong>Attached Media</strong>
            <button
              type="button"
              className="composer-clear-media-button"
              onClick={clearAllMedia}
              disabled={disabled}
            >
              Clear Media
            </button>
          </div>

          <div className="composer-attached-media-row">
            {selectedMediaAssets.map((asset, index) => {
              const previewVariant =
                getGalleryPreviewVariant(asset.variants) ??
                getGalleryThumbnailVariant(asset.variants) ??
                getOriginalVariant(asset.variants);

              return (
                <div key={asset.id} className="composer-attached-media-card">
                  <div className="composer-attached-media-order-pill">#{index + 1}</div>
                  {previewVariant ? (
                    <img
                      src={getMediaVariantUrl(previewVariant.id)}
                      alt={`${asset.originalFilename} attached preview`}
                      className="composer-attached-media-thumb"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="composer-attached-media-fallback">No preview</div>
                  )}

                  <button
                    type="button"
                    className="composer-attached-media-remove"
                    onClick={() => removeSingleMedia(asset.id)}
                    disabled={disabled}
                    aria-label={`Remove ${asset.originalFilename} from this post`}
                  >
                    x
                  </button>

                  <div className="composer-attached-media-meta">
                    <strong>{asset.originalFilename}</strong>
                    <span>
                      {formatDimensions(asset.width, asset.height)} - {formatBytes(asset.sizeBytes)}
                    </span>
                    <div className="composer-attached-media-order-row">
                      <span className="composer-attached-media-order-label">Photo order</span>
                      <CustomSelect
                        value={String(index)}
                        options={attachedMediaOrderOptions}
                        onChange={(value) => moveMediaToIndex(asset.id, Number(value))}
                        ariaLabel={`Choose the order for ${asset.originalFilename}`}
                        disabled={disabled || selectedMediaAssets.length <= 1}
                        className="composer-attached-media-order-select"
                        triggerClassName="composer-attached-media-order-trigger"
                        menuClassName="composer-attached-media-order-menu"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {mediaLimitMessage && selectedMediaAssetIds.length > maxMediaCount ? (
        <p className="error-text">{mediaLimitMessage}</p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      {selectedMediaAssetIds.map((mediaAssetId) => (
        <input key={mediaAssetId} type="hidden" name="mediaAssetIds" value={mediaAssetId} />
      ))}

      {isGalleryOpen && hasMounted
        ? createPortal(
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Browse gallery">
          <button type="button" className="modal-dismiss-surface" aria-label="Close gallery picker" onClick={() => setIsGalleryOpen(false)} />
          <div className="modal-card composer-gallery-picker-modal">
            <div className="composer-gallery-picker-header">
              <div className="composer-gallery-picker-header-copy">
                <span className="composer-gallery-picker-header-icon">
                  <GalleryIcon />
                </span>
                <div>
                  <strong>Browse Gallery</strong>
                  <p className="muted">
                    {pendingGallerySelectionIds.length} selected • Attach up to {maxMediaCount} image{maxMediaCount === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
              <button type="button" className="composer-gallery-picker-close" onClick={() => setIsGalleryOpen(false)} aria-label="Close gallery picker">
                <CloseIcon />
              </button>
            </div>
            <div className="composer-gallery-picker-divider" />

            <div className="composer-gallery-picker-toolbar">
              <div className={`composer-gallery-picker-category-dropdown${isCategoryDropdownOpen ? " is-open" : ""}`.trim()} ref={categoryDropdownRef}>
                <button
                  ref={categoryDropdownButtonRef}
                  type="button"
                  className="composer-gallery-picker-category-trigger"
                  onClick={() => setIsCategoryDropdownOpen((current) => !current)}
                  onKeyDown={handleCategoryDropdownKeyDown}
                  aria-haspopup="listbox"
                  aria-expanded={isCategoryDropdownOpen}
                >
                  <span className="composer-gallery-picker-category-trigger-copy">
                    <span className="composer-gallery-picker-category-trigger-icon" style={{ backgroundColor: selectedCategoryDropdownOption?.color ?? "#7d67ff" }}>
                      <MediaCategoryIcon icon={(selectedCategoryDropdownOption?.icon ?? "OTHER") as never} className="composer-gallery-picker-category-trigger-icon-svg" />
                    </span>
                    <span>{selectedCategoryDropdownOption?.name ?? "All Categories"}</span>
                  </span>
                  <ChevronDownIcon className="composer-gallery-picker-category-chevron" />
                </button>

                {isCategoryDropdownOpen ? (
                  <div className="composer-gallery-picker-category-menu" role="listbox" aria-label="Filter gallery by category">
                    {categoryDropdownItems.map((item) => {
                      if (item.kind === "divider") {
                        return <div key={item.key} className="composer-gallery-picker-category-divider" />;
                      }

                      if (item.kind === "label") {
                        return (
                          <div key={item.key} className="composer-gallery-picker-category-section-label">
                            {item.label}
                          </div>
                        );
                      }

                      const optionIndex = categoryDropdownOptions.findIndex((option) => option.slug === item.slug);
                      const isSelected = galleryCategoryFilter === item.slug;
                      const isAllOption = item.slug === "ALL";
                      const itemLabel = isAllOption ? item.name : `${item.name} (${item.count})`;

                      return (
                        <button
                          key={item.slug}
                          ref={(element) => {
                            categoryOptionRefs.current[optionIndex] = element;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`composer-gallery-picker-category-option${isSelected ? " is-selected" : ""}`.trim()}
                          onClick={() => selectGalleryCategory(item.slug)}
                          onKeyDown={(event) => handleCategoryOptionKeyDown(event, optionIndex)}
                        >
                          <span className="composer-gallery-picker-category-option-copy">
                            <span className="composer-gallery-picker-category-option-icon" style={{ backgroundColor: item.color }}>
                              <MediaCategoryIcon icon={item.icon as never} className="composer-gallery-picker-category-option-icon-svg" />
                            </span>
                            <span className="composer-gallery-picker-category-option-text">
                              <span>{item.name}</span>
                              {!isAllOption ? <span>{item.count}</span> : null}
                            </span>
                          </span>
                          {isSelected ? (
                            <span className="composer-gallery-picker-category-option-check">
                              <CheckIcon />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <button type="button" className="composer-gallery-picker-filter-button" aria-label="Additional gallery filters coming soon">
                <FilterIcon />
                <span>Filters</span>
              </button>
            </div>

            <div className="composer-gallery-picker-divider" />

            <div className="composer-gallery-picker-grid">
              {galleryVisibleAssets.map((asset) => {
                const previewVariant =
                  getGalleryThumbnailVariant(asset.variants) ??
                  getGalleryPreviewVariant(asset.variants) ??
                  getOriginalVariant(asset.variants);
                const isSelected = pendingGallerySelectionIds.includes(asset.id);
                const displayCategory = getDisplayCategory(asset);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`composer-gallery-picker-card${isSelected ? " is-selected" : ""}`.trim()}
                    onClick={() => togglePendingGallerySelection(asset.id)}
                    aria-pressed={isSelected}
                  >
                    <div className="composer-gallery-picker-thumb-wrap">
                      <span className={`composer-gallery-picker-selection-circle${isSelected ? " is-selected" : ""}`.trim()}>
                        {isSelected ? <CheckIcon /> : null}
                      </span>
                      {previewVariant ? (
                        <img
                          src={getMediaVariantUrl(previewVariant.id)}
                          alt={`${asset.originalFilename} preview`}
                          className="composer-gallery-picker-thumb"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="composer-gallery-picker-fallback">No preview</div>
                      )}
                      <MediaPostedBadges
                        postedPlatforms={asset.postedPlatforms}
                        className="gallery-posted-badges composer-gallery-picker-badges"
                      />
                    </div>
                    <div className="composer-gallery-picker-meta">
                      <strong>{asset.originalFilename}</strong>
                      <span
                        className="composer-gallery-picker-category"
                        style={{ "--category-color": displayCategory.color } as CSSProperties}
                      >
                        <MediaCategoryIcon icon={displayCategory.icon} className="composer-gallery-picker-category-icon" />
                        <span>{displayCategory.name}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="composer-gallery-picker-footer">
              <div className="composer-gallery-picker-pagination">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setGalleryPage((page) => Math.max(1, page - 1))}
                  disabled={galleryPage === 1}
                >
                  <ChevronLeftIcon />
                  <span>Previous</span>
                </button>
                <span>
                  Page {galleryPage} of {galleryTotalPages}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setGalleryPage((page) => Math.min(galleryTotalPages, page + 1))}
                  disabled={galleryPage === galleryTotalPages}
                >
                  <span>Next</span>
                  <ChevronRightIcon />
                </button>
              </div>

              <div className="composer-gallery-picker-actions">
                <button type="button" className="secondary-button" onClick={() => setIsGalleryOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="composer-action-button is-blue"
                  onClick={confirmGallerySelection}
                  disabled={pendingGallerySelectionIds.length === 0}
                >
                  Attach Selected
                </button>
              </div>
            </div>
          </div>
        </div>
          ,
          document.body,
        )
        : null}
    </div>
  );
}
