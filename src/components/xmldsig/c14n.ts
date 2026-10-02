/**
 * A small, honest XML parser + Canonical XML serializer (Exclusive C14N 1.0
 * without comments, and inclusive C14N 1.0 for comparison), enough for the
 * subset used by SPI/DICT messages: elements, attributes, namespaces, text,
 * character/entity references, CDATA, comments and PIs (both dropped).
 *
 * No DTDs, no external entities, no InclusiveNamespaces PrefixList.
 */

export type XText = { type: "text"; value: string };
export type XAttr = { qname: string; prefix: string | null; local: string; value: string; uri: string };
export type XElem = {
  type: "elem";
  qname: string;
  prefix: string | null;
  local: string;
  /** resolved namespace URI ("" = no namespace) */
  uri: string;
  /** non-namespace attributes, in source order */
  attrs: XAttr[];
  /** namespace declarations on this element, in source order ("" = default namespace) */
  nsDecls: { prefix: string; uri: string }[];
  /** in-scope namespaces (inherited + own) */
  ns: Map<string, string>;
  children: XNode[];
  parent: XElem | null;
  /** source offsets (start of "<", end after ">" of the end tag) */
  start: number;
  end: number;
};
export type XNode = XElem | XText;

export class XmlError extends Error {
  pos: number;
  constructor(msg: string, pos: number) {
    super(`${msg} (at char ${pos})`);
    this.pos = pos;
  }
}

const NAME_START = /[A-Za-z_À-￿]/;
const NAME_CHAR = /[A-Za-z0-9_.\-:·À-￿]/;

