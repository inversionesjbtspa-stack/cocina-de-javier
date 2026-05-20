import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

export function PremiumPanel({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-lg border border-[#eadfd9] bg-white shadow-[0_18px_45px_rgba(43,16,24,0.06)] ${className}`}
    >
      {children}
    </article>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  href
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "critical";
  href?: string;
}) {
  const tones = {
    neutral: "border-[#eadfd9] bg-white",
    success: "border-emerald-200 bg-emerald-50/60",
    warning: "border-amber-200 bg-amber-50/70",
    critical: "border-red-200 bg-red-50/70"
  };

  const className = `rounded-lg border p-4 transition ${tones[tone]} ${href ? "block hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(43,16,24,0.10)]" : ""}`;
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#7b6f70]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-brand-900">
        {value}
      </p>
      <p className="mt-2 text-sm text-[#6f6263]">{detail}</p>
    </>
  );

  return href ? (
    <Link className={className} href={href as Route}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function ProgressBar({
  value,
  tone = "brand"
}: {
  value: number;
  tone?: "brand" | "gold" | "slate";
}) {
  const color =
    tone === "gold" ? "bg-gold-500" : tone === "slate" ? "bg-[#46515f]" : "bg-brand-700";
  return (
    <div className="h-2 rounded-full bg-[#f1e7e2]">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(4, value))}%` }}
      />
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "critical";
}) {
  const tones = {
    neutral: "border-[#eadfd9] bg-brand-50 text-brand-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    critical: "border-red-200 bg-red-50 text-red-700"
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
