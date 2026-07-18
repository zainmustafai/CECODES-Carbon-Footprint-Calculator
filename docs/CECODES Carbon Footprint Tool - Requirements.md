# CECODES Carbon Footprint Tool Requirements & Scope Agreement

**Project:** Carbon Footprint Calculator + Visualization Dashboard _(Herramienta de Huella de Carbono)_
**Prepared for:** CECODES and the development team a shared, plain-language agreement on _what_ will be built
**Version:** 1.1 (updated with CECODES review comments, 2026-07-09)
**Date:** 2026-07-09

---

## How to read this document

This document describes **what** the tool must do, in plain language, so that CECODES and the development team agree on the same product **before** any code is written.

- It does **not** choose any technology. How it is built (frameworks, database, hosting) is the development team's decision and is intentionally left out.
- Spanish terms are kept in _(parentheses and italics)_ because those are the exact words used in the Excel tool and by CECODES. This keeps both sides using the same vocabulary.
- Anything still open is collected in **Section 12 Decisions CECODES must confirm**. Please review that section carefully.

This tool is based directly on CECODES's existing Excel tool, **"CEC-PR-CTE-127 Factores de emisión Herramienta HC CECODES"**, which is treated as the **source of truth** for all calculations and emission factors.

---

## 1. Purpose & Vision

CECODES needs a web-based tool that lets Colombian companies **measure their annual corporate carbon footprint** _(huella de carbono)_ and **understand it through a visual dashboard**.

A company logs in, enters its activity data (fuel used, electricity consumed, waste generated, business travel, etc.) across the three greenhouse-gas scopes **electricity month by month, everything else as an annual figure** and the tool automatically converts that data into greenhouse-gas emissions expressed in **tonnes of CO₂ equivalent (t CO₂e)**. The results are shown on an interactive dashboard, broken down by scope, category, facility, and year, and can be exported as a report.

The tool replaces the current spreadsheet-based process with a **multi-company online platform** that produces the **same numbers the Excel produces**, but is easier to use, safer, and visual.

---

## 2. Who Uses It & What They Can Do (Roles)

The tool is **self-service for member companies**, overseen by a CECODES administrator. There are two main roles.

### 2.1 Company User _(Usuario Empresa)_

A person from a member company. They can:

- Register and log in to their own account.
- Create and manage their **company profile** _(empresa)_.
- Add one or more **facilities** a plant _(planta)_ at a location _(sede / ubicación)_.
- Create **reporting years** _(años)_ and enter activity data (monthly for Scope 2, annual for Scopes 1 & 3).
- Run the calculation and see their **dashboard** and totals.
- Set a **reduction target** _(Meta)_ per scope and track progress against it. _(Pending CECODES confirmation see Section 12.)_
- Export their **reports** (PDF / Excel).
- **See only their own company's data.** No company can see another company's data.

### 2.2 CECODES Administrator _(Administrador CECODES)_

A CECODES staff member. They can do everything a Company User can, **plus**:

- **Manage the emission-factor library** add, edit, and version emission factors, units, sources, and the yearly electricity grid factor (see Section 8).
- **Manage the category structure** _(Scope → Category → Subcategory → Element)_.
- **Manage companies and user accounts** (create, approve, deactivate).
- Optionally view **aggregate/anonymous statistics** across all participating companies (to be confirmed Section 12).

> **Optional third role Viewer / Auditor (read-only):** a person who can view a company's results but not edit them (e.g. an external verifier). Marked as _optional_ for now confirm in Section 12 whether it's needed.

---

## 3. The App Journey (End-to-End Flow)

This is the same flow CECODES already sketched inside the Excel tool:

```
 ┌──────────┐   ┌────────────────────┐   ┌─────────────────────┐   ┌──────────────────┐   ┌───────────────┐
 │ 1. LOG   │ → │ 2. COMPANY SETUP   │ → │ 3. ENTER DATA       │ → │ 4. AUTO-CALCULATE│ → │ 5. DASHBOARD  │
 │    IN    │   │ Company, facility, │   │ Scope → Category →  │   │ Activity × factor│   │ Charts, totals│
 │          │   │ location, year     │   │ Subcategory →       │   │ → CO₂e, roll-up  │   │ export report │
 │          │   │                    │   │ Element → value   │   │ to totals        │   │               │
 │          │   │                    │   │ (Sc2=monthly)    │   │                  │   │               │
 └──────────┘   └────────────────────┘   └─────────────────────┘   └──────────────────┘   └───────────────┘
```

