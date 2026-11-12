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
  // La versión va también al inicio del archivo: al abrirlo se sabe de un vistazo qué Code.gs es
  const versionServidor = g.ejecutar('ALERTAS.VERSION');
  const cabeceraCodigo = fs.readFileSync(path.join(RAIZ, 'servidor', 'Code.gs'), 'utf8').split('\n').slice(0, 5).join('\n');
  ok(/^\d+\.\d+$/.test(versionServidor) && cabeceraCodigo.includes('Servidor ' + versionServidor + ' '), 'el encabezado de Code.gs dice la misma versión que el servidor (' + versionServidor + ')', cabeceraCodigo);
  const hTiendas = g.E.activo.getSheetByName('Tiendas');
  ok(hTiendas && hTiendas.getLastRow() === 39 && hTiendas.getRange(2, 1).getValue() === 'CAC Castaños', 'configurar crea la hoja Tiendas con las 38 tiendas', hTiendas && hTiendas.getLastRow());
  C.guardarGenesys({ region: 'mypurecloud.com', clientId: 'a1b2c3d4-0000-1111-2222-333344445555', rolPorDefecto: 'concentrix' });
  C.guardarCuenta('tiendas', 'tiendas', 'ClaroTiendas2026');
  // No hay accesos temporales (por privacidad): solo Tiendas entra con contraseña
  const errTemp = ['workforce', 'jefatura', 'supervisor', 'concentrix'].map((rol) => { try { C.guardarCuenta(rol + '.temporal', rol, 'ClaveTemporal2026'); return null; } catch (e) { return e.message; } });
  ok(errTemp.every((e) => /Solo Tiendas entra con contraseña/.test(e || '')), 'no se pueden crear accesos temporales de Workforce, Jefatura, supervisor ni Concentrix', errTemp);
  let errorCorta = null; try { C.guardarCuenta('x.tienda', 'tiendas', 'corta'); } catch (e) { errorCorta = e.message; }
  ok(/10 caracteres/.test(errorCorta), 'rechaza contraseñas cortas');
  const props = JSON.stringify([...g.E.props.values()]);
  ok(!props.includes('ClaroTiendas2026') && Object.keys(JSON.parse(g.E.props.get('CUENTAS'))).join() === 'tiendas', 'la contraseña no queda guardada en texto en ninguna parte, y la única cuenta con contraseña es la de Tiendas');
  g.E.activo.getSheetByName('Usuarios').appendRow(['ana.lopez@claro.com.hn', 'Ana López', 'workforce', 'SÍ', '']);
  g.E.activo.getSheetByName('Usuarios').appendRow(['mario.rivera@claro.com.hn', 'Mario Rivera', 'workforce', 'SÍ', '']);
  g.E.activo.getSheetByName('Usuarios').appendRow(['ex.empleado@claro.com.hn', 'Ex Empleado', 'workforce', 'NO', '']);
  g.E.genesys.tokens.set('tok-agente', { name: 'Karla Zelaya', email: 'karla.zelaya@concentrix.com' });
  g.E.genesys.tokens.set('tok-wf', { name: 'Ana Lopez', email: 'Ana.Lopez@claro.com.hn' });
  g.E.genesys.tokens.set('tok-wf2', { name: 'Mario Rivera', email: 'mario.rivera@claro.com.hn' });
  g.E.genesys.tokens.set('tok-ex', { name: 'Ex', email: 'ex.empleado@claro.com.hn' });

  const cfg = g.post({ accion: 'config' });
  ok(cfg.ok && cfg.datos.genesys.activo && cfg.datos.tiendas && cfg.datos.temporal === undefined, 'config pública indica Genesys y Tiendas (no hay acceso temporal)', cfg);
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
  r = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf2' } });
  ok(r.ok && r.datos.usuario.rol === 'workforce' && r.datos.usuario.nombre === 'Mario Rivera', 'otra persona de Workforce entra con Genesys', r);
  const tWf2 = r.datos.token;
  // Un acceso temporal que haya quedado de antes de la 3.2: no deja entrar, su sesión no vale y al abrir el diálogo se borra
  const temporalViejo = () => g.ejecutar("(() => { const c = JSON.parse(props_().getProperty('CUENTAS')); const sal = 'sal-de-prueba'; c['workforce.temporal'] = { rol: 'workforce', sal: sal,"
    + " iter: ALERTAS.ITERACIONES_CLAVE, hash: hashClave_('ClaveTemporal2026', sal, ALERTAS.ITERACIONES_CLAVE), creada: Date.now() - 60000 }; props_().setProperty('CUENTAS', JSON.stringify(c)); limpiarCfg_(); })()");
  temporalViejo();
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'workforce.temporal', clave: 'ClaveTemporal2026', nombre: 'Mario Rivera' } });
  ok(!r.ok && r.codigo === 'ACCESO' && /incorrectos/.test(r.error), 'un acceso temporal que quedó de antes ya no deja entrar, aunque la contraseña sea la correcta', r);
  const tViejo = g.ejecutar("emitirSesion_({ u: 'workforce.temporal:mario rivera', n: 'Mario Rivera', r: 'workforce', t: '', o: 'clave', a: 'workforce.temporal' }).token");
  r = g.post({ accion: 'estado', token: tViejo });
  ok(!r.ok && r.codigo === 'SESION', 'y una sesión abierta con él deja de valer al instante', r);
  const listaCuentas = C.listarCuentas();
  ok(listaCuentas.length === 1 && listaCuentas[0].usuario === 'tiendas' && Object.keys(JSON.parse(g.E.props.get('CUENTAS'))).join() === 'tiendas',
    'al abrir el diálogo de la contraseña de Tiendas, el acceso temporal que quedó se borra', listaCuentas);

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
  {
    // Las colonias de cada nodo (para el panel de fallas de los asesores) llegan completas desde el servidor
    const cc = Model.cargarCatalogo(r.datos.catalogo), n0 = catJson.nodos[0][0];
    const filas0 = catJson.nodos[0][8].reduce((a, v, i) => (i % 2 ? a + v : a), 0), enCols = cc && cc.nodos.get(n0) ? cc.nodos.get(n0).cols.reduce((a, x) => a + x[3], 0) : -1;
    ok(r.datos.catalogo.formato === 2 && cc.conColonias && r.datos.catalogo.cols.length === catJson.cols.length && enCols === filas0,
      'el catálogo trae las colonias de cada nodo, con su municipio y departamento', [r.datos.catalogo.formato, enCols, filas0]);
  }
  {
    // Colonias limpias: la misma escrita de varias formas va una sola vez, sin las "NO USAR", en nombre propio
    const b = Demo.generar(Date.UTC(2026, 9, 1)).base, ixa = Model.indexar(b);
    const [n0, c0] = [...ixa.nodoIdx].find(([, c]) => ixa.cnt[c] >= 8);
    const filas = Array.from(ixa.filasNodo.slice(ixa.inicio[c0], ixa.inicio[c0 + 1]));
    ['COL. EL CASTA¿O SUR', 'COLONIA EL CASTAÑO SUR', 'Col.  El Castaño Sur', 'NO USAR - CIUDAD TEGUCIGALPA'].forEach((txt, j) => {
      b.dicts.colonia.push(txt); b.cols.colonia[filas[j]] = b.dicts.colonia.length - 1;
    });
    const cc = Model.cargarCatalogo(JSON.parse(JSON.stringify(Model.catalogo(Model.indexar(b)))));
    const z = Model.zonaFalla(cc, { nodos: [n0], impacto: {} });
    const todas = z.grupos.flatMap((g) => g.cols), nombres = todas.map(([c]) => c);
    const cast = todas.filter(([c]) => c === 'Col. El Castaño Sur');
    ok(cast.length === 1 && cast[0][1] === 3 && !nombres.some((c) => /no usar|¿/i.test(c)) && new Set(nombres).size === nombres.length
      && z.grupos.reduce((a, g) => a + g.n, 0) === ixa.cnt[c0],
      'colonias limpias: la misma escrita de 3 formas va una vez (Col. El Castaño Sur), sin las NO USAR y sin perder clientes del municipio', [cast, nombres.slice(0, 6)]);
    ok(U.colonia('COL. SAN JOSE DE LA VEGA Y LA HERENDIDA') === 'Col. San José de la Vega y La Herendida' && U.colonia('BARRIO DE JESUS') === 'Barrio de Jesús'
      && U.colonia('NO USAR - BARRIO GUADALUPE') === '' && U.colonia('COL. KENNEDY ( ZONA 1,2,3,4,5,6,)') === 'Col. Kennedy',
      'nombres de colonias en nombre propio, sin las "NO USAR" ni lo que va entre paréntesis');
  }
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
  const cerrada = r.datos.falla.cerradaEn, vCierre = r.datos.version;
  r = g.post({ accion: 'estado', token: tAgente });
  const avCierre = r.ok ? r.datos.avisos.filter((x) => x.id === f1.id) : [];
  ok(avCierre.length === 1 && avCierre[0].tipo === 'CERRADA' && avCierre[0].v === vCierre && avCierre[0].cerradaEn === cerrada && avCierre[0].numero === 'F1254590' && avCierre[0].por === 'Ana López',
    'al cerrarla, el aviso de esa falla cambia a resuelta, con la hora de solución y quién la cerró (el de publicada ya no sale)', r.datos && r.datos.avisos);
  ok(!/Empalme terminado/.test(JSON.stringify(r.datos.avisos)), 'sin la nota de cierre, que es interna');
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
  const ultAv = g0.ejecutar("(() => { for (let i = 1; i <= 10; i++) subirVersion_({ tipo: 'FALLA_PUBLICADA' }, null, { id: 'F' + i, tipo: 'PUBLICADA', nodos: ['N' + i], n: 1, en: Date.now() });"
    + " subirVersion_({ tipo: 'FALLA_CERRADA' }, null, { id: 'F6', tipo: 'CERRADA', nodos: ['N6'], n: 1, en: Date.now() }); subirVersion_({ tipo: 'FALLA_EDITADA' }); subirVersion_({ tipo: 'BASE_ACTUALIZADA' }, { baseVersion: 9 });"
    + " return accionEstado_().avisos.map((x) => x.id + ':' + x.v + (x.tipo === 'CERRADA' ? 'c' : '')).join(' '); })()");
  ok(ultAv === 'F3:4 F4:5 F5:6 F7:8 F8:9 F9:10 F10:11 F6:12c', 'estado guarda los últimos 8 avisos, uno por falla (al cerrarla, el de resuelta reemplaza al de publicada), y los conserva al editar o subir la base: ' + ultAv);
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
  {
    // Reportes, Consultas por nodo: lo que consultaron los asesores del nodo; las búsquedas de Workforce, aparte
    let rn = g.post({ accion: 'consultasNodo', token: tAgente, datos: { nodo: nodoAlerta } });
    ok(!rn.ok && rn.codigo === 'PERMISO', 'Concentrix no ve el reporte de consultas por nodo', rn);
    rn = g.post({ accion: 'consultasNodo', token: tWf, datos: { nodo: ' ' + nodoAlerta.toLowerCase() + ' ', desde: Date.now() } });
    const R = rn.ok ? Model.resumenNodo(rn.datos) : null;
    const cc = R && R.canales.find((k) => k.canal === 'Call center y redes sociales'), ti = R && R.canales.find((k) => k.canal === 'Tiendas');
    // Lo esperado, contado directo en la bitácora de hoy (otras pruebas también consultaron ese nodo)
    const hcN = g.SpreadsheetApp.openById(g.E.props.get('CONSULTAS_ID')).getSheetByName('Consultas');
    const hoyNodo = hcN.getRange(2, 1, hcN.getLastRow() - 1, 10).getValues().filter((f) => String(f[7]) === nodoAlerta && new Date(f[0]).toDateString() === new Date().toDateString());
    const ext = hoyNodo.filter((f) => !['Workforce HN', 'Jefatura', 'Supervisor'].includes(String(f[3])));
    const esp = { clientes: new Set(ext.map((f) => String(f[6]))).size, consultas: ext.filter((f) => f[5] !== 'reporte').length,
      cc: ext.filter((f) => f[3] === 'Concentrix' && f[5] !== 'reporte').length, ti: ext.filter((f) => f[3] === 'Tiendas' && f[5] !== 'reporte').length,
      internas: hoyNodo.length - ext.length };
    ok(rn.ok && rn.datos.nodo === nodoAlerta && esp.clientes >= 5 && esp.cc >= 5 && esp.ti >= 1 && esp.internas >= 5
      && R.clientes === esp.clientes && R.consultas === esp.consultas && R.totalInternas === esp.internas && cc && cc.consultas === esp.cc && ti && ti.consultas === esp.ti
      && Object.keys(rn.datos.clientes).length === esp.clientes && R.lista.every((c) => c.nombre) && !JSON.stringify(rn.datos).match(/504\d{8}/),
      `consultas por nodo: ${R && R.clientes} clientes y ${R && R.consultas} consultas de asesores (${esp.cc} de call center, ${esp.ti} de tiendas), ${esp.internas} búsquedas de Workforce aparte, con nombres y sin teléfonos`,
      R && { R: { clientes: R.clientes, consultas: R.consultas, internas: R.totalInternas, canales: R.canales }, esp });
    rn = g.post({ accion: 'consultasNodo', token: tWf, datos: { nodo: 'GRA01"; =1' } });
    ok(!rn.ok && rn.codigo === 'DATOS', 'un nodo con caracteres raros se rechaza', rn);
    // Una OLT: la página manda sus nodos y el servidor junta sus consultas en una sola búsqueda (3.6)
    const filasHoy = hcN.getRange(2, 1, hcN.getLastRow() - 1, 10).getValues().filter((f) => new Date(f[0]).toDateString() === new Date().toDateString());
    const conConsultas = [...new Set(filasHoy.map((f) => String(f[7])).filter(Boolean))];
    const otro = conConsultas.find((n) => n !== nodoAlerta);
    const varios = [nodoAlerta, otro, 'ZZZ99'];
    rn = g.post({ accion: 'consultasNodo', token: tWf, datos: { nodos: varios.map((n) => n.toLowerCase()).concat(' ' + nodoAlerta + ' '), desde: Date.now() } });
    const deVarios = filasHoy.filter((f) => varios.includes(String(f[7])));
    const extV = deVarios.filter((f) => !['Workforce HN', 'Jefatura', 'Supervisor'].includes(String(f[3])));
    const RV = rn.ok ? Model.resumenNodo(rn.datos) : null;
    const solo = (n) => Model.resumenNodo(g.post({ accion: 'consultasNodo', token: tWf, datos: { nodo: n, desde: Date.now() } }).datos);
    ok(!!otro && rn.ok && rn.datos.nodos.join() === varios.join() && rn.datos.nodo === '' && rn.datos.filas.length === deVarios.length
      && rn.datos.filas.every((f) => varios.includes(f[6])) && RV.clientes === new Set(extV.map((f) => String(f[6]))).size
      && RV.consultas === solo(nodoAlerta).consultas + solo(otro).consultas && RV.porNodo.get(nodoAlerta).clientes === solo(nodoAlerta).clientes
      && RV.porNodo.get(otro).consultas === solo(otro).consultas && !RV.porNodo.has('ZZZ99') && RV.lista.every((c) => varios.includes(c.nodo)),
      `varios nodos a la vez (${varios.join(', ')}): ${RV && RV.clientes} clientes y ${RV && RV.consultas} consultas, lo mismo que sumando cada nodo, y cada consulta con su nodo`,
      RV && { clientes: RV.clientes, consultas: RV.consultas, filas: rn.datos.filas.length, esperadas: deVarios.length });
    rn = g.post({ accion: 'consultasNodo', token: tWf, datos: { nodos: Array.from({ length: 81 }, (_, i) => 'N' + i) } });
    ok(!rn.ok && rn.codigo === 'DATOS' && /80/.test(rn.mensaje || rn.error || JSON.stringify(rn)), 'más de 80 nodos en un reporte no', rn);
    rn = g.post({ accion: 'consultasNodo', token: tWf, datos: { nodos: [nodoAlerta, 'GRA01"; =1'] } });
    ok(!rn.ok && rn.codigo === 'DATOS', 'ni un nodo con caracteres raros en la lista', rn);
  }
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
  pa = deNodo(posibles(tWf2), nodoAlerta);
  ok(pa && pa.reportada && pa.reportada.por === 'Ana López', 'el resto de Workforce ve quién ya la reportó', pa);
  g.post({ accion: 'alerta', token: tWf2, datos: { op: 'quitar', nodo: nodoAlerta } });
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
  const avDesc = (g.post({ accion: 'estado', token: tAgente }).datos.avisos || []).find((x) => x.id === fPos.id);
  ok(avDesc && avDesc.tipo === 'DESCARTADA' && avDesc.motivo === 'VALIDACION' && avDesc.nodos[0] === nodoAlerta && !/VOC no encontró/.test(JSON.stringify(avDesc)),
    'el aviso de escritorio dice que se descartó (para que los asesores dejen de decir que hay una posible falla), sin la nota interna', avDesc);
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
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'sofia.mejia', clave: 'ClaveTemporal2026', nombre: 'Sofía Mejía' } });
  ok(!r.ok && r.codigo === 'ACCESO', 'los supervisores entran solo con Genesys (no hay acceso con contraseña)', r);
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
  r = g.post({ accion: 'alerta', token: tWf2, datos: { op: 'quitar', nodo: nodoAlerta } });
  ok(r.ok && !deNodo(posibles(), nodoAlerta).reportada, 'y cualquiera de Workforce quita la marca de quien sea', r);
  // Al quitarle el rol en Usuarios, pierde las posibles fallas al instante
  const filaLuis = hu.getLastRow();
  hu.getRange(filaLuis, 3).setValue('concentrix'); C.onEdit({ range: hu.getRange(filaLuis, 3) });
  r = g.post({ accion: 'alertas', token: tSup2 });
  ok(!r.ok && r.codigo === 'PERMISO', 'si en Usuarios le cambian el rol a concentrix, deja de ver las posibles fallas al instante', r);
  hu.getRange(filaLuis, 3).setValue('supervisor'); C.onEdit({ range: hu.getRange(filaLuis, 3) });
  // Topes de consultas (3.7): 60 por hora y 300 por día cada asesor; Workforce, 400 por hora
  ok(g.ejecutar('[ALERTAS.LIMITE_ASESOR_HORA, ALERTAS.LIMITE_ASESOR_DIA, ALERTAS.LIMITE_CONSULTAS_HORA, ALERTAS.LIMITE_TIENDA_HORA, ALERTAS.LIMITE_TIENDAS_HORA, ALERTAS.LIMITE_TIENDAS_DIA].join()') === '60,300,400,200,2000,15000',
    'los topes: 60 por hora y 300 por día cada asesor, 400 por hora Workforce, 200 por tienda y 2,000 por hora (15,000 por día) toda la cuenta de Tiendas');
  const horaL = Math.floor(Date.now() / 3600000), limpiarLimites = () => [...g.E.cache.keys()].filter((k) => /^limite/.test(k)).forEach((k) => g.cache.remove(k));
  const tLim = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-agente' } }).datos.token;
  const hasta = (token, n) => { let u; for (let k = 0; k < n; k++) u = g.post({ accion: 'buscar', token, datos: { q: '9999999' } }); return u; };
  limpiarLimites(); g.ejecutar('ALERTAS.LIMITE_ASESOR_HORA = 3');
  let ultimo = hasta(tLim, 3);
  ok(ultimo.ok, 'un asesor consulta hasta su tope de la hora', ultimo);
  ultimo = hasta(tLim, 1);
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE' && /3 consultas por hora/.test(ultimo.error), 'y la siguiente ya no pasa: límite de consultas por hora', ultimo);
  ok(hasta(tWf, 5).ok, 'Workforce no usa el tope de los asesores');
  g.ejecutar('ALERTAS.LIMITE_ASESOR_HORA = 60; ALERTAS.LIMITE_ASESOR_DIA = 5'); limpiarLimites();
  ultimo = hasta(tLim, 6);
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE' && /por día/.test(ultimo.error), 'un asesor tampoco pasa de su tope del día', ultimo);
  g.ejecutar('ALERTAS.LIMITE_ASESOR_DIA = 300; ALERTAS.LIMITE_TIENDA_HORA = 4'); limpiarLimites();
  // En Tiendas, cambiar el nombre no da más consultas: la tienda y la cuenta tienen su propio tope
  const entraT = (nombre, tienda) => { const x = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre, tienda } }); if (!x.ok) throw new Error('entraT ' + nombre + ': ' + JSON.stringify(x)); return x.datos.token; };
  hasta(entraT('Rosa Pineda', 'CAC Mall Premier'), 2); hasta(entraT('Elena Cruz', 'CAC Mall Premier'), 2);
  ultimo = hasta(entraT('Julio Banegas', 'CAC Mall Premier'), 1);
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE' && /Tu tienda/.test(ultimo.error), 'en Tiendas, entrar con otro nombre no da más consultas: la tienda tiene su tope', ultimo);
  ok(hasta(entraT('Marta Díaz', 'CAC Metromall'), 1).ok, 'y las demás tiendas siguen consultando');
  g.ejecutar('ALERTAS.LIMITE_TIENDA_HORA = 200; ALERTAS.LIMITE_TIENDAS_HORA = 2'); limpiarLimites();
  hasta(entraT('Rosa Pineda', 'CAC Mall Premier'), 1); hasta(entraT('Marta Díaz', 'CAC Metromall'), 1);
  ultimo = hasta(entraT('Elena Cruz', 'CAC Danli'), 1);
  ok(!ultimo.ok && ultimo.codigo === 'LIMITE' && /cuenta de Tiendas/.test(ultimo.error), 'ni cambiando de tienda: toda la cuenta de Tiendas tiene su tope', ultimo);
  g.ejecutar('ALERTAS.LIMITE_TIENDAS_HORA = 2000'); limpiarLimites();
  // La cuenta de Tiendas la comparten ~200 personas: los errores de una no bloquean a las demás
  for (let k = 0; k < 5; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'mala' + k, nombre: 'Rosa Pineda', tienda: 'CAC Mall Premier' } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Rosa Pineda', tienda: 'CAC Mall Premier' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'quien se equivoca 5 veces queda bloqueado 15 minutos', r);
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Marta Díaz', tienda: 'CAC Mall Premier' } });
  ok(r.ok, 'pero las demás tiendas siguen entrando con la misma cuenta', r);
  for (let k = 0; k < 100; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'adivina' + k, nombre: 'Intruso ' + k, tienda: 'X' + k } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Marta Díaz', tienda: 'CAC Mall Premier' } });
  ok(!r.ok && r.codigo === 'LIMITE', 'con 100 contraseñas equivocadas de distintas personas, la cuenta se bloquea 15 minutos', r);
  // Alguien probando contraseñas con nombres distintos: pasadas 300 en el día, la cuenta se bloquea 1 hora cada 20 más
  const probar = (n, pref) => { for (let k = 0; k < n; k++) { g.cache.remove('fallidos-cuenta:tiendas'); g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: pref + k, nombre: 'Persona ' + pref + k, tienda: 'X' } }); } };
  probar(230, 'a');   // con las de arriba pasan de 320: al llegar ahí queda bloqueada
  g.cache.remove('fallidos-cuenta:tiendas');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'NuevaClaveTiendas2026', nombre: 'Marta Díaz', tienda: 'CAC Mall Premier' } });
  ok(!r.ok && r.codigo === 'LIMITE' && /una hora/.test(r.error), 'cambiar el nombre ya no sirve para seguir probando: con más de 300 contraseñas equivocadas en el día, la cuenta se bloquea 1 hora cada 20 intentos', r);
  C.guardarCuenta('tiendas', 'tiendas', 'ClaveTiendasNueva2026');
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaveTiendasNueva2026', nombre: 'Marta Díaz', tienda: 'CAC Mall Premier' } });
  ok(r.ok, 'al cambiar la contraseña, la cuenta se desbloquea', r);
  const tTienda3 = r.datos.token;
  for (let k = 0; k < 20; k++) g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'workforce.temporal', clave: 'adivina' + k, nombre: 'Intruso ' + k } });
  r = g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaveTiendasNueva2026', nombre: 'Marta Díaz', tienda: 'CAC Mall Premier' } });
  ok(r.ok, 'intentos con un usuario que no existe no bloquean la cuenta de Tiendas', r);

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

  /* ---------- Conexiones y nombres de Tiendas ---------- */
  console.log('\n8b. Conexiones y nombres reales en Tiendas');
  const tiendaCon = (nombre) => g.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaveTiendasNueva2026', nombre, tienda: 'CAC Metromall' } });
  const nombresMalos = ['el pepe', 'la mera mera', 'Mera Mera', 'Pepe', 'asdf qwer', 'Juan P', 'Karla 2', 'Prueba Tienda', 'Jjjuan Perez'].map((n) => [n, tiendaCon(n)]);
  ok(nombresMalos.every(([, x]) => !x.ok && x.codigo === 'DATOS' && /nombre|letras/i.test(x.error)), 'Tiendas tiene que poner nombre y apellido reales: rechaza "el pepe", "la mera mera", "Pepe", iniciales y números',
    nombresMalos.filter(([, x]) => x.ok || x.codigo !== 'DATOS').map(([n, x]) => [n, x.codigo]));
  r = tiendaCon('  daniela   RAMÍREZ ');
  ok(r.ok && r.datos.usuario.nombre === 'Daniela Ramírez' && /^tiendas:daniela ramírez@cac metromall$/.test(r.datos.usuario.u), 'y lo deja en nombre propio: "  daniela   RAMÍREZ " entra como Daniela Ramírez', r.datos && r.datos.usuario);
  const tDaniela = r.datos.token;
  r = tiendaCon('maria de los angeles lopez');
  ok(r.ok && r.datos.usuario.nombre === 'Maria de los Angeles Lopez', 'con "de los" en minúscula en medio: ' + (r.datos && r.datos.usuario.nombre));
  // Cada entrada queda en la hoja Accesos del archivo de consultas (una fila por persona)
  const hAcc = g.SpreadsheetApp.openById(g.E.props.get('CONSULTAS_ID')).getSheetByName('Accesos');
  const filaDe = (u) => hAcc.getRange(1, 1, hAcc.getLastRow(), 9).getValues().filter((f) => f[0] === u);
  const fDaniela = filaDe('tiendas:daniela ramírez@cac metromall');
  ok(hAcc && hAcc.getRange(1, 1, 1, 9).getValues()[0].join('|') === 'Usuario|Nombre|Acceso|Tienda|Primera entrada|Última entrada|Entradas|Avisos de escritorio|Avisos al'
    && fDaniela.length === 1 && fDaniela[0][1] === 'Daniela Ramírez' && fDaniela[0][2] === 'Tiendas' && fDaniela[0][3] === 'CAC Metromall' && fDaniela[0][6] === 1,
    'cada entrada queda en la hoja Accesos: Daniela Ramírez, Tiendas, CAC Metromall, 1 entrada', fDaniela);
  const entradasAna = (filaDe('ana.lopez@claro.com.hn')[0] || [])[6];
  g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-wf' } });
  const fAna = filaDe('ana.lopez@claro.com.hn');
  ok(fAna.length === 1 && fAna[0][6] === entradasAna + 1 && fAna[0][2] === 'Workforce HN' && +fAna[0][5] >= +fAna[0][4], 'la misma persona no se repite: suma la entrada y actualiza la última (Ana López, ' + fAna[0][6] + ' entradas)', fAna);
  // La página dice si en esa PC están activados los avisos de escritorio
  r = g.post({ accion: 'uso', token: tDaniela, datos: { avisos: 'bloqueados' } });
  ok(r.ok && filaDe('tiendas:daniela ramírez@cac metromall')[0][7] === 'Bloqueados', 'el estado de los avisos queda en su fila (Bloqueados)', r);
  r = g.post({ accion: 'uso', token: tAgente, datos: { avisos: 'activados' } });
  ok(r.ok && filaDe('karla.zelaya@concentrix.com')[0][7] === 'Activados', 'y Activados para quien los permitió', filaDe('karla.zelaya@concentrix.com'));
  r = g.post({ accion: 'uso', token: tAgente, datos: { avisos: 'otro' } });
  ok(!r.ok && r.codigo === 'DATOS', 'un estado inventado se rechaza', r);
  // El reporte: solo Workforce y Jefatura
  ok(['tAgente', 'tTienda3', 'tSup'].every((k) => { const x = g.post({ accion: 'conexiones', token: { tAgente, tTienda3, tSup }[k], datos: {} }); return !x.ok && x.codigo === 'PERMISO'; }),
    'Concentrix, Tiendas y los supervisores no ven el reporte de conexiones');
  r = g.post({ accion: 'conexiones', token: tWf, datos: { desde: Date.now() - 6 * 86400000 } });
  const pers = r.ok ? r.datos.personas : [];
  const pKarla = pers.find((p) => p.u === 'karla.zelaya@concentrix.com'), pDaniela = pers.find((p) => p.nombre === 'Daniela Ramírez');
  const consultasKarla = hc.getRange(2, 1, hc.getLastRow() - 1, 6).getValues().filter((f) => f[1] === 'karla.zelaya@concentrix.com' && f[5] !== 'reporte').length;
  ok(r.ok && pKarla && pKarla.acceso === 'Concentrix' && pKarla.consultas === consultasKarla && pKarla.entradas >= 1 && pKarla.ultima && pKarla.avisos === 'Activados',
    'Workforce ve a cada persona con su última entrada, entradas, consultas del periodo (' + (pKarla && pKarla.consultas) + ' de Karla) y avisos', pKarla);
  ok(pDaniela && pDaniela.tienda === 'CAC Metromall' && pDaniela.consultas === 0 && pDaniela.avisos === 'Bloqueados' && pers.some((p) => p.acceso === 'Supervisor'),
    'también quien entró y no consultó (Daniela Ramírez, avisos bloqueados) y los supervisores', pDaniela);

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
  r = await subir(b2, tWf2, catJson, 'semana 2.xlsx');
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
  r = sms(tWf2, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
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
  r = sms(tWf2, { op: 'lote', id: f1.id, envio: env1.envio, paso: av1.pasos });
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
  r = sms(tWf2, { op: 'iniciar', id: f1.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  const env2 = r.ok ? r.datos : {};
  ok(r.ok && env2.total === 3 && env2.ya === espera.size - 5 && env2.enDuda === 2, 'otra vez solo va a los 3 con error (ya lo puede mandar otra persona); a los que quedaron en duda no se les reenvía', r.datos);
  const av2 = mandarTodo(tWf2, f1.id, env2);
  r = sms(tWf2, { op: 'terminar', id: f1.id, envio: env2.envio });
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
    dentro.otro = sms(tWf2, { op: 'iniciar', id: fR.id, tipo: 'FALLA', aprobado: 'POSTES' });
    dentro.resumen = sms(tWf2, { op: 'resumen', id: fR.id });
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
  r = sms(tWf2, { op: 'iniciar', id: f3.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  ok(!r.ok && !lease(f3.id) && hEnv().getLastRow() === filasAntesF, 'si no se pueden apartar las filas, no queda un envío a medias que trabe la falla', r);
  r = sms(tWf2, { op: 'iniciar', id: f3.id, tipo: 'FALLA', aprobado: 'FIBRA' });
  const env7 = r.ok ? r.datos : {};
  ok(r.ok && env7.total >= 150 && lease(f2.id) && lease(f3.id) && lease(f3.id).n === 'Mario Rivera', 'otra persona manda a otra falla al mismo tiempo (' + env7.total + ' celulares)', r);
  const sy1 = sms(tWf2, { op: 'lote', id: f3.id, envio: env7.envio, paso: 0 });
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
  const sy3 = sy1.ok ? sms(tWf2, { op: 'lote', id: f3.id, envio: env7.envio, paso: sy1.datos.pasos }) : sy1;
  const sy4 = sy2.ok ? sms(tWf, { op: 'lote', id: f2.id, envio: env6.envio, paso: sy2.datos.pasos }) : sy2;
  const idsDe = (f) => N.enviados.filter((e) => e.id.indexOf('AL-' + f.id + '-F-') === 0).length;
  const e5 = contar(filasDe(env5.envio)), e6 = contar(filasDe(env6.envio)), e7 = contar(filasDe(env7.envio));
  ok(sy1.ok && sy2.ok && sy3.ok && sy4.ok && e7.Enviado === sy3.datos.enviados && e7.Enviado === idsDe(f3) && e6.Enviado === sy4.datos.enviados && idsDe(f2) === 50 + e6.Enviado
    && e5.Enviado === 50 && e5.Cancelado === env5.total - 50 && repetidos() === 0,
    'cada envío anota solo sus filas, aunque se intercalen y se borren filas de arriba', [e5, e6, e7, sy3.datos && sy3.datos.enviados, sy4.datos && sy4.datos.enviados]);
  g.post({ accion: 'falla', token: tWf, datos: { op: 'cerrar', id: f3.id, cerradaEn: Date.now() - 60000, nota: 'Prueba de SMS' } });
  r = sms(tWf2, { op: 'lote', id: f3.id, envio: env7.envio, paso: sy3.datos.pasos });
  r2 = sms(tWf2, { op: 'terminar', id: f3.id, envio: env7.envio });
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

  /* Reporte de SMS (Notifícame): un envío por fila, con la falla, el mensaje, quién, clientes y partes */
  console.log('\n9b3. Reporte de los SMS enviados');
  r = sms(tAgente, { op: 'reporte', desde: 0 });
  ok(!r.ok && r.codigo === 'PERMISO', 'Concentrix no ve el reporte de SMS', r);
  r = sms(tWf, { op: 'reporte', desde: 0 });
  const rep1 = r.ok ? r.datos.envios : [];
  const fallasSms = g.post({ accion: 'cargar', token: tWf, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.sms && f.sms.length);
  const anotados = fallasSms.reduce((t, f) => t + f.sms.length, 0), enviadosFallas = fallasSms.reduce((t, f) => t + f.sms.reduce((a, x) => a + x.enviados, 0), 0);
  ok(r.ok && rep1.length === anotados && rep1.reduce((t, e) => t + e.enviados, 0) === enviadosFallas && rep1.every((e, i) => !i || rep1[i - 1].en >= e.en),
    'el reporte trae cada envío que quedó en las fallas (' + rep1.length + ' envíos, ' + enviadosFallas + ' SMS a clientes), del más nuevo al más viejo', [rep1.length, anotados]);
  const eC = rep1.find((e) => e.id === f4.id && e.control === 4);
  ok(eC && eC.mensaje === 'Falla de energía eléctrica' && eC.texto === msjC && eC.por === 'Ana López' && eC.errores === 4 && eC.partes === 2 && eC.sms === 2 * (eC.enviados + 4)
    && eC.clientes === eC.enviados + eC.errores + eC.dudosos + eC.sinEnviar && eC.aviso === 'Aviso de falla' && eC.motivo && eC.nodos && eC.falla && eC.fin >= eC.en,
    'cada envío dice la falla, el mensaje aprobado y su texto, quién lo mandó, clientes, con error, control y partes (' + (eC && eC.sms) + ' partes)', eC);
  ok(rep1.every((e) => e.texto && e.partes === 2 && e.sms === 2 * (e.enviados + e.control)) && !/504\d{8}|\b[2-9]\d{7}\b/.test(JSON.stringify(rep1).replace(/"envio":"[^"]*"/g, '')),
    'todos con su texto y 2 partes por número (los mensajes aprobados pasan de 160 caracteres), y sin teléfonos');
  r = sms(tWf, { op: 'reporte', desde: Date.now() + 3600000 });
  ok(r.ok && r.datos.envios.length === 0, 'el periodo filtra por fecha del envío');
  // Los envíos de antes de la 3.4 (la hoja todavía no existía): se arma sola con lo anotado en las fallas
  const hRep = g.E.activo.getSheetByName('Reporte SMS');
  ok(hRep && hRep.getRange(1, 1, 1, 19).getValues()[0].join('|') === 'Fecha|Terminó|Falla|ID de Alertas|Motivo|Nodos|Aviso|Mensaje|Texto|Envió|Clientes|Enviados|Con error|En duda|Sin enviar|Números de control|Partes por SMS|SMS (partes)|Envío',
    'la hoja Reporte SMS de la base interna tiene una fila por envío', hRep && hRep.getLastRow());
  g.E.activo.deleteSheet(hRep);
  r = sms(tWf, { op: 'reporte', desde: 0 });
  const rep2 = r.ok ? r.datos.envios : [];
  const eC2 = rep2.find((e) => e.id === f4.id && e.control === 4);
  ok(r.ok && rep2.length === rep1.length && rep2.reduce((t, e) => t + e.enviados, 0) === enviadosFallas && eC2 && eC2.mensaje === 'Falla de energía eléctrica' && eC2.por === 'Ana López',
    'si la hoja no existe (envíos de antes de la 3.4), se arma con lo anotado en las fallas y reconoce el mensaje por los números de control', [rep2.length, eC2 && eC2.mensaje]);

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
  // Salen contratos de un solo servicio: si saliera la primera fila de un contrato con varios, el nodo de la siguiente
  // podría ser otro y contaría como cambio de nodo (los datos de prueba cambian con la fecha)
  for (let i = 500; sale.size < 150 && i < filas2.length; i += 7) if (porContrato.get(filas2[i][iCo]) === 1) sale.add(i);
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
  {
    // Una base publicada antes de que el catálogo trajera colonias: subir el mismo Excel otra vez se las agrega
    const sinColonias = Object.assign({}, catJson, { formato: 1, cols: undefined, nodos: catJson.nodos.map((n) => n.slice(0, 8)) });
    r = porCambios(filas3, tWf, cols3, 'semana 3 sin colonias.xlsx', (d) => { d.catalogo = sinColonias; });
    let rc = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: 0 } });
    const antes = r.ok && rc.ok && rc.datos.catalogo && !rc.datos.catalogo.cols && !Model.cargarCatalogo(rc.datos.catalogo).conColonias;
    r = porCambios(filas3, tWf, cols3, 'semana 3 otra vez.xlsx');
    rc = g.post({ accion: 'cargar', token: tAgente, datos: { baseVersion: 0 } });
    ok(antes && r.ok && r.datos.agregadas === 0 && r.datos.quitadas === 0 && igual(filasHoja(), comoHoja(filas3)) && rc.ok
      && rc.datos.catalogo.formato === 2 && Model.cargarCatalogo(rc.datos.catalogo).conColonias,
      'con una base publicada sin colonias, subir el mismo Excel otra vez agrega las colonias sin cambiar ninguna fila', [antes, r.datos, rc.ok && rc.datos.catalogo.formato]);
  }

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

  r = g.post({ accion: 'base', token: tWf2, datos: { op: 'iniciar', total: 10, columnas: cols3, archivo: 'otra.xlsx' } });
  const rOcupado = porCambios(filas5, tWf, cols3, 'x');
  ok(r.ok && !rOcupado.ok && rOcupado.codigo === 'OCUPADO' && /Mario Rivera/.test(rOcupado.error), 'si otra persona está subiendo la base completa, espera', rOcupado);
  g.post({ accion: 'base', token: tWf2, datos: { op: 'cancelar', id: r.datos.id } });

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
  temporalViejo();
  const rMant = C.limpiarConsultas();
  ok(rMant && rMant.temporales === 1 && Object.keys(JSON.parse(g.E.props.get('CUENTAS'))).join() === 'tiendas', 'el mantenimiento también borra un acceso temporal que haya quedado de antes', rMant && rMant.temporales);
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
  // (en un nodo sin falla activa: desde la 3.8 un nodo solo puede estar en una a la vez)
  const libreEn2 = (token) => { const act = new Set(g2.post({ accion: 'cargar', token, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos)); return [...ixc.nodoIdx.keys()].filter((n) => !U.esVirtual(n) && !act.has(n)); };
  r = g2.post({ accion: 'falla', token: tw2, datos: { op: 'publicar', falla: { nodos: [libreEn2(tw2)[0]], motivo: 'ENERGIA', numero: 'F1254585' } } });
  const fNum12 = r.datos && r.datos.falla;
  ok(r.ok && hf2.getMaxColumns() === 20 && hf2.getRange(1, 20).getValue() === 'Número de falla' && r.datos.falla.numero === 'F1254585',
    'al guardar la primera falla con el código nuevo, la hoja recibe la columna Número de falla', r.ok ? hf2.getMaxColumns() : r);
  r = g2.post({ accion: 'cargar', token: tw2, datos: { baseVersion: -1 } });
  ok(r.ok && r.datos.fallas.length === fViejas.length + 1 && r.datos.fallas.filter((f) => f.numero === 'F1254585').length === 1, 'las fallas viejas y la nueva conviven bien');
  if (fNum12) g2.post({ accion: 'falla', token: tw2, datos: { op: 'cerrar', id: fNum12.id } });

  /* ---------- Pestañas ocultas y protegidas, como el archivo de auditorías ---------- */
  console.log('\n13. Ocultar y proteger las pestañas (solo la cuenta dueña)');
  const DESC = g2.ejecutar('BLOQUEO_DESC');
  const libroC2 = () => g2.SpreadsheetApp.openById(g2.E.props.get('CONSULTAS_ID'));
  const pestanas = () => [g2.E.activo, libroC2()].flatMap((l) => l.getSheets());
  const deAlertas = (h) => h.getProtections('SHEET').filter((p) => p.getDescription() === DESC);
  const visibles = (l) => l.getSheets().filter((h) => !h.isSheetHidden()).map((h) => h.getName());
  const mensaje = () => (g2.E.alertas[g2.E.alertas.length - 1] || [])[1] || '';
  const OTRO = 'otra.cuenta@claro.com.hn';
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
  r = g2.post({ accion: 'falla', token: tw3, datos: { op: 'publicar', falla: { nodos: [libreEn2(tw3)[0]], motivo: 'FIBRA' } } });
  ok(r.ok, 'Workforce sigue publicando fallas', r);
  if (r.ok) g2.post({ accion: 'falla', token: tw3, datos: { op: 'cerrar', id: r.datos.falla.id } });
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

  /* ---------- Tiempo de afectación del cliente (para Ajustes y las notas de crédito) ---------- */
  console.log('\n15. Tiempo de afectación del cliente (para Ajustes)');
  {
    const L = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
    const ahora = L(2026, 11, 9, 15, 20, 30);
    const lista = [
      { id: 'F2610040', motivo: 'POSTES', inicio: L(2026, 10, 4, 20, 0), fin: L(2026, 10, 5, 1, 0) },
      { id: 'F2610050', motivo: 'ENERGIA', inicio: L(2026, 10, 5, 10, 0, 40), fin: L(2026, 10, 5, 12, 0, 10), numero: 'F1250001' },
      { id: 'F2610051', motivo: 'FIBRA', inicio: L(2026, 10, 5, 11, 0), fin: L(2026, 10, 5, 14, 30) },
      { id: 'F2610310', motivo: 'MANTENIMIENTO', inicio: L(2026, 10, 31, 22, 0), fin: L(2026, 11, 1, 2, 0) },
      { id: 'F2609300', motivo: 'OTRO', motivoTexto: 'Robo de cable', inicio: L(2026, 9, 29, 20, 0), fin: L(2026, 10, 1, 0, 0) },
      { id: 'F2611090', motivo: 'VALIDACION', inicio: L(2026, 11, 9, 8, 0), fin: null },
      { id: 'F2611100', motivo: 'MANTENIMIENTO', inicio: L(2026, 11, 10, 1, 0), fin: L(2026, 11, 10, 3, 0) }
    ];
    const recA = { contrato: 9999901, nombre: 'JUAN CARLOS PEREZ', nodo: 'TGU01', tecnologia: 'HFC', colonia: 'COL. EL CASTA¿O SUR', municipio: 'DISTRITO CENTRAL', departamento: 'FRANCISCO MORAZAN', fecha: 0 };
    const oct = Model.periodoAfectacion('anterior', ahora);
    ok(oct.desde === L(2026, 10, 1) && oct.hasta === L(2026, 11, 1) && oct.en === 'en octubre', '"Mes pasado" va del 1 de octubre a las 00:00 al 1 de noviembre a las 00:00', oct);
    const hO = Model.historialCliente(lista, recA, ahora, 365, oct);
    ok(hO.fallas.map((f) => f.id).join() === 'F2610310,F2610051,F2610050,F2610040',
      'en octubre entran las fallas que lo tocan; la que terminó justo a las 00:00 del 1 de octubre y la de noviembre no', hO.fallas.map((f) => f.id));
    ok(hO.msConfirmado === 690 * U.MIN && hO.solape === 60 * U.MIN && U.durHM(hO.msConfirmado) === '11 h 30 min',
      'el total une los tramos: la hora en que la de energía y la de fibra coincidieron cuenta una vez (11 h 30 min, no 12 h 30 min)', [hO.msConfirmado / U.MIN, hO.solape / U.MIN]);
    const mant = hO.fallas.find((f) => f.id === 'F2610310'), ener = hO.fallas.find((f) => f.id === 'F2610050');
    ok(mant.duracion === 240 * U.MIN && mant.dentro === 120 * U.MIN && mant.recortada && ener.duracion === 120 * U.MIN,
      'la que cruza al 1 de noviembre dura 4 h pero solo 2 h son de octubre; los segundos no cuentan (10:00:40 a 12:00:10 son 2 h)', [mant.dentro / U.MIN, ener.duracion / U.MIN]);
    const nov = Model.periodoAfectacion('mes', ahora);
    const hN = Model.historialCliente(lista, recA, ahora, 365, nov);
    ok(hN.fallas.map((f) => f.id).join() === 'F2611090,F2610310' && hN.msConfirmado === 120 * U.MIN && hN.ms === (120 + 440) * U.MIN && hN.pendientes.length === 1,
      '"Este mes": la posible falla en validación sale en la lista pero no se suma al tiempo para Ajustes (2 h y no 9 h 20 min)', [hN.fallas.map((f) => f.id), hN.msConfirmado / U.MIN, hN.ms / U.MIN]);
    const recB = Object.assign({}, recA, { fecha: Date.UTC(2026, 9, 5) / U.DIA });
    const hB = Model.historialCliente(lista, recB, ahora, 365, oct);
    ok(hB.desdeAlta && hB.desde === L(2026, 10, 5) && hB.msConfirmado === (60 + 270 + 120) * U.MIN,
      'si es cliente desde el 5 de octubre, cuenta desde las 00:00 de ese día (de la caída de postes solo 1 h)', [hB.desde, hB.msConfirmado / U.MIN]);
    ok(Model.reincidente(lista, recA, ahora) && Model.historialCliente(lista, recA, ahora, 90).total === 6, 'en Consulta sigue igual: 6 fallas en 90 días y cliente reincidente');
    const r15 = Model.resumenAfectacion(hO, recA, ahora);
    const lineas = r15.texto.split('\r\n');
    ok(lineas[0] === 'Tiempo de afectación del servicio' && lineas.includes('Contrato: 9999901 · Cliente: Juan Carlos Perez')
      && lineas.includes('Nodo: TGU01 (HFC) · Col. El Castaño Sur, Distrito Central, Francisco Morazán') && lineas.includes('Periodo: del 1 oct 2026 al 31 oct 2026'),
      'Copiar para Ajustes: el contrato, el cliente, su nodo y colonia (limpia) y el periodo', lineas.slice(0, 5));
    ok(lineas.includes('1. F2610040 · Caída de postes · 4 oct 2026, 8:00 p. m. a 5 oct 2026, 1:00 a. m. · 5 h')
      && lineas.includes('2. F1250001 · Falla de energía comercial · 5 oct 2026, 10:00 a. m. a 12:00 p. m. · 2 h')
      && lineas.includes('4. F2610310 · Mantenimiento preventivo · 31 oct 2026, 10:00 p. m. a 1 nov 2026, 2:00 a. m. · 4 h (2 h dentro del periodo)'),
      'cada falla con su número, motivo, inicio, fin y duración, de la más vieja a la más nueva', lineas.slice(5, 11));
    ok(lineas.includes('Tiempo total de afectación: 11 h 30 min (11.50 horas · 0.48 días)') && lineas.includes('Hay 1 h en que dos fallas coinciden: ese tiempo se cuenta una sola vez.')
      && /^Fuente: Alertas, fallas registradas para el nodo TGU01\. Consultado el 9 nov 2026 a las 3:20 p\. m\.$/.test(lineas[lineas.length - 1]),
      'el total en horas y minutos, en horas y en días, y de dónde sale', lineas.slice(-4));
    ok(/<table[^>]*>.*<th[^>]*>Duración<\/th>.*Tiempo total de afectación.*11 h 30 min/.test(r15.html) && !/undefined|null/.test(r15.html + r15.texto),
      'para Outlook va con tabla (cada falla y el total)');
    const csv15 = r15.filas;
    ok(csv15[0].join() === 'Contrato,Cliente,Nodo,Falla,Motivo,Estado,Inicio,Fin,Duración,Minutos,Minutos en el periodo'
      && csv15[4].join() === '9999901,Juan Carlos Perez,TGU01,F2610310,Mantenimiento preventivo,Resuelta,2026-10-31 22:00,2026-11-01 02:00,4 h,240,120'
      && csv15[5][3] === 'Total' && csv15[5][10] === 690 && r15.archivo === 'afectacion-9999901-2026-10-01-a-2026-10-31.csv',
      'el CSV: una fila por falla (con fecha y hora que Excel entiende, minutos y minutos en el periodo) y el total', [csv15[4], csv15[5], r15.archivo]);
    const tN = Model.resumenAfectacion(hN, recA, ahora).texto;
    ok(tN.includes('Periodo: del 1 nov 2026 a hoy, 9 nov 2026 a las 3:20 p. m.') && tN.includes('9 nov 2026, 8:00 a. m., sigue activa · 7 h 20 min (posible falla en validación: no se suma)')
      && tN.includes('Tiempo total de afectación: 2 h (2.00 horas · 0.08 días)') && tN.includes('No se suma la posible falla que Workforce HN sigue validando.'),
      'con una posible falla en validación lo dice y no la suma', tN);
    const f3 = Model.periodoAfectacion('fechas', ahora, { desde: '2026-11-05', hasta: '2026-11-01' });
    ok(f3.desde === L(2026, 11, 1) && f3.hasta === L(2026, 11, 6) && Model.textoPeriodo(f3.desde, f3.hasta, ahora) === 'del 1 nov 2026 al 5 nov 2026',
      '"Fechas": del primer día a las 00:00 al último día completo (si se ponen al revés, se ordenan)', f3);
    const f4 = Model.periodoAfectacion('fechas', ahora, { desde: '2024-01-01', hasta: '2027-01-01' });
    ok(f4.desde === L(2025, 11, 9) && f4.hasta === ahora, 'y no pasan de un año atrás ni de ahora', f4);
    const d90 = Model.periodoAfectacion('90', ahora);
    ok(d90.desde === L(2026, 8, 12) && d90.en === 'en 90 días' && U.durHM(0) === '0 min' && U.durHM(30000) === 'menos de 1 min' && U.durHM(75 * U.HORA + 5 * U.MIN) === '75 h 5 min',
      '"90 días" va de las 00:00 de hace 89 días a ahora; las duraciones no pasan a días (75 h 5 min)', d90);
  }

  /* ---------- Fallas duplicadas: dos personas publicando la misma, o un doble clic ---------- */
  console.log('\n16. Un nodo solo puede estar en una falla activa a la vez');
  {
    const [nA, nB, nC] = libreEn2(tw3);
    const activos = () => new Set(g2.post({ accion: 'cargar', token: tw3, datos: { baseVersion: -1 } }).datos.fallas.filter((f) => f.estado === 'ACTIVA').flatMap((f) => f.nodos));
    const pub = (nodos, extra) => g2.post({ accion: 'falla', token: tw3, datos: { op: 'publicar', falla: Object.assign({ nodos, motivo: 'ENERGIA' }, extra || {}) } });
    const op = (o, id, extra) => g2.post({ accion: 'falla', token: tw3, datos: Object.assign({ op: o, id }, extra || {}) });
    const fA = pub([nA, nB]).datos.falla;
    let d = pub([nA], { motivo: 'FIBRA' });
    ok(!d.ok && d.codigo === 'DUPLICADA' && new RegExp('^' + nA + ' ya está en la falla activa ' + U.numeroFalla(fA) + ' \\(Falla de energía comercial\\), que publicó .+ hace un momento\\. Un nodo solo puede estar en una falla activa a la vez: edita esa falla o quita ese nodo de esta\\.$').test(d.error),
      'publicar otra falla en un nodo que ya tiene una activa no se puede, y dice cuál es y quién la publicó', d);
    d = pub([nC, nB, nA]);
    ok(!d.ok && d.codigo === 'DUPLICADA' && /ya están en la falla activa/.test(d.error) && d.error.includes(nA) && d.error.includes(nB) && !activos().has(nC),
      'tampoco si solo algunos de sus nodos están en otra falla, y no queda nada publicado a medias', d);
    const fC = pub([nC]);
    ok(fC.ok, 'con nodos libres sí se publica', fC);
    d = op('editar', fC.datos.falla.id, { falla: { nodos: [nC, nA] }, detalle: 'Agregó ' + nA });
    ok(!d.ok && d.codigo === 'DUPLICADA' && d.error.includes(nA), 'al editar, agregar un nodo que está en otra falla activa tampoco', d);
    d = op('editar', fA.id, { falla: { eta: Date.now() + 3600000 }, detalle: 'Cambió la hora estimada' });
    ok(d.ok && d.datos.falla.nodos.join() === [nA, nB].join(), 'editar otros datos de una falla sigue igual', d);
    op('cerrar', fA.id);
    const fA2 = pub([nA]);
    ok(fA2.ok, 'al cerrar la primera, el nodo queda libre para una falla nueva', fA2);
    d = op('reabrir', fA.id);
    ok(!d.ok && d.codigo === 'DUPLICADA' && d.error.includes(nA), 'y la primera no se puede reabrir mientras su nodo esté en la nueva', d);
    op('cerrar', fA2.datos.falla.id);
    d = op('reabrir', fA.id);
    ok(d.ok && d.datos.falla.estado === 'ACTIVA', 'cerrada la nueva, sí se reabre', d);
    op('cerrar', fA.id); op('cerrar', fC.datos.falla.id);
  }

  console.log('\n17. Mapa en vivo: datos por departamento, movimientos y etiquetas');
  {
    const H = U.HORA, MIN = U.MIN, now = new Date(2026, 10, 11, 13, 54, 0).getTime();
    const imp = (deps) => ({ total: deps.reduce((a, x) => a + x[1], 0), hfc: 0, gpon: 0, corp: 0, deps, munis: [] });
    const falla = (id, o) => Object.assign({ id, numero: 'F77700' + id, estado: 'ACTIVA', motivo: 'FIBRA', motivoTexto: '', nodos: ['N' + id], inicio: now - H, publicadaEn: now - H,
      cerradaEn: null, impacto: imp([]) }, o);
    const fallas = [
      falla('a1', { nodos: ['PRUEBA-A1', 'PRUEBA-A2'], inicio: now - 200 * MIN, publicadaEn: now - 195 * MIN, impacto: imp([['OLANCHO', 2500]]) }),
      falla('a2', { nodos: ['PRUEBA-A3'], inicio: now - 99 * MIN, publicadaEn: now - 90 * MIN, motivo: 'ENERGIA', impacto: imp([['OLANCHO', 1100]]) }),
      falla('a3', { nodos: ['PRUEBA-A4'], inicio: now - 22 * MIN, publicadaEn: now - 22 * MIN, motivo: 'VALIDACION', impacto: imp([['OLANCHO', 480], ['ATLANTIDA', 1]]) }),
      falla('b1', { nodos: ['PRUEBA-B1'], inicio: now - 172 * MIN, publicadaEn: now - 170 * MIN, impacto: imp([['INTIBUCÁ', 1900]]) }),
      falla('c1', { nodos: ['PRUEBA-C1'], inicio: now - 48 * MIN, publicadaEn: now - 48 * MIN, motivo: 'ENERGIA', impacto: imp([['COMAYAGUA', 1300], ['CORTES', 1]]) }),
      falla('d1', { nodos: ['PRUEBA-D1', 'PRUEBA-D2'], inicio: now - 54 * MIN, publicadaEn: now - 50 * MIN, motivo: 'POSTES', impacto: imp([['FRANCISCO MORAZAN', 1150]]) }),
      falla('r1', { estado: 'CERRADA', nodos: ['PRUEBA-R1'], inicio: now - 171 * MIN, publicadaEn: now - 170 * MIN, cerradaEn: now - 41 * MIN, impacto: imp([['YORO', 1200]]) }),
      // Una posible falla que se cerró sin motivo real queda descartada: no la ven los asesores ni el mapa
      falla('x1', { estado: 'CERRADA', motivo: 'VALIDACION', nodos: ['PRUEBA-X1'], inicio: now - 30 * MIN, publicadaEn: now - 30 * MIN, cerradaEn: now - 10 * MIN, impacto: imp([['YORO', 50]]) })
    ];
    const mf = Model.mapaFallas(fallas, now);
    const v = Model.mapaVivo(null, mf, now, []);
    ok(v.clientes === 8432 && v.fallas === 6 && v.nodos === 8 && v.departamentos === 4, 'totales: clientes, fallas activas, nodos y departamentos afectados', [v.clientes, v.fallas, v.nodos, v.departamentos]);
    ok(v.deps.map((d) => d.k + ':' + d.clientes + ':' + d.fallas).join(' ') === 'OLANCHO:4080:3 INTIBUCA:1900:1 COMAYAGUA:1300:1 FRANCISCO MORAZAN:1150:1 ATLANTIDA:1:0 CORTES:1:0',
      'por departamento, de más a menos: sus clientes y las fallas que lo tienen como zona afectada (el nombre se compara sin tildes)', v.deps.map((d) => d.k + ':' + d.clientes + ':' + d.fallas));
    const deK = (k) => v.deps.find((d) => d.k === k);
    ok(deK('ATLANTIDA').principal === false && deK('ATLANTIDA').vecinas === 1 && deK('CORTES').principal === false && deK('OLANCHO').principal === true,
      'un departamento con solo 1 cliente de una falla de otra zona no cuenta como afectado: en el mapa es un punto', [deK('ATLANTIDA'), deK('CORTES')]);
    ok(deK('OLANCHO').desde === now - 200 * MIN && deK('ATLANTIDA').desde === now - 22 * MIN && v.antigua.id === 'a1', 'cada departamento dice desde cuándo, y se sabe cuál es la falla activa más antigua');
    ok(v.nuevas === 3 && v.resueltas === 1, 'en la última hora: 3 fallas nuevas y 1 resuelta (la descartada no cuenta)', [v.nuevas, v.resueltas]);
    ok(v.movimientos.map((m) => m.id + ':' + m.tipo).join(' ') === 'a3:PUBLICADA r1:RESUELTA c1:PUBLICADA d1:PUBLICADA a2:PUBLICADA b1:PUBLICADA a1:PUBLICADA',
      'los últimos movimientos van del más nuevo al más viejo, sin la falla descartada', v.movimientos.map((m) => m.id + ':' + m.tipo));
    const r1 = v.movimientos[1];
    ok(r1.duracion === 130 * MIN && r1.zona.join() === 'YORO' && U.dur(r1.duracion) === '2 h 10 min' && v.movimientos[0].zona.join() === 'OLANCHO' && v.movimientos[0].clientes === 481,
      'cada movimiento trae su zona (sin el departamento de 1 cliente), sus clientes y, si se resolvió, cuánto duró', [r1.duracion, r1.zona, v.movimientos[0].zona]);
    const vr = Model.mapaVivo(null, mf, now, [{ id: 'b1', tipo: 'REABIERTA', en: now - 3 * MIN, v: 9 }, null, { id: 'a1', tipo: 'PUBLICADA', en: now - 195 * MIN, v: 2 }]);
    ok(vr.movimientos[0].id === 'b1' && vr.movimientos[0].tipo === 'REABIERTA' && vr.movimientos[0].t === now - 3 * MIN && vr.nuevas === 4,
      'una falla que se reabrió hace 3 minutos sube al primer lugar como Reabierta y cuenta entre las nuevas', [vr.movimientos[0].id, vr.movimientos[0].tipo, vr.nuevas]);
    const chica = Model.mapaVivo(null, Model.mapaFallas([falla('v1', { nodos: ['PRUEBA-V1'], impacto: imp([['VALLE', 8]]) })], now), now, []);
    ok(chica.deps.length === 1 && chica.deps[0].principal && chica.departamentos === 1, 'una falla pequeña (8 clientes) sí marca su departamento: es su zona, no un cliente suelto', chica.deps);
    const vacio = Model.mapaVivo(null, Model.mapaFallas([], now), now, null);
    ok(vacio.clientes === 0 && vacio.fallas === 0 && !vacio.deps.length && vacio.antigua === null && !vacio.movimientos.length, 'sin fallas, el mapa queda en ceros', vacio);
    // Con el catálogo de la base actual, los clientes por departamento salen de sus nodos (no de lo guardado al publicar)
    const cat17 = Model.cargarCatalogo(catJson);
    const nodoCat = [...cat17.nodos.values()].find((n) => n.total >= 40 && n.deps.length);
    const vc = Model.mapaVivo(cat17, Model.mapaFallas([falla('k1', { nodos: [nodoCat.code], impacto: imp([['DEPARTAMENTO VIEJO', 5]]) })], now), now, []);
    ok(cat17.conColonias ? vc.deps[0].k === Model.claveDep(nodoCat.deps[0][0]) && vc.deps.reduce((a, d) => a + d.clientes, 0) === nodoCat.deps.reduce((a, x) => a + x[1], 0)
      : vc.deps[0].k === 'DEPARTAMENTO VIEJO', 'con la base actual, los clientes por departamento salen de los nodos de la falla', vc.deps);

    // La escena: círculos, etiquetas y nombres en el lienzo de diseño, sin encimarse
    const fuenteMapa = fs.readFileSync(path.join(RAIZ, 'src', 'ui-stats.js'), 'utf8');
    const anclas = vm.runInNewContext('(' + fuenteMapa.match(/const HN_NOMBRES = (\{[\s\S]*?\n\});/)[1] + ')');
    ok(Object.keys(anclas).length === 18, 'el mapa conoce dónde va cada uno de los 18 departamentos', Object.keys(anclas).length);
    const choca = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const cajaDe = (m) => ({ x: m.x - m.r, y: m.y - m.r, w: 2 * m.r, h: 2 * m.r });
    const fijos = Model.fijosVivo({ hora: true, leyenda: true, movimientos: 4 });
    const e = Model.escenaVivo(v, anclas, fijos);
    ok(e.marcas.map((m) => m.id + ':' + (m.etiqueta ? m.etiqueta.lado : '-')).join(' ') === 'OLANCHO:abajo INTIBUCA:abajo COMAYAGUA:arriba FRANCISCO MORAZAN:abajo',
      'con Olancho, Intibucá, Comayagua y Francisco Morazán, la etiqueta de Comayagua sube para no pegarse al círculo de Intibucá', e.marcas.map((m) => m.id + ':' + (m.etiqueta ? m.etiqueta.lado : '-')));
    ok(Math.round(e.marcas[0].r) === 31 && e.marcas[0].r > e.marcas[1].r && e.marcas[1].r > e.marcas[3].r && Model.radioVivo(8) === 7 && Model.radioVivo(90000) === 40,
      'el círculo crece con los clientes (con un mínimo y un máximo)', e.marcas.map((m) => m.r));
    ok(e.nombres.some((n) => n.id === 'CORTES' && n.d) && e.nombres.some((n) => n.id === 'ATLANTIDA' && n.d) && e.nombres.some((n) => n.id === 'YORO' && !n.d) && !e.puntos.length,
      'Cortés y Atlántida salen con su nombre y un punto; los demás, con su nombre', e.nombres.map((n) => n.id));
    const revisarEscena = (esc, zonas) => {
      const et = esc.marcas.filter((m) => m.etiqueta).map((m) => Object.assign({ id: m.id }, m.etiqueta));
      const malas = [];
      et.forEach((a, i) => {
        if (a.x < 0 || a.y < 0 || a.x + a.w > Model.VIVO.w || a.y + a.h > Model.VIVO.h) malas.push(a.id + ' se sale');
        et.slice(i + 1).forEach((b) => { if (choca(a, b)) malas.push(a.id + ' con ' + b.id); });
        esc.marcas.forEach((m) => { if (m.id !== a.id && choca(a, cajaDe(m))) malas.push(a.id + ' sobre el círculo de ' + m.id); });
        zonas.forEach((z) => { if (choca(a, z)) malas.push(a.id + ' sobre ' + z.id); });
      });
      esc.nombres.forEach((n) => {
        const c = { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h };
        et.forEach((a) => { if (choca(c, a)) malas.push('nombre ' + n.id + ' con ' + a.id); });
        esc.marcas.forEach((m) => { if (choca(c, cajaDe(m))) malas.push('nombre ' + n.id + ' sobre ' + m.id); });
        zonas.forEach((z) => { if (choca(c, z)) malas.push('nombre ' + n.id + ' sobre ' + z.id); });
      });
      return malas;
    };
    ok(!revisarEscena(e, fijos).length, 'ninguna etiqueta ni nombre tapa otra etiqueta, un círculo ni los letreros fijos', revisarEscena(e, fijos));
    // El peor caso: los 18 departamentos con falla a la vez, con todos los tamaños
    const todos = Object.keys(anclas).map((k, i) => falla('t' + i, { nodos: ['T' + i], impacto: imp([[k, [12000, 5200, 2400, 900, 310, 45][i % 6]]]) }));
    const v18 = Model.mapaVivo(null, Model.mapaFallas(todos, now), now, []);
    const e18 = Model.escenaVivo(v18, anclas, fijos);
    const con18 = e18.marcas.filter((m) => m.etiqueta).length;
    ok(e18.marcas.length === 18 && !e18.nombres.length && !revisarEscena(e18, fijos).length && con18 >= 12,
      'con los 18 departamentos en falla a la vez: 18 círculos y ' + con18 + ' etiquetas, ninguna encimada (las que no caben se quedan sin etiqueta)', [con18, revisarEscena(e18, fijos)]);
    const e0 = Model.escenaVivo(vacio, anclas, Model.fijosVivo({ hora: false, leyenda: false, movimientos: 0 }));
    ok(!e0.marcas.length && e0.nombres.length === 18, 'sin fallas, el mapa muestra los 18 nombres y ningún círculo', e0.nombres.length);
    ok(U.anchoTexto('Francisco Morazán', 13, 650) >= 115.9 && U.anchoTexto('Francisco Morazán', 13, 650) < 130 && U.anchoTexto('1,897 clientes', 12, 400) >= 73.7 && U.anchoTexto('Olancho', 13, 650) >= 51.6,
      'el ancho calculado de un texto nunca queda por debajo de lo que mide en pantalla (medido con la letra del sistema)', [U.anchoTexto('Francisco Morazán', 13, 650), U.anchoTexto('1,897 clientes', 12, 400)]);
  }

  /* ---------- Comunicados: avisos informativos que no son una falla de nodo ---------- */
  console.log('\n18. Comunicados informativos (solo título y contexto)');
  {
    g2.E.ahora = null; g2.E.usuario = null;
    const CFG = vm.runInContext('CONFIG', lib);
    const hu2 = g2.E.activo.getSheetByName('Usuarios');
    hu2.appendRow(['mario.rivera@claro.com.hn', 'Mario Rivera', 'jefatura', 'SÍ', '']);
    hu2.appendRow(['sofia.mejia@concentrix.com', 'Sofía Mejía', 'supervisor', 'SÍ', '']);
    g2.cache.remove('usuarios');
    g2.E.genesys.tokens.set('jefe', { name: 'Mario Rivera', email: 'mario.rivera@claro.com.hn' });
    g2.E.genesys.tokens.set('sup', { name: 'Sofia Mejia', email: 'sofia.mejia@concentrix.com' });
    C2.guardarCuenta('tiendas', 'tiendas', 'ClaroTiendas2026');
    const tw = entrar2('w'), tj = entrar2('jefe'), ta = entrar2('a1'), ts = entrar2('sup');
    const tt = g2.post({ accion: 'login', datos: { tipo: 'clave', usuario: 'tiendas', clave: 'ClaroTiendas2026', nombre: 'Pedro Mejía', tienda: 'CAC Castaños' } }).datos.token;
    const com = (token, op, extra) => g2.post({ accion: 'comunicado', token, datos: Object.assign({ op }, extra || {}) });
    const cargar = (token) => g2.post({ accion: 'cargar', token, datos: { baseVersion: -1 } }).datos;
    const estado = () => g2.post({ accion: 'estado', token: ta }).datos;
    const hojaCom = () => g2.E.activo.getSheetByName('Comunicados');
    const T1 = 'Falla general de DTH', X1 = 'Clientes de TV satelital (DTH) de todo el país pueden estar sin señal.\n\nInfórmale al cliente que es una falla general.';

    ok(CFG.comunicado.titulo === g2.ejecutar('ALERTAS.COMUNICADO_TITULO') && CFG.comunicado.contexto === g2.ejecutar('ALERTAS.COMUNICADO_CONTEXTO'),
      'la página y el servidor usan los mismos largos para el título y el contexto', CFG.comunicado);
    let d = cargar(ta);
    ok(Array.isArray(d.comunicados) && !d.comunicados.length && !hojaCom(), 'sin comunicados, los asesores reciben la lista vacía y la hoja Comunicados todavía no existe', d.comunicados);
    const sinPermiso = [ta, ts, tt].map((t) => com(t, 'publicar', { comunicado: { titulo: T1, contexto: X1 } }));
    ok(sinPermiso.every((x) => !x.ok && x.codigo === 'PERMISO') && !hojaCom(), 'un asesor, una supervisora y Tiendas no pueden publicar comunicados', sinPermiso);

    const fallasAntes = JSON.stringify(estado().avisos);
    r = com(tw, 'publicar', { comunicado: { titulo: '  Falla   general\tde DTH ', contexto: 'Clientes de TV satelital (DTH) de todo el país pueden   estar sin señal. \r\n\r\n\r\n\r\n  Infórmale al cliente que es una falla general.  ', numero: 'F123', nodos: ['GRA01'] } });
    const c1 = r.ok ? r.datos.comunicado : {};
    ok(r.ok && c1.id === 'C' + hoyId + '01' && c1.estado === 'VIGENTE' && c1.titulo === T1 && c1.contexto === X1 && c1.publicadoPor.nombre === 'Ana López' && c1.editadoEn === null
      && c1.numero === undefined && c1.nodos === undefined,
      'Workforce publica un comunicado: solo título y contexto (el título en una línea; el contexto conserva sus párrafos), con su ID del día ' + c1.id, r);
    const h = hojaCom();
    const fila1 = h ? h.getRange(1, 1, 2, 10).getValues() : [[], []];
    ok(h && h.isSheetHidden() && deAlertas(h).length === 1 && fila1[0].join('|') === 'ID|Estado|Título|Contexto|Publicado|Publicó|Actualizado|Retirado|Retiró|Datos (no editar)'
      && fila1[1][1] === 'Vigente' && fila1[1][2] === T1 && fila1[1][5] === 'Ana López' && Object.prototype.toString.call(fila1[1][4]) === '[object Date]',
      'la hoja Comunicados se crea sola con el primero, oculta y protegida como las demás, y se lee bien a simple vista', fila1[1] && fila1[1].slice(0, 9));
    const pubA = cargar(ta).comunicados, pubT = cargar(tt).comunicados, pubS = cargar(ts).comunicados;
    ok(pubA.length === 1 && Object.keys(pubA[0]).sort().join() === 'contexto,editadoEn,id,publicadoEn,publicadoPor,titulo' && pubA[0].titulo === T1 && pubA[0].contexto === X1
      && JSON.stringify(pubA[0].publicadoPor) === '{"nombre":"Ana López"}' && JSON.stringify(pubT) === JSON.stringify(pubA) && JSON.stringify(pubS) === JSON.stringify(pubA),
      'Concentrix, Tiendas y los supervisores lo reciben al cargar: título, contexto, cuándo y el nombre de quien lo publicó', pubA);
    ok(!/@|historial|"u"|estado/.test(JSON.stringify(pubA)), 'sin correos ni historial');
    const deWf = cargar(tw).comunicados;
    ok(deWf.length === 1 && deWf[0].estado === 'VIGENTE' && deWf[0].historial.length === 1 && deWf[0].historial[0].accion === 'PUBLICADO' && deWf[0].publicadoPor.u === 'ana.lopez@claro.com.hn' && deWf[0]._fila === undefined,
      'Workforce lo recibe completo, con su historial', deWf);
    let e = estado();
    const av1 = e.avisosComunicados.find((x) => x.id === c1.id);
    ok(e.cambio.tipo === 'COMUNICADO_PUBLICADO' && e.cambio.texto === 'publicó el comunicado «' + T1 + '»' && e.cambio.por.nombre === 'Ana López' && e.version === r.datos.version,
      'estado avisa el cambio a todas las páginas: ' + e.cambio.texto, e.cambio);
    ok(av1 && av1.tipo === 'PUBLICADO' && av1.v === e.version && av1.titulo === T1 && av1.por === 'Ana López' && av1.en > Date.now() - 60000
      && av1.resumen === 'Clientes de TV satelital (DTH) de todo el país pueden estar sin señal. Infórmale al cliente que es una falla general.' && !/@/.test(JSON.stringify(e.avisosComunicados)),
      'y trae el aviso de escritorio del comunicado (título, el contexto en una línea y quién lo publicó), sin correos', e.avisosComunicados);
    ok(JSON.stringify(e.avisos) === fallasAntes, 'aparte de los avisos de las fallas: una página abierta desde antes no lo confunde con una falla');

    // Lo que no se puede guardar
    const malos = [
      [{ titulo: '', contexto: 'x' }, /Escribe el título y el contexto/], [{ titulo: 'x', contexto: '  \n ' }, /Escribe el título y el contexto/], [{}, /Escribe el título y el contexto/],
      [{ titulo: 'T'.repeat(81), contexto: 'x' }, /título no puede pasar de 80/], [{ titulo: 'x', contexto: 'C'.repeat(601) }, /contexto no puede pasar de 600/]
    ].map(([x, re]) => { const y = com(tw, 'publicar', { comunicado: x }); return !y.ok && y.codigo === 'DATOS' && re.test(y.error) && Model.faltaComunicado(Model.tituloComunicado(x.titulo), Model.contextoComunicado(x.contexto)) === y.error; });
    ok(malos.every(Boolean) && cargar(ta).comunicados.length === 1, 'sin título, sin contexto o más largos de la cuenta no se publican, y la página lo dice con las mismas palabras', malos);
    ok(com(tw, 'archivar', { id: c1.id }).codigo === 'DATOS' && com(tw, 'editar', { id: 'C25010199', comunicado: { titulo: 'x', contexto: 'y' } }).error === 'El comunicado ya no existe.',
      'una operación que no existe o un comunicado que no existe se rechazan');
    const limites = com(tw, 'publicar', { comunicado: { titulo: 'T'.repeat(80), contexto: 'C'.repeat(600) } });
    ok(limites.ok && limites.datos.comunicado.titulo.length === 80 && limites.datos.comunicado.contexto.length === 600, 'con 80 y 600 caracteres justos sí', limites.ok || limites);
    com(tw, 'retirar', { id: limites.datos.comunicado.id });

    // El mismo dos veces: dos personas publicando lo mismo, o un doble clic
    r = com(tj, 'publicar', { comunicado: { titulo: ' FALLA  general de dth', contexto: 'Otra redacción' } });
    ok(!r.ok && r.codigo === 'DUPLICADA' && r.error === 'Ya hay un comunicado vigente con ese título, que publicó Ana López. Edita ese comunicado, o retíralo antes de publicar otro igual.'
      && cargar(ta).comunicados.length === 1, 'otro comunicado vigente con el mismo título (sin fijarse en mayúsculas ni espacios) no entra, y dice quién publicó el que ya está', r);

    // Lo que escribe una persona nunca se toma por fórmula ni por número
    r = com(tj, 'publicar', { comunicado: { titulo: '=1+1', contexto: '00123' } });
    const cF = r.ok ? r.datos.comunicado : {};
    const filaF = h.getRange(h.getLastRow(), 1, 1, 4).getValues()[0];
    ok(r.ok && cF.id === 'C' + hoyId + '03' && filaF[2] === '=1+1' && filaF[3] === '00123' && cargar(ta).comunicados.some((x) => x.titulo === '=1+1' && x.contexto === '00123') && cF.publicadoPor.nombre === 'Mario Rivera',
      'Jefatura también publica; un título que empieza con = o un contexto de solo dígitos quedan como texto en la hoja', [r.ok || r, filaF]);
    ok(cargar(ta).comunicados.map((x) => x.id).join() === cF.id + ',' + c1.id, 'los vigentes llegan del más nuevo al más viejo', cargar(ta).comunicados.map((x) => x.id));

    // Editar: no avisa de nuevo, pero el aviso que falta por salir lleva el texto corregido
    const largo = 'Algunos canales de TV se ven en negro o sin audio en todo el país, tanto en HFC como en GPON. No es una falla del nodo ni del equipo del cliente. El área técnica ya trabaja en la solución y todavía no hay hora estimada.';
    r = com(tj, 'editar', { id: c1.id, comunicado: { contexto: largo } });
    const c1e = r.ok ? r.datos.comunicado : {};
    ok(r.ok && c1e.titulo === T1 && c1e.contexto === largo && c1e.editadoEn >= c1.publicadoEn && c1e.editadoPor.nombre === 'Mario Rivera' && c1e.publicadoPor.nombre === 'Ana López'
      && c1e.historial.length === 2 && c1e.historial[1].accion === 'EDITADO' && c1e.historial[1].detalle === 'Cambió el contexto',
      'editar el contexto conserva el título y a quien lo publicó, y anota quién lo cambió y qué', c1e.historial);
    e = estado();
    const av1e = e.avisosComunicados.find((x) => x.id === c1.id);
    ok(e.cambio.tipo === 'COMUNICADO_EDITADO' && e.cambio.texto === 'actualizó el comunicado «' + T1 + '»' && av1e.v === av1.v && av1e.tipo === 'PUBLICADO' && av1e.en === av1.en
      && av1e.resumen.length <= 160 && /…$/.test(av1e.resumen) && largo.indexOf(av1e.resumen.slice(0, -1)) === 0 && /[a-záéíóúñ]$/i.test(av1e.resumen.slice(0, -1))
      && av1e.resumen === Model.resumenComunicado(largo),
      'al editarlo no se avisa de nuevo (el aviso conserva su versión), pero lleva el texto nuevo: un contexto largo se corta en una palabra, con puntos suspensivos', av1e);
    const pubE = cargar(ta).comunicados.find((x) => x.id === c1.id);
    ok(pubE.contexto === largo && pubE.editadoEn === c1e.editadoEn, 'los asesores reciben el texto nuevo y cuándo se actualizó', pubE);
    r = com(tw, 'editar', { id: c1.id, comunicado: { titulo: 'Falla general de DTH y de canales' } });
    ok(r.ok && r.datos.comunicado.contexto === largo && r.datos.comunicado.historial[2].detalle === 'Cambió el título' && estado().avisosComunicados.find((x) => x.id === c1.id).titulo === 'Falla general de DTH y de canales',
      'cambiar solo el título conserva el contexto', r.ok || r);
    r = com(tw, 'editar', { id: c1.id, comunicado: { titulo: 'Falla general de DTH y de canales', contexto: largo } });
    ok(!r.ok && r.codigo === 'DATOS' && /No hay cambios/.test(r.error), 'guardar sin haber cambiado nada no hace nada', r);
    r = com(tw, 'editar', { id: c1.id, comunicado: { titulo: '=1+1' } });
    ok(!r.ok && r.codigo === 'DUPLICADA', 'al editar tampoco se puede dejar el título igual al de otro comunicado vigente', r);
    com(tw, 'editar', { id: c1.id, comunicado: { titulo: T1 } });

    // Retirar: los asesores dejan de verlo; Workforce lo conserva 30 días
    const vAntes = estado().version;
    r = com(tw, 'retirar', { id: cF.id });
    ok(r.ok && r.datos.comunicado.estado === 'RETIRADO' && r.datos.comunicado.retiradoPor.nombre === 'Ana López' && r.datos.version === vAntes + 1
      && cargar(ta).comunicados.map((x) => x.id).join() === c1.id, 'al retirarlo, los asesores dejan de recibirlo de inmediato', r.ok || r);
    e = estado();
    const avR = e.avisosComunicados.filter((x) => x.id === cF.id);
    ok(avR.length === 1 && avR[0].tipo === 'RETIRADO' && avR[0].v === e.version && avR[0].titulo === '=1+1' && avR[0].por === 'Ana López' && avR[0].resumen === undefined
      && e.cambio.texto === 'retiró el comunicado «=1+1»', 'su aviso cambia a retirado (el de publicado ya no sale)', avR);
    ok(com(tj, 'retirar', { id: cF.id }).error === 'Otra persona ya retiró este comunicado.' && com(tj, 'editar', { id: cF.id, comunicado: { contexto: 'x' } }).error === 'Otra persona ya retiró este comunicado.',
      'no se puede retirar dos veces ni editar uno retirado');
    const wfR = cargar(tw).comunicados;
    ok(wfR.length === 3 && wfR.filter((x) => x.estado === 'RETIRADO').length === 2 && wfR.find((x) => x.id === cF.id).historial.slice(-1)[0].accion === 'RETIRADO',
      'Workforce sigue viendo los retirados, con quién los retiró', wfR.map((x) => x.id + ':' + x.estado));
    r = com(tw, 'publicar', { comunicado: { titulo: '=1+1', contexto: 'Otra vez' } });
    ok(r.ok && r.datos.comunicado.id === 'C' + hoyId + '04', 'retirado el anterior, se puede publicar otro con el mismo título', r.ok || r);
    com(tw, 'retirar', { id: r.datos.comunicado.id });

    // Tope de vigentes y avisos guardados
    const ids = [];
    for (let i = 2; i <= 10; i++) { const y = com(tw, 'publicar', { comunicado: { titulo: 'Aviso de prueba ' + i, contexto: 'Contexto ' + i } }); if (y.ok) ids.push(y.datos.comunicado.id); }
    r = com(tw, 'publicar', { comunicado: { titulo: 'Aviso de prueba 11', contexto: 'Contexto 11' } });
    ok(ids.length === 9 && cargar(ta).comunicados.length === 10 && !r.ok && r.codigo === 'DATOS' && /Ya hay 10 comunicados vigentes/.test(r.error), 'como mucho 10 vigentes a la vez: el siguiente pide retirar alguno', r);
    e = estado();
    ok(e.avisosComunicados.length === 4 && new Set(e.avisosComunicados.map((x) => x.id)).size === 4 && e.avisosComunicados.map((x) => x.id).join() === ids.slice(-4).join()
      && JSON.stringify(e.avisos) === fallasAntes, 'estado guarda los últimos 4 avisos de comunicados, uno por comunicado, y no toca los de las fallas', e.avisosComunicados.map((x) => x.id + ':' + x.tipo));
    ids.forEach((id) => com(tw, 'retirar', { id }));
    ok(cargar(ta).comunicados.map((x) => x.id).join() === c1.id, 'retirados los de prueba, queda el vigente');

    // Apps Script no guarda propiedades de más de 9 KB: con los avisos más largos posibles, "estado" queda lejos de ese tope
    const largos = [];
    for (let i = 1; i <= 4; i++) { const y = com(tw, 'publicar', { comunicado: { titulo: 'ñ'.repeat(79) + i, contexto: 'ñ'.repeat(600) } }); if (y.ok) largos.push(y.datos.comunicado.id); }
    const pesoEstado = Buffer.byteLength(g2.E.props.get('ESTADO'));
    e = estado();
    ok(largos.length === 4 && e.avisosComunicados.length === 4 && e.avisosComunicados.every((x) => x.titulo.length === 80 && x.resumen.length === 160) && pesoEstado < 6000,
      'con 4 comunicados del largo máximo, escritos con letras que pesan el doble, lo que guarda "estado" sigue lejos del tope de 9 KB de Apps Script (' + pesoEstado + ' bytes)', pesoEstado);
    largos.forEach((id) => com(tw, 'retirar', { id }));
    ok(cargar(ta).comunicados.map((x) => x.id).join() === c1.id && Buffer.byteLength(g2.E.props.get('ESTADO')) < pesoEstado, 'y al retirarlos, sus avisos ya no llevan el contexto');

    // A los 30 días de retirado, Workforce ya no lo recibe; el vigente sigue hasta que alguien lo retire
    g2.E.ahora = Date.now() + 31 * U.DIA;
    const tw31 = entrar2('w'), ta31 = entrar2('a1');
    const en31 = cargar(tw31).comunicados;
    ok(en31.length === 1 && en31[0].id === c1.id && en31[0].estado === 'VIGENTE' && cargar(ta31).comunicados.length === 1,
      'a los 31 días, Workforce ya no recibe los retirados; el vigente sigue ahí hasta que alguien lo retire', en31.map((x) => x.id + ':' + x.estado));
    g2.E.ahora = null;

    // Una hoja Comunicados dañada nunca deja a nadie sin entrar
    const filaC1 = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().findIndex((x) => x[0] === c1.id) + 2;
    h.getRange(filaC1, 10).setValue('esto no es JSON'); g2.cache.remove('comunicados');
    const leido = cargar(ta).comunicados;
    ok(leido.length === 1 && leido[0].id === c1.id && leido[0].titulo === T1 && leido[0].contexto === largo, 'si la columna Datos de una fila se daña, el comunicado se lee de las columnas a la vista', leido);
    h.deleteColumns(9, 2); g2.cache.remove('comunicados');
    const rota = g2.post({ accion: 'cargar', token: ta, datos: { baseVersion: -1 } }), rotaW = g2.post({ accion: 'cargar', token: tw, datos: { baseVersion: -1 } });
    ok(rota.ok && Array.isArray(rota.datos.fallas) && rota.datos.comunicados.length === 0 && rotaW.ok && rotaW.datos.comunicados.length === 0 && Array.isArray(rotaW.datos.fallas),
      'y si la hoja Comunicados no se puede leer, la página abre igual, con sus fallas y sin comunicados', [rota.ok, rotaW.ok]);

    // La página: las mismas reglas que el servidor
    const textos = [['  Falla   general\tde DTH ', ' uno \r\n\r\n\r\n dos  tres \n'], ['Título\ncon salto', 'a  b\r\nc\td'], ['x', 'línea 1\n\n\n\n\nlínea 2\n\n'], ['Señal: 100%', '']];
    const iguales = textos.map(([t, x]) => {
      let s; try { s = g2.ejecutar('validarComunicado_(' + JSON.stringify({ titulo: t, contexto: x || 'y' }) + ')'); } catch (err) { s = null; }
      return s && s.titulo === Model.tituloComunicado(t) && s.contexto === Model.contextoComunicado(x || 'y');
    });
    ok(iguales.every(Boolean) && Model.tituloComunicado('  Falla   general\tde DTH ') === T1 && Model.contextoComunicado(' uno \r\n\r\n\r\n dos  tres \n') === 'uno\n\ndos tres',
      'la página limpia el título y el contexto igual que el servidor (así el contador de caracteres coincide)', iguales);
    ok(Model.resumenComunicado('Corto.') === 'Corto.' && Model.resumenComunicado(X1) === g2.ejecutar('resumenComunicado_(' + JSON.stringify(X1) + ')')
      && Model.resumenComunicado('a'.repeat(300)).length === 160, 'y resume el contexto para el aviso igual que el servidor');
    const MIN = U.MIN, t0c = new Date(2026, 10, 12, 8, 0, 0).getTime();
    const pub = (id, min, extra) => Object.assign({ id, titulo: 'T ' + id, contexto: 'x', publicadoEn: t0c - min * MIN, editadoEn: null }, extra || {});
    ok(Model.marcaComunicado(pub('a', 3), t0c) === 'NUEVO' && Model.marcaComunicado(pub('a', 29), t0c) === 'NUEVO' && Model.marcaComunicado(pub('a', 31), t0c) === ''
      && Model.marcaComunicado(pub('a', 200, { editadoEn: t0c - 5 * MIN }), t0c) === 'ACTUALIZADO' && Model.marcaComunicado(pub('a', 10, { editadoEn: t0c - 2 * MIN }), t0c) === 'ACTUALIZADO'
      && Model.marcaComunicado(pub('a', 200, { editadoEn: t0c - 40 * MIN }), t0c) === '' && CFG.comunicado.minutosNuevo === 30,
      'la tarjeta se marca Nuevo los primeros 30 minutos y Actualizado los 30 minutos después de un cambio');
    const mezcla = [pub('v1', 50), pub('r1', 300, { estado: 'RETIRADO', retiradoEn: t0c - 100 * MIN }), pub('v2', 5, { estado: 'VIGENTE' }), null, pub('r2', 400, { estado: 'RETIRADO', retiradoEn: t0c - 20 * MIN })];
    ok(Model.comunicadosVigentes(mezcla).map((x) => x.id).join() === 'v2,v1' && Model.comunicadosRetirados(mezcla).map((x) => x.id).join() === 'r2,r1'
      && !Model.comunicadosVigentes(undefined).length && !Model.comunicadosVigentes(null).length,
      'los vigentes van del más nuevo al más viejo (los que llegan sin estado son vigentes) y los retirados, el último retirado primero; un servidor de antes, que no manda comunicados, no rompe nada');
    const conT = [pub('v1', 50, { titulo: 'Falla general de DTH' }), pub('r1', 300, { titulo: 'Corte de energía', estado: 'RETIRADO' })];
    ok(Model.comunicadoIgual(conT, ' FALLA  general de dth ', null).id === 'v1' && Model.comunicadoIgual(conT, 'Falla general de DTH', 'v1') === null
      && Model.comunicadoIgual(conT, 'corte de energia', null) === null && Model.comunicadoIgual(conT, 'Otro', null) === null,
      'la página reconoce un título repetido entre los vigentes (sin tildes ni mayúsculas), no contra sí mismo ni contra los retirados');
    const hoyLocal = String(new Date().getFullYear()).slice(2) + String(new Date().getMonth() + 1).padStart(2, '0') + String(new Date().getDate()).padStart(2, '0');
    ok(Model.nuevoIdComunicado([], Date.now()) === 'C' + hoyLocal + '01' && Model.nuevoIdComunicado([{ id: 'C' + hoyLocal + '07' }, { id: 'C25010109' }], Date.now()) === 'C' + hoyLocal + '08'
      && g2.ejecutar("nuevoIdComunicado_([{ id: 'C" + hoyId + "07' }, { id: 'C25010109' }], Date.now())") === 'C' + hoyId + '08', 'el ID sigue el número del día, en la página (demostración) y en el servidor');
    const genDemo = Demo.generar(Date.now()), ixDemo = Model.indexar(genDemo.base);
    const escDemo = Demo.escenario(ixDemo, Model.cargarCatalogo(Model.catalogo(ixDemo)), genDemo.nodos, Date.now());
    ok(Model.comunicadosVigentes(escDemo.comunicados).length === 1 && Model.comunicadosRetirados(escDemo.comunicados).length === 1 && new Set(escDemo.comunicados.map((x) => x.id)).size === 2
      && escDemo.comunicados.every((x) => /^C\d{8}$/.test(x.id) && x.titulo && x.contexto && !Model.faltaComunicado(x.titulo, x.contexto) && x.historial.length),
      'la demostración trae un comunicado vigente y uno retirado de ejemplo', escDemo.comunicados.map((x) => x.id + ':' + x.estado));
  }

  console.log(`\nCuota usada: ${g.E.cuota.propsLecturas} lecturas de propiedades, ${g.E.cuota.urlFetch} llamadas a Genesys`);
  console.log(`\n${pasos - fallos} de ${pasos} pruebas pasaron (${ms()})`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
