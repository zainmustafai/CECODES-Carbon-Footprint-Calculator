# CECODES Design System

The visual language for the CECODES carbon footprint app. It is a calm, data first
product for Colombian companies. One green brand accent, generous whitespace, clear
hierarchy, and honest empty states. This file is the source of truth. Build UI from
tokens, not ad hoc values.

## Principles

1. **Green is the only accent.** All emphasis (primary buttons, active nav, focus rings,
   key figures, charts) flows through the green `--primary` scale. Everything else is
   neutral. No competing accent colors.
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
| `primary` / `primary-foreground` | Brand green. Primary actions, active states, brand panel |
| `secondary` | Soft green tint fill for secondary controls |
| `muted` / `muted-foreground` | Subtle fills and secondary text |
| `accent` / `accent-foreground` | Hover and highlight tint (light green) |
| `border` / `input` / `ring` | Hairlines, field borders, focus ring (green) |
| `destructive` | Errors and destructive actions (red) |
| `sidebar*` | The app shell navigation surface |
| `chart-1..5` | Category palette (see below) |

**Brand green** is roughly a mid forest green (`oklch(0.5 0.12 157)` in light). It reads well
with white text and as a large brand panel. Do not introduce other greens outside the token
scale.

## Chart and scope palette

Use `chart-1..5` for all data visualization, and keep the scope mapping consistent everywhere:

| Series | Token | Meaning |
|---|---|---|
| `chart-1` | Green | **Alcance 1** (direct) |
| `chart-2` | Amber | **Alcance 2** (electricity) |
| `chart-3` | Blue | **Alcance 3** (other indirect) |
| `chart-4` | Teal | Extra category |
| `chart-5` | Slate | Extra category / neutral |

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
| Actions | `Button` (default = green primary, `outline`, `ghost`, `secondary`) |
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
error toast. See the async-feedback table in IMPLEMENTATION.md section 4.

## Layout patterns

- **Auth (login, register, reset):** full height split. Left is the green brand panel
  (logo, eyebrow, headline, scope pills) hidden below `lg`. Right is the form, centered and
  sized by responsive padding, not a fixed `max-w`.
- **App shell:** the shadcn `sidebar` block, `variant="inset" collapsible="icon"`, plus a
  top bar (sidebar trigger, breadcrumbs, language toggle, avatar menu). Content is
  `p-6 lg:p-8`. Below `lg` the sidebar becomes a `Sheet`; at or above it collapses to an
  icon rail. The sidebar is a **deep forest green** surface, darker than the `--primary`
  button green, driven entirely by the `--sidebar*` tokens: no component hardcodes a color.
  - The active nav item is `bg-sidebar-accent` with a near white label (about 7:1) plus a
    bright green inset bar and icon. Never put 14px text on a bright green fill: it lands
    near 3.2:1 and fails AA.
  - Nav is one sidebar with role filtered groups, not one sidebar per role. An admin drilled
    into a company gets that company's workspace under a `SidebarMenuSub`.
- **Data entry:** a sticky context bar (Sede, Año, save status), scope tabs, and collapsible
  category sections. Values autosave on blur, batched; there is no Guardar button. The unit
  is always visible beside the value. The Scope 2 month grid is 1 column on a phone, 3 at
  `md`, 4 at `lg`, with the estimated-emissions summary in an 18rem rail beside it. Twelve
  across one line loses on every viewport.
- **Estimated emissions:** every source shows what it currently adds up to, live. A Scope 2
  source gets the full summary card in its rail; an annual Scope 1 or 3 source gets a single
  compact line, because one value does not deserve a card. When a factor is missing the
  summary says so. It never renders `0.0 t CO2e` for a source that simply has no factor.
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

- Maintain AA contrast. Green primary carries white text; do not put green text on green.
- Every interactive element is keyboard reachable with a visible focus ring (`ring-ring`).
- Icons that convey state have an `aria-label`. Inputs are tied to their label and error id.

## Do and do not

- Do build from tokens, compose shadcn primitives, and keep one accent.
- Do give every surface an empty, loading, and error state.
- Do not hardcode colors, add a second accent, cap width with `max-w`, nest cards in cards,
  use heavy gradients on content, or use em dashes.
