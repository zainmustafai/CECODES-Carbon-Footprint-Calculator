# Putting the Tool Online: The Plan, the Options, and the Costs

**To:** CECODES
**Date:** 28 July 2026
**Re:** How the Huella de Carbono tool goes live for your member companies
**Nota:** la versión completa en español acompaña este documento ("Plan de puesta en línea").

---

## Resumen en español (30 segundos)

La herramienta está terminada y probada. Ahora hay que ponerla en internet para que las empresas la usen. Hay 3 formas de hacerlo; recomendamos la **Opción B (Profesional)**: cuesta aproximadamente **US$45 al mes** (unos $180.000 pesos; hasta US$65 si el servicio de hosting exige un puesto adicional para nuestro acceso técnico, lo confirmamos antes de que paguen nada). Incluye copias de seguridad automáticas todos los días, soporte de los proveedores, y cero riesgo de que la herramienta se apague sola. La dirección sería **huella.cecodes.org.co**, usando el dominio que CECODES ya tiene, sin costo extra. Las cuentas y los pagos quedan a nombre de CECODES: la herramienta y los datos son suyos.

Para empezar necesitamos 4 cosas de ustedes: (1) las dos respuestas del documento anterior (urea y meta), (2) aprobar la Opción B con una tarjeta lista, (3) confirmar la dirección web, y (4) elegir la empresa piloto. Todo lo demás lo hacemos nosotros. Del "sí" al piloto terminado: **unos 10 días** (2 a 3 días de preparación y una semana de piloto).

Si están de acuerdo, respondan con este modelo: **"Opción B, adelante, con huella.cecodes.org.co y [nombre de la empresa piloto]"**. Si prefieren otra opción o tienen dudas, díganlo en español sin problema.

---

## Where we are today

The tool is **finished and tested**. It calculates exactly like your Excel (we proved it against the example inside the file you sent), companies can enter their data, see their dashboard, and download reports. Two small decisions from our previous document (the urea factor and the Meta) are still waiting for your answer; we apply them before the pilot starts, so answering both together with this one closes everything.

Right now the tool only runs on our computers, where we built it; it is not on the internet yet. For your member companies to use it, it has to go **online**: available 24 hours a day, at a proper web address, with the data stored safely. This document explains the ways to do that, what each one costs, and which one we recommend.

---

## What "online" means: four pieces

1. **Hosting:** the computers that run the tool 24/7. The office where the tool works.
2. **Database:** where every number the companies enter is stored, with locks and daily copies. The filing cabinet.
3. **Web address:** what people type to open the tool. The street address.
4. **System emails:** the tool sends small automatic emails (for example, the link to reset a forgotten password). At your volume this is included at no extra cost; later, if you want those emails to come from an @cecodes.org.co address, that is a small extra configuration.

The tool is already built to run on two well-known professional services, used by thousands of organizations worldwide. What we must decide together is **which service level to pay for**, because that determines reliability, backups, and cost.

---

## The three options

### Option A: Free plans. Cost US$0. NOT recommended for the launch.

Both services have free plans. Tempting, but they are made for hobby projects, not for a real tool used by real companies:

- The free database **pauses itself** after a few days without visits. The first company to log in on a Monday could find the tool "off".
- **No daily backups.** If something goes wrong, there is no copy from yesterday to restore.
- The free hosting plan's rules **only allow personal projects**, not an organization's tool.
- No support: if something breaks, nobody to call.

Free was fine during development, where those limits do not matter. The launch, with real company data, deserves better.

### Option B: Professional plans. About US$45 per month. RECOMMENDED.

The same two services, on their professional level:

- The tool is on **24 hours a day, every day**. Nothing pauses.
- **Automatic backup copies of all the data, every day, keeping the last 7 days.** On top of that, we deliver a monthly copy of the data to CECODES, so you always hold your own copy too.
- Allowed for real organizational use, with **support from the providers**.
- Room to grow: capacity for far more companies and years of data than you will need for a long time.

The cost:

- Hosting (the service is called Vercel): **US$20 per month**
- Database (the service is called Supabase): **US$25 per month**
- Web address: **US$0**, using the domain CECODES already owns (explained below)
- **Total: about US$45 per month** (roughly $180.000 pesos). One honest caveat: the hosting service charges per person with access, so if it turns out our technical access needs its own seat, the total would be about US$65. We confirm the exact figure on day 1, **before you pay anything**.
- Per year: roughly **US$540 to US$780** (about $2,2 to $3,1 millones de pesos), useful if you need to present it against an annual budget.

### Option C: Renting a private server. Similar or higher real cost. NOT recommended.

It is possible to rent a raw server and install everything by hand. On paper it can look slightly cheaper, but somebody must then maintain that server forever: security updates, restarts, disk space, renewals. That permanent work quickly costs more than Option B, and when it fails at night there is no provider support, only whoever maintains it. Backups and monitoring do not exist unless somebody builds and watches them.

---

## Our recommendation: Option B

