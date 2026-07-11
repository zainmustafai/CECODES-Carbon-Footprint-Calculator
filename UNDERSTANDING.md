# What This Project Actually Is

A plain-language explanation of the CECODES project, from zero. No jargon without a
definition, no code. Read it top to bottom once and you will understand what you built,
how it works, and where it stands. The **Data Entry** feature (section 6) is the heart of
the product and gets the most detail.

---

## 1. The one-sentence answer

You are building a **web app that lets Colombian companies calculate how much greenhouse
gas they emit each year, see it on a dashboard, and (soon) export a report.**

That yearly number is called a **carbon footprint** (huella de carbono). Today companies
calculate it with a giant, fragile Excel file. Your app replaces that Excel.

---

## 2. Who's who

- **CECODES** is a Colombian business council for sustainable development. It is the client.
  Its member companies are the actual users.
- **Member companies** (empresas): a food producer, a cement plant, a bank, whoever. Each
  logs in, enters a year of data, and gets its footprint.
- **The CECODES admin**: CECODES staff who manage the companies, the user accounts, and the
  emission-factor library (explained in section 10). An admin belongs to no company.

The app is multi-tenant: many companies share one app and one database, but **no company can
ever see another company's data.** That isolation is one of the hardest requirements, and
section 9 explains exactly how it is kept.

---

## 3. The problem being solved

CECODES already has this tool. It is an Excel file,
`CEC-PR-CTE-127 Factores de emisión - Herramienta HC CECODES.xlsx` (in `docs/reference/`).
It holds all the math and all the conversion numbers.

The Excel works, but every company needs its own copy, it breaks easily, and there is no
dashboard, no accounts, and no history. So CECODES wants the same thing as a web app.

**The single most important rule of the whole project:** the app must produce the **same
numbers the Excel produces.** This is called *parity*, and it is the acceptance test. If a
sample company's Excel says 108.5 tonnes and your app says 107.9, the project is not done.
The Excel is the source of truth; you are re-implementing it.

---

## 4. Carbon accounting in five minutes

This is the domain knowledge. Once it clicks, the rest is data entry, arithmetic, and charts.

**Greenhouse gases (GHG)** trap heat. CO2 is the famous one, but methane (CH4), nitrous
oxide (N2O), and refrigerant gases count too.

**A carbon footprint** is the total of all those gases a company caused in one year,
expressed in one common unit so they can be added together.

**The three scopes (Alcance).** The international standard (GHG Protocol) sorts emissions
into three buckets. The entire app is organized around them:

| Scope | Plain meaning | Examples |
|---|---|---|
| **Alcance 1** (Scope 1) | Things the company burns or leaks **itself** | Diesel in generators, fuel in company trucks, refrigerant gas leaking from AC units |
| **Alcance 2** (Scope 2) | The **electricity** it buys from the grid | The monthly power bill, in kWh |
| **Alcance 3** (Scope 3) | Everything indirect | Business flights, employee commutes, purchased goods, waste sent to landfill |

**Activity data** (dato de actividad) is the raw number a company knows: "we used 500,000
kWh", "we burned 2,000 gallons of diesel", "10 kg of refrigerant leaked".

**An emission factor** (factor de emisión) is the conversion number: "one gallon of diesel
produces about 10.15 kg of CO2". CECODES maintains roughly 1,700 of these, one per fuel, gas,
vehicle type, waste type, and so on. In the app they live in the **factor library**, which
the admin can edit. Their names and units match the Excel exactly, and nothing is hardcoded.

**GWP (Global Warming Potential)** answers "how bad is this gas versus CO2?" Methane is about
28 to 30 times worse, so 1 kg of methane counts as roughly 28 to 30 kg of **CO2 equivalent
(CO2e)**. CO2e is the common unit that lets you add a diesel generator and a refrigerant leak
into one total. Which GWP table applies depends on the reporting year: years up to and
including 2021 use the AR5 table, later years use the AR6 table.

