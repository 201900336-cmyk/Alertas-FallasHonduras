/* ==========================================================================
   ALERTAS · Estado global, acciones y componentes base
   ========================================================================== */

const { html, render, useState, useEffect, useMemo, useRef, useCallback } = htmPreact;

/* ---------- Estado global sencillo ---------- */
const G = {
  s: {
    arranque: 'cargando', mensaje: 'Conectando con Alertas…', config: null, user: null, avisoAcceso: '',
    meta: { version: 0, baseVersion: -1, demo: false }, resumen: null, cat: null, fallas: [], cargas: [], alertas: [],
    now: Date.now(), remoto: null, ruta: 'consulta', tema: 'auto', tostadas: [], descartadas: {}, misConsultas: [],
    sinConexion: false, cargando: false,
    // Posibles fallas (Workforce): umbral del servidor, la que está abierta, las que llegaron y no se han visto,
    // y si los avisos de escritorio están permitidos y activados
    umbral: null, alertaAbierta: null, alertasNuevas: [], permisoAvisos: 'no', avisosEscritorio: false, semillaFalla: null,
    // La invitación a activar los avisos de escritorio se cerró con "Ahora no" (vuelve a los 7 días)
    ofertaCerrada: false
  },
  subs: new Set(),
  set(p) { Object.assign(this.s, typeof p === 'function' ? p(this.s) : p); this.subs.forEach((f) => f()); }
};
G.punteroAbajo = false;
document.addEventListener('pointerdown', () => { G.punteroAbajo = true; }, true);
document.addEventListener('pointerup', () => { setTimeout(() => { G.punteroAbajo = false; }, 0); }, true);
document.addEventListener('pointercancel', () => { G.punteroAbajo = false; }, true);

function useG() {
  const [, f] = useState(0);
  useEffect(() => { const fn = () => f((x) => x + 1); G.subs.add(fn); return () => G.subs.delete(fn); }, []);
  return G.s;
}
const leerLS = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };
const leerSS = (k, d) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const guardarSS = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };

function tostada(texto) {
  const id = U.uid();
  G.set((s) => ({ tostadas: s.tostadas.concat({ id, texto }) }));
  setTimeout(() => G.set((s) => ({ tostadas: s.tostadas.filter((t) => t.id !== id) })), 3200);
}

