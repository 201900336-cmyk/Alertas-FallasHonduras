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
 *    - Usuarios    correos de Genesys con acceso Workforce, Jefatura o supervisor de Call Center
 *    - Cargas      quién subió cada base y cuándo
 *    - Catalogo    resumen por nodo (sin datos personales), oculta
 *    - "Alertas - Consultas" (archivo aparte) el detalle de cada consulta (30 días)
 *                  y un resumen por día para las estadísticas
 *
 *  Secretos (nunca en el código): la llave de las sesiones y las contraseñas
 *  cifradas viven en Propiedades del script. No se ven en GitHub ni en la página.
 *
 *  No edites las hojas Base, Fallas, Cargas ni Catalogo a mano: usa Alertas.
 *  Las hojas Usuarios y Tiendas sí se editan a mano (menú Alertas > Mostrar las pestañas).
 * ============================================================================
 */

const ALERTAS = {
  VERSION: '3.6',                // se ve en la pestaña INICIO
  ZONA: 'America/Tegucigalpa',
  HORAS_SESION: 12,
  HORAS_VISIBLE: 72,             // una falla cerrada sigue visible para los asesores (3 días)
  LIMITE_CONSULTAS_HORA: 400,    // por persona
  LIMITE_TIENDAS_HORA: 8000,     // para toda la cuenta compartida de Tiendas (unas 200 personas)
  INTENTOS_PERSONA: 5,           // contraseñas equivocadas de una misma persona antes de bloquearla 15 minutos
  INTENTOS_CUENTA_TIENDAS: 100,  // de todas las personas juntas, antes de bloquear la cuenta de Tiendas 15 minutos
  DIAS_DETALLE: 30,              // días de detalle de cada consulta (quién consultó qué)
  MAX_FILAS_DETALLE: 600000,     // tope de filas de detalle: el archivo admite 10 millones de celdas
  MAX_CONSULTAS_NODO: 3000,      // consultas de un nodo que lee el reporte Consultas por nodo (las más recientes)
  MAX_CONSULTAS_OLT: 6000,       // y de todos los nodos de una OLT juntos
  MAX_NODOS_REPORTE: 80,         // nodos de un mismo reporte (una OLT trae unas decenas)
  DIAS_RESUMEN: 120,             // días de resumen diario para las estadísticas
  DIAS_ESTADISTICAS: 90,         // periodo más largo que muestra Estadísticas
  DIAS_FALLAS_CARGA: 120,        // historial de fallas que recibe Workforce al entrar
  DIAS_HISTORIAL: 400,           // fallas que entran al historial de cada cliente (la tarjeta muestra hasta 1 año)
  FILAS_POR_LOTE: 5000,
  MAX_CAMBIOS: 20000,            // filas nuevas o cambiadas que se suben en una carga por cambios; si son más, va completa
  // Posible falla: 5 clientes distintos de un nodo sin falla publicada en 60 min (o 2 reportes de asesores).
  // Con 3 o 4 el nodo queda en observación. La marca de "reportada" dura 6 horas.
  ALERTA_MIN: 60, ALERTA_CLIENTES: 5, ALERTA_OBSERVAR: 3, ALERTA_REPORTES: 2, ALERTA_MARCA_HORAS: 6, ALERTA_MAX_CLIENTES: 60,
  // SMS por Notifícame (la plataforma de SMS de Claro). La llave y el secreto viven en Propiedades del script:
  // menú Alertas > 4. Conectar Notifícame. Un SMS por número; se mandan de 50 en 50, en paralelo.
  NOTIFICAME_URL: 'https://notificame.claro.com.hn/v4/api/rest/',
  SMS_LOTE: 50,
  // Cada SMS es una llamada de Google a otro servicio: con una cuenta de Gmail son unas 20 mil al día en total,
  // y el ingreso con Genesys también usa (2 por ingreso). Con Google Workspace (100 mil al día) se puede subir.
  SMS_POR_DIA: 15000,
  SMS_CONTROL_MAX: 40,           // números de control del equipo (menú Alertas > 5. Números de control)
  AVISOS_MAX: 8,                 // fallas publicadas, reabiertas o cerradas que guarda "estado" para el aviso de escritorio
  DIAS_ENVIOS_SMS: 40,           // días que se guarda a quién se le mandó cada aviso (para no repetirlo)
  ITERACIONES_CLAVE: 1500,
  HOJAS: { base: 'Base', nueva: 'Base_nueva', fallas: 'Fallas', usuarios: 'Usuarios', cargas: 'Cargas', catalogo: 'Catalogo', consultas: 'Consultas', resumen: 'Resumen', resumenAsesores: 'Resumen_asesores', descargas: 'Descargas SMS', envios: 'Envíos SMS', tiendas: 'Tiendas', celulares: 'Celulares', accesos: 'Accesos', reporteSms: 'Reporte SMS' },
  ROLES: { concentrix: 'Concentrix', tiendas: 'Tiendas', workforce: 'Workforce HN', jefatura: 'Jefatura', supervisor: 'Supervisor' },
  ESCRIBEN: ['workforce', 'jefatura'],
  // Ven las posibles fallas (el aviso de 5 clientes en 60 min) y las pueden reportar; publicar fallas, solo Workforce y Jefatura
  VEN_ALERTAS: ['workforce', 'jefatura', 'supervisor'],
  REGIONES: {
    'mypurecloud.com': 'Estados Unidos Este (Virginia)', 'use2.us-gov-pure.cloud': 'Estados Unidos Gobierno',
    'usw2.pure.cloud': 'Estados Unidos Oeste (Oregón)', 'cac1.pure.cloud': 'Canadá', 'mxc1.pure.cloud': 'México',
    'sae1.pure.cloud': 'Sudamérica (São Paulo)', 'mypurecloud.ie': 'Europa (Irlanda)', 'euw2.pure.cloud': 'Europa (Londres)',
    'mypurecloud.de': 'Europa (Fráncfort)', 'euc2.pure.cloud': 'Europa (Zúrich)', 'mec1.pure.cloud': 'Medio Oriente (EAU)',
    'aps1.pure.cloud': 'Asia (Mumbai)', 'apse1.pure.cloud': 'Asia (Singapur)', 'mypurecloud.jp': 'Asia (Tokio)',
    'apne2.pure.cloud': 'Asia (Seúl)', 'apne3.pure.cloud': 'Asia (Osaka)', 'mypurecloud.com.au': 'Australia (Sídney)'
  },
  // VALIDACION: posible falla general que se publica mientras el VOC la confirma. Si se cierra sin
  // cambiarle el motivo, queda descartada: los asesores dejan de verla y no entra al historial del cliente.
  MOTIVOS: {
    VALIDACION: 'Posible falla general', ENERGIA: 'Falla de energía comercial', FIBRA: 'Corte de fibra óptica',
    CORTO: 'Corto circuito externo', TERCEROS: 'Daño en infraestructura por terceros', POSTES: 'Caída de postes', VIA: 'Eventos en vía pública',
    EQUIPO: 'Reemplazo de equipo', RUIDO: 'Limpieza de ruido', MANTENIMIENTO: 'Mantenimiento preventivo', OTRO: 'Otro motivo'
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
const COL_USUARIOS = ['Correo de Genesys', 'Nombre', 'Rol (workforce, jefatura, supervisor, concentrix o bloqueado)', 'Activo (SÍ o NO)', 'Notas'];
const COL_CARGAS = ['Fecha', 'Subió', 'Archivo', 'Servicios', 'HFC', 'GPON', 'Nodos', 'Contratos nuevos', 'Ya no aparecen', 'Cambios de nodo'];
const COL_CONSULTAS = ['Fecha', 'Usuario', 'Nombre', 'Acceso', 'Tienda', 'Tipo', 'Contrato', 'Nodo', 'Resultado', 'Falla'];
const COL_RESUMEN = ['Día', 'Consultas', 'Con falla', 'Sin resultado', 'Reportes', 'Datos (no editar)'];
const COL_RESUMEN_AS = ['Día', 'Usuario', 'Nombre', 'Canal', 'Consultas', 'Con falla', 'Sin resultado'];
// Archivo de consultas: una fila por persona que entró a Alertas (para el reporte de Conexiones)
const COL_ACCESOS = ['Usuario', 'Nombre', 'Acceso', 'Tienda', 'Primera entrada', 'Última entrada', 'Entradas', 'Avisos de escritorio', 'Avisos al'];
const COL_DESCARGAS = ['Fecha', 'Usuario', 'Nombre', 'Fallas', 'Nodos', 'Clientes', 'Números en el archivo'];
const COL_ENVIOS = ['Fecha', 'Falla', 'ID de Alertas', 'Tipo', 'Teléfono', 'Estado', 'Detalle', 'Envío', 'Envió', 'Control'];
// Un envío de SMS por fila (para el reporte de Notifícame); se guarda siempre, sin teléfonos
const COL_REPORTE_SMS = ['Fecha', 'Terminó', 'Falla', 'ID de Alertas', 'Motivo', 'Nodos', 'Aviso', 'Mensaje', 'Texto', 'Envió', 'Clientes', 'Enviados',
  'Con error', 'En duda', 'Sin enviar', 'Números de control', 'Partes por SMS', 'SMS (partes)', 'Envío'];
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
  telefonos: accionTelefonos_, contactos: accionContactos_, alerta: accionAlerta_, sms: accionSms_, monitoreo: accionMonitoreo_,
  uso: accionUso_, conexiones: accionConexiones_, consultasNodo: accionConsultasNodo_
};
const PUBLICAS = { config: true, login: true, monitoreo: true };
const SOLO_WORKFORCE = { falla: true, base: true, estadisticas: true, telefonos: true, sms: true, conexiones: true, consultasNodo: true };
const DE_ALERTAS = { alertas: true, alerta: true };   // Workforce, Jefatura y los supervisores de Call Center

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
      else if (DE_ALERTAS[accion]) exigirRol_(ses, ALERTAS.VEN_ALERTAS);
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
/* aviso: lo último que pasó con cada falla (publicada, reabierta, resuelta o descartada) queda en "avisos"
   (las últimas 8) para el aviso de escritorio de todos. Cada falla tiene un solo aviso, el más reciente: al
   cerrarla, el de publicada cambia por el de resuelta, y una página que todavía no avisó la publicación ya
   no avisa de una falla que terminó. Un aviso sin tipo solo quita el de esa falla. */
function subirVersion_(cambio, extra, aviso) {
  const raw = props_().getProperty('ESTADO');
  const e = raw ? JSON.parse(raw) : { version: 1, baseVersion: 0, cambio: null };
  e.version = (e.version || 1) + 1;
  e.cambio = cambio;
  if (extra) Object.keys(extra).forEach((k) => { e[k] = extra[k]; });
  if (aviso) {
    const otros = (e.avisos || []).filter((x) => x.id !== aviso.id);
    e.avisos = aviso.tipo ? otros.concat(Object.assign({ v: e.version }, aviso)).slice(-ALERTAS.AVISOS_MAX) : otros;
  }
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
    listaTiendas: tiendas_()
  };
}

/* Monitoreo en vivo de la pantalla de entrada (pública, sin sesión): el nodo con más clientes de cada
   departamento (sin los TAP VIRTUAL) y si está en una falla activa. Solo el código del nodo: ni cantidades
   ni datos de clientes. Se guarda en caché por versión: al publicar o cerrar una falla, o al subir la base,
   la versión cambia y la próxima visita lo calcula de nuevo. Nunca falla: sin base, va vacío. */
function accionMonitoreo_() {
  const e = estado_(), clave = 'mon:' + e.version + ':' + e.baseVersion;
  const c = cache_().get(clave);
  if (c) return JSON.parse(c);
  const r = { en: Date.now(), nodos: [] };
  try {
    const cat = catalogo_();
    if (cat) {
      const activos = {};
      fallasRecientes_().forEach((f) => { if (f.estado === 'ACTIVA') (f.nodos || []).forEach((n) => { activos[n] = true; }); });
      r.nodos = nodosPrincipales_(cat).map((x) => ({ d: x[0], n: x[1], falla: !!activos[x[1]] }));
    }
  } catch (err) { r.nodos = []; }
  cache_().put(clave, JSON.stringify(r), 600);
  return r;
}
/* [departamento, nodo] del nodo con más clientes de cada departamento, en orden alfabético. Con empate,
   el primero del catálogo (igual que Model.monitoreo en la página). */
function nodosPrincipales_(cat) {
  const mejor = {};
  cat.nodos.forEach((n) => {
    if (esVirtual_(n[0])) return;
    for (let i = 0; i < n[6].length; i += 2) {
      const dep = cat.deps[n[6][i]], k = n[6][i + 1];
      if (dep && (!mejor[dep] || k > mejor[dep][1])) mejor[dep] = [n[0], k];
    }
  });
  return Object.keys(mejor).sort().map((d) => [d, mejor[d][0]]);
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
  const h = protegerSiBloqueado_(ss.insertSheet(ALERTAS.HOJAS.tiendas));
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
  if (nombre.length < 3) throw fallo_('DATOS', 'Escribe tu nombre y apellido.');
  // Solo la cuenta de Tiendas entra con contraseña: no hay accesos temporales (por privacidad, desde la 3.2).
  // Una cuenta temporal que haya quedado de antes cuenta como usuario o contraseña incorrectos.
  const c0 = (cfg_().CUENTAS || {})[usuario];
  const c = c0 && c0.rol === 'tiendas' ? c0 : null;

  /* Bloqueos por contraseñas equivocadas. La cuenta de Tiendas la comparten cientos de personas:
     los errores de una persona solo la bloquean a ella. La cuenta completa se bloquea solo si
     llegan muchísimos intentos fallidos juntos (alguien probando contraseñas). */
  const cache = cache_();
  const kp = 'fallidos:' + usuario + ':' + nombre.toLowerCase() + '@' + normTienda_(tienda);
  const kc = 'fallidos-cuenta:' + usuario;
  const topeCuenta = ALERTAS.INTENTOS_CUENTA_TIENDAS;
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
  // Nombre y apellido reales (la cuenta es compartida: así cada consulta queda a nombre de alguien), en nombre propio
  const nom = nombrePersona_(nombre);
  if (!nom.ok) throw fallo_('DATOS', nom.error);
  // La tienda tiene que ser una de la lista (se guarda con el nombre exacto de la hoja Tiendas)
  const k = normTienda_(tienda);
  const suTienda = (k && tiendas_().filter((t) => normTienda_(t) === k)[0]) || '';
  if (!suTienda) throw fallo_('DATOS', tienda ? 'Elige tu tienda de la lista.' : 'Elige la tienda desde donde atiendes.');
  const id = usuario + ':' + nom.nombre.toLowerCase() + '@' + suTienda.toLowerCase();
  return emitirSesion_({ u: id, n: nom.nombre, r: 'tiendas', t: suTienda, o: 'clave', a: usuario });
}

/* Nombre de una persona de Tiendas: nombre y apellido reales, sin apodos ni relleno ("el pepe", "la mera mera",
   "prueba", "asdf"), en nombre propio ("juan perez" → "Juan Perez"). La página revisa lo mismo
   (Model.nombrePersona); el servidor lo vuelve a revisar porque la página se puede saltar. */
const PARTICULAS_NOMBRE_ = { de: 1, del: 1, la: 1, las: 1, los: 1, y: 1, e: 1, da: 1, das: 1, do: 1, dos: 1, van: 1, von: 1 };
const ARTICULOS_NOMBRE_ = { el: 1, la: 1, los: 1, las: 1, lo: 1, un: 1, una: 1, de: 1, del: 1, y: 1, e: 1 };
const NO_NOMBRES_ = ('pepe pepito test testing prueba pruebas ejemplo demo asesor asesora agente tienda tiendas usuario usuaria admin administrador '
  + 'nadie ninguno ninguna anonimo anonima desconocido desconocida fulano fulana mengano mengana zutano zutana perengano perengana '
  + 'xxx asdf qwerty abc nombre apellido jefe jefa patron patrona cliente claro hola yo chele maje mae cerote cipote cipota bicho '
  + 'puta puto mierda verga culo pija pendejo pendeja idiota tonto tonta loco loca persona personas otra otro alguien cualquiera '
  + 'gente intruso hacker').split(' ').reduce((m, w) => { m[w] = 1; return m; }, {});