1. **Log in** _(Iniciar sesión)_ the user signs into their company account.
2. **Company setup** _(Información de la empresa)_ company name, facility/plant, location, and the reporting year.
3. **Enter data** _(Llenar el formulario)_ for each emission source, the user drills down Scope → Category → Subcategory → Element and enters the activity value in the element's unit. **Scope 2 (electricity) is entered month by month _(Enero–Diciembre)_; Scope 1 and Scope 3 are entered as a single annual value.**
4. **Auto-calculate** _(Cálculos)_ the tool converts activity data into CO₂e using the factor library and GWP rules.
5. **Dashboard** _(Tablero)_ the results are visualized and can be exported.

Users can leave and return at any time; their data is **saved** and can be **edited** later.

---

## 4. Shared Glossary (so both sides mean the same thing)

| Term                                               | Plain meaning                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Greenhouse gas (GHG)** _(GEI)_                   | A gas that traps heat (CO₂, methane CH₄, nitrous oxide N₂O, refrigerants, SF₆, NF₃).                           |
| **Scope 1** _(Alcance 1)_                          | **Direct** emissions from sources the company owns/controls e.g. fuel it burns, refrigerant leaks.             |
| **Scope 2** _(Alcance 2)_                          | **Indirect** emissions from the **electricity** the company buys.                                              |
| **Scope 3** _(Alcance 3)_                          | **Other indirect** emissions business travel, employee commuting, purchased goods & services, waste, etc.      |
| **Activity data** _(dato de actividad)_            | The raw quantity the user enters e.g. gallons of diesel, kWh, kg of refrigerant, km travelled.                 |
| **Emission factor** _(factor de emisión)_          | The number that converts activity data into emissions e.g. "10.15 kg CO₂ per gallon of diesel".                |
| **GWP** _(Potencial de Calentamiento Global, PCG)_ | How much stronger a gas is than CO₂. Used to convert every gas into a common unit.                             |
| **CO₂ equivalent (CO₂e)**                          | The common unit for all gases combined. Final results are in **tonnes of CO₂e (tCO₂e)**.                       |
| **Reporting year** _(año a reportar)_              | The calendar year the footprint is calculated for. It also decides which GWP set and electricity factor apply. |
| **Target** _(Meta)_                                | A reduction goal the company sets for a scope, tracked against the actual result.                              |

---

## 5. Feature Accounts & Companies

**Goal:** every company manages its own data securely and separately.

Requirements:

- **Registration & login** for Company Users. (Password reset included.)
- A company can have **multiple facilities** (each facility = a plant _(planta)_ at a location _(sede/ubicación)_).
- A company can have **multiple reporting years**, and each year is entered and calculated independently.
- **Strict data isolation:** a company only ever sees its own companies, facilities, years, and results.
- **CECODES admin** can manage all accounts, companies, and the factor library.
- A clear **account/company profile** page (company name, sector optional, contact).

Data structure (conceptual, not technical):

```
Company (Empresa)
 └── Facility (Planta @ Ubicación/Sede)
      └── Reporting Year (Año)
           └── Activity entries per source (Scope 2: 12 monthly values; Scope 1 & 3: 1 annual value)
           └── Targets (Meta) per scope
           └── Calculated results
```

---

## 6. Feature Data Entry

**Goal:** collect the company's activity data across all three scopes, exactly matching the Excel's structure.

Requirements:

- The user navigates **Scope → Category → Subcategory → Element** using guided selectors (the same hierarchy as the Excel see the full list in **Appendix A**).
- For each selected **element**, the user enters the activity value in that element's **fixed unit**. The entry granularity depends on the scope:
  - **Scope 2 (electricity):** **12 monthly values** _(Enero–Diciembre)_.
  - **Scope 1 and Scope 3:** a **single annual value** (no monthly breakdown required).
