import logoUrl from "@/assets/kinetics-logo.png";

export function KineticsLogo({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={logoUrl} alt="Kinetics Group" className={className} />;
}
