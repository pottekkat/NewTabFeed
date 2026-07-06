/**
 * The NewTabFeed brand mark: an RSS glyph on a rounded orange tile.
 *
 * Two white RSS "wave" arcs and a white broadcast dot on an orange (#F97316)
 * rounded square — the clean, canonical RSS look. This is the single source of
 * truth for the logo across every surface (newtab header, onboarding, popup);
 * `assets/icon.svg` mirrors it for the generated PNG extension icons.
 */
export function Logo({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect width="128" height="128" rx="28" fill="#F97316" />
      <g stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" fill="none">
        <path d="M38 62 A28 28 0 0 1 66 90" />
        <path d="M38 40 A50 50 0 0 1 88 90" />
      </g>
      <circle cx="38" cy="90" r="11" fill="#FFFFFF" />
    </svg>
  );
}
