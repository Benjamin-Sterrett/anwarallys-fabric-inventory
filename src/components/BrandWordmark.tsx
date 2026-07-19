import { Link } from 'react-router-dom';

// Interim "Anwarallys" wordmark (Pacifico script) — the single swap point for
// the future SVG vector mark (PRJ follow-up). Pacifico is applied via the
// `font-brand` token ONLY here, never to body/UI text (a script face is
// illegible for body copy). Responsive sizing keeps it legible + non-clipping
// on narrow phones and grounded on desktop (used on both — F18).
//
// `variant` selects the ink: default `brand` (green, on white surfaces) or
// `white` (on the brand-green sidebar/top bar). `className` tunes size/spacing
// per placement. Both variants keep the same `<Link to="/">` + aria-label so
// the mark always routes home.
interface BrandWordmarkProps {
  variant?: 'brand' | 'white';
  className?: string;
}

export default function BrandWordmark({
  variant = 'brand',
  className = '',
}: BrandWordmarkProps) {
  const ink = variant === 'white' ? 'text-white' : 'text-brand';
  return (
    <Link
      to="/"
      aria-label="Anwarallys — home"
      className={`font-brand ${ink} text-xl sm:text-2xl leading-none ${className}`.trim()}>
      Anwarallys
    </Link>
  );
}
