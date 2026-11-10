import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "e2e@example.com";
const ADMIN_PASSWORD = "e2eTest1234";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(ADMIN_EMAIL);
  await page.getByLabel("Şifre").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL("**/genel-bakis");
}

test.describe("ManiCepte temel akış", () => {
  test("giriş yapar, kişi ekler, gider oluşturur ve ödeme kaydeder", async ({ page }, testInfo) => {
    const personName = `Test Kişi ${testInfo.project.name} ${testInfo.repeatEachIndex}`;

    await login(page);
    await expect(page.getByRole("heading", { name: "Genel Bakış" })).toBeVisible();

    await page.goto("/kisiler");
    await page.getByPlaceholder("Ad Soyad").fill(personName);
    await page.getByRole("button", { name: "Ekle" }).click();
    await expect(page.getByText(personName).first()).toBeVisible();

    await page.goto("/giderler/yeni");
    await page.getByLabel("Gider Adı").fill("E2E Test Gideri");
    await page.getByLabel("Tutar (TL)").fill("100,00");
    await page.getByLabel("Ait Olduğu Ay").fill("2026-11");
    await page.getByLabel("Ödeme Günü").fill("20");
    const participantLabel = page.locator("label", { hasText: personName });
    await participantLabel.locator("xpath=preceding-sibling::input[@type='checkbox']").check();
    await page.getByRole("button", { name: "Gideri Kaydet" }).click();

    await page.waitForURL("**/giderler/**");
    await expect(page.getByText("Ödenmedi").first()).toBeVisible();
    await expect(page.getByText("₺100,00").first()).toBeVisible();

    await page.getByLabel("Ödeyen").selectOption({ label: personName });
    // "Ödeme Ekle" formu sayfada "Gideri Düzenle" formundan önce gelir,
    // bu yüzden ilk eşleşen etiket ödeme formundaki "kimin adına" kutusudur.
    const beneficiaryLabel = page.locator("label", { hasText: personName }).first();
    await beneficiaryLabel.locator("xpath=preceding-sibling::input[@type='checkbox']").check();
    await page.getByRole("button", { name: "Ödemeyi Kaydet" }).click();

    await page.waitForURL("**/giderler/**");
    await expect(page.getByText("Ödendi").first()).toBeVisible();
  });

  test("borçlar sayfası net bakiyeleri gösterir", async ({ page }) => {
    await login(page);
    await page.goto("/borclar");
    await expect(page.getByRole("heading", { name: "Borçlar", exact: true })).toBeVisible();
  });

  test("oturum olmadan korumalı sayfaya gidince girişe yönlendirilir", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/genel-bakis");
    await page.waitForURL("**/giris**");
    await expect(page.getByRole("heading", { name: "ManiCepte" })).toBeVisible();
  });
});
