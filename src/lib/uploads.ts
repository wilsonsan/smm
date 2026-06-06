import { access, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { MediaVariantType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getAppSettings, getUploadDirectory } from "@/lib/settings";

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const JPEG_MIME_TYPE = "image/jpeg";
const LIGHT_BACKGROUND = { r: 255, g: 255, b: 255 };

type StoredMediaFile = {
  absolutePath: string;
  height: number;
  mimeType: string;
  sizeBytes: bigint;
  storagePath: string;
  variantType: MediaVariantType;
  width: number;
};

type OriginalUpload = StoredMediaFile & {
  originalFilename: string;
  sourceBuffer: Buffer;
};

type GeneratedVariant = StoredMediaFile;

export type TemporaryPlatformImagePlatform = "FACEBOOK" | "GOOGLE_BUSINESS" | "INSTAGRAM";

export type ValidatedStoredMediaFile = {
  absolutePath: string;
  fileSizeBytes: number;
  storagePath: string;
};

export type TemporaryPlatformImage = {
  absolutePath: string;
  storagePath: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: bigint;
  platform: TemporaryPlatformImagePlatform;
};

export type TemporaryMediaCleanupResult = {
  absolutePath: string;
  status: "deleted" | "missing" | "failed";
  message: string | null;
};

export function resolveUploadBasePath(configuredPath: string) {
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export function ensureSafeAbsolutePath(basePath: string, relativePath: string) {
  const normalizedBasePath = path.resolve(basePath);
  const normalizedTargetPath = path.resolve(normalizedBasePath, relativePath);

  if (
    normalizedTargetPath !== normalizedBasePath &&
    !normalizedTargetPath.startsWith(`${normalizedBasePath}${path.sep}`)
  ) {
    throw new Error("Resolved upload path escaped the configured upload directory.");
  }

  return normalizedTargetPath;
}

function getDatedPathSegments(timestamp: Date) {
  return [String(timestamp.getUTCFullYear()), String(timestamp.getUTCMonth() + 1).padStart(2, "0")];
}

function getDetailedDatedPathSegments(timestamp: Date) {
  return [
    String(timestamp.getUTCFullYear()),
    String(timestamp.getUTCMonth() + 1).padStart(2, "0"),
    String(timestamp.getUTCDate()).padStart(2, "0"),
  ];
}

function buildStoragePath(segments: string[], extension: string) {
  return path.posix.join(...segments, `${randomUUID()}.${extension}`);
}

function normalizeDimensions(width?: number, height?: number, orientation?: number) {
  if (!width || !height) {
    throw new Error("Could not determine image dimensions from the uploaded file.");
  }

  const shouldSwap = orientation !== undefined && [5, 6, 7, 8].includes(orientation);
  return {
    width: shouldSwap ? height : width,
    height: shouldSwap ? width : height,
  };
}

function isHeicProcessingError(error: unknown, mimeType?: string) {
  if (!mimeType || !HEIC_MIME_TYPES.has(mimeType)) {
    return false;
  }

  if (!(error instanceof Error)) {
    return true;
  }

  return /heif|heic|unsupported|decode|input file/i.test(error.message);
}

function toImageProcessingError(error: unknown, mimeType?: string) {
  if (isHeicProcessingError(error, mimeType)) {
    return new Error(
      "HEIC/HEIF uploads are not supported by the current Sharp/libvips build on this server. Convert the image to JPEG and try again.",
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Could not process the uploaded image.");
}

async function writeStoredFile(baseUploadPath: string, storagePath: string, buffer: Buffer) {
  const absolutePath = ensureSafeAbsolutePath(baseUploadPath, storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return absolutePath;
}

async function validateUploadedFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
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

  return {
    buffer,
    extension: detectedType.ext,
    mimeType: detectedType.mime,
  };
}

export async function getImageMetadata(buffer: Buffer, mimeType?: string) {
  try {
    const metadata = await sharp(buffer, { failOn: "none" }).metadata();
    return normalizeDimensions(metadata.width, metadata.height, metadata.orientation);
  } catch (error) {
    throw toImageProcessingError(error, mimeType);
  }
}

function isSupportedStoredImageMimeType(mimeType: string) {
  return ALLOWED_UPLOAD_MIME_TYPES.has(mimeType);
}

async function generateVariantBuffer(input: {
  maxHeight: number;
  maxWidth: number;
  quality: number;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
}) {
  try {
    return await sharp(input.sourceBuffer, { failOn: "none" })
      .rotate()
      .flatten({ background: LIGHT_BACKGROUND })
      .resize({
        width: input.maxWidth,
        height: input.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColorspace("srgb")
      .jpeg({
        quality: input.quality,
        progressive: false,
        force: true,
      })
      .toBuffer();
  } catch (error) {
    throw toImageProcessingError(error, input.sourceMimeType);
  }
}

export async function saveOriginalUpload(input: {
  file: File;
  occurredAt?: Date;
  uploadBasePath?: string;
}) {
  const validatedFile = await validateUploadedFile(input.file);
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const relativeStoragePath = buildStoragePath(["originals", ...getDatedPathSegments(occurredAt)], validatedFile.extension);
  const metadata = await getImageMetadata(validatedFile.buffer, validatedFile.mimeType);
  const absolutePath = await writeStoredFile(uploadBasePath, relativeStoragePath, validatedFile.buffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: validatedFile.mimeType,
    originalFilename: input.file.name || `upload.${validatedFile.extension}`,
    sizeBytes: BigInt(validatedFile.buffer.byteLength),
    sourceBuffer: validatedFile.buffer,
    storagePath: relativeStoragePath,
    variantType: MediaVariantType.ORIGINAL,
    width: metadata.width,
  } satisfies OriginalUpload;
}

export async function generateFacebookVariant(input: {
  occurredAt?: Date;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  uploadBasePath?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const outputBuffer = await generateVariantBuffer({
    sourceBuffer: input.sourceBuffer,
    sourceMimeType: input.sourceMimeType,
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 88,
  });
  const storagePath = buildStoragePath(["variants", "facebook", ...getDatedPathSegments(occurredAt)], "jpg");
  const metadata = await getImageMetadata(outputBuffer, JPEG_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: JPEG_MIME_TYPE,
    sizeBytes: BigInt(outputBuffer.byteLength),
    storagePath,
    variantType: MediaVariantType.FACEBOOK_FEED,
    width: metadata.width,
  } satisfies GeneratedVariant;
}

export async function generateGoogleBusinessVariant(input: {
  occurredAt?: Date;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  uploadBasePath?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const outputBuffer = await generateVariantBuffer({
    sourceBuffer: input.sourceBuffer,
    sourceMimeType: input.sourceMimeType,
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 85,
  });
  const storagePath = buildStoragePath(["variants", "google", ...getDatedPathSegments(occurredAt)], "jpg");
  const metadata = await getImageMetadata(outputBuffer, JPEG_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: JPEG_MIME_TYPE,
    sizeBytes: BigInt(outputBuffer.byteLength),
    storagePath,
    variantType: MediaVariantType.GOOGLE_BUSINESS_SAFE,
    width: metadata.width,
  } satisfies GeneratedVariant;
}

export async function generateMediaVariants(input: {
  occurredAt?: Date;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  uploadBasePath?: string;
}) {
  const variants = await Promise.all([
    generateFacebookVariant(input),
    generateGoogleBusinessVariant(input),
  ]);

  // TODO: Add real Instagram feed derivatives here once square/portrait crop rules are finalized.
  return variants;
}

export async function validateStoredMediaFile(input: {
  storagePath: string;
  expectedMimeType?: string;
  maxFileSizeBytes?: number;
}) {
  const settings = await getAppSettings();
  const uploadBasePath = resolveUploadBasePath(settings.uploadDirectory || env.UPLOAD_DIR);
  const absolutePath = ensureSafeAbsolutePath(uploadBasePath, input.storagePath);

  try {
    await access(absolutePath);
  } catch {
    throw new Error("The media file is missing on disk. Re-upload the original image and try again.");
  }

  let fileStats;
  try {
    fileStats = await stat(absolutePath);
  } catch {
    throw new Error("The media file could not be inspected on disk.");
  }

  if (!fileStats.isFile()) {
    throw new Error("The media path does not point to a readable file.");
  }

  if (fileStats.size <= 0) {
    throw new Error("The media file is empty.");
  }

  if (input.maxFileSizeBytes && fileStats.size > input.maxFileSizeBytes) {
    throw new Error("The generated Facebook image is too large to publish safely.");
  }

  return {
    absolutePath,
    fileSizeBytes: fileStats.size,
    storagePath: input.storagePath,
  } satisfies ValidatedStoredMediaFile;
}

export async function validateStoredOriginalMediaAsset(input: {
  mediaAsset:
    | {
        id: string;
        mimeType: string;
        storagePath: string;
      }
    | null
    | undefined;
}) {
  if (!input.mediaAsset) {
    throw new Error("No media asset is attached to this post.");
  }

  if (!isSupportedStoredImageMimeType(input.mediaAsset.mimeType)) {
    throw new Error("Only JPEG, PNG, WEBP, and HEIC/HEIF uploads can be optimized for Facebook publishing.");
  }

  return validateStoredMediaFile({
    storagePath: input.mediaAsset.storagePath,
  });
}

async function readStoredMediaBuffer(storagePath: string) {
  const validatedFile = await validateStoredMediaFile({ storagePath });
  const sourceBuffer = await readFile(validatedFile.absolutePath);
  return {
    validatedFile,
    sourceBuffer,
  };
}

export async function generateTemporaryPlatformImage(input: {
  mediaAsset: {
    id: string;
    mimeType: string;
    storagePath: string;
  };
  platform: TemporaryPlatformImagePlatform;
  occurredAt?: Date;
  uploadBasePath?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const { sourceBuffer } = await readStoredMediaBuffer(input.mediaAsset.storagePath);

  if (!isSupportedStoredImageMimeType(input.mediaAsset.mimeType)) {
    throw new Error("This uploaded file type cannot be optimized for platform publishing.");
  }

  let generationSettings: { maxWidth: number; maxHeight: number; quality: number; folder: string };
  switch (input.platform) {
    case "GOOGLE_BUSINESS":
      generationSettings = {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 85,
        folder: "google",
      };
      break;
    case "INSTAGRAM":
      generationSettings = {
        maxWidth: 1080,
        maxHeight: 1350,
        quality: 88,
        folder: "instagram",
      };
      break;
    case "FACEBOOK":
    default:
      generationSettings = {
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 88,
        folder: "facebook",
      };
      break;
  }

  const outputBuffer = await generateVariantBuffer({
    sourceBuffer,
    sourceMimeType: input.mediaAsset.mimeType,
    maxWidth: generationSettings.maxWidth,
    maxHeight: generationSettings.maxHeight,
    quality: generationSettings.quality,
  });
  const storagePath = buildStoragePath(
    ["tmp", generationSettings.folder, ...getDetailedDatedPathSegments(occurredAt)],
    "jpg",
  );
  const metadata = await getImageMetadata(outputBuffer, JPEG_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  return {
    absolutePath,
    storagePath,
    mimeType: JPEG_MIME_TYPE,
    width: metadata.width,
    height: metadata.height,
    sizeBytes: BigInt(outputBuffer.byteLength),
    platform: input.platform,
  } satisfies TemporaryPlatformImage;
}

export async function cleanupTemporaryPlatformImage(absolutePath: string) {
  try {
    await unlink(absolutePath);
    return {
      absolutePath,
      status: "deleted",
      message: null,
    } satisfies TemporaryMediaCleanupResult;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        absolutePath,
        status: "missing",
        message: "Temporary platform image was already removed.",
      } satisfies TemporaryMediaCleanupResult;
    }

    return {
      absolutePath,
      status: "failed",
      message: error instanceof Error ? error.message : "Temporary platform image cleanup failed.",
    } satisfies TemporaryMediaCleanupResult;
  }
}

async function pruneEmptyDirectories(startingDirectory: string, stopAtDirectory: string) {
  let currentDirectory = startingDirectory;
  const normalizedStopAt = path.resolve(stopAtDirectory);

  while (currentDirectory.startsWith(normalizedStopAt) && currentDirectory !== normalizedStopAt) {
    try {
      const children = await readdir(currentDirectory);
      if (children.length > 0) {
        return;
      }

      await rm(currentDirectory, { recursive: false, force: true });
      currentDirectory = path.dirname(currentDirectory);
    } catch {
      return;
    }
  }
}

async function collectFilesRecursively(directoryPath: string, collected: string[] = []) {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectFilesRecursively(absolutePath, collected);
    } else if (entry.isFile()) {
      collected.push(absolutePath);
    }
  }

  return collected;
}

export async function cleanupTemporaryPlatformImagesOlderThan(input?: {
  maxAgeHours?: number;
  uploadBasePath?: string;
}) {
  const maxAgeHours = input?.maxAgeHours ?? 24;
  const uploadBasePath =
    input?.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const tempBasePath = path.join(uploadBasePath, "tmp");
  const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const summary = {
    scannedFiles: 0,
    deletedFiles: 0,
    failedDeletes: 0,
    deletedPaths: [] as string[],
    failedPaths: [] as Array<{ path: string; message: string }>,
  };

  try {
    const files = await collectFilesRecursively(tempBasePath);
    summary.scannedFiles = files.length;

    for (const filePath of files) {
      try {
        const fileStats = await stat(filePath);
        if (fileStats.mtimeMs > cutoffTime) {
          continue;
        }

        await unlink(filePath);
        summary.deletedFiles += 1;
        summary.deletedPaths.push(filePath);
        await pruneEmptyDirectories(path.dirname(filePath), tempBasePath);
      } catch (error) {
        summary.failedDeletes += 1;
        summary.failedPaths.push({
          path: filePath,
          message: error instanceof Error ? error.message : "Could not delete temporary file.",
        });
      }
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return summary;
}

export async function cleanupStoredPermanentMediaVariants(input?: {
  uploadBasePath?: string;
}) {
  const uploadBasePath =
    input?.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const variants = await prisma.mediaVariant.findMany({
    where: {
      variantType: {
        not: MediaVariantType.ORIGINAL,
      },
    },
    select: {
      id: true,
      storagePath: true,
      variantType: true,
    },
  });

  const summary = {
    foundVariants: variants.length,
    deletedFiles: 0,
    missingFiles: 0,
    failedDeletes: 0,
    deletedRecords: 0,
    failedPaths: [] as Array<{ variantId: string; storagePath: string; message: string }>,
  };

  for (const variant of variants) {
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, variant.storagePath);
    try {
      await unlink(absolutePath);
      summary.deletedFiles += 1;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        summary.missingFiles += 1;
      } else {
        summary.failedDeletes += 1;
        summary.failedPaths.push({
          variantId: variant.id,
          storagePath: variant.storagePath,
          message: error instanceof Error ? error.message : "Could not delete variant file.",
        });
      }
    }
  }

  const deleteResult = await prisma.mediaVariant.deleteMany({
    where: {
      variantType: {
        not: MediaVariantType.ORIGINAL,
      },
    },
  });
  summary.deletedRecords = deleteResult.count;

  return summary;
}

export function buildMediaVariantUrl(variantId: string) {
  return `/api/admin/media/${variantId}`;
}

export async function storeUploadedMedia(input: {
  file: File;
  adminUserId: string;
}) {
  const occurredAt = new Date();
  const uploadBasePath = resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const storedFiles: StoredMediaFile[] = [];

  try {
    const originalUpload = await saveOriginalUpload({
      file: input.file,
      occurredAt,
      uploadBasePath,
    });
    storedFiles.push(originalUpload);

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        originalFilename: originalUpload.originalFilename,
        mimeType: originalUpload.mimeType,
        sizeBytes: originalUpload.sizeBytes,
        width: originalUpload.width,
        height: originalUpload.height,
        storagePath: originalUpload.storagePath,
        createdByAdminUserId: input.adminUserId,
        variants: {
          create: [
            {
              variantType: MediaVariantType.ORIGINAL,
              mimeType: originalUpload.mimeType,
              sizeBytes: originalUpload.sizeBytes,
              width: originalUpload.width,
              height: originalUpload.height,
              storagePath: originalUpload.storagePath,
            },
          ],
        },
      },
      include: {
        variants: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return {
      mediaAsset,
      variants: mediaAsset.variants,
    };
  } catch (error) {
    await Promise.all(storedFiles.map((file) => unlink(file.absolutePath).catch(() => undefined)));
    throw error;
  }
}
