/* ==========================================================================
   ALERTAS · Modelo: índices de búsqueda, impacto por nodo, veredictos, alertas
   ========================================================================== */

const Model = (() => {
  const aLista = (v) => (v == null ? [] : typeof v === 'number' ? [v] : v);
  const agregar = (mapa, k, i) => {
    const v = mapa.get(k);
    if (v === undefined) mapa.set(k, i);
    else if (typeof v === 'number') mapa.set(k, [v, i]);
    else v.push(i);
  };

  /* ---------- Índices ---------- */
  function indexar(base) {
    const t0 = performance.now();
    const n = base.filas, C = base.cols, D = base.dicts;
    const porContrato = new Map();
    for (let i = 0; i < n; i++) agregar(porContrato, C.contrato[i], i);
    const porDni = new Map();
    for (let i = 0; i < n; i++) {
      const k = U.digitos(C.dni[i]);
      if (k.length >= 6) agregar(porDni, k, i);
    }
    const tHFC = D.tecnologia.indexOf('HFC'), tGPON = D.tecnologia.indexOf('GPON');
    const nN = D.nodo.length;
    const cnt = new Uint32Array(nN), cH = new Uint32Array(nN), cG = new Uint32Array(nN);
    for (let i = 0; i < n; i++) {
      const c = C.nodo[i]; cnt[c]++;
      const t = C.tecnologia[i]; if (t === tHFC) cH[c]++; else if (t === tGPON) cG[c]++;
    }
    const inicio = new Uint32Array(nN + 1);
    for (let c = 0; c < nN; c++) inicio[c + 1] = inicio[c] + cnt[c];
    const cursor = inicio.slice(0, nN); const filasNodo = new Uint32Array(n);
    for (let i = 0; i < n; i++) filasNodo[cursor[C.nodo[i]]++] = i;
    const nodoIdx = new Map(); D.nodo.forEach((s, i) => { if (s) nodoIdx.set(s, i); });

    // Categorías que cuentan como cliente empresarial
    const esCorp = D.categoria.map((c) => /CORPORATIVO|EMPRESARIAL|PYME|V\.?I\.?P/.test(c || ''));

    // Departamento y municipio principal por nodo, OLT principal por nodo
    const depNodo = new Int32Array(nN).fill(-1), munNodo = new Int32Array(nN).fill(-1), oltNodo = new Int32Array(nN).fill(-1);
    const oltBaseDeDict = D.olt.map((o) => U.oltBase(o));
    const primerIdxDeBase = new Map();
    oltBaseDeDict.forEach((b, j) => { if (!primerIdxDeBase.has(b)) primerIdxDeBase.set(b, j); });
    const olts = new Map(); // base -> {base, nombre, nodos:Set, clientes}
    for (let c = 1; c < nN; c++) {
      const desde = inicio[c], hasta = inicio[c + 1]; if (desde === hasta) continue;
      const dep = new Map(), mun = new Map(), olt = new Map();
      for (let p = desde; p < hasta; p++) {
        const i = filasNodo[p];
        dep.set(C.departamento[i], (dep.get(C.departamento[i]) || 0) + 1);
        mun.set(C.municipio[i], (mun.get(C.municipio[i]) || 0) + 1);
        if (C.tecnologia[i] === tGPON) { const ob = C.olt[i]; olt.set(ob, (olt.get(ob) || 0) + 1); }
      }
      const top = (m) => { let b = -1, bv = -1; m.forEach((v, k) => { if (v > bv) { bv = v; b = k; } }); return b; };
      depNodo[c] = top(dep); munNodo[c] = top(mun);
      if (olt.size) {
        // OLT base dominante del nodo
        const porBase = new Map(); olt.forEach((v, k) => { const b = oltBaseDeDict[k]; porBase.set(b, (porBase.get(b) || 0) + v); });
        let bb = '', bv = -1; porBase.forEach((v, k) => { if (v > bv) { bv = v; bb = k; } });
        if (bb && /OLT|^M\d\d_/.test(bb)) {
          oltNodo[c] = primerIdxDeBase.get(bb);
          let e = olts.get(bb);
          if (!e) { e = { base: bb, nombre: U.oltNombre(bb), nodos: new Set(), clientes: 0 }; olts.set(bb, e); }
          e.nodos.add(D.nodo[c]); e.clientes += cG[c];
        }
      }
    }
    const resumen = {
      filas: n, contratos: porContrato.size, hfc: tHFC >= 0 ? cH.reduce((a, b) => a + b, 0) : 0,
      gpon: tGPON >= 0 ? cG.reduce((a, b) => a + b, 0) : 0,
      nodos: nodoIdx.size, olts: olts.size,
      virtuales: [...nodoIdx.keys()].filter(U.esVirtual).reduce((a, k) => a + cnt[nodoIdx.get(k)], 0),
      dnisMultiples: [...porDni.values()].filter((v) => typeof v !== 'number').length
    };
    return { base, n, C, D, porContrato, porDni, nodoIdx, cnt, cH, cG, inicio, filasNodo, tHFC, tGPON, esCorp,
      depNodo, munNodo, oltNodo, olts, resumen, ms: Math.round(performance.now() - t0) };
  }

  /* ---------- Registro legible de una fila ---------- */
  function registro(ix, i) {
    const C = ix.C, D = ix.D;
    return {
      i, contrato: C.contrato[i], producto: C.producto[i], nodo: D.nodo[C.nodo[i]], olt: D.olt[C.olt[i]], nap: D.nap[C.nap[i]],
      categoria: D.categoria[C.categoria[i]], tecnologia: D.tecnologia[C.tecnologia[i]], play: D.play[C.play[i]],
      departamento: D.departamento[C.departamento[i]], municipio: D.municipio[C.municipio[i]], colonia: D.colonia[C.colonia[i]],
      megas: D.megas ? D.megas[C.megas[i]] : '', fecha: C.fecha[i], nombre: C.nombre[i], dni: C.dni[i]
    };
  }

  /* ---------- Búsqueda por contrato o DNI ---------- */
  function tipoConsulta(q) {
    const d = U.digitos(q);
    if (!d) return { tipo: null, d };
    if (d.length <= 9) return { tipo: 'contrato', d };
    if (d.length >= 13) return { tipo: 'dni', d };
    return { tipo: 'incompleto', d };
  }
  function buscar(ix, q) {
    const { tipo, d } = tipoConsulta(q);
    if (!tipo) return { estado: 'vacio' };
    if (tipo === 'incompleto') return { estado: 'incompleto', tipo, q: d };
    const filas = tipo === 'contrato' ? aLista(ix.porContrato.get(Number(d))) : aLista(ix.porDni.get(d));
    // Ordena: contrato, luego fecha más reciente primero
    const orden = filas.slice().sort((a, b) => ix.C.contrato[a] - ix.C.contrato[b] || ix.C.fecha[b] - ix.C.fecha[a]);
    return { estado: orden.length ? 'ok' : 'no', tipo, q: d, filas: orden };
  }

  /* ---------- Nodos (en la base completa, solo modo local) ---------- */
  function filasDeNodos(ix, codes) {
    const out = [];
    for (const code of codes) {
      const c = ix.nodoIdx.get(code); if (c == null) continue;
      for (let p = ix.inicio[c]; p < ix.inicio[c + 1]; p++) out.push(ix.filasNodo[p]);
    }
    return out;
  }

  /* ---------- Catálogo de nodos ----------
     Resumen por nodo sin datos personales: es lo único que viaja a todas las PCs.
     nodos: [codigo, total, hfc, gpon, empresariales, indiceOlt, [dep, n, ...], [muni, n, ...]] */
  function catalogo(ix) {
    const deps = [], munis = [], olts = [];
    const di = new Map(), mi = new Map(), oi = new Map();
    const pos = (arr, mapa, v) => { let k = mapa.get(v); if (k === undefined) { k = arr.length; arr.push(v); mapa.set(v, k); } return k; };
    const plano = (m, arr, mapa) => [...m.entries()].sort((a, b) => b[1] - a[1]).reduce((o, [k, n]) => { o.push(pos(arr, mapa, k), n); return o; }, []);
    const nodos = [];
    for (const [code, c] of ix.nodoIdx) {
      const desde = ix.inicio[c], hasta = ix.inicio[c + 1];
      if (desde === hasta) continue;
      const dm = new Map(), mm = new Map();
      let corp = 0;
      for (let p = desde; p < hasta; p++) {
        const i = ix.filasNodo[p];
        const d = ix.D.departamento[ix.C.departamento[i]], m = ix.D.municipio[ix.C.municipio[i]];
        dm.set(d, (dm.get(d) || 0) + 1); mm.set(m, (mm.get(m) || 0) + 1);
        if (ix.esCorp[ix.C.categoria[i]]) corp++;
      }
      const oltIdx = ix.oltNodo[c] >= 0 ? pos(olts, oi, U.oltBase(ix.D.olt[ix.oltNodo[c]])) : -1;
      nodos.push([code, ix.cnt[c], ix.cH[c], ix.cG[c], corp, oltIdx, plano(dm, deps, di), plano(mm, munis, mi)]);
    }
    return { formato: 1, deps, munis, olts: olts.map((b) => [b, U.oltNombre(b)]), nodos, resumen: Object.assign({}, ix.resumen) };
  }
  /* Convierte el catálogo (JSON) en mapas fáciles de usar */
  function cargarCatalogo(json) {
    if (!json || !Array.isArray(json.nodos)) return null;
    const olts = json.olts.map(([base, nombre]) => ({ base, nombre, nodos: [], clientes: 0 }));
    const nodos = new Map();
    for (const [code, total, hfc, gpon, corp, oi, df, mf] of json.nodos) {
      const deps = [], munis = [];
      for (let i = 0; i < df.length; i += 2) deps.push([json.deps[df[i]], df[i + 1]]);
      for (let i = 0; i < mf.length; i += 2) munis.push([json.munis[mf[i]], mf[i + 1]]);
      const olt = oi >= 0 ? olts[oi] : null;
      if (olt) { olt.nodos.push(code); olt.clientes += gpon; }
      nodos.set(code, { code, total, hfc, gpon, corp, olt, deps, munis });
    }
    return { nodos, olts: olts.filter((o) => o.nodos.length), resumen: json.resumen || {} };
  }

  function infoNodo(cat, code) {
    const n = cat && cat.nodos.get(code); if (!n) return null;
    return {
      code, total: n.total, hfc: n.hfc, gpon: n.gpon, virtual: U.esVirtual(code), tecnologia: n.gpon > n.hfc ? 'GPON' : 'HFC',
      depto: n.deps.length ? n.deps[0][0] : '', muni: n.munis.length ? n.munis[0][0] : '',
      oltBase: n.olt ? n.olt.base : '', oltNombre: n.olt ? n.olt.nombre : ''
    };
  }
  function impacto(cat, codes) {
    let total = 0, hfc = 0, gpon = 0, corp = 0;
    const deps = new Map(), munis = new Map();
    const unicos = [...new Set(codes)];
    for (const code of unicos) {
      const n = cat && cat.nodos.get(code); if (!n) continue;
      total += n.total; hfc += n.hfc; gpon += n.gpon; corp += n.corp;
      for (const [k, v] of n.deps) deps.set(k, (deps.get(k) || 0) + v);
      for (const [k, v] of n.munis) munis.set(k, (munis.get(k) || 0) + v);
    }
    const orden = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { total, hfc, gpon, corp, nodos: unicos.length, deps: orden(deps), munis: orden(munis) };
  }

  /* Convierte el texto pegado del correo en nodos válidos y desconocidos */
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function sugerencia(cat, token) {
    let mejor = null, md = 3;
    const pref = token.slice(0, 3);
    for (const code of cat.nodos.keys()) {
      if (code.slice(0, 3) !== pref && Math.abs(code.length - token.length) > 1) continue;
      const d = lev(token, code); if (d < md) { md = d; mejor = code; }
    }
    return mejor;
  }
  function leerNodos(cat, texto) {
    const existe = (c) => cat.nodos.has(c);
    const crudos = String(texto || '').toUpperCase().split(/[\s,;|\/()\[\]{}"'“”‘’:<>]+/)
      .map((t) => t.replace(/^[.\-_*#]+|[.\-_*#]+$/g, '')).filter(Boolean);
    // Une "ABC 18" en ABC18, solo cuando el resultado es un nodo que existe
    const tokens = [];
    for (let i = 0; i < crudos.length; i++) {
      const a = crudos[i], b = crudos[i + 1];
      if (b && /^[A-Z]+$/.test(a) && /^\d+[A-Z]?$/.test(b) && existe(a + b)) { tokens.push(a + b); i++; continue; }
      tokens.push(a);
    }
    const validos = [], desconocidos = [], vistos = new Set();
    for (let t of tokens) {
      if (!existe(t)) { const sin = t.replace(/[-_]/g, ''); if (sin !== t && existe(sin)) t = sin; }
      if (vistos.has(t)) continue; vistos.add(t);
      if (existe(t)) { validos.push(t); continue; }
      if (/[A-Z]/.test(t) && /\d/.test(t) && t.length >= 4 && t.length <= 20) desconocidos.push({ token: t, sugerencia: sugerencia(cat, t) });
    }
    return { validos, desconocidos };
  }
  /* Autocompletado de nodos y OLT */
  function sugerir(cat, q, max) {
    max = max || 8;
    q = U.sinAcentos(String(q || '')).toUpperCase().trim();
    if (q.length < 2) return [];
    const out = [];
    for (const [code, n] of cat.nodos) {
      if (code.startsWith(q)) out.push({ tipo: 'nodo', code, total: n.total, peso: 0 });
      else if (q.length >= 3 && code.includes(q)) out.push({ tipo: 'nodo', code, total: n.total, peso: 1 });
    }
    out.sort((a, b) => a.peso - b.peso || a.code.length - b.code.length || a.code.localeCompare(b.code));
    const oltOut = [];
    if (q.length >= 3) {
      for (const o of cat.olts) {
        const nom = U.sinAcentos(o.nombre).toUpperCase();
        if (nom.includes(q) || o.base.includes(q)) oltOut.push({ tipo: 'olt', base: o.base, nombre: o.nombre, nodos: o.nodos.slice().sort(), total: o.clientes });
      }
      oltOut.sort((a, b) => b.total - a.total);
    }
    return oltOut.slice(0, 3).concat(out.slice(0, max));
  }

  /* ---------- Filas para subir la base al servidor ---------- */
  const COLUMNAS = ['CONTRATO', 'PRODUCT_ID', 'GRUPO_NODO', 'OLT', 'NAP', 'CATEGORIA_CLIENTE', 'FECHA_INICIO', 'TECNOLOGIA', 'PLAY',
    'DEPARTAMENTO', 'MUNICIPIO', 'COLONIA', 'NOMBRE_CLIENTE', 'DNI', 'MEGAS', 'TELEFONO'];
  const diasAIso = (d) => (d ? new Date(d * 864e5).toISOString().slice(0, 10) : '');
  const isoADias = (s) => { const t = Date.parse(String(s || '') + 'T00:00:00Z'); return isFinite(t) ? Math.floor(t / 864e5) : 0; };
  /* El DNI se guarda solo con dígitos cuando es un DNI o RTN; así se busca con o sin guiones */
  function dniNormal(raw) {
    const s = String(raw || '').trim();
    const d = s.replace(/\D+/g, '');
    return /^[\d\s\-.]+$/.test(s) && d.length >= 13 && d.length <= 14 ? d : s;
  }
  /* Las 14 de siempre; MEGAS y TELEFONO (teléfonos ya con 504) si vienen en el Excel; y al final la HUELLA */
  function columnasCarga(base) { return COLUMNAS.slice(0, 14).concat(base.tieneMegas ? ['MEGAS'] : [], base.tieneTelefono ? ['TELEFONO'] : [], ['HUELLA']); }
  /* Huella de una fila: un código corto (53 bits, cyrb53) calculado con todos sus datos. Si la fila no
     cambió de una semana a otra, su huella es la misma y no hace falta volver a subirla. */
  const imul = Math.imul;
  function huellaFila(f) {
    const t = 'h1\u001e' + f.join('\u001f');
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < t.length; i++) {
      const ch = t.charCodeAt(i);
      h1 = imul(h1 ^ ch, 2654435761);
      h2 = imul(h2 ^ ch, 1597334677);
    }
    h1 = imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  /* Qué subir para que la base interna quede igual al Excel nuevo.
     viejas: la huella de cada fila de la base, en orden ('' si la fila está vacía; la primera es la fila 2).
     filasDe(desde, hasta): las filas del Excel nuevo, con su huella al final.
     Devuelve las filas a agregar y las filas de la hoja a vaciar (con la huella que deben tener), o null
     si hay más de maxAgregar filas nuevas (entonces conviene la carga completa). */
  function planCambios(viejas, total, filasDe, maxAgregar) {
    const donde = new Map();
    for (let i = 0; i < viejas.length; i++) {
      const h = viejas[i];
      if (!h) continue;
      const l = donde.get(h);
      if (l) l.push(i + 2); else donde.set(h, [i + 2]);
    }
    const agregar = [];
    for (let d = 0; d < total; d += 5000) {
      const filas = filasDe(d, Math.min(total, d + 5000));
      for (let k = 0; k < filas.length; k++) {
        const f = filas[k], l = donde.get(f[f.length - 1]);
        if (l && l.length) l.pop();
        else { agregar.push(f); if (agregar.length > maxAgregar) return null; }
      }
    }
    const quitar = [];
    donde.forEach((l, h) => { for (let k = 0; k < l.length; k++) quitar.push([l[k], h]); });
    quitar.sort((a, b) => a[0] - b[0]);
    return { agregar, quitar: quitar.map((x) => x[0]), esperadas: quitar.map((x) => x[1]) };
  }
  function filasCarga(base, desde, hasta) {
    const C = base.cols, D = base.dicts, out = [];
    for (let i = desde; i < hasta; i++) {
      const f = [String(C.contrato[i]), C.producto[i] ? String(C.producto[i]) : '', D.nodo[C.nodo[i]], D.olt[C.olt[i]], D.nap[C.nap[i]],
        D.categoria[C.categoria[i]], diasAIso(C.fecha[i]), D.tecnologia[C.tecnologia[i]], D.play[C.play[i]], D.departamento[C.departamento[i]],
        D.municipio[C.municipio[i]], D.colonia[C.colonia[i]], C.nombre[i], dniNormal(C.dni[i])];
      if (base.tieneMegas) f.push(D.megas[C.megas[i]]);
      if (base.tieneTelefono) f.push(C.telefono ? C.telefono[i] || '' : '');
      f.push(huellaFila(f));
      out.push(f);
    }
    return out;
  }
  /* Un registro que llega del servidor, con el mismo formato que los locales */
  function registroRemoto(r) {
    return Object.assign({}, r, { i: r.contrato + '-' + r.producto + '-' + r.nodo, contrato: Number(r.contrato) || r.contrato, producto: Number(r.producto) || 0, fecha: isoADias(r.fecha) });
  }

  /* ---------- Fallas ---------- */
  /* Posible falla general (motivo VALIDACION): se publica mientras el VOC la confirma. Si se cierra sin
     ponerle el motivo real, queda descartada: no la ven los asesores ni entra al historial del cliente. */
  const esPosible = (f) => !!f && f.motivo === 'VALIDACION';
  const descartada = (f) => esPosible(f) && f.estado !== 'ACTIVA';
  const visible = (f, now) => f.estado === 'ACTIVA' || (f.estado === 'CERRADA' && f.cerradaEn && !descartada(f) && now - f.cerradaEn < CONFIG.horasVisibleTrasCierre * U.HORA);
  function mapaFallas(fallas, now) {
    const visibles = fallas.filter((f) => visible(f, now));
    const porNodo = new Map();
    const orden = visibles.slice().sort((a, b) => (a.estado === 'ACTIVA' ? 0 : 1) - (b.estado === 'ACTIVA' ? 0 : 1) || (b.publicadaEn - a.publicadaEn));
    for (const f of orden) for (const code of f.nodos) { if (!porNodo.has(code)) porNodo.set(code, []); porNodo.get(code).push(f); }
    const activas = orden.filter((f) => f.estado === 'ACTIVA');
    const resueltas = orden.filter((f) => f.estado === 'CERRADA').sort((a, b) => b.cerradaEn - a.cerradaEn);
    const clientesActivos = activas.reduce((a, f) => a + ((f.impacto && f.impacto.total) || 0), 0);
    return { visibles: orden, activas, resueltas, porNodo, clientesActivos };
  }
  function veredictoNodo(mf, code) {
    const lst = mf.porNodo.get(code) || [];
    const act = lst.find((f) => f.estado === 'ACTIVA'); if (act) return { tipo: 'FALLA', falla: act };
    const res = lst.find((f) => f.estado === 'CERRADA'); if (res) return { tipo: 'RESUELTA', falla: res };
    if (U.esVirtual(code)) return { tipo: 'SIN_NODO', falla: null };
    return { tipo: 'SIN_FALLA', falla: null };
  }
  const PRIORIDAD = { FALLA: 0, RESUELTA: 1, SIN_FALLA: 2, SIN_NODO: 3 };

  /* Historial de un cliente: las fallas de su nodo en los últimos `dias` días, sin contar las de antes de que
     fuera cliente. lista: [{ id, motivo, motivoTexto, inicio, fin (null si sigue activa), numero? }] */
  function historialCliente(lista, rec, now, dias) {
    const desde = Math.max(now - dias * U.DIA, rec.fecha ? rec.fecha * U.DIA : 0);
    const fallas = (lista || []).filter((f) => (f.fin || now) >= desde && f.inicio <= now).sort((a, b) => b.inicio - a.inicio);
    const ms = fallas.reduce((a, f) => a + Math.max(0, (f.fin || now) - f.inicio), 0);
    return { fallas, total: fallas.length, ms };
  }
  function reincidente(lista, rec, now) {
    return historialCliente(lista, rec, now, CONFIG.reincidente.dias).total >= CONFIG.reincidente.fallas;
  }
  /* Lo mismo que arma el servidor para la búsqueda: por nodo, las fallas del último año, con el número de falla */
  function historialNodos(fallas, nodos, completo, now) {
    const desde = now - 400 * U.DIA, out = {};
    nodos.forEach((n) => { out[n] = []; });
    fallas.forEach((f) => {
      if (f.estado !== 'ACTIVA' && ((f.cerradaEn || 0) < desde || descartada(f))) return;
      f.nodos.forEach((n) => {
        if (!out[n]) return;
        const x = { id: f.id, motivo: f.motivo, motivoTexto: f.motivoTexto, inicio: f.inicio, fin: f.estado === 'ACTIVA' ? null : f.cerradaEn };
        if (f.numero) x.numero = f.numero;
        out[n].push(x);
      });
    });
    return out;
  }
  const peor = (lista) => lista.slice().sort((a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo])[0];

  /* Igual que nuevoId_ del servidor: F + aammdd + número del día, sin guiones (F26110201) */
  function nuevoId(fallas, now) {
    const d = new Date(now);
    const pref = 'F' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const usados = fallas.map((f) => U.idFalla(f.id)).filter((id) => id.startsWith(pref)).map((id) => +id.slice(pref.length) || 0);
    return pref + String((usados.length ? Math.max(...usados) : 0) + 1).padStart(2, '0');
  }

  /* ---------- Posibles fallas (demostración; en el servidor es accionAlertas_) ---------- */
  const INTERNOS = new Set([CONFIG.roles.workforce.canal, CONFIG.roles.jefatura.canal]);
  const esInterno = (canal) => INTERNOS.has(canal);
  function alertas(logs, mf, now, descartadas) {
    const desde = now - CONFIG.alerta.minutos * U.MIN;
    const por = new Map();
    for (const l of logs) {
      if (l.t < desde || !l.n || U.esVirtual(l.n)) continue;
      if (l.r === 'FALLA' || l.r === 'NO_ENCONTRADO' || esInterno(l.canal)) continue;
      const lst = mf.porNodo.get(l.n);
      if (lst && lst.some((f) => f.estado === 'ACTIVA')) continue;
      // Lo de antes de cerrar su última falla (resuelta o descartada) ya quedó explicado por esa falla
      if (lst && lst.some((f) => f.cerradaEn && l.t <= f.cerradaEn)) continue;
      const desc = descartadas && descartadas[l.n];
      if (desc && l.t <= desc) continue;
      let e = por.get(l.n);
      if (!e) { e = { nodo: l.n, clientes: new Set(), reportes: 0, consultas: 0, primero: l.t, ultimo: l.t, tec: l.tec, dep: l.dep }; por.set(l.n, e); }
      e.consultas++; if (l.c) e.clientes.add(String(l.c)); if (l.tipo === 'reporte') e.reportes++;
      e.primero = Math.min(e.primero, l.t); e.ultimo = Math.max(e.ultimo, l.t);
    }
    const um = CONFIG.alerta;
    return [...por.values()]
      .map((e) => {
        const n = e.clientes.size;
        const nivel = n >= um.clientesDistintos || e.reportes >= um.reportes ? 'alerta' : n >= um.observar ? 'observacion' : '';
        return Object.assign(e, { nClientes: n, nivel });
      })
      .filter((e) => e.nivel)
      .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alerta' ? -1 : 1) || b.nClientes - a.nClientes || b.ultimo - a.ultimo);
  }

  /* ---------- Detección (igual que deteccionFalla_ del servidor) ----------
     La racha de consultas de clientes de los nodos que llega hasta la publicación, hasta 4 horas atrás: sin
     pausas de más de 45 minutos entre una y otra, ni entre la última y la publicación. Llamadas que se
     cortaron antes (de otro problema ya pasado) no cuentan.
     logs: [{ t, n, c, canal, r, tipo }] */
  function deteccion(logs, nodos, publicada) {
    const enNodos = new Set(nodos);
    const filas = logs.filter((l) => enNodos.has(l.n) && l.t <= publicada && l.t >= publicada - 4 * U.HORA
      && l.r !== 'FALLA' && l.r !== 'NO_ENCONTRADO' && !esInterno(l.canal)).sort((a, b) => a.t - b.t);
    // La racha de llamadas que llega hasta la publicación: sin pausas de más de 45 minutos entre una
    // llamada y la siguiente, ni entre la última y la publicación
    let ini = filas.length, ref = publicada;
    for (let i = filas.length - 1; i >= 0; i--) { if (ref - filas[i].t > 45 * U.MIN) break; ini = i; ref = filas[i].t; }
    const racha = filas.slice(ini);
    if (!racha.length) return { primera: null, aviso: null, llamadas: 0, clientes: 0 };
    let aviso = null;
    for (let i = 0; i < racha.length && aviso == null; i++) {
      const vistos = new Set(); let reportes = 0;
      for (let j = i; j < racha.length && racha[j].t - racha[i].t <= CONFIG.alerta.minutos * U.MIN; j++) {
        if (racha[j].c) vistos.add(String(racha[j].c));
        if (racha[j].tipo === 'reporte') reportes++;
        if (vistos.size >= CONFIG.alerta.clientesDistintos || reportes >= CONFIG.alerta.reportes) { aviso = racha[j].t; break; }
      }
    }
    return { primera: racha[0].t, aviso, llamadas: racha.length, clientes: new Set(racha.filter((x) => x.c).map((x) => String(x.c))).size };
  }

  /* Cuántas veces llamó un cliente durante una falla: sus consultas entre el inicio y el fin, contando
     como una sola las que están a menos de 10 minutos (varias búsquedas en la misma llamada) */
  function llamadasEn(veces, desde, hasta) {
    let n = 0, ultima = -Infinity;
    (veces || []).filter((t) => t >= desde && t <= hasta).sort((a, b) => a - b).forEach((t) => { if (t - ultima > 10 * U.MIN) { n++; ultima = t; } });
    return n;
  }

  /* Nota para la descripción del caso en Qflow (plantillas en CONFIG.notaQflow) */
  function notaQflow(v, rec, now) {
    const f = v.falla;
    const clave = v.tipo === 'FALLA' && esPosible(f) ? 'POSIBLE' : v.tipo;
    const plantilla = CONFIG.notaQflow[clave];
    if (!plantilla) return '';
    const hora = (t) => U.hora(t).replace(/\u00a0/g, ' ');
    // "las 3:00 p. m.", "la 1:30 p. m.", "ayer a las 9:15 a. m." o "el 30 oct a las 9:15 a. m."
    const momento = (t) => { const h = hora(t), art = /^1:/.test(h) ? 'la ' : 'las '; return U.esHoy(t, now) ? art + h : U.diaRel(t, now) + ' a ' + art + h; };
    const motivo = !f ? '' : f.motivo === 'OTRO' ? String(f.motivoTexto || 'otro motivo').replace(/^[A-ZÁÉÍÓÚÑ](?=[a-záéíóúñ])/, (c) => c.toLowerCase())
      : MOTIVO[f.motivo].nombre.replace(/^Falla de /, '').toLowerCase();
    const datos = {
      contrato: String(rec.contrato), nodo: rec.nodo, numero: f ? U.numeroFalla(f) : '', motivo,
      inicio: f ? momento(f.inicio) : '',
      eta: f && f.eta && f.eta > now ? 'solución estimada ' + U.cuandoCorto(f.eta, now).replace(/\u00a0/g, ' ') : 'sin hora estimada de solución',
      cerrada: f && f.cerradaEn ? (U.esHoy(f.cerradaEn, now) ? 'hoy a ' : '') + momento(f.cerradaEn) : ''
    };
    return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in datos ? datos[k] : m)).replace(/\.\./g, '.');
  }

  /* ---------- Correo para reportar una posible falla (al VOC o al personal interno) ----------
     d: el detalle (servidor: detallePosibleFalla_). Devuelve el asunto y el cuerpo en HTML (con la
     tabla de clientes, para pegar en Outlook) y en texto, más la tabla sola. */
  const CAMPOS_CORREO = ['Hora', 'Contrato', 'Cliente', 'Nodo', 'Tecnología', 'OLT', 'NAP / TAP', 'Colonia', 'Municipio', 'Categoría', 'Canal'];
  function canalCliente(c) {
    const partes = (c.canales || []).map((x) => (x === CONFIG.roles.concentrix.canal ? 'Call Center' : /^Tiendas/.test(x) ? x.replace(/^Tiendas:\s*/, 'Tienda ').replace(/^Tiendas$/, 'Tiendas') : x));
    let t = partes.join(' y ') || '';
    if (c.veces > 1) t += (t ? ', ' : '') + c.veces + ' consultas';
    if (c.reporte) t += (t ? ', ' : '') + 'reportó posible falla';
    return t;
  }
  function correoPosibleFalla(d, info, firma, ahora) {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const hora = (t) => U.hora(t).replace(/ /g, ' ');
    const h = new Date(ahora).getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const c0 = d.clientes.find((c) => c.enBase) || {};
    const tec = (info && !info.virtual && info.tecnologia) || c0.tecnologia || '';
    const muni = (info && info.muni) || c0.municipio || '', depto = (info && info.depto) || c0.departamento || '';
    const lugar = [muni, depto].filter(Boolean).map(U.lugar).filter((x, i, a) => a.indexOf(x) === i).join(', ');
    const n = d.nClientes;
    const desde = d.desde || ahora, hasta = d.hasta || ahora;
    const lapso = U.dur(hasta - desde);
    // Por dónde llegaron (Call Center o Tiendas), contando cada cliente una vez
    let porCC = 0, porTienda = 0;
    d.clientes.forEach((c) => { if ((c.canales || []).some((x) => /^Tiendas/.test(x))) porTienda++; else porCC++; });
    const canales = porTienda && porCC ? ' (' + porCC + ' por el Call Center y ' + porTienda + ' en Tiendas)'
      : porTienda ? ' (en Tiendas)' : ' (por el Call Center)';
    const reportes = d.reportes ? ', y ' + (d.reportes === 1 ? 'un asesor lo reportó' : d.reportes + ' asesores lo reportaron') + ' como posible falla' : '';
    const nodoTxt = d.nodo + (tec ? ' (' + tec + ')' : '');

    const asunto = 'Posible falla en nodo ' + d.nodo + (tec || muni ? ' (' + [tec, muni && U.lugar(muni)].filter(Boolean).join(', ') + ')' : '') + ' – ' + n + ' clientes en ' + lapso;
    const cuando = hora(desde) === hora(hasta) ? (/^1:/.test(hora(desde)) ? 'A la ' : 'A las ') + hora(desde) : 'De ' + hora(desde) + ' a ' + hora(hasta);
    const p1 = ['Les reportamos una posible falla en el nodo ', { b: nodoTxt }, (lugar ? ', ' + lugar : '') + '. ' + cuando + ' se comunicaron con nosotros ',
      { b: n + ' clientes distintos' }, ' de este nodo' + canales + reportes + '.'];
    const p2 = [(info && info.total ? 'El nodo tiene ' + U.n(info.total) + ' clientes. ' : '') + 'Por ahora no tenemos una falla registrada en este nodo.'];
    const p3 = ['Les agradecemos validar el nodo y confirmarnos si hay alguna afectación.'];
    const enHtml = (p) => p.map((x) => (typeof x === 'string' ? esc(x) : '<b>' + esc(x.b) + '</b>')).join('');
    const enTexto = (p) => p.map((x) => (typeof x === 'string' ? x : x.b)).join('');

    // En HFC la columna OLT de la base repite el nodo: ahí no dice nada y queda en blanco
    const filas = d.clientes.map((c) => [hora(c.primera), c.contrato, c.enBase ? c.nombre : 'No está en la base actual', c.nodo || d.nodo, c.tecnologia,
      c.olt && c.olt !== (c.nodo || d.nodo) ? c.olt : '', c.nap, U.lugar(c.colonia || ''), U.lugar(c.municipio || ''), U.titulo(c.categoria || ''), canalCliente(c)]);
    // Una columna que no trae nada en ningún cliente (por ejemplo OLT en un nodo HFC) no va
    const siempre = [0, 1, 2, 3];
    const usadas = CAMPOS_CORREO.map((c, i) => siempre.includes(i) || filas.some((f) => f[i]));
    const cols = CAMPOS_CORREO.map((c, i) => i).filter((i) => usadas[i]);
    const borde = 'border:1px solid #aab2bd;padding:4px 8px;text-align:left;vertical-align:top;';
    // Códigos, horas y textos cortos no se parten en dos líneas (Outlook entiende mejor el atributo nowrap)
    const fijo = [0, 1, 3, 4, 5, 6];
    const celda = (v, i) => {
      const t = v || '—', entero = fijo.includes(i) || String(t).length <= 16;
      return '<td' + (entero ? ' nowrap' : '') + ' style="' + borde + (entero ? 'white-space:nowrap;' : '') + '">' + esc(t) + '</td>';
    };
    const tablaHtml = '<table cellspacing="0" cellpadding="0" border="1" style="border-collapse:collapse;border:1px solid #aab2bd;font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000000">'
      + '<tr>' + cols.map((i) => '<th nowrap style="' + borde + 'background:#e8ebef;font-weight:bold;white-space:nowrap">' + esc(CAMPOS_CORREO[i]) + '</th>').join('') + '</tr>'
      + filas.map((f) => '<tr>' + cols.map((i) => celda(f[i], i)).join('') + '</tr>').join('')
      + '</table>';
    const tablaTexto = [CAMPOS_CORREO].concat(filas).map((f) => cols.map((i) => String(f[i] || '—').replace(/\s+/g, ' ')).join('\t')).join('\r\n');
    const parrafo = (t) => '<p style="margin:0 0 10px">' + t + '</p>';
    const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000">'
      + parrafo(esc(saludo) + ':') + parrafo(enHtml(p1)) + parrafo(enHtml(p2)) + parrafo(enHtml(p3)) + tablaHtml
      + '<p style="margin:14px 0 0">Saludos,<br>' + esc(firma) + '<br>' + esc(CONFIG.equipo) + '</p></div>';
    const texto = [saludo + ':', enTexto(p1), enTexto(p2), enTexto(p3), tablaTexto, 'Saludos,\r\n' + firma + '\r\n' + CONFIG.equipo].join('\r\n\r\n');
    return { asunto, html, texto, tablaHtml, tablaTexto };
  }

  /* ---------- Comparación entre la base actual y una nueva ---------- */
  function comparar(ixViejo, baseNueva) {
    if (!ixViejo) return null;
    const C = baseNueva.cols, D = baseNueva.dicts;
    const nuevos = new Set(); let cambiosNodo = 0;
    const vistos = new Set();
    for (let i = 0; i < baseNueva.filas; i++) {
      const k = C.contrato[i]; vistos.add(k);
      const viejo = ixViejo.porContrato.get(k);
      if (viejo === undefined) { nuevos.add(k); continue; }
      const iv = typeof viejo === 'number' ? viejo : viejo[0];
      if (ixViejo.D.nodo[ixViejo.C.nodo[iv]] !== D.nodo[C.nodo[i]] && typeof viejo === 'number') cambiosNodo++;
    }
    let bajas = 0; for (const k of ixViejo.porContrato.keys()) if (!vistos.has(k)) bajas++;
    return { nuevos: nuevos.size, bajas, cambiosNodo };
  }

  /* Nodos de ejemplo que existen en la base cargada (para el texto de ayuda) */
  function ejemplos(cat) {
    if (!cat) return [];
    const normales = [...cat.nodos.values()].filter((n) => /^[A-Z]{3}(GC)?\d{2}$/.test(n.code));
    const mayor = (a, b) => b.total - a.total;
    const hfc = normales.filter((n) => n.hfc > n.gpon).sort(mayor);
    const gpon = normales.filter((n) => n.gpon >= n.hfc).sort(mayor);
    return [hfc[0], gpon[0], gpon[1] || hfc[1]].filter(Boolean).map((n) => n.code);
  }

  return { indexar, registro, ejemplos, tipoConsulta, buscar, infoNodo, filasDeNodos, impacto, leerNodos, sugerir, visible, mapaFallas,
    veredictoNodo, peor, nuevoId, alertas, esInterno, esPosible, descartada, deteccion, llamadasEn, notaQflow, correoPosibleFalla, canalCliente, comparar, PRIORIDAD, catalogo, cargarCatalogo, columnasCarga, filasCarga, huellaFila, planCambios, registroRemoto, historialCliente, reincidente, historialNodos,
    dniNormal, diasAIso, isoADias };
})();