- **The unit is always shown** on screen (e.g. "gal", "kWh", "kg", "km", "N° head of cattle"). _(The old prototype hid most units this must be fixed.)_
- **Decimal values are allowed** and stored accurately. _(The old prototype stored whole numbers only this must be fixed.)_
- **Save & resume:** data is saved as the user goes; leaving and returning never loses entries.
- **Edit anytime:** a company can correct a previously entered year.
- **Element names come from the factor library** (the exact Excel names), so there are no typos or mismatches. _(The old prototype had several misspelled names this must be fixed.)_
- **Optional "does this apply?" toggles** _(Sí/No)_ to hide sources a company doesn't have, keeping the form short.
- **Validation:** values must be **non-negative numbers, and decimals are allowed** _(e.g. 12.5)_; the user cannot save an unknown element or an entry without a unit.
- A per-scope **Target** _(Meta)_ value can be entered and is used on the dashboard. _(Inclusion pending CECODES confirmation see Section 12.)_

---

## 7. Feature The Calculation Engine (Business Rules)

**Goal:** turn activity data into CO₂e **exactly as the Excel does**. These are the rules in plain English (no code).

### 7.1 Core rule

For each emission source:

> **Emissions = Activity data × Emission factor**

When a source emits several gases (e.g. combustion emits CO₂, CH₄, and N₂O), each gas is calculated separately and then converted to CO₂e:

> **CO₂e = (Activity × CO₂ factor)** + **(Activity × CH₄ factor × GWP of CH₄)** + **(Activity × N₂O factor × GWP of N₂O)**

For refrigerants, SF₆ and NF₃, the factor is **already** expressed in kg CO₂e per kg, so:

> **CO₂e = Activity (kg leaked) × factor**

### 7.2 GWP (converting gases to CO₂e), chosen by reporting year

- Reporting years **up to and including 2021** use the **AR5** GWP set (e.g. CH₄ = 28, N₂O = 265). _(Whether 2021 itself falls under AR5 or AR6 is still to be confirmed Section 12, item 5.)_
- Reporting years **after 2021** use the **AR6** GWP set (CO₂ = 1; CH₄ fossil = 29.8, CH₄ non-fossil = 27; N₂O = 273; SF₆ = 24,300; NF₃ = 17,400).
- Each element is flagged as **fossil or biogenic** _(biogénica)_; this decides which CH₄ value is used.
- _(The exact treatment of 2021 itself and of biogenic CO₂ is a confirmation item Section 12.)_

### 7.3 Special calculation cases (all present in the Excel)

- **Electricity (Scope 2):** `kWh × national grid factor for that year` _(Sistema Interconectado Nacional SIN, e.g. 2024 ≈ 0.217 kg CO₂/kWh)_. The factor **changes by year**.
- **Unit conversions:** some factors are stored in grams and converted to kg (÷1000); some fuel factors are derived from calorific value; travel is per **passenger-kilometre**; rice cultivation is per **flooded-hectare-day**.
- **Business travel & commuting (Scope 3):** `distance (km) × factor per km`.
- **Purchased goods & services (Scope 3):** spend-based `amount spent × factor per currency unit`, in **COP or USD**.
- **Waste & agriculture:** `quantity (kg / head of cattle / kg fertilizer) × factor`.

### 7.4 Rolling up to totals

Emissions are summed **up the hierarchy**:

```
Element → Subcategory → Category → Scope (1 / 2 / 3) → Company total (t CO₂e)
Scope 2: 12 monthly values → annual total   ·   Scope 1 & 3: a single annual value
```

The tool also keeps the **per-gas breakdown** (CO₂, CH₄, N₂O, refrigerants…) and, where the Excel provides it, an **uncertainty range** _(incertidumbre ± %)_ per factor.

**Units important:** internal calculations may work in kilograms, but **every total shown to the user and in every report is expressed in tonnes of CO₂e (t CO₂e)**. Kilograms are only an intermediate step and are converted to tonnes before display _(1 t CO₂e = 1,000 kg CO₂e)_.

### 7.5 Worked examples (to confirm we agree on the math)

- **Refrigerant leak:** a company reports **10 kg** of R-22 leaked. Factor = **1,960 kg CO₂e/kg**. → `10 × 1,960 = 19,600 kg CO₂e = 19.6 tCO₂e` (Scope 1).
- **Electricity:** a facility uses **500,000 kWh** in 2024. Grid factor = **0.217 kg CO₂/kWh**. → `500,000 × 0.217 = 108,500 kg CO₂e = 108.5 tCO₂e` (Scope 2).

**Acceptance rule:** for an agreed set of sample companies, the tool's totals must **match the Excel's totals** (within small rounding tolerance). This is how we prove "full parity."

---

## 8. Feature Emission-Factor Library & Maintenance

