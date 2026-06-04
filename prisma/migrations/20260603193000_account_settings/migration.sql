CREATE TABLE `_AdminUser_username_stage` (
  `id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_AdminUser_username_stage` (`id`, `username`)
SELECT
  `id`,
  LOWER(
    CONCAT(
      SUBSTRING_INDEX(`email`, '@', 1),
      '-',
      RIGHT(`id`, 6)
    )
  )
FROM `AdminUser`;

ALTER TABLE `AdminUser`
  ADD COLUMN `username` VARCHAR(191) NULL,
  ADD COLUMN `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'ADMIN';

UPDATE `AdminUser` AS `u`
INNER JOIN `_AdminUser_username_stage` AS `stage`
  ON `u`.`id` = `stage`.`id`
SET `u`.`username` = `stage`.`username`;

DROP TABLE `_AdminUser_username_stage`;

ALTER TABLE `AdminUser`
  MODIFY `username` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `AdminUser_username_key` ON `AdminUser`(`username`);
