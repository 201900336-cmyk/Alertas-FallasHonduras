# Alertas

**Página:** https://201900336-cmyk.github.io/Alertas-FallasHonduras/

**Fallas de red, al instante.** Alertas certifica en segundos si un cliente de Servicios Fijos está dentro de una falla general de red y le da a quien atiende las palabras para explicárselo.

- **Concentrix** (Call Center Nivel 1 y Redes Sociales) y **Tiendas** buscan por contrato o DNI y ven si el nodo del cliente está en falla, con el guion empático listo, y el mapa de Honduras con las fallas activas.
- **Workforce HN** publica, edita y cierra fallas por nodo, sube la base semanal y recibe el aviso de **posibles fallas** (5 clientes del mismo nodo en una hora) con el correo listo para reportarlas.
- **Jefatura** ve todo lo anterior más las estadísticas para decidir.

---

## Cómo está armado

```
Navegador (GitHub Pages)             Google (privado)                            Genesys Cloud
┌────────────────────────┐   HTTPS   ┌────────────────────────────────┐  valida  ┌──────────────┐
│ index.html + config.js │ ────────> │ Apps Script (aplicación web)   │ ───────> │ OAuth (PKCE) │
│ sin datos, sin claves  │ <──────── │ Sheet "Alertas - Base"         │          └──────────────┘
└────────────────────────┘ 1 cliente │ Sheet "Alertas - Consultas"    │
                            por vez  └────────────────────────────────┘
```

- **La página** (`index.html` y `config.js`) es pública y no tiene datos ni contraseñas.
- **El servidor** (`servidor/Code.gs`) vive dentro de un Google Sheet privado que no se comparte con nadie. Corre con la cuenta de su dueño y solo devuelve lo que cada rol puede ver.
- **La base de clientes** solo está en ese Sheet. La página recibe un cliente por búsqueda (nunca la base completa) y un resumen de nodos sin nombres ni DNI para el mapa y las fallas.
- **Los teléfonos** de los clientes solo salen en la descarga de celulares para avisar por SMS, que es exclusiva de Workforce y Jefatura. Los asesores y las tiendas nunca los ven.
- **Cada consulta** queda registrada (quién, cuándo, qué contrato y con qué resultado) en un segundo Sheet privado, "Alertas - Consultas": el detalle se guarda 30 días y, para las estadísticas, un resumen por día.

## Accesos

| Acceso | Cómo entra | Qué ve |
|---|---|---|
| **Concentrix** (CC N1 y Redes Sociales) | Botón **Entrar con Genesys** | Consulta, mapa de fallas y guion |
| **Tiendas** | Usuario genérico y contraseña, más su tienda (de una lista) y su nombre | Lo mismo que Concentrix |
| **Workforce HN** | Genesys, con su correo en la hoja **Usuarios** | Consulta, Fallas (con la descarga de celulares para SMS), Base y Estadísticas |
| **Jefatura** | Genesys, con su correo en la hoja **Usuarios** | Todo lo de Workforce |
| Acceso temporal de Workforce | Usuario y contraseña (para cuando Genesys falle) | Lo mismo que Workforce |

Tiendas pide la tienda y el nombre de la persona para que cada consulta quede a nombre de alguien, aunque la cuenta sea compartida. El usuario genérico ya aparece escrito. La tienda se elige de una lista desplegable: al escribir parte del nombre (por ejemplo "multi") aparecen las que coinciden, sin importar tildes ni mayúsculas, y hay que elegir una; un nombre que no está en la lista no deja entrar. Cada PC recuerda su tienda.

---

## Puesta en marcha (una sola vez)

Necesitas: la cuenta de Google donde vivirá el Sheet, tu repositorio de GitHub y, para el paso 4, al administrador de Genesys Cloud.

### Paso 1. El Sheet privado y el servidor

1. Con la cuenta de Google del equipo (de preferencia corporativa), crea una hoja de cálculo nueva y llámala **Alertas - Base**. No la compartas.
2. En la hoja: **Extensiones > Apps Script**. Borra lo que trae `Code.gs`, pega todo el contenido de [`servidor/Code.gs`](servidor/Code.gs) y guarda (💾).
3. Vuelve a la hoja y recárgala. Aparece el menú **Alertas**.
4. **Alertas > 1. Configurar por primera vez.** Google te pedirá autorizar el script. Es tu propio script: si sale "Google no verificó esta app", entra a **Configuración avanzada > Ir a…**.