function nombrePersona_(texto) {
  const limpio = String(texto == null ? '' : texto).normalize('NFC').replace(/\s+/g, ' ').trim();
  const real = 'Escribe tu nombre y apellido reales, por ejemplo: Juan Pérez.';
  if (limpio.length < 5) return { ok: false, error: 'Escribe tu nombre y apellido.' };
  if (limpio.length > 60) return { ok: false, error: 'El nombre es demasiado largo: escribe solo tu nombre y apellidos.' };
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(limpio)) return { ok: false, error: 'Escribe solo letras, sin números ni signos.' };
  const palabras = limpio.toLowerCase().split(' ');
  const base = (w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['-]/g, '');
  const principales = palabras.filter((w) => !PARTICULAS_NOMBRE_[w]);
  if (principales.length < 2) return { ok: false, error: 'Escribe tu nombre y tu apellido, por ejemplo: Juan Pérez.' };
  if (palabras.length > 6) return { ok: false, error: 'Escribe solo tu nombre y tus apellidos.' };
  if (ARTICULOS_NOMBRE_[palabras[0]] || palabras.some((w) => NO_NOMBRES_[base(w)])) return { ok: false, error: real };
  if (principales.some((w) => base(w).length < 2)) return { ok: false, error: 'Escribe tu nombre y apellido completos, sin iniciales.' };
  if (principales.some((w) => !/[aeiouy]/.test(base(w)) || /(.)\1\1/.test(base(w)))) return { ok: false, error: real };
  if (principales.map(base).every((w, i, a) => w === a[0])) return { ok: false, error: real };
  return { ok: true, nombre: nombrePropio_(palabras) };
}
/* Nombre propio, como NOMPROPIO de Excel pero con "de", "del", "la"… en minúscula en medio (María de la Cruz) */
function nombrePropio_(palabras) {
  return palabras.map((w, i) => (i > 0 && PARTICULAS_NOMBRE_[w] ? w
    : w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-'))).join(' ');
}

function emitirSesion_(p) {
  const ahora = Date.now();
  p.i = ahora;
  p.e = ahora + ALERTAS.HORAS_SESION * 3600000;
  const cuerpo = Utilities.base64EncodeWebSafe(JSON.stringify(p), Utilities.Charset.UTF_8);
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(cuerpo, secreto_(), Utilities.Charset.UTF_8));
  registrarEntrada_(p);
  return { token: cuerpo + '.' + firma, usuario: usuarioPublico_(p), expira: p.e };
}

/* ----- Conexiones: quién entra a Alertas -----
   Cada persona que entra queda en la hoja Accesos del archivo de consultas, una fila por persona: primera y
   última entrada, cuántas veces entró y si en su PC están activados los avisos de escritorio. Nunca frena la
   entrada: si algo falla, solo queda en el registro de errores de Apps Script. */
function hojaAccesos_() { return hojaEn_(libroConsultas_(), ALERTAS.HOJAS.accesos, COL_ACCESOS); }
function filaAcceso_(h, u) {
  const ult = h.getLastRow();
  if (ult < 2) return 0;
  const c = h.getRange(2, 1, ult - 1, 1).createTextFinder(String(u)).matchEntireCell(true).matchCase(true).findNext();
  return c ? c.getRow() : 0;
}
function registrarEntrada_(p) {
  try {
    const h = hojaAccesos_(), ahora = new Date(), fila = filaAcceso_(h, p.u);
    if (fila) {
      const r = h.getRange(fila, 2, 1, 6), v = r.getValues()[0];
      r.setValues([[p.n, ALERTAS.ROLES[p.r], p.t || '', v[3] || ahora, ahora, (Number(v[5]) || 0) + 1]]);
    } else h.appendRow([p.u, p.n, ALERTAS.ROLES[p.r], p.t || '', ahora, ahora, 1, '', '']);
    return fila || h.getLastRow();
  } catch (e) { console.error('No se pudo registrar la entrada: ' + (e && e.message)); return 0; }
}
/* La página avisa si en esa PC están activados los avisos de escritorio (una vez por sesión y cuando cambia) */
const ESTADOS_AVISOS_ = { activados: 'Activados', bloqueados: 'Bloqueados', 'sin-soporte': 'No disponibles', pendiente: 'Sin responder' };
function accionUso_(d, ses) {
  const avisos = ESTADOS_AVISOS_[String(d.avisos || '')];
  if (!avisos) throw fallo_('DATOS', 'Estado de los avisos no válido.');
  try {
    const h = hojaAccesos_();
    const fila = filaAcceso_(h, ses.u) || registrarEntrada_(ses);   // una sesión de antes de la 3.3 se anota ahora
    if (fila) h.getRange(fila, 8, 1, 2).setValues([[avisos, new Date()]]);
  } catch (e) { console.error('No se pudo anotar el estado de los avisos: ' + (e && e.message)); }
  return { listo: true };
}
function leerAccesos_() {
  const h = libroConsultas_().getSheetByName(ALERTAS.HOJAS.accesos);
  if (!h || h.getLastRow() < 2) return [];
  const ms = (v) => (v ? fechaMs_(v) || null : null);
  return h.getRange(2, 1, h.getLastRow() - 1, COL_ACCESOS.length).getValues().filter((f) => f[0]).map((f) => ({
    u: String(f[0]), nombre: String(f[1] || ''), acceso: String(f[2] || ''), tienda: String(f[3] || ''),
    primera: ms(f[4]), ultima: ms(f[5]), entradas: Number(f[6]) || 0, avisos: String(f[7] || ''), avisosEn: ms(f[8])
  }));
}
/* Reporte de Conexiones (Workforce y Jefatura): cada persona que entró o consultó, con su última entrada, cuántas
   veces entró, el estado de sus avisos y sus consultas del periodo. */
function accionConexiones_(d) {
  const ahora = Date.now(), reloj = reloj_(), DIA = 86400000;
  const hoy = reloj.inicio(ahora);
  const desde = Math.max(reloj.inicio(Number(d.desde) || hoy), hoy - (ALERTAS.DIAS_ESTADISTICAS - 1) * DIA);
  const clave = 'conexiones:' + desde;
  const hit = cache_().get(clave);
  if (hit) return JSON.parse(hit);
  const personas = {};
  leerAccesos_().forEach((a) => {
    const p = personas[a.u];
    if (!p) { personas[a.u] = a; return; }
    // Dos filas de la misma persona (dos entradas en el mismo instante): se juntan
    if ((a.ultima || 0) > (p.ultima || 0)) { p.ultima = a.ultima; p.nombre = a.nombre; }
    p.primera = Math.min(p.primera || Infinity, a.primera || Infinity) === Infinity ? null : Math.min(p.primera || Infinity, a.primera || Infinity);
    p.entradas += a.entradas;
    if ((a.avisosEn || 0) > (p.avisosEn || 0)) { p.avisos = a.avisos; p.avisosEn = a.avisosEn; }
  });
  const ag = agregarPeriodo_(desde, hoy, reloj);
  Object.keys(ag.asesores).forEach((u) => {
    const x = ag.asesores[u], i = x.canal.indexOf(': ');
    const p = personas[u] || (personas[u] = { u: u, nombre: x.nombre, acceso: i > 0 ? x.canal.slice(0, i) : x.canal, tienda: i > 0 ? x.canal.slice(i + 2) : '',
      primera: null, ultima: null, entradas: 0, avisos: '', avisosEn: null });
    p.consultas = x.n; p.falla = x.falla;
  });
  const lista = Object.keys(personas).map((u) => { const p = personas[u]; p.consultas = p.consultas || 0; p.falla = p.falla || 0; return p; });
  const res = { personas: lista, desde: desde, ahora: ahora };
  const txt = JSON.stringify(res);
  if (txt.length < 95000) cache_().put(clave, txt, 60);
  return res;
}
/* ----- Consultas por nodo (Reportes, Workforce y Jefatura) -----
   Las consultas de un nodo en el periodo (hoy, 7 o 30 días: el detalle que se guarda), una por una y sin
   teléfonos: [fecha, acceso, tienda, tipo, contrato, resultado]. La página las cuenta (cuántos clientes
   distintos, por qué canal y cuándo). Con los datos de los clientes que más consultaron, para la tabla.
   Busca el nodo en la columna Nodo del periodo y lee solo esas filas (las cercanas, de una vez). */
/* Reportes › Nodo o cliente: las consultas de los asesores de un nodo, o de varios a la vez (los nodos GPON de
   una OLT, que manda la página desde su catálogo). Cada fila lleva su nodo. */
function accionConsultasNodo_(d) {
  const lista = Array.isArray(d.nodos) && d.nodos.length ? d.nodos : [d.nodo];
  const nodos = [];
  lista.forEach((x) => { const n = String(x || '').trim().toUpperCase(); if (n && nodos.indexOf(n) < 0) nodos.push(n); });
  if (!nodos.length || !nodos.every((n) => /^[A-Z0-9][A-Z0-9 _.\-]{0,39}$/.test(n))) throw fallo_('DATOS', 'Escribe el código del nodo, por ejemplo GRA01.');
  if (nodos.length > ALERTAS.MAX_NODOS_REPORTE) throw fallo_('DATOS', 'Son demasiados nodos para un solo reporte (el tope es ' + ALERTAS.MAX_NODOS_REPORTE + ').');
  const varios = nodos.length > 1, deEstos = {};
  nodos.forEach((n) => { deEstos[n] = true; });
  const ahora = Date.now(), reloj = reloj_(), DIA = 86400000;
  const hoy = reloj.inicio(ahora);
  const desde = Math.max(reloj.inicio(Number(d.desde) || hoy), hoy - (ALERTAS.DIAS_DETALLE - 1) * DIA);
  const clave = 'nodo:' + (varios ? nodos.length + ':' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, nodos.slice().sort().join(','))).slice(0, 24) : nodos[0]) + ':' + desde;
  const hit = cache_().get(clave);
  if (hit) return JSON.parse(hit);

  const h = hojaConsultas_(), ult = h ? h.getLastRow() : 0;
  const filas = [], tope = varios ? ALERTAS.MAX_CONSULTAS_OLT : ALERTAS.MAX_CONSULTAS_NODO;
  let recortado = false;
  if (ult >= 2) {
    const a = filaDesde_(h, desde, ult);
    if (a <= ult) {
      const rango = h.getRange(a, 8, ult - a + 1, 1);
      let celdas;
      if (!varios) celdas = rango.createTextFinder(nodos[0]).matchEntireCell(true).findAll();
      else {
        try {
          celdas = rango.createTextFinder('^(' + nodos.map((n) => n.replace(/\./g, '\\.')).join('|') + ')$').useRegularExpression(true).matchEntireCell(true).findAll();
        } catch (e) {
          celdas = [];
          nodos.forEach((n) => { celdas = celdas.concat(rango.createTextFinder(n).matchEntireCell(true).findAll()); });
        }
      }
      let nums = celdas.map((r) => r.getRow()).sort((x, y) => x - y);
      if (nums.length > tope) { nums = nums.slice(-tope); recortado = true; }
      const quiero = {};
      nums.forEach((f) => { quiero[f] = true; });
      const tramos = [];
      nums.forEach((f) => { const t = tramos[tramos.length - 1]; if (t && f - t[1] <= 50) t[1] = f; else tramos.push([f, f]); });
      tramos.forEach((t) => h.getRange(t[0], 1, t[1] - t[0] + 1, COL_CONSULTAS.length).getValues().forEach((v, i) => {
        const nodo = String(v[7]).toUpperCase();
        if (!quiero[t[0] + i] || !deEstos[nodo]) return;
        filas.push([fechaMs_(v[0]), String(v[3] || ''), String(v[4] || ''), String(v[5] || ''), String(v[6] || ''), String(v[8] || ''), nodo]);
      }));
    }
  }
  // Los datos de los clientes (los que más consultaron, hasta 300); las búsquedas de Workforce, Jefatura y
  // los supervisores no son clientes llamando
  const veces = {};
  filas.forEach((f) => { if (f[4] && !ACCESOS_INTERNOS_[f[1]]) veces[f[4]] = (veces[f[4]] || 0) + 1; });
  const top = Object.keys(veces).sort((x, y) => veces[y] - veces[x]).slice(0, 300);
  const datos = datosDeContratos_(top, varios ? deEstos : nodos[0]), clientes = {};
  Object.keys(datos).forEach((c) => {
    const b = datos[c];
    clientes[c] = { nombre: b.nombre || '', colonia: b.colonia || '', municipio: b.municipio || '', nap: b.nap || '', categoria: b.categoria || '' };
  });
  const res = { nodo: varios ? '' : nodos[0], nodos: nodos, desde: desde, ahora: ahora, recortado: recortado, filas: filas, clientes: clientes };
  const txt = JSON.stringify(res);
  if (txt.length < 95000) cache_().put(clave, txt, 60);
  return res;
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
    // Solo Tiendas entra con contraseña: la sesión de un acceso temporal de antes de la 3.2 ya no vale.
    // Si la cuenta se quitó o se le cambió la contraseña, las sesiones anteriores dejan de valer.
    const c = (cfg_().CUENTAS || {})[p.a];
    if (p.r !== 'tiendas' || !c || c.rol !== 'tiendas' || (c.creada || 0) > p.i) return null;
  }
  if (p.o === 'genesys') {
    // Bloquear a alguien en la hoja Usuarios corta también la sesión que ya tenía abierta
    const reg = usuarios_()[p.u];
    if (reg && (!reg.activo || reg.rol === 'bloqueado')) return null;
    if (!reg && (cfg_().GENESYS || {}).rolPorDefecto === 'ninguno') return null;
  }
  return p;
}

