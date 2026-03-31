"use client";

type ProvisionKind = "SENT" | "SKIPPED" | "FAILED";

export default function ProvisionResultInline({
  kind,
  message,
  className,
}: {
  kind: ProvisionKind;
  message: string;
  className?: string;
}) {
  const toneClass =
    kind === "SENT"
      ? "text-green-700"
      : kind === "SKIPPED"
        ? "text-amber-700"
        : "text-red-600";
  return (
    <p className={`text-[11px] mt-1 ${toneClass} ${className ?? ""}`}>
      [{kind}] {message}
    </p>
  );
}
