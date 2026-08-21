CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`competency_id` text NOT NULL,
	`question` text NOT NULL,
	`rubric_json` text NOT NULL,
	`answer` text,
	`score` integer,
	`feedback` text,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assessment_learner_status` ON `assessments` (`learner_id`,`status`,`created_at`);