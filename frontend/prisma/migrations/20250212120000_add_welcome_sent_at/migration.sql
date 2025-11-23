ALTER TABLE `user_profiles`
ADD COLUMN `welcome_sent_at` DATETIME NULL AFTER `last_seen`;
