CREATE TABLE "submission_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"anchor" jsonb,
	"baseline" jsonb,
	"values" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission_bindings" ADD CONSTRAINT "submission_bindings_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_bindings_submission_id" ON "submission_bindings" USING btree ("submission_id");