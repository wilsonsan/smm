"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { getMediaVariantUrl } from "@/lib/media-presentation";

type MediaEditorVariant = {
  id: string;
  variantType:
    | "ORIGINAL"
    | "GALLERY_THUMBNAIL"
    | "GALLERY_PREVIEW"
    | "FACEBOOK_FEED"
    | "GOOGLE_BUSINESS_SAFE"
    | "INSTAGRAM_FEED_PLACEHOLDER";
};

type MediaAssetEditorProps = {
  mediaAsset: {
    id: string;
    originalFilename: string;
    mimeType: string;
    width: number;
    height: number;
    isEdited: boolean;
    variants: MediaEditorVariant[];
    editHistoryJson: unknown;
  };
};

type AspectRatioKey = "free" | "original" | "1:1" | "4:5" | "9:16" | "4:3";

type EditorSnapshot = {
  crop: Point;
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectKey: AspectRatioKey;
};

const ASPECT_RATIO_VALUES: Record<Exclude<AspectRatioKey, "free" | "original">, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "9:16": 9 / 16,
  "4:3": 4 / 3,
};

const QUICK_PRESETS: Array<{ key: AspectRatioKey; label: string }> = [
  { key: "1:1", label: "Square" },
  { key: "4:3", label: "Landscape" },
  { key: "4:5", label: "Portrait" },
];

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9 7H5v4" />
      <path d="M5 11a8 8 0 1 0 2.3-5.6L5 7" />
    </svg>
  );
}

function RedoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15 7h4v4" />
      <path d="M19 11a8 8 0 1 1-2.3-5.6L19 7" />
    </svg>
  );
}

function FlipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 6h7v12H4z" />
      <path d="M13 6h7l-3.5 3.5L20 13h-7z" />
    </svg>
  );
}

function FacebookMiniIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.3 20v-6h2l.4-2.3h-2.4V10c0-.7.2-1.2 1.2-1.2H16V6.7c-.3 0-.9-.1-1.7-.1-1.7 0-2.8 1-2.8 3v1.7H9.6V14h1.9v6h1.8Z" />
    </svg>
  );
}

function GoogleMiniIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M21.8 12.3c0-.7-.1-1.3-.2-1.9H12v3.6h5.5a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3-4.5 3-7.4Z" />
      <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.4-2.6c-.9.6-2 .9-3.2.9-2.5 0-4.7-1.7-5.4-4H3.1v2.6A10 10 0 0 0 12 22Z" />
      <path d="M6.6 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.5-2.6Z" />
      <path d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.8-2.8A9.8 9.8 0 0 0 12 2 10 10 0 0 0 3.1 7.5l3.5 2.6c.7-2.3 2.9-4 5.4-4Z" />
    </svg>
  );
}

function ZoomMinusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M8.5 11h5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function ZoomPlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M11 8.5v5" />
      <path d="M8.5 11h5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function getOriginalVariantId(variants: MediaEditorVariant[]) {
  return variants.find((variant) => variant.variantType === "ORIGINAL")?.id ?? null;
}

function getOriginalAspectRatio(mediaAsset: MediaAssetEditorProps["mediaAsset"]) {
  if (!mediaAsset.width || !mediaAsset.height) {
    return 1;
  }

  return mediaAsset.width / mediaAsset.height;
}

function resolveAspectRatio(aspectKey: AspectRatioKey, originalAspectRatio: number) {
  if (aspectKey === "free") {
    return undefined;
  }

  if (aspectKey === "original") {
    return originalAspectRatio;
  }

  return ASPECT_RATIO_VALUES[aspectKey];
}

