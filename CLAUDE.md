# Finanzas personales

App web de seguimiento de gastos, de un solo usuario. Objetivo: registrar todos
los gastos —cargados a mano o importados de un resumen de tarjeta— y entender
en qué se va la plata.

**Esto no lleva balances.** No hay ingresos, ni saldos, ni patrimonio. Todo lo
que llega a `transactions` es plata que salió. Es la restricción que mantiene la
app simple: no hay que decidir si algo suma o resta, todo resta.

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
- [x] Usuario creado en auth + seed corrido (20 categorías de gasto)
- [x] Scaffold de Next.js 16 (App Router, Tailwind v4, `@supabase/ssr`)
- [x] Fase 1 construida: alta manual, vista del mes, filtros
- [x] Importador de resúmenes Galicia y Supervielle (VISA y MASTERCARD) con gate
      de reconciliación, con la cuenta inferida del propio resumen
- [x] Carga provisoria del mes en curso pegando la lista del home banking
- [ ] Fase 1 aceptada: una semana de gastos reales cargados sin que dé fastidio
- [x] Deploy en Vercel: https://finanzas-personales-rouge-eta.vercel.app

El esquema del remoto está versionado en `supabase/migrations/`. Los nombres de
archivo coinciden con las versiones registradas (`20260914112501_init`,
`20260914134533_add_installment_kind`, `20260914140347_add_statement_period`,
`20260914170801_add_provisional_imports`), así que `db push` no los reaplica.

## Contexto de dominio: Argentina

Esto no es un tracker genérico. Las reglas que siguen no son opcionales.

**Multi-moneda.** Cada transacción guarda su monto y moneda originales, siempre.
La conversión es un problema de lectura, nunca de escritura: se resuelve en
`v_transactions_ars` contra `fx_rates` a la fecha de la operación. Nunca
pesificar al insertar.

**El resumen manda sobre la fecha de compra.** Un movimiento que viene de un
resumen de tarjeta pertenece al mes del resumen, no al de la compra: el resumen
de agosto trae compras de junio y julio, pero la plata sale en agosto. Se guarda
en `transactions.statement_period` (`YYYY-MM`), y la vista del mes agrupa por ahí
cuando está y por `occurred_on` cuando no. `occurred_on` nunca se pisa: la fecha
real de la compra no se puede recuperar después. Solo aplica a cuentas de
tarjeta; un extracto bancario no tiene esa demora.

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

**Refinanciación.** Líneas tipo `PLAN V CONSOLID 5-12` son servicio de deuda, no
compras. El lector las marca `financing`, y como traen número de cuota entran
como **Cuota** con categoría "Financiacion".

**Impuestos.** IVA, IIBB, percepciones RG 4240 y RG 5617 son gastos reales. El
lector las marca `tax_fee` y entran como **Gasto** con categoría "Impuestos":
siguen separadas de las compras por categoría, no por tipo.

## Decisiones de modelo (y por qué)

**La tarjeta se modela a nivel resumen, no por plástico.** Las tarjetas 1234 y
5678 son una sola cuenta `Galicia VISA` porque se pagan juntas con un solo pago.
El número de plástico va en `transactions.card_last4`. Si fueran cuentas
separadas, el pago del resumen no tendría a qué imputarse.

**`kind` separa la semántica económica.** Valores: `consumption`, `installment`,
`income`, `payment`, `refund`, `tax_fee`, `financing`, `transfer`.

**Dos tipos de gasto y nada más** (`EXPENSE_KINDS`): `consumption` (Gasto) e
`installment` (Cuota). La regla es mecánica: **lo que tiene marca de cuota es
cuota, todo lo demás es gasto** (`toExpenseKind`). Impuestos, percepciones e
intereses son plata que salió, así que son gastos; una devolución es un gasto
con monto negativo, que resta solo sin necesitar un tipo aparte.

El lector de resúmenes *sí* distingue `tax_fee`, `financing` y `refund`, porque
los necesita para clasificar bien cada línea y sobre todo para reconocer lo que
**no** es un gasto. Esa clasificación se colapsa a los dos tipos al pasar a
staging. Una taxonomía más fina obligaba a decidir en cada carga a qué cajón va
algo, y la respuesta casi siempre era "es plata que gasté".

Los dos tipos **comparten las mismas categorías** (todas de familia `expense`).
Si la cuota tuviera familia propia, una compra financiada dejaría de decir en
qué se fue la plata.

`income`, `payment` y `transfer` siguen siendo valores válidos en la base porque
**el importador los necesita para transcribir un resumen y que reconcilie**, pero
nunca llegan a `transactions`: nacen con `status = 'discarded'` en el staging. Un
pago de tarjeta no es un gasto nuevo —ese consumo ya se contó cuando se compró— y
contarlo sería sumar la misma plata dos veces. La pantalla de revisión los lista
aparte, para que se vea que la transcripción está completa.

