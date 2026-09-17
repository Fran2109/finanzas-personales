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

  **Y ya paso una vez, asi que conviene saber como.** El historial es del
  proyecto, no del repo, y hay herramientas que escriben en el sin avisar: el
  `apply_migration` del MCP de Supabase registra la version, igual que un
  `db push` desde el repo de job-hunter. Una sola de esas —`20260915103840_jobhunter_user_id_rls`—
  dejo `db push` de finanzas roto hasta que se saco. Para el DDL de la otra app
  va `execute_sql`, que aplica sin registrar. Si igual se cuela, el arreglo es
  sacar la fila del historial (`supabase migration repair --status reverted
  <version>`, o el `delete` equivalente): **eso no deshace el DDL**, solo borra
  el registro contable.
- **La service_role key de job-hunter bypassa RLS sobre todo el proyecto**, estas
  tablas incluidas. Antes el aislamiento lo daba el proyecto; ahora no lo da nada.
  El RLS de aca sigue protegiendo al cliente, no a la otra app.
- **Auth es una sola.** Un `auth.users`, un usuario, las mismas credenciales para
  las dos apps. Las cookies no cruzan dominios, asi que cada una se loguea aparte.

## Estado actual

- [x] Proyecto Supabase creado, región sa-east-1
- [x] Migración inicial aplicada (versión remota `20260914112501`)
- [x] 6 tablas con RLS y 6 políticas (`finanzas_*`). El andamiaje vacío de
      fases futuras —`fx_rates`, `installment_plans`, `budgets` y la vista
      multi-moneda— se borró al pasar al proyecto compartido: una tabla sin uso
      en un schema que comparten dos apps es ruido que el próximo que lo lea
      tiene que descartar. La fase que las necesite las crea con la forma que
      necesite (migración `20260915103325_drop_unused_phase_scaffolding`).
- [x] Usuario creado en auth + seed corrido (20 categorías de gasto)
- [x] Scaffold de Next.js 16 (App Router, Tailwind v4, `@supabase/ssr`)
- [x] Fase 1 construida: alta manual, vista del mes, filtros
- [x] Importador de resúmenes Galicia y Supervielle (VISA y MASTERCARD) con gate
      de reconciliación, con la cuenta inferida del propio resumen
- [x] Carga provisoria del mes en curso pegando la lista del home banking
- [x] Calendario de compromisos: cuánto de cada mes que viene ya está gastado
- [x] Rediseño visual y motion: tipografía propia, paleta validada, escala de
      seis pasos, listas en bandas y una secuencia de entrada por pantalla. El
      único costo nuevo es GSAP —27 KB gzip— y lo bajan **sólo** `/` y
      `/analisis`; las otras cinco rutas no pagan un byte. Ver `## El sistema
      visual`, `## Motion` y `## Cómo se verifica`.
- [ ] Fase 1 aceptada: una semana de gastos reales cargados sin que dé fastidio
- [x] Deploy en Vercel: https://finanzas-personales-rouge-eta.vercel.app

El esquema del remoto está versionado en `supabase/migrations/`. El invariante
es **un archivo por versión registrada y nada más**, en los dos sentidos: una
versión remota sin archivo rompe `db push`, y un archivo sin versión remota se
reaplica. Antes acá había una lista de nombres y se desactualizó dos veces, que
es lo que pasa siempre con una lista; esto en cambio se contesta solo:

```sh
supabase migration list   # local y remoto, lado a lado
```

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
una vista contra una tabla de cotizaciones a la fecha de la operación. Nunca
pesificar al insertar. **Esa tabla y esa vista todavía no existen**: se crearon
en el init, nunca se usaron y se borraron; las crea la fase 2. Hasta entonces
los montos en dólares se muestran aparte y sin convertir, que es lo que hoy
dicen la vista del mes, el análisis y el importador.

**El resumen manda sobre la fecha de compra.** Un movimiento que viene de un
resumen de tarjeta pertenece al mes del resumen, no al de la compra: el resumen
de agosto trae compras de junio y julio, pero la plata sale en agosto. Se guarda
en `transactions.statement_period` (`YYYY-MM`), y la vista del mes agrupa por ahí
cuando está y por `occurred_on` cuando no. `occurred_on` nunca se pisa: la fecha
real de la compra no se puede recuperar después. Solo aplica a cuentas de
tarjeta; un extracto bancario no tiene esa demora.

**Cuotas.** Una compra en 12 cuotas es una decisión que genera 12 salidas de
caja. Se modelará como una tabla de planes + N filas en `transactions` con
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

**`nota` es la descripcion propia, y va aparte de `description` por dos
razones.** La primera es que `description` ya es dos cosas a la vez: en un
movimiento cargado a mano es lo que se tipeo, pero en uno importado es la
transcripcion literal del resumen (`PLATAFORMA*SERVICIO-MENSUAL`, `PLAN V CONSOLID
5-12`). Pisarla perderia lo que decia el PDF, que es justo lo que la linea
"`import_rows` es transcripcion fiel" viene a proteger.

La segunda es la que decide: **`description` entra en la huella**. Anotar un
movimiento la recalcularia, y entonces reimportar ese resumen lo traeria de
nuevo como si fuera otro. Una nota es algo que se toca seguido —esa es toda la
idea— asi que meterla en la huella romperia la red anti-duplicados de forma
sistematica. `nota` queda afuera, y eso es estructural y no una promesa:
`fingerprintKey` solo lee los campos de `Fingerprintable`, y `nota` no esta ahi.

