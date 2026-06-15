import type { Browser, BrowserContext } from "playwright";

export const FRAGRANTICA_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Singleton Chromium shared across requests — launching a browser per request
// costs ~1s each and concurrent searches would stack instances. Stored on
// globalThis so it survives dev HMR, same pattern as lib/db.ts.
const globalForBrowser = globalThis as unknown as {
  _fragranticaBrowser?: Promise<Browser> | null;
};

async function launchBrowser(): Promise<Browser> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("PLAYWRIGHT_NOT_INSTALLED: Run: npx playwright install chromium");
  }
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });
}

export async function getFragranticaBrowser(): Promise<Browser> {
  const existing = globalForBrowser._fragranticaBrowser;
  if (existing) {
    try {
      const browser = await existing;
      if (browser.isConnected()) return browser;
    } catch {
      // previous launch failed — relaunch below
    }
  }
  const next = launchBrowser();
  globalForBrowser._fragranticaBrowser = next;
  try {
    return await next;
  } catch (e) {
    globalForBrowser._fragranticaBrowser = null;
    throw e;
  }
}

/** Fresh isolated context on the shared browser. Callers must close it. */
export async function newFragranticaContext(): Promise<BrowserContext> {
  const browser = await getFragranticaBrowser();
  return browser.newContext({
    userAgent: FRAGRANTICA_UA,
    extraHTTPHeaders: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
}
