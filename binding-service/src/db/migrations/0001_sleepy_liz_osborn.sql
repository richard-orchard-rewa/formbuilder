CREATE TABLE "binding_versions" (
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"descriptor" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "binding_versions_key_version_pk" PRIMARY KEY("key","version")
);
--> statement-breakpoint
CREATE TABLE "configured_bindings" (
	"key" text PRIMARY KEY NOT NULL,
	"strategy" text NOT NULL,
	"entity" text NOT NULL,
	"attribute" text NOT NULL,
	"target" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "binding_versions" ADD CONSTRAINT "binding_versions_key_configured_bindings_key_fk" FOREIGN KEY ("key") REFERENCES "public"."configured_bindings"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "binding_versions_one_draft" ON "binding_versions" USING btree ("key") WHERE "binding_versions"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "configured_bindings_attribute" ON "configured_bindings" USING btree ("entity","attribute");