# CECODES Carbon Footprint Tool: Decisions We Need From You

**To:** CECODES
**Re:** Open decisions blocking "full parity" and final acceptance
**Related:** Requirements §12 (open decisions) and §14 (definition of done)

The tool is substantially built. Companies can be created and isolated, data can be entered at the
right granularity (Scope 2 monthly, Scopes 1 and 3 annual), the factor library is loaded and
editable with full version history, and the dashboard shows real calculated totals in tonnes.

What remains is mostly **not engineering**. It is a set of decisions only CECODES can make, because
they define what "correct" means. Below are ten items. Each states the question, what it blocks, the
cost of getting it wrong, and **the default we will proceed with if we do not hear back**, so that
nothing stalls.

**Item 0 is the most important thing in this document.** Without it, we cannot demonstrate the one
thing the contract says the tool will be accepted on.

---

## 0. Send us a filled-in calculation workbook (BLOCKING)

**The question.** Please send one **completed** HC calculation spreadsheet for a single real or
sample company: the activity data as entered, and the CO2e totals your Excel produces from it.

**Why we are asking.** Requirements §14.1 defines the build as complete when "the tool reproduces
the **Excel's** CO2e totals for an agreed set of sample companies". The only workbook we have
(`CEC-PR-CTE-127 - Factores de emisión`) is the **factor library**. It contains the emission factors
and the change log, but no company's data and no totals. So there is currently nothing to compare
our results against.

**What it blocks.** The entire acceptance test. We can and do verify the tool against itself, but we
cannot verify it against *you*.

**Cost of not answering.** Total. We would be shipping an unverified calculation engine and asking
you to trust it.

**Default if you do not answer.** There is no possible default. We need the file.

---

## 1. How is the CH4 (methane) factor chosen?

**The question.** Your GWP sheet (`Hoja2`) says CH4 uses **29.8** for *"SÓLO COMBUSTIBLES"* (fuels
only) and **27** for *"LO QUE NO ES COMBUSTIBLE"* (what is not a fuel). But your factor table also
has a **biogenic** column (0/1). Which one actually drives the choice in your calculations: whether
the item **is a fuel**, or whether it is flagged **biogenic**?

**Why we are asking.** They are not the same thing, and they disagree on roughly 180 rows. For
example, sugarcane bagasse is a fuel *and* biogenic. Fugitive refrigerant leaks are neither. Under
one rule bagasse gets 29.8; under the other it gets 27.

**What it blocks.** The accuracy of every total that includes methane.

**Cost of getting it wrong.** Methane emissions are wrong in both directions across those rows.

**Our default.** We currently use the **biogenic column** (which matches IPCC guidance, where the
distinction is fossil vs biological origin, not fuel vs non-fuel). We have built this as a
**switchable setting**, so whichever answer you give is a one-line change on our side. If you send us
the workbook in item 0, we can also simply test both rules and see which one reproduces your numbers.

---

## 2. Is 2021 AR5 or AR6?

**The question.** For a 2021 reporting year, should we use the AR5 or the AR6 global warming
potentials?

**Why we are asking.** Your GWP sheet lists **only AR6 values** (CH4 29.8/27, N2O 273, SF6 24300,
NF3 17400). Our tool currently treats 2021 and earlier as AR5.

**What it blocks.** Every reporting year up to and including 2021.

**Our default.** Because your sheet appears to be AR6 throughout, **we recommend using AR6 for
2021** and will switch to that unless you tell us otherwise.

---

## 3. Is biogenic CO2 inside or outside the headline total?

**The question.** Should biogenic CO2 (from biomass, bagasse, organic waste) be **included** in the
company's headline footprint, or **excluded** and reported separately as a memo item?

**Why we are asking.** The GHG Protocol normally reports it separately. We need to know which number
you want on the front page.

**What it blocks.** Any total that contains biomass.

**Our default.** **Include it in the total and also disclose it separately.** That is what the tool
does today, and it is the safer of the two (you can always subtract a number you can see).

---

## 4. Which factor table is authoritative?

