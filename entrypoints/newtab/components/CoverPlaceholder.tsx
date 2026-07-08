import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface CoverPlaceholderProps {
  /**
   * Stable per-source key the gradient hue is derived from—same key always
   * yields the same colors. Callers pass the article's hostname.
   */
  seed: string;
  /** Source name; its first letter becomes the centered monogram. */
  label: string;
  className?: string;
}

/**
 * FNV-1a 32-bit hash of a string → a stable, non-negative integer. Cheap and
 * deterministic (no Math.random), which is what lets the same source render the
 * same cover on every mount.
 */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A generated stand-in cover for items that ship no image (aggregators like
 * Hacker News and Lobsters). It fills the same slot and geometry as a real
 * cover so the two are visually interchangeable.
 *
 * The look is a gentle two-stop gradient whose hues come from a hash of the
 * source key, laid over the neutral `bg-muted` token. The hues are applied with
 * low alpha rather than as opaque fills, so the same tint reads correctly on
 * both the light and dark card backgrounds. A low-contrast source monogram sits
 * on top. Fully local—no network, no per-render randomness.
 */
export function CoverPlaceholder({
  seed,
  label,
  className,
}: CoverPlaceholderProps) {
  const { backgroundImage, glyph } = useMemo(() => {
    const hue = hashString(seed || label) % 360;
    const hue2 = (hue + 38) % 360;
    return {
      // Translucent hues over bg-muted keep the tint subtle and theme-agnostic.
      backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 55% / 0.28), hsl(${hue2} 55% 50% / 0.12))`,
      glyph: (label.trim()[0] ?? '?').toUpperCase(),
    };
  }, [seed, label]);

  return (
    <div
      data-slot="cover-placeholder"
      aria-hidden="true"
      style={{ backgroundImage }}
      // Match the real cover's geometry exactly (full-width 16:9, flush to the
      // card edges via the card's own clip) so one can stand in for the other
      // without any visible shift. No margins or rounding of its own; the card
      // handles both.
      className={cn(
        'bg-muted flex aspect-video w-full items-center justify-center',
        className,
      )}
    >
      <span className="text-foreground/25 text-4xl font-semibold select-none">
        {glyph}
      </span>
    </div>
  );
}
