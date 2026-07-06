"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { MediaAssetGallerySummary } from "@/lib/media-presentation";
import { formatBytes } from "@/lib/media-presentation";

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

export type MediaUploadResult = {
  uploadedAssets: MediaAssetGallerySummary[];
  uploadedCount: number;
  skippedDuplicateCount: number;
};

type MediaUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: (result: MediaUploadResult) => void;
};

const UPLOADS_PER_PAGE = 12;

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

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 16V5.5" />
      <path d="m8.5 9 3.5-3.5L15.5 9" />
      <path d="M5 18.5h14" />
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

export function MediaUploadModal({ isOpen, onClose, onUploaded }: MediaUploadModalProps) {
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [queuedUploads, setQueuedUploads] = useState<QueuedUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      queuedUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [queuedUploads]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(queuedUploads.length / UPLOADS_PER_PAGE));
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [queuedUploads.length]);

  function resetUploadState() {
    queuedUploads.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setQueuedUploads([]);
    setUploadError(null);
    setUploadProgressLabel(null);
    setIsUploading(false);
    setCurrentPage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  }

  function closeModal() {
    if (isUploading) {
      return;
    }

    resetUploadState();
    onClose();
  }

  function appendQueuedFiles(files: Iterable<File>) {
    setQueuedUploads((current) => {
      const existing = new Set(current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const next = [...current];

      for (const file of files) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          continue;
        }

        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (existing.has(key)) {
          continue;
        }

        existing.add(key);
        next.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }

      return next;
    });

    setUploadError(null);
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

      onUploaded?.({
        uploadedAssets,
        uploadedCount,
        skippedDuplicateCount,
      });

      resetUploadState();
      onClose();
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
      setIsUploading(false);
      setUploadProgressLabel(null);
    }
  }

  if (!isOpen || !hasMounted) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(queuedUploads.length / UPLOADS_PER_PAGE));
  const clampedCurrentPage = Math.min(currentPage, totalPages);
  const visibleQueuedUploads = queuedUploads.slice(
    (clampedCurrentPage - 1) * UPLOADS_PER_PAGE,
    clampedCurrentPage * UPLOADS_PER_PAGE,
  );
  const pageNumbers = getPageNumbers(clampedCurrentPage, totalPages);

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upload media">
      <button type="button" className="modal-dismiss-surface" aria-label="Close upload modal" onClick={closeModal} />
      <div className="modal-card gallery-upload-modal">
        <div className="preview-header">
          <div>
            <strong>Upload Media</strong>
            <p className="muted">Select one or more images, review them here, then confirm the upload.</p>
          </div>
          <button type="button" className="ghost-link-button" onClick={closeModal} disabled={isUploading}>
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
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
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
          <span>or tap to browse your photos</span>
          <span className="gallery-upload-dropzone-button">Choose photos</span>
          <small className="gallery-upload-dropzone-help">Bulk uploads automatically skip duplicate files already in the gallery.</small>
        </button>

        <div className="gallery-upload-mobile-actions">
          <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            Choose From Library
          </button>
          <button type="button" className="gallery-upload-button" onClick={() => cameraInputRef.current?.click()} disabled={isUploading}>
            <UploadIcon />
            <span>Take Photo</span>
          </button>
        </div>

        {queuedUploads.length > 0 ? (
          <div className="gallery-upload-queue">
            <div className="gallery-upload-queue-header">
              <strong>Ready to upload</strong>
              <span>
                {queuedUploads.length} file(s)
                {totalPages > 1 ? ` | Page ${clampedCurrentPage} of ${totalPages}` : ""}
              </span>
            </div>
            {totalPages > 1 ? (
              <div className="gallery-upload-queue-pagination">
                <button
                  type="button"
                  className="gallery-page-button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={clampedCurrentPage === 1 || isUploading}
                >
                  <ArrowLeftIcon />
                  <span>Previous</span>
                </button>
                <div className="gallery-page-numbers">
                  {pageNumbers.map((page, index) =>
                    page === "ELLIPSIS" ? (
                      <span key={`upload-ellipsis-${index}`} className="gallery-page-ellipsis">...</span>
                    ) : (
                      <button
                        key={`upload-page-${page}`}
                        type="button"
                        className={`gallery-page-number${page === clampedCurrentPage ? " is-active" : ""}`.trim()}
                        onClick={() => setCurrentPage(page)}
                        disabled={isUploading}
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
                  disabled={clampedCurrentPage === totalPages || isUploading}
                >
                  <span>Next</span>
                  <ArrowRightIcon />
                </button>
              </div>
            ) : null}
            <div className="gallery-upload-queue-grid">
              {visibleQueuedUploads.map((item) => (
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
          <button type="button" className="secondary-button" onClick={closeModal} disabled={isUploading}>
            Cancel
          </button>
          <button type="button" className="gallery-upload-button" onClick={() => void handleUploadConfirm()} disabled={isUploading || queuedUploads.length === 0}>
            <UploadIcon />
            <span>{isUploading ? "Uploading..." : "Upload"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
