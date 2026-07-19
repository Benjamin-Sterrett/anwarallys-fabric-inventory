import { Link } from 'react-router-dom';

// Interim "Anwarallys" wordmark (Pacifico script) — the single swap point for
// the future SVG vector mark (PRJ follow-up). Pacifico is applied via the
// `font-brand` token ONLY here, never to body/UI text (a script face is
// illegible for body copy). Responsive sizing keeps it legible + non-clipping
// on narrow phones and grounded on desktop (used on both — F18).
export default function BrandWordmark() {
  return (
    <Link
      to="/"
      aria-label="Anwarallys — home"
      className="font-brand text-brand text-xl sm:text-2xl leading-none">
      Anwarallys
    </Link>
  );
}
