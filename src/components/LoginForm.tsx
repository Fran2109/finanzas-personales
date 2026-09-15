"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { campo as field, etiqueta as label } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className={label} htmlFor="email">
          Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={field}
        />
      </div>
      <div>
        <label className={label} htmlFor="password">
          Contrasena
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </div>

      {state.error ? (
        <Aviso tono="negativo">
          {state.error}
        </Aviso>
      ) : null}

      <SubmitButton className="w-full" pendingLabel="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
