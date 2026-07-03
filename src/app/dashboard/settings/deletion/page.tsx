import Link from "next/link";
import { DeletionSettingsPanel } from "@/components/deletion-settings-panel";
import { prisma } from "@/lib/prisma";

export default async function DeletionSettingsPage() {
  const mediaAssetCount = await prisma.mediaAsset.count();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Deletion</h2>
          <p>Use this only when you intentionally need to clear broken gallery data.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <DeletionSettingsPanel mediaAssetCount={mediaAssetCount} />
    </section>
  );
}
