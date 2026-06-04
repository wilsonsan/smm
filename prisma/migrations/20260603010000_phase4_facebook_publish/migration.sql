-- DropForeignKey
ALTER TABLE `PublishAttempt` DROP FOREIGN KEY `PublishAttempt_socialPostPlatformId_fkey`;

-- DropIndex
DROP INDEX `ConnectedAccount_platform_isActive_idx` ON `ConnectedAccount`;

-- DropIndex
DROP INDEX `PublishAttempt_socialPostPlatformId_attemptedAt_idx` ON `PublishAttempt`;

-- Alter ConnectedAccount
ALTER TABLE `ConnectedAccount`
  ADD COLUMN `accessTokenEncrypted` LONGTEXT NULL,
  ADD COLUMN `accountId` VARCHAR(191) NULL,
  ADD COLUMN `accountName` VARCHAR(191) NULL,
  ADD COLUMN `lastError` TEXT NULL,
  ADD COLUMN `lastTestedAt` DATETIME(3) NULL,
  ADD COLUMN `pageId` VARCHAR(191) NULL,
  ADD COLUMN `pageName` VARCHAR(191) NULL,
  ADD COLUMN `scopes` JSON NULL,
  ADD COLUMN `status` ENUM('CONNECTED', 'DISCONNECTED', 'ERROR') NULL,
  ADD COLUMN `tokenExpiresAt` DATETIME(3) NULL;

UPDATE `ConnectedAccount`
SET
  `accountId` = `externalAccountId`,
  `accountName` = `displayName`,
  `status` = IF(`isActive`, 'CONNECTED', 'DISCONNECTED');

ALTER TABLE `ConnectedAccount`
  DROP COLUMN `displayName`,
  DROP COLUMN `externalAccountId`,
  DROP COLUMN `isActive`,
  MODIFY `accountName` VARCHAR(191) NOT NULL,
  MODIFY `status` ENUM('CONNECTED', 'DISCONNECTED', 'ERROR') NOT NULL DEFAULT 'DISCONNECTED';

-- Alter SocialPostPlatform
ALTER TABLE `SocialPostPlatform`
  CHANGE COLUMN `externalPostId` `platformPostId` VARCHAR(191) NULL,
  ADD COLUMN `platformPostUrl` TEXT NULL;

-- Alter PublishAttempt
ALTER TABLE `PublishAttempt`
  ADD COLUMN `errorCode` VARCHAR(191) NULL,
  ADD COLUMN `errorMessage` TEXT NULL,
  ADD COLUMN `finishedAt` DATETIME(3) NULL,
  ADD COLUMN `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS') NULL,
  ADD COLUMN `platformPostId` VARCHAR(191) NULL,
  ADD COLUMN `platformPostUrl` TEXT NULL,
  ADD COLUMN `requestSummary` JSON NULL,
  ADD COLUMN `responseSummary` JSON NULL,
  ADD COLUMN `socialPostId` VARCHAR(191) NULL,
  ADD COLUMN `startedAt` DATETIME(3) NULL;

UPDATE `PublishAttempt` `pa`
INNER JOIN `SocialPostPlatform` `spp` ON `spp`.`id` = `pa`.`socialPostPlatformId`
SET
  `pa`.`socialPostId` = `spp`.`socialPostId`,
  `pa`.`platform` = `spp`.`platform`,
  `pa`.`startedAt` = `pa`.`attemptedAt`,
  `pa`.`responseSummary` = `pa`.`responsePayload`,
  `pa`.`errorMessage` = `pa`.`message`;

ALTER TABLE `PublishAttempt`
  DROP COLUMN `attemptedAt`,
  DROP COLUMN `message`,
  DROP COLUMN `responsePayload`,
  MODIFY `socialPostId` VARCHAR(191) NOT NULL,
  MODIFY `platform` ENUM('FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS') NOT NULL,
  MODIFY `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX `ConnectedAccount_platform_key` ON `ConnectedAccount`(`platform`);

-- CreateIndex
CREATE INDEX `ConnectedAccount_platform_status_idx` ON `ConnectedAccount`(`platform`, `status`);

-- CreateIndex
CREATE INDEX `PublishAttempt_socialPostId_startedAt_idx` ON `PublishAttempt`(`socialPostId`, `startedAt`);

-- CreateIndex
CREATE INDEX `PublishAttempt_socialPostPlatformId_startedAt_idx` ON `PublishAttempt`(`socialPostPlatformId`, `startedAt`);

-- CreateIndex
CREATE INDEX `PublishAttempt_platform_status_startedAt_idx` ON `PublishAttempt`(`platform`, `status`, `startedAt`);

-- AddForeignKey
ALTER TABLE `PublishAttempt`
  ADD CONSTRAINT `PublishAttempt_socialPostId_fkey`
  FOREIGN KEY (`socialPostId`) REFERENCES `SocialPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PublishAttempt`
  ADD CONSTRAINT `PublishAttempt_socialPostPlatformId_fkey`
  FOREIGN KEY (`socialPostPlatformId`) REFERENCES `SocialPostPlatform`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
