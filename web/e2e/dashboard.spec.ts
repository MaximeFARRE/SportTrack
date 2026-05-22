import { test, expect } from "@playwright/test"

test.use({
  storageState: process.env.E2E_STORAGE_STATE ?? undefined,
})

/**
 * Flow 3 — View dashboard
 * An authenticated user can view the dashboard with key sections.
 */
test("dashboard loads key sections", async ({ page }) => {
  await page.goto("/dashboard")

  // Redirects to login if not authenticated
  const url = page.url()
  if (url.includes("/login")) {
    test.skip(true, "No authenticated session available — set E2E_STORAGE_STATE")
    return
  }

  await expect(page.getByText(/bonjour/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/forme du jour/i)).toBeVisible()
  await expect(page.getByText(/cette semaine/i)).toBeVisible()
})

/**
 * Flow 4 — Create activity
 * An authenticated user can navigate to the new activity form.
 */
test("create activity form is accessible", async ({ page }) => {
  await page.goto("/activities/new")

  const url = page.url()
  if (url.includes("/login")) {
    test.skip(true, "No authenticated session available — set E2E_STORAGE_STATE")
    return
  }

  await expect(page.getByRole("heading", { name: /nouvelle|new activity/i })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByLabel(/sport/i)).toBeVisible()
})

/**
 * Flow 5 — Connect Strava
 * An authenticated user can navigate to the connections page.
 */
test("connections page shows Strava option", async ({ page }) => {
  await page.goto("/connections")

  const url = page.url()
  if (url.includes("/login")) {
    test.skip(true, "No authenticated session available — set E2E_STORAGE_STATE")
    return
  }

  await expect(page.getByText(/strava/i)).toBeVisible({ timeout: 10_000 })
})
