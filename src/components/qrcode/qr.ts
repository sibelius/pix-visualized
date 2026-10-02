// Minimal QR Code encoder (ISO/IEC 18004): byte mode, error-correction level M, versions 1–20.
// No dependencies. Exposes intermediate steps (codewords, RS blocks, mask penalties) for the UI.

export const MAX_VERSION = 20;

// Level M: [ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw]
const M_TABLE: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 0], // v0 placeholder
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
];

const ALIGN: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
];

export function dataCapacity(v: number): number {
  const [, b1, d1, b2, d2] = M_TABLE[v];
  return b1 * d1 + b2 * d2;
}

/** Max payload bytes in byte mode at level M for version v. */
export function byteCapacity(v: number): number {
  const bits = dataCapacity(v) * 8 - 4 - (v < 10 ? 8 : 16);
  return Math.floor(bits / 8);
}

export const sizeOf = (v: number) => 17 + 4 * v;

/* ---------------- GF(256) & Reed–Solomon ---------------- */

const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(deg: number): number[] {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gmul(g[j], EXP[i]);
    }
    g = next;
  }
  return g; // g[0] = 1 (leading)
}

export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= gmul(gen[i + 1], factor);
  }
  return res;
}

/* ---------------- Encoding ---------------- */

export type QrBlock = { data: number[]; ec: number[] };

export type QrResult = {
  version: number;
  size: number;
  mask: number;
  bytes: number;
  capacity: number;
  dataCodewords: number[];
  blocks: QrBlock[];
  finalCodewords: number[];
  modules: boolean[][]; // true = dark
  isFunction: boolean[][];
  /** for each module, index of the (interleaved) codeword it carries, or -1 (function pattern / remainder bit) */
  cwIndex: number[][];
  totalData: number;
  penalties: number[];
  ecPerBlock: number;
};

export function chooseVersion(nBytes: number, minVersion = 1): number | null {
  for (let v = minVersion; v <= MAX_VERSION; v++) if (byteCapacity(v) >= nBytes) return v;
  return null;
}

