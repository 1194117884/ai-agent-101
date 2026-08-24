ALTER TABLE `source_documents` ADD `source_file_name` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `source_mime_type` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `submitted_by` text;--> statement-breakpoint
CREATE INDEX `idx_source_submitted_by` ON `source_documents` (`submitted_by`,`created_at`);