function parseInitialEditorState(mediaAsset: MediaAssetEditorProps["mediaAsset"]): EditorSnapshot {
  const history = typeof mediaAsset.editHistoryJson === "object" && mediaAsset.editHistoryJson ? (mediaAsset.editHistoryJson as Record<string, unknown>) : null;
  const initialAspectKey =
    typeof history?.aspectRatio === "string" &&
    ["free", "original", "1:1", "4:5", "9:16", "4:3"].includes(history.aspectRatio)
      ? (history.aspectRatio as AspectRatioKey)
      : "original";

  return {
    crop: { x: 0, y: 0 },
    zoom: typeof history?.zoom === "number" ? Math.min(4, Math.max(1, history.zoom)) : 1,
    rotation: typeof history?.rotation === "number" ? Math.min(180, Math.max(-180, history.rotation)) : 0,
    flipHorizontal: history?.flipHorizontal === true,
    flipVertical: history?.flipVertical === true,
    aspectKey: initialAspectKey,
  };
}

function aspectOptionLabel(label: string, icon?: ReactNode) {
  return (
    <span className="media-editor-aspect-label">
      {icon ? <span className="media-editor-aspect-icon">{icon}</span> : null}
      <span>{label}</span>
    </span>
  );
}

export function MediaAssetEditor({ mediaAsset }: MediaAssetEditorProps) {
  const router = useRouter();
  const initialSnapshotRef = useRef<EditorSnapshot>(parseInitialEditorState(mediaAsset));
  const snapshotRef = useRef<EditorSnapshot>(initialSnapshotRef.current);
  const historyRef = useRef<EditorSnapshot[]>([initialSnapshotRef.current]);
  const historyIndexRef = useRef(0);
  const originalVariantId = getOriginalVariantId(mediaAsset.variants);
  const originalImageUrl = useMemo(() => (originalVariantId ? getMediaVariantUrl(originalVariantId) : null), [originalVariantId]);
  const originalAspectRatio = useMemo(() => getOriginalAspectRatio(mediaAsset), [mediaAsset]);
  const [crop, setCrop] = useState<Point>(initialSnapshotRef.current.crop);
  const [zoom, setZoom] = useState(initialSnapshotRef.current.zoom);
  const [rotation, setRotation] = useState(initialSnapshotRef.current.rotation);
  const [flipHorizontal, setFlipHorizontal] = useState(initialSnapshotRef.current.flipHorizontal);
  const [flipVertical, setFlipVertical] = useState(initialSnapshotRef.current.flipVertical);
  const [aspectKey, setAspectKey] = useState<AspectRatioKey>(initialSnapshotRef.current.aspectKey);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [history, setHistory] = useState<EditorSnapshot[]>([initialSnapshotRef.current]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentAspectRatio = useMemo(() => resolveAspectRatio(aspectKey, originalAspectRatio), [aspectKey, originalAspectRatio]);

  const currentSnapshot = useMemo<EditorSnapshot>(
    () => ({
      crop,
      zoom,
      rotation,
      flipHorizontal,
      flipVertical,
      aspectKey,
    }),
    [aspectKey, crop, flipHorizontal, flipVertical, rotation, zoom],
  );

  useEffect(() => {
    snapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  function applySnapshot(snapshot: EditorSnapshot) {
    snapshotRef.current = snapshot;
    setCrop(snapshot.crop);
    setZoom(snapshot.zoom);
    setRotation(snapshot.rotation);
    setFlipHorizontal(snapshot.flipHorizontal);
    setFlipVertical(snapshot.flipVertical);
    setAspectKey(snapshot.aspectKey);
  }

  const commitSnapshot = useCallback((snapshot: EditorSnapshot) => {
    const previous = historyRef.current[historyIndexRef.current];
    if (JSON.stringify(previous) === JSON.stringify(snapshot)) {
      return;
    }

    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot];
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, []);

  function updateSnapshot(updater: (current: EditorSnapshot) => EditorSnapshot) {
    const nextSnapshot = updater(snapshotRef.current);
    applySnapshot(nextSnapshot);
    commitSnapshot(nextSnapshot);
  }

  function handleUndo() {
    if (historyIndex === 0) {
      return;
    }

    const nextIndex = historyIndex - 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    applySnapshot(history[nextIndex]);
  }

  function handleRedo() {
    if (historyIndex >= history.length - 1) {
      return;
    }

    const nextIndex = historyIndex + 1;
    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
    applySnapshot(history[nextIndex]);
  }

  function handleResetEditor() {
    applySnapshot(initialSnapshotRef.current);
    historyRef.current = [initialSnapshotRef.current];
    historyIndexRef.current = 0;
    setHistory([initialSnapshotRef.current]);
    setHistoryIndex(0);
    setMessage("Editor controls reset.");
    setError(null);
  }

  async function handleSaveChanges() {
    if (!croppedAreaPixels) {
      setError("Move or resize the crop area before saving.");
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${mediaAsset.id}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "save",
          crop: croppedAreaPixels,
          zoom,
          rotation,
          flipHorizontal,
          flipVertical,
          aspectRatio: aspectKey,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not save the photo changes.");
      }

      router.push("/dashboard/media");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the photo changes.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRevertToOriginal() {
    if (!mediaAsset.isEdited) {
      return;
    }

    const confirmed = window.confirm("Revert this image back to the original upload?");
    if (!confirmed) {
      return;
    }

    setIsReverting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${mediaAsset.id}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "revert" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not revert the image.");
      }

      router.push("/dashboard/media");
      router.refresh();
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : "Could not revert the image.");
    } finally {
      setIsReverting(false);
    }
  }

  return (
    <div className="media-editor-shell">
      <div className="media-editor-topbar">
        <div className="media-editor-topbar-left">
          <button type="button" className="media-editor-back-button" onClick={() => router.push("/dashboard/media")}>
            <ArrowLeftIcon className="media-editor-inline-icon" />
            <span>Back to Gallery</span>
          </button>
          <div className="media-editor-heading">
            <h1>Edit Photo</h1>
            <p>{mediaAsset.originalFilename}</p>
          </div>
        </div>
        <div className="media-editor-topbar-actions">
          <button type="button" className="media-editor-icon-button" onClick={handleUndo} disabled={historyIndex === 0}>
            <UndoIcon className="media-editor-inline-icon" />
            <span className="sr-only">Undo</span>
          </button>
          <button type="button" className="media-editor-icon-button" onClick={handleRedo} disabled={historyIndex >= history.length - 1}>
            <RedoIcon className="media-editor-inline-icon" />
            <span className="sr-only">Redo</span>
          </button>
          <button type="button" className="secondary-button" onClick={handleResetEditor}>
            Reset
          </button>
          {mediaAsset.isEdited ? (
            <button type="button" className="secondary-button" onClick={() => void handleRevertToOriginal()} disabled={isReverting}>
              {isReverting ? "Reverting..." : "Revert to Original"}
            </button>
          ) : null}
          <button type="button" className="gallery-upload-button" onClick={() => void handleSaveChanges()} disabled={isSaving || !originalImageUrl}>
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {error ? <p className="error-text media-editor-feedback">{error}</p> : null}
      {message ? <p className="success-text media-editor-feedback">{message}</p> : null}

      <div className="media-editor-layout media-editor-layout--crop-only">
        <main className="media-editor-workspace">
          <div className="media-editor-canvas-card">
            <div className="media-editor-canvas">
              {originalImageUrl ? (
                <Cropper
                  image={originalImageUrl}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={currentAspectRatio}
                  cropShape="rect"
                  showGrid
                  restrictPosition={false}
                  onCropChange={setCrop}
                  onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onInteractionEnd={() => commitSnapshot(snapshotRef.current)}
                  objectFit="contain"
                  classes={{
                    containerClassName: "media-editor-cropper-container",
                    cropAreaClassName: "media-editor-crop-area",
                    mediaClassName: `media-editor-crop-image${flipHorizontal ? " is-flipped-horizontal" : ""}${flipVertical ? " is-flipped-vertical" : ""}`.trim(),
                  }}
                />
              ) : (
                <div className="media-editor-empty-state">
                  <p>Could not load the original image for editing.</p>
                </div>
              )}
            </div>

            <div className="media-editor-bottom-controls">
              <div className="media-editor-rotate-controls">
                <button
                  type="button"
                  className="media-editor-control-pill"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, flipVertical: !snapshot.flipVertical }))}
                >
                  <FlipIcon className="media-editor-inline-icon" />
                  <span>Flip V</span>
                </button>
                <button
                  type="button"
                  className="media-editor-control-pill"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, flipHorizontal: !snapshot.flipHorizontal }))}
                >
                  <FlipIcon className="media-editor-inline-icon" />
                  <span>Flip</span>
                </button>
                <button
                  type="button"
                  className="media-editor-control-pill"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, rotation: Math.max(-180, snapshot.rotation - 90) }))}
                >
                  <span>-90°</span>
                </button>
                <div className="media-editor-rotation-slider">
                  <span>{Math.round(rotation)}°</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={rotation}
                    onChange={(event) => setRotation(Number(event.target.value))}
                    onMouseUp={() => commitSnapshot({ ...snapshotRef.current, rotation })}
                    onTouchEnd={() => commitSnapshot({ ...snapshotRef.current, rotation })}
                  />
                </div>
                <button
                  type="button"
                  className="media-editor-control-pill"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, rotation: Math.min(180, snapshot.rotation + 90) }))}
                >
                  <span>+90°</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className="media-editor-sidebar">
          <div className="media-editor-panel">
            <div className="media-editor-panel-heading">
              <strong>Crop</strong>
            </div>

            <div className="media-editor-section">
              <span className="media-editor-section-label">Aspect Ratio</span>
              <div className="media-editor-aspect-grid">
                <button type="button" className={`media-editor-aspect-button${aspectKey === "free" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "free" }))}>
                  {aspectOptionLabel("Free")}
                </button>
                <button type="button" className={`media-editor-aspect-button${aspectKey === "original" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "original" }))}>
                  {aspectOptionLabel("Original")}
                </button>
                <button type="button" className={`media-editor-aspect-button${aspectKey === "1:1" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "1:1" }))}>
                  {aspectOptionLabel("1:1")}
                </button>
                <button type="button" className={`media-editor-aspect-button${aspectKey === "4:5" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "4:5" }))}>
                  {aspectOptionLabel("4:5", <FacebookMiniIcon className="media-editor-platform-mark" />)}
                </button>
                <button type="button" className={`media-editor-aspect-button${aspectKey === "9:16" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "9:16" }))}>
                  {aspectOptionLabel("9:16")}
                </button>
                <button type="button" className={`media-editor-aspect-button${aspectKey === "4:3" ? " is-active" : ""}`.trim()} onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: "4:3" }))}>
                  {aspectOptionLabel("4:3", <GoogleMiniIcon className="media-editor-platform-mark" />)}
                </button>
              </div>
            </div>

            <div className="media-editor-section">
              <span className="media-editor-section-label">Presets</span>
              <div className="media-editor-preset-row">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={`media-editor-preset-button${aspectKey === preset.key ? " is-active" : ""}`.trim()}
                    onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, aspectKey: preset.key }))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="media-editor-section">
              <span className="media-editor-section-label">Zoom</span>
              <div className="media-editor-zoom-row">
                <button
                  type="button"
                  className="media-editor-zoom-button"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, zoom: Math.max(1, Number((snapshot.zoom - 0.1).toFixed(2))) }))}
                >
                  <ZoomMinusIcon className="media-editor-inline-icon" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  onMouseUp={() => commitSnapshot({ ...snapshotRef.current, zoom })}
                  onTouchEnd={() => commitSnapshot({ ...snapshotRef.current, zoom })}
                />
                <button
                  type="button"
                  className="media-editor-zoom-button"
                  onClick={() => updateSnapshot((snapshot) => ({ ...snapshot, zoom: Math.min(4, Number((snapshot.zoom + 0.1).toFixed(2))) }))}
                >
                  <ZoomPlusIcon className="media-editor-inline-icon" />
                </button>
                <span className="media-editor-zoom-value">{Math.round(zoom * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="media-editor-panel media-editor-tips-card">
            <div className="media-editor-panel-heading">
              <strong>Tips</strong>
            </div>
            <ul>
              <li>Drag to reposition the image</li>
              <li>Scroll to zoom</li>
              <li>Use the grid for better alignment</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
