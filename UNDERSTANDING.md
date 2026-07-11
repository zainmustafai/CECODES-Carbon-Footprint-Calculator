# What This Project Actually Is

A plain-language explanation of the CECODES project, from zero. No jargon without a
definition, no code. Read top to bottom once and you will know what you are building
and why.

---

## 1. The one-sentence answer

You are building a **web app that lets Colombian companies calculate how much
greenhouse gas they emit per year, see it on a dashboard, and export a report.**

That number is called a **carbon footprint** (huella de carbono). Today companies
calculate it with a giant Excel file. Your app replaces that Excel.

---

## 2. Who's who

- **CECODES** is a Colombian business council for sustainable development. It is your
  client. Its member companies are the actual users.
- **Member companies** (empresas): a food producer, a cement plant, a bank, whoever.
  Each one logs in, enters a year of data, and gets its footprint.
- **The CECODES admin**: one CECODES staff member who manages the companies, the user
  accounts, and the emission-factor library (explained below).

The app is multi-tenant: many companies share one app, but **no company can ever see
another company's data.** That isolation is one of the hardest requirements.

---

## 3. The problem being solved

CECODES already has this tool. It is an Excel file called
`CEC-PR-CTE-127 Factores de emisión - Herramienta HC CECODES.xlsx` (it lives in
`docs/reference/`). It contains all the math and all the conversion numbers.

The Excel works, but: every company needs its own copy, it is easy to break, there is
no dashboard, no accounts, no history. So CECODES wants the same thing as a web app.

**The single most important rule of the whole project:** the app must produce the
**same numbers the Excel produces.** This is called *parity*, and it is the acceptance
test. If a sample company's Excel says 108.5 tonnes and your app says 107.9, the
project is not done. The Excel is the source of truth; you are re-implementing it.

---

## 4. Carbon accounting in five minutes

This is the domain knowledge. Once this clicks, everything else is just CRUD and charts.

**Greenhouse gases (GHG)** trap heat in the atmosphere. CO₂ is the famous one, but
methane (CH₄), nitrous oxide (N₂O), and refrigerant gases count too.

**A carbon footprint** is the total of all gases a company caused in one year,
expressed in one common unit so they can be added together.

**The three scopes.** The international standard (GHG Protocol) splits emissions into
three buckets. Everything in the app is organized around these:

| Scope | Plain meaning | Examples |
|---|---|---|
| **Scope 1** (Alcance 1) | Stuff the company burns or leaks **itself** | Diesel in generators, fuel in company trucks, refrigerant gas leaking from AC units |
| **Scope 2** (Alcance 2) | The **electricity** it buys from the grid | The monthly power bill, in kWh |
| **Scope 3** (Alcance 3) | Everything indirect | Business flights, employee commutes, purchased goods, waste sent to landfill |

**Activity data** (dato de actividad) is the raw number the company knows:
"we used 500,000 kWh", "we burned 2,000 gallons of diesel", "10 kg of refrigerant leaked".

**An emission factor** (factor de emisión) is the conversion number:
"one gallon of diesel produces 10.15 kg of CO₂". CECODES maintains hundreds of these,
one per fuel, gas, vehicle type, waste type, and so on. In the app they live in the
**factor library**, which the admin can edit. Their names and units must match the
Excel exactly, no hardcoding.

**GWP (Global Warming Potential)** answers "how bad is this gas compared to CO₂?"
Methane is roughly 28 times worse, so 1 kg of methane counts as ~28 kg of
**CO₂ equivalent (CO₂e)**. CO₂e is the common unit that lets you add a diesel
generator and a refrigerant leak into one total. Which GWP table applies depends on
the reporting year: up to 2021 uses the AR5 table, after 2021 the AR6 table.

That is the entire domain. Everything else is detail.

---

## 5. The math

The core formula, applied to every emission source:

> **Emissions = Activity data × Emission factor**

Two real examples from the requirements doc:

- **Refrigerant leak:** 10 kg of R-22 leaked. Factor is 1,960 kg CO₂e per kg.
  `10 × 1,960 = 19,600 kg = `**`19.6 t CO₂e`** (Scope 1).
- **Electricity:** 500,000 kWh used in 2024. Colombia's 2024 grid factor is 0.217 kg
  CO₂ per kWh. `500,000 × 0.217 = 108,500 kg = `**`108.5 t CO₂e`** (Scope 2).

Wrinkles to be aware of (all inherited from the Excel):

- Burning fuel emits **several gases at once** (CO₂ + CH₄ + N₂O); each gets its own
  factor, the CH₄ and N₂O parts get multiplied by their GWP, then everything is summed.