That is the entire domain. Everything else is detail.

---

## 5. The math (what the calculation engine actually does)

The core formula, applied to every emission source, is:

> **Emissions = Activity data × Emission factor**

The engine (`src/lib/calc/engine.ts`) turns one number a user typed into kilograms of CO2e.
It has exactly **two paths**, and which one runs depends on the factor, not on any setting:

1. **Consolidated path.** If the factor already carries one combined CO2e number (used for
   refrigerants, SF6, and spend or distance based items), it just multiplies once:
   `activity × co2eFactor`.
2. **Per-gas path.** A fuel is given as three separate factors, one per gas (CO2, CH4, N2O).
   Each gas is multiplied by its GWP, then summed: `CO2×1 + CH4×GWP_ch4 + N2O×GWP_n2o`. CO2's
   GWP is always 1 (it is the yardstick).

Then everything is divided by 1,000 to become **tonnes**, and rolled up
(`src/lib/calc/rollup.ts`): each source adds into its category, into its scope, and finally
into the company grand total.

Three worked examples, straight from the real engine and its tests:

- **Refrigerant leak (consolidated path).** 10 kg of R-22 leaked. Its factor is one combined
  value, 1,960 kg CO2e per kg. `10 × 1,960 = 19,600 kg = ` **`19.6 t CO2e`** (Alcance 1).
- **Electricity (Scope 2 grid path).** 500,000 kWh used in 2024. Colombia's 2024 grid factor
  is 0.217 kg CO2 per kWh. `500,000 × 0.217 = 108,500 kg = ` **`108.5 t CO2e`** (Alcance 2).
- **Diesel (per-gas path with GWP).** 14,957.10 gallons, factors CO2 = 10.149, CH4 = 0.00001,
  N2O = 0.000006 kg per gallon, year 2024 so AR6 (CH4 = 29.8, N2O = 273):
  `151,799.61 (CO2) + 4.46 (CH4) + 24.50 (N2O) = 151,828.56 kg = ` **`151.83 t CO2e`**.

Wrinkles the engine already handles (all inherited from the Excel):

- **Electricity is special.** A Scope 2 row carries no factor of its own. The engine
  multiplies the kWh by the **national grid factor for that reporting year** (a pure CO2
  number, so no GWP). That factor changes every year as Colombia's power mix changes.
- **Biogenic gases.** A source flagged "biogénica" (from plant or organic material) swaps in a
  different methane GWP. The engine also totals biogenic tonnes separately as a memo item.
- **A gap is not a zero.** A month nobody filled in is left blank in the trend, not shown as 0.
  A month someone entered "0" for is a real zero. The two are kept distinct.
- **An orphaned source is skipped, not zeroed.** If an admin deletes a factor a Scope 1/3 row
  was using, that row is skipped rather than silently counted as zero.

---

## 6. Data Entry, the heart of the app

This is the screen (`/data-entry`, "Ingreso de datos") where a company types in how much it
consumed for a year. Everything else, the dashboard and the reports, is downstream of it. If
you understand this section, you understand the product.

### 6.1 The setup chain you enter data into

You cannot type a number in a vacuum. Data hangs off a small hierarchy:

```
Company (Empresa)  ->  Facility (Sede/Planta)  ->  Reporting Year (Año)  ->  the numbers
```

- A **Sede** is one physical site (a plant, office, warehouse). A company can have several,
  and each is measured on its own.
- A **Año** is one reporting year (e.g. 2024). Each year is calculated independently.

So before entering anything, the user must have a Sede and an Año. The screen guides them
there: if there is no Sede, it shows a panel with a button to go create one; if the Sede has
no Año, it shows a "Crear año de reporte" button. Creating a year opens a small dialog where
they type the year number, and the app tells them which GWP table it will lock in (AR5 up to
2021, AR6 after) so a future rule change can never silently rewrite an old year's numbers.

### 6.2 The screen, top to bottom

