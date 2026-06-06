"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import {
  formatBytes,
  formatDimensions,
  getAvailableVariantSummary,
  getMediaVariantLabel,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  getVariantByType,
  type MediaAssetSummary,
  type MediaVariantSummary,
} from "@/lib/media-presentation";

type MediaAssetGalleryProps = {
  mediaAsset: MediaAssetSummary;
  heading?: string;
  showComposerHint?: boolean;
};

function VariantInfoRow({
  label,
  variant,
  missingMessage = "Generated only when needed",
}: {
  label: string;
  variant: MediaVariantSummary | null;
  missingMessage?: string;
}) {
  if (!variant) {
    return (
      <div className="media-variant-info-card is-missing">
        <strong>{label}</strong>
        <p className="muted">{missingMessage}</p>
      </div>
    );
  }

  return (
    <div className="media-variant-info-card">
      <strong>{label}</strong>
      <p>{formatDimensions(variant.width, variant.height)}</p>
      <p>{formatBytes(variant.sizeBytes)}</p>
      <p>{variant.mimeType}</p>
    </div>
  );
}

export function MediaAssetGallery({
  mediaAsset,
  heading = "Media asset",
  showComposerHint = false,
}: MediaAssetGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const previewVariant = useMemo(() => getPreferredPreviewVariant(mediaAsset.variants), [mediaAsset.variants]);
  const originalVariant = useMemo(() => getVariantByType(mediaAsset.variants, "ORIGINAL"), [mediaAsset.variants]);
  const facebookVariant = useMemo(() => getVariantByType(mediaAsset.variants, "FACEBOOK_FEED"), [mediaAsset.variants]);
  const googleVariant = useMemo(
    () => getVariantByType(mediaAsset.variants, "GOOGLE_BUSINESS_SAFE"),
    [mediaAsset.variants],
  );
  const variantSummary = useMemo(() => getAvailableVariantSummary(mediaAsset.variants), [mediaAsset.variants]);
  const modalPreviewVariant = previewVariant;

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
            {previewVariant ? (
              <img
                src={getMediaVariantUrl(previewVariant.id)}
                alt={`${mediaAsset.originalFilename} preview`}
                className="media-asset-card-thumb"
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

            <p className="muted">Stored as one source image. Platform-ready images are generated temporarily only when publishing.</p>

            <div className="inline-list">
              {variantSummary.map((item) => (
                <span key={item} className="badge">
                  {item}
                </span>
              ))}
            </div>
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
                <p className="muted">Original image preview with publish-time optimization details below.</p>
              </div>
              <button type="button" className="ghost-link-button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>

            <div className="media-modal-layout">
              <div className="media-modal-preview">
                {modalPreviewVariant ? (
                  <img
                    src={getMediaVariantUrl(modalPreviewVariant.id)}
                    alt={`${mediaAsset.originalFilename} original preview`}
                    className="media-modal-image"
                  />
                ) : (
                  <div className="media-picker-missing">No original preview available</div>
                )}
              </div>

              <div className="media-modal-details">
                <div className="media-modal-summary">
                  <strong>Available versions</strong>
                  <div className="inline-list">
                    {variantSummary.map((item) => (
                      <span key={item} className="badge">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="media-variant-info-grid">
                  <VariantInfoRow
                    label={getMediaVariantLabel("ORIGINAL")}
                    variant={originalVariant}
                    missingMessage="Original record missing"
                  />
                  <VariantInfoRow
                    label={getMediaVariantLabel("FACEBOOK_FEED")}
                    variant={facebookVariant}
                    missingMessage="Generated temporarily at Facebook publish time"
                  />
                  <VariantInfoRow
                    label={getMediaVariantLabel("GOOGLE_BUSINESS_SAFE")}
                    variant={googleVariant}
                    missingMessage="Generated temporarily for future Google publishing"
                  />
                </div>

                <p className="hint">
                  Files stay self-hosted and are served through authenticated media routes. Platform-optimized images
                  are generated temporarily at publish time to save storage.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
