async function main() {
  const { chromium } = await import("playwright");
  const { writeFileSync } = await import("fs");

  const url = "https://www.fragrantica.com/perfume/Dior/Sauvage-2016-33822.html";
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);
  const html = await page.content();
  await browser.close();
  writeFileSync("/tmp/fragrantica-seasons.html", html);

  // Search for season-related content
  const seasonKeywords = ["spring", "summer", "fall", "autumn", "winter", "season"];
  for (const kw of seasonKeywords) {
    const regex = new RegExp(`.{0,100}${kw}.{0,100}`, "gi");
    const matches = html.match(regex)?.slice(0, 3);
    if (matches?.length) {
      console.log(`\n--- "${kw}" matches ---`);
      matches.forEach(m => console.log(m.replace(/\s+/g, " ").trim()));
    }
  }
}
main().catch(console.error);
