import { useEffect, useRef, useState } from 'react';
import { Logo } from '../components/TopBar';
import { openDocChannel, refCandidates } from '../lib/doc-channel';
import { policies, type PolicyDoc } from '../policies';

type DocId = PolicyDoc['id'];

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function initialDoc(): DocId {
  const param = new URLSearchParams(window.location.search).get('doc');
  return param === 'motor' ? 'motor' : 'health';
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A plain, readable policy wording meant to be screen-shared into a call.
 * It listens on a BroadcastChannel so the call tab can make it scroll to and
 * highlight the clause the assistant is talking about.
 */
export function PolicyViewer() {
  const [docId, setDocId] = useState<DocId>(initialDoc);
  const [cited, setCited] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const doc = policies[docId];

  useEffect(() => {
    document.title = `${doc.product} · specimen policy`;
    const url = new URL(window.location.href);
    url.searchParams.set('doc', docId);
    window.history.replaceState(null, '', url);
    setCited([]);
    setFocus(null);
  }, [doc, docId]);

  useEffect(() => {
    const locate = (ref: string, quote?: string) => {
      const sheet = sheetRef.current;
      if (!sheet) return null;
      for (const candidate of refCandidates(ref)) {
        const el = sheet.querySelector<HTMLElement>(`[data-ref="${candidate}"]`);
        if (el) return el;
      }
      // No usable number: fall back to finding the quoted words.
      const needle = normalise(quote ?? '').slice(0, 48);
      if (needle.length < 12) return null;
      return (
        Array.from(sheet.querySelectorAll<HTMLElement>('.doc-clause, .schedule')).find((el) =>
          normalise(el.textContent ?? '').includes(needle),
        ) ?? null
      );
    };

    const channel = openDocChannel((msg) => {
      if (msg.type === 'ping') {
        channel.post({ type: 'hello', doc: docId, title: `${doc.product} policy` });
      }
      if (msg.type === 'highlight') {
        const el = locate(msg.ref, msg.quote);
        if (!el) return;
        const ref = el.dataset.ref!;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setCited((c) => (c.includes(ref) ? c : [...c, ref]));
        setFocus(ref);
        setToast(ref);
      }
    });
    channel.post({ type: 'hello', doc: docId, title: `${doc.product} policy` });
    return () => channel.close();
  }, [doc, docId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const state = (ref: string) => (focus === ref ? 'focus' : cited.includes(ref) ? 'cited' : undefined);

  return (
    <div className="viewer">
      <header className="viewer-bar glass glass-strong">
        <Logo />
        <div className="segmented" role="tablist" aria-label="Sample policy">
          {(Object.keys(policies) as DocId[]).map((id) => (
            <button key={id} role="tab" aria-selected={id === docId} onClick={() => setDocId(id)}>
              {id === 'health' ? 'Health' : 'Motor'}
            </button>
          ))}
        </div>
        <p className="viewer-hint">Share this tab from your call. Cited clauses light up here.</p>
      </header>

      <div className="viewer-body">
        <nav className="toc glass" aria-label="Contents">
          <p className="eyebrow">Contents</p>
          <ol>
            <li>
              <a href="#schedule">Schedule</a>
            </li>
            {doc.sections.map((s) => (
              <li key={s.ref} data-state={s.clauses.some((c) => cited.includes(c.ref)) ? 'cited' : undefined}>
                <a href={`#s-${s.ref}`}>
                  <span className="mono">{s.ref}</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="sheet" ref={sheetRef}>
          <div className="specimen">Specimen · for demonstration only · not an insurance contract</div>

          <header className="sheet-head">
            <p className="sheet-insurer">{doc.insurer}</p>
            <h1>{doc.product}</h1>
            <p className="sheet-kind">{doc.kind} · Policy wording</p>
            <p className="sheet-code mono">{doc.docCode}</p>
          </header>

          <section id="schedule" className="schedule" data-ref="0">
            <h2>Policy schedule</h2>
            <dl>
              {doc.schedule.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="preamble">{doc.preamble}</p>

          {doc.sections.map((section) => (
            <section
              key={section.ref}
              id={`s-${section.ref}`}
              className="doc-section"
              data-ref={section.ref}
              data-state={state(section.ref)}
            >
              <h2>
                <span>{section.ref}.</span> {section.title}
              </h2>
              {section.clauses.map((clause) => (
                <div key={clause.ref} className="doc-clause" data-ref={clause.ref} data-state={state(clause.ref)}>
                  {state(clause.ref) && <span className="cited-tag">Cited by assistant</span>}
                  <h3>
                    <span className="mono">{clause.ref}</span> {clause.title}
                  </h3>
                  {clause.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {clause.items && (
                    <ol className="items">
                      {clause.items.map((item, i) => (
                        <li key={i}>
                          <span>({LETTERS[i]})</span> {item}
                        </li>
                      ))}
                    </ol>
                  )}
                  {clause.table && (
                    <table>
                      <thead>
                        <tr>
                          {clause.table.head.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clause.table.rows.map((row) => (
                          <tr key={row[0]}>
                            {row.map((cell, i) => (
                              <td key={i}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </section>
          ))}

          <footer className="sheet-foot">
            {doc.insurer} is a fictional insurer. This wording was written for a product demo and does not describe any
            real insurance product.
          </footer>
        </article>
      </div>

      {toast && (
        <div className="viewer-toast glass glass-strong" role="status">
          <span className="live-dot" /> Assistant is pointing at clause <span className="mono">{toast}</span>
        </div>
      )}
    </div>
  );
}
