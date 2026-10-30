/* ==========================================================================
   ALERTAS · Conexión con los datos
   --------------------------------------------------------------------------
   Remoto: el servidor de Apps Script con la base interna. Es el modo real.
   Local:  todo en este navegador, con datos de demostración. Se usa con ?demo
           en la dirección, o si config.js todavía no tiene la URL del servidor.
   Las dos formas responden igual, así la interfaz no sabe cuál está usando.
   ========================================================================== */

const RT = Object.assign({ api: '', genesysLogin: '' }, window.ALERTAS_CONFIG || {});
const MODO_DEMO = /[?&]demo(=|&|$)/.test(location.search) || !RT.api;
if (RT.segundosRevision > 0) CONFIG.segundosRevision = RT.segundosRevision;

const MAX_CAMBIOS = 20000;   // igual que ALERTAS.MAX_CAMBIOS en el servidor
function errorAlertas(codigo, mensaje) { const e = new Error(mensaje); e.codigo = codigo; return e; }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const sesionGuardada = (clave) => { try { const v = JSON.parse(sessionStorage.getItem(clave) || 'null'); return v && v.expira > Date.now() && CONFIG.roles[v.usuario.rol] ? v : null; } catch (e) { return null; } };
const guardarSesionEn = (clave, v) => { try { if (v) sessionStorage.setItem(clave, JSON.stringify(v)); else sessionStorage.removeItem(clave); } catch (e) { /* nada */ } };

/* ==========================================================================
   Remoto (Apps Script)
   ========================================================================== */