1. **The context bar (sticky, at the top).** Two dropdowns, **Sede** and **Año**. Whatever the
   user picks is written into the web address, so a reload or a shared link lands back on the
   same site and year. On the right sits the **save indicator** and a "Crear año" button.

2. **Three tabs: Alcance 1 / Alcance 2 / Alcance 3.** A small badge on each shows how many
   sources have been added there. The current tab is remembered in the URL too.

3. **Category sections inside a tab.** Each scope is broken into categories (for example
   "Fuentes Fijas", "Fuentes Móviles"). Every category has an **"¿Aplica?"** (does this apply?)
   toggle. This is not decoration: the GHG standard requires a company to *declare* the
   categories it is excluding, so "no aplica" is saved as real, reportable data. Once you add
   sources to a category, the toggle locks (with a tooltip) so you cannot accidentally hide
   data you already recorded.

4. **Adding a source.** Click **"Agregar fuente"**. A searchable picker opens, grouped by
   subcategory, listing every element from the factor library with its fixed unit. Search
   ignores accents, so typing "diesel" finds "Diésel". You cannot misspell or invent an
   element, and one you have already added shows a checkmark and cannot be added twice.

5. **Entering values. This is the one rule that shapes everything:**
   - **Alcance 1 and 3 are annual.** One box per source, labelled "Valor anual", with the unit
     shown inside it (`gal`, `kg`, `km`).
   - **Alcance 2 (electricity) is monthly.** The source opens into a **grid of 12 boxes**,
     Enero to Diciembre, with a **"Copiar Enero a los meses vacíos"** button that fills only the
     months you left blank (it never overwrites one you typed) and a badge showing progress like
     **"8 de 12 meses"**.

   This is why, in the database, `ActivityEntry.month` is null for Scopes 1 and 3, and 1 to 12
   for Scope 2. The rule came from CECODES directly and is not negotiable.

6. **The live "Emisiones estimadas" summary.** Next to every source, the app shows a running
   estimate of that source's emissions in t CO2e as you type, plus which factor it used and the
   factor's bibliographic source. This is labelled a *reference estimate*. The official,
   rolled-up totals live on the dashboard. Importantly, when a factor is missing, it says so in
   words instead of showing a misleading "0.0 t".

7. **No Save button.** Everything **autosaves** (section 6.3). The indicator cycles through
   "Se guarda automáticamente" then "Guardando..." then "Guardado 14:32".

8. **The missing grid-factor warning.** Electricity emissions need the national grid factor for
   that year, which an admin loads. If it is not loaded yet, Alcance 2 shows a yellow notice:
   you can still record your kWh, and emissions compute the moment the admin loads the factor.
   It refuses to show a fake zero.

9. **Meta de reducción (reduction target).** At the bottom of each scope tab, a card to set a
   reduction target in t CO2e for that scope. Clearing the field deletes the target (an empty
   target is not a target of zero). This drives the "avance hacia la meta" progress on the
   dashboard.

### 6.3 Why it feels instant and never loses data

There is no Save button because the app saves as you go, and it does so safely:

- **Optimistic updates.** The moment you type, the new number appears on screen immediately,
  before the server has confirmed anything. You never wait on the network to keep typing. If a
  save later fails, the box quietly snaps back to the last server-confirmed value and a red
  toast appears. Optimism is safe because a failure is always recoverable.
- **Debounced, batched saves.** The app waits for a short pause (about 0.7 seconds after a
  keystroke, faster when you tab out of a box), then sends **all** changed boxes in one request.
  Tabbing across all 12 months of an electricity grid becomes one save, not twelve.
- **Exact decimals, always.** Colombian keyboards produce a decimal comma, so users type
  "1240,5". The app cleans that to "1240.5" and stores it as an **exact decimal** in the
  database, never as an ordinary JavaScript number (those drift, and drift breaks Excel
  parity). A half-typed value like "12," shows on screen but is deliberately not saved until it
  is valid.
