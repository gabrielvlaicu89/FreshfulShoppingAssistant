WITH ranked_drafts AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "user_id", "plan_id"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS draft_rank
	FROM "shopping_lists"
	WHERE "status" = 'draft'
)
DELETE FROM "shopping_lists"
WHERE "id" IN (SELECT "id" FROM ranked_drafts WHERE draft_rank > 1);

ALTER TABLE "shopping_list_items"
	ADD COLUMN "resolution_source" text NOT NULL DEFAULT 'unresolved';

ALTER TABLE "shopping_list_items"
	ADD COLUMN "resolution_reason" text NOT NULL DEFAULT 'Resolution metadata was not backfilled for this shopping list item.';

ALTER TABLE "shopping_list_items"
	ALTER COLUMN "resolution_source" DROP DEFAULT;

ALTER TABLE "shopping_list_items"
	ALTER COLUMN "resolution_reason" DROP DEFAULT;

CREATE UNIQUE INDEX "shopping_lists_active_draft_user_plan_idx" ON "shopping_lists" USING btree ("user_id","plan_id") WHERE "shopping_lists"."status" = 'draft';