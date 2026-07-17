import { AutomationsNav } from "@/components/automations/automations-nav";
import { Button } from "@/components/ui/button";
import { createAutomationFromRecipe } from "@/lib/automations/actions";
import { getRecipes } from "@/lib/automations/recipes";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { TRIGGER_TYPE_LABELS } from "@/lib/types/automations";

export default async function AutomationRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");
  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const recipes = getRecipes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Recipe gallery</h1>
        <p className="mt-2 text-muted-foreground">
          One-click templates — customise after install.
        </p>
      </div>
      <AutomationsNav current="/automations/recipes" />

      <div className="grid gap-4 md:grid-cols-2">
        {recipes.map((recipe) => (
          <div key={recipe.id} className="space-y-3 rounded-xl border p-4">
            <div>
              <p className="font-medium">{recipe.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {recipe.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Trigger: {TRIGGER_TYPE_LABELS[recipe.trigger.type]} ·{" "}
                {recipe.actions.length} actions
              </p>
            </div>
            <form action={createAutomationFromRecipe}>
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="recipeId" value={recipe.id} />
              <Button type="submit" size="sm">
                Install
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