function BackendRemoto() {
  const CLAVE = 'alertas-sesion';
  let ses = sesionGuardada(CLAVE);
  let cfg = null;
  let alExpirarFn = null;

  /* Las consultas de solo lectura se reintentan solas si el servidor estuvo ocupado un momento
     (con cientos de personas a la vez, Apps Script a veces rechaza una solicitud suelta). */
  const REINTENTABLES = { config: 1, estado: 1, cargar: 1, buscar: 1, alertas: 1, estadisticas: 1 };
  async function llamar(accion, datos, espera) {
    for (let intento = 0; ; intento++) {
      try { return await llamarUnaVez(accion, datos, espera); } catch (e) {
        if (!REINTENTABLES[accion] || !e.reintentar || intento >= 2) throw e;
        await esperar((intento ? 2000 : 800) * (1 + Math.random() * 0.5));
      }
    }
  }
  async function llamarUnaVez(accion, datos, espera) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), espera || 45000);
    const ocupado = () => Object.assign(errorAlertas('SERVIDOR', 'El servidor está muy ocupado en este momento. Intenta de nuevo en unos segundos.'), { reintentar: true });
    let r;
    try {
      // text/plain evita la verificación previa (CORS) que Apps Script no responde
      r = await fetch(RT.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion, token: ses && ses.token, datos }), signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw errorAlertas('RED', 'El servidor tardó demasiado en responder. Intenta de nuevo.');
      throw Object.assign(errorAlertas('RED', 'No hay conexión con el servidor de Alertas. Revisa tu internet.'), { reintentar: navigator.onLine !== false });
    } finally { clearTimeout(t); }
    if (r.status === 429 || r.status >= 500) throw ocupado();
    if (!r.ok) throw errorAlertas('SERVIDOR', 'El servidor respondió con un error (' + r.status + '). Intenta de nuevo.');
    const texto = await r.text();
    let j;
    try { j = JSON.parse(texto); } catch (e) {
      // Una página de Google en vez de datos: si pide iniciar sesión, la implementación no es para "Cualquier usuario"
      if (/accounts\.google\.com|ServiceLogin|signin/i.test(texto) || accion === 'config') {
        throw errorAlertas('CONFIG', 'El servidor no respondió como se esperaba. Revisa que la aplicación web esté implementada con acceso para "Cualquier usuario" y que la URL en config.js termine en /exec.');
      }
      throw ocupado();
    }
    if (!j.ok) {
      if (j.codigo === 'SESION' && accion !== 'login') { ses = null; guardarSesionEn(CLAVE, null); if (alExpirarFn) alExpirarFn(j.error); }
      throw Object.assign(errorAlertas(j.codigo || 'SERVIDOR', j.error || 'Error del servidor.'), { reintentar: j.codigo === 'OCUPADO' });
    }
    return j.datos;
  }
  function guardar(d) { ses = { token: d.token, usuario: d.usuario, expira: d.expira }; guardarSesionEn(CLAVE, ses); return d.usuario; }

  /* ----- Genesys con PKCE ----- */
  const aleatorio = (n) => {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => abc[x % abc.length]).join('');
  };
  async function desafio(verificador) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
    return btoa(String.fromCharCode(...h)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const baseLogin = () => RT.genesysLogin || ('https://login.' + cfg.genesys.region);
  // Debe ser idéntica a la registrada en el cliente OAuth de Genesys (…/index.html y …/ cuentan como distintas)
  const retorno = () => RT.redireccion || (location.origin + location.pathname.replace(/index\.html$/i, ''));

  return {
    modo: 'remoto',
    async iniciar() {
      cfg = await llamar('config', {});
      return cfg;
    },
    usuario() { return ses ? ses.usuario : null; },
    alExpirar(fn) { alExpirarFn = fn; },

    async genesysIr() {
      if (!cfg || !cfg.genesys.activo) throw errorAlertas('CONFIG', 'Genesys todavía no está conectado en el servidor.');
      const verificador = aleatorio(64), estado = aleatorio(24);
      try { sessionStorage.setItem('alertas-pkce', JSON.stringify({ verificador, estado })); } catch (e) { /* nada */ }
      const q = new URLSearchParams({ client_id: cfg.genesys.clientId, redirect_uri: retorno(), code_challenge: await desafio(verificador), response_type: 'code', code_challenge_method: 'S256', state: estado });
      location.assign(baseLogin() + '/oauth/authorize?' + q.toString());
    },
    /* Al volver de Genesys la dirección trae ?code=…&state=… */
    async genesysVolver() {
      const p = new URLSearchParams(location.search);
      if (!p.has('code') && !p.has('error')) return null;
      history.replaceState(null, '', location.pathname + (/[?&]demo/.test(location.search) ? '?demo' : '') + location.hash);
      if (p.get('error')) throw errorAlertas('ACCESO', 'Genesys no permitió la entrada: ' + (p.get('error_description') || p.get('error')));
      let guardado = null;
      try { guardado = JSON.parse(sessionStorage.getItem('alertas-pkce') || 'null'); sessionStorage.removeItem('alertas-pkce'); } catch (e) { guardado = null; }
      if (!guardado || guardado.estado !== p.get('state')) throw errorAlertas('ACCESO', 'La respuesta de Genesys no corresponde a esta pestaña. Entra de nuevo.');
      let r;
      try {
        r = await fetch(baseLogin() + '/oauth/token', {
          method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code'), code_verifier: guardado.verificador, client_id: cfg.genesys.clientId, redirect_uri: retorno() })
        });
      } catch (e) { throw errorAlertas('RED', 'No se pudo completar la entrada con Genesys. Revisa tu internet.'); }
      if (!r.ok) throw errorAlertas('ACCESO', 'Genesys no entregó la sesión (' + r.status + '). Entra de nuevo.');
      const tok = await r.json();
      return guardar(await llamar('login', { tipo: 'genesys', accessToken: tok.access_token }));
    },
    async conClave(d) { return guardar(await llamar('login', Object.assign({ tipo: 'clave' }, d))); },
    salir() { ses = null; guardarSesionEn(CLAVE, null); },

    cargar: (baseVersion) => llamar('cargar', { baseVersion }),
    estado: () => llamar('estado', {}, 20000),
    async buscar(q) {
      const r = await llamar('buscar', { q });
      return Object.assign({}, r, { filas: r.filas.map(Model.registroRemoto) });
    },
    reportar: (rec) => llamar('reportar', { contrato: rec.contrato, nodo: rec.nodo }),
    falla: (op, d) => llamar('falla', Object.assign({ op }, d), 60000),
    alertas: () => llamar('alertas', {}),
    estadisticas: (d) => llamar('estadisticas', d, 120000),
    telefonos: (d) => llamar('telefonos', d, 120000),

    /* Primero intenta subir solo lo que cambió. Va completa si la base interna todavía no tiene huella
       (la primera vez), si cambiaron las columnas, si hay demasiados cambios o filas vacías, o si el
       servidor dice que la base no coincide con lo que se comparó (COMPLETA). */
    async subirBase(base, catalogoJson, alProgreso) {
      for (let intento = 0; intento < 2; intento++) {
        try {
          const r = await subirCambios(base, catalogoJson, alProgreso);
          if (r) return r;
          break;
        } catch (e) {
          if (e.codigo === 'COMPLETA') break;
          // Si se cortó a medias, repetir es seguro: la comparación nueva ve lo que ya quedó guardado
          if (intento === 0 && /RED|SERVIDOR/.test(e.codigo)) { await esperar(2500); continue; }
          throw e;
        }
      }
      return subirCompleta(base, catalogoJson, alProgreso);
    }
  };

  async function subirCambios(base, catalogoJson, alProgreso) {
    alProgreso({ fase: 'comparando' });
    const hz = await llamar('base', { op: 'huella' }, 120000);
    const columnas = Model.columnasCarga(base);
    if (!hz || hz.huellas == null || (hz.columnas || []).join('|') !== columnas.join('|')) return null;
    const viejas = hz.huellas ? hz.huellas.split(',') : [];
    await esperar(20);
    const plan = Model.planCambios(viejas, base.filas, (d, h) => Model.filasCarga(base, d, h), MAX_CAMBIOS);
    if (!plan) return null;
    // Las filas que salen quedan vacías; cuando ya son muchas, la carga completa ordena la base de nuevo
    if (hz.vacias + plan.quitar.length > 0.08 * (viejas.length + plan.agregar.length)) return null;
    alProgreso({ fase: 'cambios', agregar: plan.agregar.length, quitar: plan.quitar.length });
    return llamar('base', {
      op: 'cambios', baseVersion: hz.baseVersion, columnas, archivo: base.archivo, total: base.filas,
      quitar: plan.quitar, esperadas: plan.esperadas, agregar: plan.agregar, catalogo: catalogoJson
    }, 330000);
  }

  async function subirCompleta(base, catalogoJson, alProgreso) {
    const ini = await llamar('base', { op: 'iniciar', total: base.filas, columnas: Model.columnasCarga(base), archivo: base.archivo }, 120000);
    try {
      for (let d = 0; d < base.filas; d += ini.filasPorLote) {
        const filas = Model.filasCarga(base, d, Math.min(base.filas, d + ini.filasPorLote));
        for (let intento = 0; ; intento++) {
          try { await llamar('base', { op: 'lote', id: ini.id, desde: d, filas }, 180000); break; } catch (e) {
            if (intento >= 2 || !/RED|SERVIDOR/.test(e.codigo)) throw e;
            await esperar(2500 * (intento + 1));
          }
        }
        alProgreso({ fase: 'subiendo', hechas: Math.min(base.filas, d + ini.filasPorLote), total: base.filas });
      }
      alProgreso({ fase: 'guardando' });
      return await llamar('base', { op: 'finalizar', id: ini.id, catalogo: catalogoJson }, 330000);
    } catch (e) {
      llamar('base', { op: 'cancelar', id: ini.id }).catch(() => {});
      throw e;
    }
  }
}

