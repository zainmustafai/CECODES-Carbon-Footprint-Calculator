import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
const paths = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const p of paths) {
  try {
    await page.goto("http://localhost:3000" + p, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa"]).analyze();
    const serious = res.violations.filter(v => v.impact === "critical" || v.impact === "serious");
    console.log("===== " + p + " =====");
    for (const v of serious) {
      console.log(v.id, "(" + v.impact + ")  nodes=" + v.nodes.length);
      for (const n of v.nodes) {
        console.log("  target:", JSON.stringify(n.target));
        const line = (n.failureSummary||"").split("\n").map(s=>s.trim()).find(l=>/contrast of|ratio/i.test(l));
        if (line) console.log("    ->", line);
      }
    }
    if (!serious.length) console.log("  OK: no critical/serious");
  } catch (e) { console.log("===== " + p + " ERROR: " + e.message); }
}
await browser.close();
