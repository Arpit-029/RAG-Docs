export default function BrandMark({ className = "" }) {
  return (
    <span className={`brand-mark ${className}`.trim()} role="img" aria-label="AEOS">
      <span className="brand-glyph" aria-hidden="true">A</span>
      <span className="brand-glyph" aria-hidden="true">E</span>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 40 46" focusable="false">
          <ellipse cx="20" cy="23" rx="16.5" ry="20" />
          <path d="M23.8 7.7 12.6 25.1h7.3l-3.7 13.2 11.2-17.9h-7.1z" />
        </svg>
      </span>
      <span className="brand-glyph" aria-hidden="true">S</span>
    </span>
  )
}
