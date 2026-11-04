# Alertas

**Página:** https://201900336-cmyk.github.io/Alertas-FallasHonduras/

**Fallas de red, al instante.** Alertas certifica en segundos si un cliente de Servicios Fijos está dentro de una falla general de red y le da a quien atiende las palabras para explicárselo.

- **Concentrix** (Call Center Nivel 1 y Redes Sociales) y **Tiendas** buscan por contrato o DNI y ven si el nodo del cliente está en falla, con el guion empático listo, y el mapa de Honduras con las fallas activas.
- **Los supervisores de Call Center** ven el mismo panel de los asesores y además reciben el aviso de **posibles fallas**: la reportan al VOC o le avisan a Workforce. No crean fallas.
- **Workforce HN** publica, edita y cierra fallas por nodo, sube la base semanal y recibe el aviso de **posibles fallas** (5 clientes del mismo nodo en una hora) con el correo listo para reportarlas.
- **Jefatura** ve todo lo anterior más las estadísticas para decidir.
- **Todos** tienen que permitir los avisos en el escritorio al entrar: cuando Workforce publica una falla y cuando se resuelve, les llega al instante aunque Alertas esté minimizado.
- **Reportes** (Workforce y Jefatura): **Conexiones** (quién entra, cuándo fue su última entrada, cuántas consultas hizo y si tiene los avisos activados) y **SMS de Notifícame** (cada envío con su falla, mensaje, quién lo mandó y a cuántos clientes).

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
| **Supervisor** (de Call Center) | Genesys, con su correo en la hoja **Usuarios** y el rol `supervisor` | Lo mismo que Concentrix, más las posibles fallas: las reporta al VOC o le avisa a Workforce. No crea fallas |
| **Workforce HN** | Genesys, con su correo en la hoja **Usuarios** | Consulta, Fallas (con el envío de SMS por Notifícame), Base y Estadísticas |
| **Jefatura** | Genesys, con su correo en la hoja **Usuarios** | Todo lo de Workforce |

Tiendas pide la tienda y el nombre y apellido reales de la persona para que cada consulta quede a nombre de alguien, aunque la cuenta sea compartida. El nombre queda en nombre propio ("juan perez" entra como "Juan Perez") y no se aceptan apodos ni relleno ("el pepe", "la mera mera", "prueba"), números ni iniciales. El usuario genérico ya aparece escrito. La tienda se elige de una lista desplegable: al escribir parte del nombre (por ejemplo "multi") aparecen las que coinciden, sin importar tildes ni mayúsculas, y hay que elegir una; un nombre que no está en la lista no deja entrar. Cada PC recuerda su tienda.

---

## Puesta en marcha (una sola vez)

Necesitas: la cuenta de Google donde vivirá el Sheet, tu repositorio de GitHub y, para el paso 4, al administrador de Genesys Cloud.

### Paso 1. El Sheet privado y el servidor

1. Con la cuenta de Google del equipo (de preferencia corporativa), crea una hoja de cálculo nueva y llámala **Alertas - Base**. No la compartas.
2. En la hoja: **Extensiones > Apps Script**. Borra lo que trae `Code.gs`, pega todo el contenido de [`servidor/Code.gs`](servidor/Code.gs) y guarda (💾).
3. Vuelve a la hoja y recárgala. Aparece el menú **Alertas**.
4. **Alertas > 1. Configurar por primera vez.** Google te pedirá autorizar el script. Es tu propio script: si sale "Google no verificó esta app", entra a **Configuración avanzada > Ir a…**.

Esto crea las hojas **Base**, **Fallas**, **Usuarios**, **Cargas** y **Tiendas** (más una oculta, **Catalogo**), y un segundo archivo, **Alertas - Consultas**, en tu Drive, con las hojas **Consultas**, **Resumen** y **Resumen_asesores**. También programa un mantenimiento que corre solo cada hora: arma el resumen de cada día y borra el detalle de más de 30 días. La hoja **Descargas SMS** aparece sola con la primera descarga de teléfonos, y **Envíos SMS** con el primer SMS enviado desde Alertas.

