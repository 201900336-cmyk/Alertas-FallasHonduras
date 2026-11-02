/**
 * ============================================================================
 *  ALERTAS · Servidor (Google Apps Script)
 *  Certificación de fallas de red fija · Workforce HN
 * ============================================================================
 *
 *  Este archivo va pegado en Extensiones > Apps Script del Sheet privado de Alertas.
 *  El Sheet solo lo abre su dueño. La página de Alertas nunca lee el Sheet directo:
 *  todo pasa por este script, que revisa quién está pidiendo cada cosa.
 *
 *  Lo que guarda:
 *    - Base        la base semanal de clientes (se reemplaza completa en cada carga)
 *    - Fallas      las fallas publicadas por Workforce HN y su historial
 *    - Usuarios    correos de Genesys con acceso Workforce o Jefatura
 *    - Cargas      quién subió cada base y cuándo
 *    - Catalogo    resumen por nodo (sin datos personales), oculta
 *    - "Alertas - Consultas" (archivo aparte) el detalle de cada consulta (30 días)
 *                  y un resumen por día para las estadísticas
 *
 *  Secretos (nunca en el código): la llave de las sesiones y las contraseñas
 *  cifradas viven en Propiedades del script. No se ven en GitHub ni en la página.
 *
 *  No edites las hojas Base, Fallas, Cargas ni Catalogo a mano: usa Alertas.
 *  La hoja Usuarios sí se edita a mano.
 * ============================================================================
 */

const ALERTAS = {
  ZONA: 'America/Tegucigalpa',
  HORAS_SESION: 12,
  HORAS_VISIBLE: 36,             // una falla cerrada sigue visible para los asesores
  LIMITE_CONSULTAS_HORA: 400,    // por persona
  LIMITE_TIENDAS_HORA: 8000,     // para toda la cuenta compartida de Tiendas (unas 200 personas)
  INTENTOS_PERSONA: 5,           // contraseñas equivocadas de una misma persona antes de bloquearla 15 minutos
  INTENTOS_CUENTA_TIENDAS: 100,  // de todas las personas juntas, antes de bloquear la cuenta de Tiendas 15 minutos
  INTENTOS_CUENTA: 20,           // lo mismo para las demás cuentas con contraseña (acceso temporal)
  DIAS_DETALLE: 30,              // días de detalle de cada consulta (quién consultó qué)
  MAX_FILAS_DETALLE: 600000,     // tope de filas de detalle: el archivo admite 10 millones de celdas
  DIAS_RESUMEN: 120,             // días de resumen diario para las estadísticas
  DIAS_ESTADISTICAS: 90,         // periodo más largo que muestra Estadísticas
  DIAS_FALLAS_CARGA: 120,        // historial de fallas que recibe Workforce al entrar
  DIAS_HISTORIAL: 400,           // fallas que entran al historial de cada cliente (la tarjeta muestra hasta 1 año)
  FILAS_POR_LOTE: 5000,
  MAX_CAMBIOS: 20000,            // filas nuevas o cambiadas que se suben en una carga por cambios; si son más, va completa
  // Posible falla: 5 clientes distintos de un nodo sin falla publicada en 60 min (o 2 reportes de asesores).
  // Con 3 o 4 el nodo queda en observación. La marca de "reportada" dura 6 horas.
  ALERTA_MIN: 60, ALERTA_CLIENTES: 5, ALERTA_OBSERVAR: 3, ALERTA_REPORTES: 2, ALERTA_MARCA_HORAS: 6, ALERTA_MAX_CLIENTES: 60,
  ITERACIONES_CLAVE: 1500,
  HOJAS: { base: 'Base', nueva: 'Base_nueva', fallas: 'Fallas', usuarios: 'Usuarios', cargas: 'Cargas', catalogo: 'Catalogo', consultas: 'Consultas', resumen: 'Resumen', resumenAsesores: 'Resumen_asesores', descargas: 'Descargas SMS', tiendas: 'Tiendas' },
  ROLES: { concentrix: 'Concentrix', tiendas: 'Tiendas', workforce: 'Workforce HN', jefatura: 'Jefatura' },
  ESCRIBEN: ['workforce', 'jefatura'],
  REGIONES: {
    'mypurecloud.com': 'Estados Unidos Este (Virginia)', 'use2.us-gov-pure.cloud': 'Estados Unidos Gobierno',
    'usw2.pure.cloud': 'Estados Unidos Oeste (Oregón)', 'cac1.pure.cloud': 'Canadá', 'mxc1.pure.cloud': 'México',
    'sae1.pure.cloud': 'Sudamérica (São Paulo)', 'mypurecloud.ie': 'Europa (Irlanda)', 'euw2.pure.cloud': 'Europa (Londres)',
    'mypurecloud.de': 'Europa (Fráncfort)', 'euc2.pure.cloud': 'Europa (Zúrich)', 'mec1.pure.cloud': 'Medio Oriente (EAU)',
    'aps1.pure.cloud': 'Asia (Mumbai)', 'apse1.pure.cloud': 'Asia (Singapur)', 'mypurecloud.jp': 'Asia (Tokio)',
    'apne2.pure.cloud': 'Asia (Seúl)', 'apne3.pure.cloud': 'Asia (Osaka)', 'mypurecloud.com.au': 'Australia (Sídney)'
  },
  MOTIVOS: {
    ENERGIA: 'Falla de energía comercial', FIBRA: 'Corte de fibra óptica', EQUIPO: 'Reemplazo de equipo',
    RUIDO: 'Limpieza de ruido', MANTENIMIENTO: 'Mantenimiento preventivo', OTRO: 'Otro motivo'
  }
};

const COL_BASE = ['CONTRATO', 'PRODUCT_ID', 'GRUPO_NODO', 'OLT', 'NAP', 'CATEGORIA_CLIENTE', 'FECHA_INICIO', 'TECNOLOGIA', 'PLAY',
  'DEPARTAMENTO', 'MUNICIPIO', 'COLONIA', 'NOMBRE_CLIENTE', 'DNI', 'MEGAS', 'TELEFONO', 'HUELLA'];
// Pueden venir o no, después de las 14 de siempre. HUELLA la calcula la página con los datos de cada fila
// y sirve para que la carga siguiente suba solo lo que cambió.
const COL_OPCIONALES = ['MEGAS', 'TELEFONO', 'HUELLA'];
const COL_FALLAS = ['ID', 'Estado', 'Motivo', 'Motivo (otro)', 'Explicación al cliente', 'Nodos', 'Inicio', 'Solución estimada',
  'Publicada', 'Publicó', 'Cerrada', 'Cerró', 'Nota de cierre', 'Referencia', 'Notas internas', 'Clientes', 'HFC', 'GPON', 'Datos (no editar)',
  'Número de falla'];   // llegó después: va al final para no mover las columnas de las fallas que ya existen
const COL_USUARIOS = ['Correo de Genesys', 'Nombre', 'Rol (workforce, jefatura, concentrix o bloqueado)', 'Activo (SÍ o NO)', 'Notas'];
const COL_CARGAS = ['Fecha', 'Subió', 'Archivo', 'Servicios', 'HFC', 'GPON', 'Nodos', 'Contratos nuevos', 'Ya no aparecen', 'Cambios de nodo'];
const COL_CONSULTAS = ['Fecha', 'Usuario', 'Nombre', 'Acceso', 'Tienda', 'Tipo', 'Contrato', 'Nodo', 'Resultado', 'Falla'];
const COL_RESUMEN = ['Día', 'Consultas', 'Con falla', 'Sin resultado', 'Reportes', 'Datos (no editar)'];
const COL_RESUMEN_AS = ['Día', 'Usuario', 'Nombre', 'Canal', 'Consultas', 'Con falla', 'Sin resultado'];
const COL_DESCARGAS = ['Fecha', 'Usuario', 'Nombre', 'Fallas', 'Nodos', 'Clientes', 'Números en el archivo'];
const COL_TIENDAS = ['Tienda (una por fila: así aparece en la lista al entrar)'];
/* Tiendas con las que se crea la hoja Tiendas. Después se agregan o quitan en la hoja, sin tocar el código. */
const TIENDAS_INICIALES = [
  'CAC Castaños', 'CAC Comayagua', 'CAC Mall El Dorado', 'CAC Mall Multiplaza TGU', 'CAC Plaza Miraflores', 'CAC Siguatepeque',
  'CAC Catacamas', 'CAC Centro TGU', 'CAC Danli', 'CAC Juticalpa', 'CAC Mall Premier', 'CAC Metromall', 'CAC Peatonal',
  'CAC Choluteca Centro', 'CAC City Mall TGU', 'CAC Mall Cascadas', 'CAC San Lorenzo', 'CAC Unimall Choluteca', 'CAC Ventu TGU',
  'CAC Ceiba Centro', 'CAC Ceiba Mall Megaplaza', 'CAC Olanchito', 'CAC Roatan', 'CAC Tela Centro', 'CAC Tocoa Centro',
  'CAC City Mall SPS', 'CAC La Entrada Copan', 'CAC Mall Multiplaza SPS', 'CAC Santa Barbara', 'CAC Santa Rosa de Copan',
  'CAC Terminal de buses', 'CAC Villanueva', 'CAC Centro SPS', 'CAC Galerias del Valle', 'CAC Megamall SPS', 'CAC Paseo Proceres',
  'CAC Progreso', 'CAC Puerto Cortes'
];

const ACCIONES = {
  config: accionConfig_, login: accionLogin_, estado: accionEstado_, cargar: accionCargar_, buscar: accionBuscar_,
  reportar: accionReportar_, falla: accionFalla_, base: accionBase_, alertas: accionAlertas_, estadisticas: accionEstadisticas_,
  telefonos: accionTelefonos_, contactos: accionContactos_, alerta: accionAlerta_
};
const PUBLICAS = { config: true, login: true };
const SOLO_WORKFORCE = { falla: true, base: true, alertas: true, alerta: true, estadisticas: true, telefonos: true };

/* ============================================================================
 *  Entrada de la aplicación web
 * ========================================================================== */

