CREATE TABLE `diaries` (
	`id` text NOT NULL,
	`space_id` text NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diaries_space_id` ON `diaries` (`space_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_diaries_space_updated` ON `diaries` (`space_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `diary_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`mime` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_diary_assets_space` ON `diary_assets` (`space_id`);