La línea es: **`import_rows` es transcripción fiel del resumen; `transactions` son
solo gastos.**

Tampoco se muestran saldos por cuenta. `balanceSign` sigue documentado y testeado
porque es lo que ancla `normalizeAmountForKind`, pero ninguna pantalla lo usa.

**`fingerprint` con índice único parcial** sobre `(user_id, fingerprint)` es la
red anti-duplicados. Se calcula sobre cuenta + fecha + monto ya normalizado +
moneda + descripción normalizada + plástico + número de cuota. Si se sube el
mismo resumen dos veces, la base lo rechaza.

El **número de cuota no es opcional** en esa huella: la cuota 1/3 y la 2/3 de la
misma compra comparten fecha, monto y descripción (el `01/03` se limpia al
normalizar), así que sin él la segunda parece un duplicado de la primera y el
resumen del mes siguiente se rechaza entero. La **cuenta** tampoco: el mismo
consumo en dos tarjetas son dos movimientos reales. Se calcula sobre el monto
ya normalizado, el mismo que queda guardado, para poder recomputarla desde la
fila sin volver al PDF.

**Montos en `numeric(18,2)`.** Nunca float. En el cliente, enteros en centavos.
Todo pasa por `src/lib/money.ts`: parseo de lo que se tipea, string para la base
armado con aritmética entera, y `centsFromDb` que redondea al centavo porque lo
que devuelve PostgREST para un `numeric` es un number de JSON y `2311332.70` no
es exacto en binario.

**`amount` se guarda siempre positivo; la dirección la da `kind`.** Es lo que
permite que el importador compare la suma de las filas extraídas contra el total
declarado del resumen sin traducir signos en el medio: el resumen lista consumos
en positivo y así se transcriben. El efecto sobre el saldo lo resuelve
`balanceSign(kind, isLiability)` en `src/lib/domain.ts`. El único kind que
depende de la cuenta es `payment`: es una sola operación con dos patas, sale del
banco y cancela deuda de la tarjeta. El saldo es con signo y desde el punto de
vista de la cuenta, así que una tarjeta con deuda da negativo. `transfer` todavía
no tiene dirección asignada; se define cuando la fase 2 modele el par de filas.

## Pipeline de importación de resúmenes

```
PDF/CSV → Storage → extracción → RECONCILIACIÓN → staging + revisión → transactions
```

**La reconciliación es un gate, no un warning.** La suma de las filas extraídas
tiene que igualar el total declarado del resumen, al centavo, en cada moneda por
separado. Si no cierra, el import se rechaza entero y no se escribe nada. Un LLM
leyendo un PDF puede saltear una fila en silencio; esto convierte corrupción
silenciosa en falla ruidosa.

**La cuenta se infiere, no se elige.** Elegirla a mano en cada carga es un paso
que se hace en automático hasta el día que se equivoca, y un resumen imputado a
la cuenta que no es no falla: el gate compara la suma del PDF contra el total
del propio PDF, no contra la cuenta. Sólo ensucia totales y huellas en silencio.
`match-account.ts` decide con dos señales, en ese orden: el **plástico** (si un
plástico ya dejó movimientos en una cuenta, el resumen que la trae es de esa
cuenta: es un hecho observado y funciona con cualquier nombre) y el **nombre**
(banco + marca contra el nombre normalizado de la cuenta, que es lo único que hay
para el primer resumen de una tarjeta). Si ninguna decide sola —empate o ninguna
candidata— no se adivina: se pide elegirla. La inferencia se corrige en la
pantalla de revisión, que es mientras todavía es barato: después de confirmar, la
cuenta ya es parte de la huella de cada movimiento. Si la cuenta que quedó
contradice al resumen (nombra otro banco u otra marca) la revisión avisa; el
silencio por ausencia no es contradicción, una cuenta llamada "Tarjeta principal"
no contradice nada.

**El mes en curso se adelanta pegando, y es provisorio.** El resumen del mes
corriente no cerró, así que no hay PDF, pero los consumos ya están en el home
banking. `pegado.ts` lee esa tabla copiada y la mete por el mismo pipeline:
mismo gate, mismo staging, misma pantalla de revisión. Lo que entra así queda
con `is_projected = true` y el import con `provisional = true`, y **al confirmar
un import se borra primero todo lo provisorio de esa cuenta y ese período**: el
PDF real pisa lo pegado, y un pegado nuevo a mitad de mes pisa al anterior. El
borrado va antes del insert porque las filas repetidas comparten huella y la
base rechazaría el import entero por duplicado en vez de reemplazarlo. La vista
del mes cuenta lo provisorio en los totales —para eso se carga— pero dice
cuántos son: un total que mezcla lo cerrado con lo que todavía puede cambiar y
no lo aclara es un número que engaña.

