ALTER TABLE `contact_message_threads`
ADD INDEX `contact_message_threads_ticket_id_created_at_idx` (`ticket_id`, `created_at`);
