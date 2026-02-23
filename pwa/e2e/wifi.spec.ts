import { test, expect } from "@playwright/test";

test("auto-connects via SSE and displays live sensor data", async ({ page }) => {
  await page.goto("/");

  // Should auto-connect — battery SOC appears in header
  // Real device reports a percentage; any value means data is flowing
  await expect(page.getByText(/%/)).toBeVisible({ timeout: 10_000 });

  // Status bar should show WiFi connected indicator
  await expect(page.getByText("WiFi")).toBeVisible();

  // Battery panel: voltage should show a real value (not --.-V)
  await expect(page.getByText(/\d+\.\d+V/)).toBeVisible({ timeout: 10_000 });

  // Fridge panel: temperature should show a real value (not --°C)
  await expect(page.getByText(/\-?\d+°C/)).toBeVisible();
});