**Goal:** the emission factors are **data the CECODES admin can maintain**, not values frozen in code. CECODES already updates them every 1–4 months (its change log shows 5 versions between Dec 2024 and Oct 2025).

Requirements:

- A **factor library** holding, for every element: Scope, Category, Subcategory, Element, factor(s) per gas, unit, source _(fuente bibliográfica)_, GWP set, biogenic flag, uncertainty, and applicable year(s).
- The **yearly electricity grid factor** _(factor SIN por año)_ is maintained here too.
- The CECODES admin can **add, edit, and deactivate** factors through a screen (no spreadsheet editing, no developer needed).
- **Version history** _(control de cambios)_: every change records who, when, and what changed mirroring the Excel's change log (Version, Date, Prepared by, Reviewed by, Authorized by, Description).
- When factors are updated, results can be **recalculated**; historical reports remain reproducible for the factor version they used.

---

## 9. Feature Dashboard & Visualizations

**Goal:** make the footprint easy to understand at a glance. This is the "visualization" the client asked for.

The dashboard shows, for a selected **company / facility / year**:

- **Headline total** in **tonnes of CO₂e (t CO₂e)**.
- **Breakdown by scope** (Scope 1 / 2 / 3) e.g. donut or bar chart with percentages.
- **Breakdown by category** within a scope bar chart.
- **Monthly trend** _(Enero–Diciembre)_ line/area chart **(applies to Scope 2 / electricity only, since only Scope 2 is captured monthly; Scopes 1 & 3 appear as annual figures)**.
- **Year-over-year comparison** compare a company's footprint across its reporting years.
- **Target vs. actual** _(Meta vs. real)_ per scope progress indicator. _(Included only if the Target feature is confirmed Section 12, item 9.)_
- **Per-gas breakdown** (CO₂, CH₄, N₂O, refrigerants…) optional chart.
- **Facility comparison** compare plants/locations of the same company.

Interactions:

- **Filters:** facility/location, year, scope, category. (CECODES admin can also filter by company.)
- **Drill-down:** click a scope → see its categories → subcategories → elements.
- Clear empty states and readable numbers (thousands separators, units, tCO₂e).

---

## 10. Feature Reports & Export

**Goal:** produce a shareable footprint report.

- **PDF report** _(informe)_: company & facility, reporting year, GWP set used, totals by scope and category, the main charts, and a methodology/sources note.
- **Excel / CSV export**: the detailed activity data and calculated results, for the company's own records and for verification.

---

## 11. Full Scope Inventory ("full parity" written down)

This is the complete structure the tool must cover, taken from the Excel. The exact element lists live in the **factor library** (hundreds of items); this section fixes the **categories and subcategories** so "full parity" is unambiguous. See **Appendix A** for the detailed breakdown.

### Scope 1 _(Alcance 1)_ Direct emissions

- **Stationary combustion** _(Fuentes Fijas)_ solid, liquid, and gaseous fuels _(sólidos / líquidos / gaseosos)_.
- **Mobile combustion** _(Fuentes Móviles)_ liquid & gaseous vehicle fuels.
- **Fugitive emissions** _(Emisiones Fugitivas)_ refrigerant leaks, fire extinguishers, SF₆ & NF₃ electrical insulation, rice cultivation, enteric fermentation, manure management, fertilizer/lime/urea use, wastewater treatment, agricultural-waste treatment.
- **Industrial processes** _(Procesos industriales)_ minerals industry (cement/clinker, lime), mining & hydrocarbons (coke), CO₂ process losses, lubricants.
- **Refrigerant gases** _(Gases Refrigerantes)_ CFCs, HCFCs, HFCs, HFEs, Halons, PFCs, CCl₄, SF₅CF₃, NF₃, etc. _(In the Excel these sit under fugitive emissions.)_

### Scope 2 _(Alcance 2)_ Indirect energy

- **Purchased grid electricity** _(Consumo de energía eléctrica)_ using the national grid factor for the reporting year.
- **Self-generated renewable energy** _(hidroeléctrica / solar / eólica)_ tracked; treatment to confirm (Section 12).

### Scope 3 _(Alcance 3)_ Other indirect

