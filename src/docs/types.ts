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

export interface PolicyDocument {
  id: string;
  name: string;
  kind: PolicyKind;
  /** Set when the document is one of the bundled specimens. */
  sample?: 'health' | 'motor';
  pages: PageText[];
  /** Object URLs for image uploads (one per page). */
  imageUrls?: string[];
  /** True when the text was read by OCR rather than taken from the PDF. */
  ocr?: boolean;
  /** The text handed to the model, trimmed to fit the context window. */
  contextText: string;
  truncated: boolean;
}

/** Where a clause sits: a page, and optionally a vertical band on it (scale-1 units). */
export interface ClauseHit {
  page: number;
  top?: number;
  bottom?: number;
}
