# Round 2: Six Things Your Answers Opened Up

**To:** CECODES
**Re:** Follow-up to your answers of 17 July 2026
**Related:** [CLIENT_DECISION_MEMO.md](./CLIENT_DECISION_MEMO.md) (round 1), Requirements §12 and §14

Thank you. Eight of your ten answers are now settled and we are building against them. This
document only covers what is left. It is deliberately short.

Three of your answers could not be applied as written, not because they were unclear, but because
two of our round-1 questions were **badly asked** and your answer inherited the problem. That is on
us, and items 2 and 3 below re-ask them properly.

One genuinely new blocker appeared, and it is item 1. It is more urgent than anything in round 1
except the workbook.

**A Spanish version of this document is available on request. If any item is easier to answer in
Spanish, please answer in Spanish.**

---

## Settled, no action needed from you

| Your answer | What we did |
| --- | --- |
| **3.** Include biogenic CO2 in the total and disclose separately | Already how the tool works. No change |
| **6.** Never miles, always kilometres *(kilómetros)* | Already true: there is not one mile-based factor in the library. Your correction is applied and recorded |
| **9.** Empty Scope 3 *(Alcance 3)* categories are deferred | Formally out of parity, recorded in the sign-off |
| **10.2** No auditor role in v1 | Deferred |
| **10.3** Uncertainty in the report, not the dashboard | Agreed. See item 5, we need one detail |
| **2.** No years before 2025 | Understood. **Not applied yet, and item 1 explains why:** blocking earlier years before the 2025 electricity factor exists would leave no working year at all |

On **item 6**, one note to prevent a future accident: because there are no mile-based factors, your
instruction must not be read as "convert the travel factors to kilometres". They are already in
kilometres. Converting them again would make travel emissions **2.59 times too low**. We have
recorded this warning in the code.

---

## 1. What is the 2025 electricity factor? (NEW, and now the biggest blocker)

**The question.** Please send the grid electricity emission factor *(factor de emisión de la red)*
for **2025**.

**Why we are asking.** You told us the first reporting year is 2025. Your workbook's electricity
factors stop at **2024**, on both sheets. Ours stop at 2024 too, because we loaded them from your
workbook.

**What it blocks.** **All of Scope 2 *(Alcance 2)* for 2025**, which is the largest category for most
companies, in the only year you intend to use. Every other electricity question in round 1 was about
history. This one is about the year you are actually going to report.

**It also blocks your answer 2.** You asked us to stop companies using years before 2025. We tried,
and had to undo it, because the two answers together break the tool:

| | |
| --- | --- |
| Years a company could open, if we apply your answer 2 | 2025, 2026, 2027 |
| Years we have an electricity factor for | 2013, 2019, 2021, 2022, 2023, 2024 |
| Years where electricity would actually calculate | **none** |

So until the 2025 factor arrives, blocking older years would leave **no year at all** in which
Scope 2 works. Right now a company can at least open 2024 and get a real electricity number. We have
therefore left older years open for the moment. This is not us ignoring your answer: it is one
change we will make the same day you send the factor.

**Cost of not answering.** Companies can enter their monthly electricity consumption and the tool
cannot turn it into emissions. It will show a warning instead of a number.

**Default if you do not answer.** **There is no safe default.** We will not invent an electricity
factor or reuse 2024's, because that silently produces a wrong number that looks right. The tool
will show an explicit "factor not available for 2025" warning until you send it.

---

## 2. Which sheet? (re-asking round-1 item 5, correctly this time)

**Our mistake.** We asked you to choose between "your Excel" and "the value we were given". That was
wrong: **both values are in your workbook**, on two different sheets. So "use the factor given" does
not tell us which one, because both were given by you.

**The question.** For each year, which sheet is correct?

| Year | Sheet `Factores de emisión` (2024) | Sheet `Jerarquía nueva (2025)` |
| --- | --- | --- |
| 2019 | 0.17 | 0.166 |
| 2021 | 0.126378 | 0.126 |
| 2022 | 0.1123708 | 0.112 |
| 2023 | 0.1728 | 0.177 |
| 2024 | 0.217 | 0.21742 |
| **2014** | **0.19** | **0.194** |
| **2015** | **0.2** | **0.194** |

