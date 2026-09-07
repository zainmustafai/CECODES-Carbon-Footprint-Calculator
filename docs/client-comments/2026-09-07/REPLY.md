# Reply to your comments of 7 September 2026

**CECODES · Herramienta Huella de Carbono**
Prepared 8 September 2026 · Source: `September-07-2026-COMENTARIOS FINALES HUELLA DE CARBONO.pdf`

Eleven points came out of your review. **All eleven are resolved.** Two of them turned out to
describe behaviour the tool already had, so for those we are confirming rather than changing, and
we say which below. One point names a chart that does not exist in the tool, and we explain how we
read it so you can correct us if we read it wrong.

---

## Tablero (Dashboard)

**1. Pareto colours.** The bars are now grey and the highlighted sources are violet, using the
palette you sent. The cumulative line takes the light blue from the same palette, because leaving
it grey would have hidden it inside the bars.

You were right about the cause. The bars were painted in the Alcance 3 colour and the highlights
in the Alcance 2 colour, so anyone arriving from the first chart read them as scopes. These three
colours belong to no Alcance at all, which is what stops the confusion. The table under the chart
marks the same sources in the same violet, so the highlight still reads clearly even though grey
and violet are close in weight.

**2. "Participación por GEI en el inventario total".** This chart is now light blue. It had been a
lighter shade of the Alcance 1 green, so it was reading as a scope colour for the same reason as
the Pareto.

**3. "Tendencia mundial".** The line is now orange.

One thing to confirm: there is no chart called "Tendencia mundial" in the tool. The only trend
chart is **"Tendencia mensual"**, the Alcance 2 electricity line, and that is the one we changed.
Orange is also the right colour for it, because that chart shows Alcance 2 only and the report
already drew it in orange. The green on the screen was the inconsistency. If you meant a different
chart, tell us and we will move the colour.

---

## Reportes (Reports)

**4. Monthly Alcance 2 chart.** Each month now prints its own value underneath the month name, the
same treatment the participation chart uses. The unit is stated once above the chart, in t CO2e,
rather than repeated twelve times, because twelve unit labels do not fit side by side at that
width.

A month that nobody reported prints no value at all. This is deliberate and matches the line
itself, which breaks rather than dropping to zero: a blank means "not reported", never "zero".

**5. "Incertidumbre por elemento" and "Emisiones por categoría".** Both tables are smaller now.
They had been inheriting the report's general text size, so we gave these two their own smaller
size rather than shrinking every table, since the other tables were not part of your comment.

**6. Page orientation.** The report is now **horizontal**. You asked for a test, so please look at
it and tell us whether to keep it.

What you gain is width, which is what the ISO 14064-1 table needed. What you pay is height: each
page holds about a third fewer rows, so the longer tables run over more pages than before. If you
prefer the old shape, returning to vertical is a single change.

**7. "Panorama por gas".** Renamed to **"Panorama por GEI"**.

SF6 and NF3 now always appear, showing 0,00 when your company reports none. They had been listed
only when they carried a value, and a report that silently omits a gas reads as "we did not
measure it", which is a different statement from zero.

The "other" line is also always present, and it is now called **"CO2e sin desagregar"** instead of
"Otros gases sin identificar". The old wording suggested we did not know what the number was. We
do know what it is: it is CO2e that arrives already combined and cannot be separated by gas, which
is the same point you make in comment 10.

---

## Resumen (Summary)

**8. Capital letters in the Alcance 2 element.** It now reads **Sistema Interconectado Nacional -
SIN**, with SIN kept in capitals.

This one needed a correction to the stored data, not only to the screen, because each entry keeps
its own copy of the element name from the moment it was recorded. We renamed the element and the
twelve entries that referred to it. The change is recorded in the factor history like any other
edit, so it is visible and reversible.

We deliberately did not apply an automatic capitalisation rule to every element. 46 elements in
the official library are legitimately written in capitals, such as R-410A and HFC-23, and a
blanket rule would have turned those into R-410a and Hfc-23.

---

## CO2 vs CO2e

**9. Alcance 2 counted as CO2. This already works this way, and no change was needed.**

Alcance 2 electricity has always been counted as 100% CO2 in this tool: in the gas chart, in the
"Panorama por GEI" list and in the ISO 14064-1 declaration. We took that from your own PRINCIPAL
sheet, which puts the UPME factor in the kg CO2 column. We checked it again against your comment
and it is correct. Nothing was changed, so nothing can have broken.

**10. Alcance 3 categories C1 and C2 out of the gas chart.** Done, on the Tablero chart and in the
report's "Panorama por GEI" list, with your paragraph printed underneath both.

One consequence you should know about, because it changes numbers you will read. The percentages
in that chart are now shares of what the chart actually shows, so they still add up to 100%. They
are no longer shares of the whole inventory. The excluded value is printed immediately above your
paragraph, so the chart plus that one number still reconcile with the total on the cards above. We
chose this over leaving every percentage small and unexplained.

Everything else keeps C1 and C2 in full: the totals, the totals by Alcance, the totals by
category, the ISO 14064-1 declaration and the Excel export. Only the gas chart and the gas
panorama exclude them, because those two are the only places where a value that cannot be split by
gas has nowhere to sit.

**11. Fugitive emissions counted toward their own gas. This already works this way. What we
changed is the label.**

This one is worth reading carefully, because the tool was already doing what you asked and the
appearance is what misled us both.

The tool decides which gas a factor belongs to from a gas column in the library, never from the
unit text. A refrigerant recorded as HFC has always been added to the HFC total, at a global
warming potential of 1, exactly as your comment describes. That is already true in the gas chart
and in the kg HFCs column of the ISO 14064-1 declaration.

What was wrong was only the unit shown next to the factor. It read `kgCO2eq/kg`, which invites the
reader to think the value is being held apart as CO2e rather than counted as the gas. We have
relabelled those factors so the unit names the gas itself: **`kgHFC/kg`**, `kgPFC/kg`, `kgSF6/kg`
and `kgNF3/kg`. 71 factors were relabelled, and the official library already spelled 3 of them
this way, which is what told us this was the intended reading.

**No total changed anywhere as a result.** If a number had moved, it would have meant the tool had
been calculating something different from what it was showing, and it was not.

---

## What we would like back from you

1. **Confirm the "Tendencia mundial" reading in comment 3.** We changed "Tendencia mensual". If
   you meant another chart, tell us which.
2. **Tell us whether to keep the horizontal report from comment 6.** It is a trial, as you asked,
   and returning to vertical is a single change.
3. **Confirm the unit spelling in comment 11.** You wrote `kgHFC`. We used `kgHFC/kg`, keeping the
   "per kilogram" part, because the official library already spells SF6 and NF3 that way, and
   because dropping it leaves the Resumen showing a factor with no basis. Say the word and we
   remove it.

If it is easier for your team, we can send this same document in Spanish.