function doGet() {
  return json_({ ok: true, app: 'Alertas', mensaje: 'El servidor de Alertas está funcionando.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {
    return json_({ ok: false, codigo: 'DATOS', error: 'La solicitud no es válida.' });
  }
  try {
    const accion = String(req.accion || '');
    const fn = ACCIONES[accion];
    if (!fn) throw fallo_('DATOS', 'Acción desconocida.');
    let ses = null;
    if (!PUBLICAS[accion]) {
      ses = leerSesion_(req.token);
      if (!ses) throw fallo_('SESION', 'Tu sesión venció. Entra de nuevo.');
      if (SOLO_WORKFORCE[accion]) exigirWorkforce_(ses);
    }
    return json_({ ok: true, datos: fn(req.datos || {}, ses) });
  } catch (err) {
    if (err && err.codigo) return json_({ ok: false, codigo: err.codigo, error: err.mensaje });
    // Errores de Google (hoja ocupada, demasiadas ejecuciones a la vez...): la página reintenta sola
    const msg = String(err && err.message || err);
    console.error(err && err.stack || msg);
    if (/timed out|too many|simultaneous|server error|service error|try again|unavailable|lock/i.test(msg)) {
      return json_({ ok: false, codigo: 'OCUPADO', error: 'El servidor está muy ocupado en este momento. Intenta de nuevo en unos segundos.' });
    }
    return json_({ ok: false, codigo: 'SERVIDOR', error: 'Error del servidor. Si se repite, avisa a Workforce HN.' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fallo_(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; e.mensaje = mensaje; return e; }

/* ============================================================================
 *  Configuración guardada (con caché para no gastar cuota de Propiedades)
 * ========================================================================== */

function props_() { return PropertiesService.getScriptProperties(); }
function cache_() { return CacheService.getScriptCache(); }

function cfg_() {
  const c = cache_().get('cfg');
  if (c) return JSON.parse(c);
  const p = props_().getProperties();
  const cfg = {
    SECRETO: p.SECRETO || '', BASE_ID: p.BASE_ID || '', CONSULTAS_ID: p.CONSULTAS_ID || '',
    GENESYS: p.GENESYS ? JSON.parse(p.GENESYS) : {}, CUENTAS: p.CUENTAS ? JSON.parse(p.CUENTAS) : {}
  };
  cache_().put('cfg', JSON.stringify(cfg), 600);
  return cfg;
}
function limpiarCfg_() { cache_().remove('cfg'); }
function secreto_() {
  const s = cfg_().SECRETO;
  if (!s) throw fallo_('CONFIG', 'El servidor no está configurado. En la base interna usa el menú Alertas > Configurar por primera vez.');
  return s;
}

function libro_() {
  const id = cfg_().BASE_ID;
  if (!id) throw fallo_('CONFIG', 'El servidor no está configurado. En la base interna usa el menú Alertas > Configurar por primera vez.');
  return SpreadsheetApp.openById(id);
}
function hoja_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw fallo_('CONFIG', 'Falta la tabla ' + nombre + ' en la base interna. Usa el menú Alertas > Configurar por primera vez.');
  return h;
}
function libroConsultas_() {
  const id = cfg_().CONSULTAS_ID;
  if (!id) throw fallo_('CONFIG', 'Falta el archivo de consultas. Usa el menú Alertas > Configurar por primera vez.');
  return SpreadsheetApp.openById(id);
}
function hojaConsultas_() { return libroConsultas_().getSheetByName(ALERTAS.HOJAS.consultas); }

/* Versión de los datos: cada cambio de Workforce la sube y las páginas abiertas avisan */
function estado_() {
  const c = cache_().get('estado');
  if (c) return JSON.parse(c);
  const raw = props_().getProperty('ESTADO');
  const e = raw ? JSON.parse(raw) : { version: 1, baseVersion: 0, cambio: null };
  cache_().put('estado', JSON.stringify(e), 21600);
  return e;
}
function subirVersion_(cambio, extra) {
  const raw = props_().getProperty('ESTADO');
  const e = raw ? JSON.parse(raw) : { version: 1, baseVersion: 0, cambio: null };
  e.version = (e.version || 1) + 1;
  e.cambio = cambio;
  if (extra) Object.keys(extra).forEach((k) => { e[k] = extra[k]; });
  props_().setProperty('ESTADO', JSON.stringify(e));
  cache_().put('estado', JSON.stringify(e), 21600);
  return e;
}

/* ============================================================================
 *  Acceso: Genesys, cuentas con contraseña (Tiendas) y sesiones firmadas
 * ========================================================================== */

function accionConfig_() {
  const g = cfg_().GENESYS || {};
  const cuentas = cfg_().CUENTAS || {};
  const roles = Object.keys(cuentas).map((k) => cuentas[k].rol);
  return {
    app: 'Alertas',
    genesys: { region: g.region || '', clientId: g.clientId || '', activo: !!(g.region && g.clientId) },
    tiendas: roles.indexOf('tiendas') >= 0,
    temporal: roles.some((r) => r !== 'tiendas'),
    listaTiendas: tiendas_()
  };
}

/* Las tiendas que se eligen al entrar con la cuenta de Tiendas: la hoja Tiendas, una por fila.
   Se guarda en caché (la página la pide cada vez que se abre) y se renueva al editar una celda de la
   hoja; si se borra una fila completa (eso Google no lo avisa), a más tardar en 5 minutos.
   Si la hoja no existe, se crea con la lista inicial. Nunca falla: sin base interna configurada,
   o si la hoja no se pudo leer en ese momento, se usa la lista inicial y se reintenta en la próxima visita. */
const normTienda_ = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function tiendas_() {
  const c = cache_().get('tiendas');
  if (c) return JSON.parse(c);
  let lista = null;
  try {
    const ss = libro_();
    let h = ss.getSheetByName(ALERTAS.HOJAS.tiendas);
    if (!h) {
      const lock = LockService.getScriptLock();
      if (lock.tryLock(5000)) {
        try { h = ss.getSheetByName(ALERTAS.HOJAS.tiendas) || crearHojaTiendas_(ss); } finally { lock.releaseLock(); }
      }
    }
    if (h) {
      const vistas = {};
      lista = h.getLastRow() < 2 ? [] : h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().map((f) => texto_(f[0], 60)).filter((t) => {
        const k = normTienda_(t);
        if (!k || vistas[k]) return false;
        vistas[k] = true;
        return true;
      });
    }
  } catch (err) { lista = null; }
  if (!lista) return TIENDAS_INICIALES.slice();
  if (!lista.length) lista = TIENDAS_INICIALES.slice();   // una hoja vacía nunca deja a las tiendas sin poder entrar
  cache_().put('tiendas', JSON.stringify(lista), 300);
  return lista;
}
function crearHojaTiendas_(ss) {
  const h = ss.insertSheet(ALERTAS.HOJAS.tiendas);
  h.getRange(1, 1).setValue(COL_TIENDAS[0]).setFontWeight('bold');
  h.setFrozenRows(1);
  h.getRange(2, 1, TIENDAS_INICIALES.length, 1).setNumberFormat('@').setValues(TIENDAS_INICIALES.map((t) => [t]));
  return h;
}

function accionLogin_(d) {
  if (d.tipo === 'genesys') return loginGenesys_(d);
  if (d.tipo === 'clave') return loginClave_(d);
  throw fallo_('DATOS', 'Tipo de acceso no válido.');
}

function loginGenesys_(d) {
  const g = cfg_().GENESYS || {};
  if (!g.region || !ALERTAS.REGIONES[g.region] || !g.clientId) throw fallo_('CONFIG', 'Genesys todavía no está conectado. En la base interna usa el menú Alertas > Conectar Genesys.');
  const token = String(d.accessToken || '');
  if (!token || token.length > 5000) throw fallo_('DATOS', 'Falta la sesión de Genesys.');
  const pedir = (ruta) => UrlFetchApp.fetch('https://api.' + g.region + '/api/v2/' + ruta, {
    method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });

  /* 1. ¿Para qué aplicación y para qué organización se emitió este token?
        Sin esta revisión, alguien con su propia organización de Genesys podría crear
        un usuario con el correo de una persona de Workforce y entrar con ese rol. */
  let org = null, clienteVerificado = false;
  const rt = pedir('tokens/me');
  if (rt.getResponseCode() === 401) throw fallo_('ACCESO', 'Genesys no validó tu sesión. Intenta entrar de nuevo.');
  if (rt.getResponseCode() === 200) {
    const t = JSON.parse(rt.getContentText());
    const cliente = t.OAuthClient && t.OAuthClient.id;
    if (cliente) {
      if (String(cliente).toLowerCase() !== String(g.clientId).toLowerCase()) throw fallo_('ACCESO', 'Esa sesión de Genesys no se abrió desde Alertas. Usa el botón Entrar con Genesys.');
      clienteVerificado = true;
    }
    if (t.organization && t.organization.id) org = { id: String(t.organization.id).toLowerCase(), nombre: String(t.organization.name || '') };
  }

  /* 2. ¿Quién es? */
  const r = pedir(org ? 'users/me' : 'users/me?expand=organization');
  if (r.getResponseCode() !== 200) throw fallo_('ACCESO', 'Genesys no validó tu sesión. Intenta entrar de nuevo.');
  const yo = JSON.parse(r.getContentText());
  if (!org && yo.organization && yo.organization.id) org = { id: String(yo.organization.id).toLowerCase(), nombre: String(yo.organization.name || '') };

  /* 3. Tiene que ser la organización de Genesys conectada a Alertas */
  if (!org) throw fallo_('ACCESO', 'Genesys no indicó tu organización. Revisa los permisos del cliente OAuth de Alertas (guía, paso de Genesys).');
  let orgId = String(g.orgId || '').toLowerCase();
  if (!orgId) {
    if (!clienteVerificado) throw fallo_('CONFIG', 'Falta el ID de la organización de Genesys. Workforce HN: en la base interna usa el menú Alertas > Conectar Genesys.');
    orgId = aprenderOrganizacion_(org);   // primer ingreso con un token que sí salió del cliente OAuth de Alertas
  }
  if (org.id !== orgId) throw fallo_('ACCESO', 'Tu usuario de Genesys no pertenece a la organización conectada a Alertas.');

  const correo = String(yo.email || yo.username || '').trim().toLowerCase();
  if (!correo) throw fallo_('ACCESO', 'Tu usuario de Genesys no tiene correo registrado.');
  const reg = usuarios_()[correo];
  let rol = reg ? (reg.activo ? reg.rol : 'bloqueado') : (g.rolPorDefecto || 'concentrix');
  if (!ALERTAS.ROLES[rol]) throw fallo_('ACCESO', 'Tu usuario no tiene acceso a Alertas. Pídeselo a Workforce HN.');
  const nombre = (reg && reg.nombre) || yo.name || correo;
  return emitirSesion_({ u: correo, n: String(nombre).slice(0, 80), r: rol, o: 'genesys' });
}

/* La primera vez que alguien entra con un token emitido por el cliente OAuth de Alertas,
   se guarda su organización. Desde ahí, solo esa organización puede entrar. */
function aprenderOrganizacion_(org) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = props_();
    const g = JSON.parse(p.getProperty('GENESYS') || '{}');
    if (!g.orgId) {
      g.orgId = org.id;
      g.orgNombre = String(org.nombre || '').slice(0, 120);
      p.setProperty('GENESYS', JSON.stringify(g));
      limpiarCfg_();
    }
    return String(g.orgId).toLowerCase();
  } finally { lock.releaseLock(); }
}

function loginClave_(d) {
  const usuario = String(d.usuario || '').trim().toLowerCase();
  const clave = String(d.clave || '');
  const nombre = texto_(d.nombre, 60);
  const tienda = texto_(d.tienda, 60);
  if (!usuario || !clave) throw fallo_('DATOS', 'Escribe el usuario y la contraseña.');
  if (nombre.length < 3) throw fallo_('DATOS', 'Escribe tu nombre.');
  const c = (cfg_().CUENTAS || {})[usuario];

  /* Bloqueos por contraseñas equivocadas. La cuenta de Tiendas la comparten cientos de personas:
     los errores de una persona solo la bloquean a ella. La cuenta completa se bloquea solo si
     llegan muchísimos intentos fallidos juntos (alguien probando contraseñas). */
  const cache = cache_();
  const kp = 'fallidos:' + usuario + ':' + nombre.toLowerCase() + '@' + normTienda_(tienda);
  const kc = 'fallidos-cuenta:' + usuario;
  const topeCuenta = c && c.rol === 'tiendas' ? ALERTAS.INTENTOS_CUENTA_TIENDAS : ALERTAS.INTENTOS_CUENTA;
  const malosCuenta = Number(cache.get(kc) || 0), malosPersona = Number(cache.get(kp) || 0);
  if (malosCuenta >= topeCuenta) throw fallo_('LIMITE', 'Hay demasiados intentos fallidos con esta cuenta. Espera 15 minutos o avisa a Workforce HN.');
  if (malosPersona >= ALERTAS.INTENTOS_PERSONA) throw fallo_('LIMITE', 'Demasiados intentos fallidos. Espera 15 minutos.');
  if (!c || !verificarClave_(clave, c)) {
    cache.put(kp, String(malosPersona + 1), 900);
    cache.put(kc, String(malosCuenta + 1), 900);
    Utilities.sleep(500);
    throw fallo_('ACCESO', 'Usuario o contraseña incorrectos.');
  }
  cache.remove(kp);
  // La tienda tiene que ser una de la lista (se guarda con el nombre exacto de la hoja Tiendas)
  let suTienda = '';
  if (c.rol === 'tiendas') {
    const k = normTienda_(tienda);
    suTienda = (k && tiendas_().filter((t) => normTienda_(t) === k)[0]) || '';
    if (!suTienda) throw fallo_('DATOS', tienda ? 'Elige tu tienda de la lista.' : 'Elige la tienda desde donde atiendes.');
  }
  const id = usuario + ':' + nombre.toLowerCase() + (suTienda ? '@' + suTienda.toLowerCase() : '');
  return emitirSesion_({ u: id, n: nombre, r: c.rol, t: suTienda, o: 'clave', a: usuario });
}

function emitirSesion_(p) {
  const ahora = Date.now();
  p.i = ahora;
  p.e = ahora + ALERTAS.HORAS_SESION * 3600000;
  const cuerpo = Utilities.base64EncodeWebSafe(JSON.stringify(p), Utilities.Charset.UTF_8);
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(cuerpo, secreto_(), Utilities.Charset.UTF_8));
  return { token: cuerpo + '.' + firma, usuario: usuarioPublico_(p), expira: p.e };
}
function usuarioPublico_(p) {
  return { u: p.u, nombre: p.n, rol: p.r, acceso: ALERTAS.ROLES[p.r], tienda: p.t || '', origen: p.o };
}

function leerSesion_(token) {
  if (!token || typeof token !== 'string' || token.length > 4000) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], secreto_(), Utilities.Charset.UTF_8));
  if (!iguales_(firma, partes[1])) return null;
  let p;
  try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString('UTF-8')); } catch (e) { return null; }
  if (!p || !p.e || Date.now() > p.e || !ALERTAS.ROLES[p.r]) return null;
  if (p.o === 'clave') {
    // Si la cuenta se quitó o se le cambió la contraseña, las sesiones anteriores dejan de valer
    const c = (cfg_().CUENTAS || {})[p.a];
    if (!c || c.rol !== p.r || (c.creada || 0) > p.i) return null;
  }
  if (p.o === 'genesys') {
    // Bloquear a alguien en la hoja Usuarios corta también la sesión que ya tenía abierta
    const reg = usuarios_()[p.u];
    if (reg && (!reg.activo || reg.rol === 'bloqueado')) return null;
    if (!reg && (cfg_().GENESYS || {}).rolPorDefecto === 'ninguno') return null;
  }
  return p;
}

function exigirWorkforce_(ses) {
  if (ALERTAS.ESCRIBEN.indexOf(ses.r) < 0) throw fallo_('PERMISO', 'Tu acceso no permite esta acción.');
  if (ses.o === 'genesys') {
    // Si alguien sale de la lista de Usuarios, pierde el permiso de inmediato
    const reg = usuarios_()[ses.u];
    if (!reg || !reg.activo || ALERTAS.ESCRIBEN.indexOf(reg.rol) < 0) throw fallo_('PERMISO', 'Tu acceso ya no permite esta acción.');
  }
}

function usuarios_() {
  const c = cache_().get('usuarios');
  if (c) return JSON.parse(c);
  const h = hoja_(ALERTAS.HOJAS.usuarios);
  const mapa = {};
  const ult = h.getLastRow();
  if (ult >= 2) {
    h.getRange(2, 1, ult - 1, 4).getValues().forEach((f) => {
      const correo = String(f[0] || '').trim().toLowerCase();
      if (!correo) return;
      const rol = String(f[2] || '').trim().toLowerCase();
      const activo = !/^no$/i.test(String(f[3] || '').trim());
      mapa[correo] = { nombre: String(f[1] || '').trim(), rol: ALERTAS.ROLES[rol] || rol === 'bloqueado' ? rol : 'concentrix', activo: activo };
    });
  }
  cache_().put('usuarios', JSON.stringify(mapa), 300);
  return mapa;
}

/* Contraseñas: se guarda un hash con sal, nunca la contraseña */
function hashClave_(clave, sal, iter) {
  let h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ':' + clave, Utilities.Charset.UTF_8);
  const salBytes = Utilities.newBlob(sal).getBytes();
  for (let i = 1; i < iter; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(salBytes));
  return Utilities.base64Encode(h);
}
function verificarClave_(clave, cuenta) {
  return iguales_(hashClave_(clave, cuenta.sal, cuenta.iter || ALERTAS.ITERACIONES_CLAVE), cuenta.hash);
}
function iguales_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function limitar_(ses) {
  const hora = Math.floor(Date.now() / 3600000);
  const c = cache_();
  const k = 'limite:' + ses.u + ':' + hora;
  const n = Number(c.get(k) || 0) + 1;
  if (n > ALERTAS.LIMITE_CONSULTAS_HORA) throw fallo_('LIMITE', 'Llegaste al límite de ' + ALERTAS.LIMITE_CONSULTAS_HORA + ' consultas por hora.');
  c.put(k, String(n), 3700);
  if (ses.o === 'clave' && ses.r === 'tiendas') {
    const kc = 'limite-cuenta:' + ses.a + ':' + hora;
    const m = Number(c.get(kc) || 0) + 1;
    if (m > ALERTAS.LIMITE_TIENDAS_HORA) throw fallo_('LIMITE', 'La cuenta de Tiendas llegó a su límite de consultas por hora.');
    c.put(kc, String(m), 3700);
  }
}

/* ============================================================================
 *  Estado, carga inicial y búsqueda
 * ========================================================================== */

function accionEstado_() {
  const e = estado_();
  return { version: e.version, baseVersion: e.baseVersion, cambio: e.cambio, ahora: Date.now() };
}

