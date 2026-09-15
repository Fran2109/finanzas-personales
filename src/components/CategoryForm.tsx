"use client";

import { useActionState } from "react";
import { createCategory, type FormState } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { campo as field, etiqueta as label } from "@/components/ui/estilos";
import { Aviso } from "@/components/ui/Aviso";

export function CategoryForm() {
  const [state, action] = useActionState<FormState, FormData>(createCategory, {});

  return (
    <form action={action} className="space-y-3" key={state.ok}>
      <div>
        <label className={label} htmlFor="cat-name">
          Nombre
        </label>
        <input id="cat-name" name="name" required autoComplete="off" placeholder="Seguros" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="cat-kind">
          Tipo
        </label>
        {/* Solo las familias que algun tipo de gasto puede usar. Una categoria
            de ingreso o de transferencia no tendria con que usarse. */}
        <select id="cat-kind" name="kind" defaultValue="expense" className={field}>
          <option value="expense">Gasto</option>
          <option value="tax_fee">Impuesto o comision</option>
          <option value="financing">Costo financiero</option>
        </select>
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

      <SubmitButton>Crear categoria</SubmitButton>
    </form>
  );
}
