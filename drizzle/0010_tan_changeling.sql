CREATE TABLE `knowledge_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`conversion` text,
	`character_count` integer DEFAULT 0 NOT NULL,
	`part_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_submission_user_created` ON `knowledge_submissions` (`submitted_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_submission_status_created` ON `knowledge_submissions` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `source_documents` ADD `submission_id` text REFERENCES knowledge_submissions(id);--> statement-breakpoint
CREATE INDEX `idx_source_submission` ON `source_documents` (`submission_id`);