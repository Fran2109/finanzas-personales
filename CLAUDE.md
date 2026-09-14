# Finanzas personales

App web de control de finanzas personales de un solo usuario. Objetivo: registrar
gastos e ingresos, entender en qué se va la plata, y poder importar resúmenes de
tarjeta sin cargar todo a mano.

## Stack

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Postgres 17 + Auth + Storage), proyecto `finanzas-personales`
- Deploy en Vercel

```
SUPABASE_PROJECT_REF = tqdjpnxidmypsrlnvmdv
NEXT_PUBLIC_SUPABASE_URL = https://tqdjpnxidmypsrlnvmdv.supabase.co
```

La key publishable va en `.env.local`, nunca commiteada. Usar la publishable
(`sb_publishable_...`), no la anon legacy.

## Estado actual

- [x] Proyecto Supabase creado, región sa-east-1
- [x] Migración inicial aplicada (versión remota `20260914112501`)
- [x] 9 tablas con RLS, 9 políticas, vista `v_transactions_ars`
- [ ] Usuario creado en auth + seed corrido
- [ ] Scaffold de Next.js
- [ ] Fase 1: alta manual + vista del mes

## Contexto de dominio: Argentina

Esto no es un tracker genérico. Las reglas que siguen no son opcionales.

**Multi-moneda.** Cada transacción guarda su monto y moneda originales, siempre.
La conversión es un problema de lectura, nunca de escritura: se resuelve en
`v_transactions_ars` contra `fx_rates` a la fecha de la operación. Nunca
pesificar al insertar.

**Cuotas.** Una compra en 12 cuotas es una decisión que genera 12 salidas de
caja. Se modela como `installment_plans` + N filas en `transactions` con
`is_projected = true` hasta que se confirman. Al importar un resumen, si una
cuota corresponde a un plan ya existente hay que enlazarla, no crear una compra
nueva.

**Lo que no es gasto.** Estas líneas aparecen en los resúmenes y NO son consumo:
`SALDO ANTERIOR`, `SU PAGO EN PESOS`, `SU PAGO EN USD`, `PAGO MINIMO`. El pago
de la tarjeta es una transferencia desde el banco hacia la tarjeta. Si se cuenta
el consumo del resumen Y el pago desde la cuenta bancaria, todo se duplica. Este
es el bug más común del dominio.

**Refinanciación.** Líneas tipo `PLAN V CONSOLID 5-12` son servicio de deuda,
no compras. Van con `kind = 'financing'` y categoría "Costos financieros".

**Impuestos.** IVA, IIBB, percepciones RG 4240 y RG 5617 son gastos reales pero
no consumo. Van con `kind = 'tax_fee'`. Si se mezclan con las compras,
distorsionan cualquier análisis por categoría.

## Decisiones de modelo (y por qué)

**La tarjeta se modela a nivel resumen, no por plástico.** Las tarjetas 1234 y
5678 son una sola cuenta `Galicia VISA` porque se pagan juntas con un solo pago.
El número de plástico va en `transactions.card_last4`. Si fueran cuentas
separadas, el pago del resumen no tendría a qué imputarse.

**`kind` separa la semántica económica.** Valores: `consumption`, `income`,
`payment`, `refund`, `tax_fee`, `financing`, `transfer`. Los reportes de gasto
filtran por `consumption` y `refund`. Todo lo demás se excluye.

**`fingerprint` con índice único parcial** sobre `(user_id, fingerprint)` es la
red anti-duplicados. Se calcula sobre fecha + monto + descripción normalizada.
Si se sube el mismo resumen dos veces, la base lo rechaza.

**Montos en `numeric(18,2)`.** Nunca float. En el cliente, enteros en centavos.

## Pipeline de importación de resúmenes

```
PDF/CSV → Storage → extracción → RECONCILIACIÓN → staging + revisión → transactions
```

**La reconciliación es un gate, no un warning.** La suma de las filas extraídas
tiene que igualar el total declarado del resumen, al centavo, en cada moneda por
separado. Si no cierra, el import se rechaza entero y no se escribe nada. Un LLM
leyendo un PDF puede saltear una fila en silencio; esto convierte corrupción
silenciosa en falla ruidosa.

**Extracción y categorización son pasos distintos.** La extracción es
transcripción y tiene que ser exacta. La categorización es criterio y un error
ahí solo molesta. Distintas tolerancias, distinto manejo.

**Categorización en dos niveles.** Primero `merchant_rules` (match determinístico
sobre la descripción normalizada, cero latencia y cero costo). Solo los comercios
desconocidos van al LLM. Cada corrección en la pantalla de revisión escribe una
regla nueva, así el sistema se calla con el tiempo.

**Nada llega a `transactions` sin pasar por `import_rows` y la pantalla de
revisión.** Sin excepciones.

Hay un fixture real en `fixtures/resumen-galicia-2026-08.json`: un resumen
Galicia VISA de agosto/26, 50 filas, que reconcilia exacto en ARS (2.311.332,70)
y USD (31,71). Sirve para testear el importador sin volver a parsear el PDF.

## Plan por fases

0. **Fundaciones** — scaffold, migración, seed, deploy vacío. Casi listo.
1. **El loop** — alta manual, vista del mes, saldo por cuenta. Criterio de
   aceptación: una semana de gastos reales cargados sin que dé fastidio.
2. **Multi-moneda y cuotas** — cron de cotizaciones, toggle de moneda, planes
   de cuotas, transferencias, calendario de compromisos.
3. **Fricción de carga** — parser de texto libre (regex primero, LLM como
   fallback), import de resúmenes, plantillas de recurrentes.
4. **Analítica** — real vs nominal con IPC, tasa de ahorro, patrimonio en USD,
   presupuestos, detección de anomalías.

**Cada fase termina deployada y en uso.** El modo de falla de este proyecto no
es quedarse sin ideas, es tener las fases 2 y 4 a medias en paralelo y perder el
hilo. Si una fase lleva más de dos fines de semana, se le recorta el alcance.

No empezar por el importador. Sin haber cargado transacciones a mano no se sabe
qué campos molestan de verdad.

## Convenciones

- Los nombres de archivo en `supabase/migrations/` tienen que coincidir con las
  versiones registradas en el remoto, o `db push` intenta reaplicar y falla.
- RLS activo en todas las tablas, siempre, aunque haya un solo usuario.
- `fx_rates` es data de referencia compartida: lectura para `authenticated`,
  escritura solo desde el cron con `service_role`.
- Los resúmenes contienen CUIT y domicilio. Si se manda el PDF a una API, sacar
  el bloque de cabecera antes.