Esto crea las hojas **Base**, **Fallas**, **Usuarios**, **Cargas** y **Tiendas** (más una oculta, **Catalogo**), y un segundo archivo, **Alertas - Consultas**, en tu Drive, con las hojas **Consultas**, **Resumen** y **Resumen_asesores**. También programa un mantenimiento que corre solo cada hora: arma el resumen de cada día y borra el detalle de más de 30 días. La hoja **Descargas SMS** aparece sola con la primera descarga de teléfonos.

> Solo las hojas **Usuarios** y **Tiendas** se editan a mano. Las demás las escribe Alertas.

### Paso 2. Publicar el servidor

1. En Apps Script: **Implementar > Nueva implementación**. En el engrane, elige **Aplicación web**.
2. **Ejecutar como: Yo.** **Quién tiene acceso: Cualquier usuario.**
3. **Implementar** y copia la URL que termina en `/exec`. (Después la puedes volver a ver en **Alertas > Ver dirección del servidor**.)

"Cualquier usuario" permite que los asesores usen Alertas sin cuenta de Google. Igual nadie entra sin sesión: el servidor exige una sesión firmada en cada acción, menos para entrar.

### Paso 3. La página en GitHub Pages

1. Sube el contenido de este repositorio a tu repositorio nuevo.
2. Edita `config.js` en GitHub y pega la URL del paso 2:
   ```js
   window.ALERTAS_CONFIG = {
     api: 'https://script.google.com/macros/s/XXXXXXXX/exec'
   };
   ```
3. **Settings > Pages > Build and deployment**: Source **Deploy from a branch**, Branch **main** y carpeta **/ (root)**. Guarda.
4. En uno o dos minutos la página queda en `https://TU-USUARIO.github.io/TU-REPOSITORIO/`. Esa dirección exacta se usa en el paso 4.

El repositorio puede ser público: no tiene contraseñas ni datos. En GitHub Free, Pages solo funciona con repositorios públicos; para uno privado se necesita GitHub Pro, Team o Enterprise.

### Paso 4. Genesys Cloud (lo hace el administrador de Genesys)

1. **Admin > Integraciones > OAuth** (en el menú nuevo: **TI e integraciones > OAuth**) **> Agregar cliente**.
2. Nombre: **Alertas**. Tipo de concesión: **Code Authorization / PKCE**.
3. **URI de redirección autorizadas**: la dirección del paso 3, idéntica y con la barra final:
   `https://TU-USUARIO.github.io/TU-REPOSITORIO/`
4. **Alcance**: el mínimo para saber quién entra, `user-basic-info`.
5. Guarda y copia el **Client ID**. PKCE no usa secreto, así que no hay nada más que copiar.

Luego, en el Sheet: **Alertas > 2. Conectar Genesys**.

- **Región**: la de la dirección con la que entran a Genesys. Por ejemplo, `apps.mypurecloud.com` es `mypurecloud.com` y `apps.usw2.pure.cloud` es `usw2.pure.cloud`.
- **Client ID**: el del paso anterior.
- **ID de la organización**: puedes dejarlo vacío. Alertas lo toma del primer ingreso con Genesys y desde ahí solo acepta usuarios de esa organización. Si Alertas lo pide al entrar, cópialo de Genesys en **Admin > Organization Settings > Advanced**.
- **Quién puede entrar**: *cualquier usuario de Genesys* (entra como Concentrix) o *solo quienes estén en la hoja Usuarios*.

### Paso 5. Usuarios y contraseñas

**Hoja Usuarios.** Una fila por persona de Workforce HN y de Jefatura, con su **correo de Genesys**:

| Correo de Genesys | Nombre | Rol | Activo |
|---|---|---|---|
| nombre.apellido@claro.com.hn | Nombre Apellido | `workforce` | SÍ |
| gerente@claro.com.hn | Nombre Apellido | `jefatura` | SÍ |

