import { describe, expect, it } from "vitest";
import { genSaltSync, getRounds, hashSync } from "bcryptjs";
import {
  BCRYPT_COST,
  PASSWORD_ALGO,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../password";

// Real bcrypt throughout, no mock of it anywhere. A stubbed compare would pass every test in this
// file while the deployed sign-in accepted the wrong password, and the two properties that matter
// most here - that a migrated Supabase hash still verifies, and that a missing hash never does -
// are properties of the actual algorithm rather than of the code around it.

const PASSWORD = "una contrasena de prueba";

/**
 * A genuine $2a$ hash, the shape GoTrue left behind in the migrated rows.
 *
 * bcryptjs writes $2b$ when it picks its own salt, so the version is forced by handing it a $2a$
 * salt. The cost is kept low deliberately: what is under test is the version prefix, not the work
 * factor, and the suite should not pay for a second one.
 */
function supabaseEraHash(plain: string): string {
  const salt = `$2a$${genSaltSync(6).slice(4)}`;
  return hashSync(plain, salt);
}

describe("hashPassword", () => {
  it("produces a hash the same password verifies against", async () => {
    const { hash, algo } = await hashPassword(PASSWORD);

    expect(algo).toBe(PASSWORD_ALGO);
    expect(await verifyPassword(PASSWORD, hash, algo)).toBe(true);
  });

  it("hashes at the cost this file chose, and at the width the column was sized for", async () => {
    const { hash } = await hashPassword(PASSWORD);

    expect(getRounds(hash)).toBe(BCRYPT_COST);
    expect(hash).toHaveLength(60);
  });

  // Two users who pick the same password must not end up with the same row: matching hashes would
  // tell anyone reading a stolen table which accounts to attack once, rather than one at a time.
  it("salts, so the same password hashes differently every time", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first.hash).not.toBe(second.hash);
    expect(await verifyPassword(PASSWORD, first.hash)).toBe(true);
    expect(await verifyPassword(PASSWORD, second.hash)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("rejects the wrong password", async () => {
    const { hash } = await hashPassword(PASSWORD);

    expect(await verifyPassword("otra contrasena", hash)).toBe(false);
  });

  // The whole point of storing the algorithm: a hash made by something this file does not
  // implement is refused, not handed to bcrypt on the assumption that it is one.
  it("refuses an algorithm it does not implement, even when the hash itself matches", async () => {
    const { hash } = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, hash, "argon2id")).toBe(false);
    expect(await verifyPassword(PASSWORD, hash, "scrypt")).toBe(false);
  });

  // Null is absence, not a competing algorithm: rows predating the column carry no label and their
  // hashes are bcrypt, so omitting the argument has to keep working.
  it("treats a missing algorithm label as bcrypt", async () => {
    const { hash } = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(PASSWORD, hash, null)).toBe(true);
  });

  describe("an account with no usable hash", () => {
    // The single most dangerous bug this file could carry. A row with no hash is an account that
    // cannot sign in, never an account that needs no password, so every empty shape is refused
    // whatever password is offered.
    it("never authenticates, whatever is typed at it", async () => {
      expect(await verifyPassword(PASSWORD, null)).toBe(false);
      expect(await verifyPassword(PASSWORD, undefined)).toBe(false);
      expect(await verifyPassword(PASSWORD, "")).toBe(false);
      expect(await verifyPassword("", null)).toBe(false);
      expect(await verifyPassword("", "")).toBe(false);
    });

    // Sign-in is a public endpoint, so an early return here would answer in under a millisecond
    // for an address with no hash while a real account takes a quarter of a second, which is an
    // enumeration oracle. The threshold sits far below the real cost of a comparison at cost 12 on
    // purpose: it can only fail if the dummy comparison is skipped altogether.
    it("still spends the work, so timing does not reveal who exists", async () => {
      const startedAt = performance.now();
      await verifyPassword(PASSWORD, null);

      expect(performance.now() - startedAt).toBeGreaterThan(25);
    });
  });

  // bcryptjs answers false for a stored value of the wrong length but throws for one that is
  // exactly 60 characters of the wrong shape, which is the length any corrupted bcrypt row still
  // has. An escaping throw would make a sign-in against that one address fail differently from
  // every other address, which is the enumeration answer this file spends a quarter of a second
  // per attempt to withhold.
  describe("a stored hash bcrypt cannot read", () => {
    const sixtyCharacters = [
      ["not bcrypt at all", "x".repeat(60)],
      ["a version bcrypt does not implement", `$2x$12$${"a".repeat(53)}`],
      ["a cost outside the legal range", `$2b$99$${"a".repeat(53)}`],
      ["nothing but separators", "$".repeat(60)],
    ] as const;

    it.each(sixtyCharacters)("resolves false rather than throwing: %s", async (_label, stored) => {
      expect(stored).toHaveLength(60);

      await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
      await expect(verifyPassword(PASSWORD, stored, PASSWORD_ALGO)).resolves.toBe(false);
    });

    it("resolves false for a hash of some other length", async () => {
      await expect(verifyPassword(PASSWORD, "garbage")).resolves.toBe(false);
      await expect(
        verifyPassword(PASSWORD, "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaGhhc2g"),
      ).resolves.toBe(false);
    });
  });

  // Accounts migrated off Supabase Auth keep the hash GoTrue wrote. If this breaks, every existing
  // user is locked out of the tool on the day the migration ships.
  describe("hashes inherited from Supabase", () => {
    it("verifies a $2a$ hash", async () => {
      const legacy = supabaseEraHash(PASSWORD);

      // Proves the fixture is really the legacy shape, so the assertion below is not vacuous.
      expect(legacy.startsWith("$2a$")).toBe(true);
      expect(legacy).toHaveLength(60);

      expect(await verifyPassword(PASSWORD, legacy, PASSWORD_ALGO)).toBe(true);
      expect(await verifyPassword(PASSWORD, legacy)).toBe(true);
    });

    it("rejects the wrong password against a $2a$ hash", async () => {
      const legacy = supabaseEraHash(PASSWORD);

      expect(await verifyPassword("otra contrasena", legacy)).toBe(false);
    });
  });
});

