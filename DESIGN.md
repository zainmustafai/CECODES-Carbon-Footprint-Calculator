# CECODES Design System

The visual language for the CECODES carbon footprint app. It is a calm, data first
product for Colombian companies. A navy brand primary with a supporting green accent,
generous whitespace, clear hierarchy, and honest empty states. This file is the source of
truth. Build UI from tokens, not ad hoc values.

## Principles

1. **Navy is the primary accent, green is the supporting one.** Primary buttons, links,
   focus rings, and the sidebar chrome flow through the navy `--primary` scale. The
   client's green is `--secondary`: soft tint fills, the sidebar's active-state accent bar,
   and the Alcance 1 chart series. Everything else stays neutral; the remaining client
   colors (orange, light blue, violet, gray) are chart series only, never general UI accents.
2. **Data first, quiet chrome.** Surfaces are white or very light. Chrome (borders,
   labels) is low contrast so numbers and charts read first.
3. **Tokens, not hex.** Use `bg-primary`, `text-muted-foreground`, `border-border`,
   `bg-card`, `ring-ring`. Never hardcode colors.
4. **One density per surface.** Comfortable by default: `p-6`, `gap-6`, `text-sm` body.
5. **Every screen has a real empty, loading, and error state.** No blank pages, no fake
   numbers presented as real.
6. **Theme aware.** Everything works in light and dark via the token layer.
7. **No em dashes anywhere.** Use periods, commas, colons, or hyphens.

## Color tokens

Defined in `src/app/globals.css` as OKLCH, mapped to Tailwind via `@theme inline`.

| Token | Role |
|---|---|
| `background` / `foreground` | Page background and default text |
| `card` / `card-foreground` | Card and panel surfaces |
| `primary` / `primary-foreground` | Brand navy. Primary actions, links, focus rings, sidebar chrome |
| `secondary` | Brand green: soft tint fill for secondary controls, sidebar active accent |
| `muted` / `muted-foreground` | Subtle fills and secondary text |
| `accent` / `accent-foreground` | Hover and highlight tint (light green, same family as secondary) |
| `border` / `input` / `ring` | Hairlines, field borders, focus ring (navy) |
| `destructive` | Errors and destructive actions (red) |
| `sidebar*` | The app shell navigation surface |
| `chart-1..5` | Category palette (see below) |

