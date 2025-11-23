ALTER TABLE `user_profiles`
ADD COLUMN `username` VARCHAR(255) NULL,
ADD COLUMN `display_name` VARCHAR(255) NULL,
ADD COLUMN `avatar_url` VARCHAR(512) NULL;

CREATE TABLE `user_profile_settings` (
  `discord_id` VARCHAR(191) NOT NULL,
  `handle` VARCHAR(64) NOT NULL,
  `profile_name` VARCHAR(255) NULL,
  `headline` VARCHAR(255) NULL,
  `bio` TEXT NULL,
  `location` VARCHAR(255) NULL,
  `website` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `user_profile_settings_handle_key`(`handle`),
  PRIMARY KEY (`discord_id`),
  CONSTRAINT `user_profile_settings_discord_id_fkey` FOREIGN KEY (`discord_id`) REFERENCES `user_profiles`(`discord_id`) ON DELETE CASCADE ON UPDATE CASCADE
);
