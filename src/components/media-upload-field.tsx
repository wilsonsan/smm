"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { MediaAssetGallery } from "@/components/media-asset-gallery";
import {
  getAvailableVariantSummary,
  formatBytes,
  formatDimensions,
  getMediaVariantLabel,
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
};

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
}: MediaUploadFieldProps) {
  const mergedAssets = useMemo(
    () => dedupeAssets([...(initialAsset ? [initialAsset] : []), ...recentAssets]),
    [initialAsset, recentAssets],
  );
  const [mediaOptions, setMediaOptions] = useState<MediaAssetSummary[]>(mergedAssets);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMediaOptions(mergedAssets);
  }, [mergedAssets]);

  const selectedMediaAsset = selectedMediaAssetId
    ? mediaOptions.find((asset) => asset.id === selectedMediaAssetId) ?? null
    : null;
  const facebookVariant = selectedMediaAsset
    ? getVariantByType(selectedMediaAsset.variants, "FACEBOOK_FEED")
    : null;

  function handleClearMedia() {
    onSelectedMediaAssetIdChange("");
    setError(null);
    setSuccessMessage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
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
      setSuccessMessage("Upload complete. Original, Facebook-safe, and Google-safe versions are ready.");
    } catch {
      setError("Upload failed. Check the server logs and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor="mediaUpload">Media picker</label>
      <div className="upload-box">
        <input ref={fileInputRef} id="mediaUpload" type="file" accept="image/*" />
        <p className="hint">
          Upload a new image or select one from the recent media library. Facebook posts use the processed
          `FACEBOOK_FEED` variant.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Upload Image"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleClearMedia}
            disabled={!selectedMediaAssetId}
          >
            Clear Media
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {successMessage ? <p className="success-text">{successMessage}</p> : null}

        {mediaOptions.length > 0 ? (
          <div className="media-picker-list">
            {mediaOptions.map((asset) => {
              const assetFacebookVariant = getVariantByType(asset.variants, "FACEBOOK_FEED");
              const assetPreviewVariant = getPreferredPreviewVariant(asset.variants);
              const summaryItems = getAvailableVariantSummary(asset.variants);
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={`media-picker-card ${asset.id === selectedMediaAssetId ? "is-selected" : ""}`.trim()}
                  onClick={() => onSelectedMediaAssetIdChange(asset.id)}
                >
                  {assetPreviewVariant ? (
                    <img
                      src={getMediaVariantUrl(assetPreviewVariant.id)}
                      alt={`${asset.originalFilename} preview`}
                      className="media-picker-thumb"
                    />
                  ) : (
                    <div className="media-picker-missing">No preview</div>
                  )}
                  <strong>{asset.originalFilename}</strong>
                  <span>
                    {formatDimensions(asset.width, asset.height)} · {formatBytes(asset.sizeBytes)}
                  </span>
                  <span>{summaryItems.join(" · ") || "Original only"}</span>
                  {!assetFacebookVariant ? <span className="error-text">Missing Facebook-ready version</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {selectedMediaAsset ? (
          <div className="section-stack">
            {facebookVariant ? (
              <div className="panel-body preview-panel">
                <div className="preview-header">
                  <strong>Facebook preview</strong>
                  <span className="badge">{getMediaVariantLabel(facebookVariant.variantType)}</span>
                </div>
                <div className="media-preview-card">
                  <img
                    src={getMediaVariantUrl(facebookVariant.id)}
                    alt="Selected Facebook media preview"
                    className="media-preview-image"
                  />
                  <div className="media-preview-meta">
                    <span>{formatDimensions(facebookVariant.width, facebookVariant.height)}</span>
                    <span>{formatBytes(facebookVariant.sizeBytes)}</span>
                    <span>{facebookVariant.mimeType}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="error-text">
                This asset does not have a valid `FACEBOOK_FEED` variant. Save as draft or upload/select a different
                image before scheduling a Facebook post.
              </p>
            )}

            <MediaAssetGallery
              mediaAsset={selectedMediaAsset}
              heading="Selected media asset"
              showComposerHint
            />
          </div>
        ) : (
          <p className="muted">No media selected. Text-only Facebook posts can still be drafted or scheduled.</p>
        )}
      </div>

      <input type="hidden" name="mediaAssetId" value={selectedMediaAsset?.id ?? ""} />
    </div>
  );
}
