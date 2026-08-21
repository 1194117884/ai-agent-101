CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`source` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_learner_created` ON `conversations` (`learner_id`,`created_at`);