function exigirWorkforce_(ses) { exigirRol_(ses, ALERTAS.ESCRIBEN); }
function exigirRol_(ses, roles) {
  if (roles.indexOf(ses.r) < 0) throw fallo_('PERMISO', 'Tu acceso no permite esta acción.');
  if (ses.o === 'genesys') {
    // Si alguien sale de la lista de Usuarios (o le cambian el rol), pierde el permiso de inmediato
    const reg = usuarios_()[ses.u];
    if (!reg || !reg.activo || roles.indexOf(reg.rol) < 0) throw fallo_('PERMISO', 'Tu acceso ya no permite esta acción.');
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
  return { version: e.version, baseVersion: e.baseVersion, cambio: e.cambio, avisos: e.avisos || [], ahora: Date.now() };
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
    const x = motivoCompatible_({ id: f.id, motivo: f.motivo, motivoTexto: f.motivoTexto, inicio: f.inicio, fin: f.fin });
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
  const lista = leerFallas_().filter((f) => f.estado === 'ACTIVA' || ((f.cerradaEn || 0) >= desde && !descartada_(f)))
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
  if (ult < 2) return { n7: 0, n30: 0, anterior: null, veces: [] };
  const filas = h.getRange(2, 7, ult - 1, 1).createTextFinder(c).matchEntireCell(true).findAll()
    .map((r) => r.getRow()).sort((a, b) => b - a);           // de la más reciente a la más vieja
  const ahora = Date.now();
  let n7 = 0, anterior = null, actual = 0;
  // veces: las horas en que llamó (consultas de Concentrix y Tiendas, con la de ahora); la tarjeta marca en
  // qué fallas llamó. Las búsquedas de Workforce HN y Jefatura no son llamadas del cliente.
  const veces = [];
  // Se leen una por una (fecha a acceso): con las 25 más recientes sobra para un cliente
  for (let i = 0; i < filas.length && i < 25; i++) {
    const fila = h.getRange(filas[i], 1, 1, 4).getValues()[0];
    const v = fila[0];
    const t = v && typeof v.getTime === 'function' ? v.getTime() : Date.parse(v) || 0;
    if (t && !ACCESOS_INTERNOS_[String(fila[3] || '')]) veces.push(t);
    if (i === 0 && ahora - t < 120000) { actual = 1; continue; }   // la consulta que se está viendo ahora
    if (anterior === null) anterior = t;
    if (ahora - t <= 7 * 86400000) n7++;
  }
  return { n7: n7, n30: filas.length - actual, anterior: anterior, veces: veces };
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
    numero: String(f[19] == null ? '' : f[19]), historial: d.historial || [], deteccion: d.deteccion || null, sms: d.sms || [], _fila: n
  };
}
/* Una posible falla (VALIDACION) que se cerró sin confirmarla: el VOC no encontró falla */
function descartada_(f) { return f.estado !== 'ACTIVA' && f.motivo === 'VALIDACION'; }
function fallaAFila_(f) {
  const fecha = (ms) => (ms ? new Date(ms) : '');
  return [f.id, f.estado === 'ACTIVA' ? 'Activa' : descartada_(f) ? 'Descartada' : 'Resuelta', ALERTAS.MOTIVOS[f.motivo] || f.motivo, f.motivoTexto, f.clienteTexto,
    f.nodos.join(', '), fecha(f.inicio), fecha(f.eta), fecha(f.publicadaEn), f.publicadaPor ? f.publicadaPor.nombre : '',
    fecha(f.cerradaEn), f.cerradaPor ? f.cerradaPor.nombre : '', f.notaCierre, f.referencia, f.detalle,
    f.impacto.total, f.impacto.hfc, f.impacto.gpon,
    JSON.stringify({ estado: f.estado, motivo: f.motivo, nodos: f.nodos, inicio: f.inicio, eta: f.eta, publicadaEn: f.publicadaEn,
      publicadaPor: f.publicadaPor, cerradaEn: f.cerradaEn, cerradaPor: f.cerradaPor, impacto: f.impacto, historial: f.historial, deteccion: f.deteccion || null,
      sms: f.sms && f.sms.length ? f.sms : undefined }),
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
  return motivoCompatible_({
    id: f.id, numero: f.numero || '', estado: f.estado, motivo: f.motivo, motivoTexto: f.motivoTexto, clienteTexto: f.clienteTexto, nodos: f.nodos,
    inicio: f.inicio, eta: f.eta, publicadaEn: f.publicadaEn, publicadaPor: { nombre: (f.publicadaPor && f.publicadaPor.nombre) || '' },
    cerradaEn: f.cerradaEn, impacto: f.impacto
  });
}
/* Los motivos nuevos del 2 nov (eventos externos con mensaje de SMS aprobado): a los asesores se les mandan como
   "Otro" con su nombre y su texto para el cliente. Así una página abierta desde antes, que no los conoce, los muestra
   bien en vez de fallar. Workforce recibe el motivo real (lo necesita para editar y para los SMS). */
const MOTIVOS_NUEVOS = {
  CORTO: 'un corto circuito externo, ajeno a nuestra red, en su zona',
  TERCEROS: 'daños causados por terceros en la infraestructura de su zona',
  POSTES: 'la caída de postes por un incidente externo en su zona',
  VIA: 'daños ocasionados por terceros en la vía pública de su zona'
};
function motivoCompatible_(x) {
  if (!Object.prototype.hasOwnProperty.call(MOTIVOS_NUEVOS, x.motivo)) return x;
  return Object.assign({}, x, { motivo: 'OTRO', motivoTexto: ALERTAS.MOTIVOS[x.motivo], clienteTexto: MOTIVOS_NUEVOS[x.motivo] });
}

/* Activas y cerradas en las últimas 84 horas (las 72 que las ven los asesores, más 12), con las descartadas; en caché 10 minutos */
function fallasRecientes_() {
  const c = cache_().get('fallasRecientes');
  if (c) return JSON.parse(c);
  const corte = Date.now() - (ALERTAS.HORAS_VISIBLE + 12) * 3600000;
  const recientes = leerFallas_().filter((f) => f.estado === 'ACTIVA' || (f.cerradaEn && f.cerradaEn >= corte)).map(sinFila_);
  const txt = JSON.stringify(recientes);
  if (txt.length < 95000) cache_().put('fallasRecientes', txt, 600);
  return recientes;
}
/* Las fallas que ven los asesores: activas y cerradas hace menos de 72 horas (sin las descartadas) */
function fallasVisibles_() {
  const ahora = Date.now();
  return fallasRecientes_().filter((f) => f.estado === 'ACTIVA' || (f.cerradaEn && !descartada_(f) && ahora - f.cerradaEn < ALERTAS.HORAS_VISIBLE * 3600000)).map(fallaPublica_);
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
      try { f.deteccion = deteccionFalla_(f.nodos, ahora); } catch (err) { f.deteccion = null; }   // nunca frena la publicación
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
    const aviso = tipo === 'FALLA_EDITADA' ? null : avisoFalla_(f, tipo, ahora, por);
    const e = subirVersion_({ tipo: tipo, texto: texto, por: por, en: ahora }, null, aviso);
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
/* El aviso de escritorio de una falla publicada, reabierta o cerrada (resuelta, o descartada si era una posible
   falla general): lo mismo que ya ven los asesores de ella (número, motivo, nodos, clientes y la hora de
   solución), sin referencia, notas internas ni correos. "por" es quien la publicó, reabrió o cerró. */
function avisoFalla_(f, tipo, ahora, por) {
  const p = fallaPublica_(f);
  const t = tipo === 'FALLA_REABIERTA' ? 'REABIERTA' : tipo === 'FALLA_CERRADA' ? (descartada_(f) ? 'DESCARTADA' : 'CERRADA') : 'PUBLICADA';
  const x = {
    id: p.id, tipo: t, numero: p.numero, motivo: p.motivo, motivoTexto: p.motivoTexto || '',
    nodos: p.nodos.slice(0, 4), n: p.nodos.length, clientes: (p.impacto && p.impacto.total) || 0, en: ahora, por: por.nombre
  };
  if (t === 'CERRADA' || t === 'DESCARTADA') x.cerradaEn = p.cerradaEn;
  return x;
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
  if (d.op === 'celulares') return prepararIndiceCelulares_();   // la página lo pide al terminar una carga
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
    const h = protegerSiBloqueado_(ss.insertSheet(ALERTAS.HOJAS.nueva));   // al terminar pasa a ser la Base
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
  if (!hc) { hc = protegerSiBloqueado_(ss.insertSheet(ALERTAS.HOJAS.catalogo)); hc.hideSheet(); }
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
  const cel = celularesDe_(nodos);
  const clientes = cel.clientes, conCelular = cel.conCelular, soloFijo = cel.soloFijo, sinTelefono = cel.sinTelefono;
  // Los números de control del equipo van primero (los que no son clientes de la falla)
  const control = numerosControlSms_().filter((x) => cel.numeros.indexOf(x) < 0);
  const numeros = control.concat(cel.numeros);

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
    clientes: clientes, conCelular: conCelular, soloFijo: soloFijo, sinTelefono: sinTelefono, control: control.length, telefonos: numeros
  };
}

/* ============================================================================
 *  SMS a los clientes de una falla, con Notifícame (la plataforma de SMS de Claro)
 *
 *  La llave (API key) y el secreto (API secret) se guardan en Propiedades del script con el
 *  menú Alertas > 4. Conectar Notifícame: nunca llegan a la página ni a GitHub. Cada pedido va
 *  firmado como pide la documentación del API REST v4 (y sus SDK):
 *    firma = BASE64(HMAC-SHA1(secreto, llave + fecha + parámetros + cuerpo JSON))
 *    encabezados: Date (RFC 1123) y Authorization: IM <llave>:<firma>
 *  Se manda un SMS por número (messages/send_to_contact), de 50 en 50 y en paralelo. La página
 *  maneja el avance pidiendo lote por lote; los números nunca salen del servidor.
 *  Cada número enviado queda en la pestaña "Envíos SMS" (40 días): así no se le repite el mismo
 *  aviso a nadie, aunque a la falla le agreguen nodos o se corte el envío a medias.
 * ========================================================================== */
const TIPOS_SMS = { FALLA: 'Aviso de falla', RESTABLECIDO: 'Servicio restablecido' };
/* Mensajes aprobados por Claro ("Segmentación de motivos 2.0", eventos externos o fortuitos): solo se mandan estos,
   tal cual, sin tildes. La clave es el motivo de la falla que lo usa; una falla de otro motivo no manda SMS.
   Desde el 2 nov no se manda SMS cuando el servicio ya se restableció. */
const SMS_APROBADOS = {
  FIBRA: { nombre: 'Fibra dañada (accidentes / terceros)',
    texto: 'CLARO:\nAviso: Detectamos una posible afectacion en la red debido a danos causados por terceros en la fibra optica de su sector. Nuestro equipo tecnico ya trabaja en la reparacion urgente. Gracias' },
  ENERGIA: { nombre: 'Falla de energía eléctrica',
    texto: 'CLARO: Estimado cliente, debido a una interrupcion en el suministro electrico en su zona, su servicio podria verse afectado temporalmente. El servicio se normalizara al restablecerse la energia. Gracias.' },
  CORTO: { nombre: 'Corto circuito externo',
    texto: 'CLARO: Informamos que una incidencia electrica ajena a nuestra infraestructura afecta su conexion. Estamos coordinando para restablecer el servicio a la brevedad posible.' },
  TERCEROS: { nombre: 'Daño en infraestructura por terceros',
    texto: 'CLARO: Estimado cliente, El servicio presenta posibles intermitencias debido a eventos externos en la infraestructura de la zona. Estamos trabajando en su normalizacion.' },
  POSTES: { nombre: 'Caída de postes',
    texto: 'CLARO:\nAviso: Se reporta dano en infraestructura publica (postes) por un incidente externo, afectando su servicio. Estamos coordinando para restablecer el suministro a la brevedad.' },
  VIA: { nombre: 'Eventos en vía pública',
    texto: 'CLARO: Estimado cliente, se reportan danos ocasionados por terceros en la via publica que afectan la infraestructura de su zona. Nuestro equipo tecnico ya trabaja en la reparacion.' }
};
const mensajesAprobados_ = () => Object.keys(SMS_APROBADOS).map((k) => ({ id: k, nombre: SMS_APROBADOS[k].nombre, texto: SMS_APROBADOS[k].texto }));
/* Por qué no se puede mandar SMS a una falla ('' si se puede) */
function sinSmsPara_(f) {
  if (f.estado !== 'ACTIVA') return 'La falla ya se cerró: cuando el servicio se restablece no se manda SMS.';
  if (!SMS_APROBADOS[f.motivo]) return 'El motivo "' + nombreMotivo_(f) + '" no tiene un mensaje aprobado: no se manda SMS. Tienen mensaje: '
    + Object.keys(SMS_APROBADOS).map((k) => ALERTAS.MOTIVOS[k]).join(', ') + '.';
  return '';
}
/* Estado de cada número en la pestaña "Envíos SMS" (una fila por número y envío):
     Pendiente  apartado en un envío, todavía no se manda
     Enviando   se está mandando ahora (se marca antes de llamar a Notifícame)
     Enviado    Notifícame lo aceptó
     Error      Notifícame lo rechazó (por ejemplo, número no válido): se puede volver a intentar
     Dudoso     no se sabe si salió (Notifícame no respondió o se cortó): no se le reenvía, para no repetir
     Cancelado  el envío se detuvo antes de mandarlo: queda para el próximo
   El estado que vale es el de la última fila del número. */
const SMS_NO_REPETIR = { Enviado: true, Enviando: true, Dudoso: true, Pendiente: true };
const VUELO_SMS_MS = 4 * 60000;          // un grupo que lleva más que esto "mandándose" se cortó
const ENVIO_SMS_VIEJO_MS = 10 * 60000;   // un envío que no avanza en 10 minutos lo puede tomar otra persona

function notificameCfg_() {
  let c = null;
  try { c = JSON.parse(props_().getProperty('NOTIFICAME') || 'null'); } catch (e) { c = null; }
  return c && c.key && c.secret ? { key: c.key, secret: c.secret, url: c.url || ALERTAS.NOTIFICAME_URL } : null;
}
function pedidoNotificame_(cfg, metodo, ruta, cuerpo) {
  const fecha = new Date().toUTCString();                       // "Mon, 02 Nov 2026 20:03:00 GMT"
  const json = cuerpo ? JSON.stringify(cuerpo) : '';
  const firma = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, cfg.key + fecha + json, cfg.secret, Utilities.Charset.UTF_8));
  const p = {
    url: cfg.url + ruta, method: metodo, muteHttpExceptions: true, followRedirects: false,
    headers: { Date: fecha, Authorization: 'IM ' + cfg.key + ':' + firma, 'X-IM-ORIGIN': 'IM_SDK_JAVASCRIPT_V4' }
  };
  if (json) {
    p.contentType = 'application/json; charset=utf-8';
    p.payload = Utilities.newBlob('').setDataFromString(json, 'UTF-8').getBytes();   // los mismos bytes que se firmaron
  }
  return p;
}
function respuestaNotificame_(r) {
  const codigo = r.getResponseCode();
  let datos = null;
  try { datos = JSON.parse(r.getContentText('UTF-8') || 'null'); } catch (e) { datos = null; }
  return { codigo: codigo, datos: datos };
}
function llamarNotificame_(cfg, metodo, ruta, cuerpo) {
  const p = pedidoNotificame_(cfg, metodo, ruta, cuerpo);
  const url = p.url;
  delete p.url;
  return respuestaNotificame_(UrlFetchApp.fetch(url, p));
}
function errorNotificame_(x) {
  const d = (x && x.datos) || {};
  if (x.codigo === 429 || Number(d.code) === 42900) return 'Notifícame pidió esperar: demasiados envíos seguidos.';
  if (x.codigo === 401) return 'Notifícame rechazó la llave o el secreto. Revísalos en la base interna: Alertas > 4. Conectar Notifícame.';
  const e = d.error && typeof d.error === 'object' ? d.error.message || d.error.description || JSON.stringify(d.error) : d.error;
  const txt = String(e || d.message || d.mensaje || d.description || '').trim();
  if (x.codigo === 403) return ('Notifícame no permitió el envío' + (txt ? ': ' + txt : ' (código 403)') + '. Revisa la cuenta de Notifícame.').slice(0, 200);
  return (txt || 'Notifícame respondió con el código ' + x.codigo).slice(0, 200);
}
const idMensaje_ = (d) => String((d && (d.message_id || d.id || (d.data && (d.data.message_id || d.data.id)))) || '');
/* Motivo de un envío que Notifícame aceptó (2xx) pero marcó con error. Ahí "message" es el texto del SMS
   (la respuesta trae message_id, short_code, type, direction, status, sent_from, id, message, sent_count,
   error_count, total_recipients y msisdn), así que el motivo sale de error, errors o status. */
function motivoEnvio_(d) {
  const e = d.error && typeof d.error === 'object' ? d.error.message || d.error.description || JSON.stringify(d.error) : d.error;
  const e0 = Array.isArray(d.errors) && d.errors.length ? d.errors[0] : '';
  const es = e0 && typeof e0 === 'object' ? e0.message || e0.description || JSON.stringify(e0) : e0;
  return String(e || es || 'Notifícame lo marcó ' + (d.status || 'con error') + (d.delivery_status ? ' (' + d.delivery_status + ')' : '')).trim().slice(0, 200);
}
// Lo que llega a la página nunca lleva un número de teléfono (tampoco con guiones o espacios: 9999-8888, +504 9999 8888)
const sinNumeros_ = (t) => String(t || '').replace(/\+?\d(?:[\s-]?\d){6,}/g, '…');
/* Qué pasó con un SMS según lo que respondió Notifícame. Si no salió por el límite de Notifícame ("espera")
   o por la llave ("parar"), vuelve a quedar Pendiente. Enviado solo si la respuesta lo confirma: según el SDK
   de Notifícame, un envío responde con message_id y status (PENDING, PROCESSING, READY, SENT…, o ERROR). */
const SMS_EN_CAMINO = /^(WAITING_UPLOAD|PENDING|PROCESSING|READY|SENT|UNREAD|READ|REPLIED|FORWARDED|DELIVERED|QUEUED|ACCEPTED|SCHEDULED|SUCCESS|OK|ENVIADO)$/i;
function clasificarSms_(x) {
  const d = x.datos;
  if (x.codigo === 429 || Number(d && d.code) === 42900) return { estado: 'Pendiente', detalle: errorNotificame_(x), espera: true };
  if (x.codigo === 401 || x.codigo === 403) return { estado: 'Pendiente', detalle: errorNotificame_(x), parar: true };
  if (x.codigo >= 200 && x.codigo < 300) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { estado: 'Dudoso', detalle: 'Notifícame respondió ' + x.codigo + ' sin datos: no se sabe si salió' };
    const st = String(d.status || '').trim();
    const malo = (typeof d.error === 'string' && d.error) || (d.error && typeof d.error === 'object') || (Array.isArray(d.errors) && d.errors.length)
      || d.success === false || d.ok === false || /^(ERROR|FAIL|FAILED|FAILURE|REJECTED|INVALID|DENIED)/i.test(st) || Number(d.code) >= 40000
      || (Number(d.error_count) > 0 && Number(d.error_count) >= (Number(d.total_recipients) || 1));
    if (malo) return { estado: 'Error', detalle: motivoEnvio_(d) };
    const id = idMensaje_(d);
    const bueno = id || SMS_EN_CAMINO.test(st) || d.success === true || d.ok === true || Number(d.sent_count) > 0 || Number(d.sms_sent) > 0;
    return bueno ? { estado: 'Enviado', detalle: id || st || 'Aceptado' }
      : { estado: 'Dudoso', detalle: 'Notifícame respondió ' + x.codigo + ' sin confirmar el envío: no se sabe si salió' };
  }
  if (x.codigo === 408 || x.codigo >= 500) return { estado: 'Dudoso', detalle: errorNotificame_(x) + ' (no se sabe si salió)' };
  return { estado: 'Error', detalle: errorNotificame_(x) };
}
/* Errores de UrlFetchApp que pasan antes de que salga cualquier pedido (Google no llega a Notifícame o se
   acabó su cuota del día): ese grupo no salió y vuelve a Pendiente. Un corte a medio camino (Timeout u otro)
   queda en duda. */
