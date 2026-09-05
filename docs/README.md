# CECODES · Documentation

Everything written down about the CECODES carbon-footprint tool. Start with the row that matches
what you are trying to do.

> Code-level guidance is not here. It lives at the repository root: [AGENTS.md](../AGENTS.md) (the
> rules, the security model and the traps), [IMPLEMENTATION.md](../IMPLEMENTATION.md) (how the
> system is built), [DESIGN.md](../DESIGN.md) (UI tokens and patterns) and
> [UNDERSTANDING.md](../UNDERSTANDING.md) (a plain-language overview).

## If you are the client, or a new user

| Document | What it is |
|---|---|
| [CLIENT-HANDOFF.md](./CLIENT-HANDOFF.md) | **Start here.** The complete manual: what the platform does, every screen, and how to use it. No technical background assumed. |
| [USER_GUIDE.md](./USER_GUIDE.md) · [USER_GUIDE.es.md](./USER_GUIDE.es.md) | The user guide, in English and Spanish. |
| [CECODES Carbon Footprint Tool - Requirements.md](./CECODES%20Carbon%20Footprint%20Tool%20-%20Requirements.md) | **v1.1** - the agreed, plain-language product requirements. Client-facing and technology-agnostic. Open decisions are in **Section 12**. |
| [CECODES Carbon Footprint Tool - Weekly Plan.md](./CECODES%20Carbon%20Footprint%20Tool%20-%20Weekly%20Plan.md) | Week-by-week delivery plan with check-in milestones. Client-facing. |

## If you are deploying or operating it

| Document | What it is |
|---|---|
| [DEPLOYMENT_PLAN.md](./DEPLOYMENT_PLAN.md) · [DEPLOYMENT_PLAN.es.md](./DEPLOYMENT_PLAN.es.md) | How the application goes to production, in English and Spanish. |
| [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) | Self-hosting with Docker Compose. `docker compose up -d` from a clean checkout, with no configuration, is a supported and tested path. |
| [SEED_RUNBOOK.md](./SEED_RUNBOOK.md) | Seeding the shared database safely: the factor library, corrections, and the single admin. |
| [DATA-MIGRATION.md](./DATA-MIGRATION.md) | The runbook for moving the data off Supabase-hosted Postgres onto any other Postgres. Nothing in the app is Supabase-specific; this is the procedure for the day someone decides to leave. |
| [Credentials.md](./Credentials.md) | **Not tracked in git** (see `.gitignore`). Local-only sign-in credentials for the shared database. |

## If you are picking up the code

| Document | What it is |
|---|---|
| [CECODES - Tech Stack Decision.md](./CECODES%20-%20Tech%20Stack%20Decision.md) | Internal ADR: the locked stack and why. **Read the isolation warning in it before writing any query that touches tenant data.** |
| [auth/](./auth) | The self-hosted authentication design and its use cases. |
| [superpowers/](./superpowers) | Specs and implementation plans, by date. The written record of how each feature was designed before it was built. |

## Record of decisions and defects

These are historical. They are cited from live code and docs, so they are kept rather than tidied
away, and they should be read as "what was true when it was written".

| Document | What it is |
|---|---|
| [CLIENT_DECISION_MEMO.md](./CLIENT_DECISION_MEMO.md) · [ROUND2](./CLIENT_DECISION_MEMO_ROUND2.md) · [ROUND3](./CLIENT_DECISION_MEMO_ROUND3.md) | Three rounds of questions put to the client, and the answers that settled them. |
| [COMPLETION_PLAN.md](./COMPLETION_PLAN.md) · [COMPLETION_PLAN_V2.md](./COMPLETION_PLAN_V2.md) | The audited defect lists and the plans that closed them. Cited by `IMPLEMENTATION.md`, `SEED_RUNBOOK.md` and `e2e/cross-tenant.spec.ts`. |
| [COMPLETION_PROMPT.md](./COMPLETION_PROMPT.md) · [COMPLETION_PROMPT_V2.md](./COMPLETION_PROMPT_V2.md) | The briefs those plans were written from. Cited by `playwright.config.ts`. |

## Source material

| Path | What it is |
|---|---|
| [reference/](./reference) | The source-of-truth Excel workbook (the emission factors, and the acceptance test for the calculation engine), the client's PDF comments, and superseded copies of both. |
| [sample-data/](./sample-data) | Example inputs used while building and demonstrating the tool. |
| [images/](./images) · [UI/](./UI) | Screenshots and interface reference. |
| [client-comments/](./client-comments) | Raw client feedback as received. |

> The client-facing documents deliberately avoid technology choices. Technical decisions live only
> in the ADR.
