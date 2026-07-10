# CECODES Carbon Footprint Tool Weekly Delivery Plan

**Companion to:** _CECODES Carbon Footprint Tool - Requirements.md_ (v1.1)
**Purpose:** a week-by-week plan so CECODES and the development team can **track progress and give feedback every week**.
**Version:** 2.0 (revised to 7 weeks) · **Date:** 2026-07-10

---

## How to read this plan

- The plan is **7 weeks**. Every week ends with a **visible deliverable** you can look at in the weekly check-in.
- It covers the **full scope** agreed in the requirements: full Excel parity, multi-company accounts, calculator, dashboard, admin factor library, and reports.
- It does **not** pick any technology. That stays with the development team.
- The tool is built **in Spanish (es-CO) from the first screen**, because its users are Colombian companies. Spanish is not a late translation step. An English toggle is included.
- The week numbers assume a **small team (about 1 to 2 developers) working full time**, and a weekly check-in where CECODES resolves open decisions quickly.

### Why 7 weeks and not 12

The original plan was 12 weeks because it started from nothing. **The foundation is already built and working**, so roughly the first three weeks of that plan are done. What is already delivered:

- Project foundation, environments, and a **design system** with the Spanish interface and English toggle.
- **Database and security model**, including strict per-company data isolation, the factor library structure, and factor version history.
- **Reference data loaded**: the national grid electricity factors by year, the factor library version history, and a starter factor set.
- **Accounts**: registration, login, logout, password reset, email confirmation, protected areas, and the single CECODES administrator.
- **Company setup**: a company and its first facility (planta and sede).
- **Application shell and dashboard frame**, with honest empty states ready to receive real figures.

What remains is the substance of the product: the factor library screens, data entry, the calculation engine, the dashboard visualizations, and reports.

**Two things from CECODES keep the plan on schedule:**

1. **Answers to Section 12** of the requirements (the open decisions).
2. The **confirmed, corrected emission-factor dataset**, including the corrected Scope-3 travel and spend factors, and the pending Scope-3 methods.

Week 1 depends on both. The earlier they arrive, the safer the whole plan is.

---

## At a glance

| Week | Focus                              | What you will see at the check-in                          |
| ---- | ---------------------------------- | ---------------------------------------------------------- |
| 1    | Emission-factor library (admin)    | Admin browses and edits the full factor library             |
| 2    | Data entry, part 1                 | A company enters Scope 2 monthly and Scope 1 and 3 annual   |
| 3    | Data entry, part 2 + engine core   | A full year of data saved and re-editable; first CO2e totals |
| 4    | Engine special cases + **parity**  | Tool totals **match the Excel** for the sample companies    |
| 5    | Dashboard and visualizations       | Interactive dashboard for a calculated company              |
| 6    | Reports and export                 | Downloadable PDF and Excel/CSV report                       |
| 7    | Hardening, UAT and launch          | CECODES acceptance testing, then a live tool                |

_Approx. **7 weeks** for full Excel parity, building on the foundation already delivered._

---

## Week 1: Emission-factor library (admin)

**Goal:** the confirmed factors live in the tool and CECODES can maintain them.

- Import the **confirmed factor dataset** into the library.
- Admin screens to **view, add, edit and deactivate** factors, with **version history** _(control de cambios)_.
- Maintain the **yearly electricity grid factor** _(SIN por año)_.
- Confirm whether the **category hierarchy** _(Scope, Category, Subcategory, Element)_ is admin editable or fixed, and build accordingly.
- **CECODES admin area:** manage companies and user accounts (approve and deactivate).
- Groundwork for **version pinning**, so stored results record the factor version that produced them.
- **Check-in deliverable:** the admin browses the full factor library and makes an edit that is recorded in the version history.

## Week 2: Data entry, part 1

**Goal:** a company can record its activity data exactly as the Excel structures it.

- Create a **reporting year** _(año)_ for a facility.
- Guided **Scope, Category, Subcategory, Element** navigation driven by the library, with the exact Excel names and **units always shown**.
- **Scope 2 entered monthly** _(Enero to Diciembre)_. **Scopes 1 and 3 entered as a single annual value.**
- **Decimals allowed**, non-negative validation, and **save and resume**.
- **Check-in deliverable:** a company creates a reporting year and enters data across all three scopes at the correct granularity.