> Solo las hojas **Usuarios** y **Tiendas** se editan a mano. Las demás las escribe Alertas.

### Paso 2. Publicar el servidor

1. En Apps Script: **Implementar > Nueva implementación**. En el engrane, elige **Aplicación web**.
2. **Ejecutar como: Yo.** **Quién tiene acceso: Cualquier usuario.**
3. **Implementar** y copia la URL que termina en `/exec`. (Después la puedes volver a ver en **Alertas > Ver dirección del servidor**.)

"Cualquier usuario" permite que los asesores usen Alertas sin cuenta de Google. Igual nadie entra sin sesión: el servidor exige una sesión firmada en cada acción, menos para entrar y para el monitoreo de la pantalla de entrada (el código del nodo con más clientes de cada departamento y si está en una falla activa, sin cantidades ni datos de clientes).

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

**Hoja Usuarios.** Una fila por persona de Workforce HN, de Jefatura y por cada supervisor de Call Center, con su **correo de Genesys**:

| Correo de Genesys | Nombre | Rol | Activo |
|---|---|---|---|
| nombre.apellido@claro.com.hn | Nombre Apellido | `workforce` | SÍ |
| gerente@claro.com.hn | Nombre Apellido | `jefatura` | SÍ |
| supervisor@concentrix.com | Nombre Apellido | `supervisor` | SÍ |

- Al configurar, Alertas agrega tu correo de Google como `jefatura`. Si tu correo de Genesys es otro, agrégalo también.
- Para quitarle el acceso a alguien, pon **NO** en Activo (o el rol `bloqueado`). Aplica de inmediato, aunque ya tenga Alertas abierto. Sirve también para bloquear a un asesor de Concentrix.
- Si las pestañas están ocultas, primero **Alertas > Mostrar las pestañas**, y al terminar **Alertas > Ocultar y proteger las pestañas**.

**Alertas > 3. Contraseña de Tiendas.**

- Crea la cuenta **tiendas** con rol **Tiendas** y una contraseña de al menos 10 caracteres. Compártela con las tiendas por un canal interno.
- Es la única cuenta con contraseña. Por privacidad **no hay accesos temporales**: Workforce, Jefatura, los supervisores y Concentrix entran solo con Genesys. Si quedó alguna cuenta temporal de antes, Alertas la borra sola (al abrir este diálogo o en el mantenimiento de cada hora) y ya no deja entrar con ella.
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
- **Panel Fallas en la red** (a la derecha de Consulta): cada falla dice **dónde es**: el departamento con sus nodos (hasta 3; si son más, los 3 primeros y cuántos más) y, debajo, las colonias con más clientes. Por ejemplo «Francisco Morazán · GRA07, GRA12, UVA03 y 9 más» y «Col. Kennedy, Col. Miraflores, Col. Las Colinas y 17 colonias más».
  - Al tocarla salen sus colonias por municipio, de más a menos clientes (6 por municipio y **Ver las 20 colonias** para la lista completa), **Ver los nodos** cuando son más de 3, y quién la publicó.
  - Las colonias salen limpias: en nombre propio y con la Ñ («COL. EL CASTA¿O SUR» es «Col. El Castaño Sur»), sin lo que va entre paréntesis y con el tipo siempre igual (Col., Barrio, Res.). La misma colonia escrita de varias formas en la base («COL. LAS COLINAS», «COLONIA LAS COLINAS», «RES. LAS COLINAS») sale una sola vez, con sus clientes sumados, y las que dicen «NO USAR» no salen (sus clientes sí cuentan en el municipio). Lo mismo en los datos del cliente y en la tabla de posibles fallas. El Excel no se toca.
  - Un departamento o municipio cuenta como afectado con 30 clientes de la falla o más; en una falla de menos de 1,000 clientes basta con el 3 % (y al menos 5). Los que tienen menos, que suelen ser direcciones de otro lugar, no salen en el resumen; sí en la lista completa.
  - Las colonias salen del resumen por nodo de la base (el catálogo), que se arma al publicar la base. Una base publicada antes de esta versión no las trae: hasta volver a publicarla (puede ser el mismo Excel, sube solo el resumen y tarda menos de un minuto), el panel muestra el departamento con sus nodos y, debajo, los municipios.
