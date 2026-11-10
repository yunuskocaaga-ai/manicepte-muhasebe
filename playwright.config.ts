import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PORT = 3344;
const DATA_DIR = path.join(os.tmpdir(), `manicepte-e2e-${Date.now()}`);

// Bu ortamda Playwright'ın CDN'den tarayıcı indirmesi engellendiği için,
// daha önce bu makineye kurulmuş olan Chromium ikili dosyası doğrudan
// kullanılır (sürüm küçük bir fark içerse de temel etkileşimler için
// uyumludur).
const existingChromiumPath =
  "C:\\Users\\yunus emre\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe";
const launchOptions = { executablePath: existingChromiumPath };

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/giris`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SESSION_SECRET: "e2e-test-session-secret-32-characters-min",
      DEMO_ADMIN_EMAIL: "e2e@example.com",
      // "e2eTest1234" şifresinin bcrypt hash'i, base64 kodlanmış
      DEMO_ADMIN_PASSWORD_HASH_B64: "JDJiJDEwJE1zRTV4MkZYcTRNNk5odVh0QUF5Yy4vU3VvcXdtV1Zhc0JjWGRkSHJwZWFmMVFNNzBJQUhP",
      DEMO_DATA_DIR: DATA_DIR,
      NEXT_PUBLIC_SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
