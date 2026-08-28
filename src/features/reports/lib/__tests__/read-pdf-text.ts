import { inflateSync } from "node:zlib";

// A minimal PDF content-stream reader, used only by build-pdf.test.ts. react-pdf has no
// snapshot story and there is no rasteriser in this toolchain, so the only way to assert where
// something actually landed on the page is to read the page's drawing operators back out. That
// is worth the ~150 lines: the bug this guards against (body text printed on top of the fixed
// running header from page 2 onward) is invisible to a "did it render" smoke test and shows up
// only in the finished PDF, which is the artifact that leaves the building.
//
// Deliberately narrow. It understands exactly what @react-pdf/renderer emits for this document:
// Flate-compressed content streams, single-byte ASCII-compatible font encodings, and text placed
// by the q/Q + cm transform stack with Tm/Td inside BT/ET. It is not a general PDF parser.

export type TextDraw = {
  text: string;
  x: number;
  /**
   * The text baseline's distance from the top edge of the page, in points, which is the same
   * axis page padding is expressed in. react-pdf flips the page with a leading `cm`, so this
   * comes straight out of the transform chain.
   */
  yFromTop: number;
};

/** A3 height in PostScript points, matching <Page size="A3" /> in build-pdf.tsx. */
export const PAGE_HEIGHT = 1190.55;

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Standard PDF matrix composition: the result of applying `m` and then `n`. */
function concat(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

/** Where the origin of `m` lands in device space. */
function origin(m: Matrix): { x: number; y: number } {
  return { x: m[4], y: m[5] };
}

function decodeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function decodeLiteral(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "\\") {
      out += body[i];
      continue;
    }
    const octal = body.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      out += String.fromCharCode(parseInt(octal, 8));
      i += 3;
      continue;
    }
    out += body[i + 1] ?? "";
    i += 1;
  }
  return out;
}

const NUM = String.raw`-?[\d.]+`;

// One regex, alternating over every operator that can move the pen or paint a glyph. Matching
// in a single pass is what keeps the operators in stream order, which is the whole point.
const OP_RE = new RegExp(
  [
    String.raw`(?<cm>(?:${NUM}\s+){6}cm)`,
    String.raw`(?<tm>(?:${NUM}\s+){6}Tm)`,
    String.raw`(?<td>(?:${NUM}\s+){2}T[dD])`,
    String.raw`(?<tstar>T\*)`,
    String.raw`(?<tl>${NUM}\s+TL)`,
    String.raw`(?<q>\bq\b)`,
    String.raw`(?<Q>\bQ\b)`,
    String.raw`(?<bt>\bBT\b)`,
    String.raw`(?<hex><[0-9A-Fa-f\s]*>)`,
    String.raw`(?<lit>\((?:[^()\\]|\\.)*\))`,
  ].join("|"),
  "g",
);

function numbers(token: string): number[] {
  return (token.match(new RegExp(NUM, "g")) ?? []).map(Number);
}

function parseContentStream(stream: string): TextDraw[] {
  const draws: TextDraw[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let leading = 0;
  // Glyphs inside one TJ array arrive as several strings; join them into one draw.
  let pending = "";
  let pendingAt: { x: number; yFromTop: number } | null = null;

  const flush = () => {
    if (pendingAt && pending.trim() !== "") {
      draws.push({ text: pending, x: pendingAt.x, yFromTop: pendingAt.yFromTop });
    }
    pending = "";
    pendingAt = null;
  };

  let match: RegExpExecArray | null;
  while ((match = OP_RE.exec(stream)) !== null) {
    const g = match.groups!;
    if (g.cm) {
      flush();
      ctm = concat(numbers(g.cm) as Matrix, ctm);
    } else if (g.q) {
      flush();
      stack.push(ctm);
    } else if (g.Q) {
      flush();
      ctm = stack.pop() ?? IDENTITY;
    } else if (g.bt) {
      flush();
      tm = IDENTITY;
      tlm = IDENTITY;
    } else if (g.tm) {
      flush();
      tm = numbers(g.tm) as Matrix;
      tlm = tm;
    } else if (g.td) {
      flush();
      const [tx, ty] = numbers(g.td);
      tlm = concat([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    } else if (g.tstar) {
      flush();
      tlm = concat([1, 0, 0, 1, 0, -leading], tlm);
      tm = tlm;
    } else if (g.tl) {
      leading = numbers(g.tl)[0];
    } else if (g.hex || g.lit) {
      const text = g.hex
        ? decodeHex(g.hex.slice(1, -1))
        : decodeLiteral(g.lit!.slice(1, -1));
      if (!pendingAt) {
        const { x, y } = origin(concat(tm, ctm));
        pendingAt = { x, yFromTop: PAGE_HEIGHT - y };
      }
      pending += text;
    }
  }
  flush();
  return draws;
}

/** Returns the visible text of each page, in page order, with positions. */
export function readPdfTextByPage(buffer: Buffer): TextDraw[][] {
  const raw = buffer.toString("latin1");

  const objects = new Map<number, { start: number; end: number }>();
  const objRe = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(raw)) !== null) {
    const end = raw.indexOf("endobj", m.index);
    objects.set(Number(m[1]), { start: m.index, end: end === -1 ? raw.length : end });
  }

  const body = (id: number) => {
    const range = objects.get(id);
    return range ? raw.slice(range.start, range.end) : "";
  };

  // Page order comes from the page tree's /Kids array, not from object numbering.
  let pageIds: number[] = [];
  for (const [id] of objects) {
    const text = body(id);
    if (!/\/Type\s*\/Pages\b/.test(text)) continue;
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(text);
    if (!kids) continue;
    pageIds = [...kids[1].matchAll(/(\d+)\s+0\s+R/g)].map((k) => Number(k[1]));
    break;
  }

  return pageIds.map((pageId) => {
    const contents = /\/Contents\s+(\d+)\s+0\s+R/.exec(body(pageId));
    if (!contents) return [];
    const range = objects.get(Number(contents[1]));
    if (!range) return [];
    const header = raw.slice(range.start, range.end);
    const streamAt = header.indexOf("stream");
    if (streamAt === -1) return [];
    const dataStart =
      range.start + streamAt + (header.startsWith("stream\r\n", streamAt) ? 8 : 7);
    const dataEnd = raw.indexOf("endstream", dataStart);
    const bytes = buffer.subarray(dataStart, dataEnd);
    const decoded = /\/FlateDecode/.test(header)
      ? inflateSync(bytes).toString("latin1")
      : bytes.toString("latin1");
    return parseContentStream(decoded);
  });
}