export function encodeQr(text: string, opts: { minVersion?: number; forceMask?: number } = {}): QrResult | null {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length, opts.minVersion ?? 1);
  if (version === null) return null;
  const [ecLen, b1, d1, b2, d2] = M_TABLE[version];
  const totalData = b1 * d1 + b2 * d2;

  // Bit stream: mode 0100 + count + data + terminator + pad
  const bits: number[] = [];
  const put = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = totalData * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    cw.push(v);
  }
  for (let p = 0; cw.length < totalData; p++) cw.push(p % 2 === 0 ? 0xec : 0x11);

  // Blocks
  const blocks: QrBlock[] = [];
  let k = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const n = i < b1 ? d1 : d2;
    const data = cw.slice(k, k + n);
    k += n;
    blocks.push({ data, ec: rsEncode(data, ecLen) });
  }
  const finalCw: number[] = [];
  const maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.data.length) finalCw.push(b.data[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) finalCw.push(b.ec[i]);

  // Matrix
  const size = sizeOf(version);
  const base = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setF = (r: number, c: number, dark: boolean) => {
    base[r][c] = dark;
    fn[r][c] = true;
  };
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setF(rr, cc, inRing || inCore);
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setF(6, i, i % 2 === 0);
    setF(i, 6, i % 2 === 0);
  }
  const al = ALIGN[version];
  const last = al.length - 1;
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // finder corners
      const r = al[i];
      const c = al[j];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // reserve format areas
  for (let i = 0; i < 9; i++) {
    if (!fn[8][i]) setF(8, i, false);
    if (!fn[i][8]) setF(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setF(8, size - 1 - i, false);
    setF(size - 1 - i, 8, false);
  }
  setF(size - 8, 8, true); // dark module
  // version info
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vbits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setF(b, a, bit);
      setF(a, b, bit);
    }
  }

  // place data (zigzag)
  const dataBits: number[] = [];
  for (const c of finalCw) for (let i = 7; i >= 0; i--) dataBits.push((c >>> i) & 1);
  const placed = base.map((row) => row.slice());
  const cwIndex = Array.from({ length: size }, () => new Array<number>(size).fill(-1));
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (fn[r][c]) continue;
        placed[r][c] = bi < dataBits.length ? dataBits[bi] === 1 : false;
        if (bi < dataBits.length) cwIndex[r][c] = bi >> 3;
        bi++;
      }
    }
  }

  const maskFn = (m: number, r: number, c: number): boolean => {
    switch (m) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };

  const applyMask = (m: number): boolean[][] => {
    const g = placed.map((row) => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fn[r][c] && maskFn(m, r, c)) g[r][c] = !g[r][c];
    // format info: EC level M = 00
    const data = (0b00 << 3) | m;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fbits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((fbits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) g[i][8] = bit(i);
    g[7][8] = bit(6);
    g[8][8] = bit(7);
    g[8][7] = bit(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) g[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) g[size - 15 + i][8] = bit(i);
    g[size - 8][8] = true;
    return g;
  };

  const penalty = (g: boolean[][]): number => {
    let p = 0;
    // N1 runs
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          const cur = pass ? g[b][a] : g[a][b];
          const prev = pass ? g[b - 1][a] : g[a][b - 1];
          if (cur === prev) run++;
          else {
            if (run >= 5) p += 3 + run - 5;
            run = 1;
          }
        }
        if (run >= 5) p += 3 + run - 5;
      }
    }
    // N2 2x2 blocks
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++) {
        const v = g[r][c];
        if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) p += 3;
      }
    // N3 finder-like patterns 1011101 with 4 light on one side
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let a = 0; a < size; a++)
      for (let b = 0; b <= size - 11; b++) {
        let m1 = true;
        let m2 = true;
        let n1 = true;
        let n2 = true;
        for (let k2 = 0; k2 < 11; k2++) {
          if (g[a][b + k2] !== pat1[k2]) m1 = false;
          if (g[a][b + k2] !== pat2[k2]) m2 = false;
          if (g[b + k2][a] !== pat1[k2]) n1 = false;
          if (g[b + k2][a] !== pat2[k2]) n2 = false;
        }
        p += 40 * ((m1 ? 1 : 0) + (m2 ? 1 : 0) + (n1 ? 1 : 0) + (n2 ? 1 : 0));
      }
    // N4 dark proportion
    let dark = 0;
    for (const row of g) for (const v of row) if (v) dark++;
    const pct = (dark * 100) / (size * size);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  };

  const penalties: number[] = [];
  let best = 0;
  let bestG: boolean[][] | null = null;
  for (let m = 0; m < 8; m++) {
    const g = applyMask(m);
    penalties.push(penalty(g));
    if (opts.forceMask === undefined && (bestG === null || penalties[m] < penalties[best])) {
      best = m;
      bestG = g;
    }
  }
  if (opts.forceMask !== undefined) {
    best = opts.forceMask;
    bestG = applyMask(best);
  }

  return {
    version,
    size,
    mask: best,
    bytes: bytes.length,
    capacity: byteCapacity(version),
    dataCodewords: cw,
    blocks,
    finalCodewords: finalCw,
    modules: bestG!,
    isFunction: fn,
    cwIndex,
    totalData,
    penalties,
    ecPerBlock: ecLen,
  };
}

/** Compact SVG path ("M x y h1 v1 h-1 z" per dark module, merged horizontally per row). */
export function modulesToPath(g: boolean[][], quiet = 4): string {
  let d = "";
  for (let r = 0; r < g.length; r++) {
    let c = 0;
    while (c < g.length) {
      if (!g[r][c]) {
        c++;
        continue;
      }
      let e = c;
      while (e < g.length && g[r][e]) e++;
      d += `M${c + quiet} ${r + quiet}h${e - c}v1h-${e - c}z`;
      c = e;
    }
  }
  return d;
}
