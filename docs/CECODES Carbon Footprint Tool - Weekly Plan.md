# CECODES Carbon Footprint Tool Weekly Delivery Plan

**Companion to:** _CECODES Carbon Footprint Tool - Requirements.md_ (v1.1)
**Purpose:** a week-by-week plan so CECODES and the development team can **track progress and give feedback every week**.
**Version:** 1.0 (draft) **Date:** 2026-07-09

---

## How to read this plan

- This plan is organized into **phases**, each spanning one or more weeks. Every week ends with a **visible deliverable** you can look at in the weekly check-in.
- It covers the **full scope** agreed in the requirements (full Excel parity, multi-company accounts, calculator, dashboard, admin factor library, reports).
- It does **not** pick any technology that stays with the development team.
- The tool is built **in Spanish (es-CO) from the first screen** its users are Colombian companies and the existing prototype is already Spanish. Spanish is not a late "translation" step.
- The week numbers below assume a **small team (about 1–2 developers)**. If the team is larger or the deadline is fixed, we re-time it the **order** of the work stays the same. _(Tell us your team size / target date and we'll adjust the calendar.)_

**Two things from CECODES keep the plan on schedule:**

1. **Answers to Section 12** of the requirements (the open decisions).
2. The **confirmed, corrected emission-factor dataset** (the authoritative factors, including the corrected Scope-3 travel/spend factors and the pending Scope-3 methods).

The earlier these arrive, the smoother Phases 2–4 run.

---

## At a glance

| Phase | Weeks | Focus                           | What you'll see at the check-in                      |
| ----- | ----- | ------------------------------- | ---------------------------------------------------- |
| 0     | 1     | Sign-off & foundations          | Agreed spec, confirmed factor list, project skeleton |
| 1     | 2–3   | Accounts & company setup        | Register, log in, create company / facility / year   |
| 2     | 3–4   | Emission-factor library (admin) | Admin browses & edits the full factor library        |
| 3     | 4–6   | Data-entry forms                | A company enters a full year of activity data        |
| 4     | 6–8   | Calculation engine              | Tool reproduces the Excel's totals (parity)          |
| 5     | 8–10  | Dashboard & visualizations      | Interactive dashboard for a calculated company       |
| 6     | 10–11 | Reports & export                | Downloadable PDF + Excel/CSV report                  |
| 7     | 11–12 | Hardening, UAT & launch         | CECODES acceptance testing → live tool               |

_Approx. **12 weeks** for full parity with a small team. Phases overlap where a larger team allows (e.g. accounts and the factor library can run in parallel)._

---

## Phase 0 Sign-off & foundations _(Week 1)_

**Goal:** lock the requirements and prepare the ground.

- Collect CECODES's **Section 12 decisions** and the **confirmed factor dataset**.
- Agree the **sample companies** we'll use later to prove parity against the Excel.
- Set up the project skeleton, environments, and the shape of the **factor library** (structure only, data comes in Phase 2).
- **Check-in deliverable:** signed-off spec (v1.2), the confirmed factor list, and a running empty project shell.

## Phase 1 Accounts & company setup _(Weeks 2–3)_

**Goal:** companies can register and manage their own space, safely separated.

- Registration, login, password reset.
- Roles: **Company User** and **CECODES Administrator**.
- **CECODES admin account & company management:** approve / deactivate companies and users. _(Confirm whether new company registrations require admin approval.)_
- Company → **facility (planta/sede)** → **reporting year** structure.
- **Strict data isolation** (a company sees only its own data).
- _Out of this timeline unless CECODES confirms them: the optional **Viewer/Auditor** (read-only) role and admin **cross-company aggregate statistics** (Requirements 12.11–12.12)._
- **Check-in deliverable:** a new user registers, logs in, and creates a company, a facility, and a reporting year; admin can approve/deactivate an account.

## Phase 2 Emission-factor library (admin) _(Weeks 3–4)_

**Goal:** the confirmed factors live in the tool and CECODES can maintain them.

- Load the **confirmed factor dataset** into the library.
- Admin screens to **view / add / edit / deactivate** factors, with **version history** _(control de cambios)_.
- The **yearly electricity grid factor** _(SIN por año)_.
- Confirm whether the **category hierarchy** _(Scope → Category → Subcategory → Element)_ is admin-editable or fixed/seed-only, and build accordingly.
- Groundwork for **version pinning**: stored results/reports will record the factor version they used, so historical reports stay reproducible (completed with the engine in Phase 4).
- **Check-in deliverable:** CECODES admin browses the full factor library and makes an edit that is recorded in the version history.

## Phase 3 Data-entry forms _(Weeks 4–6)_

**Goal:** companies can enter their activity data, matching the Excel exactly.

- Guided **Scope → Category → Subcategory → Element** navigation, driven by the library (exact names, **units always shown**).
- **Scope 2 entered monthly** _(Enero–Diciembre)_; **Scopes 1 & 3 entered as a single annual value**.
- **Decimals allowed**, non-negative validation, **save/resume**, **edit later**, and optional "does this apply?" _(Sí/No)_ toggles.
- **Check-in deliverable:** a company enters a complete year of data across all three scopes and it is saved and re-editable.

## Phase 4 Calculation engine _(Weeks 6–8)_

**Goal:** turn activity data into CO₂e **exactly as the Excel does** the heart of the project.

- Activity × factor **per gas**, converted to CO₂e via **GWP by reporting year** (AR5 ≤2021 / AR6 after).
- Special cases: **electricity by year**, **distance-based** travel/commuting, **spend-based** purchases (COP/USD), waste, agriculture; unit conversions.
- Roll-up to subcategory → category → **scope** → **company total**, all shown in **tonnes (t CO₂e)**.
- Per-gas breakdown; uncertainty (if confirmed).
- **Recalculate** a company's results when factors are updated, and keep historical reports reproducible for the **factor version** they used.
- **Parity testing** against the Excel using the agreed sample companies _(chosen so they don't rely on the pending Scope-3 categories Requirements 12.8)_.
- **Check-in deliverable:** side-by-side proof that the tool's totals **match the Excel** for the sample companies _(excluding the pending Scope-3 categories)_.

## Phase 5 Dashboard & visualizations _(Weeks 8–10)_

**Goal:** make the footprint easy to understand the "visualization" the client asked for.

- Headline total; **breakdown by scope** and **by category**; **monthly trend (Scope 2)**; **year-over-year**; **target vs. actual** _(Meta if confirmed)_; per-gas; facility comparison.
- **Filters** (facility, year, scope, category) and **drill-down**.
- **Check-in deliverable:** the full interactive dashboard for a calculated company.

## Phase 6 Reports & export _(Weeks 10–11)_

**Goal:** a shareable footprint report.

- **PDF report** (totals, charts, GWP set used, methodology/sources) and **Excel/CSV export** of the detailed data.
- **Check-in deliverable:** a company downloads its PDF and Excel report.

## Phase 7 Hardening, acceptance & launch _(Weeks 11–12)_

**Goal:** polish, verify, and go live.

- **Spanish copy review** (wording & consistency the UI is already Spanish from Phase 1, this is not the first translation), bug fixing, performance, and access-control checks.
- **CECODES User-Acceptance Testing (UAT)** CECODES re-checks the tool against the Excel and signs off on parity.
- Deployment / go-live and a short hand-over.
- **Check-in deliverable:** CECODES-accepted, live tool.

---

## Weekly check-in recommended

We recommend a **weekly 30–45 minute meeting** so CECODES can see progress and give comments early (exactly as requested). Suggested standing agenda:

1. **Demo** of the week's deliverable (5–10 min).
2. **Comments & adjustments** from CECODES.
3. **Decisions needed** from CECODES (e.g. Section 12 items, factor confirmations).
4. **Next week's goal** and any blockers.

We'll keep a short running list of **open decisions** and **change requests** so nothing is lost between meetings.

---

## What could change the timeline (honest risks)

- **Late Section 12 answers or factor confirmations** delay Phases 2–4 (the calculation can't be proven correct without the confirmed factors).
- **Scope-3 "red/empty" categories** these are added only once CECODES supplies their methods; if they arrive late, they slot into a follow-up week rather than blocking launch.
- **Target _(Meta)_ feature** small; included or dropped per CECODES's confirmation with no schedule impact.
- **Larger dataset / more sample companies** for parity testing may extend Phase 4 slightly, but improves confidence.

---

_Draft for discussion tell us your team size and any target date and we'll turn these phases into concrete calendar dates._