function accionCargar_(d, ses) {
  const e = estado_();
  const escribe = ALERTAS.ESCRIBEN.indexOf(ses.r) >= 0;
  const res = { version: e.version, baseVersion: e.baseVersion, cambio: e.cambio, ahora: Date.now(), resumen: resumenBase_(), usuario: usuarioPublico_(ses) };
  if (Number(d.baseVersion) !== e.baseVersion) res.catalogo = catalogo_();
  if (escribe) {
    const desde = Date.now() - ALERTAS.DIAS_FALLAS_CARGA * 86400000;
    res.fallas = leerFallas_().filter((f) => f.estado === 'ACTIVA' || f.publicadaEn >= desde);
    res.cargas = leerCargas_();
  } else {
    res.fallas = fallasVisibles_();
  }
  return res;
}

function accionBuscar_(d, ses) {
  const dig = String(d.q || '').replace(/\D+/g, '');
  let tipo = '';
  if (dig.length >= 1 && dig.length <= 9) tipo = 'contrato';
  else if (dig.length >= 13 && dig.length <= 14) tipo = 'dni';
  else throw fallo_('DATOS', 'Escribe un contrato (6 a 8 dígitos) o un DNI (13 dígitos).');
  limitar_(ses);
  const q = tipo === 'contrato' ? String(Number(dig)) : dig;
  const h = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!h) throw fallo_('BASE', 'La base se está actualizando. Intenta en unos segundos.');
  const ult = h.getLastRow();
  const ncol = h.getLastColumn();
  let filas = [];
  if (ult >= 2) {
    const cols = h.getRange(1, 1, 1, ncol).getValues()[0].map(String);
    const ci = cols.indexOf(tipo === 'contrato' ? 'CONTRATO' : 'DNI') + 1;
    const hallados = h.getRange(2, ci, ult - 1, 1).createTextFinder(q).matchEntireCell(true).findAll();
    filas = hallados.slice(0, 20).map((r) => registro_(cols, h.getRange(r.getRow(), 1, 1, ncol).getValues()[0]));
  }
  const visibles = fallasVisibles_();
  const rel = visibles.filter((f) => filas.some((x) => f.nodos.indexOf(x.nodo) >= 0));
  const e = estado_();
  const historial = filas.length ? historialNodos_(filas.map((x) => x.nodo), ALERTAS.ESCRIBEN.indexOf(ses.r) >= 0, e.version) : {};
  let principal = null;
  filas.forEach((x) => {
    const v = veredicto_(visibles, x.nodo);
    if (!principal || PRIORIDAD_[v.tipo] < PRIORIDAD_[principal.v.tipo]) principal = { x: x, v: v };
  });
  registrarConsulta_(ses, {
    tipo: tipo, contrato: principal ? principal.x.contrato : '', nodo: principal ? principal.x.nodo : '',
    resultado: principal ? principal.v.tipo : 'NO_ENCONTRADO', falla: principal && principal.v.falla ? principal.v.falla.id : ''
  });
  return { estado: filas.length ? 'ok' : 'no', tipo: tipo, q: q, filas: filas, fallas: rel, historial: historial, version: e.version };
}

/* Historial de fallas de cada nodo (último año) para la tarjeta del cliente, con el número de falla */
function historialNodos_(nodos, completo, version) {
  const out = {};
  nodos.forEach((n) => { out[n] = []; });
  fallasHistorial_(version).forEach((f) => f.nodos.forEach((n) => {
    if (!out[n]) return;
    const x = { id: f.id, motivo: f.motivo, motivoTexto: f.motivoTexto, inicio: f.inicio, fin: f.fin };
    if (f.numero) x.numero = f.numero;
    out[n].push(x);
  }));
  return out;
}
/* Todas las fallas del periodo, en caché por versión: cada cambio de Workforce sube la versión y la caché se renueva sola */
function fallasHistorial_(version) {
  const c = cache_(), pref = 'hist:' + version + ':';
  const n = Number(c.get(pref + 'n') || 0);
  if (n) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(pref + i);
    const partes = c.getAll(keys);
    if (keys.every((k) => partes[k] != null)) return JSON.parse(keys.map((k) => partes[k]).join(''));
  }
  const desde = Date.now() - ALERTAS.DIAS_HISTORIAL * 86400000;
  const lista = leerFallas_().filter((f) => f.estado === 'ACTIVA' || (f.cerradaEn || 0) >= desde)
    .map((f) => ({ id: f.id, numero: f.numero, motivo: f.motivo, motivoTexto: f.motivoTexto, nodos: f.nodos, inicio: f.inicio, fin: f.estado === 'ACTIVA' ? null : f.cerradaEn }));
  const txt = JSON.stringify(lista), partes = {};
  let i = 0;
  for (let p = 0; p < txt.length; p += 90000) partes[pref + (i++)] = txt.slice(p, p + 90000);
  partes[pref + 'n'] = String(i);
  try { c.putAll(partes, 21600); } catch (err) { /* si no cabe, se vuelve a leer de la hoja */ }
  return lista;
}

/* Cuántas veces consultaron este contrato antes (la bitácora guarda 30 días) y cuándo fue la vez anterior.
   La página lo pide después de mostrar el veredicto, para no hacer más lenta la búsqueda. */
function accionContactos_(d, ses) {
  const c = String(d.contrato || '').replace(/\D+/g, '').slice(0, 9);
  if (!c) throw fallo_('DATOS', 'Falta el contrato.');
  const h = hojaConsultas_();
  const ult = h ? h.getLastRow() : 0;
  if (ult < 2) return { n7: 0, n30: 0, anterior: null };
  const filas = h.getRange(2, 7, ult - 1, 1).createTextFinder(c).matchEntireCell(true).findAll()
    .map((r) => r.getRow()).sort((a, b) => b - a);           // de la más reciente a la más vieja
  const ahora = Date.now();
  let n7 = 0, anterior = null, actual = 0;
  // Las fechas se leen una por una: con las 25 más recientes sobra para un cliente
  for (let i = 0; i < filas.length && i < 25; i++) {
    const v = h.getRange(filas[i], 1).getValue();
    const t = v && typeof v.getTime === 'function' ? v.getTime() : Date.parse(v) || 0;
    if (i === 0 && ahora - t < 120000) { actual = 1; continue; }   // la consulta que se está viendo ahora
    if (anterior === null) anterior = t;
    if (ahora - t <= 7 * 86400000) n7++;
  }
  return { n7: n7, n30: filas.length - actual, anterior: anterior };
}

function accionReportar_(d, ses) {
  const contrato = String(d.contrato || '').replace(/\D+/g, '').slice(0, 9);
  const nodo = String(d.nodo || '').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').slice(0, 40);
  if (!nodo) throw fallo_('DATOS', 'Falta el nodo.');
  limitar_(ses);
  registrarConsulta_(ses, { tipo: 'reporte', contrato: contrato, nodo: nodo, resultado: 'SIN_FALLA', falla: '' });
  cache_().remove('alertas');
  return { listo: true };
}

const PRIORIDAD_ = { FALLA: 0, RESUELTA: 1, SIN_FALLA: 2, SIN_NODO: 3 };
function esVirtual_(nodo) { return /VIRTUAL|VITUAL/i.test(nodo || ''); }
function veredicto_(visibles, nodo) {
  const lst = visibles.filter((f) => f.nodos.indexOf(nodo) >= 0).sort((a, b) => b.publicadaEn - a.publicadaEn);
  const act = lst.filter((f) => f.estado === 'ACTIVA')[0];
  if (act) return { tipo: 'FALLA', falla: act };
  const res = lst.filter((f) => f.estado === 'CERRADA')[0];
  if (res) return { tipo: 'RESUELTA', falla: res };
  return { tipo: esVirtual_(nodo) ? 'SIN_NODO' : 'SIN_FALLA', falla: null };
}

function registro_(cols, v) {
  const g = (k) => { const i = cols.indexOf(k); return i < 0 || v[i] == null ? '' : String(v[i]); };
  return {
    contrato: g('CONTRATO'), producto: g('PRODUCT_ID'), nodo: g('GRUPO_NODO'), olt: g('OLT'), nap: g('NAP'),
    categoria: g('CATEGORIA_CLIENTE'), fecha: g('FECHA_INICIO'), tecnologia: g('TECNOLOGIA'), play: g('PLAY'),
    departamento: g('DEPARTAMENTO'), municipio: g('MUNICIPIO'), colonia: g('COLONIA'), nombre: g('NOMBRE_CLIENTE'),
    dni: g('DNI'), megas: g('MEGAS')
  };
}

/* ============================================================================
 *  Fallas
 * ========================================================================== */

function filaAFalla_(f, n) {
  let d = {};
  try { d = JSON.parse(f[18] || '{}'); } catch (e) { d = {}; }
  return {
    id: String(f[0]), estado: d.estado || (String(f[1]) === 'Activa' ? 'ACTIVA' : 'CERRADA'), motivo: d.motivo || 'OTRO',
    motivoTexto: String(f[3] || ''), clienteTexto: String(f[4] || ''), nodos: d.nodos || String(f[5] || '').split(/,\s*/).filter(String),
    inicio: d.inicio || 0, eta: d.eta || null, publicadaEn: d.publicadaEn || 0, publicadaPor: d.publicadaPor || { u: '', nombre: String(f[9] || '') },
    cerradaEn: d.cerradaEn || null, cerradaPor: d.cerradaPor || null, notaCierre: String(f[12] || ''), referencia: String(f[13] || ''),
    detalle: String(f[14] || ''), impacto: d.impacto || { total: Number(f[15]) || 0, hfc: Number(f[16]) || 0, gpon: Number(f[17]) || 0, corp: 0, deps: [], munis: [] },
    numero: String(f[19] == null ? '' : f[19]), historial: d.historial || [], _fila: n
  };
}
function fallaAFila_(f) {
  const fecha = (ms) => (ms ? new Date(ms) : '');
  return [f.id, f.estado === 'ACTIVA' ? 'Activa' : 'Resuelta', ALERTAS.MOTIVOS[f.motivo] || f.motivo, f.motivoTexto, f.clienteTexto,
    f.nodos.join(', '), fecha(f.inicio), fecha(f.eta), fecha(f.publicadaEn), f.publicadaPor ? f.publicadaPor.nombre : '',
    fecha(f.cerradaEn), f.cerradaPor ? f.cerradaPor.nombre : '', f.notaCierre, f.referencia, f.detalle,
    f.impacto.total, f.impacto.hfc, f.impacto.gpon,
    JSON.stringify({ estado: f.estado, motivo: f.motivo, nodos: f.nodos, inicio: f.inicio, eta: f.eta, publicadaEn: f.publicadaEn,
      publicadaPor: f.publicadaPor, cerradaEn: f.cerradaEn, cerradaPor: f.cerradaPor, impacto: f.impacto, historial: f.historial }),
    f.numero || ''];
}
/* La columna "Número de falla" se agregó después: si la hoja Fallas no la tiene, se le pone al final */
function columnaNumeroFallas_(h) {
  const n = COL_FALLAS.length;
  if (h.getMaxColumns() < n) h.insertColumnsAfter(h.getMaxColumns(), n - h.getMaxColumns());
  const cab = h.getRange(1, n);
  if (String(cab.getValue()) !== COL_FALLAS[n - 1]) {
    cab.setValue(COL_FALLAS[n - 1]).setFontWeight('bold');
    h.getRange(2, n, Math.max(1, h.getMaxRows() - 1), 1).setNumberFormat('@');
  }
}
function leerFallas_(h) {
  h = h || hoja_(ALERTAS.HOJAS.fallas);
  const ult = h.getLastRow();
  if (ult < 2) return [];
  return h.getRange(2, 1, ult - 1, Math.min(COL_FALLAS.length, h.getMaxColumns())).getValues()
    .map((f, i) => (f[0] ? filaAFalla_(f, i + 2) : null)).filter(Boolean);
}
function sinFila_(f) { const c = {}; Object.keys(f).forEach((k) => { if (k !== '_fila') c[k] = f[k]; }); return c; }
/* Lo que recibe quien atiende (Concentrix y Tiendas): con el número de falla (es como se nombra la falla),
   pero sin referencia, notas internas, historial ni correos. Esa parte solo la ve Workforce HN. */
function fallaPublica_(f) {
  return {
    id: f.id, numero: f.numero || '', estado: f.estado, motivo: f.motivo, motivoTexto: f.motivoTexto, clienteTexto: f.clienteTexto, nodos: f.nodos,
    inicio: f.inicio, eta: f.eta, publicadaEn: f.publicadaEn, publicadaPor: { nombre: (f.publicadaPor && f.publicadaPor.nombre) || '' },
    cerradaEn: f.cerradaEn, impacto: f.impacto
  };
}

/* Las fallas que ven los asesores: activas y cerradas hace menos de 36 horas */
function fallasVisibles_() {
  const ahora = Date.now();
  let recientes;
  const c = cache_().get('fallasRecientes');
  if (c) recientes = JSON.parse(c);
  else {
    const corte = ahora - 48 * 3600000;
    recientes = leerFallas_().filter((f) => f.estado === 'ACTIVA' || (f.cerradaEn && f.cerradaEn >= corte)).map(sinFila_);
    const txt = JSON.stringify(recientes);
    if (txt.length < 95000) cache_().put('fallasRecientes', txt, 600);
  }
  return recientes.filter((f) => f.estado === 'ACTIVA' || (f.cerradaEn && ahora - f.cerradaEn < ALERTAS.HORAS_VISIBLE * 3600000)).map(fallaPublica_);
}

