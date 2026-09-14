"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md bg-accent px-4 py-2 text-sm font-medium text-background transition disabled:opacity-50 ${className}`}
    >
      {pending ? (pendingLabel ?? "Guardando...") : children}
    </button>
  );
}