function decodeRefs(raw: string, pos: number, attr: boolean): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "&") {
      const semi = raw.indexOf(";", i);
      if (semi < 0) throw new XmlError("unterminated reference", pos + i);
      const ref = raw.slice(i + 1, semi);
      if (ref[0] === "#") {
        const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        if (!Number.isFinite(code)) throw new XmlError(`bad character reference &${ref};`, pos + i);
        out += String.fromCodePoint(code);
      } else {
        const map: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
        if (!(ref in map)) throw new XmlError(`unknown entity &${ref};`, pos + i);
        out += map[ref];
      }
      i = semi;
    } else if (ch === "<" && attr) {
      throw new XmlError("'<' not allowed in attribute value", pos + i);
    } else if (attr && (ch === "\t" || ch === "\n")) {
      // attribute-value normalization: literal whitespace becomes a space
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

function splitQName(q: string): [string | null, string] {
  const i = q.indexOf(":");
  return i < 0 ? [null, q] : [q.slice(0, i), q.slice(i + 1)];
}

/** Parse an XML document; returns the document element. Line endings are normalized to \n first (as XML 1.0 requires). */
export function parseXml(input: string): XElem {
  const s = input.replace(/\r\n?/g, "\n");
  let i = 0;
  let root: XElem | null = null;
  const stack: XElem[] = [];

  const readName = () => {
    const st = i;
    if (!NAME_START.test(s[i] ?? "")) throw new XmlError("expected a name", i);
    while (i < s.length && NAME_CHAR.test(s[i])) i++;
    return s.slice(st, i);
  };
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  while (i < s.length) {
    if (s.startsWith("<?", i)) {
      const e = s.indexOf("?>", i);
      if (e < 0) throw new XmlError("unterminated processing instruction", i);
      i = e + 2;
    } else if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i);
      if (e < 0) throw new XmlError("unterminated comment", i);
      i = e + 3;
    } else if (s.startsWith("<![CDATA[", i)) {
      const e = s.indexOf("]]>", i);
      if (e < 0) throw new XmlError("unterminated CDATA", i);
      if (!stack.length) throw new XmlError("CDATA outside the root element", i);
      stack[stack.length - 1].children.push({ type: "text", value: s.slice(i + 9, e) });
      i = e + 3;
    } else if (s.startsWith("<!", i)) {
      throw new XmlError("DOCTYPE/DTD is not supported (and not allowed in SPI messages)", i);
    } else if (s.startsWith("</", i)) {
      const st = i;
      i += 2;
      const name = readName();
      skipWs();
      if (s[i] !== ">") throw new XmlError("expected '>'", i);
      i++;
      const top = stack.pop();
      if (!top || top.qname !== name) throw new XmlError(`mismatched end tag </${name}>${top ? `, expected </${top.qname}>` : ""}`, st);
      top.end = i;
    } else if (s[i] === "<") {
      const st = i;
      i++;
      const qname = readName();
      const rawAttrs: { name: string; value: string }[] = [];
      let selfClose = false;
      for (;;) {
        const before = i;
        skipWs();
        if (s[i] === "/" && s[i + 1] === ">") {
          i += 2;
          selfClose = true;
          break;
        }
        if (s[i] === ">") {
          i++;
          break;
        }
        if (i === before) throw new XmlError("expected whitespace before attribute", i);
        const an = readName();
        skipWs();
        if (s[i] !== "=") throw new XmlError(`expected '=' after ${an}`, i);
        i++;
        skipWs();
        const q = s[i];
        if (q !== '"' && q !== "'") throw new XmlError("expected quoted attribute value", i);
        const e = s.indexOf(q, i + 1);
        if (e < 0) throw new XmlError("unterminated attribute value", i);
        const value = decodeRefs(s.slice(i + 1, e), i + 1, true);
        if (rawAttrs.some((a) => a.name === an)) throw new XmlError(`duplicate attribute ${an}`, i);
        rawAttrs.push({ name: an, value });
        i = e + 1;
      }
      const parent = stack[stack.length - 1] ?? null;
      if (!parent && root) throw new XmlError("more than one root element", st);
      const ns = new Map(parent ? parent.ns : []);
      const nsDecls: { prefix: string; uri: string }[] = [];
      for (const a of rawAttrs) {
        if (a.name === "xmlns") {
          nsDecls.push({ prefix: "", uri: a.value });
          ns.set("", a.value);
        } else if (a.name.startsWith("xmlns:")) {
          const p = a.name.slice(6);
          nsDecls.push({ prefix: p, uri: a.value });
          ns.set(p, a.value);
        }
      }
      const [prefix, local] = splitQName(qname);
      const resolve = (p: string | null, isAttr: boolean, at: number) => {
        if (p === null) return isAttr ? "" : (ns.get("") ?? "");
        if (p === "xml") return "http://www.w3.org/XML/1998/namespace";
        const u = ns.get(p);
        if (u === undefined) throw new XmlError(`unbound namespace prefix "${p}:"`, at);
        return u;
      };
      const attrs: XAttr[] = rawAttrs
        .filter((a) => a.name !== "xmlns" && !a.name.startsWith("xmlns:"))
        .map((a) => {
          const [ap, al] = splitQName(a.name);
          return { qname: a.name, prefix: ap, local: al, value: a.value, uri: resolve(ap, true, st) };
        });
      const el: XElem = {
        type: "elem",
        qname,
        prefix,
        local,
        uri: resolve(prefix, false, st),
        attrs,
        nsDecls,
        ns,
        children: [],
        parent,
        start: st,
        end: i,
      };
      if (parent) parent.children.push(el);
      else root = el;
      if (!selfClose) stack.push(el);
    } else {
      const e = s.indexOf("<", i);
      const end = e < 0 ? s.length : e;
      const raw = s.slice(i, end);
      if (stack.length) {
        stack[stack.length - 1].children.push({ type: "text", value: decodeRefs(raw, i, false) });
      } else if (raw.trim()) {
        throw new XmlError("text outside the root element", i);
      }
      i = end;
    }
  }
  if (stack.length) throw new XmlError(`unclosed element <${stack[stack.length - 1].qname}>`, s.length);
  if (!root) throw new XmlError("no root element", 0);
  return root;
}

export function escText(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}
export function escAttr(t: string) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

export type C14nMode = "exc" | "inc";
export type C14nOpts = {
  mode: C14nMode;
  /** omit these elements (and their subtree): the enveloped-signature transform */
  exclude?: (e: XElem) => boolean;
};