- The **electricity grid factor changes every year** (it reflects Colombia's power mix).
- Scope 3 purchases are **spend-based**: pesos or dollars spent × a factor per currency unit.
- Travel is **distance-based**: kilometres × a factor per km.

Then everything **rolls up**: Element → Subcategory → Category → Scope → company total.

---

## 6. What can change without a developer (and what cannot)

A question the client will eventually ask: "can we change the formulas?" The design
splits this deliberately: **the numbers are data, the formula shapes are code.**

**The CECODES admin can change these alone, no developer, no deploy:**

- **Every emission factor**: its value, name, unit, source, per-gas numbers, and
  whether it is active. Factors live in the database (the factor library), and every
  edit is recorded in a change log with who, when, and what, mirroring the Excel's
  "Control de Cambios".
- **The yearly electricity grid factor.** A new year is a new row.
- **Which formula an element uses.** The engine picks its path from the data: if a
  factor has a combined CO₂e value, it multiplies once; if it has per-gas values, it
  does the per-gas + GWP math. Switching an element between the two is a data edit.

**These are code, and changing them is a (small) development task:**

- **The formula shapes themselves**: `activity × factor`, and the per-gas
  combination. Both live in `src/lib/calc/engine.ts`.
- **The GWP constants** (the AR5/AR6 tables) and the 2021 boundary between them.
  These are IPCC scientific constants that change about once a decade.
- **A genuinely new calculation method.** The requirements already anticipate this:
  several Scope 3 categories use methods CECODES has not defined yet (Section 12,
  item A8). Each one will be a small, contained addition to the engine.

**Why formulas are not user-editable, on purpose:** parity is the acceptance test,
so every formula must provably reproduce the Excel and gets a unit test. A formula
stored as editable data could be changed by anyone into something untested, which is
exactly the silent-wrong-number failure this project exists to eliminate. And results
are pinned to the factor-library version that produced them, so when values change,
historical reports stay reproducible.

The honest line for the client: *"You can change any factor, unit, name, or yearly
grid value yourselves, instantly, with a change log. A new type of calculation is a
small development task, and the system is built expecting that."*

---

## 7. What a user actually does in the app

```
1. Log in  →  2. Set up company, facility (sede), reporting year
           →  3. Enter activity data       (the data-entry screens)
           →  4. App calculates CO₂e        (the calculation engine)
           →  5. Dashboard + PDF/Excel export
```

Step 3 is the heart of the product. The user picks a source from the factor library
(say "Diesel B10"), the app shows its fixed unit ("gal"), and the user types the
quantity. Data autosaves; they can leave and come back.

**One rule from the client that shapes everything: entry granularity.**

- **Scope 2 (electricity) is entered month by month**, twelve values, Enero to Diciembre.
- **Scopes 1 and 3 are one annual value each.** No months.

This is why `ActivityEntry.month` is null for Scopes 1 and 3, and 1-12 for Scope 2.
It came from CECODES directly and is not negotiable.

---

## 8. The two roles

- **Company user** (Usuario Empresa): manages their own company, facilities, years,
  data, dashboard, exports. Sees only their own data.
- **CECODES admin** (Administrador CECODES): everything above for *any* company
  (via `/admin/companies/[id]/...` routes), plus managing the factor library,
  companies, and users. An admin belongs to no company.

Same screens, different route. The admin drills into a company and uses the exact
same data-entry UI a company user sees.

---

## 9. The five golden rules

These exist because the previous prototype broke each one. They are all over the
codebase and the docs:

1. **Parity with the Excel.** Same inputs must give the same totals.
2. **Scope 2 monthly, Scopes 1 and 3 annual.** Never mix this up.
3. **Everything shown to users is in tonnes (t CO₂e).** Kilograms are internal only.
4. **Quantities and factors are exact decimals** (Postgres NUMERIC via Prisma
   `Decimal`), never Int, Float, or a JavaScript number. The old prototype truncated
   every decimal a company typed.
5. **Names and units come from the factor library**, never hardcoded. The old
   prototype had typos in its dropdowns and hid the units.

Also: the whole UI is in **Spanish (es-CO)**, and Spanish domain words (Alcance,
Sede, Meta) stay Spanish even in English text.

---

## 10. Where the project stands right now

**Built and working:**

- Auth (register, login, password reset) via Supabase, with a real multi-tenant
  authorization layer (`src/lib/auth/company-scope.ts`, the single security boundary).
- Onboarding: company + first facility. Facilities management.
- **The data-entry feature**, the core screen: scope tabs, source picker fed by the
  factor library, monthly grid for Scope 2, autosave, decimal-safe values.
- The app shell: green sidebar, role-based routing, admin screens for companies and
  users.
- The database schema with real constraints enforcing the domain rules.
- Unit tests and a Playwright end-to-end happy path.

**Not built yet (the honest list, from `IMPLEMENTATION.md` section 12):**

- **The calculation engine roll-ups.** A single source can be computed, but nothing
  aggregates to totals yet. The dashboard is a frame showing zeroes.
- **Excel parity testing**, the actual acceptance test.
- **The full factor library.** Only 12 sample factors are seeded; CECODES has not
  delivered the confirmed dataset yet.
- Admin factor management screen, admin-created users, PDF/Excel reports, and the
  per-scope reduction target (Meta) feature.

**Waiting on the client:** about a dozen open decisions live in the requirements doc,
Section 12: which of their two factor databases is authoritative, some factors they
know are wrong, whether the Meta feature is in, and the Scope 3 categories whose
calculation method they have not defined yet.

---

## 11. Where to read more

| Question | Document |
|---|---|
| What must the product do? | `docs/CECODES Carbon Footprint Tool - Requirements.md` (the contract; Section 12 = open decisions) |
| When is what being delivered? | `docs/CECODES Carbon Footprint Tool - Weekly Plan.md` |
| Why this tech stack? | `docs/CECODES - Tech Stack Decision.md` |
| How is the code built, what are the traps? | `IMPLEMENTATION.md` |
| The actual source of truth for all math | `docs/reference/CEC-PR-CTE-127 ... .xlsx` |

**The mental model to keep:** this is a calculator with accounts. Companies type in
what they consumed; the app multiplies by CECODES's official factors, adds it all up
into tonnes of CO₂e, and draws charts. The hard parts are getting the math to match
the Excel exactly and keeping every company's data strictly separate.