Se elige de un `<datalist>` con las notas ya usadas **en esa categoria**, o se
tipea una nueva. Es un `<input list>` nativo: da el desplegable, filtra al
tipear y deja escribir cualquier cosa que no este en la lista, que son las dos
cosas que hacen falta. Un combobox propio serian ~80 lineas de JS al cliente
para llegar al mismo lugar con el teclado peor resuelto.

Donde se muestra cambia segun para que sirve la pantalla. En la revision del
import manda el texto del resumen, porque esa pantalla existe para contrastar la
transcripcion contra el PDF y ahi la nota ya esta a la vista en su propio campo.

En la vista del mes la fila es de **tres lineas**, y cada una hace un trabajo:

- **El titulo** es la nota si la hay, y si no el texto del resumen. Va en cuerpo
  y con peso, y es **la unica linea que envuelve en vez de truncarse**. Comparte
  renglon con el importe, asi que en un telefono le quedan ~120px: truncando,
  una nota de 39 caracteres se leia hasta "regalo de cumpl..." y justo el dato
  que uno escribio desaparecia. Con tope de tres lineas, que es donde envolver
  deja de pagar — sin tope, un `PERCEPCION RG 4240 SOBRE CONSUMOS EN MONEDA
  EXTRANJERA` sin nota se comia seis renglones.
- **La linea de la nota** lleva el gatillo primero y despues el texto del
  resumen. Que el gatillo diga `+ nota` **solo donde falta** es lo que convierte
  "que me queda por anotar" en mirar una columna, y va adelante del texto —no
  atras— porque atras caia en una x distinta en cada fila y dejaba de ser
  columna. Cuando ya hay nota es un lapiz, que abre el mismo editor.
- **Los metadatos** (la insignia, categoria, cuenta, plastico) se quedan con
  todo su ancho. Ahi estuvo la razon de mudar el gatillo: mientras vivia en esta
  linea, `+ nota` se comia ~60px de la unica linea que ya se recorta por diseno,
  y en un telefono eso era la diferencia entre decir la cuenta o no decirla.

Antes las dos primeras compartian renglon separadas por un punto, y eso las
hacia competir por el mismo ancho: con una nota larga desaparecia el resumen, y
con un resumen largo se perdia el final de la nota.

**Se filtra por tener o no tener nota**, y va como **dos chips** y no como un
quinto desplegable: "qué me queda por anotar" es una pregunta que uno se hace
muchas veces seguidas, y un desplegable son tres gestos —abrir, tildar, cerrar—
contra uno. Con dos opciones, encima, el estado entra a la vista sin abrir nada.

Por dentro es una lista como los otros cuatro filtros y no un booleano, y eso
tampoco es simetría: con una lista, "los dos" y "ninguno" son el mismo estado
—todos— y se escribe solo. Un booleano de tres estados habría necesitado su
propia lectura de la URL, su propio "qué pasa si dice cualquier otra cosa" y su
propia rama en `monthQuery`. Una nota de puros espacios cuenta como **sin**
nota: `leerNota` ya guarda `null` en ese caso, pero si una fila entrara por otro
camino, la lista de lo que falta anotar mentiría.

**Anotar es un gesto y no cinco.** `updateNota` escribe un solo campo desde la
lista, sin abrir el editor completo. Se puede separar asi justamente porque
`nota` no entra en la huella: el editor completo toca descripcion, monto, fecha
y cuenta —que si entran— y por eso tiene que arrastrar el movimiento entero.

Para que el gatillo pudiera ser un boton hubo que dar vuelta la fila: **el boton
que abre el editor pasa a cubrirla por debajo** (`absolute inset-0`) en vez de
contenerla. Un `<button>` no puede vivir adentro de otro, asi que mientras la
fila era un solo boton no habia donde poner una accion mas. Al estar
posicionado, el overlay pinta por encima del texto en flujo normal y se lleva
los clicks igual que antes; los dos controles que tienen que recibir el suyo
—la nota y el borrar— se suben con `relative z-10`.

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

**Un plan se deduce de las filas, porque no hay tabla de planes.** La
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

**El calendario arranca después del último mes cargado de esa cuenta**, no
después de la última cuota vista. Si no, un plan al que le falta una cuota
—porque el plan terminó antes o porque esa línea no se leyó— proyecta la
siguiente a un mes que ya está cargado, y ese mes aparece a la vez en "los meses
que vienen" y en la vista del mes, con dos números distintos. El plan que quedó
atrás se marca y se dice en qué resumen no apareció, en vez de correrlo en
silencio.

**El mes en curso sí va adelante, pero no proyectado.** Dejarlo afuera obligaba
a cambiar de pantalla para saber con cuánta cuota arrancó el mes que se está
viviendo. Su número sale de las filas ya cargadas —el mismo que da la vista del
mes filtrando por Cuotas—, no de los planes: proyectarlo además sería contar dos
veces la misma cuota. Lo único que se le suma de la proyección es la cuota de
una cuenta cuyo resumen de este mes todavía no se cargó. Que no es proyección se
ve: la columna va en `--chart-track` y no en el acento, y la fila dice "en
curso".