- **Guardrails.** Navigating away flushes any pending edit first; closing the tab mid-save pops
  the browser's "unsaved changes" warning.

### 6.4 A full walkthrough

María at "Alimentos del Valle S.A.S." opens Ingreso de datos. In the context bar she picks
**Sede: Planta Yumbo**, and since no year exists she clicks **"Crear año de reporte"**, types
**2024**, and confirms. The dialog notes it will use the **AR6** table (2024 is after 2021).

**Diesel (Alcance 1, annual).** On the Alcance 1 tab she opens "Fuentes Fijas", clicks
"Agregar fuente", types "diesel", and picks **"Diésel o ACPM (B2) - Fijo"** (unit `gal`). A
single "Valor anual" box appears. She types **14957.10**. The "Emisiones estimadas" line
updates live to about **150 t CO2e**, showing the factor it used. She never clicks save; the
indicator flips to "Guardando..." then "Guardado 09:14".

**Electricity (Alcance 2, monthly).** She switches to Alcance 2. She adds "Electricidad (Red
Nacional - SIN)" (unit `kWh`), which opens as a 12-month grid with a "0 de 12 meses" badge.
Her January bill is 118,000 kWh, so she types that in Enero and clicks **"Copiar Enero a los
meses vacíos"**; the other 11 months fill with 118,000 and the badge reads "12 de 12 meses".
Because the 2024 grid factor is loaded (0.217 kg CO2/kWh), the estimate shows the electricity
footprint immediately. Every value she typed was saved automatically as she went.

---

## 7. The Dashboard (the results screen)

After data is entered, `/dashboard` (Tablero) shows it back as read-only charts. It answers
four questions a sustainability manager cares about: how big is our footprint, did it go up or
down versus last year, are we on track to our target, and where is it coming from.

The dashboard is **fully built and computes live**: on every page load it reads the raw
entries and runs them through the roll-up engine from section 5 (nothing is pre-saved). It
shows:

- **Three KPI cards:** the total footprint in t CO2e; the year-over-year variation (green with
  a down arrow when emissions fell, red when they rose); and progress toward the reduction
  target (green under target, red over).
- **A scope donut:** the split across Alcance 1 (green), 2 (amber), and 3 (blue), with the
  grand total in the middle.
- **Category bars:** a ranked list of the biggest categories, each tinted by its scope color.
- **A monthly electricity trend:** the Scope 2 line month by month, with unreported months
  shown as gaps, not zeros.
- **A year comparison** bar chart and a **Meta vs. real** chart (actual emissions with a dashed
  target line).
- **Filters** for facility, year, scope, and category, all written into the URL so a shared
  link reproduces the exact view.

**Worked example.** A company at **559 t CO2e for 2024**, down from **617 in 2023**: the
variation card shows `(559 - 617) / 617 = -9.4%` in green ("Reducción"); if it set a Scope 2
target of 610 t and actuals are 559, the target card shows 92%; the donut splits the 559 into
its three scopes; and the year-comparison bars make the decline obvious. This is exactly what
the seeded demo company "Demo Alimentos del Valle" renders today.

---

## 8. What can change without a developer (and what cannot)

The design splits this deliberately: **the numbers are data, the formula shapes are code.**

**The admin can change these alone, no developer, no deploy:**

- **Every emission factor:** its value, name, unit, source, per-gas numbers, and whether it is
  active. Every edit is recorded in a change log (who, when, what), mirroring the Excel's
  "Control de Cambios".
- **The yearly electricity grid factor.** A new year is a new row.
- **Which formula an element uses.** The engine picks its path from the data: a combined CO2e
  value multiplies once; per-gas values do the per-gas plus GWP math. Switching an element
  between the two is a data edit.

**These are code, and changing them is a small development task:**

- **The formula shapes themselves** (`activity × factor`, the per-gas combination), in
  `src/lib/calc/engine.ts`.
- **The GWP constants** (the AR5/AR6 tables) and the 2021 boundary. These are IPCC scientific
  constants that change about once a decade.
