/**
 * A "hamburger" made of three little dragons: each bar is a wavy body with
 * a forked tail, a bat wing and a horned, open-jawed head. The middle one
 * faces the other way.
 */
function Dragon({ y, flip }: { y: number; flip?: boolean }) {
  return (
    <g transform={flip ? `translate(32 0) scale(-1 1)` : undefined}>
      {/* forked tail + wavy body */}
      <path d={`M5 ${y} l-2.5 -2 M5 ${y} l-2.5 2 M5 ${y} c2.5 -3.2 4.5 3.2 7 0 s4.5 -3.2 7 0 l2.5 -0.6`} />
      {/* bat wing on the back */}
      <path
        d={`M10.5 ${y - 0.6} L12.6 ${y - 5.6} L13.9 ${y - 3.4} L15.6 ${y - 5} L15.9 ${y - 1.4} Z`}
        fill="currentColor"
        strokeWidth={0.8}
      />
      {/* head with an open jaw */}
      <path
        d={`M20.6 ${y - 2.7} L29 ${y - 1.3} L25.4 ${y - 0.1} L28.6 ${y + 1.2} L20.6 ${y + 1.8} Z`}
        fill="currentColor"
        strokeWidth={0.8}
      />
      {/* horn */}
      <path d={`M22.2 ${y - 2.2} l-1.4 -2.4`} strokeWidth={1.4} />
      {/* eye */}
      <circle cx={23.2} cy={y - 1} r={0.8} fill="var(--surface)" stroke="none" />
    </g>
  );
}

export function DragonMenuIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <Dragon y={8} />
      <Dragon y={16.5} flip />
      <Dragon y={25} />
    </svg>
  );
}