const NO_SALIO_SMS = /Address unavailable|DNS error|unknown host|SSL|certificate|Invalid argument|Service invoked too many times|Bandwidth quota|quota exceeded/i;
/* El mismo id para el mismo aviso al mismo número: si Notifícame no acepta ids repetidos, no se duplica */
const idSms_ = (idFalla, tipo, num) => 'AL-' + idFalla_(idFalla) + '-' + (tipo === 'FALLA' ? 'F' : 'R') + '-' + num;

/* Números de control: celulares del equipo que reciben cada mensaje para confirmar que llegó. Los guarda la
   cuenta dueña (menú Alertas > 5. Números de control) en Propiedades del script; nunca llegan a la página.
   Cada uno recibe una vez por falla cada mensaje aprobado que se mande: en la
   pestaña Envíos SMS sus filas llevan en "Control" la huella del mensaje. Van al principio del envío. */
function celularHn_(t) {
  const d = String(t || '').replace(/\D+/g, '');
  return /^[3789]\d{7}$/.test(d) ? '504' + d : /^504[3789]\d{7}$/.test(d) ? d : '';
}
function numerosControlSms_() {
  let l = [];
  try { l = JSON.parse(props_().getProperty('SMS_CONTROL') || '[]'); } catch (e) { l = []; }
  return (Array.isArray(l) ? l : []).map(celularHn_).filter((x, i, a) => x && a.indexOf(x) === i);
}
/* Huella del mensaje (FNV-1a de 32 bits, igual que U.hashSms en la página): con una M adelante para que la hoja la guarde como texto */
function hashSms_(t) {
  let h = 0x811c9dc5;
  const s = String(t || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'M' + ('0000000' + h.toString(16)).slice(-8);
}

/* Todo lo que cambia la pestaña Envíos SMS o el envío en curso va con el candado del script */
function conCandadoSms_(fn, intentos) {
  const lock = LockService.getScriptLock();
  let tomado = false;
  for (let i = 0; i < (intentos || 1) && !tomado; i++) tomado = lock.tryLock(30000);
  if (!tomado) throw fallo_('OCUPADO', 'Hay otro cambio guardándose en este momento. Intenta de nuevo en unos segundos.');
  try { return fn(); } finally {
    try { SpreadsheetApp.flush(); } catch (e) { console.error('flush: ' + (e && e.message)); }   // lo escrito queda en la hoja antes de soltar el candado
    lock.releaseLock();
  }
}
/* El envío en curso de cada falla vive en Propiedades del script (no se pierde como la caché) */
const claveEnvioSms_ = (idFalla) => 'SMS_ENVIO:' + idFalla_(idFalla);
function envioSmsDe_(idFalla) { try { return JSON.parse(props_().getProperty(claveEnvioSms_(idFalla)) || 'null'); } catch (e) { return null; } }
function guardarEnvioSms_(m) { props_().setProperty(claveEnvioSms_(m.falla), JSON.stringify(m)); }
const avanceSms_ = (m) => ({ envio: m.envio, pasos: m.pasos, siguiente: m.siguiente, total: m.total, enviados: m.enviados, errores: m.errores, dudosos: m.dudosos,
  error: sinNumeros_(m.error), control: m.ctrl || 0, cEnviados: m.cEnv || 0, cErrores: m.cErr || 0, cDudosos: m.cDud || 0 });
// Lo ya resuelto (enviado, error o en duda), clientes y números de control
const hechosSms_ = (m) => m.enviados + m.errores + m.dudosos + (m.cEnv || 0) + (m.cErr || 0) + (m.cDud || 0);

/* Límite diario: cada SMS es una llamada de Google a otro servicio (20 mil al día con una cuenta de Gmail) */
function cuotaSms_() {
  const hoy = Utilities.formatDate(new Date(), ALERTAS.ZONA, 'yyyy-MM-dd');
  let c = null;
  try { c = JSON.parse(props_().getProperty('SMS_CUOTA') || 'null'); } catch (e) { c = null; }
  const usados = c && c.dia === hoy ? Number(c.usados) || 0 : 0;
  return { dia: hoy, usados: usados, quedan: Math.max(0, ALERTAS.SMS_POR_DIA - usados) };
}
function gastarCuotaSms_(n) { const c = cuotaSms_(); props_().setProperty('SMS_CUOTA', JSON.stringify({ dia: c.dia, usados: Math.max(0, c.usados + n) })); }

function hojaEnviosSms_() {
  const h = hojaEn_(libro_(), ALERTAS.HOJAS.envios, COL_ENVIOS);
  if (h.getMaxColumns() < COL_ENVIOS.length) h.insertColumnsAfter(h.getMaxColumns(), COL_ENVIOS.length - h.getMaxColumns());
  if (String(h.getRange(1, COL_ENVIOS.length).getValue()) !== 'Control') h.getRange(1, COL_ENVIOS.length).setValue('Control').setFontWeight('bold');
  return h;
}
/* Las filas de un envío van juntas (se agregan de una vez): basta la primera */
function inicioBloqueSms_(h, envio) {
  const ult = h.getLastRow();
  if (ult < 2 || !envio) return 0;
  const r = h.getRange(2, 8, ult - 1, 1).createTextFinder(envio).matchEntireCell(true).findNext();
  if (!r) return 0;
  const fila = r.getRow();
  if (fila <= 2 || String(h.getRange(fila - 1, 8).getValue()) !== envio) return fila;
  // Por si la búsqueda no devolvió la primera: se busca en la columna completa
  const col = h.getRange(2, 8, ult - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]) === envio) return i + 2;
  return fila;
}
/* Anota lo que pasó con el grupo que se estaba mandando (m.vuelo) y lo suma al envío (dentro del candado).
   resultados: [[estado, detalle]] en el orden del grupo; null si no se sabe (quedan en duda, no se reenvían).
   Lo que vuelve a Pendiente (límite o llave de Notifícame) se toma otra vez en el próximo grupo. */
function cerrarVueloSms_(h, r0, m, resultados) {
  const v = m.vuelo, cuenta = { Enviado: 0, Error: 0, Dudoso: 0 };
  const sinSaber = ['Dudoso', 'Se cortó mientras se mandaba: no se sabe si salió'];
  let lista = v.filas.map((fila, k) => (resultados ? resultados[k] : sinSaber));
  if (r0 && v.filas.length) {
    const a = v.filas[0], b = v.filas[v.filas.length - 1];
    const rango = h.getRange(r0 + a, 6, b - a + 1, 2), tramo = rango.getValues();
    // Una fila que ya no dice "Enviando" ya tiene su resultado (se anotó y no se alcanzó a guardar el envío): se respeta
    lista = v.filas.map((fila, k) => (tramo[fila - a][0] !== 'Enviando' ? [String(tramo[fila - a][0]), tramo[fila - a][1]] : lista[k]));
    v.filas.forEach((fila, k) => { tramo[fila - a] = [lista[k][0], String(lista[k][1] || '').slice(0, 200)]; });
    rango.setValues(tramo);
  }
  const cuentaC = { Enviado: 0, Error: 0, Dudoso: 0 };
  lista.forEach((x, k) => { const c = v.filas[k] < (m.ctrl || 0) ? cuentaC : cuenta; if (c[x[0]] != null) c[x[0]]++; });
  m.enviados += cuenta.Enviado; m.errores += cuenta.Error; m.dudosos += cuenta.Dudoso;
  m.cEnv = (m.cEnv || 0) + cuentaC.Enviado; m.cErr = (m.cErr || 0) + cuentaC.Error; m.cDud = (m.cDud || 0) + cuentaC.Dudoso;
  m.siguiente = Math.min(m.total, hechosSms_(m));
  const malo = lista.filter((x) => x[0] === 'Error')[0];
  if (malo && !m.error) m.error = String(malo[1] || '');
  m.pasos = v.paso + 1; m.vuelo = null; m.renovado = Date.now();
}
/* Si hay un grupo en vuelo: se anota si ya terminó (o si se cortó hace rato). false = se está mandando ahora. */
function resolverVueloSms_(h, r0, m) {
  if (!m.vuelo) return true;
  if (!m.vuelo.res && Date.now() - m.vuelo.en < VUELO_SMS_MS) return false;
  cerrarVueloSms_(h, r0, m, m.vuelo.res || null);
  return true;
}
/* Un grupo que terminó después de que su envío se cerró: se anota lo que se sabe. Lo que no salió
   queda Cancelado (disponible para el próximo envío), nunca otra vez Pendiente en un envío cerrado. */
function anotarTardeSms_(h, r0, filas, resultados) {
  if (!r0 || !filas.length) return;
  const a = filas[0], b = filas[filas.length - 1];
  const rango = h.getRange(r0 + a, 6, b - a + 1, 2), tramo = rango.getValues();
  filas.forEach((fila, k) => {
    const actual = tramo[fila - a][0];
    if (actual !== 'Enviando' && actual !== 'Dudoso') return;
    tramo[fila - a] = [resultados[k][0] === 'Pendiente' ? 'Cancelado' : resultados[k][0], String(resultados[k][1] || '').slice(0, 200)];
  });
  rango.setValues(tramo);
}

/* El último estado de cada número de esta falla, por tipo de aviso: el de los clientes y, aparte, el de los
   números de control por huella de mensaje ({ clientes: { FALLA: { tel: estado } }, control: { FALLA: { huella: { tel: estado } } } }) */
function estadosSms_(idFalla) {
  const out = { clientes: {}, control: {} };
  Object.keys(TIPOS_SMS).forEach((t) => { out.clientes[t] = {}; out.control[t] = {}; });
  const h = libro_().getSheetByName(ALERTAS.HOJAS.envios);
  if (!h || h.getLastRow() < 2) return out;
  const id = idFalla_(idFalla), nc = Math.min(8, Math.max(4, h.getLastColumn() - 2)), ult = h.getLastRow();
  // En la pestaña hay 40 días de envíos de todas las fallas: se leen solo las filas de esta (vienen en bloques,
  // uno por envío). Si no se pueden ubicar, se lee todo como antes.
  let filas = null;
  const partes = /^F(\d{6})(\d+)$/.exec(id);
  if (partes) {
    try {
      const rs = h.getRange(2, 3, ult - 1, 1).createTextFinder('^F-?' + partes[1] + '-?' + partes[2] + '$').useRegularExpression(true)
        .matchEntireCell(true).findAll().map((r) => r.getRow()).sort((a, b) => a - b);
      const ts = tramos_(rs);
      if (ts.length <= 100) { filas = []; ts.forEach((t) => { filas = filas.concat(h.getRange(t[0], 3, t[1] - t[0] + 1, nc).getValues()); }); }
    } catch (err) { filas = null; }
  }
  (filas || h.getRange(2, 3, ult - 1, nc).getValues()).forEach((x) => {   // ID de Alertas, Tipo, Teléfono, Estado, … Control
    if (!Object.prototype.hasOwnProperty.call(TIPOS_SMS, x[1]) || idFalla_(x[0]) !== id) return;
    const c = String(x[7] == null ? '' : x[7]);
    if (!c) out.clientes[x[1]][String(x[2])] = String(x[3]);
    else (out.control[x[1]][c] || (out.control[x[1]][c] = {}))[String(x[2])] = String(x[3]);
  });
  return out;
}
function fallaSms_(id) {
  // Primero entre las recientes (en caché: las activas siempre están ahí); si no, en la pestaña Fallas
  const de = (lista) => lista.filter((x) => x.id === String(id || '') || idFalla_(x.id) === idFalla_(id))[0];
  const f = de(fallasRecientes_()) || de(leerFallas_());
  if (!f) throw fallo_('DATOS', 'No encontré la falla ' + idFalla_(id) + '.');
  return f;
}
function celularesDeFalla_(f) {
  const nodos = {};
  f.nodos.forEach((n) => { nodos[n] = true; });
  return celularesDe_(nodos);
}
const tipoSmsDe_ = (f) => (f.estado === 'ACTIVA' ? 'FALLA' : 'RESTABLECIDO');
/* Queda en la falla y en su historial (dentro del candado) */
function registrarSmsEnFalla_(m, nota) {
  const h = hoja_(ALERTAS.HOJAS.fallas);
  const f = leerFallas_(h).filter((x) => x.id === m.falla)[0];
  if (!f) return null;
  let hr = null;
  try { hr = hojaReporteSms_(); } catch (e) { console.error('No se pudo abrir el Reporte SMS: ' + (e && e.message)); }   // la primera vez, con los envíos de antes
  const ahora = Date.now();
  f.sms = (f.sms || []).concat([{ tipo: m.tipo, enviados: m.enviados, errores: m.errores, dudosos: m.dudosos, total: m.total - (m.ctrl || 0),
    control: m.cEnv || 0, por: m.n, en: ahora }]).slice(-20);
  const extra = [m.errores ? m.errores + ' con error' : '', m.dudosos ? m.dudosos + ' en duda' : ''].filter(String);
  const c = m.cEnv || 0, ctrl = m.ctrl ? ' y a ' + (c === m.ctrl ? c : c + ' de ' + m.ctrl) + (m.ctrl === 1 ? ' número' : ' números') + ' de control' : '';
  f.historial.push({ accion: 'SMS', en: ahora, por: { u: m.u, nombre: m.n },
    detalle: TIPOS_SMS[m.tipo] + ' a ' + m.enviados + (m.enviados === 1 ? ' cliente' : ' clientes') + (extra.length ? ' (' + extra.join(', ') + ')' : '') + ctrl + (nota ? '; ' + nota : '') });
  columnaNumeroFallas_(h);
  const fila = fallaAFila_(f);
  h.getRange(f._fila, 1, 1, fila.length).setValues([fila]);
  cache_().remove('fallasRecientes');
  try {
    if (hr) hr.appendRow(filaReporteSms_(f, { en: m.en, fin: ahora, tipo: m.tipo, clave: m.aprobado || claveSmsDe_(m.mensaje), texto: m.mensaje, n: m.n,
      total: m.total - (m.ctrl || 0), enviados: m.enviados, errores: m.errores, dudosos: m.dudosos, control: m.cEnv || 0, envio: m.envio }));
  } catch (e) { console.error('No se pudo anotar el envío en el Reporte SMS: ' + (e && e.message)); }
  return sinFila_(f);
}

/* ----- Reporte de SMS (Notifícame) -----
   Hoja "Reporte SMS" de la base interna: un envío por fila, para siempre y sin teléfonos. Cuándo empezó y terminó,
   la falla (número, motivo y nodos), si fue aviso de falla, el mensaje aprobado y su texto, quién lo mandó, a
   cuántos clientes se apartó, cuántos salieron, con error, en duda o sin enviar, los números de control y las
   partes de SMS (un mensaje de más de 160 caracteres son 2 partes por número). */
