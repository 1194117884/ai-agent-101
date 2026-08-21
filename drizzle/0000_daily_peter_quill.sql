CREATE TABLE `competencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`priority` text NOT NULL,
	`prerequisites_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competency_states` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`competency_id` text NOT NULL,
	`mastery` integer DEFAULT 0 NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`last_assessed_at` text,
	`review_due_at` text,
	`rationale` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_state_learner_competency` ON `competency_states` (`learner_id`,`competency_id`);--> statement-breakpoint
CREATE INDEX `idx_state_learner_review` ON `competency_states` (`learner_id`,`review_due_at`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`competency_id` text NOT NULL,
	`task_id` text,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`score` integer,
	`feedback` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `learning_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_learner_competency` ON `evidence` (`learner_id`,`competency_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `learner_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`learning_goal` text NOT NULL,
	`weekly_hours` integer NOT NULL,
	`timezone` text NOT NULL,
	`current_project` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`competency_id` text NOT NULL,
	`title` text NOT NULL,
	`instruction` text NOT NULL,
	`expected_output` text NOT NULL,
	`rubric_json` text NOT NULL,
	`status` text NOT NULL,
	`source_unit_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `learner_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_task_learner_status` ON `learning_tasks` (`learner_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source_type` text NOT NULL,
	`version_label` text,
	`reviewed_at` text,
	`trust_level` text NOT NULL,
	`status` text NOT NULL,
	`topic_ids_json` text NOT NULL,
	`summary` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_url_version` ON `source_documents` (`url`,`version_label`);