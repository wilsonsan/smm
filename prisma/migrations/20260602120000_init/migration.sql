-- CreateTable
CREATE TABLE `AdminUser` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NULL,
  `lastLoginAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AdminUser_email_key`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSession` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AdminSession_tokenHash_key`(`tokenHash`),
  INDEX `AdminSession_adminUserId_idx`(`adminUserId`),
  INDEX `AdminSession_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppSetting` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AppSetting_key_key`(`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MediaAsset` (
  `id` VARCHAR(191) NOT NULL,
  `originalFilename` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `width` INTEGER NOT NULL,
  `height` INTEGER NOT NULL,
  `storagePath` VARCHAR(191) NOT NULL,
  `createdByAdminUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `MediaAsset_createdByAdminUserId_idx`(`createdByAdminUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialPost` (
  `id` VARCHAR(191) NOT NULL,
  `internalTitle` VARCHAR(191) NOT NULL,
  `caption` TEXT NOT NULL,
  `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `scheduledAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `failureReason` TEXT NULL,
  `mediaAssetId` VARCHAR(191) NULL,
  `createdByAdminUserId` VARCHAR(191) NOT NULL,
  `updatedByAdminUserId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `SocialPost_status_scheduledAt_idx`(`status`, `scheduledAt`),
  INDEX `SocialPost_mediaAssetId_idx`(`mediaAssetId`),
  INDEX `SocialPost_createdByAdminUserId_idx`(`createdByAdminUserId`),
  INDEX `SocialPost_updatedByAdminUserId_idx`(`updatedByAdminUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialPostPlatform` (
  `id` VARCHAR(191) NOT NULL,
  `socialPostId` VARCHAR(191) NOT NULL,
  `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS') NOT NULL,
  `status` ENUM('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `scheduledAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `externalPostId` VARCHAR(191) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SocialPostPlatform_socialPostId_platform_key`(`socialPostId`, `platform`),
  INDEX `SocialPostPlatform_platform_status_scheduledAt_idx`(`platform`, `status`, `scheduledAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PublishAttempt` (
  `id` VARCHAR(191) NOT NULL,
  `socialPostPlatformId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'SKIPPED_DEV_PLACEHOLDER', 'SUCCEEDED', 'FAILED') NOT NULL,
  `message` TEXT NULL,
  `responsePayload` JSON NULL,
  `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PublishAttempt_socialPostPlatformId_attemptedAt_idx`(`socialPostPlatformId`, `attemptedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `actorAdminUserId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NULL,
  `targetId` VARCHAR(191) NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_actorAdminUserId_idx`(`actorAdminUserId`),
  INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConnectedAccount` (
  `id` VARCHAR(191) NOT NULL,
  `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS') NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `externalAccountId` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT false,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ConnectedAccount_platform_isActive_idx`(`platform`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AdminSession`
  ADD CONSTRAINT `AdminSession_adminUserId_fkey`
  FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MediaAsset`
  ADD CONSTRAINT `MediaAsset_createdByAdminUserId_fkey`
  FOREIGN KEY (`createdByAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPost`
  ADD CONSTRAINT `SocialPost_mediaAssetId_fkey`
  FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPost`
  ADD CONSTRAINT `SocialPost_createdByAdminUserId_fkey`
  FOREIGN KEY (`createdByAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPost`
  ADD CONSTRAINT `SocialPost_updatedByAdminUserId_fkey`
  FOREIGN KEY (`updatedByAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialPostPlatform`
  ADD CONSTRAINT `SocialPostPlatform_socialPostId_fkey`
  FOREIGN KEY (`socialPostId`) REFERENCES `SocialPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishAttempt`
  ADD CONSTRAINT `PublishAttempt_socialPostPlatformId_fkey`
  FOREIGN KEY (`socialPostPlatformId`) REFERENCES `SocialPostPlatform`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_actorAdminUserId_fkey`
  FOREIGN KEY (`actorAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
