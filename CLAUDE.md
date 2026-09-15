# Finanzas personales

App web de seguimiento de gastos, de un solo usuario. Objetivo: registrar todos
los gastos —cargados a mano o importados de un resumen de tarjeta— y entender
en qué se va la plata.

**Esto no lleva balances.** No hay ingresos, ni saldos, ni patrimonio. Todo lo
que llega a `transactions` es plata que salió. Es la restricción que mantiene la
app simple: no hay que decidir si algo suma o resta, todo resta.

## Stack

- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Postgres 17 + Auth + Storage), proyecto `proyectos` — **compartido**
- Deploy en Vercel

```
SUPABASE_PROJECT_REF = tqdjpnxidmypsrlnvmdv
NEXT_PUBLIC_SUPABASE_URL = https://tqdjpnxidmypsrlnvmdv.supabase.co
```

La key publishable va en `.env.local`, nunca commiteada. Usar la publishable
(`sb_publishable_...`), no la anon legacy.

**El proyecto se comparte con job-hunter, y por eso las tablas llevan prefijo.**
El plan free permite solo 2 proyectos activos, asi que las dos apps viven en el
mismo Postgres separadas por nombre: `finanzas_*` aca, `jobhunter_*` alla. El
prefijo va en minusculas porque Postgres baja a minusculas todo identificador
sin comillas. Tres cosas que se siguen de compartir:

- **El historial de migraciones del proyecto es de esta app.** `supabase/migrations/`
  es la unica fuente y `db push` el unico camino. El DDL de job-hunter se aplica
  desde su `schema.sql` y **no se registra** aca: si se registrara, `db push`
  fallaria al ver versiones remotas que no tiene localmente.
- **La service_role key de job-hunter bypassa RLS sobre todo el proyecto**, estas
  tablas incluidas. Antes el aislamiento lo daba el proyecto; ahora no lo da nada.
  El RLS de aca sigue protegiendo al cliente, no a la otra app.
- **Auth es una sola.** Un `auth.users`, un usuario, las mismas credenciales para
  las dos apps. Las cookies no cruzan dominios, asi que cada una se loguea aparte.

## Estado actual

- [x] Proyecto Supabase creado, región sa-east-1
- [x] Migración inicial aplicada (versión remota `20260914112501`)
- [x] 9 tablas con RLS, 9 políticas, vista `finanzas_v_transactions_ars`
- [x] Usuario creado en auth + seed corrido (20 categorías de gasto)
- [x] Scaffold de Next.js 16 (App Router, Tailwind v4, `@supabase/ssr`)
- [x] Fase 1 construida: alta manual, vista del mes, filtros
- [x] Importador de resúmenes Galicia y Supervielle (VISA y MASTERCARD) con gate
      de reconciliación, con la cuenta inferida del propio resumen
- [x] Carga provisoria del mes en curso pegando la lista del home banking
- [x] Calendario de compromisos: cuánto de cada mes que viene ya está gastado
- [ ] Fase 1 aceptada: una semana de gastos reales cargados sin que dé fastidio
- [x] Deploy en Vercel: https://finanzas-personales-rouge-eta.vercel.app

El esquema del remoto está versionado en `supabase/migrations/`. Los nombres de
archivo coinciden con las versiones registradas (`20260914112501_init`,
`20260914134533_add_installment_kind`, `20260914140347_add_statement_period`,
`20260914170801_add_provisional_imports`, `20260914181405_add_cuota_total`,
`20260915120000_rename_tables_prefix`), así que `db push` no los reaplica.

El rename a `finanzas_*` es `alter table ... rename`: preserva datos, índices,
constraints, foreign keys y políticas, no recrea ni mueve nada. Renombra también
los índices, y eso no es cosmético — **el nombre de un índice es único por
schema, no por tabla**, así que un `transactions_pkey` sin dueño es justo la
colisión que el prefijo viene a evitar. Lo que sí rompe es el código deployado
hasta que salga el que usa los nombres nuevos: aplicar y deployar en la misma
ventana.

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

**Los movimientos se editan en la vista del mes, y la huella los sigue.** Mirar
el mes y corregir lo que está mal es el mismo gesto; mandar a otra pantalla en
el medio es lo que hace que las correcciones no se hagan. La regla al editar es
que **la huella siempre describe la fila guardada**: si la edición no toca
ninguno de sus campos —categoría o tipo, que es la mayoría de las ediciones— la
huella queda intacta, y por eso se puede recategorizar uno de dos movimientos
idénticos sin que choque con su gemelo. Si toca alguno, se recalcula, porque una
huella que describe algo que ya no está ahí no protege de nada. El costo es
real: un movimiento editado deja de coincidir con su línea del resumen, así que
reimportar ese resumen lo trae de nuevo. Es la consecuencia honesta de haberse
apartado a propósito de lo que decía el PDF.

Corregir una categoría **puede** escribir una `merchant_rule`, pero con una
casilla apagada por defecto. Automático sería peor: corregir un movimiento no
siempre quiere decir que el comercio entero esté mal clasificado, y reentrenar
sin preguntar arruinaría el próximo resumen en silencio.

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

