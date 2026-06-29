import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { APP_SETTING_KEYS, getAppSettingValue, getUploadDirectory } from "@/lib/settings";
import { ensureSafeAbsolutePath, resolveUploadBasePath } from "@/lib/uploads";

function getMimeTypeFromPath(storagePath: string) {
  const extension = path.extname(storagePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

export async function GET(request: Request) {
  await requireAdminSessionFromRequest(request, { touch: false });
  const storagePath = (await getAppSettingValue(APP_SETTING_KEYS.GOOGLE_PREVIEW_IMAGE_PATH))?.trim() || "";

  if (!storagePath) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const uploadBasePath = resolveUploadBasePath(await getUploadDirectory());
  const absolutePath = ensureSafeAbsolutePath(uploadBasePath, storagePath);

  try {
    const buffer = await readFile(absolutePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": getMimeTypeFromPath(storagePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
}
