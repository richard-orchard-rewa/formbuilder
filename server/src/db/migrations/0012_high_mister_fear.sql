CREATE TABLE "session_template_submission_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"participant" text,
	"anchor" jsonb,
	"baseline" jsonb,
	"values" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_template_submission_bindings" ADD CONSTRAINT "session_template_submission_bindings_submission_id_session_template_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."session_template_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_template_submission_bindings_submission_id" ON "session_template_submission_bindings" USING btree ("submission_id");