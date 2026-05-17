import Image from "next/image";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        alt="La Cocina de Javier"
        className="rounded-lg shadow-sm"
        height={compact ? 42 : 54}
        priority
        src="/logo-lcdj.svg"
        width={compact ? 130 : 168}
      />
    </div>
  );
}
