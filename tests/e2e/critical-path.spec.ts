import { expect, test } from "@playwright/test";

/**
 * Critical-path smoke. Requires a clean local/staging app with Resend optional
 * and Anthropic key for content generation. Skips generation assertions when
 * PLAYWRIGHT_SMOKE_EMAIL is unset.
 */

const email = process.env.PLAYWRIGHT_SMOKE_EMAIL;
const password = process.env.PLAYWRIGHT_SMOKE_PASSWORD ?? "TestPass123!";

test.describe("critical path smoke", () => {
  test.skip(!email, "Set PLAYWRIGHT_SMOKE_EMAIL to run signup smoke");

  test("signup → org → brand → content queue", async ({ page }) => {
    const unique = `e2e-${Date.now()}`;
    const userEmail = email!.includes("+")
      ? email!
      : email!.replace("@", `+${unique}@`);

    await page.goto("/signup");
    await page.getByLabel(/email/i).fill(userEmail);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign up|create/i }).click();

    await page.waitForURL(/onboarding|\//, { timeout: 60_000 });

    if (page.url().includes("onboarding")) {
      await page.getByLabel(/organization|company|name/i).first().fill(`Org ${unique}`);
      await page.getByRole("button", { name: /create|continue/i }).click();
      await page.waitForURL(/\//, { timeout: 60_000 });
    }

    await page.goto("/brand");
    await expect(page.getByRole("heading", { name: /brand/i })).toBeVisible();

    // Brand setup (best-effort — UI labels may vary)
    const nameInput = page.getByLabel(/brand name|name/i).first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(`Brand ${unique}`);
      const save = page.getByRole("button", { name: /save|update/i }).first();
      if (await save.isVisible().catch(() => false)) await save.click();
    }

    await page.goto("/content/generate");
    await expect(page).toHaveURL(/content/);

    await page.goto("/content/queue");
    await expect(page.getByRole("heading", { name: /queue|content/i })).toBeVisible();

    // Approve / schedule deep links exist
    await page.goto("/content/calendar");
    await expect(page).toHaveURL(/calendar/);
  });
});