- **Category 1 Purchased goods & services** _(Bienes y Servicios Adquiridos)_ spend-based (COP/USD), ~28 service subcategories + material groups.
- **Category 6 Business travel** _(Viajes de Negocios)_ distance-based (road, rail, air).
- **Category 7 Employee commuting** _(Desplazamiento de Empleados / Movilidad de colaboradores)_ distance-based.
- **Waste** _(Residuos)_ incineration, controlled open burning (rural), managed landfill (anaerobic / semi-aerobic).
- **Agricultural activities** _(Actividades agropecuarias)_ enteric fermentation, manure management, and others (lime, composting, digestion, fertilization, burning, fertilizer use). _(Note: the Excel places some agriculture in both Scope 1 and Scope 3 see Section 12.)_

> **Note on Scope 3 completeness:** a few Scope-3 categories appear **empty or marked in red** in the Excel because they use **different calculation methods** than the standard "activity × factor" pattern, and CECODES is still finalizing them. These will be added once CECODES provides the method and factors. **Full Scope-3 parity therefore depends on CECODES supplying those methods** (see Section 12, item A8).

---

## 12. Decisions CECODES Must Confirm

These come directly from reviewing the Excel. They **must be resolved** for "full parity" to have a clear meaning. None are blockers for agreeing on the plan but they need CECODES's answer before or during the build.

> **Status:** CECODES answered the round-1 decision memo on **2026-07-17**. Items marked **DECIDED** below are settled and are being built to; their answer is quoted. Items marked **STILL OPEN** were either not resolved by the answer or were re-opened because our question was malformed. Round 2 is [CLIENT_DECISION_MEMO_ROUND2.md](./CLIENT_DECISION_MEMO_ROUND2.md).

**A. Source-data / methodology decisions**

1. **DECIDED (2026-07-17).** **Two factor databases exist** a 2024 "consolidated" table (one CO₂e factor per item) and a newer 2025 "per-gas" table (separate CO₂/CH₄/N₂O + uncertainty, currently Scope 1 only). CECODES: _"Authoritative table is 2025 per gas table"_. **Caveat:** the 6 loaded grid-electricity factors all match the **2024** sheet, so this answer and item A5 contradict each other for Scope 2 until round-2 item 2 resolves which sheet governs electricity.
   **Also decided:** the dashboard gains a gas inventory broken down by CO₂/CH₄/N₂O. **Blocked on data, not engineering:** only **6.2% of Scope 3** rows carry per-gas factors (1,182 of 1,252 are consolidated CO₂e), vs 79% of Scope 1. A per-gas chart renders the largest scope as one unattributable block. Raised as round-2 item 5's neighbour; do not build until CECODES sees this number.
2. **DECIDED and APPLIED.** **Scope-3 travel/commuting factors** the km conversion multiplied by 1.609 where it should divide. CECODES countersigned: _"Ok thanks for the correction. Please do not use miles here"_. All 9 factors corrected by ÷1.609² on **2026-07-12** (audit trail `correccion-km-1609`; verified applied against the database 2026-07-17). **No mile-denominated factors exist in the library**, so "always kilometres" is already satisfied. **Do not re-run the correction:** a second application would understate travel emissions by 2.59×.
3. **STILL OPEN.** **Purchased-goods spend factors** some look implausibly high (e.g. cement ≈ 3,924 kg CO₂e/USD). CECODES: _"We'll check this information source to confirm or correct the data."_ **New evidence (round-2 item 6):** 3,924 kg CO₂e/USD ≈ the 3,743 COP/USD rate, suggesting these factors are **per COP mislabelled as per USD**. **Blocks A4.**
4. **DECIDED (2026-07-18): per-year, year-average rate. STILL BLOCKED on A3 (units).** **Currency for purchases** CECODES: _"COP/USD let's use the year average rate."_ The rate is now fully specified: a per-year table holding each year's **average TRM**. The provisional 3300 is superseded; it was a spot rate, and a year average is a different, auditable number. **The mechanism is unblocked, but building the spend path is not, and must still wait on A3:** cement reads ≈3,924 kg CO₂e/USD against an FX rate near 3,743, so the factors are likely per-COP mislabelled as per-USD. Applying any rate over mis-united factors compounds the error invisibly. **Build order is fixed: A3 units, then A4 rate.** **Parity note:** the Excel used ~3,743, so parity fixtures pin the Excel's own year-average rate for the Excel's year; only new years use later averages.
5. **DECIDED (2026-07-17), NOT YET APPLIED.** **GWP edge cases** AR5-vs-AR6 for 2021 is **moot**: CECODES: _"The tool will not be used for pasts years like 2021 or before. First year register will be filled for 2025"_. **`MIN_REPORTING_YEAR` remains 2000 deliberately, blocked on A9.** Under a 2025 floor the legal years are 2025-2027 while grid factors exist only for 2013-2024, so the intersection is empty and **Scope 2 becomes uncomputable for every year a user can create**, strictly worse than today, where 2024 still works. The E2E suite proves it: several specs create `E2E_YEAR` (2024) through the UI form and fail against the floor. Raise the constant, and rework `e2e/fixture.ts`, the day the 2025 factor lands. **Biogenic CO₂** _(biogénica)_ is **included in the headline total and disclosed separately** (CECODES: _"I like your suggestion so please include it"_), which is existing behaviour. **Note:** AR5 is not thereby deletable. `EmissionFactor.gwpSet` tags a factor's *published vintage*, independent of reporting year; removing AR5 is a separate, migration-required decision needing its own question.
6. **STILL OPEN, never asked.** **Agriculture placement** should agricultural activities appear under Scope 1, Scope 3, or both (as the Excel currently mixes)? Not covered by the round-1 memo or the 2026-07-17 answers.
7. **DECIDED (2026-07-17), one detail open.** **Uncertainty** CECODES: _"uncertainty should not be included in the dashboard but in the pdf report as a table in the summary."_ This **reverses** the round-1 default ("internal for v1"). Dashboard: no change needed, it is already absent. **Open (round-2 item 5):** whether the table is a per-element **list** (no maths, buildable now) or a **combined** figure (needs a propagation method that neither the repo nor the Excel contains). Coverage is ~40% of Scope 1 and ~15% of Scope 3; **electricity has no uncertainty column at all**. The PDF report does not exist yet.
8. **DECIDED (2026-07-17).** **Scope-3 categories with different methods** _(the empty/red categories)_ CECODES: _"We're not using these calculations in the moment... This will not affect parity now."_ Formally **deferred and out of "full parity"**, to be recorded in the acceptance sign-off.