- Al configurar, Alertas agrega tu correo de Google como `jefatura`. Si tu correo de Genesys es otro, agrégalo también.
- Para quitarle el acceso a alguien, pon **NO** en Activo (o el rol `bloqueado`). Aplica de inmediato, aunque ya tenga Alertas abierto. Sirve también para bloquear a un asesor de Concentrix.

**Alertas > 3. Contraseñas de acceso.**

- Crea la cuenta **tiendas** con rol **Tiendas** y una contraseña de al menos 10 caracteres. Compártela con las tiendas por un canal interno.
- Si quieres, crea un acceso temporal de **Workforce** para cuando Genesys no esté disponible.
- Al cambiar una contraseña, se cierran las sesiones abiertas con la anterior y se quita cualquier bloqueo de la cuenta.
- Como la contraseña de Tiendas la conocen cientos de personas, conviene cambiarla cada mes y cada vez que alguien deja de trabajar en tiendas.

**Hoja Tiendas.** Las tiendas que aparecen en la lista al entrar, una por fila en la columna A, escritas como deben verse (empieza con las 38 CAC). Para agregar una tienda, escríbela en una fila nueva; para quitarla, borra su nombre. Aplica de inmediato (si borras la fila completa, en unos 5 minutos). Si un servidor que ya funcionaba no tiene la hoja, Alertas la crea sola la primera vez que alguien abre la página. Si la hoja queda vacía, se usa la lista inicial.

### Paso 6. La primera base

1. Abre la página, **Entrar con Genesys** (con un usuario de Workforce) y ve a **Base**.
2. Arrastra el Excel semanal (`.xlsx` o `.csv`). La página lo lee en tu computadora y te muestra el resumen.
3. **Publicar base.** La primera vez se sube completa, por partes: con unos 160 mil servicios toma unos minutos. No cierres la pestaña mientras sube.

Con cientos de personas consultando, conviene subir la base fuera de las horas pico (temprano en la mañana o en la noche): mientras sube, las búsquedas pueden tardar un poco más.

Columnas obligatorias: `CONTRATO`, `GRUPO_NODO`, `TECNOLOGIA`, `NOMBRE_CLIENTE` y `DNI`. Las demás (`PRODUCT_ID`, `OLT`, `NAP`, `CATEGORIA_CLIENTE`, `FECHA_INICIO`, `PLAY`, `DEPARTAMENTO`, `MUNICIPIO`, `COLONIA`, `MEGAS`, `TELEFONO`) se usan si vienen. La columna `ESTADO` se ignora.

`TELEFONO` (también se reconoce como `TELEFONOS`, `CELULAR` o `MOVIL`) solo se usa para la descarga de celulares para SMS. Puede traer varios números por cliente, separados por espacio, coma, punto y coma o barra, con o sin 504 y con o sin guion: Alertas se queda con los números hondureños de 8 dígitos y les pone 504 adelante. Al revisar el Excel, la página dice cuántos servicios traen celular.

Cada carga deja la base interna igual al Excel nuevo, y la hoja **Cargas** registra quién la subió, cuándo y qué cambió (contratos nuevos, los que ya no aparecen y cambios de nodo). Todos los que estén usando Alertas reciben el aviso para actualizar.

**Desde la segunda carga, solo se sube lo que cambió.** Alertas compara el Excel nuevo con la base interna y sube solo los contratos nuevos, los que ya no vienen y las filas con algún dato distinto. Entre la base del 26 y la del 29 de octubre de 2026 eso fue menos del 1 % de las filas, así que tarda menos de un minuto en vez de varios.

- **Cómo compara:** la columna **HUELLA** guarda un código corto calculado con los datos de cada fila. Si la fila no cambió, su código es el mismo.
- **Mientras se actualiza:** las búsquedas siguen funcionando. Primero se agregan las filas nuevas al final y después se vacían las que salen.
- **Si se corta a medias:** al intentarlo de nuevo, termina lo que faltó sin duplicar filas.
- **Cuándo va completa:**
  - el Excel trae columnas distintas;
  - cambian más de 20 mil filas;
  - las filas vacías que dejan las salidas pasan del 8 % (más o menos cada 3 o 4 meses; la carga completa vuelve a ordenar la base);
  - alguien editó la hoja **Base** a mano y ya no coincide. Esa hoja no se edita: la escribe Alertas.