## Week 3: Data entry, part 2, and the calculation engine core

**Goal:** finish data capture and start turning it into emissions.

- **Edit a previously entered year**, plus the optional "does this apply?" _(Sí/No)_ toggles to keep the form short.
- Engine core: **activity data times factor, per gas**, converted to CO2e using the **GWP set chosen by reporting year** (AR5 up to 2021, AR6 after), and the unit conversions.
- Roll-up from element to subcategory, category, **scope** and **company total**, always displayed in **tonnes (t CO2e)**.
- **Check-in deliverable:** a full year of data is saved and re-editable, and the tool shows its first calculated totals.

## Week 4: Engine special cases and parity

**Goal:** reproduce the Excel exactly. This is the heart of the project.

- Special cases: **electricity by year**, **distance-based** travel and commuting, **spend-based** purchases (COP and USD), waste, and agriculture.
- Per-gas breakdown, and uncertainty if CECODES confirms it should be shown.
- **Recalculate** a company's results when factors change, keeping historical reports reproducible for the **factor version** they used.
- **Parity testing** against the Excel using the agreed sample companies, chosen so they do not rely on the pending Scope-3 categories (Requirements 12.8).
- **Check-in deliverable:** side by side proof that the tool's totals **match the Excel**, excluding the pending Scope-3 categories.

## Week 5: Dashboard and visualizations

**Goal:** make the footprint easy to understand. This is the visualization CECODES asked for.

- Headline total, **breakdown by scope** and **by category**, **monthly trend (Scope 2)**, **year over year**, **target vs actual** _(Meta, if confirmed)_, per-gas breakdown, and facility comparison.
- **Filters** (facility, year, scope, category) and **drill-down** from a scope into its elements.
- **Check-in deliverable:** the full interactive dashboard for a calculated company.

## Week 6: Reports and export

**Goal:** a shareable footprint report.

- **PDF report**: totals by scope and category, the main charts, the GWP set used, and a methodology and sources note.
- **Excel and CSV export** of the detailed activity data and results.
- Any remaining dashboard polish from Week 5 lands here. This is the only slack in the plan.
- **Check-in deliverable:** a company downloads its PDF and its Excel report.

## Week 7: Hardening, acceptance and launch

**Goal:** polish, verify, and go live.

- Spanish copy review for wording and consistency, bug fixing, performance, and access-control checks.
- **CECODES User Acceptance Testing:** CECODES re-checks the tool against the Excel and signs off on parity.
- Deployment, go live, and a short hand-over.
- **Check-in deliverable:** a CECODES-accepted, live tool.

---

## Weekly check-in

We recommend a **weekly 30 to 45 minute meeting** so CECODES sees progress and can comment early. Suggested standing agenda:

1. **Demo** of the week's deliverable (5 to 10 minutes).
2. **Comments and adjustments** from CECODES.
3. **Decisions needed** from CECODES, for example Section 12 items and factor confirmations.
4. **Next week's goal** and any blockers.

We keep a short running list of **open decisions** and **change requests** so nothing is lost between meetings.

---

## What could change the timeline (honest risks)

Seven weeks is a tight, workable plan, but it has very little slack. These are the things that would move it:

- **Late Section 12 answers or a late factor dataset.** Week 1 depends on both. A delay here pushes everything, because the calculation cannot be proven correct without the confirmed factors.
- **Pending Scope-3 categories** (the empty or red ones that use different methods) are added once CECODES supplies their methods. They are excluded from the parity test and, if they arrive late, they become a follow-up week rather than blocking launch.
- **Parity surprises.** If the sample companies reveal disagreements between the tool and the Excel that trace back to the source data, Week 4 can grow. This is the single most likely week to overrun, and it is also the most important one to get right.
- **A larger parity sample** improves confidence but adds days to Week 4.
- **Target _(Meta)_ feature** is small. Including or dropping it has no schedule impact.
- **Team size.** The plan assumes 1 to 2 developers full time. Fewer, or part time, and the calendar stretches proportionally.

If a week slips, the order of the work does not change. We would rather move the launch date than ship a calculator that does not match the Excel.

---

_Revised to 7 weeks. Tell us your target start date and we will turn these weeks into concrete calendar dates._