**Registrada no es pagada.** El resumen de un mes se paga a principios del
siguiente, así que la cuota que ya entró en el resumen del mes en curso está
cargada y todavía no salió de la cuenta. Por eso cada plan lleva dos números:
`remaining` es lo que falta **registrarse** y es lo que proyecta el calendario;
`unpaid` es lo que falta **pagar**, una cuota más cuando la última vista es la
del mes en curso. Confundirlos subestima la deuda justo en la cuota más
próxima, que es la única que no se puede esquivar.

De ahí se sigue que **un plan que pagó su última cuota en el resumen en curso no
se va de la lista**: no proyecta nada más, pero esa cuota sale recién cuando se
pague el resumen. Sacarlo era el otro lado del mismo error.

El invariante que los ata: **"lo que falta pagar" tiene que dar exactamente la
suma del calendario**, mes en curso incluido. Son la misma plata contada de dos
formas; si no coinciden, una de las dos está mal.

La imprecisión conocida: "el mes en curso" es el mes del calendario, no la fecha
real del pago. Los primeros días de octubre el resumen de septiembre todavía no
se pagó y ya no cuenta. Saberlo de verdad pediría registrar el pago de cada
tarjeta, que es fase 2.

Eso deja `cuota_total` como dato obligatorio al confirmar un import: sin el total
la cuota queda huérfana —se sabe que es la 6, no de cuántas—, el plan no se puede
deducir y esa cuota, ya cargada, se proyecta como si todavía no hubiera pasado.

El límite conocido: dos compras distintas en la misma tarjeta, con la misma
cantidad de cuotas y la misma cuota mensual se leen como una sola. Es más raro
que el caso del nombre, y su error —subestimar— es menos grave que triplicar.
La fase 2 lo resuelve cuando modele los planes de verdad.

**La fase 4 quedó desactualizada.** "Tasa de ahorro" y "patrimonio en USD" son
incompatibles con "esto no lleva balances": sin ingresos ni saldos no hay con
qué calcularlos. Lo que sí queda pendiente y necesita más historia: real vs
nominal con IPC (en Argentina no es opcional, 2,86M de julio y 3,67M de
septiembre no son plata de la misma calidad), estacionalidad y detección de
anomalías. Nada de eso da con tres meses.

### Mirar para atrás: el flujo de cuotas y qué cambió

El calendario dice **cuánto falta**; estas dos secciones dicen **para dónde va la
cosa**.

**`installmentFlow` mide el compromiso que entra y el que sale cada mes.** Entra
la cuota de los planes que arrancaron ese mes (su cuota 1) y sale la de los que
pagaron la última. El neto contesta si el mes que viene arranca con más o con
menos cuota fija que el anterior, que es una pregunta que el total gastado no
contesta: un mes caro puede ser un mes en el que el futuro se descomprimió.

Un plan que empezó **antes del primer resumen importado** nunca cuenta como
tomado: no se lo vio arrancar, y afirmar que se tomó en un mes que no se miró
sería inventarlo. Eso hace que los primeros meses de historia subestimen lo que
entró, y la pantalla lo dice.

**`remainingByCategory` parte lo que falta pagar por categoría.** Sirve sobre
todo para separar las cosas del costo de financiarse: una deuda de la que el 82%
son intereses no es la misma deuda que una del mismo tamaño por compras.

**`categoryDeltas` compara los dos últimos meses.** Una categoría que aparece o
desaparece cuenta como cambio —suele ser el más grande— y el orden es por cuánto
se movió, sin importar para qué lado: la pregunta es "qué cambió", no "qué
subió". Si el mes más nuevo todavía tiene provisorios, se avisa: el resumen no
cerró y va a seguir subiendo.

### Los gráficos

**SVG y HTML a mano, del lado del servidor.** No hay librería de gráficos: son
cuatro formas simples, y una librería de **dibujo** obliga a mandar JavaScript
al cliente para dibujar números que el servidor ya calculó. Reemplaza trabajo ya
hecho. El hover son `title` nativos; la lista que acompaña a cada gráfico es la
vista de tabla.

Eso sigue siendo cierto con GSAP adentro del proyecto, y conviene decir por qué
no se contradicen. GSAP es una librería de **movimiento**: recibe el DOM ya
pintado y lo mueve, así que los cuatro gráficos siguen siendo server components
byte por byte. No reemplaza trabajo del servidor, se le suma. Lo que sí es cierto
—y la regla vieja lo decía bien— es que **pesa**: 27 KB gzip, más que todos los
componentes cliente de la app sumados. Por eso vive en dos rutas y no en el
layout (ver `## Motion`), y por eso el costo está medido y no estimado.

**El color se elige por el trabajo que hace, y se valida, no se estima.** Acá
casi todo es magnitud, así que va un solo tono —el acento— y el largo de la
barra hace el resto. Pintar cada categoría de un color distinto gastaría el
canal de identidad en repetir lo que el largo ya dice.

Para "ya estaba decidido vs. decidido este mes" la forma es **énfasis**: el
acento lleva la parte que cuenta la historia y el resto queda en un gris de
contexto. Ese gris es `--chart-track` y **no** es `--muted`: `--muted` es color
de texto y a 1,68:1 contra la superficie el segmento era casi invisible. Los dos
pasos se eligieron corriendo el validador de la skill de dataviz contra cada
superficie: claro `#8f8d86` (ΔE 25,9 a vista normal, 23,6 bajo protanopía) y
oscuro `#6e7379` (22,2 y 21,5 bajo deuteranopía), los dos ≥3:1. El paso oscuro no
es el claro invertido: se eligió contra `#1f2327`, que es la superficie oscura.

