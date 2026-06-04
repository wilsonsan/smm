import Link from "next/link";
import { MediaAssetGallery } from "@/components/media-asset-gallery";
import { toMediaAssetSummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";

export default async function MediaPage() {
  const mediaAssets = await prisma.mediaAsset.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      variants: true,
    },
    take: 48,
  });

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Gallery</h2>
          <p>
            Each upload stays grouped as one media asset. Originals remain preserved locally while Facebook and
            Google-safe derivatives stay attached behind the scenes for publishing.
          </p>
        </div>
        <Link href="/dashboard/posts/new" className="primary-button" style={{ display: "inline-flex", alignItems: "center" }}>
          Upload In Composer
        </Link>
      </header>

      {mediaAssets.length === 0 ? (
        <section className="panel">
          <div className="panel-body">
            <p className="muted">No media has been uploaded yet.</p>
          </div>
        </section>
      ) : (
        <div className="media-library-grid">
          {mediaAssets.map((mediaAsset) => (
            <section key={mediaAsset.id} className="panel media-library-card">
              <div className="panel-body">
                <MediaAssetGallery mediaAsset={toMediaAssetSummary(mediaAsset)} heading="Media asset" />
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
