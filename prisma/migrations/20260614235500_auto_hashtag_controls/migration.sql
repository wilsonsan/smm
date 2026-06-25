ALTER TABLE `SocialPost`
  ADD COLUMN `hashtags` JSON NULL AFTER `city`,
  ADD COLUMN `includeHashtagsInGoogle` BOOLEAN NOT NULL DEFAULT false AFTER `hashtags`;
