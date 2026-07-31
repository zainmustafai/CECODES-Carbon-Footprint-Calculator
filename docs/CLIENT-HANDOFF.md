# CECODES Huella de Carbono — Client Handoff & User Guide

A complete, plain-language manual for the CECODES carbon footprint platform: what it does, every
screen it has, and exactly how to use it. No technical background is assumed.

**A note on language.** The tool itself is set to **Spanish (es-CO)** by default, with an
**English** switch in the top corner. This guide is written in English, but wherever it names a
button, field, or message, it gives you the **Spanish word you will actually see on screen** in
bold, followed by its English meaning in parentheses — for example, click **Guardar** (Save). A
handful of Spanish words are used throughout instead of translating them, because that is what the
tool itself calls them everywhere, in both languages:

| You will see this word | It means |
|---|---|
| **Empresa** | Company |
| **Sede** | Facility / site (a plant, office, or warehouse) |
| **Planta** | The plant/site name field, when adding a Sede |
| **Alcance** | Scope (1, 2, or 3) — the GHG Protocol's three groups of emissions |
| **Meta** | An optional reduction target |
| **Tablero** | Dashboard |

---

## Table of Contents

1. [Welcome](#1-welcome)
2. [Before You Begin](#2-before-you-begin)
3. [Logging In](#3-logging-in)
4. [Dashboard Overview](#4-dashboard-overview)
5. [Complete Feature Guide](#5-complete-feature-guide)
   - [5.1 Navigation and Your Account (everyone)](#51-navigation-and-your-account-everyone)
   - [5.2 Company Profile and Facilities](#52-company-profile-and-facilities-empresa)
   - [5.3 Data Entry](#53-data-entry-ingreso-de-datos)
   - [5.4 Reduction Targets (Meta)](#54-reduction-targets-meta)
   - [5.5 Cleaner Technologies and Good Practices](#55-cleaner-technologies-and-good-practices)
   - [5.6 Summary (Resumen)](#56-summary-resumen)
   - [5.7 Reports (Reportes)](#57-reports-reportes)
   - [5.8 Dashboard (Tablero)](#58-dashboard-tablero)
   - [5.9 Administrator Overview](#59-administrator-overview-panel-de-administración)
   - [5.10 Managing Companies](#510-managing-companies-empresas)
   - [5.11 Managing Users](#511-managing-users-usuarios)
   - [5.12 The Factor Library](#512-the-factor-library-biblioteca-de-factores)
   - [5.13 Traceability](#513-traceability-trazabilidad)
6. [Complete Walkthrough](#6-complete-walkthrough)
   - [6.1 A day in the life: Company account](#61-a-day-in-the-life-company-account)
   - [6.2 A day in the life: CECODES Administrator](#62-a-day-in-the-life-cecodes-administrator)
7. [Buttons & Actions Reference](#7-buttons--actions-reference)
8. [Common Tasks](#8-common-tasks)
9. [Tips & Best Practices](#9-tips--best-practices)
10. [Frequently Asked Questions](#10-frequently-asked-questions)
11. [Troubleshooting](#11-troubleshooting)
12. [Contact & Support](#12-contact--support)

---

## 1. Welcome

### What this tool is

This platform calculates a company's yearly **carbon footprint** — the total greenhouse gases it
produced, measured in **tonnes of CO2 equivalent (t CO2e)**. It replaces a spreadsheet CECODES used
to send its member companies by hand, and it is built to produce the same totals that spreadsheet
did, using the same official conversion numbers.

In plain terms, the tool does four things:

1. Lets a company **type in what it consumed** last year — diesel, electricity, refrigerant gas,
   business flights, and so on — one number at a time.
2. **Multiplies** each number by an official CECODES conversion figure ("emission factor") and adds
   it all up.
3. Shows the result on a **Dashboard**, broken down by category, by facility, and by month.
4. Lets the company **download** that result as a shareable PDF, Excel, or CSV file.

### Who uses it

There are two very different kinds of accounts, and this guide covers both:

- **Company accounts.** Staff at a CECODES member company. They record their own company's
  consumption, watch their footprint on a dashboard, and download reports. A company account only
  ever sees its own company's data — never another company's.
- **CECODES Administrator accounts.** CECODES staff who run the whole platform. They create every
  member company and every login (there is currently no "sign yourself up" option — see
  [Section 2](#2-before-you-begin)), keep the shared library of official conversion numbers
  up to date, and can step into any company's workspace to check on their data or help them out.

> **Screenshot: The two kinds of navigation menus side by side — a Company account's menu (Tablero,
> Ingreso de datos, Resumen, Empresa, Reportes) and an Administrator's menu (Inicio, Empresas,
> Usuarios, Biblioteca de factores, Trazabilidad).**

### The overall workflow, in plain English

**For a Company account:** sign in → check your company's profile and facilities are set up →
record consumption under the right Alcance (Scope) for the year → optionally log a reduction target
and any cleaner-technology practices → review everything on the Resumen (Summary) screen → look at
the finished picture on the Tablero (Dashboard) → download a report when you need one to share.

**For a CECODES Administrator:** sign in → check the overview for companies that need attention →
onboard new member companies through the guided wizard → create and manage user logins → keep the
shared factor library and the yearly electricity grid number current → use Trazabilidad
(Traceability) if you ever need to know who entered or changed a particular figure.

Nothing in this tool requires any software or spreadsheet knowledge. Every screen tells you, in
words, what happened after you click something.

---

## 2. Before You Begin

### What you will receive

**You do not sign yourself up, and you do not create your own company.** A CECODES administrator
sets up every company and every individual login. Once your account (or your company) is ready, you
will receive, by whatever channel CECODES uses to reach you (email, a shared file, or in person):

- The **web address** of the platform.
- Your **email address** (this is your username).
- A **temporary password**.

> **Tip:** Keep these three things together until you have signed in for the first time.
> There is nothing you can do in the tool before your account exists — if you have not received
> these yet, contact CECODES (see [Section 12](#12-contact--support)).

### What you need before logging in

- A computer, tablet, or phone with an internet connection and a modern web browser (Chrome, Edge,
  Firefox, or Safari — all work; there is nothing to install).
- Your email and temporary password.
- **If you are a Company account preparing to enter data**, it helps (but is not required on day
  one) to gather your consumption records for the year you are reporting: fuel purchases, your
  twelve monthly electricity bills, and any indirect activities you want to include, such as
  business flights or waste. You can start with whatever you already have and add the rest later —
  an empty field simply means "not reported yet," never zero.
- **If you are a CECODES Administrator preparing to onboard a company**, it helps to have on hand:
  the company's legal name, its sector (optional), a contact email, and — if you want to set them up
  in the same sitting — its first facility's name and location and the reporting year to start with.
  All of this can also be added later, piece by piece.

### Basic recommendations

> **Best Practice:** Change your temporary password the first time you sign in (see
> [Section 3](#3-logging-in)). Nobody else should know it once you have.

> **Best Practice:** Do not share a single login between several people. Each person who needs
> access should have their own account — a CECODES Administrator can create as many as needed, and
> every entry made in the tool records who made it.

> **Warning:** A handful of actions in this tool cannot be undone (deleting a facility's reporting
> year, deleting a data source, deleting a company or a user, deleting a yearly electricity factor).
> This guide marks every one of them clearly. When in doubt, read the confirmation window before
> clicking through it.

---

## 3. Logging In

### How to log in

1. Open the platform's web address. You will land on the **Iniciar sesión** (Sign in) screen.
2. Click the **Correo electrónico** (Email) field and type the email address CECODES gave you.
3. Click the **Contraseña** (Password) field and type your password. Dots hide what you type; click
   the small eye icon at the end of the box to reveal it and check for typos.
4. Click the green **Ingresar** (Sign in) button.

> **Screenshot: The sign-in screen, with the Correo electrónico and Contraseña fields and the green
> Ingresar button.**

### What each field means

- **Correo electrónico (Email):** the address your account was created with. This cannot be changed
  from inside the tool — contact CECODES if it needs to change.
- **Contraseña (Password):** your current password. The very first time, this is the temporary one
  CECODES gave you; change it as soon as you are in (see below).

### What happens after logging in

On success, you are taken straight to your home screen:

- A **Company account** lands on the **Tablero** (Dashboard).
- A **CECODES Administrator** lands on the **Panel de administración** (Admin overview).

If you are ever redirected to a screen saying your account has no company yet ("Tu cuenta aún no
tiene empresa"), it means your login has not been linked to a company. You cannot fix this
yourself — contact CECODES.

### If login fails

| What you see | What it means | What to do |
|---|---|---|
| **Correo o contraseña incorrectos** (Wrong email or password) | The email/password pair does not match any account | Check for typos and try again |
| **Tu cuenta fue desactivada** (Your account was deactivated) | A CECODES administrator switched off your personal login | Contact CECODES — this cannot be reversed by you |
| A screen about your company not existing yet | Your login exists, but is not linked to a company | Contact CECODES |

### Forgetting your password

1. On the sign-in screen, click **¿Olvidaste tu contraseña?** (Forgot your password?).
2. Type your email and click **Enviar enlace** (Send link).
3. You will always see the same confirmation message — **"Revisa tu correo"** (Check your email) —
   whether or not that email actually belongs to an account. This is deliberate: the tool never
   reveals whether a given email is registered.
4. If an account does exist, an email arrives with a reset link. Open it — it signs you in
   automatically and takes you to a **Nueva contraseña** (New password) screen.
5. Type your new password twice (it must be at least 8 characters and match both times) and click
   **Guardar contraseña** (Save password). You are then taken to your Dashboard.

> **Note:** If no email arrives, either the address was not registered, or it is a delivery delay —
> the tool intentionally cannot tell you which, to protect everyone's privacy. If you are sure the
> address is right and nothing arrives, contact CECODES directly.

### Changing your password once signed in

Open your account menu (the round button with your initial, top right) and click **Cambiar
contraseña** (Change password). This uses the same "new password twice" screen as above — you do
not need to know your current password, since you are already signed in. Click **Guardar
contraseña** to confirm; you land back on the Dashboard.

### Two screens that mean "you're locked out," and why they're different

| Screen | When you see it | What it means | Who can fix it |
|---|---|---|---|
| **Cuenta desactivada** (Account deactivated) | You try to sign in, or you were already signed in when it happened | Your *personal* login was switched off. Nothing else on your screen works except **Cerrar sesión** (Sign out) | Only CECODES |
| **Empresa desactivada** (Company deactivated) | You are signed in normally | Your *whole company* was switched off by CECODES. Your data is kept safe, untouched | Only CECODES |

> **Screenshot: The "Empresa desactivada" message shown in place of the normal company screens.**

### Signing out

Open your account menu and click **Cerrar sesión** (Sign out). This happens immediately with no
confirmation step — you are returned to the sign-in screen right away.

---

## 4. Dashboard Overview

Every signed-in screen shares the same frame around it, described first below, followed by each
role's home screen.

### The frame around every screen

- **Left menu (sidebar):** your main navigation. It can be collapsed to icons only using the
  hamburger button at the top of the header bar, and it remembers whether you left it open or
  collapsed. A **Company account** sees: Tablero, Ingreso de datos, Resumen, Empresa, Reportes. A
  **CECODES Administrator** sees a group titled **Administración**: Inicio, Empresas, Usuarios,
  Biblioteca de factores, Trazabilidad.
- **Top bar:** shows a trail of breadcrumbs for where you are, and on the right: a sun/moon icon to
  switch between light and dark appearance, an **ES / EN** switch for the interface language, and
  your account avatar (a circle with your first initial).
- **Account menu:** click your avatar to see your email, your role (Empresa or Administrador
  CECODES), and — for Company accounts — your company's name. From here: **Cambiar contraseña**,
  **Cerrar sesión**.

> **Note:** Switching **ES / EN** changes every label on screen, but it does **not** change the
> language of downloaded reports — those are always produced in Spanish, regardless of your
> interface language, so that every company's paperwork stays consistent.

### 4a. Company Dashboard (Tablero)

This is a Company account's home screen and the single place where your **official, calculated**
footprint lives — everywhere else in the tool (like Resumen) is a preview; this screen is the real
number.

> **Screenshot: The Tablero, showing the total-footprint card, the Alcance donut, the category bars,
> and the monthly electricity trend.**

What is on it, top to bottom:

- **Filter bar:** four dropdowns — **Planta/Sede**, **Año**, **Alcance**, **Categoría** — plus a
  **Limpiar** (Clear) button that appears once you have narrowed by Alcance or Categoría. Filtering
  never changes your data, only what the screen shows you.
- **KPI cards** — the headline numbers:
  - **Huella total** (Total footprint): the total in t CO2e for whatever the filters currently show.
  - **Change vs. previous year**: a green "Reducción" or a red "Aumento" badge, comparing this year
    to the last one with data.
  - **Progress toward target**: how close you are to any Meta you have set (see
    [5.4](#54-reduction-targets-meta)).
- **Emissions by Alcance** (a donut chart): your total split across Alcance 1, 2, and 3. Colors are
  consistent everywhere in the tool: **Alcance 1 is green, Alcance 2 is amber, Alcance 3 is blue.**
- **Emissions by category** (a bar list): the same total, broken down by category instead.
- **Monthly trend**: Alcance 2 (electricity) only, since it is the only one recorded month by month.
- **Emissions by Sede**: only appears in the "all facilities" view, and only once two or more of
  your facilities have data for the selected year.
- **Year-over-year comparison** and **Target vs. actual by Alcance**: two more charts, the second
  showing your Meta as a dashed line against the real bar.
- **Notes at the bottom**, in muted text (not warnings): any **biogenic** emissions (disclosed
  separately, per international standard, never added into your total) and any **carbon removals**
  you reported (also always kept separate, never subtracted from your total).

**Warnings you might see on this screen:**

> **Warning — missing electricity factor:** *"Falta el factor de red eléctrica para {year}"* means
> Alcance 2 is showing as **zero right now only because CECODES has not yet loaded that year's
> national electricity number** — not because you used no electricity. Nothing you do fixes this;
> only a CECODES administrator can, by loading it in the Biblioteca de factores.

> **Warning — some sources excluded:** if you see a note that N sources "no pudieron calcularse,"
> it means those entries are being **left out of every total on this screen**, so the totals shown
> are a floor, not the real number. Contact CECODES if this persists.

### 4b. Administrator Dashboard (Panel de administración)

This is a CECODES Administrator's home screen: a control-room view of the whole platform.

> **Screenshot: The Panel de administración, showing the four KPI cards, the portfolio donut, and
> the "Requieren seguimiento" follow-up list.**

- **Four KPI cards:** **Empresas** (active/inactive count), **Usuarios** (total across every
  company), **Reportando {year}** (how many active companies have data for the current year, out of
  all active companies), **Factores** (how many factors exist, and the current library version).
- **Estado del portafolio** (a donut): every active company sorted into Reportando (has data this
  year), Iniciadas (started, but not this year), or Sin actividad (nothing yet).
- **Requieren seguimiento** (Need follow-up): a plain list of specific problems, each one a link
  straight into that company's Ingreso de datos screen. The four kinds of flags, from most to least
  urgent: **Año vacío** (a reporting year with nothing in it), **Sin datos** (stalled), **Falta
  factor de red** (that year's electricity factor still needs loading), and **Alcance 2: N meses sin
  registrar** (some electricity months are still blank).
- **Biblioteca de factores** (a summary card): factor count, current version, and how many edits
  happened in the last 30 days, with an **Abrir biblioteca** shortcut.
- **Actividad reciente**: the 8 most recent entries platform-wide from Trazabilidad, with a **Ver
  todo** link to the full page.

> **Note:** The follow-up list only ever shows **active** companies. A deactivated company's empty
> or stalled data never appears there, since nobody is expected to be working on it right now.

---

## 5. Complete Feature Guide

Every feature in the platform, what it is for, and exactly how to use it. Sections 5.2–5.8 are for
**Company accounts**; 5.9–5.13 are for **CECODES Administrators**. Section 5.1 applies to everyone.

### 5.1 Navigation and Your Account (everyone)

**What it does:** lets you move between screens, adjust how the tool looks, switch language, and
manage your own login.

**Why/when you'd use it:** constantly — it is the frame around every other feature.

**How to use it, step by step:**

- **Show or hide the menu:** click the hamburger icon at the far left of the top bar.
- **Change appearance:** click the sun/moon icon to flip between light and dark.
- **Change language:** click **ES** or **EN**. A short "Cambiando idioma..." message appears, the
  whole page refreshes, and a confirmation follows.
- **Check your identity or role:** click your avatar (top right).
- **Change your password:** avatar menu → **Cambiar contraseña** → fill in the new password twice →
  **Guardar contraseña**.
- **Sign out:** avatar menu → **Cerrar sesión**.

**What happens after:** navigation and appearance changes are instant, with no confirmation and no
effect on your data. A password change shows a success message and returns you to your Dashboard.

**Common mistakes to avoid:** expecting the theme button to offer a "match my device" option — it
only ever flips between light and dark. Expecting **Cambiar contraseña** to ask for your current
password first — it does not, since you are already signed in.

---

### 5.2 Company Profile and Facilities (Empresa)

**What it does:** holds your company's basic details and the list of physical locations (**Sedes**)
that report data separately.

**Why/when you'd use it:** once, when your company is first set up (to double-check what CECODES
entered), and afterward whenever a detail changes or a new facility opens.

**How to use it, step by step:**

1. Click **Empresa** in the left menu.
2. **To edit your company's details:** in the **Información de la empresa** card, update the
   **Nombre** (Name, required), **Sector** (optional, from a dropdown), or **Contacto** (optional
   contact email). Click **Guardar cambios** (Save changes).
3. **To add a facility:** click **Agregar sede** (or, if you have none yet, the same button in the
   empty-state message). Fill in **Planta** (the site's name) and **Ubicación** (its location), both
   required, and click **Agregar sede**.
4. **To edit a facility:** click the pencil icon on its card, change the fields, save.
5. **To delete a facility:** click the trash icon on its card and confirm. This only works if the
   facility has **no reporting years** left on it (see below for how to remove those).
6. **To delete a reporting year:** click the small **×** on that year's chip on the facility's card
   and confirm.
7. **To start entering data for a facility:** click **Ingresar datos** on its card — this takes you
   to Data Entry, already filtered to that facility.

> **Screenshot: The Empresa screen, showing the company profile card at the top and a grid of Sede
> cards below it, each with its year chips.**

**What happens after each action:** a small green confirmation message appears (for example, "Sede
agregada"), and the page updates immediately — no reload needed.

**Confirmations & warnings:**

> **Warning — deleting a facility is permanent.** *"Esta acción no se puede deshacer."* You can only
> delete a facility once every one of its reporting years has already been removed.

> **Warning — deleting a reporting year is the single most destructive click in this whole section.**
> The confirmation window tells you exactly how many activity records will be permanently deleted
> with it. This removes every number entered for that facility and year — there is no undo.

**Common mistakes to avoid:**

- Looking on this screen for a way to **create** a reporting year — you can only create one from the
  Data Entry screen (via **Ingresar datos**, or the **Crear año** button once you're there).
- Assuming a blank **Contacto** field is an error — it is treated as "no contact set," not invalid.
- Trying to delete a facility that still has years on it — the tool refuses and tells you to remove
  the years first, on purpose, so a single click can never wipe real data.

---

### 5.3 Data Entry (Ingreso de datos)

**What it does:** this is where you actually record what your company consumed. Everything on the
Dashboard and in your reports comes from what is typed here.

**Why/when you'd use it:** throughout the year, or in one sitting at year-end, to log fuel,
electricity, and any other consumption your company wants to report.

**How to use it, step by step:**

1. Click **Ingreso de datos** in the left menu.
2. At the top, choose a **Sede** and an **Año** from the two dropdowns. If your company has only
   one of either, it is chosen automatically.
3. **If there is no reporting year yet** for that facility, click **Crear año**, type a year (for
   example `2024`), and confirm. A note tells you which official scientific conversion set (the
   "GWP set") will be used — this locks in permanently the moment the year is created, so results
   never silently change later if the science is updated. A year can never be renamed afterward,
   only deleted and recreated.
4. Click one of the three tabs: **Alcance 1**, **Alcance 2**, or **Alcance 3**.
   - **Alcance 1**: what your company burns or leaks directly (fuel, refrigerant leaks).
   - **Alcance 2**: the electricity you buy — the only Alcance entered **month by month**.
   - **Alcance 3**: everything indirect (flights, purchased goods, waste, and similar).
5. For each category (e.g. "Fuentes fijas"), decide whether it **¿Aplica?** (Applies) to your
   company. Leave it on if you have that kind of source; turn it off only for something your company
   genuinely does not do — this switch is itself meaningful, reportable information under the GHG
   standard, not just a display filter. **Once a category holds any source, the switch locks** until
   you delete those sources.
6. Click **Agregar fuente** (Add source) inside an applicable category. Search for the item you
   consumed (for example "diesel") and click it. You can only pick from CECODES's official list —
   you cannot type a made-up name, which is what keeps every company's math comparable.
7. **Enter the amount.**
   - Alcance 1 and 3: one box, **Valor anual** (Annual value), for the whole year.
   - Alcance 2: twelve boxes, **Enero** through **Diciembre**, one per month.
   - Type numbers with a comma or a dot as the decimal point (`3,4` or `3.4`, both work) and
     **never** a thousands separator — type `14957,1`, not `14.957,1`. Leaving a box blank means
     "not reported yet," which is different from typing `0`.
8. **For monthly electricity**, if most months are similar, type January and click **Copiar Enero a
   los meses vacíos** — it fills only the still-empty months and never overwrites one you already
   typed.
9. There is **no Save button**. A small indicator near the top tells you the state of your typing:
   **Se guarda automáticamente** (nothing pending) → **Guardando...** (in progress) → **Guardado
   {time}** (confirmed) — or, if something goes wrong, **No se pudo guardar**, in which case the box
   reverts to its last saved value and you should try again.
10. **To remove a source entirely**, click its trash icon and confirm. This deletes every value
    recorded for it (all twelve months, if it was electricity).

> **Screenshot: The Ingreso de datos screen mid-entry — the Alcance tabs, a category card open with
> one annual source and one twelve-month electricity source, and the autosave indicator.**

**Live estimates while you type:** each source shows a running estimate in t CO2e as you type.
Click it to see exactly how it was calculated (the factor used, the scientific set, and its source).
This number is always labeled a **reference estimate** — the official total is calculated on the
Dashboard, not here.

**Confirmations & warnings:**

> **Warning — deleting a source is permanent.** No undo. Confirm you have the right one before
> clicking through.

> **Note — a missing factor is never shown as a false zero.** If an electricity year has no national
> grid factor loaded yet, or an item has no valid conversion number, the tool says so in words ("Sin
> factor de red," "Sin factor") rather than showing `0.0`, so a real zero is never confused with a
> gap in the data.

**Common mistakes to avoid:**

- Typing `14.957,1` when you mean fourteen thousand nine hundred fifty-seven point one — the tool
  reads a lone dot as a decimal point, so this becomes 14.9571 and nothing on screen flags it as
  wrong. Drop the thousands separator entirely.
- Treating the live per-source estimate as your official total — it is a preview only.
- Trying to turn **¿Aplica?** off for a category that already has sources — the switch is
  intentionally locked until those sources are deleted, so a click can never silently erase data.
- Assuming a reporting year can be corrected if the year number itself was wrong — it cannot; delete
  it (from Empresa) and create a new one.

---

### 5.4 Reduction Targets (Meta)

**What it does:** lets you set your own optional yearly reduction goal, in t CO2e, for each Alcance.
It is purely a number you choose — the tool never calculates or suggests one for you.

**Why/when you'd use it:** if your company has committed to a reduction goal and wants to track
progress against it visually on the Dashboard.

**How to use it, step by step:**

1. On the Data Entry screen, open the Alcance tab you want a target for.
2. At the top of that tab, type a number into the **Target for Alcance N** box.
3. Click **Guardar meta** (Save target).
4. To remove a target later, clear the box and click **Guardar meta** again — an empty box deletes
   the target; it is not the same as setting it to zero.

**What happens after:** a confirmation message appears, and your progress shows up on the
Dashboard's "Target vs. actual by Alcance" chart the next time you view it.

> **Note:** A target is specific to one Sede, one Año, and one Alcance at a time. Switching the
> facility or year at the top of Data Entry shows that combination's own saved target (or nothing,
> if none was set there).

**Common mistakes to avoid:** assuming clearing the box and saving sets your target to zero — it
removes the target entirely. A target of `0` and "no target" behave differently on the Dashboard
chart (a zero target still draws a line at zero; no target simply leaves that Alcance off the
chart).

---

### 5.5 Cleaner Technologies and Good Practices

**What it does:** a free-text logbook for recording clean technologies or good practices your
company has adopted — for example, an LED retrofit or a biomass boiler. **It is purely
informational: nothing typed here is ever added to any total or calculation.**

**Why/when you'd use it:** whenever you want a record of sustainability initiatives alongside your
emissions data, for your own reference or to show in a report.

**How to use it, step by step:**

1. On the Data Entry screen, scroll below the Alcance tabs to the **Cleaner technologies and good
   practices** card.
2. Click **Add record**.
3. Fill in **Element** (the only required field — describe the technology or practice) and,
   optionally, Scope, Category, Subcategory, an activity quantity, and its unit.
4. Click **Add record** to save.
5. To edit a row, click its pencil icon, change the fields, and click **Save changes**.
6. To remove a row, click its trash icon.

> **Warning — removing a record has no confirmation step.** Clicking the trash icon deletes it
> immediately; there is no "are you sure" window and no undo.

**Common mistakes to avoid:** assuming the "Activity data" quantity typed here counts toward your
Alcance totals — it never does, anywhere in the tool. This section is repeated, word for word, on
the Resumen screen and in every exported report, always with the same reminder that it does not
affect any calculation.

---

### 5.6 Summary (Resumen)

**What it does:** shows every number you have entered, for one facility and year, in one table —
plus a full history of who entered or changed each figure. It exists so you can **sanity-check**
your data before trusting the Dashboard's official totals.

**Why/when you'd use it:** right after entering data, or any time you want to double-check a figure
or see who touched it.

**How to use it, step by step:**

1. Click **Resumen** in the left menu.
2. Choose a **Sede** and **Año** from the filter bar at the top.
3. Review the totals cards (**Total estimado**, plus one per Alcance) and the tables below — one per
   Alcance with data, listing each item's quantity, factor, and t CO2e.
4. Scroll down for the **Historial de cambios** (Change history) panel: who entered or edited each
   figure, and when. If nothing has ever been changed for that facility/year, this panel simply does
   not appear — that is normal, not a sign anything is broken.

> **Screenshot: The Resumen screen, showing the totals cards, one Alcance table, and the Historial de
> cambios panel at the bottom.**

**Confirmations & warnings:**

> **Note — this is a reference estimate, not your official number.** The footer of this screen
> always says so. Your **official**, authoritative totals are on the **Tablero** (Dashboard) and in
> your downloaded reports — both are computed by the same underlying engine, which this preview
> screen is not.

> **Note — a dash (–) is not a zero.** A dash means no number is available (nothing was reported, or
> the item has no valid factor). A true reported zero always shows as `0`.

**Common mistakes to avoid:** treating this screen's totals as final — they are a quick check, not
the official figure. Expecting removals or cleaner-technology rows to count toward the totals shown
here — both are always kept in their own separate section.

---

### 5.7 Reports (Reportes)

**What it does:** downloads your company's official footprint — for one facility and year — as a
file you can share or file away.

**Why/when you'd use it:** whenever you need a document to send to a partner, keep on record, or
compare against your own spreadsheet.

**How to use it, step by step:**

1. Click **Reportes** in the left menu (the same filters and export buttons also appear at the top
   of Resumen).
2. Choose a **Sede** and **Año**.
3. Click one of the three download buttons:

| Format | What it contains | Best for |
|---|---|---|
| **Descargar PDF** | A readable document: totals, breakdown by Alcance and category, removals (if any), cleaner-technology log (if any), and an uncertainty table | Sharing with a partner or keeping a signed-off record |
| **Exportar a Excel** | A workbook with three sheets: **Resumen** (totals and notes), **Datos** (exactly what you typed, no math), **Cálculo** (the full element-by-element working) | Comparing against your own spreadsheet, or further analysis |
| **CSV** | A plain-text, element-by-element version of the calculation | Loading into another system or tool |

**What happens after clicking:** a short "Generando el reporte" message appears, then the file
downloads to your device automatically, with a confirmation message.

> **Note:** Reports are always generated in **Spanish**, no matter what language the interface is
> set to. They are computed live, by the same official engine as the Dashboard — not a snapshot, and
> not the same as the Resumen screen's quick preview.

**Common mistakes to avoid:** expecting the export buttons to appear before you have chosen a
facility, year, and have some data recorded — they are intentionally hidden until there is something
real to download.

---

### 5.8 Dashboard (Tablero)

Covered in full in [Section 4a](#4a-company-dashboard-tablero). This is your read-only results
screen — there is nothing to enter or save here; every chart recalculates live from what you typed
in Data Entry.

---

### 5.9 Administrator Overview (Panel de administración)

Covered in full in [Section 4b](#4b-administrator-dashboard-panel-de-administración). This is a
CECODES Administrator's home screen — a bird's-eye view of every member company's status, with
direct links into whatever needs attention.

---

### 5.10 Managing Companies (Empresas)

**What it does:** lets an Administrator see every member company, create new ones, edit basic
details, temporarily suspend or restore access, permanently remove empty test records, and step into
any company's own workspace to work on their data directly.

**Why/when you'd use it:** onboarding a new member, correcting a company's details, handling
non-payment or off-boarding, or helping a company with its data entry.

**How to use it, step by step — creating a new company:**

1. Click **Empresas** in the left menu, then **Nueva empresa**. A four-step guided window opens.
2. **Step 1 — Empresa:** type the company **Nombre** (required), and optionally its **Sector** and a
   contact email. Click **Siguiente**.
3. **Step 2 — Primera sede (optional):** enter a facility name and location, or leave both blank to
   skip this step entirely. Click **Siguiente**.
4. **Step 3 — Primer año de reporte (optional):** only usable if step 2 was filled in; enter a
   starting year, or leave it blank. Click **Siguiente**.
5. **Step 4 — Primer usuario (optional):** enter an email and either type or click **Generar** to
   auto-fill a random temporary password. Click **Crear empresa**.
6. A summary screen reports what happened for each of the four items (the company itself always
   succeeds or the whole thing fails; the facility, year, and user are each attempted independently,
   so one can fail or be skipped without affecting the others). If a user was created, its
   credentials appear once — **Copiar** or **Descargar .txt** now, because they cannot be viewed
   again later.
7. From the summary: **Abrir empresa** (go straight to the new company's page), **Crear otra
   empresa** (start onboarding another one), or **Cerrar**.

> **Screenshot: The four-step Nueva empresa wizard, showing the step counter and the current step's
> form.**

**How to use it, step by step — day-to-day management:**

- **Edit a company's name or sector:** open its **⋯** menu → **Editar**.
- **Suspend a company (reversible):** **⋯** → **Desactivar**, then confirm. Its own users can no
  longer sign in or save data, but nothing is deleted — an Administrator can still open and work in
  its workspace. Reverse it any time with **Activar**.
- **Permanently delete a company (irreversible):** **⋯** → **Eliminar**. This only works if the
  company currently has **zero facilities and zero users** — otherwise it is refused with an
  explanation. Use **Desactivar** instead for anything that isn't a genuinely empty test record.
- **Work inside a company's data:** click **Ingresar datos** or **Abrir tablero** on its card, or
  open the company and use the sidebar sub-menu that appears (Tablero, Ingreso de datos, Resumen,
  Empresa, Reportes) to move between its screens — the exact same screens a Company account sees.

**Confirmations & warnings:**

> **Note — Desactivar is reversible, even though it is styled with a red warning button.** It blocks
> that company's own users; it deletes nothing.

> **Warning — Eliminar is truly permanent** and only ever possible on an empty company.

> **Warning — a credential shown after creating a company is shown exactly once.** If it is lost,
> there is no way to see the same password again — only to issue a new one (from Usuarios, see
> [5.11](#511-managing-users-usuarios)).

**Common mistakes to avoid:** trying to use **Eliminar** to temporarily suspend a company — it will
simply be refused unless the company is empty; **Desactivar** is the correct, reversible tool.
Assuming the wizard's optional steps roll back the company if one fails — they do not; the company
itself is created permanently as soon as step 4 is submitted, regardless of whether the facility,
year, or user step succeeded.

---

### 5.11 Managing Users (Usuarios)

**What it does:** the complete list of every login on the platform (both Company accounts and other
CECODES Administrators), with tools to create, edit, reset credentials for, suspend, or remove any
one of them.

**Why/when you'd use it:** onboarding a new person at a member company (or another CECODES staff
member), fixing someone's details, resetting a lost password, or removing/suspending access.

**How to use it, step by step:**

1. Click **Usuarios** in the left menu. This table shows **every** account platform-wide; there is no
   search or pagination — it is the complete list every time.
2. **To create an account:** click **Nuevo usuario**. Fill in **Correo** (Email), a **Contraseña
   temporal** (type one or click **Generar** for a random one), **Nombre**, **Cargo** (position),
   **Teléfono**, a **Rol** (Usuario Empresa or Administrador CECODES), and — for a Company role — the
   **Empresa** to assign them to. (Picking Administrador CECODES automatically clears and disables
   the company field, since an administrator never belongs to a company.) Click **Crear**. The new
   account's credentials appear once — **Copiar** or **Descargar .txt** immediately.
3. **To edit an account:** open its **⋯** menu → **Editar**. You can change role, company, name,
   position, and phone — never the email or password from here.
4. **To reset someone's password:** **⋯** → **Regenerar credenciales**, type or generate a new
   temporary password, and confirm. The old password stops working the next time that person tries
   to sign in; the new one is shown once, exactly like at creation.
5. **To suspend an account (reversible):** **⋯** → **Desactivar**, confirm. That person can no longer
   sign in or save data, but their historical data is kept. Reverse with **Activar**.
6. **To permanently remove an account (irreversible):** **⋯** → **Eliminar**, confirm.

> **Screenshot: The Usuarios table, showing the Correo, Persona, Rol, Empresa, and Estado columns,
> with the ⋯ actions menu open on one row.**

**Confirmations & warnings:**

> **Warning — there is no invitation email anywhere in this flow.** Every credential (new account or
> reset) must be delivered by the Administrator, by hand, using the copy or download-.txt button.
> There is no automated email step to rely on.

> **Note — neither Desactivar/Regenerar credenciales forces out an already-open browser session.**
> They only block the *next* sign-in attempt. If someone needs to be locked out immediately, this is
> the closest available control, but an existing open tab is not instantly closed.

> **Note — you cannot edit, suspend, reset, or delete your own account from this screen.** Your own
> row simply has no actions menu (just a "You" badge). This is a deliberate safeguard.

**Common mistakes to avoid:** assuming a lost temporary password can be looked up again later — it
cannot; use **Regenerar credenciales** to issue a brand-new one. Confusing **Desactivar** (reversible,
keeps data) with **Eliminar** (permanent, removes the login and profile entirely).

---

### 5.12 The Factor Library (Biblioteca de factores)

**What it does:** the shared master list of official conversion numbers ("emission factors") that
every company's calculation draws from, plus the one number Alcance 2 needs each year (the national
electricity grid factor), and a formal version-release log.

**Why/when you'd use it:** maintaining the accuracy of every company's calculations platform-wide —
this is shared, not scoped to any one company.

**How to use it, step by step:**

1. Click **Biblioteca de factores** in the left menu. There are three tabs: **Factores**, **Red
   eléctrica**, and **Versiones**.

**Factores tab:**

- Use the search box and the **Alcance / Categoría / Estado** filters to find a factor among the
  full library (shown **Active only** by default — switch **Estado** to see retired ones too).
- **To add a new factor:** click **Nuevo factor**, fill in its identification (Alcance, Categoría,
  Subcategoría, Elemento, Unidad), at least one of its emission-factor numbers, and any metadata
  (GWP set, uncertainty, effective year, source, whether it is biogenic). Click **Guardar**.
  (Alcance 2 factors are **not** entered here — see Red eléctrica below.)
- **To edit a factor:** open it and change any field, then **Guardar**. If nothing actually changed,
  the tool tells you there is nothing to save and writes no history entry.
- **To retire a factor:** open its **⋯** menu → **Desactivar**, confirm. It disappears from the list
  companies pick from when adding a *new* source; every entry that already used it is completely
  unaffected. Bring it back any time with **Activar**.
- Every factor has its own **Historial de cambios** showing exactly what changed, by whom, and when.

> **Note — there is intentionally no delete button for a factor.** Desactivar/Activar is its entire
> lifecycle, so a retired factor can never orphan a company's already-recorded data.

**Red eléctrica tab:**

- Shows the national electricity grid factor, one row per year, which every company's Alcance 2 data
  needs to be priced.
- **To add a year:** click **Agregar año**, fill in the year, the factor (kg CO2/kWh), and its
  source, then **Guardar**.
- **To correct a year:** click its pencil icon.
- **To remove a year (the one true, irreversible delete in this whole area):** click its trash icon
  and confirm.

> **Warning:** deleting a Red eléctrica year immediately makes every company's Alcance 2 numbers for
> that year show the missing-factor warning again, until it is reloaded. Load each year's factor as
> early as possible, ideally before companies start entering that year's electricity data.

**Versiones tab:**

- A permanent, append-only release log — mirrors CECODES's own change-control sheet. Click **Nueva
  versión**, fill in Versión, Fecha, Elaboró, Revisó, Autorizó, and a Descripción, then create it.
  There is no edit or delete for a version once created.

> **Best Practice:** create the new version entry **before** making the batch of factor edits it is
> meant to cover — every factor create/edit is automatically stamped with whichever version is most
> recent by date at that moment, so creating the version afterward attributes your edits to the wrong
> release.

**Common mistakes to avoid:** looking for a delete button on an emission factor — it does not exist,
by design; use Desactivar. Trying to enter an Alcance 2 factor on the regular factor form — that
scope's number lives only on the Red eléctrica tab, entered once per year. Forgetting to load a
year's grid factor before companies start reporting electricity for it.

---

### 5.13 Traceability (Trazabilidad)

**What it does:** a plain-language, filterable audit trail of every figure any company (or admin
working inside one) has entered or changed, across the entire platform.

**Why/when you'd use it:** whenever you need to answer "who entered this number, and when?" — for
one company or across all of them.

**How to use it, step by step:**

1. Click **Trazabilidad** in the left menu.
2. Optionally filter by **Empresa**, **Persona**, and/or a **Desde/Hasta** date range.
3. Read the feed: each row is a plain sentence — who did what, to which element, in which company
   and facility/year, and when.

> **Note:** this is different from a single factor's own **Historial de cambios** (in the Factor
> library) — that one tracks edits to the *factor itself* (its metadata); Trazabilidad tracks
> *company data entries* across every tenant. Neither replaces the other.

**Common mistakes to avoid:** expecting the Empresa or Persona filter dropdowns to list every company
or user in the system — they only list ones that already have at least one logged change, since an
empty option would never return anything anyway.

---

## 6. Complete Walkthrough

### 6.1 A day in the life: Company account

1. **Receiving your credentials.** CECODES sends your email and a temporary password.
2. **Opening the website.** You open the platform's address in your browser.
3. **Logging in.** You type your email and password and click **Ingresar**. You land on your
   **Tablero** — likely empty, if this is your very first visit.
4. **Checking your company's setup.** You click **Empresa** and confirm your company's name, sector,
   and at least one **Sede** are correct. If a facility is missing, you add it with **Agregar sede**.
5. **Entering data.** You click **Ingreso de datos**, pick your Sede, and — since this is a new
   facility — click **Crear año** to start a reporting year. You open **Alcance 1**, mark which
   categories apply, and use **Agregar fuente** to add your first source (say, diesel), then type its
   **Valor anual**. You repeat this for every fuel and refrigerant your company uses.
6. **Moving to electricity.** You click the **Alcance 2** tab, add your electricity source, and type
   each month's kWh — using **Copiar Enero a los meses vacíos** where the bills were similar.
7. **Covering indirect emissions.** You click **Alcance 3** and add anything indirect you want to
   report — business flights, purchased goods, waste.
8. **Setting a target (optional).** For any Alcance your company has a reduction goal for, you type
   it and click **Guardar meta**.
9. **Logging good practices (optional).** You scroll to **Cleaner technologies and good practices**
   and record anything relevant, such as a recent LED retrofit.
10. **Saving your work.** There is nothing to click — every field you typed already saved itself, and
    the indicator near the top confirmed each one.
11. **Reviewing what you entered.** You click **Resumen**, check the totals and tables for your Sede
    and Año, and scroll to **Historial de cambios** to confirm everything you (or a colleague)
    entered is there.
12. **Seeing the real picture.** You click **Tablero** and watch the charts populate: your total
    footprint, the split by Alcance, the monthly electricity trend, and — once you set one — your
    progress toward your target.
13. **Downloading a report.** You click **Reportes**, confirm the Sede and Año, and click **Descargar
    PDF** (or Excel, or CSV) to get a file you can share.
14. **Managing records later in the year.** You come back whenever new data is available, add or
    correct sources, and delete anything entered by mistake (with the confirmation windows guarding
    every permanent action).
15. **Logging out.** You open your account menu and click **Cerrar sesión**.

### 6.2 A day in the life: CECODES Administrator

1. **Receiving your credentials.** CECODES issues your administrator login separately from any
   member company's.
2. **Opening the website and logging in.** Same sign-in screen as everyone else; you land on the
   **Panel de administración** instead of a company dashboard.
3. **Reviewing the overview.** You scan the four KPI cards and the **Requieren seguimiento** list for
   companies that need a nudge — say, one with **Falta factor de red** for the current year.
4. **Onboarding a new member company.** You click **Empresas** → **Nueva empresa**, fill in the
   company's name and sector, optionally its first facility and reporting year, and optionally a
   first user with a generated temporary password. You submit, review the summary, and **Descargar
   .txt** the new user's credentials to send them out of band.
5. **Managing users.** You click **Usuarios**, find someone who needs a password reset, use
   **Regenerar credenciales**, and deliver the new password.
6. **Fixing a flagged company.** You click straight from the overview's follow-up list into that
   company's **Ingreso de datos**, where you can enter or correct data on the company's behalf, exactly
   as its own users would.
7. **Maintaining the factor library.** At the start of the year, you open **Biblioteca de factores** →
   **Red eléctrica** and click **Agregar año** to load the new national electricity factor, so every
   company's Alcance 2 data can be priced as soon as they start entering it.
8. **Recording a version release.** Before making a batch of factor corrections, you open the
   **Versiones** tab and click **Nueva versión** to log the release, then make your edits.
9. **Tracing a figure.** A company asks who changed a number — you open **Trazabilidad**, filter by
   their company name, and find the exact entry, person, and time.
10. **Suspending an account.** A company stops paying dues — you find it under **Empresas** and click
    **Desactivar**, which blocks its users without touching its data.
11. **Logging out.** Account menu → **Cerrar sesión**.

---

## 7. Buttons & Actions Reference

Every meaningful button in the platform: what it does, when to use it, and what happens after you
click it. Organized by screen, in the same order as [Section 5](#5-complete-feature-guide).

### Navigation & account (everyone)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| Hamburger icon (top left) | Shows/hides the left menu | To reclaim screen space | Menu collapses/expands instantly |
| Sun/moon icon | Switches light/dark appearance | Personal preference | Instant, no confirmation |
| **ES / EN** | Switches interface language | To read in your preferred language | Brief loading message, page refreshes in the new language |
| Account avatar | Opens your account menu | To check your identity/role, change password, or sign out | Dropdown opens |
| **Cambiar contraseña** | Opens the change-password screen | To set a new password while signed in | New-password form opens; no current password needed |
| **Guardar contraseña** | Saves your new password | After filling both password fields | Success message, redirected to your Dashboard |
| **Cerrar sesión** | Ends your session | Whenever you are done, or on a shared computer | Immediate, no confirmation, returns to sign-in |

### Logging in

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Ingresar** | Submits your email/password | Every sign-in | Success: your Dashboard. Failure: an inline error message |
| **¿Olvidaste tu contraseña?** | Goes to the forgot-password screen | You can't remember your password | Forgot-password form opens |
| **Enviar enlace** | Requests a password-reset email | After typing your email | Always shows "Check your email," whether or not the address is registered |

### Company profile & facilities (Empresa)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Guardar cambios** (profile) | Saves your company's name/sector/contact | After editing company details | Confirmation message, page updates |
| **Agregar sede** | Opens the add-facility window | To register a new location | Fill Planta + Ubicación, both required |
| Pencil icon (Sede card) | Opens the edit-facility window, pre-filled | To correct a facility's details | Same window, in edit mode |
| Trash icon (Sede card) | Opens a delete-facility confirmation | To remove a facility entirely | Only succeeds if it has zero reporting years |
| **×** on a year chip | Opens a delete-reporting-year confirmation | To remove one year's data from a facility | States exactly how many records will be deleted — irreversible |
| **Ingresar datos** (Sede card) | Jumps to Data Entry for that facility | To start recording its consumption | Leaves this screen |

### Data entry (Ingreso de datos)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Crear año** | Opens the create-reporting-year window | A facility has no year open yet, or needs another one | New year created and selected; its scientific set is locked in permanently |
| **¿Aplica?** switch | Marks a category as relevant or not | Declaring whether your company has that kind of source | Locks once the category has any source |
| **Agregar fuente** | Opens the element search | To add a new item to an applicable category | Pick from the official list only; added instantly |
| Trash icon (source row) | Opens a delete-source confirmation | To remove an item and all its recorded values | Irreversible — confirm carefully |
| **Copiar Enero a los meses vacíos** | Fills only the still-empty months with January's value | Similar electricity use most months | Never overwrites a month you already typed |
| Value fields | Record the amount consumed | Entering your data | Saves itself automatically after a short pause |
| **Guardar meta** | Saves (or clears, if left blank) your reduction target | Setting or removing a target for one Alcance | Confirmation message; shows on the Dashboard afterward |
| **Add record** (Cleaner technologies) | Opens the add-record window | Logging a clean-tech practice | Only the Element field is required |
| Trash icon (Cleaner technologies row) | Deletes that record | Removing a logged practice | **No confirmation — immediate and permanent** |

### Summary (Resumen) & Reports (Reportes)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| Sede / Año filters | Switch which facility/year the screen shows | Reviewing a specific facility's year | Page updates to match |
| **Descargar PDF** | Downloads a readable summary document | Sharing with a partner or filing a record | File downloads with a confirmation message |
| **Exportar a Excel** | Downloads a three-sheet workbook | Reconciling against your own spreadsheet | File downloads |
| **CSV** | Downloads a plain-text calculation table | Loading into another tool | File downloads |

### Dashboard (Tablero)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| Planta/Sede, Año, Alcance, Categoría filters | Narrow what the charts show | Focusing on one facility, year, scope, or category | Every chart recalculates for the new view |
| **Limpiar** | Resets the Alcance and Categoría filters only | Clearing a narrowed view | Charts return to the broader view |
| **Ir a Ingreso de datos** / **Definir metas** | Links from an empty chart to where you'd fix it | No data, or no target set yet | Navigates to Data Entry |

### Administrator: Companies (Empresas)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Nueva empresa** | Opens the 4-step company wizard | Onboarding a brand-new member company | This is the only way to create a company today |
| **Siguiente / Atrás** (wizard) | Moves between wizard steps | Filling in the wizard | Validates the current step first |
| **Generar** (wizard) | Fills a random temporary password | Not inventing one by hand | Field updates instantly, still editable |
| **Crear empresa** (wizard, step 4) | Creates the company and attempts the optional steps | Finishing the wizard | Switches to a results summary |
| **Copiar** / **Descargar .txt** (credentials box) | Copies or downloads new login details | Handing credentials to someone | Shown once — cannot be reopened later |
| **⋯ → Editar** | Opens the edit-company window (name/sector only) | Correcting a company's details | Confirmation message |
| **⋯ → Activar / Desactivar** | Reversibly restores/blocks a company's access | Restoring or suspending a member | Confirm in the dialog first |
| **⋯ → Eliminar** | Permanently deletes an empty company | Removing a mistaken/test entry | Only works with zero facilities and zero users |
| **Ingresar datos** / **Abrir tablero** (company card) | Opens that company's workspace directly | Working on a company's behalf | Lands inside that company's screens |

### Administrator: Users (Usuarios)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Nuevo usuario** | Opens the create-account window | Onboarding a new person | Credentials shown once on success |
| **Generar** | Fills a random temporary password | In create or reset windows | Field updates, still editable |
| **⋯ → Editar** | Changes role, company, name, position, phone | Fixing or reassigning an account | Email/password stay unchanged here |
| **⋯ → Regenerar credenciales** | Issues a brand-new temporary password | Password lost or needs rotating | Old password stops working on next sign-in |
| **⋯ → Activar / Desactivar** | Reversibly restores/blocks one login | Access needs to pause or resume | Confirm first; data is always kept |
| **⋯ → Eliminar** | Permanently removes a login and profile | Account should never return | Confirm — irreversible |

### Administrator: Factor library

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| **Nuevo factor** | Opens a blank factor form | Adding a new conversion number | Fill identification + at least one factor value |
| **Guardar** (factor form) | Saves a new or edited factor | Creating/correcting a factor | Confirmation, or "nothing to save" if unchanged |
| **⋯ → Desactivar / Activar** | Reversibly retires/restores a factor from the picker | Retiring an outdated factor | Existing entries that used it are unaffected either way |
| **Agregar año** (Red eléctrica) | Adds a year's national electricity factor | Loading each new year's number | Refused if that year already exists — edit instead |
| Pencil icon (Red eléctrica row) | Edits an existing year's factor | Correcting a value | Overwrites that year's number and source |
| Trash icon (Red eléctrica row) | Deletes a year's factor — **the one true delete in this area** | Rare corrections only | Breaks that year's Alcance 2 pricing platform-wide until reloaded |
| **Nueva versión** | Records a library release in the version log | Before a batch of factor edits | Purely additive — no edit/delete afterward |

### Administrator: Traceability (Trazabilidad)

| Button | What it does | When to use it | After clicking |
|---|---|---|---|
| Empresa / Persona / Desde / Hasta filters | Narrow the audit feed | Tracing a specific figure | Feed updates to match |
| **Limpiar filtros** | Resets all filters | Returning to the full feed | Shows everything again |

---

## 8. Common Tasks

Quick, numbered recipes for the things you will do most often.

### For Company accounts

**Add a new facility (Sede)**
1. **Empresa** → **Agregar sede** → fill Planta + Ubicación → **Agregar sede**.

**Start a new reporting year**
1. **Ingreso de datos** → choose the Sede → **Crear año** → type the year → **Crear año** to confirm.

**Record an annual consumption figure (Alcance 1 or 3)**
1. Open the right Alcance tab → make sure the category's **¿Aplica?** is on → **Agregar fuente** →
   search and pick the item → type the number into **Valor anual**.

**Record monthly electricity (Alcance 2)**
1. Open **Alcance 2** → **Agregar fuente** → pick your electricity source → type each month, or type
   January and click **Copiar Enero a los meses vacíos** for the rest.

**Set or clear a reduction target**
1. Open an Alcance tab → type (or clear) the target box → **Guardar meta**.

**Log a cleaner-technology practice**
1. Scroll to the Cleaner technologies card on Data Entry → **Add record** → fill in Element (required)
   → **Add record** to save.

**Review your data before trusting the totals**
1. **Resumen** → pick Sede + Año → read the tables and the Historial de cambios.

**Download a report**
1. **Reportes** (or the same buttons on Resumen) → pick Sede + Año → click PDF, Excel, or CSV.

**Delete a source you added by mistake**
1. Find the source row → trash icon → confirm in the window. Permanent — double-check first.

**Delete an entire reporting year**
1. **Empresa** → find the facility → click the **×** on that year's chip → read how many records will
   be deleted → confirm. Permanent.

### For CECODES Administrators

**Onboard a new member company**
1. **Empresas** → **Nueva empresa** → fill Step 1 (required) and any of Steps 2–4 you have ready →
   **Crear empresa** → deliver any generated credentials from the summary.

**Create a user and hand out credentials**
1. **Usuarios** → **Nuevo usuario** → fill the fields, generate or type a password, pick a role and
   (for company users) a company → **Crear** → **Copiar** or **Descargar .txt** immediately.

**Reset someone's password**
1. **Usuarios** → their row's **⋯** → **Regenerar credenciales** → set a new password → deliver it.

**Suspend vs. permanently remove a company or user**
1. To pause access without losing data: **Desactivar**. To permanently remove (companies only work if
   empty of facilities/users): **Eliminar**.

**Load the yearly electricity factor**
1. **Biblioteca de factores** → **Red eléctrica** → **Agregar año** → enter the year, the kg CO2/kWh
   value, and its source → **Guardar**. Do this as early in the year as possible.

**Add or retire an emission factor**
1. To add: **Biblioteca de factores** → **Nuevo factor** → fill identification and at least one
   factor value → **Guardar**. To retire: open the factor's **⋯** → **Desactivar**.

**Record a factor library version release**
1. **Biblioteca de factores** → **Versiones** → **Nueva versión** → fill the release details →
   **create it first**, then make the batch of factor edits it should cover.

**Trace who changed a number**
1. **Trazabilidad** → filter by Empresa and/or Persona and/or a date range → read the feed.

**Work inside a company's data on their behalf**
1. **Empresas** → open the company (or click **Ingresar datos**/**Abrir tablero** on its card) → use
   the same Tablero/Ingreso de datos/Resumen/Empresa/Reportes screens a Company account would see.

---

## 9. Tips & Best Practices

> **Tip:** Type decimals with either a comma or a dot — both work. What matters is that you
> **never** type a thousands separator (write `14957,1`, not `14.957,1`).

> **Tip:** Leave a value blank instead of typing `0` when you simply have not reported it yet. The
> tool treats "not reported" and "reported as zero" as two different, meaningful things.

> **Tip:** There is no Save button anywhere in Data Entry. Watch the small autosave indicator instead
> of looking for one — it tells you exactly when your last change is safely stored.

> **Tip:** Before turning a category's **¿Aplica?** switch off, make sure that is really what you
> mean — the GHG standard treats this as a real, reportable declaration, not just a display filter.

> **Tip:** Review your numbers on **Resumen** before you trust the **Tablero** — Resumen is your
> quickest way to spot a typo, and its Historial de cambios shows exactly who typed what.

> **Tip:** If Alcance 2 shows zero and a "falta el factor de red" warning, keep entering your kWh
> anyway — it is not lost, it is simply waiting for CECODES to load that year's national factor.

> **Best Practice (everyone):** Change your temporary password on your very first sign-in, and never
> share a login between two people — every entry records who made it.

> **Best Practice (Administrators):** Load each year's national electricity factor as early as
> possible, ideally before member companies start entering that year's data, so nobody sees an
> avoidable warning.

> **Best Practice (Administrators):** Create a new library **Versión** before starting a batch of
> factor corrections, not after — edits are attributed to whichever version is most recent at the
> moment you save them.

> **Best Practice (Administrators):** Reach for **Desactivar** by default over **Eliminar**. Deletion
> is permanent and, for companies, only possible once every facility and user under it is gone;
> deactivation is instantly reversible and keeps every record intact.

> **Best Practice (Administrators):** Deliver every generated credential (new account or reset)
> immediately after creating it — the plaintext password is shown exactly once and can never be
> retrieved again afterward, only replaced with a new one.

---

## 10. Frequently Asked Questions

**I forgot my password. What do I do?**
Click **¿Olvidaste tu contraseña?** on the sign-in screen and follow the emailed link. If you are
already signed in and just want to change it, use **Cambiar contraseña** in your account menu
instead — no old password required.

**Why can't I see something I expect to see?**
Most likely one of: you have the wrong Sede or Año selected in the filter bar; the data has not been
entered yet; or (Company accounts) your company or account was deactivated by CECODES. Check the
filters first, then contact CECODES if the problem persists.

**Why can't I edit this?**
A few fields are locked on purpose: a category's **¿Aplica?** switch locks once it has sources (delete
them first); a facility can't be deleted while it has reporting years (delete those first); your own
email and password can only be changed through the password-reset flow, never edited directly; and
(Administrators) you cannot edit, suspend, or delete your **own** account from the Usuarios screen.

**Where are my records?**
Everything you enter is organized by **Sede** (facility) and **Año** (year). If you don't see a
number, check that you have the right facility and year selected — Data Entry, Resumen, Reportes, and
the Dashboard all use the same two filters.

**What happens after I save?**
There is no explicit save step in Data Entry — every field saves itself a fraction of a second after
you stop typing or move to the next field, confirmed by the small indicator near the top of the
screen. Everywhere else (profile edits, adding a facility, creating a company or user), a click on the
visible save/confirm button submits it, and a short confirmation message tells you it worked.

**Can I undo changes?**
Most edits (profile details, factor values, a company's name) can simply be edited again to correct
them. A short list of actions **cannot** be undone: deleting a data source, deleting a reporting year,
deleting a facility, deleting a cleaner-technology record, deleting a company or a user, and deleting
a yearly electricity factor. Every one of these (except the cleaner-technology record) shows a
confirmation window first — read it before confirming.

**Can two people from my company use the tool at the same time?**
Yes. Each person should have their own login (a CECODES Administrator can create as many as needed),
and everyone sees the same company data. Every entry records who made it.

**Is the number shown next to a source, while I'm typing, my official total?**
No — it is a quick reference estimate to help you as you go. Your official total is calculated on the
**Tablero** (Dashboard) and in your downloaded reports.

**Can I create my own account or company?**
Not at the moment. Every company and every login is currently set up by CECODES directly; there is no
self-service sign-up option live on the platform today.

**Why is my downloaded report in Spanish even though I switched the interface to English?**
That is expected — reports are always generated in Spanish, regardless of the interface language, so
every company's paperwork stays consistent.

---

## 11. Troubleshooting

| Problem | Likely cause | What to do |
|---|---|---|
| Can't sign in — "Correo o contraseña incorrectos" | Typo in email or password | Re-check both fields carefully, or use **¿Olvidaste tu contraseña?** |
| Can't sign in — "Tu cuenta fue desactivada" | A CECODES admin deactivated your login | Contact CECODES — you cannot reverse this yourself |
| Signed in, but every screen says "Empresa desactivada" | Your whole company was deactivated | Contact CECODES; your data is safe and untouched |
| A category's **¿Aplica?** switch won't turn off | It already has one or more sources | Delete every source in that category first, then the switch unlocks |
| A facility won't delete | It still has one or more reporting years | Delete each reporting year from the facility's card first |
| Alcance 2 shows zero for a year | That year's national electricity factor has not been loaded yet | Keep entering your data — only a CECODES administrator can load the missing factor |
| A number shows a dash (–) instead of a value | Nothing was reported there, or that item has no valid factor | Not an error; a dash always means "no number available," never zero |
| My typed value doesn't look right after saving | You likely typed a thousands separator (e.g. `14.957,1`) | Re-type without it: `14957,1` |
| A password-reset email never arrived | Either the address isn't registered, or there's a delivery delay | Double-check the address is correct; if it should exist, contact CECODES directly |
| **Copiar Enero a los meses vacíos** is greyed out | Either January is empty, or every month already has a value | Fill January first, or note that nothing is left to copy |
| (Admin) Can't delete a company | It still has facilities or users under it | Deactivate it instead, or remove every facility and user first |
| (Admin) Can't find an option to edit your own user account | Self-editing is disabled by design on the Usuarios screen | Ask another CECODES administrator, or use your own account menu for password changes |
| A page shows "not found" instead of loading | You may not have permission for that screen, or the link is stale | Navigate there again from the menu rather than an old link |

> **Note:** the platform never shows raw technical error text — every message you see is
> deliberately written in plain language. If something goes wrong that isn't covered above, the
> on-screen message is the most accurate description available; if it doesn't make sense, contact
> CECODES with the exact wording.

---

## 12. Contact & Support

Contact CECODES whenever:

- You need a **new account** or a **new company** set up.
- You are **locked out** and cannot recover on your own (a deactivated account or company, or a
  password-reset email that never arrives for an address you're sure is registered).
- You spot something on screen that looks **wrong or broken**, not just unfamiliar.
- You need a **year's electricity factor** loaded, or believe a **conversion number** in the shared
  library is incorrect (Company accounts cannot fix either of these themselves).
- You want to understand a figure you didn't enter yourself — CECODES can look it up in
  Trazabilidad.

**When you reach out, it helps CECODES resolve things faster if you include:**

- Your **email address** (your username in the tool).
- Your **company name**, and the **facility (Sede)** and **year (Año)** involved, if relevant.
- The **exact screen** you were on (e.g. "Ingreso de datos, Alcance 2").
- The **exact message** shown on screen, if there was one — a screenshot is ideal.
- What you **expected** to happen, versus what actually happened.

---

*This guide describes the platform as it currently works. If CECODES changes how any feature
behaves, this document should be updated to match.*
