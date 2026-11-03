/* Servidor de prueba local: corre servidor/Code.gs en el emulador y sirve la página.
   Uso: node pruebas/servidor-prueba.js [puerto] [demo|ruta.xlsx|vacio]
   - /exec            como la aplicación web de Apps Script (sin respuesta a OPTIONS, igual que Google)
   - /genesys/...     un Genesys falso con PKCE real (authorize y token)
   - /app/            la página (index.html) con un config.js que apunta aquí
   - /test/genesys    elige con qué usuario "entra" el próximo login de Genesys
   - /test/sms        cuántos SMS recibió el Notifícame falso (cuántos mal firmados y cuántos repetidos);
                      con ?limite=10,1 el próximo grupo solo acepta 10 (Notifícame pide esperar) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const { crearEntorno } = require('./gas-emulador');

const PUERTO = Number(process.argv[2] || 8787);
const BASE = process.argv[3] || 'demo';
const RAIZ = path.join(__dirname, '..');
const CLIENT_ID = 'a1b2c3d4-0000-1111-2222-333344445555';

const g = crearEntorno({ region: 'mypurecloud.com', url: 'http://localhost:' + PUERTO + '/exec' });
const C = g.contexto;
C.configurar();
C.guardarGenesys({ region: 'mypurecloud.com', clientId: CLIENT_ID, rolPorDefecto: 'concentrix' });
C.guardarCuenta('tiendas', 'tiendas', 'ClaroTiendas2026');
const hu = g.E.activo.getSheetByName('Usuarios');
hu.appendRow(['ana.lopez@claro.com.hn', 'Ana López', 'workforce', 'SÍ', '']);
hu.appendRow(['mario.rivera@claro.com.hn', 'Mario Rivera', 'workforce', 'SÍ', '']);
hu.appendRow(['gerente.fijo@claro.com.hn', 'Gerencia Fijo', 'jefatura', 'SÍ', '']);
hu.appendRow(['sofia.mejia@concentrix.com', 'Sofía Mejía', 'supervisor', 'SÍ', '']);

let proximo = { name: 'Karla Zelaya', email: 'karla.zelaya@concentrix.com' };
let ocupado = { n: 0, modo: 'html' };   // /test/ocupado: las próximas n llamadas fallan como cuando Apps Script está saturado
                                         // (modo get: la respuesta llega como la de doGet, sin datos)
const codigos = new Map();

/* Base inicial cargada por la API (la misma ruta que usa la página) */
async function precargar() {
  if (BASE === 'vacio') return;
  const lib = vm.createContext({ console, TextDecoder, TextEncoder, Blob, DecompressionStream, Intl, performance, Date, Math });
  for (const f of ['parser.js', 'config.js', 'util.js', 'model.js', 'demo.js']) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8').replace("if (typeof module !== 'undefined') module.exports = ALERTAS_PARSER;", ''), lib);
  const P = vm.runInContext('ALERTAS_PARSER', lib), Model = vm.runInContext('Model', lib), Demo = vm.runInContext('Demo', lib);
  let base;
  if (BASE === 'demo') {
    base = Demo.generar(Date.now()).base;
    // Teléfonos ficticios para probar los SMS: la mayoría con celular, algunos solo fijo o sin teléfono
    const num = (j, pre) => '504' + pre + String(j).padStart(7, '0').slice(-7);
    base.cols.telefono = Array.from(base.cols.contrato, (c, i) => (i % 11 === 0 ? '' : i % 11 === 1 ? num(i, '2') : num(i, i % 2 ? '9' : '3')));
    base.tieneTelefono = true;
  }
  else { const b = fs.readFileSync(BASE); base = await P.parseFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), path.basename(BASE)); }
  const cat = Model.catalogo(Model.indexar(base));
  g.E.genesys.tokens.set('tok-precarga', { name: 'Ana Lopez', email: 'ana.lopez@claro.com.hn' });
  const tok = g.post({ accion: 'login', datos: { tipo: 'genesys', accessToken: 'tok-precarga' } }).datos.token;
  const ini = g.post({ accion: 'base', token: tok, datos: { op: 'iniciar', total: base.filas, columnas: Model.columnasCarga(base), archivo: base.archivo || 'base.xlsx' } }).datos;
  for (let d = 0; d < base.filas; d += ini.filasPorLote) g.post({ accion: 'base', token: tok, datos: { op: 'lote', id: ini.id, desde: d, filas: Model.filasCarga(base, d, Math.min(base.filas, d + ini.filasPorLote)) } });
  const fin = g.post({ accion: 'base', token: tok, datos: { op: 'finalizar', id: ini.id, catalogo: cat } });
  if (!fin.ok) throw new Error(fin.error);
  console.log('Base precargada:', base.filas, 'filas');
  console.log('Notifícame (falso):', C.guardarNotificame({ key: g.E.notificame.key, secret: g.E.notificame.secret }));
  // 3 números de control ficticios (se arman aquí para no escribir teléfonos en el código)
  console.log('Números de control:', C.guardarControlSms({ texto: [1, 2, 3].map((k) => '504' + String(39990000 + k)).join('\n') }).texto);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PUERTO);
  const cuerpo = () => new Promise((ok) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p).toString('utf8'))); });
  const json = (obj, extra) => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, extra || {})); res.end(JSON.stringify(obj)); };

  if (url.pathname === '/exec') {
    if (req.method === 'OPTIONS') { res.writeHead(405); res.end(); return; }   // Apps Script no responde la verificación previa
    if (req.method === 'GET') { const o = C.doGet(); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(o.getContent()); return; }
    if (ocupado.n > 0) {
      ocupado.n--;
      if (ocupado.modo === '503') { res.writeHead(503, { 'Access-Control-Allow-Origin': '*' }); res.end('Service Unavailable'); return; }
      if (ocupado.modo === 'get') {
        // La acción sí se ejecuta, pero el navegador termina abriendo /exec con GET y recibe lo de doGet
        cuerpo().then((b) => {
          C.doPost({ postData: { contents: b, type: req.headers['content-type'] } });
          res.writeHead(302, { Location: '/exec', 'Access-Control-Allow-Origin': '*' }); res.end();
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
      res.end('<!DOCTYPE html><html><body><div>Lo sentimos, se produjo un error en el servidor. Espera un poco y vuelve a intentarlo.</div></body></html>'); return;
    }
    cuerpo().then((b) => {
      const o = C.doPost({ postData: { contents: b, type: req.headers['content-type'] } });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(o.getContent());
    });
    return;
  }
  if (url.pathname === '/genesys/oauth/authorize') {
    const q = url.searchParams;
    if (q.get('client_id') !== CLIENT_ID || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
      res.writeHead(302, { Location: q.get('redirect_uri') + '?error=invalid_request&error_description=parametros&state=' + q.get('state') }); res.end(); return;
    }
    const code = crypto.randomBytes(12).toString('hex');
    codigos.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), usuario: proximo });
    res.writeHead(302, { Location: q.get('redirect_uri') + '?code=' + code + '&state=' + encodeURIComponent(q.get('state')) }); res.end(); return;
  }
  if (url.pathname === '/genesys/oauth/token') {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' }); res.end(); return; }
    cuerpo().then((b) => {
      const p = new URLSearchParams(b);
      const c = codigos.get(p.get('code'));
      const esperado = c && crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
      if (!c || p.get('grant_type') !== 'authorization_code' || p.get('client_id') !== CLIENT_ID || p.get('redirect_uri') !== c.redirect || esperado !== c.challenge) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":"invalid_grant"}'); return;
      }
      codigos.delete(p.get('code'));
      const t = 'gen-' + crypto.randomBytes(16).toString('hex');
      g.E.genesys.tokens.set(t, c.usuario);
      json({ access_token: t, token_type: 'bearer', expires_in: 86399 });
    });
    return;
  }
  if (url.pathname === '/test/ocupado') {
    if (url.searchParams.get('n')) ocupado = { n: Number(url.searchParams.get('n')), modo: url.searchParams.get('modo') || 'html' };
    json({ quedan: ocupado.n }); return;
  }
  if (url.pathname === '/test/sms') {
    // ?limite=10,1: en el próximo grupo Notifícame acepta solo 10 (los demás: "espere"), para probar pausas y cortes
    const lim = url.searchParams.get('limite');
    if (lim) { const [porLote, lotes] = lim.split(',').map(Number); g.E.notificame.limite = { porLote, lotes: lotes || 1 }; }
    const N = g.E.notificame, ids = new Map();
    N.enviados.forEach((e) => ids.set(e.id, (ids.get(e.id) || 0) + 1));
    json({ enviados: N.enviados.length, malFirmados: N.malFirmados, repetidos: [...ids.values()].filter((v) => v > 1).length }); return;
  }
  if (url.pathname === '/test/genesys') { proximo = { name: url.searchParams.get('nombre'), email: url.searchParams.get('correo') }; json({ ok: true }); return; }
  if (url.pathname === '/test/cliente') {
    const h = g.E.activo.getSheetByName('Base');
    const f = h.getRange(2 + Number(url.searchParams.get('i') || 0), 1, 1, 14).getValues()[0];
    json({ contrato: String(f[0]), nodo: f[2], nombre: f[12], dni: f[13] }); return;
  }
  if (url.pathname === '/test/contrato') {
    const h = g.E.activo.getSheetByName('Base');
    const nodo = url.searchParams.get('nodo'), k = Number(url.searchParams.get('n') || 0);
    // Contratos distintos del nodo (un contrato puede tener varios servicios)
    const unicos = [...new Set(h.getRange(2, 1, h.getLastRow() - 1, 3).getValues().filter((f) => f[2] === nodo).map((f) => String(f[0])))];
    json({ contrato: unicos.length ? unicos[Math.min(k, unicos.length - 1)] : null }); return;
  }
  if (url.pathname === '/test/estado') {
    const hb = g.E.activo.getSheetByName('Base');
    const conDatos = hb && hb.getLastRow() > 1 ? hb.getRange(2, 1, hb.getLastRow() - 1, 1).getValues().filter((f) => String(f[0])).length : 0;
    json({ props: [...g.E.props.keys()], celdas: g.E.activo.celdas(), filasBase: hb ? hb.getLastRow() : 0, filasConDatos: conDatos, cuota: g.E.cuota });
    return;
  }
  if (url.pathname === '/app/config.js') {
    res.writeHead(200, { 'Content-Type': TIPOS['.js'] });
    res.end(`window.ALERTAS_CONFIG = { api: 'http://localhost:${PUERTO}/exec', genesysLogin: 'http://localhost:${PUERTO}/genesys', segundosRevision: 2 };`);
    return;
  }
  if (url.pathname.startsWith('/app/')) {
    const rel = url.pathname === '/app/' ? 'index.html' : url.pathname.slice(5);
    const f = path.join(RAIZ, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); return;
  }
  res.writeHead(404); res.end('no');
});

precargar().then(() => servidor.listen(PUERTO, () => console.log('LISTO http://localhost:' + PUERTO + '/app/'))).catch((e) => { console.error(e); process.exit(1); });
