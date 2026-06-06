"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { CalendarIcon, ComposeIcon, FacebookIcon, GalleryIcon, SuccessIcon } from "@/components/dashboard-icons";
import {
  formatBytes,
  formatDimensions,
  getAvailableVariantSummary,
  getMediaVariantLabel,
  getMediaVariantUrl,
  getPreferredPreviewVariant,
  getVariantByType,
  type MediaAssetGallerySummary,
  type MediaVariantSummary,
} from "@/lib/media-presentation";

type MediaLibraryBrowserProps = {
  assets: MediaAssetGallerySummary[];
  timezone: string;
};

type StatusFilterValue =
  | "ALL"
  | "NOT_POSTED"
  | "POSTED_ANYWHERE"
  | "POSTED_TO_FACEBOOK"
  | "POSTED_TO_INSTAGRAM"
  | "POSTED_TO_GOOGLE"
  | "POSTED_EVERYWHERE";

type SortOrderValue = "NEWEST" | "OLDEST" | "FILENAME_ASC" | "FILENAME_DESC";
type ViewModeValue = "GRID" | "LIST";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilterValue; label: string }> = [
  { value: "ALL", label: "All Status" },
  { value: "NOT_POSTED", label: "Not Posted" },
  { value: "POSTED_ANYWHERE", label: "Posted Anywhere" },
  { value: "POSTED_TO_FACEBOOK", label: "Posted to Facebook" },
  { value: "POSTED_TO_INSTAGRAM", label: "Posted to Instagram" },
  { value: "POSTED_TO_GOOGLE", label: "Posted to Google" },
  { value: "POSTED_EVERYWHERE", label: "Posted Everywhere" },
];

const SORT_OPTIONS: Array<{ value: SortOrderValue; label: string }> = [
  { value: "NEWEST", label: "Newest First" },
  { value: "OLDEST", label: "Oldest First" },
  { value: "FILENAME_ASC", label: "Filename A-Z" },
  { value: "FILENAME_DESC", label: "Filename Z-A" },
];

const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48];

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
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

function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4.5" y="4.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="14" y="4.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="4.5" y="14" width="5.5" height="5.5" rx="1.2" />
      <rect x="14" y="14" width="5.5" height="5.5" rx="1.2" />
    </svg>
  );
}

function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 7h12" />
      <path d="M8 12h12" />
      <path d="M8 17h12" />
      <circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V6A1.5 1.5 0 0 1 7.5 4.5Z" />
      <path d="M14 4.5V9h4" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.3" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.05" cy="6.95" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GoogleBusinessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.2 2.8-7.2Z" />
      <path fill="#34A853" d="M12 21c2.5 0 4.6-.8 6.2-2.2l-3.1-2.5c-.9.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.6V16c1.6 3 4.7 5 8.4 5Z" />
      <path fill="#FBBC04" d="M6.9 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.6A9 9 0 0 0 3 11.6c0 1.6.4 3.1 1.1 4.4l2.8-2.5Z" />
      <path fill="#EA4335" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.6 2.8 14.5 2 12 2 8.3 2 5.2 4 3.6 7.2l3.3 2.5c.7-2.2 2.7-3.8 5.1-3.8Z" />
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
      <div className="gallery-variant-row is-missing">
        <strong>{label}</strong>
        <span>{missingMessage}</span>
      </div>
    );
  }

  return (
    <div className="gallery-variant-row">
      <strong>{label}</strong>
      <span>{formatDimensions(variant.width, variant.height)}</span>
      <span>{formatBytes(variant.sizeBytes)}</span>
      <span>{variant.mimeType}</span>
    </div>
  );
}

function getMimeTypeLabel(asset: MediaAssetGallerySummary) {
  const extension = asset.originalFilename.split(".").pop()?.toUpperCase();
  if (extension) {
    return extension;
  }

  return asset.mimeType.replace("image/", "").toUpperCase();
}

