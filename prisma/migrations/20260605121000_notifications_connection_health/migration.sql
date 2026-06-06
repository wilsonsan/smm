ALTER TABLE `ConnectedAccount`
  MODIFY `status` ENUM(
    'CONNECTED',
    'NEEDS_RECONNECT',
    'EXPIRED',
    'INVALID',
    'MISSING_SCOPES',
    'DISCONNECTED',
    'ERROR'
  ) NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN `lastSuccessfulTestAt` DATETIME(3) NULL,
  ADD COLUMN `lastFailedTestAt` DATETIME(3) NULL;

CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `type` ENUM(
    'TOKEN_EXPIRED',
    'TOKEN_INVALID',
    'MISSING_SCOPE',
    'PUBLISH_FAILED',
    'WORKER_ERROR',
    'INFO'
  ) NOT NULL,
  `provider` ENUM('FACEBOOK', 'INSTAGRAM', 'GOOGLE_BUSINESS') NULL,
  `severity` ENUM('INFO', 'WARNING', 'ERROR') NOT NULL DEFAULT 'INFO',
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `actionUrl` TEXT NULL,
  `status` ENUM('UNREAD', 'READ', 'DISMISSED') NOT NULL DEFAULT 'UNREAD',
  `readAt` DATETIME(3) NULL,
  `dismissedAt` DATETIME(3) NULL,
  `readByAdminUserId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Notification_status_createdAt_idx` ON `Notification`(`status`, `createdAt`);
CREATE INDEX `Notification_provider_type_status_idx` ON `Notification`(`provider`, `type`, `status`);
CREATE INDEX `Notification_readByAdminUserId_idx` ON `Notification`(`readByAdminUserId`);

ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_readByAdminUserId_fkey`
  FOREIGN KEY (`readByAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
