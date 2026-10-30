/* ==========================================================================
   ALERTAS · Lector de base (XLSX / CSV) — sin librerías externas.
   Corre dentro de un Web Worker (o en el hilo principal como respaldo).
   Lee el Excel en streaming y lo convierte en una base compacta por columnas.
   ========================================================================== */

const ALERTAS_PARSER = (() => {
  'use strict';

  /* ---------- Columnas reconocidas (encabezado normalizado -> campo) ---------- */
  const HEADER_ALIASES = {
    contrato: ['CONTRATO', 'NO_CONTRATO', 'NUM_CONTRATO', 'NUMERO_CONTRATO', 'CONTRACT'],
    producto: ['PRODUCT_ID', 'PRODUCTO_ID', 'ID_PRODUCTO', 'PRODUCTO', 'PRODUCTID'],
    nodo: ['GRUPO_NODO', 'NODO', 'GRUPONODO'],
    olt: ['OLT'],
    nap: ['NAP', 'TAP'],
    categoria: ['CATEGORIA_CLIENTE', 'CATEGORIA', 'SEGMENTO'],
    fecha: ['FECHA_INICIO', 'FECHA_ALTA', 'FECHA_INSTALACION', 'FECHA'],
    tecnologia: ['TECNOLOGIA', 'TECNOLOGIA_RED', 'RED'],
    play: ['PLAY'],
    departamento: ['DEPARTAMENTO', 'DEPTO'],
    municipio: ['MUNICIPIO', 'CIUDAD'],
    colonia: ['COLONIA', 'BARRIO', 'BARRIO_COLONIA'],
    nombre: ['NOMBRE_CLIENTE', 'NOMBRE', 'CLIENTE', 'NOMBRE_COMPLETO'],
    dni: ['DNI', 'IDENTIDAD', 'NO_IDENTIDAD', 'DOCUMENTO', 'RTN'],
    megas: ['MEGAS', 'VELOCIDAD', 'ANCHO_BANDA', 'MBPS', 'PLAN_INTERNET', 'PLAN']
  };
  const REQUIRED = ['contrato', 'nodo', 'tecnologia', 'nombre', 'dni'];
  const DICT_FIELDS = ['nodo', 'olt', 'nap', 'categoria', 'tecnologia', 'play', 'departamento', 'municipio', 'colonia', 'megas'];

  const normHeader = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase().replace(/[\s.\-\/]+/g, '_').replace(/[^A-Z0-9_]/g, '');

  function mapHeader(headerCells) {
    const idx = {};
    const norm = headerCells.map(normHeader);
    for (const field in HEADER_ALIASES) {
      for (const alias of HEADER_ALIASES[field]) {
        const i = norm.indexOf(alias);
        if (i >= 0) { idx[field] = i; break; }
      }
    }
    const missing = REQUIRED.filter((f) => idx[f] == null);
    return { idx, missing, norm };
  }

  /* ---------- Limpieza de valores ---------- */
  const squeeze = (s) => s.replace(/\s+/g, ' ').trim();
  function cleanName(s) {
    if (!s) return '';
    let v = String(s);
    v = v.replace(/\d{6,}/g, ' ');        // códigos pegados al nombre
    v = v.replace(/[\s\-–—_.,;]+$/g, '');  // guiones o basura al final
    v = v.replace(/^[\s\-–—_.,;]+/g, '');
    return squeeze(v).toUpperCase();
  }
  const cleanDni = (s) => squeeze(String(s == null ? '' : s).replace(/['´`"]/g, ''));
  const digits = (s) => String(s == null ? '' : s).replace(/\D+/g, '');

  /* ---------- Constructor de base compacta ---------- */
  function makeBuilder(cap) {
    cap = Math.max(1024, cap | 0);
    const st = { n: 0, cap };
    const num = { contrato: new Float64Array(cap), producto: new Float64Array(cap), fecha: new Int32Array(cap) };
    const enc = {}; const dicts = {}; const dmap = {};
    for (const f of DICT_FIELDS) { enc[f] = new Uint32Array(cap); dicts[f] = ['']; dmap[f] = new Map([['', 0]]); }
    const nombre = []; const dni = [];

    function grow() {
      const nc = Math.ceil(st.cap * 1.6);
      for (const k in num) { const a = new num[k].constructor(nc); a.set(num[k]); num[k] = a; }
      for (const k in enc) { const a = new Uint32Array(nc); a.set(enc[k]); enc[k] = a; }
      st.cap = nc;
    }
    function code(field, raw) {
      let v = raw == null ? '' : squeeze(String(raw));
      if (field === 'nodo' || field === 'tecnologia' || field === 'olt' || field === 'nap' || field === 'play') v = v.toUpperCase();
      const m = dmap[field]; let c = m.get(v);
      if (c === undefined) { c = dicts[field].length; dicts[field].push(v); m.set(v, c); }
      return c;
    }
    function add(rec) {
      if (st.n >= st.cap) grow();
      const i = st.n++;
      num.contrato[i] = rec.contrato; num.producto[i] = rec.producto || 0; num.fecha[i] = rec.fecha || 0;
      for (const f of DICT_FIELDS) enc[f][i] = code(f, rec[f]);
      nombre.push(rec.nombre); dni.push(rec.dni);
    }
    function finish(meta) {
      const n = st.n; const cols = {};
      for (const k in num) cols[k] = num[k].slice(0, n);
      for (const k in enc) cols[k] = enc[k].slice(0, n);
      cols.nombre = nombre; cols.dni = dni;
      return Object.assign({ formato: 2, filas: n, dicts, cols }, meta || {});
    }
    return { add, finish, get count() { return st.n; } };
  }

  /* ---------- Fechas ---------- */
  function excelSerialToEpochDays(v, date1904) {
    const d = Math.floor(v);
    return date1904 ? d + 1462 - 25569 : d - 25569;
  }
  function parseDateText(s) {
    s = String(s).trim(); if (!s) return 0;
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return Math.floor(Date.UTC(y, +m[2] - 1, +m[1]) / 864e5); }
    const n = Number(s); if (isFinite(n) && n > 1000 && n < 100000) return n - 25569;
    return 0;
  }

  /* ---------- Convierte una fila (array de celdas) a registro ---------- */
  function rowToRecord(cells, idx, date1904) {
    const g = (f) => (idx[f] == null ? '' : cells[idx[f]]);
    const cRaw = g('contrato'); const cDig = digits(cRaw);
    if (!cDig) return null;                       // fila vacía o basura
    const fRaw = g('fecha'); let fecha = 0;
    if (typeof fRaw === 'number') fecha = excelSerialToEpochDays(fRaw, date1904);
    else if (fRaw !== '' && fRaw != null) {
      const asNum = Number(fRaw);
      fecha = (isFinite(asNum) && asNum > 1000 && asNum < 100000) ? excelSerialToEpochDays(asNum, date1904) : parseDateText(fRaw);
    }
    return {
      contrato: Number(cDig), producto: Number(digits(g('producto'))) || 0, fecha,
      nodo: g('nodo'), olt: g('olt'), nap: g('nap'), categoria: g('categoria'), tecnologia: g('tecnologia'),
      play: g('play'), departamento: g('departamento'), municipio: g('municipio'), colonia: g('colonia'),
      megas: g('megas'), nombre: cleanName(g('nombre')), dni: cleanDni(g('dni'))
    };
  }

  /* ---------- XML helpers ---------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unescapeXml(s) {
    if (s.indexOf('&') >= 0) {
      s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
        if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
        return ENT[e];
      });
    }
    if (s.indexOf('_x') >= 0) s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return s;
  }
  const colIndex = (letters) => { let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; };

  /* ---------- ZIP ---------- */
  function readZipEntries(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo no parece un Excel (.xlsx) válido.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      entries[name.replace(/^\/+/, '')] = { name, method, csize, usize, off };
      p += 46 + nlen + xlen + clen;
    }
    return entries;
  }
  function entryData(u8, e) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(e.off, true) !== 0x04034b50) throw new Error('ZIP dañado: ' + e.name);
    const nlen = dv.getUint16(e.off + 26, true), xlen = dv.getUint16(e.off + 28, true);
    const start = e.off + 30 + nlen + xlen;
    return u8.subarray(start, start + e.csize);
  }
  /* Recorre el contenido descomprimido en trozos de texto */
  async function streamEntryText(u8, e, onText, onBytes) {
    const data = entryData(u8, e);
    const dec = new TextDecoder('utf-8');
    if (e.method === 0) { onBytes && onBytes(data.length); onText(dec.decode(data)); return; }
    if (e.method !== 8) throw new Error('Compresión no soportada en ' + e.name);
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no soporta la lectura de Excel. Usa Chrome o Edge actualizado, o sube la base en CSV.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      onBytes && onBytes(value.length);
      onText(dec.decode(value, { stream: true }));
    }
    const tail = dec.decode(); if (tail) onText(tail);
  }
  async function entryText(u8, e) { let s = ''; await streamEntryText(u8, e, (t) => { s += t; }); return s; }

  function resolvePath(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/'); parts.pop();
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
    return parts.join('/');
  }

  /* ---------- XLSX ---------- */
  async function parseXlsx(buffer, onProgress, opts) {
    const u8 = new Uint8Array(buffer);
    const entries = readZipEntries(u8);
    const find = (n) => entries[n] || entries[Object.keys(entries).find((k) => k.toLowerCase() === n.toLowerCase())];

    const wbE = find('xl/workbook.xml'); if (!wbE) throw new Error('No encontré la hoja de cálculo dentro del archivo.');
    const wbXml = await entryText(u8, wbE);
    const date1904 = /date1904="(1|true)"/.test(wbXml);
    const sheetM = wbXml.match(/<sheet\b[^>]*>/);
    const rid = sheetM && (sheetM[0].match(/r:id="([^"]+)"/) || sheetM[0].match(/\bid="([^"]+)"/));
    let sheetPath = 'xl/worksheets/sheet1.xml', ssPath = 'xl/sharedStrings.xml';
    const relE = find('xl/_rels/workbook.xml.rels');
    if (relE) {
      const rels = await entryText(u8, relE);
      const relTags = rels.match(/<Relationship\b[^>]*>/g) || [];
      for (const tag of relTags) {
        const id = (tag.match(/\bId="([^"]+)"/) || [])[1];
        const target = (tag.match(/\bTarget="([^"]+)"/) || [])[1];
        const type = (tag.match(/\bType="([^"]+)"/) || [])[1] || '';
        if (rid && id === rid[1] && target) sheetPath = resolvePath('xl/workbook.xml', target);
        if (/sharedStrings$/.test(type) && target) ssPath = resolvePath('xl/workbook.xml', target);
      }
    }
    const sheetE = find(sheetPath); if (!sheetE) throw new Error('No encontré la primera hoja del Excel.');
    const ssE = find(ssPath);

    const totalBytes = (ssE ? ssE.usize : 0) + sheetE.usize; let doneBytes = 0;
    const bump = (n) => { doneBytes += n; onProgress && onProgress(Math.min(0.99, doneBytes / Math.max(1, totalBytes))); };

    /* Cadenas compartidas */
    const sst = [];
    if (ssE) {
      let buf = '';
      const flush = (final) => {
        const end = final ? buf.length : buf.lastIndexOf('</si>') + 5;
        if (end < 5) return;
        const part = buf.slice(0, end); buf = buf.slice(end);
        const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m;
        while ((m = re.exec(part))) {
          let inner = m[1] || '';
          if (inner.indexOf('<rPh') >= 0) inner = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
          let txt = '';
          const tre = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g; let t;
          while ((t = tre.exec(inner))) txt += t[1] || '';
          sst.push(unescapeXml(txt));
        }
      };
      await streamEntryText(u8, ssE, (t) => { buf += t; if (buf.length > 262144) flush(false); }, bump);
      flush(true);
    }

    /* Hoja: filas */
    let header = null, map = null, builder = null, buf = '', firstChunk = true, rowsSeen = 0, capHint = 0;
    const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const handleRow = (inner) => {
      const cells = [];
      if (inner) {
        let m, auto = 0; cellRe.lastIndex = 0;
        while ((m = cellRe.exec(inner))) {
          const attrs = m[1]; const body = m[2] || '';
          const rM = attrs.match(/\br="([A-Z]+)\d*"/);
          const ci = rM ? colIndex(rM[1]) : auto; auto = ci + 1;
          const tM = attrs.match(/\bt="([a-zA-Z]+)"/); const typ = tM ? tM[1] : 'n';
          let val = '';
          if (typ === 'inlineStr') {
            let txt = ''; const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let t;
            while ((t = tre.exec(body))) txt += t[1];
            val = unescapeXml(txt);
          } else {
            const v0 = body.indexOf('<v>');
            if (v0 >= 0) {
              const v = body.slice(v0 + 3, body.indexOf('</v>', v0));
              if (typ === 's') val = sst[+v] != null ? sst[+v] : '';
              else if (typ === 'str' || typ === 'e') val = unescapeXml(v);
              else if (typ === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
              else { const nv = Number(v); val = isFinite(nv) ? nv : v; }
            }
          }
          cells[ci] = val;
        }
      }
      rowsSeen++;
      if (!header) {
        if (!cells.some((c) => c !== '' && c != null)) return;
        header = cells.map((c) => (c == null ? '' : String(c)));
        map = mapHeader(header);
        if (map.missing.length) throw new Error('Faltan columnas obligatorias: ' + map.missing.map((f) => HEADER_ALIASES[f][0]).join(', '));
        builder = makeBuilder(capHint || 200000);
        return;
      }
      const rec = rowToRecord(cells, map.idx, date1904);
      if (rec) builder.add(rec);
    };
    const flushRows = (final) => {
      const end = final ? buf.length : buf.lastIndexOf('</row>') + 6;
      if (end < 6 && !final) return;
      const part = buf.slice(0, end); buf = buf.slice(end);
      rowRe.lastIndex = 0; let m;
      while ((m = rowRe.exec(part))) handleRow(m[1]);
    };
    await streamEntryText(u8, sheetE, (t) => {
      if (firstChunk) {
        firstChunk = false;
        const dm = t.match(/<dimension ref="[A-Z]+\d+:[A-Z]+(\d+)"/); if (dm) capHint = (+dm[1]) + 16;
      }
      buf += t; if (buf.length > 262144) flushRows(false);
    }, bump);
    flushRows(true);
    if (!builder) throw new Error('La hoja está vacía.');
    onProgress && onProgress(1);
    return { builder, header, map, sst: sst.length };
  }

  /* ---------- CSV ---------- */
  function parseCsvText(text, onProgress) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
    const delim = [';', ',', '\t', '|'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    let header = null, map = null, builder = null;
    let row = [], field = '', inQ = false, i = 0; const N = text.length; let lastReport = 0;
    const endRow = () => {
      row.push(field); field = '';
      if (!header) {
        if (row.some((c) => c.trim() !== '')) {
          header = row; map = mapHeader(header);
          if (map.missing.length) throw new Error('Faltan columnas obligatorias: ' + map.missing.map((f) => HEADER_ALIASES[f][0]).join(', '));
          builder = makeBuilder(Math.round(N / 120));
        }
      } else if (row.length > 1 || row[0] !== '') {
        const rec = rowToRecord(row, map.idx, false); if (rec) builder.add(rec);
      }
      row = [];
    };
    while (i < N) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { endRow(); i++; if (i - lastReport > 2e6) { lastReport = i; onProgress && onProgress(i / N); } continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length) endRow();
    if (!builder) throw new Error('El CSV está vacío.');
    onProgress && onProgress(1);
    return { builder, header, map };
  }

  /* ---------- Punto de entrada ---------- */
  async function parseFile(buffer, fileName, onProgress) {
    const t0 = Date.now();
    const lower = (fileName || '').toLowerCase();
    let res;
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
      res = parseCsvText(new TextDecoder('utf-8').decode(new Uint8Array(buffer)), onProgress);
    } else {
      res = await parseXlsx(buffer, onProgress);
    }
    const base = res.builder.finish({
      archivo: fileName || '', columnas: res.header, columnasUsadas: Object.keys(res.map.idx),
      tieneMegas: res.map.idx.megas != null, segundos: (Date.now() - t0) / 1000
    });
    return base;
  }

  return { parseFile, makeBuilder, mapHeader, cleanName, digits, HEADER_ALIASES };
})();

if (typeof module !== 'undefined') module.exports = ALERTAS_PARSER;
