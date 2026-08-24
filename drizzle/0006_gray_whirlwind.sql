CREATE TABLE `knowledge_eval_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`expected_document_id` text,
	`expected_terms_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_run_at` text,
	`last_mode` text,
	`last_passed` integer,
	`last_matches_json` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`expected_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_eval_status_updated` ON `knowledge_eval_cases` (`status`,`updated_at`);