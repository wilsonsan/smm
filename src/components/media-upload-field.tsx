"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import {
  formatBytes,
  formatDimensions,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  type MediaAssetSummary,
} from "@/lib/media-presentation";

type MediaUploadFieldProps = {
  availableAssets: MediaAssetSummary[];
  selectedMediaAssetIds: string[];
  onSelectedMediaAssetIdsChange: (mediaAssetIds: string[]) => void;
  onSelectionSourceChange: (source: "upload" | "gallery" | "manual" | "") => void;
  maxMediaCount: number;
  mediaLimitMessage: string | null;
  disabled?: boolean;
};

const GALLERY_PAGE_SIZE = 12;

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

function dedupeAssets(assets: MediaAssetSummary[]) {
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

export function MediaUploadField({
  availableAssets,
  selectedMediaAssetIds,
  onSelectedMediaAssetIdsChange,
  onSelectionSourceChange,
  maxMediaCount,
  mediaLimitMessage,
  disabled = false,
}: MediaUploadFieldProps) {
  const dedupedAssets = useMemo(() => dedupeAssets(availableAssets), [availableAssets]);
  const [mediaOptions, setMediaOptions] = useState<MediaAssetSummary[]>(dedupedAssets);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [pendingGallerySelectionIds, setPendingGallerySelectionIds] = useState<string[]>(selectedMediaAssetIds);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMediaOptions(dedupedAssets);
  }, [dedupedAssets]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setPendingGallerySelectionIds(selectedMediaAssetIds);
  }, [selectedMediaAssetIds, isGalleryOpen]);

  const selectedMediaAssets = useMemo(
    () =>
      selectedMediaAssetIds
        .map((id) => mediaOptions.find((asset) => asset.id === id) ?? null)
        .filter((asset): asset is MediaAssetSummary => asset !== null),
    [mediaOptions, selectedMediaAssetIds],
  );

  const galleryTotalPages = getPageCount(mediaOptions.length, GALLERY_PAGE_SIZE);
  const galleryVisibleAssets = mediaOptions.slice((galleryPage - 1) * GALLERY_PAGE_SIZE, galleryPage * GALLERY_PAGE_SIZE);

  useEffect(() => {
    setGalleryPage((current) => Math.min(current, galleryTotalPages));
  }, [galleryTotalPages]);

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
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/admin/uploads", {
          method: "POST",
          body: formData,
        });

        const payload = (await response
          .json()
          .catch(async () => ({ error: await response.text().catch(() => "Upload failed.") }))) as {
          error?: string;
          status?: "uploaded" | "duplicate";
          mediaAsset?: MediaAssetSummary;
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
      setSuccessMessage(`${normalizedIds.length} image${normalizedIds.length === 1 ? "" : "s"} attached from the gallery.`);
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
            {selectedMediaAssets.map((asset) => {
              const previewVariant = getPreferredPreviewVariant(asset.variants);

              return (
                <div key={asset.id} className="composer-attached-media-card">
                  {previewVariant ? (
                    <img
                      src={getMediaVariantUrl(previewVariant.id)}
                      alt={`${asset.originalFilename} attached preview`}
                      className="composer-attached-media-thumb"
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
            <div className="preview-header">
              <div>
                <strong>Browse Gallery</strong>
                <p className="muted">
                  {pendingGallerySelectionIds.length} selected - Attach up to {maxMediaCount} image{maxMediaCount === 1 ? "" : "s"}.
                </p>
              </div>
              <button type="button" className="ghost-link-button" onClick={() => setIsGalleryOpen(false)}>
                Close
              </button>
            </div>

            <div className="composer-gallery-picker-grid">
              {galleryVisibleAssets.map((asset) => {
                const previewVariant = getPreferredPreviewVariant(asset.variants);
                const isSelected = pendingGallerySelectionIds.includes(asset.id);

                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`composer-gallery-picker-card${isSelected ? " is-selected" : ""}`.trim()}
                    onClick={() => togglePendingGallerySelection(asset.id)}
                    aria-pressed={isSelected}
                  >
                    <div className="composer-gallery-picker-thumb-wrap">
                      {previewVariant ? (
                        <img
                          src={getMediaVariantUrl(previewVariant.id)}
                          alt={`${asset.originalFilename} preview`}
                          className="composer-gallery-picker-thumb"
                        />
                      ) : (
                        <div className="composer-gallery-picker-fallback">No preview</div>
                      )}
                      {isSelected ? <span className="composer-gallery-picker-check">Selected</span> : null}
                    </div>
                    <div className="composer-gallery-picker-meta">
                      <strong>{asset.originalFilename}</strong>
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
                <button type="button" className="composer-action-button is-blue" onClick={confirmGallerySelection}>
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