---

## Día a día

- **Asesores y tiendas**: escriben el contrato (6 a 8 dígitos) o el DNI (con o sin guiones). Alertas responde **Falla general** con el guion o **Sin falla general** para seguir el flujo normal. Si sospechan una falla que no está publicada, la reportan desde ahí. **Limpiar** (o la tecla Esc) borra la búsqueda.
- **Nota del caso para Qflow**: debajo del guion sale un texto corto para la descripción del caso, según lo que encontró Alertas. Por ejemplo: «Cliente en falla general F1254585 (energía comercial), nodo GRA21, desde las 9:40 a. m.; solución estimada 3:00 p. m. Se le informó al cliente.» **Copiar nota del caso** lo deja listo para pegarlo en Qflow, así todos documentan igual. Los textos están en `src/config.js` (`notaQflow`).
- **Mapa de fallas activas** (inicio de Consulta): con el nombre de cada departamento, y debajo la lista de departamentos afectados con sus clientes.
- **Historial de fallas del cliente**: debajo del cliente y del guion. Muestra las fallas de su nodo desde que es cliente (90 días, 6 meses o 1 año): de cuándo a cuándo, cuánto duró cada una y las horas sin servicio en total. También dice cuántas veces lo consultaron en los últimos 7 días.
  - Con 3 o más fallas en 90 días lo marca como **Cliente reincidente** y el guion agrega una frase reconociéndolo.
  - Marca en qué fallas llamó: **Llamó 2 veces** en una falla ya cerrada y, en la falla activa, **Ya había llamado 1 vez** si llamó antes por la misma falla (sin contar la llamada de ahora). Cuentan las consultas de Concentrix y Tiendas de los últimos 30 días (las búsquedas de Workforce no son llamadas del cliente), y varias búsquedas en menos de 10 minutos cuentan como una llamada.
  - Cada falla sale con su número de falla.
  - Sale de las fallas publicadas en Alertas para el nodo actual del cliente; si el cliente se cambió de nodo, no salen las de su nodo anterior.
- **Workforce HN**: en **Fallas > Nueva falla** escribe los nodos (por ejemplo `NODO01, NODO02`), elige el motivo y la hora estimada, revisa a cuántos clientes afecta y **Publicar falla**. Puede editarla, cerrarla o reabrirla.
- En el paso 4 van el **número de falla** (por ejemplo `F1254585`), la referencia del correo o ticket y las notas. El número de falla es como se nombra la falla en todo Alertas y también lo ven los asesores: en el panel de fallas, en el veredicto y en el historial del cliente. Se guarda en mayúsculas, sin espacios ni guiones. La referencia y las notas solo las ve Workforce HN.
- Si una falla todavía no tiene número de falla, sale con el ID que le pone Alertas: **F**, la fecha (año, mes y día) y el número del día, sin guiones, por ejemplo `F26110201`. La tarjeta avisa "Sin número todavía" y se agrega con **Editar**. Las publicadas antes del 2 nov se guardaron con guiones (`F-261030-05`) y salen sin ellos (`F26103005`). El historial encuentra una falla por su número de falla o por su ID, y el CSV trae los dos.
- Una falla cerrada sigue visible para los asesores **36 horas** y luego sale de su panel. Workforce la conserva en el historial.
- Cuando Workforce publica, edita, cierra o sube una base, los demás ven el aviso **"Workforce HN hizo una actualización"** en alrededor de un minuto. Lo que diga cada búsqueda siempre está al día: el servidor responde con las fallas del momento.
- **Posibles fallas** (Workforce y Jefatura): cuando **5 clientes distintos** de un nodo sin falla publicada consultan en **60 minutos**, o 2 asesores lo reportan con **Reportar posible falla**, el nodo aparece en **Fallas > Posibles fallas**. Solo cuentan las búsquedas de Concentrix y Tiendas (las de Workforce revisando no suman, y un cliente que vuelve a llamar cuenta una vez). Con 3 o 4 clientes el nodo queda **en observación**.
  - **Aviso**: una barra arriba en cualquier vista y, con **Avisarme en el escritorio**, una notificación de Windows aunque Alertas esté minimizado o en otra pestaña (Alertas tiene que estar abierto). Cada posible falla se avisa una vez por PC, y otra vez si sigue después de 2 horas.
  - **Ver clientes y correo**: los clientes que consultaron (hora, contrato, nombre, nodo, tecnología, OLT, NAP/TAP, colonia, municipio, categoría y canal, con la tienda) y el correo listo para el VOC o el personal interno. **Copiar correo** lo deja para pegarlo en Outlook con Ctrl+V, con la tabla y su formato; también se puede copiar solo la tabla o el asunto.
  - **Marcar como reportada**: el resto de Workforce ve quién la reportó y a qué hora, para que nadie mande el mismo correo dos veces (la marca dura 6 horas y se puede quitar).
  - **Crear falla** abre Publicar falla con el nodo, el motivo **Posible falla general** y el inicio en la primera llamada ya puestos. Así se publica mientras el VOC la confirma: los asesores ven «Posible falla general» y le dicen al cliente que se está validando, en vez de mandarlo al soporte normal.
    - Si el VOC **la confirma**: **Editar** y elegir el motivo real (y la hora estimada).
    - Si **no hay falla**: **Descartar** en su tarjeta. Los asesores dejan de verla al instante (no queda como resuelta), no entra al historial de los clientes ni a las estadísticas, y el aviso no vuelve a salir con los mismos clientes: solo cuentan los que llamen después.
    - Esto vale para cualquier falla cerrada: las consultas de antes del cierre ya quedaron explicadas por esa falla.
  - **Descartar** el aviso (en la tarjeta de la posible falla, sin publicarla) lo oculta solo en esa PC hasta que vuelvan a consultar clientes de ese nodo.