- **Historial de fallas del cliente**: debajo del cliente y del guion. Muestra las fallas de su nodo desde que es cliente (90 días, 6 meses o 1 año): de cuándo a cuándo, cuánto duró cada una y las horas sin servicio en total. También dice cuántas veces lo consultaron en los últimos 7 días.
  - Con 3 o más fallas en 90 días lo marca como **Cliente reincidente** y el guion agrega una frase reconociéndolo.
  - Marca en qué fallas llamó: **Llamó 2 veces** en una falla ya cerrada y, en la falla activa, **Ya había llamado 1 vez** si llamó antes por la misma falla (sin contar la llamada de ahora). Cuentan las consultas de Concentrix y Tiendas de los últimos 30 días (las búsquedas de Workforce no son llamadas del cliente), y varias búsquedas en menos de 10 minutos cuentan como una llamada.
  - Cada falla sale con su número de falla.
  - Sale de las fallas publicadas en Alertas para el nodo actual del cliente; si el cliente se cambió de nodo, no salen las de su nodo anterior.
- **Workforce HN**: en **Fallas > Nueva falla** escribe los nodos (por ejemplo `NODO01, NODO02`), elige el motivo y la hora estimada, revisa a cuántos clientes afecta y **Publicar falla**. Puede editarla, cerrarla o reabrirla. Los motivos: posible falla general, falla de energía comercial, corte de fibra óptica, corto circuito externo, daño en infraestructura por terceros, caída de postes, eventos en vía pública, reemplazo de equipo, limpieza de ruido, mantenimiento preventivo y otro.
- En el paso 4 van el **número de falla** (por ejemplo `F1254585`), la referencia del correo o ticket y las notas. El número de falla es como se nombra la falla en todo Alertas y también lo ven los asesores: en el panel de fallas, en el veredicto y en el historial del cliente. Se guarda en mayúsculas, sin espacios ni guiones. La referencia y las notas solo las ve Workforce HN.
- Si una falla todavía no tiene número de falla, sale con el ID que le pone Alertas: **F**, la fecha (año, mes y día) y el número del día, sin guiones, por ejemplo `F26110201`. La tarjeta avisa "Sin número todavía" y se agrega con **Editar**. Las publicadas antes del 2 nov se guardaron con guiones (`F-261030-05`) y salen sin ellos (`F26103005`). El historial encuentra una falla por su número de falla o por su ID, y el CSV trae los dos.
- Una falla cerrada sigue visible para los asesores **72 horas (3 días)** y luego sale de su panel. Workforce la conserva en el historial.
- Cuando Workforce publica, edita, cierra o sube una base, los demás ven el aviso **"Workforce HN hizo una actualización"** en alrededor de un minuto. Lo que diga cada búsqueda siempre está al día: el servidor responde con las fallas del momento.
- **Avisos de fallas en el escritorio (obligatorios para todos)**: al entrar, Alertas pide permitir los avisos y no muestra la consulta hasta que la persona elige **Permitir** en el navegador. Si el navegador los tiene bloqueados, explica cómo permitirlos desde el candado junto a la dirección; si la PC no deja cambiarlo (por ejemplo, por una regla de la empresa), deja **seguir sin avisos** y queda como "Bloqueados" en **Conexiones**. Con los avisos permitidos llega una notificación de Windows aunque Alertas esté minimizado o en otra pestaña (Alertas tiene que estar abierto). En el menú de su nombre está **Probar los avisos en el escritorio**: manda un aviso de prueba (sale en pantalla cada vez que se prueba) y abre una ayuda que dice dónde sale y qué revisar si no sale: en Windows, **Configuración > Sistema > Notificaciones** activadas también para el navegador, y **No molestar** (o **Asistente de concentración**) apagado. Cada aviso lleva su propia etiqueta: si se repitiera, Chrome y Edge lo dejarían en el centro de notificaciones de Windows sin mostrarlo. Los avisos son:
  - **Nueva falla publicada** (o reabierta): número, motivo, nodos, clientes y quién la publicó.
  - **Falla resuelta**: lo mismo, con la hora en que se restableció el servicio y quién la cerró.
  - **Se descartó la posible falla**: cuando una posible falla general no se confirma, para que dejen de decirle al cliente que se está validando.
  - Llega en alrededor de un minuto, una vez por cada cosa; a quien hizo el cambio no le llega. Al tocarla, Alertas se pone al día y muestra el panel de fallas.
