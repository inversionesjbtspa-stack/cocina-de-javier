import Image from "next/image";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        alt="La Cocina de Javier"
        className="rounded-md bg-white object-contain shadow-sm"
        height={compact ? 58 : 76}
        priority
        src="/logo-lcdj.gif"
        unoptimized
        width={compact ? 182 : 236}
      />
    </div>
  );
}
