import { test, expect } from "@playwright/test"

/**
 * Flow 1 — Signup
 * A new visitor can create an account and is redirected to onboarding.
 */
test("signup flow", async ({ page }) => {
  await page.goto("/signup")
  await expect(page).toHaveTitle(/SportTrack/)

  const email = `test+${Date.now()}@sporttrack.test`
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/mot de passe|password/i).fill("TestPassword123!")
  await page.getByRole("button", { name: /créer|sign up|s'inscrire/i }).click()

  // After signup, user lands on onboarding or dashboard
  await expect(page).toHaveURL(/onboarding|dashboard/, { timeout: 10_000 })
})

/**
 * Flow 2 — Login
 * An existing user can log in and reach the dashboard.
 */
test("login flow", async ({ page }) => {
  await page.goto("/login")
  await expect(page).toHaveTitle(/SportTrack/)

  await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL ?? "demo@sporttrack.test")
  await page.getByLabel(/mot de passe|password/i).fill(process.env.E2E_PASSWORD ?? "Demo1234!")
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click()

  await expect(page).toHaveURL(/dashboard|onboarding/, { timeout: 10_000 })
})