**Brand navy** is the client's literal Primary (`oklch(0.272 0.12 261.3)` in light, lifted to
`oklch(0.62 0.1 261.3)` in dark so it stays visible against a dark card instead of reading as
near-black). It reads well with white text and as a large brand panel. **Brand green** (the
client's Secondary, `oklch(0.6 0.129 159.3)`) is reserved for secondary surfaces, the
sidebar's active accent, and Alcance 1. Do not introduce other blues or greens outside the
token scale.

## Chart and scope palette

Use `chart-1..5` for all data visualization, and keep the scope mapping consistent everywhere:

| Series | Token | Meaning |
|---|---|---|
| `chart-1` | Green | **Alcance 1** (direct) |
| `chart-2` | Orange | **Alcance 2** (electricity) |
| `chart-3` | Blue | **Alcance 3** (other indirect) |
| `chart-4` | Violet | Extra category |
| `chart-5` | Gray | Extra category / neutral |

Totals and "good" figures use green. Reference lines and gridlines use `border`. All footprint
figures are shown in tonnes (t CO2e).

## Typography

- Sans: **Inter** for all interface text (`font-sans`). Mono: Geist Mono for numbers, ids,
  and code where a tabular feel helps.
- Scale: page title `text-2xl font-semibold`, section title `text-base font-semibold` or a
  `text-sm font-medium text-muted-foreground` eyebrow, body `text-sm`, meta `text-xs`.
- KPI figures: `text-2xl` to `text-3xl font-semibold`, with a `text-xs text-muted-foreground`
  label above.
- Eyebrows are `text-xs font-medium uppercase tracking-widest text-muted-foreground`.

## Spacing, radius, elevation

- Radius: base `--radius: 0.625rem`. Use `rounded-lg` for cards and inputs, `rounded-md`
  for small controls, `rounded-full` for pills and avatars.
- Spacing: page padding `p-6` (mobile) to `lg:p-8`. Card padding from the shadcn Card.
  Vertical rhythm `space-y-6` between sections, `space-y-4` within a form.
- Elevation: prefer `border` over shadow. Cards are `border bg-card`. Use shadow only for
  overlays (dialogs, dropdowns, sheets). No glassmorphism, no big gradients on content.

## Components (shadcn/ui, Base UI primitives)

Reach for the primitive, do not rebuild it:

| Need | Use |
|---|---|
| Actions | `Button` (default = navy primary, `outline`, `ghost`, `secondary`) |
| Content grouping | `Card` (+ `CardHeader` / `CardTitle` / `CardContent` / `CardFooter`) |
| Forms | `TextField` / `PasswordField` (in `src/components/form`) wrapping shadcn `Input` + `Label`, wired with React Hook Form + Zod |
| Status | `Badge` (`secondary` for neutral, `outline` for "coming soon") |
| Dense data | `Table` |
| Row actions / menus | `DropdownMenu` |
| Destructive confirm | `ConfirmActionDialog` (an `AlertDialog` that stays open, with a spinner, until the action settles) |
| Mobile nav | `Sheet` |
| Identity | `Avatar` with initials fallback |
| Toasts | `sonner` |

**Form fields** always show their label, use a leading icon where it clarifies (mail for
email, lock for password), show the unit when relevant, and render errors as
`text-sm text-destructive` below the field.

**Every field uses the control its data deserves.** A sector is a `SelectField`, not free
text. A year is `type="number"`. An email is `type="email"`. A quantity or an emission factor
is a `DecimalField`: `type="text"` with `inputMode="decimal"`, never `type="number"`, because
es-CO types a decimal comma and a number input round-trips through a float.

**Nothing ever feels stuck.** Every button that triggers work takes `loading`, which shows a
spinner and sets `aria-busy`. Row actions show a loading toast that becomes the success or
error toast. A thin navy progress bar (`--primary`) crosses the top of the viewport the
instant any navigation starts and completes when the destination commits, so even a slow
route load has immediate feedback. See the async-feedback table in IMPLEMENTATION.md section 4.

## Layout patterns

- **Auth (login, register, reset):** full height split. Left is the navy brand panel
  (logo, eyebrow, headline, scope pills) hidden below `lg`. Right is the form, centered and
  sized by responsive padding, not a fixed `max-w`.
- **App shell:** the shadcn `sidebar` block, `variant="inset" collapsible="icon"`, plus a
  top bar (sidebar trigger, breadcrumbs, language toggle, avatar menu). Content is
  `p-6 lg:p-8`. Below `lg` the sidebar becomes a `Sheet`; at or above it collapses to an
  icon rail. The sidebar is the brand navy at full strength (unlike the old green scheme,
  navy is already dark enough that it needs no separately darkened variant to read as
  chrome), driven entirely by the `--sidebar*` tokens: no component hardcodes a color.
  - The active nav item is `bg-sidebar-accent` with a near white label (about 12:1) plus a
    bright green inset bar and icon (the client's Secondary, carried only here and at
    Alcance 1). Never put 14px text on that green fill: it is well under AA there.
  - Nav is one sidebar with role filtered groups, not one sidebar per role. An admin drilled
    into a company gets that company's workspace under a `SidebarMenuSub`.
- **Data entry:** a sticky context bar (Sede, Año, save status), scope tabs, then a scope
  toolbar and the category list. Values autosave on blur, batched; there is no Guardar button.
  The unit is always visible beside the value. The Scope 2 month grid is 1 column on a phone,
  3 at `md`, 4 at `lg`, with the estimated-emissions summary in an 18rem rail beside it. Twelve
  across one line loses on every viewport.
  - **A category earns its space.** One holding sources is a collapsible card you work inside.
    An empty one is a single line: name, `¿Aplica?`, `Agregar fuente`. Most of the taxonomy is
    empty for any given company, and rendering all of it as cards buried the few that matter.
    `¿Aplica?` stays reachable on that line: "no aplica" is reportable data, not UI state.
  - **The scope toolbar** carries the quiet chrome: the number-format hint, stated once per
    panel and never once per category, plus the Meta as a single row. It has to live inside the
    `TabsContent`: every field points at that hint through `aria-describedby`, and the inactive
    panels are unmounted.
- **Estimated emissions:** every source shows what it currently adds up to, live, and the
  number stays on the row, because it is the answer the user came for. What produced it (Factor
  aplicado, Conjunto GWP, Fuente del factor, and the "estimación referencial" note) sits behind
  a disclosure on that number. A Scope 2 source keeps the full summary card in its rail, where
  twelve inputs earn it; an annual Scope 1 or 3 source is a single line, because one value does
  not deserve a card. Three labelled facts strung across the row buried the input.
  - Use a **Popover, not a Tooltip**, for anything the user must be able to read. A Tooltip here
    only ever explains why a control is in the state it is in, and it cannot be reached by
    keyboard on a disabled control, so a disabled control also states its reason in `sr-only`
    text wired through `aria-describedby`.
  - When a factor is missing the summary says so. It never renders `0.0 t CO2e` for a source
    that simply has no factor, and it never repeats the panel's warning under every source.
- **Width:** do not cap content with arbitrary `max-w-*` that leaves dead space. Fill the
  space with grids and responsive padding. Multi column on `md+`, stacked on mobile.
- **Dashboard:** a KPI row (total plus one card per scope) over a details area (company,
  facilities, trends). Empty states invite the next action.

## Language and voice

- UI language is **Spanish (es-CO)** with an English toggle. Keep the domain terms in
  Spanish (Alcance, Categoria, Planta, Sede, Huella de Carbono).
- Short, direct, verb first. Buttons are actions ("Ingresar", "Crear empresa").
- All copy lives in `src/messages/{es,en}.json`. Never hardcode user facing strings.

## Accessibility

- Maintain AA contrast. Navy primary carries white text; do not put navy text on navy, or
  green text on green.
- Every interactive element is keyboard reachable with a visible focus ring (`ring-ring`).
- Icons that convey state have an `aria-label`. Inputs are tied to their label and error id.

## Do and do not

- Do build from tokens, compose shadcn primitives, and keep one accent.
- Do give every surface an empty, loading, and error state.
- Do not hardcode colors, add a second accent, cap width with `max-w`, nest cards in cards,
  use heavy gradients on content, or use em dashes.
