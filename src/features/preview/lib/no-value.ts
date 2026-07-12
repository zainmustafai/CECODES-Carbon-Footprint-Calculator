// The placeholder for a cell with nothing in it: a month that was never reported, or a source
// that could not be priced. A plain hyphen, deliberately: AGENTS.md bans the em dash outright,
// and this is not translatable text, so it does not belong in src/messages.
//
// It must never be a zero. "0" means "reported, and the value was zero"; NO_VALUE means "we do
// not have a number here", and conflating the two is the class of bug this tool exists to
// replace.
export const NO_VALUE = "-";
