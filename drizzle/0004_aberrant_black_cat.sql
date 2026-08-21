CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_document_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`token_estimate` integer NOT NULL,
	`vector_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`indexed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_chunk_source_ordinal` ON `knowledge_chunks` (`source_document_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_chunk_vector_id` ON `knowledge_chunks` (`vector_id`);--> statement-breakpoint
CREATE INDEX `idx_chunk_source_status` ON `knowledge_chunks` (`source_document_id`,`status`);--> statement-breakpoint
ALTER TABLE `source_documents` ADD `content` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `ingestion_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `chunk_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `last_indexed_at` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `ingestion_error` text;--> statement-breakpoint
CREATE INDEX `idx_source_status_ingestion` ON `source_documents` (`status`,`ingestion_status`);