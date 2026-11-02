/* ==========================================================================
   Emulador mínimo de Google Apps Script para probar servidor/Code.gs en Node.
   Imita lo que Code.gs usa de SpreadsheetApp, PropertiesService, CacheService,
   LockService, Utilities, UrlFetchApp, ContentService, HtmlService, Session y
   ScriptApp, con los mismos límites que importan (celdas, tamaño de caché,
   coordenadas fuera de la hoja, formato de texto plano).
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');

const LIMITE_CELDAS = 10000000;

const esFecha = (v) => Object.prototype.toString.call(v) === '[object Date]';
function aSigned(buf) { return Array.from(buf, (b) => (b > 127 ? b - 256 : b)); }
function aBuffer(v, charset) {
  if (Array.isArray(v)) return Buffer.from(v.map((b) => (b < 0 ? b + 256 : b)));
  return Buffer.from(String(v), 'utf8');
}

function crearEntorno(opciones = {}) {
  const E = {
    libros: new Map(), props: new Map(), cache: new Map(), triggers: [], dialogos: [], alertas: [], toasts: [],
    cuota: { propsLecturas: 0, propsEscrituras: 0, urlFetch: 0, escriturasHoja: 0 },
    genesys: {
      tokens: new Map(), region: opciones.region || 'mypurecloud.com',
      org: opciones.org || { id: 'c0ffee00-0000-4000-8000-00000000c1a0', name: 'Claro Honduras' },
      clientId: opciones.clientId || 'a1b2c3d4-0000-1111-2222-333344445555'
    },
    dueno: opciones.dueno || 'dueno.alertas@gmail.com', activo: null, urlServicio: opciones.url || 'https://script.google.com/macros/s/PRUEBA/exec',
    ahora: null,
    usuario: null    // quién ejecuta (un menú del archivo); null = el dueño, como la aplicación web
  };
  let idSeq = 1;
  const ahora = () => (E.ahora != null ? E.ahora : Date.now());
  const usuarioActual = () => String(E.usuario || E.dueno).toLowerCase();
  const esDuenoActual = () => usuarioActual() === String(E.dueno).toLowerCase();
  const usuario = (correo) => ({ getEmail: () => correo });
  const correoDe = (u) => String(typeof u === 'string' ? u : u.getEmail()).toLowerCase();
  /* Protección de una pestaña, como en Google: sus editores son el dueño y quien la crea; el dueño y quien
     ejecuta no se pueden quitar; solo un editor la cambia o la quita, y nadie más puede editar la pestaña. */
  class Proteccion {
    constructor(hoja) { Object.assign(this, { hoja, desc: '', editores: new Set([String(E.dueno).toLowerCase(), usuarioActual()]), soloAviso: false, dominio: false }); }
    canEdit() { return esDuenoActual() || this.editores.has(usuarioActual()); }
    revisar() { if (!this.canEdit()) throw new Error('You do not have permission to perform that action.'); }
    setDescription(d) { this.revisar(); this.desc = String(d); return this; }
    getDescription() { return this.desc; }
    getEditors() { return [...this.editores].map(usuario); }
    addEditor(u) { this.revisar(); this.editores.add(correoDe(u)); return this; }
    removeEditors(lista) { this.revisar(); lista.forEach((u) => { const c = correoDe(u); if (c !== String(E.dueno).toLowerCase() && c !== usuarioActual()) this.editores.delete(c); }); return this; }
    canDomainEdit() { return this.dominio; }
    setDomainEdit(b) { this.revisar(); this.dominio = !!b; return this; }
    setWarningOnly(b) { this.revisar(); this.soloAviso = !!b; return this; }
    isWarningOnly() { return this.soloAviso; }
    remove() { this.revisar(); this.hoja.protecciones = this.hoja.protecciones.filter((p) => p !== this); }
  }
  /* El Date del script: el mismo constructor dentro y fuera, para que instanceof funcione */
  const FechaS = class extends Date { constructor(...a) { if (a.length) super(...a); else super(ahora()); } static now() { return ahora(); } };

  /* ---------------- Hojas de cálculo ---------------- */
  class TextFinder {
    constructor(rango, texto) { this.rango = rango; this.texto = String(texto); this.entera = false; this.mayus = false; }
    matchEntireCell(v) { this.entera = !!v; return this; }
    matchCase(v) { this.mayus = !!v; return this; }
    useRegularExpression(v) { this.regex = v !== false; return this; }
    _buscar(solo) {
      const r = this.rango, h = r.hoja, out = [];
      const buscado = this.mayus ? this.texto : this.texto.toLowerCase();
      // Con expresión regular: con celda entera, la expresión tiene que abarcar toda la celda (como en Sheets)
      const re = this.regex ? new RegExp(this.entera ? '^(?:' + this.texto + ')$' : this.texto, this.mayus ? '' : 'i') : null;
      for (let i = 0; i < r.nr; i++) {
        const fila = h.filas[r.r - 1 + i];
        if (!fila) continue;
        for (let j = 0; j < r.nc; j++) {
          const v = fila[r.c - 1 + j];
          if (v === undefined || v === '') continue;
          let t = mostrar(v);
          if (re ? !re.test(t) : false) continue;
          if (!this.mayus) t = t.toLowerCase();
          if (re || (this.entera ? t === buscado : t.indexOf(buscado) >= 0)) {
            out.push(new Rango(h, r.r + i, r.c + j, 1, 1));
            if (solo) return out;
          }
        }
      }
      return out;
    }
    findAll() { return this._buscar(false); }
    findNext() { return this._buscar(true)[0] || null; }
  }
  function mostrar(v) {
    if (esFecha(v)) return v.toISOString();
    if (typeof v === 'number') return String(v);
    return String(v);
  }

  class Rango {
    constructor(hoja, r, c, nr, nc) {
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Those rows are out of bounds.');
      if (r + nr - 1 > hoja.maxRows || c + nc - 1 > hoja.maxCols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      Object.assign(this, { hoja, r, c, nr, nc });
    }
    getSheet() { return this.hoja; }
    getRow() { return this.r; }
    getColumn() { return this.c; }
    getNumRows() { return this.nr; }
    getNumColumns() { return this.nc; }
    getValues() {
      const out = new Array(this.nr);
      for (let i = 0; i < this.nr; i++) {
        const fila = this.hoja.filas[this.r - 1 + i];
        const o = new Array(this.nc);
        for (let j = 0; j < this.nc; j++) {
          const v = fila ? fila[this.c - 1 + j] : undefined;
          o[j] = v === undefined ? '' : (esFecha(v) ? new FechaS(v.getTime()) : v);
        }
        out[i] = o;
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      if (!Array.isArray(vals) || vals.length !== this.nr) throw new Error('The number of rows in the data does not match the number of rows in the range. The data has ' + (vals && vals.length) + ' but the range has ' + this.nr + '.');
      this.hoja.revisarEdicion();
      E.cuota.escriturasHoja++;
      for (let i = 0; i < this.nr; i++) {
        if (!Array.isArray(vals[i]) || vals[i].length !== this.nc) throw new Error('The number of columns in the data does not match the number of columns in the range. The data has ' + (vals[i] && vals[i].length) + ' but the range has ' + this.nc + '.');
        const idx = this.r - 1 + i;
        let fila = this.hoja.filas[idx];
        if (!fila) fila = this.hoja.filas[idx] = [];
        for (let j = 0; j < this.nc; j++) fila[this.c - 1 + j] = this.hoja.convertir(vals[i][j], this.r + i, this.c + j);
      }
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    setNumberFormat(f) { this.hoja.formatos.push({ r1: this.r, c1: this.c, r2: this.r + this.nr - 1, c2: this.c + this.nc - 1, f }); return this; }
    setFontWeight() { return this; }
    setFontSize() { return this; }
    clear() { this.hoja.revisarEdicion(); for (let i = 0; i < this.nr; i++) { const f = this.hoja.filas[this.r - 1 + i]; if (f) for (let j = 0; j < this.nc; j++) f[this.c - 1 + j] = undefined; } return this; }
    clearContent() { return this.clear(); }
    createTextFinder(t) { return new TextFinder(this, t); }
  }

  class Hoja {
    constructor(libro, nombre) { Object.assign(this, { libro, nombre, filas: [], maxRows: 1000, maxCols: 26, formatos: [], oculta: false, congeladas: 0, id: idSeq++, protecciones: [] }); }
    protect() { const p = new Proteccion(this); this.protecciones.push(p); return p; }
    getProtections(tipo) { return tipo === 'SHEET' ? this.protecciones.slice() : []; }
    revisarEdicion() {
      if (this.protecciones.some((p) => !p.soloAviso && !p.canEdit())) throw new Error('You are trying to edit a protected cell or object. Please contact the spreadsheet owner to remove protection if you need to edit.');
    }
    formato(r, c) {
      for (let k = this.formatos.length - 1; k >= 0; k--) { const f = this.formatos[k]; if (r >= f.r1 && r <= f.r2 && c >= f.c1 && c <= f.c2) return f.f; }
      return null;
    }
    convertir(v, r, c) {
      if (v === null || v === undefined) return '';
      if (esFecha(v)) return new FechaS(v.getTime());
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      const s = String(v);
      if (this.formato(r, c) === '@') return s;
      if (/^=/.test(s)) throw new Error('Emulador: se escribió una fórmula sin querer: ' + s.slice(0, 30));
      if (/^-?\d+(\.\d+)?$/.test(s.trim()) && s.trim().length < 16) return Number(s);
      return s;
    }
    getName() { return this.nombre; }
    setName(n) { if (this.libro.hojas.some((h) => h !== this && h.nombre === n)) throw new Error('A sheet with the name "' + n + '" already exists.'); this.nombre = n; return this; }
    getSheetId() { return this.id; }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxCols; }
    getLastRow() {
      for (let i = Math.min(this.filas.length, this.maxRows) - 1; i >= 0; i--) { const f = this.filas[i]; if (f && f.some((v) => v !== undefined && v !== '')) return i + 1; }
      return 0;
    }
    getLastColumn() {
      let m = 0;
      for (const f of this.filas) if (f) for (let j = f.length - 1; j >= m; j--) if (f[j] !== undefined && f[j] !== '') { m = j + 1; break; }
      return m;
    }
    getRange(a, b, c, d) {
      if (typeof a === 'string') throw new Error('Emulador: notación A1 no soportada');
      return new Rango(this, a, b, c || 1, d || 1);
    }
    /* Solo la forma que usa Alertas: ['A10:Q12', ...] (una sola llamada a la hoja para todos los rangos) */
    getRangeList(lista) {
      const col = (l) => l.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const rangos = lista.map((a1) => {
        const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a1);
        if (!m) throw new Error('Emulador: notación A1 no soportada: ' + a1);
        const r1 = Number(m[2]), r2 = Number(m[4]), c1 = col(m[1]), c2 = col(m[3]);
        if (r2 < r1 || c2 < c1) throw new Error('Emulador: rango invertido ' + a1);
        return new Rango(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
      });
      return { getRanges: () => rangos.slice(), clearContent() { E.cuota.escriturasHoja++; rangos.forEach((r) => r.clear()); return this; } };
    }
    insertRowsAfter(pos, n) {
      this.revisarEdicion();
      this.libro.revisarCeldas(n * this.maxCols);
      if (pos < this.filas.length) this.filas = this.filas.slice(0, pos).concat(new Array(n), this.filas.slice(pos));
      this.maxRows += n;
      return this;
    }
    deleteRows(pos, n) {
      this.revisarEdicion();
      if (pos < 1 || pos + n - 1 > this.maxRows) throw new Error('Those rows are out of bounds.');
      if (n >= this.maxRows) throw new Error('You can\'t delete all the rows on the sheet.');
      if (this.congeladas && this.maxRows - n <= this.congeladas) throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
      this.filas.splice(pos - 1, n);
      this.maxRows -= n;
    }
    insertColumnsAfter(pos, n) {
      this.libro.revisarCeldas(n * this.maxRows);
      for (const f of this.filas) if (f && f.length > pos) f.splice(pos, 0, ...new Array(n));
      this.maxCols += n;
      return this;
    }
    deleteColumns(pos, n) {
      if (pos < 1 || pos + n - 1 > this.maxCols) throw new Error('Those columns are out of bounds.');
      for (const f of this.filas) if (f) f.splice(pos - 1, n);
      this.maxCols -= n;
    }
    appendRow(arr) {
      const r = this.getLastRow() + 1;
      if (r > this.maxRows) { this.libro.revisarCeldas(this.maxCols); this.maxRows++; }
      if (arr.length > this.maxCols) throw new Error('Emulador: appendRow con más columnas que la hoja');
      new Rango(this, r, 1, 1, arr.length).setValues([arr]);
      return this;
    }
    clear() { this.revisarEdicion(); this.filas = []; this.formatos = []; return this; }
    setFrozenRows(n) { this.congeladas = n; }
    hideSheet() {
      if (!this.oculta && this.libro.hojas.filter((h) => !h.oculta).length === 1) throw new Error('You can\'t hide all the sheets in a document.');
      this.oculta = true; return this;
    }
    showSheet() { this.oculta = false; return this; }
    isSheetHidden() { return this.oculta; }
    setColumnWidth() { return this; }
  }

  class Libro {
    constructor(nombre) { this.id = 'libro-' + (idSeq++) + '-' + crypto.randomBytes(4).toString('hex'); this.nombre = nombre; this.hojas = []; this.zona = 'America/Los_Angeles'; E.libros.set(this.id, this); }
    celdas() { return this.hojas.reduce((a, h) => a + h.maxRows * h.maxCols, 0); }
    revisarCeldas(extra) { if (this.celdas() + extra > LIMITE_CELDAS) throw new Error('This action would increase the number of cells in the workbook above the limit of 10000000 cells.'); }
    getId() { return this.id; }
    getName() { return this.nombre; }
    getSheets() { return this.hojas.slice(); }
    getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }
    insertSheet(n, pos) {
      if (this.getSheetByName(n)) throw new Error('A sheet with the name "' + n + '" already exists. Please enter another name.');
      this.revisarCeldas(1000 * 26);
      const h = new Hoja(this, n);
      if (typeof pos === 'number') this.hojas.splice(pos, 0, h); else this.hojas.push(h);
      this.activa = h;
      return h;
    }
    setActiveSheet(h) { this.activa = h; return h; }
    getActiveSheet() { return this.activa || this.hojas[0]; }
    toast(msg, titulo) { E.toasts.push([titulo, msg]); }
    getOwner() { return usuario(E.dueno); }
    deleteSheet(h) { h.revisarEdicion(); if (this.hojas.length === 1) throw new Error('You can\'t remove all the sheets in a document.'); this.hojas = this.hojas.filter((x) => x !== h); if (this.activa === h) this.activa = null; }
    setSpreadsheetTimeZone(z) { this.zona = z; }
    getSpreadsheetTimeZone() { return this.zona; }
  }
  function nuevoLibro(nombre) { const l = new Libro(nombre); l.hojas.push(new Hoja(l, 'Hoja 1')); return l; }
  E.activo = nuevoLibro('Alertas - Base');

  const ui = {
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' }, Button: { OK: 'OK', YES: 'YES', NO: 'NO' },
    alert(...a) { E.alertas.push(a); return 'YES'; },
    createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
    showModalDialog(html, titulo) { E.dialogos.push({ titulo, html: html.contenido }); }
  };

  const SpreadsheetApp = {
    openById(id) { const l = E.libros.get(id); if (!l) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.'); return l; },
    getActiveSpreadsheet() { return E.activo; },
    getActive() { return E.activo; },
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    create(nombre) { return nuevoLibro(nombre); },
    getUi() { return ui; }
  };

  /* ---------------- Propiedades, caché y candados ---------------- */
  const propiedades = {
    getProperty(k) { E.cuota.propsLecturas++; return E.props.has(k) ? E.props.get(k) : null; },
    getProperties() { E.cuota.propsLecturas++; return Object.fromEntries(E.props); },
    setProperty(k, v) { E.cuota.propsEscrituras++; v = String(v); if (Buffer.byteLength(v) > 9216) throw new Error('Emulador: valor de propiedad mayor a 9 KB (' + k + ')'); E.props.set(k, v); return this; },
    deleteProperty(k) { E.cuota.propsEscrituras++; E.props.delete(k); return this; }
  };
  const cache = {
    get(k) { const e = E.cache.get(k); if (!e) return null; if (e.vence < ahora()) { E.cache.delete(k); return null; } return e.v; },
    getAll(keys) { const o = {}; keys.forEach((k) => { const v = cache.get(k); if (v != null) o[k] = v; }); return o; },
    put(k, v, s) {
      v = String(v); s = s == null ? 600 : s;
      if (Buffer.byteLength(v) > 100 * 1024) throw new Error('Argument too large: value');
      if (s > 21600) throw new Error('Emulador: caducidad mayor a 21600 s');
      E.cache.set(k, { v, vence: ahora() + s * 1000 });
    },
    putAll(obj, s) { Object.keys(obj).forEach((k) => cache.put(k, obj[k], s)); },
    remove(k) { E.cache.delete(k); }
  };
  const candado = { tryLock() { return true; }, waitLock() {}, releaseLock() {}, hasLock() { return true; } };

  /* ---------------- Utilities ---------------- */
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest(alg, valor) { return aSigned(crypto.createHash(alg).update(aBuffer(valor)).digest()); },
    computeHmacSha256Signature(valor, clave) { return aSigned(crypto.createHmac('sha256', aBuffer(clave)).update(aBuffer(valor)).digest()); },
    base64Encode(v) { return aBuffer(v).toString('base64'); },
    base64EncodeWebSafe(v) { return aBuffer(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode(s) { return aSigned(Buffer.from(s, 'base64')); },
    base64DecodeWebSafe(s) { return aSigned(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')); },
    newBlob(datos) { const b = aBuffer(datos); return { getBytes: () => aSigned(b), getDataAsString: () => b.toString('utf8') }; },
    getUuid() { return crypto.randomUUID(); },
    sleep() {},
    formatDate(fecha, zona, patron) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(fecha).map((x) => [x.type, x.value]));
      const pared = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
      const off = Math.round((pared - Math.floor(fecha.getTime() / 60000) * 60000) / 60000);
      const Z = (off < 0 ? '-' : '+') + String(Math.floor(Math.abs(off) / 60)).padStart(2, '0') + String(Math.abs(off) % 60).padStart(2, '0');
      return patron.replace(/yyyy|yy|MM|dd|HH|H|mm|Z/g, (t) => ({ yyyy: p.year, yy: p.year.slice(2), MM: p.month, dd: p.day, HH: p.hour, H: String(Number(p.hour)), mm: p.minute, Z: Z }[t]));
    }
  };

  /* ---------------- Genesys falso para UrlFetchApp ----------------
     Cada token: { name, email } y, para probar ataques, { org, cliente, sinTokensMe }.
     tokens/me responde como Genesys: organization, homeOrganization, authorizedScope y OAuthClient. */
  const UrlFetchApp = {
    fetch(url, params = {}) {
      E.cuota.urlFetch++;
      const m = String(url).match(/^https:\/\/api\.([^/]+)\/api\/v2\/(users\/me|tokens\/me)(\?[^#]*)?$/);
      let codigo = 404, cuerpo = '{"message":"no encontrado"}';
      if (m) {
        const auth = (params.headers && (params.headers.Authorization || params.headers.authorization)) || '';
        const token = auth.replace(/^Bearer\s+/i, '');
        const u = m[1] === E.genesys.region ? E.genesys.tokens.get(token) : null;
        const org = (u && u.org) || E.genesys.org;
        const expand = new URLSearchParams((m[3] || '').slice(1)).get('expand') || '';
        if (!u) { codigo = 401; cuerpo = '{"message":"Invalid login credentials."}'; }
        else if (m[2] === 'tokens/me') {
          if (u.sinTokensMe) { codigo = 403; cuerpo = '{"message":"Missing the required scope.","code":"missing.any.scopes"}'; }
          else {
            codigo = 200;
            cuerpo = JSON.stringify({ organization: org, homeOrganization: org, authorizedScope: ['user-basic-info'], OAuthClient: { id: u.cliente || E.genesys.clientId, name: 'Alertas', organization: org } });
          }
        } else {
          const yo = { id: crypto.randomUUID(), name: u.name, email: u.email, state: 'active' };
          if (expand.split(',').indexOf('organization') >= 0) yo.organization = Object.assign({ defaultLanguage: 'es' }, org);
          codigo = 200; cuerpo = JSON.stringify(yo);
        }
      }
      if (codigo >= 400 && !params.muteHttpExceptions) throw new Error('Request failed for ' + url + ' returned code ' + codigo);
      return { getResponseCode: () => codigo, getContentText: () => cuerpo };
    }
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(s) { return { contenido: s, setMimeType() { return this; }, getContent() { return this.contenido; } }; }
  };
  const HtmlService = { createHtmlOutput(h) { const o = { contenido: h, setWidth: () => o, setHeight: () => o }; return o; } };
  const Session = { getEffectiveUser: () => usuario(E.usuario || E.dueno), getActiveUser: () => usuario(E.usuario || E.dueno), getScriptTimeZone: () => 'America/Tegucigalpa' };
  const ScriptApp = {
    getProjectTriggers: () => E.triggers.map((t) => ({ getHandlerFunction: () => t.fn, _t: t })),
    deleteTrigger(x) { E.triggers = E.triggers.filter((t) => t !== (x && x._t)); },
    newTrigger(fn) { const t = { fn }; const ch = { timeBased: () => ch, everyDays: (n) => { t.dias = n; return ch; }, everyHours: (n) => { t.horas = n; return ch; }, atHour: (h) => { t.hora = h; return ch; }, create: () => { E.triggers.push(t); return t; } }; return ch; },
    getService: () => ({ getUrl: () => E.urlServicio })
  };

  const contexto = vm.createContext({
    SpreadsheetApp, PropertiesService: { getScriptProperties: () => propiedades }, CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => candado, getUserLock: () => candado }, Utilities, UrlFetchApp, ContentService, HtmlService, Session, ScriptApp,
    Logger: { log: (...a) => console.log('[Logger]', ...a) }, console, Date: FechaS
  });
  const codigo = fs.readFileSync(opciones.codigo || require('path').join(__dirname, '..', 'servidor', 'Code.gs'), 'utf8');
  vm.runInContext(codigo, contexto, { filename: 'Code.gs' });

  function post(cuerpo) {
    const salida = contexto.doPost({ postData: { contents: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), type: 'text/plain' } });
    return JSON.parse(salida.getContent());
  }
  return { E, contexto, post, cache, SpreadsheetApp, ejecutar: (js) => vm.runInContext(js, contexto) };
}

module.exports = { crearEntorno };
