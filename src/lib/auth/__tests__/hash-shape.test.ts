import { describe, expect, it } from "vitest";
import { genSaltSync, hashSync } from "bcryptjs";
import { classifyHash, costPrefix, type HashClass } from "../hash-shape";

// classifyHash decides every count scripts/audit-password-hashes.ts prints, and that script is
// never run here (it queries a database this suite must not touch), so this is the only place a
// regression in the regex, a dropped character class, an off-by-one in the length, would ever
// surface before a real audit run against production did.

// Real hash fixtures, not hand-typed strings pretending to be one: a typo in a fixture would prove
// something about the typist and nothing about the classifier.
const REAL_2A_HASH = "$2a$06$DCq7YPn5Rq63x1Lad4cll.TV4S6ytwfsfvkgY8jIucDrjc8deX1s."; // OpenBSD vector, also asserted against verifyPassword in password.test.ts
const REAL_2B_HASH = hashSync("a locally produced password", genSaltSync(10)); // bcryptjs's own output when it picks its own salt

describe("classifyHash", () => {
  const cases: Array<[label: string, hash: string | null | undefined, expected: HashClass]> = [
    ["a real GoTrue-era $2a$ hash", REAL_2A_HASH, "well-formed"],
    ["a hash bcryptjs produced itself ($2b$)", REAL_2B_HASH, "well-formed"],
    ["a $2y$ shape, the third prefix bcryptjs's own compare() accepts", `$2y$10$${"a".repeat(53)}`, "well-formed"],
    ["null", null, "missing"],
    ["undefined", undefined, "missing"],
    ["empty string", "", "missing"],
    ["59 characters, one short of a real hash", `$2a$06$${"a".repeat(52)}`, "malformed"],
    ["61 characters, one long", `$2a$06$${"a".repeat(53)}a`, "malformed"],
    ["60 characters, not bcrypt at all", "x".repeat(60), "malformed"],
    ["60 characters, a version bcrypt does not implement", `$2x$12$${"a".repeat(53)}`, "malformed"],
    ["60 characters, nothing but separators", "$".repeat(60), "malformed"],
    ["an argon2 hash, a different scheme entirely", "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaGhhc2g", "malformed"],
  ];

  it.each(cases)("classifies %s as %s", (_label, hash, expected) => {
    expect(classifyHash(hash)).toBe(expected);
  });

  // Documented rather than silently patched around: WELL_FORMED checks that the cost field is
  // two digits, not that the value is a legal bcrypt cost (4-31). Neither this app's hashPassword
  // nor GoTrue ever wrote a cost of 99, so this is a real but narrow gap in the regex, not
  // something this test should paper over by asserting a stricter result than the code delivers.
  it("classifies a cost outside bcrypt's legal range as well-formed, a known gap in the regex", () => {
    expect(classifyHash(`$2b$99$${"a".repeat(53)}`)).toBe("well-formed");
  });
});

describe("costPrefix", () => {
  it("returns exactly the algorithm and cost, 7 characters, never more", () => {
    expect(costPrefix(REAL_2A_HASH)).toBe("$2a$06$");
    expect(costPrefix(REAL_2A_HASH)).toHaveLength(7);

    expect(costPrefix(REAL_2B_HASH)).toHaveLength(7);
    expect(costPrefix(REAL_2B_HASH).startsWith("$2b$")).toBe(true);
  });
});