**El verde contra el rojo no se puede usar para el signo.** Es lo natural para
"subió / bajó" y el validador lo rechaza: ese par da ΔE 5,5 en claro y 4,0 en
oscuro bajo deuteranopía, o sea que un daltónico ve dos barras del mismo color y
pierde el signo. En `DivergingBars` el signo lo lleva **de qué lado del cero cae
la barra**, que no se pierde nunca, más el número con signo al lado; el color
queda sólo como magnitud, un tono.

**Y el acento dejó de ser verde por la misma clase de medición.** El verde
contra el gris de contexto daba ΔE 17,3 a vista normal y 13,2 bajo protanopía:
cuatro puntos perdidos justo donde el gráfico tiene que seguir diciendo cuál
segmento es cuál. El azul de tinta aguanta 25,9 y 23,6. No fue un cambio de
gusto — fue el validador rechazando el par, igual que rechazó el verde/rojo del
signo.

Las barras van **cuadradas contra el cero y redondeadas en la punta** —el
extremo redondeado marca dónde termina el dato y la base cuadrada lo ancla al
eje— y los segmentos se separan con 2px del color de la superficie y no con un
borde.

**Cada columna lleva su total arriba.** Antes se etiquetaban sólo la primera y la
más alta, por miedo a que un número sobre cada barra dejara de leerse; el miedo
era a la longitud de la etiqueta, no a la cantidad. Lo que las hace caber es el
formato compacto y que **el símbolo de moneda vaya sólo en la primera**:
repetirlo no agrega nada —la moneda es la misma en todas— y son los dos
caracteres que hacen que dos etiquetas vecinas se toquen. Leer el valor del eje
es aproximar, y de un mes se quiere saber cuánto es, no más o menos dónde cae.

## El sistema visual

Antes de esto la jerarquía la cargaban el color y el espaciado, nunca el tipo:
de ~196 usos de tamaño, **179 eran `text-sm` o `text-xs`**. `text-sm` hacía de
cuerpo, de dato, de etiqueta y de título de sección a la vez, y por eso nada
pesaba más que nada.

**Dos familias, servidas desde el propio dominio** con `next/font/google`, que
baja los archivos en el build: ni un pedido a Google en runtime —ni el rastreo
que eso implica— ni el parpadeo de una fuente que llega tarde.

- **IBM Plex Sans** para todo. Tiene cifras tabulares de verdad, que en una app
  que apila importes en columna no es un detalle. No es Inter a propósito.
- **Fraunces** para las cifras que son el argumento de una pantalla, y **para
  nada más**. Hoy son dos lugares: el total del mes y lo que falta pagar. Más el
  nombre de la app en el login, que es la única pantalla sin datos que mostrar.
  Los dos usos dicen lo mismo: esto es la cosa misma. Usarla para más la
  convertiría en un default.

**La escala es de seis pasos, cada uno con su interlínea** (`--text-micro` 11px
para insignias, `xs` 12,5 metadatos, `sm` 14,5 cuerpo, `base` 16 título de
sección, `lg` 22 título de página, `xl` 28, `2xl` 40 la cifra). Los chicos
respiran más de lo que Tailwind trae por defecto —1,33 en `xs` es apretado para
un dato— y los grandes menos, que es como se comporta el tipo de verdad.

**Tres radios, y cada uno dice de qué jerarquía es la cosa**: `--radius-control`
para un input o un botón, `--radius-contenedor` para un panel,
`--radius-pildora` para una insignia. Antes había cuatro elegidos por sitio, y
el mismo para un input que para un panel.

**Las listas son bandas, no cajas.** La regla separa, no encierra. Una caja
redondeada alrededor de cada fila es el "kit de tarjetas" que delata una
pantalla armada sin decidir nada, y encima gasta el borde —que es tinta— en
repetir lo que el espaciado ya dice.

**Un solo saturado, y es el del compromiso.** Lo que organiza esta app es cuánto
del mes ya estaba decidido, así que eso es lo que lleva color; el resto es tinta
y papel. Pintar más cosas gastaría el único canal que queda para decir que algo
ya no se puede cambiar. Los hexadecimales están en `src/app/globals.css` con sus
ΔE medidos al lado: **el color se valida, no se estima**, y el paso oscuro se
elige contra el fondo oscuro en vez de invertir el claro.

## Motion

Una sola secuencia al entrar por pantalla, y después movimiento sólo como
respuesta a algo que hiciste. Un fade en cada sección más una transición en cada
hover es el default genérico, el que se lee como generado.

### La falla que hay que hacer imposible

Que un elemento quede en `opacity: 0` y no se muestre nunca. Es una app de plata
en un teléfono con datos móviles: media página cargada no es hipotético. Son
cuatro capas y **ninguna alcanza sola**:

1. **El estado inicial depende de un atributo que sólo pone el JS.** El script
   inline de `layout.tsx` marca `<html data-motion="on">`, y la regla que
   esconde es `html[data-motion="on"]:not([data-motion-done]) [data-anim]`. Sin
   JS el atributo nunca se pone, la regla nunca matchea y la página se ve como
   si nada de esto existiera. Es estructural, no una promesa.
