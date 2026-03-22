import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("로그인 페이지가 로드된다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[name=username], input[type=text]").first()).toBeVisible();
  });

  test("헬스체크 API가 동작한다", async ({ request }) => {
    const res = await request.get("/api/health");
    const data = await res.json();
    expect(data).toHaveProperty("ok");
    expect(data).toHaveProperty("db");
  });
});