One sentence: **pay about US$45 per month and the tool runs professionally, with daily backups, without babysitting.**

1. **It matches how the tool was built.** The tool was designed from day one for these two services, so going live on them is a step, not a project.
2. **The data is treated seriously.** Automatic daily backups plus your own monthly copy, encrypted connections, and each company can only ever see its own data (we test this automatically on every change to the tool).
3. **It is the cheapest option that is actually safe.** Option A risks the tool being off or losing data. Option C hides its real cost in permanent maintenance work.

### About maintenance (so the costs are complete)

The amounts above are what the **providers** charge. Our own work is separate and works like this: everything needed to go live (the setup, the pilot, the accompaniment of the first weeks, and any correction to what we built) is part of this delivery, at no extra cost. New features or ongoing support beyond that are agreed between CECODES and us separately, as always.

---

## The web address

We recommend using the domain CECODES already owns, adding "huella." in front:

> **huella.cecodes.org.co**

- **Cost: nothing extra.** You already own cecodes.org.co; this is a small configuration, not a purchase.
- **Trust.** When you invite a member company, they see a CECODES address, not a strange one. For a tool that asks companies for their data, this matters.
- If you prefer a brand-new address (for example huelladecarbono.co), that is also possible for roughly US$25 to US$30 per year; just tell us the name you want.

Whoever manages the CECODES website can make the small one-time change in minutes with the instructions we send.

---

## The go-live plan, step by step

1. **You answer the two pending questions** from our previous document (urea and Meta), and we apply them. *(You. Same reply as this one, ideally.)*
2. **CECODES approves Option B and creates the two accounts** with a payment card. We send exact instructions with screenshots and stay on the phone with you if needed. *(You, with our guidance. 1 day.)*
3. **We connect everything:** the tool, the database, and the address, switched to its final, real mode. *(Us. 1 to 2 days.)*
4. **We create your CECODES administrator accounts** and load the official factor library, which is already prepared. *(Us. Same day.)*
5. **Pilot:** one real member company enters its real data, start to finish, and we review the results together. The pilot runs on the final, real system, so nothing is entered twice: if the pilot goes well, its data simply stays. If for any reason it is abandoned, we delete that company's data on request. *(You + one company + us. About 1 week.)*
6. **Go live:** you invite the rest of the companies. We stay attentive during the first weeks. *(You + us.)*

**Total, from your "yes" to a finished pilot: about 10 days** (2 to 3 days of preparation, then the week of the pilot). The two things that can stretch it, so they do not surprise anyone: how fast the payment card is available, and how fast whoever manages your domain applies the small configuration.

### Who owns what (important and simple)

- The two paid accounts are **owned by CECODES**, with the payment under CECODES's name. It is your tool and your data; nothing depends on us to exist.
- We keep **technical access** to those accounts to maintain and update the tool.
- The web address stays under the CECODES domain, which you already control.
- The tool's **code** lives in a private repository; as part of the handover, a copy can be placed under a CECODES-owned account whenever you ask.

---

## The 4 things we need from you to start

1. **The two answers from the previous document:** urea ("1 fix" or "1 keep") and Meta ("2 company" or "2 sede").
2. **Approve Option B** (about US$45/month) and have a payment card ready for the two accounts. We guide the account creation step by step.
3. **The address:** confirm "huella.cecodes.org.co" (or tell us the name you prefer), and tell us who manages the CECODES domain so we can send them the small configuration.
4. **The pilot company:** choose one member company and the person there who will enter its data. Cultivos Casablanca would be a natural choice, since we already know their data.

A model reply that covers everything at once:

> **"1 corregir, 2 empresa. Opción B, adelante, con huella.cecodes.org.co y [nombre de la empresa piloto]."**

---

## Common questions, answered before you ask

**Is the data safe?**
Yes. Connections are encrypted (the padlock in the browser), the database makes an automatic copy every day (keeping the last 7 days), CECODES receives its own monthly copy, and each company can only see its own information. Every number also keeps a history of who entered or changed it, which you asked for and we built.

**What if we stop paying one month?**
The providers warn first, then suspend until payment resumes; they keep the data for a period before deleting anything. And whatever happens, the monthly copy delivered to CECODES is yours: nothing depends on us or on them.

**Can the cost surprise us later?**
Two honest notes. First, the charge is in US dollars, so the peso amount moves with the exchange rate, and your bank may add IVA (19%) or a small international-payment fee; budget with some margin, because what does not change is the dollar price. Second, if usage ever grows enough to cost more (several hundred active companies), that would be visible months in advance, and it would be good news.

**Can we start free and upgrade later?**
Technically yes, but we advise against launching to real companies on free plans: the self-pausing database and the missing backups are real risks with real company data.

**Who do the companies contact if they have trouble using the tool?**
CECODES is the first door (you know your companies), and we are behind you for anything technical. The tool also includes a step-by-step user guide.

---

*Si algún punto es más fácil de discutir en español, con gusto. La versión completa en español acompaña este documento.*