/* ---------- Acciones ---------- */
const A = {
  // Avisos de fallas publicadas: hasta qué versión ya se revisaron y las versiones que salieron de esta página
  pub: { visto: null, propias: new Set() },
  async arrancar() {
    G.set({ tema: leerLS('alertas-tema', 'auto'), descartadas: leerLS('alertas-descartadas', {}), misConsultas: leerSS('alertas-mis-consultas', []), ruta: rutaActual(),
      permisoAvisos: Avisos.permiso(), avisosEscritorio: Avisos.activos(), ofertaCerrada: Date.now() - (Number(leerLS('alertas-oferta-avisos', 0)) || 0) < 7 * U.DIA });
    aplicarTema(G.s.tema);
    Backend.alExpirar((msg) => { A.limpiar(); G.set({ avisoAcceso: msg || 'Tu sesión venció. Entra de nuevo.' }); });
    window.addEventListener('hashchange', () => G.set({ ruta: rutaActual() }));
    try {
      const config = await Backend.iniciar();
      G.set({ config });
      let user = null;
      try { user = await Backend.genesysVolver(); } catch (e) { G.set({ avisoAcceso: e.message }); }
      user = user || Backend.usuario();
      if (user) await A.entrar(user);
      G.set({ arranque: 'listo' });
    } catch (e) {
      console.error(e);
      G.set({ arranque: 'error', mensaje: e.message || String(e) });
    }
    setInterval(() => G.set({ now: Date.now() }), 30000);
    A.vigilar();
  },

  async entrar(user) {
    G.set({ user, avisoAcceso: '', cargando: true });
    if (!CONFIG.roles[user.rol].vistas.includes(G.s.ruta)) ir('consulta');
    try { await A.recargar(); } catch (e) { if (e.codigo !== 'SESION') tostada(e.message); }
    G.set({ cargando: false });
  },
  limpiar() {
    G.set({ user: null, cat: null, resumen: null, fallas: [], cargas: [], alertas: [], misConsultas: [], remoto: null, meta: { version: 0, baseVersion: -1, demo: false },
      alertaAbierta: null, alertasNuevas: [], semillaFalla: null });
    A.pub = { visto: null, propias: new Set() };
    guardarSS('alertas-mis-consultas', []);
  },
  salir() { Backend.salir(); A.limpiar(); },

  /* Trae fallas, resumen y (si cambió) el catálogo de nodos */
  async recargar() {
    const d = await Backend.cargar(G.s.cat ? G.s.meta.baseVersion : -1);
    const cambios = {
      meta: { version: d.version, baseVersion: d.baseVersion, demo: !!d.demo }, resumen: d.resumen || null, fallas: d.fallas || [],
      cargas: d.cargas || [], remoto: null, now: Date.now(), sinConexion: false
    };
    if (d.catalogo !== undefined) cambios.cat = d.catalogo ? Model.cargarCatalogo(d.catalogo) : null;
    if (A.pub.visto == null) A.pub.visto = d.version || 0;   // al entrar: lo que ya estaba publicado no se avisa
    G.set(cambios);
    if (veAlertas()) A.revisarAlertas();
  },
  async actualizar() {
    try { await A.recargar(); tostada('Listo, ya tienes la última versión'); } catch (e) { tostada(e.message); }
  },

  /* Revisa cada pocos segundos si Workforce cambió algo */
  vigilar() {
    // Cada página pregunta "¿hubo cambios?" cada minuto, en momentos distintos (para no llegar todas juntas
    // al servidor). Con la pestaña escondida solo pregunta si en esta PC están activados los avisos de
    // escritorio: así le llega el aviso de una falla nueva aunque Alertas esté minimizado.
    const cada = CONFIG.segundosRevision * 1000 * (Backend.modo === 'local' ? 0.2 : 1);
    let ocupado = false, ultimo = Date.now();
    const paso = async () => {
      if (ocupado || !G.s.user || (document.hidden && !Avisos.activos())) return;
      ocupado = true; ultimo = Date.now();
      try {
        const e = await Backend.estado();
        G.set({ sinConexion: false });
        if (e.version > G.s.meta.version && (!G.s.remoto || G.s.remoto.version < e.version)) G.set({ remoto: e });
        A.avisarPublicadas(e);
      } catch (err) { if (err.codigo === 'RED') G.set({ sinConexion: true }); }
      ocupado = false;
    };
    const programar = () => setTimeout(() => { paso().finally(programar); }, cada * (0.8 + Math.random() * 0.4));
    programar();
    // Al volver a la pestaña, revisa solo si ya pasó el intervalo
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimo > cada) paso(); });
    // Workforce revisa las posibles fallas cada minuto aunque la pestaña esté escondida o minimizada:
    // así llega el aviso de escritorio. Son pocas personas, no cargan al servidor.
    setInterval(() => { if (G.s.user && veAlertas()) A.revisarAlertas(); }, 60000);
  },
  /* Fallas que Workforce publicó (o reabrió) desde la última revisión: aviso de escritorio una vez por falla,
     a todos los que lo activaron, si Alertas no está a la vista (a la vista ya sale la barra de cambios).
     No avisa lo que publicó esta misma página, lo que ya estaba al entrar ni lo de hace más de 30 minutos. */
  avisarPublicadas(e) {
    if (A.pub.visto == null) return;   // todavía no termina de cargar al entrar
    const nuevas = (e.avisos || []).filter((x) => x && x.v > A.pub.visto);
    if (!nuevas.length) return;
    A.pub.visto = Math.max(...nuevas.map((x) => x.v));
    const ahora = e.ahora || Date.now();
    const lista = nuevas.filter((x) => !A.pub.propias.has(x.v) && ahora - x.en < 30 * U.MIN);
    if (lista.length && Avisos.activos() && (document.hidden || !document.hasFocus())) lista.slice(-3).forEach((x) => Avisos.falla(x));
  },
  // Al tocar el aviso de una falla nueva: la página trae las fallas al día y muestra la consulta (con sus fallas)
  verFallaNueva() { ir('consulta'); window.scrollTo({ top: 0 }); A.recargar().catch(() => {}); },
  async revisarAlertas() {
    let r;
    try { r = await Backend.alertas(); } catch (e) { return; /* se intenta de nuevo luego */ }
    G.set({ alertas: r.alertas || [], umbral: r.umbral || null });
    A.avisarPosiblesFallas();
  },
  /* Cada posible falla nueva se avisa una vez en esta PC (y otra vez si sigue después de 2 horas):
     barra en la página y, si están activados y Alertas no está a la vista, aviso de escritorio.
     Las que alguien ya reportó no se avisan. */
  avisarPosiblesFallas() {
    const s = G.s, ahora = Date.now();
    const { alertas } = posiblesFallas(s, Model.mapaFallas(s.fallas, ahora));
    const avisadas = leerLS('alertas-avisadas', {});
    Object.keys(avisadas).forEach((k) => { if (ahora - avisadas[k] > U.DIA) delete avisadas[k]; });
    const reaviso = (CONFIG.alerta.horasReaviso || 2) * U.HORA;
    const pendientes = alertas.filter(pendienteAlerta);
    const nuevas = pendientes.filter((a) => !(ahora - (avisadas[a.nodo] || 0) < reaviso));
    // A Workforce: cada vez que un supervisor les avisa de una posible falla, se avisa una vez (aunque ya la vieran)
    const deSupervisor = esWorkforce() ? pendientes.filter((a) => a.reportada && a.reportada.a === 'WF' && !avisadas['wf:' + a.nodo + ':' + a.reportada.en]) : [];
    const vigentes = new Set(pendientes.map((a) => a.nodo));
    let barra = s.alertasNuevas.filter((n) => vigentes.has(n));
    const enEscritorio = Avisos.activos() && (document.hidden || !document.hasFocus());
    if (nuevas.length) {
      nuevas.forEach((a) => { avisadas[a.nodo] = ahora; });
      barra = [...new Set(nuevas.map((a) => a.nodo).concat(barra))];
      if (enEscritorio) nuevas.slice(0, 3).forEach((a) => Avisos.mostrar(a));
    }
    if (deSupervisor.length) {
      deSupervisor.forEach((a) => { avisadas['wf:' + a.nodo + ':' + a.reportada.en] = ahora; avisadas[a.nodo] = ahora; });
      barra = [...new Set(deSupervisor.map((a) => a.nodo).concat(barra))];
      if (enEscritorio) deSupervisor.filter((a) => !nuevas.includes(a)).slice(0, 3).forEach((a) => Avisos.mostrar(a));
    }
    guardarLS('alertas-avisadas', avisadas);
    if (barra.join() !== s.alertasNuevas.join()) G.set({ alertasNuevas: barra });
  },
  abrirPosibleFalla(nodo) { G.set((s) => ({ alertaAbierta: nodo, alertasNuevas: s.alertasNuevas.filter((n) => n !== nodo) })); },
  async marcarReportada(nodo, si, tipo, nota) {
    const r = await Backend.marcarAlerta(nodo, si, tipo, nota);
    G.set((s) => ({
      alertas: s.alertas.map((a) => (a.nodo === nodo ? Object.assign({}, a, { reportada: r.reportada || null }) : a)),
      alertasNuevas: s.alertasNuevas.filter((n) => n !== nodo)
    }));
    return r;
  },
  // Desde una posible falla se publica como "Posible falla general" mientras el VOC la confirma; el inicio
  // de la afectación es la primera llamada de los clientes de ese nodo
  crearFallaCon(nodo) {
    const a = (G.s.alertas || []).find((x) => x.nodo === nodo);
    G.set({ alertaAbierta: null, semillaFalla: { nodos: [nodo], motivo: 'VALIDACION', inicio: a && a.primero ? a.primero : null, k: Date.now() } });
    ir('fallas'); window.scrollTo({ top: 0 });
  },

  /* Consulta del asesor (el servidor la registra en la bitácora) */
  buscar: (q) => Backend.buscar(q),
  anotar(x) {
    const lista = [x].concat(G.s.misConsultas.filter((y) => !(y.contrato === x.contrato && x.t - y.t < 60000))).slice(0, 30);
    G.set({ misConsultas: lista });
    guardarSS('alertas-mis-consultas', lista.map((y) => ({ t: y.t, contrato: y.contrato, nodo: y.nodo, r: y.r })));
  },
  reportar: (rec) => Backend.reportar(rec),

  /* ---- Workforce ---- */
  quien() { const u = G.s.user; return { u: u.u, nombre: u.nombre }; },
  async falla(op, datos) {
    const r = await Backend.falla(op, datos);
    A.pub.propias.add(r.version);
    const salto = r.version > G.s.meta.version + 1;
    G.set((s) => ({ fallas: s.fallas.filter((f) => f.id !== r.falla.id).concat(r.falla), meta: Object.assign({}, s.meta, { version: r.version }) }));
    if (salto) A.recargar().catch(() => {});
    return r.falla;
  },
  publicarFalla: (datos) => A.falla('publicar', { falla: datos }),
  /* Celulares de los clientes de una falla (o de todas las activas: id 'activas') para Notifícame:
     CSV delimitado por comas, encabezado "telefono" y un número por fila, con 504 adelante. */
  async telefonosSms(id) {
    const r = await Backend.telefonos({ id });
    if (r.telefonos.length) U.descargarTexto(r.archivo, 'telefono\r\n' + r.telefonos.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    return r;
  },
  /* SMS a los clientes de una falla con Notifícame. El servidor aparta a quienes les falta el aviso y
     anota cada número antes de mandarlo; la página pide grupo por grupo (hasta 50 SMS cada uno) con el
     número de paso. Si una respuesta se corta y la página repite el pedido, el servidor no vuelve a
     mandar ese grupo. Si es la misma persona con el mismo mensaje, "iniciar" sigue el envío sin terminar. */
  smsResumen: (id) => Backend.sms({ op: 'resumen', id }),
  async enviarSms(id, tipo, mensaje, alAvance, detenido, conDuda) {   // mensaje: clave del mensaje aprobado
    // Corte de red o servidor ocupado: se repite el mismo pedido (no duplica nada)
    const pedir = async (datos, veces) => {
      for (let k = 1; ; k++) {
        try { return await Backend.sms(datos); } catch (e) {
          if (!/^(RED|OCUPADO|SERVIDOR)$/.test(e.codigo) || k > veces) throw e;
          await esperar(Math.min(12000, 2000 * k));
        }
      }
    };
    // "aprobado": la clave del mensaje aprobado (el servidor pone el texto); dudosos: también a los que quedaron en duda
    const ini = await pedir({ op: 'iniciar', id, tipo, aprobado: mensaje, dudosos: !!conDuda }, 2);
    let av = Object.assign({ aviso: '' }, ini);
    if (!av.total) return Object.assign(av, { nada: true });
    alAvance(av);
    let error = null;
    while (av.siguiente < av.total && !detenido()) {
      try {
        const r = await pedir({ op: 'lote', id, envio: av.envio, paso: av.pasos }, 6);
        av = Object.assign({}, av, r, { aviso: r.aviso || '' });
        alAvance(av);
        // Notifícame pidió ir más despacio: se espera lo que dijo el servidor (se puede detener mientras tanto)
        for (const t = Date.now() + (Number(r.pausa) || 0) * 1000; Date.now() < t && !detenido();) await esperar(250);
      } catch (e) { error = e; break; }
    }
    let fin = null;
    try { fin = await pedir({ op: 'terminar', id, envio: av.envio }, 6); } catch (e) { if (!error) error = e; }
    if (fin && fin.falla) G.set((s) => ({ fallas: s.fallas.map((f) => (f.id === fin.falla.id ? fin.falla : f)) }));
    const res = Object.assign({}, av, fin && fin.envio ? fin : {}, { aviso: '', detenido: !error && av.siguiente < av.total });
    if (error) { error.avance = res; throw error; }
    return res;
  },
  editarFalla: (id, cambios, detalle) => A.falla('editar', { id, falla: cambios, detalle }),
  cerrarFalla: (id, cerradaEn, nota) => A.falla('cerrar', { id, cerradaEn, nota }),
  reabrirFalla: (id) => A.falla('reabrir', { id }),

  async subirBase(base, alProgreso) {
    alProgreso({ fase: 'preparando' });
    await new Promise((r) => setTimeout(r, 20));
    const catalogo = Model.catalogo(Model.indexar(base));
    const r = await Backend.subirBase(base, catalogo, alProgreso);
    G.set({ cat: null });
    await A.recargar();
    return r;
  },
  async cargarDemo() {
    G.set({ arranque: 'cargando', mensaje: 'Preparando datos de demostración…' });
    await new Promise((r) => setTimeout(r, 30));
    await Backend.cargarDemo();
    G.set({ cat: null });
    if (G.s.user) await A.recargar();
    G.set({ arranque: 'listo' });
  },
  async borrarTodo() { await Backend.borrarTodo(); G.set({ cat: null }); await A.recargar(); },

  descartarAlerta(nodo) {
    const d = Object.assign({}, G.s.descartadas, { [nodo]: Date.now() });
    guardarLS('alertas-descartadas', d); G.set((s) => ({ descartadas: d, alertasNuevas: s.alertasNuevas.filter((n) => n !== nodo) }));
  },
  cambiarTema() {
    const orden = ['auto', 'light', 'dark'];
    const t = orden[(orden.indexOf(G.s.tema) + 1) % 3];
    guardarLS('alertas-tema', t); aplicarTema(t); G.set({ tema: t });
  }
};

