import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getUploadDirectory } from "@/lib/settings";

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function resolveUploadBasePath(configuredPath: string) {
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export async function storeUploadedMedia(input: {
  file: File;
  adminUserId: string;
}) {
  const arrayBuffer = await input.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength === 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (buffer.byteLength > env.MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))}MB upload limit.`);
  }

  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType || !ALLOWED_UPLOAD_MIME_TYPES.has(detectedType.mime)) {
    throw new Error("Only JPEG, PNG, WEBP, and HEIC/HEIF images are allowed.");
  }

  const metadata = await sharp(buffer, { failOn: "none" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not determine image dimensions from the uploaded file.");
  }

  const configuredUploadDirectory = await getUploadDirectory();
  const baseUploadPath = resolveUploadBasePath(configuredUploadDirectory || env.UPLOAD_DIR);
  const relativeDirectory = path.posix.join(
    String(new Date().getUTCFullYear()),
    String(new Date().getUTCMonth() + 1).padStart(2, "0"),
  );
  const filename = `${randomUUID()}.${detectedType.ext}`;
  const storagePath = path.posix.join(relativeDirectory, filename);
  const absoluteDirectory = path.join(baseUploadPath, ...relativeDirectory.split("/"));
  const absolutePath = path.join(baseUploadPath, ...storagePath.split("/"));

  await mkdir(absoluteDirectory, { recursive: true });
  await writeFile(absolutePath, buffer);

  try {
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        originalFilename: input.file.name || `upload.${detectedType.ext}`,
        mimeType: detectedType.mime,
        sizeBytes: BigInt(buffer.byteLength),
        width: metadata.width,
        height: metadata.height,
        storagePath,
        createdByAdminUserId: input.adminUserId,
      },
    });

    // TODO: Generate platform-specific derivatives here with Sharp once Facebook publishing is implemented.
    // TODO: Persist processed variant metadata in a dedicated table or JSON column when multiple renditions are introduced.

    return {
      mediaAsset,
      absolutePath,
    };
  } catch (error) {
    await unlink(absolutePath).catch(() => undefined);
    throw error;
  }
}