function accionFalla_(d, ses) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fallo_('OCUPADO', 'Otra persona está guardando un cambio. Intenta de nuevo.');
  try {
    const h = hoja_(ALERTAS.HOJAS.fallas);
    const todas = leerFallas_(h);
    const ahora = Date.now();
    const por = { u: ses.u, nombre: ses.n };
    let f, texto, tipo;
    if (d.op === 'publicar') {
      const datos = validarFalla_(d.falla || {}, ahora, true);
      f = Object.assign(datos, {
        id: nuevoId_(todas, ahora), estado: 'ACTIVA', publicadaEn: ahora, publicadaPor: por, cerradaEn: null, cerradaPor: null, notaCierre: '',
        historial: [{ accion: 'PUBLICADA', en: ahora, por: por, detalle: datos.nodos.length === 1 ? '1 nodo' : datos.nodos.length + ' nodos' }]
      });
      tipo = 'FALLA_PUBLICADA';
      texto = 'publicó la falla ' + nombreFalla_(f) + ' (' + nombreMotivo_(f) + ' en ' + lista_(f.nodos, 2) + ')';
    } else {
      f = todas.filter((x) => x.id === String(d.id || ''))[0];
      if (!f) throw fallo_('DATOS', 'La falla ya no existe.');
      if (d.op === 'editar') {
        const datos = validarFalla_(Object.assign({}, f, d.falla || {}), ahora, false);
        Object.assign(f, datos);
        const det = texto_(d.detalle, 200);
        f.historial.push({ accion: 'EDITADA', en: ahora, por: por, detalle: det });
        tipo = 'FALLA_EDITADA';
        texto = 'actualizó la falla ' + nombreFalla_(f) + (det ? ' (' + det + ')' : '');
      } else if (d.op === 'cerrar') {
        if (f.estado === 'CERRADA') throw fallo_('DATOS', 'Otra persona ya cerró esta falla.');
        const cuando = Math.min(Number(d.cerradaEn) || ahora, ahora);
        f.estado = 'CERRADA'; f.cerradaEn = Math.max(cuando, f.inicio); f.cerradaPor = por; f.notaCierre = texto_(d.nota, 200);
        f.historial.push({ accion: 'CERRADA', en: ahora, por: por, detalle: f.notaCierre });
        tipo = 'FALLA_CERRADA';
        texto = 'cerró la falla ' + nombreFalla_(f) + ' (' + nombreMotivo_(f) + ')';
      } else if (d.op === 'reabrir') {
        if (f.estado === 'ACTIVA') throw fallo_('DATOS', 'La falla ya está activa.');
        f.estado = 'ACTIVA'; f.cerradaEn = null; f.cerradaPor = null; f.notaCierre = '';
        f.historial.push({ accion: 'REABIERTA', en: ahora, por: por, detalle: '' });
        tipo = 'FALLA_REABIERTA';
        texto = 'reabrió la falla ' + nombreFalla_(f);
      } else throw fallo_('DATOS', 'Operación no válida.');
    }
    columnaNumeroFallas_(h);
    const fila = fallaAFila_(f);
    if (f._fila) h.getRange(f._fila, 1, 1, fila.length).setValues([fila]);
    else h.appendRow(fila);
    cache_().remove('fallasRecientes');
    cache_().remove('alertas');
    const e = subirVersion_({ tipo: tipo, texto: texto, por: por, en: ahora });
    return { falla: sinFila_(f), version: e.version };
  } finally {
    lock.releaseLock();
  }
}

function validarFalla_(x, ahora, nueva) {
  const cat = catalogo_();
  if (!cat) throw fallo_('BASE', 'Primero sube la base de clientes.');
  const idx = indiceCatalogo_(cat);
  const nodos = [];
  (Array.isArray(x.nodos) ? x.nodos : []).forEach((n) => {
    const c = String(n || '').toUpperCase().trim();
    if (idx[c] && nodos.indexOf(c) < 0) nodos.push(c);
  });
  if (!nodos.length) throw fallo_('DATOS', 'Agrega al menos un nodo que exista en la base.');
  if (nodos.length > 600) throw fallo_('DATOS', 'Son demasiados nodos para una sola falla.');
  const motivo = ALERTAS.MOTIVOS[x.motivo] ? x.motivo : null;
  if (!motivo) throw fallo_('DATOS', 'Elige el motivo de la falla.');
  const motivoTexto = motivo === 'OTRO' ? texto_(x.motivoTexto, 80) : '';
  const clienteTexto = motivo === 'OTRO' ? texto_(x.clienteTexto, 160) : '';
  if (motivo === 'OTRO' && (!motivoTexto || !clienteTexto)) throw fallo_('DATOS', 'Escribe el motivo y cómo se le explica al cliente.');
  let inicio = Number(x.inicio) || ahora;
  if (inicio > ahora + 3600000) inicio = ahora;
  if (nueva && inicio < ahora - 30 * 86400000) throw fallo_('DATOS', 'La hora de inicio no es válida.');
  let eta = x.eta == null || x.eta === '' ? null : Number(x.eta);
  if (eta != null && (!isFinite(eta) || eta <= inicio)) eta = null;
  return {
    nodos: nodos, motivo: motivo, motivoTexto: motivoTexto, clienteTexto: clienteTexto, inicio: inicio, eta: eta,
    numero: texto_(x.numero, 30).toUpperCase().replace(/[\s-]+/g, ''), referencia: texto_(x.referencia, 120), detalle: texto_(x.detalle, 300),
    impacto: impacto_(cat, nodos, idx)
  };
}

/* ID de cada falla: F + fecha de Honduras (aammdd) + número del día, sin guiones: F26110201.
   Las publicadas antes del 2 nov 2026 tienen guiones (F-261030-05): se muestran sin ellos
   (idFalla_) y cuentan para el número del día, así nunca se repite un ID. */
const idFalla_ = (id) => String(id == null ? '' : id).replace(/-/g, '');
/* Cómo se nombra una falla en pantalla y en los textos: el número de falla que pone Workforce
   (por ejemplo F1254585) y, si todavía no lo tiene, el ID de Alertas */
const nombreFalla_ = (f) => (f && f.numero ? String(f.numero) : idFalla_(f && f.id));
function nuevoId_(todas, ahora) {
  const pref = 'F' + Utilities.formatDate(new Date(ahora), ALERTAS.ZONA, 'yyMMdd');
  let max = 0;
  todas.forEach((f) => { const id = idFalla_(f.id); if (id.indexOf(pref) === 0) max = Math.max(max, Number(id.slice(pref.length)) || 0); });
  return pref + String(max + 1).padStart(2, '0');
}
function nombreMotivo_(f) { return f.motivo === 'OTRO' ? (f.motivoTexto || 'Otro motivo') : ALERTAS.MOTIVOS[f.motivo]; }
function lista_(arr, max) {
  if (arr.length <= max) return arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
  return arr.slice(0, max).join(', ') + ' y ' + (arr.length - max) + ' más';
}
function texto_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max); }

/* ============================================================================
 *  Catálogo de nodos (clientes por nodo, sin datos personales)
 *  nodos: [codigo, total, hfc, gpon, empresariales, indiceOlt, [dep, n, ...], [muni, n, ...]]
 * ========================================================================== */

