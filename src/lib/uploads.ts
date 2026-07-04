import { access, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { MediaVariantType, Prisma } from "@prisma/client";
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
const WEBP_MIME_TYPE = "image/webp";
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

type ValidatedUpload = {
  buffer: Buffer;
  contentHash: string;
  extension: string;
  mimeType: string;
};

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

export type DeleteMediaAssetResult =
  | {
      status: "deleted";
      mediaAssetId: string;
      deletedFileCount: number;
      missingFileCount: number;
    }
  | {
      status: "blocked";
      mediaAssetId: string;
      blockingPostIds: string[];
    };

export type ClearGalleryLibraryResult = {
  deletedMediaAssetCount: number;
  deletedVariantRecordCount: number;
  deletedFileCount: number;
  missingFileCount: number;
  failedFileDeleteCount: number;
};

export type MediaAssetEditInput = {
  mediaAssetId: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: string;
  annotations?: unknown;
  uploadBasePath?: string;
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
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    extension: detectedType.ext,
    mimeType: detectedType.mime,
  } satisfies ValidatedUpload;
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

async function generateWebpVariantBuffer(input: {
  maxHeight: number;
  maxWidth: number;
  quality: number;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
}) {
  try {
    return await sharp(input.sourceBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width: input.maxWidth,
        height: input.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColorspace("srgb")
      .webp({
        quality: input.quality,
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
  validatedUpload?: ValidatedUpload;
}) {
  const validatedFile = input.validatedUpload ?? (await validateUploadedFile(input.file));
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

async function findExistingMediaAssetByContentHash(input: {
  contentHash: string;
  height: number;
  mimeType: string;
  sizeBytes: bigint;
  width: number;
}) {
  const exactMatch = await prisma.mediaAsset.findFirst({
    where: {
      contentHash: input.contentHash,
    },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (exactMatch) {
    return exactMatch;
  }

  const legacyCandidates = await prisma.mediaAsset.findMany({
    where: {
      contentHash: null,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
    take: 25,
  });

  for (const candidate of legacyCandidates) {
    try {
      const { sourceBuffer } = await readStoredMediaBuffer(candidate.storagePath);
      const candidateHash = createHash("sha256").update(sourceBuffer).digest("hex");
      if (candidateHash !== input.contentHash) {
        continue;
      }

      await prisma.mediaAsset
        .update({
          where: { id: candidate.id },
          data: { contentHash: candidateHash },
        })
        .catch(() => undefined);

      return {
        ...candidate,
        contentHash: candidateHash,
      };
    } catch {
      continue;
    }
  }

  return null;
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

export async function generateGalleryThumbnailVariant(input: {
  occurredAt?: Date;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  uploadBasePath?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const outputBuffer = await generateWebpVariantBuffer({
    sourceBuffer: input.sourceBuffer,
    sourceMimeType: input.sourceMimeType,
    maxWidth: 400,
    maxHeight: 400,
    quality: 76,
  });
  const storagePath = buildStoragePath(["thumbnails", ...getDatedPathSegments(occurredAt)], "webp");
  const metadata = await getImageMetadata(outputBuffer, WEBP_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: WEBP_MIME_TYPE,
    sizeBytes: BigInt(outputBuffer.byteLength),
    storagePath,
    variantType: MediaVariantType.GALLERY_THUMBNAIL,
    width: metadata.width,
  } satisfies GeneratedVariant;
}

export async function generateGalleryPreviewVariant(input: {
  occurredAt?: Date;
  sourceBuffer: Buffer;
  sourceMimeType?: string;
  uploadBasePath?: string;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const outputBuffer = await generateWebpVariantBuffer({
    sourceBuffer: input.sourceBuffer,
    sourceMimeType: input.sourceMimeType,
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 82,
  });
  const storagePath = buildStoragePath(["previews", ...getDatedPathSegments(occurredAt)], "webp");
  const metadata = await getImageMetadata(outputBuffer, WEBP_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: WEBP_MIME_TYPE,
    sizeBytes: BigInt(outputBuffer.byteLength),
    storagePath,
    variantType: MediaVariantType.GALLERY_PREVIEW,
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
    generateGalleryThumbnailVariant(input),
    generateGalleryPreviewVariant(input),
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

export async function deleteStoredFile(storagePath: string, input?: { uploadBasePath?: string }) {
  const uploadBasePath =
    input?.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const absolutePath = ensureSafeAbsolutePath(uploadBasePath, storagePath);

  try {
    await unlink(absolutePath);
    return {
      absolutePath,
      status: "deleted" as const,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        absolutePath,
        status: "missing" as const,
      };
    }

    throw error;
  }
}

export async function saveSettingsProfileImage(input: {
  file: File;
  folder: string;
  previousStoragePath?: string | null;
  uploadBasePath?: string;
}) {
  const occurredAt = new Date();
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const validatedUpload = await validateUploadedFile(input.file);
  const outputBuffer = await generateVariantBuffer({
    sourceBuffer: validatedUpload.buffer,
    sourceMimeType: validatedUpload.mimeType,
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 90,
  });
  const storagePath = buildStoragePath(
    ["settings", input.folder, ...getDetailedDatedPathSegments(occurredAt)],
    "jpg",
  );
  const metadata = await getImageMetadata(outputBuffer, JPEG_MIME_TYPE);
  const absolutePath = await writeStoredFile(uploadBasePath, storagePath, outputBuffer);

  if (input.previousStoragePath && input.previousStoragePath !== storagePath) {
    await deleteStoredFile(input.previousStoragePath, { uploadBasePath }).catch(() => undefined);
  }

  return {
    absolutePath,
    storagePath,
    mimeType: JPEG_MIME_TYPE,
    width: metadata.width,
    height: metadata.height,
    sizeBytes: BigInt(outputBuffer.byteLength),
  };
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

export async function deleteStoredMediaAsset(input: {
  mediaAssetId: string;
  uploadBasePath?: string;
}) {
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);

  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: {
      id: input.mediaAssetId,
    },
    include: {
      variants: {
        select: {
          id: true,
          storagePath: true,
        },
      },
      attachedToPosts: {
        select: {
          socialPost: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!mediaAsset) {
    throw new Error("The selected media asset no longer exists.");
  }

  const blockingPosts = mediaAsset.attachedToPosts
    .map((relation) => relation.socialPost)
    .filter((post) => post.status !== "PUBLISHED");
  if (blockingPosts.length > 0) {
    return {
      status: "blocked",
      mediaAssetId: mediaAsset.id,
      blockingPostIds: blockingPosts.map((post) => post.id),
    } satisfies DeleteMediaAssetResult;
  }

  let deletedFileCount = 0;
  let missingFileCount = 0;

  const uniqueStoragePaths = new Set<string>([mediaAsset.storagePath, ...mediaAsset.variants.map((variant) => variant.storagePath)]);

  for (const storagePath of uniqueStoragePaths) {
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, storagePath);
    try {
      await unlink(absolutePath);
      deletedFileCount += 1;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        missingFileCount += 1;
      } else {
        throw error;
      }
    }
  }

  await prisma.mediaAsset.delete({
    where: {
      id: mediaAsset.id,
    },
  });

  return {
    status: "deleted",
    mediaAssetId: mediaAsset.id,
    deletedFileCount,
    missingFileCount,
  } satisfies DeleteMediaAssetResult;
}

export async function clearStoredGalleryLibrary(input?: {
  uploadBasePath?: string;
}) {
  const uploadBasePath =
    input?.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const mediaAssets = await prisma.mediaAsset.findMany({
    select: {
      id: true,
      storagePath: true,
      variants: {
        select: {
          id: true,
          storagePath: true,
        },
      },
    },
  });

  const uniqueStoragePaths = new Set<string>();
  let deletedFileCount = 0;
  let missingFileCount = 0;
  let failedFileDeleteCount = 0;
  let deletedVariantRecordCount = 0;

  for (const mediaAsset of mediaAssets) {
    uniqueStoragePaths.add(mediaAsset.storagePath);
    deletedVariantRecordCount += mediaAsset.variants.length;

    for (const variant of mediaAsset.variants) {
      uniqueStoragePaths.add(variant.storagePath);
    }
  }

  for (const storagePath of uniqueStoragePaths) {
    const absolutePath = ensureSafeAbsolutePath(uploadBasePath, storagePath);
    try {
      await unlink(absolutePath);
      deletedFileCount += 1;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        missingFileCount += 1;
      } else {
        failedFileDeleteCount += 1;
      }
    }
  }

  const deleteResult = await prisma.mediaAsset.deleteMany({});

  return {
    deletedMediaAssetCount: deleteResult.count,
    deletedVariantRecordCount,
    deletedFileCount,
    missingFileCount,
    failedFileDeleteCount,
  } satisfies ClearGalleryLibraryResult;
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
    const validatedUpload = await validateUploadedFile(input.file);
    const metadata = await getImageMetadata(validatedUpload.buffer, validatedUpload.mimeType);
    const existingMediaAsset = await findExistingMediaAssetByContentHash({
      contentHash: validatedUpload.contentHash,
      mimeType: validatedUpload.mimeType,
      sizeBytes: BigInt(validatedUpload.buffer.byteLength),
      width: metadata.width,
      height: metadata.height,
    });

    if (existingMediaAsset) {
      const refreshedMediaAsset = await ensureGalleryVariantsForMediaAsset({
        mediaAssetId: existingMediaAsset.id,
        uploadBasePath,
      });

      return {
        status: "duplicate" as const,
        mediaAsset: refreshedMediaAsset,
        variants: refreshedMediaAsset.variants,
      };
    }

    const originalUpload = await saveOriginalUpload({
      file: input.file,
      occurredAt,
      uploadBasePath,
      validatedUpload,
    });
    storedFiles.push(originalUpload);

    const galleryVariants = await Promise.all([
      generateGalleryThumbnailVariant({
        occurredAt,
        sourceBuffer: originalUpload.sourceBuffer,
        sourceMimeType: originalUpload.mimeType,
        uploadBasePath,
      }),
      generateGalleryPreviewVariant({
        occurredAt,
        sourceBuffer: originalUpload.sourceBuffer,
        sourceMimeType: originalUpload.mimeType,
        uploadBasePath,
      }),
    ]);
    storedFiles.push(...galleryVariants);

    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        contentHash: validatedUpload.contentHash,
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
            ...galleryVariants.map((variant) => ({
              variantType: variant.variantType,
              mimeType: variant.mimeType,
              sizeBytes: variant.sizeBytes,
              width: variant.width,
              height: variant.height,
              storagePath: variant.storagePath,
            })),
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
      status: "uploaded" as const,
      mediaAsset,
      variants: mediaAsset.variants,
    };
  } catch (error) {
    await Promise.all(storedFiles.map((file) => unlink(file.absolutePath).catch(() => undefined)));
    throw error;
  }
}

export async function ensureGalleryVariantsForMediaAsset(input: {
  mediaAssetId: string;
  uploadBasePath?: string;
}) {
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);

  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: {
      id: input.mediaAssetId,
    },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!mediaAsset) {
    throw new Error("Media asset not found.");
  }

  const hasThumbnail = mediaAsset.variants.some((variant) => variant.variantType === MediaVariantType.GALLERY_THUMBNAIL);
  const hasPreview = mediaAsset.variants.some((variant) => variant.variantType === MediaVariantType.GALLERY_PREVIEW);

  if (hasThumbnail && hasPreview) {
    return mediaAsset;
  }

  const { sourceBuffer } = await readStoredMediaBuffer(mediaAsset.storagePath);
  const createdVariants: GeneratedVariant[] = [];

  try {
    if (!hasThumbnail) {
      const thumbnailVariant = await generateGalleryThumbnailVariant({
        sourceBuffer,
        sourceMimeType: mediaAsset.mimeType,
        uploadBasePath,
      });
      createdVariants.push(thumbnailVariant);
    }

    if (!hasPreview) {
      const previewVariant = await generateGalleryPreviewVariant({
        sourceBuffer,
        sourceMimeType: mediaAsset.mimeType,
        uploadBasePath,
      });
      createdVariants.push(previewVariant);
    }

    if (createdVariants.length > 0) {
      await prisma.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: {
          variants: {
            createMany: {
              data: createdVariants.map((variant) => ({
                variantType: variant.variantType,
                mimeType: variant.mimeType,
                sizeBytes: variant.sizeBytes,
                width: variant.width,
                height: variant.height,
                storagePath: variant.storagePath,
              })),
              skipDuplicates: true,
            },
          },
        },
      });
    }

    return await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaAsset.id },
      include: {
        variants: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } catch (error) {
    await Promise.all(createdVariants.map((variant) => unlink(variant.absolutePath).catch(() => undefined)));
    throw error;
  }
}

function getMediaVariantRecord(
  variants: Array<{
    id: string;
    variantType: MediaVariantType;
    mimeType: string;
    sizeBytes: bigint;
    width: number;
    height: number;
    storagePath: string;
  }>,
  variantType: MediaVariantType,
) {
  return variants.find((variant) => variant.variantType === variantType) ?? null;
}

function clampCropRegion(input: {
  crop: MediaAssetEditInput["crop"];
  sourceWidth: number;
  sourceHeight: number;
}) {
  const x = Math.max(0, Math.min(Math.round(input.crop.x), Math.max(0, input.sourceWidth - 1)));
  const y = Math.max(0, Math.min(Math.round(input.crop.y), Math.max(0, input.sourceHeight - 1)));
  const width = Math.max(1, Math.min(Math.round(input.crop.width), input.sourceWidth - x));
  const height = Math.max(1, Math.min(Math.round(input.crop.height), input.sourceHeight - y));

  return {
    left: x,
    top: y,
    width,
    height,
  };
}

async function buildEditedMediaBuffer(input: {
  sourceBuffer: Buffer;
  crop: MediaAssetEditInput["crop"];
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
}) {
  let transformedBuffer = await sharp(input.sourceBuffer, { failOn: "none" })
    .rotate(input.rotation, { background: LIGHT_BACKGROUND })
    .flop(input.flipHorizontal)
    .flip(input.flipVertical)
    .toColorspace("srgb")
    .toBuffer();

  const transformedMetadata = await getImageMetadata(transformedBuffer, JPEG_MIME_TYPE);
  const extractRegion = clampCropRegion({
    crop: input.crop,
    sourceWidth: transformedMetadata.width,
    sourceHeight: transformedMetadata.height,
  });

  return sharp(transformedBuffer, { failOn: "none" })
    .extract(extractRegion)
    .flatten({ background: LIGHT_BACKGROUND })
    .jpeg({
      quality: 92,
      progressive: false,
      force: true,
    })
    .toBuffer();
}

async function saveActiveEditedFile(input: {
  occurredAt: Date;
  outputBuffer: Buffer;
  uploadBasePath: string;
}) {
  const storagePath = buildStoragePath(["edited", ...getDetailedDatedPathSegments(input.occurredAt)], "jpg");
  const metadata = await getImageMetadata(input.outputBuffer, JPEG_MIME_TYPE);
  const absolutePath = await writeStoredFile(input.uploadBasePath, storagePath, input.outputBuffer);

  return {
    absolutePath,
    height: metadata.height,
    mimeType: JPEG_MIME_TYPE,
    sizeBytes: BigInt(input.outputBuffer.byteLength),
    storagePath,
    width: metadata.width,
  };
}

function buildMediaEditHistory(input: {
  crop: MediaAssetEditInput["crop"];
  zoom: number;
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectRatio: string;
  annotations?: unknown;
  occurredAt: Date;
}) {
  const editHistory: Prisma.InputJsonValue = {
    crop: {
      x: Math.round(input.crop.x),
      y: Math.round(input.crop.y),
      width: Math.round(input.crop.width),
      height: Math.round(input.crop.height),
    },
    zoom: input.zoom,
    rotation: input.rotation,
    flipHorizontal: input.flipHorizontal,
    flipVertical: input.flipVertical,
    aspectRatio: input.aspectRatio,
    annotationsEnabled: Boolean(input.annotations),
    savedAt: input.occurredAt.toISOString(),
  };

  return editHistory;
}

export async function saveEditedMediaAsset(input: MediaAssetEditInput) {
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const occurredAt = new Date();
  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: { id: input.mediaAssetId },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!mediaAsset) {
    throw new Error("This media asset no longer exists.");
  }

  const originalVariant =
    getMediaVariantRecord(mediaAsset.variants, MediaVariantType.ORIGINAL) ??
    ({
      id: `${mediaAsset.id}-synthetic-original`,
      variantType: MediaVariantType.ORIGINAL,
      mimeType: mediaAsset.mimeType,
      sizeBytes: mediaAsset.sizeBytes,
      width: mediaAsset.width,
      height: mediaAsset.height,
      storagePath: mediaAsset.storagePath,
    } as const);

  if (!isSupportedStoredImageMimeType(originalVariant.mimeType)) {
    throw new Error("This file type cannot be edited in the photo editor.");
  }

  const { sourceBuffer } = await readStoredMediaBuffer(originalVariant.storagePath);
  const createdFiles: Array<{ absolutePath: string; storagePath: string }> = [];
  const previousThumbnail = getMediaVariantRecord(mediaAsset.variants, MediaVariantType.GALLERY_THUMBNAIL);
  const previousPreview = getMediaVariantRecord(mediaAsset.variants, MediaVariantType.GALLERY_PREVIEW);

  try {
    const editedBuffer = await buildEditedMediaBuffer({
      sourceBuffer,
      crop: input.crop,
      rotation: input.rotation,
      flipHorizontal: input.flipHorizontal,
      flipVertical: input.flipVertical,
    });

    const activeFile = await saveActiveEditedFile({
      occurredAt,
      outputBuffer: editedBuffer,
      uploadBasePath,
    });
    createdFiles.push({ absolutePath: activeFile.absolutePath, storagePath: activeFile.storagePath });

    const thumbnailVariant = await generateGalleryThumbnailVariant({
      occurredAt,
      sourceBuffer: editedBuffer,
      sourceMimeType: activeFile.mimeType,
      uploadBasePath,
    });
    createdFiles.push({ absolutePath: thumbnailVariant.absolutePath, storagePath: thumbnailVariant.storagePath });

    const previewVariant = await generateGalleryPreviewVariant({
      occurredAt,
      sourceBuffer: editedBuffer,
      sourceMimeType: activeFile.mimeType,
      uploadBasePath,
    });
    createdFiles.push({ absolutePath: previewVariant.absolutePath, storagePath: previewVariant.storagePath });

    await prisma.$transaction(async (tx) => {
      if (!getMediaVariantRecord(mediaAsset.variants, MediaVariantType.ORIGINAL)) {
        await tx.mediaVariant.create({
          data: {
            mediaAssetId: mediaAsset.id,
            variantType: MediaVariantType.ORIGINAL,
            mimeType: mediaAsset.mimeType,
            sizeBytes: mediaAsset.sizeBytes,
            width: mediaAsset.width,
            height: mediaAsset.height,
            storagePath: mediaAsset.storagePath,
          },
        });
      }

      await tx.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: {
          mimeType: activeFile.mimeType,
          sizeBytes: activeFile.sizeBytes,
          width: activeFile.width,
          height: activeFile.height,
          storagePath: activeFile.storagePath,
          isEdited: true,
          editedAt: occurredAt,
          editHistoryJson: buildMediaEditHistory({
            crop: input.crop,
            zoom: input.zoom,
            rotation: input.rotation,
            flipHorizontal: input.flipHorizontal,
            flipVertical: input.flipVertical,
            aspectRatio: input.aspectRatio,
            annotations: input.annotations,
            occurredAt,
          }),
        },
      });

      await tx.mediaVariant.upsert({
        where: {
          mediaAssetId_variantType: {
            mediaAssetId: mediaAsset.id,
            variantType: MediaVariantType.GALLERY_THUMBNAIL,
          },
        },
        update: {
          mimeType: thumbnailVariant.mimeType,
          sizeBytes: thumbnailVariant.sizeBytes,
          width: thumbnailVariant.width,
          height: thumbnailVariant.height,
          storagePath: thumbnailVariant.storagePath,
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantType: MediaVariantType.GALLERY_THUMBNAIL,
          mimeType: thumbnailVariant.mimeType,
          sizeBytes: thumbnailVariant.sizeBytes,
          width: thumbnailVariant.width,
          height: thumbnailVariant.height,
          storagePath: thumbnailVariant.storagePath,
        },
      });

      await tx.mediaVariant.upsert({
        where: {
          mediaAssetId_variantType: {
            mediaAssetId: mediaAsset.id,
            variantType: MediaVariantType.GALLERY_PREVIEW,
          },
        },
        update: {
          mimeType: previewVariant.mimeType,
          sizeBytes: previewVariant.sizeBytes,
          width: previewVariant.width,
          height: previewVariant.height,
          storagePath: previewVariant.storagePath,
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantType: MediaVariantType.GALLERY_PREVIEW,
          mimeType: previewVariant.mimeType,
          sizeBytes: previewVariant.sizeBytes,
          width: previewVariant.width,
          height: previewVariant.height,
          storagePath: previewVariant.storagePath,
        },
      });
    });

    const replacedStoragePaths = new Set<string>();
    if (mediaAsset.storagePath !== originalVariant.storagePath && mediaAsset.storagePath !== activeFile.storagePath) {
      replacedStoragePaths.add(mediaAsset.storagePath);
    }
    if (previousThumbnail && previousThumbnail.storagePath !== thumbnailVariant.storagePath) {
      replacedStoragePaths.add(previousThumbnail.storagePath);
    }
    if (previousPreview && previousPreview.storagePath !== previewVariant.storagePath) {
      replacedStoragePaths.add(previousPreview.storagePath);
    }

    await Promise.all(
      [...replacedStoragePaths].map((storagePath) =>
        deleteStoredFile(storagePath, { uploadBasePath }).catch(() => undefined),
      ),
    );

    return prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaAsset.id },
      include: {
        variants: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } catch (error) {
    await Promise.all(createdFiles.map((file) => unlink(file.absolutePath).catch(() => undefined)));
    throw error;
  }
}

export async function revertEditedMediaAssetToOriginal(input: {
  mediaAssetId: string;
  uploadBasePath?: string;
}) {
  const uploadBasePath =
    input.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const occurredAt = new Date();
  const mediaAsset = await prisma.mediaAsset.findUnique({
    where: { id: input.mediaAssetId },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!mediaAsset) {
    throw new Error("This media asset no longer exists.");
  }

  const originalVariant = getMediaVariantRecord(mediaAsset.variants, MediaVariantType.ORIGINAL);
  if (!originalVariant) {
    throw new Error("The original uploaded file is missing, so this image cannot be reverted.");
  }

  const { sourceBuffer } = await readStoredMediaBuffer(originalVariant.storagePath);
  const createdFiles: Array<{ absolutePath: string; storagePath: string }> = [];
  const previousThumbnail = getMediaVariantRecord(mediaAsset.variants, MediaVariantType.GALLERY_THUMBNAIL);
  const previousPreview = getMediaVariantRecord(mediaAsset.variants, MediaVariantType.GALLERY_PREVIEW);

  try {
    const thumbnailVariant = await generateGalleryThumbnailVariant({
      occurredAt,
      sourceBuffer,
      sourceMimeType: originalVariant.mimeType,
      uploadBasePath,
    });
    createdFiles.push({ absolutePath: thumbnailVariant.absolutePath, storagePath: thumbnailVariant.storagePath });

    const previewVariant = await generateGalleryPreviewVariant({
      occurredAt,
      sourceBuffer,
      sourceMimeType: originalVariant.mimeType,
      uploadBasePath,
    });
    createdFiles.push({ absolutePath: previewVariant.absolutePath, storagePath: previewVariant.storagePath });

    await prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: {
          mimeType: originalVariant.mimeType,
          sizeBytes: originalVariant.sizeBytes,
          width: originalVariant.width,
          height: originalVariant.height,
          storagePath: originalVariant.storagePath,
          isEdited: false,
          editedAt: null,
          editHistoryJson: Prisma.JsonNull,
        },
      });

      await tx.mediaVariant.upsert({
        where: {
          mediaAssetId_variantType: {
            mediaAssetId: mediaAsset.id,
            variantType: MediaVariantType.GALLERY_THUMBNAIL,
          },
        },
        update: {
          mimeType: thumbnailVariant.mimeType,
          sizeBytes: thumbnailVariant.sizeBytes,
          width: thumbnailVariant.width,
          height: thumbnailVariant.height,
          storagePath: thumbnailVariant.storagePath,
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantType: MediaVariantType.GALLERY_THUMBNAIL,
          mimeType: thumbnailVariant.mimeType,
          sizeBytes: thumbnailVariant.sizeBytes,
          width: thumbnailVariant.width,
          height: thumbnailVariant.height,
          storagePath: thumbnailVariant.storagePath,
        },
      });

      await tx.mediaVariant.upsert({
        where: {
          mediaAssetId_variantType: {
            mediaAssetId: mediaAsset.id,
            variantType: MediaVariantType.GALLERY_PREVIEW,
          },
        },
        update: {
          mimeType: previewVariant.mimeType,
          sizeBytes: previewVariant.sizeBytes,
          width: previewVariant.width,
          height: previewVariant.height,
          storagePath: previewVariant.storagePath,
        },
        create: {
          mediaAssetId: mediaAsset.id,
          variantType: MediaVariantType.GALLERY_PREVIEW,
          mimeType: previewVariant.mimeType,
          sizeBytes: previewVariant.sizeBytes,
          width: previewVariant.width,
          height: previewVariant.height,
          storagePath: previewVariant.storagePath,
        },
      });
    });

    const replacedStoragePaths = new Set<string>();
    if (mediaAsset.storagePath !== originalVariant.storagePath) {
      replacedStoragePaths.add(mediaAsset.storagePath);
    }
    if (previousThumbnail && previousThumbnail.storagePath !== thumbnailVariant.storagePath) {
      replacedStoragePaths.add(previousThumbnail.storagePath);
    }
    if (previousPreview && previousPreview.storagePath !== previewVariant.storagePath) {
      replacedStoragePaths.add(previousPreview.storagePath);
    }

    await Promise.all(
      [...replacedStoragePaths].map((storagePath) =>
        deleteStoredFile(storagePath, { uploadBasePath }).catch(() => undefined),
      ),
    );

    return prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaAsset.id },
      include: {
        variants: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } catch (error) {
    await Promise.all(createdFiles.map((file) => unlink(file.absolutePath).catch(() => undefined)));
    throw error;
  }
}

