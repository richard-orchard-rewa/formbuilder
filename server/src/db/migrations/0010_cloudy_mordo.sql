CREATE TABLE "session_template_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_template_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_template_modules_template_id_module_id_key" UNIQUE("session_template_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "session_template_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_template_id" uuid NOT NULL,
	"session_template_version_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"submitted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"modules" jsonb NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	CONSTRAINT "session_template_versions_template_id_version_key" UNIQUE("session_template_id","version")
);
--> statement-breakpoint
CREATE TABLE "session_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_template_modules" ADD CONSTRAINT "session_template_modules_session_template_id_session_templates_id_fk" FOREIGN KEY ("session_template_id") REFERENCES "public"."session_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_template_modules" ADD CONSTRAINT "session_template_modules_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_template_submissions" ADD CONSTRAINT "session_template_submissions_session_template_id_session_templates_id_fk" FOREIGN KEY ("session_template_id") REFERENCES "public"."session_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_template_submissions" ADD CONSTRAINT "session_template_submissions_session_template_version_id_session_template_versions_id_fk" FOREIGN KEY ("session_template_version_id") REFERENCES "public"."session_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_template_versions" ADD CONSTRAINT "session_template_versions_session_template_id_session_templates_id_fk" FOREIGN KEY ("session_template_id") REFERENCES "public"."session_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_template_versions_one_published_per_template" ON "session_template_versions" USING btree ("session_template_id") WHERE "session_template_versions"."status" = 'published';