// A legacy hash is not only cheaper to attack, it is faster to compare, and the dummy comparison
// verifyPassword spends on an unknown address is fixed at BCRYPT_COST. So while rows below that
// cost exist, answering quickly is itself the tell that an address has an account. This is what a
// caller reads to drain them, one successful sign-in at a time.
describe("needsRehash", () => {
  it("asks for a rehash of a hash made below the current cost", () => {
    const legacy = hashSync(PASSWORD, genSaltSync(BCRYPT_COST - 2));

    expect(getRounds(legacy)).toBeLessThan(BCRYPT_COST);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("leaves a hash at the current cost alone", async () => {
    const { hash } = await hashPassword(PASSWORD);

    expect(needsRehash(hash)).toBe(false);
  });

  // False, never true, for anything unreadable. A row this file cannot parse is a row to refuse at
  // sign-in, not one to overwrite on the strength of a guess about what it holds.
  it("says no when there is nothing it can read", () => {
    expect(needsRehash(null)).toBe(false);
    expect(needsRehash(undefined)).toBe(false);
    expect(needsRehash("")).toBe(false);
    expect(needsRehash("x".repeat(60))).toBe(false);
  });
});

// The suite above proves this file's own hashes round-trip. This block proves something
// narrower and more load-bearing: that bcryptjs's $2a$ implementation matches the reference
// implementation, using published values nobody here computed. That is what makes a format
// check (see scripts/audit-password-hashes.ts) sufficient evidence for every hash inherited from
// Supabase's GoTrue, rather than a hope that bcryptjs happens to agree with whatever produced
// them. This is a standing regression guard, not a one-time migration gate: if a bcryptjs
// dependency bump ever broke $2a$ compatibility, every inherited password would silently stop
// verifying, and this is the test that would catch it.
describe("bcrypt compatibility", () => {
  // From the OpenBSD bcrypt test suite. If any of these fail, hashes produced by GoTrue cannot be
  // trusted to verify here, and treating a migrated hash as portable is not safe at any cost
  // factor.
  const VECTORS: Array<[password: string, hash: string]> = [
    ["", "$2a$06$DCq7YPn5Rq63x1Lad4cll.TV4S6ytwfsfvkgY8jIucDrjc8deX1s."],
    ["a", "$2a$06$m0CrhHm10qJ3lXRY.5zDGO3rS2KdeeWLuGmsfGlMfOxih58VYVfxe"],
    ["abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i"],
    ["abcdefghijklmnopqrstuvwxyz", "$2a$06$.rCVZVOThsIa97pEDOxvGuRRgzG64bvtJ0938xuqzv18d3ZpQhstC"],
    ["~!@#$%^&*()      ~!@#$%^&*()PNBFRD", "$2a$06$fPIsBO8qRqkjj273rfaOI.HtSV9jLDpTbZn782DC6/t7qT67P6FfO"],
  ];

  it.each(VECTORS)("AUTH-07 verifies the canonical $2a$ vector for %j", async (password, hash) => {
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("AUTH-07 rejects a wrong password against a canonical vector", async () => {
    expect(await verifyPassword("wrong", VECTORS[2][1])).toBe(false);
  });

  it("AUTH-07 returns false rather than throwing on a malformed hash", async () => {
    // bcryptjs THROWS on a 60-character string that is not a valid hash. An exception here would
    // escape the sign-in action, answer differently for a real account than an invented one, and
    // skip the throttle record. Both are handed to an attacker for free.
    for (const bad of ["", "not-a-hash", "$2a$12$tooshort", "x".repeat(60)]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });
});
