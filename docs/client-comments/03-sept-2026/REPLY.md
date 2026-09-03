# Reply to your comments of 3 September 2026

**CECODES · Herramienta Huella de Carbono**
Prepared 3 September 2026 · Source: `September-03-2026-COMMENTS.pdf`

Thirteen points came out of your testing. **Twelve are working in the tool now.** One is ready
and waiting on a date from you, because it changes stored numbers.

---

## 1. What is working now

You can open the tool and check every item in this section today.

### Menu

**1. Order of the menu.** It now reads **Ingreso de datos, Tablero, Resumen, Empresa, Reportes**,
exactly as you listed it. The CECODES administrator sees the same order when opening a company.
The page you land on right after signing in is still the Tablero, which we left as it was.

### Ingreso de datos

**2. Show every gas, not only CO₂.** When you choose an element, the summary now lists every gas
its factor carries, each in its own unit, for example `kg CO2/gal`, `kg CH4/gal` and `kg N2O/gal`.

Some factors arrive already expressed in CO₂e instead of per gas: refrigerants, SF₆, PFCs, NF₃,
and the Alcance 3 factors based on spend or on distance. Those are now named by their gas family
instead of appearing as an unlabelled consolidated number.

**3. Registering pasajero·km and vehículo·km for C4, C6, C7 and C9.** You asked whether a template
would be better in Excel. We built it **inside the tool** instead, and here is why: a spreadsheet
has to be filled, saved, sent, uploaded and validated, and it goes out of date the moment an
element name changes, while a table inside the entry screen checks each row as it is typed and
always offers the current list of elements.

Under the activity there is now a small table: **one row per route or trip**, with a reference
name, the number of passengers, vehicles or tonnes, the distance in km, and observations. The
tool multiplies each row and adds the results, and shows the total under the table. We followed
the four reference workbooks you sent for C4, C6, C7 and C9.

Two things we corrected while building it:

- **C4 and C9 freight measured in `ton * km` was not included in the two-field entry.** Only
  `pasajeros * km` and `vehículo * km` were, so anyone reporting freight by tonnage had to
  multiply by hand before typing. All three units now behave the same way.
- **With more than one row, the tool multiplied the total quantity by the total distance instead
  of multiplying each row and then adding.** With a single row the two give the same answer, which
  is why it had never shown up, but it had to be corrected before multi-row entry could be offered.
  Two trips of 4 × 250 and 6 × 100 now give **1.600**, not 3.500.

### Tablero

**4. Company information as the header.** The company block is now the first thing on the Tablero,
above every chart: name, sector, Período and number of sedes, with the user guide download and a
link to edit the profile.

The company profile now also holds **NIT, número de colaboradores, responsable, cargo, teléfono and
sitio web**. Fill them in on the Empresa screen and they appear in the report header. Any field you
leave empty is simply left out, never printed blank.

**5. Every gas shown separately.** The chart now has fixed columns for **CO₂, CH₄ (no fósil),
CH₄ (fósil), N₂O, HFCs, PFCs, SF₆ and NF₃**, with a table underneath giving each gas its share of
the total and its tonnes. Nothing is grouped into "other" any more.

One extra column, "Sin identificar", appears only if a factor arrives in CO₂e without saying which
gas it is. It is there so that case is visible instead of being quietly folded into another gas.
On a clean factor table it never appears.

**6. CH₄ fossil separated from non fossil.** CH₄ from biogenic sources is converted at GWP **27**
and fossil CH₄ at **29,8** (IPCC AR6), and the two are separate columns everywhere: on the Tablero,
in the report and in the ISO declaration. The split follows the biogenic mark on each factor, so it
is decided by the factor table and not by the person entering data.

**7. Monthly Alcance 2 chart.** It is now a line with a visible point on every month that has a
reading. A month nobody reported stays a **gap** in the line rather than dropping to zero, so an
empty month cannot be mistaken for a month with no consumption.

**8. Pareto chart.** All bars and the cumulative line are one colour. Only the elements up to and
including the one that crosses **85%** accumulated are highlighted in orange, which is the same
rule your own chart applies when it highlights four bars ending at 86,95%. A table under the chart
lists t CO₂e and accumulated % for each element, as in your file. The report uses the same rule from
the same code, so the printed Pareto and the one on screen cannot disagree.