- **A genuinely new calculation method** (some Scope 3 categories are not defined by CECODES
  yet). Each is a small, contained addition to the engine.

**Why formulas are not user-editable, on purpose:** parity is the acceptance test, so every
formula must provably reproduce the Excel and gets a unit test. A formula stored as editable
data could be changed by anyone into something untested, which is exactly the silent-wrong-
number failure this project exists to eliminate.

The honest line for the client: *"You can change any factor, unit, name, or yearly grid value
yourselves, instantly, with a change log. A new type of calculation is a small development
task, and the system is built expecting that."*

---

## 9. The two roles and the isolation promise

There are exactly two kinds of user:

- **Company user** (Usuario Empresa): tied to one company, sees only that company's data,
  across the same screens.
- **CECODES admin** (Administrador CECODES): can open *any* company (via
  `/admin/companies/[id]/...` routes) using the exact same screens, plus manages the factor
  library, companies, and users. An admin belongs to no company.

Same screens, different route: an admin drills into a company and uses the identical data-entry
UI a company user sees.

**How "no company sees another's data" is actually enforced.** Every screen and every save
passes through one file, `src/lib/auth/company-scope.ts`, the single security checkpoint. For a
company user it **ignores whatever company the browser asked for and forces their own**; if the
request names a different company, it is rejected. Some operations derive the company from the
data itself (for example, from the reporting-year row) so a user cannot pair their own company
ID with someone else's record.

Two honest points worth knowing:

- **The database's own row-level security (RLS) is inert here.** The app connects as the
  database owner, which bypasses RLS. Isolation comes from the checkpoint code plus plain
  database constraints (every tenant row carries its `companyId`), never from RLS. Nobody should
  claim otherwise.
- **Every "save" is a public endpoint.** These Server Actions can be called directly, bypassing
  the UI, so each one re-validates its input, re-authorizes, and (for bulk writes) checks that
  exactly one row changed. A write that touched nobody is treated as forbidden, not success.

**Two switches.** A **deactivated user** keeps their password but is refused on their very next
click (the flag is read fresh from the database every request) and sent to an account-disabled
screen. A **deactivated company** blocks all its users at once but keeps their data, and an
admin can still open it to fix and reactivate it.

---

## 10. The admin control room

The back office the CECODES admin runs:

