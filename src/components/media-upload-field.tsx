"use client";

import { useRef, useState } from "react";

type UploadedAsset = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: string;
  width: number;
  height: number;
};

type MediaUploadFieldProps = {
  initialAsset?: UploadedAsset | null;
};

export function MediaUploadField({ initialAsset }: MediaUploadFieldProps) {
  const [mediaAsset, setMediaAsset] = useState<UploadedAsset | null>(initialAsset ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

      setMediaAsset(payload.mediaAsset);
    } catch {
      setError("Upload failed. Check the server logs and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor="mediaUpload">Media upload</label>
      <div className="upload-box">
        <input ref={fileInputRef} id="mediaUpload" type="file" accept="image/*" />
        <p className="hint">Upload one image now. Resizing/derivatives will plug into this foundation later.</p>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Upload Image"}
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        {mediaAsset ? (
          <div className="upload-meta">
            <strong>{mediaAsset.originalFilename}</strong>
            <p className="muted">
              {mediaAsset.mimeType} · {mediaAsset.width}×{mediaAsset.height} · {mediaAsset.sizeBytes} bytes
            </p>
          </div>
        ) : null}
      </div>

      <input type="hidden" name="mediaAssetId" value={mediaAsset?.id ?? ""} />
    </div>
  );
}

