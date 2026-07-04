CREATE TABLE `MediaCategory` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NOT NULL,
  `icon` VARCHAR(191) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `MediaCategory_slug_key`(`slug`),
  INDEX `MediaCategory_sortOrder_name_idx`(`sortOrder`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MediaAssetCategory` (
  `mediaAssetId` VARCHAR(191) NOT NULL,
  `mediaCategoryId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `MediaAssetCategory_mediaCategoryId_idx`(`mediaCategoryId`),
  PRIMARY KEY (`mediaAssetId`, `mediaCategoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MediaAssetCategory`
  ADD CONSTRAINT `MediaAssetCategory_mediaAssetId_fkey`
  FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MediaAssetCategory`
  ADD CONSTRAINT `MediaAssetCategory_mediaCategoryId_fkey`
  FOREIGN KEY (`mediaCategoryId`) REFERENCES `MediaCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
