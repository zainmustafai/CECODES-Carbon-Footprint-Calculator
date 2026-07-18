// Per-scope reduction targets (Meta). CECODES indicated "almost certainly yes" but has not
// formally confirmed the feature (Requirements section 12, item 9). The schema, actions and
// UI are complete; flipping this to false hides the entry card and is the whole revert.
export const FEATURE_SCOPE_TARGETS = true;

// Self-serve onboarding: a signed-in user with no company creating their own company. Disabled
// per CECODES (2026-07-18, Requirements B14): a second employee who self-registers would create
// a DUPLICATE company instead of joining their colleagues', because a self-registered user has no
// signal for WHICH company they belong to. Until a proper "join an existing company" flow exists,
// CECODES provisions every account through the admin (createUser assigns the companyId directly),
// and this path is closed. Flip to true to reopen it, e.g. once a join/invite flow lands.
export const FEATURE_SELF_ONBOARDING = false;
