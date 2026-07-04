import { redirect } from "next/navigation";
import { MediaVariantType } from "@prisma/client";
import { MediaAssetEditor } from "@/components/media-asset-editor";
import { canAccessOwnedResource, requireAuthenticatedUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

export default async function EditMediaPage({ params }: PageProps) {
  const adminUser = await requireAuthenticatedUser();
  const { mediaAssetId } = await params;

  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      width: true,
      height: true,
      isEdited: true,
      editHistoryJson: true,
      createdByAdminUserId: true,
      variants: {
        where: {
          variantType: {
            in: [MediaVariantType.ORIGINAL, MediaVariantType.GALLERY_PREVIEW, MediaVariantType.GALLERY_THUMBNAIL],
          },
        },
        select: {
          id: true,
          variantType: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!mediaAsset) {
    redirect("/dashboard/media");
  }

  if (!canAccessOwnedResource(adminUser, mediaAsset.createdByAdminUserId)) {
    redirect("/dashboard/media");
  }

  return (
    <MediaAssetEditor
      mediaAsset={{
        id: mediaAsset.id,
        originalFilename: mediaAsset.originalFilename,
        mimeType: mediaAsset.mimeType,
        width: mediaAsset.width,
        height: mediaAsset.height,
        isEdited: mediaAsset.isEdited,
        editHistoryJson: mediaAsset.editHistoryJson,
        variants: mediaAsset.variants,
      }}
    />
  );
}
