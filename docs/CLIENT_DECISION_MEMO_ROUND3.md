# Round 3: The Last Two Decisions

**To:** CECODES
**Date:** 28 July 2026
**Re:** Your answers of 24 July and the Excel you sent. This follows our earlier question rounds.

---

## Resumen en español (30 segundos)

La herramienta está lista y reproduce EXACTAMENTE los números de su Excel. Solo quedan **2 decisiones**, y para cada una les damos nuestra recomendación:

1. **UREA:** el valor de la urea en su Excel (0,7333) es correcto, y la etiqueta de su propio Excel ya dice CO2. Pero está escrito en la columna equivocada (la de N2O, óxido nitroso), y todo lo que está en esa columna se multiplica por 273. Ejemplo: 32.626 kg de urea salen como 6.531 toneladas cuando deberían ser unas 24. **Recomendamos: CORREGIR (respondan "1 fix" o "1 corregir").**
2. **META:** ¿la meta de reducción es un solo porcentaje para TODA la empresa, o una meta por cada sede? **Recomendamos: POR EMPRESA (respondan "2 company" o "2 empresa").**

Si están de acuerdo con las dos recomendaciones, basta con responder: **"1 corregir, 2 empresa"**.
Si no están de acuerdo con alguna, respondan **"1 keep" (dejar como está)** o **"2 sede"**, o simplemente díganlo en español.

El resto de este documento explica todo en detalle, en inglés sencillo, y al final está la lista de todo lo ya decidido.

---

## First, the good news: the tool is done

Everything from your 24 July messages is finished. The tool reproduces your Excel row by row (we proved it against the example inside the PRINCIPAL page of the file you sent), the 2025 electricity factor is loaded, the new open section "Datos sobre tecnologías más limpias" is built, and no fuel list is needed because your own Excel already marks each element. The full checklist of everything decided and built is in the annex at the end.

While testing your Excel we found one thing that needs your decision (question 1), and one older question is still open (question 2). These are the only two things left.

---

## QUESTION 1: The urea factor. Our recommendation: FIX

*(En español: el valor de la urea es correcto pero está en la columna equivocada y se multiplica por 273. Recomendamos corregirlo.)*

### What we found

Your Excel calculates urea fertilization *(Fertilización con Urea)* like this:

1. On the **Emission Factors** page, the urea row has the value **0,7333** and its label says **"kg CO2e/kg urea"**.
2. But that value is written in the **N2O column** (nitrous oxide, *óxido nitroso*), not in the CO2 column.
3. Your Excel multiplies everything in the N2O column by **273** (the global warming number for N2O).
4. So every kg of urea counts as about **200 kg of CO2e**, instead of 0,7333 kg.

In plain words: **the number is correct, but it is sitting in the wrong column**, so the Excel multiplies it by 273 when it should multiply it by 1.

### Why we are confident the value is CO2, not N2O

The official number for CO2 from urea, published by the IPCC (the United Nations climate science panel, *el panel científico del clima de la ONU*), is exactly **0,7333 kg of CO2 per kg of urea**. That is the same number written in your Excel. And the label in your own Excel already says "kg **CO2e**/kg urea". Everything says CO2; only the column position says N2O.

### What this means in real numbers

**The example inside your own Excel (Ball Cajicá):**
- Urea entered: 32.626 kg
- Result today (value in the N2O column): **6.531,7 t CO2e**
- Result if corrected (value as CO2): **23,9 t CO2e**

**Your example company Cultivos Casablanca (the 2024 data you showed us):**
- Urea entered: 6.282 kg
- Result today: about **1.258 t CO2e**
- Result if corrected: about **4,6 t CO2e**

The difference is 273 times. In the example inside your Excel, urea alone is **55% of the company's entire footprint**. If the factor is corrected, that example company's total goes from about 11.869 t down to about 5.361 t.

### Your two options

**KEEP (reply: "1 keep" / "1 dejar como está")**
The tool keeps copying your Excel exactly as it is today. Every kg of urea counts as about 200 kg CO2e. The risk: companies that use urea publish a footprint up to 273 times too high on this item, and an external verifier would very likely report it as an error.

