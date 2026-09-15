"use client";

import { useActionState } from "react";
import { createAccount, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { campo as field, etiqueta as label } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export function AccountForm() {
  const [state, action] = useActionState<FormState, FormData>(createAccount, {});

  return (
    <form action={action} className="space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="name">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="off"
          placeholder="Galicia Caja de Ahorro"
          className={field}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 *:min-w-0">
        <div>
          <label className={label} htmlFor="type">
            Tipo
          </label>
          <select id="type" name="type" defaultValue="bank" className={field}>
            <option value="bank">Banco</option>
            <option value="cash">Efectivo</option>
            <option value="credit_card">Tarjeta de credito</option>
            <option value="investment">Inversion</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="currency">
            Moneda
          </label>
          <select id="currency" name="currency" defaultValue="ARS" className={field}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
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

      <SubmitButton>Crear cuenta</SubmitButton>
    </form>
  );
}
