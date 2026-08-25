ALTER TABLE `knowledge_submissions` ADD `submitter_name` text;--> statement-breakpoint
ALTER TABLE `knowledge_submissions` ADD `object_key` text;--> statement-breakpoint
ALTER TABLE `knowledge_submissions` ADD `attempt` integer DEFAULT 0 NOT NULL;
