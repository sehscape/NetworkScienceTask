import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPdf } from '../docs/load';
import { locateClause } from '../docs/locate';
import { renderPage } from '../docs/pdf';
import { clauseTitle, indexFor, snippet } from '../docs/search';
import type { ClauseHit, PolicyChunk, PolicyDocument } from '../docs/types';
import { Icon } from './Icon';

/** Something to scroll to and light up: a cited clause, a search hit or an "at a glance" fact. */
export interface FocusTarget {
  label: string;
  /** Printed clause number, used to find the clause when no location is known. */
  ref?: string;
  quote?: string;
  location?: ClauseHit;
  cited?: boolean;
}

export interface ViewerFocus {
  target: FocusTarget;
  nonce: number;
}

export const chunkTarget = (chunk: PolicyChunk): FocusTarget => ({
  label: chunk.ref ?? `p.${chunk.location.page}`,
  ref: chunk.ref,
  location: chunk.location,
});

interface Props {
  doc: PolicyDocument;
  /** When this changes, scroll to the target and highlight it. */
  focus?: ViewerFocus;
  /** During a call: ask the assistant about a clause found with search. */
  onAsk?: (question: string) => void;
  onReplace?: () => void;
  onClose?: () => void;
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * The caller's policy, readable and scrollable right inside the call screen.
 * PDF pages are drawn with pdf.js only when they come near the viewport, and
 * the assistant can scroll to and highlight any clause it cites.
 */
export function DocumentViewer({ doc, focus, onAsk, onReplace, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const holders = useRef(new Map<number, HTMLDivElement>());
  const paintedAt = useRef(new Map<number, number>()); // page -> width it was drawn at
  const paintSeq = useRef(new Map<number, number>());

  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [near, setNear] = useState<number[]>([1, 2]);
  const [visible, setVisible] = useState(1);
  const [hit, setHit] = useState<(ClauseHit & { label: string; cited?: boolean; nonce: number }) | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');

  const pageWidth = Math.max(240, Math.round(fitWidth * ZOOMS[zoom]));

  // Fit pages to the panel width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setFitWidth(el.clientWidth - 32));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track which pages are near the viewport (to draw them) and which one is most visible.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const ratios = new Map<number, number>();

    const nearObserver = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const set = new Set(prev);
          entries.forEach((e) => {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) set.add(n);
            else set.delete(n);
          });
          return [...set].sort((a, b) => a - b);
        }),
      { root, rootMargin: '900px 0px' },
    );

    const visibleObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set(Number((e.target as HTMLElement).dataset.page), e.intersectionRatio));
        let best = 1;
        let bestRatio = -1;
        ratios.forEach((ratio, n) => {
          if (ratio > bestRatio) {
            best = n;
            bestRatio = ratio;
          }
        });
        setVisible(best);
      },
      { root, threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );

    pageEls.current.forEach((el) => {
      nearObserver.observe(el);
      visibleObserver.observe(el);
    });
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [doc]);

  // Draw nearby PDF pages. Each paint goes into a fresh canvas that replaces
  // the old one when finished, so resizing never flashes a blank page.
  useEffect(() => {
    const pdf = doc.kind === 'pdf' ? getPdf(doc.id) : undefined;
    if (!pdf || !fitWidth) return;

    const timer = window.setTimeout(
      () => {
        for (const n of near) {
          const holder = holders.current.get(n);
          if (!holder || paintedAt.current.get(n) === pageWidth) continue;
          const seq = (paintSeq.current.get(n) ?? 0) + 1;
          paintSeq.current.set(n, seq);
          paintedAt.current.set(n, pageWidth);

          const canvas = document.createElement('canvas');
          void renderPage(pdf, n, canvas, pageWidth).then(async (task) => {
            if (paintSeq.current.get(n) !== seq) return task.cancel();
            try {
              await task.promise;
            } catch {
              return;
            }
            if (paintSeq.current.get(n) === seq) holder.replaceChildren(canvas);
          });
        }
      },
      paintedAt.current.size ? 140 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [doc, near, pageWidth, fitWidth]);

  const show = useCallback(
    (target: FocusTarget, nonce: number) => {
      // Clauses cited from the app's own index carry their exact location;
      // anything else (a clause read off a shared screen) is looked up by number.
      const found = target.location ?? (target.ref ? locateClause(doc, target.ref, target.quote) : null);
      if (!found) {
        setMissing(target.label);
        return;
      }
      setHit({ ...found, label: target.label, cited: target.cited, nonce });

      const pageEl = pageEls.current.get(found.page);
      const root = scrollRef.current;
      const page = doc.pages[found.page - 1];
      if (pageEl && root && page) {
        const offset = found.top !== undefined ? (found.top / page.height) * pageEl.offsetHeight : 0;
        root.scrollTo({ top: pageEl.offsetTop + offset - root.clientHeight * 0.22, behavior: 'smooth' });
      }
    },
    [doc],
  );

  // Wait for the first measurement when the viewer has only just mounted
  // (e.g. coming from the "at a glance" tab), or the page offsets are wrong.
  const measured = fitWidth > 0;
  useEffect(() => {
    if (focus && measured) show(focus.target, focus.nonce);
  }, [focus, show, measured]);

  useEffect(() => {
    if (!missing) return;
    const timer = window.setTimeout(() => setMissing(null), 3500);
    return () => window.clearTimeout(timer);
  }, [missing]);

  const results = useMemo(
    () => (query.trim().length > 1 ? indexFor(doc.chunks).search(query, 6) : []),
    [doc, query],
  );

  const pick = (chunk: PolicyChunk) => {
    setFinding(false);
    show(chunkTarget(chunk), Date.now());
  };

  return (
    <div className="doc-viewer">
      <div className="doc-toolbar">
        <div className="doc-name" title={doc.name}>
          <span className="icon-tile">
            <Icon name="doc" />
          </span>
          <div>
            <strong>{doc.name}</strong>
            <span title={`${doc.chunks.length} clauses indexed for search`}>
              {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} · {doc.chunks.length} clauses
              {doc.ocr && ' · OCR'}
            </span>
          </div>
        </div>
        <div className="doc-tools">
          <button
            className="icon-btn icon-btn-sm"
            aria-pressed={finding}
            aria-label="Find in policy"
            title="Find in policy"
            onClick={() => setFinding((f) => !f)}
          >
            <Icon name="search" />
          </button>
          <span className="page-indicator mono" aria-live="polite">
            {visible} / {doc.pages.length}
          </span>
          <div className="zoom" role="group" aria-label="Zoom">
            <button aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
              <Icon name="minus" />
            </button>
            <button className="zoom-level" onClick={() => setZoom(1)} title="Fit to width">
              {Math.round(ZOOMS[zoom] * 100)}%
            </button>
            <button
              aria-label="Zoom in"
              disabled={zoom === ZOOMS.length - 1}
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            >
              <Icon name="plus" />
            </button>
          </div>
          {onReplace && (
            <button className="btn btn-text" onClick={onReplace} title="Upload a different policy">
              <Icon name="upload" />
              Replace
            </button>
          )}
          {onClose && (
            <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Remove document">
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {finding && (
        <div className="doc-find">
          <label className="doc-find-bar">
            <Icon name="search" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFinding(false);
                if (e.key === 'Enter' && results[0]) pick(results[0].chunk);
              }}
              placeholder="Find in your policy: room rent, cataract, 3.6…"
              aria-label="Find in policy"
            />
          </label>
          {results.length > 0 && (
            <ul className="doc-find-results scroll-area">
              {results.map(({ chunk }) => (
                <li key={chunk.id}>
                  <button className="doc-find-hit" onClick={() => pick(chunk)}>
                    <span className="doc-find-head">
                      {chunk.ref && <span className="mono">{chunk.ref}</span>}
                      <strong>{clauseTitle(chunk)}</strong>
                      <span className="doc-find-page">p.{chunk.location.page}</span>
                    </span>
                    <span className="doc-find-snippet">{snippet(chunk, query)}</span>
                  </button>
                  {onAsk && (
                    <button
                      className="btn btn-quiet doc-find-ask"
                      title="Ask the assistant about this clause"
                      onClick={() => {
                        pick(chunk);
                        onAsk(`What does ${chunk.ref ? `clause ${chunk.ref}` : `"${clauseTitle(chunk)}"`} of my policy mean for me?`);
                      }}
                    >
                      Ask
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {query.trim().length > 1 && !results.length && (
            <p className="doc-find-empty">Nothing in this policy mentions that.</p>
          )}
        </div>
      )}

      <div className="doc-scroll scroll-area" ref={scrollRef}>
        <div className="doc-pages">
          {doc.pages.map((page, i) => {
            const height = Math.round(pageWidth * (page.height / page.width));
            const isHit = hit?.page === page.page;
            return (
              <div
                key={page.page}
                className="doc-page"
                data-page={page.page}
                data-hit={isHit && hit?.top === undefined ? 'page' : undefined}
                style={{ width: pageWidth, height }}
                ref={(el) => {
                  if (el) pageEls.current.set(page.page, el);
                  else pageEls.current.delete(page.page);
                }}
              >
                {doc.kind === 'images' ? (
                  <img src={doc.imageUrls?.[i]} alt={`Page ${page.page}`} />
                ) : (
                  <div
                    className="doc-canvas"
                    ref={(el) => {
                      if (el) holders.current.set(page.page, el);
                      else holders.current.delete(page.page);
                    }}
                  />
                )}
                {isHit && hit?.top !== undefined && hit.bottom !== undefined && (
                  <div
                    key={hit.nonce}
                    className="doc-highlight"
                    style={{
                      top: `calc(${(hit.top / page.height) * 100}% - 6px)`,
                      height: `calc(${((hit.bottom - hit.top) / page.height) * 100}% + 12px)`,
                    }}
                  >
                    <span className="doc-highlight-tag">
                      <Icon name={hit.cited ? 'pin' : 'eye'} /> {hit.cited ? `Cited · ${hit.label}` : hit.label}
                    </span>
                  </div>
                )}
                <span className="doc-page-num">{page.page}</span>
              </div>
            );
          })}
        </div>
      </div>

      {missing && (
        <div className="doc-toast" role="status">
          Couldn&rsquo;t find clause {missing} in this document.
        </div>
      )}
    </div>
  );
}
