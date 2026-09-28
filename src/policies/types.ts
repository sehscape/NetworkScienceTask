export interface Clause {
  ref: string;
  title: string;
  /** Paragraphs. */
  body: string[];
  /** Lettered sub-items, rendered as (a), (b), (c)... */
  items?: string[];
  table?: { head: string[]; rows: string[][] };
}

export interface Section {
  ref: string;
  title: string;
  clauses: Clause[];
}

export interface PolicyDoc {
  id: 'health' | 'motor';
  insurer: string;
  product: string;
  kind: string;
  docCode: string;
  schedule: [string, string][];
  preamble: string;
  sections: Section[];
  /** Things to try saying on a call with this document shared. */
  prompts: string[];
}
