CREATE TYPE "public"."budget_band" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."cooking_skill" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."household_type" AS ENUM('single', 'couple', 'family');--> statement-breakpoint
CREATE TYPE "public"."product_availability" AS ENUM('in_stock', 'low_stock', 'out_of_stock', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_item_status" AS ENUM('pending', 'bought', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."shopping_list_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TABLE "cached_search_results" (
	"id" text PRIMARY KEY NOT NULL,
	"cache_key" text NOT NULL,
	"query" text NOT NULL,
	"filters" jsonb,
	"product_ids" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'freshful.search' NOT NULL,
	"response_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freshful_products" (
	"id" text PRIMARY KEY NOT NULL,
	"freshful_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'RON' NOT NULL,
	"unit" text NOT NULL,
	"category" text NOT NULL,
	"tags" jsonb NOT NULL,
	"image_url" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"availability" "product_availability" NOT NULL,
	"search_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"household_type" "household_type" NOT NULL,
	"num_children" integer NOT NULL,
	"dietary_restrictions" jsonb NOT NULL,
	"allergies" jsonb NOT NULL,
	"medical_flags" jsonb NOT NULL,
	"goals" jsonb NOT NULL,
	"cuisine_preferences" jsonb NOT NULL,
	"favorite_ingredients" jsonb NOT NULL,
	"disliked_ingredients" jsonb NOT NULL,
	"budget_band" "budget_band" NOT NULL,
	"max_prep_time_minutes" integer NOT NULL,
	"cooking_skill" "cooking_skill" NOT NULL,
	"raw_chat_history_id" text NOT NULL,
	"contains_sensitive_health_data" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"overrides" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"duration_days" integer NOT NULL,
	"recipes" jsonb NOT NULL,
	"days" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"household_profile_id" text,
	"messages" jsonb NOT NULL,
	"contains_sensitive_profile_signals" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"ingredient_name" text NOT NULL,
	"required_quantity" numeric(10, 2) NOT NULL,
	"required_unit" text NOT NULL,
	"freshful_product_id" text,
	"chosen_quantity" numeric(10, 2),
	"chosen_unit" text,
	"estimated_price" numeric(10, 2),
	"category" text,
	"status" "shopping_list_item_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_estimated_cost" numeric(10, 2) NOT NULL,
	"status" "shopping_list_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"google_subject" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"photo_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_profiles" ADD CONSTRAINT "household_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_profiles" ADD CONSTRAINT "household_profiles_raw_chat_history_id_onboarding_transcripts_id_fk" FOREIGN KEY ("raw_chat_history_id") REFERENCES "public"."onboarding_transcripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_instances" ADD CONSTRAINT "meal_plan_instances_template_id_meal_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."meal_plan_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_instances" ADD CONSTRAINT "meal_plan_instances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_templates" ADD CONSTRAINT "meal_plan_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_transcripts" ADD CONSTRAINT "onboarding_transcripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_freshful_product_id_freshful_products_id_fk" FOREIGN KEY ("freshful_product_id") REFERENCES "public"."freshful_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_plan_id_meal_plan_instances_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plan_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cached_search_results_cache_key_idx" ON "cached_search_results" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "cached_search_results_expires_at_idx" ON "cached_search_results" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "freshful_products_freshful_id_idx" ON "freshful_products" USING btree ("freshful_id");--> statement-breakpoint
CREATE INDEX "freshful_products_category_idx" ON "freshful_products" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "household_profiles_user_id_idx" ON "household_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "household_profiles_raw_chat_history_idx" ON "household_profiles" USING btree ("raw_chat_history_id");--> statement-breakpoint
CREATE INDEX "meal_plan_instances_template_id_idx" ON "meal_plan_instances" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "meal_plan_instances_user_id_idx" ON "meal_plan_instances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meal_plan_templates_user_id_idx" ON "meal_plan_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_transcripts_user_id_idx" ON "onboarding_transcripts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_list_items_list_id_idx" ON "shopping_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "shopping_list_items_freshful_product_id_idx" ON "shopping_list_items" USING btree ("freshful_product_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_user_id_idx" ON "shopping_lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_plan_id_idx" ON "shopping_lists" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_idx" ON "users" USING btree ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");