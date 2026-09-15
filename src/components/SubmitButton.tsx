"use client";

import { useFormStatus } from "react-dom";
import { botonAcento } from "@/components/ui/estilos";

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
      className={`${botonAcento} ${className}`}
    >
      {pending ? (pendingLabel ?? "Guardando...") : children}
    </button>
  );
}