function catalogo_() {
  const bv = estado_().baseVersion;
  if (!bv) return null;
  const c = cache_();
  const n = Number(c.get('cat:' + bv + ':n') || 0);
  if (n) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('cat:' + bv + ':' + i);
    const partes = c.getAll(keys);
    if (keys.every((k) => partes[k] != null)) return JSON.parse(keys.map((k) => partes[k]).join(''));
  }
  const h = libro_().getSheetByName(ALERTAS.HOJAS.catalogo);
  if (!h || h.getLastRow() < 1) return null;
  const txt = h.getRange(1, 1, h.getLastRow(), 1).getValues().map((f) => String(f[0])).join('');
  if (!txt) return null;
  guardarCatalogoCache_(txt, bv);
  return JSON.parse(txt);
}
function guardarCatalogoCache_(txt, bv) {
  const partes = {};
  let i = 0;
  for (let p = 0; p < txt.length; p += 40000) partes['cat:' + bv + ':' + (i++)] = txt.slice(p, p + 40000);
  partes['cat:' + bv + ':n'] = String(i);
  try { cache_().putAll(partes, 21600); } catch (e) { /* si no cabe, se lee de la hoja */ }
}
function indiceCatalogo_(cat) {
  const idx = {};
  cat.nodos.forEach((n) => { idx[n[0]] = n; });
  return idx;
}
function impacto_(cat, nodos, idx) {
  idx = idx || indiceCatalogo_(cat);
  let total = 0, hfc = 0, gpon = 0, corp = 0;
  const deps = {}, munis = {};
  nodos.forEach((code) => {
    const n = idx[code];
    if (!n) return;
    total += n[1]; hfc += n[2]; gpon += n[3]; corp += n[4];
    for (let i = 0; i < n[6].length; i += 2) { const k = cat.deps[n[6][i]]; deps[k] = (deps[k] || 0) + n[6][i + 1]; }
    for (let i = 0; i < n[7].length; i += 2) { const k = cat.munis[n[7][i]]; munis[k] = (munis[k] || 0) + n[7][i + 1]; }
  });
  const orden = (m) => Object.keys(m).map((k) => [k, m[k]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { total: total, hfc: hfc, gpon: gpon, corp: corp, deps: orden(deps), munis: orden(munis) };
}
function resumenBase_() {
  const c = cache_().get('resumen');
  if (c) return JSON.parse(c);
  const raw = props_().getProperty('BASE_RESUMEN');
  const r = raw ? JSON.parse(raw) : null;
  if (r) cache_().put('resumen', raw, 21600);
  return r;
}

/* ============================================================================
 *  Carga de la base semanal
 *
 *  Por cambios (la normal, cuando ya hay base con HUELLA):
 *   huella:  la página recibe la huella de cada fila y la compara con el Excel nuevo
 *   cambios: agrega al final las filas nuevas o cambiadas y vacía las que ya no vienen.
 *            Revisa antes que la base sea la misma que comparó la página; si algo no
 *            cuadra responde COMPLETA y la página hace la carga completa.
 *
 *  Completa (la primera vez, si cambian las columnas o si hay muchas filas vacías):
 *   iniciar:   crea Base_nueva con el tamaño exacto
 *   lote:      escribe 5,000 filas por vez
 *   finalizar: compara con la anterior, borra la anterior y deja la nueva como Base
 * ========================================================================== */

function accionBase_(d, ses) {
  if (d.op === 'huella') return baseHuella_(d, ses);
  if (d.op === 'cambios') return baseCambios_(d, ses);
  if (d.op === 'iniciar') return baseIniciar_(d, ses);
  if (d.op === 'lote') return baseLote_(d, ses);
  if (d.op === 'finalizar') return baseFinalizar_(d, ses);
  if (d.op === 'cancelar') return baseCancelar_(d, ses);
  throw fallo_('DATOS', 'Operación no válida.');
}

/* La huella de cada fila, en el orden de la hoja ('' en las filas vacías) */
function baseHuella_(d, ses) {
  const h = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!h || h.getLastRow() < 2) return { huellas: null };
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  const iH = cols.indexOf('HUELLA') + 1;
  if (!iH) return { huellas: null, columnas: cols };
  const n = h.getLastRow() - 1;
  const v = h.getRange(2, iH, n, 1).getValues();
  let vacias = 0;
  const lista = v.map((f) => { const x = String(f[0]); if (!x) vacias++; return x; });
  return { columnas: cols, huellas: lista.join(','), filas: n, vacias: vacias, baseVersion: estado_().baseVersion || 0 };
}

function baseCambios_(d, ses) {
  const columnas = Array.isArray(d.columnas) ? d.columnas.map(String) : [];
  const quitar = Array.isArray(d.quitar) ? d.quitar.map((x) => Math.floor(Number(x))) : [];
  const esperadas = Array.isArray(d.esperadas) ? d.esperadas.map(String) : [];
  const agregar = Array.isArray(d.agregar) ? d.agregar : [];
  const total = Math.floor(Number(d.total) || 0);
  if (quitar.length !== esperadas.length || agregar.length > ALERTAS.MAX_CAMBIOS || quitar.length > 600000 || total < 1 || total > 600000) throw fallo_('DATOS', 'Los cambios no son válidos.');
  for (let k = 1; k < quitar.length; k++) if (!(quitar[k] > quitar[k - 1])) throw fallo_('DATOS', 'Los cambios no son válidos.');
  const { cat, txt } = catalogoRecibido_(d);
  const nc = columnas.length, iC = columnas.indexOf('CONTRATO'), iN = columnas.indexOf('GRUPO_NODO'), iH = columnas.indexOf('HUELLA');
  if (iC < 0 || iN < 0 || iH < 0) throw fallo_('COMPLETA', 'La base no tiene huella.');
  const nuevas = agregar.map((f) => {
    if (!Array.isArray(f) || f.length !== nc) throw fallo_('DATOS', 'Una fila nueva no tiene las columnas esperadas.');
    const g = f.map((v) => String(v == null ? '' : v).slice(0, 300));
    if (!g[iC] || !g[iH]) throw fallo_('DATOS', 'Una fila nueva no trae contrato.');
    return g;
  });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw fallo_('OCUPADO', 'El servidor está ocupado. Intenta de nuevo.');
  try {
    const ss = libro_();
    const previa = cargaActual_();
    if (previa && previa.por.u !== ses.u && Date.now() - previa.inicio < 30 * 60000) throw fallo_('OCUPADO', previa.por.nombre + ' está subiendo una base en este momento.');
    if (previa) { const hn = ss.getSheetByName(ALERTAS.HOJAS.nueva); if (hn) ss.deleteSheet(hn); props_().deleteProperty('CARGA'); }
    if ((estado_().baseVersion || 0) !== Math.floor(Number(d.baseVersion) || 0)) throw fallo_('COMPLETA', 'La base cambió mientras se comparaba.');
    const h = ss.getSheetByName(ALERTAS.HOJAS.base);
    if (!h || h.getLastRow() < 2) throw fallo_('COMPLETA', 'Todavía no hay base.');
    const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
    if (cols.join('|') !== columnas.join('|')) throw fallo_('COMPLETA', 'Las columnas de la base cambiaron.');
    const ult = h.getLastRow(), n = ult - 1;
    const hu = h.getRange(2, iH + 1, n, 1).getValues();
    let llenas = 0;
    for (let i = 0; i < n; i++) if (String(hu[i][0])) llenas++;
    for (let k = 0; k < quitar.length; k++) {
      const r = quitar[k];
      if (!(r >= 2 && r <= ult) || !esperadas[k] || String(hu[r - 2][0]) !== esperadas[k]) throw fallo_('COMPLETA', 'La base interna no coincide con la comparación.');
    }
    if (llenas - quitar.length + nuevas.length !== total) throw fallo_('COMPLETA', 'Las cuentas de filas no cuadran.');
    const vc = h.getRange(2, iC + 1, n, 1).getValues(), vn = h.getRange(2, iN + 1, n, 1).getValues();
    // 1. Primero las filas nuevas, al final: así ningún cliente que sigue en la base deja de aparecer
    if (nuevas.length) {
      const r0 = ult + 1, falta = r0 + nuevas.length - 1 - h.getMaxRows();
      if (falta > 0) h.insertRowsAfter(h.getMaxRows(), falta);
      const rg = h.getRange(r0, 1, nuevas.length, nc);
      rg.setNumberFormat('@');
      rg.setValues(nuevas);
    }
    // 2. Después se vacían las que ya no vienen (o que cambiaron, porque su versión nueva ya está al final)
    const tramos = tramos_(quitar), letra = letraColumna_(nc);
    for (let i = 0; i < tramos.length; i += 500) h.getRangeList(tramos.slice(i, i + 500).map((t) => 'A' + t[0] + ':' + letra + t[1])).clearContent();
    const comp = compararCambios_(vc, vn, quitar, nuevas, iC, iN);
    const res = cerrarCarga_(ss, txt, cat, { total: total, columnas: columnas, archivo: texto_(d.archivo, 120), por: { u: ses.u, nombre: ses.n } }, comp);
    return Object.assign(res, { modo: 'cambios', agregadas: nuevas.length, quitadas: quitar.length });
  } finally {
    lock.releaseLock();
  }
}

/* [[2,4],[9,9]] para las filas 2,3,4,9 (ya ordenadas) */
function tramos_(filas) {
  const out = [];
  filas.forEach((r) => { const t = out[out.length - 1]; if (t && r === t[1] + 1) t[1] = r; else out.push([r, r]); });
  return out;
}
function letraColumna_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/* Contratos nuevos, los que ya no aparecen y cambios de nodo, con la base de antes y los cambios */
function compararCambios_(vc, vn, quitar, nuevas, iC, iN) {
  const fuera = {};
  quitar.forEach((r) => { fuera[r - 2] = true; });
  const antes = {}, despues = {};
  for (let i = 0; i < vc.length; i++) {
    const c = String(vc[i][0]);
    if (!c) continue;
    const nodo = String(vn[i][0]);
    if (!(c in antes)) antes[c] = nodo;
    if (!fuera[i] && !(c in despues)) despues[c] = nodo;
  }
  nuevas.forEach((f) => { if (!(f[iC] in despues)) despues[f[iC]] = f[iN]; });
  let nuevos = 0, bajas = 0, cambios = 0;
  Object.keys(despues).forEach((c) => { if (!(c in antes)) nuevos++; else if (antes[c] !== despues[c]) cambios++; });
  Object.keys(antes).forEach((c) => { if (!(c in despues)) bajas++; });
  return { nuevos: nuevos, bajas: bajas, cambiosNodo: cambios };
}
function catalogoRecibido_(d) {
  const cat = d.catalogo;
  if (!cat || !Array.isArray(cat.nodos) || !Array.isArray(cat.deps) || !Array.isArray(cat.munis)) throw fallo_('DATOS', 'Falta el resumen por nodo.');
  const txt = JSON.stringify(cat);
  if (txt.length > 3000000) throw fallo_('DATOS', 'El resumen por nodo es demasiado grande.');
  return { cat: cat, txt: txt };
}

function cargaActual_() { const raw = props_().getProperty('CARGA'); return raw ? JSON.parse(raw) : null; }

function baseIniciar_(d, ses) {
  const total = Math.floor(Number(d.total) || 0);
  const columnas = Array.isArray(d.columnas) ? d.columnas.map(String) : [];
  if (total < 1 || total > 600000) throw fallo_('DATOS', 'La cantidad de filas no es válida.');
  const extra = columnas.slice(14);
  if (columnas.length < 14 || columnas.slice(0, 14).join() !== COL_BASE.slice(0, 14).join()
    || extra.some((c, i) => COL_OPCIONALES.indexOf(c) < 0 || extra.indexOf(c) !== i)) throw fallo_('DATOS', 'Las columnas de la base no son las esperadas.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fallo_('OCUPADO', 'El servidor está ocupado. Intenta de nuevo.');
  try {
    const previa = cargaActual_();
    if (previa && previa.por.u !== ses.u && Date.now() - previa.inicio < 30 * 60000) {
      throw fallo_('OCUPADO', previa.por.nombre + ' está subiendo una base en este momento.');
    }
    const ss = libro_();
    const vieja = ss.getSheetByName(ALERTAS.HOJAS.nueva);
    if (vieja) ss.deleteSheet(vieja);
    const h = ss.insertSheet(ALERTAS.HOJAS.nueva);
    const nc = columnas.length, nr = total + 1;
    if (h.getMaxColumns() > nc) h.deleteColumns(nc + 1, h.getMaxColumns() - nc);
    if (h.getMaxRows() < nr) h.insertRowsAfter(h.getMaxRows(), nr - h.getMaxRows());
    else if (h.getMaxRows() > nr) h.deleteRows(nr + 1, h.getMaxRows() - nr);
    h.getRange(1, 1, nr, nc).setNumberFormat('@');
    h.getRange(1, 1, 1, nc).setValues([columnas]);
    h.setFrozenRows(1);
    const carga = { id: Utilities.getUuid(), por: { u: ses.u, nombre: ses.n }, total: total, columnas: columnas, archivo: texto_(d.archivo, 120), inicio: Date.now() };
    props_().setProperty('CARGA', JSON.stringify(carga));
    return { id: carga.id, filasPorLote: ALERTAS.FILAS_POR_LOTE };
  } finally {
    lock.releaseLock();
  }
}

function baseLote_(d, ses) {
  const carga = cargaActual_();
  if (!carga || carga.id !== d.id) throw fallo_('DATOS', 'La carga ya no está activa. Empieza de nuevo.');
  if (carga.por.u !== ses.u) throw fallo_('PERMISO', 'Esta carga la empezó otra persona.');
  const desde = Math.floor(Number(d.desde) || 0);
  const filas = Array.isArray(d.filas) ? d.filas : [];
  const nc = carga.columnas.length;
  if (!filas.length || filas.length > ALERTAS.FILAS_POR_LOTE + 1000 || desde < 0 || desde + filas.length > carga.total) throw fallo_('DATOS', 'El lote no es válido.');
  const limpias = filas.map((f) => {
    if (!Array.isArray(f) || f.length !== nc) throw fallo_('DATOS', 'Una fila del lote no tiene las columnas esperadas.');
    return f.map((v) => String(v == null ? '' : v).slice(0, 300));
  });
  const h = libro_().getSheetByName(ALERTAS.HOJAS.nueva);
  if (!h) throw fallo_('DATOS', 'La carga se interrumpió. Empieza de nuevo.');
  h.getRange(2 + desde, 1, limpias.length, nc).setValues(limpias);
  return { escritas: desde + limpias.length };
}

function baseFinalizar_(d, ses) {
  const carga = cargaActual_();
  if (!carga || carga.id !== d.id) throw fallo_('DATOS', 'La carga ya no está activa. Empieza de nuevo.');
  if (carga.por.u !== ses.u) throw fallo_('PERMISO', 'Esta carga la empezó otra persona.');
  const { cat, txt } = catalogoRecibido_(d);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw fallo_('OCUPADO', 'El servidor está ocupado. Intenta de nuevo.');
  try {
    const ss = libro_();
    const nueva = ss.getSheetByName(ALERTAS.HOJAS.nueva);
    if (!nueva) throw fallo_('DATOS', 'La carga se interrumpió. Empieza de nuevo.');
    // Revisa que no falte ninguna fila
    const contratosNuevos = nueva.getRange(2, 1, carga.total, 1).getValues();
    if (!contratosNuevos.every((f) => String(f[0]))) throw fallo_('DATOS', 'Faltan filas por subir. Intenta la carga de nuevo.');
    const anterior = ss.getSheetByName(ALERTAS.HOJAS.base);
    const comp = compararBases_(anterior, nueva, carga.total, contratosNuevos);
    if (anterior) ss.deleteSheet(anterior);
    nueva.setName(ALERTAS.HOJAS.base);
    const res = cerrarCarga_(ss, txt, cat, { total: carga.total, columnas: carga.columnas, archivo: carga.archivo, por: carga.por }, comp);
    props_().deleteProperty('CARGA');
    return res;
  } finally {
    lock.releaseLock();
  }
}

/* Lo que se hace al terminar cualquier carga: catálogo por nodo, resumen, registro en Cargas y aviso a todos */
function cerrarCarga_(ss, txt, cat, info, comp) {
  let hc = ss.getSheetByName(ALERTAS.HOJAS.catalogo);
  if (!hc) { hc = ss.insertSheet(ALERTAS.HOJAS.catalogo); hc.hideSheet(); }
  hc.clear();
  const piezas = [];
  for (let p = 0; p < txt.length; p += 45000) piezas.push([txt.slice(p, p + 45000)]);
  if (hc.getMaxRows() < piezas.length) hc.insertRowsAfter(hc.getMaxRows(), piezas.length - hc.getMaxRows());
  hc.getRange(1, 1, piezas.length, 1).setNumberFormat('@');
  hc.getRange(1, 1, piezas.length, 1).setValues(piezas);
  const r = cat.resumen || {};
  const resumen = {
    filas: info.total, contratos: r.contratos || 0, hfc: r.hfc || 0, gpon: r.gpon || 0, nodos: cat.nodos.length, olts: r.olts || 0,
    virtuales: r.virtuales || 0, tieneMegas: info.columnas.indexOf('MEGAS') >= 0, archivo: info.archivo, en: Date.now(), por: info.por
  };
  props_().setProperty('BASE_RESUMEN', JSON.stringify(resumen));
  cache_().put('resumen', JSON.stringify(resumen), 21600);
  hoja_(ALERTAS.HOJAS.cargas).appendRow([new Date(), info.por.nombre, info.archivo, info.total, resumen.hfc, resumen.gpon, resumen.nodos,
    comp ? comp.nuevos : '', comp ? comp.bajas : '', comp ? comp.cambiosNodo : '']);
  const e0 = estado_();
  const e = subirVersion_({ tipo: 'BASE_ACTUALIZADA', texto: 'actualizó la base de clientes (' + info.total.toLocaleString('en-US') + ' servicios)', por: info.por, en: Date.now() },
    { baseVersion: (e0.baseVersion || 0) + 1 });
  guardarCatalogoCache_(txt, e.baseVersion);
  cache_().remove('alertas');
  return { comparacion: comp, version: e.version, baseVersion: e.baseVersion, resumen: resumen };
}

function compararBases_(anterior, nueva, total, nc) {
  if (!anterior || anterior.getLastRow() < 2) return null;
  const colsA = anterior.getRange(1, 1, 1, anterior.getLastColumn()).getValues()[0].map(String);
  const ca = colsA.indexOf('CONTRATO') + 1, na = colsA.indexOf('GRUPO_NODO') + 1;
  const nA = anterior.getLastRow() - 1;
  const vc = anterior.getRange(2, ca, nA, 1).getValues(), vn = anterior.getRange(2, na, nA, 1).getValues();
  const viejos = {};
  for (let i = 0; i < nA; i++) { const k = String(vc[i][0]); if (!(k in viejos)) viejos[k] = String(vn[i][0]); }
  const nn = nueva.getRange(2, 3, total, 1).getValues();
  const vistos = {};
  let nuevos = 0, cambios = 0;
  for (let i = 0; i < total; i++) {
    const k = String(nc[i][0]);
    if (vistos[k]) continue;
    vistos[k] = true;
    if (!(k in viejos)) nuevos++;
    else if (viejos[k] !== String(nn[i][0])) cambios++;
  }
  let bajas = 0;
  Object.keys(viejos).forEach((k) => { if (!vistos[k]) bajas++; });
  return { nuevos: nuevos, bajas: bajas, cambiosNodo: cambios };
}

function baseCancelar_(d, ses) {
  const carga = cargaActual_();
  if (carga && carga.por.u === ses.u) {
    const ss = libro_();
    const h = ss.getSheetByName(ALERTAS.HOJAS.nueva);
    if (h) ss.deleteSheet(h);
    props_().deleteProperty('CARGA');
  }
  return { listo: true };
}

function leerCargas_() {
  const h = hoja_(ALERTAS.HOJAS.cargas);
  const ult = h.getLastRow();
  if (ult < 2) return [];
  const desde = Math.max(2, ult - 59);
  return h.getRange(desde, 1, ult - desde + 1, COL_CARGAS.length).getValues().map((f) => ({
    en: f[0] instanceof Date ? f[0].getTime() : Number(f[0]) || 0, por: { nombre: String(f[1]) }, archivo: String(f[2]), filas: Number(f[3]) || 0,
    hfc: Number(f[4]) || 0, gpon: Number(f[5]) || 0, nodos: Number(f[6]) || 0,
    nuevos: f[7] === '' ? null : Number(f[7]), bajas: f[8] === '' ? null : Number(f[8]), cambiosNodo: f[9] === '' ? null : Number(f[9])
  }));
}

/* ============================================================================
 *  Teléfonos para avisar por SMS (plataforma Notifícame)
 *  Workforce descarga los celulares de los clientes de una falla, o de todas las
 *  activas juntas: un número por cliente (el primer celular que trae la base),
 *  sin repetir y con 504 adelante. Cada descarga queda anotada en "Descargas SMS".
 *  Los teléfonos nunca llegan a las búsquedas de los asesores.
 * ========================================================================== */

function accionTelefonos_(d, ses) {
  const id = String(d.id || '');
  const todas = leerFallas_();
  const fallas = id === 'activas' ? todas.filter((f) => f.estado === 'ACTIVA') : todas.filter((f) => f.id === id || idFalla_(f.id) === idFalla_(id));
  if (!fallas.length) throw fallo_('DATOS', id === 'activas' ? 'No hay fallas activas.' : 'No encontré la falla ' + idFalla_(id) + '.');
  const nodos = {};
  fallas.forEach((f) => f.nodos.forEach((n) => { nodos[n] = true; }));

  const h = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!h || h.getLastRow() < 2) throw fallo_('BASE', 'Todavía no hay base de clientes.');
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  const iC = cols.indexOf('CONTRATO') + 1, iN = cols.indexOf('GRUPO_NODO') + 1, iT = cols.indexOf('TELEFONO') + 1;
  if (!iT) throw fallo_('BASE', 'La base que está subida no trae la columna TELEFONO. Sube la base que incluye los teléfonos.');
  const n = h.getLastRow() - 1;
  const colN = h.getRange(2, iN, n, 1).getValues();
  const colC = h.getRange(2, iC, n, 1).getValues();
  const colT = h.getRange(2, iT, n, 1).getValues();

  // Un cliente (contrato) puede tener varias filas, una por servicio: se juntan sus números
  const porContrato = {};
  for (let i = 0; i < n; i++) {
    if (!nodos[String(colN[i][0])]) continue;
    const c = String(colC[i][0]);
    const lista = porContrato[c] || (porContrato[c] = []);
    String(colT[i][0] || '').split(/\s+/).forEach((t) => { if (/^504\d{8}$/.test(t) && lista.indexOf(t) < 0) lista.push(t); });
  }
  const numeros = [], ya = {};
  let clientes = 0, conCelular = 0, soloFijo = 0, sinTelefono = 0;
  Object.keys(porContrato).forEach((c) => {
    clientes++;
    const lista = porContrato[c];
    const cel = lista.filter((t) => /^504[3789]/.test(t))[0];
    if (cel) { conCelular++; if (!ya[cel]) { ya[cel] = true; numeros.push(cel); } }
    else if (lista.length) soloFijo++;
    else sinTelefono++;
  });

  const ids = fallas.map(nombreFalla_);
  const listaNodos = Object.keys(nodos);
  try {
    const hd = hojaEn_(libro_(), ALERTAS.HOJAS.descargas, COL_DESCARGAS);
    hd.appendRow([new Date(), ses.u, ses.n, ids.join(', ').slice(0, 300), listaNodos.join(', ').slice(0, 500), clientes, numeros.length]);
  } catch (e) { console.error('No se pudo anotar la descarga: ' + (e && e.message)); }

  const cuando = Utilities.formatDate(new Date(), ALERTAS.ZONA, 'yyyy-MM-dd_HHmm');
  const nombre = id === 'activas' ? 'sms_fallas_activas_' + cuando : 'sms_' + nombreFalla_(fallas[0]) + '_' + listaNodos.slice(0, 3).join('-') + (listaNodos.length > 3 ? '-y-mas' : '');
  return {
    archivo: nombre.replace(/[^A-Za-z0-9_\-]/g, '') + '.csv', fallas: ids, nodos: listaNodos.length,
    clientes: clientes, conCelular: conCelular, soloFijo: soloFijo, sinTelefono: sinTelefono, telefonos: numeros
  };
}

/* ============================================================================
 *  Bitácora de consultas, alertas tempranas y estadísticas
 *
 *  Con cientos de asesores son unas 20 mil consultas al día, así que la bitácora
 *  se guarda en dos niveles, en el archivo "Alertas - Consultas":
 *   - Consultas         el detalle de cada consulta (quién consultó qué), 30 días,
 *                       con un tope de filas para no pasar el límite de celdas.
 *   - Resumen y         una fila por día (y por persona) para las estadísticas de
 *     Resumen_asesores  7, 30 y 90 días. Los arma solo, cada hora, limpiarConsultas.
 *  Las estadísticas de hoy salen del detalle, exactas.
 * ========================================================================== */

/* Horas y días de Honduras sin llamar a formatDate en cada fila (son miles) */
function reloj_() {
  const z = Utilities.formatDate(new Date(), ALERTAS.ZONA, 'Z');            // -0600 en Honduras, que no cambia de horario
  const off = (z.charAt(0) === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60000;
  const DIA = 86400000, nombres = {};
  return {
    off: off,
    hora: (t) => Math.floor((((t + off) % DIA) + DIA) % DIA / 3600000),
    dia: (t) => {
      const n = Math.floor((t + off) / DIA);
      return nombres[n] || (nombres[n] = Utilities.formatDate(new Date(n * DIA), 'UTC', 'yyyy-MM-dd'));
    },
    inicio: (t) => Math.floor((t + off) / DIA) * DIA - off,
    desdeDia: (dia) => Date.parse(dia + 'T00:00:00Z') - off
  };
}
function fechaMs_(v) { return v instanceof Date ? v.getTime() : Number(v) || 0; }

/* Primera fila (desde la 2) con fecha >= t. Las filas van en el orden en que llegaron. */
function filaDesde_(h, t, ult) {
  let lo = 2, hi = ult + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fechaMs_(h.getRange(mid, 1).getValue()) < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}
function leerConsultas_(desde, hasta, h) {
  h = h || hojaConsultas_();
  const ult = h.getLastRow();
  if (ult < 2) return [];
  const a = filaDesde_(h, desde, ult);
  const b = hasta == null ? ult + 1 : filaDesde_(h, hasta, ult);
  return a < b ? h.getRange(a, 1, b - a, COL_CONSULTAS.length).getValues() : [];
}

function tecnologias_() {
  const cat = catalogo_(), tec = {};
  if (cat) cat.nodos.forEach((n) => { tec[n[0]] = n[3] > n[2] ? 'GPON' : 'HFC'; });
  return tec;
}

/* ----- Clientes distintos en varios días: HyperLogLog (2,048 registros, error de ~2 %) ----- */
const HLL_P = 11, HLL_M = 1 << HLL_P;
function hll_(texto) {
  const r = new Array(HLL_M).fill(0);
  if (texto) { const b = Utilities.base64Decode(texto); for (let i = 0; i < HLL_M && i < b.length; i++) r[i] = b[i] & 255; }
  return r;
}
function hash32_(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function hllSumar_(r, s) {
  const h = hash32_(s), j = h >>> (32 - HLL_P), w = (h << HLL_P) >>> 0;
  const rho = w === 0 ? 32 - HLL_P + 1 : Math.clz32(w) + 1;
  if (rho > r[j]) r[j] = rho;
}
function hllUnir_(a, b) { for (let i = 0; i < HLL_M; i++) if (b[i] > a[i]) a[i] = b[i]; }
function hllContar_(r) {
  let suma = 0, ceros = 0;
  for (let i = 0; i < HLL_M; i++) { suma += Math.pow(2, -r[i]); if (!r[i]) ceros++; }
  let e = (0.7213 / (1 + 1.079 / HLL_M)) * HLL_M * HLL_M / suma;
  if (e <= 2.5 * HLL_M && ceros) e = HLL_M * Math.log(HLL_M / ceros);
  return Math.round(e);
}

/* ----- Sumar consultas (del detalle o de los resúmenes diarios) ----- */
function agregado_() {
  return { consultas: 0, conFalla: 0, noEnc: 0, reportes: 0, horas: {}, dias: {}, tec: { HFC: 0, GPON: 0 }, canales: {}, asesores: {}, top: {}, hll: hll_(), exactos: {}, aprox: false };
}
function sumarFila_(ag, f, tecDe, reloj) {
  if (String(f[5] || '') === 'reporte') { ag.reportes++; return; }
  const t = fechaMs_(f[0]);
  const res = String(f[8] || ''), contrato = String(f[6] || ''), nodo = String(f[7] || '');
  const usuario = String(f[1] || ''), canal = String(f[3] || ''), tienda = String(f[4] || '');
  const falla = res === 'FALLA', noEnc = res === 'NO_ENCONTRADO';
  ag.consultas++;
  if (falla) ag.conFalla++;
  if (noEnc) ag.noEnc++;
  if (contrato) { ag.exactos[contrato] = true; hllSumar_(ag.hll, contrato); }
  const h = reloj.hora(t), d = reloj.dia(t);
  const sh = ag.horas[h] || (ag.horas[h] = { falla: 0, otras: 0 });
  const sd = ag.dias[d] || (ag.dias[d] = { falla: 0, otras: 0 });
  if (falla) { sh.falla++; sd.falla++; } else { sh.otras++; sd.otras++; }
  if (falla && tecDe[nodo]) ag.tec[tecDe[nodo]]++;
  ag.canales[canal] = (ag.canales[canal] || 0) + 1;
  const a = ag.asesores[usuario] || (ag.asesores[usuario] = { u: usuario, nombre: String(f[2] || usuario), canal: canal + (tienda ? ': ' + tienda : ''), n: 0, falla: 0, noEnc: 0 });
  a.n++;
  if (falla) a.falla++;
  if (noEnc) a.noEnc++;
  if (falla && contrato) ag.top[contrato] = (ag.top[contrato] || 0) + 1;
}
function sumarResumen_(ag, fila, asesores) {
  const dia = String(fila[0]);
  let d = {};
  try { d = JSON.parse(String(fila[5] || '{}')); } catch (e) { d = {}; }
  const n = Number(fila[1]) || 0, nf = Number(fila[2]) || 0;
  ag.consultas += n; ag.conFalla += nf; ag.noEnc += Number(fila[3]) || 0; ag.reportes += Number(fila[4]) || 0;
  const sd = ag.dias[dia] || (ag.dias[dia] = { falla: 0, otras: 0 });
  sd.falla += nf; sd.otras += n - nf;
  (d.h || []).forEach((x, h) => {
    if (!x || !(x[0] || x[1])) return;
    const sh = ag.horas[h] || (ag.horas[h] = { falla: 0, otras: 0 });
    sh.falla += x[0]; sh.otras += x[1];
  });
  if (d.tec) { ag.tec.HFC += d.tec.HFC || 0; ag.tec.GPON += d.tec.GPON || 0; }
  Object.keys(d.can || {}).forEach((k) => { ag.canales[k] = (ag.canales[k] || 0) + d.can[k]; });
  (d.top || []).forEach((x) => { ag.top[x[0]] = (ag.top[x[0]] || 0) + x[1]; });
  if (d.hll) hllUnir_(ag.hll, hll_(d.hll));
  ag.aprox = true;
  asesores.forEach((f) => {
    const u = String(f[1]);
    const a = ag.asesores[u] || (ag.asesores[u] = { u: u, nombre: String(f[2] || u), canal: String(f[3] || ''), n: 0, falla: 0, noEnc: 0 });
    a.n += Number(f[4]) || 0; a.falla += Number(f[5]) || 0; a.noEnc += Number(f[6]) || 0;
  });
}
function resumenDelDia_(dia, filas, tecDe, reloj) {
  const ag = agregado_();
  filas.forEach((f) => sumarFila_(ag, f, tecDe, reloj));
  const horas = [];
  for (let h = 0; h < 24; h++) { const x = ag.horas[h]; horas.push(x ? [x.falla, x.otras] : [0, 0]); }
  const top = Object.keys(ag.top).map((c) => [c, ag.top[c]]).sort((a, b) => b[1] - a[1]).slice(0, 300);
  return {
    fila: [dia, ag.consultas, ag.conFalla, ag.noEnc, ag.reportes, JSON.stringify({ h: horas, tec: ag.tec, can: ag.canales, top: top, hll: Utilities.base64Encode(ag.hll) })],
    asesores: Object.keys(ag.asesores).map((u) => { const a = ag.asesores[u]; return [dia, u, a.nombre, a.canal, a.n, a.falla, a.noEnc]; })
  };
}

/* ----- Hojas del archivo de consultas ----- */
function hojaEn_(libro, nombre, encabezado) {
  let h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    h.getRange(1, 1, 1, encabezado.length).setValues([encabezado]).setFontWeight('bold');
    h.setFrozenRows(1);
    if (h.getMaxColumns() > encabezado.length) h.deleteColumns(encabezado.length + 1, h.getMaxColumns() - encabezado.length);
  }
  return h;
}
function agregarFilas_(h, filas, columnasTexto) {
  if (!filas.length) return;
  const r0 = h.getLastRow() + 1, falta = r0 + filas.length - 1 - h.getMaxRows();
  if (falta > 0) h.insertRowsAfter(h.getMaxRows(), falta);
  (columnasTexto || []).forEach((c) => h.getRange(r0, c, filas.length, 1).setNumberFormat('@'));
  h.getRange(r0, 1, filas.length, filas[0].length).setValues(filas);
}
/* Borra las filas 2..hasta-1 sin dejar la hoja sin filas libres (Sheets no lo permite con encabezado fijo) */
function borrarFilas_(h, hasta) {
  if (hasta <= 2) return 0;
  if (h.getMaxRows() < hasta) h.insertRowsAfter(h.getMaxRows(), hasta - h.getMaxRows());
  h.deleteRows(2, hasta - 2);
  return hasta - 2;
}
/* Primera fila (desde la 2) cuyo día (texto yyyy-MM-dd en la columna 1) es >= dia */
function filaDelDia_(h, dia) {
  const ult = h.getLastRow();
  let lo = 2, hi = ult + 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (String(h.getRange(mid, 1).getValue()) < dia) lo = mid + 1; else hi = mid;
  }
  return lo;
}
function leerResumenes_(desdeDia, hastaDia) {
  const libro = libroConsultas_();
  const leer = (nombre, ncol) => {
    const h = libro.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return [];
    const a = filaDelDia_(h, desdeDia), ult = h.getLastRow();
    if (a > ult) return [];
    return h.getRange(a, 1, ult - a + 1, ncol).getValues().filter((f) => String(f[0]) <= hastaDia);
  };
  return { filas: leer(ALERTAS.HOJAS.resumen, COL_RESUMEN.length), asesores: leer(ALERTAS.HOJAS.resumenAsesores, COL_RESUMEN_AS.length) };
}

/* ----- Registrar ----- */
function registrarConsulta_(ses, x) {
  // Si la bitácora falla, la consulta del asesor igual se responde
  try {
    hojaConsultas_().appendRow([new Date(), ses.u, ses.n, ALERTAS.ROLES[ses.r], ses.t || '', x.tipo, x.contrato || '', x.nodo || '', x.resultado, x.falla || '']);
  } catch (e) { console.error('No se pudo registrar la consulta: ' + (e && e.message)); }
}

/* ----- Posibles fallas: la última hora del detalle -----
   Cuenta los clientes distintos de cada nodo que consultaron Concentrix y Tiendas en los últimos
   60 minutos. Las búsquedas de Workforce y Jefatura no cuentan: son ellos revisando el nodo.
   5 clientes (o 2 reportes de asesores) es una posible falla; 3 o 4, un nodo en observación. */
const ACCESOS_INTERNOS_ = { 'Workforce HN': true, 'Jefatura': true };
function consultasPosibleFalla_(filas, enFalla) {
  return filas.filter((f) => {
    const nodo = String(f[7] || ''), res = String(f[8] || '');
    return nodo && !esVirtual_(nodo) && !(enFalla && enFalla[nodo]) && res !== 'FALLA' && res !== 'NO_ENCONTRADO' && !ACCESOS_INTERNOS_[String(f[3] || '')];
  });
}
function nodosEnFalla_() {
  const enFalla = {};
  fallasVisibles_().forEach((f) => { if (f.estado === 'ACTIVA') f.nodos.forEach((n) => { enFalla[n] = true; }); });
  return enFalla;
}
function accionAlertas_() {
  const hit = cache_().get('alertas');
  if (hit) return JSON.parse(hit);
  const ahora = Date.now();
  const filas = consultasPosibleFalla_(leerConsultas_(ahora - ALERTAS.ALERTA_MIN * 60000, null), nodosEnFalla_());
  const por = {};
  filas.forEach((f) => {
    const nodo = String(f[7]), t = fechaMs_(f[0]);
    const e = por[nodo] || (por[nodo] = { nodo: nodo, clientes: {}, reportes: 0, consultas: 0, primero: t, ultimo: t });
    e.consultas++;
    if (f[6]) e.clientes[String(f[6])] = true;
    if (String(f[5]) === 'reporte') e.reportes++;
    e.primero = Math.min(e.primero, t); e.ultimo = Math.max(e.ultimo, t);
  });
  const marcas = alertasReportadas_();
  const alertas = Object.keys(por).map((k) => {
    const e = por[k], n = Object.keys(e.clientes).length;
    const nivel = n >= ALERTAS.ALERTA_CLIENTES || e.reportes >= ALERTAS.ALERTA_REPORTES ? 'alerta' : n >= ALERTAS.ALERTA_OBSERVAR ? 'observacion' : '';
    const x = { nodo: e.nodo, nivel: nivel, nClientes: n, reportes: e.reportes, consultas: e.consultas, primero: e.primero, ultimo: e.ultimo };
    if (marcas[e.nodo]) x.reportada = marcas[e.nodo];
    return x;
  }).filter((e) => e.nivel)
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alerta' ? -1 : 1) || b.nClientes - a.nClientes || b.ultimo - a.ultimo);
  const res = {
    alertas: alertas, ahora: ahora,
    umbral: { minutos: ALERTAS.ALERTA_MIN, clientes: ALERTAS.ALERTA_CLIENTES, observar: ALERTAS.ALERTA_OBSERVAR, reportes: ALERTAS.ALERTA_REPORTES }
  };
  cache_().put('alertas', JSON.stringify(res), 30);
  return res;
}

/* Posibles fallas que Workforce ya reportó (al VOC o al personal interno). Las ve todo el equipo,
   para que nadie mande el mismo correo dos veces, y duran 6 horas. */
function alertasReportadas_() {
  let m = {};
  try { m = JSON.parse(props_().getProperty('ALERTAS_REPORTADAS') || '{}') || {}; } catch (e) { m = {}; }
  const corte = Date.now() - ALERTAS.ALERTA_MARCA_HORAS * 3600000;
  Object.keys(m).forEach((k) => { if (!m[k] || !(m[k].en > corte)) delete m[k]; });
  return m;
}

/* Una posible falla: los clientes con sus datos de la base (para el correo) o la marca de reportada */
function accionAlerta_(d, ses) {
  const nodo = String(d.nodo || '').toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').slice(0, 40);
  if (!nodo) throw fallo_('DATOS', 'Falta el nodo.');
  const op = d.op || 'detalle';
  if (op === 'reportada' || op === 'quitar') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let marca = null;
    try {
      const m = alertasReportadas_();
      if (op === 'reportada') m[nodo] = marca = { por: ses.n, en: Date.now() };
      else delete m[nodo];
      props_().setProperty('ALERTAS_REPORTADAS', JSON.stringify(m));
    } finally { lock.releaseLock(); }
    cache_().remove('alertas');
    return { nodo: nodo, reportada: marca };
  }
  if (op !== 'detalle') throw fallo_('DATOS', 'Operación no válida.');
  return detallePosibleFalla_(nodo);
}
function detallePosibleFalla_(nodo) {
  const ahora = Date.now();
  const filas = consultasPosibleFalla_(leerConsultas_(ahora - ALERTAS.ALERTA_MIN * 60000, null), null).filter((f) => String(f[7]) === nodo);
  const por = {};
  let reportes = 0, desde = null, hasta = null;
  filas.forEach((f) => {
    const t = fechaMs_(f[0]), tipo = String(f[5]);
    if (tipo === 'reporte') reportes++;
    desde = desde == null ? t : Math.min(desde, t); hasta = hasta == null ? t : Math.max(hasta, t);
    const c = String(f[6] || '').replace(/\D+/g, '');
    if (!c) return;
    const x = por[c] || (por[c] = { contrato: c, primera: t, ultima: t, veces: 0, canales: [], reporte: false });
    x.veces++;
    x.primera = Math.min(x.primera, t); x.ultima = Math.max(x.ultima, t);
    const canal = String(f[3] || '') === 'Tiendas' ? 'Tiendas' + (f[4] ? ': ' + String(f[4]) : '') : String(f[3] || '');
    if (x.canales.indexOf(canal) < 0) x.canales.push(canal);
    if (tipo === 'reporte') x.reporte = true;
  });
  const lista = Object.keys(por).map((k) => por[k]).sort((a, b) => a.primera - b.primera).slice(0, ALERTAS.ALERTA_MAX_CLIENTES);
  const datos = datosDeContratos_(lista.map((x) => x.contrato), nodo);
  const clientes = lista.map((x) => {
    const b = datos[x.contrato];
    return {
      contrato: x.contrato, primera: x.primera, ultima: x.ultima, veces: x.veces, canales: x.canales, reporte: x.reporte, enBase: !!b,
      nombre: b ? b.nombre : '', nodo: b ? b.nodo : nodo, tecnologia: b ? b.tecnologia : '', olt: b ? b.olt : '', nap: b ? b.nap : '',
      colonia: b ? b.colonia : '', municipio: b ? b.municipio : '', departamento: b ? b.departamento : '', categoria: b ? b.categoria : ''
    };
  });
  return {
    nodo: nodo, ahora: ahora, minutos: ALERTAS.ALERTA_MIN, nClientes: Object.keys(por).length, reportes: reportes, consultas: filas.length,
    desde: desde, hasta: hasta, clientes: clientes, reportada: alertasReportadas_()[nodo] || null, enFalla: !!nodosEnFalla_()[nodo]
  };
}
/* Datos de varios contratos con una sola búsqueda en la base. Si un contrato tiene varios
   servicios, se queda con el del nodo de la posible falla. */