Two things changed since round 1. **The disagreement is at least 7 years, not 5**: 2014 and 2015 also
differ, and we had not spotted them. And **2008 to 2012 exist only on the 2025 sheet**, so if the 2024
sheet is authoritative, the older years cannot come from it at all.

**Worth noting:** these look like different publications rather than typos (0.1728 vs 0.177), so the
answer may be "the 2025 sheet, because it is the newer research" rather than year-by-year. Your
answer to round-1 item 4 said the 2025 per-gas table is authoritative. **If that rule also covers
electricity, just say so and item 2 is closed.**

**Our default.** The **2025 sheet**, because it is your newer internal research and it matches your
item-4 answer. We will not apply this until you confirm, because it changes every Scope 2 total.

**Related, and low priority now:** you asked us to load 2008 to 2018 and 2020. If nobody can report
a year before 2025, those factors can never be used. We are happy to load them as reference, but we
suggest it waits until after item 1.

---

## 3. Which categories are fuels? (re-asking round-1 item 1)

**Your answer.** "The calculations are based on the condition if the item is a fuel or not. Biogenic
is a Boolean column and it does not affect the calculations." Understood, and we will follow it.

**The problem.** **Your factor library does not say which items are fuels.** There is no
"is a fuel" column. So we know the rule, but the tool has no way to apply it. Right now our code
guesses that fuels means *Fuentes Fijas* and *Fuentes Móviles*, which is a developer's guess, not
your instruction.

**Why it matters, concretely.** Applying your rule with our guess would change **222 rows of
Emisiones Fugitivas** and **55 rows of Residuos** from 29.8 to 27. That may be exactly right, since
a refrigerant leak is not a fuel. But we are not willing to reclassify 277 rows of your library on
a guess.

**The question.** Of the categories below, which ones are **combustibles** (29.8), and which are not
(27)? Just mark each one.

| Category | Rows with a methane factor |
| --- | --- |
| Fuentes Fijas | 58 |
| Fuentes Móviles | 27 |
| Emisiones Fugitivas | 222 |
| Emisiones por Uso de suelo | 4 |
| Procesos industriales | 7 |
| C4: Transporte y distribución (aguas arriba) | 7 |
| C5: Residuos generados en operaciones | 55 |
| C6: Viajes de negocios | 3 |
| C7: Desplazamiento de colaboradores | 6 |
| C9: Transporte y distribución (aguas abajo) | 7 |

**One harder question inside this one.** Is "combustible" a property of the **category** or of the
**element**? A business trip *(C6)* burns fuel, but the element is "Carro particular", measured in
km, not a fuel. If the answer is element-level, we will need a fuel column in the library rather
than a category rule.

**Our default.** None. We will keep the current behaviour and change nothing until you mark the
list, because changing it on a guess is worse than waiting.

---

## 4. Meta: mostly answered on 18 July. One small thing left.

You confirmed: **a percentage, on the general total, not per scope.** With your earlier rules (no
meta in the first year, expressed as a percentage) the Meta is now fully defined for us to build:
**one percentage goal for the whole company, measured against the first reported year.**

**(a) Total or per scope?** RESOLVED: total. _"a general total goal, not per scope."_

**(b) A percentage of what?** We are proceeding on **the first reported year, fixed** (so 2027's goal
is still measured against 2025, not 2026), because you said the meta is "established regarding this
first year". Tell us if you meant the previous year instead.

**(c) One meta per company, or one per Sede?** We read "general total goal" as **one goal for the
whole company** and are building that. This is the only piece we want to confirm before we make the
change, because it is a **one-way change** at our end and awkward to reverse. If instead you want a
goal per Sede, say so now and it is a smaller change.

**What we are doing.** Building a company-wide percentage goal against the first-year baseline. The
only reply we need is a yes/no on (c): **one goal per company (our assumption), or one per Sede?**

---

## 5. Uncertainty: a list, or a combined number?

