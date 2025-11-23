CREATE TABLE `site_page_views` (
  `id` VARCHAR(191) NOT NULL,
  `path` VARCHAR(512) NOT NULL,
  `referrer` VARCHAR(512) NULL,
  `country` VARCHAR(8) NULL,
  `ip_hash` VARCHAR(128) NULL,
  `user_agent` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
);

CREATE INDEX `site_page_views_path_created_idx` ON `site_page_views` (`path`, `created_at`);
CREATE INDEX `site_page_views_created_idx` ON `site_page_views` (`created_at`);