- **Posibles fallas** (Workforce, Jefatura y supervisores): cuando **5 clientes distintos** de un nodo sin falla publicada consultan en **60 minutos**, o 2 asesores lo reportan con **Reportar posible falla**, el nodo aparece en **Fallas > Posibles fallas** (a los supervisores, arriba de su consulta). Solo cuentan las búsquedas de Concentrix y Tiendas (las de Workforce y los supervisores revisando no suman, y un cliente que vuelve a llamar cuenta una vez). Con 3 o 4 clientes el nodo queda **en observación**.
  - **Aviso**: una barra arriba en cualquier vista y una notificación de Windows aunque Alertas esté minimizado o en otra pestaña (Alertas tiene que estar abierto). Cada posible falla se avisa una vez por PC, y otra vez si sigue después de 2 horas.
  - **Ver clientes y correo**: los clientes que consultaron (hora, contrato, nombre, nodo, tecnología, OLT, NAP/TAP, colonia, municipio, categoría y canal, con la tienda) y el correo listo para el VOC o el personal interno. **Copiar correo** lo deja para pegarlo en Outlook con Ctrl+V, con la tabla y su formato; también se puede copiar solo la tabla o el asunto.
  - **Marcar como reportada**: el resto de Workforce ve quién la reportó y a qué hora, para que nadie mande el mismo correo dos veces (la marca dura 6 horas y se puede quitar).
  - **Los supervisores** tienen dos botones: **Avisar a Workforce** (con una nota opcional: a Workforce le llega la barra y el aviso de escritorio, y para ellos sigue pendiente) y **Reporté al VOC** (queda como reportada para todos). El correo sale firmado por la supervisión de Call Center. Un supervisor solo quita su propia marca; Workforce, cualquiera. Crear la falla es solo de Workforce.
  - **Crear falla** abre Publicar falla con el nodo, el motivo **Posible falla general** y el inicio en la primera llamada ya puestos. Así se publica mientras el VOC la confirma: los asesores ven «Posible falla general» y le dicen al cliente que se está validando, en vez de mandarlo al soporte normal.
    - Si el VOC **la confirma**: **Editar** y elegir el motivo real (y la hora estimada).
    - Si **no hay falla**: **Descartar** en su tarjeta. Los asesores dejan de verla al instante (no queda como resuelta), no entra al historial de los clientes ni a las estadísticas, y el aviso no vuelve a salir con los mismos clientes: solo cuentan los que llamen después.
    - Esto vale para cualquier falla cerrada: las consultas de antes del cierre ya quedaron explicadas por esa falla.
  - **Descartar** el aviso (en la tarjeta de la posible falla, sin publicarla) lo oculta solo en esa PC hasta que vuelvan a consultar clientes de ese nodo.
- **Estadísticas > Detección de fallas** (Workforce y Jefatura): cuánto pasó desde que los clientes empezaron a llamar hasta que se publicó cada falla. Sirve para medir cuánto ayuda el aviso de posibles fallas.
  - **De la primera llamada a publicar** y **Del aviso a publicar** (medianas), cuántas se publicaron **antes de que llamaran** y cuántos clientes llamaron antes y se atendieron sin saber de la falla.
  - Por falla, una barra: en gris, clientes llamando sin aviso todavía; en ámbar, desde el aviso de posible falla hasta la publicación. Se descarga en CSV.
  - Cuenta las consultas de Concentrix y Tiendas en los nodos de la falla en las 4 horas antes de publicarla, sin pausas de más de 45 minutos entre una y otra ni antes de publicar. El servidor lo calcula y lo guarda al publicar: las fallas publicadas antes del 2 nov no tienen el dato.