- **Estadísticas > Detección de fallas** (Workforce y Jefatura): cuánto pasó desde que los clientes empezaron a llamar hasta que se publicó cada falla. Sirve para medir cuánto ayuda el aviso de posibles fallas.
  - **De la primera llamada a publicar** y **Del aviso a publicar** (medianas), cuántas se publicaron **antes de que llamaran** y cuántos clientes llamaron antes y se atendieron sin saber de la falla.
  - Por falla, una barra: en gris, clientes llamando sin aviso todavía; en ámbar, desde el aviso de posible falla hasta la publicación. Se descarga en CSV.
  - Cuenta las consultas de Concentrix y Tiendas en los nodos de la falla en las 4 horas antes de publicarla, sin pausas de más de 45 minutos entre una y otra ni antes de publicar. El servidor lo calcula y lo guarda al publicar: las fallas publicadas antes del 2 nov no tienen el dato.

## Avisar a los clientes por SMS (Notifícame)

Para que el cliente sepa de la falla antes de llamar (y bajar el tráfico al Call Center), Workforce descarga los celulares de los clientes afectados y los sube a Notifícame.

1. En **Fallas > Activas**, cada falla tiene el botón **Teléfonos para SMS**. Descarga un archivo con los celulares de los clientes de los nodos de esa falla. Por ejemplo, si la falla es GRA01 con 425 clientes, trae los celulares de esos 425; los que no tienen celular en la base quedan fuera.
2. Con más de una falla activa aparece además **Teléfonos de todas**: un solo archivo con los celulares de todas las fallas activas, sin repetir.
3. Al terminar, la tarjeta muestra cuántos números trae el archivo, cuántos clientes solo tienen teléfono fijo y cuántos no tienen teléfono en la base.

**El archivo** es un CSV delimitado por comas (UTF-8), con el encabezado `telefono` y un número por línea, de 11 dígitos con 504 adelante:

```
telefono
50431504547
50488000003
```

Se llama, por ejemplo, `sms_F26110201_GRA01.csv` o `sms_fallas_activas_2026-11-02_0815.csv`.

**Qué números entran:**

- Uno por cliente (contrato): su primer celular en la base. En Honduras los celulares empiezan con 3, 7, 8 o 9.
- Los teléfonos fijos (empiezan con 2) quedan fuera porque no reciben SMS.
- Si dos clientes tienen el mismo celular, va una sola vez.

**Para no mandar el mismo SMS dos veces:** para una falla nueva, usa el botón de su tarjeta. **Teléfonos de todas** vuelve a traer a los clientes de las fallas que ya avisaron. Lo mismo pasa si a una falla le agregan nodos después de avisar: la descarga trae otra vez a todos los clientes de la falla.