2. **El escondite se vence solo.** El mismo script programa `data-motion-done` a
   los 900ms pase lo que pase. `<html>` no lo reemplaza ninguna navegación del
   App Router, así que es un flip permanente: todo nodo que aparezca después ya
   no se esconde, y no hay que resolver "los nodos que llegan tarde".
3. **La primera línea del orquestador mata la regla**, antes de construir nada.
   Si algo de ahí para abajo tira, el contenido ya quedó visible. Lo que rescata
   la página es esa línea, no un catch.
4. **`gsap.from()` siempre, nunca `gsap.set()`**, más `revert()` al desmontar.

**Y la trampa que hace todo esto necesario, escrita porque no da ningún error:**
si el CSS ya puso `opacity: 0` y después corre `gsap.from(el, {opacity: 0})`,
GSAP lee el computado de ahora —0— como el valor **final** y anima de 0 a 0.
Invisible para siempre, en todos los navegadores, sin una línea en la consola.
Por eso el orden de la capa 3 importa: destapar primero deja el computado en 1,
que es el final que corresponde.

`prefers-reduced-motion` se respeta en **tres** lugares, porque ninguno cubre a
los otros: el script inline no pone `data-motion`; un bloque global de CSS anula
las duraciones —que cubre los `transition` sueltos y las view transitions, que
el switch de GSAP no alcanza—; y `gsap.matchMedia()` en `src/lib/motion.ts`, que
en la rama que no matchea no crea ni una tween.

### Qué hace cada mecanismo, y por qué no es el mismo

| Qué | Con qué | Por qué |
| --- | --- | --- |
| El editor en línea, el panel del filtro | CSS + `@starting-style` | `grid-template-rows: 0fr→1fr` anima hasta el alto real del contenido **sin medirlo**, que es lo que ninguna librería puede hacer sin volver a medir en cada resize. Acá CSS no es lo barato, es lo mejor |
| El mes que cambia | `<ViewTransition>` | Es un round-trip al servidor: el DOM viejo se destruye y no hay nada entre qué interpolar. GSAP sólo podría fadear lo nuevo *después* de la espera, que hace sentir más lenta una navegación que ya lo es |
| La entrada de `/` y `/analisis` | GSAP | Un reloj compartido: la coreografía se retunea en un lugar y las piezas no se desfasan |

**Lo que se abre necesita que React monte un nodo nuevo, y eso se rompe sin
hacer ruido.** `@starting-style` da el estado de entrada de un elemento **recién
insertado**; si React reusa el nodo que ya estaba, el navegador nunca lo ve
nacer, la regla no aplica y la fila salta a su alto final en el primer frame —la
animación entera perdida, sin un error en la consola—. Pasó al rediseñar la fila
del mes: los dos estados pasaron a arrancar con un `<div>`, así que React
reconcilió el mismo nodo en vez de reemplazarlo. Lo que lo sostiene es una `key`
distinta en cada rama, que es lo único que fuerza el remonte. Lo agarró `npm run
abre`, que mide a mitad de camino; un assert del estado final habría pasado.

**El panel del filtro anima `translate` y no `transform`**, y eso no es un
detalle de estilo: el `transform` de ese panel lo escribe el JS que lo corre
para que no se salga de la pantalla en un teléfono. Son dos propiedades que el
navegador compone, así que la corrección de layout y la animación conviven; con
las dos en `transform` la escritura inline gana y no queda animación ninguna.

`<ViewTransition>` va con `update="mes"` y `enter`/`exit`/`share` en `"none"`.
O sea: sólo cuando cambia el contenido de esa misma pantalla, nunca al entrar o
salir de ella. Mantiene los dos mecanismos en transiciones disjuntas — al montar,
la orquesta aplica su estado inicial en el mismo commit en que el navegador saca
la foto, y el crossfade fadearía hacia opacidad 0 para después volver a subir.

### Lo que anima GSAP, y lo que deliberadamente no

**`src/lib/motion.ts` es el único lugar que importa `gsap`**, y lo sostiene una
regla de ESLint. La coreografía vive aparte en `src/lib/motion-plan.ts`, sin
importar GSAP, para que los números se puedan testear con `node --test`: un test
ata la duración de la secuencia contra el watchdog, que es el único bug que un
test unitario puede atrapar acá.

El `spread` de cada paso es un **total y no un incremento por elemento**. Con un
incremento, una lista de 40 movimientos tardaría 1,8s sólo en arrancar y se
pasaría del watchdog. Repartido, la secuencia dura lo mismo con 3 elementos que
con 300. En GSAP es `stagger: { amount }`, no `each`.

**Las barras y las columnas no animan opacidad, y no es un olvido.** Las cuatro
viven adentro de una sección que ya hace su fade, y dos opacidades anidadas se
multiplican: a mitad de camino 0,5 por 0,5 da 0,25 y el gráfico se ve sucio en
vez de entrando. Lo que una barra tiene para decir es su largo, así que lo que
se anima es el largo — y el eje es el de la magnitud: una barra acostada crece en
X y una columna en Y. El origen sale del dato, no de un default: en
`DivergingBars` el cero está a la **derecha** de las barras que caen del lado de
"te soltaste", así que ésas crecen al revés.

