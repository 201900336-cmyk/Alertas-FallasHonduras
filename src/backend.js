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
  const REINTENTABLES = { config: 1, estado: 1, cargar: 1, buscar: 1, alertas: 1, alerta: 1, estadisticas: 1, contactos: 1 };
  async function llamar(accion, datos, espera) {
    for (let intento = 0; ; intento++) {
      try { return await llamarUnaVez(accion, datos, espera); } catch (e) {
        const lectura = REINTENTABLES[accion] || (accion === 'sms' && datos && datos.op === 'resumen');
        if (!lectura || !e.reintentar || intento >= 2) throw e;
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
    /* Toda acción responde con datos. Sin datos es la respuesta de "el servidor está funcionando" (doGet):
       a veces la solicitud termina abierta como una visita normal a la dirección y no trae lo que se pidió.
       Las consultas se repiten solas; si era un cambio, se avisa para revisar si se guardó. */
    if (!('datos' in j) || j.datos == null) {
      const repetir = REINTENTABLES[accion] || accion === 'login';
      throw Object.assign(errorAlertas('SERVIDOR', repetir ? 'El servidor no devolvió la respuesta. Intenta de nuevo.'
        : 'No llegó la respuesta del servidor. Actualiza la página para revisar si el cambio se guardó.'), { reintentar: true });
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
      if (!r || !Array.isArray(r.filas)) throw errorAlertas('SERVIDOR', 'La respuesta del servidor llegó incompleta. Intenta de nuevo.');
      return Object.assign({}, r, { filas: r.filas.map(Model.registroRemoto) });
    },
    reportar: (rec) => llamar('reportar', { contrato: rec.contrato, nodo: rec.nodo }),
    falla: (op, d) => llamar('falla', Object.assign({ op }, d), 60000),
    alertas: () => llamar('alertas', {}),
    alertaDetalle: (nodo) => llamar('alerta', { op: 'detalle', nodo }, 60000),
    marcarAlerta: (nodo, reportada) => llamar('alerta', { op: reportada ? 'reportada' : 'quitar', nodo }),
    estadisticas: (d) => llamar('estadisticas', d, 120000),
    telefonos: (d) => llamar('telefonos', d, 120000),
    contactos: (d) => llamar('contactos', d, 30000),
    sms: (d) => llamar('sms', d, d.op === 'lote' ? 200000 : 120000),

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
  const smsDemo = { envios: new Map(), estados: new Map(), control: new Map() };   // control: falla|aviso|huella → números de control que ya lo tienen
  const CONTROL_DEMO = ['C1', 'C2', 'C3', 'C4'];   // en la demostración, 4 "números de control" del equipo   // envíos en curso por falla; estado de cada contrato por falla y aviso
  /* Posibles fallas marcadas como reportadas (en la demostración, solo en esta PC); duran 6 horas */
  const marcasDemo = () => {
    const m = leerLS('alertas-demo-reportadas', {}), corte = Date.now() - 6 * U.HORA;
    Object.keys(m).forEach((k) => { if (!(m[k] && m[k].en > corte)) delete m[k]; });
    return m;
  };
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
      const historial = Model.historialNodos(fallas, filas.map((x) => x.nodo), ['workforce', 'jefatura'].includes(ses.usuario.rol), Date.now());
      return { estado: filas.length ? 'ok' : 'no', tipo: r.tipo, q: r.q, filas, fallas: rel, historial };
    },
    /* Consultas anteriores del contrato (la bitácora local guarda 30 días), igual que en el servidor */
    async contactos({ contrato }) {
      const ahora = Date.now();
      const l = (await Store.leerLogs(ahora - 30 * U.DIA)).filter((x) => String(x.c) === String(contrato)).sort((a, b) => b.t - a.t);
      const actual = l.length && ahora - l[0].t < 120000 ? 1 : 0;
      const antes = l.slice(actual);
      return { n7: antes.filter((x) => ahora - x.t <= 7 * U.DIA).length, n30: antes.length, anterior: antes.length ? antes[0].t : null,
        veces: l.slice(0, 25).filter((x) => !Model.esInterno(x.canal)).map((x) => x.t) };
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
          detalle: x.detalle || '', referencia: x.referencia || '', numero: x.numero || '', inicio: x.inicio || ahora, eta: x.eta || null, estado: 'ACTIVA',
          publicadaEn: ahora, publicadaPor: por, cerradaEn: null, cerradaPor: null, notaCierre: '', impacto: resumir(Model.impacto(c.cat, x.nodos)),
          historial: [{ accion: 'PUBLICADA', en: ahora, por, detalle: U.plural(x.nodos.length, '1 nodo', x.nodos.length + ' nodos') }]
        };
        f.deteccion = Model.deteccion(await Store.leerLogs(ahora - 4 * U.HORA), f.nodos, ahora);
        fallas.push(f);
        tipo = 'FALLA_PUBLICADA'; texto = 'publicó la falla ' + U.numeroFalla(f) + ' (' + nombreMotivo(f) + ' en ' + U.listaNatural(f.nodos, 2) + ')';
      } else {
        f = fallas.find((x) => x.id === d.id);
        if (!f) throw errorAlertas('DATOS', 'La falla ya no existe.');
        if (op === 'editar') {
          Object.assign(f, d.falla);
          if (d.falla.nodos) f.impacto = resumir(Model.impacto(c.cat, f.nodos));
          f.historial.push({ accion: 'EDITADA', en: ahora, por, detalle: d.detalle || '' });
          tipo = 'FALLA_EDITADA'; texto = 'actualizó la falla ' + U.numeroFalla(f) + (d.detalle ? ' (' + d.detalle + ')' : '');
        } else if (op === 'cerrar') {
          if (f.estado === 'CERRADA') throw errorAlertas('DATOS', 'Otra persona ya cerró esta falla.');
          Object.assign(f, { estado: 'CERRADA', cerradaEn: Math.max(f.inicio, Math.min(d.cerradaEn || ahora, ahora)), cerradaPor: por, notaCierre: d.nota || '' });
          f.historial.push({ accion: 'CERRADA', en: ahora, por, detalle: d.nota || '' });
          tipo = 'FALLA_CERRADA'; texto = 'cerró la falla ' + U.numeroFalla(f) + ' (' + nombreMotivo(f) + ')';
        } else if (op === 'reabrir') {
          Object.assign(f, { estado: 'ACTIVA', cerradaEn: null, cerradaPor: null, notaCierre: '' });
          f.historial.push({ accion: 'REABIERTA', en: ahora, por, detalle: '' });
          tipo = 'FALLA_REABIERTA'; texto = 'reabrió la falla ' + U.numeroFalla(f);
        }
      }
      const version = await confirmar(tipo, texto, { fallas });
      return { falla: f, version };
    },

    async alertas() {
      const fallas = await Store.leerFallas();
      const logs = await Store.leerLogs(Date.now() - CONFIG.alerta.minutos * U.MIN);
      const marcas = marcasDemo();
      const lista = Model.alertas(logs, Model.mapaFallas(fallas, Date.now()), Date.now(), {}, Model.cierresPorNodo(fallas))
        .map((a) => Object.assign({ nodo: a.nodo, nivel: a.nivel, nClientes: a.nClientes, reportes: a.reportes, consultas: a.consultas, primero: a.primero, ultimo: a.ultimo },
          marcas[a.nodo] ? { reportada: marcas[a.nodo] } : {}));
      const um = CONFIG.alerta;
      return { alertas: lista, ahora: Date.now(), umbral: { minutos: um.minutos, clientes: um.clientesDistintos, observar: um.observar, reportes: um.reportes } };
    },
    /* Los clientes de una posible falla con sus datos de la base, igual que el servidor */
    async alertaDetalle(nodo) {
      const c = await indice();
      const ahora = Date.now();
      const fallas = await Store.leerFallas();
      // Solo lo que llegó después de cerrar la última falla del nodo (resuelta o descartada)
      const cierre = Model.cierresPorNodo(fallas).get(nodo) || 0;
      const logs = (await Store.leerLogs(ahora - CONFIG.alerta.minutos * U.MIN))
        .filter((l) => l.n === nodo && l.t > cierre && l.r !== 'FALLA' && l.r !== 'NO_ENCONTRADO' && !Model.esInterno(l.canal))
        .sort((a, b) => a.t - b.t);
      const por = new Map();
      let reportes = 0;
      for (const l of logs) {
        if (l.tipo === 'reporte') reportes++;
        if (!l.c) continue;
        const k = String(l.c);
        const x = por.get(k) || { contrato: k, primera: l.t, ultima: l.t, veces: 0, canales: [], reporte: false };
        x.veces++; x.ultima = Math.max(x.ultima, l.t);
        const canal = l.canal === 'Tiendas' ? 'Tiendas' + (l.tienda ? ': ' + l.tienda : '') : l.canal;
        if (!x.canales.includes(canal)) x.canales.push(canal);
        if (l.tipo === 'reporte') x.reporte = true;
        por.set(k, x);
      }
      const clientes = [...por.values()].slice(0, 60).map((x) => {
        const r = c.ix ? Model.buscar(c.ix, x.contrato) : null;
        const regs = r && r.filas ? r.filas.map((i) => Model.registro(c.ix, i)) : [];
        const b = regs.find((y) => y.nodo === nodo) || regs[0];
        return Object.assign({}, x, {
          enBase: !!b, nombre: b ? b.nombre : '', nodo: b ? b.nodo : nodo, tecnologia: b ? b.tecnologia : '', olt: b ? b.olt : '', nap: b ? b.nap : '',
          colonia: b ? b.colonia : '', municipio: b ? b.municipio : '', departamento: b ? b.departamento : '', categoria: b ? b.categoria : ''
        });
      });
      const mf = Model.mapaFallas(fallas, ahora);
      return {
        nodo, ahora, minutos: CONFIG.alerta.minutos, nClientes: por.size, reportes, consultas: logs.length,
        desde: logs.length ? logs[0].t : null, hasta: logs.length ? logs[logs.length - 1].t : null, clientes,
        reportada: marcasDemo()[nodo] || null, enFalla: (mf.porNodo.get(nodo) || []).some((f) => f.estado === 'ACTIVA')
      };
    },
    async marcarAlerta(nodo, reportada) {
      const m = marcasDemo();
      if (reportada) m[nodo] = { por: ses.usuario.nombre, en: Date.now() }; else delete m[nodo];
      guardarLS('alertas-demo-reportadas', m);
      return { nodo, reportada: m[nodo] || null };
    },

    async telefonos() {
      throw errorAlertas('DEMO', 'En la demostración no hay teléfonos de clientes. Esta descarga funciona con la base real.');
    },

    /* SMS en la demostración: no sale ningún SMS. Se simula con los clientes de la base ficticia (la
       mayoría con celular; algunos solo con fijo o sin teléfono), unos pocos números que fallan y otros
       que quedan en duda, con el mismo protocolo que el servidor (iniciar, lote con paso, terminar). */
    async sms(d) {
      const fallas = await Store.leerFallas();
      const f = fallas.find((x) => x.id === d.id);
      if (!f) throw errorAlertas('DATOS', 'La falla ya no existe.');
      const tipo = f.estado === 'ACTIVA' ? 'FALLA' : 'RESTABLECIDO';
      const clave = f.id + '|' + tipo;
      const estados = smsDemo.estados.get(clave) || new Map();      // contrato → último estado
      smsDemo.estados.set(clave, estados);
      const avance = (m) => ({ envio: m.envio, pasos: m.pasos, siguiente: m.siguiente, total: m.total, enviados: m.enviados, errores: m.errores, dudosos: m.dudosos, error: m.error,
        control: m.ctrl || 0, cEnviados: m.cEnv || 0, cErrores: 0, cDudosos: 0 });
      const controlDe = (h) => { const k = clave + '|' + h; if (!smsDemo.control.has(k)) smsDemo.control.set(k, new Set()); return smsDemo.control.get(k); };
      const cerrar = async (m, nota) => {
        m.lista.slice(m.siguiente).forEach((k) => { if (estados.get(k) === 'Pendiente') estados.set(k, 'Cancelado'); });
        smsDemo.envios.delete(m.falla);
        if (!(m.enviados || m.errores || m.dudosos || m.cEnv)) return null;
        const ahora = Date.now();
        const extra = [m.errores ? m.errores + ' con error' : '', m.dudosos ? m.dudosos + ' en duda' : ''].filter(Boolean);
        f.sms = (f.sms || []).concat([{ tipo: m.tipo, enviados: m.enviados, errores: m.errores, dudosos: m.dudosos, total: m.total - m.ctrl, control: m.cEnv, por: m.por.nombre, en: ahora }]);
        f.historial.push({ accion: 'SMS', en: ahora, por: m.por, detalle: (m.tipo === 'RESTABLECIDO' ? 'Servicio restablecido' : 'Aviso de falla') + ' a ' + m.enviados
          + (m.enviados === 1 ? ' cliente' : ' clientes') + (extra.length ? ' (' + extra.join(', ') + ')' : '')
          + (m.ctrl ? ' y a ' + m.cEnv + ' números de control' : '') + (nota ? '; ' + nota : '') });
        await Store.guardarFallas(fallas);
        return f;
      };
      const m = smsDemo.envios.get(f.id);
      if (d.op === 'resumen' || d.op === 'iniciar') {
        const c = await indice();
        const contratos = [...new Set(Model.filasDeNodos(c.ix, f.nodos).map((i) => String(Model.registro(c.ix, i).contrato)))];
        const tel = (k) => (Number(k) % 17 ? 'cel' : Number(k) % 2 ? 'fijo' : '');
        const cel = contratos.filter((k) => tel(k) === 'cel');
        let ya = 0, enDuda = 0;
        cel.forEach((k) => { const e = estados.get(k); if (e === 'Enviado') ya++; else if (e === 'Dudoso') enDuda++; });
        if (d.op === 'resumen') {
          const hechos = {};
          smsDemo.control.forEach((v, k) => { if (k.indexOf(clave + '|') === 0) hechos[k.slice(clave.length + 1)] = v.size; });
          return { configurado: true, demo: true, tipo, puede: tipo === 'FALLA' || !Model.descartada(f), clientes: contratos.length, celulares: cel.length, conCelular: cel.length,
            soloFijo: contratos.filter((k) => tel(k) === 'fijo').length, sinTelefono: contratos.filter((k) => !tel(k)).length,
            ya, enDuda, faltan: cel.length - ya - enDuda, quedanHoy: 15000, envios: f.sms || [], control: CONTROL_DEMO.length, controlHechos: hechos,
            enCurso: m ? { por: m.por.nombre, mio: true, tipo: m.tipo, mensaje: m.mensaje, total: m.total, siguiente: m.siguiente, enviados: m.enviados,
              control: m.ctrl, cHechos: m.cEnv, libre: false } : null };
        }
        if (d.tipo != null && d.tipo !== tipo) throw errorAlertas('DATOS', tipo === 'FALLA' ? 'La falla sigue activa: el aviso que corresponde es el de falla.' : 'La falla ya se cerró: el aviso que corresponde es el de servicio restablecido.');
        if (tipo === 'RESTABLECIDO' && Model.descartada(f)) throw errorAlertas('DATOS', 'La posible falla se descartó: no hay servicio restablecido que avisar.');
        const mensaje = String(d.mensaje || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
        if (!mensaje) throw errorAlertas('DATOS', 'Escribe el mensaje.');
        if (mensaje.length > 459) throw errorAlertas('DATOS', 'El mensaje es muy largo: máximo 459 caracteres.');
        if (m && m.tipo === tipo && m.mensaje === mensaje && d.dudosos !== true) return Object.assign(avance(m), { reanudado: true });
        if (m) await cerrar(m, 'se detuvo antes de terminar');
        const lista = cel.filter((k) => !['Enviado', 'Dudoso', 'Pendiente'].includes(estados.get(k)) || (d.dudosos === true && estados.get(k) === 'Dudoso'));
        const extra = { ya, enDuda, quedanHoy: 15000, paraManana: 0 };
        if (!lista.length) return Object.assign({ envio: '', pasos: 0, siguiente: 0, total: 0, enviados: 0, errores: 0, dudosos: 0, error: '', control: 0 }, extra);
        lista.forEach((k) => estados.set(k, 'Pendiente'));
        const huella = U.hashSms(mensaje), yaC = controlDe(huella);
        const ctrl = CONTROL_DEMO.filter((k) => !yaC.has(k));            // los de control van primero, una vez por mensaje
        const nuevo = { envio: 'S' + Date.now().toString(36).toUpperCase(), falla: f.id, tipo, mensaje, huella, lista: ctrl.concat(lista), total: ctrl.length + lista.length,
          ctrl: ctrl.length, cEnv: 0, siguiente: 0, pasos: 0, enviados: 0, errores: 0, dudosos: 0, error: '', por: quien(), conDuda: d.dudosos === true };
        smsDemo.envios.set(f.id, nuevo);
        return Object.assign(avance(nuevo), extra);
      }
      if (!m || m.envio !== d.envio) {
        if (d.op === 'terminar') return { terminado: true, falla: null };
        throw errorAlertas('DATOS', 'Este envío ya terminó o lo reemplazó otro. Abre otra vez Enviar SMS: solo se manda a quienes falten.');
      }
      if (d.op === 'lote') {
        if (d.paso !== m.pasos || m.siguiente >= m.total) return avance(m);
        await esperar(350);
        m.lista.slice(m.siguiente, m.siguiente + 50).forEach((k) => {
          if (m.siguiente < m.ctrl) { m.cEnv++; controlDe(m.huella).add(k); }
          else if (Number(k) % 89 === 0) { m.errores++; estados.set(k, 'Error'); if (!m.error) m.error = 'Número no válido'; }
          else if (Number(k) % 97 === 0 && estados.get(k) !== 'Dudoso' && !m.conDuda) { m.dudosos++; estados.set(k, 'Dudoso'); }
          else { m.enviados++; estados.set(k, 'Enviado'); }
          m.siguiente++;
        });
        m.pasos++;
        return avance(m);
      }
      if (d.op === 'terminar') {
        const falla = await cerrar(m, m.siguiente < m.total ? 'se detuvo antes de terminar' : '');
        return Object.assign(avance(m), { terminado: true, falla });
      }
      throw errorAlertas('DATOS', 'Operación no válida.');
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