function aplicarTema(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
const RUTAS = ['consulta', 'fallas', 'base', 'stats'];
function rutaActual() { const h = (location.hash || '').replace('#', ''); return RUTAS.includes(h) ? h : 'consulta'; }
function ir(r) { if (location.hash !== '#' + r) location.hash = r; G.set({ ruta: r }); }
// Un motivo que esta página no conoce (por ejemplo, uno nuevo del servidor) se muestra como "Otro", con su texto
const motivoConocido = (f) => (f.motivo !== 'OTRO' && MOTIVO[f.motivo]) || null;
function nombreMotivo(f) { const m = motivoConocido(f); return m ? m.nombre : f.motivoTexto || 'Otro motivo'; }
function cortoMotivo(f) { const m = motivoConocido(f); return m ? m.corto : f.motivoTexto || 'Otro motivo'; }
function clienteMotivo(f) { const m = motivoConocido(f); return m ? m.cliente : f.clienteTexto || 'una afectación en la red de su zona'; }
function puede(vista) { const u = G.s.user; return !!u && CONFIG.roles[u.rol].vistas.includes(vista); }
const esWorkforce = () => { const u = G.s.user; return !!u && (u.rol === 'workforce' || u.rol === 'jefatura'); };
/* Workforce, Jefatura y los supervisores de Call Center ven las posibles fallas (el aviso de 5 clientes en 60 min) */
const veAlertas = () => { const u = G.s.user; return !!u && !!(CONFIG.roles[u.rol] || {}).alertas; };
/* Sigue pendiente para quien la ve: para Workforce, hasta que alguien la reporte al VOC (si un supervisor les
   avisó, sigue pendiente, con su aviso); para un supervisor, hasta que alguien la reporte o le avise a Workforce. */
const pendienteAlerta = (a) => !a.reportada || (esWorkforce() && a.reportada.a === 'WF');
/* Cómo se lee la marca de una posible falla */
const quienMarca = (m) => m.por + (m.rol === 'supervisor' ? ' (supervisor)' : '');
const textoMarca = (m, now) => (m.a === 'WF' ? quienMarca(m) + ' le avisó a Workforce ' : 'Reportada al VOC por ' + quienMarca(m) + ' ') + U.cuando(m.en, now)
  + (m.nota ? ': «' + m.nota + '»' : '');

/* Posibles fallas que muestra la página: sin falla activa publicada y sin descartar en esta PC.
   "alerta" (5 clientes o 2 reportes) y "observacion" (3 o 4 clientes). */
function posiblesFallas(s, mf) {
  const activa = (n) => (mf.porNodo.get(n) || []).some((f) => f.estado === 'ACTIVA');
  const lista = (s.alertas || []).filter((a) => !activa(a.nodo) && !(s.descartadas[a.nodo] >= a.ultimo));
  return { alertas: lista.filter((a) => a.nivel !== 'observacion'), observacion: lista.filter((a) => a.nivel === 'observacion') };
}
const umbralAlertas = () => G.s.umbral || { minutos: CONFIG.alerta.minutos, clientes: CONFIG.alerta.clientesDistintos, observar: CONFIG.alerta.observar, reportes: CONFIG.alerta.reportes };
const lapsoAlerta = (a) => U.dur(Math.max(0, a.ultimo - a.primero));

/* Avisos de escritorio (notificaciones del navegador): fallas nuevas para todos; posibles fallas para Workforce,
   Jefatura y los supervisores de Call Center */
const Avisos = {
  soportado: () => typeof window.Notification === 'function' && window.isSecureContext !== false,
  permiso: () => (Avisos.soportado() ? Notification.permission : 'no'),
  activos: () => Avisos.permiso() === 'granted' && leerLS('alertas-avisos-escritorio', true) !== false,
  async activar() {
    if (!Avisos.soportado()) return 'no';
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = Notification.permission; } }
    if (p === 'granted') guardarLS('alertas-avisos-escritorio', true);
    G.set({ permisoAvisos: p, avisosEscritorio: p === 'granted' });
    return p;
  },
  desactivar() { guardarLS('alertas-avisos-escritorio', false); G.set({ avisosEscritorio: false }); },
  crear(titulo, cuerpo, tag, alTocar) {
    try {
      const n = new Notification(titulo, { body: cuerpo, tag, lang: 'es' });
      n.onclick = () => { try { window.focus(); } catch (e) { /* nada */ } if (alTocar) alTocar(); n.close(); };
      return n;
    } catch (e) { return null; /* algunos navegadores solo permiten avisos desde un service worker */ }
  },
  mostrar(a) {
    const info = Model.infoNodo(G.s.cat, a.nodo);
    const partes = [U.plural(a.nClientes, '1 cliente', a.nClientes + ' clientes distintos') + ' en ' + lapsoAlerta(a)];
    if (a.reportes) partes.push(U.plural(a.reportes, '1 reporte de asesor', a.reportes + ' reportes de asesores'));
    if (info && info.muni) partes.push(U.lugar(info.muni));
    // A Workforce: un supervisor les avisó de esta posible falla
    const m = esWorkforce() && a.reportada && a.reportada.a === 'WF' ? a.reportada : null;
    Avisos.crear(m ? m.por + ' avisa: posible falla en ' + a.nodo : 'Posible falla en ' + a.nodo,
      (m && m.nota ? '«' + m.nota + '» · ' : '') + partes.join(' · ') + '. Clic para ver los clientes y el correo.', 'alertas-' + a.nodo, () => A.abrirPosibleFalla(a.nodo));
  },
  /* Una falla que Workforce acaba de publicar o reabrir (lo que trae "estado" en avisos) */
  falla(x) {
    const resto = x.n - x.nodos.length;
    const nodos = x.nodos.join(', ') + (resto > 0 ? ' y ' + U.plural(resto, '1 nodo más', resto + ' nodos más') : '');
    const cuerpo = nombreMotivo(x) + ' en ' + nodos + (x.clientes ? ' · ' + U.plural(x.clientes, '1 cliente', U.n(x.clientes) + ' clientes') : '')
      + '. ' + (x.tipo === 'REABIERTA' ? 'La reabrió ' : 'La publicó ') + x.por + '. Clic para verla.';
    Avisos.crear((x.tipo === 'REABIERTA' ? 'Se reabrió la falla ' : 'Nueva falla publicada: ') + U.numeroFalla(x), cuerpo, 'alertas-falla-' + x.id, A.verFallaNueva);
  },
  prueba() {
    const um = umbralAlertas();
    Avisos.crear('Avisos de Alertas activados', 'Te avisaremos aquí cuando ' + CONFIG.equipo + ' publique una falla nueva'
      + (veAlertas() ? ' y cuando ' + um.clientes + ' clientes distintos del mismo nodo consulten en ' + um.minutos + ' minutos' : '') + '.', 'alertas-prueba');
  }
};
const iniciales = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/* ---------- Íconos ---------- */
const ICONOS = {
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  VALIDACION: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/><path d="M11 7.8v3.6"/><path d="M11 14.2h.01"/>',
  ENERGIA: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
  FIBRA: '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8.2 8.6 20 18M8.2 15.4 20 6"/>',
  // Corto circuito: un cable cortado con chispa
  CORTO: '<path d="M3 12h5.5M15.5 12H21"/><path d="m12.5 7-2.5 5h4l-2.5 5"/>',
  // Daño por terceros: una torre o estructura con una grieta
  TERCEROS: '<path d="M4 20h16"/><path d="M7 20 10.5 4h3L17 20"/><path d="m11.2 9 2 2-2.2 2 1.8 2"/>',
  // Caída de postes: un poste inclinado con sus cables
  POSTES: '<path d="M3 20h18"/><path d="M9 20 15.5 5"/><path d="M11.8 13.7 6 12.5M14.2 8.1 20 11"/>',
  // Vía pública: una calle con su línea central
  VIA: '<path d="M7 3 4 21M17 3l3 18"/><path d="M12 4v3M12 10.5v3M12 17v3"/>',
  EQUIPO: '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
  RUIDO: '<path d="M2 12h3l2.2-6 3.3 12 3.1-9 2.2 6 1.7-3H22"/>',
  MANTENIMIENTO: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m9.2 15 2 2 3.8-4"/>',
  OTRO: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  alerta: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.2"/><path d="M12 17.2h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  refrescar: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V9h-4.5"/>',
  subir: '<path d="M12 16V4.5"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  descargar: '<path d="M12 4v11.5"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  salir: '<path d="M14.5 4H19v16h-4.5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  lapiz: '<path d="M4 20h4L19.2 8.8a2.3 2.3 0 0 0-3.3-3.3L4.6 16.7 4 20z"/>',
  cerrar: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16 9.5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  telefono: '<path d="M5.5 4h3l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/>',
  chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5z"/>',
  bandera: '<path d="M5 21V4"/><path d="M5 4.5h11.5L14.5 9l2 4.5H5"/>',
  base: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  stats: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  marca: '<path d="M2 12.5h4.2l2.1-5.2 3.1 10.4 3-14 2.9 12.6 1.9-3.8H22"/>',
  fallas: '<path d="M3 12h5l2-4 2.5 9L15 9l1.5 3H21"/><path d="M3 20h18"/>',
  equipo: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6-.3 4.6 1.4 5 4.4"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  campana: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  derecha: '<path d="m9 6 6 6-6 6"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  papelera: '<path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/>',
  usuario: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>',
  // Diadema de agente (Genesys), tienda y candado: los tres accesos de la entrada
  auricular: '<path d="M4.5 13.5V12a7.5 7.5 0 0 1 15 0v1.5"/><rect x="3.5" y="13" width="4" height="6" rx="1.6"/><rect x="16.5" y="13" width="4" height="6" rx="1.6"/><path d="M18.5 19c0 1.4-1.6 2.3-4.2 2.3h-1.8"/>',
  tienda: '<path d="M4 9.5 5.3 4.5h13.4L20 9.5"/><path d="M4 9.5c0 1.5 1.2 2.6 2.7 2.6S9.3 11 9.3 9.5c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6c0 1.5 1.2 2.6 2.6 2.6S20 11 20 9.5"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  // Avión de papel: el aviso ya salió (clientes informados por SMS)
  enviado: '<path d="M21 3 10.6 13.4"/><path d="M21 3 14.4 21l-3.8-7.6L3 9.6 21 3z"/>'
};
function Ico({ n, s }) {
  s = s || 18;
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONOS[n] || '' }}></svg>`;
}

/* ---------- Señal: el glifo del veredicto ---------- */
function latidos(x0, n, w, y) {
  let d = '';
  for (let k = 0; k < n; k++) {
    const x = x0 + k * w;
    d += (k ? 'L' : 'M') + x + ' ' + y + ' H' + (x + w * 0.22) + ' L' + (x + w * 0.3) + ' ' + (y - 6) + ' L' + (x + w * 0.36) + ' ' + (y + 4)
      + ' L' + (x + w * 0.44) + ' ' + (y - 34) + ' L' + (x + w * 0.52) + ' ' + (y + 18) + ' L' + (x + w * 0.58) + ' ' + y + ' H' + (x + w);
  }
  return d;
}
function Senal({ tipo }) {
  const y = 48;
  let fuerte = '', tenue = '', extra = null;
  if (tipo === 'SIN_FALLA') { fuerte = latidos(0, 3, 100, y); extra = html`<circle cx="300" cy=${y} r="4.5" />`; }
  else if (tipo === 'FALLA') {
    fuerte = latidos(0, 1, 100, y) + ' H128';
    tenue = 'M176 ' + y + ' H300';
    extra = html`<path d=${'M136 ' + (y - 14) + ' L148 ' + (y + 14) + ' M152 ' + (y - 14) + ' L164 ' + (y + 14)} />`;
  } else if (tipo === 'RESUELTA') {
    tenue = 'M0 ' + y + ' H96';
    fuerte = latidos(104, 2, 98, y);
    extra = html`<circle cx="300" cy=${y} r="4.5" />`;
  } else {
    tenue = 'M0 ' + y + ' H300';
    fuerte = 'M110 ' + y + ' q 10 -10 20 0 t 20 0 t 20 0';
  }
  return html`<svg class="senal" viewBox="-6 0 312 84" aria-hidden="true">
    ${tenue && html`<path class="tenue" d=${tenue} />`}
    ${fuerte && html`<path d=${fuerte} />`}
    ${extra}
  </svg>`;
}

/* ---------- Componentes pequeños ---------- */
function Tec({ t }) { return t ? html`<span class="tec" data-t=${t}>${t}</span>` : null; }

function BotonCopiar({ texto, etiqueta }) {
  const [ok, setOk] = useState(false);
  return html`<button class="copiar" type="button" title=${'Copiar ' + (etiqueta || '')} aria-label=${'Copiar ' + (etiqueta || '')}
    onClick=${async () => { if (await U.copiar(String(texto))) { setOk(true); setTimeout(() => setOk(false), 1200); } }}>
    <${Ico} n=${ok ? 'check' : 'copiar'} s=${15} />
  </button>`;
}

function Modal({ titulo, sub, onCerrar, children, pie, ancho }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', k);
    const t = setTimeout(() => { const el = ref.current && ref.current.querySelector('input, textarea, select, button.btn-primario, button.btn-peligro'); el && el.focus(); }, 30);
    return () => { document.removeEventListener('keydown', k); clearTimeout(t); };
  }, []);
  return html`<div class="fondo-modal" onMouseDown=${(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${titulo} ref=${ref} style=${ancho ? 'width:min(' + ancho + 'px,100%)' : ''}>
      <div class="modal-cab"><h2>${titulo}</h2>${sub && html`<p>${sub}</p>`}</div>
      <div class="modal-cuerpo">${children}</div>
      ${pie && html`<div class="modal-pie">${pie}</div>`}
    </div>
  </div>`;
}

function Tostadas() {
  const s = useG();
  return html`<div class="tostadas" role="status" aria-live="polite">
    ${s.tostadas.map((t) => html`<div class="tostada" key=${t.id}><${Ico} n="check" s=${16} />${t.texto}</div>`)}
  </div>`;
}

/* Barra proporcional HFC / GPON */
function BarraTec({ hfc, gpon, leyenda }) {
  const t = (hfc || 0) + (gpon || 0);
  if (!t) return null;
  return html`<div>
    <div class="barra-tec" role="img" aria-label=${'HFC ' + U.n(hfc) + ', GPON ' + U.n(gpon)}>
      ${hfc > 0 && html`<i class="h" style=${'flex:' + hfc}></i>`}${gpon > 0 && html`<i class="g" style=${'flex:' + gpon}></i>`}
    </div>
    ${leyenda && html`<div class="leyenda-tec">${hfc > 0 && html`<span class="tec" data-t="HFC">HFC ${U.n(hfc)}</span>`}${gpon > 0 && html`<span class="tec" data-t="GPON">GPON ${U.n(gpon)}</span>`}</div>`}
  </div>`;
}

/* Texto del guion con los datos resaltados */
function Resaltado({ partes }) {
  return html`${partes.map((p, i) => (typeof p === 'string' ? p : html`<mark key=${i}>${p.v}</mark>`))}`;
}
