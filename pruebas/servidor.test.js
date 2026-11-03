/* Prueba del servidor (servidor/Code.gs) en el emulador, con una base real o de demostración.
   Uso: node --max-old-space-size=4096 pruebas/servidor.test.js [ruta-al-excel.xlsx] [excel-de-la-semana-siguiente.xlsx]
   Con dos archivos, además prueba la carga por cambios de una base real a la siguiente.   */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { crearEntorno } = require('./gas-emulador');

const RAIZ = path.join(__dirname, '..');
const lib = vm.createContext({ console, TextDecoder, TextEncoder, Blob, DecompressionStream, Intl, performance, Date, Math });
for (const f of ['parser.js', 'config.js', 'util.js', 'model.js', 'demo.js']) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8').replace("if (typeof module !== 'undefined') module.exports = ALERTAS_PARSER;", ''), lib, { filename: f });
}
const P = vm.runInContext('ALERTAS_PARSER', lib), Model = vm.runInContext('Model', lib), U = vm.runInContext('U', lib), Demo = vm.runInContext('Demo', lib);

let fallos = 0, pasos = 0;
function ok(cond, txt, extra) { pasos++; if (cond) console.log('  ✓ ' + txt); else { fallos++; console.log('  ✗ ' + txt + (extra !== undefined ? '  →  ' + JSON.stringify(extra).slice(0, 300) : '')); } }
const t0 = Date.now(), ms = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s';