function formatUploadDate(value: string, timezone: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getTypeFilterLabel(asset: MediaAssetGallerySummary) {
  if (asset.mimeType === "image/jpeg") {
    return "JPEG";
  }

  if (asset.mimeType === "image/png") {
    return "PNG";
  }

  if (asset.mimeType === "image/webp") {
    return "WebP";
  }

  if (asset.mimeType === "image/heic" || asset.mimeType === "image/heif") {
    return "HEIC / HEIF";
  }

  return asset.mimeType;
}

function matchesStatusFilter(asset: MediaAssetGallerySummary, filter: StatusFilterValue) {
  switch (filter) {
    case "NOT_POSTED":
      return !asset.postedPlatforms.postedAnywhere;
    case "POSTED_ANYWHERE":
      return asset.postedPlatforms.postedAnywhere;
    case "POSTED_TO_FACEBOOK":
      return asset.postedPlatforms.postedToFacebook;
    case "POSTED_TO_INSTAGRAM":
      return asset.postedPlatforms.postedToInstagram;
    case "POSTED_TO_GOOGLE":
      return asset.postedPlatforms.postedToGoogle;
    case "POSTED_EVERYWHERE":
      return asset.postedPlatforms.postedEverywhere;
    default:
      return true;
  }
}

function sortAssets(assets: MediaAssetGallerySummary[], sortOrder: SortOrderValue) {
  const copy = [...assets];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case "OLDEST":
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      case "FILENAME_ASC":
        return left.originalFilename.localeCompare(right.originalFilename, undefined, { sensitivity: "base" });
      case "FILENAME_DESC":
        return right.originalFilename.localeCompare(left.originalFilename, undefined, { sensitivity: "base" });
      case "NEWEST":
      default:
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
  });

  return copy;
}

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