**Your answer.** Uncertainty goes in the PDF report as a summary table, not on the dashboard.
Agreed.

**The question.** What does the table contain?

- **(a) A list**, one row per element, showing that element's ± % as stored in your library. No new
  maths. We can build this now.
- **(b) A combined number**, e.g. "Alcance 1 total: 1,234 t CO2e ± 4%". This needs a method for
  combining uncertainties, which your workbook does not contain, so we cannot copy it from you and
  we will not invent one.

**Two things you should know before answering.** Uncertainty is only filled in for about **40% of
Scope 1** and **15% of Scope 3** rows, so a table will have many blanks. And **electricity has no
uncertainty value at all** in your library. Is Scope 2 simply absent from the table?

**Our default.** **(a), the list**, with blanks shown honestly as "no disponible".

---

## 6. Purchases: please check the units, not just the values

**Round-1 item 7 is still open** and you said you would check. One extra piece of evidence to help,
because it points at a specific cause rather than a general doubt.

Cement is about **3,924 kg CO2e per USD**. Your exchange rate is about **3,743 COP per USD**. Those
two numbers being nearly the same is unlikely to be a coincidence. Our suspicion is that these
factors are **per COP, but labelled per USD**. If that is true, the values are not implausible at
all, only mislabelled, and the fix is a label rather than new research.

**Please confirm the units before we build the currency conversion.** If we apply an exchange rate on
top of factors that already have a currency error, the totals become wrong in a way that looks
believable, which is the worst outcome.

The exchange rate itself is now fully decided, thank you: **per year, using each year's average
rate.** That part is ready. We are still holding the actual build until you confirm the units above,
because the rate is only safe once we know the factors underneath it are labelled correctly. This is
the one place where doing it in the wrong order hides the mistake instead of showing it.

---

## 7. User information: answered on 18 July. Here is what we are building.

You confirmed the fields: **name, phone, email, and position** _(cargo)_. You also answered the
question we raised about person vs role: we collect **both**, the person's name and their position,
because a position outlives the person who holds it. Good.

**What we are building, so it matches your goal exactly.** You said the person must "specify who they
are each time the exercise is done". The strongest way to do that is **a real account per person**,
not a name they type in (a typed name can be wrong, or skipped, and cannot be trusted for an audit).
So each authorized person gets their own login carrying those four fields, and then, on **every value
entered or changed**, the tool records **who did it, when, and what it was before**. That is a true
"who did what" history, and it cannot be faked.

**Two things you should know.**

1. **This only works forward.** Every number entered **before** we ship this is not attributable and
   never can be. The history starts the day it goes live, so the sooner it ships, the less data is
   left unattributed. This is a reason not to wait.
2. **A fix that comes with it.** Today, if a second employee of an existing company registers by
   themselves, the tool wrongly creates a **duplicate company**. So for now, **CECODES creates the
   colleague's account** (the safe path that works today), and we block the broken self-registration.
   If you would rather colleagues register themselves and request to join, tell us and we will build
   that instead; it is more work but a better experience.

---

## 0. The workbook, still

You said you would check for a previous exercise. Thank you, please do.

To be precise about what we need, so the search is not wasted: **activity data as entered, and the
totals produced from it, for one company, one year.** A report showing only totals cannot be used,
because we cannot reproduce a total without knowing what went into it. If the previous exercise has
both halves, it works, even if it is old and even if the format is different.

Everything else in this document has a safe default. This one does not. Requirements §14.1 makes
reproducing your totals the acceptance test, and we still have nothing to test against.

---

## What we are doing while we wait

- Adding name and phone, and recording who enters each number *(pending item 7)*.
- Fixing the duplicate-company bug so colleagues can share a company.
- Building the PDF report, so uncertainty has somewhere to go once item 5 is answered.
- Recording your answers in the requirements document so nothing is lost.
- Blocking years before 2025 is **written and ready**, waiting only on the factor in item 1.

**Most urgent from you: item 1 (the 2025 electricity factor), then item 3 (the fuel list), then
item 0 (the workbook).**