## Reportes

Sección **Reportes** (Workforce y Jefatura), con dos pestañas.

### Conexiones: quién usa Alertas

Para darle seguimiento a quien no está usando Alertas:

- Cada persona que entra queda anotada (una fila por persona en la hoja **Accesos** del archivo de consultas): primera y última entrada, cuántas veces entró y si en su PC están permitidos los avisos de escritorio (**Activados**, **Bloqueados**, **Sin responder** o **No disponibles**). Se anota desde la versión 3.3 del servidor.
- Arriba: cuántos entraron en el periodo, cuántos no entran hace 3 días o más, quién entró y no hizo consultas, y quién no tiene los avisos activados.
- La tabla trae a cada persona con su acceso (Concentrix, Tiendas con su tienda, supervisor, Workforce o Jefatura), su última entrada, cuántas veces entró, sus consultas del periodo (hoy, 7 o 30 días) y el estado de sus avisos. Se filtra por acceso, por "Entraron", "No entraron" o "Sin avisos activados", y se busca por nombre o tienda.
- **Descargar CSV** baja lo que se ve en la tabla, para mandárselo a los supervisores.
- Alertas solo conoce a quien ya entró alguna vez: quien nunca ha entrado no aparece.

### SMS de Notifícame

Cada envío de SMS queda en la hoja **Reporte SMS** de la base interna (una fila por envío, para siempre y sin teléfonos), y la pestaña lo muestra por periodo (hoy, 7, 30 o 90 días):

- **Cuándo** empezó y terminó, **la falla** (número de falla, motivo y nodos) y si fue aviso de falla.
- **El mensaje aprobado** que se mandó y su texto completo (**Ver el texto**).
- **Quién** lo mandó.
- **Clientes**: a cuántos se les apartó, a cuántos les salió, cuántos con error, en duda o sin enviar (si se detuvo), y cuántos **números de control** lo recibieron.
- **Partes de SMS**: los mensajes aprobados pasan de 160 caracteres, así que cada número cuenta 2 partes. Sirve para cuadrar con lo que cobra Notifícame.
- Arriba: envíos, clientes avisados, partes de SMS y con error o en duda, y cuánto mandó cada persona. **Descargar CSV** baja la tabla con el texto de cada mensaje.
- Los envíos de antes de la versión 3.4 también salen: la primera vez, la hoja se arma con lo que quedó anotado en cada falla, y el mensaje se reconoce por los números de control (si el envío los llevó).

## Avisar a los clientes por SMS (Notifícame)

Para que el cliente sepa de la falla antes de llamar (y bajar el tráfico al Call Center), Workforce le manda un SMS desde Alertas, con el API de Notifícame.

### Conectar Notifícame (una sola vez, la cuenta dueña del archivo)

1. En Notifícame: **Conexión con el API > Credenciales y accesos > Ver credenciales** (te manda un código a tu correo) y copia la **API key** y la **API secret**.
2. En la base interna: **Alertas > 4. Conectar Notifícame (SMS)**. Pega la key y la secret. La dirección del API REST ya viene puesta (`https://notificame.claro.com.hn/v4/api/rest/`).
3. **Guardar y probar**: Alertas prueba la conexión y, si escribes un celular, le manda un SMS de prueba y dice qué campos respondió Notifícame.

La key y la secret quedan en las Propiedades del script: no están en GitHub ni llegan a la página. Si en Notifícame usan **Regenerar credenciales**, hay que volver a pegarlas aquí.

### Números de control (los celulares del equipo)

Para confirmar que el mensaje llegó, cada envío también va a los celulares del equipo. Se guardan en la base interna: **Alertas > 5. Números de control (SMS)** (solo la cuenta dueña). Se pegan uno por línea, con o sin 504; Alertas quita los repetidos y avisa lo que no es un celular de Honduras.