export async function backfillGalleryMediaVariants(input?: {
  batchSize?: number;
  uploadBasePath?: string;
  logger?: Pick<Console, "log" | "warn" | "error">;
}) {
  const batchSize = Math.max(1, input?.batchSize ?? 50);
  const uploadBasePath =
    input?.uploadBasePath ??
    resolveUploadBasePath((await getUploadDirectory()) || env.UPLOAD_DIR);
  const logger = input?.logger ?? console;

  let cursorId: string | null = null;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: Array<{ mediaAssetId: string; originalFilename: string; message: string }> = [];

  while (true) {
    let mediaAssets: Array<{
      id: string;
      originalFilename: string;
      variants: Array<{
        variantType: MediaVariantType;
      }>;
    }>;

    if (cursorId) {
      mediaAssets = await prisma.mediaAsset.findMany({
        take: batchSize,
        skip: 1,
        cursor: { id: cursorId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          originalFilename: true,
          variants: {
            select: {
              variantType: true,
            },
          },
        },
      });
    } else {
      mediaAssets = await prisma.mediaAsset.findMany({
        take: batchSize,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          originalFilename: true,
          variants: {
            select: {
              variantType: true,
            },
          },
        },
      });
    }

    if (mediaAssets.length === 0) {
      break;
    }

    for (const mediaAsset of mediaAssets) {
      scanned += 1;
      const hasThumbnail = mediaAsset.variants.some((variant) => variant.variantType === MediaVariantType.GALLERY_THUMBNAIL);
      const hasPreview = mediaAsset.variants.some((variant) => variant.variantType === MediaVariantType.GALLERY_PREVIEW);

      if (hasThumbnail && hasPreview) {
        skipped += 1;
        continue;
      }

      try {
        await ensureGalleryVariantsForMediaAsset({
          mediaAssetId: mediaAsset.id,
          uploadBasePath,
        });
        updated += 1;
        logger.log(`Backfilled gallery variants for ${mediaAsset.originalFilename} (${mediaAsset.id}).`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Unknown backfill error.";
        failures.push({
          mediaAssetId: mediaAsset.id,
          originalFilename: mediaAsset.originalFilename,
          message,
        });
        logger.warn(`Skipped ${mediaAsset.originalFilename} (${mediaAsset.id}): ${message}`);
      }
    }

    cursorId = mediaAssets[mediaAssets.length - 1]?.id ?? null;
  }

  return {
    scanned,
    updated,
    skipped,
    failed,
    failures,
  };
}
