/** A line of text on a page, in PDF units at scale 1 with a top-left origin. */
export interface TextLine {
  text: string;
  x: number;
  /** Baseline position. */
  y: number;
  width: number;
  /** Roughly the font size. */
  height: number;
}

export interface PageText {
  page: number;
  width: number;
  height: number;
  text: string;
  /** Empty when the text came from OCR, since we don't know where it sits on the page. */
  lines: TextLine[];
}

export type PolicyKind = 'pdf' | 'images';

/** Where a clause sits: a page, and optionally a vertical band on it (scale-1 units). */
export interface ClauseHit {
  page: number;
  top?: number;
  bottom?: number;
}

/**
 * One clause (or a slice of a long one) with its exact location. Every
 * citation, search result and "at a glance" fact points at one of these, so
 * highlighting never depends on guessing where a clause number appears.
 */
export interface PolicyChunk {
  /** Stable id the model cites, e.g. "C42". */
  id: string;
  /** Printed number or code, e.g. "3.6", "Excl02", "Annexure II". */
  ref?: string;
  /** First line of the clause, e.g. "3.6 Room rent and ICU limits". */
  heading: string;
  /** Enclosing section heading, e.g. "3. Base covers (Part I)". */
  section?: string;
  text: string;
  location: ClauseHit;
}

/**
 * How the policy reaches the model. Short wordings go in whole; long ones go
 * in as an outline, and the model searches the full text with a tool.
 */
export type ContextMode = 'full' | 'outline';

export interface PolicyDocument {
  id: string;
  name: string;
  kind: PolicyKind;
  /** Set when the document is one of the bundled specimens. */
  sample?: 'health' | 'motor' | 'supreme';
  pages: PageText[];
  chunks: PolicyChunk[];
  /** Object URLs for image uploads (one per page). */
  imageUrls?: string[];
  /** True when the text was read by OCR rather than taken from the PDF. */
  ocr?: boolean;
  /** The text handed to the model: the whole wording, or an outline for long policies. */
  contextText: string;
  contextMode: ContextMode;
}
