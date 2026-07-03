"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatBytes,
  formatDimensions,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  getVariantByType,
  type MediaAssetSummary,
} from "@/lib/media-presentation";

type MediaAssetGalleryProps = {
  mediaAsset: MediaAssetSummary;
  heading?: string;
  showComposerHint?: boolean;
};

export function MediaAssetGallery({
  mediaAsset,
  heading = "Media asset",
  showComposerHint = false,
}: MediaAssetGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const originalVariant = useMemo(() => getVariantByType(mediaAsset.variants, "ORIGINAL"), [mediaAsset.variants]);
  const displayVariant = useMemo(() => {
    if (originalVariant && originalVariant.mimeType !== "image/heic" && originalVariant.mimeType !== "image/heif") {
      return originalVariant;
    }

    return getPreferredPreviewVariant(mediaAsset.variants);
  }, [mediaAsset.variants, originalVariant]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <div className="media-gallery">
        <div className="media-gallery-header">
          <div>
            <strong>{heading}</strong>
            <p className="muted">
              {mediaAsset.originalFilename} · {formatDimensions(mediaAsset.width, mediaAsset.height)} ·{" "}
              {formatBytes(mediaAsset.sizeBytes)}
            </p>
          </div>
          {showComposerHint ? (
            <span className="badge">Facebook creates a temporary optimized JPEG automatically at publish time</span>
          ) : null}
        </div>

        <button type="button" className="media-asset-card" onClick={() => setIsOpen(true)}>
          <div className="media-asset-card-thumb-wrap">
            {displayVariant ? (
              <span
                aria-hidden="true"
                className="media-asset-card-thumb"
                style={{ backgroundImage: `url(${getMediaVariantUrl(displayVariant.id)})` }}
              />
            ) : (
              <div className="media-picker-missing">No preview available</div>
            )}
          </div>

          <div className="media-asset-card-body">
            <div className="media-asset-card-head">
              <strong>{mediaAsset.originalFilename}</strong>
              <span className="media-card-action">Open details</span>
            </div>
            <p className="muted">{formatDimensions(mediaAsset.width, mediaAsset.height)} · {formatBytes(mediaAsset.sizeBytes)}</p>
          </div>
        </button>
      </div>

      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${mediaAsset.originalFilename} details`}>
          <button
            type="button"
            className="modal-dismiss-surface"
            aria-label="Close media details"
            onClick={() => setIsOpen(false)}
          />
          <div className="modal-card media-modal-card">
            <div className="preview-header">
              <div>
                <strong>{mediaAsset.originalFilename}</strong>
              </div>
              <button type="button" className="ghost-link-button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            <div className="media-modal-layout">
              <div className="media-modal-preview">
                {displayVariant ? (
                  <span
                    aria-hidden="true"
                    className="media-modal-image"
                    style={{ backgroundImage: `url(${getMediaVariantUrl(displayVariant.id)})` }}
                  />
                ) : (
                  <div className="media-picker-missing">No original preview available</div>
                )}
              </div>

              <div className="media-modal-details">
                <div className="media-variant-info-card">
                  <strong>Filename</strong>
                  <p>{mediaAsset.originalFilename}</p>
                </div>
                {originalVariant ? (
                  <div className="media-variant-info-card">
                    <strong>Stored original</strong>
                    <p>{formatDimensions(originalVariant.width, originalVariant.height)} · {formatBytes(originalVariant.sizeBytes)}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