const claveSmsDe_ = (texto) => Object.keys(SMS_APROBADOS).filter((k) => SMS_APROBADOS[k].texto === texto)[0] || '';
const GSM7_ = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT_ = '^{}\\[~]|€';
/* Partes de un SMS, como las cuenta la página (U.partesSms): GSM-7 de 160 (153 si son varias); si no, UCS-2 de 70 (67) */
function partesSms_(texto) {
  let n = 0, gsm = true;
  for (const ch of String(texto || '')) {
    if (GSM7_.indexOf(ch) >= 0) n++; else if (GSM7_EXT_.indexOf(ch) >= 0) n += 2; else { gsm = false; break; }
  }
  if (gsm) return n <= 160 ? 1 : Math.ceil(n / 153);
  const u = String(texto).length;
  return u <= 70 ? 1 : Math.ceil(u / 67);
}
function filaReporteSms_(f, x) {
  const ap = x.clave ? SMS_APROBADOS[x.clave] : null, partes = x.texto ? partesSms_(x.texto) : 0;
  const clientes = x.total || 0, env = x.enviados || 0, err = x.errores || 0, dud = x.dudosos || 0, ctrl = x.control || 0;
  return [new Date(x.en), x.fin ? new Date(x.fin) : '', nombreFalla_(f), f.id, nombreMotivo_(f) || '', f.nodos.slice(0, 40).join(', ') + (f.nodos.length > 40 ? ', …' : ''),
    TIPOS_SMS[x.tipo] || String(x.tipo || ''), ap ? ap.nombre : x.texto ? 'Otro mensaje' : 'Sin dato (envío de antes de la 3.4)', x.texto || '', x.n || '',
    clientes, env, err, dud, Math.max(0, clientes - env - err - dud), ctrl, partes || '', partes ? partes * (env + ctrl) : '', x.envio || ''];
}
/* La hoja del reporte; la primera vez se arma con los envíos que ya quedaron anotados en cada falla (el mensaje
   se reconoce por la huella de los números de control en Envíos SMS, que guarda 40 días). Se llama con el
   candado de los SMS, así nunca se arma dos veces. */
function hojaReporteSms_() {
  const libro = libro_();
  let h = libro.getSheetByName(ALERTAS.HOJAS.reporteSms);
  if (h) return h;
  const previas = reporteSmsAnterior_();
  h = hojaEn_(libro, ALERTAS.HOJAS.reporteSms, COL_REPORTE_SMS);
  h.getRange(2, 1, Math.max(1, h.getMaxRows() - 1), 2).setNumberFormat('dd/mm/yyyy hh:mm');
  if (previas.length) h.getRange(2, 1, previas.length, COL_REPORTE_SMS.length).setValues(previas);
  return h;
}
function reporteSmsAnterior_() {
  const porEnvio = {};
  const he = libro_().getSheetByName(ALERTAS.HOJAS.envios);
  if (he && he.getLastRow() >= 2) {
    he.getRange(2, 1, he.getLastRow() - 1, Math.min(COL_ENVIOS.length, he.getMaxColumns())).getValues().forEach((r) => {
      const e = String(r[7] || '');
      if (!e) return;
      const x = porEnvio[e] || (porEnvio[e] = { envio: e, id: String(r[2] || ''), en: fechaMs_(r[0]) || 0, por: String(r[8] || ''), huella: '' });
      if (r[9]) x.huella = String(r[9]);
    });
  }
  const deHuella = {};
  Object.keys(SMS_APROBADOS).forEach((k) => { deHuella[hashSms_(SMS_APROBADOS[k].texto)] = k; });
  const envios = Object.keys(porEnvio).map((k) => porEnvio[k]);
  const filas = [];
  leerFallas_().forEach((f) => (f.sms || []).forEach((sm) => {
    // El envío de esa falla y de esa persona que empezó antes de anotarse (el más cercano)
    const e = envios.filter((x) => (x.id === f.id || idFalla_(x.id) === idFalla_(f.id)) && x.por === sm.por && x.en <= sm.en).sort((a, b) => b.en - a.en)[0];
    const clave = e && e.huella ? deHuella[e.huella] || '' : '';
    filas.push(filaReporteSms_(f, { en: e ? e.en : sm.en, fin: sm.en, tipo: sm.tipo, clave: clave, texto: clave ? SMS_APROBADOS[clave].texto : '', n: sm.por,
      total: sm.total, enviados: sm.enviados, errores: sm.errores, dudosos: sm.dudosos, control: sm.control, envio: e ? e.envio : '' }));
  }));
  return filas.sort((a, b) => a[0] - b[0]);
}
/* El reporte para la página (Workforce y Jefatura): los envíos desde una fecha, del más nuevo al más viejo */
function smsReporte_(d) {
  if (!libro_().getSheetByName(ALERTAS.HOJAS.reporteSms)) conCandadoSms_(() => hojaReporteSms_(), 2);
  const h = libro_().getSheetByName(ALERTAS.HOJAS.reporteSms);
  const desde = Math.max(0, Number(d.desde) || 0);
  const filas = h.getLastRow() >= 2 ? h.getRange(2, 1, h.getLastRow() - 1, COL_REPORTE_SMS.length).getValues() : [];
  const envios = filas.filter((r) => r[0] && fechaMs_(r[0]) >= desde).map((r) => ({
    en: fechaMs_(r[0]), fin: r[1] ? fechaMs_(r[1]) : null, falla: String(r[2]), id: String(r[3]), motivo: String(r[4]), nodos: String(r[5]), aviso: String(r[6]),
    mensaje: String(r[7]), texto: String(r[8]), por: String(r[9]), clientes: Number(r[10]) || 0, enviados: Number(r[11]) || 0, errores: Number(r[12]) || 0,
    dudosos: Number(r[13]) || 0, sinEnviar: Number(r[14]) || 0, control: Number(r[15]) || 0, partes: Number(r[16]) || 0, sms: Number(r[17]) || 0, envio: String(r[18] || '')
  })).sort((a, b) => b.en - a.en);
  return { envios: envios, desde: desde, ahora: Date.now() };
}
/* Cierra un envío (dentro del candado): lo apartado sin mandar queda Cancelado (disponible para el próximo),
   lo que se estaba mandando cuando se cortó queda Dudoso, y se anota en la falla */
function cerrarEnvioSms_(m, nota) {
  const h = libro_().getSheetByName(ALERTAS.HOJAS.envios);
  const r0 = h && m.total ? inicioBloqueSms_(h, m.envio) : 0;
  if (m.vuelo) cerrarVueloSms_(h, r0, m, m.vuelo.res || null);
  if (r0) {
    const rango = h.getRange(r0, 6, m.total, 1), est = rango.getValues();
    let cancelados = 0, cambia = false;
    est.forEach((x, i) => {
      if (x[0] === 'Pendiente') { x[0] = 'Cancelado'; cancelados++; cambia = true; }
      else if (x[0] === 'Enviando') { x[0] = 'Dudoso'; if (i < (m.ctrl || 0)) m.cDud = (m.cDud || 0) + 1; else m.dudosos++; cambia = true; }
    });
    if (cambia) rango.setValues(est);
    // lo apartado que no se mandó vuelve al límite de hoy (si el envío es de hoy)
    if (cancelados && Utilities.formatDate(new Date(m.en), ALERTAS.ZONA, 'yyyy-MM-dd') === cuotaSms_().dia) gastarCuotaSms_(-cancelados);
  }
  let falla = null;
  try { falla = hechosSms_(m) ? registrarSmsEnFalla_(m, nota) : null; } catch (e) {
    console.error('No se pudo anotar el envío de SMS en la falla ' + idFalla_(m.falla) + ': ' + (e && e.message));
  }
  props_().deleteProperty(claveEnvioSms_(m.falla));
  return falla;
}

function accionSms_(d, ses) {
  const op = String(d.op || '');
  if (op === 'resumen') return smsResumen_(d, ses);
  if (op === 'iniciar') return smsIniciar_(d, ses);
  if (op === 'reporte') return smsReporte_(d);
  if (op === 'lote') return smsLote_(d, ses);
  if (op === 'terminar') return smsTerminar_(d, ses);
  throw fallo_('DATOS', 'Operación no válida.');
}
/* Cuántos clientes de la falla tienen celular y en qué va el aviso (sin números) */
function smsResumen_(d, ses) {
  const f = fallaSms_(d.id), tipo = tipoSmsDe_(f);
  const cel = celularesDeFalla_(f);
  const ests = estadosSms_(f.id), est = ests.clientes[tipo];
  // Números de control que no son clientes de la falla (esos ya lo reciben como clientes) y, por mensaje, cuántos ya lo tienen
  const ctrl = numerosControlSms_().filter((x) => cel.numeros.indexOf(x) < 0), hechos = {};
  Object.keys(ests.control[tipo]).forEach((hm) => { hechos[hm] = ctrl.filter((x) => SMS_NO_REPETIR[ests.control[tipo][hm][x]]).length; });
  let ya = 0, enDuda = 0;
  cel.numeros.forEach((x) => { if (est[x] === 'Enviado') ya++; else if (est[x] === 'Enviando' || est[x] === 'Dudoso') enDuda++; });
  const m = envioSmsDe_(f.id);
  const noPuede = sinSmsPara_(f);
  return {
    configurado: !!notificameCfg_(), tipo: tipo, puede: !noPuede, noPuede: noPuede,
    mensajes: mensajesAprobados_(), mensajeMotivo: SMS_APROBADOS[f.motivo] ? f.motivo : '',
    clientes: cel.clientes, celulares: cel.numeros.length, conCelular: cel.conCelular, soloFijo: cel.soloFijo, sinTelefono: cel.sinTelefono,
    ya: ya, enDuda: enDuda, faltan: cel.numeros.length - ya - enDuda, quedanHoy: cuotaSms_().quedan, envios: f.sms || [],
    control: ctrl.length, controlHechos: hechos,
    enCurso: m ? { por: m.n, mio: m.u === ses.u, tipo: m.tipo, mensaje: m.u === ses.u ? m.mensaje : '', total: m.total, siguiente: m.siguiente,
      enviados: m.enviados, control: m.ctrl || 0, cHechos: (m.cEnv || 0) + (m.cErr || 0) + (m.cDud || 0),
      libre: Date.now() - m.renovado > ENVIO_SMS_VIEJO_MS } : null
  };
}
/* Aparta a quienes les falta el aviso: quedan "Pendiente" en Envíos SMS antes de mandar nada */
function smsIniciar_(d, ses) {
  if (!notificameCfg_()) throw fallo_('NOTIFICAME', 'Falta conectar Notifícame. En la base interna: Alertas > 4. Conectar Notifícame.');
  const f = fallaSms_(d.id), tipo = tipoSmsDe_(f);
  const noPuede = sinSmsPara_(f);
  if (noPuede) throw fallo_('DATOS', noPuede);
  if (d.tipo != null && String(d.tipo) !== tipo) throw fallo_('DATOS', 'La falla cambió: abre otra vez Enviar SMS.');
  // Solo un mensaje aprobado, tal cual: la página manda su clave, nunca el texto
  const aprobado = Object.prototype.hasOwnProperty.call(SMS_APROBADOS, String(d.aprobado || '')) ? SMS_APROBADOS[String(d.aprobado)] : null;
  if (!aprobado) throw fallo_('DATOS', 'Elige uno de los mensajes aprobados.');
  const mensaje = aprobado.texto;
  const conDuda = d.dudosos === true, huella = hashSms_(mensaje);
  const cel = celularesDeFalla_(f);                    // fuera del candado: lee la base (unos segundos)
  return conCandadoSms_(() => {
    const ahora = Date.now();
    let m = envioSmsDe_(f.id);
    if (m) {
      const libre = ahora - m.renovado > ENVIO_SMS_VIEJO_MS;
      if (m.u !== ses.u && !libre) throw fallo_('OCUPADO', m.n + ' está enviando SMS de esta falla en este momento.');
      if (m.u === ses.u && m.tipo === tipo && m.mensaje === mensaje && !libre && !conDuda) {
        m.renovado = ahora;                             // la misma persona vuelve (recargó la página): sigue el mismo envío
        guardarEnvioSms_(m);
        return Object.assign(avanceSms_(m), { reanudado: true });
      }
      const h0 = hojaEnviosSms_();
      if (!resolverVueloSms_(h0, inicioBloqueSms_(h0, m.envio), m)) throw fallo_('OCUPADO', 'Todavía se está mandando un grupo del envío anterior. Intenta de nuevo en unos segundos.');
      cerrarEnvioSms_(m, 'se detuvo antes de terminar');
    }
    const ests = estadosSms_(f.id), est = ests.clientes[tipo], estC = ests.control[tipo][huella] || {};
    let ya = 0, enDuda = 0;
    const pendientes = cel.numeros.filter((x) => {
      if (est[x] === 'Enviado') ya++; else if (est[x] === 'Enviando' || est[x] === 'Dudoso') enDuda++;
      return !SMS_NO_REPETIR[est[x]] || (conDuda && est[x] === 'Dudoso');   // los en duda, solo si se pide a propósito
    });
    // Números de control que todavía no recibieron este mensaje (y que no son clientes de la falla)
    const ctrl = numerosControlSms_().filter((x) => cel.numeros.indexOf(x) < 0 && !SMS_NO_REPETIR[estC[x]]);
    const cuota = cuotaSms_(), lista = pendientes.slice(0, Math.max(0, cuota.quedan - ctrl.length));
    const extra = { ya: ya, enDuda: enDuda, quedanHoy: cuota.quedan, paraManana: pendientes.length - lista.length };
    // Sin clientes a quienes mandar, no sale nada (tampoco a los de control)
    if (!lista.length) return Object.assign({ envio: '', pasos: 0, siguiente: 0, total: 0, enviados: 0, errores: 0, dudosos: 0, error: '', control: 0 }, extra);
    const envio = 'S' + ahora.toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase();
    const fecha = new Date(ahora), nombre = nombreFalla_(f);
    m = { envio: envio, falla: f.id, u: ses.u, n: ses.n, tipo: tipo, mensaje: mensaje, aprobado: String(d.aprobado), total: ctrl.length + lista.length, siguiente: 0, pasos: 0, cursor: 0,
      lote: ALERTAS.SMS_LOTE, problemas: 0, rechazos: 0, enviados: 0, errores: 0, dudosos: 0, error: '', en: ahora, renovado: ahora, vuelo: null,
      ctrl: ctrl.length, cEnv: 0, cErr: 0, cDud: 0 };
    // Primero el envío en curso y después las filas: si algo falla a medias, no quedan filas apartadas sin dueño
    guardarEnvioSms_(m);
    const filas = ctrl.map((x) => [fecha, nombre, f.id, tipo, x, 'Pendiente', '', envio, ses.n, huella])   // los de control, primero
      .concat(lista.map((x) => [fecha, nombre, f.id, tipo, x, 'Pendiente', '', envio, ses.n, '']));
    try { agregarFilas_(hojaEnviosSms_(), filas, [5, 10]); } catch (e) {
      try { props_().deleteProperty(claveEnvioSms_(f.id)); } catch (e2) { /* el mantenimiento lo cierra */ }
      throw e;
    }
    gastarCuotaSms_(filas.length);
    return Object.assign(avanceSms_(m), extra);
  });
}
/* Un grupo (hasta 50; menos si Notifícame pide ir más despacio):
     1) con candado se toman los siguientes Pendiente y se marcan "Enviando";
     2) sin candado se mandan en paralelo;
     3) con candado se anota qué pasó con cada uno.
   Si se corta entre 1 y 3, esos quedan en duda y no se reenvían. Si la página repite un grupo que ya se
   hizo (se cortó la respuesta), "paso" no coincide y no se manda otra vez. */
