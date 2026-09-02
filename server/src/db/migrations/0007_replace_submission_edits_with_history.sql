DROP TABLE "submission_edits";--> statement-breakpoint
CREATE TABLE "submission_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"legacy_data" jsonb,
	"status" text NOT NULL,
	"submitted_by" text,
	"migrated_from_submission_id" uuid,
	"edited_by" text,
	"active_from" timestamp with time zone NOT NULL,
	"active_to" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission_history" ADD CONSTRAINT "submission_history_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_history_submission_id" ON "submission_history" USING btree ("submission_id");
