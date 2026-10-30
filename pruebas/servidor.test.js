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
  C.configurar();
  ok(g.E.activo.getSheetByName('Fallas') && g.E.activo.getSheetByName('Usuarios'), 'configurar crea las hojas');
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

  let r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'mala', nombre: 'Pedro' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'contraseña incorrecta se rechaza', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía' } });
  ok(!r.ok && /tienda/.test(r.error), 'Tiendas exige la tienda', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'TIENDAS', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía', tienda: 'Multiplaza Tegucigalpa' } });
  ok(r.ok && r.datos.usuario.rol === 'tiendas' && r.datos.usuario.tienda === 'Multiplaza Tegucigalpa', 'Tiendas entra con usuario genérico', r);
  const tTienda = r.datos.token;
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
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'publicar', falla: { nodos: nodosPrueba.concat(['NOEXISTE99']), motivo: 'FIBRA', eta: Date.now() + 4 * 3600000, referencia: 'Correo NOC #9150' } } });
  const imp = Model.impacto(Model.cargarCatalogo(catJson), nodosPrueba);
  ok(r.ok && r.datos.falla.impacto.total === imp.total && r.datos.falla.impacto.hfc === imp.hfc && r.datos.falla.nodos.length === nodosPrueba.length,
    `publica la falla con ${imp.total} clientes (HFC ${imp.hfc}, GPON ${imp.gpon}) e ignora nodos inexistentes`, r.datos && r.datos.falla && r.datos.falla.impacto);
  const f1 = r.datos.falla;
  ok(/^F-\d{6}-01$/.test(f1.id), 'ID de falla con fecha de Honduras: ' + f1.id);
  r = g.post({ accion: 'estado', token: tAgente });
  ok(r.ok && r.datos.cambio && r.datos.cambio.tipo === 'FALLA_PUBLICADA' && r.datos.cambio.por.nombre === 'Ana López', 'estado avisa el cambio y quién lo hizo', r.datos);
  const cli = enNodo(nodosPrueba[0]);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(cli.contrato) } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id), 'la búsqueda trae la falla del nodo del cliente');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'editar', id: f1.id, falla: { nodos: nodosPrueba.slice(0, 2), eta: null }, detalle: 'Quitó ' + nodosPrueba[2] } });
  ok(r.ok && r.datos.falla.nodos.length === 2 && r.datos.falla.eta === null && r.datos.falla.historial.length === 2, 'editar quita un nodo y la hora estimada', r.datos && r.datos.falla);
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id, nota: 'Empalme terminado' } });
  ok(r.ok && r.datos.falla.estado === 'CERRADA' && r.datos.falla.cerradaPor.nombre === 'Ana López', 'cerrar la falla');
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f1.id } });
  ok(!r.ok && /ya cerró/.test(r.error), 'no se puede cerrar dos veces');
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(cli.contrato) } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id && f.estado === 'CERRADA'), 'la falla cerrada sigue visible para los asesores');
  g.E.ahora = Date.now() + 37 * 3600000;
  r = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: bv } });
  ok(!r.ok && r.codigo === 'SESION', 'la sesión vence a las 12 horas', r);
  const tAg37 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  const tWf37 = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } }).datos.token;
  r = g.post({ accion: 'cargar', token: tAg37, datos: { baseVersion: bv } });
  ok(r.ok && !r.datos.fallas.some((f) => f.id === f1.id), 'después de 36 horas ya no la ven los asesores', r.datos && r.datos.fallas.map((f) => f.id));
  r = g.post({ accion: 'cargar', token: tWf37, datos: { baseVersion: bv } });
  ok(r.ok && r.datos.fallas.some((f) => f.id === f1.id), 'Workforce la conserva en el historial');
  g.E.ahora = null;
  r = g.post({ accion: 'falla', token: tWf, datos: { op: 'reabrir', id: f1.id } });
  ok(r.ok && r.datos.falla.estado === 'ACTIVA', 'reabrir la falla');
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
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Pedro Mejía', tienda: 'Multiplaza' } });
  const tTienda2 = r.datos.token;

  /* ---------- Alertas y límites ---------- */
  console.log('\n7. Alertas tempranas y límites');
  const nodoAlerta = [...ix.nodoIdx.keys()].find((n) => !U.esVirtual(n) && ix.cnt[ix.nodoIdx.get(n)] > 20 && !nodosPrueba.includes(n));
  Model.filasDeNodos(ix, [nodoAlerta]).slice(0, 3).forEach((i) => g.post({ accion: 'buscar', token: tAgente, datos: { q: String(ix.C.contrato[i]) } }));
  g.cache.remove('alertas');
  r = g.post({ accion: 'alertas', token: tWf });
  ok(r.ok && r.datos.alertas.some((a) => a.nodo === nodoAlerta && a.nClientes === 3), 'alerta temprana por 3 clientes del mismo nodo: ' + nodoAlerta, r.datos);
  r = g.post({ accion: 'alertas', token: tAgente });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no ve alertas de Workforce');
  g.ejecutar('ALERTAS.LIMITE_CONSULTAS_HORA = 3');
  const tLim = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  g.cache.remove('limite:karla.zelaya@concentrix.com:' + Math.floor(Date.now() / 3600000));
  let ultimo; for (let k = 0; k < 4; k++) ultimo = g.post({ accion: 'buscar', token: tLim, datos: { q: '9999999' } });
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE', 'límite de consultas por hora', ultimo);
  g.ejecutar('ALERTAS.LIMITE_CONSULTAS_HORA = 400');
  // La cuenta de Tiendas la comparten ~200 personas: los errores de una no bloquean a las demás
  for (let k = 0; k < 5; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'mala' + k, nombre: 'Persona Despistada', tienda: 'Mall' } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Persona Despistada', tienda: 'Mall' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'quien se equivoca 5 veces queda bloqueado 15 minutos', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Otra Persona', tienda: 'Mall' } });
  ok(r.ok, 'pero las demás tiendas siguen entrando con la misma cuenta', r);
  for (let k = 0; k < 100; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'adivina' + k, nombre: 'Intruso ' + k, tienda: 'X' + k } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Otra Persona', tienda: 'Mall' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'con 100 contraseñas equivocadas de distintas personas, la cuenta se bloquea 15 minutos', r);
  C.guardarCuenta('tiendas', 'tiendas', 'ClaveTiendasNueva2026');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaveTiendasNueva2026', nombre: 'Otra Persona', tienda: 'Mall' } });
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
  ok(r.ok && /^sms_F-\d{6}-\d{2}_[A-Za-z0-9_\-]+\.csv$/.test(r.datos.archivo), 'nombre del archivo: ' + (r.datos && r.datos.archivo));
  const hdes = g.E.activo.getSheetByName('Descargas SMS');
  ok(hdes && hdes.getLastRow() === 2 && hdes.getRange(2, 3).getValue() === 'Ana López' && Number(hdes.getRange(2, 7).getValue()) === espera.size,
    'queda anotado quién descargó y cuántos números');
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: 'activas' } });
  ok(r.ok && r.datos.fallas.includes(f1.id) && r.datos.telefonos.length >= espera.size && /^sms_fallas_activas_/.test(r.datos.archivo), 'todas las fallas activas en un solo archivo', r.datos && r.datos.fallas);
  r = g.post({ accion: 'telefonos', token: tWf, datos: { id: 'F-000000-99' } });
  ok(!r.ok && r.codigo === 'DATOS', 'una falla que no existe da un mensaje claro', r);
  const iTel = [...Array(b2.filas).keys()].find((i) => setN.has(b2.dicts.nodo[b2.cols.nodo[i]]) && b2.cols.telefono[i]);
  r = g.post({ accion: 'buscar', token: tAgente, datos: { q: String(b2.cols.contrato[iTel]) } });
  ok(r.ok && r.datos.filas.length > 0 && !JSON.stringify(r.datos).includes(b2.cols.telefono[iTel].split(' ')[0].slice(3)), 'la búsqueda de un asesor no trae teléfonos', r.datos && r.datos.filas[0]);
  r = g.post({ accion: 'base', token: tWf, datos: { op: 'iniciar', total: 10, columnas: Model.columnasCarga(base).slice(0, 14).concat(['OTRA']) } });
  ok(!r.ok && r.codigo === 'DATOS', 'una columna desconocida en la base se rechaza', r);

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
  C.limpiarConsultas();
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

  console.log(`\nCuota usada: ${g.E.cuota.propsLecturas} lecturas de propiedades, ${g.E.cuota.urlFetch} llamadas a Genesys`);
  console.log(`\n${pasos - fallos} de ${pasos} pruebas pasaron (${ms()})`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
