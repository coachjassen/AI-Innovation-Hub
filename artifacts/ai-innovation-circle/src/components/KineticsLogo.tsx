export function KineticsLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon points="26,1 4,20 26,39 17,20" fill="hsl(87 70% 45%)" />
      <polygon points="44,7 29,20 44,33 37,20" fill="hsl(126 55% 30%)" />
    </svg>
  );
}
