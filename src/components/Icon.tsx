import type { SVGProps } from 'react';

// Small hand-picked icon set, 24px grid, 1.75 stroke. Keeps the bundle free of an icon library.
const paths = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 9.5V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10.7 5M18.5 11a6.4 6.4 0 0 1-.5 2.5M12 17.5V21M4 4l16 16" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2.5" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
  screenOff: (
    <>
      <path d="M7 4h11.5A2.5 2.5 0 0 1 21 6.5v7.5c0 .9-.5 1.7-1.2 2.1M16.5 16.5H5.5A2.5 2.5 0 0 1 3 14V6.5c0-.8.4-1.5 1-2" />
      <path d="M8.5 20h7M12 16.5V20M3 3l18 18" />
    </>
  ),
  hangup: (
    <path d="M3.2 14.4c-.4-.9-.2-2 .6-2.6C6 10 8.9 9 12 9s6 1 8.2 2.8c.8.6 1 1.7.6 2.6l-.6 1.3a1.6 1.6 0 0 1-2 .8l-2.7-1a1.6 1.6 0 0 1-1-1.7l.2-1.3a11 11 0 0 0-5.4 0l.2 1.3a1.6 1.6 0 0 1-1 1.7l-2.7 1a1.6 1.6 0 0 1-2-.8z" />
  ),
  phone: (
    <path d="M6.6 3.5h2.2c.7 0 1.3.5 1.5 1.2l.7 3c.1.6-.1 1.2-.6 1.5l-1.6 1.1a11.5 11.5 0 0 0 4.9 4.9l1.1-1.6c.3-.5.9-.7 1.5-.6l3 .7c.7.2 1.2.8 1.2 1.5v2.2c0 1-.8 1.8-1.8 1.8A15.6 15.6 0 0 1 4.8 5.3c0-1 .8-1.8 1.8-1.8z" />
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
    </>
  ),
  send: <path d="M5 12h13M13 6l6 6-6 6" />,
  doc: (
    <>
      <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
      <path d="M14 3v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  pin: (
    <>
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />
      <path d="M12 14v6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3l1.7-1.8M20 20v-4.5h-4.5" />,
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.3-4.4" />
    </>
  ),
  calc: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7h7M9 11.5h.01M12 11.5h.01M15 11.5h.01M9 15h.01M12 15h.01M15 15v2.5M9 18h3" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  waves: <path d="M3 12h2M7 8v8M11 5v14M15 8.5v7M19 10.5v3M21 12h0" />,
  sparkle: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9zM18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