Lo que cambia respecto de un PDF es **qué total declara la fuente**. Un resumen
cerrado declara un saldo a pagar y el pago del mes anterior está adentro de ese
número. El home banking declara el total consumido del período y deja el pago
afuera. Por eso `ParsedStatement.outsideTotal`: el pago se transcribe y se
muestra en la revisión —que aparezca es la prueba de que la transcripción está
completa— pero no entra en la suma que el gate compara. Sumarlo haría fallar el
gate por el monto del pago, que es enorme al lado de cualquier compra.

Una tabla pegada tampoco dice de qué banco es: adentro del home banking ya se
sabe. Por eso `StatementIdentity.bank` admite `null`, y ahí la cuenta se infiere
sólo por el plástico. El nombre no se usa sin banco: "Visa" sola matchearía la de
Galicia y la de Supervielle por igual, y elegir cualquiera de las dos es justo el
error que la inferencia existe para evitar. Y hay tablas que no traen ni
plástico: ahí no hay nada que inferir y se pide elegir la cuenta, diciendo eso y
no "no encontré una cuenta que corresponda a *sin marca*".

**Un solo lector para las tablas pegadas, al revés que con los PDF.** Los
resúmenes cerrados no comparten casi nada y por eso tienen un lector cada uno.
Las tablas pegadas sí comparten la forma: **un movimiento es un grupo de celdas
que termina en su importe**. Lo que cambia entre bancos es el *orden* de los
campos —uno pone la fecha primero y el otro la descripción, uno el `Total` al
final y el otro arriba de todo, uno la cuota en su propia celda y el otro pegada
a la fecha— y a ese modelo el orden no le importa. Un lector por banco sería
duplicar todo para distinguir algo que no hace falta distinguir.

Dos reglas sostienen el modelo. Los totales se leen **hasta la primera línea que
no es un monto**, así el `Total` de arriba no se come el primer movimiento. Y una
**segunda fecha dentro del mismo bloque** lo corta: significa que al anterior le
faltó el importe, y cortarlo ahí lo deja sin monto y termina en
`unparsedLines` en vez de fundirse con el siguiente, que es la fila perdida en
silencio que el lector existe para evitar.

**Dos líneas `Total` se rechazan en vez de sumarse.** Serían dos tablas pegadas
una atrás de la otra, pero sumarlas también dejaría pasar el pegado repetido por
accidente: las filas se duplican, el total se duplica, el gate cierra igual y el
mes queda contado dos veces. El `seq` de la huella no salva ahí, porque está
hecho justamente para permitir dos movimientos idénticos de verdad.

**Un lector por banco.** `detect.ts` reconoce el emisor por la estructura —cómo
se llaman los totales— y no por el nombre del banco, que puede aparecer en la
letra chica de cualquier resumen. Galicia y Supervielle no comparten casi nada:
fechas `DD-MM-YY`/`DD-Mon-YY` contra ISO, `TOTAL A PAGAR` contra `SALDO ACTUAL`,
comprobante después contra antes de la descripción. Meterlos en un solo parser
deja una maraña donde tocar un banco rompe el otro.

El PDF de Supervielle mete **un espacio después de cada `S`** (`IMPUES TO DE S
ELLOS`). Es sistemático, así que se repara antes de parsear. El costo es que un
nombre con una palabra terminada en S se pega a la siguiente; es cosmético y
estable, y sin reparar el patrón de `MERPAGO*S OLUCIONES` queda en `MERPAGO S` y
agrupa comercios distintos.

Las filas de Supervielle traen **las dos columnas**, pesos y dólares, con una en
cero: tomar el último monto de la línea —como se hace en Galicia— leería `0,00`
en toda fila que traiga ambas.

**Extracción y categorización son pasos distintos.** La extracción es
transcripción y tiene que ser exacta. La categorización es criterio y un error
ahí solo molesta. Distintas tolerancias, distinto manejo.

**Categorización en dos niveles.** Primero `merchant_rules` (match determinístico
sobre la descripción normalizada, cero latencia y cero costo). Solo los comercios
desconocidos van al LLM. Cada corrección en la pantalla de revisión escribe una
regla nueva, así el sistema se calla con el tiempo.

**Nada llega a `transactions` sin pasar por `import_rows` y la pantalla de
revisión.** Sin excepciones.

**En el repo no va ningún dato de resúmenes**, solo la lógica de cómo leerlos.
Los tests del parser usan resúmenes inventados con el formato real; `.gitignore`
bloquea PDFs y JSON extraídos.

## Plan por fases

0. **Fundaciones** — scaffold, migración, seed, deploy vacío. Casi listo.
1. **El loop** — alta manual, vista del mes. Criterio de aceptación: una semana
   de gastos reales cargados sin que dé fastidio.
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