- Van al principio del envío, así llegan en los primeros segundos.
- Cada número de control recibe cada mensaje distinto una vez por falla. Si se reintentan los que fallaron con el mismo mensaje, no se les repite; si se elige otro mensaje aprobado, sí les llega.
- Si un número de control también es cliente de la falla, le llega una sola vez.
- Se cuentan aparte de los clientes: «Aviso de falla a 1,251 clientes y a 17 números de control».
- Solo salen junto con clientes: si no hay clientes a quienes mandar, no se les manda nada.
- También van al principio del archivo de **Descargar celulares**.
- Se guardan en las Propiedades del script: no llegan a la página ni a GitHub.

### Enviar

1. En **Fallas > Activas**, cada falla tiene **Enviar SMS**. Cuando el servicio se restablece no se manda SMS: las fallas cerradas no tienen el botón.
2. **Solo se mandan los mensajes aprobados por Claro, tal cual** (documento «Segmentación de motivos 2.0», eventos externos o fortuitos). Hay uno por motivo:

   | Motivo de la falla | Mensaje aprobado |
   | --- | --- |
   | Corte de fibra óptica | Fibra dañada (accidentes / terceros) |
   | Falla de energía comercial | Falla de energía eléctrica |
   | Corto circuito externo | Corto circuito externo |
   | Daño en infraestructura por terceros | Daño en infraestructura por terceros |
   | Caída de postes | Caída de postes |
   | Eventos en vía pública | Eventos en vía pública |

   - La ventana trae el mensaje del motivo de la falla; se puede elegir otro de los aprobados, pero no escribir ni cambiar el texto. Muestra cuántos caracteres y cuántos SMS por cliente usa.
   - Una falla de otro motivo (posible falla general, reemplazo de equipo, limpieza de ruido, mantenimiento u otro) no manda SMS: la ventana lo dice y muestra qué motivos tienen mensaje. Si una posible falla se confirma, se edita con el motivo real y desde ahí se puede mandar.
   - Los textos viven en el servidor (`SMS_APROBADOS` en `servidor/Code.gs`): la página manda solo la clave del mensaje, así que no sale ningún texto que no esté aprobado. Para cambiarlos, se cambian ahí (y la copia de la demostración en `src/backend.js`).
   - Notifícame quita las tildes de á, í, ó, ú (probado el 2 nov); los mensajes aprobados ya vienen sin tildes.
   - La ventana dice a cuántos clientes les llega, de cuántos tiene la falla (con celular, solo fijo o sin teléfono).
3. **Enviar a N clientes**, confirmar (dice también a cuántos números de control va), y la barra muestra el avance. Se puede **Detener**.
4. Al terminar dice cuántos salieron, cuántos no (con el motivo que dio Notifícame) y cuántos quedaron en duda. **Reintentar los que fallaron** vuelve a mandar solo a los que fallaron.

**Nunca se le repite un aviso a nadie.** Antes de mandar nada, Alertas aparta en la pestaña **Envíos SMS** a cada cliente que le falta el aviso (40 días de registro), y cada número pasa por estos estados:

| Estado | Qué quiere decir | ¿Se le vuelve a mandar? |
| --- | --- | --- |
| Pendiente | Apartado en un envío, todavía no sale | Sale en ese envío |
| Enviando | Va en camino a Notifícame | No |
| Enviado | Notifícame confirmó que lo recibió (con `message_id` o `status`, como en su SDK) | No |
| Error | Notifícame lo rechazó (por ejemplo, número no válido) | Sí, con **Reintentar** |
| Dudoso | Notifícame no respondió a tiempo, o respondió sin confirmar: no se sabe si salió | No, salvo que se pida (ver abajo) |
| Cancelado | El envío se detuvo antes de mandarlo | Sí, en el próximo envío |

