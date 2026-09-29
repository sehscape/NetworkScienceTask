import { useEffect, useState } from 'react';
import { pageSnapshot } from '../docs/load';
import type { PolicyDocument } from '../docs/types';
import type { PolicyState } from '../hooks/usePolicyDocument';
import { FadeHeading } from './FadeHeading';
import { Icon, type IconName } from './Icon';
import { PolicyDrop } from './PolicyDrop';
import { PolicyGlance } from './PolicyGlance';

interface Props {
  policy: PolicyState;
  onStart: () => void;
  onPrewarm: () => void;
  error?: string;
}

const STEPS: { icon: IconName; title: string; text: string; note: string }[] = [
  {
    icon: 'mic',
    title: 'Say what happened',
    text: 'Describe the claim the way you would to a person, in any Indian language. Interrupt whenever you like.',
    note: 'Hindi, Tamil, Hinglish and more',
  },
  {
    icon: 'doc',
    title: 'Show the policy',
    text: 'Upload the whole policy, however long, or share your screen. Scroll and search it right here while you talk.',
    note: 'PDFs, scans and phone photos',
  },
  {
    icon: 'waves',
    title: 'Hear a straight answer',
    text: 'A short spoken answer, with the clause it rests on highlighted in your policy and the payout worked out exactly.',
    note: 'Every answer cites its clause',
  },
];

const EXAMPLES: { lang: string; text: string }[] = [
  { lang: 'English', text: 'My husband was admitted for dengue for three days. Are we covered?' },
  { lang: 'हिन्दी', text: 'मेरी कार बाढ़ में बंद हो गई, क्या इंजन का क्लेम मिलेगा?' },
  { lang: 'Hinglish', text: 'Room rent 8,000 tha, toh kitna claim milega?' },
  { lang: 'मराठी', text: 'माझ्या वडिलांचं मोतीबिंदूचं ऑपरेशन आहे, क्लेम मिळेल का?' },
  { lang: 'தமிழ்', text: 'என் பாலிசியில் காத்திருப்பு காலம் எவ்வளவு?' },
];

function LoadedPolicy({ doc, policy }: { doc: PolicyDocument; policy: PolicyState }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pageSnapshot(doc, 1).then((jpeg) => !cancelled && jpeg && setPreview(`data:image/jpeg;base64,${jpeg}`));
    return () => {
      cancelled = true;
    };
  }, [doc]);

  return (
    <div className="loaded-policy">
      <div className="loaded-preview">{preview ? <img src={preview} alt="First page of your policy" /> : <span className="loader" />}</div>
      <div className="loaded-meta">
        <span className="chip chip-accent">
          <Icon name="check" /> Ready
        </span>
        <strong title={doc.name}>{doc.name}</strong>
        <span>
          {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'} · {doc.chunks.length} clauses indexed
          {doc.ocr ? ' · text read with OCR' : ''}
        </span>
        <p>
          {doc.contextMode === 'full'
            ? 'The assistant reads the whole policy when the call starts, and you can scroll it during the call.'
            : 'A long one. The assistant searches every clause as you talk, and you can scroll it during the call.'}
        </p>
        <a className="link-btn loaded-glance-link" href="#glance">
          See it at a glance
        </a>
        <div className="loaded-actions">
          <button className="btn btn-quiet" onClick={policy.clear}>
            <Icon name="close" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeView({ policy, onStart, onPrewarm, error }: Props) {
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Live policy &amp; claims assistant</p>
            <FadeHeading lead="Talk through a claim." fade="Hear the clause that decides it." />
            <p className="lede">
              Covered listens as you speak, reads your actual policy, and answers out loud in your language, pointing at
              the exact clause it relied on.
            </p>

            <dl className="stats">
              <div>
                <dt>10+</dt>
                <dd>Indian languages</dd>
              </div>
              <div>
                <dt>50+</dt>
                <dd>page policies searched</dd>
              </div>
              <div>
                <dt>0</dt>
                <dd>clauses made up</dd>
              </div>
            </dl>

            {error && (
              <div className="alert" role="alert">
                <Icon name="alert" />
                <span>{error}</span>
              </div>
            )}

            <div className="hero-actions">
              <button
                className="btn btn-primary btn-lg"
                onClick={onStart}
                onPointerEnter={onPrewarm}
                onFocus={onPrewarm}
                disabled={policy.status === 'loading'}
              >
                <Icon name="phone" />
                {error ? 'Try again' : 'Start a call'}
              </button>
              <p className="hint">Uses your microphone · headphones give the cleanest barge-in</p>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-card">
              <p className="hero-card-label">Your policy · optional</p>
              {policy.doc ? (
                <LoadedPolicy doc={policy.doc} policy={policy} />
              ) : (
                <PolicyDrop
                  status={policy.status}
                  progress={policy.progress}
                  error={policy.error}
                  onFiles={(files) => void policy.fromFiles(files)}
                  onSample={(s) => void policy.fromSample(s)}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {policy.doc && (
        <section className="section glance-section" id="glance">
          <PolicyGlance doc={policy.doc} />
        </section>
      )}

      <section className="section">
        <p className="eyebrow">How it works</p>
        <FadeHeading as="h2" lead="Three steps," fade="no hold music." />
        <div className="step-grid">
          {STEPS.map((step, i) => (
            <article key={step.title} className="card">
              <span className="icon-tile">
                <Icon name={step.icon} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <p className="note">{step.note}</p>
              <span className="numeral">0{i + 1}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="eyebrow">Multilingual</p>
        <FadeHeading as="h2" lead="Ask it the way" fade="you'd ask a person." />
        <p className="section-lede">
          It works out your language from your voice and answers in the same one, even if you switch halfway through.
        </p>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <div key={ex.lang} className="prompt-bar example">
              <span className="example-lang">{ex.lang}</span>
              <span className="example-text">“{ex.text}”</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="home-foot">
        <p>
          Guidance only. Final claim decisions are made by your insurer. The specimen policies are fictional and for
          demonstration.
        </p>
      </footer>
    </main>
  );
}