**El contador es un server component**, y ahí está toda la decisión. Renderiza
el número final más un par de atributos `data-`; el "0" no existe en ningún
HTML. Acá la falla que hay que hacer imposible no es "algo queda invisible", es
**un número equivocado en pantalla**: una app de plata que muestra `$ 0,00`
donde se gastaron 1,6 millones no está degradada, está mintiendo. Por eso la
limpieza reescribe el valor final a mano — el texto lo pone un `onUpdate` y GSAP
no lo tiene anotado, así que `revert()` no lo desharía.

Se le fija el ancho antes de arrancar. `.cifra` ya trae `tabular-nums`, o sea
que los dígitos miden todos igual, pero la *cantidad* de dígitos cambia y el
número vive adentro de una oración: sin eso, el punto final de "Gastaste $ X."
se pasea por la pantalla medio segundo.

**Cada pantalla entra una sola vez por carga**, y es un `Set` por pantalla y no
una bandera para toda la app. Con una sola bandera, entrar a Análisis después de
Mes no animaba nada porque ya estaba gastada: ver una pantalla por primera vez y
volver a una que ya viste son cosas distintas. Un recargar de verdad trae la
entrada de nuevo, que es cuando tiene sentido.

## El token que nace invertido en el tiempo

La pantalla de "No se pudo cargar" que aparecía cada tanto era siempre lo mismo:
`JWT issued at future`. Supabase Auth firma el access token con el `iat` de **su**
reloj y PostgREST lo valida contra **el suyo**. Si el de Auth va unos segundos
adelantado, el token nace inválido y todo lo que salga en esa ventana se
rechaza. Como el token dura una hora, el síntoma aparece justo después de un
refresh y después no vuelve por un rato: por eso se veía "a veces" y no había
forma de reproducirlo.

Esperar es lo único que lo arregla —pedir otro token traería un `iat` más
adelantado todavía— pero **cuánto esperar no se adivina: lo dice el token**. Se
lee el `iat`, se espera eso y nada más. Va en el proxy, que es donde pasa el
refresh y por lo tanto donde puede nacer el token malo; hacerlo ahí evita que
la página haga tres consultas a sa-east-1 para fallar tres veces igual.

El payload se decodifica **sin verificar la firma**, y está bien: no se le cree
nada al token, sólo se mira un número para saber cuánto dormir. La espera tiene
tope (3s) y queda en los logs con el desfasaje medido.

**Pero esa espera sola no alcanza, y hace falta decir por qué.** El proxy mide
el `iat` contra el reloj de **Vercel**, y el que rechaza es **PostgREST**: si el
desfasaje está entre Supabase Auth y PostgREST, desde Vercel el token ya parece
válido y el proxy no espera nada. Se vio en producción —un 500 a las 16:50 en un
deploy que ya tenía el arreglo, sin una sola línea de `[clock-skew]` en los
logs—. El proxy sólo cubre el caso en que Vercel también va atrasado.

Lo que lo arregla de verdad es **el reintento de `withRetry`**, porque reacciona
al rechazo en vez de predecirlo: el rechazo es la única evidencia que hay de
cuándo el token empezó a valer, y no necesita saber de qué reloj es el problema.
Por eso el desfasaje tiene ahí su propio presupuesto, más largo que el del resto
—1s + 2s + 4s, siete segundos— mientras un 504 sigue con los suyos. Con los tres
intentos comunes (~450ms) se rendía antes de tiempo. Si se agota, queda en los
logs cuántos ms esperó: si pasa seguido, el desfasaje es más grande que un
redondeo de relojes y hay que mirar el proyecto, no seguir subiendo el tope.

**Ese reintento estuvo escrito y sin correr ni una vez, y cómo se descubrió
importa más que el bug.** PostgREST rechaza un JWT con `PGRST301` o `PGRST303`,
y `isTransient` empezaba descartando todo lo que tuviera código `PGRST` —la
guarda que evita reintentar permisos y constraints, que fallan igual siempre—
antes de mirar el mensaje. El desfasaje entraba por la puerta que lo dejaba
afuera. Ahora el desfasaje se pregunta **primero**: es el único error con código
de PostgREST que el próximo intento puede resolver, porque no depende de la
consulta sino de la hora. Un token vencido o mal firmado llega con el mismo
código y sigue cayendo en la guarda.

Dos cosas que dejó:

- **El silencio en los logs no probaba lo que parecía.** La ausencia de una
  línea de `[clock-skew]` se había leído como "el proxy no esperó, así que el
  desfasaje está entre Auth y PostgREST". La mitad era cierta; la otra mitad es
  que el reintento nunca se ejecutó, y por eso tampoco podía llegar a agotarse y
  loguear. Cuando la única prueba de que algo anda es que **no** aparece un log,
  hay que verificar que ese log pueda aparecer.
- **Los tests pasaban porque construían el error sin el código.** `{ message:
  "JWT issued at future" }` no es la forma que devuelve PostgREST, y esa
  diferencia era exactamente el bug. Un test que inventa la forma del error
  prueba el código contra sí mismo. Los de ahora llevan `code: "PGRST303"`.

Y el mensaje que se guarda ahora incluye el código (`describeError`): que
faltara es la razón de que diagnosticar esto pidiera leer el fuente y la
documentación de PostgREST en vez de mirar una línea de log.

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