(async () => {
  /* ---------- Base de prueba ---------- */
  let base;
  const archivo = process.argv[2];
  if (archivo) {
    const buf = fs.readFileSync(archivo);
    base = await P.parseFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(archivo));
  } else base = Demo.generar(Date.now()).base;
  const ix = Model.indexar(base);
  const catJson = Model.catalogo(ix);
  console.log(`Base: ${base.filas} filas, ${ix.resumen.nodos} nodos, catálogo ${(JSON.stringify(catJson).length / 1024).toFixed(0)} KB (${ms()})`);

  /* ---------- Configuración ---------- */
  console.log('\n1. Configuración y acceso');
  const g = crearEntorno({ region: 'mypurecloud.com' });
  const C = g.contexto;
  // Antes de configurar (sin base interna), la página igual recibe la lista de tiendas
  const g0 = crearEntorno({ region: 'mypurecloud.com' });
  const cfg0 = g0.post({ accion: 'config' });
  ok(cfg0.ok && cfg0.datos.listaTiendas.length === 38, 'sin base interna configurada, config igual responde con la lista inicial de tiendas', cfg0);
  C.configurar();
  ok(g.E.activo.getSheetByName('Fallas') && g.E.activo.getSheetByName('Usuarios'), 'configurar crea las hojas');
  const hTiendas = g.E.activo.getSheetByName('Tiendas');
  ok(hTiendas && hTiendas.getLastRow() === 39 && hTiendas.getRange(2, 1).getValue() === 'CAC Castaños', 'configurar crea la hoja Tiendas con las 38 tiendas', hTiendas && hTiendas.getLastRow());
  C.guardarGenesys({ region: 'mypurecloud.com', clientId: 'a1b2c3d4-0000-1111-2222-333344445555', rolPorDefecto: 'concentrix' });
  C.guardarCuenta('tiendas', 'tiendas', 'ClaroTiendas2026');
  C.guardarCuenta('workforce.temporal', 'workforce', 'Workforce2026!');
  let errorCorta = null; try { C.guardarCuenta('x.tienda', 'tiendas', 'corta'); } catch (e) { errorCorta = e.message; }
  ok(/10 caracteres/.test(errorCorta), 'rechaza contraseñas cortas');
  const props = JSON.stringify([...g.E.props.values()]);
  ok(!props.includes('ClaroTiendas2026') && !props.includes('Workforce2026!'), 'la contraseña no queda guardada en texto en ninguna parte');
  g.E.activo.getSheetByName('Usuarios').appendRow(['ana.lopez@claro.com.hn', 'Ana López', 'workforce', 'SÍ', '']);
  g.E.activo.getSheetByName('Usuarios').appendRow(['ex.empleado@claro.com.hn', 'Ex Empleado', 'workforce', 'NO', '']);
  g.E.genesys.tokens.set('tok-agente', { name: 'Karla Zelaya', email: 'karla.zelaya@concentrix.com' });
  g.E.genesys.tokens.set('tok-wf', { name: 'Ana Lopez', email: 'Ana.Lopez@claro.com.hn' });
  g.E.genesys.tokens.set('tok-ex', { name: 'Ex', email: 'ex.empleado@claro.com.hn' });

  const cfg = g.post({ accion: 'config' });
  ok(cfg.ok && cfg.datos.genesys.activo && cfg.datos.tiendas && cfg.datos.temporal, 'config pública indica Genesys, Tiendas y acceso temporal', cfg);
  ok(!JSON.stringify(cfg).includes('hash') && !JSON.stringify(cfg).includes('sal'), 'config no expone hashes');
  ok(cfg.datos.listaTiendas.length === 38 && cfg.datos.listaTiendas.includes('CAC Mall Multiplaza TGU') && cfg.datos.listaTiendas.includes('CAC Puerto Cortes'), 'config manda la lista de tiendas de la hoja Tiendas', cfg.datos.listaTiendas);

  let r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'mala', nombre: 'Pedro' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'contraseña incorrecta se rechaza', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía' } });
  ok(!r.ok && /tienda/.test(r.error), 'Tiendas exige la tienda', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'TIENDAS', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía', tienda: 'Multiplaza Tegucigalpa' } });
  ok(!r.ok && r.codigo === 'DATOS' && /de la lista/.test(r.error), 'una tienda que no está en la lista se rechaza', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'TIENDAS', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía', tienda: 'cac  mall multiplaza tgu' } });
  ok(r.ok && r.datos.usuario.rol === 'tiendas' && r.datos.usuario.tienda === 'CAC Mall Multiplaza TGU', 'Tiendas entra con usuario genérico y la tienda queda con el nombre exacto de la lista', r);
  const tTienda = r.datos.token;
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Lucía Paz', tienda: 'CAC Castanos' } });
  ok(r.ok && r.datos.usuario.tienda === 'CAC Castaños', 'la tienda se reconoce sin importar tildes ni eñes', r);
  // Workforce agrega una tienda en la hoja: aplica de inmediato
  hTiendas.appendRow(['CAC Tienda de Prueba']);
  C.onEdit({ range: hTiendas.getRange(hTiendas.getLastRow(), 1) });
  ok(g.post({ accion: 'config' }).datos.listaTiendas.includes('CAC Tienda de Prueba'), 'una tienda agregada en la hoja Tiendas aparece en la lista al instante');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Lucía Paz', tienda: 'CAC Tienda de Prueba' } });
  ok(r.ok && r.datos.usuario.tienda === 'CAC Tienda de Prueba', 'y ya se puede entrar con ella', r);
  hTiendas.deleteRows(hTiendas.getLastRow(), 1);
  C.onEdit({ range: hTiendas.getRange(1, 1) });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Lucía Paz', tienda: 'CAC Tienda de Prueba' } });
  ok(!r.ok && r.codigo === 'DATOS', 'al quitarla de la hoja, ya no se puede elegir', r);
  // Un servidor que ya funcionaba antes (sin hoja Tiendas): la primera visita la crea sola
  g.E.activo.deleteSheet(hTiendas); g.cache.remove('tiendas');
  const cfg2 = g.post({ accion: 'config' }), hT2 = g.E.activo.getSheetByName('Tiendas');
  ok(cfg2.ok && cfg2.datos.listaTiendas.length === 38 && hT2 && hT2.getLastRow() === 39, 'si falta la hoja Tiendas, la primera visita la crea con las 38 tiendas', cfg2.datos && cfg2.datos.listaTiendas.length);
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } });
  ok(r.ok && r.datos.usuario.rol === 'concentrix' && r.datos.usuario.nombre === 'Karla Zelaya', 'Genesys sin estar en la lista entra como Concentrix', r);
  const tAgente = r.datos.token;
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } });
  ok(r.ok && r.datos.usuario.rol === 'workforce' && r.datos.usuario.nombre === 'Ana López', 'Genesys en la lista entra como Workforce (sin importar mayúsculas)', r);
  const tWf = r.datos.token;
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-ex' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'usuario inactivo no entra', r);
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'token-falso' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'token de Genesys inválido se rechaza', r);

  /* La organización y la aplicación de Genesys */
  const ORG = g.E.genesys.org.id;
  ok(JSON.parse(g.E.props.get('GENESYS')).orgId === ORG, 'el primer ingreso con Genesys fija la organización de Claro');
  g.E.genesys.tokens.set('tok-otra-org', { name: 'Intruso', email: 'ana.lopez@claro.com.hn', org: { id: 'deadbeef-0000-4000-8000-000000000bad', name: 'Otra' }, cliente: 'b0b0b0b0-0000-0000-0000-000000000000' });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-otra-org' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'un token de otra organización de Genesys no entra, aunque traiga el correo de Workforce', r);
  g.E.genesys.tokens.set('tok-otra-app', { name: 'Intruso', email: 'ana.lopez@claro.com.hn', cliente: 'b0b0b0b0-0000-0000-0000-000000000000' });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-otra-app' } });
  ok(!r.ok && r.codigo === 'ACCESO' && /Alertas/.test(r.error), 'un token de otra aplicación de Genesys no entra', r);
  g.E.genesys.tokens.set('tok-sin-alcance', { name: 'Karla Zelaya', email: 'karla.zelaya@concentrix.com', sinTokensMe: true });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-sin-alcance' } });
  ok(r.ok && r.datos.usuario.rol === 'concentrix', 'si Genesys no deja leer tokens/me, la organización se valida con users/me', r);
  g.E.genesys.tokens.set('tok-sin-alcance-otra', { name: 'Intruso', email: 'ana.lopez@claro.com.hn', sinTokensMe: true, org: { id: 'deadbeef-0000-4000-8000-000000000bad', name: 'Otra' } });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-sin-alcance-otra' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'y por ese camino tampoco entra otra organización', r);
  C.guardarGenesys({ region: 'mypurecloud.com', clientId: 'a1b2c3d4-0000-1111-2222-333344445555', rolPorDefecto: 'concentrix', orgId: '' });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-sin-alcance' } });
  ok(!r.ok && r.codigo === 'CONFIG', 'sin ID de organización y sin poder verificar la aplicación, pide configurarlo', r);
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } });
  ok(r.ok && JSON.parse(g.E.props.get('GENESYS')).orgId === ORG, 'con un token de Alertas la vuelve a tomar sola', r);
  let errOrg = null; try { C.guardarGenesys({ region: 'mypurecloud.com', clientId: 'a1b2c3d4-0000-1111-2222-333344445555', orgId: 'x y' }); } catch (e) { errOrg = e.message; }
  ok(/organización/.test(errOrg || ''), 'rechaza un ID de organización mal escrito');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'workforce.temporal', clave: 'Workforce2026!', nombre: 'Mario Rivera' } });
  ok(r.ok && r.datos.usuario.rol === 'workforce', 'acceso temporal de Workforce funciona', r);
  const tWfTemp = r.datos.token;

  r = g.post({ accion: 'estado', token: tAgente + 'x' });
  ok(!r.ok && r.codigo === 'SESION', 'token alterado se rechaza', r);
  const [cuerpo, firma] = tAgente.split('.');
  const falso = Buffer.from(JSON.stringify(Object.assign(JSON.parse(Buffer.from(cuerpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()), { r: 'jefatura' }))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  r = g.post({ accion: 'cargar', token: falso + '.' + firma, datos: {} });
  ok(!r.ok && r.codigo === 'SESION', 'no se puede cambiar el rol dentro del token', r);

  /* ---------- Sin base ---------- */
  console.log('\n2. Antes de subir la base');
  r = g.post({ accion: 'cargar', token: tAgente, datos: {} });
  ok(r.ok && r.datos.baseVersion === 0 && !r.datos.catalogo && Array.isArray(r.datos.fallas), 'cargar sin base responde vacío', r);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: '9999999' } });
  ok(r.ok && r.datos.estado === 'no', 'buscar sin base dice que no encontró', r);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: ['NODO01'], motivo: 'FIBRA' } } });
  ok(!r.ok && r.codigo === 'BASE', 'no deja publicar fallas sin base', r);
  r = g.post({ accion: 'base', token: tTienda, datos: { op: 'iniciar', total: 10, columnas: Model.columnasCarga(base) } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Tiendas no puede subir la base', r);
  r = g.post({ accion: 'base', token: tAgente, datos: { op: 'iniciar', total: 10, columnas: Model.columnasCarga(base) } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no puede subir la base', r);
  r = g.post({ accion: 'monitoreo' });
  ok(r.ok && Array.isArray(r.datos.nodos) && r.datos.nodos.length === 0, 'sin base, el monitoreo de la entrada responde vacío (sin sesión)', r);

  /* ---------- Carga de la base ---------- */
  console.log('\n3. Subir la base completa por partes');
  async function subir(b, token, catalogoJson, nombre) {
    let x = g.post({ accion: 'base', token, datos: { op: 'iniciar', total: b.filas, columnas: Model.columnasCarga(b), archivo: nombre } });
    if (!x.ok) return x;
    const { id, filasPorLote } = x.datos;
    let lotes = 0, bytes = 0;
    for (let d = 0; d < b.filas; d += filasPorLote) {
      const filas = Model.filasCarga(b, d, Math.min(b.filas, d + filasPorLote));
      const cuerpo = JSON.stringify({ accion: 'base', token, datos: { op: 'lote', id, desde: d, filas } });
      bytes = Math.max(bytes, cuerpo.length);
      x = g.post(cuerpo); lotes++;
      if (!x.ok) return x;
    }
    x = g.post({ accion: 'base', token, datos: { op: 'finalizar', id, catalogo: catalogoJson } });
    if (x.ok) x.lotes = lotes, x.maxBytes = bytes;
    return x;
  }
  let t1 = Date.now();
  r = await subir(base, tWf, catJson, 'Contrato por Nodo - 26 oct 2026.xlsx');
  ok(r.ok, `base subida en ${r.lotes} lotes (lote más grande ${(r.maxBytes / 1048576).toFixed(2)} MB) en ${((Date.now() - t1) / 1000).toFixed(1)} s (emulador)`, r);
  const hb = g.E.activo.getSheetByName('Base');
  ok(hb && hb.getLastRow() === base.filas + 1, 'la hoja Base tiene todas las filas', hb && hb.getLastRow());
  ok(!g.E.activo.getSheetByName('Base_nueva'), 'no queda la hoja temporal');
  const celdas = g.E.activo.celdas();
  ok(celdas < 10000000, `el archivo usa ${(celdas / 1e6).toFixed(2)} millones de celdas (límite 10)`);
  ok(r.datos.comparacion === null, 'primera carga no tiene comparación');
  const muestra = hb.getRange(2, 1, 1, hb.getLastColumn()).getValues()[0];
  ok(typeof muestra[0] === 'string' && typeof muestra[13] === 'string', 'contrato y DNI quedan como texto (sin perder ceros)', muestra);

  r = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: 0 } });
  ok(r.ok && r.datos.catalogo && r.datos.catalogo.nodos.length === ix.resumen.nodos, 'cargar entrega el catálogo de nodos', r.ok && r.datos.catalogo && r.datos.catalogo.nodos.length);
  ok(!JSON.stringify(r.datos.catalogo).match(/NOMBRE|0801-|\d{13}/), 'el catálogo no trae nombres ni DNI');
  const bv = r.datos.baseVersion;
  r = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: bv } });
  ok(r.ok && !r.datos.catalogo, 'si la base no cambió, no vuelve a enviar el catálogo');

  /* ---------- Búsquedas ---------- */
  console.log('\n4. Búsquedas');
  const prueba = (q) => g.post({ accion: 'buscar', token: tTienda, datos: { q } });
  const cualquiera = Model.registro(ix, 0);
  const dniCualquiera = U.formatoDni(cualquiera.dni);
  r = prueba(String(cualquiera.contrato));
  ok(r.ok && r.datos.estado === 'ok' && r.datos.filas[0].nombre === cualquiera.nombre, 'por contrato encuentra al cliente', r.datos && r.datos.filas[0]);
  r = prueba(dniCualquiera);
  ok(r.ok && r.datos.filas.some((f) => Number(f.contrato) === cualquiera.contrato), 'por DNI con guiones', dniCualquiera);
  r = prueba(dniCualquiera.replace(/-/g, ''));
  ok(r.ok && r.datos.filas.some((f) => Number(f.contrato) === cualquiera.contrato), 'por DNI sin guiones');
  const multi = [...ix.porDni.entries()].find(([k, v]) => typeof v !== 'number' && v.length >= 3);
  r = prueba(multi[0]);
  ok(r.ok && r.datos.filas.length === multi[1].length, 'DNI con varios contratos los trae todos (' + multi[1].length + ')', r.datos && r.datos.filas.length);
  const varios = [...ix.porContrato.entries()].find(([k, v]) => typeof v !== 'number');
  if (varios) { r = prueba(String(varios[0])); ok(r.ok && r.datos.filas.length === varios[1].length, 'contrato con varios servicios los trae todos'); }
  r = prueba('99');
  ok(r.ok && r.datos.estado === 'no', 'contrato inexistente: no encontrado');
  r = prueba('0801196909');
  ok(!r.ok && r.codigo === 'DATOS', 'DNI incompleto se rechaza');
  r = prueba(String(cualquiera.contrato).slice(0, 4));
  ok(r.ok && r.datos.estado === 'no', 'no hay búsquedas parciales (no se puede listar la base)');

  /* ---------- Fallas ---------- */
  console.log('\n5. Fallas');
  const enNodo = (n) => Model.registro(ix, Model.filasDeNodos(ix, [n])[0]);
  const nodosPrueba = Model.ejemplos(Model.cargarCatalogo(catJson));
  r = g.post({ accion: 'falla', token: tTienda, datos: { op: 'publicar', falla: { nodos: nodosPrueba, motivo: 'FIBRA' } } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Tiendas no puede publicar fallas');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodosPrueba.concat(['NOEXISTE99']), motivo: 'FIBRA', eta: Date.now() + 4 * 3600000,
    numero: ' f 1254585 ', referencia: 'Correo NOC #9150', detalle: 'ENEE reporta corte en el circuito' } } });
  const imp = Model.impacto(Model.cargarCatalogo(catJson), nodosPrueba);
  ok(r.ok && r.datos.falla.impacto.total === imp.total && r.datos.falla.impacto.hfc === imp.hfc && r.datos.falla.nodos.length === nodosPrueba.length,
    `publica la falla con ${imp.total} clientes (HFC ${imp.hfc}, GPON ${imp.gpon}) e ignora nodos inexistentes`, r.datos && r.datos.falla && r.datos.falla.impacto);
  const f1 = r.datos.falla;
  const hoyId = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: '2-digit', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
  ok(f1.id === 'F' + hoyId + '01', 'ID de falla sin guiones, con la fecha de Honduras: ' + f1.id);
  // Las fallas de antes (F-aammdd-NN) se muestran sin guiones y cuentan para el número del día: nunca se repite un ID
  ok(g.ejecutar("idFalla_('F-261030-05')") === 'F26103005' && g.ejecutar("idFalla_('F26110201')") === 'F26110201', 'los IDs viejos se muestran sin guiones');
  ok(g.ejecutar("nuevoId_([{ id: 'F-" + hoyId + "-07' }, { id: 'F" + hoyId + "03' }, { id: 'F-261030-09' }], Date.now())") === 'F' + hoyId + '08', 'el número del día sigue después de los IDs viejos de hoy');
  ok(f1.numero === 'F1254585', 'guarda el número de falla en mayúsculas y sin espacios: ' + f1.numero);
  const hFallas = g.E.activo.getSheetByName('Fallas');
  ok(hFallas.getRange(1, 20).getValue() === 'Número de falla' && hFallas.getRange(2, 20).getValue() === 'F1254585', 'la hoja Fallas tiene la columna Número de falla');
  r = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } });
  ok(r.ok && r.datos.fallas.find((f) => f.id === f1.id).numero === 'F1254585', 'Workforce ve el número de falla');
  const paraAsesor = JSON.stringify(g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: -1 } }).datos.fallas);
  const paraTienda = JSON.stringify(g.post({ accion: 'cargar', token: tTienda, datos: { baseVersion: -1 } }).datos.fallas);
  ok(paraAsesor.includes(f1.id) && ['NOC #9150', 'ENEE reporta', 'historial', '@claro.com.hn'].every((x) => !paraAsesor.includes(x) && !paraTienda.includes(x)) && paraAsesor.includes('Ana López'),
    'Concentrix y Tiendas no reciben la referencia, las notas internas ni correos (sí quién publicó)', paraAsesor.slice(0, 300));
  ok(paraAsesor.includes('"numero":"F1254585"') && paraTienda.includes('"numero":"F1254585"'), 'pero sí el número de falla, que es como se nombra la falla');
  r = g.post({ accion: 'estado', token: tAgente });
  ok(r.ok && r.datos.cambio && r.datos.cambio.tipo === 'FALLA_PUBLICADA' && r.datos.cambio.por.nombre === 'Ana López', 'estado avisa el cambio y quién lo hizo', r.datos);
  ok(r.ok && /publicó la falla F1254585 /.test(r.datos.cambio.texto), 'el aviso nombra la falla con su número de falla: ' + (r.datos && r.datos.cambio && r.datos.cambio.texto));
  // El aviso de escritorio para todos: la falla publicada queda en "avisos" con lo que ya ven los asesores
  const avPub = ((r.datos && r.datos.avisos) || []).find((x) => x.id === f1.id);
  ok(avPub && avPub.tipo === 'PUBLICADA' && avPub.v === r.datos.version && avPub.numero === 'F1254585' && avPub.motivo === 'FIBRA' && avPub.n === nodosPrueba.length
    && avPub.nodos.length === Math.min(4, nodosPrueba.length) && avPub.clientes === imp.total && avPub.por === 'Ana López' && avPub.en > Date.now() - 60000,
    'estado trae el aviso de la falla publicada (número, motivo, nodos y clientes) para el aviso de escritorio de todos', r.datos && r.datos.avisos);
  ok(!/NOC #9150|ENEE reporta|@claro|historial|referencia|"u"/.test(JSON.stringify(r.datos.avisos)), 'el aviso no trae la referencia, las notas internas ni correos');
  const cli = enNodo(nodosPrueba[0]);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(cli.contrato) } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id), 'la búsqueda trae la falla del nodo del cliente');
  ok(JSON.stringify(r.datos).includes('F1254585') && !JSON.stringify(r.datos).includes('NOC #9150'), 'con el número de falla y sin la referencia');
  const hist1 = r.datos.historial && r.datos.historial[cli.nodo];
  ok(hist1 && hist1.length === 1 && hist1[0].id === f1.id && hist1[0].fin === null && hist1[0].motivo === 'FIBRA' && hist1[0].numero === 'F1254585',
    'la búsqueda trae el historial de fallas del nodo del cliente (la activa, con su número de falla)', r.datos && r.datos.historial);
  const rWfH = g.post({ accion: 'buscar', token: tWf, datos: { q: String(cli.contrato) } });
  ok(rWfH.ok && rWfH.datos.historial[cli.nodo][0].numero === 'F1254585', 'Workforce sí ve el número de falla en el historial');
  let rc = g.post({ accion: 'contactos', token: tAgente, datos: { contrato: String(cli.contrato) } });
  ok(rc.ok && rc.datos.n7 === 1 && rc.datos.n30 === 1 && rc.datos.anterior > Date.now() - 300000,
    'cuenta las consultas anteriores del contrato (sin contar la que se está viendo)', rc.datos || rc);
  rc = g.post({ accion: 'contactos', token: tTienda, datos: { contrato: '9999999' } });
  ok(rc.ok && rc.datos.n7 === 0 && rc.datos.n30 === 0 && rc.datos.anterior === null, 'un contrato sin consultas anteriores da cero', rc.datos || rc);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'editar', id: f1.id, falla: { nodos: nodosPrueba.slice(0, 2), eta: null }, detalle: 'Quitó ' + nodosPrueba[2] } });
  ok(r.ok && r.datos.falla.nodos.length === 2 && r.datos.falla.eta === null && r.datos.falla.historial.length === 2, 'editar quita un nodo y la hora estimada', r.datos && r.datos.falla);
  ok(r.ok && r.datos.falla.numero === 'F1254585', 'editar sin tocar el número lo conserva');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'editar', id: f1.id, falla: { numero: 'f-125 4590' }, detalle: 'Número de falla F1254590' } });
  ok(r.ok && r.datos.falla.numero === 'F1254590' && hFallas.getRange(2, 20).getValue() === 'F1254590', 'cambiar el número de falla (se guarda sin espacios ni guiones)', r.datos && r.datos.falla && r.datos.falla.numero);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id, nota: 'Empalme terminado' } });
  ok(r.ok && r.datos.falla.estado === 'CERRADA' && r.datos.falla.cerradaPor.nombre === 'Ana López', 'cerrar la falla');
  const cerrada = r.datos.falla.cerradaEn;
  r = g.post({ accion: 'estado', token: tAgente });
  ok(r.ok && !r.datos.avisos.some((x) => x.id === f1.id), 'al cerrarla, su aviso sale de estado (una página que no lo vio ya no avisa de una falla que terminó)', r.datos && r.datos.avisos);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(cli.contrato) } });
  ok(r.ok && r.datos.historial[cli.nodo][0].fin === cerrada, 'el historial se actualiza al cerrar: queda de cuándo a cuándo');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id } });
  ok(!r.ok && /ya cerró/.test(r.error), 'no se puede cerrar dos veces');
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(cli.contrato) } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id && f.estado === 'CERRADA'), 'la falla cerrada sigue visible para los asesores');
  g.E.ahora = Date.now() + 37 * 3600000;
  r = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: bv } });
  ok(!r.ok && r.codigo === 'SESION', 'la sesión vence a las 12 horas', r);
  const tAg37 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  g.cache.remove('fallasRecientes');
  r = g.post({ accion: 'cargar', token: tAg37, datos: { baseVersion: bv } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id && f.estado === 'CERRADA'), 'a las 37 horas de cerrada los asesores todavía la ven (son 72 horas)', r.datos && r.datos.fallas.map((f) => f.id));
  g.E.ahora = Date.now() + 71 * 3600000;
  const tAg71 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  g.cache.remove('fallasRecientes');
  r = g.post({ accion: 'cargar', token: tAg71, datos: { baseVersion: bv } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id), 'y a las 71 horas también', r.datos && r.datos.fallas.map((f) => f.id));
  g.E.ahora = Date.now() + 73 * 3600000;
  const tAg73 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  const tWf73 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } }).datos.token;
  g.cache.remove('fallasRecientes');
  r = g.post({ accion: 'cargar', token: tAg73, datos: { baseVersion: bv } });
  ok(r.ok && !r.datos.fallas.some((f) => f.id === f1.id), 'después de 72 horas ya no la ven los asesores', r.datos && r.datos.fallas.map((f) => f.id));
  r = g.post({ accion: 'cargar', token: tWf73, datos: { baseVersion: bv } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id), 'Workforce la conserva en el historial');
  g.E.ahora = null;
  g.cache.remove('fallasRecientes');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'reabrir', id: f1.id } });
  ok(r.ok && r.datos.falla.estado === 'ACTIVA', 'reabrir la falla');
  const vReab = r.datos.version;
  r = g.post({ accion: 'estado', token: tAgente });
  const avReab = r.ok ? r.datos.avisos.find((x) => x.id === f1.id) : null;
  ok(avReab && avReab.tipo === 'REABIERTA' && avReab.v === vReab && avReab.numero === 'F1254590', 'al reabrirla vuelve a avisar, como reabierta', r.datos && r.datos.avisos);
  const ultAv = g0.ejecutar("(() => { for (let i = 1; i <= 7; i++) subirVersion_({ tipo: 'FALLA_PUBLICADA' }, null, { id: 'F' + i, tipo: 'PUBLICADA', nodos: ['N' + i], n: 1, en: Date.now() });"
    + " subirVersion_({ tipo: 'FALLA_CERRADA' }, null, { id: 'F6' }); subirVersion_({ tipo: 'FALLA_EDITADA' }); subirVersion_({ tipo: 'BASE_ACTUALIZADA' }, { baseVersion: 9 });"
    + " return accionEstado_().avisos.map((x) => x.id + ':' + x.v).join(' '); })()");
  ok(ultAv === 'F3:4 F4:5 F5:6 F7:8', 'estado guarda solo los últimos 5 avisos, quita el de una falla cerrada y los conserva al editar o subir la base: ' + ultAv);
  const hf = g.E.activo.getSheetByName('Fallas').getRange(2, 1, 1, 19).getValues()[0];
  ok(hf[1] === 'Activa' && hf[2] === 'Corte de fibra óptica' && Object.prototype.toString.call(hf[6]) === '[object Date]', 'la hoja Fallas se lee bien a simple vista', hf.slice(0, 7));

  /* ---------- Permisos que se pierden ---------- */
  console.log('\n6. Revocar accesos');
  const hu = g.E.activo.getSheetByName('Usuarios');
  const filaAna = hu.getRange(1, 1, hu.getLastRow(), 1).getValues().findIndex((x) => x[0] === 'ana.lopez@claro.com.hn') + 1;
  hu.getRange(filaAna, 4).setValue('NO');
  C.onEdit({ range: hu.getRange(filaAna, 4) });   // lo que hace Google cuando alguien edita la hoja a mano
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id } });
  ok(!r.ok && r.codigo === 'SESION', 'si se desactiva en Usuarios, su sesión se corta al instante', r);
  hu.getRange(filaAna, 4).setValue('SÍ'); hu.getRange(filaAna, 3).setValue('concentrix'); C.onEdit({ range: hu.getRange(filaAna, 3) });
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id } });
  ok(!r.ok && r.codigo === 'PERMISO', 'si le cambian el rol a concentrix, pierde el permiso de Workforce al instante', r);
  hu.getRange(filaAna, 3).setValue('workforce'); C.onEdit({ range: hu.getRange(filaAna, 3) });
  hu.appendRow(['karla.zelaya@concentrix.com', 'Karla Zelaya', 'bloqueado', 'SÍ', '']);
  const filaKarla = hu.getLastRow();
  C.onEdit({ range: hu.getRange(filaKarla, 3) });
  r = g.post({ accion: 'estado', token: tAgente });
  ok(!r.ok && r.codigo === 'SESION', 'bloquear a un asesor en Usuarios corta también su sesión abierta', r);
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'y ya no puede volver a entrar', r);
  hu.getRange(filaKarla, 3).setValue('concentrix'); C.onEdit({ range: hu.getRange(filaKarla, 3) });
  r = g.post({ accion: 'estado', token: tAgente });
  ok(r.ok, 'al desbloquearlo, vuelve a funcionar', r);
  C.guardarCuenta('tiendas', 'tiendas', 'NuevaClaveTiendas2026');
  r = g.post({ accion: 'estado', token: tTienda });
  ok(!r.ok && r.codigo === 'SESION', 'al cambiar la contraseña de Tiendas, las sesiones viejas se cierran', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Pedro Mejía', tienda: 'CAC Mall Multiplaza TGU' } });
  const tTienda2 = r.datos.token;

  /* ---------- Posibles fallas y límites ---------- */
  console.log('\n7. Posibles fallas y límites');
  const contratosDe = (n) => [...new Set(Model.filasDeNodos(ix, [n]).map((i) => String(ix.C.contrato[i])))];
  const nodoAlerta = [...ix.nodoIdx.keys()].find((n) => !U.esVirtual(n) && contratosDe(n).length >= 8 && !nodosPrueba.includes(n));
  const cAlerta = contratosDe(nodoAlerta);
  const posibles = (tok) => { g.cache.remove('alertas'); const x = g.post({ accion: 'alertas', token: tok || tWf }); return x.ok ? x.datos : x; };
  const deNodo = (d, n) => (d.alertas || []).find((x) => x.nodo === n);
  // Workforce revisando el nodo no cuenta
  cAlerta.slice(0, 5).forEach((c) => g.post({ accion: 'buscar', token: tWf, datos: { q: c } }));
  ok(!deNodo(posibles(), nodoAlerta), 'las búsquedas de Workforce no cuentan para las posibles fallas');
  cAlerta.slice(0, 3).forEach((c) => g.post({ accion: 'buscar', token: tAgente, datos: { q: c } }));
  let pa = deNodo(posibles(), nodoAlerta);
  ok(pa && pa.nivel === 'observacion' && pa.nClientes === 3, '3 clientes distintos del mismo nodo: en observación (' + nodoAlerta + ')', pa);
  g.post({ accion: 'buscar', token: tAgente, datos: { q: cAlerta[0] } });        // el mismo cliente otra vez no suma
  g.post({ accion: 'buscar', token: tTienda2, datos: { q: cAlerta[3] } });       // uno llega a una tienda
  pa = deNodo(posibles(), nodoAlerta);
  ok(pa && pa.nivel === 'observacion' && pa.nClientes === 4, 'un cliente repetido no suma y Tiendas sí cuenta (4)', pa);
  g.post({ accion: 'buscar', token: tAgente, datos: { q: cAlerta[4] } });
  const dPos = posibles();
  pa = deNodo(dPos, nodoAlerta);
  ok(pa && pa.nivel === 'alerta' && pa.nClientes === 5 && dPos.umbral.clientes === 5 && dPos.umbral.minutos === 60, 'con 5 clientes distintos en 60 min es posible falla', pa);
  // Detalle para el correo
  r = g.post({ accion: 'alerta', token: tWf, datos: { op: 'detalle', nodo: nodoAlerta } });
  const det = r.ok ? r.datos : {};
  const enBase = (c) => Model.filasDeNodos(ix, [nodoAlerta]).map((i) => Model.registro(ix, i)).find((x) => String(x.contrato) === c);
  ok(r.ok && det.clientes.length === 5 && det.nClientes === 5 && det.clientes.every((c) => c.enBase && c.nodo === nodoAlerta && c.nombre === enBase(c.contrato).nombre && c.nap === enBase(c.contrato).nap && c.olt === enBase(c.contrato).olt),
    'el detalle trae los 5 clientes con nombre, NAP/TAP y OLT de la base', det.clientes && det.clientes.map((c) => [c.contrato, c.enBase, c.nodo]));
  ok(det.clientes && det.clientes.find((c) => c.contrato === cAlerta[0]).veces >= 2 && det.clientes.reduce((t, c) => t + c.veces, 0) === det.consultas && det.clientes.some((c) => c.canales.includes('Tiendas: CAC Mall Multiplaza TGU')) && det.desde <= det.hasta,
    'y cuántas veces consultó cada cliente y por qué canal (con la tienda)', det.clientes && det.clientes.map((c) => [c.veces, c.canales]));
  ok(!/"(telefono|dni)"/.test(JSON.stringify(det)), 'el detalle no trae teléfonos ni DNI');
  r = g.post({ accion: 'alerta', token: tAgente, datos: { op: 'detalle', nodo: nodoAlerta } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no puede ver el detalle de una posible falla', r);
  r = g.post({ accion: 'alertas', token: tAgente });
  ok(!r.ok && r.codigo === 'PERMISO', 'ni la lista de posibles fallas');
  // Reportada: la ve todo Workforce y se puede quitar
  r = g.post({ accion: 'alerta', token: tWf, datos: { op: 'reportada', nodo: nodoAlerta } });
  ok(r.ok && r.datos.reportada && r.datos.reportada.por === 'Ana López', 'Workforce marca la posible falla como reportada', r);
  pa = deNodo(posibles(tWfTemp), nodoAlerta);
  ok(pa && pa.reportada && pa.reportada.por === 'Ana López', 'el resto de Workforce ve quién ya la reportó', pa);
  g.post({ accion: 'alerta', token: tWfTemp, datos: { op: 'quitar', nodo: nodoAlerta } });
  pa = deNodo(posibles(), nodoAlerta);
  ok(pa && !pa.reportada, 'la marca se puede quitar', pa);
  const marcas = JSON.parse(g.E.props.get('ALERTAS_REPORTADAS') || '{}');
  marcas[nodoAlerta] = { por: 'Alguien', en: Date.now() - 7 * 3600000 };
  g.E.props.set('ALERTAS_REPORTADAS', JSON.stringify(marcas));
  pa = deNodo(posibles(), nodoAlerta);
  ok(pa && !pa.reportada, 'una marca de hace más de 6 horas ya no cuenta', pa);
  // Dos reportes de asesores en otro nodo también es posible falla
  const nodoRep = [...ix.nodoIdx.keys()].find((n) => !U.esVirtual(n) && contratosDe(n).length >= 3 && n !== nodoAlerta && !nodosPrueba.includes(n));
  contratosDe(nodoRep).slice(0, 2).forEach((c) => g.post({ accion: 'reportar', token: tAgente, datos: { contrato: c, nodo: nodoRep } }));
  pa = deNodo(posibles(), nodoRep);
  ok(pa && pa.nivel === 'alerta' && pa.reportes === 2, 'dos reportes de asesores en un nodo también son posible falla', pa);

  /* Posible falla general: se publica mientras el VOC la confirma; si se descarta, desaparece para los asesores */
  console.log('\n7b. Posible falla general, detección y llamadas del cliente');
  const pausa = () => { const fin = Date.now() + 5; while (Date.now() < fin) { /* que pase el tiempo */ } };
  g.post({ accion: 'buscar', token: tWf, datos: { q: cAlerta[5] } });
  g.post({ accion: 'buscar', token: tAgente, datos: { q: cAlerta[5] } });
  rc = g.post({ accion: 'contactos', token: tAgente, datos: { contrato: cAlerta[5] } });
  ok(rc.ok && rc.datos.veces.length === 1 && rc.datos.n30 === 1, 'las llamadas del cliente (para "Llamó") no cuentan las búsquedas de Workforce', rc.datos);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: [nodoAlerta], motivo: 'VALIDACION', inicio: Date.now() - 5 * 60000 } } });
  const fPos = r.ok ? r.datos.falla : {};
  ok(r.ok && fPos.motivo === 'VALIDACION' && fPos.estado === 'ACTIVA', 'se publica una posible falla general (' + nodoAlerta + ')', r);
  const dt = fPos.deteccion || {};
  ok(dt.llamadas >= 7 && dt.clientes >= 6 && dt.primera && dt.aviso && dt.primera <= dt.aviso && dt.aviso <= fPos.publicadaEn,
    'al publicarla guarda la detección: ' + dt.llamadas + ' llamadas de ' + dt.clientes + ' clientes antes, con la hora del aviso (sin contar a Workforce)', dt);
  const filaPos = () => hFallas.getRange(1, 1, hFallas.getLastRow(), 1).getValues().findIndex((x) => x[0] === fPos.id) + 1;
  ok(hFallas.getRange(filaPos(), 2).getValue() === 'Activa' && hFallas.getRange(filaPos(), 3).getValue() === 'Posible falla general'
    && JSON.parse(hFallas.getRange(filaPos(), 19).getValue()).deteccion.llamadas === dt.llamadas, 'en la hoja Fallas: Activa, Posible falla general y la detección guardada');
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: cAlerta[1] } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === fPos.id && f.motivo === 'VALIDACION') && r.datos.historial[nodoAlerta].some((x) => x.id === fPos.id),
    'el asesor la ve al consultar a un cliente del nodo (y en su historial)', r.datos && r.datos.fallas);
  ok(!deNodo(posibles(), nodoAlerta), 'con la falla publicada, el nodo sale de las posibles fallas');
  // La hora que se escribe al cerrar viene con los minutos redondeados (puede quedar antes de las últimas llamadas)
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: fPos.id, nota: 'El VOC no encontró falla en el nodo', cerradaEn: Date.now() - 60000 } });
  ok(r.ok && r.datos.falla.estado === 'CERRADA' && hFallas.getRange(filaPos(), 2).getValue() === 'Descartada', 'cerrarla sin cambiarle el motivo la deja Descartada', r.datos && r.datos.falla);
  pausa();
  r = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: bv } });
  ok(r.ok && !r.datos.fallas.some((f) => f.id === fPos.id), 'los asesores dejan de verla de inmediato (no queda como resuelta)', r.datos && r.datos.fallas.map((f) => f.id));
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: cAlerta[1] } });
  ok(r.ok && !r.datos.fallas.some((f) => f.id === fPos.id) && !r.datos.historial[nodoAlerta].some((x) => x.id === fPos.id), 'ni en la búsqueda ni en el historial del cliente', r.datos && r.datos.historial);
  r = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: bv } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === fPos.id && f.estado === 'CERRADA' && f.motivo === 'VALIDACION'), 'Workforce la conserva en su historial');
  ok(!deNodo(posibles(), nodoAlerta), 'descartada, el aviso no vuelve a salir con los mismos clientes');
  pausa();
  // Ya llamó uno (cAlerta[1], la búsqueda de arriba); llaman 4 más
  cAlerta.slice(2, 6).forEach((c) => g.post({ accion: 'buscar', token: tAgente, datos: { q: c } }));
  pa = deNodo(posibles(), nodoAlerta);
  ok(pa && pa.nivel === 'alerta' && pa.nClientes === 5, 'si después de descartarla llaman 5 clientes, vuelve a avisar (solo cuenta lo nuevo)', pa);
  r = g.post({ accion: 'alerta', token: tWf, datos: { op: 'detalle', nodo: nodoAlerta } });
  ok(r.ok && r.datos.clientes.length === 5 && !r.datos.enFalla, 'y el correo trae solo esos 5 clientes', r.datos && r.datos.clientes && r.datos.clientes.length);

  /* Supervisores de Call Center: el panel de los asesores más las posibles fallas; reportan al VOC o le avisan
     a Workforce, pero no crean fallas */
  console.log('\n7c. Supervisores de Call Center');
  hu.appendRow(['sofia.mejia@concentrix.com', 'Sofía Mejía', 'supervisor', 'SÍ', '']);
  hu.appendRow(['luis.paz@concentrix.com', 'Luis Paz', 'Supervisor', 'SÍ', '']);
  C.onEdit({ range: hu.getRange(hu.getLastRow(), 3) });
  g.E.genesys.tokens.set('tok-sup', { name: 'Sofia Mejia', email: 'sofia.mejia@concentrix.com' });
  g.E.genesys.tokens.set('tok-sup2', { name: 'Luis Paz', email: 'luis.paz@concentrix.com' });
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-sup' } });
  ok(r.ok && r.datos.usuario.rol === 'supervisor' && r.datos.usuario.nombre === 'Sofía Mejía' && r.datos.usuario.acceso === 'Supervisor', 'un supervisor de la hoja Usuarios entra con Genesys como Supervisor', r);
  const tSup = r.datos.token;
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-sup2' } });
  ok(r.ok && r.datos.usuario.rol === 'supervisor', 'el rol se reconoce aunque lo escriban con mayúscula', r);
  const tSup2 = r.datos.token;
  C.guardarCuenta('supervision.temporal', 'supervisor', 'SupervisionPrueba2026');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'supervision.temporal', clave: 'SupervisionPrueba2026', nombre: 'Marta Díaz' } });
  ok(r.ok && r.datos.usuario.rol === 'supervisor', 'y hay acceso temporal para supervisores', r);
  r = g.post({ accion: 'cargar', token: tSup, datos: { baseVersion: -1 } });
  const paraSup = JSON.stringify(r.ok ? r.datos.fallas : '');
  ok(r.ok && r.datos.catalogo && paraSup.includes(f1.id) && !paraSup.includes('NOC #9150') && !paraSup.includes('historial') && !r.datos.cargas,
    'carga lo mismo que un asesor: las fallas sin referencia ni notas internas, y sin las cargas de la base', paraSup.slice(0, 200));
  pa = deNodo(posibles(tSup), nodoAlerta);
  ok(pa && pa.nivel === 'alerta' && pa.nClientes === 5 && !pa.reportada, 've las posibles fallas (' + nodoAlerta + ')', pa);
  r = g.post({ accion: 'alerta', token: tSup, datos: { op: 'detalle', nodo: nodoAlerta } });
  ok(r.ok && r.datos.clientes.length === 5 && !/"(telefono|dni)"/.test(JSON.stringify(r.datos)), 'y el detalle con los clientes para el correo (sin teléfonos ni DNI)', r.datos && r.datos.clientes && r.datos.clientes.length);
  // Solo Workforce crea y cierra fallas, sube la base, manda SMS, descarga teléfonos y ve estadísticas
  const negado = (accion, datos) => { const x = g.post({ accion, token: tSup, datos }); return !x.ok && x.codigo === 'PERMISO'; };
  ok(negado('falla', { op: 'publicar', falla: { nodos: [nodoAlerta], motivo: 'VALIDACION' } }) && negado('falla', { op: 'cerrar', id: f1.id })
    && negado('base', { op: 'iniciar', total: 10, columnas: Model.columnasCarga(base) }) && negado('sms', { op: 'resumen', id: f1.id })
    && negado('telefonos', { id: f1.id }) && negado('estadisticas', {}), 'no puede crear ni cerrar fallas, subir la base, mandar SMS, descargar teléfonos ni ver estadísticas');
  // Sus búsquedas no cuentan para las posibles fallas: es el supervisor revisando el nodo
  const nodoSup = [...ix.nodoIdx.keys()].find((n) => !U.esVirtual(n) && contratosDe(n).length >= 6 && n !== nodoAlerta && n !== nodoRep && !nodosPrueba.includes(n));
  const llamadas = (c) => g.post({ accion: 'contactos', token: tAgente, datos: { contrato: c } }).datos.veces.length;
  const antesSup = contratosDe(nodoSup).slice(0, 5).map(llamadas);
  contratosDe(nodoSup).slice(0, 5).forEach((c) => g.post({ accion: 'buscar', token: tSup, datos: { q: c } }));
  ok(!deNodo(posibles(), nodoSup), 'las búsquedas de los supervisores no cuentan para las posibles fallas');
  ok(contratosDe(nodoSup).slice(0, 5).map(llamadas).join() === antesSup.join(), 'ni para las llamadas del cliente', antesSup);
  // Le avisa a Workforce con una nota: Workforce la ve y sigue pendiente para ellos
  r = g.post({ accion: 'alerta', token: tSup, datos: { op: 'reportada', nodo: nodoAlerta, a: 'WF', nota: '  Clientes sin internet ni cable desde las 9 '.padEnd(200, '.') } });
  const mSup = r.ok ? r.datos.reportada : {};
  ok(r.ok && mSup.a === 'WF' && mSup.rol === 'supervisor' && mSup.por === 'Sofía Mejía' && mSup.nota.length === 140 && /^Clientes sin internet/.test(mSup.nota),
    'el supervisor le avisa a Workforce, con una nota (hasta 140 letras)', mSup);
  pa = deNodo(posibles(tWf), nodoAlerta);
  ok(pa && pa.reportada && pa.reportada.a === 'WF' && pa.reportada.nota === mSup.nota && pa.reportada.por === 'Sofía Mejía', 'Workforce ve el aviso del supervisor con su nota', pa);
  r = g.post({ accion: 'alerta', token: tSup2, datos: { op: 'quitar', nodo: nodoAlerta } });
  ok(!r.ok && r.codigo === 'PERMISO' && /Sofía Mejía/.test(r.error), 'otro supervisor no puede quitar esa marca', r);
  // Después lo reporta al VOC: queda reportada para Workforce y los demás supervisores
  r = g.post({ accion: 'alerta', token: tSup, datos: { op: 'reportada', nodo: nodoAlerta, a: 'VOC' } });
  ok(r.ok && r.datos.reportada.a === 'VOC' && r.datos.reportada.por === 'Sofía Mejía' && !r.datos.reportada.nota, 'después lo reporta al VOC', r.datos);
  r = g.post({ accion: 'alerta', token: tSup2, datos: { op: 'reportada', nodo: nodoAlerta, a: 'WF', nota: 'Otra vez' } });
  ok(r.ok && r.datos.reportada.a === 'VOC' && r.datos.reportada.por === 'Sofía Mejía', 'un aviso a Workforce ya no tapa la que se reportó al VOC', r.datos);
  pa = deNodo(posibles(tSup2), nodoAlerta);
  ok(pa && pa.reportada && pa.reportada.a === 'VOC', 'los demás supervisores ven que ya se reportó', pa);
  r = g.post({ accion: 'alerta', token: tSup, datos: { op: 'quitar', nodo: nodoAlerta } });
  ok(r.ok && !r.datos.reportada && !deNodo(posibles(), nodoAlerta).reportada, 'quien la puso sí puede quitar su marca', r);
  // Workforce: al marcar siempre queda reportada al VOC (encima del aviso de un supervisor) y quita la de cualquiera
  g.post({ accion: 'alerta', token: tSup2, datos: { op: 'reportada', nodo: nodoAlerta, a: 'WF' } });
  r = g.post({ accion: 'alerta', token: tWf, datos: { op: 'reportada', nodo: nodoAlerta, a: 'WF' } });
  ok(r.ok && r.datos.reportada.a === 'VOC' && r.datos.reportada.por === 'Ana López', 'Workforce al marcarla la deja reportada al VOC, encima del aviso del supervisor', r.datos);
  g.post({ accion: 'alerta', token: tSup2, datos: { op: 'reportada', nodo: nodoAlerta, a: 'WF' } });
  r = g.post({ accion: 'alerta', token: tWfTemp, datos: { op: 'quitar', nodo: nodoAlerta } });
  ok(r.ok && !deNodo(posibles(), nodoAlerta).reportada, 'y cualquiera de Workforce quita la marca de quien sea', r);
  // Al quitarle el rol en Usuarios, pierde las posibles fallas al instante
  const filaLuis = hu.getLastRow();
  hu.getRange(filaLuis, 3).setValue('concentrix'); C.onEdit({ range: hu.getRange(filaLuis, 3) });
  r = g.post({ accion: 'alertas', token: tSup2 });
  ok(!r.ok && r.codigo === 'PERMISO', 'si en Usuarios le cambian el rol a concentrix, deja de ver las posibles fallas al instante', r);
  hu.getRange(filaLuis, 3).setValue('supervisor'); C.onEdit({ range: hu.getRange(filaLuis, 3) });
  g.ejecutar('ALERTAS.LIMITE_CONSULTAS_HORA = 3');
  const tLim = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  g.cache.remove('limite:karla.zelaya@concentrix.com:' + Math.floor(Date.now() / 3600000));
  let ultimo; for (let k = 0; k < 4; k++) ultimo = g.post({ accion: 'buscar', token: tLim, datos: { q: '9999999' } });
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE', 'límite de consultas por hora', ultimo);
  g.ejecutar('ALERTAS.LIMITE_CONSULTAS_HORA = 400');
  // La cuenta de Tiendas la comparten ~200 personas: los errores de una no bloquean a las demás
  for (let k = 0; k < 5; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'mala' + k, nombre: 'Persona Despistada', tienda: 'CAC Mall Premier' } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Persona Despistada', tienda: 'CAC Mall Premier' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'quien se equivoca 5 veces queda bloqueado 15 minutos', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Otra Persona', tienda: 'CAC Mall Premier' } });
  ok(r.ok, 'pero las demás tiendas siguen entrando con la misma cuenta', r);
  for (let k = 0; k < 100; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'adivina' + k, nombre: 'Intruso ' + k, tienda: 'X' + k } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Otra Persona', tienda: 'CAC Mall Premier' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'con 100 contraseñas equivocadas de distintas personas, la cuenta se bloquea 15 minutos', r);
  C.guardarCuenta('tiendas', 'tiendas', 'ClaveTiendasNueva2026');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaveTiendasNueva2026', nombre: 'Otra Persona', tienda: 'CAC Mall Premier' } });
  ok(r.ok, 'al cambiar la contraseña, la cuenta se desbloquea', r);
  const tTienda3 = r.datos.token;
  for (let k = 0; k < 20; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'workforce.temporal', clave: 'adivina' + k, nombre: 'Intruso ' + k } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'workforce.temporal', clave: 'Workforce2026!', nombre: 'Mario Rivera' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'el acceso temporal de Workforce se bloquea antes: con 20 intentos', r);

  /* ---------- Estadísticas ---------- */
  console.log('\n8. Estadísticas');
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  r = g.post({ accion: 'estadisticas', token: tWf, datos: { desde: inicioHoy.getTime(), porHora: true } });
  const hc = g.SpreadsheetApp.openById(g.E.props.get('CONSULTAS_ID')).getSheetByName('Consultas');
  const total = hc.getLastRow() - 1;
  ok(r.ok && r.datos.consultas + r.datos.reportes === total, `estadísticas cuentan las ${total} consultas registradas`, r.datos && [r.datos.consultas, r.datos.reportes]);
  ok(r.ok && r.datos.asesores.some((a) => a.nombre === 'Karla Zelaya') && r.datos.asesores.some((a) => /Multiplaza/.test(a.canal)), 'por asesor y por tienda', r.datos && r.datos.asesores);
  ok(r.ok && r.datos.topContratos.length > 0 && r.datos.topContratos[0].nombre, 'clientes con más consultas en falla, con nombre', r.datos && r.datos.topContratos[0]);
  r = g.post({ accion: 'estadisticas', token: tTienda3, datos: {} });
  ok(!r.ok && r.codigo === 'PERMISO', 'Tiendas no ve estadísticas');
  hc.setName('Consultas_fuera');
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(ix.C.contrato[0]) } });
  hc.setName('Consultas');
  ok(r.ok && r.datos.estado === 'ok', 'si la bitácora falla, la consulta igual responde', r);
  const hll = g.ejecutar('(() => { const out = []; [150, 3000, 20000].forEach((n) => { const r = hll_(); for (let i = 0; i < n; i++) hllSumar_(r, String(1000000 + i * 7)); out.push([n, hllContar_(r), hllContar_(hll_(Utilities.base64Encode(r)))]); }); return out; })()');
  ok(hll.every(([n, e, e2]) => Math.abs(e - n) / n < 0.05 && e === e2), 'clientes distintos de varios días con menos de 5 % de error: ' + hll.map(([n, e]) => e + ' de ' + n).join(', '), hll);

  r = g.post({ accion: 'telefonos', token: tAgente, datos: { id: f1.id } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no puede descargar teléfonos', r);
  r = g.post({ accion: 'telefonos', token: tTienda3, datos: { id: f1.id } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Tiendas tampoco', r);
  if (!base.tieneTelefono) {
    r = g.post({ accion: 'telefonos', token: tWf, datos: { id: f1.id } });
    ok(!r.ok && r.codigo === 'BASE' && /TELEFONO/.test(r.error), 'si la base subida no trae teléfonos, lo dice claro', r);
  }

  /* ---------- Segunda carga ---------- */
  console.log('\n9. Segunda carga semanal (reemplaza la anterior)');
  const b2 = JSON.parse(JSON.stringify(base, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
  const recorte = 120;
  b2.filas = base.filas - recorte;
  for (const k of Object.keys(b2.cols)) b2.cols[k] = b2.cols[k].slice(recorte);
  b2.cols.nodo[0] = b2.cols.nodo[5] !== b2.cols.nodo[0] ? b2.cols.nodo[5] : b2.cols.nodo[0] + 1;
  if (!b2.tieneTelefono) {
    // La base de la semana 2 ya trae teléfonos (ficticios), con los casos que se ven en la base real
    const num = (j, pre) => '504' + pre + String(j).padStart(7, '0').slice(-7);
    b2.cols.telefono = b2.cols.contrato.map((c, i) => {
      if (i % 11 === 0) return '';                                   // sin teléfono
      if (i % 11 === 1) return num(i, '2');                          // solo fijo
      const j = i % 13 === 0 ? i - 1 : i;                            // algunos comparten celular
      return num(j, j % 2 ? '9' : '3') + (i % 3 === 0 ? ' ' + num(i, '2') : '');
    });
    b2.tieneTelefono = true;
  }
  t1 = Date.now();
  r = await subir(b2, tWfTemp, catJson, 'semana 2.xlsx');
  ok(r.ok && r.datos.comparacion && r.datos.comparacion.bajas >= recorte - 5 && r.datos.comparacion.cambiosNodo >= 1,
    `compara con la anterior: ${JSON.stringify(r.datos && r.datos.comparacion)} (${((Date.now() - t1) / 1000).toFixed(1)} s)`, r);
  ok(g.E.activo.getSheetByName('Base').getLastRow() === b2.filas + 1, 'la base anterior se borró y quedó la nueva');
  const hcg = g.E.activo.getSheetByName('Cargas');
  ok(hcg.getLastRow() === 3 && hcg.getRange(3, 2).getValue() === 'Mario Rivera', 'Cargas registra quién subió cada base');
  r = g.post({ accion: 'estado', token: tAgente });
  ok(r.datos.cambio.tipo === 'BASE_ACTUALIZADA' && /Mario Rivera/.test(r.datos.cambio.por.nombre), 'todos reciben el aviso de la base nueva');

  console.log('\n9b. Teléfonos para avisar por SMS (Notifícame)');
  const fa = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.find((f) => f.id === f1.id);
  const setN = new Set(fa.nodos), porC = new Map();
  for (let i = 0; i < b2.filas; i++) {
    if (!setN.has(b2.dicts.nodo[b2.cols.nodo[i]])) continue;
    const c = String(b2.cols.contrato[i]), l = porC.get(c) || [];
    porC.set(c, l);
    String(b2.cols.telefono[i] || '').split(/\s+/).forEach((t) => { if (/^504\d{8}$/.test(t) && !l.includes(t)) l.push(t); });
  }
  const espera = new Set(); let eCel = 0, eFijo = 0, eSin = 0;
  porC.forEach((l) => { const cel = l.find((t) => /^504[3789]/.test(t)); if (cel) { eCel++; espera.add(cel); } else if (l.length) eFijo++; else eSin++; });
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: f1.id } });
  ok(r.ok && r.datos.telefonos.length === espera.size && r.datos.telefonos.every((t) => espera.has(t)) && new Set(r.datos.telefonos).size === r.datos.telefonos.length,
    `${r.datos && r.datos.telefonos.length} celulares sin repetir para los ${porC.size} clientes de ${fa.nodos.join(', ')}`, r.datos && [r.datos.telefonos.length, espera.size]);
  ok(r.ok && r.datos.telefonos.length > 0 && r.datos.telefonos.every((t) => /^504[3789]\d{7}$/.test(t)), 'todos con 504 adelante y 8 dígitos de celular');
  ok(r.ok && r.datos.clientes === porC.size && r.datos.conCelular === eCel && r.datos.soloFijo === eFijo && r.datos.sinTelefono === eSin,
    `cuenta clientes con celular (${eCel}), solo con fijo (${eFijo}) y sin teléfono (${eSin})`, r.datos && [r.datos.clientes, r.datos.conCelular, r.datos.soloFijo, r.datos.sinTelefono]);
  ok(r.ok && /^sms_F1254590_[A-Za-z0-9_\-]+\.csv$/.test(r.datos.archivo), 'nombre del archivo, con el número de falla: ' + (r.datos && r.datos.archivo));
  const hdes = g.E.activo.getSheetByName('Descargas SMS');
  ok(hdes && hdes.getLastRow() === 2 && hdes.getRange(2, 3).getValue() === 'Ana López' && Number(hdes.getRange(2, 7).getValue()) === espera.size,
    'queda anotado quién descargó y cuántos números');
  // Índice de celulares por nodo: la primera vez se arma leyendo la base; después sale del índice (rápido)
  const hCel = g.E.activo.getSheetByName('Celulares');
  const bvAhora = g.post({ accion: 'estado', token: tWf }).datos.baseVersion;
  ok(hCel && hCel.isSheetHidden() && String(hCel.getRange(1, 4).getValue()) === 'base ' + bvAhora && hCel.getLastRow() > 1,
    'la primera vez deja armado el índice de celulares por nodo (pestaña interna, oculta)', hCel && [hCel.getRange(1, 4).getValue(), bvAhora]);
  const hB = g.E.activo.getSheetByName('Base'), iTB = hB.getRange(1, 1, 1, hB.getLastColumn()).getValues()[0].indexOf('TELEFONO') + 1;
  const nB = hB.getLastRow() - 1, telsB = hB.getRange(2, iTB, nB, 1).getValues();
  hB.getRange(2, iTB, nB, 1).setValues(telsB.map(() => ['50499990000']));      // si leyera la base, saldría este número
  const rIdx = g.post({ accion: 'telefonos', token: tWf, datos: { id: f1.id } });
  hB.getRange(2, iTB, nB, 1).setValues(telsB);
  ok(rIdx.ok && rIdx.datos.telefonos.length === espera.size && rIdx.datos.telefonos.every((t) => espera.has(t)) && rIdx.datos.conCelular === eCel && rIdx.datos.soloFijo === eFijo,
    'la segunda vez sale del índice, sin leer la base completa, y da lo mismo', rIdx.datos && [rIdx.datos.telefonos.length, espera.size]);
  hCel.getRange(1, 4).setValue('base 0');      // un índice de otra base no se usa: se vuelve a armar
  const rOtra = g.post({ accion: 'telefonos', token: tWf, datos: { id: f1.id } });
  ok(rOtra.ok && rOtra.datos.telefonos.length === espera.size && String(hCel.getRange(1, 4).getValue()) === 'base ' + bvAhora, 'un índice de otra base no se usa: se arma de nuevo');
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: 'activas' } });
  ok(r.ok && r.datos.fallas.includes('F1254590') && r.datos.telefonos.length >= espera.size && /^sms_fallas_activas_/.test(r.datos.archivo), 'todas las fallas activas en un solo archivo', r.datos && r.datos.fallas);
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: 'F-000000-99' } });
  ok(!r.ok && r.codigo === 'DATOS', 'una falla que no existe da un mensaje claro', r);
  const iTel = [...Array(b2.filas).keys()].find((i) => setN.has(b2.dicts.nodo[b2.cols.nodo[i]]) && b2.cols.telefono[i]);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(b2.cols.contrato[iTel]) } });
  ok(r.ok && r.datos.filas.length > 0 && !JSON.stringify(r.datos).includes(b2.cols.telefono[iTel].split(' ')[0].slice(3)), 'la búsqueda de un asesor no trae teléfonos', r.datos && r.datos.filas[0]);
  r = g.post({ accion: 'base', token: tWf, datos: { op: 'iniciar', total: 10, columnas: Model.columnasCarga(base).slice(0, 14).concat(['OTRA']) } });
  ok(!r.ok && r.codigo === 'DATOS', 'una columna desconocida en la base se rechaza', r);

  /* ---------- SMS con Notifícame ---------- */
  console.log('\n9b2. SMS a los clientes de una falla con Notifícame');
  const N = g.E.notificame;
  const sms = (tok, datos) => g.post({ accion: 'sms', token: tok, datos });
  const conNumeros = (x) => /504[3789]\d{7}/.test(JSON.stringify(x));
  const hEnv = () => g.E.activo.getSheetByName('Envíos SMS');
  const lease = (id) => JSON.parse(g.ejecutar('props_().getProperty(claveEnvioSms_(' + JSON.stringify(id) + '))') || 'null');
  const filasDe = (envio) => { const h = hEnv(); return h && h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, 10).getValues().filter((x) => x[7] === envio) : []; };
  const contar = (filas) => filas.reduce((o, x) => { o[x[5]] = (o[x[5]] || 0) + 1; return o; }, {});
  const repetidos = () => { const c = new Map(); N.enviados.forEach((e) => c.set(e.id, (c.get(e.id) || 0) + 1)); return [...c.values()].filter((v) => v > 1).length; };
  // Manda todos los grupos como la página: cada pedido con el paso en que va
  const mandarTodo = (tok, id, env) => {
    let av = env, lotes = 0;
    while (av.siguiente < av.total && lotes < 300) {
      const x = sms(tok, { op: 'lote', id, envio: env.envio, paso: av.pasos });
      if (!x.ok) return Object.assign({}, av, { fallo: x, lotes });
      av = x.datos; lotes++;
    }
    return Object.assign({ lotes }, av);
  };
  const celularesEsperados = (nodos) => {
    const sn = new Set(nodos), pc = new Map(), out = new Set();
    for (let i = 0; i < b2.filas; i++) {
      if (!sn.has(b2.dicts.nodo[b2.cols.nodo[i]])) continue;
      const c = String(b2.cols.contrato[i]), l = pc.get(c) || [];
      pc.set(c, l);
      String(b2.cols.telefono[i] || '').split(/\s+/).forEach((t) => { if (/^504\d{8}$/.test(t) && !l.includes(t)) l.push(t); });
    }
    pc.forEach((l) => { const cel = l.find((t) => /^504[3789]/.test(t)); if (cel) out.add(cel); });
    return out;
  };

  /* Permisos y conexión */
  r = sms(tAgente, { op: 'resumen', id: f1.id });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no puede mandar SMS', r);
  r = sms(tWf, { op: 'resumen', id: f1.id });
  ok(r.ok && r.datos.configurado === false && r.datos.tipo === 'FALLA' && r.datos.celulares === espera.size && r.datos.faltan === espera.size && r.datos.ya === 0 && !conNumeros(r.datos),
    `el resumen dice cuántos celulares hay (${espera.size}) sin mandar ningún número a la página`, r.datos);
  const aprobados = r.ok ? r.datos.mensajes : [];
  const aprobado = (k) => (aprobados.find((x) => x.id === k) || {}).texto;
  ok(r.ok && r.datos.puede && r.datos.mensajeMotivo === 'FIBRA' && aprobados.map((x) => x.id).join() === 'FIBRA,ENERGIA,CORTO,TERCEROS,POSTES,VIA'
    && aprobado('ENERGIA') === 'CLARO: Estimado cliente, debido a una interrupcion en el suministro electrico en su zona, su servicio podria verse afectado temporalmente. El servicio se normalizara al restablecerse la energia. Gracias.'
    && /^CLARO:\nAviso: Detectamos una posible afectacion en la red/.test(aprobado('FIBRA')),
    'el resumen trae los 6 mensajes aprobados, tal cual, y el del motivo de la falla (corte de fibra)', aprobados.map((x) => x.id));
  r = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  ok(!r.ok && r.codigo === 'NOTIFICAME' && /Conectar Notifícame/.test(r.error), 'sin conectar Notifícame, dice dónde conectarlo', r);
  g.E.usuario = 'otra.persona@claro.com.hn';
  let errN = null;
  try { C.guardarNotificame({ key: N.key, secret: N.secret }); } catch (e) { errN = e.message; }
  g.E.usuario = null;
  ok(errN && /cuenta dueña/.test(errN), 'solo la cuenta dueña del archivo conecta Notifícame', errN);
  let txtN = C.guardarNotificame({ key: N.key, secret: 'secreto-equivocado' });
  ok(/rechazó la llave o el secreto/.test(txtN), 'con un secreto equivocado, la prueba lo dice', txtN);
  txtN = C.guardarNotificame({ key: '', secret: N.secret, prueba: '9999-0001' });
  ok(/Conexión lista/.test(txtN) && /CALL CENTER CLARO/.test(txtN) && /SMS de prueba enviado/.test(txtN) && /respuesta: message_id/.test(txtN) && N.enviados.length === 1 && N.enviados[0].msisdn === '50499990001'
    && N.enviados[0].message === 'Prueba de Alertas: la conexión con Notifícame funciona (señal 1/2).' && N.malFirmados === 1,
    'con la key y la secret buenas: conexión lista y SMS de prueba (con tilde, ñ y barra, bien firmado), con los campos que respondió Notifícame', txtN);
  N.responder = () => ({ codigo: 200, datos: {}, enviado: true });
  txtN = C.guardarNotificame({ key: '', secret: '', prueba: '9999-0001' });
  N.responder = null;
  ok(/sin un dato que confirme el envío: revisa si te llegó/.test(txtN), 'si Notifícame responde sin confirmar el envío, la prueba lo dice', txtN);
  ok(!JSON.stringify(g.post({ accion: 'config' })).includes(N.secret) && !JSON.stringify(sms(tWf, { op: 'resumen', id: f1.id })).includes(N.secret), 'el secreto no sale del servidor');
  N.enviados.length = 0;
  const clas = (codigo, datos) => g.ejecutar('clasificarSms_(' + JSON.stringify({ codigo, datos }) + ').estado');
  ok(clas(200, { message_id: 'M1', status: 'PENDING' }) === 'Enviado' && clas(200, { status: 'SENT' }) === 'Enviado' && clas(201, { id: 'AL-X' }) === 'Enviado'
    && clas(200, {}) === 'Dudoso' && clas(200, []) === 'Dudoso' && clas(200, null) === 'Dudoso' && clas(503, {}) === 'Dudoso'
    && clas(200, { status: 'ERROR' }) === 'Error' && clas(200, { errors: ['x'] }) === 'Error' && clas(200, { success: false }) === 'Error' && clas(400, { error: 'x' }) === 'Error'
    && clas(403, { code: 42900 }) === 'Pendiente' && clas(429, {}) === 'Pendiente' && clas(401, {}) === 'Pendiente',
    'cada respuesta se entiende como en el SDK de Notifícame: enviado solo si lo confirma (message_id o status); si no, en duda');
  const detalleDe = (codigo, datos) => g.ejecutar('clasificarSms_(' + JSON.stringify({ codigo, datos }) + ').detalle');
  ok(detalleDe(200, { message_id: '77', status: 'ERROR', delivery_status: 'UNDELIVERABLE', message: 'Claro informa: hay una falla', error_count: 1, total_recipients: 1 }) === 'Notifícame lo marcó ERROR (UNDELIVERABLE)'
    && detalleDe(200, { message_id: '78', status: 'PENDING', message: 'Claro informa', sent_count: 0, error_count: 0, total_recipients: 1 }) === '78',
    'con la respuesta real de Notifícame (message_id, status, message…): el motivo de un error no es el texto del SMS, y un enviado guarda su message_id');
  ok(g.ejecutar("sinNumeros_('Número 9999-8888, +504 3333 2222 y 50411112222 no válidos; código 40010')") === 'Número …, … y … no válidos; código 40010',
    'a la página no llegan números de teléfono, tampoco con guiones o espacios');

  /* Qué se puede mandar: solo los mensajes aprobados, tal cual */
  r = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', mensaje: 'Hola, este es un texto libre' });
  let r2 = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: '__proto__' });
  const r3 = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'RESTABLECIDO' });
  ok(!r.ok && r.codigo === 'DATOS' && /mensajes aprobados/.test(r.error) && !r2.ok && r2.codigo === 'DATOS' && !r3.ok && N.enviados.length === 0,
    'un texto libre o una clave que no es de un mensaje aprobado se rechaza (no sale nada)', [r, r2, r3]);
  r = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'RESTABLECIDO', aprobado: 'FIBRA' });
  ok(!r.ok && r.codigo === 'DATOS', 'si la página cree que la falla está en otro estado, se rechaza', r);
  r = sms(tWf, { op: 'resumen', id: fPos.id });
  r2 = sms(tWf, { op: 'iniciar', id: fPos.id, aprobado: 'ENERGIA' });
  ok(r.ok && r.datos.puede === false && /cuando el servicio se restablece no se manda SMS/.test(r.datos.noPuede) && !r2.ok && /restablece/.test(r2.error),
    'a una falla cerrada (o descartada) no se le manda SMS', [r.datos && r.datos.noPuede, r2]);
  const activos0 = new Set(g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
  const nodoEq = b2.dicts.nodo.find((n) => /^[A-Z]{3}(GC)?\d{2}$/.test(String(n)) && !activos0.has(n) && !setN.has(n));
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: [nodoEq], motivo: 'EQUIPO' } } });
  const fEq = r.ok ? r.datos.falla : {};
  r = sms(tWf, { op: 'resumen', id: fEq.id });
  r2 = sms(tWf, { op: 'iniciar', id: fEq.id, tipo: 'FALLA', aprobado: 'ENERGIA' });
  ok(r.ok && r.datos.puede === false && /Reemplazo de equipo" no tiene un mensaje aprobado/.test(r.datos.noPuede) && r.datos.mensajeMotivo === '' && !r2.ok && /no tiene un mensaje aprobado/.test(r2.error),
    'una falla de un motivo sin mensaje aprobado (reemplazo de equipo) no manda SMS', [r.datos && r.datos.noPuede, r2]);
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: fEq.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });

  /* Envío normal: primero se apartan todos, después se mandan de 50 en 50 */
  const msj = aprobado('FIBRA');
  // Una pestaña Envíos SMS de la versión anterior (9 columnas, sin "Control"): se completa sola
  const hVieja = g.E.activo.insertSheet('Envíos SMS');
  hVieja.getRange(1, 1, 1, 9).setValues([['Fecha', 'Falla', 'ID de Alertas', 'Tipo', 'Teléfono', 'Estado', 'Detalle', 'Envío', 'Envió']]);
  if (hVieja.getMaxColumns() > 9) hVieja.deleteColumns(10, hVieja.getMaxColumns() - 9);
  const filasAntes0 = hEnv() ? hEnv().getLastRow() : 1;
  r = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  const env1 = r.ok ? r.datos : {};
  ok(r.ok && env1.total === espera.size && env1.ya === 0 && env1.pasos === 0 && contar(filasDe(env1.envio)).Pendiente === espera.size && N.enviados.length === 0 && !conNumeros(r.datos),
    `iniciar aparta los ${espera.size} celulares en Envíos SMS (Pendiente) antes de mandar nada`, r.datos);
  ok(lease(f1.id) && lease(f1.id).envio === env1.envio, 'el envío en curso queda en Propiedades del script (no en la caché, que Google puede borrar)');
  ok(hEnv().getRange(1, 10).getValue() === 'Control' && hEnv().getMaxColumns() >= 10, 'a una pestaña Envíos SMS de antes se le agrega sola la columna Control');
  r = sms(tWfTemp, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  ok(!r.ok && r.codigo === 'OCUPADO' && /Ana López está enviando/.test(r.error), 'mientras tanto, otra persona de Workforce no puede mandar a la misma falla', r);
  r = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  ok(r.ok && r.datos.reanudado && r.datos.envio === env1.envio && hEnv().getLastRow() === filasAntes0 + espera.size, 'si la misma persona vuelve con el mismo mensaje (recargó la página), sigue el mismo envío', r.datos);
  const lista1 = [...espera];
  const sinSaldo = lista1[1], malos = [lista1[3], lista1[7]], html = lista1[11], caido503 = lista1[17];
  malos.forEach((x) => N.rechazar.add(x));
  N.responder = (b) => (b.msisdn === html ? { codigo: 200, datos: '<html><body>OK</body></html>', enviado: true }
    : b.msisdn === sinSaldo ? { codigo: 200, datos: { error: 'Saldo insuficiente para el 50499998888' }, enviado: false }
    : b.msisdn === caido503 ? { codigo: 503, datos: { error: 'Service Unavailable' }, enviado: true } : null);
  const av1 = mandarTodo(tWf, f1.id, env1);
  N.responder = null;
  ok(!av1.fallo && av1.siguiente === env1.total && av1.enviados === espera.size - 5 && av1.errores === 3 && av1.dudosos === 2 && av1.lotes === Math.ceil(env1.total / 50) && !conNumeros(av1),
    `de 50 en 50 (${av1.lotes} grupos): ${av1.enviados} enviados, 3 rechazados y 2 en duda (respuesta sin datos o 503)`, av1);
  ok(/^(Número no válido|Saldo insuficiente para el …)$/.test(av1.error), 'el error que llega a la página no trae números de teléfono: "' + av1.error + '"');
  ok(N.malFirmados === 1 && repetidos() === 0 && N.enviados.every((e) => e.message === msj && espera.has(e.msisdn) && e.id === 'AL-' + f1.id + '-F-' + e.msisdn),
    'cada pedido va firmado, con el mensaje aprobado exacto (con su salto de línea), un id fijo por falla, aviso y número, y sin repetir', [N.malFirmados, N.enviados.length, N.enviados[0]]);
  const antesRep = N.enviados.length;
  r = sms(tWf, { op: 'lote', id: f1.id, envio: env1.envio, paso: 0 });
  ok(r.ok && N.enviados.length === antesRep && r.datos.enviados === av1.enviados && r.datos.pasos === av1.pasos, 'si la página repite un grupo que ya se hizo (se cortó la respuesta), no se manda otra vez', r.datos);
  r = sms(tWfTemp, { op: 'lote', id: f1.id, envio: env1.envio, paso: av1.pasos });
  ok(!r.ok && r.codigo === 'PERMISO', 'otra persona no puede mover un envío ajeno', r);
  r = sms(tWf, { op: 'terminar', id: f1.id, envio: env1.envio });
  const fs1 = r.ok && r.datos.falla;
  ok(fs1 && fs1.sms.length === 1 && fs1.sms[0].enviados === espera.size - 5 && fs1.sms[0].dudosos === 2 && fs1.historial.some((h) => h.accion === 'SMS' && /^Aviso de falla a \d+ clientes \(3 con error, 2 en duda\)$/.test(h.detalle)),
    'al terminar queda en la falla y en su historial: "Aviso de falla a N clientes (3 con error, 2 en duda)"', fs1 && fs1.historial.slice(-1));
  r = sms(tWf, { op: 'terminar', id: f1.id, envio: env1.envio });
  ok(r.ok && r.datos.terminado && !r.datos.falla && !lease(f1.id), 'terminar otra vez no hace nada (si se cortó la respuesta)', r);
  const est1 = contar(filasDe(env1.envio));
  ok(est1.Enviado === espera.size - 5 && est1.Error === 3 && est1.Dudoso === 2 && typeof filasDe(env1.envio)[0][4] === 'string' && filasDe(env1.envio)[0][3] === 'FALLA',
    'en Envíos SMS cada número queda con su estado (Enviado, Error o Dudoso) y el teléfono como texto', est1);
  ok(!/"sms"/.test(JSON.stringify(g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: -1 } }).datos.fallas)), 'los asesores no reciben los envíos de SMS de la falla');

  /* Mandarlo otra vez: solo a quienes falta */
  N.rechazar.clear();
  r = sms(tWf, { op: 'resumen', id: f1.id });
  ok(r.ok && r.datos.configurado && r.datos.ya === espera.size - 5 && r.datos.enDuda === 2 && r.datos.faltan === 3 && r.datos.envios.length === 1 && !r.datos.enCurso,
    'el resumen sabe a cuántos ya les llegó y cuántos quedaron en duda: faltan los 3 con error', r.datos);
  r = sms(tWfTemp, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  const env2 = r.ok ? r.datos : {};
  ok(r.ok && env2.total === 3 && env2.ya === espera.size - 5 && env2.enDuda === 2, 'otra vez solo va a los 3 con error (ya lo puede mandar otra persona); a los que quedaron en duda no se les reenvía', r.datos);
  const av2 = mandarTodo(tWfTemp, f1.id, env2);
  r = sms(tWfTemp, { op: 'terminar', id: f1.id, envio: env2.envio });
  const unaVez = new Set(N.enviados.filter((e) => e.id.indexOf('AL-' + f1.id + '-F-') === 0).map((e) => e.msisdn));
  ok(av2.enviados === 3 && repetidos() === 0 && unaVez.size === espera.size && r.ok && r.datos.falla.sms.length === 2, 'con eso le llegó a todos, una sola vez a cada uno', [av2, unaVez.size]);

  /* Cuando el servicio se restablece no se manda SMS */
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });
  r2 = sms(tWf, { op: 'resumen', id: f1.id });
  const r4 = sms(tWf, { op: 'iniciar', id: f1.id, tipo: 'RESTABLECIDO', aprobado: 'FIBRA' });
  ok(r.ok && r.datos.falla.estado === 'CERRADA' && r2.ok && !r2.datos.puede && /no se manda SMS/.test(r2.datos.noPuede) && !r4.ok && r4.codigo === 'DATOS',
    'al cerrar la falla ya no se manda SMS (no hay aviso de servicio restablecido)', [r2.datos && r2.datos.noPuede, r4]);
  g.post({ accion: 'falla', token: tWf, datos: { op: 'reabrir', id: f1.id } });

  /* Otra falla (caída de postes) para probar el límite de Notifícame, la conexión caída y los grupos que tardan */
  const porNodo = new Map();
  for (let i = 0; i < b2.filas; i++) { if (/(^|\s)504[3789]/.test(String(b2.cols.telefono[i] || ''))) { const n = b2.dicts.nodo[b2.cols.nodo[i]]; porNodo.set(n, (porNodo.get(n) || 0) + 1); } }
  const activosR = new Set(g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
  const nodosR = [];
  for (const [n] of [...porNodo].sort((a, b) => b[1] - a[1])) { if (activosR.has(n) || setN.has(n)) continue; nodosR.push(n); if (celularesEsperados(nodosR).size >= 150 || nodosR.length >= 12) break; }
  const esperaR = celularesEsperados(nodosR);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodosR, motivo: 'POSTES' } } });
  const fR = r.ok ? r.datos.falla : {};
  const msjR = aprobado('POSTES');
  const paraAsesorR = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: -1 } }).datos.fallas.find((f) => f.id === fR.id);
  const paraWfR = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.find((f) => f.id === fR.id);
  ok(r.ok && fR.motivo === 'POSTES' && paraAsesorR && paraAsesorR.motivo === 'OTRO' && paraAsesorR.motivoTexto === 'Caída de postes' && /caída de postes/.test(paraAsesorR.clienteTexto)
    && paraWfR && paraWfR.motivo === 'POSTES',
    'se publica con un motivo nuevo; a los asesores les llega como "Otro" con su nombre y su texto (una página abierta desde antes lo muestra bien) y a Workforce, el real',
    [paraAsesorR && paraAsesorR.motivo, paraWfR && paraWfR.motivo]);
  r = sms(tWf, { op: 'iniciar', id: fR.id, tipo: 'FALLA', aprobado: 'POSTES' });
  const env3 = r.ok ? r.datos : {};
  ok(r.ok && env3.total === esperaR.size && esperaR.size >= 100, 'una falla por caída de postes, con su mensaje aprobado, a ' + esperaR.size + ' celulares', r.datos);
  const enviadosR = () => N.enviados.filter((e) => e.id.indexOf('AL-' + fR.id + '-F-') === 0).length;
  N.limite = { porLote: 10, lotes: 2 };
  N.grupos.length = 0;
  const sx1 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: 0 });
  const sx2 = sx1.ok ? sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx1.datos.pasos }) : sx1;
  ok(sx1.ok && sx1.datos.enviados === 10 && sx1.datos.pausa === 5 && /más despacio/.test(sx1.datos.aviso) && sx2.ok && sx2.datos.enviados === 20 && sx2.datos.pausa === 10 && N.grupos.join() === '50,25',
    'si Notifícame pide esperar (403 con código 42900), sigue solo: más despacio (50, luego 25) y con pausas', [sx1.datos, sx2.datos, N.grupos]);
  ok(contar(filasDe(env3.envio)).Pendiente === esperaR.size - 20 && enviadosR() === 20, 'los que no salieron por el límite vuelven a Pendiente para el siguiente grupo');
  const sx3 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx2.datos.pasos });
  ok(sx3.ok && !sx3.datos.pausa && N.grupos[2] === 12 && sx3.datos.enviados === 32, 'pasado el límite sigue normal (y vuelve a subir de a 10 por grupo)', [sx3.datos, N.grupos]);
  N.cortarTras = 5;
  const sx4 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx3.datos.pasos });
  ok(sx4.ok && N.grupos[3] === 22 && sx4.datos.dudosos === 22 && sx4.datos.pausa === 10 && /no respondió/.test(sx4.datos.aviso) && enviadosR() === 37,
    'si la conexión se cae a medio grupo, los 22 quedan en duda (5 sí habían salido) y el envío sigue', sx4.datos);
  const dentro = {};
  N.durante = () => {
    dentro.otro = sms(tWfTemp, { op: 'iniciar', id: fR.id, tipo: 'FALLA', aprobado: 'POSTES' });
    dentro.resumen = sms(tWfTemp, { op: 'resumen', id: fR.id });
    dentro.repetido = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx4.datos.pasos });
    dentro.terminar = sms(tWf, { op: 'terminar', id: fR.id, envio: env3.envio });
    g.E.ahora = Date.now() + 5 * 60000;                       // pasan 5 minutos y el grupo sigue sin terminar
    dentro.tarde = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx4.datos.pasos });
  };
  const sx5 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: sx4.datos.pasos });
  g.E.ahora = null;
  const enC = dentro.resumen && dentro.resumen.ok && dentro.resumen.datos.enCurso;
  ok(dentro.otro && !dentro.otro.ok && dentro.otro.codigo === 'OCUPADO' && enC && enC.por === 'Ana López' && !enC.mio && !enC.mensaje && !enC.libre,
    'mientras un grupo va en camino, otra persona ve quién está enviando (sin el mensaje) y no puede empezar otro', dentro.otro);
  ok(dentro.repetido && !dentro.repetido.ok && dentro.repetido.codigo === 'OCUPADO' && !dentro.terminar.ok && dentro.terminar.codigo === 'OCUPADO',
    'si la página repite el pedido o lo detiene mientras el grupo va en camino, espera: no se manda dos veces', [dentro.repetido, dentro.terminar]);
  ok(dentro.tarde && dentro.tarde.ok && dentro.tarde.datos.dudosos === 33 && dentro.tarde.datos.pasos === sx4.datos.pasos + 1,
    'un grupo que lleva más de 4 minutos se da por cortado: sus 11 quedan en duda y se sigue con el resto', dentro.tarde && dentro.tarde.datos);
  ok(sx5.ok && sx5.datos.dudosos === 33 && enviadosR() === 48 && contar(filasDe(env3.envio)).Dudoso === 33, 'cuando ese grupo por fin termina, no cambia lo ya anotado ni se vuelve a mandar', sx5.datos);
  N.durante = () => { g.E.candadoOcupado = 3; };            // el servidor no se desocupa para anotar el grupo
  const antesStash = enviadosR();
  const sx6 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: dentro.tarde.datos.pasos });
  const g6 = N.grupos[N.grupos.length - 1], l6 = lease(fR.id);
  ok(!sx6.ok && sx6.codigo === 'OCUPADO' && /no se le repite/.test(sx6.error) && l6 && l6.vuelo && l6.vuelo.res && l6.vuelo.res.length === g6 && enviadosR() === antesStash + g6,
    'si el servidor está muy ocupado para anotar un grupo que ya salió, lo que pasó queda guardado en el envío', [sx6, l6 && l6.vuelo]);
  const sx7 = sms(tWf, { op: 'lote', id: fR.id, envio: env3.envio, paso: dentro.tarde.datos.pasos });
  ok(sx7.ok && sx7.datos.pasos === dentro.tarde.datos.pasos + 1 && sx7.datos.enviados === sx5.datos.enviados + g6 && enviadosR() === antesStash + g6,
    'al repetir el pedido se anota sin volver a mandarlo', sx7.datos);
  const av3 = mandarTodo(tWf, fR.id, Object.assign({}, env3, sx7.datos));
  r = sms(tWf, { op: 'terminar', id: fR.id, envio: env3.envio });
  const estR = contar(filasDe(env3.envio));
  ok(!av3.fallo && av3.siguiente === env3.total && av3.enviados + av3.dudosos === esperaR.size && estR.Enviado === av3.enviados && estR.Dudoso === 33 && repetidos() === 0 && enviadosR() === av3.enviados + 5 + 11,
    `al final: ${av3.enviados} enviados y 33 en duda; a nadie le llegó dos veces`, [av3, estR]);
  ok(r.ok && /^Aviso de falla a \d+ clientes \(33 en duda\)$/.test(r.datos.falla.historial.slice(-1)[0].detalle), 'y queda en el historial de la falla', r.datos && r.datos.falla && r.datos.falla.historial.slice(-1));
  r = sms(tWf, { op: 'iniciar', id: fR.id, tipo: 'FALLA', aprobado: 'POSTES' });
  ok(r.ok && r.datos.total === 0 && r.datos.enDuda === 33 && !lease(fR.id), 'sin pedirlo, a los 33 en duda no se les manda otra vez', r.datos);
  r = sms(tWf, { op: 'iniciar', id: fR.id, tipo: 'FALLA', aprobado: 'POSTES', dudosos: true });
  const envD = r.ok ? r.datos : {};
  const avD = mandarTodo(tWf, fR.id, envD);
  sms(tWf, { op: 'terminar', id: fR.id, envio: envD.envio });
  r = sms(tWf, { op: 'resumen', id: fR.id });
  ok(envD.total === 33 && avD.enviados === 33 && r.ok && r.datos.enDuda === 0 && r.datos.ya === esperaR.size, 'si se pide a propósito, también se les manda a los que quedaron en duda', [envD.total, avD.enviados, r.datos && r.datos.ya]);
  // Ese reenvío repitió a propósito a 16 que sí habían recibido el SMS: no cuentan para las revisiones de repetidos que siguen
  for (let i = N.enviados.length - 1; i >= 0; i--) if (N.enviados[i].id.indexOf('AL-' + fR.id + '-F-') === 0) N.enviados.splice(i, 1);
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: fR.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });

  /* Otra falla: límite diario, llave que deja de servir, cambio de mensaje, rechazos y mantenimiento */
  const activasN = new Set(g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
  const nodos2 = [];
  for (const [n] of [...porNodo].sort((a, b) => b[1] - a[1])) { if (activasN.has(n) || setN.has(n) || nodosR.includes(n)) continue; nodos2.push(n); if (celularesEsperados(nodos2).size >= 230 || nodos2.length >= 12) break; }
  const espera2 = celularesEsperados(nodos2);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodos2, motivo: 'ENERGIA' } } });
  const f2 = r.ok ? r.datos.falla : {};
  ok(r.ok && espera2.size >= 230, `otra falla para seguir probando: ${nodos2.length} nodos, ${espera2.size} celulares`, r.ok ? espera2.size : r);
  g.ejecutar("props_().setProperty('SMS_CUOTA', JSON.stringify({ dia: cuotaSms_().dia, usados: ALERTAS.SMS_POR_DIA - 40 }))");
  r = sms(tWf, { op: 'iniciar', id: f2.id, tipo: 'FALLA', aprobado: 'ENERGIA' });
  const env4 = r.ok ? r.datos : {};
  ok(r.ok && env4.total === 40 && env4.quedanHoy === 40 && env4.paraManana === espera2.size - 40 && sms(tWf, { op: 'resumen', id: f2.id }).datos.quedanHoy === 0,
    'con el límite diario casi lleno, solo aparta los que caben hoy; el resto queda para mañana', r.datos);
  const secreto = N.secret;
  N.secret = 'OTRO-SECRETO';                                  // regeneraron las credenciales en Notifícame
  r = sms(tWf, { op: 'lote', id: f2.id, envio: env4.envio, paso: 0 });
  N.secret = secreto;
  ok(!r.ok && r.codigo === 'NOTIFICAME' && /rechazó la llave/.test(r.error) && contar(filasDe(env4.envio)).Pendiente === 40 && lease(f2.id).enviados === 0,
    'si la llave deja de servir, se detiene y lo dice; esos SMS no cuentan como enviados', r);
  N.caido = true;                                             // Google no llega a Notifícame
  r = sms(tWf, { op: 'lote', id: f2.id, envio: env4.envio, paso: lease(f2.id).pasos });
  N.caido = 'Service invoked too many times for one day: urlfetch.';
  r2 = sms(tWf, { op: 'lote', id: f2.id, envio: env4.envio, paso: lease(f2.id).pasos });
  N.caido = false;
  ok(!r.ok && r.codigo === 'NOTIFICAME' && /Google no pudo conectarse con Notifícame/.test(r.error) && !/https?:/.test(r.error) && !r2.ok && /cuota de Google/.test(r2.error)
    && contar(filasDe(env4.envio)).Pendiente === 40 && lease(f2.id).dudosos === 0,
    'si Google no llega a Notifícame (o se acabó su cuota del día), ese grupo no salió: vuelve a Pendiente en vez de quedar en duda', [r, r2]);
  r = sms(tWf, { op: 'terminar', id: f2.id, envio: env4.envio });
  ok(r.ok && !r.datos.falla && contar(filasDe(env4.envio)).Cancelado === 40 && sms(tWf, { op: 'resumen', id: f2.id }).datos.quedanHoy === 40,
    'al detenerlo, lo apartado queda Cancelado (para el próximo envío) y vuelve al límite de hoy', r.datos);
  g.ejecutar("props_().deleteProperty('SMS_CUOTA')");
  r = sms(tWf, { op: 'iniciar', id: f2.id, tipo: 'FALLA', aprobado: 'ENERGIA' });
  const env5 = r.ok ? r.datos : {};
  r2 = env5.envio ? sms(tWf, { op: 'lote', id: f2.id, envio: env5.envio, paso: 0 }) : r;
  ok(r.ok && env5.total === espera2.size && r2.ok && r2.datos.enviados === 50, 'los cancelados vuelven a entrar en el siguiente envío', [r.datos, r2.datos]);
  r = sms(tWf, { op: 'iniciar', id: f2.id, tipo: 'FALLA', aprobado: 'CORTO' });
  const env6 = r.ok ? r.datos : {};
  const f2a = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.find((f) => f.id === f2.id);
  ok(r.ok && !r.datos.reanudado && env6.envio !== env5.envio && env6.total === espera2.size - 50 && f2a.sms.length === 1 && /se detuvo antes de terminar/.test(f2a.historial.slice(-1)[0].detalle),
    'si cambia el mensaje, el envío anterior se cierra (queda anotado) y el nuevo va a quienes faltan', [r.datos, f2a.historial.slice(-1)]);
  N.responder = () => ({ codigo: 400, datos: { code: 40010, error: 'Cuenta sin saldo (cliente 50433332222)' } });
  const sx8 = sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: 0 });
  const sx9 = sx8.ok ? sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: sx8.datos.pasos }) : sx8;
  N.responder = null;
  ok(sx8.ok && sx8.datos.errores === 50 && !sx9.ok && sx9.codigo === 'NOTIFICAME' && /rechazó dos grupos completos/.test(sx9.error) && !/\d{7,}/.test(sx9.error) && !/\d{7,}/.test(sx8.datos.error),
    'si Notifícame rechaza dos grupos completos (por ejemplo, sin saldo), se detiene para no seguir gastando (sin números en el mensaje)', [sx8.datos, sx9]);
  N.limite = { porLote: 0, lotes: 10 };
  N.grupos.length = 0;
  let paso = lease(f2.id).pasos, xs = [];
  for (let k = 0; k < 6; k++) { const x = sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso }); xs.push(x); if (!x.ok) break; paso = x.datos.pasos; }
  N.limite = null;
  const ult = xs[xs.length - 1];
  ok(xs.length === 6 && xs.slice(0, 5).every((x) => x.ok && x.datos.pausa > 0) && !ult.ok && /sigue pidiendo esperar/.test(ult.error) && N.grupos.join() === '50,25,12,6,5,5',
    'si Notifícame pide esperar 6 veces seguidas, se detiene (cada vez con grupos más chicos: ' + N.grupos.join(', ') + ')', xs.map((x) => (x.ok ? x.datos.pausa : x.error)));
  g.ejecutar("(() => { const orig = guardarEnvioSms_; globalThis.__fallarGuardar = 0; guardarEnvioSms_ = function (m) { if (globalThis.__fallarGuardar > 0) { globalThis.__fallarGuardar--; throw new Error('Propiedades no disponibles'); } return orig(m); }; })()");
  const antesG = lease(f2.id), enviosAntesG = N.enviados.length;
  N.durante = () => { g.ejecutar('globalThis.__fallarGuardar = 1'); };   // el grupo sale y se anota en la hoja, pero el envío no se guarda
  r = sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: antesG.pasos });
  const grupoG = N.enviados.length - enviosAntesG, lg = lease(f2.id);
  g.E.ahora = Date.now() + 5 * 60000;
  r2 = sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: antesG.pasos });
  g.E.ahora = null;
  ok(!r.ok && grupoG > 0 && lg.vuelo && lg.vuelo.filas.length === grupoG && r2.ok && r2.datos.pasos === antesG.pasos + 1 && r2.datos.enviados === antesG.enviados + grupoG
    && r2.datos.dudosos === antesG.dudosos && N.enviados.length === enviosAntesG + grupoG && contar(filasDe(env6.envio)).Enviado === antesG.enviados + grupoG,
    'si el grupo se anotó pero el envío no se pudo guardar, al retomarlo respeta lo anotado: cuenta los ' + grupoG + ' enviados y no los reenvía', [r, r2.datos]);
  /* Dos fallas enviando a la vez, y el mantenimiento borrando filas viejas en medio */
  const activas3 = new Set(g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
  const nodos3 = [];
  for (const [n] of [...porNodo].sort((a, b) => b[1] - a[1])) { if (activas3.has(n) || setN.has(n) || nodosR.includes(n) || nodos2.includes(n)) continue; nodos3.push(n); if (celularesEsperados(nodos3).size >= 150 || nodos3.length >= 12) break; }
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodos3, motivo: 'FIBRA' } } });
  const f3 = r.ok ? r.datos.falla : {};
  g.ejecutar("(() => { const orig = agregarFilas_; globalThis.__fallarFilas = 1; agregarFilas_ = function () { if (globalThis.__fallarFilas > 0) { globalThis.__fallarFilas--; throw new Error('Hoja no disponible'); } return orig.apply(null, arguments); }; })()");
  const filasAntesF = hEnv().getLastRow();
  r = sms(tWfTemp, { op: 'iniciar', id: f3.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  ok(!r.ok && !lease(f3.id) && hEnv().getLastRow() === filasAntesF, 'si no se pueden apartar las filas, no queda un envío a medias que trabe la falla', r);
  r = sms(tWfTemp, { op: 'iniciar', id: f3.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  const env7 = r.ok ? r.datos : {};
  ok(r.ok && env7.total >= 150 && lease(f2.id) && lease(f3.id) && lease(f3.id).n === 'Mario Rivera', 'otra persona manda a otra falla al mismo tiempo (' + env7.total + ' celulares)', r);
  const sy1 = sms(tWfTemp, { op: 'lote', id: f3.id, envio: env7.envio, paso: 0 });
  const sy2 = sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: lease(f2.id).pasos });
  const hEnvios = hEnv();
  const viejos = 5, hace41 = new Date(Date.now() - 41 * 86400000), hace3h = new Date(Date.now() - 3 * 3600000);
  hEnvios.getRange(2, 1, viejos, 1).setValues(Array.from({ length: viejos }, () => [hace41]));
  // Filas que quedaron apartadas sin un envío en curso (algo falló a medias), de hace 3 horas
  hEnvios.appendRow([hace3h, 'F0', 'F0', 'FALLA', '', 'Pendiente', '', 'SHUERFANO', 'Prueba']);
  hEnvios.appendRow([hace3h, 'F0', 'F0', 'FALLA', '', 'Enviando', '', 'SHUERFANO', 'Prueba']);
  hEnvios.appendRow([hace3h, 'F0', 'F0', 'FALLA', '', 'Enviado', 'M1', 'SHUERFANO', 'Prueba']);
  const filasAntes = hEnvios.getLastRow();
  const mant = C.limpiarConsultas();
  ok(mant.smsBorrados === viejos && hEnvios.getLastRow() === filasAntes - viejos && lease(f2.id) && lease(f3.id), 'el mantenimiento borra los envíos de más de 40 días (y no cierra los que van en curso)', mant);
  ok(mant.smsHuerfanos === 2 && contar(filasDe('SHUERFANO')).Cancelado === 1 && contar(filasDe('SHUERFANO')).Dudoso === 1 && contar(filasDe('SHUERFANO')).Enviado === 1,
    'y libera las filas que quedaron apartadas sin envío: Pendiente pasa a Cancelado y Enviando a Dudoso', mant);
  const sy3 = sy1.ok ? sms(tWfTemp, { op: 'lote', id: f3.id, envio: env7.envio, paso: sy1.datos.pasos }) : sy1;
  const sy4 = sy2.ok ? sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: sy2.datos.pasos }) : sy2;
  const idsDe = (f) => N.enviados.filter((e) => e.id.indexOf('AL-' + f.id + '-F-') === 0).length;
  const e5 = contar(filasDe(env5.envio)), e6 = contar(filasDe(env6.envio)), e7 = contar(filasDe(env7.envio));
  ok(sy1.ok && sy2.ok && sy3.ok && sy4.ok && e7.Enviado === sy3.datos.enviados && e7.Enviado === idsDe(f3) && e6.Enviado === sy4.datos.enviados && idsDe(f2) === 50 + e6.Enviado
    && e5.Enviado === 50 && e5.Cancelado === env5.total - 50 && repetidos() === 0,
    'cada envío anota solo sus filas, aunque se intercalen y se borren filas de arriba', [e5, e6, e7, sy3.datos && sy3.datos.enviados, sy4.datos && sy4.datos.enviados]);
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f3.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });
  r = sms(tWfTemp, { op: 'lote', id: f3.id, envio: env7.envio, paso: sy3.datos.pasos });
  r2 = sms(tWfTemp, { op: 'terminar', id: f3.id, envio: env7.envio });
  ok(!r.ok && r.codigo === 'DATOS' && /se cerró mientras se enviaba/.test(r.error) && idsDe(f3) === sy3.datos.enviados && r2.ok && /se detuvo antes de terminar/.test(r2.datos.falla.historial.slice(-1)[0].detalle),
    'si cierran la falla a medio envío, el aviso de falla se detiene solo (no sale para los que faltaban)', [r, r2.datos && r2.datos.falla && r2.datos.falla.historial.slice(-1)]);
  const l9 = lease(f2.id);
  [f2].forEach((f) => g.ejecutar('(() => { const m = envioSmsDe_(' + JSON.stringify(f.id) + '); m.renovado = Date.now() - 3 * 3600000; guardarEnvioSms_(m); })()'));
  C.limpiarConsultas();
  const fallasAhora = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas;
  const f2b = fallasAhora.find((f) => f.id === f2.id), f3b = fallasAhora.find((f) => f.id === f3.id);
  ok(!lease(f2.id) && !lease(f3.id) && (contar(filasDe(env6.envio)).Cancelado || 0) === env6.total - l9.errores - l9.enviados - l9.dudosos && f2b.sms.length === 2 && f3b.sms.length === 1
    && /se cortó y se cerró solo/.test(f2b.historial.slice(-1)[0].detalle), 'el mantenimiento cierra los envíos que quedaron abiertos más de 2 horas (lo no enviado queda para el próximo)', f2b.historial.slice(-1));
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f2.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });

  /* Números de control: los celulares del equipo reciben cada mensaje, para confirmar que llegó */
  const activas4 = new Set(g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
  const nodos4 = [];
  for (const [n] of [...porNodo].sort((a, b) => b[1] - a[1])) {
    if (activas4.has(n) || setN.has(n) || nodosR.includes(n) || nodos2.includes(n) || nodos3.includes(n)) continue;
    nodos4.push(n);
    if (celularesEsperados(nodos4).size >= 60 || nodos4.length >= 12) break;
  }
  const espera4 = celularesEsperados(nodos4);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodos4, motivo: 'ENERGIA' } } });
  const f4 = r.ok ? r.datos.falla : {};
  // Números ficticios armados aquí (para no escribir teléfonos en el código) y uno que además es cliente de la falla
  const ficticio = (k) => '504' + String(39990000 + k);
  const ctrlNums = [ficticio(1), ficticio(2), ficticio(3), ficticio(4)], ctrlCliente = [...espera4][0];
  g.E.usuario = 'otra.persona@claro.com.hn';
  let errC = null;
  try { C.guardarControlSms({ texto: ctrlNums.join('\n') }); } catch (e) { errC = e.message; }
  g.E.usuario = null;
  ok(r.ok && espera4.size >= 60 && errC && /cuenta dueña/.test(errC), 'solo la cuenta dueña cambia los números de control (falla de prueba con ' + espera4.size + ' celulares)', errC);
  const entrada = [ctrlNums[0], ctrlNums[1].slice(3, 7) + '-' + ctrlNums[1].slice(7), '+504 ' + ctrlNums[2].slice(3), ctrlNums[3], ctrlNums[0], ctrlCliente, '2' + '2345678', 'hola'].join('\n');
  const gc = C.guardarControlSms({ texto: entrada });
  ok(gc.lista.length === 5 && gc.lista.every((x) => /^504[3789]\d{7}$/.test(x)) && /^Guardados 5 números de control\. Se quitó 1 repetido\. No son celulares de Honduras/.test(gc.texto),
    'los números de control se guardan con 504 y sin repetir; lo que no es un celular se avisa', gc.texto);
  r = sms(tWf, { op: 'resumen', id: f4.id });
  ok(r.ok && r.datos.control === 4 && Object.keys(r.datos.controlHechos).length === 0 && !conNumeros(r.datos),
    'el resumen dice cuántos números de control van (4: el que también es cliente lo recibe como cliente), sin mandar los números', r.datos && r.datos.control);
  const msjC = aprobado('ENERGIA');
  const antesC = N.enviados.length;
  r = sms(tWf, { op: 'iniciar', id: f4.id, tipo: 'FALLA', aprobado: 'ENERGIA' });
  const envC = r.ok ? r.datos : {}, filasC = filasDe(envC.envio);
  ok(r.ok && envC.total === espera4.size + 4 && envC.control === 4 && filasC.slice(0, 4).every((x) => ctrlNums.includes(String(x[4])) && /^M[0-9a-f]{8}$/.test(String(x[9])))
    && filasC.slice(4).every((x) => x[9] === '') && !conNumeros(r.datos), 'iniciar pone primero los 4 números de control (con la huella del mensaje) y después a los clientes', [envC.total, envC.control]);
  const malosC = [...espera4].filter((x) => x !== ctrlCliente).slice(1, 5);
  malosC.forEach((x) => N.rechazar.add(x));
  const avC = mandarTodo(tWf, f4.id, envC);
  r = sms(tWf, { op: 'terminar', id: f4.id, envio: envC.envio });
  const llegaron = N.enviados.slice(antesC), vecesC = (num) => llegaron.filter((e) => e.msisdn === num).length;
  ok(!avC.fallo && avC.control === 4 && avC.cEnviados === 4 && avC.enviados === espera4.size - 4 && avC.errores === 4 && ctrlNums.every((x) => vecesC(x) === 1) && vecesC(ctrlCliente) === 1
    && llegaron.slice(0, 4).every((e) => ctrlNums.includes(e.msisdn)) && llegaron.every((e) => e.message === msjC) && !conNumeros(avC),
    'los números de control reciben el mismo mensaje, primero y una sola vez (el que es cliente, una vez); los clientes se cuentan aparte', [avC.enviados, avC.cEnviados, avC.errores]);
  const hC = r.ok ? r.datos.falla.historial.slice(-1)[0].detalle : '';
  ok(/^Aviso de falla a \d+ clientes \(4 con error\) y a 4 números de control$/.test(hC) && r.datos.falla.sms.slice(-1)[0].control === 4, 'queda en la falla: "' + hC + '"', r.datos && r.datos.falla && r.datos.falla.sms.slice(-1));
  malosC.slice(0, 2).forEach((x) => N.rechazar.delete(x));
  r = sms(tWf, { op: 'resumen', id: f4.id });
  ok(r.ok && r.datos.controlHechos[g.ejecutar('hashSms_(' + JSON.stringify(msjC) + ')')] === 4 && U.hashSms(msjC) === g.ejecutar('hashSms_(' + JSON.stringify(msjC) + ')'),
    'el resumen sabe que los 4 ya tienen ese mensaje (la página calcula la misma huella)', r.datos && r.datos.controlHechos);
  r = sms(tWf, { op: 'iniciar', id: f4.id, tipo: 'FALLA', aprobado: 'ENERGIA' });
  const envC2 = r.ok ? r.datos : {};
  const avC2 = mandarTodo(tWf, f4.id, envC2);
  sms(tWf, { op: 'terminar', id: f4.id, envio: envC2.envio });
  ok(envC2.total === 4 && envC2.control === 0 && avC2.enviados === 2 && avC2.errores === 2, 'al reintentar con el mismo mensaje, a los números de control no se les repite', [envC2.total, envC2.control]);
  r = sms(tWf, { op: 'iniciar', id: f4.id, tipo: 'FALLA', aprobado: 'VIA' });
  const envC3 = r.ok ? r.datos : {};
  ok(r.ok && envC3.total === 2 + 4 && envC3.control === 4, 'con otro mensaje sí lo reciben: una vez por cada mensaje distinto', r.datos);
  sms(tWf, { op: 'terminar', id: f4.id, envio: envC3.envio });
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: f4.id } });
  ok(r.ok && r.datos.control === 4 && r.datos.telefonos.slice(0, 4).every((x) => ctrlNums.includes(x)) && new Set(r.datos.telefonos).size === r.datos.telefonos.length
    && r.datos.telefonos.length === espera4.size + 4, 'Descargar celulares también los trae, al principio y sin repetir', r.datos && [r.datos.control, r.datos.telefonos.length]);
  N.rechazar.clear();
  C.guardarControlSms({ texto: '' });
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f4.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });

  /* ---------- Carga por cambios ---------- */
  console.log('\n9c. Carga por cambios (solo lo que cambió)');
  const SEP = '\u001f';
  const filasHoja = () => {
    const h = g.E.activo.getSheetByName('Base');
    return h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).getValues().filter((f) => String(f[0])).map((f) => f.map(String).join(SEP)).sort();
  };
  const comoHoja = (filas) => filas.map((f) => f.map((v) => String(v == null ? '' : v).slice(0, 300)).join(SEP)).sort();
  const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function porCambios(filas, token, columnas, nombre, ajuste) {
    const hz = g.post({ accion: 'base', token, datos: { op: 'huella' } });
    if (!hz.ok || hz.datos.huellas == null) return { ok: false, hz };
    const plan = Model.planCambios(hz.datos.huellas.split(','), filas.length, (d, h) => filas.slice(d, h), 20000);
    const datos = { op: 'cambios', baseVersion: hz.datos.baseVersion, columnas, archivo: nombre, total: filas.length,
      quitar: plan.quitar, esperadas: plan.esperadas, agregar: plan.agregar, catalogo: catJson };
    if (ajuste) ajuste(datos);
    const w0 = g.E.cuota.escriturasHoja;
    const x = g.post({ accion: 'base', token, datos });
    return Object.assign(x, { plan, hz: hz.datos, escrituras: g.E.cuota.escriturasHoja - w0 });
  }
  const cols3 = Model.columnasCarga(b2);
  const iCo = cols3.indexOf('CONTRATO'), iNo = cols3.indexOf('GRUPO_NODO'), iPr = cols3.indexOf('PRODUCT_ID');
  const conHuella = (f) => { const x = f.slice(0, -1); x.push(Model.huellaFila(x)); return x; };
  const filas2 = Model.filasCarga(b2, 0, b2.filas);
  r = g.post({ accion: 'base', token: tAgente, datos: { op: 'huella' } });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no puede pedir la huella de la base', r);
  r = g.post({ accion: 'base', token: tWf, datos: { op: 'huella' } });
  ok(r.ok && r.datos.huellas.split(',').length === b2.filas && r.datos.vacias === 0 && r.datos.columnas[r.datos.columnas.length - 1] === 'HUELLA'
    && r.datos.huellas.split(',').every((h, i) => h === filas2[i][filas2[i].length - 1]), 'la carga completa guarda la huella de cada fila', r.ok && [r.datos.filas, r.datos.vacias]);

  // Semana 3: salen 150 filas, 40 clientes de un solo servicio cambian de nodo, entran 90 contratos nuevos
  const porContrato = new Map();
  filas2.forEach((f) => porContrato.set(f[iCo], (porContrato.get(f[iCo]) || 0) + 1));
  const nodosDistintos = [...new Set(filas2.map((f) => f[iNo]))];
  const sale = new Set(), cambia = new Set();
  for (let i = 500; sale.size < 150 && i < filas2.length; i += 7) sale.add(i);
  for (let i = 3; cambia.size < 40 && i < filas2.length; i += 53) if (!sale.has(i) && porContrato.get(filas2[i][iCo]) === 1) cambia.add(i);
  const filas3 = [];
  filas2.forEach((f, i) => {
    if (sale.has(i)) return;
    if (cambia.has(i)) { const x = f.slice(); x[iNo] = nodosDistintos.find((n) => n !== f[iNo]); filas3.push(conHuella(x)); return; }
    filas3.push(f);
  });
  const existentes = new Set(filas2.map((f) => f[iCo]));
  const nuevosContratos = [];
  for (let k = 0; nuevosContratos.length < 90; k++) { const c = String(99000000 + k * 37); if (!existentes.has(c)) nuevosContratos.push(c); }
  nuevosContratos.forEach((c, k) => { const x = filas2[(k * 101) % filas2.length].slice(); x[iCo] = c; x[iPr] = String(77000000 + k); filas3.splice((k * 997) % filas3.length, 0, conHuella(x)); });
  const contratosAntes = new Set(filas2.map((f) => f[iCo])), contratosDespues = new Set(filas3.map((f) => f[iCo]));
  const bajasEsperadas = [...contratosAntes].filter((c) => !contratosDespues.has(c)).length;
  const cambiosAntes = g.E.cuota.escriturasHoja;
  r = porCambios(filas3, tWf, cols3, 'semana 3.xlsx');
  ok(r.ok && r.datos.modo === 'cambios' && r.datos.agregadas === 130 && r.datos.quitadas === 190,
    `sube solo lo que cambió: ${r.datos && r.datos.agregadas} filas nuevas o con cambios y ${r.datos && r.datos.quitadas} que salen, de ${filas3.length}`, r.datos || r);
  ok(r.ok && igual(filasHoja(), comoHoja(filas3)), 'la base interna queda idéntica al Excel nuevo, fila por fila');
  ok(r.ok && r.escrituras <= 4, `con ${r.escrituras} escrituras en la hoja (la carga completa usa ${Math.ceil(b2.filas / 5000) + 3} o más)`);
  ok(r.ok && r.datos.comparacion.nuevos === 90 && r.datos.comparacion.bajas === bajasEsperadas && r.datos.comparacion.cambiosNodo === 40,
    `compara con la anterior: ${JSON.stringify(r.datos && r.datos.comparacion)}`, [bajasEsperadas]);
  const cNuevo = nuevosContratos[3], iSale = [...sale][4], iCambia = [...cambia][2];
  let rb = g.post({ accion: 'buscar', token: tAgente, datos: { q: cNuevo } });
  ok(rb.ok && rb.datos.estado === 'ok' && rb.datos.filas[0].contrato === cNuevo, 'un contrato nuevo ya se encuentra');
  const cSale = filas2[iSale][iCo];
  rb = g.post({ accion: 'buscar', token: tAgente, datos: { q: cSale } });
  ok(rb.ok && (contratosDespues.has(cSale) ? rb.datos.filas.length === filas3.filter((f) => f[iCo] === cSale).length : rb.datos.estado === 'no'), 'un contrato que salió ya no aparece');
  rb = g.post({ accion: 'buscar', token: tAgente, datos: { q: filas2[iCambia][iCo] } });
  ok(rb.ok && rb.datos.filas.length === 1 && rb.datos.filas[0].nodo === filas3.find((f) => f[iCo] === filas2[iCambia][iCo])[iNo] && rb.datos.filas[0].nodo !== filas2[iCambia][iNo],
    'un cliente que cambió de nodo sale con el nodo nuevo (y una sola vez)', rb.datos && rb.datos.filas);
  let est3 = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos;
  ok(est3.resumen.filas === filas3.length && est3.cargas.length >= 3 && est3.cargas[est3.cargas.length - 1].nuevos === 90, 'el resumen y el historial de cargas quedan al día', [est3.resumen.filas, est3.cargas.length]);
  ok(g.post({ accion: 'estado', token: tAgente }).datos.cambio.tipo === 'BASE_ACTUALIZADA', 'todos reciben el aviso de la base nueva');
  r = g.post({ accion: 'base', token: tWf, datos: { op: 'huella' } });
  ok(r.ok && r.datos.vacias === 190, `las filas que salen quedan vacías (${r.datos && r.datos.vacias}); al pasar del 8 % la página hace la carga completa`);
  r = porCambios(filas3, tWf, cols3, 'semana 3 otra vez.xlsx');
  ok(r.ok && r.datos.agregadas === 0 && r.datos.quitadas === 0 && igual(filasHoja(), comoHoja(filas3)), 'subir el mismo Excel otra vez no cambia nada', r.datos);

  // Lo que debe hacer que la página vaya por la carga completa
  const antesDeFallar = filasHoja();
  const filas4 = filas3.filter((f, i) => i % 50 !== 0);
  r = porCambios(filas4, tWf, cols3, 'x', (d) => { d.esperadas[0] = 'zzzz'; });
  ok(!r.ok && r.codigo === 'COMPLETA' && igual(filasHoja(), antesDeFallar), 'si la base interna no coincide con la comparación, no toca nada y pide la carga completa', r);
  r = porCambios(filas4, tWf, cols3, 'x', (d) => { d.baseVersion--; });
  ok(!r.ok && r.codigo === 'COMPLETA', 'si otra carga cambió la base mientras tanto, pide la carga completa', r);
  r = porCambios(filas4, tWf, cols3, 'x', (d) => { d.columnas = d.columnas.filter((c) => c !== 'TELEFONO'); d.agregar = d.agregar.map((f) => f.filter((v, j) => cols3[j] !== 'TELEFONO')); });
  ok(!r.ok && r.codigo === 'COMPLETA', 'si el Excel trae otras columnas, pide la carga completa', r);
  r = porCambios(filas4, tWf, cols3, 'x', (d) => { d.total++; });
  ok(!r.ok && r.codigo === 'COMPLETA' && igual(filasHoja(), antesDeFallar), 'si las cuentas de filas no cuadran, no toca nada', r);
  r = porCambios(filas4, tAgente, cols3, 'x');
  ok(!r.ok, 'Concentrix no puede subir cambios');

  // Si la carga se corta a medias (ya agregó las filas nuevas pero no vació las viejas), repetirla la completa
  const hz4 = g.post({ accion: 'base', token: tWf, datos: { op: 'huella' } }).datos;
  const plan4 = Model.planCambios(hz4.huellas.split(','), filas4.length, (d, h) => filas4.slice(d, h), 20000);
  const filas5 = filas4.map((f, i) => (i % 400 === 0 ? conHuella(Object.assign(f.slice(), { [iNo]: nodosDistintos[0] === f[iNo] ? nodosDistintos[1] : nodosDistintos[0] })) : f));
  const plan5 = Model.planCambios(hz4.huellas.split(','), filas5.length, (d, h) => filas5.slice(d, h), 20000);
  const hb5 = g.E.activo.getSheetByName('Base');
  const falta5 = hb5.getLastRow() + plan5.agregar.length - hb5.getMaxRows();
  if (falta5 > 0) hb5.insertRowsAfter(hb5.getMaxRows(), falta5);
  hb5.getRange(hb5.getLastRow() + 1, 1, plan5.agregar.length, cols3.length).setNumberFormat('@').setValues(plan5.agregar.map((f) => f.map(String)));
  r = porCambios(filas5, tWf, cols3, 'semana 4.xlsx');
  ok(r.ok && r.datos.agregadas === 0 && r.datos.quitadas === plan5.quitar.length && igual(filasHoja(), comoHoja(filas5)),
    `si se cortó a medias, al repetir termina sin duplicar filas (${plan4.quitar.length} que salen, ${plan5.agregar.length} ya agregadas)`, r.datos || r);

  r = g.post({ accion: 'base', token: tWfTemp, datos: { op: 'iniciar', total: 10, columnas: cols3, archivo: 'otra.xlsx' } });
  const rOcupado = porCambios(filas5, tWf, cols3, 'x');
  ok(r.ok && !rOcupado.ok && rOcupado.codigo === 'OCUPADO' && /Mario Rivera/.test(rOcupado.error), 'si otra persona está subiendo la base completa, espera', rOcupado);
  g.post({ accion: 'base', token: tWfTemp, datos: { op: 'cancelar', id: r.datos.id } });

  /* ---------- Carga por cambios con dos bases reales seguidas ---------- */
  if (process.argv[3]) {
    console.log('\n9d. De una base real a la siguiente');
    const buf2 = fs.readFileSync(process.argv[3]);
    const bSig = await P.parseFile(buf2.buffer.slice(buf2.byteOffset, buf2.byteOffset + buf2.byteLength), path.basename(process.argv[3]));
    const bAnt = base;
    // Se comparan las mismas columnas: si solo una trae MEGAS o TELEFONO, se dejan fuera
    for (const k of ['tieneMegas', 'tieneTelefono']) if (!bAnt[k] || !bSig[k]) { bAnt[k] = false; bSig[k] = false; }
    t1 = Date.now();
    r = await subir(bAnt, tWf, catJson, path.basename(archivo));
    ok(r.ok, `carga completa de ${path.basename(archivo)}: ${bAnt.filas} filas en ${r.lotes} lotes`, r);
    const filasSig = Model.filasCarga(bSig, 0, bSig.filas);
    t1 = Date.now();
    r = porCambios(filasSig, tWf, Model.columnasCarga(bSig), path.basename(process.argv[3]));
    ok(r.ok && r.datos.modo === 'cambios', `${path.basename(process.argv[3])} por cambios: ${r.datos && r.datos.agregadas} filas nuevas o con cambios y ${r.datos && r.datos.quitadas} que salen (${(100 * ((r.datos && r.datos.agregadas) || 0) / bSig.filas).toFixed(1)} % de la base), ${r.escrituras} escrituras`, r.datos || r);
    ok(r.ok && igual(filasHoja(), comoHoja(filasSig)), `la base interna queda idéntica al Excel nuevo (${bSig.filas} filas)`);
    ok(r.ok && r.datos.comparacion, 'comparación: ' + JSON.stringify(r.datos && r.datos.comparacion));
  }

  /* ---------- Limpieza ---------- */
  console.log('\n10. Mantenimiento de cada hora');
  const antes = hc.getLastRow();
  ok(g.E.triggers.filter((t) => t.fn === 'limpiarConsultas' && t.horas === 1).length === 1, 'el mantenimiento queda programado cada hora');
  g.E.ahora = Date.now() + 31 * 86400000;
  const rMant = C.limpiarConsultas();
  const bvMant = g.post({ accion: 'estado', token: g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } }).datos.token }).datos.baseVersion;
  ok(rMant && rMant.celulares && rMant.celulares.listo && String(g.E.activo.getSheetByName('Celulares').getRange(1, 4).getValue()) === 'base ' + bvMant,
    'el mantenimiento deja el índice de celulares al día con la base actual' + (rMant && rMant.celulares && rMant.celulares.armado ? ' (lo armó)' : ''), rMant && rMant.celulares);
  const hr1 = g.SpreadsheetApp.openById(g.E.props.get('CONSULTAS_ID')).getSheetByName('Resumen');
  const st1 = g.post({ accion: 'estadisticas', token: g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } }).datos.token, datos: { desde: 0 } });
  g.E.ahora = null;
  ok(hc.getLastRow() === 1 && antes > 1, `borra el detalle de más de 30 días (${antes - 1} → ${hc.getLastRow() - 1})`);
  ok(hr1.getLastRow() >= 2 && st1.ok && st1.datos.consultas + st1.datos.reportes === antes - 1, 'y las estadísticas de 90 días siguen contando esas consultas desde el resumen', st1.datos && [st1.datos.consultas, st1.datos.reportes]);

  /* ---------- Varios días, en un servidor nuevo ---------- */
  console.log('\n11. Estadísticas de varios días con ~cientos de consultas diarias');
  const DIA = 86400000;
  const hoyHN = Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date()) + 'T00:00:00-06:00');
  const bc = JSON.parse(JSON.stringify(base, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)));
  bc.filas = Math.min(2500, base.filas);
  for (const k of Object.keys(bc.cols)) bc.cols[k] = bc.cols[k].slice(0, bc.filas);
  const ixc = Model.indexar(bc), catc = Model.catalogo(ixc);
  const g2 = crearEntorno({ region: 'mypurecloud.com' }), C2 = g2.contexto;
  C2.configurar(); C2.configurar();
  ok(g2.E.triggers.filter((t) => t.fn === 'limpiarConsultas').length === 1, 'configurar dos veces no duplica el mantenimiento');
  C2.guardarGenesys({ region: 'mypurecloud.com', clientId: 'a1b2c3d4-0000-1111-2222-333344445555', rolPorDefecto: 'concentrix' });
  g2.E.activo.getSheetByName('Usuarios').appendRow(['ana.lopez@claro.com.hn', 'Ana López', 'workforce', 'SÍ', '']);
  g2.E.genesys.tokens.set('w', { name: 'Ana', email: 'ana.lopez@claro.com.hn' });
  for (let i = 1; i <= 3; i++) g2.E.genesys.tokens.set('a' + i, { name: 'Asesor ' + i, email: 'asesor' + i + '@concentrix.com' });
  const entrar2 = (tok) => g2.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: tok } }).datos.token;
  g2.E.ahora = hoyHN - 6 * DIA + 8 * 3600000;
  let tw2 = entrar2('w');
  let x2 = g2.post({ accion: 'base', token: tw2, datos: { op: 'iniciar', total: bc.filas, columnas: Model.columnasCarga(bc), archivo: 'chica.xlsx' } });
  for (let d0 = 0; d0 < bc.filas; d0 += x2.datos.filasPorLote) g2.post({ accion: 'base', token: tw2, datos: { op: 'lote', id: x2.datos.id, desde: d0, filas: Model.filasCarga(bc, d0, Math.min(bc.filas, d0 + x2.datos.filasPorLote)) } });
  x2 = g2.post({ accion: 'base', token: tw2, datos: { op: 'finalizar', id: x2.datos.id, catalogo: catc } });
  const nodoF = [...ixc.nodoIdx.keys()].find((n) => !U.esVirtual(n) && ixc.cnt[ixc.nodoIdx.get(n)] >= 8);
  const enF = Model.filasDeNodos(ixc, [nodoF]).slice(0, 8).map((i) => String(ixc.C.contrato[i]));
  const distintos = new Set(), porDia = {};
  let total2 = 0, conFalla2 = 0;
  for (let d = 5; d >= 0; d--) {
    const t0 = hoyHN - d * DIA;
    g2.E.ahora = t0 + 8 * 3600000;
    const toks = [entrar2('a1'), entrar2('a2'), entrar2('a3')];
    if (d === 3) { tw2 = entrar2('w'); g2.post({ accion: 'falla', token: tw2, datos: { op: 'publicar', falla: { nodos: [nodoF], motivo: 'ENERGIA' } } }); }
    for (let k = 0; k < 40; k++) {
      g2.E.ahora = t0 + 8 * 3600000 + k * 6 * 60000;
      const enFalla = d <= 3 && k < 6;
      const c = enFalla ? enF[k] : String(ixc.C.contrato[(d * 37 + k * 11) % bc.filas]);
      const rr = g2.post({ accion: 'buscar', token: toks[k % 3], datos: { q: c } });
      if (rr.ok) { total2++; distintos.add(c); porDia[d] = (porDia[d] || 0) + 1; if (rr.datos.filas.length && rr.datos.fallas.length) conFalla2++; }
    }
  }
  const ahora2 = hoyHN + 13 * 3600000;
  g2.E.ahora = ahora2;
  tw2 = entrar2('w');
  const stats2 = (desde, porHora) => { g2.cache.remove('stats:' + desde + ':' + (porHora ? 'h' : 'd')); return g2.post({ accion: 'estadisticas', token: tw2, datos: { desde, porHora } }); };
  r = stats2(hoyHN - 6 * DIA, false);
  const ultimos4 = porDia[3] + porDia[2] + porDia[1] + porDia[0];
  ok(r.ok && r.datos.consultas === ultimos4, 'sin resumen todavía, cuenta los últimos 3 días y hoy desde el detalle (' + ultimos4 + ')', r.datos && r.datos.consultas);
  const res1 = C2.limpiarConsultas();
  const hc2 = g2.SpreadsheetApp.openById(g2.E.props.get('CONSULTAS_ID'));
  const ayerTxt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date(hoyHN - DIA));
  ok(res1.resumidoHasta === ayerTxt && hc2.getSheetByName('Resumen').getLastRow() === 6, 'el mantenimiento resume los 5 días anteriores (hasta ' + res1.resumidoHasta + ')', res1);
  r = stats2(hoyHN - 6 * DIA, false);
  ok(r.ok && r.datos.consultas === total2 && r.datos.serie.length === 6, `7 días: las ${total2} consultas de 6 días, día por día`, r.datos && [r.datos.consultas, r.datos.serie.length]);
  ok(r.ok && r.datos.conFalla === conFalla2 && r.datos.tecConsultas.HFC + r.datos.tecConsultas.GPON === conFalla2, `consultas con falla (${conFalla2}) y por tecnología`, r.datos && [r.datos.conFalla, r.datos.tecConsultas]);
  ok(r.ok && r.datos.clientesAprox && Math.abs(r.datos.clientesUnicos - distintos.size) / distintos.size < 0.05, `clientes distintos ≈ ${r.datos && r.datos.clientesUnicos} (exactos: ${distintos.size})`, r.datos);
  ok(r.ok && r.datos.asesores.length === 3 && r.datos.asesores.reduce((a, x) => a + x.n, 0) === total2, 'por asesor, sumando todos los días', r.datos && r.datos.asesores);
  ok(r.ok && r.datos.topContratos.length && enF.includes(r.datos.topContratos[0].contrato) && r.datos.topContratos[0].nombre, 'clientes con más afectaciones, con nombre', r.datos && r.datos.topContratos[0]);
  r = stats2(hoyHN, true);
  ok(r.ok && r.datos.consultas === porDia[0] && !r.datos.clientesAprox, `hoy: exacto desde el detalle (${porDia[0]})`, r.datos && [r.datos.consultas, r.datos.clientesAprox]);
  g2.E.ahora = hoyHN + 40 * DIA + 13 * 3600000;
  const res2 = C2.limpiarConsultas();
  tw2 = entrar2('w');
  r = stats2(hoyHN - 6 * DIA, false);
  ok(hc2.getSheetByName('Consultas').getLastRow() === 1 && r.ok && r.datos.consultas === total2, '40 días después: el detalle se borró y las estadísticas salen del resumen', [res2, r.datos && r.datos.consultas]);
  g2.ejecutar('ALERTAS.MAX_FILAS_DETALLE = 10');
  for (let k = 0; k < 30; k++) { g2.E.ahora = hoyHN + 40 * DIA + 14 * 3600000 + k * 60000; g2.post({ accion: 'buscar', token: tw2, datos: { q: String(ixc.C.contrato[k]) } }); }
  g2.E.ahora = hoyHN + 41 * DIA + 9 * 3600000;
  C2.limpiarConsultas();
  tw2 = entrar2('w');
  r = stats2(hoyHN + 34 * DIA, false);
  ok(hc2.getSheetByName('Consultas').getLastRow() - 1 === 10 && r.ok && r.datos.consultas === 30, 'con el tope de filas, deja solo las más recientes y el resumen conserva el total', [hc2.getSheetByName('Consultas').getLastRow() - 1, r.datos && r.datos.consultas]);
  g2.E.ahora = null;

  /* ---------- Hoja Fallas de antes del número de falla ---------- */
  console.log('\n12. Hoja Fallas de la versión anterior (sin la columna Número de falla)');
  const hf2 = g2.E.activo.getSheetByName('Fallas');
  const fViejas = g2.post({ accion: 'cargar', token: tw2, datos: { baseVersion: -1 } }).datos.fallas;
  hf2.deleteColumns(20, hf2.getMaxColumns() - 19);           // como quedaría una hoja de 19 columnas exactas
  r = g2.post({ accion: 'cargar', token: tw2, datos: { baseVersion: -1 } });
  ok(r.ok && r.datos.fallas.length === fViejas.length && r.datos.fallas.every((f) => f.numero === ''), 'las fallas guardadas antes se leen bien, sin número', r.ok ? r.datos.fallas.length : r);
  r = g2.post({ accion: 'falla', token: tw2, datos: { op: 'publicar', falla: { nodos: [fViejas[0].nodos[0]], motivo: 'ENERGIA', numero: 'F1254585' } } });
  ok(r.ok && hf2.getMaxColumns() === 20 && hf2.getRange(1, 20).getValue() === 'Número de falla' && r.datos.falla.numero === 'F1254585',
    'al guardar la primera falla con el código nuevo, la hoja recibe la columna Número de falla', r.ok ? hf2.getMaxColumns() : r);
  r = g2.post({ accion: 'cargar', token: tw2, datos: { baseVersion: -1 } });
  ok(r.ok && r.datos.fallas.length === fViejas.length + 1 && r.datos.fallas.filter((f) => f.numero === 'F1254585').length === 1, 'las fallas viejas y la nueva conviven bien');

  /* ---------- Pestañas ocultas y protegidas, como el archivo de auditorías ---------- */
  console.log('\n13. Ocultar y proteger las pestañas (solo la cuenta dueña)');
  const DESC = g2.ejecutar('BLOQUEO_DESC');
  const libroC2 = () => g2.SpreadsheetApp.openById(g2.E.props.get('CONSULTAS_ID'));
  const pestanas = () => [g2.E.activo, libroC2()].flatMap((l) => l.getSheets());
  const deAlertas = (h) => h.getProtections('SHEET').filter((p) => p.getDescription() === DESC);
  const visibles = (l) => l.getSheets().filter((h) => !h.isSheetHidden()).map((h) => h.getName());
  const mensaje = () => (g2.E.alertas[g2.E.alertas.length - 1] || [])[1] || '';
  const OTRO = 'ariel.velasquez@claro.com.hn';
  g2.E.ahora = null;
  const pestanasAntes = pestanas().length;
  g2.E.usuario = OTRO;
  C2.ocultarPestanas();
  ok(pestanas().every((h) => !deAlertas(h).length) && visibles(g2.E.activo).length > 1 && /Solo la cuenta dueña/.test(mensaje()), 'alguien que no es la cuenta dueña no puede ocultarlas ni protegerlas', mensaje());
  g2.E.usuario = null;
  C2.ocultarPestanas();
  const inicio = g2.E.activo.getSheetByName('INICIO'), inicioC = libroC2().getSheetByName('INICIO');
  const txtInicio = inicio ? inicio.getRange(1, 1, 9, 1).getValues().map((x) => x[0]).join('\n') : '';
  ok(inicio && g2.E.activo.getSheets()[0] === inicio && /Archivo confidencial/.test(txtInicio) && /Mostrar las pestañas/.test(txtInicio) && /Versión \d/.test(txtInicio),
    'crea la pestaña INICIO, primera, con el aviso de archivo confidencial y cómo ver los datos', txtInicio);
  ok(JSON.stringify(visibles(g2.E.activo)) === '["INICIO"]' && JSON.stringify(visibles(libroC2())) === '["INICIO"]' && inicioC && /Bitácora de consultas/.test(inicioC.getRange(1, 1).getValue()),
    'en los dos archivos (base interna y consultas) solo queda a la vista INICIO', [visibles(g2.E.activo), visibles(libroC2())]);
  const todas = pestanas().length;
  ok(todas === pestanasAntes + 2 && pestanas().every((h) => deAlertas(h).length === 1 && deAlertas(h)[0].getEditors().map((u) => u.getEmail()).join() === g2.E.dueno) && /ocultas y protegidas/.test(mensaje()),
    `las ${todas} pestañas quedan protegidas, con la cuenta dueña como única editora`, mensaje());
  C2.ocultarPestanas();
  ok(pestanas().length === todas && pestanas().every((h) => deAlertas(h).length === 1), 'hacerlo otra vez no duplica INICIO ni las protecciones');
  g2.E.usuario = OTRO;
  let errEd = null;
  try { g2.E.activo.getSheetByName('Usuarios').appendRow(['intruso@claro.com.hn', 'Intruso', 'jefatura', 'SÍ', '']); } catch (e) { errEd = e.message; }
  ok(errEd && /protected/.test(errEd), 'otra persona con acceso al archivo no puede cambiar las pestañas', errEd);
  C2.mostrarPestanas();
  ok(JSON.stringify(visibles(g2.E.activo)) === '["INICIO"]' && /Solo la cuenta dueña/.test(mensaje()), 'ni mostrarlas desde el menú', mensaje());
  g2.E.usuario = null;
  // Alertas corre con la cuenta dueña: sigue funcionando con las pestañas ocultas y protegidas
  const tw3 = entrar2('w'), ta3 = entrar2('a1');
  r = g2.post({ accion: 'buscar', token: ta3, datos: { q: String(ixc.C.contrato[0]) } });
  ok(r.ok && r.datos.estado === 'ok', 'las búsquedas siguen funcionando (y se anotan en la bitácora oculta)', r);
  r = g2.post({ accion: 'falla', token: tw3, datos: { op: 'publicar', falla: { nodos: [nodoF], motivo: 'FIBRA' } } });
  ok(r.ok, 'Workforce sigue publicando fallas', r);
  let x3 = g2.post({ accion: 'base', token: tw3, datos: { op: 'iniciar', total: bc.filas, columnas: Model.columnasCarga(bc), archivo: 'chica2.xlsx' } });
  for (let d0 = 0; d0 < bc.filas; d0 += x3.datos.filasPorLote) g2.post({ accion: 'base', token: tw3, datos: { op: 'lote', id: x3.datos.id, desde: d0, filas: Model.filasCarga(bc, d0, Math.min(bc.filas, d0 + x3.datos.filasPorLote)) } });
  x3 = g2.post({ accion: 'base', token: tw3, datos: { op: 'finalizar', id: x3.datos.id, catalogo: catc } });
  const baseN = g2.E.activo.getSheetByName('Base');
  ok(x3.ok && baseN.isSheetHidden() && deAlertas(baseN).length === 1, 'una carga completa funciona y la Base nueva queda oculta y protegida también', x3);
  g2.E.activo.deleteSheet(g2.E.activo.getSheetByName('Tiendas')); g2.cache.remove('tiendas');
  r = g2.post({ accion: 'config' });
  const tNueva = g2.E.activo.getSheetByName('Tiendas');
  ok(r.ok && tNueva && tNueva.isSheetHidden() && deAlertas(tNueva).length === 1, 'y una pestaña que Alertas vuelve a crear (Tiendas) queda oculta y protegida sola', r.ok);
  C2.mostrarPestanas();
  const toast = (g2.E.toasts[g2.E.toasts.length - 1] || [])[1] || '';
  const internas = ['Catalogo', 'Celulares'].map((x) => g2.E.activo.getSheetByName(x)).filter(Boolean);
  ok(visibles(g2.E.activo).length === g2.E.activo.getSheets().length - internas.length && internas.every((x) => x.isSheetHidden()) && visibles(libroC2()).length === libroC2().getSheets().length,
    'Mostrar las pestañas las pone a la vista en los dos archivos (menos Catalogo y Celulares, que son internas)', [visibles(g2.E.activo), toast]);
  ok(pestanas().every((h) => deAlertas(h).length === 1) && /Siguen protegidas/.test(toast), 'y siguen protegidas', toast);
  C2.onOpen();
  ok(JSON.stringify(visibles(g2.E.activo)) === '["INICIO"]' && g2.E.activo.getActiveSheet().getName() === 'INICIO', 'al abrir el archivo se vuelven a ocultar solas y queda INICIO', visibles(g2.E.activo));

  /* ---------- Monitoreo de la pantalla de entrada ---------- */
  console.log('\n14. Monitoreo en vivo de la pantalla de entrada');
  const esperadoM = Model.monitoreo(catc, []);
  let mon = g2.post({ accion: 'monitoreo' });
  ok(mon.ok && mon.datos.nodos.length > 0 && mon.datos.nodos.length === esperadoM.length && mon.datos.nodos.every((x, k) => x.d === esperadoM[k].d && x.n === esperadoM[k].n),
    `sin sesión trae el nodo con más clientes de cada departamento (${esperadoM.length}), igual que la demostración`, [mon.datos && mon.datos.nodos, esperadoM]);
  ok(mon.datos.nodos.every((x) => Object.keys(x).sort().join() === 'd,falla,n' && !U.esVirtual(x.n)), 'solo el departamento, el código del nodo y si tiene falla: sin cantidades ni TAP VIRTUAL', mon.datos.nodos[0]);
  const principal = mon.datos.nodos.find((x) => !x.falla).n;
  r = g2.post({ accion: 'falla', token: tw3, datos: { op: 'publicar', falla: { nodos: [principal], motivo: 'ENERGIA' } } });
  const fMon = r.datos && r.datos.falla;
  mon = g2.post({ accion: 'monitoreo' });
  ok(r.ok && mon.datos.nodos.find((x) => x.n === principal).falla === true, 'al publicar una falla en un nodo principal, el monitoreo lo marca enseguida (no espera la caché)', mon.datos.nodos);
  ok(mon.datos.nodos.filter((x) => x.falla).every((x) => x.n === principal || x.n === nodoF), 'y solo marca los nodos que están en una falla activa', mon.datos.nodos.filter((x) => x.falla));
  r = g2.post({ accion: 'falla', token: tw3, datos: { op: 'cerrar', id: fMon.id } });
  mon = g2.post({ accion: 'monitoreo' });
  ok(r.ok && mon.datos.nodos.find((x) => x.n === principal).falla === false, 'al cerrarla vuelve a En línea', mon.datos.nodos.find((x) => x.n === principal));
  ok(!/clientes|total|hfc|gpon/i.test(JSON.stringify(mon.datos)), 'no manda cantidades de clientes ni tecnologías');

  console.log(`\nCuota usada: ${g.E.cuota.propsLecturas} lecturas de propiedades, ${g.E.cuota.urlFetch} llamadas a Genesys`);
  console.log(`\n${pasos - fallos} de ${pasos} pruebas pasaron (${ms()})`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