function smsLote_(d, ses) {
  const cfg = notificameCfg_();
  if (!cfg) throw fallo_('NOTIFICAME', 'Falta conectar Notifícame. En la base interna: Alertas > 4. Conectar Notifícame.');
  const id = String(d.id || ''), envio = String(d.envio || ''), paso = Math.max(0, Math.floor(Number(d.paso)) || 0);
  const fr = fallasRecientes_().filter((x) => x.id === id || idFalla_(x.id) === idFalla_(id))[0];   // fuera del candado
  const prep = conCandadoSms_(() => {
    const m = envioSmsDe_(id);
    if (!m || m.envio !== envio) throw fallo_('DATOS', 'Este envío ya terminó o lo reemplazó otro. Abre otra vez Enviar SMS: solo se manda a quienes falten.');
    if (m.u !== ses.u) throw fallo_('PERMISO', 'Este envío lo empezó ' + m.n + '.');
    const h = hojaEnviosSms_(), r0 = inicioBloqueSms_(h, m.envio);
    if (!r0) throw fallo_('DATOS', 'No encontré el envío en la pestaña Envíos SMS.');
    if (m.vuelo) {
      if (!resolverVueloSms_(h, r0, m)) throw fallo_('OCUPADO', 'Todavía se está mandando un grupo. Un momento.');
      guardarEnvioSms_(m);
    }
    if (paso !== m.pasos || m.siguiente >= m.total) return { listo: avanceSms_(m) };
    // Si la falla cambió mientras se enviaba (se cerró, se reabrió o se descartó), ese aviso ya no corresponde
    const cambio = !fr ? 'La falla ya no está entre las recientes' : tipoSmsDe_(fr) !== m.tipo ? (m.tipo === 'FALLA' ? 'La falla se cerró' : 'La falla se reabrió')
      : m.tipo === 'RESTABLECIDO' && descartada_(fr) ? 'La falla se descartó' : '';
    if (cambio) throw fallo_('DATOS', cambio + ' mientras se enviaba: se detuvo para no mandar un aviso que ya no corresponde. Lo enviado quedó anotado.');
    const desde = Math.min(m.cursor || 0, m.total);
    if (desde >= m.total) { m.siguiente = m.total; guardarEnvioSms_(m); return { listo: avanceSms_(m) }; }
    const filas = h.getRange(r0 + desde, 5, m.total - desde, 3).getValues();   // Teléfono, Estado, Detalle
    const elegidos = [];
    for (let i = 0; i < filas.length && elegidos.length < (m.lote || ALERTAS.SMS_LOTE); i++) if (filas[i][1] === 'Pendiente') elegidos.push(i);
    if (!elegidos.length) { m.cursor = m.total; m.siguiente = m.total; guardarEnvioSms_(m); return { listo: avanceSms_(m) }; }
    const a = elegidos[0], b = elegidos[elegidos.length - 1];
    const tramo = filas.slice(a, b + 1).map((x) => [x[1], x[2]]);
    elegidos.forEach((i) => { tramo[i - a] = ['Enviando', '']; });
    const ahora = Date.now();
    m.cursor = desde + a;
    m.vuelo = { paso: m.pasos, filas: elegidos.map((i) => desde + i), en: ahora };
    m.renovado = ahora;
    // Primero se guarda el grupo en vuelo y después se marcan las filas: si algo falla a medias, nada queda trabado
    guardarEnvioSms_(m);
    try { h.getRange(r0 + desde + a, 6, b - a + 1, 2).setValues(tramo); } catch (e) {
      try { m.vuelo = null; guardarEnvioSms_(m); } catch (e2) { /* se resuelve como grupo cortado */ }
      throw e;
    }
    return { m: m, nums: elegidos.map((i) => String(filas[i][0])) };
  });
  if (prep.listo) return prep.listo;
  const m = prep.m, nums = prep.nums;
  let xs = null, noSalio = '';
  try {
    xs = UrlFetchApp.fetchAll(nums.map((t) => pedidoNotificame_(cfg, 'post', 'messages/send_to_contact',
      { msisdn: t, message: m.mensaje, id: idSms_(m.falla, m.tipo, t) }))).map(respuestaNotificame_);
  } catch (err) {
    const txt = sinNumeros_(String(err && err.message || err)).slice(0, 200);
    console.error('Notifícame no respondió a un grupo de ' + nums.length + ' SMS: ' + txt);
    if (NO_SALIO_SMS.test(txt)) noSalio = /too many times|quota/i.test(txt)
      ? 'Se acabó por hoy la cuota de Google para conectarse con otros servicios. Sigue mañana con Seguir enviando; no se le repite a nadie.'
      : 'Google no pudo conectarse con Notifícame (' + txt.replace(/:\s*https?:\/\/\S+/g, '').slice(0, 80) + '). No salió ninguno de este grupo; intenta más tarde (no se le repite a nadie).';
  }
  // Si la conexión no llegó a salir, el grupo vuelve a Pendiente; si se cortó a medio camino, queda en duda
  const res = nums.map((t, k) => (xs ? clasificarSms_(xs[k]) : noSalio ? { estado: 'Pendiente', detalle: '', parar: true }
    : { estado: 'Dudoso', detalle: 'Notifícame no respondió: no se sabe si salió' }));
  const resultados = res.map((r) => [r.estado, String(r.detalle || '').slice(0, 200)]);
  const caida = !xs && !noSalio, esperas = res.some((r) => r.espera), parar = res.filter((r) => r.parar)[0];
  const todosError = res.length >= 5 && res.every((r) => r.estado === 'Error');
  let fin;
  try {
    fin = conCandadoSms_(() => {
      const m2 = envioSmsDe_(id), h = hojaEnviosSms_(), r0 = inicioBloqueSms_(h, m.envio);
      const mismo = !!m2 && m2.envio === m.envio;
      if (!mismo || !m2.vuelo || m2.vuelo.en !== m.vuelo.en) {
        // El grupo tardó tanto que ya se dio por cortado (o el envío se cerró): solo se anota lo que se sabe
        if (!mismo) anotarTardeSms_(h, r0, m.vuelo.filas, resultados);
        return { av: avanceSms_(mismo ? m2 : m), tarde: true };
      }
      cerrarVueloSms_(h, r0, m2, resultados);
      if (caida || esperas) { m2.problemas = (m2.problemas || 0) + 1; m2.lote = Math.max(5, Math.floor(nums.length / 2)); }
      else { m2.problemas = 0; m2.lote = Math.min(ALERTAS.SMS_LOTE, (m2.lote || ALERTAS.SMS_LOTE) + 10); }
      m2.rechazos = todosError ? (m2.rechazos || 0) + 1 : 0;
      guardarEnvioSms_(m2);
      return { av: avanceSms_(m2), problemas: m2.problemas, rechazos: m2.rechazos, lote: m2.lote };
    }, 3);
  } catch (e) {
    if (!e || e.codigo !== 'OCUPADO') throw e;
    // Sin candado por mucho rato: lo que pasó queda guardado en el envío y se anota en cuanto se libere
    try {
      const m2 = envioSmsDe_(id);
      if (m2 && m2.envio === m.envio && m2.vuelo && m2.vuelo.en === m.vuelo.en) {
        m2.vuelo.res = resultados.map((x) => [x[0], String(x[1] || '').slice(0, 60)]);   // corto: una propiedad admite 9 KB
        guardarEnvioSms_(m2);
      }
    } catch (e2) { console.error('No se pudo guardar el resultado del grupo: ' + (e2 && e2.message)); }
    throw fallo_('OCUPADO', 'El grupo ya se mandó, pero el servidor está muy ocupado para anotarlo. Se anota en cuanto se libere; no se le repite a nadie.');
  }
  if (noSalio) throw fallo_('NOTIFICAME', noSalio);
  if (parar) throw fallo_('NOTIFICAME', sinNumeros_(parar.detalle));
  if (fin.tarde) return fin.av;
  if (fin.rechazos >= 2) throw fallo_('NOTIFICAME', 'Notifícame rechazó dos grupos completos (' + sinNumeros_(res[0].detalle) + '). Se detuvo para no seguir gastando: revisa la cuenta de Notifícame.');
  if (caida) {
    if (fin.problemas >= 3) throw fallo_('NOTIFICAME', 'Notifícame no respondió varias veces seguidas. Lo enviado quedó anotado; los que iban en camino quedaron en duda y no se les reenvía. Intenta más tarde con Seguir enviando.');
    return Object.assign(fin.av, { pausa: 10, aviso: 'Notifícame no respondió a un grupo de ' + nums.length + ': quedaron en duda y no se les reenvía. Se sigue en unos segundos.' });
  }
  if (esperas) {
    if (fin.problemas >= 6) throw fallo_('NOTIFICAME', 'Notifícame sigue pidiendo esperar. Lo enviado quedó anotado; toca Seguir enviando en unos minutos (no se le repite a nadie).');
    const seg = Math.min(30, 5 * fin.problemas);
    return Object.assign(fin.av, { pausa: seg, aviso: 'Notifícame pidió ir más despacio: se sigue en ' + seg + ' segundos, de ' + fin.lote + ' en ' + fin.lote + '.' });
  }
  return fin.av;
}
/* Al terminar (o al detenerlo): queda en la falla y se libera para otros */
function smsTerminar_(d, ses) {
  const id = String(d.id || ''), envio = String(d.envio || '');
  return conCandadoSms_(() => {
    const m = envioSmsDe_(id);
    if (!m || m.envio !== envio) return { terminado: true, falla: null };
    if (m.u !== ses.u) throw fallo_('PERMISO', 'Este envío lo empezó ' + m.n + '.');
    const h = hojaEnviosSms_();
    if (!resolverVueloSms_(h, inicioBloqueSms_(h, m.envio), m)) throw fallo_('OCUPADO', 'Todavía se está mandando un grupo. Un momento.');
    const falla = cerrarEnvioSms_(m, m.siguiente < m.total ? 'se detuvo antes de terminar' : '');
    return Object.assign(avanceSms_(m), { terminado: true, falla: falla });
  });
}
/* Mantenimiento: un envío que no avanza en 2 horas se cierra solo */
function cerrarEnviosSmsViejos_() {
  const p = props_().getProperties();
  Object.keys(p).filter((k) => k.indexOf('SMS_ENVIO:') === 0).forEach((k) => {
    let m = null;
    try { m = JSON.parse(p[k]); } catch (e) { m = null; }
    if (!m || !m.falla) { props_().deleteProperty(k); return; }
    if (Date.now() - m.renovado <= 2 * 3600000) return;
    try { cerrarEnvioSms_(m, 'se cortó y se cerró solo'); } catch (e) {
      console.error('No se pudo cerrar el envío de SMS ' + m.envio + ': ' + (e && e.message));
      try { props_().deleteProperty(k); } catch (e2) { /* se intenta en la próxima hora */ }
    }
  });
}
/* Mantenimiento: filas que quedaron Pendiente o Enviando sin un envío en curso (por ejemplo, si algo falló a
   medias) y tienen más de 2 horas: Pendiente pasa a Cancelado (entra en el próximo envío) y Enviando a Dudoso */
function limpiarHuerfanosSms_() {
  const h = libro_().getSheetByName(ALERTAS.HOJAS.envios);
  if (!h || h.getLastRow() < 2) return 0;
  const vivos = {}, p = props_().getProperties();
  Object.keys(p).filter((k) => k.indexOf('SMS_ENVIO:') === 0).forEach((k) => { try { vivos[JSON.parse(p[k]).envio] = true; } catch (e) { /* nada */ } });
  const n = h.getLastRow() - 1, corte = Date.now() - 2 * 3600000;
  const fechas = h.getRange(2, 1, n, 1).getValues(), est = h.getRange(2, 6, n, 1).getValues(), envs = h.getRange(2, 8, n, 1).getValues();
  let cambios = 0;
  for (let i = 0; i < n; i++) {
    const e = est[i][0];
    if ((e === 'Pendiente' || e === 'Enviando') && !vivos[String(envs[i][0])] && new Date(fechas[i][0]).getTime() < corte) {
      est[i][0] = e === 'Pendiente' ? 'Cancelado' : 'Dudoso';
      cambios++;
    }
  }
  if (cambios) h.getRange(2, 6, n, 1).setValues(est);
  return cambios;
}

/* Los celulares de los clientes de unos nodos: uno por cliente (su primer celular), sin repetir.
   nodos: { CODIGO: true }. Los fijos (empiezan con 2) no reciben SMS.
   Sale del índice de celulares por nodo; si todavía no está listo para esta base, se lee la base completa
   (tarda) y de paso se deja el índice armado para las próximas veces. */
function celularesDe_(nodos) {
  let porNodo = null;
  try { porNodo = leerIndiceCelulares_(nodos); } catch (err) { porNodo = null; }
  if (!porNodo) porNodo = armarIndiceCelulares_();
  // Un cliente (contrato) puede tener servicios en varios nodos: vale su primer celular en el orden de la base
  const porContrato = {};
  Object.keys(nodos).forEach((nodo) => {
    const m = porNodo[nodo];
    if (!m) return;
    Object.keys(m).forEach((c) => {
      const e = m[c], antes = porContrato[c];
      if (antes === undefined || (Array.isArray(e) && (!Array.isArray(antes) || e[0] < antes[0])) || (e === 'F' && antes === '')) porContrato[c] = e;
    });
  });
  const numeros = [], ya = {};
  let clientes = 0, conCelular = 0, soloFijo = 0, sinTelefono = 0;
  Object.keys(porContrato).forEach((c) => {
    clientes++;
    const e = porContrato[c];
    if (Array.isArray(e)) { conCelular++; if (!ya[e[1]]) { ya[e[1]] = true; numeros.push(e[1]); } }
    else if (e === 'F') soloFijo++;
    else sinTelefono++;
  });
  return { numeros: numeros, clientes: clientes, conCelular: conCelular, soloFijo: soloFijo, sinTelefono: sinTelefono };
}

/* ----- Índice de celulares por nodo (pestaña interna "Celulares", oculta y protegida) -----
   En la base, los servicios de un nodo vienen sueltos entre más de 160 mil filas: para sacar los celulares de
   una falla había que leer la base entera cada vez que se abría Enviar SMS (y otra vez al enviar). El índice
   guarda, por nodo, a cada cliente con su primer celular (y la fila de la base donde aparece, para elegir igual
   que antes si el cliente tiene servicios en varios nodos), "F" si solo tiene fijo o nada si no tiene teléfono.
   Una fila por nodo: NODO | PARTE | CLIENTES ("contrato|fila|celular", "contrato|F" o "contrato", separados por
   ";"); un nodo grande ocupa varias partes. En D1, la versión de la base con la que se armó: si la base cambia,
   el índice ya no vale y se arma de nuevo (al terminar la carga lo pide la página; si no, el mantenimiento de cada
   hora o la primera vez que se necesita). Nunca sale del servidor. */
