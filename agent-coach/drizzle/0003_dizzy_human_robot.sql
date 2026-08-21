CREATE TABLE `ai_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`label` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`key_hint` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_used_at` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `ai_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_key_channel_enabled` ON `ai_api_keys` (`channel_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `ai_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_channel_slug` ON `ai_channels` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_ai_channel_enabled_priority` ON `ai_channels` (`enabled`,`priority`);