- **The factor library** (about 1,700 rows). The admin can browse, search, and filter it, and
  edit any factor including its name, unit, and category, or deactivate it. Factors are never
  hard-deleted (that would orphan companies' past data); they are switched off so they leave the
  dropdowns while old records stay intact.
- **"Control de Cambios", the change log.** Every factor edit is recorded forever: who (email),
  when, what action (created, updated, deactivated, reactivated, imported), and a field-by-field
  diff of old versus new. Saving without a real change writes nothing.
- **The yearly grid factor.** One row per year (kg CO2/kWh, source UPME/XM), added or edited on
  a dedicated tab. Saving it clears the missing-factor warning on any company's matching year.
- **Library versions.** A formal release list (v001, v002, ...) mirroring the Excel cover sheet,
  so computed results can be pinned to the exact library version that produced them.
- **Company and user management.** Create/rename/deactivate/delete companies (delete only when
  empty), and create real login accounts, change roles, or deactivate users, with guards so an
  admin cannot lock themselves out.

**Example.** The admin opens the Grid tab, adds Year 2025 with factor 0,164 and source "XM
2025". A company that had a 2025 year showing the missing-factor warning now computes its Scope
2: 10,000 kWh in January becomes `10,000 × 0.164 = 1,640 kg = 1.64 t CO2e`.

---

## 11. The five golden rules

These exist because a previous prototype broke each one:

1. **Parity with the Excel.** Same inputs must give the same totals.
2. **Alcance 2 monthly, Alcances 1 and 3 annual.** Never mix this up.
3. **Everything shown to users is in tonnes (t CO2e).** Kilograms are internal only.
4. **Quantities and factors are exact decimals** (Postgres NUMERIC via Prisma `Decimal`),
   never Int, Float, or a JavaScript number. The old prototype truncated decimals.
5. **Names and units come from the factor library**, never hardcoded.

Also: the UI is in **Spanish (es-CO)** with an English toggle, and Spanish domain words
(Alcance, Sede, Meta, Huella de Carbono) stay Spanish even in English text.

---

## 12. Where the project stands right now

This is the honest state, verified against the code (the previous version of this section, and
some code comments, are out of date and understate what exists).

**Built and working:**

- **Auth** (register, login, password reset) via Supabase, with the real multi-tenant
  authorization layer (`src/lib/auth/company-scope.ts`).
- **The full setup chain:** onboarding (company plus first facility), facilities management,
  reporting-year creation.
- **Data Entry**, the core screen: scope tabs, factor-library source picker, monthly grid for
  Scope 2, applicability toggles, decimal-safe optimistic autosave, live per-source estimate.
- **The calculation engine and roll-ups** (`src/lib/calc/`): per-source math and the full
  element to category to scope to company-total roll-up, unit-tested. This is the biggest thing
  older docs get wrong; it is built.
- **The dashboard**, rendering real totals: KPI cards, scope donut, category bars, monthly
  trend, year comparison, Meta vs. real, filters, empty and missing-factor states.
- **The full factor library** (about 1,700 factors) loaded from the client's Excel via
  `prisma/import-factors.ts` (idempotent, never overwrites an admin's edit).
- **Admin tools:** factor library with version history and change log, grid factors, company
  and user management (real Supabase account creation).
- **Reduction targets (Meta)** end to end, behind a feature flag pending formal client sign-off.
- **Demo data** (four seeded companies covering rich, empty, mid-progress, and deactivated
  scenarios), a **dark theme** toggle, and a **Spanish/English** toggle.

**Partial:**

- **Results are computed live, not stored.** A `ResultSnapshot` table exists for pinned,
  reproducible results but nothing writes to it yet. Fine at current volumes; a known gap for
  long-term reproducibility.
- **Scope 3 breadth.** Spend-based (per-peso, per-dollar) and distance-based conversions do not
  have dedicated engine paths yet, and seven Scope 3 categories are deliberately skipped until
  CECODES supplies their methods.

**Genuinely not built yet:**

- **PDF and Excel/CSV report export** (required by the requirements; no export code exists yet).
- **The Excel-parity acceptance test.** The tests reproduce the requirements' worked examples,
  but there is no automated diff against the client's actual spreadsheet, which is the real
  definition of done.

**Waiting on the client** (requirements section 12): which factor table is authoritative;
corrected Scope 3 travel factors; some implausibly high factors to verify; whether COP/USD is
fixed or yearly; the exact 2021 AR5-versus-AR6 boundary and how biogenic CO2 is treated (the
engine currently includes biogenic tonnes in the total *and* reports them separately, which the
client should confirm); the methods for the empty Scope 3 categories; and five disputed grid
factors the importer flags for a human to resolve.

---

## 13. Where to read more

| Question | Document |
|---|---|
| What must the product do? | `docs/CECODES Carbon Footprint Tool - Requirements.md` (the contract; section 12 = open decisions, section 14 = definition of done) |
| Why this tech stack? | `docs/CECODES - Tech Stack Decision.md` |
| How is the code built, what are the traps? | `IMPLEMENTATION.md` |
| The visual language | `DESIGN.md` |
| Test logins for every scenario | `docs/Credentials.md` (local only) |
| The actual source of truth for all math | `docs/reference/CEC-PR-CTE-127 ... .xlsx` |

**The mental model to keep:** this is a calculator with accounts. Companies type in what they
consumed (Data Entry); the app multiplies by CECODES's official factors, adds it all up into
tonnes of CO2e (the engine), and draws charts (the dashboard). The hard parts are getting the
math to match the Excel exactly and keeping every company's data strictly separate.