/** Canonicalize the subtree rooted at `apex` (a document subset: the apex and everything below it). */
export function canonicalize(apex: XElem, opts: C14nOpts): string {
  const out: string[] = [];
  const walk = (e: XElem, rendered: Map<string, string>, isApex: boolean) => {
    // 1. which namespace declarations to emit on this element
    const want: { prefix: string; uri: string }[] = [];
    const consider = (p: string) => {
      if (p === "xml") return;
      const uri = e.ns.get(p) ?? "";
      const prev = rendered.get(p);
      if (p === "") {
        // the default namespace: xmlns="" is only output to undeclare a rendered non-empty default
        if (uri === "") {
          if (prev !== undefined && prev !== "") want.push({ prefix: "", uri: "" });
        } else if (prev !== uri) want.push({ prefix: "", uri });
      } else if (prev !== uri) want.push({ prefix: p, uri });
    };
    if (opts.mode === "exc") {
      // Exclusive: only namespaces *visibly utilized* by this element or its attributes
      const used = new Set<string>();
      used.add(e.prefix ?? "");
      for (const a of e.attrs) if (a.prefix) used.add(a.prefix);
      for (const p of used) consider(p);
    } else {
      // Inclusive: every namespace in scope (at the apex this drags in ancestors' declarations)
      const all = new Set<string>(e.ns.keys());
      if (!isApex) {
        // below the apex, only what changed relative to the parent (still including unused ones)
        for (const d of e.nsDecls) all.add(d.prefix);
      }
      for (const p of all) consider(p);
      if (!e.ns.has("") && rendered.get("")) want.push({ prefix: "", uri: "" });
    }
    want.sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0));
    // 2. attributes sorted by (namespace URI, local name); unqualified first (empty URI)
    const attrs = [...e.attrs].sort((a, b) => (a.uri !== b.uri ? (a.uri < b.uri ? -1 : 1) : a.local < b.local ? -1 : a.local > b.local ? 1 : 0));

    let tag = `<${e.qname}`;
    for (const d of want) tag += d.prefix ? ` xmlns:${d.prefix}="${escAttr(d.uri)}"` : ` xmlns="${escAttr(d.uri)}"`;
    for (const a of attrs) tag += ` ${a.qname}="${escAttr(a.value)}"`;
    tag += ">";
    out.push(tag);
    const next = new Map(rendered);
    for (const d of want) next.set(d.prefix, d.uri);
    for (const c of e.children) {
      if (c.type === "text") out.push(escText(c.value));
      else if (!opts.exclude?.(c)) walk(c, next, false);
    }
    // 3. empty elements always become a start/end pair
    out.push(`</${e.qname}>`);
  };
  walk(apex, new Map(), true);
  return out.join("");
}

/* ------------------------------ tree helpers ------------------------------ */

export function* descendants(e: XElem): Generator<XElem> {
  yield e;
  for (const c of e.children) if (c.type === "elem") yield* descendants(c);
}
export function findFirst(root: XElem, pred: (e: XElem) => boolean): XElem | null {
  for (const e of descendants(root)) if (pred(e)) return e;
  return null;
}
export function attr(e: XElem, local: string): string | undefined {
  return e.attrs.find((a) => a.local === local && !a.prefix)?.value;
}
export function childEls(e: XElem, local?: string): XElem[] {
  return e.children.filter((c): c is XElem => c.type === "elem" && (!local || c.local === local));
}
export function textOf(e: XElem): string {
  let t = "";
  for (const c of e.children) t += c.type === "text" ? c.value : textOf(c);
  return t;
}

/* ------------------------------ bytes helpers ----------------------------- */

export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}
/** ISO-8859-1 (Latin-1) bytes; characters outside it become '?' — used to show the encoding pitfall */
export function latin1(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 63;
  }
  return out;
}
export function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
/** Decode base64. Strict mode refuses any whitespace (what a naive decoder does); lenient strips it (what XMLDSig requires). */
export function fromB64(s: string, lenient = true): Uint8Array<ArrayBuffer> {
  const clean = lenient ? s.replace(/\s+/g, "") : s;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) throw new Error("invalid base64 (whitespace or bad length)");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function toHex(bytes: Uint8Array, max = 64): string {
  let h = "";
  for (let i = 0; i < Math.min(bytes.length, max); i++) h += bytes[i].toString(16).padStart(2, "0");
  return bytes.length > max ? h + "…" : h;
}
export function wrap76(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\n").replace(/\n$/, "");
}
export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
