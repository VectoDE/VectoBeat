CREATE TABLE IF NOT EXISTS `contact_message_threads` (
  `id` varchar(191) NOT NULL,
  `ticket_id` varchar(191) NOT NULL,
  `author_id` varchar(191) NULL,
  `author_name` varchar(191) NULL,
  `role` varchar(50) NOT NULL DEFAULT 'user',
  `body` longtext NOT NULL,
  `attachments` json NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `contact_message_threads_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `contact_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX `contact_message_threads_ticket_id_idx` ON `contact_message_threads`(`ticket_id`);
