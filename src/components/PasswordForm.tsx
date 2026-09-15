"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { campo as field, etiqueta as label } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, {});

  return (
    <form action={action} className="max-w-sm space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="password">
          Nueva contrasena
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="confirm">
          Repetir
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </div>

      {state.error ? (
        <Aviso tono="negativo">
          {state.error}
        </Aviso>
      ) : null}
      {state.ok ? (
        <Aviso tono="positivo">
          {state.ok}
        </Aviso>
      ) : null}

      <SubmitButton>Cambiar contrasena</SubmitButton>
    </form>
  );
}