**Un panel que se ancla a un gatillo no se arregla con `max-w`.** El
desplegable del filtro tiene `max-w-[calc(100vw-2rem)]`, que le limita el ancho
y no la posición: anclado a un gatillo que quedó a la derecha, se iba de la
pantalla igual. Anclarlo a la derecha tampoco alcanza —a 320px el panel mide más
de media pantalla, así que un gatillo angosto y centrado lo manda afuera para el
otro lado—. Se mide al abrir y se corre lo justo, aplicando el `transform` **al
nodo y no por estado**: es una corrección de layout, no algo que la app tenga
que recordar. Esto CSS no lo puede preguntar: depende de dónde quedó el gatillo
después de que la barra envolvió.

**Un target táctil no baja de ~32px.** La auditoría encontró varios de 16px de
alto y, peor, borrados de 12×20: un símbolo `×` chiquito, difícil de acertar y
destructivo cuando se acierta. Los borrados pasan a un cuadrado de 32px; a los
botones de texto les alcanza con padding vertical más un margen negativo que lo
compensa, así el área crece y la altura visual queda igual.

**Salvo en una barra que envuelve, donde el margen negativo es el problema.** En
el header, compensar el padding con `-my-*` se come el gap entre las filas
envueltas hasta montar una sobre otra. Ahí el padding va solo y se compensa
achicando el del contenedor: el header queda 4px más alto y la navegación entera
pasa a ser tocable.

**Los dos targets que faltaban aparecieron al hacer fiel el banco de pruebas, no
al mirar la pantalla.** Los cinco items de navegación medían 22px de alto —la
navegación principal de la app, en todas las pantallas— y no los veía nadie
porque en el banco eran `span` y la auditoría sólo mide `button, a, select,
input, textarea`. El link que abre un resumen, lo mismo: apareció al extraer
`StatementRow` a un componente que el banco pudiera renderizar. La moraleja no
es sobre targets: **una auditoría sólo cubre lo que el banco renderiza de
verdad**, así que cada vez que el banco se parece más al original, encuentra
cosas.

**Una insignia adentro de un `truncate` no existe en un teléfono.** El badge
"provisorio" vivía dentro del span que trunca la descripción, así que una
descripción larga se lo comía entero: no se veía nunca, justo donde más hace
falta saber que el número puede cambiar. Ponerlo **al lado** tampoco servía —se
comía la descripción, que quedaba en "C..."—. Va en la línea de metadatos y
primero: siempre visible, y lo que se recorta es la cola de los metadatos.

**`flex-wrap` con `justify-between` es una trampa.** Cuando el contenido no
entra, el importe se cae a la línea de abajo y `justify-between` lo pega a la
**izquierda**, lejos de donde el ojo lo busca; y un `truncate` en el label de al
lado no llega a dispararse nunca, porque envolver lo hizo innecesario. Sin wrap,
con el importe en `shrink-0` y el label en `min-w-0`, el importe queda fijo a la
derecha y el label envuelve adentro de su columna: no se pierde texto ni se
corre el número.

**Una línea de detalle no comparte línea con el importe.** En un teléfono le
quedaban ~180px y truncaba en "cuota 6 de 12 · faltan pag...", que se comía
cuándo termina, la categoría y la cuenta —todo lo que la línea tenía para
decir—. Va abajo, a lo ancho, y envuelve.

**Verificar con el viewport real, no con un contenedor angosto.** Los
breakpoints de Tailwind miran el viewport: achicar un `div` deja los `sm:` y
`lg:` activos y la prueba miente. Chrome headless tampoco sirve directo —
clampea la ventana en ~500px— así que el teléfono se mira metiendo la página en
un `<iframe width="375">`, que sí crea su propio viewport.

La página se mira renderizando el **componente real** con datos inventados (ver
`## Cómo se verifica`). Una copia del markup en un banco de pruebas se desfasa
del original y termina verificando algo que no existe: por eso la vista del mes
vive en `MesView`, la de análisis en `AnalisisView`, las filas de un resumen en
`ImportRowList` y la de un import en `StatementRow`, todas separadas de sus
páginas, que se quedan con los datos. Esto pasó de verdad dos veces — una el
banco reportó un `×` de 12px que las páginas reales ya no tenían, y otra la
revisión de un resumen se verificó durante meses contra una copia a mano.

La auditoría se corre a **320, 375, 414, 667, 768, 1024, 1280 y 1920**, en claro
y en oscuro, midiendo `scrollWidth` contra el viewport **y** elemento por
elemento (un hijo puede salirse sin que la página scrollee, si un ancestro lo
recorta: eso no es un desborde, es información que desaparece). **Salvo un
recorte con elipsis, que es intencional**: ese chequeo tenía una asimetría —si
la cola de un `truncate` es texto pelado no la ve, y si es un `<span>` (para
pintarla distinto) la reportaba—, lo mismo en pantalla con dos respuestas
distintas. Un ancestro que recorta **sin** elipsis sigue contando, que es donde
el contenido desaparece sin avisar. Y no alcanza con
el estado inicial: los desbordes que quedaban estaban en lo que se abre —el
desplegable del filtro, el editor en línea de un movimiento, el editor de una
cuenta y el confirmar de borrado—, así que hay que hacer click y volver a medir.
Un click que no encuentra nada no falla, simplemente no hace nada: conviene
afirmar que la interacción ocurrió antes de creerle al "sin problemas".

## Cómo se verifica

Cinco scripts en `scripts/`, todos contra el banco de pruebas levantado con
`VERIFICACION=1 npx next start -p 3210`:

| `npm run` | Qué prueba |
| --- | --- |
| `responsive` | 7 pantallas × 8 anchos × 2 temas, desborde y targets, más lo que se abre |
| `motion:red` | Que el contenido **no pueda** quedar invisible: con JS, bajo reduced-motion y sin JS |
| `gsap` | Que GSAP anime donde tiene que animar, no se cobre donde no, y no deje nada a medias |
| `abre` | Que el editor, el de la nota, el panel del filtro y el crossfade del mes de verdad animen |
| `capturas` | Diff pixel a pixel contra una baseline, para probar que algo **no** cambió |

**Todos miden a mitad de la animación, y ésa es la regla que hay que entender.**
Una animación que no engancha no tira ningún error: el elemento aparece de golpe
y nadie se entera. Un assert del estado final pasaría igual con todo roto. Por
eso cada chequeo afirma que el valor a mitad de camino cayó *entre* el de
arranque y el final, sin fijar cuál: el editor abre de 61 a 321px y a los 100ms
tiene que estar en el medio; el contador tiene que decir algo distinto del total
a los 200ms y **exactamente** el total al final; las 27 barras tienen que estar
en escala < 1 a los 260ms y en 1 al terminar. La muestra del medio cambia en
cada corrida y por eso no se compara contra un número: se compara contra el
intervalo. Y el par "anima" / "nada quedó invisible" va junto a propósito: sin el
primero, el segundo lo estaría dando el watchdog.

Tres preguntas que se contestan contra el navegador porque leyendo un archivo se
contestan mal:

- **Qué rutas pagan GSAP.** Los manifiestos por ruta de Turbopack no listan los
  chunks de página, así que un chequeo que los lee responde que sí a todo. Se
  mira qué pide cada página y cuál de esos chunks trae GSAP: `/login` baja cero.
- **Qué pasa si el chunk no llega.** Se bloquea por contenido —el nombre lo pone
  un hash— y se afirma que la página se lee igual.
- **Que reduced-motion no tenga agujeros.** Las capturas bajo `reduce` tienen que
  salir idénticas pixel a pixel contra el build sin GSAP. Cualquier diferencia
  ahí es un agujero en el switch.

**La verificación mintió tres veces, y las tres valen recordarse:**

- Un **`next-server` que quedó vivo** sirve el build anterior. Verificar que el
  HTML servido tenga el markup nuevo **antes** de medir.
- Un **`| head` sobre el build o un script** lo mata por SIGPIPE antes de que
  termine de escribir. Pasó dos veces, y la segunda dejó un build a medias que
  se sirvió como si fuera nuevo.
- Una **muestra única de una animación es una moneda al aire.** Medir "a los N ms
  del click" reporta sobre la pantalla vieja: entre medio hay un viaje al
  servidor por el RSC y una view transition que retrasa el commit. Y aun midiendo
  desde que la pantalla aparece, entre el commit de React y el primer frame de
  GSAP hay una ventana en la que todo está en opacidad 1. Se muestrea la ventana
  entera y se pregunta si **en algún momento** hubo algo entrando.

Y como no hay base de datos alcanzable desde el contenedor, todo esto corre
contra `/verificacion`, que arma cada pantalla con sus **componentes reales** y
datos inventados. Devuelve 404 sin `VERIFICACION=1`, así que el deploy no lo
expone.

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

**El rediseño visual no fue una fase, y está bien que no lo haya sido.** No
mueve el modelo de datos ni el criterio de aceptación de ninguna: la fase 1 se
acepta cargando una semana de gastos sin que dé fastidio, y eso no depende de la
tipografía. Se hizo en ocho pasos que se pushearon de a uno, cada uno deployado
y reversible: los primeros cuatro no agregaron una dependencia ni un byte de JS,
y los últimos cuatro se borran quitando un import.

## Convenciones

- Los nombres de archivo en `supabase/migrations/` tienen que coincidir con las
  versiones registradas en el remoto, o `db push` intenta reaplicar y falla.
- RLS activo en todas las tablas, siempre, aunque haya un solo usuario.
- Cuando la fase 2 traiga la tabla de cotizaciones, va como data de referencia
  compartida: lectura para `authenticated`, escritura solo desde el cron con
  `service_role`.
- Las políticas escriben `(select auth.uid())` y no `auth.uid()` pelado. Es la
  misma semántica, pero sin el subselect el planner lo trata como volátil y lo
  evalúa una vez por fila en vez de una por consulta.
- Los resúmenes contienen CUIT y domicilio. Si se manda el PDF a una API, sacar
  el bloque de cabecera antes.
- **`gsap` se importa en `src/lib/motion.ts` y en ningún otro archivo**, y lo
  obliga una regla de `no-restricted-imports` en `eslint.config.mjs`. Va como
  lint y no como convención a propósito: lo único que sostiene una regla así por
  meses en un proyecto de una sola persona es que falle sola. Es lo que hace que
  `prefers-reduced-motion` se respete en un `matchMedia` único en vez de en cada
  sitio de uso, y que el día que GSAP sobre se lo saque borrando un archivo.
- Las clases de Tailwind que se repetían viven en `src/components/ui/estilos.ts`
  como **strings y no como componentes**. Envolver una cadena de utilidades en
  un componente agrega un `<div>` al árbol, y en esta app eso es la forma más
  probable de reintroducir los desbordes que costaron una auditoría entera. Lo
  único que se ganó ser componente es `Aviso`, porque el mapeo tono → clases es
  lógica y no un string.
