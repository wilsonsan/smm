import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getUploadDirectory } from "@/lib/settings";
import { ensureSafeAbsolutePath, resolveUploadBasePath } from "@/lib/uploads";

type MediaVariantRouteProps = {
  params: Promise<{
    variantId: string;
  }>;
};

export async function GET(request: Request, context: MediaVariantRouteProps) {
  try {
    await requireAdminSessionFromRequest(request, { touch: false });
    const { variantId } = await context.params;

    const mediaVariant = await prisma.mediaVariant.findUnique({
      where: { id: variantId },
      select: {
        mimeType: true,
        storagePath: true,
      },
    });

    if (!mediaVariant) {
      return new NextResponse("Not found.", { status: 404 });
    }

    const uploadBasePath = resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, mediaVariant.storagePath);
    const fileBuffer = await readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mediaVariant.mimeType,
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
