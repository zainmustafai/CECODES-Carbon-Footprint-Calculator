# CECODES Carbon Footprint Tool: Step by Step Guide

A practical guide for training your team and your member companies. It follows the order you
will actually use the tool in: sign in, set up, enter data, check it, read the results.

The tool's screens are in **Spanish (es-CO)** by default, with an English switch. This guide is
written in English and quotes the Spanish buttons exactly as they appear, so you can follow it
with the screen in front of you.

> **Need this in Spanish?** Say the word and we will produce a Spanish version of this guide for
> your member companies.

---

## Contents

1. [What the tool does](#1-what-the-tool-does)
2. [The two kinds of account](#2-the-two-kinds-of-account)
3. [Signing in](#3-signing-in)
4. [Getting around the screen](#4-getting-around-the-screen)
5. [First time setup](#5-first-time-setup)
6. [Your company and its sedes](#6-your-company-and-its-sedes-empresa)
7. [Creating a reporting year](#7-creating-a-reporting-year-ao)
8. [Entering data](#8-entering-data-ingreso-de-datos) **(the main section)**
9. [How to type numbers](#9-how-to-type-numbers-important) **(read this one)**
10. [Checking your data and exporting](#10-checking-your-data-and-exporting-resumen)
11. [Reading the dashboard](#11-reading-the-dashboard-tablero)
12. [For the CECODES team only](#12-for-the-cecodes-team-only)
13. [Quick answers](#13-quick-answers)

---

## 1. What the tool does

A company records **how much it consumed** in a year: fuel, electricity, flights, waste, and so
on. The tool multiplies each quantity by the official CECODES conversion number (the **emission
factor**, *factor de emisión*) and adds everything up into one figure: **tonnes of CO2
equivalent (t CO2e)**, the standard unit for greenhouse gases.

It replaces the Excel workbook, and it must produce the same totals the Excel produces.

The words you will see everywhere:

| Word on screen | What it means |
|---|---|
| **Empresa** | The company |
| **Sede** | One physical site (a plant, an office, a warehouse). A company can have several |
| **Año** | One reporting year, for example 2024. Each year is calculated on its own |
| **Alcance 1 / 2 / 3** | The three groups of emissions (Scope 1 / 2 / 3) |
| **Fuente** / **Elemento** | A source: one specific thing you consumed, like diesel or electricity |
| **Factor de emisión** | The conversion number that turns a quantity into emissions |
| **t CO2e** | Tonnes of CO2 equivalent. Every figure the tool shows is in tonnes |
| **Meta** | An optional reduction target you set for a scope |

The three groups, in plain terms:

- **Alcance 1**: what the company burns or leaks itself. Diesel in a generator, fuel in company
  vehicles, refrigerant gas escaping from air conditioning.
- **Alcance 2**: the electricity it buys from the grid. This is the only one entered **month by
  month**.
- **Alcance 3**: everything indirect. Business flights, purchased goods, waste.

---

## 2. The two kinds of account

- **Company user** (*Usuario Empresa*): sees only their own company. Enters data, checks it, and
  reads their dashboard.
- **CECODES administrator** (*Administrador CECODES*): manages the emission factor library, the
  companies, and the user accounts, and can open any company to help it.

A company can have **several users**. They each sign in with their own account and all see the
same company data.

An administrator sees the same screens a company user does, just reached from the company list.

---

## 3. Signing in

1. Open the tool and you land on **Iniciar sesión**.
2. Type your email and password, then click **Ingresar**.
3. Forgot your password? Click **¿Olvidaste tu contraseña?** and a reset link is emailed to you.

If your account was switched off you will see **Cuenta desactivada**. If your whole company was
switched off you will see **Empresa desactivada**. In both cases the data is kept; contact
CECODES to switch it back on.

---

## 4. Getting around the screen

**The left sidebar** is the menu. A company user has:

| Menu item | What it is for |
|---|---|
| **Tablero** | The dashboard: your results as charts |
| **Ingreso de datos** | Where you type your consumption. This is the main screen |
| **Resumen** | All your data in one table, and the Excel export |
| **Empresa** | Your company details and your sedes |
| **Reportes** | Marked **Pronto** (coming soon) |

**The top bar** has, from left to right: a button to hide or show the menu, where you are, and
then three controls on the right:

- **Cambiar tema**: switch between **Claro** (light), **Oscuro** (dark) and **Sistema**
  (follow your computer).
- **ES / EN**: switch the language between Spanish and English. It takes a moment while the
  page reloads in the new language, and a message confirms when it is done.
- **Your initial**: your account menu, with **Cerrar sesión** (sign out).

---

## 5. First time setup

The very first time a new company signs in, the tool asks for two things on one form
(**Configura tu empresa**):

1. **Nombre de la empresa** (required) and **Sector** (optional).
2. The company's **first sede**: **Planta** (the site name) and **Ubicación** (where it is).

Click **Crear empresa** and you are ready. You can add more sedes later.

---

## 6. Your company and its sedes (Empresa)

The **Empresa** screen holds two things:

**The company profile.** Name, sector, and an optional contact email. These details appear on
your reports. Click **Guardar cambios** to save.

**Your sedes.** Each sede is one plant at one location, and each one is measured separately.
From here you can:

- **Agregar sede**: add another site (**Planta** and **Ubicación**).
- See each sede's **Años de reporte** (reporting years).
- Click **Ingresar datos** to jump straight into entering that sede's data.

> A sede's name must be unique inside your company. You cannot delete a sede that still has
> reporting years, so that a single click can never wipe real data.

---

## 7. Creating a reporting year (Año)

Data always belongs to **one sede in one year**, so before typing anything you need a year.

On **Ingreso de datos**, click **Crear año**, type the year (for example `2024`), and confirm.

The dialog shows a note like *"Se usará el conjunto de PCG AR6"*. That is the official set of
scientific conversion values for that year, and it is **fixed at the moment you create the
year**. That is deliberate: if the science is updated later, your already published years do not
silently change.

---

## 8. Entering data (Ingreso de datos)

This is the screen your users will spend all their time on.

### Step 1: choose where and when

At the top, pick your **Sede** and your **Año**. Everything below belongs to that combination.
Your choice is remembered in the address, so you can reload or share the link and land back in
the same place.

### Step 2: choose the alcance

Three tabs: **Alcance 1**, **Alcance 2**, **Alcance 3**. The small number on a tab is how many
sources you have added there.

### Step 3: does the category apply?

Each alcance is split into categories (for example *Fuentes Fijas*, *Fuentes Móviles*). Every
category has an **¿Aplica?** switch.

This is not decoration. The greenhouse gas standard requires a company to **declare** the
categories it is excluding, so "no aplica" is saved as real reportable information. Turn it off
for anything your company genuinely does not have.

Once a category has sources in it, the switch locks. To turn the category off you must delete
its sources first. This stops recorded consumption from disappearing behind a switch.

### Step 4: add a source

Click **Agregar fuente**. A search box opens with the official list of elements and their fixed
units.

- You **cannot invent or misspell** an element. You pick it from the list, so every company
  calculates the same way.
- The search **ignores accents**, so typing `diesel` finds `Diésel`.
- An element you already added shows a check mark and cannot be added twice.

### Step 5: type the quantity

This is where **Alcance 2 is different from the others**:

- **Alcance 1 and Alcance 3**: one box per source, **Valor anual**. One number for the whole
  year. The unit (`gal`, `kg`, `km`) is shown inside the box.
- **Alcance 2 (electricity)**: **twelve boxes**, Enero to Diciembre, because electricity is
  reported month by month. A badge tracks your progress, for example **"8 de 12 meses"**.

**Shortcut:** if your electricity is about the same every month, type Enero and click **Copiar
Enero a los meses vacíos**. It fills **only the empty months** and never overwrites a month you
already typed.

### Step 6: there is no Save button

The tool **saves by itself** as you type. Watch the indicator at the top right:

| Indicator | Meaning |
|---|---|
| **Se guarda automáticamente** | Nothing pending |
| **Guardando...** | Sending your changes |
| **Guardado 14:32** | Saved, at that time |
| **No se pudo guardar** | Something went wrong. The box goes back to its last saved value |

If you try to close the tab while something is still saving, the browser warns you first.

### Step 7: the live estimate

Next to each source the tool shows what it currently adds up to, in **t CO2e**, updating as you
type. Open it to see **which factor was used**, the **GWP set**, and the **bibliographic source**
of that factor, so anyone can audit the number.

This is labelled a **reference estimate**. The official totals are the ones on the **Tablero**.

If a factor is missing, the tool **says so in words**. It will never show you `0.0 t` for
something it could not calculate, because a real zero and a missing factor must never look alike.

### Step 8: the reduction target (Meta), optional

Each alcance can carry a **Meta de reducción**: your target for that scope, in t CO2e. Type it
and click **Guardar meta**. Your progress against it appears on the **Tablero**.

Clearing the box **deletes** the target. An empty target is not a target of zero.

### A note about electricity

Electricity emissions depend on the **national grid factor**, which changes every year because
Colombia's power mix changes. A CECODES administrator loads it, one value per year.

If the year you are working in has no grid factor yet, you will see a yellow notice. **Keep
entering your kWh anyway.** The emissions will calculate the moment the administrator loads the
factor.

---

## 9. How to type numbers (important)

This is the part worth covering carefully in training, because it is where mistakes are silent.

### Decimals: comma or dot, both work

**`3,4` and `3.4` are both accepted, and both mean three point four.** Use whichever is natural
for your team. The comma is fine.

| You type | The tool stores | |
|---|---|---|
| `3,4` | 3.4 | correct |
| `3.4` | 3.4 | correct |
| `3,44567` | 3.44567 | correct |
| `3.44567` | 3.44567 | correct |

### Never type a thousands separator

This is the one real rule.

| You mean | Type this | Do NOT type |
|---|---|---|
| One thousand two hundred | `1200` | `1.200` or `1,200` |
| Fourteen thousand nine hundred and fifty seven point one | `14957.1` or `14957,1` | `14.957,1` |

**Why it matters:** a lone dot is always read as a decimal point. If you type `1.200` meaning one
thousand two hundred, the tool reads **1.2**, and nothing looks wrong. That is a mistake nobody
catches later, so it is worth one slide in your training.

The rule is written under every field on the screen: *"Solo valores no negativos. Decimales con
coma (,) o punto (.). No uses separador de miles."*

### The rest of the rules

- **Up to 6 decimal places.** `3.44567` is fine. `3.4567891` is rejected with a visible message.
- **No negative numbers.**
- **Blank is not zero.** Leave a box empty when you have no data: that means *"not reported
  yet"*. Type `0` only when the company genuinely consumed nothing. The tool keeps these apart
  on purpose, and the monthly chart shows an unreported month as a gap rather than a zero.
- **Pasting from Excel** mostly works: `1.234,56` is understood as one thousand two hundred and
  thirty four point five six. The US style `1,234.56` is rejected rather than guessed at.
- A half typed value like `12,` stays on the screen but is not saved until it is a valid number.

---

## 10. Checking your data and exporting (Resumen)

**Resumen** shows everything you entered as one table, which is the easiest way to check a year
before you trust it.

At the top: your **Total estimado** and a card per alcance. Below: one table per alcance, listing
each element with its **Unidad**, **Cantidad**, **Factor**, and **t CO2e**. Alcance 2 gets the
twelve months across the table.

Pick the **Sede** and **Año** with the two filters at the top.

**To export**, use the buttons at the top right:

- **Exportar a Excel** downloads a workbook.
- **CSV** downloads a plain text version.

The buttons appear only when there is actually a sede, a year, and some data to export.

You will also see a note when a year has **no grid factor**, and a note about **biogenic**
emissions when relevant (emissions from biological material, which the greenhouse gas standard
reports separately).

---

## 11. Reading the dashboard (Tablero)

The **Tablero** is read only: it answers four questions.

**How big is our footprint?** The **Huella total** card, in t CO2e.

**Did it go up or down?** The **Variación vs. año anterior** card, comparing to the year before.
Green with a down arrow means a reduction, red with an up arrow means an increase.

**Are we on track?** The **Avance hacia la meta** card, if you set a Meta.

**Where does it come from?**

- **Emisiones por alcance**: a ring split into Alcance 1, 2 and 3.
- **Emisiones por categoría**: the biggest categories, ranked.
- **Tendencia mensual**: electricity month by month. A month nobody reported is a **gap in the
  line**, not a zero, so it does not look like the plant shut down.
- **Comparación entre años** and **Meta vs. real**.

Four filters at the top (**Planta / Sede**, **Año**, **Alcance**, **Categoría**) narrow the view,
and the address updates so you can share exactly what you are looking at.

---

## 12. For the CECODES team only

An administrator has three extra menu items.

### Biblioteca de factores

The whole conversion library, roughly 1,700 rows, in three tabs:

- **Factores**: search and filter every factor. You can edit any of them, including the name, the
  unit and the category. A factor is never truly deleted: switching it off removes it from the
  companies' pick list while every record that already used it stays intact.
- **Red eléctrica**: the national electricity factor, one row per year (kg CO2 per kWh). Add the
  new year here and every company's warning for that year clears.
- **Versiones**: the formal release list (v001, v002 and so on), mirroring the Excel's control
  sheet, so a published result can always be traced to the exact library that produced it.

**Every edit is recorded.** The change log stores who changed it, when, and the old and new value
of every field. Saving without really changing anything records nothing.

### Empresas

Create, rename, deactivate or delete companies, and open any company's workspace to help them.

Deactivating is the gentle tool: it blocks that company's users but keeps all their data, and an
administrator can still go in and fix things. Deleting is only possible for a company with no
sedes and no users.

### Usuarios

Create accounts, set someone's role and company, deactivate or delete them. A deactivated user is
refused on their very next click.

You cannot deactivate or delete **your own** account, so the team can never lock itself out.

---

## 13. Quick answers

**Can I write 3,4 or 3.4?**
Both. They mean the same thing. Use whichever your team prefers.

**How do I write one thousand two hundred?**
`1200`. Never `1.200`, which would be read as 1.2.

**Where is the Save button?**
There is not one. It saves as you type. The indicator at the top right tells you when.

**I left a box empty. Is that zero?**
No. Empty means "not reported yet". Type `0` only if you really consumed nothing.

**Why is electricity split into twelve boxes?**
Because CECODES reports electricity month by month. Alcance 1 and 3 are one annual figure each.

**My electricity shows no emissions.**
The national grid factor for that year has not been loaded yet. Keep entering your kWh; it
calculates as soon as an administrator loads it.

**Can two people from the same company use the tool?**
Yes. Each person gets their own account, and they all see the same company data.

**I cannot turn off a category.**
It still has sources in it. Delete them first, and then the switch unlocks.

**Can I change the language?**
Yes, the **ES / EN** switch in the top bar, at any time.

**Is the estimate next to each source the official number?**
No, it is a reference estimate to help you as you type. The official totals are on the
**Tablero**.
