import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const paths = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const p of paths) {
  await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle" });
  const res = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa"]).analyze();
  const serious = res.violations.filter(v => v.impact === "critical" || v.impact === "serious");
  console.log("\n===== " + p + " =====");
  for (const v of serious) {
    console.log(v.id, "(" + v.impact + ")");
    for (const n of v.nodes) {
      console.log("  target:", JSON.stringify(n.target));
      const line = (n.failureSummary||"").split("\n").find(l=>/contrast|ratio/i.test(l));
      if (line) console.log("   ", line.trim());
    }
  }
  if (!serious.length) console.log("  (no critical/serious violations)");
}
await browser.close();
