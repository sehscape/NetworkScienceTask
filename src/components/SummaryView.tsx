import { useEffect, useMemo, useState } from 'react';
import type { CallReport, ReportRequest } from '../../shared/types';
import type { CallSnapshot } from '../hooks/useLiveCall';
import { formatDuration, formatINR } from '../lib/format';
import { redact } from '../lib/redact';
import { ClaimFileCard } from './ClaimFileCard';
import { ClauseList } from './ClauseList';
import { CoverageCard, verdictLabel } from './CoverageCard';
import { Icon } from './Icon';
import { NextStepsCard } from './NextStepsCard';
import { PayoutCard } from './PayoutCard';

type Status = 'loading' | 'ready' | 'failed' | 'empty';

const INTENT_LABEL: Record<CallReport['intent'], string> = {
  new_claim: 'New claim',
  policy_question: 'Policy question',
  claim_follow_up: 'Claim follow-up',
  other: 'General enquiry',
};

interface Props {
  snapshot: CallSnapshot;
  onNewCall: () => void;
}

export function SummaryView({ snapshot, onNewCall }: Props) {
  const { transcript, caseState, startedAt, endedAt } = snapshot;
  const [report, setReport] = useState<CallReport | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState('');
  const [copied, setCopied] = useState(false);

  const duration = startedAt && endedAt ? (endedAt - startedAt) / 1000 : 0;
  const spoken = useMemo(() => transcript.filter((l) => l.text.trim()), [transcript]);

  useEffect(() => {
    if (!spoken.length) {
      setStatus('empty');
      return;
    }

    const payload: ReportRequest = {
      transcript: spoken.map((l) => ({ speaker: l.speaker, text: redact(l.text) })),
      claim: caseState.claim,
      citations: caseState.citations.map(({ clause_ref, title, quote, meaning, effect }) => ({
        clause_ref,
        title,
        quote,
        meaning,
        effect,
      })),
      coverage: caseState.coverage,
      payout: caseState.payout,
      nextSteps: caseState.nextSteps,
      durationSeconds: Math.round(duration),
    };

    const controller = new AbortController();
    fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.report) throw new Error(body.message ?? 'The summary service did not respond.');
        setReport(body.report);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setFailure(err instanceof Error ? err.message : String(err));
        setStatus('failed');
      });

    return () => controller.abort();
    // Built once from the finished call; the snapshot doesn't change after hang-up.
  }, []);

  const notes = useMemo(
    () => Object.fromEntries((report?.clause_notes ?? []).map((n) => [n.ref, n.why_it_matters])),
    [report],
  );

  const title =
    report?.title ??
    (caseState.claim.claim_type
      ? `${caseState.claim.claim_type[0].toUpperCase()}${caseState.claim.claim_type.slice(1)} claim enquiry`
      : 'Call summary');

  const nextSteps = report?.next_steps.length
    ? { steps: report.next_steps, documents: report.documents, deadline: caseState.nextSteps?.deadline }
    : caseState.nextSteps;

  const printReport = () => {
    // Expand the transcript so it makes it into the PDF.
    document.querySelectorAll('details').forEach((d) => (d.open = true));
    window.print();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(toPlainText(title, report, snapshot, duration));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (status === 'empty') {
    return (
      <main className="summary summary-empty">
        <section className="glass panel">
          <Icon name="info" />
          <h1>Nothing to summarise</h1>
          <p>The call ended before anything was said. Start another one whenever you are ready.</p>
          <button className="btn btn-primary btn-lg" onClick={onNewCall}>
            <Icon name="phone" />
            Start a new call
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="summary">
      <header className="summary-head">
        <div>
          <p className="eyebrow">
            Hand-off note · {formatDuration(duration)} call ·{' '}
            {new Date(endedAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <h1>{status === 'loading' ? <span className="skeleton skeleton-title" /> : title}</h1>
          <div className="summary-tags">
            {report && <span className="chip">{INTENT_LABEL[report.intent]}</span>}
            {report && report.caller_sentiment !== 'unknown' && (
              <span className="chip">Caller seemed {report.caller_sentiment}</span>
            )}
            {caseState.coverage && <span className="chip chip-accent">{verdictLabel(caseState.coverage.verdict)}</span>}
            {caseState.payout && <span className="chip">Est. payable {formatINR(caseState.payout.payable)}</span>}
          </div>
        </div>
        <div className="summary-actions no-print">
          <button className="btn btn-primary" onClick={printReport} disabled={status === 'loading'}>
            <Icon name="download" />
            Download PDF
          </button>
          <button className="btn btn-quiet" onClick={copy} disabled={status === 'loading'}>
            <Icon name={copied ? 'check' : 'copy'} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="btn btn-text" onClick={onNewCall}>
            <Icon name="refresh" />
            New call
          </button>
        </div>
      </header>

      {status === 'failed' && (
        <div className="alert no-print" role="status">
          <Icon name="info" />
          <span>
            Couldn&rsquo;t write the summary ({failure}). Everything captured during the call is still below.
          </span>
        </div>
      )}

      <div className="summary-grid">
        <div className="summary-main">
          <section className="glass panel">
            <h3 className="eyebrow">Summary</h3>
            {status === 'loading' ? (
              <div className="skeleton-block" aria-label="Writing the hand-off note">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton short" />
                <p className="hint">Writing the hand-off note with Gemini 3 Flash…</p>
              </div>
            ) : (
              <p className="summary-text">
                {report?.summary ?? 'The written summary is unavailable, but the claim details and cited clauses are below.'}
              </p>
            )}
            {report?.coverage_explanation && <p className="summary-text muted">{report.coverage_explanation}</p>}
          </section>

          <ClauseList citations={caseState.citations} notes={notes} empty="No clauses were cited on this call." />

          {report && (report.flags.length > 0 || report.open_questions.length > 0) && (
            <section className="glass panel flags">
              {report.flags.length > 0 && (
                <>
                  <h3 className="eyebrow">Check before processing</h3>
                  <ul>
                    {report.flags.map((f, i) => (
                      <li key={i}>
                        <Icon name="alert" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {report.open_questions.length > 0 && (
                <>
                  <h3 className="eyebrow">Still unknown</h3>
                  <ul>
                    {report.open_questions.map((q, i) => (
                      <li key={i}>
                        <Icon name="info" />
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <details className="glass panel transcript-full">
            <summary>
              <span className="eyebrow">Full transcript</span>
              <span className="chip">{spoken.length} turns</span>
            </summary>
            <ol>
              {spoken.map((line) => (
                <li key={line.id} className={`line-${line.speaker}`}>
                  <strong>{line.speaker === 'caller' ? 'Caller' : 'Covered'}</strong>
                  <span>{redact(line.text)}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>

        <aside className="summary-side">
          <ClaimFileCard claim={caseState.claim} compact />
          <CoverageCard coverage={caseState.coverage} />
          <PayoutCard payout={caseState.payout} />
          <NextStepsCard next={nextSteps} />
        </aside>
      </div>
    </main>
  );
}

function toPlainText(title: string, report: CallReport | null, snapshot: CallSnapshot, duration: number) {
  const { claim, citations, coverage, payout } = snapshot.caseState;
  const lines = [title, `Call length: ${formatDuration(duration)}`, ''];

  if (report?.summary) lines.push(report.summary, '');

  const facts = Object.entries(claim).filter(([, v]) => v !== undefined && v !== '');
  if (facts.length) {
    lines.push('CLAIM DETAILS');
    facts.forEach(([k, v]) => lines.push(`- ${k.replace(/_/g, ' ')}: ${k === 'claim_amount' ? formatINR(v as number) : v}`));
    lines.push('');
  }
  if (coverage) lines.push(`COVERAGE: ${verdictLabel(coverage.verdict)}. ${coverage.summary}`, '');
  if (citations.length) {
    lines.push('CLAUSES');
    citations.forEach((c) => lines.push(`- ${c.clause_ref}${c.title ? ` (${c.title})` : ''}: "${c.quote}"`));
    lines.push('');
  }
  if (payout) {
    lines.push(`ESTIMATE: ${formatINR(payout.payable)} payable of ${formatINR(payout.claimed)} claimed`);
    payout.steps.forEach((s) => lines.push(`- ${s.label}: ${formatINR(s.change)} → ${formatINR(s.running)}`));
    lines.push('');
  }
  if (report?.next_steps.length) {
    lines.push('NEXT STEPS');
    report.next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  if (report?.flags.length) {
    lines.push('FLAGS');
    report.flags.forEach((f) => lines.push(`- ${f}`));
  }
  return lines.join('\n').trim();
}
