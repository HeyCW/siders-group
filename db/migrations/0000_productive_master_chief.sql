CREATE TABLE `permissions` (
	`id` char(36) NOT NULL,
	`key` varchar(191) NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` char(36) NOT NULL,
	`permission_id` char(36) NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_id_pk` PRIMARY KEY(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` char(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`is_system` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`),
	CONSTRAINT `roles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`must_change_password` boolean NOT NULL DEFAULT true,
	`name` varchar(255) NOT NULL,
	`role_id` char(36) NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `readers` (
	`id` char(36) NOT NULL,
	`google_sub` varchar(128) NOT NULL,
	`email` varchar(320) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`name` varchar(255) NOT NULL,
	`avatar_url` text,
	`status` enum('active','banned') NOT NULL DEFAULT 'active',
	`muted_until` datetime(3),
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `readers_id` PRIMARY KEY(`id`),
	CONSTRAINT `readers_google_sub_unique` UNIQUE(`google_sub`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`subject_id` char(36) NOT NULL,
	`subject_type` enum('staff','reader') NOT NULL,
	`refresh_token_hash` varchar(128) NOT NULL,
	`family_id` char(36) NOT NULL,
	`user_agent` text,
	`ip_hash` varchar(128),
	`expires_at` datetime(3) NOT NULL,
	`absolute_expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_refresh_token_hash_unique` UNIQUE(`refresh_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` char(36) NOT NULL,
	`storage_path` varchar(512) NOT NULL,
	`mime` varchar(255) NOT NULL,
	`size_bytes` int NOT NULL,
	`original_filename` varchar(512) NOT NULL,
	`alt` text,
	`caption` text,
	`uploaded_by` char(36),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `media_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_storage_path_unique` UNIQUE(`storage_path`)
);
--> statement-breakpoint
CREATE TABLE `anak_usaha` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `anak_usaha_id` PRIMARY KEY(`id`),
	CONSTRAINT `anak_usaha_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `anak_usaha_profile` (
	`anak_usaha_id` char(36) NOT NULL,
	`logo_media_id` char(36),
	`background_color` varchar(32),
	`description` text,
	`kind` varchar(64) NOT NULL,
	`links` json NOT NULL DEFAULT ('[]'),
	`sort_order` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `anak_usaha_profile_anak_usaha_id` PRIMARY KEY(`anak_usaha_id`)
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` char(36) NOT NULL,
	`title` text NOT NULL,
	`slug` varchar(255) NOT NULL,
	`body_json` json NOT NULL,
	`body_html` text NOT NULL,
	`excerpt` text,
	`status` enum('draft','scheduled','published') NOT NULL DEFAULT 'draft',
	`author_id` char(36) NOT NULL,
	`featured_media_id` char(36),
	`anak_usaha_id` char(36),
	`seo_title` text,
	`seo_description` text,
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `article_categories` (
	`article_id` char(36) NOT NULL,
	`category_id` char(36) NOT NULL,
	CONSTRAINT `article_categories_article_id_category_id_pk` PRIMARY KEY(`article_id`,`category_id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `home_curation` (
	`article_id` char(36) NOT NULL,
	`position` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `home_curation_article_id` PRIMARY KEY(`article_id`),
	CONSTRAINT `home_curation_position_unique` UNIQUE(`position`)
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`logo_media_id` char(36) NOT NULL,
	`website_url` text,
	`sort_order` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guide_picks` (
	`id` char(36) NOT NULL,
	`city` varchar(255) NOT NULL,
	`place` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`photo_media_id` char(36) NOT NULL,
	`video_media_id` char(36) NOT NULL,
	`sort_order` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `guide_picks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `article_views_daily` (
	`article_id` char(36) NOT NULL,
	`date` date NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`unique_views` int NOT NULL DEFAULT 0,
	CONSTRAINT `article_views_daily_article_id_date_pk` PRIMARY KEY(`article_id`,`date`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` char(36) NOT NULL,
	`article_id` char(36) NOT NULL,
	`reader_id` char(36) NOT NULL,
	`body` text NOT NULL,
	`status` enum('visible','removed') NOT NULL DEFAULT 'visible',
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `likes` (
	`id` char(36) NOT NULL,
	`reader_id` char(36) NOT NULL,
	`article_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `likes_reader_article_unique` UNIQUE(`reader_id`,`article_id`)
);
--> statement-breakpoint
CREATE TABLE `view_seen` (
	`article_id` char(36) NOT NULL,
	`visitor_hash` varchar(128) NOT NULL,
	`date` date NOT NULL,
	CONSTRAINT `view_seen_article_id_visitor_hash_date_pk` PRIMARY KEY(`article_id`,`visitor_hash`,`date`)
);
--> statement-breakpoint
CREATE TABLE `comment_reports` (
	`id` char(36) NOT NULL,
	`comment_id` char(36) NOT NULL,
	`reporter_id` char(36) NOT NULL,
	`reason` enum('spam','harassment','off_topic','other') NOT NULL,
	`note` text,
	`created_at` datetime(3) NOT NULL,
	`resolved_at` datetime(3),
	`resolved_by` char(36),
	`is_open` boolean GENERATED ALWAYS AS ((`resolved_at` is null)) STORED NOT NULL,
	CONSTRAINT `comment_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `comment_reports_comment_reporter_unique` UNIQUE(`comment_id`,`reporter_id`)
);
--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` char(36) NOT NULL,
	`actor_id` char(36) NOT NULL,
	`target_type` enum('comment','reader') NOT NULL,
	`target_id` char(36) NOT NULL,
	`action` enum('comment_removed','comment_restored','comment_reports_dismissed','reader_muted','reader_unmuted','reader_banned','reader_unbanned') NOT NULL,
	`reason` text,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `moderation_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`organisation` varchar(255),
	`email` varchar(320) NOT NULL,
	`subject` varchar(512),
	`message` text NOT NULL,
	`status` enum('new','read') NOT NULL DEFAULT 'new',
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media` ADD CONSTRAINT `media_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anak_usaha_profile` ADD CONSTRAINT `anak_usaha_profile_anak_usaha_id_anak_usaha_id_fk` FOREIGN KEY (`anak_usaha_id`) REFERENCES `anak_usaha`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `anak_usaha_profile` ADD CONSTRAINT `anak_usaha_profile_logo_media_id_media_id_fk` FOREIGN KEY (`logo_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_featured_media_id_media_id_fk` FOREIGN KEY (`featured_media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `articles` ADD CONSTRAINT `articles_anak_usaha_id_anak_usaha_id_fk` FOREIGN KEY (`anak_usaha_id`) REFERENCES `anak_usaha`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `article_categories` ADD CONSTRAINT `article_categories_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `article_categories` ADD CONSTRAINT `article_categories_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `home_curation` ADD CONSTRAINT `home_curation_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `partners` ADD CONSTRAINT `partners_logo_media_id_media_id_fk` FOREIGN KEY (`logo_media_id`) REFERENCES `media`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guide_picks` ADD CONSTRAINT `guide_picks_photo_media_id_media_id_fk` FOREIGN KEY (`photo_media_id`) REFERENCES `media`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guide_picks` ADD CONSTRAINT `guide_picks_video_media_id_media_id_fk` FOREIGN KEY (`video_media_id`) REFERENCES `media`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `article_views_daily` ADD CONSTRAINT `article_views_daily_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comments` ADD CONSTRAINT `comments_reader_id_readers_id_fk` FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `likes` ADD CONSTRAINT `likes_reader_id_readers_id_fk` FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `likes` ADD CONSTRAINT `likes_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `view_seen` ADD CONSTRAINT `view_seen_article_id_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_reports` ADD CONSTRAINT `comment_reports_comment_id_comments_id_fk` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_reports` ADD CONSTRAINT `comment_reports_reporter_id_readers_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `readers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comment_reports` ADD CONSTRAINT `comment_reports_resolved_by_users_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moderation_actions` ADD CONSTRAINT `moderation_actions_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role_id`);--> statement-breakpoint
CREATE INDEX `sessions_subject_idx` ON `sessions` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `sessions_family_idx` ON `sessions` (`family_id`);--> statement-breakpoint
CREATE INDEX `media_uploaded_by_idx` ON `media` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `articles_status_published_at_idx` ON `articles` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `articles_author_idx` ON `articles` (`author_id`);--> statement-breakpoint
CREATE INDEX `articles_featured_media_idx` ON `articles` (`featured_media_id`);--> statement-breakpoint
CREATE INDEX `articles_anak_usaha_idx` ON `articles` (`anak_usaha_id`);--> statement-breakpoint
CREATE INDEX `article_categories_category_idx` ON `article_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `article_views_daily_date_idx` ON `article_views_daily` (`date`);--> statement-breakpoint
CREATE INDEX `comments_article_created_at_idx` ON `comments` (`article_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `likes_article_idx` ON `likes` (`article_id`);--> statement-breakpoint
CREATE INDEX `view_seen_date_idx` ON `view_seen` (`date`);--> statement-breakpoint
CREATE INDEX `comment_reports_open_idx` ON `comment_reports` (`is_open`,`comment_id`);--> statement-breakpoint
CREATE INDEX `moderation_actions_target_history_idx` ON `moderation_actions` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `moderation_actions_created_at_idx` ON `moderation_actions` (`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_created_at_idx` ON `contact_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX `contact_messages_status_idx` ON `contact_messages` (`status`);