- Si a la falla le agregan nodos, **Enviar SMS** va solo a los clientes nuevos.
- **Si se cierra la página a medio envío**, al volver a abrir **Enviar SMS** la misma persona ve «Tienes un envío sin terminar» y **Seguir enviando** termina el mismo envío. Si cambia el mensaje, ese envío se cierra y el nuevo va a quienes falten.
- **Si una respuesta se corta**, la página repite el pedido con el mismo número de paso y el servidor no vuelve a mandar ese grupo.
- **Si Notifícame pide esperar** (límite de solicitudes), Alertas espera unos segundos y sigue solo, con grupos más chicos. Si lo pide 6 veces seguidas, se detiene; lo que no salió se manda después con **Seguir enviando**.
- **Si Notifícame no responde** a un grupo, esos números quedan en duda y se sigue con el resto. Si pasa 3 veces seguidas, se detiene.
- **Si Google no puede conectarse con Notifícame** (o se acabó su cuota del día), ese grupo no salió: vuelve a Pendiente, se detiene y lo dice.
- **A los que quedaron en duda** no se les reenvía. Si en los reportes de Notifícame se ve que no les llegó, la ventana tiene **Mandarles también a ellos** (a algunos les puede llegar dos veces).
- **Si cierran o descartan la falla mientras sale el aviso de falla**, el envío se detiene solo: a los que faltaban ya no les llega un aviso que no corresponde.
- **Si Notifícame rechaza la llave**, se detiene y lo dice. **Si rechaza dos grupos completos** (por ejemplo, la cuenta sin saldo), se detiene para no seguir gastando.
- Un envío que alguien dejó abierto y no avanza en 10 minutos lo puede tomar otra persona de Workforce. Si queda abierto más de 2 horas, el mantenimiento de cada hora lo cierra solo y libera las filas que hayan quedado apartadas.

**Cómo funciona:**

- Uno por cliente (contrato): su primer celular en la base. En Honduras los celulares empiezan con 3, 7, 8 o 9; los fijos (empiezan con 2) no reciben SMS. Si dos clientes tienen el mismo celular, va una sola vez.
- Los números nunca salen del servidor: la página solo ve cuántos son. El servidor los manda a Notifícame de 50 en 50 (un SMS por número, como pide el API), cada pedido firmado con la key y la secret (HMAC-SHA1). Cada SMS lleva un id fijo por falla, aviso y número (`AL-<falla>-F-<número>`), el mismo si alguna vez se intentara otra vez.
- Mientras una persona envía los SMS de una falla, nadie más puede mandar los de esa misma falla (sí los de otra falla).
- En la pestaña **Envíos SMS**, las filas de los números de control llevan en la columna **Control** la huella del mensaje (así se sabe qué texto ya recibieron). Una pestaña de antes, sin esa columna, la recibe sola.
- La tarjeta de la falla muestra el último envío y el historial de cambios lo registra («Aviso de falla a 1,251 clientes (9 con error, 2 en duda)»).
- Solo Workforce y Jefatura pueden enviar. Los asesores no ven nada de esto.
- **Límite diario: 15,000 SMS.** Cada SMS es una llamada de Google a Notifícame, y Google permite unas 20,000 por día con una cuenta de Gmail (100,000 con Google Workspace); Alertas deja margen para lo demás. Si una falla no cabe en lo que queda del día, se manda a los que caben y la ventana dice cuántos quedan para mañana. Lo que se aparta y no se manda vuelve al límite del día. Se cambia en `SMS_POR_DIA` de `servidor/Code.gs`.

### Descargar los celulares (respaldo)

**Descargar celulares** baja un CSV para subirlo a mano a Notifícame, por si hiciera falta. Con más de una falla activa aparece además **Teléfonos de todas**: un solo archivo con los celulares de todas las fallas activas, sin repetir.

El archivo es un CSV delimitado por comas (UTF-8), con el encabezado `telefono` y un número por línea, de 11 dígitos con 504 adelante. Primero van los números de control del equipo:

```
telefono
504XXXXXXXX
504XXXXXXXX
```

Se llama, por ejemplo, `sms_F26110201_GRA01.csv` o `sms_fallas_activas_2026-11-02_0815.csv`. La descarga trae a todos los clientes de la falla, aunque ya les haya llegado el SMS desde Alertas. Cada descarga queda anotada en la pestaña **Descargas SMS** (quién, cuándo, qué fallas y nodos, cuántos clientes y cuántos números). Si la base subida no trae la columna `TELEFONO`, el botón lo avisa.

## Cambios futuros

