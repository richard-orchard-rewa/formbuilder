CREATE TABLE "anchor_refs" (
	"anchor_id" uuid NOT NULL,
	"store" text NOT NULL,
	"store_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anchor_refs_anchor_id_store_pk" PRIMARY KEY("anchor_id","store")
);
--> statement-breakpoint
CREATE TABLE "anchors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"anchor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_code_refs" (
	"target" text NOT NULL,
	"code" text NOT NULL,
	"store" text NOT NULL,
	"store_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_code_refs_target_code_store_pk" PRIMARY KEY("target","code","store")
);
--> statement-breakpoint
CREATE TABLE "option_codes" (
	"target" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_codes_target_code_pk" PRIMARY KEY("target","code")
);
--> statement-breakpoint
ALTER TABLE "anchor_refs" ADD CONSTRAINT "anchor_refs_anchor_id_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."anchors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_code_refs" ADD CONSTRAINT "option_code_refs_target_code_option_codes_target_code_fk" FOREIGN KEY ("target","code") REFERENCES "public"."option_codes"("target","code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_refs_store_record" ON "anchor_refs" USING btree ("store","store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "option_code_refs_store_row" ON "option_code_refs" USING btree ("target","store","store_id");