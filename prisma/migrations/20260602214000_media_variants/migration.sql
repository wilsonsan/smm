-- CreateTable
CREATE TABLE `MediaVariant` (
  `id` VARCHAR(191) NOT NULL,
  `mediaAssetId` VARCHAR(191) NOT NULL,
  `variantType` ENUM('ORIGINAL', 'FACEBOOK_FEED', 'GOOGLE_BUSINESS_SAFE', 'INSTAGRAM_FEED_PLACEHOLDER') NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `width` INTEGER NOT NULL,
  `height` INTEGER NOT NULL,
  `storagePath` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MediaVariant_mediaAssetId_variantType_key`(`mediaAssetId`, `variantType`),
  INDEX `MediaVariant_mediaAssetId_idx`(`mediaAssetId`),
  INDEX `MediaVariant_variantType_idx`(`variantType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MediaVariant`
  ADD CONSTRAINT `MediaVariant_mediaAssetId_fkey`
  FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
