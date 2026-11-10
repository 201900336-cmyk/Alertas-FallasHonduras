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
     nodos: [codigo, total, hfc, gpon, empresariales, indiceOlt, [dep, n, ...], [muni, n, ...], [colonia, n, ...]]
     cols (desde el formato 2): [dep, muni, nombre] de cada colonia, para el panel de fallas de los asesores. La
     misma colonia en otro municipio es otra. Las colonias quedan limpias: una sola vez aunque en la base venga
     escrita de varias formas (con el nombre de la forma que más se repite), en nombre propio y sin las que dicen
     "NO USAR"; los clientes sin colonia válida van a una con nombre vacío, para que cuenten en su municipio. */
  // Cada pareja municipio y colonia, con su clave, una sola vez (la misma pareja se repite en miles de filas)
  function coloniasDeBase(ix) {
    const memo = new Map();
    return (raw) => {
      let r = memo.get(raw);
      if (r === undefined) { r = raw && !U.coloniaNoUsar(raw) ? U.claveColonia(raw) : ''; memo.set(raw, r); }
      return r;
    };
  }
  function catalogo(ix) {
    const deps = [], munis = [], olts = [], cols = [];
    const di = new Map(), mi = new Map(), oi = new Map(), ci = new Map();
    const pos = (arr, mapa, v) => { let k = mapa.get(v); if (k === undefined) { k = arr.length; arr.push(v); mapa.set(v, k); } return k; };
    const plano = (m, arr, mapa) => [...m.entries()].sort((a, b) => b[1] - a[1]).reduce((o, [k, n]) => { o.push(pos(arr, mapa, k), n); return o; }, []);
    const SEP = '\u0001';
    const clave = coloniasDeBase(ix);
    const formas = new Map();   // dep|muni|clave -> cuántas filas trae cada forma de escribir la colonia
    const nodos = [];
    for (const [code, c] of ix.nodoIdx) {
      const desde = ix.inicio[c], hasta = ix.inicio[c + 1];
      if (desde === hasta) continue;
      const dm = new Map(), mm = new Map(), cm = new Map();
      let corp = 0;
      for (let p = desde; p < hasta; p++) {
        const i = ix.filasNodo[p];
        const d = ix.D.departamento[ix.C.departamento[i]], m = ix.D.municipio[ix.C.municipio[i]];
        dm.set(d, (dm.get(d) || 0) + 1); mm.set(m, (mm.get(m) || 0) + 1);
        const raw = ix.D.colonia[ix.C.colonia[i]], kc = clave(raw), k = d + SEP + m + SEP + kc;
        cm.set(k, (cm.get(k) || 0) + 1);
        if (kc) { let f = formas.get(k); if (!f) formas.set(k, (f = new Map())); f.set(raw, (f.get(raw) || 0) + 1); }
        if (ix.esCorp[ix.C.categoria[i]]) corp++;
      }
      const oltIdx = ix.oltNodo[c] >= 0 ? pos(olts, oi, U.oltBase(ix.D.olt[ix.oltNodo[c]])) : -1;
      const pd = plano(dm, deps, di), pm = plano(mm, munis, mi);
      const pc = [...cm.entries()].sort((a, b) => b[1] - a[1]).reduce((o, [k, n]) => {
        let x = ci.get(k);
        if (x === undefined) { const [d, m] = k.split(SEP); x = cols.length; cols.push([pos(deps, di, d), pos(munis, mi, m), k]); ci.set(k, x); }
        o.push(x, n); return o;
      }, []);
      nodos.push([code, ix.cnt[c], ix.cH[c], ix.cG[c], corp, oltIdx, pd, pm, pc]);
    }
    // El nombre de cada colonia: la forma que más se repite, limpia ("COL. EL CASTA¿O SUR" -> "Col. El Castaño Sur")
    for (const x of cols) {
      const f = formas.get(x[2]);
      x[2] = f ? U.colonia([...f.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]) : '';
    }
    return { formato: 2, deps, munis, cols, olts: olts.map((b) => [b, U.oltNombre(b)]), nodos, resumen: Object.assign({}, ix.resumen) };
  }
  /* Monitoreo de la pantalla de entrada: el nodo con más clientes de cada departamento (sin TAP VIRTUAL) y si
     está en una falla activa, sin cantidades. Igual que nodosPrincipales_ del servidor: con empate, el primero
     del catálogo. Lo usa la demostración (con el servidor, lo calcula Code.gs). */
  function monitoreo(json, fallas) {
    if (!json || !Array.isArray(json.nodos)) return [];
    const mejor = new Map();
    for (const n of json.nodos) {
      if (U.esVirtual(n[0])) continue;
      for (let i = 0; i < n[6].length; i += 2) {
        const dep = json.deps[n[6][i]], k = n[6][i + 1];
        if (dep && (!mejor.has(dep) || k > mejor.get(dep)[1])) mejor.set(dep, [n[0], k]);
      }
    }
    const activos = new Set();
    (fallas || []).forEach((f) => { if (f.estado === 'ACTIVA') (f.nodos || []).forEach((x) => activos.add(x)); });
    return [...mejor.keys()].sort().map((d) => ({ d, n: mejor.get(d)[0], falla: activos.has(mejor.get(d)[0]) }));
  }
  /* Convierte el catálogo (JSON) en mapas fáciles de usar */
  function cargarCatalogo(json) {
    if (!json || !Array.isArray(json.nodos)) return null;
    const olts = json.olts.map(([base, nombre]) => ({ base, nombre, nodos: [], clientes: 0 }));
    // Colonias (desde el formato 2; un catálogo de antes no las trae): [departamento, municipio, colonia]
    const cols = Array.isArray(json.cols) ? json.cols.map(([d, m, c]) => [json.deps[d] || '', json.munis[m] || '', c]) : null;
    const nodos = new Map();
    for (const [code, total, hfc, gpon, corp, oi, df, mf, cf] of json.nodos) {
      const deps = [], munis = [], colonias = [];
      for (let i = 0; i < df.length; i += 2) deps.push([json.deps[df[i]], df[i + 1]]);
      for (let i = 0; i < mf.length; i += 2) munis.push([json.munis[mf[i]], mf[i + 1]]);
      if (cols && Array.isArray(cf)) for (let i = 0; i < cf.length; i += 2) { const x = cols[cf[i]]; if (x) colonias.push([x[0], x[1], x[2], cf[i + 1]]); }
      const olt = oi >= 0 ? olts[oi] : null;
      if (olt) { olt.nodos.push(code); olt.clientes += gpon; }
      nodos.set(code, { code, total, hfc, gpon, corp, olt, deps, munis, cols: colonias });
    }
    return { nodos, olts: olts.filter((o) => o.nodos.length), resumen: json.resumen || {}, conColonias: !!cols };
  }

  /* Dónde está una falla, para el panel de los asesores: departamentos, municipios y colonias, de más a menos
     clientes. Sale del catálogo de la base actual; con un catálogo de antes, que no traía colonias, quedan los
     departamentos y municipios que se guardaron al publicarla. Un departamento o municipio con muy pocos clientes
     de la falla (por ejemplo, unos cuantos con la dirección de otro lugar) no se toma como zona afectada: no sale
     en el resumen, pero sí en la lista completa de colonias. Cuenta con 30 clientes o más, o con el 3 % de la
     falla (y al menos 5) si es pequeña. */
  function zonaFalla(cat, f) {
    const minimo = (total) => Math.min(30, Math.max(5, 0.03 * total));
    const orden = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    const suma = (l) => l.reduce((a, x) => a + x[1], 0);
    const principales = (l, total) => l.filter(([, v], i) => i === 0 || v >= minimo(total)).map(([k]) => k);
    if (cat && cat.conColonias) {
      const d = new Map(), g = new Map();
      for (const code of new Set(f.nodos || [])) {
        const n = cat.nodos.get(code); if (!n) continue;
        for (const [k, v] of n.deps) d.set(k, (d.get(k) || 0) + v);
        for (const [dep, muni, col, v] of n.cols) {
          const k = dep + '\u0001' + muni;
          let e = g.get(k); if (!e) { e = { dep, muni, n: 0, cols: new Map() }; g.set(k, e); }
          e.n += v;   // los clientes sin colonia válida cuentan en su municipio, pero no salen como colonia
          if (!col || U.coloniaNoUsar(col)) continue;
          // La misma colonia de varios nodos (o escrita distinto en un catálogo de antes) va una sola vez
          const kc = U.claveColonia(col);
          let x = e.cols.get(kc); if (!x) { x = { n: 0, formas: new Map() }; e.cols.set(kc, x); }
          x.n += v; x.formas.set(col, (x.formas.get(col) || 0) + v);
        }
      }
      if (g.size) {
        const total = [...g.values()].reduce((a, e) => a + e.n, 0);
        const nombre = (x) => U.colonia([...x.formas.entries()].sort((a, b) => b[1] - a[1])[0][0]);
        const grupos = [...g.values()].sort((a, b) => b.n - a.n)
          .map((e, i) => ({ dep: e.dep, muni: e.muni, n: e.n, cols: [...e.cols.values()].map((x) => [nombre(x), x.n]).sort((a, b) => b[1] - a[1]),
            principal: i === 0 || e.n >= minimo(total) }));
        const deps = orden(d);
        // Las 3 colonias con más clientes, sin repetir el nombre (dos municipios pueden tener su "Barrio El Centro")
        const top = [...new Set(grupos.filter((x) => x.principal).flatMap((x) => x.cols).sort((a, b) => b[1] - a[1]).map(([c]) => c))].slice(0, 3);
        return { deps: principales(deps, suma(deps)), munis: grupos.filter((x) => x.principal).map((x) => x.muni), grupos,
          colonias: grupos.reduce((a, x) => a + x.cols.length, 0), top };
      }
    }
    const imp = f.impacto || {};
    const deps = imp.deps || [], munis = imp.munis || [];
    return { deps: principales(deps, suma(deps)), munis: principales(munis, suma(deps) || suma(munis)), grupos: null, colonias: 0, top: [] };
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
  /* Una OLT por lo que se escriba en Reportes: su nombre ("Ventu", "OLT Ventu", "Danli 03" o "DANLI03") o su código
     (M00_..._OLT_VENTU). Si no es exacto y el texto está en el nombre de varias, se dan a elegir. */
  function buscarOlt(cat, q) {
    if (!cat || !cat.olts) return null;
    const norm = (x) => U.sinAcentos(String(x || '')).toUpperCase().replace(/[_\s]+/g, ' ').trim();
    const pegado = (x) => x.replace(/ /g, '');
    let k = norm(q);
    if (/^OLT /.test(k) && k.length > 5) k = k.slice(4);
    if (k.length < 3) return null;
    const exacta = cat.olts.find((o) => { const n = norm(o.nombre), b = norm(o.base); return k === n || k === b || pegado(k) === pegado(n) || pegado(k) === pegado(b); });
    if (exacta) return { olt: exacta };
    const parecidas = cat.olts.filter((o) => pegado(norm(o.nombre)).includes(pegado(k)) || pegado(norm(o.base)).includes(pegado(k)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (parecidas.length === 1) return { olt: parecidas[0] };
    return parecidas.length ? { opciones: parecidas.slice(0, 12), mas: Math.max(0, parecidas.length - 12) } : null;
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
  /* Un nodo solo puede estar en una falla activa a la vez (dos personas publicando la misma falla dejaban dos
     iguales). Las fallas activas que ya tienen alguno de estos nodos, la más reciente primero, con los nodos que
     comparten; propiaId: la que se está editando, que no choca consigo misma. */
  function choquesNodos(fallas, nodos, propiaId) {
    const de = new Set(nodos);
    if (!de.size) return [];
    return (fallas || []).filter((f) => f.estado === 'ACTIVA' && f.id !== propiaId)
      .map((f) => ({ falla: f, nodos: f.nodos.filter((n) => de.has(n)) })).filter((c) => c.nodos.length)
      .sort((a, b) => b.falla.publicadaEn - a.falla.publicadaEn);
  }
  /* El aviso de un choque, con las mismas palabras que el servidor */
  function textoChoque(choques, now) {
    const c = choques[0], n = c.nodos, f = c.falla, por = f.publicadaPor && f.publicadaPor.nombre;
    const motivo = f.motivo !== 'OTRO' && MOTIVO[f.motivo] ? MOTIVO[f.motivo].nombre : f.motivoTexto || 'Otro motivo';
    return U.listaNatural(n, 3) + (n.length === 1 ? ' ya está' : ' ya están') + ' en la falla activa ' + U.numeroFalla(f) + ' (' + motivo + ')'
      + (por ? ', que publicó ' + por + ' ' + U.hace(f.publicadaEn, now) : '') + '. Un nodo solo puede estar en una falla activa a la vez: edita esa falla o quita '
      + (n.length === 1 ? 'ese nodo' : 'esos nodos') + ' de esta.';
  }

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

  /* La fecha de alta del cliente (días desde 1970, sin hora) como la medianoche de ese día en Honduras */
  const altaLocal = (d) => { const x = new Date(d * U.DIA); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()).getTime(); };
  const aMinuto = (t) => Math.floor(t / U.MIN) * U.MIN;

  /* Historial de un cliente: las fallas de su nodo en un periodo, sin contar lo de antes de que fuera cliente.
     lista: [{ id, motivo, motivoTexto, inicio, fin (null si sigue activa), numero? }]
     Sin rango son los últimos `dias` días; con rango { desde, hasta }, ese periodo (como mucho, hasta ahora).
     El tiempo va en minutos enteros, como se leen las horas, para que lo que se suma cuadre con lo que se ve.
     De cada falla: duracion (toda) y dentro (la parte que cae en el periodo). ms une los tramos, así el tiempo
     en que dos fallas coinciden cuenta una sola vez. Para Ajustes (notas de crédito), msConfirmado deja fuera
     las posibles fallas que siguen en validación (van en pendientes) y solape es lo que se dejó de contar doble. */
  function historialCliente(lista, rec, now, dias, rango) {
    const ahora = aMinuto(now);
    const alta = rec && rec.fecha ? altaLocal(rec.fecha) : 0;
    const pedido = aMinuto(rango && rango.desde != null ? rango.desde : now - dias * U.DIA);
    const desde = Math.max(pedido, alta);
    const hasta = Math.min(rango && rango.hasta != null ? aMinuto(rango.hasta) : ahora, ahora);
    const fallas = [];
    (lista || []).forEach((f) => {
      const a = aMinuto(f.inicio), b = f.fin ? aMinuto(f.fin) : ahora;
      if (a > hasta || b < desde) return;
      const x = Math.max(a, desde), y = Math.min(b, hasta);
      // Una que solo toca el borde del periodo (terminó justo cuando empieza) no es de este periodo
      if (y <= x && a !== b) return;
      fallas.push(Object.assign({}, f, { duracion: Math.max(0, b - a), dentro: Math.max(0, y - x), recortada: a < desde || b > hasta, tramo: [x, y] }));
    });
    fallas.sort((p, q) => q.inicio - p.inicio);
    const unir = (xs) => {
      let total = 0, a = 0, b = 0, hay = false;
      xs.map((f) => f.tramo).filter((t) => t[1] > t[0]).sort((p, q) => p[0] - q[0]).forEach(([x, y]) => {
        if (!hay || x > b) { if (hay) total += b - a; a = x; b = y; hay = true; } else if (y > b) b = y;
      });
      return hay ? total + b - a : total;
    };
    const confirmadas = fallas.filter((f) => !esPosible(f));
    const msConfirmado = unir(confirmadas);
    return { fallas, total: fallas.length, ms: unir(fallas), msConfirmado, solape: confirmadas.reduce((s, f) => s + f.dentro, 0) - msConfirmado,
      pendientes: fallas.filter(esPosible), desde, hasta, alta, desdeAlta: alta > pedido };
  }

  /* Periodos del historial en Reportes. Ajustes calcula las notas de crédito por mes o por las fechas que pida
     el cliente; los de días van desde las 00:00 del primer día hasta ahora. en: para "3 fallas en octubre". */
  const fMes = new Intl.DateTimeFormat('es-HN', { month: 'long' });
  const isoDia = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const deIsoDia = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
  const DIAS_HISTORIAL = 365;
  function periodoAfectacion(clave, now, fechas) {
    const d = new Date(now), y = d.getFullYear(), m = d.getMonth();
    if (clave === 'mes' || clave === 'anterior') {
      const desde = new Date(y, m - (clave === 'anterior' ? 1 : 0), 1).getTime();
      return { desde, hasta: clave === 'anterior' ? new Date(y, m, 1).getTime() : now, en: 'en ' + fMes.format(new Date(desde)) };
    }
    if (clave === 'fechas') {
      const hoy = U.inicioDia(now), min = new Date(y, m, d.getDate() - DIAS_HISTORIAL).getTime();
      let a = deIsoDia(fechas && fechas.desde), b = deIsoDia(fechas && fechas.hasta);
      if (a == null) a = new Date(y, m, 1).getTime();
      if (b == null) b = hoy;
      if (a > b) [a, b] = [b, a];
      a = Math.min(Math.max(a, min), hoy); b = Math.min(Math.max(b, a), hoy);
      const fin = new Date(b); fin.setDate(fin.getDate() + 1);
      return { desde: a, hasta: Math.min(fin.getTime(), now), en: 'en el periodo' };
    }
    const dias = Number(clave) || DIAS_HISTORIAL;
    return { desde: new Date(y, m, d.getDate() - (dias - 1)).getTime(), hasta: now, en: 'en ' + (dias === 365 ? '1 año' : dias === 180 ? '6 meses' : dias + ' días') };
  }
  /* "del 1 oct 2026 al 31 oct 2026", "el 3 nov 2026" o "del 1 nov 2026 a hoy, 9 nov 2026 a las 3:20 p. m." */
  function textoPeriodo(desde, hasta, now) {
    const las = (t) => U.las(t).replace(/ /g, ' ');
    if (hasta >= aMinuto(now)) {
      return U.inicioDia(desde) === U.inicioDia(now) ? 'hoy, ' + U.diaAnio(now) + ', hasta ' + las(now) : 'del ' + U.diaAnio(desde) + ' a hoy, ' + U.diaAnio(now) + ' a ' + las(now);
    }
    const ultimo = Math.max(desde, hasta - 1);
    return U.inicioDia(desde) === U.inicioDia(ultimo) ? 'el ' + U.diaAnio(desde) : 'del ' + U.diaAnio(desde) + ' al ' + U.diaAnio(ultimo);
  }

  /* Resumen para Ajustes (notas de crédito por el tiempo sin servicio): el cliente, el periodo, las fallas de su
     nodo con inicio, fin y duración, y el tiempo total de afectación. En texto (para pegar en cualquier sistema),
     en HTML (para Outlook, con tabla) y en filas para el CSV. Las fallas van de la más vieja a la más nueva. */
  function resumenAfectacion(h, rec, now) {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const hora = (t) => U.hora(t).replace(/ /g, ' ');
    const fecha = (t) => U.diaAnio(t) + ', ' + hora(t);
    const finTxt = (f) => (!f.fin ? 'sigue activa' : U.inicioDia(f.fin) === U.inicioDia(f.inicio) ? hora(f.fin) : fecha(f.fin));
    const iso = (t) => { const d = new Date(t); return isoDia(t) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const motivo = (f) => (f.motivo !== 'OTRO' && MOTIVO[f.motivo] ? MOTIVO[f.motivo].nombre : f.motivoTexto || 'Otro motivo');
    const nombre = U.esEmpresa(rec.nombre, rec.categoria) ? rec.nombre : U.titulo(rec.nombre);
    const lugar = [U.colonia(rec.colonia), U.lugar(rec.municipio || ''), U.lugar(rec.departamento || '')].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    const nodo = rec.nodo + (rec.tecnologia ? ' (' + rec.tecnologia + ')' : '');
    const periodo = textoPeriodo(h.desde, h.hasta, now);
    const orden = h.fallas.slice().sort((a, b) => a.inicio - b.inicio);
    const ms = h.msConfirmado;
    const total = U.durHM(ms), cifras = U.n2(ms / U.HORA) + ' horas · ' + U.n2(ms / U.DIA) + ' días';
    const nota = (f) => (esPosible(f) ? 'posible falla en validación: no se suma' : f.recortada ? U.durHM(f.dentro) + ' dentro del periodo' : !f.fin ? 'hasta ahora' : '');
    const cuando = (f) => fecha(f.inicio) + (f.fin ? ' a ' + finTxt(f) : ', sigue activa');
    const activas = orden.filter((f) => !f.fin && !esPosible(f)).length;
    const notas = [
      h.solape > 0 ? 'Hay ' + U.durHM(h.solape) + ' en que dos fallas coinciden: ese tiempo se cuenta una sola vez.' : '',
      activas ? (activas === 1 ? 'Una falla sigue activa: su tiempo' : activas + ' fallas siguen activas: su tiempo') + ' cuenta hasta la hora de esta consulta.' : '',
      h.pendientes.length ? 'No se suma' + (h.pendientes.length === 1 ? ' la posible falla' : 'n las ' + h.pendientes.length + ' posibles fallas') + ' que ' + CONFIG.equipo + ' sigue validando.' : '',
      h.desdeAlta ? 'Es cliente desde el ' + U.diaAnio(h.alta) + ': se cuenta desde esa fecha.' : ''
    ].filter(Boolean);
    const fuente = 'Fuente: Alertas, fallas registradas para el nodo ' + rec.nodo + '. ' + U.conPunto('Consultado el ' + U.diaAnio(now) + ' a ' + U.las(now).replace(/ /g, ' '));
    const cab = ['Contrato: ' + rec.contrato + ' · Cliente: ' + (nombre || 'Sin nombre en la base'), 'Nodo: ' + nodo + (lugar ? ' · ' + lugar : ''), 'Periodo: ' + periodo];

    const texto = ['Tiempo de afectación del servicio', ...cab, '',
      orden.length ? 'Fallas en su nodo: ' + orden.length : 'Fallas en su nodo: ninguna en este periodo.',
      ...orden.map((f, i) => (i + 1) + '. ' + U.numeroFalla(f) + ' · ' + motivo(f) + ' · ' + cuando(f) + ' · ' + U.durHM(f.duracion) + (nota(f) ? ' (' + nota(f) + ')' : '')),
      '', 'Tiempo total de afectación: ' + total + ' (' + cifras + ')', ...notas, '', fuente].join('\r\n');

    const borde = 'border:1px solid #aab2bd;padding:4px 8px;text-align:left;vertical-align:top;';
    const th = (t) => '<th nowrap style="' + borde + 'background:#e8ebef;font-weight:bold;white-space:nowrap">' + esc(t) + '</th>';
    const td = (t, fijo) => '<td' + (fijo ? ' nowrap' : '') + ' style="' + borde + (fijo ? 'white-space:nowrap;' : '') + '">' + t + '</td>';
    const parrafo = (t) => '<p style="margin:0 0 6px">' + t + '</p>';
    const tabla = !orden.length ? '' : '<table cellspacing="0" cellpadding="0" border="1" style="border-collapse:collapse;border:1px solid #aab2bd;font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#000000;margin:4px 0 10px">'
      + '<tr>' + ['N.º', 'Falla', 'Motivo', 'Inicio', 'Fin', 'Duración'].map(th).join('') + '</tr>'
      + orden.map((f, i) => '<tr>' + td(i + 1, true) + td(esc(U.numeroFalla(f)), true) + td(esc(motivo(f))) + td(esc(fecha(f.inicio)), true)
        + td(esc(f.fin ? fecha(f.fin) : 'Sigue activa'), true) + td('<b>' + esc(U.durHM(f.duracion)) + '</b>' + (nota(f) ? '<br>' + esc(nota(f)) : '')) + '</tr>').join('')
      + '<tr><td colspan="5" style="' + borde + 'background:#f4f6f8"><b>Tiempo total de afectación</b></td>' + td('<b>' + esc(total) + '</b>', true) + '</tr></table>';
    const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000">'
      + parrafo('<b>Tiempo de afectación del servicio</b>') + cab.map((l) => parrafo(esc(l))).join('')
      + (orden.length ? tabla : parrafo('No hubo fallas en su nodo en este periodo.'))
      + parrafo('<b>Tiempo total de afectación: ' + esc(total) + '</b> (' + esc(cifras) + ')') + notas.map((l) => parrafo(esc(l))).join('')
      + '<p style="margin:10px 0 0;color:#555555">' + esc(fuente) + '</p></div>';

    const estado = (f) => (esPosible(f) ? 'Posible falla en validación (no se suma)' : f.fin ? 'Resuelta' : 'Activa');
    const filas = [['Contrato', 'Cliente', 'Nodo', 'Falla', 'Motivo', 'Estado', 'Inicio', 'Fin', 'Duración', 'Minutos', 'Minutos en el periodo']]
      .concat(orden.map((f) => [rec.contrato, nombre, rec.nodo, U.numeroFalla(f), motivo(f), estado(f), iso(f.inicio), f.fin ? iso(f.fin) : '',
        U.durHM(f.duracion), Math.round(f.duracion / U.MIN), Math.round(f.dentro / U.MIN)]))
      .concat([[rec.contrato, nombre, rec.nodo, 'Total', 'Tiempo total de afectación ' + periodo + (h.solape > 0 ? ' (el tiempo en que coinciden dos fallas cuenta una vez)' : '')
        + (h.pendientes.length ? ' (sin las posibles fallas en validación)' : ''), '', iso(h.desde), iso(h.hasta), total, '', Math.round(ms / U.MIN)]]);
    const archivo = 'afectacion-' + rec.contrato + '-' + isoDia(h.desde) + '-a-' + isoDia(Math.max(h.desde, h.hasta - 1)) + '.csv';
    return { texto, html, filas, archivo, total, cifras, periodo };
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
  const INTERNOS = new Set([CONFIG.roles.workforce.canal, CONFIG.roles.jefatura.canal, CONFIG.roles.supervisor.canal]);
  const esInterno = (canal) => INTERNOS.has(canal);

  /* ---------- Consultas por nodo (Reportes) ----------
     De las consultas sueltas de un nodo ([fecha, acceso, tienda, tipo, contrato, resultado]): cuántos clientes
     distintos consultaron, cuántas consultas, por qué canal, de qué tiendas y a qué hora o día. Las búsquedas de
     Workforce, Jefatura y los supervisores van aparte: son ellos revisando el nodo, no clientes llamando. Un
     reporte de posible falla de un asesor cuenta a su cliente, pero no como otra consulta. */
  const CANAL_CC = 'Call center y redes sociales';
  function resumenNodo(r) {
    const porCliente = new Map(), canales = new Map(), tiendas = new Map(), internas = new Map();
    // Con varios nodos (una OLT), cada consulta trae su nodo (servidor 3.6): lo de cada nodo va en porNodo
    const porNodo = new Map();
    const delNodo = (n) => { let x = porNodo.get(n); if (!x) porNodo.set(n, (x = { nodo: n, consultas: 0, reportes: 0, clientes: 0, contratos: new Set(), ultima: 0 })); return x; };
    let consultas = 0, conFalla = 0, reportes = 0;
    const consultasExternas = [];
    for (const [t, acceso, tienda, tipo, contrato, res, nodoFila] of (r && r.filas) || []) {
      if (esInterno(acceso)) { internas.set(acceso, (internas.get(acceso) || 0) + 1); continue; }
      const nodo = nodoFila || (r && r.nodo) || '';
      const canal = acceso === CONFIG.roles.tiendas.canal ? 'Tiendas' : CANAL_CC;
      const reporte = tipo === 'reporte';
      const xn = nodo ? delNodo(nodo) : null;
      let k = canales.get(canal);
      if (!k) canales.set(canal, (k = { canal, consultas: 0, clientes: new Set() }));
      if (reporte) { reportes++; if (xn) xn.reportes++; }
      else {
        consultas++; k.consultas++;
        if (res === 'FALLA') conFalla++;
        consultasExternas.push({ t, falla: res === 'FALLA', nodo });
        if (canal === 'Tiendas') tiendas.set(tienda || 'Sin tienda', (tiendas.get(tienda || 'Sin tienda') || 0) + 1);
        if (xn) { xn.consultas++; xn.ultima = Math.max(xn.ultima, t); }
      }
      if (!contrato) continue;
      k.clientes.add(contrato);
      if (xn) xn.contratos.add(contrato);
      let c = porCliente.get(contrato);
      if (!c) porCliente.set(contrato, (c = { contrato, veces: 0, primera: t, ultima: t, canales: [], conFalla: false, reporte: false, nodo }));
      if (!reporte) c.veces++;
      c.primera = Math.min(c.primera, t);
      if (t >= c.ultima) { c.ultima = t; if (nodo) c.nodo = nodo; }
      const donde = canal === 'Tiendas' ? (tienda || 'Tiendas') : CANAL_CC;
      if (!c.canales.includes(donde)) c.canales.push(donde);
      if (res === 'FALLA') c.conFalla = true;
      if (reporte) c.reporte = true;
    }
    porNodo.forEach((x) => { x.clientes = x.contratos.size; delete x.contratos; });
    const datos = (r && r.clientes) || {};
    const lista = [...porCliente.values()].map((c) => Object.assign(c, datos[c.contrato] || {}))
      .sort((a, b) => b.veces - a.veces || b.ultima - a.ultima);
    return {
      consultas, conFalla, reportes, clientes: porCliente.size, lista, consultasExternas, porNodo,
      canales: [...canales.values()].map((k) => ({ canal: k.canal, consultas: k.consultas, clientes: k.clientes.size })).sort((a, b) => b.consultas - a.consultas),
      tiendas: [...tiendas.entries()].sort((a, b) => b[1] - a[1]),
      internas: [...internas.entries()].sort((a, b) => b[1] - a[1]), totalInternas: [...internas.values()].reduce((a, n) => a + n, 0)
    };
  }
  /* Nodo -> cuándo se registró el cierre de su última falla (resuelta o descartada): lo de antes ya lo explicó esa falla */
  const cierreDe = (f) => (f.historial || []).reduce((t, h) => (h.accion === 'CERRADA' && h.en > t ? h.en : t), f.cerradaEn || 0);
  function cierresPorNodo(fallas) {
    const m = new Map();
    (fallas || []).forEach((f) => {
      if (f.estado === 'ACTIVA' || !f.cerradaEn) return;
      const t = cierreDe(f);
      f.nodos.forEach((n) => { if (!(m.get(n) >= t)) m.set(n, t); });
    });
    return m;
  }
  function alertas(logs, mf, now, descartadas, cierres) {
    const desde = now - CONFIG.alerta.minutos * U.MIN;
    const por = new Map();
    for (const l of logs) {
      if (l.t < desde || !l.n || U.esVirtual(l.n)) continue;
      if (l.r === 'FALLA' || l.r === 'NO_ENCONTRADO' || esInterno(l.canal)) continue;
      const lst = mf.porNodo.get(l.n);
      if (lst && lst.some((f) => f.estado === 'ACTIVA')) continue;
      // Lo de antes de cerrar su última falla (resuelta o descartada) ya quedó explicado por esa falla
      const cierre = cierres && cierres.get(l.n);
      if (cierre && l.t <= cierre) continue;
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
    const motivo = !f ? '' : f.motivo === 'OTRO' || !MOTIVO[f.motivo] ? String(f.motivoTexto || 'otro motivo').replace(/^[A-ZÁÉÍÓÚÑ](?=[a-záéíóúñ])/, (c) => c.toLowerCase())
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
  /* Nombre de una persona de Tiendas: nombre y apellido reales, sin apodos ni relleno ("el pepe", "la mera mera",
     "prueba", "asdf"), en nombre propio ("juan perez" → "Juan Perez"). El servidor revisa lo mismo
     (nombrePersona_ en Code.gs). Devuelve { ok, nombre } o { ok: false, error }. */
  const PARTICULAS_NOMBRE = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von']);
  const ARTICULOS_NOMBRE = new Set(['el', 'la', 'los', 'las', 'lo', 'un', 'una', 'de', 'del', 'y', 'e']);
  const NO_NOMBRES = new Set(('pepe pepito test testing prueba pruebas ejemplo demo asesor asesora agente tienda tiendas usuario usuaria admin administrador '
    + 'nadie ninguno ninguna anonimo anonima desconocido desconocida fulano fulana mengano mengana zutano zutana perengano perengana '
    + 'xxx asdf qwerty abc nombre apellido jefe jefa patron patrona cliente claro hola yo chele maje mae cerote cipote cipota bicho '
    + 'puta puto mierda verga culo pija pendejo pendeja idiota tonto tonta loco loca persona personas otra otro alguien cualquiera '
    + 'gente intruso hacker').split(' '));
  function nombrePersona(texto) {
    const limpio = String(texto == null ? '' : texto).normalize('NFC').replace(/\s+/g, ' ').trim();
    const real = 'Escribe tu nombre y apellido reales, por ejemplo: Juan Pérez.';
    if (limpio.length < 5) return { ok: false, error: 'Escribe tu nombre y apellido.' };
    if (limpio.length > 60) return { ok: false, error: 'El nombre es demasiado largo: escribe solo tu nombre y apellidos.' };
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(limpio)) return { ok: false, error: 'Escribe solo letras, sin números ni signos.' };
    const palabras = limpio.toLowerCase().split(' ');
    const base = (w) => U.sinAcentos(w).replace(/['-]/g, '');
    const principales = palabras.filter((w) => !PARTICULAS_NOMBRE.has(w));
    if (principales.length < 2) return { ok: false, error: 'Escribe tu nombre y tu apellido, por ejemplo: Juan Pérez.' };
    if (palabras.length > 6) return { ok: false, error: 'Escribe solo tu nombre y tus apellidos.' };
    if (ARTICULOS_NOMBRE.has(palabras[0]) || palabras.some((w) => NO_NOMBRES.has(base(w)))) return { ok: false, error: real };
    if (principales.some((w) => base(w).length < 2)) return { ok: false, error: 'Escribe tu nombre y apellido completos, sin iniciales.' };
    if (principales.some((w) => !/[aeiouy]/.test(base(w)) || /(.)\1\1/.test(base(w)))) return { ok: false, error: real };
    if (principales.map(base).every((w, i, a) => w === a[0])) return { ok: false, error: real };
    // Nombre propio, como NOMPROPIO de Excel pero con "de", "del", "la"… en minúscula en medio (María de la Cruz)
    const nombre = palabras.map((w, i) => (i > 0 && PARTICULAS_NOMBRE.has(w) ? w
      : w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-'))).join(' ');
    return { ok: true, nombre };
  }

  function correoPosibleFalla(d, info, firma, ahora, equipo) {
    equipo = equipo || CONFIG.equipo;
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
      c.olt && c.olt !== (c.nodo || d.nodo) ? c.olt : '', c.nap, U.colonia(c.colonia), U.lugar(c.municipio || ''), U.titulo(c.categoria || ''), canalCliente(c)]);
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
      + '<p style="margin:14px 0 0">Saludos,<br>' + esc(firma) + '<br>' + esc(equipo) + '</p></div>';
    const texto = [saludo + ':', enTexto(p1), enTexto(p2), enTexto(p3), tablaTexto, 'Saludos,\r\n' + firma + '\r\n' + equipo].join('\r\n\r\n');
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

  return { indexar, registro, ejemplos, tipoConsulta, buscar, infoNodo, filasDeNodos, impacto, zonaFalla, leerNodos, sugerir, visible, mapaFallas,
    veredictoNodo, peor, nuevoId, alertas, cierresPorNodo, esInterno, resumenNodo, esPosible, descartada, deteccion, llamadasEn, notaQflow, nombrePersona, correoPosibleFalla, canalCliente, comparar, PRIORIDAD, catalogo, cargarCatalogo, monitoreo, columnasCarga, filasCarga, huellaFila, planCambios, registroRemoto, historialCliente, reincidente, historialNodos, choquesNodos, textoChoque, buscarOlt, periodoAfectacion, textoPeriodo, resumenAfectacion, isoDia, deIsoDia, DIAS_HISTORIAL,
    dniNormal, diasAIso, isoADias };
})();
