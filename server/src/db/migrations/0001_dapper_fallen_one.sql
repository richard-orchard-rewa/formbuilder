ALTER TABLE "forms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_slug_unique" UNIQUE("slug");