/* ==========================================================================
   Local (demostración en este navegador)
   ========================================================================== */
function BackendLocal() {
  const CLAVE = 'alertas-sesion-demo';
  let ses = sesionGuardada(CLAVE);
  let cache = { bv: -1, ix: null, cat: null, catJson: null };

  async function indice() {
    const meta = await Store.leerMeta();
    if (cache.bv !== (meta.baseVersion || 0) || !cache.ix) {
      const d = await Store.leerTodo();
      const ix = d.base ? Model.indexar(d.base) : null;
      const catJson = ix ? Model.catalogo(ix) : null;
      cache = { bv: meta.baseVersion || 0, ix, catJson, cat: catJson ? Model.cargarCatalogo(catJson) : null, base: d.base };
    }
    return cache;
  }
  const quien = () => ({ u: ses.usuario.u, nombre: ses.usuario.nombre });
  async function confirmar(tipo, texto, cambios) {
    const m = await Store.confirmar({ tipo, texto, por: quien() }, cambios);
    return m.version;
  }
  async function log(entrada) {
    const u = ses.usuario;
    await Store.agregarLog(Object.assign({ t: Date.now(), u: u.u, un: u.nombre, canal: u.acceso, tienda: u.tienda || '', tipo: 'consulta' }, entrada));
  }

  return {
    modo: 'local',
    async iniciar() { const r = await Store.init(); return { demo: true, persistente: r.persistente }; },
    usuario() { return ses ? ses.usuario : null; },
    alExpirar() {},
    async genesysVolver() { return null; },
    async entrarDemo({ rol, nombre, tienda }) {
      const usuario = { u: U.sinAcentos(nombre).toLowerCase().replace(/\s+/g, '.'), nombre, rol, acceso: CONFIG.roles[rol].corto, tienda: rol === 'tiendas' ? (tienda || '') : '', origen: 'demo' };
      ses = { usuario, expira: Date.now() + 12 * U.HORA };
      guardarSesionEn(CLAVE, ses);
      return usuario;
    },
    salir() { ses = null; guardarSesionEn(CLAVE, null); },

    async cargar(baseVersion) {
      const c = await indice();
      const d = await Store.leerTodo({ sinBase: true });
      const ultima = d.baseHist[d.baseHist.length - 1];
      const resumen = c.ix ? Object.assign({}, c.ix.resumen, { archivo: c.base.archivo, tieneMegas: c.base.tieneMegas, en: ultima && ultima.en, por: ultima && ultima.por }) : null;
      const r = { version: d.meta.version || 0, baseVersion: c.bv, cambio: d.meta.cambio || null, demo: !!d.meta.demo, resumen, fallas: d.fallas, cargas: d.baseHist };
      if (baseVersion !== c.bv) r.catalogo = c.catJson;
      return r;
    },
    async estado() { const m = await Store.leerMeta(); return { version: m.version || 0, baseVersion: m.baseVersion || 0, cambio: m.cambio || null }; },

    async buscar(q) {
      const c = await indice();
      if (!c.ix) return { estado: 'no', tipo: Model.tipoConsulta(q).tipo, q, filas: [], fallas: [] };
      const r = Model.buscar(c.ix, q);
      if (r.estado === 'incompleto' || r.estado === 'vacio') throw errorAlertas('DATOS', 'Escribe un contrato (6 a 8 dígitos) o un DNI (13 dígitos).');
      const filas = (r.filas || []).map((i) => Model.registro(c.ix, i));
      const fallas = await Store.leerFallas();
      const mf = Model.mapaFallas(fallas, Date.now());
      const rel = mf.visibles.filter((f) => filas.some((x) => f.nodos.includes(x.nodo)));
      const veredictos = filas.map((x) => ({ x, v: Model.veredictoNodo(mf, x.nodo) }));
      const p = veredictos.sort((a, b) => Model.PRIORIDAD[a.v.tipo] - Model.PRIORIDAD[b.v.tipo])[0];
      await log({ q: r.tipo, c: p ? p.x.contrato : null, n: p ? p.x.nodo : '', tec: p ? p.x.tecnologia : '', dep: p ? p.x.departamento : '', r: p ? p.v.tipo : 'NO_ENCONTRADO', f: p && p.v.falla ? p.v.falla.id : null });
      return { estado: filas.length ? 'ok' : 'no', tipo: r.tipo, q: r.q, filas, fallas: rel };
    },
    async reportar(rec) {
      await log({ tipo: 'reporte', q: 'contrato', c: rec.contrato, n: rec.nodo, tec: rec.tecnologia, dep: rec.departamento, r: 'SIN_FALLA', f: null });
      return { listo: true };
    },

    async falla(op, d) {
      const c = await indice();
      const fallas = await Store.leerFallas();
      const ahora = Date.now();
      const por = quien();
      const resumir = (imp) => ({ total: imp.total, hfc: imp.hfc, gpon: imp.gpon, corp: imp.corp, deps: imp.deps.slice(0, 8), munis: imp.munis.slice(0, 8) });
      let f, tipo, texto;
      if (op === 'publicar') {
        const x = d.falla;
        f = {
          id: Model.nuevoId(fallas, ahora), nodos: x.nodos.slice(), motivo: x.motivo, motivoTexto: x.motivoTexto || '', clienteTexto: x.clienteTexto || '',
          detalle: x.detalle || '', referencia: x.referencia || '', inicio: x.inicio || ahora, eta: x.eta || null, estado: 'ACTIVA',
          publicadaEn: ahora, publicadaPor: por, cerradaEn: null, cerradaPor: null, notaCierre: '', impacto: resumir(Model.impacto(c.cat, x.nodos)),
          historial: [{ accion: 'PUBLICADA', en: ahora, por, detalle: U.plural(x.nodos.length, '1 nodo', x.nodos.length + ' nodos') }]
        };
        fallas.push(f);
        tipo = 'FALLA_PUBLICADA'; texto = 'publicó la falla ' + f.id + ' (' + nombreMotivo(f) + ' en ' + U.listaNatural(f.nodos, 2) + ')';
      } else {
        f = fallas.find((x) => x.id === d.id);
        if (!f) throw errorAlertas('DATOS', 'La falla ya no existe.');
        if (op === 'editar') {
          Object.assign(f, d.falla);
          if (d.falla.nodos) f.impacto = resumir(Model.impacto(c.cat, f.nodos));
          f.historial.push({ accion: 'EDITADA', en: ahora, por, detalle: d.detalle || '' });
          tipo = 'FALLA_EDITADA'; texto = 'actualizó la falla ' + f.id + (d.detalle ? ' (' + d.detalle + ')' : '');
        } else if (op === 'cerrar') {
          if (f.estado === 'CERRADA') throw errorAlertas('DATOS', 'Otra persona ya cerró esta falla.');
          Object.assign(f, { estado: 'CERRADA', cerradaEn: Math.max(f.inicio, Math.min(d.cerradaEn || ahora, ahora)), cerradaPor: por, notaCierre: d.nota || '' });
          f.historial.push({ accion: 'CERRADA', en: ahora, por, detalle: d.nota || '' });
          tipo = 'FALLA_CERRADA'; texto = 'cerró la falla ' + f.id + ' (' + nombreMotivo(f) + ')';
        } else if (op === 'reabrir') {
          Object.assign(f, { estado: 'ACTIVA', cerradaEn: null, cerradaPor: null, notaCierre: '' });
          f.historial.push({ accion: 'REABIERTA', en: ahora, por, detalle: '' });
          tipo = 'FALLA_REABIERTA'; texto = 'reabrió la falla ' + f.id;
        }
      }
      const version = await confirmar(tipo, texto, { fallas });
      return { falla: f, version };
    },

    async alertas() {
      const fallas = await Store.leerFallas();
      const logs = await Store.leerLogs(Date.now() - CONFIG.alerta.minutos * U.MIN);
      const lista = Model.alertas(logs, Model.mapaFallas(fallas, Date.now()), Date.now(), {})
        .map((a) => ({ nodo: a.nodo, nClientes: a.nClientes, reportes: a.reportes, consultas: a.consultas, primero: a.primero, ultimo: a.ultimo }));
      return { alertas: lista, ahora: Date.now() };
    },

    async telefonos() {
      throw errorAlertas('DEMO', 'En la demostración no hay teléfonos de clientes. Esta descarga funciona con la base real.');
    },

    async estadisticas({ desde, porHora }) {
      const c = await indice();
      const logs = await Store.leerLogs(desde);
      const r = { consultas: 0, conFalla: 0, clientesUnicos: 0, reportes: 0, serie: new Map(), tecConsultas: { HFC: 0, GPON: 0 }, canales: {}, asesores: new Map(), top: new Map() };
      const unicos = new Set();
      const clave = (t) => (porHora ? String(new Date(t).getHours()) : new Date(U.inicioDia(t) + 12 * U.HORA).toISOString().slice(0, 10));
      for (const l of logs) {
        if (l.tipo === 'reporte') { r.reportes++; continue; }
        const falla = l.r === 'FALLA';
        r.consultas++; if (falla) r.conFalla++;
        if (l.c) unicos.add(l.c);
        const k = clave(l.t), s = r.serie.get(k) || { falla: 0, otras: 0 };
        if (falla) s.falla++; else s.otras++;
        r.serie.set(k, s);
        if (falla && r.tecConsultas[l.tec] != null) r.tecConsultas[l.tec]++;
        r.canales[l.canal] = (r.canales[l.canal] || 0) + 1;
        const a = r.asesores.get(l.u) || { u: l.u, nombre: l.un || l.u, canal: l.canal + (l.tienda ? ': ' + l.tienda : ''), n: 0, falla: 0, noEnc: 0 };
        a.n++; if (falla) a.falla++; if (l.r === 'NO_ENCONTRADO') a.noEnc++;
        r.asesores.set(l.u, a);
        if (falla && l.c) r.top.set(l.c, (r.top.get(l.c) || 0) + 1);
      }
      const top = [...r.top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([contrato, consultas]) => {
        const b = c.ix ? Model.buscar(c.ix, String(contrato)) : null;
        const rec = b && b.filas && b.filas.length ? Model.registro(c.ix, b.filas[0]) : null;
        return { contrato: String(contrato), consultas, nombre: rec ? rec.nombre : '', nodo: rec ? rec.nodo : '', categoria: rec ? rec.categoria : '' };
      });
      return {
        consultas: r.consultas, conFalla: r.conFalla, clientesUnicos: unicos.size, reportes: r.reportes,
        serie: [...r.serie.entries()].sort().map(([k, v]) => ({ k, falla: v.falla, otras: v.otras })),
        tecConsultas: r.tecConsultas, canales: r.canales, asesores: [...r.asesores.values()].sort((a, b) => b.n - a.n), topContratos: top, desde, ahora: Date.now()
      };
    },

    async subirBase(base, catalogoJson, alProgreso) {
      const c = await indice();
      const meta = await Store.leerMeta();
      alProgreso({ fase: 'guardando' });
      const comparacion = c.ix && !meta.demo ? Model.comparar(c.ix, base) : null;
      const ix = Model.indexar(base);
      const d = await Store.leerTodo({ sinBase: true });
      const entrada = {
        en: Date.now(), por: quien(), archivo: base.archivo, filas: base.filas, hfc: ix.resumen.hfc, gpon: ix.resumen.gpon, nodos: ix.resumen.nodos,
        nuevos: comparacion ? comparacion.nuevos : null, bajas: comparacion ? comparacion.bajas : null, cambiosNodo: comparacion ? comparacion.cambiosNodo : null
      };
      const cambios = { base, baseHist: (meta.demo ? [] : d.baseHist).concat(entrada).slice(-60), meta: { baseVersion: (meta.baseVersion || 0) + 1, demo: false } };
      if (meta.demo) { cambios.fallas = []; await Store.borrarLogs(); }
      const version = await confirmar('BASE_ACTUALIZADA', 'actualizó la base de clientes (' + U.n(base.filas) + ' servicios)', cambios);
      return { comparacion, version };
    },

    /* Solo en demostración */
    async cargarDemo() {
      const now = Date.now();
      const { base, nodos } = Demo.generar(now);
      const ix = Model.indexar(base);
      const esc = Demo.escenario(ix, Model.cargarCatalogo(Model.catalogo(ix)), nodos, now);
      const meta = await Store.leerMeta();
      await Store.borrarLogs();
      await Store.agregarLogs(esc.logs);
      await Store.confirmar({ tipo: 'DEMO', texto: 'cargó los datos de demostración', por: ses ? quien() : { u: 'demo', nombre: 'Alertas' } },
        { base, baseHist: esc.baseHist, fallas: esc.fallas, meta: { demo: true, baseVersion: (meta.baseVersion || 0) + 1 } });
    },
    async borrarTodo() {
      const meta = await Store.leerMeta();
      await Store.borrarTodo();
      await Store.confirmar({ tipo: 'BORRADO', texto: 'vació los datos de esta PC', por: quien() }, { meta: { demo: false, baseVersion: (meta.baseVersion || 0) + 1 } });
    }
  };
}

const Backend = MODO_DEMO ? BackendLocal() : BackendRemoto();
