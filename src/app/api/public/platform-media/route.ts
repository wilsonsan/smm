import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateSignedPublicPlatformMediaRequest } from "@/lib/public-platform-media";
import { getUploadDirectory } from "@/lib/settings";
import { ensureSafeAbsolutePath, resolveUploadBasePath } from "@/lib/uploads";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const validation = validateSignedPublicPlatformMediaRequest({
      platform: url.searchParams.get("platform"),
      storagePath: url.searchParams.get("storagePath"),
      expiresAt: url.searchParams.get("expires"),
      signature: url.searchParams.get("sig"),
    });

    if (!validation.ok) {
      return new NextResponse("Not found.", { status: 404 });
    }

    const uploadBasePath = resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, validation.storagePath);
    const fileBuffer = await readFile(absolutePath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Media could not be served.", { status: 404 });
  }
}
