import { policies } from '../policies';
import { Icon, type IconName } from './Icon';

interface Props {
  onStart: () => void;
  error?: string;
}

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'mic',
    title: 'Say what happened',
    text: 'Describe the claim in your own words, in English, Hindi or a mix of both. Interrupt whenever you like.',
  },
  {
    icon: 'screen',
    title: 'Show the policy',
    text: 'Share the tab with your policy document. The assistant reads the actual clause before it answers.',
  },
  {
    icon: 'waves',
    title: 'Hear a straight answer',
    text: 'A short spoken explanation, with the clause pinned on screen and the payout worked out exactly.',
  },
];

export function HomeView({ onStart, error }: Props) {
  return (
    <main className="home">
      <section className="hero">
        <span className="chip chip-accent">
          <Icon name="sparkle" /> Gemini Live · real-time voice + screen
        </span>
        <h1>
          Talk through a claim.
          <br />
          <span className="hero-accent">Get the clause, not a wall of text.</span>
        </h1>
        <p className="lede">
          Covered is a live voice assistant for insurance policies and claims. It listens as you speak, reads the policy
          on your screen, and explains what it actually says.
        </p>

        {error && (
          <div className="alert" role="alert">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}

        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onStart}>
            <Icon name="phone" />
            {error ? 'Try again' : 'Start a call'}
          </button>
          <p className="hint">Uses your microphone. Headphones give the cleanest barge-in.</p>
        </div>
      </section>

      <section className="steps-row" aria-label="How it works">
        {STEPS.map((step, i) => (
          <article key={step.title} className="glass step-card">
            <span className="step-icon">
              <Icon name={step.icon} />
            </span>
            <span className="step-index mono">0{i + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <section className="try" aria-label="Try it with a sample policy">
        <div className="try-head">
          <h2>No policy to hand?</h2>
          <p>
            Open a specimen policy in a new tab, start a call here, then share that tab. A few things you could ask:
          </p>
        </div>
        <div className="try-grid">
          {Object.values(policies).map((doc) => (
            <article key={doc.id} className="glass try-card">
              <div className="try-card-head">
                <div>
                  <span className="eyebrow">{doc.kind}</span>
                  <h3>{doc.product}</h3>
                </div>
                <a className="btn btn-text" href={`/policy.html?doc=${doc.id}`} target="_blank" rel="noopener">
                  Open <Icon name="external" />
                </a>
              </div>
              <ul>
                {doc.prompts.map((p) => (
                  <li key={p}>“{p}”</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <footer className="home-foot">
        <p>
          Guidance only. Final claim decisions are made by your insurer. Specimen policies are fictional and for
          demonstration.
        </p>
      </footer>
    </main>
  );
}
