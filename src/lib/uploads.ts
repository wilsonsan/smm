import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { MediaVariantType } from "@prisma/client";
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

    const generatedVariants = await generateMediaVariants({
      occurredAt,
      sourceBuffer: originalUpload.sourceBuffer,
      sourceMimeType: originalUpload.mimeType,
      uploadBasePath,
    });
    storedFiles.push(...generatedVariants);

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
          create: storedFiles.map((file) => ({
            variantType: file.variantType,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            width: file.width,
            height: file.height,
            storagePath: file.storagePath,
          })),
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