**A9. NEW BLOCKER (2026-07-17), not in round 1.** **There is no 2025 grid electricity factor.** CECODES's own workbook stops at 2024 on both sheets, and so does our seed. Their answer to A5 makes 2025 the first and only reporting year. **Scope 2 is therefore uncomputable for the only year the tool will be used**, and their Excel cannot supply the value. **A9 and A5 are entangled and must ship together:** applying A5's floor while A9 is open empties the set of years in which Scope 2 works at all (see A5). This outranks the 11 historical years (2008-2018, 2020), which become unreachable anyway under a 2025 floor. Round-2 item 1. **No default is safe:** the tool surfaces an explicit `missingGridFactor` warning rather than reusing 2024 or computing a silent zero.

**B. Product decisions**

9. **DECIDED (2026-07-18): total, percentage, not per-scope. One axis left to confirm.** **Target _(Meta)_ feature** CECODES: _"'meta' will be expressed as a % and it would be a general total goal, not per scope."_ Combined with the 2026-07-17 rules, the Meta is now: **a percentage reduction (b), on the whole company's total (a, resolved: NOT per scope), never set in the first reported year (the baseline).** Two of round-2 item 4's three sub-questions are answered. **Remaining:**
   - **Company-wide vs per-Sede (expensive if wrong, ONE-WAY migration).** "General total goal" reads as one number for the whole company, and their own example speaks of "2025 total emissions". Proceeding on **company-wide**, but confirm before the migration lands, because it is the difference between re-keying `scope_targets` to the company (a table replacement) and merely dropping the `scope` column (an ALTER). On the shared DB this is not cheaply reversible.
   - **Denominator (assumed, low risk).** Their wording _"meta is established regarding this first year"_ reads as a fixed baseline: 2027's meta is measured against the first reported year, not the rolling prior year. Proceeding on **fixed first-year baseline**.
   - Whichever way company-vs-Sede resolves, the current model is wrong: it stores an **absolute tonnage per scope**. The `scope` column goes and the value becomes a **percentage**; existing rows cannot be mechanically converted (no baseline to divide by) and will be dropped or hand-migrated. See COMPLETION_PLAN_V2 P5b.
