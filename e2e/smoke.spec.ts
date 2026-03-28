import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("로그인 페이지가 로드된다", async ({ page }) => {
    await page.goto("/login");
    // 아이디 필드는 name/type 미설정(기본 text)이라 [type=text] 선택자에 걸리지 않을 수 있음
    await expect(page.getByRole("textbox", { name: "아이디 입력" })).toBeVisible();
  });

  test("헬스체크 API가 동작한다", async ({ request }) => {
    const res = await request.get("/api/health");
    const data = await res.json();
    expect(data).toHaveProperty("ok");
    expect(data).toHaveProperty("db");
  });
});
