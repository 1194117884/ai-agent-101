CREATE TABLE `knowledge_retrieval_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text,
	`query` text NOT NULL,
	`retrieval_mode` text NOT NULL,
	`result_count` integer NOT NULL,
	`matches_json` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`vector_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_retrieval_created` ON `knowledge_retrieval_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_retrieval_mode_created` ON `knowledge_retrieval_logs` (`retrieval_mode`,`created_at`);