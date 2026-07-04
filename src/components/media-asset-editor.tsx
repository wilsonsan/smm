"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type SVGProps } from "react";
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
type EditorTool = "crop" | "annotate";
type AnnotationTool = "text" | "arrow" | "rect" | "circle" | "draw";
type AnnotationColor = "#ffffff" | "#000000" | "#4d8dff" | "#ff5f73" | "#42d392" | "#ffd84d";

type AnnotationPoint = {
  x: number;
  y: number;
};

type TextAnnotation = {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  textSizeRatio: number;
};

type ArrowAnnotation = {
  id: string;
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidthRatio: number;
};

type ShapeAnnotation = {
  id: string;
  kind: "rect" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidthRatio: number;
};

type DrawAnnotation = {
  id: string;
  kind: "draw";
  points: AnnotationPoint[];
  color: string;
  strokeWidthRatio: number;
};

type Annotation = TextAnnotation | ArrowAnnotation | ShapeAnnotation | DrawAnnotation;

type AnnotationPayload = {
  items: Annotation[];
};

type EditorSnapshot = {
  crop: Point;
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectKey: AspectRatioKey;
  annotations: Annotation[];
};

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DragState =
  | {
      mode: "move";
      annotationId: string;
      anchorPoint: AnnotationPoint;
      originAnnotation: Annotation;
    }
  | {
      mode: "create-arrow";
      annotationId: string;
      startPoint: AnnotationPoint;
    }
  | {
      mode: "create-rect";
      annotationId: string;
      startPoint: AnnotationPoint;
    }
  | {
      mode: "create-circle";
      annotationId: string;
      startPoint: AnnotationPoint;
    }
  | {
      mode: "create-draw";
      annotationId: string;
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

const ANNOTATION_COLORS: AnnotationColor[] = ["#ffffff", "#000000", "#4d8dff", "#ff5f73", "#42d392", "#ffd84d"];

const ANNOTATION_TOOL_OPTIONS: Array<{ value: AnnotationTool; label: string }> = [
  { value: "text", label: "Text" },
  { value: "arrow", label: "Arrow" },
  { value: "rect", label: "Rectangle" },
  { value: "circle", label: "Circle" },
  { value: "draw", label: "Draw" },
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

function CropIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 3v15a3 3 0 0 0 3 3h12" />
      <path d="M18 8V6a3 3 0 0 0-3-3H9" />
      <path d="M8 8h12v12H8z" />
    </svg>
  );
}

function AnnotateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m5 19 3.5-.8L18 8.7a2.1 2.1 0 0 0 0-3l-.7-.7a2.1 2.1 0 0 0-3 0L4.8 14.5 4 18z" />
      <path d="M12 6l6 6" />
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