**The question.** You have two: the 2024 consolidated table (one CO2e factor per item) and the 2025
per-gas table (separate CO2/CH4/N2O with uncertainty).

**Our default.** **Use the 2025 per-gas table wherever it exists, and fall back to the 2024 table
elsewhere.** This is what we have loaded.

---

## 5. Five electricity grid factors disagree

**The question.** For 2019, 2021, 2022, 2023 and 2024, the grid emission factor in your Excel does
not match the value we were given. For example 2022 (0.112 vs 0.1123708) and 2023 (0.177 vs 0.1728).
Which is correct for each year? Also, eleven further years (2008 to 2018, and 2020) exist only in
your Excel and are not yet loaded.

**What it blocks.** **All Scope 2 (electricity) results.** This is the single largest category for
most companies.

**Cost of getting it wrong.** Scope 2 will never reconcile with your spreadsheet.

**Our default.** We will adopt **your Excel's values** and load the eleven missing years. Our tool
never overwrites these silently: it reports the conflict and a human resolves it, with an audit
trail.

---

## 6. The Scope 3 travel factors look inverted

**The question.** Your own change log flags this: the kilometre conversion appears to **multiply** by
1.609 where it should **divide** (1.609 is the km-per-mile conversion). Please confirm the correct
factors.

**Cost of getting it wrong.** Business-travel and commuting emissions are off by a factor of roughly
2.6.

**Our default.** Per your instruction, **we will correct the inversion ourselves** and ask you to
countersign the corrected values. The change will be made through the admin factor library, so it
carries a full audit trail showing who changed what and when.

---

## 7. The purchased-goods (spend-based) factors look implausible

**The question.** Some values look too high by orders of magnitude. The clearest example is cement at
approximately **3,924 kg CO2e per USD**, which would mean one dollar of cement emits nearly four
tonnes. Please verify the values and their units.

**What it blocks.** Scope 3 Category 1, which is the largest block in your library (about 1,172
rows).

**Our default.** **None. We are escalating this rather than guessing.** Unlike the travel factors,
we cannot tell what the correct value should be, and inventing one would be worse than asking.

---

## 8. COP/USD: one fixed rate, or per year?

**The question.** Your spreadsheet uses a single fixed exchange rate (approximately 3,743) for all
purchases. Should that stay fixed, or should it vary by reporting year?

**Cost of getting it wrong.** Year-over-year comparisons of purchased goods become invalid.

**Our default.** **Per year**, with your fixed rate as the default for 2025. This is strictly more
flexible: a per-year table can always hold the same number in every row.

---

## 9. The seven empty Scope 3 categories

**The question.** Categories C8 and C10 to C15 are empty in your Excel because they use calculation
methods other than the standard "activity x factor". You indicated CECODES is still working on these.
Please send the method and factors when ready.

**Our default.** **They stay out of "full parity" and are formally deferred**, as already agreed in
Requirements §12.A8. We will note this in the acceptance sign-off so there is no ambiguity later.

---

## 10. Three smaller confirmations

| Question | Our default if we do not hear back |
| --- | --- |
| **Meta (per-scope reduction targets)**: is this feature confirmed? You said "almost certainly yes" | **Yes.** It is built and live behind a switch |
| **Read-only auditor role** for external verifiers: needed for v1? | **Defer to a later version** |
| **Uncertainty ranges (+/- %)**: display them, or keep them internal? | **Internal for v1.** We store the data but do not show it |
| **Self-generated renewable energy** (solar, wind, hydro): report as zero-emission, or apply a factor? | **Track separately at zero** and disclose it |

---

## What happens next

We are not waiting on you to keep working. While these are open we will:

- build the parity test harness, so that the moment your workbook (item 0) arrives we can run the
  comparison immediately, and it will name the exact row where any difference appears;
- make the methane rule (item 1) switchable, so either answer is a trivial change;
- build the Excel and PDF exports, which will also give you a file you can diff directly against your
  spreadsheet.

**The one thing we genuinely cannot proceed without is item 0.** Everything else has a safe default.