Cada descarga queda anotada en la hoja **Descargas SMS** del Sheet (quién, cuándo, qué fallas y nodos, cuántos clientes y cuántos números). Si la base subida no trae la columna `TELEFONO`, el botón lo avisa.

## Cambios futuros

- **La página**: edita los archivos de `src/`, corre `node build.js` y sube el `index.html` nuevo. No hace falta tocar `config.js`.
- **El servidor**: pega el `Code.gs` nuevo en Apps Script y luego **Implementar > Administrar implementaciones > ✏️ Editar > Versión: Nueva versión > Implementar**. Así la URL `/exec` no cambia. (Si haces una implementación nueva, la URL cambia y hay que actualizar `config.js`.)

## Seguridad

- **El Sheet nunca se comparte.** Solo el script, que corre como su dueño, lo lee.
- **La página no tiene contraseñas.** La de Tiendas no está en GitHub ni en el navegador: el servidor guarda solo una huella con sal (SHA-256 repetido 1,500 veces) y la compara al entrar.
- **Genesys**: el servidor valida cada ingreso con Genesys y exige que el token sea de la organización de Claro y del cliente OAuth de Alertas. Así nadie puede entrar con una cuenta de otra organización de Genesys aunque use el correo de alguien de Workforce.
- **Sesiones firmadas** (HMAC-SHA256) que vencen a las 12 horas. Los permisos se revisan contra la hoja Usuarios en cada acción de Workforce.
- **Límites**: 400 búsquedas por hora por persona y 8,000 por hora para toda la cuenta de Tiendas.
- **Contraseñas equivocadas**: cinco errores bloquean 15 minutos solo a esa persona (por nombre y tienda), no a las demás tiendas. Si llegan 100 intentos fallidos en 15 minutos (alguien probando contraseñas), se bloquea la cuenta de Tiendas; cambiar la contraseña la desbloquea. Para el acceso temporal de Workforce el tope es 20.
- **No hay búsquedas parciales**: solo contrato o DNI completos, máximo 20 resultados. No se puede listar la base desde la página.
- **Lo interno de cada falla** (referencia, notas, historial de cambios y correos de Workforce) solo viaja a Workforce y Jefatura. A Concentrix y Tiendas el servidor les manda solo lo que muestra su pantalla, que incluye el número de falla.
- **Posibles fallas**: la lista y el detalle (con los nombres de los clientes) solo los reciben Workforce y Jefatura, sin teléfonos ni DNI. El correo se copia en la PC de quien lo va a enviar; Alertas no manda correos solo.
- **Teléfonos**: solo Workforce y Jefatura descargan los celulares, solo de los nodos de una falla, y cada descarga queda anotada en **Descargas SMS**. El archivo tiene datos personales: después de subirlo a Notifícame, conviene borrarlo de la computadora.
- **Alertas > Cerrar todas las sesiones** obliga a todos a volver a entrar (por ejemplo, si una contraseña se filtró).
- **Alertas > Bloquear todas las pestañas** protege de una vez todas las pestañas de los dos archivos (la base interna y el de consultas) para que solo el dueño del archivo pueda editarlas. Si el archivo se comparte con alguien, esa persona puede verlas pero no cambiarlas.
  - Alertas sigue funcionando igual, porque corre con la cuenta del dueño, y las pestañas que cree después (por ejemplo, la Base nueva al subir la base completa) quedan bloqueadas solas.
  - **Alertas > Desbloquear todas las pestañas** las libera de una vez. Las protecciones que pongas a mano no se tocan.
  - Solo el dueño del archivo puede bloquear o desbloquear. Google siempre deja editar al dueño.

> La base tiene datos personales de clientes de Claro. Lo recomendable es que el Sheet esté en una cuenta corporativa de Google Workspace y que el área de seguridad de la información apruebe el uso antes de abrirlo a todos los asesores.

## Capacidad: unas 500 personas a la vez

Alertas está pensado para unas **300 personas de Concentrix y 200 de Tiendas** consultando al mismo tiempo. Las cuentas, con números redondos y supuestos holgados (unas 10 búsquedas por hora por asesor y 5 por persona de tienda):

