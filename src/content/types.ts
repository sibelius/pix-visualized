import type { ChapterKey } from "@/components/shell/nav";

export type Concept = {
  /** stable anchor id, e.g. "lsm-tree", "write-skew" */
  id: string;
  /** the term as the book uses it, e.g. "LSM-tree", "Write skew" */
  name: string;
  /** one line: what it is */
  what: string;
  /** 1–3 sentences: why it matters / the trade-off, paraphrased */
  why: string;
  /** optional: in-page anchor (section id) of the visualization that demonstrates it */
  viz?: string;
  /** optional: real systems that exemplify it, e.g. ["Cassandra", "RocksDB"] */
  examples?: string[];
};

export type Chapter = {
  key: ChapterKey;
  /** book chapter number (1–12) */
  bookChapter: number;
  title: string;
  href: string;
  /** one-sentence thesis of the chapter */
  thesis: string;
  concepts: Concept[];
};