const CELULARES_TROZO = 45000;   // caracteres por celda (Google permite 50 mil)
function marcaIndiceCelulares_(bv) { return 'base ' + bv; }
function armarIndiceCelulares_() {
  const ss = libro_(), h = ss.getSheetByName(ALERTAS.HOJAS.base);
  if (!h || h.getLastRow() < 2) throw fallo_('BASE', 'Todavía no hay base de clientes.');
  const bv = estado_().baseVersion;   // antes de leer: si la base cambia mientras tanto, el índice queda viejo y no se usa
  const cols = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
  const iC = cols.indexOf('CONTRATO') + 1, iN = cols.indexOf('GRUPO_NODO') + 1, iT = cols.indexOf('TELEFONO') + 1;
  if (!iT) throw fallo_('BASE', 'La base que está subida no trae la columna TELEFONO. Sube la base que incluye los teléfonos.');
  const n = h.getLastRow() - 1;
  const colN = h.getRange(2, iN, n, 1).getValues();
  const colC = h.getRange(2, iC, n, 1).getValues();
  const colT = h.getRange(2, iT, n, 1).getValues();
  // Por nodo, por contrato: [fila, celular] con el primer celular (en el orden de la base), 'F' o ''
  const porNodo = {};
  for (let i = 0; i < n; i++) {
    const nodo = String(colN[i][0]);
    if (!nodo) continue;
    const c = String(colC[i][0]), m = porNodo[nodo] || (porNodo[nodo] = {}), antes = m[c];
    if (Array.isArray(antes)) continue;
    const nums = String(colT[i][0] || '').split(/\s+/).filter((t) => /^504\d{8}$/.test(t));
    const cel = nums.filter((t) => /^504[3789]/.test(t))[0];
    m[c] = cel ? [i, cel] : (nums.length || antes === 'F') ? 'F' : '';
  }
  try { guardarIndiceCelulares_(ss, porNodo, bv); } catch (err) { console.error('No se pudo guardar el índice de celulares: ' + (err && err.message)); }
  return porNodo;
}
function guardarIndiceCelulares_(ss, porNodo, bv) {
  const filas = [];
  Object.keys(porNodo).sort().forEach((nodo) => {
    const m = porNodo[nodo];
    let parte = 1, txt = '';
    Object.keys(m).forEach((c) => {
      const e = m[c], s = Array.isArray(e) ? c + '|' + e[0] + '|' + e[1] : e === 'F' ? c + '|F' : c;
      if (txt && txt.length + s.length + 1 > CELULARES_TROZO) { filas.push([nodo, parte++, txt]); txt = ''; }
      txt += (txt ? ';' : '') + s;
    });
    filas.push([nodo, parte, txt]);
  });
  let h = ss.getSheetByName(ALERTAS.HOJAS.celulares);
  if (!h) { h = protegerSiBloqueado_(ss.insertSheet(ALERTAS.HOJAS.celulares)); h.hideSheet(); }
  h.clear();
  if (h.getMaxRows() < filas.length + 1) h.insertRowsAfter(h.getMaxRows(), filas.length + 1 - h.getMaxRows());
  h.getRange(1, 1, 1, 3).setValues([['NODO', 'PARTE', 'CLIENTES']]);
  if (filas.length) {
    h.getRange(2, 1, filas.length, 3).setNumberFormat('@');
    h.getRange(2, 1, filas.length, 3).setValues(filas.map((f) => [f[0], String(f[1]), f[2]]));
  }
  h.getRange(1, 4).setValue(marcaIndiceCelulares_(bv));   // al final: hasta aquí el índice no vale
  return filas.length;
}
/* Los clientes de unos nodos según el índice, o null si el índice no está listo para la base actual */
function leerIndiceCelulares_(nodos) {
  const h = libro_().getSheetByName(ALERTAS.HOJAS.celulares);
  if (!h || h.getLastRow() < 2) return null;
  const marca = marcaIndiceCelulares_(estado_().baseVersion);
  if (String(h.getRange(1, 4).getValue()) !== marca) return null;
  const lista = Object.keys(nodos), ult = h.getLastRow();
  let filas;
  if (lista.length > 40) filas = h.getRange(2, 1, ult - 1, 3).getValues();   // muchos nodos: todo de una vez
  else {
    const rango = h.getRange(2, 1, ult - 1, 1);
    let celdas;
    try {
      celdas = rango.createTextFinder('^(' + lista.map(escaparRegex_).join('|') + ')$').useRegularExpression(true).matchEntireCell(true).findAll();
    } catch (err) {
      celdas = [];
      lista.forEach((x) => { celdas = celdas.concat(rango.createTextFinder(x).matchEntireCell(true).findAll()); });
    }
    filas = [];
    tramos_(celdas.map((r) => r.getRow()).sort((a, b) => a - b)).forEach((t) => {
      filas = filas.concat(h.getRange(t[0], 1, t[1] - t[0] + 1, 3).getValues());
    });
  }
  const porNodo = {};
  filas.forEach((f) => {
    const nodo = String(f[0]);
    if (!nodos[nodo]) return;
    const m = porNodo[nodo] || (porNodo[nodo] = {});
    String(f[2] || '').split(';').forEach((s) => {
      if (!s) return;
      const p = s.split('|');
      m[p[0]] = p.length === 3 ? [Number(p[1]), p[2]] : p[1] === 'F' ? 'F' : '';
    });
  });
  // Si mientras se leía alguien volvió a armar el índice, no se usa lo leído
  return String(h.getRange(1, 4).getValue()) === marca ? porNodo : null;
}
function escaparRegex_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/* Si el índice no está listo para la base actual, se arma (lo llama el mantenimiento y la página al terminar la carga) */
function prepararIndiceCelulares_() {
  const h = libro_().getSheetByName(ALERTAS.HOJAS.celulares);
  const marca = marcaIndiceCelulares_(estado_().baseVersion);
  if (h && String(h.getRange(1, 4).getValue()) === marca) return { listo: true, armado: false };
  const b = libro_().getSheetByName(ALERTAS.HOJAS.base);
  if (!b || b.getLastRow() < 2) return { listo: false, armado: false };
  const cols = b.getRange(1, 1, 1, b.getLastColumn()).getValues()[0].map(String);
  if (cols.indexOf('TELEFONO') < 0) return { listo: false, armado: false };
  return { listo: true, armado: true, nodos: Object.keys(armarIndiceCelulares_()).length };
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
    h = protegerSiBloqueado_(libro.insertSheet(nombre));
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
   60 minutos. Las búsquedas de Workforce, Jefatura y los supervisores no cuentan: son ellos revisando el nodo.
   5 clientes (o 2 reportes de asesores) es una posible falla; 3 o 4, un nodo en observación. */
const ACCESOS_INTERNOS_ = { 'Workforce HN': true, 'Jefatura': true, 'Supervisor': true };
function consultasPosibleFalla_(filas, enFalla) {
  return filas.filter((f) => {
    const nodo = String(f[7] || ''), res = String(f[8] || '');
    if (!nodo || esVirtual_(nodo) || res === 'FALLA' || res === 'NO_ENCONTRADO' || ACCESOS_INTERNOS_[String(f[3] || '')]) return false;
    const x = enFalla && enFalla[nodo];
    return !x || (x !== true && fechaMs_(f[0]) > x);
  });
}
/* Nodo -> true si tiene una falla activa, o la hora en que se cerró su última falla (resuelta o descartada):
   las consultas de antes del cierre ya quedaron explicadas por esa falla. Así, al descartar una posible
   falla, el aviso no vuelve a salir con los mismos clientes; solo cuentan los que llamen después. */
function nodosEnFalla_() {
  const enFalla = {};
  fallasRecientes_().forEach((f) => f.nodos.forEach((n) => {
    if (f.estado === 'ACTIVA') enFalla[n] = true;
    else if (enFalla[n] !== true && f.cerradaEn) enFalla[n] = Math.max(enFalla[n] || 0, cierreDe_(f));
  }));
  return enFalla;
}
/* Cuándo se cerró de verdad: la hora en que se registró el cierre (la "hora de solución" que se escribe
   al cerrar puede ser anterior, y con minutos redondeados) */
function cierreDe_(f) {
  let t = f.cerradaEn || 0;
  (f.historial || []).forEach((h) => { if (h.accion === 'CERRADA' && h.en > t) t = h.en; });
  return t;
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

/* Marcas de las posibles fallas: reportada al VOC (a: 'VOC', la pone Workforce o un supervisor) o un supervisor
   que le avisó a Workforce (a: 'WF', con una nota opcional). Las ve todo el equipo, para que nadie mande el mismo
   correo dos veces, y duran 6 horas. */
function alertasReportadas_() {
  let m = {};
  try { m = JSON.parse(props_().getProperty('ALERTAS_REPORTADAS') || '{}') || {}; } catch (e) { m = {}; }
  const corte = Date.now() - ALERTAS.ALERTA_MARCA_HORAS * 3600000;
  Object.keys(m).forEach((k) => { if (!m[k] || !(m[k].en > corte)) delete m[k]; });
  return m;
}

/* Cómo se detectó una falla, al publicarla: la racha de consultas de clientes de sus nodos (Concentrix y
   Tiendas) que llega hasta la publicación, hasta 4 horas atrás: sin pausas de más de 45 minutos entre una
   consulta y otra, ni entre la última y la publicación. Consultas que se cortaron antes no cuentan.
   primera: la primera consulta de la racha; aviso: cuando se juntaron 5 clientes distintos en 60 min
   (o 2 reportes), si pasó; llamadas y clientes: cuántas consultas y clientes distintos hubo antes de publicar. */
function deteccionFalla_(nodos, publicada) {
  const enNodos = {};
  nodos.forEach((n) => { enNodos[n] = true; });
  const filas = consultasPosibleFalla_(leerConsultas_(publicada - 4 * 3600000, null), null)
    .filter((f) => enNodos[String(f[7])])
    .map((f) => ({ t: fechaMs_(f[0]), c: String(f[6] || ''), rep: String(f[5]) === 'reporte' }))
    .filter((x) => x.t <= publicada)
    .sort((a, b) => a.t - b.t);
  // La racha llega hasta la publicación: sin pausas de más de 45 minutos entre una llamada y la siguiente,
  // ni entre la última y la publicación (llamadas de un problema que ya había pasado no cuentan)
  let ini = filas.length, ref = publicada;
  for (let i = filas.length - 1; i >= 0; i--) {
    if (ref - filas[i].t > 45 * 60000) break;
    ini = i; ref = filas[i].t;
  }
  const racha = filas.slice(ini);
  if (!racha.length) return { primera: null, aviso: null, llamadas: 0, clientes: 0 };
  const distintos = {};
  racha.forEach((x) => { if (x.c) distintos[x.c] = true; });
  let aviso = null;
  for (let i = 0; i < racha.length && aviso == null; i++) {
    const vistos = {};
    let n = 0, reportes = 0;
    for (let j = i; j < racha.length && racha[j].t - racha[i].t <= ALERTAS.ALERTA_MIN * 60000; j++) {
      if (racha[j].c && !vistos[racha[j].c]) { vistos[racha[j].c] = true; n++; }
      if (racha[j].rep) reportes++;
      if (n >= ALERTAS.ALERTA_CLIENTES || reportes >= ALERTAS.ALERTA_REPORTES) { aviso = racha[j].t; break; }
    }
  }
  return { primera: racha[0].t, aviso: aviso, llamadas: racha.length, clientes: Object.keys(distintos).length };
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
      const antes = m[nodo] || null, escribe = ALERTAS.ESCRIBEN.indexOf(ses.r) >= 0;
      if (op === 'reportada') {
        const a = d.a === 'WF' && !escribe ? 'WF' : 'VOC';
        // Un aviso a Workforce no tapa una que ya se reportó al VOC
        if (antes && antes.a !== 'WF' && a === 'WF') marca = antes;
        else m[nodo] = marca = { por: ses.n, u: ses.u, rol: ses.r, a: a, nota: texto_(d.nota, 140), en: Date.now() };
      } else {
        // Un supervisor solo quita las marcas que puso él; Workforce y Jefatura, cualquiera
        if (antes && !escribe && antes.u !== ses.u) throw fallo_('PERMISO', 'Solo ' + antes.por + ' o Workforce pueden quitar esa marca.');
        delete m[nodo];
      }
      props_().setProperty('ALERTAS_REPORTADAS', JSON.stringify(m));
    } finally { lock.releaseLock(); }
    cache_().remove('alertas');
    return { nodo: nodo, reportada: op === 'reportada' ? marca : null };
  }
  if (op !== 'detalle') throw fallo_('DATOS', 'Operación no válida.');
  return detallePosibleFalla_(nodo);
}
function detallePosibleFalla_(nodo) {
  const ahora = Date.now();
  const enFalla = nodosEnFalla_();
  const cierre = typeof enFalla[nodo] === 'number' ? enFalla[nodo] : 0;   // solo lo que llegó después de cerrar su última falla
  const filas = consultasPosibleFalla_(leerConsultas_(ahora - ALERTAS.ALERTA_MIN * 60000, null), null).filter((f) => String(f[7]) === nodo && fechaMs_(f[0]) > cierre);
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
    desde: desde, hasta: hasta, clientes: clientes, reportada: alertasReportadas_()[nodo] || null, enFalla: enFalla[nodo] === true
  };
}
/* Datos de varios contratos con una sola búsqueda en la base. Si un contrato tiene varios
   servicios, se queda con el del nodo de la posible falla (nodo: un código, o { código: true } con varios). */
function datosDeContratos_(contratos, nodo) {
  const out = {};
  const esDe = typeof nodo === 'object' && nodo ? (n) => nodo[n] === true : (n) => n === nodo;
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
      if (!prev || (!esDe(prev.nodo) && esDe(reg.nodo))) out[c] = reg;
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

  const ag = agregarPeriodo_(desde, hoy, reloj);
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

/* Las consultas de un periodo: los días ya resumidos, de los resúmenes; hoy y lo que falte, del detalle */
function agregarPeriodo_(desde, hoy, reloj) {
  const DIA = 86400000;
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
  return ag;
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

    // 5. Envíos de SMS: los que quedaron abandonados se cierran, y a quién se le mandó cada aviso se guarda
    //    40 días. Con el mismo candado que los envíos, para no borrar mientras se anota.
    let smsBorrados = 0, smsHuerfanos = 0;
    try {
      smsBorrados = conCandadoSms_(() => {
        cerrarEnviosSmsViejos_();
        smsHuerfanos = limpiarHuerfanosSms_();
        const he = libro_().getSheetByName(ALERTAS.HOJAS.envios);
        return he && he.getLastRow() >= 2 ? borrarFilas_(he, filaDesde_(he, Date.now() - ALERTAS.DIAS_ENVIOS_SMS * DIA, he.getLastRow())) : 0;
      });
    } catch (err) { console.error('No se pudieron limpiar los envíos de SMS: ' + (err && err.message)); }

    // 6. El índice de celulares por nodo, si la base cambió y nadie lo pidió todavía (así Enviar SMS no espera)
    let celulares = null;
    try { celulares = prepararIndiceCelulares_(); } catch (err) { console.error('No se pudo armar el índice de celulares: ' + (err && err.message)); }

    // 7. Accesos temporales que hayan quedado de antes de la 3.2: se borran (solo Tiendas tiene contraseña)
    let temporales = 0;
    try { temporales = quitarCuentasTemporales_(); } catch (err) { console.error('No se pudieron borrar los accesos temporales: ' + (err && err.message)); }
    return { resumidoHasta: resumido, borradas: borradas, smsBorrados: smsBorrados, smsHuerfanos: smsHuerfanos, celulares: celulares, temporales: temporales };
  } finally { lock.releaseLock(); }
}

/* ============================================================================
 *  Menú del Sheet (solo lo ve el dueño)
 * ========================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Alertas')
    .addItem('1. Configurar por primera vez', 'configurar')
    .addItem('2. Conectar Genesys', 'dialogoGenesys')
    .addItem('3. Contraseña de Tiendas', 'dialogoClaves')
    .addItem('4. Conectar Notifícame (SMS)', 'dialogoNotificame')
    .addItem('5. Números de control (SMS)', 'dialogoControlSms')
    .addSeparator()
    .addItem('Mostrar las pestañas', 'mostrarPestanas')
    .addItem('Ocultar y proteger las pestañas', 'ocultarPestanas')
    .addSeparator()
    .addItem('Ver dirección del servidor', 'verDireccion')
    .addItem('Cerrar todas las sesiones', 'cerrarSesiones')
    .addItem('Resumir y limpiar la bitácora de consultas', 'limpiarConsultasMenu')
    .addToUi();
  ocultarAlAbrir_();
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

/* ----- Pestañas ocultas y protegidas (como el archivo de auditorías) -----
   "Ocultar y proteger las pestañas" deja a la vista solo INICIO (con el aviso de archivo confidencial) y
   protege todas las pestañas de los dos archivos, la base interna y el de consultas, para que solo la
   cuenta dueña las pueda cambiar. "Mostrar las pestañas" las muestra para revisar o editar (siguen
   protegidas). Cada vez que se abre el archivo se vuelven a ocultar solas. Solo la cuenta dueña puede
   mostrarlas u ocultarlas. Alertas sigue funcionando igual porque corre con la cuenta dueña, y las pestañas
   que cree después (por ejemplo, la Base nueva de una carga completa) quedan ocultas y protegidas solas. */