**9. Total duplicated when filtering by Alcance.** Confirmed and fixed. When you checked one or two
Alcances, a second card opened below and repeated the same total, then redrew the same category and
element charts that were already on the screen. That card is gone.

To be precise about what was wrong: **the duplication was on screen only. The total itself was
calculated correctly, so no figure had to be corrected.** The filter still narrows the headline
total, the categories, the gases and the Pareto. The ring keeps showing the full three way split of
the year, so it stays a breakdown instead of repeating the filtered number just above it.

### Reportes

**10. The downloadable report, rebuilt.** It now runs in the order you asked for: company header,
the dashboard visuals (total and totals per Alcance, the ring, category panorama, gas panorama,
Pareto, monthly Alcance 2, emissions per sede), Emisiones por categoría, **Declaración consolidada
GEI (ISO 14064-1)**, removals, cleaner technologies and good practices, notes and warnings, and
Incertidumbre por elemento last. The old "Resumen por elemento" section is removed.

The declaration is a three level table, Alcance then Categoría then Elemento, with one column per
gas and bold subtotal rows. As in your own pivot, the **CO₂, CH₄ and N₂O columns are gas mass in
kg**, while **HFCs, PFCs, SF₆ and NF₃ are already CO₂e**, because the factor table holds those
three consolidated.

### Administración

**11. Yearly gasoline and diesel prices.** You asked whether to add the files or a new table. We
built a **table**, maintained by the CECODES administrator, with **one gasoline price and one
diesel price per year**.

Until now there was a single price per year and **both** C6 subsidy factors divided by it, so the
diesel subsidy was being priced at the gasoline price. Each fuel now uses its own price.

We loaded the national averages from your own `C6 - Viajes de negocios.xlsx`, sheet
`(C6) Viajes y subsidios`:

| Year | Gasolina (COP/gal) | Diésel (COP/gal) |
| --- | --- | --- |
| 2024 | 16.046,315789 | 9.574,157895 |
| 2025 | 15.663,157895 | 10.646,473684 |

Your figures carry twelve decimals; the column keeps six, so the values above are your numbers
rounded to six decimal places. The difference is under one thousandth of a peso. You can edit any
of them, and add other years, from **Administración → Biblioteca de factores → Precios de
subsidio**. Previous years keep the price they were calculated with, so correcting one year never
silently changes a year you have already reported.

### Guía

**12. User guide.** The Spanish guide you sent is in the tool and can be downloaded from the
company header on the Tablero. It sits there rather than in the welcome card, because the welcome
card can be dismissed and then the button would be gone for good.

---

## 2. On "check the CO₂ and other gas calculations"

This deserves a straight answer, because there were two different problems behind it and only one
of them is fixed by the items above.

### What was being shown

Gases beyond CO₂, CH₄ and N₂O were being collected into a single group, and the report went further
and labelled them "otros gases sin identificar" even where the Tablero could name the same gas
correctly. One data set was giving two different answers depending on the screen. **Both are
corrected**, and the report and the Tablero now read the gas from the same place.

### What was being calculated

Here we did find a real problem, and it is not in the formulas. It is in **which factor table the
tool was loaded from**. It was loaded from the older file, sheet `Jerarquía nueva (2025)`, and not
from the `Emission Factors` sheet of the DASHBOARD workbook you have now confirmed as official.

The two sheets have the same 45 columns, so we compared them row by row. **213 rows differ**,
mostly CH₄ and N₂O. The official sheet divides by 1.000 where the older one does not, and in some
rows corrects the coefficient as well:

| Element | Loaded today (old sheet) | Official sheet | Off by |
| --- | --- | --- | --- |
| Coque | 0,0282 kg | 0,000282 kg | 100 × |
| Carbón Vegetal | 5,9 kg | 0,0059 kg | 1.000 × |
| Gas Natural Genérico, fijo | 357 kg | 0,0000357 kg | 10.000.000 × |

The official table also moves 60 refrigerant CO₂e factors from AR5 to AR6, and divides 53 Alcance 3
C1 spend based factors by 1.000.

**This correction has not been applied yet.** It is section 3 below, and it is the one change that
will move your totals.

### Something we should flag in your own file

Inside the DASHBOARD workbook, the `Tablas dinámicas` sheet does not agree with the `PRINCIPAL`
sheet of the same file. Alcance 1 totals **12.020,95 t** in the pivot against **11.852,83 t** in
PRINCIPAL, and "Fugas de Propano Alta Calidad / R-290" reads **18,798 t** in the pivot where
PRINCIPAL computes 6.266 × 0,02 = **0,12532 t**.

