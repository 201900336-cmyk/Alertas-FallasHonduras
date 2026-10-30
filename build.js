/* Arma index.html (la aplicación completa en un solo archivo) a partir de src/.
   Uso: node build.js
   config.js queda aparte para poder cambiar la URL del servidor sin tocar index.html. */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const parser = R('src/parser.js').replace("if (typeof module !== 'undefined') module.exports = ALERTAS_PARSER;", '');
const worker = parser + `
self.onmessage = async (e) => {
  try {
    let ultimo = -1;
    const base = await ALERTAS_PARSER.parseFile(e.data.buf, e.data.nombre, (p) => {
      const k = Math.floor(p * 100); if (k !== ultimo) { ultimo = k; self.postMessage({ tipo: 'p', p }); }
    });
    const tr = []; for (const k in base.cols) { const c = base.cols[k]; if (c && c.buffer) tr.push(c.buffer); }
    self.postMessage({ tipo: 'ok', base }, tr);
  } catch (err) { self.postMessage({ tipo: 'error', msg: (err && err.message) || String(err) }); }
};`;

const fuente = fs.readFileSync(path.join(__dirname, 'assets/archivo-latin-wdth-normal.woff2')).toString('base64');
const mapa = R('assets/hn_map.json');
const preact = R('assets/preact-htm.umd.js');
const css = R('src/styles.css');
const app = ['config.js', 'util.js', 'store.js', 'model.js', 'demo.js', 'backend.js', 'ui-core.js', 'ui-consulta.js', 'ui-fallas.js', 'ui-base.js', 'ui-stats.js', 'portada.js', 'ui-app.js']
  .map((f) => '/* ---- ' + f + ' ---- */\n' + R('src/' + f)).join('\n\n');

const seguro = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const icono = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#131921"/><path d="M4 17h5l2.6-6.5 3.9 13 3.8-17.5 3.6 15.7 2.4-4.7H28" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Alertas</title>
<link rel="icon" href="${icono}">
<style>
@font-face { font-family: 'Archivo'; font-style: normal; font-display: swap; font-weight: 100 900; font-stretch: 62% 125%;
  src: url(data:font/woff2;base64,${fuente}) format('woff2'); }
${css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>Esta página necesita JavaScript activado.</noscript>
<script src="config.js"></script>
<script>
${seguro(preact)}
</script>
<script>
/* Alertas · Certificación de fallas de red, Servicios Fijos HN.
   Este archivo se genera con "node build.js" a partir de la carpeta src/. No tiene contraseñas:
   el acceso lo valida el servidor (servidor/Code.gs). */
'use strict';
const HN_MAPA = ${mapa};
const ALERTAS_WORKER_SRC = ${seguro(JSON.stringify(worker))};
${seguro(parser)}
${seguro(app)}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
const cfg = path.join(__dirname, 'config.js');
if (!fs.existsSync(cfg)) {
  fs.writeFileSync(cfg, `/* Configuración de Alertas. Es lo único que se edita a mano en GitHub.

   api          URL de la aplicación web de Apps Script (termina en /exec).
                Mientras esté vacía, la página abre en modo demostración con datos ficticios.
   redireccion  Opcional. Solo si la página se publica en una dirección distinta
                a la registrada en Genesys (por ejemplo, un dominio propio).

   Este archivo es público: aquí no van contraseñas ni datos de clientes. */
window.ALERTAS_CONFIG = {
  api: ''
};
`);
}
console.log('index.html', Math.round(html.length / 1024) + ' KB');