| Qué | Estimado | Carga para Apps Script |
|---|---|---|
| Revisión de cambios (cada página, una vez por minuto, solo si la pestaña está a la vista) | hasta ~8 por segundo | ~2 a 3 ejecuciones a la vez |
| Búsquedas (unas 4,000 por hora en el pico, ~25 mil al día) | ~1 por segundo | ~2 ejecuciones a la vez |
| Ingresos con Genesys o contraseña | unos cientos al día | casi nada |

- Apps Script atiende hasta **30 ejecuciones al mismo tiempo** por cuenta (gratuita o Workspace). En el pico, Alertas usa alrededor de 5: queda margen de sobra.
- Si en algún momento Google rechaza una solicitud por estar saturado, o la respuesta llega sin los datos (como la de "el servidor está funcionando"), la página la **reintenta sola** (hasta dos veces) antes de mostrar un error. Si eso pasa con un cambio (publicar, editar, cerrar), no se repite solo: avisa que actualices para revisar si se guardó.
- Una búsqueda tarda **1 a 2 segundos** (lo que tarda Apps Script en responder).
- **La bitácora** guarda el detalle de 30 días (con un tope de 600 mil filas) y un resumen por día para las estadísticas de 7, 30 y 90 días. Así el archivo de consultas se mantiene lejos del límite de 10 millones de celdas de Google, aun con 25 mil consultas diarias. En las estadísticas de varios días, los clientes distintos son una estimación (≈) con un error típico de alrededor de 2 %.
- La base admite hasta unos **300 mil servicios**: en una carga completa conviven la vieja y la nueva en el mismo archivo. Las cargas por cambios escriben solo unos cientos o miles de filas, en un par de envíos.
- Cuotas diarias de Apps Script (cuenta gratuita / Workspace): 20,000 / 100,000 llamadas a Genesys (cada ingreso usa 2) y 50,000 / 500,000 lecturas de propiedades. Alertas guarda casi todo en caché para no acercarse a esos números.

**Recomendación:** antes de abrirlo a todos, haz un piloto de una semana con Workforce, un grupo de asesores y algunas tiendas. En Apps Script, el panel **Ejecuciones** muestra cuánto tarda cada solicitud y si hubo errores. Si la operación crece mucho más, el servidor puede pasar a un servicio corporativo sin cambiar la página.

## Probar sin servidor

- `index.html?demo` abre Alertas con datos ficticios guardados solo en tu navegador, con selector de rol. Sirve para presentarlo.
- Mientras `config.js` tenga `api: ''`, Alertas abre en ese mismo modo de demostración.

## Para desarrolladores

```
index.html            la aplicación completa (se genera con node build.js)
config.js             la URL del servidor (lo único que se edita a mano)
build.js              arma index.html a partir de src/ y assets/
src/                  código de la página (Preact + htm, sin dependencias externas)
assets/               fuente Archivo, mapa de Honduras y Preact/htm
servidor/Code.gs      el servidor (Apps Script)
servidor/appsscript.json  manifiesto de Apps Script (opcional)
pruebas/              emulador de Apps Script y pruebas
```

```bash
node build.js                      # arma index.html
npm test                           # 195 pruebas del servidor en un emulador de Apps Script
npm test -- ruta/a/la/base.xlsx    # las mismas pruebas con una base real (no la subas al repositorio)
npm test -- base.xlsx siguiente.xlsx
                                   # además, la carga por cambios de una base real a la de la semana siguiente
node pruebas/servidor-prueba.js 8787 demo
                                   # servidor local con Genesys simulado: http://localhost:8787/app/
python3 pruebas/e2e.py 8787 base.xlsx capturas/ [siguiente.xlsx]
                                   # prueba completa en el navegador (requiere: pip install playwright);
                                   # con siguiente.xlsx (y su .json con lo que cambió) prueba la carga por cambios
```

El `.gitignore` bloquea `.xlsx`, `.csv` y capturas para que la base nunca termine en el repositorio.

## Créditos

[Preact](https://preactjs.com) y [htm](https://github.com/developit/htm) (MIT) · fuente [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License 1.1) · mapa de Honduras basado en [Natural Earth](https://www.naturalearthdata.com) (dominio público).