A pivot table keeps the last values it was refreshed with, so this looks like a saved copy that was
never refreshed after the factors were corrected. We are treating **PRINCIPAL** as the reference the
tool must reproduce. Please confirm that is what you expect.

### What we checked against your own numbers

We took rows straight out of your pivot and reproduced them. This is the row **"C9: Transporte
terrestre de carga (camiones de servicio medianos y pesados)"**:

| Gas | Mass (kg) | GWP AR6 | kg CO₂e |
| --- | --- | --- | --- |
| CO₂ | 4.929.185,89 | 1 | 4.929.185,89 |
| CH₄ fósil | 38,81 | 29,8 | 1.156,54 |
| N₂O | 155,25 | 273 | 42.383,25 |
| **Total** | | | **4.972.725,68** |
| Your table | | | 4.972.725,73 |

The 0,05 kg difference is the rounding of the gas masses printed in your own table, not a difference
in method.

And the biogenic case, which is where the CH₄ split matters: your residuos row carries **275,35 kg**
of non fossil CH₄, and 275,35 × 27 = **7.434,45 kg CO₂e**, which is exactly the figure your table
prints. Had it been treated as fossil it would have read 8.205,43.

Both of these are now locked in as automated checks that run on every change, together with a rule
that every element's gas columns must add up to that element's own total. The tool currently passes
**412 automated checks**; if a future change breaks one of them, the build stops rather than
shipping a wrong number.

---

## 3. The one item still open: correcting the emission factors

**Status: ready to run, waiting on a date from you.**

We will load the `Emission Factors` sheet of the DASHBOARD workbook as the official table,
replacing what is in the tool today.

**Good news about the effect.** Every total in the tool is calculated at the moment you open the
screen and is never stored as a finished number. So the correction restates all past and present
figures on its own. **Nobody has to re-enter anything.**

### Two things we found on the way, neither of them reported by you

1. **A rename in the workbook silently undoes a correction.** When an element is renamed, the
   previous load created a new factor row and left the existing entries attached to the old one.
   That is why a correction we made earlier to the road and air travel distances (C6 Viajes
   Terrestres and all of C7) is no longer reaching your data. This time the entries will be moved
   across deliberately, and we will show you the list of pairs before anything moves, because a
   wrong match would re-price real data.

2. **The official sheet does not fix the kilometre and mile error.** It still carries 0,477873 for
   "C6: Carro particular", which is 0,297 × 1,609: the value that was multiplied where it should
   have been divided. So that correction has to be re-applied **after** the new table is loaded,
   or loading the official sheet would quietly reintroduce the error. This is now part of the
   sequence.

### What to expect on the day

Some totals will fall considerably, by 100, 1.000 or more on the affected rows. **That is the
correction working, not a new error.** From that day the Tablero and the report will carry a dated
note saying the factor table was corrected on that date, so the change in your numbers is visible
and can be explained in an audit. Until the correction runs, that note does not appear, because it
would not be true yet.

### What we need from you

1. **A date and time to apply it**, ideally outside working hours.
2. **Confirmation that PRINCIPAL is the sheet the tool should reproduce**, not the pivot.

---

## 4. Summary

| # | Your comment | Status |
| --- | --- | --- |
| 1 | Order of the menu | Working |
| 2 | Show every gas in data entry | Working |
| 3 | Register pasajero·km and vehículo·km (C4, C6, C7, C9) | Working |
| 4 | Company information as the header | Working |
| 5 | Every gas shown separately | Working |
| 6 | CH₄ fossil separated from non fossil | Working |
| 7 | Monthly chart with points, not an area | Working |
| 8 | Pareto in one colour, highlighting to 85% | Working |
| 9 | Total duplicated when filtering by Alcance | Working |
| 10 | Report rebuilt with the ISO 14064-1 declaration | Working |
| 11 | Yearly gasoline and diesel prices, admin maintained | Working |
| 12 | User guide download | Working |
| 13 | Correct the emission factors | **Ready, waiting on a date** |

Nothing on this list stops you from using the tool in the meantime. Everything marked Working is
available now, and the factor correction will restate whatever has been entered by the time we
apply it.

A Spanish version of this document is available on request.
