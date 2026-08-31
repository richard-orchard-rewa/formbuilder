ALTER TABLE "submissions" ADD COLUMN "form_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE restrict ON UPDATE no action;