- **La página**: edita los archivos de `src/`, corre `node build.js` y sube el `index.html` nuevo. No hace falta tocar `config.js`.
- **El servidor**: pega el `Code.gs` nuevo en Apps Script y luego **Implementar > Administrar implementaciones > ✏️ Editar > Versión: Nueva versión > Implementar**. Así la URL `/exec` no cambia. (Si haces una implementación nueva, la URL cambia y hay que actualizar `config.js`.)

## Seguridad

- **El Sheet nunca se comparte.** Solo el script, que corre como su dueño, lo lee.
- **La página no tiene contraseñas.** La de Tiendas no está en GitHub ni en el navegador: el servidor guarda solo una huella con sal (SHA-256 repetido 1,500 veces) y la compara al entrar.
- **Genesys**: el servidor valida cada ingreso con Genesys y exige que el token sea de la organización de Claro y del cliente OAuth de Alertas. Así nadie puede entrar con una cuenta de otra organización de Genesys aunque use el correo de alguien de Workforce.
- **Sesiones firmadas** (HMAC-SHA256) que vencen a las 12 horas. Los permisos se revisan contra la hoja Usuarios en cada acción de Workforce.
- **Límites**: 400 búsquedas por hora por persona y 8,000 por hora para toda la cuenta de Tiendas.
- **Contraseñas equivocadas**: cinco errores bloquean 15 minutos solo a esa persona (por nombre y tienda), no a las demás tiendas. Si llegan 100 intentos fallidos en 15 minutos (alguien probando contraseñas), se bloquea la cuenta de Tiendas; cambiar la contraseña la desbloquea.
- **Sin accesos temporales**: la única cuenta con usuario y contraseña es la de Tiendas. Todos los demás entran con Genesys, así que si Genesys no está disponible, solo Tiendas puede entrar hasta que vuelva.
- **No hay búsquedas parciales**: solo contrato o DNI completos, máximo 20 resultados. No se puede listar la base desde la página.
- **Lo interno de cada falla** (referencia, notas, historial de cambios y correos de Workforce) solo viaja a Workforce y Jefatura. A Concentrix y Tiendas el servidor les manda solo lo que muestra su pantalla, que incluye el número de falla.
- **Posibles fallas**: la lista y el detalle (con los nombres de los clientes) solo los reciben Workforce, Jefatura y los supervisores, sin teléfonos ni DNI. El correo se copia en la PC de quien lo va a enviar; Alertas no manda correos solo.
- **Teléfonos**: solo Workforce y Jefatura descargan los celulares, solo de los nodos de una falla, y cada descarga queda anotada en **Descargas SMS**. El archivo tiene datos personales: después de subirlo a Notifícame, conviene borrarlo de la computadora.
- **SMS por Notifícame**: la API key y la API secret viven solo en las Propiedades del script (las pega la cuenta dueña en **Alertas > 4. Conectar Notifícame**). Al enviar desde Alertas, los números van del servidor a Notifícame y nunca llegan a la página; quién envió, cuándo y a qué números queda en **Envíos SMS** por 40 días. Los mensajes de error de Notifícame llegan a la página sin números de teléfono.
- **Alertas > Cerrar todas las sesiones** obliga a todos a volver a entrar (por ejemplo, si una contraseña se filtró).
- **Pestañas ocultas y protegidas**, como el archivo de auditorías: **Alertas > Ocultar y proteger las pestañas** deja a la vista solo **INICIO** (con el aviso de archivo confidencial) y protege todas las pestañas de los dos archivos (la base interna y el de consultas) para que solo la cuenta dueña las pueda cambiar.
  - **Alertas > Mostrar las pestañas** las pone a la vista para revisar los datos o editar Usuarios y Tiendas; siguen protegidas. Cada vez que se abre el archivo se vuelven a ocultar solas.
  - Solo la cuenta dueña del archivo puede mostrarlas u ocultarlas.
  - Alertas sigue funcionando igual, porque corre con la cuenta dueña. Las pestañas que cree después (por ejemplo, la Base nueva al subir la base completa) quedan ocultas y protegidas solas.

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
npm test                           # 335 pruebas del servidor en un emulador de Apps Script
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