function datosDeContratos_(contratos, nodo) {
  const out = {};
  const lista = contratos.filter((c) => /^\d{1,12}$/.test(c));
  if (!lista.length) return out;
  const h = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!h || h.getLastRow() < 2) return out;
  const ult = h.getLastRow(), ncol = h.getLastColumn();
  const cols = h.getRange(1, 1, 1, ncol).getValues()[0].map(String);
  const ci = cols.indexOf('CONTRATO') + 1;
  if (ci < 1) return out;
  const rango = h.getRange(2, ci, ult - 1, 1);
  let celdas;
  try {
    celdas = rango.createTextFinder('^(' + lista.join('|') + ')$').useRegularExpression(true).matchEntireCell(true).findAll();
  } catch (e) {
    celdas = [];
    lista.forEach((c) => { celdas = celdas.concat(rango.createTextFinder(c).matchEntireCell(true).findAll()); });
  }
  // Las filas cercanas se leen de una vez (los servicios de un mismo contrato suelen venir seguidos)
  const filas = celdas.map((r) => r.getRow()).sort((a, b) => a - b).slice(0, 300);
  const tramos = [];
  filas.forEach((f) => { const t = tramos[tramos.length - 1]; if (t && f - t[1] <= 3) t[1] = f; else tramos.push([f, f]); });
  tramos.forEach((t) => {
    h.getRange(t[0], 1, t[1] - t[0] + 1, ncol).getValues().forEach((v) => {
      const reg = registro_(cols, v), c = String(reg.contrato).replace(/\D+/g, '');
      if (lista.indexOf(c) < 0) return;
      const prev = out[c];
      if (!prev || (prev.nodo !== nodo && reg.nodo === nodo)) out[c] = reg;
    });
  });
  return out;
}

