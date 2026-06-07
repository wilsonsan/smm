CREATE TABLE `SocialPostMediaAsset` (
  `socialPostId` VARCHAR(191) NOT NULL,
  `mediaAssetId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`socialPostId`, `mediaAssetId`),
  UNIQUE INDEX `SocialPostMediaAsset_socialPostId_position_key`(`socialPostId`, `position`),
  INDEX `SocialPostMediaAsset_mediaAssetId_idx`(`mediaAssetId`),
  CONSTRAINT `SocialPostMediaAsset_socialPostId_fkey`
    FOREIGN KEY (`socialPostId`) REFERENCES `SocialPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SocialPostMediaAsset_mediaAssetId_fkey`
    FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `SocialPostMediaAsset` (`socialPostId`, `mediaAssetId`, `position`, `createdAt`, `updatedAt`)
SELECT `id`, `mediaAssetId`, 0, `createdAt`, `updatedAt`
FROM `SocialPost`
WHERE `mediaAssetId` IS NOT NULL;