export function MediaLibraryBrowser({ assets, timezone }: MediaLibraryBrowserProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL_TYPES");
  const [sortOrder, setSortOrder] = useState<SortOrderValue>("NEWEST");
  const [viewMode, setViewMode] = useState<ViewModeValue>("GRID");
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [currentPage, setCurrentPage] = useState(1);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);

  const typeOptions = useMemo(() => {
    const labels = Array.from(new Set(assets.map(getTypeFilterLabel))).sort((left, right) => left.localeCompare(right));
    return [{ value: "ALL_TYPES", label: "All Types" }, ...labels.map((label) => ({ value: label, label }))];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortAssets(
      assets.filter((asset) => {
        if (normalizedSearch && !asset.originalFilename.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

        if (typeFilter !== "ALL_TYPES" && getTypeFilterLabel(asset) !== typeFilter) {
          return false;
        }

        return matchesStatusFilter(asset, statusFilter);
      }),
      sortOrder,
    );
  }, [assets, searchTerm, typeFilter, statusFilter, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, sortOrder, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / itemsPerPage));
  const clampedCurrentPage = Math.min(currentPage, totalPages);
  const visibleAssets = filteredAssets.slice(
    (clampedCurrentPage - 1) * itemsPerPage,
    clampedCurrentPage * itemsPerPage,
  );
  const pageNumbers = getPageNumbers(clampedCurrentPage, totalPages);
  const openAsset = assets.find((asset) => asset.id === openAssetId) ?? null;

  useEffect(() => {
    if (!openAssetId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenAssetId(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openAssetId]);

  const stats = useMemo(
    () => ({
      allAssets: assets.length,
      original: assets.filter((asset) => asset.variants.some((variant) => variant.variantType === "ORIGINAL")).length,
      postedToFacebook: assets.filter((asset) => asset.postedPlatforms.postedToFacebook).length,
      postedToInstagram: assets.filter((asset) => asset.postedPlatforms.postedToInstagram).length,
      postedToGoogle: assets.filter((asset) => asset.postedPlatforms.postedToGoogle).length,
      postedEverywhere: assets.filter((asset) => asset.postedPlatforms.postedEverywhere).length,
    }),
    [assets],
  );

  const statCards = [
    {
      label: "All Assets",
      count: stats.allAssets,
      accentClass: "is-purple",
      icon: <GalleryIcon />,
    },
    {
      label: "Original",
      count: stats.original,
      accentClass: "is-violet",
      icon: <FileIcon />,
    },
    {
      label: "Posted to Facebook",
      count: stats.postedToFacebook,
      accentClass: "is-blue",
      icon: <FacebookIcon />,
    },
    {
      label: "Posted to Instagram",
      count: stats.postedToInstagram,
      accentClass: "is-magenta",
      icon: <InstagramIcon />,
    },
    {
      label: "Posted to Google",
      count: stats.postedToGoogle,
      accentClass: "is-google",
      icon: <GoogleBusinessIcon />,
    },
    {
      label: "Posted Everywhere",
      count: stats.postedEverywhere,
      accentClass: "is-green",
      icon: <SuccessIcon />,
    },
  ];

  return (
    <>
      <section className="gallery-shell">
        <header className="gallery-header">
          <div className="gallery-header-copy">
            <div className="gallery-title-row">
              <span className="gallery-title-icon">
                <GalleryIcon />
              </span>
              <div>
                <h2>Gallery</h2>
                <p>
                  Each upload stays grouped as one media asset. Originals remain preserved locally while platform-ready
                  images are generated temporarily at publish time to save storage.
                </p>
              </div>
            </div>
          </div>

          <Link href="/dashboard/posts/new" className="gallery-upload-button">
            <UploadIcon />
            <span>Upload In Composer</span>
          </Link>
        </header>

        <section className="gallery-toolbar panel">
          <div className="panel-body gallery-toolbar-body">
            <label className="gallery-search-field">
              <SearchIcon />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search media assets..."
              />
            </label>

            <select
              className="gallery-filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="gallery-filter-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="gallery-filter-select"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrderValue)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="gallery-view-toggle" role="group" aria-label="Gallery view mode">
              <button
                type="button"
                className={`gallery-view-toggle-button${viewMode === "GRID" ? " is-active" : ""}`.trim()}
                onClick={() => setViewMode("GRID")}
                aria-pressed={viewMode === "GRID"}
              >
                <GridIcon />
              </button>
              <button
                type="button"
                className={`gallery-view-toggle-button${viewMode === "LIST" ? " is-active" : ""}`.trim()}
                onClick={() => setViewMode("LIST")}
                aria-pressed={viewMode === "LIST"}
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </section>

        <section className="gallery-stats-grid">
          {statCards.map((card) => (
            <article key={card.label} className={`gallery-stat-card ${card.accentClass}`.trim()}>
              <span className="gallery-stat-icon">{card.icon}</span>
              <div className="gallery-stat-copy">
                <span>{card.label}</span>
                <strong>{card.count}</strong>
              </div>
            </article>
          ))}
        </section>

        {visibleAssets.length === 0 ? (
          <section className="panel">
            <div className="panel-body">
              <p className="muted">No media assets match the current filters.</p>
            </div>
          </section>
        ) : (
          <section className={`gallery-assets-grid ${viewMode === "LIST" ? "is-list" : ""}`.trim()}>
            {visibleAssets.map((asset) => {
              const previewVariant = getPreferredPreviewVariant(asset.variants);
              const overlayBadges = [
                asset.postedPlatforms.postedAnywhere
                  ? { key: "check", label: "Posted successfully", accentClass: "is-check", icon: <SuccessIcon /> }
                  : null,
                asset.postedPlatforms.postedToFacebook
                  ? { key: "facebook", label: "Posted to Facebook", accentClass: "is-facebook", icon: <FacebookIcon /> }
                  : null,
                asset.postedPlatforms.postedToInstagram
                  ? { key: "instagram", label: "Posted to Instagram", accentClass: "is-instagram", icon: <InstagramIcon /> }
                  : null,
                asset.postedPlatforms.postedToGoogle
                  ? {
                      key: "google",
                      label: "Posted to Google",
                      accentClass: "is-google",
                      icon: <GoogleBusinessIcon />,
                    }
                  : null,
              ].filter(Boolean) as Array<{ key: string; label: string; accentClass: string; icon: React.ReactNode }>;

              return (
                <article key={asset.id} className="gallery-asset-card">
                  <button type="button" className="gallery-asset-thumb-wrap" onClick={() => setOpenAssetId(asset.id)}>
                    {previewVariant ? (
                      <img
                        src={getMediaVariantUrl(previewVariant.id)}
                        alt={`${asset.originalFilename} preview`}
                        className="gallery-asset-thumb"
                      />
                    ) : (
                      <div className="gallery-asset-thumb-fallback">No preview</div>
                    )}

                    {overlayBadges.length > 0 ? (
                      <div className="gallery-posted-badges">
                        {overlayBadges.map((badge) => (
                          <span key={badge.key} className={`gallery-posted-badge ${badge.accentClass}`.trim()} title={badge.label} aria-label={badge.label}>
                            {badge.icon}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>

                  <div className="gallery-asset-body">
                    <div className="gallery-asset-head">
                      <strong title={asset.originalFilename}>{asset.originalFilename}</strong>
                      <button
                        type="button"
                        className="gallery-asset-menu"
                        onClick={() => setOpenAssetId(asset.id)}
                        aria-label={`Open details for ${asset.originalFilename}`}
                      >
                        <MoreIcon />
                      </button>
                    </div>

                    <div className="gallery-asset-meta">
                      <span>
                        <FileIcon />
                        <span>{getMimeTypeLabel(asset)}</span>
                      </span>
                      <span>{formatBytes(asset.sizeBytes)}</span>
                      <span>{formatDimensions(asset.width, asset.height)}</span>
                    </div>

                    <div className="gallery-asset-date">
                      <CalendarIcon />
                      <span>{formatUploadDate(asset.createdAt, timezone)}</span>
                    </div>

                    <div className="gallery-asset-footer">
                      <button type="button" className="gallery-open-link" onClick={() => setOpenAssetId(asset.id)}>
                        Open Details
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <section className="gallery-pagination panel">
          <div className="panel-body gallery-pagination-body">
            <div className="gallery-pagination-controls">
              <button
                type="button"
                className="gallery-page-button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={clampedCurrentPage === 1}
              >
                <ChevronLeftIcon />
                <span>Previous</span>
              </button>

              <div className="gallery-page-numbers">
                {pageNumbers.map((page, index) =>
                  page === "ELLIPSIS" ? (
                    <span key={`ellipsis-${index}`} className="gallery-page-ellipsis">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      className={`gallery-page-number${page === clampedCurrentPage ? " is-active" : ""}`.trim()}
                      onClick={() => setCurrentPage(page)}
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
                disabled={clampedCurrentPage === totalPages}
              >
                <span>Next</span>
                <ChevronRightIcon />
              </button>
            </div>

            <label className="gallery-items-per-page">
              <span>Items per page</span>
              <select value={String(itemsPerPage)} onChange={(event) => setItemsPerPage(Number(event.target.value))}>
                {ITEMS_PER_PAGE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </section>

      {openAsset ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${openAsset.originalFilename} details`}>
          <button
            type="button"
            className="modal-dismiss-surface"
            aria-label="Close media details"
            onClick={() => setOpenAssetId(null)}
          />
          <div className="modal-card media-modal-card">
            <div className="preview-header">
              <div>
                <strong>{openAsset.originalFilename}</strong>
                <p className="muted">
                  Original image preview with publish-time optimization details for Facebook and Google.
                </p>
              </div>
              <button type="button" className="ghost-link-button" onClick={() => setOpenAssetId(null)}>
                Close
              </button>
            </div>

            <div className="media-modal-layout">
              <div className="media-modal-preview">
                {getPreferredPreviewVariant(openAsset.variants) ? (
                  <img
                    src={getMediaVariantUrl(getPreferredPreviewVariant(openAsset.variants)!.id)}
                    alt={`${openAsset.originalFilename} original preview`}
                    className="media-modal-image"
                  />
                ) : (
                  <div className="gallery-asset-thumb-fallback">No preview available</div>
                )}
              </div>

              <div className="media-modal-details">
                <div className="media-modal-summary">
                  <strong>Available versions</strong>
                  <div className="inline-list">
                    {getAvailableVariantSummary(openAsset.variants).map((item) => (
                      <span key={item} className="badge">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="gallery-modal-posted-status">
                  <strong>Posted Status</strong>
                  <div className="inline-list">
                    {openAsset.postedPlatforms.postedAnywhere ? <span className="badge is-published">Posted somewhere</span> : <span className="badge is-draft">Not posted</span>}
                    {openAsset.postedPlatforms.postedToFacebook ? <span className="badge is-scheduled">Facebook</span> : null}
                    {openAsset.postedPlatforms.postedToInstagram ? <span className="badge">Instagram</span> : null}
                    {openAsset.postedPlatforms.postedToGoogle ? <span className="badge">Google</span> : null}
                  </div>
                </div>

                <div className="media-variant-info-grid">
                  <VariantInfoRow
                    label={getMediaVariantLabel("ORIGINAL")}
                    variant={getVariantByType(openAsset.variants, "ORIGINAL")}
                    missingMessage="Original record missing"
                  />
                  <VariantInfoRow
                    label={getMediaVariantLabel("FACEBOOK_FEED")}
                    variant={getVariantByType(openAsset.variants, "FACEBOOK_FEED")}
                    missingMessage="Generated temporarily at Facebook publish time"
                  />
                  <VariantInfoRow
                    label={getMediaVariantLabel("GOOGLE_BUSINESS_SAFE")}
                    variant={getVariantByType(openAsset.variants, "GOOGLE_BUSINESS_SAFE")}
                    missingMessage="Generated temporarily for future Google publishing"
                  />
                </div>

                <p className="hint">
                  Platform-optimized images are generated temporarily at publish time to save storage. The original
                  upload remains preserved locally for future reuse.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
