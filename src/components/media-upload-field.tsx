"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import {
  formatBytes,
  formatDimensions,
  getAvailableVariantSummary,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  getVariantByType,
  type MediaAssetSummary,
} from "@/lib/media-presentation";

type MediaUploadFieldProps = {
  initialAsset?: MediaAssetSummary | null;
  recentAssets: MediaAssetSummary[];
  selectedMediaAssetId: string;
  onSelectedMediaAssetIdChange: (mediaAssetId: string) => void;
  disabled?: boolean;
};

function UploadCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8.5 18.5h8a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.7-1.1A4.2 4.2 0 0 0 8.5 18.5Z" />
      <path d="M12 8.5v8" />
      <path d="m9.2 11.3 2.8-2.8 2.8 2.8" />
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

export function MediaUploadField({
  initialAsset,
  recentAssets,
  selectedMediaAssetId,
  onSelectedMediaAssetIdChange,
  disabled = false,
}: MediaUploadFieldProps) {
  const mergedAssets = useMemo(
    () => dedupeAssets([...(initialAsset ? [initialAsset] : []), ...recentAssets]),
    [initialAsset, recentAssets],
  );
  const [mediaOptions, setMediaOptions] = useState<MediaAssetSummary[]>(mergedAssets);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMediaOptions(mergedAssets);
  }, [mergedAssets]);

  const selectedMediaAsset = selectedMediaAssetId
    ? mediaOptions.find((asset) => asset.id === selectedMediaAssetId) ?? null
    : null;

  async function handleUpload(fileOverride?: File) {
    const file = fileOverride ?? fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Upload failed.");
        return;
      }

      setMediaOptions((current) => dedupeAssets([payload.mediaAsset, ...current]));
      onSelectedMediaAssetIdChange(payload.mediaAsset.id);
      setSuccessMessage("Upload complete. Original, Facebook-ready, and Google-safe versions are ready.");
    } catch {
      setError("Upload failed. Check the server logs and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileSelection() {
    void handleUpload();
  }

  function handleBrowseClick() {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }

  function handleClearMedia() {
    onSelectedMediaAssetIdChange("");
    setError(null);
    setSuccessMessage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
          const droppedFile = event.dataTransfer.files?.[0];
          if (droppedFile) {
            void handleUpload(droppedFile);
          }
        }}
      >
        <input
          ref={fileInputRef}
          id="mediaUpload"
          type="file"
          accept="image/*"
          onChange={handleFileSelection}
          disabled={disabled || isUploading}
          className="composer-hidden-file-input"
        />

        <div className="composer-upload-icon" aria-hidden="true">
          <UploadCloudIcon />
        </div>
        <strong>Drag &amp; drop images here</strong>
        <span>or</span>
        <button
          type="button"
          className="composer-browse-button"
          onClick={handleBrowseClick}
          disabled={disabled || isUploading}
        >
          {isUploading ? "Uploading..." : "Browse Files"}
        </button>
      </div>

      {selectedMediaAsset ? (
        <div className="composer-selected-media-bar">
          <div>
            <strong>{selectedMediaAsset.originalFilename}</strong>
            <span>
              {formatDimensions(selectedMediaAsset.width, selectedMediaAsset.height)} · {formatBytes(selectedMediaAsset.sizeBytes)}
            </span>
          </div>
          <button
            type="button"
            className="composer-clear-media-button"
            onClick={handleClearMedia}
            disabled={disabled}
          >
            Clear Media
          </button>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {successMessage ? <p className="success-text">{successMessage}</p> : null}

      <div className="composer-recent-media-header">
        <strong>Recent Uploads</strong>
        <Link href="/dashboard/media">View all</Link>
      </div>

      {mediaOptions.length > 0 ? (
        <div className="composer-recent-media-grid">
          {mediaOptions.slice(0, 6).map((asset) => {
            const previewVariant = getPreferredPreviewVariant(asset.variants);
            const facebookVariant = getVariantByType(asset.variants, "FACEBOOK_FEED");
            const summaryItems = getAvailableVariantSummary(asset.variants);

            return (
              <button
                key={asset.id}
                type="button"
                className={`composer-recent-media-card${asset.id === selectedMediaAssetId ? " is-selected" : ""}`.trim()}
                onClick={() => onSelectedMediaAssetIdChange(asset.id)}
                disabled={disabled}
                aria-pressed={asset.id === selectedMediaAssetId}
              >
                {previewVariant ? (
                  <img
                    src={getMediaVariantUrl(previewVariant.id)}
                    alt={`${asset.originalFilename} preview`}
                    className="composer-recent-media-thumb"
                  />
                ) : (
                  <div className="composer-recent-media-fallback">No preview</div>
                )}
                <div className="composer-recent-media-meta">
                  <strong>{asset.originalFilename}</strong>
                  <span>{summaryItems.join(" · ") || "Original only"}</span>
                  <span>{facebookVariant ? "Facebook ready" : "Missing Facebook variant"}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">No uploads yet. Your recent media will appear here after the first image is processed.</p>
      )}

      <input type="hidden" name="mediaAssetId" value={selectedMediaAsset?.id ?? ""} />
    </div>
  );
}
