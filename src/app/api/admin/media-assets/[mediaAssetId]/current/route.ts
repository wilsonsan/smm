import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { canAccessOwnedResource, requireAdminSessionFromRequest } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getUploadDirectory } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { ensureSafeAbsolutePath, resolveUploadBasePath } from "@/lib/uploads";

type CurrentMediaRouteContext = {
  params: Promise<{
    mediaAssetId: string;
  }>;
};

export async function GET(request: Request, context: CurrentMediaRouteContext) {
  try {
    const session = await requireAdminSessionFromRequest(request, { touch: false });
    const { mediaAssetId } = await context.params;

    const mediaAsset = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      select: {
        mimeType: true,
        storagePath: true,
        createdByAdminUserId: true,
      },
    });

    if (!mediaAsset) {
      return new NextResponse("Not found.", { status: 404 });
    }

    if (!canAccessOwnedResource(session.adminUser, mediaAsset.createdByAdminUserId)) {
      return new NextResponse("Not found.", { status: 404 });
    }

    const uploadBasePath = resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, mediaAsset.storagePath);
    const fileBuffer = await readFile(absolutePath);
    const shouldTranscodeForBrowserPreview =
      mediaAsset.mimeType === "image/heic" || mediaAsset.mimeType === "image/heif";

    const responseBuffer = shouldTranscodeForBrowserPreview
      ? await sharp(fileBuffer, { failOn: "none" })
          .rotate()
          .toColorspace("srgb")
          .jpeg({
            quality: 88,
            progressive: false,
            force: true,
          })
          .toBuffer()
      : fileBuffer;
    const responseMimeType = shouldTranscodeForBrowserPreview ? "image/jpeg" : mediaAsset.mimeType;

    return new NextResponse(new Uint8Array(responseBuffer), {
      status: 200,
      headers: {
        "Content-Type": responseMimeType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(await error.text(), { status: error.status });
    }

    return new NextResponse("Media could not be served.", { status: 404 });
  }
}
