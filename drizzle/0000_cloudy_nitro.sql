CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`reception_enabled` integer DEFAULT true NOT NULL,
	`manual_busy` integer DEFAULT false NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_token_hash` ON `members` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_space_role` ON `members` (`space_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_members_space_id` ON `members` (`space_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`sender_member_id` text,
	`author_type` text DEFAULT 'human' NOT NULL,
	`assistant_for_member_id` text,
	`text` text NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`reply_to_id` text,
	`pending` integer DEFAULT false NOT NULL,
	`handled` integer DEFAULT false NOT NULL,
	`reply_mode` text,
	`client_nonce` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assistant_for_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_messages_space_nonce` ON `messages` (`space_id`,`client_nonce`);--> statement-breakpoint
CREATE INDEX `idx_messages_space_created` ON `messages` (`space_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_code` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_spaces_invite_code` ON `spaces` (`invite_code`);