10. **Tool interface language** the tool's screens should be in **Spanish** (its users are Colombian companies), matching the current prototype and the Excel. _(This document is in English; the tool itself is Spanish.)_ **Confirm.**
11. **DECIDED (2026-07-17).** **Viewer/Auditor role** CECODES: _"not needed for v1, you can defer it to a later version."_ Deferred.
12. **STILL OPEN.** **Aggregate statistics** may CECODES admin see cross-company aggregate/anonymous numbers? (Section 2.) Not addressed in the 2026-07-17 answers.
13. **DECIDED (2026-07-18).** **Self-generated renewable energy** (Scope 2) CECODES: _"Renewable energy will be reported separately."_ Track separately and disclose, not folded into the Scope 2 grid total. Related: the library holds a year-independent zero-valued RECs row (_"...respaldada con RECs (cualquier año)"_ = 0) that no model currently represents; a "reported separately" bucket is the natural home for it.

**B14. NEW REQUIREMENT (2026-07-17), fields confirmed (2026-07-18).** **Per-user identity and traceability.** CECODES: _"we need the person to specify who they are each time the exercise is done"_ and _"Ask for the person who fills the form name, phone, email and position."_ The four fields are settled: **name, phone, email (exists), and position** _(cargo)_. Email already exists; **name, phone and position are new**. The **person-vs-role** question is answered: collect **both**, the person's name and their position, since a role outlives the person. **The goal is attribution, not a contact list:** no activity entry records **who entered it**, so the fields alone identify who works at the company, not who typed a figure. The build (COMPLETION_PLAN_V2 P2) is **per-person accounts** carrying these four fields **plus a per-entry audit trail** (who/when/from/to), mirroring the factor library's change trail, so "specify who they are each time" is satisfied by login identity rather than a forgeable typed box. **Defect this requirement forces us to fix:** self-serve registration creates a **duplicate company** for a second employee of an existing company, so multi-user only works via the admin path today. **Landed decision:** block the duplicate, admin provisions colleague accounts for now. **Cannot be delivered retroactively:** every value entered before P2 ships is permanently unattributable. **PII note:** phone and position are personal data under Ley 1581 (Habeas Data); retention, who may view them, and whether they appear in exports are still undecided.

