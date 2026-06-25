ALTER TABLE `SocialPost`
  ADD COLUMN `projectType` VARCHAR(191) NULL AFTER `descriptionGoogleBusiness`,
  ADD COLUMN `tileType` VARCHAR(191) NULL AFTER `projectType`,
  ADD COLUMN `roomType` VARCHAR(191) NULL AFTER `tileType`,
  ADD COLUMN `city` VARCHAR(191) NULL AFTER `roomType`;
