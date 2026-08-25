CREATE TABLE `knowledge_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_document_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`requested_by` text,
	`started_at` text,
	`finished_at` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_job_status_created` ON `knowledge_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_job_document_created` ON `knowledge_jobs` (`source_document_id`,`created_at`);