/* ----- Estadísticas: días anteriores del resumen y hoy del detalle ----- */
function accionEstadisticas_(d) {
  const ahora = Date.now(), reloj = reloj_(), DIA = 86400000;
  const hoy = reloj.inicio(ahora);
  const desde = Math.max(reloj.inicio(Number(d.desde) || 0), hoy - (ALERTAS.DIAS_ESTADISTICAS - 1) * DIA);
  const porHora = !!d.porHora;
  const clave = 'stats:' + desde + ':' + (porHora ? 'h' : 'd');
  const hit = cache_().get(clave);
  if (hit) return JSON.parse(hit);

  const tecDe = tecnologias_();
  const ag = agregado_();
  if (desde < hoy) {
    const resumido = String(props_().getProperty('RESUMIDO_HASTA') || '');
    const ayer = reloj.dia(hoy - 1);
    if (resumido && resumido >= reloj.dia(desde)) {
      const r = leerResumenes_(reloj.dia(desde), resumido < ayer ? resumido : ayer);
      const porDia = {};
      r.asesores.forEach((a) => { const k = String(a[0]); (porDia[k] = porDia[k] || []).push(a); });
      r.filas.forEach((f) => sumarResumen_(ag, f, porDia[String(f[0])] || []));
    }
    // Días que la tarea de cada hora todavía no resumió: del detalle, como mucho los últimos 3
    const pendiente = Math.max(desde, resumido ? reloj.desdeDia(resumido) + DIA : desde, hoy - 3 * DIA);
    if (pendiente < hoy) leerConsultas_(pendiente, hoy).forEach((f) => sumarFila_(ag, f, tecDe, reloj));
  }
  leerConsultas_(Math.max(desde, hoy), null).forEach((f) => sumarFila_(ag, f, tecDe, reloj));

  const top = Object.keys(ag.top).map((c) => [c, ag.top[c]]).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const fichas = buscarContratos_(top.map((x) => x[0]));
  const res = {
    consultas: ag.consultas, conFalla: ag.conFalla, reportes: ag.reportes,
    clientesUnicos: ag.aprox ? hllContar_(ag.hll) : Object.keys(ag.exactos).length, clientesAprox: ag.aprox,
    serie: porHora
      ? Object.keys(ag.horas).map((h) => ({ k: String(h), falla: ag.horas[h].falla, otras: ag.horas[h].otras }))
      : Object.keys(ag.dias).sort().map((k) => ({ k: k, falla: ag.dias[k].falla, otras: ag.dias[k].otras })),
    tecConsultas: ag.tec, canales: ag.canales,
    asesores: Object.keys(ag.asesores).map((k) => ag.asesores[k]).sort((a, b) => b.n - a.n),
    topContratos: top.map((x) => {
      const rec = fichas[x[0]];
      return { contrato: x[0], consultas: x[1], nombre: rec ? rec.nombre : '', nodo: rec ? rec.nodo : '', categoria: rec ? rec.categoria : '' };
    }),
    desde: desde, ahora: ahora
  };
  cache_().put(clave, JSON.stringify(res), 120);
  return res;
}

/* Los datos de varios contratos con una sola lectura de la columna (más rápido que buscarlos uno por uno) */
function buscarContratos_(lista) {
  const out = {};
  if (!lista.length) return out;
  const h = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!h || h.getLastRow() < 2) return out;
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  const ci = cols.indexOf('CONTRATO') + 1;
  if (!ci) return out;
  const quiero = {};
  lista.forEach((c) => { quiero[String(c)] = true; });
  const vals = h.getRange(2, ci, h.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const c = String(vals[i][0]);
    if (quiero[c] && !out[c]) out[c] = registro_(cols, h.getRange(i + 2, 1, 1, cols.length).getValues()[0]);
  }
  return out;
}

/* ============================================================================
 *  Mantenimiento de cada hora (se programa solo al configurar)
 *  1. Resume los días completos que falten.  2. Borra el detalle de más de 30 días
 *  o lo que pase del tope de filas (solo días ya resumidos).  3. Borra resúmenes
 *  de más de 120 días.  4. Limpia cargas de base que quedaron a medias.
 * ========================================================================== */

function limpiarConsultas() {
  const lock = LockService.getUserLock();          // aparte del candado de fallas y base: no los frena
  if (!lock.tryLock(5000)) return 'ocupado';
  try {
    const reloj = reloj_(), DIA = 86400000;
    const libro = libroConsultas_();
    const h = libro.getSheetByName(ALERTAS.HOJAS.consultas);
    const hr = hojaEn_(libro, ALERTAS.HOJAS.resumen, COL_RESUMEN);
    const ha = hojaEn_(libro, ALERTAS.HOJAS.resumenAsesores, COL_RESUMEN_AS);
    const p = props_();
    const hoy = reloj.inicio(Date.now());
    let resumido = String(p.getProperty('RESUMIDO_HASTA') || '');
    let ult = h.getLastRow();

    // 1. Resumir los días completos que falten (como mucho 10 con consultas por vez,
    //    para no pasar los 6 minutos de Apps Script). Los días sin consultas se saltan.
    let t = resumido ? reloj.desdeDia(resumido) + DIA : (ult >= 2 ? reloj.inicio(fechaMs_(h.getRange(2, 1).getValue())) : hoy);
    const tecDe = tecnologias_();
    for (let k = 0; k < 10 && t < hoy; k++) {
      const filas = leerConsultas_(t, t + DIA, h);
      if (filas.length) {
        const r = resumenDelDia_(reloj.dia(t), filas, tecDe, reloj);
        agregarFilas_(hr, [r.fila], [1]);
        agregarFilas_(ha, r.asesores, [1, 2]);
      }
      const u = h.getLastRow(), sig = filaDesde_(h, t + DIA, u);
      const siguiente = Math.min(sig <= u ? reloj.inicio(fechaMs_(h.getRange(sig, 1).getValue())) : hoy, hoy);
      resumido = reloj.dia(siguiente - DIA);        // todo lo anterior a "siguiente" ya está resumido
      p.setProperty('RESUMIDO_HASTA', resumido);
      t = siguiente;
    }

    // 2. Detalle: 30 días como máximo y nunca más filas que el tope; solo lo ya resumido
    let borradas = 0;
    ult = h.getLastRow();
    if (ult >= 2 && resumido) {
      const finResumido = reloj.desdeDia(resumido) + DIA;
      let hasta = filaDesde_(h, Math.min(hoy - (ALERTAS.DIAS_DETALLE - 1) * DIA, finResumido), ult);
      const sobran = (ult - 1) - ALERTAS.MAX_FILAS_DETALLE;
      if (sobran > 0) hasta = Math.max(hasta, Math.min(2 + sobran, filaDesde_(h, finResumido, ult)));
      borradas = borrarFilas_(h, hasta);
    }

    // 3. Resúmenes de más de 120 días
    const corte = reloj.dia(hoy - ALERTAS.DIAS_RESUMEN * DIA);
    [hr, ha].forEach((x) => { if (x.getLastRow() >= 2) borrarFilas_(x, filaDelDia_(x, corte)); });

    // 4. Una carga de base que quedó a medias por más de 2 horas
    const carga = cargaActual_();
    if (carga && Date.now() - carga.inicio > 2 * 3600000) {
      const ss = libro_();
      const nueva = ss.getSheetByName(ALERTAS.HOJAS.nueva);
      if (nueva) ss.deleteSheet(nueva);
      props_().deleteProperty('CARGA');
    }
    return { resumidoHasta: resumido, borradas: borradas };
  } finally { lock.releaseLock(); }
}

/* ============================================================================
 *  Menú del Sheet (solo lo ve el dueño)
 * ========================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Alertas')
    .addItem('1. Configurar por primera vez', 'configurar')
    .addItem('2. Conectar Genesys', 'dialogoGenesys')
    .addItem('3. Contraseñas de acceso', 'dialogoClaves')
    .addSeparator()
    .addItem('Ver dirección del servidor', 'verDireccion')
    .addItem('Cerrar todas las sesiones', 'cerrarSesiones')
    .addItem('Resumir y limpiar la bitácora de consultas', 'limpiarConsultasMenu')
    .addToUi();
}

/* Cuando alguien edita la hoja Usuarios a mano, el cambio aplica de inmediato
   (sin esperar los 5 minutos de la caché). Google lo ejecuta solo en cada edición. */