> **Already resolved in this v1.1 revision (from CECODES's 2026-07-09 review):** monthly data entry applies to **Scope 2 only** (Scopes 1 & 3 are annual); all displayed results are in **tonnes (t CO₂e)**; entered values may be **decimals**.

> **Item 0 (the blocking one) is still open.** Requirements §14.1 makes reproducing the Excel's totals the acceptance test. CECODES (2026-07-17): _"We don't have an Excel file for this but I could check and share a previous exercise."_ Until a workbook arrives with **both** activity data as entered **and** the totals produced from it, the acceptance test cannot be run and the calculation engine is unverified against CECODES. A totals-only report does not suffice.

---

## 13. Assumptions & Out of Scope

**Assumptions**

- The tool is used through a **web browser**; no installation needed.
- Activity data is **entered manually** by companies (as today).
- The **Excel remains the reference** for factors and math until the factor library fully replaces it.
- CECODES provides the **final, confirmed factor set** (see Section 12) as the authoritative input.

**Out of scope (for this build, unless added later)**

- Automatic import from accounting/ERP systems or utility bills.
- IoT / real-time metering.
- Carbon credit / offset trading or marketplace.
- Supplier data-collection portals (companies enter their own Scope 3 data).
- Third-party verification workflows beyond an optional read-only role.

---

## 14. Definition of Done ("how we'll both know it's right")

The build is complete when:

1. **Parity:** for an agreed set of sample companies, the tool reproduces the **Excel's CO₂e totals** (per scope and overall) within a small rounding tolerance.
2. **Coverage:** every Scope/Category/Subcategory/Element in the confirmed factor library can be entered and calculated.
3. **Accounts:** multiple companies can register and use the tool with **fully isolated** data, plus a working CECODES admin.
4. **Data entry:** the correct granularity works **Scope 2 monthly, Scopes 1 & 3 annual** with visible units, **decimals**, save/resume, and edit.
5. **Factor library:** the CECODES admin can update factors (with version history) and see the change reflected in recalculated results.
6. **Dashboard:** the required breakdowns (scope, category, monthly _(Scope 2)_, year-over-year, and target vs. actual _if the Target feature is confirmed_) and filters all work, with all totals shown in **tonnes (t CO₂e)**.
7. **Reports:** PDF and Excel/CSV export produce correct results.

---

## Appendix A Detailed Category Reference (from the Excel)

> This appendix lists the categories and representative subcategories/elements found in the Excel, as a reference for the factor library. Exact factor values, units, and sources are maintained in the library (Section 8).

### Scope 1 _(Alcance 1)_

| Category                                       | Subcategories                                                                                                                                                    | Example elements & units                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stationary combustion _(Fuentes Fijas)_        | Solid / Liquid / Gaseous fuels                                                                                                                                   | Generic coal _(Carbón Genérico)_ 2,534.8 kg CO₂/t; Bagasse _(Bagazo, biogenic)_; Diesel B10 (fixed) 10.15 kg CO₂/gal; Generic natural gas 1.98 kg CO₂/m³; GLP |
| Mobile combustion _(Fuentes Móviles)_          | Liquid / Gaseous vehicle fuels                                                                                                                                   | Diesel (mobile) 10.15 kg CO₂/gal + CH₄/N₂O; Motor gasoline (mobile) 8.81 kg CO₂/gal                                                                           |
| Fugitive emissions _(Emisiones Fugitivas)_     | Refrigerant leaks; fire extinguishers; SF₆; NF₃; rice cultivation; enteric fermentation; manure management; fertilizer/lime/urea; wastewater; agricultural waste | R-22 leak 1,960 kg CO₂e/kg; CO₂ extinguisher 1 kg CO₂/kg; SF₆ use 25,200 kg CO₂e/kg; rice CH₄ 1.27 kg CH₄/ha·day                                              |
| Industrial processes _(Procesos industriales)_ | Minerals; mining & hydrocarbons; CO₂ losses; lubricants                                                                                                          | Clinker 520 kg CO₂/t; coke production 510 kg CO₂/t; quicklime 745.75                                                                                          |
| Refrigerant gases _(Gases Refrigerantes)_      | CFC / HCFC / HFC / HFE / Halon / PFC / CCl₄ / SF₅CF₃ / NF₃ families                                                                                              | Individual gas species with CO₂e factors (GWP embedded)                                                                                                       |

### Scope 2 _(Alcance 2)_

| Category                                          | Notes                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Grid electricity _(Consumo de energía eléctrica)_ | National grid factor by year _(SIN)_: e.g. 2019 ≈ 0.17; 2023 ≈ 0.173; 2024 ≈ 0.217 kg CO₂/kWh (UPME/XM) |
| Self-generated renewables                         | Hydroelectric / solar / wind treatment to confirm                                                       |

### Scope 3 _(Alcance 3)_

| Category                                                     | Method                | Example elements & units                                                                                                                                   |
| ------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchased goods & services _(Bienes y Servicios Adquiridos)_ | Spend-based (COP/USD) | ~28 service subcategories (Food, Lodging, Construction, Energy & fuels, Textiles, Transport & logistics…) + material groups; factor in kg CO₂e per COP/USD |
| Business travel _(Viajes de Negocios)_                       | Distance-based        | Private car 0.478 kg CO₂/km; motorcycle; public transport (bus/metro/train) per passenger-km; short/medium/long-haul flights per passenger-km              |
| Employee commuting _(Desplazamiento de Empleados)_           | Distance-based        | Same vehicle set as business travel                                                                                                                        |
| Waste _(Residuos)_                                           | Quantity-based        | Ordinary waste incineration 0.23; hospital waste 0.57; managed anaerobic landfill 1.54 kg CO₂e/kg                                                          |
| Agricultural activities _(Actividades agropecuarias)_        | Head/quantity-based   | Dairy cattle 1,764 kg CO₂e/head; pigs 28; urea fertilization 20.44 kg CO₂e/kg                                                                              |

_(Representative values shown for orientation only the confirmed library in Section 8 is authoritative.)_

---

## Appendix B What Already Exists (starting point)

- A **React prototype** (data-entry forms for the three scopes) that collects monthly values but **does not calculate anything**, has **no dashboard**, and has **no real login**. It also has some **dropdown typos** and **missing units** vs. the Excel, and stored values as whole numbers.
- A **small backend** that only **stores raw numbers** no emission factors, no calculation, no aggregation, and no real user accounts.
- The **Excel tool** the complete emission-factor database and calculation logic which is the **source of truth** for this project.

In short: the **data-entry forms** are a useful starting point, but the **calculator, the factor library, the accounts, and the dashboard are new work**.

---

_End of document please review, especially Section 12 (Decisions CECODES must confirm). Once agreed, this becomes the baseline for the implementation plan._