const INICIO = 'INICIO';
const BLOQUEO_DESC = 'Alertas: pestaña protegida, solo la cambia la cuenta dueña';
function esDueno_() {
  try {
    const dueno = SpreadsheetApp.getActiveSpreadsheet().getOwner();
    const yo = Session.getEffectiveUser().getEmail();
    return !!(dueno && yo && String(dueno.getEmail()).toLowerCase() === String(yo).toLowerCase());
  } catch (err) { return false; }
}
function librosAlertas_() {
  const libros = [SpreadsheetApp.getActiveSpreadsheet()];
  try { const c = libroConsultas_(); if (c.getId() !== libros[0].getId()) libros.push(c); } catch (err) { /* todavía sin archivo de consultas */ }
  return libros;
}
function protegerHoja_(h) {
  const ya = h.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter((p) => p.getDescription() === BLOQUEO_DESC)[0];
  const p = ya || h.protect().setDescription(BLOQUEO_DESC);
  p.removeEditors(p.getEditors());   // Google deja siempre a la cuenta dueña
  if (p.canDomainEdit()) p.setDomainEdit(false);
  return p;
}
/* Una pestaña que Alertas crea cuando las pestañas ya están ocultas y protegidas: igual que las demás */
function protegerSiBloqueado_(h) {
  try {
    if (h && props_().getProperty('BLOQUEO_PESTANAS')) {
      protegerHoja_(h);
      if (h.getName() !== INICIO && !h.isSheetHidden()) h.hideSheet();
    }
  } catch (err) { /* nunca frena a Alertas */ }
  return h;
}
/* La pestaña INICIO de cada archivo: qué es, que no se comparte y cómo ver los datos */
function hojaInicio_(libro, deConsultas) {
  let h = libro.getSheetByName(INICIO);
  if (!h) h = libro.insertSheet(INICIO, 0);
  const lineas = deConsultas ? [
    'ALERTAS · Bitácora de consultas',
    '',
    'Archivo confidencial. Los datos están en pestañas ocultas y protegidas: solo la cuenta dueña los puede ver y cambiar.',
    'No compartan este archivo. Alertas lo llena solo: cada consulta de la página queda aquí 30 días, y un resumen por día para las estadísticas.',
    '',
    'Para revisarlo: en la base interna de Alertas, menú Alertas › Mostrar las pestañas.',
    'Al terminar: menú Alertas › Ocultar y proteger las pestañas.',
    '',
    'Versión ' + ALERTAS.VERSION
  ] : [
    'ALERTAS · Fallas de red de Servicios Fijos HN',
    '',
    'Archivo confidencial. Los datos están en pestañas ocultas y protegidas: solo la cuenta dueña los puede ver y cambiar.',
    'No compartan este archivo. Concentrix, los supervisores, Tiendas, Workforce HN y Jefatura entran únicamente por la página web de Alertas.',
    '',
    'Para revisar los datos o editar usuarios y tiendas: menú Alertas › Mostrar las pestañas.',
    'Al terminar: menú Alertas › Ocultar y proteger las pestañas. Cada vez que se abre el archivo se vuelven a ocultar solas.',
    '',
    'Versión ' + ALERTAS.VERSION
  ];
  h.clear();
  h.getRange(1, 1, lineas.length, 1).setValues(lineas.map((t) => [t])).setFontSize(11);
  h.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  h.setColumnWidth(1, 900);
  if (h.isSheetHidden()) h.showSheet();
  return h;
}
function ocultarPestanas() {
  const ui = SpreadsheetApp.getUi();
  if (!esDueno_()) { ui.alert('Ocultar y proteger las pestañas', 'Solo la cuenta dueña del archivo puede mostrar u ocultar las pestañas.', ui.ButtonSet.OK); return; }
  props_().setProperty('BLOQUEO_PESTANAS', JSON.stringify({ por: Session.getEffectiveUser().getEmail(), en: Date.now() }));
  let n = 0;
  librosAlertas_().forEach((libro, i) => {
    const inicio = hojaInicio_(libro, i > 0);
    libro.setActiveSheet(inicio);
    libro.getSheets().forEach((h) => {
      protegerHoja_(h);
      if (h.getName() === INICIO) return;
      if (!h.isSheetHidden()) h.hideSheet();
      n++;
    });
  });
  ui.alert('Pestañas ocultas y protegidas', n + ' pestañas ocultas y protegidas, en la base interna y en el archivo de consultas. Solo la cuenta dueña las puede ver y cambiar.\n\n'
    + 'Alertas sigue funcionando igual: la página lee y escribe en ellas aunque estén ocultas.\n\n'
    + 'Para revisarlas: Alertas > Mostrar las pestañas. Cada vez que se abre el archivo se vuelven a ocultar solas.', ui.ButtonSet.OK);
}
function mostrarPestanas() {
  const ui = SpreadsheetApp.getUi();
  if (!esDueno_()) { ui.alert('Mostrar las pestañas', 'Solo la cuenta dueña del archivo puede mostrar u ocultar las pestañas.', ui.ButtonSet.OK); return; }
  let n = 0;
  librosAlertas_().forEach((libro) => libro.getSheets().forEach((h) => {
    // Catalogo y Celulares son internas: siguen ocultas
    if (h.getName() !== ALERTAS.HOJAS.catalogo && h.getName() !== ALERTAS.HOJAS.celulares && h.isSheetHidden()) { h.showSheet(); n++; }
  }));
  SpreadsheetApp.getActiveSpreadsheet().toast((n ? n + ' pestañas a la vista' : 'Las pestañas ya estaban a la vista') + '. Siguen protegidas. Al terminar: Alertas > Ocultar y proteger las pestañas.', 'Alertas', 10);
}
/* Al abrir el archivo: si ya tiene INICIO, todo lo demás se vuelve a ocultar */
function ocultarAlAbrir_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inicio = ss.getSheetByName(INICIO);
    if (!inicio) return;
    if (inicio.isSheetHidden()) inicio.showSheet();
    ss.setActiveSheet(inicio);
    ss.getSheets().forEach((h) => { if (h.getName() !== INICIO && !h.isSheetHidden()) h.hideSheet(); });
  } catch (err) { /* abrir el archivo nunca falla por esto */ }
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
    if (!h) h = protegerSiBloqueado_(ss.insertSheet(nombre));
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
    const h = protegerSiBloqueado_(sc.getSheets()[0]);
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
    '<p class="nota">Workforce, Jefatura y los supervisores de Call Center se definen en la hoja Usuarios con su correo de Genesys.</p>' +
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

/* ----- Notifícame: la llave y el secreto del API (solo la cuenta dueña los cambia) ----- */
function notificameGuardado_() {
  try { return JSON.parse(props_().getProperty('NOTIFICAME') || '{}') || {}; } catch (e) { return {}; }
}
function dialogoNotificame() {
  const c = notificameGuardado_();
  const fin = (t) => (t ? ' (termina en ' + esc_(String(t).slice(-4)) + ')' : '');
  const html = estiloDialogo_() +
    '<p>Datos de <b>Notifícame &gt; Conexión con el API &gt; Credenciales y accesos</b>. Se guardan en el servidor de Alertas: no aparecen en GitHub ni en la página.</p>' +
    '<label>API key<input id="key" autocomplete="off" placeholder="' + (c.key ? 'Guardada' + fin(c.key) + '. Vacía, no cambia' : '') + '"></label>' +
    '<label>API secret<input id="secret" type="password" autocomplete="new-password" placeholder="' + (c.secret ? 'Guardada. Vacía, no cambia' : '') + '"></label>' +
    '<label>Dirección del API REST<input id="url" value="' + esc_(c.url || ALERTAS.NOTIFICAME_URL) + '" autocomplete="off"></label>' +
    '<label>Celular para un SMS de prueba (opcional)<input id="prueba" placeholder="Ejemplo: 9999 9999" autocomplete="off"></label>' +
    '<p class="nota">Al guardar, Alertas prueba la conexión. Si escribes un celular, le manda un SMS de prueba.</p>' +
    '<div class="acc"><button onclick="google.script.host.close()">Cerrar</button>' +
    '<button class="pri" id="btn" onclick="guardar()">Guardar y probar</button></div><p id="msg"></p>' +
    '<script>function guardar(){var v=function(i){return document.getElementById(i).value;};var b=document.getElementById("btn"),m=document.getElementById("msg");' +
    'b.disabled=true;m.textContent="Probando la conexión…";' +
    'google.script.run.withSuccessHandler(function(t){b.disabled=false;m.textContent=t;document.getElementById("key").value="";document.getElementById("secret").value="";})' +
    '.withFailureHandler(function(e){b.disabled=false;m.textContent=e.message;}).guardarNotificame({key:v("key"),secret:v("secret"),url:v("url"),prueba:v("prueba")});}</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(480).setHeight(560), 'Conectar Notifícame');
}
function guardarNotificame(d) {
  if (!esDueno_()) throw new Error('Solo la cuenta dueña del archivo puede conectar Notifícame.');
  const antes = notificameGuardado_();
  const key = String(d && d.key || '').trim() || antes.key || '';
  const secret = String(d && d.secret || '').trim() || antes.secret || '';
  let url = String(d && d.url || '').trim() || ALERTAS.NOTIFICAME_URL;
  if (!key || !secret) throw new Error('Escribe la API key y la API secret.');
  if (!/^[\x21-\x7e]{6,300}$/.test(key) || !/^[\x21-\x7e]{6,300}$/.test(secret)) throw new Error('La API key o la API secret no tienen el formato esperado (sin espacios).');
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) throw new Error('La dirección del API tiene que empezar con https://');
  if (!/\/$/.test(url)) url += '/';
  props_().setProperty('NOTIFICAME', JSON.stringify({ key: key, secret: secret, url: url, en: Date.now(), por: Session.getEffectiveUser().getEmail() }));
  return probarNotificame_(d && d.prueba);
}
/* Prueba la conexión (account/status) y, si se pide, manda un SMS de prueba. Devuelve el texto para el diálogo. */
function probarNotificame_(prueba) {
  const cfg = notificameCfg_();
  let x;
  try { x = llamarNotificame_(cfg, 'get', 'account/status', null); } catch (err) {
    return 'Quedó guardado, pero el servidor de Alertas (en Google) no pudo conectarse con Notifícame: ' + String(err && err.message || err).slice(0, 160)
      + '. Si Notifícame solo abre dentro de la red de Claro, hay que pedirle a TI que lo habilite para internet.';
  }
  if (!(x.codigo >= 200 && x.codigo < 300 && x.datos && typeof x.datos === 'object')) return 'Quedó guardado, pero Notifícame respondió: ' + errorNotificame_(x);
  const dd = x.datos;
  const cuenta = String(dd.name || dd.account_name || dd.company || (dd.account && dd.account.name) || '').slice(0, 80);
  let txt = 'Conexión lista con Notifícame' + (cuenta ? ' (' + cuenta + ')' : '') + '.';
  const dig = String(prueba || '').replace(/\D+/g, '');
  if (dig) {
    const tel = /^[3789]\d{7}$/.test(dig) ? '504' + dig : /^504[3789]\d{7}$/.test(dig) ? dig : '';
    if (!tel) return txt + ' El celular de prueba no es válido: escribe los 8 dígitos de un celular de Honduras.';
    let y;
    // Con tilde, ñ y barra: así la prueba confirma también la firma de un mensaje con esos caracteres
    try { y = llamarNotificame_(cfg, 'post', 'messages/send_to_contact', { msisdn: tel, message: 'Prueba de Alertas: la conexión con Notifícame funciona (señal 1/2).', id: 'PRUEBA-' + Date.now() }); } catch (err) {
      return txt + ' El SMS de prueba no salió: no se pudo conectar con Notifícame (' + String(err && err.message || err).slice(0, 120) + ').';
    }
    const c = clasificarSms_(y);
    // Qué campos trae la respuesta: sirve para confirmar cómo responde Notifícame cuando un SMS sale bien
    const campos = y.datos && typeof y.datos === 'object' ? Object.keys(y.datos).slice(0, 12).join(', ') : 'sin datos';
    txt += c.estado === 'Enviado' ? ' SMS de prueba enviado al ' + tel.slice(3, 7) + ' ' + tel.slice(7) + ' (respuesta: ' + campos + ').'
      : c.estado === 'Dudoso' ? ' Notifícame respondió (código ' + y.codigo + ') sin un dato que confirme el envío: revisa si te llegó el SMS de prueba. Campos de la respuesta: ' + campos + '.'
      : ' El SMS de prueba no salió: ' + c.detalle + ' (código ' + y.codigo + ', respuesta: ' + campos + ').';
  }
  return txt;
}

/* ----- Números de control (los celulares del equipo que reciben cada SMS para confirmar que llegó) ----- */
function dialogoControlSms() {
  const lista = numerosControlSms_();
  const html = estiloDialogo_() +
    '<style>textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px;font:13px monospace;border:1px solid #c7ced7;border-radius:6px;height:250px}</style>' +
    '<p>Celulares del equipo que reciben cada SMS que se manda desde Alertas, para confirmar que llegó. Uno por línea, con o sin 504.</p>' +
    '<label>Números de control<textarea id="nums" spellcheck="false">' + esc_(lista.join('\n')) + '</textarea></label>' +
    '<p class="nota">Reciben una vez por falla cada mensaje aprobado que se mande, al principio del envío. ' +
    'También van al principio del archivo de Descargar celulares. Se guardan en el servidor de Alertas: no llegan a la página ni a GitHub.</p>' +
    '<div class="acc"><button onclick="google.script.host.close()">Cerrar</button>' +
    '<button class="pri" id="btn" onclick="guardar()">Guardar</button></div><p id="msg"></p>' +
    '<script>function guardar(){var b=document.getElementById("btn"),m=document.getElementById("msg");b.disabled=true;m.textContent="Guardando…";' +
    'google.script.run.withSuccessHandler(function(r){b.disabled=false;m.textContent=r.texto;document.getElementById("nums").value=r.lista.join("\\n");})' +
    '.withFailureHandler(function(e){b.disabled=false;m.textContent=e.message;}).guardarControlSms({texto:document.getElementById("nums").value});}</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(440).setHeight(540), 'Números de control (SMS)');
}
function guardarControlSms(d) {
  if (!esDueno_()) throw new Error('Solo la cuenta dueña del archivo puede cambiar los números de control.');
  const lineas = String(d && d.texto || '').split(/[\n,;]+/).map((x) => x.trim()).filter(String);
  const lista = [], malos = [];
  let repetidos = 0;
  lineas.forEach((x) => { const n = celularHn_(x); if (!n) malos.push(x); else if (lista.indexOf(n) >= 0) repetidos++; else lista.push(n); });
  if (lista.length > ALERTAS.SMS_CONTROL_MAX) throw new Error('Son demasiados: máximo ' + ALERTAS.SMS_CONTROL_MAX + ' números de control.');
  props_().setProperty('SMS_CONTROL', JSON.stringify(lista));
  const texto = (lista.length ? 'Guardados ' + lista.length + (lista.length === 1 ? ' número' : ' números') + ' de control.' : 'Sin números de control.')
    + (repetidos ? ' Se quitó ' + repetidos + (repetidos === 1 ? ' repetido.' : ' repetidos.') : '')
    + (malos.length ? ' No son celulares de Honduras, no se guardaron: ' + malos.slice(0, 5).map((x) => x.slice(0, 20)).join(', ') + (malos.length > 5 ? '…' : '') + '.' : '');
  return { texto: texto, lista: lista };
}

/* ----- Contraseña de Tiendas -----
   Solo la cuenta genérica de Tiendas entra con contraseña. Desde la 3.2 no hay accesos temporales (por
   privacidad): Workforce, Jefatura, los supervisores y Concentrix entran solo con Genesys. */

function dialogoClaves() {
  const html = estiloDialogo_() +
    '<p>La contraseña se guarda cifrada en el servidor. No aparece en el código de GitHub ni en la página.</p>' +
    '<p class="nota">Solo Tiendas entra con contraseña. Workforce, Jefatura, los supervisores y Concentrix entran con Genesys: no hay accesos temporales.</p>' +
    '<div id="lista">Cargando…</div>' +
    '<h3>Crear o cambiar la contraseña de Tiendas</h3>' +
    '<label>Usuario de Tiendas<input id="usuario" value="tiendas" autocomplete="off"></label>' +
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
    '.withFailureHandler(function(e){msg(e.message);}).guardarCuenta(document.getElementById("usuario").value,"tiendas",c1);}' +
    'function quitar(u){google.script.run.withSuccessHandler(cargar).quitarCuenta(u);}' +
    'cargar();</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(500), 'Contraseña de Tiendas');
}
/* La lista del diálogo. Al abrirlo, si quedó algún acceso temporal de antes de la 3.2, se borra. */
function listarCuentas() {
  quitarCuentasTemporales_();
  const cuentas = JSON.parse(props_().getProperty('CUENTAS') || '{}');
  return Object.keys(cuentas).map((u) => ({
    usuario: u, acceso: ALERTAS.ROLES[cuentas[u].rol],
    fecha: Utilities.formatDate(new Date(cuentas[u].creada), ALERTAS.ZONA, 'dd/MM/yyyy HH:mm')
  }));
}
/* Borra las cuentas con contraseña que no son de Tiendas (los accesos temporales de antes de la 3.2, que ya no
   dejan entrar ni valen sus sesiones). Devuelve cuántas borró. */
function quitarCuentasTemporales_() {
  const raw = props_().getProperty('CUENTAS');
  if (!raw) return 0;
  const cuentas = JSON.parse(raw);
  const otras = Object.keys(cuentas).filter((u) => !cuentas[u] || cuentas[u].rol !== 'tiendas');
  if (!otras.length) return 0;
  otras.forEach((u) => { delete cuentas[u]; });
  props_().setProperty('CUENTAS', JSON.stringify(cuentas));
  limpiarCfg_();
  return otras.length;
}
function guardarCuenta(usuario, rol, clave) {
  usuario = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error('El usuario solo puede tener letras, números, punto, guion o guion bajo (3 a 40).');
  if (rol !== 'tiendas') throw new Error('Solo Tiendas entra con contraseña. Workforce, Jefatura, los supervisores y Concentrix entran con Genesys (no hay accesos temporales).');
  if (String(clave || '').length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  quitarCuentasTemporales_();
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
