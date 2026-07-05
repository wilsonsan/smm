"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type SVGProps } from "react";
import { MediaUploadModal, type MediaUploadResult } from "@/components/media-upload-modal";

function UploadCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 18.5a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 12a3.5 3.5 0 0 1-.5 7H7Z" />
      <path d="M12 15.5V9" />
      <path d="m9.5 11.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

function buildUploadSummary(result: MediaUploadResult) {
  if (result.uploadedCount > 0 && result.skippedDuplicateCount > 0) {
    return `Uploaded ${result.uploadedCount} item${result.uploadedCount === 1 ? "" : "s"} and skipped ${result.skippedDuplicateCount} duplicate${result.skippedDuplicateCount === 1 ? "" : "s"}.`;
  }

  if (result.uploadedCount > 0) {
    return `Uploaded ${result.uploadedCount} item${result.uploadedCount === 1 ? "" : "s"}.`;
  }

  if (result.skippedDuplicateCount > 0) {
    return `Skipped ${result.skippedDuplicateCount} duplicate${result.skippedDuplicateCount === 1 ? "" : "s"} already in the gallery.`;
  }

  return null;
}

export function DashboardMobileUploadAction() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [message]);

  function handleUploaded(result: MediaUploadResult) {
    setMessage(buildUploadSummary(result));
  }

  return (
    <>
      <button type="button" className="dashboard-mobile-upload-button" onClick={() => setIsOpen(true)}>
        <span className="dashboard-mobile-upload-icon" aria-hidden="true">
          <UploadCloudIcon />
        </span>
        <span className="dashboard-mobile-upload-copy">
          <strong>Upload Media</strong>
          <span>Bulk upload new photos straight from your phone.</span>
        </span>
      </button>
      <MediaUploadModal isOpen={isOpen} onClose={() => setIsOpen(false)} onUploaded={handleUploaded} />
      {hasMounted && message
        ? createPortal(
            <div className="dashboard-mobile-upload-toast success-text" role="status" aria-live="polite">
              {message}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