function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeRect(input: { x: number; y: number; width: number; height: number }) {
  const x = input.width >= 0 ? input.x : input.x + input.width;
  const y = input.height >= 0 ? input.y : input.y + input.height;

  return {
    x: clampUnit(x),
    y: clampUnit(y),
    width: Math.min(1, Math.abs(input.width)),
    height: Math.min(1, Math.abs(input.height)),
  };
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

function isAnnotationRecord(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const annotation = value as Record<string, unknown>;
  return typeof annotation.id === "string" && typeof annotation.kind === "string";
}

function parseInitialAnnotations(mediaAsset: MediaAssetEditorProps["mediaAsset"]) {
  const history = typeof mediaAsset.editHistoryJson === "object" && mediaAsset.editHistoryJson ? (mediaAsset.editHistoryJson as Record<string, unknown>) : null;
  const annotationsValue = history?.annotations;

  if (!annotationsValue || typeof annotationsValue !== "object") {
    return [] as Annotation[];
  }

  const items = (annotationsValue as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [] as Annotation[];
  }

  return items.filter(isAnnotationRecord) as Annotation[];
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
    annotations: parseInitialAnnotations(mediaAsset),
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

function getAnnotationBoundingBox(annotation: Annotation) {
  if (annotation.kind === "text") {
    return {
      x: annotation.x,
      y: annotation.y - Math.max(0.04, annotation.textSizeRatio * 1.1),
      width: Math.max(0.08, Math.min(0.45, annotation.text.length * annotation.textSizeRatio * 0.58)),
      height: Math.max(0.05, annotation.textSizeRatio * 1.4),
    };
  }

  if (annotation.kind === "arrow") {
    const minX = Math.min(annotation.x1, annotation.x2);
    const minY = Math.min(annotation.y1, annotation.y2);
    const maxX = Math.max(annotation.x1, annotation.x2);
    const maxY = Math.max(annotation.y1, annotation.y2);
    return {
      x: minX,
      y: minY,
      width: Math.max(0.01, maxX - minX),
      height: Math.max(0.01, maxY - minY),
    };
  }

  if (annotation.kind === "draw") {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(0.01, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(0.01, Math.max(...ys) - Math.min(...ys)),
    };
  }

  return {
    x: annotation.x,
    y: annotation.y,
    width: Math.max(0.01, annotation.width),
    height: Math.max(0.01, annotation.height),
  };
}

function moveAnnotation(annotation: Annotation, deltaX: number, deltaY: number): Annotation {
  if (annotation.kind === "text") {
    return {
      ...annotation,
      x: clampUnit(annotation.x + deltaX),
      y: clampUnit(annotation.y + deltaY),
    };
  }

  if (annotation.kind === "arrow") {
    return {
      ...annotation,
      x1: clampUnit(annotation.x1 + deltaX),
      y1: clampUnit(annotation.y1 + deltaY),
      x2: clampUnit(annotation.x2 + deltaX),
      y2: clampUnit(annotation.y2 + deltaY),
    };
  }

  if (annotation.kind === "draw") {
    return {
      ...annotation,
      points: annotation.points.map((point) => ({
        x: clampUnit(point.x + deltaX),
        y: clampUnit(point.y + deltaY),
      })),
    };
  }

  return {
    ...annotation,
    x: clampUnit(annotation.x + deltaX),
    y: clampUnit(annotation.y + deltaY),
  };
}

function getStrokeWidthRatioFromPixels(pixels: number, overlay: OverlayRect | null) {
  if (!overlay) {
    return 0.01;
  }
  return Math.max(0.001, Math.min(0.1, pixels / Math.max(1, Math.min(overlay.width, overlay.height))));
}

function getTextSizeRatioFromPixels(pixels: number, overlay: OverlayRect | null) {
  if (!overlay) {
    return 0.035;
  }
  return Math.max(0.005, Math.min(0.25, pixels / Math.max(1, Math.min(overlay.width, overlay.height))));
}

function getStrokeWidthPixelsFromRatio(ratio: number, overlay: OverlayRect | null) {
  if (!overlay) {
    return 6;
  }
  return Math.max(2, Math.round(ratio * Math.max(1, Math.min(overlay.width, overlay.height))));
}

function getTextSizePixelsFromRatio(ratio: number, overlay: OverlayRect | null) {
  if (!overlay) {
    return 34;
  }
  return Math.max(14, Math.round(ratio * Math.max(1, Math.min(overlay.width, overlay.height))));
}

function getAnnotationColor(annotation: Annotation | null, fallback: AnnotationColor) {
  if (!annotation) {
    return fallback;
  }
  return annotation.color as AnnotationColor;
}

export function MediaAssetEditor({ mediaAsset }: MediaAssetEditorProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const initialSnapshotRef = useRef<EditorSnapshot>(parseInitialEditorState(mediaAsset));
  const annotationsRef = useRef<Annotation[]>(initialSnapshotRef.current.annotations);
  const snapshotRef = useRef<EditorSnapshot>(initialSnapshotRef.current);
  const selectedAnnotationIdRef = useRef<string | null>(null);
  const historyRef = useRef<EditorSnapshot[]>([initialSnapshotRef.current]);
  const historyIndexRef = useRef(0);
  const originalVariantId = getOriginalVariantId(mediaAsset.variants);
  const originalImageUrl = useMemo(() => (originalVariantId ? getMediaVariantUrl(originalVariantId) : null), [originalVariantId]);
  const originalAspectRatio = useMemo(() => getOriginalAspectRatio(mediaAsset), [mediaAsset]);
  const [activeTool, setActiveTool] = useState<EditorTool>("crop");
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("text");
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>("#ffffff");
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState(6);
  const [annotationTextSize, setAnnotationTextSize] = useState(34);
  const [crop, setCrop] = useState<Point>(initialSnapshotRef.current.crop);
  const [zoom, setZoom] = useState(initialSnapshotRef.current.zoom);
  const [rotation, setRotation] = useState(initialSnapshotRef.current.rotation);
  const [flipHorizontal, setFlipHorizontal] = useState(initialSnapshotRef.current.flipHorizontal);
  const [flipVertical, setFlipVertical] = useState(initialSnapshotRef.current.flipVertical);
  const [aspectKey, setAspectKey] = useState<AspectRatioKey>(initialSnapshotRef.current.aspectKey);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialSnapshotRef.current.annotations);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
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
      annotations,
    }),
    [annotations, aspectKey, crop, flipHorizontal, flipVertical, rotation, zoom],
  );

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  useEffect(() => {
    snapshotRef.current = currentSnapshot;
  }, [currentSnapshot]);

  useEffect(() => {
    selectedAnnotationIdRef.current = selectedAnnotationId;
  }, [selectedAnnotationId]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [annotations, selectedAnnotationId],
  );

  function readCropAreaRect() {
    if (!canvasRef.current) {
      return;
    }

    const cropArea = canvasRef.current.querySelector<HTMLElement>(".reactEasyCrop_CropArea");
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const cropRect = cropArea?.getBoundingClientRect();

    if (!cropRect || cropRect.width <= 0 || cropRect.height <= 0) {
      return;
    }

    setOverlayRect({
      left: cropRect.left - canvasRect.left,
      top: cropRect.top - canvasRect.top,
      width: cropRect.width,
      height: cropRect.height,
    });
  }

  useEffect(() => {
    readCropAreaRect();
    if (!canvasRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      readCropAreaRect();
    });

    resizeObserver.observe(canvasRef.current);
    const cropArea = canvasRef.current.querySelector<HTMLElement>(".reactEasyCrop_CropArea");
    if (cropArea) {
      resizeObserver.observe(cropArea);
    }

    window.addEventListener("resize", readCropAreaRect);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", readCropAreaRect);
    };
  }, [activeTool, aspectKey, originalImageUrl]);

  useEffect(() => {
    if (!selectedAnnotation) {
      return;
    }

    setAnnotationColor(getAnnotationColor(selectedAnnotation, "#ffffff"));
    if (selectedAnnotation.kind === "text") {
      setAnnotationTextSize(getTextSizePixelsFromRatio(selectedAnnotation.textSizeRatio, overlayRect));
    } else {
      setAnnotationStrokeWidth(getStrokeWidthPixelsFromRatio(selectedAnnotation.strokeWidthRatio, overlayRect));
    }
  }, [overlayRect, selectedAnnotation]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        selectedAnnotationIdRef.current = null;
        setSelectedAnnotationId(null);
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedAnnotationIdRef.current) {
        event.preventDefault();
        const annotationId = selectedAnnotationIdRef.current;
        if (!annotationId) {
          return;
        }

        const nextAnnotations = annotationsRef.current.filter((annotation) => annotation.id !== annotationId);
        annotationsRef.current = nextAnnotations;
        selectedAnnotationIdRef.current = null;
        setAnnotations(nextAnnotations);
        setSelectedAnnotationId(null);
        const nextSnapshot = { ...snapshotRef.current, annotations: nextAnnotations };
        const previous = historyRef.current[historyIndexRef.current];
        if (JSON.stringify(previous) !== JSON.stringify(nextSnapshot)) {
          const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), nextSnapshot];
          historyRef.current = nextHistory;
          historyIndexRef.current = nextHistory.length - 1;
          setHistory(nextHistory);
          setHistoryIndex(nextHistory.length - 1);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function applySnapshot(snapshot: EditorSnapshot) {
    snapshotRef.current = snapshot;
    annotationsRef.current = snapshot.annotations;
    setCrop(snapshot.crop);
    setZoom(snapshot.zoom);
    setRotation(snapshot.rotation);
    setFlipHorizontal(snapshot.flipHorizontal);
    setFlipVertical(snapshot.flipVertical);
    setAspectKey(snapshot.aspectKey);
    setAnnotations(snapshot.annotations);
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

  function replaceAnnotation(annotationId: string, nextAnnotation: Annotation, options?: { commit?: boolean }) {
    setAnnotations((current) => {
      const nextAnnotations = current.map((annotation) => (annotation.id === annotationId ? nextAnnotation : annotation));
      annotationsRef.current = nextAnnotations;
      if (options?.commit) {
        commitSnapshot({ ...snapshotRef.current, annotations: nextAnnotations });
      }
      return nextAnnotations;
    });
  }

  function beginMoveAnnotation(annotation: Annotation, anchorPoint: AnnotationPoint) {
    selectedAnnotationIdRef.current = annotation.id;
    setSelectedAnnotationId(annotation.id);
    dragStateRef.current = {
      mode: "move",
      annotationId: annotation.id,
      anchorPoint,
      originAnnotation: annotation,
    };
  }

  const removeSelectedAnnotation = useCallback(() => {
    const annotationId = selectedAnnotationIdRef.current;
    if (!annotationId) {
      return;
    }

    const nextAnnotations = annotationsRef.current.filter((annotation) => annotation.id !== annotationId);
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId(null);
    commitSnapshot({ ...snapshotRef.current, annotations: nextAnnotations });
  }, [commitSnapshot]);

  function clearAllAnnotations() {
    if (annotations.length === 0) {
      return;
    }

    setAnnotations([]);
    annotationsRef.current = [];
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId(null);
    commitSnapshot({ ...snapshotRef.current, annotations: [] });
  }

  function handleUndo() {
    if (historyIndex === 0) {
      return;
    }

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    historyIndexRef.current = nextIndex;
    applySnapshot(history[nextIndex]);
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId(null);
  }

  function handleRedo() {
    if (historyIndex >= history.length - 1) {
      return;
    }

    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    historyIndexRef.current = nextIndex;
    applySnapshot(history[nextIndex]);
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId(null);
  }

  function handleResetEditor() {
    applySnapshot(initialSnapshotRef.current);
    setHistory([initialSnapshotRef.current]);
    setHistoryIndex(0);
    historyRef.current = [initialSnapshotRef.current];
    historyIndexRef.current = 0;
    annotationsRef.current = initialSnapshotRef.current.annotations;
    snapshotRef.current = initialSnapshotRef.current;
    selectedAnnotationIdRef.current = null;
    setSelectedAnnotationId(null);
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
          annotations: {
            items: annotations,
          },
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

  function getPointerPoint(event: ReactPointerEvent<SVGElement | HTMLDivElement>) {
    if (!overlayRect || !canvasRef.current) {
      return null;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = clampUnit((event.clientX - canvasRect.left - overlayRect.left) / overlayRect.width);
    const y = clampUnit((event.clientY - canvasRect.top - overlayRect.top) / overlayRect.height);
    return { x, y };
  }

  function beginCreateAnnotation(event: ReactPointerEvent<SVGSVGElement>) {
    if (activeTool !== "annotate" || !overlayRect) {
      return;
    }

    const point = getPointerPoint(event);
    if (!point) {
      return;
    }

    setError(null);
    setMessage(null);

    if (annotationTool === "text") {
      const text = window.prompt("Enter annotation text:");
      if (!text || !text.trim()) {
        return;
      }

      const annotation: TextAnnotation = {
        id: crypto.randomUUID(),
        kind: "text",
        x: point.x,
        y: point.y,
        text: text.trim(),
        color: annotationColor,
        textSizeRatio: getTextSizeRatioFromPixels(annotationTextSize, overlayRect),
      };
      const nextAnnotations = [...annotations, annotation];
      annotationsRef.current = nextAnnotations;
      setAnnotations(nextAnnotations);
      selectedAnnotationIdRef.current = annotation.id;
      setSelectedAnnotationId(annotation.id);
      commitSnapshot({ ...snapshotRef.current, annotations: nextAnnotations });
      return;
    }

    const annotationId = crypto.randomUUID();
    const strokeWidthRatio = getStrokeWidthRatioFromPixels(annotationStrokeWidth, overlayRect);
    let nextAnnotation: Annotation;

    if (annotationTool === "arrow") {
      nextAnnotation = {
        id: annotationId,
        kind: "arrow",
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
        color: annotationColor,
        strokeWidthRatio,
      };
      dragStateRef.current = {
        mode: "create-arrow",
        annotationId,
        startPoint: point,
      };
    } else if (annotationTool === "rect") {
      nextAnnotation = {
        id: annotationId,
        kind: "rect",
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        color: annotationColor,
        strokeWidthRatio,
      };
      dragStateRef.current = {
        mode: "create-rect",
        annotationId,
        startPoint: point,
      };
    } else if (annotationTool === "circle") {
      nextAnnotation = {
        id: annotationId,
        kind: "circle",
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        color: annotationColor,
        strokeWidthRatio,
      };
      dragStateRef.current = {
        mode: "create-circle",
        annotationId,
        startPoint: point,
      };
    } else {
      nextAnnotation = {
        id: annotationId,
        kind: "draw",
        points: [point, point],
        color: annotationColor,
        strokeWidthRatio,
      };
      dragStateRef.current = {
        mode: "create-draw",
        annotationId,
      };
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAnnotations = [...annotations, nextAnnotation];
    annotationsRef.current = nextAnnotations;
    setAnnotations(nextAnnotations);
    selectedAnnotationIdRef.current = annotationId;
    setSelectedAnnotationId(annotationId);
  }

  function handleOverlayPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragStateRef.current || !overlayRect) {
      return;
    }

    const point = getPointerPoint(event);
    if (!point) {
      return;
    }

    const dragState = dragStateRef.current;
    setAnnotations((current) => {
      const nextAnnotations = current.map((annotation) => {
        if (annotation.id !== dragState.annotationId) {
          return annotation;
        }

        if (dragState.mode === "move") {
          return moveAnnotation(
            dragState.originAnnotation,
            point.x - dragState.anchorPoint.x,
            point.y - dragState.anchorPoint.y,
          );
        }

        if (dragState.mode === "create-arrow" && annotation.kind === "arrow") {
          return {
            ...annotation,
            x2: point.x,
            y2: point.y,
          };
        }

        if ((dragState.mode === "create-rect" || dragState.mode === "create-circle") && (annotation.kind === "rect" || annotation.kind === "circle")) {
          const rect = normalizeRect({
            x: dragState.startPoint.x,
            y: dragState.startPoint.y,
            width: point.x - dragState.startPoint.x,
            height: point.y - dragState.startPoint.y,
          });
          return {
            ...annotation,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }

        if (dragState.mode === "create-draw" && annotation.kind === "draw") {
          return {
            ...annotation,
            points: [...annotation.points, point],
          };
        }

        return annotation;
      });

      annotationsRef.current = nextAnnotations;
      return nextAnnotations;
    });
  }

  function finishOverlayInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragStateRef.current) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    commitSnapshot({ ...snapshotRef.current, annotations: annotationsRef.current });
  }

  function handleAnnotationPointerDown(event: ReactPointerEvent<SVGGElement>, annotation: Annotation) {
    event.stopPropagation();
    if (activeTool !== "annotate") {
      return;
    }

    const point = getPointerPoint(event);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    beginMoveAnnotation(annotation, point);
  }

  function updateSelectedAnnotationStyle(input: { color?: string; strokeWidthPx?: number; textSizePx?: number }) {
    if (!selectedAnnotation || !overlayRect) {
      return;
    }

    const nextAnnotation =
      selectedAnnotation.kind === "text"
        ? {
            ...selectedAnnotation,
            color: input.color ?? selectedAnnotation.color,
            textSizeRatio:
              input.textSizePx !== undefined
                ? getTextSizeRatioFromPixels(input.textSizePx, overlayRect)
                : selectedAnnotation.textSizeRatio,
          }
        : {
            ...selectedAnnotation,
            color: input.color ?? selectedAnnotation.color,
            strokeWidthRatio:
              input.strokeWidthPx !== undefined
                ? getStrokeWidthRatioFromPixels(input.strokeWidthPx, overlayRect)
                : selectedAnnotation.strokeWidthRatio,
          };

    replaceAnnotation(selectedAnnotation.id, nextAnnotation, { commit: true });
  }

  function renderAnnotation(annotation: Annotation) {
    const isSelected = selectedAnnotationId === annotation.id;
    const selectionBox = getAnnotationBoundingBox(annotation);
    const baseSize = Math.max(overlayRect ? Math.min(overlayRect.width, overlayRect.height) : 600, 1);

    if (annotation.kind === "text") {
      const fontSize = Math.max(14, annotation.textSizeRatio * baseSize);
      return (
        <g key={annotation.id} className="media-editor-annotation-group" onPointerDown={(event) => handleAnnotationPointerDown(event, annotation)}>
          {isSelected ? (
            <rect
              x={`${selectionBox.x * 100}%`}
              y={`${selectionBox.y * 100}%`}
              width={`${selectionBox.width * 100}%`}
              height={`${selectionBox.height * 100}%`}
              className="media-editor-annotation-selection"
            />
          ) : null}
          <text
            x={`${annotation.x * 100}%`}
            y={`${annotation.y * 100}%`}
            fill={annotation.color}
            fontSize={fontSize}
            fontWeight={700}
            paintOrder="stroke"
            stroke="rgba(5,10,22,0.35)"
            strokeWidth={Math.max(1, fontSize * 0.08)}
            className="media-editor-annotation-text"
          >
            {annotation.text}
          </text>
        </g>
      );
    }

    if (annotation.kind === "arrow") {
      const strokeWidth = Math.max(2, annotation.strokeWidthRatio * baseSize);
      return (
        <g key={annotation.id} className="media-editor-annotation-group" onPointerDown={(event) => handleAnnotationPointerDown(event, annotation)}>
          {isSelected ? (
            <rect
              x={`${selectionBox.x * 100}%`}
              y={`${selectionBox.y * 100}%`}
              width={`${selectionBox.width * 100}%`}
              height={`${selectionBox.height * 100}%`}
              className="media-editor-annotation-selection"
            />
          ) : null}
          <defs>
            <marker id={`editor-arrow-${annotation.id}`} markerWidth={strokeWidth * 2.6} markerHeight={strokeWidth * 2.6} refX={strokeWidth * 1.8} refY={strokeWidth} orient="auto">
              <path d={`M0,0 L0,${strokeWidth * 2} L${strokeWidth * 2},${strokeWidth} z`} fill={annotation.color} />
            </marker>
          </defs>
          <line
            x1={`${annotation.x1 * 100}%`}
            y1={`${annotation.y1 * 100}%`}
            x2={`${annotation.x2 * 100}%`}
            y2={`${annotation.y2 * 100}%`}
            stroke={annotation.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#editor-arrow-${annotation.id})`}
          />
        </g>
      );
    }

    if (annotation.kind === "draw") {
      const strokeWidth = Math.max(2, annotation.strokeWidthRatio * baseSize);
      return (
        <g key={annotation.id} className="media-editor-annotation-group" onPointerDown={(event) => handleAnnotationPointerDown(event, annotation)}>
          {isSelected ? (
            <rect
              x={`${selectionBox.x * 100}%`}
              y={`${selectionBox.y * 100}%`}
              width={`${selectionBox.width * 100}%`}
              height={`${selectionBox.height * 100}%`}
              className="media-editor-annotation-selection"
            />
          ) : null}
          <polyline
            points={annotation.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
            fill="none"
            stroke={annotation.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      );
    }

    const strokeWidth = Math.max(2, annotation.strokeWidthRatio * baseSize);
    return (
      <g key={annotation.id} className="media-editor-annotation-group" onPointerDown={(event) => handleAnnotationPointerDown(event, annotation)}>
        {isSelected ? (
          <rect
            x={`${selectionBox.x * 100}%`}
            y={`${selectionBox.y * 100}%`}
            width={`${selectionBox.width * 100}%`}
            height={`${selectionBox.height * 100}%`}
            className="media-editor-annotation-selection"
          />
        ) : null}
        {annotation.kind === "circle" ? (
          <ellipse
            cx={`${(annotation.x + annotation.width / 2) * 100}%`}
            cy={`${(annotation.y + annotation.height / 2) * 100}%`}
            rx={`${(annotation.width / 2) * 100}%`}
            ry={`${(annotation.height / 2) * 100}%`}
            fill="transparent"
            stroke={annotation.color}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect
            x={`${annotation.x * 100}%`}
            y={`${annotation.y * 100}%`}
            width={`${annotation.width * 100}%`}
            height={`${annotation.height * 100}%`}
            fill="transparent"
            stroke={annotation.color}
            strokeWidth={strokeWidth}
            rx={10}
            ry={10}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    );
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

      <div className="media-editor-layout">
        <aside className="media-editor-sidebar">
          <div className="media-editor-panel media-editor-adjust-panel">
            <div className="media-editor-panel-heading">
              <strong>Adjust</strong>
            </div>
            <div className="media-editor-tool-list">
              <button
                type="button"
                className={`media-editor-tool-button${activeTool === "crop" ? " is-active" : ""}`.trim()}
                onClick={() => setActiveTool("crop")}
              >
                <CropIcon className="media-editor-inline-icon" />
                <span>Crop &amp; Rotate</span>
              </button>
              <button
                type="button"
                className={`media-editor-tool-button${activeTool === "annotate" ? " is-active" : ""}`.trim()}
                onClick={() => setActiveTool("annotate")}
              >
                <AnnotateIcon className="media-editor-inline-icon" />
                <span>Annotate</span>
              </button>
            </div>
          </div>
        </aside>

        <main className="media-editor-workspace">
          <div className="media-editor-canvas-card">
            <div className="media-editor-canvas" ref={canvasRef}>
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
                  onInteractionEnd={() => commitSnapshot(currentSnapshot)}
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

              {overlayRect ? (
                <svg
                  className={`media-editor-annotation-overlay${activeTool === "annotate" ? " is-interactive" : ""}`.trim()}
                  style={{
                    left: `${overlayRect.left}px`,
                    top: `${overlayRect.top}px`,
                    width: `${overlayRect.width}px`,
                    height: `${overlayRect.height}px`,
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  onPointerDown={beginCreateAnnotation}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={finishOverlayInteraction}
                  onPointerLeave={finishOverlayInteraction}
                  onClick={() => {
                    if (activeTool === "annotate") {
                      setSelectedAnnotationId(null);
                    }
                  }}
                >
                  {annotations.map((annotation) => renderAnnotation(annotation))}
                </svg>
              ) : null}
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
                    onMouseUp={() => commitSnapshot({ ...currentSnapshot, rotation })}
                    onTouchEnd={() => commitSnapshot({ ...currentSnapshot, rotation })}
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

              <div className="media-editor-tool-cards">
                <button
                  type="button"
                  className={`media-editor-tool-card${activeTool === "crop" ? " is-active" : ""}`.trim()}
                  onClick={() => setActiveTool("crop")}
                >
                  <CropIcon className="media-editor-inline-icon" />
                  <span>Crop &amp; Rotate</span>
                </button>
                <button
                  type="button"
                  className={`media-editor-tool-card${activeTool === "annotate" ? " is-active" : ""}`.trim()}
                  onClick={() => setActiveTool("annotate")}
                >
                  <AnnotateIcon className="media-editor-inline-icon" />
                  <span>Annotate</span>
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className="media-editor-sidebar">
          {activeTool === "crop" ? (
            <>
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
                      onMouseUp={() => commitSnapshot({ ...currentSnapshot, zoom })}
                      onTouchEnd={() => commitSnapshot({ ...currentSnapshot, zoom })}
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
            </>
          ) : (
            <>
              <div className="media-editor-panel">
                <div className="media-editor-panel-heading">
                  <strong>Annotate</strong>
                </div>

                <div className="media-editor-section">
                  <span className="media-editor-section-label">Tool</span>
                  <div className="media-editor-annotation-tool-grid">
                    {ANNOTATION_TOOL_OPTIONS.map((tool) => (
                      <button
                        key={tool.value}
                        type="button"
                        className={`media-editor-annotation-tool-button${annotationTool === tool.value ? " is-active" : ""}`.trim()}
                        onClick={() => setAnnotationTool(tool.value)}
                      >
                        {tool.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="media-editor-section">
                  <span className="media-editor-section-label">Color</span>
                  <div className="media-editor-color-row">
                    {ANNOTATION_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`media-editor-color-swatch${annotationColor === color ? " is-active" : ""}`.trim()}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setAnnotationColor(color);
                          updateSelectedAnnotationStyle({ color });
                        }}
                        aria-label={`Use ${color} annotation color`}
                      />
                    ))}
                  </div>
                </div>

                <div className="media-editor-section">
                  <span className="media-editor-section-label">Stroke Width</span>
                  <div className="media-editor-style-slider-row">
                    <input
                      type="range"
                      min={2}
                      max={22}
                      step={1}
                      value={annotationStrokeWidth}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setAnnotationStrokeWidth(nextValue);
                        if (selectedAnnotation && selectedAnnotation.kind !== "text") {
                          updateSelectedAnnotationStyle({ strokeWidthPx: nextValue });
                        }
                      }}
                    />
                    <span>{annotationStrokeWidth}px</span>
                  </div>
                </div>

                <div className="media-editor-section">
                  <span className="media-editor-section-label">Text Size</span>
                  <div className="media-editor-style-slider-row">
                    <input
                      type="range"
                      min={16}
                      max={72}
                      step={1}
                      value={annotationTextSize}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setAnnotationTextSize(nextValue);
                        if (selectedAnnotation?.kind === "text") {
                          updateSelectedAnnotationStyle({ textSizePx: nextValue });
                        }
                      }}
                    />
                    <span>{annotationTextSize}px</span>
                  </div>
                </div>

                <div className="media-editor-annotation-actions">
                  <button type="button" className="secondary-button" onClick={removeSelectedAnnotation} disabled={!selectedAnnotation}>
                    Delete Selected
                  </button>
                  <button type="button" className="secondary-button" onClick={clearAllAnnotations} disabled={annotations.length === 0}>
                    Clear All
                  </button>
                </div>
              </div>

              <div className="media-editor-panel media-editor-tips-card">
                <div className="media-editor-panel-heading">
                  <strong>Tips</strong>
                </div>
                <ul>
                  <li>Click the image to place text.</li>
                  <li>Drag to draw shapes.</li>
                  <li>Select an item to move or delete it.</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