function onEdit(e) {
  try {
    const hoja = e && e.range && e.range.getSheet();
    if (hoja && hoja.getName() === ALERTAS.HOJAS.usuarios) CacheService.getScriptCache().remove('usuarios');
    if (hoja && hoja.getName() === ALERTAS.HOJAS.tiendas) CacheService.getScriptCache().remove('tiendas');
  } catch (err) { /* una edición nunca debe fallar por esto */ }
}

function limpiarConsultasMenu() {
  const r = limpiarConsultas();
  SpreadsheetApp.getUi().alert('Bitácora de consultas', r === 'ocupado'
    ? 'Ya se está ordenando en este momento. Intenta en un par de minutos.'
    : 'Listo. Días resumidos hasta ' + (r.resumidoHasta || 'hoy') + '. Filas de detalle borradas: ' + r.borradas + '.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function configurar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(ALERTAS.ZONA);
  const p = props_();
  p.setProperty('BASE_ID', ss.getId());
  if (!p.getProperty('SECRETO')) p.setProperty('SECRETO', nuevoSecreto_());
  if (!p.getProperty('ESTADO')) p.setProperty('ESTADO', JSON.stringify({ version: 1, baseVersion: 0, cambio: null }));

  const crear = (nombre, encabezado, oculta) => {
    let h = ss.getSheetByName(nombre);
    if (!h) h = ss.insertSheet(nombre);
    if (encabezado && h.getLastRow() === 0) {
      h.getRange(1, 1, 1, encabezado.length).setValues([encabezado]).setFontWeight('bold');
      h.setFrozenRows(1);
    }
    if (oculta) h.hideSheet();
    return h;
  };
  if (!ss.getSheetByName(ALERTAS.HOJAS.base)) crear(ALERTAS.HOJAS.base, COL_BASE.slice(0, 14));
  const hf = crear(ALERTAS.HOJAS.fallas, COL_FALLAS);
  hf.getRange(2, 1, hf.getMaxRows() - 1, COL_FALLAS.length).setNumberFormat('@');
  hf.getRange(2, 7, hf.getMaxRows() - 1, 3).setNumberFormat('dd/mm/yyyy hh:mm');
  hf.getRange(2, 11, hf.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  hf.getRange(2, 16, hf.getMaxRows() - 1, 3).setNumberFormat('0');
  const hu = crear(ALERTAS.HOJAS.usuarios, COL_USUARIOS);
  if (hu.getLastRow() < 2) {
    const yo = Session.getEffectiveUser().getEmail();
    if (yo) hu.appendRow([yo.toLowerCase(), 'Dueño de Alertas', 'jefatura', 'SÍ', 'Agregado al configurar']);
  }
  crear(ALERTAS.HOJAS.cargas, COL_CARGAS);
  if (!ss.getSheetByName(ALERTAS.HOJAS.tiendas)) crearHojaTiendas_(ss);
  cache_().remove('tiendas');
  crear(ALERTAS.HOJAS.catalogo, null, true);

  // Bitácora de consultas en un archivo aparte, también privado
  let idc = p.getProperty('CONSULTAS_ID');
  let ok = false;
  if (idc) { try { SpreadsheetApp.openById(idc); ok = true; } catch (e) { ok = false; } }
  if (!ok) {
    const sc = SpreadsheetApp.create('Alertas - Consultas');
    sc.setSpreadsheetTimeZone(ALERTAS.ZONA);
    const h = sc.getSheets()[0];
    h.setName(ALERTAS.HOJAS.consultas);
    h.getRange(1, 1, 1, COL_CONSULTAS.length).setValues([COL_CONSULTAS]).setFontWeight('bold');
    h.setFrozenRows(1);
    if (h.getMaxColumns() > COL_CONSULTAS.length) h.deleteColumns(COL_CONSULTAS.length + 1, h.getMaxColumns() - COL_CONSULTAS.length);
    h.getRange(2, 7, h.getMaxRows() - 1, 1).setNumberFormat('@');
    p.setProperty('CONSULTAS_ID', sc.getId());
  }

  // Resúmenes diarios y su detalle en el mismo archivo
  const libroC = SpreadsheetApp.openById(p.getProperty('CONSULTAS_ID'));
  hojaEn_(libroC, ALERTAS.HOJAS.resumen, COL_RESUMEN);
  hojaEn_(libroC, ALERTAS.HOJAS.resumenAsesores, COL_RESUMEN_AS);

  // Mantenimiento cada hora (resume días y limpia la bitácora)
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'limpiarConsultas').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('limpiarConsultas').timeBased().everyHours(1).create();

  // Quita la hoja vacía que trae un archivo nuevo
  ss.getSheets().forEach((h) => {
    if (/^(Hoja|Sheet)\s?1$/i.test(h.getName()) && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });
  limpiarCfg_();
  cache_().remove('estado');
  ui.alert('Alertas quedó configurado',
    'Siguiente paso: Implementar > Nueva implementación > Aplicación web.\n' +
    'Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario.\n\n' +
    'Luego copia la URL de la aplicación web en el archivo config.js de GitHub.\n' +
    'Después usa Alertas > Conectar Genesys y Alertas > Contraseñas de acceso.', ui.ButtonSet.OK);
}

function nuevoSecreto_() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random(), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function cerrarSesiones() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Cerrar todas las sesiones', 'Todas las personas tendrán que volver a entrar a Alertas. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  props_().setProperty('SECRETO', nuevoSecreto_());
  limpiarCfg_();
  ui.alert('Listo. Todas las sesiones se cerraron.');
}

function verDireccion() {
  const ui = SpreadsheetApp.getUi();
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  ui.alert('Dirección del servidor', url
    ? 'Esta es la URL de la aplicación web. Va en config.js de GitHub:\n\n' + url
    : 'Todavía no hay una implementación como aplicación web. Ve a Implementar > Nueva implementación.', ui.ButtonSet.OK);
}

/* ----- Conectar Genesys ----- */

function dialogoGenesys() {
  const g = cfg_().GENESYS || {};
  const opciones = Object.keys(ALERTAS.REGIONES).map((k) =>
    '<option value="' + k + '"' + (g.region === k ? ' selected' : '') + '>' + ALERTAS.REGIONES[k] + ' (' + k + ')</option>').join('');
  const html = estiloDialogo_() +
    '<p>Datos del cliente OAuth que crea el administrador de Genesys Cloud en <b>Admin &gt; Integraciones &gt; OAuth</b>, ' +
    'con tipo de concesión <b>Code Authorization / PKCE</b>.</p>' +
    '<label>Región de Genesys<select id="region"><option value="">Elige la región</option>' + opciones + '</select></label>' +
    '<label>Client ID<input id="clientId" value="' + esc_(g.clientId || '') + '" autocomplete="off"></label>' +
    '<label>ID de la organización (opcional)<input id="orgId" value="' + esc_(g.orgId || '') + '" autocomplete="off" placeholder="Se completa solo con el primer ingreso"></label>' +
    '<p class="nota">' + (g.orgId
      ? 'Solo entran usuarios de <b>' + esc_(g.orgNombre || 'esta organización') + '</b>. Si borras el ID, Alertas lo vuelve a tomar en el próximo ingreso.'
      : 'Si lo dejas vacío, Alertas lo toma del primer ingreso con Genesys. También está en Genesys Cloud: Admin &gt; Organization Settings &gt; Advanced.') + '</p>' +
    '<label>Quién puede entrar con Genesys<select id="rol">' +
    '<option value="concentrix"' + (g.rolPorDefecto !== 'ninguno' ? ' selected' : '') + '>Cualquier usuario de Genesys (entra como Concentrix)</option>' +
    '<option value="ninguno"' + (g.rolPorDefecto === 'ninguno' ? ' selected' : '') + '>Solo quienes estén en la hoja Usuarios</option></select></label>' +
    '<p class="nota">Workforce y Jefatura se definen en la hoja Usuarios con su correo de Genesys.</p>' +
    '<div class="acc"><button onclick="google.script.host.close()">Cancelar</button>' +
    '<button class="pri" onclick="guardar()">Guardar</button></div><p id="msg"></p>' +
    '<script>function guardar(){var v=function(i){return document.getElementById(i).value;};var d={region:v("region"),clientId:v("clientId"),orgId:v("orgId"),rolPorDefecto:v("rol")};' +
    'google.script.run.withSuccessHandler(function(){google.script.host.close();}).withFailureHandler(function(e){document.getElementById("msg").textContent=e.message;}).guardarGenesys(d);}</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(470).setHeight(560), 'Conectar Genesys');
}
function guardarGenesys(d) {
  const region = String(d && d.region || '');
  const clientId = String(d && d.clientId || '').trim();
  const orgId = String(d && d.orgId || '').trim().toLowerCase();
  if (region && !ALERTAS.REGIONES[region]) throw new Error('Región no válida.');
  if (clientId && !/^[A-Za-z0-9-]{8,80}$/.test(clientId)) throw new Error('El Client ID no tiene el formato esperado.');
  if (orgId && !/^[a-z0-9-]{8,80}$/.test(orgId)) throw new Error('El ID de la organización no tiene el formato esperado.');
  const antes = JSON.parse(props_().getProperty('GENESYS') || '{}');
  props_().setProperty('GENESYS', JSON.stringify({
    region: region, clientId: clientId, rolPorDefecto: d.rolPorDefecto === 'ninguno' ? 'ninguno' : 'concentrix',
    orgId: orgId, orgNombre: orgId && orgId === String(antes.orgId || '').toLowerCase() ? antes.orgNombre || '' : ''
  }));
  limpiarCfg_();
  return true;
}

/* ----- Contraseñas (Tiendas y accesos temporales) ----- */

function dialogoClaves() {
  const html = estiloDialogo_() +
    '<p>La contraseña se guarda cifrada en el servidor. No aparece en el código de GitHub ni en la página.</p>' +
    '<div id="lista">Cargando…</div>' +
    '<h3>Crear o cambiar una contraseña</h3>' +
    '<label>Acceso<select id="rol"><option value="tiendas">Tiendas (usuario genérico)</option>' +
    '<option value="workforce">Workforce HN, temporal mientras se conecta Genesys</option>' +
    '<option value="jefatura">Jefatura, temporal</option><option value="concentrix">Concentrix, temporal</option></select></label>' +
    '<label>Usuario<input id="usuario" value="tiendas" autocomplete="off"></label>' +
    '<label>Contraseña (mínimo 10 caracteres)<input id="c1" type="password" autocomplete="new-password"></label>' +
    '<label>Repite la contraseña<input id="c2" type="password" autocomplete="new-password"></label>' +
    '<div class="acc"><button onclick="google.script.host.close()">Cerrar</button><button class="pri" onclick="guardar()">Guardar contraseña</button></div><p id="msg"></p>' +
    '<script>' +
    'function pintar(l){var d=document.getElementById("lista");if(!l.length){d.innerHTML="<p class=nota>Todavía no hay cuentas con contraseña.</p>";return;}' +
    'd.innerHTML="<table>"+l.map(function(c){return "<tr><td><b>"+c.usuario+"</b></td><td>"+c.acceso+"</td><td>"+c.fecha+"</td><td><button onclick=\\"quitar(\'"+c.usuario+"\')\\">Quitar</button></td></tr>";}).join("")+"</table>";}' +
    'function cargar(){google.script.run.withSuccessHandler(pintar).listarCuentas();}' +
    'function msg(t){document.getElementById("msg").textContent=t;}' +
    'function guardar(){var c1=document.getElementById("c1").value,c2=document.getElementById("c2").value;if(c1!==c2){msg("Las contraseñas no coinciden.");return;}' +
    'google.script.run.withSuccessHandler(function(){msg("Contraseña guardada. Las sesiones anteriores de esa cuenta se cerraron.");document.getElementById("c1").value="";document.getElementById("c2").value="";cargar();})' +
    '.withFailureHandler(function(e){msg(e.message);}).guardarCuenta(document.getElementById("usuario").value,document.getElementById("rol").value,c1);}' +
    'function quitar(u){google.script.run.withSuccessHandler(cargar).quitarCuenta(u);}' +
    'document.getElementById("rol").onchange=function(){document.getElementById("usuario").value=this.value==="tiendas"?"tiendas":this.value+".temporal";};' +
    'cargar();</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(560), 'Contraseñas de acceso');
}
function listarCuentas() {
  const cuentas = JSON.parse(props_().getProperty('CUENTAS') || '{}');
  return Object.keys(cuentas).map((u) => ({
    usuario: u, acceso: ALERTAS.ROLES[cuentas[u].rol] + (cuentas[u].rol === 'tiendas' ? '' : ' (temporal)'),
    fecha: Utilities.formatDate(new Date(cuentas[u].creada), ALERTAS.ZONA, 'dd/MM/yyyy HH:mm')
  }));
}
function guardarCuenta(usuario, rol, clave) {
  usuario = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('El usuario solo puede tener letras, números, punto, guion o guion bajo (3 a 40).');
  if (!ALERTAS.ROLES[rol]) throw new Error('Acceso no válido.');
  if (String(clave || '').length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  const sal = Utilities.getUuid();
  const cuentas = JSON.parse(props_().getProperty('CUENTAS') || '{}');
  cuentas[usuario] = { rol: rol, sal: sal, iter: ALERTAS.ITERACIONES_CLAVE, hash: hashClave_(String(clave), sal, ALERTAS.ITERACIONES_CLAVE), creada: Date.now() };
  props_().setProperty('CUENTAS', JSON.stringify(cuentas));
  cache_().remove('fallidos-cuenta:' + usuario);   // con la contraseña nueva, la cuenta queda desbloqueada
  limpiarCfg_();
  return true;
}
function quitarCuenta(usuario) {
  const cuentas = JSON.parse(props_().getProperty('CUENTAS') || '{}');
  delete cuentas[String(usuario || '').toLowerCase()];
  props_().setProperty('CUENTAS', JSON.stringify(cuentas));
  limpiarCfg_();
  return true;
}

function estiloDialogo_() {
  return '<style>body{font-family:Arial,sans-serif;font-size:13px;color:#1f2937}label{display:block;margin:10px 0;font-weight:bold}' +
    'input,select{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px;font-size:13px;border:1px solid #c7ced7;border-radius:6px}' +
    '.acc{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}button{padding:8px 14px;border-radius:6px;border:1px solid #c7ced7;background:#fff;cursor:pointer}' +
    'button.pri{background:#131921;color:#fff;border-color:#131921}.nota{color:#5b6573}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #e5e7eb}' +
    'h3{margin:16px 0 4px;font-size:14px}#msg{color:#b4202c;min-height:16px}</style>';
}
function esc_(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