## Análisis: lo que ya está decidido

La primera pantalla de análisis no describe el pasado, proyecta lo que ya no se
puede cambiar. Las cuotas son entre el **45% y el 52%** de cada mes: sobre esa
parte no hay nada que decidir cuando el mes empieza, y decirlo así es lo único
que convierte el dato en algo accionable.

**Un plan se deduce de las filas, porque `installment_plans` está vacío.** La
misma compra aparece una vez por resumen, así que de cada plan se toma la cuota
más alta vista y desde ahí se proyecta una cuota por mes.

La identidad del plan es **cuenta + cantidad de cuotas + monto de la cuota
redondeado al peso**, y a propósito **no** incluye el comercio. El comercio
parece la parte obvia de la identidad y es justo la que falla: una
refinanciación lleva el número de cuota pegado al nombre (`PLAN V CONSOLID
4-12`, después `5-12`) y el home banking encima la llama distinto que el PDF.
Tres nombres para una sola deuda, que contada por nombre se **triplicaba**. El
redondeo al peso es por el otro lado: una cuota fija puede venir con un centavo
de diferencia entre un resumen y el siguiente, y eso partía el plan en dos.

El límite conocido: dos compras distintas en la misma tarjeta, con la misma
cantidad de cuotas y la misma cuota mensual se leen como una sola. Es más raro
que el caso del nombre, y su error —subestimar— es menos grave que triplicar.
`installment_plans` existe para resolverlo cuando la fase 2 lo modele.

**La fase 4 quedó desactualizada.** "Tasa de ahorro" y "patrimonio en USD" son
incompatibles con "esto no lleva balances": sin ingresos ni saldos no hay con
qué calcularlos. Lo que sí queda pendiente y necesita más historia: real vs
nominal con IPC (en Argentina no es opcional, 2,86M de julio y 3,67M de
septiembre no son plata de la misma calidad), estacionalidad y detección de
anomalías. Nada de eso da con tres meses.

### Los gráficos

**SVG y HTML a mano, del lado del servidor.** No hay librería de gráficos: son
cuatro formas simples, y una dependencia pesa más que todo esto junto y encima
obliga a mandar JavaScript al cliente para dibujar números que el servidor ya
calculó. El hover son `title` nativos; la lista que acompaña a cada gráfico es
la vista de tabla.

**El color se elige por el trabajo que hace, y se valida, no se estima.** Acá
casi todo es magnitud, así que va un solo tono —el acento— y el largo de la
barra hace el resto. Pintar cada categoría de un color distinto gastaría el
canal de identidad en repetir lo que el largo ya dice.

Para "ya estaba decidido vs. decidido este mes" la forma es **énfasis**: el
acento lleva la parte que cuenta la historia y el resto queda en un gris de
contexto. Ese gris es `--chart-track` y **no** es `--muted`: `--muted` es color
de texto y a 1,68:1 contra la superficie el segmento era casi invisible. Los dos
pasos se eligieron corriendo el validador de la skill de dataviz contra cada
superficie: claro `#8f8d86` (ΔE 17,3 a vista normal, 13,2 bajo protanopia) y
oscuro `#6b6864` (ΔE 24,5), los dos ≥3:1. El paso oscuro no es el claro
invertido: se eligió contra `#1b1b1a`.

Las barras van **cuadradas contra el cero y redondeadas en la punta** —el
extremo redondeado marca dónde termina el dato y la base cuadrada lo ancla al
eje—, los segmentos se separan con 2px del color de la superficie y no con un
borde, y se etiquetan **algunas** columnas, no todas: un número sobre cada barra
deja de leerse.

## Responsive

La app se usa en el teléfono tanto como en la compu, así que **nada puede
desbordar a lo ancho**. Un solo elemento que no achica ensancha su columna y
arrastra a todos sus hermanos: el síntoma es que los importes se van de la
pantalla en una lista que no tiene nada de raro.

La causa es casi siempre la misma regla de CSS: **un item de flex o de grid no
baja de su ancho de contenido** (`min-width: auto`). Por eso:

- Toda columna de `grid` que contenga texto largo lleva `min-w-0`, y los grids
  de dos columnas de los formularios llevan `*:min-w-0` — un `<select>` mide lo
  que mide su opción más larga y no achica solo.
- Todo `truncate` necesita `min-w-0` en el item de flex que lo contiene, o no
  trunca nada: se estira.
- `shrink-0` con anchos fijos es la combinación peligrosa. Un bloque de
  controles que suma ~400px fijos tiene que pasar a `w-full` en pantalla
  angosta y recién volver a ser una pieza al lado desde `sm:`.

**Verificar con el viewport real, no con un contenedor angosto.** Los
breakpoints de Tailwind miran el viewport: achicar un `div` deja los `sm:` y
`lg:` activos y la prueba miente. Chrome headless tampoco sirve directo —
clampea la ventana en ~500px— así que el teléfono se mira metiendo la página en
un `<iframe width="375">`, que sí crea su propio viewport.

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