**FIX (reply: "1 fix" / "1 corregir") - RECOMMENDED**
The 0,7333 value moves to the CO2 column, in the tool and in your Excel. Every kg of urea counts as 0,7333 kg CO2e, the official IPCC value. Work needed: one change in the tool (we do it the same day, recorded in the change history) and moving one value to the CO2 column on the Emission Factors page of your Excel (we send you the exact cell).

### Why we recommend FIX

1. **The science says CO2.** The official IPCC number for urea is exactly 0,7333, and it is a CO2 number.
2. **Your own Excel says CO2.** The label on the value already reads "kg CO2e/kg urea".
3. **The risk of keeping it is real.** Any agricultural company using the tool would publish a footprint inflated by hundreds of times on this item.

Why we did not simply fix it ourselves: our rule is that **the tool must always match your official Excel, and we never change your numbers without your yes**. That is why this is your decision, not ours.

---

## QUESTION 2: The Meta (reduction goal). Our recommendation: COMPANY

*(En español: ¿una sola meta porcentual para toda la empresa, o una meta por sede? Recomendamos por empresa.)*

### What is already decided (from your earlier answers)

- The Meta is a **percentage** (for example: "reduce 5%"), not a number of tonnes.
- It is a goal on the **general total**, not one goal per *alcance* (scope).
- It is measured against the **first year** the company reports (the baseline year).

### The one thing left

When a company has several *sedes* (sites), for example Riofrio and Santana, is the Meta:

**COMPANY (reply: "2 company" / "2 empresa") - RECOMMENDED**
ONE goal for the whole company. Example: "Cultivos Casablanca will reduce 5% versus 2025". The dashboard shows one clear line, goal vs real. Very simple for the person filling the form.

**SEDE (reply: "2 sede")**
A separate goal for each sede. Example: "Riofrio reduces 5%, Santana reduces 10%". The dashboard shows several lines, one per sede. More work for the companies.

### Why we recommend COMPANY

Your own words were that the meta "would be a general total goal". A single company-wide percentage matches that, it is simpler for the companies, and it matches how the total footprint is presented. Starting company-wide loses nothing: per-sede goals can be added on top later. What would be expensive is building per-sede first and then undoing it, and that is the only reason we ask before building.

---

## What happens after you answer

- **"1 fix / 1 corregir":** we correct the urea factor in the tool the same day (recorded in the change history) and send you the exact cell to correct in your Excel, so both always match.
- **"1 keep / 1 dejar como está":** nothing changes; the tool keeps copying your Excel exactly.
- **"2 company / 2 empresa" or "2 sede":** we finish the Meta feature that way, and the dashboard shows goal vs real accordingly.

After these two answers there is **nothing left pending from you**. The fastest way to close everything is one short reply:

> **"1 corregir, 2 empresa"**

(or whichever combination you prefer; both questions accept either answer, in English or Spanish.)

---

## Annex: everything decided so far, in one list

- **Authoritative factor table:** the Emission Factors page of the Excel you sent us (24 Jul).
- **Electricity 2025:** 0,097, loaded together with all the years 2008 to 2025 (24 Jul).
- **Purchased goods:** in USD, with the decimal comma reading (2,893 = dos coma ocho nueve tres) (24 Jul).
- **Methane (CH4) fossil vs non-fossil:** decided by the "biogénica" column of your factor table, exactly as your Excel's formulas do it. No fuel list needed (24 Jul).
- **Global warming numbers:** the most updated international set, exactly as your Excel uses, for every year (24 Jul).
- **"Tecnologías más limpias" section:** open text, informative only; never affects calculations; appears in the summary and the reports (24 Jul).
- **Removals (*Remociones*):** separate table with separate total, never mixed with emissions (from your Excel).
- **Renewable energy:** reported separately (18 Jul).
- **Meta:** a percentage, on the general total, versus the first reported year (18 Jul).
- **Who fills the form:** name, phone, email and position, with a history of every change to every value entered (17 and 18 Jul).
- **Monthly data:** electricity (*Alcance 2*) is monthly; everything else is annual (9 Jul).
- **Results unit:** always tonnes (t CO2e) (9 Jul).
- **Years before 2025:** allowed (your own examples are 2024 data); each year uses its own electricity factor (24 Jul).

*Si algún punto es más fácil de responder en español, respondan en español. Podemos enviar la versión completa de este documento en español si la prefieren.*
