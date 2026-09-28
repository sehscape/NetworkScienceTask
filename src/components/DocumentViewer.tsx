import { useEffect, useRef, useState } from 'react';
import { getPdf } from '../docs/load';
import { locateClause } from '../docs/locate';
import { renderPage } from '../docs/pdf';
import type { ClauseHit, PolicyDocument } from '../docs/types';
import type { Citation } from '../live/case-tools';
import { Icon } from './Icon';

interface Props {
  doc: PolicyDocument;
  /** When this changes, scroll to the cited clause and highlight it. */
  focus?: { citation: Citation; nonce: number };
  onReplace?: () => void;
  onClose?: () => void;
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * The caller's policy, readable and scrollable right inside the call screen.
 * PDF pages are drawn with pdf.js only when they come near the viewport, and
 * the assistant can scroll to and highlight any clause it cites.
 */
export function DocumentViewer({ doc, focus, onReplace, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const holders = useRef(new Map<number, HTMLDivElement>());
  const paintedAt = useRef(new Map<number, number>()); // page -> width it was drawn at
  const paintSeq = useRef(new Map<number, number>());

  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [near, setNear] = useState<number[]>([1, 2]);
  const [visible, setVisible] = useState(1);
  const [hit, setHit] = useState<(ClauseHit & { ref: string; nonce: number }) | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

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

  // Scroll to and highlight the clause the assistant just cited.
  useEffect(() => {
    if (!focus) return;
    const found = locateClause(doc, focus.citation.clause_ref, focus.citation.quote);
    if (!found) {
      setMissing(focus.citation.clause_ref);
      const timer = window.setTimeout(() => setMissing(null), 3500);
      return () => window.clearTimeout(timer);
    }
    setHit({ ...found, ref: focus.citation.clause_ref, nonce: focus.nonce });

    const pageEl = pageEls.current.get(found.page);
    const root = scrollRef.current;
    const page = doc.pages[found.page - 1];
    if (pageEl && root && page) {
      const offset = found.top !== undefined ? (found.top / page.height) * pageEl.offsetHeight : 0;
      root.scrollTo({ top: pageEl.offsetTop + offset - root.clientHeight * 0.22, behavior: 'smooth' });
    }
  }, [focus, doc]);

  return (
    <div className="doc-viewer">
      <div className="doc-toolbar">
        <div className="doc-name" title={doc.name}>
          <span className="icon-tile">
            <Icon name="doc" />
          </span>
          <div>
            <strong>{doc.name}</strong>
            <span>
              {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
              {doc.ocr && ' · read with OCR'}
              {doc.truncated && ' · very long, partly sent'}
            </span>
          </div>
        </div>
        <div className="doc-tools">
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
                      <Icon name="pin" /> Cited · {hit.ref}
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
