import type { ElementType } from 'react';

interface Props {
  as?: ElementType;
  /** Set in solid black. */
  lead?: string;
  /** Words fade from dark grey to light grey, the nsoffice.ai headline treatment. */
  fade: string;
  className?: string;
}

const FROM = [62, 62, 62];
const TO = [205, 205, 210];

function shade(i: number, total: number) {
  const t = total <= 1 ? 0 : i / (total - 1);
  const c = FROM.map((from, k) => Math.round(from + (TO[k] - from) * t));
  return `rgb(${c.join(' ')})`;
}

export function FadeHeading({ as: Tag = 'h1', lead, fade, className = '' }: Props) {
  const leadWords = lead ? lead.split(' ') : [];
  const fadeWords = fade.split(' ');
  let index = 0;

  return (
    <Tag className={`display fade-words ${className}`}>
      {leadWords.map((word) => (
        <span key={`l${index}`} style={{ animationDelay: `${index++ * 55}ms` }}>
          {word}&nbsp;
        </span>
      ))}
      {lead && <br />}
      {fadeWords.map((word, i) => (
        <span key={`f${i}`} style={{ color: shade(i, fadeWords.length), animationDelay: `${index++ * 55}ms` }}>
          {word}
          {i < fadeWords.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}
