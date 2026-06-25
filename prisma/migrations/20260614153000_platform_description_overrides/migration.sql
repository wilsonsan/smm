ALTER TABLE `SocialPost`
  ADD COLUMN `descriptionMain` TEXT NULL AFTER `caption`,
  ADD COLUMN `descriptionFacebook` TEXT NULL AFTER `descriptionMain`,
  ADD COLUMN `descriptionInstagram` TEXT NULL AFTER `descriptionFacebook`,
  ADD COLUMN `descriptionGoogleBusiness` TEXT NULL AFTER `descriptionInstagram`;

UPDATE `SocialPost`
SET `descriptionMain` = `caption`
WHERE `descriptionMain` IS NULL;

ALTER TABLE `SocialPost`
  MODIFY `descriptionMain` TEXT NOT NULL;
