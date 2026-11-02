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
    umbral: null, alertaAbierta: null, alertasNuevas: [], permisoAvisos: 'no', avisosEscritorio: false, semillaFalla: null
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
  async arrancar() {
    G.set({ tema: leerLS('alertas-tema', 'auto'), descartadas: leerLS('alertas-descartadas', {}), misConsultas: leerSS('alertas-mis-consultas', []), ruta: rutaActual(),
      permisoAvisos: Avisos.permiso(), avisosEscritorio: Avisos.activos() });
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
    G.set(cambios);
    if (esWorkforce()) A.revisarAlertas();
  },
  async actualizar() {
    try { await A.recargar(); tostada('Listo, ya tienes la última versión'); } catch (e) { tostada(e.message); }
  },

  /* Revisa cada pocos segundos si Workforce cambió algo */
  vigilar() {
    // Cada página pregunta "¿hubo cambios?" cada minuto, en momentos distintos (para no llegar todas juntas
    // al servidor), y no pregunta mientras la pestaña está escondida.
    const cada = CONFIG.segundosRevision * 1000 * (Backend.modo === 'local' ? 0.2 : 1);
    let ocupado = false, ultimo = Date.now();
    const paso = async () => {
      if (ocupado || !G.s.user || document.hidden) return;
      ocupado = true; ultimo = Date.now();
      try {
        const e = await Backend.estado();
        G.set({ sinConexion: false });
        if (e.version > G.s.meta.version && (!G.s.remoto || G.s.remoto.version < e.version)) G.set({ remoto: e });
      } catch (err) { if (err.codigo === 'RED') G.set({ sinConexion: true }); }
      ocupado = false;
    };
    const programar = () => setTimeout(() => { paso().finally(programar); }, cada * (0.8 + Math.random() * 0.4));
    programar();
    // Al volver a la pestaña, revisa solo si ya pasó el intervalo
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimo > cada) paso(); });
    // Workforce revisa las posibles fallas cada minuto aunque la pestaña esté escondida o minimizada:
    // así llega el aviso de escritorio. Son pocas personas, no cargan al servidor.
    setInterval(() => { if (G.s.user && esWorkforce()) A.revisarAlertas(); }, 60000);
  },
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
    const pendientes = alertas.filter((a) => !a.reportada);
    const nuevas = pendientes.filter((a) => !(ahora - (avisadas[a.nodo] || 0) < reaviso));
    const vigentes = new Set(pendientes.map((a) => a.nodo));
    let barra = s.alertasNuevas.filter((n) => vigentes.has(n));
    if (nuevas.length) {
      nuevas.forEach((a) => { avisadas[a.nodo] = ahora; });
      barra = [...new Set(nuevas.map((a) => a.nodo).concat(barra))];
      if (Avisos.activos() && (document.hidden || !document.hasFocus())) nuevas.slice(0, 3).forEach((a) => Avisos.mostrar(a));
    }
    guardarLS('alertas-avisadas', avisadas);
    if (barra.join() !== s.alertasNuevas.join()) G.set({ alertasNuevas: barra });
  },
  abrirPosibleFalla(nodo) { G.set((s) => ({ alertaAbierta: nodo, alertasNuevas: s.alertasNuevas.filter((n) => n !== nodo) })); },
  async marcarReportada(nodo, si) {
    const r = await Backend.marcarAlerta(nodo, si);
    G.set((s) => ({
      alertas: s.alertas.map((a) => (a.nodo === nodo ? Object.assign({}, a, { reportada: r.reportada || null }) : a)),
      alertasNuevas: s.alertasNuevas.filter((n) => n !== nodo)
    }));
    return r;
  },
  crearFallaCon(nodo) { G.set({ alertaAbierta: null, semillaFalla: { nodos: [nodo], k: Date.now() } }); ir('fallas'); window.scrollTo({ top: 0 }); },

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
function nombreMotivo(f) { return f.motivo === 'OTRO' ? (f.motivoTexto || 'Otro motivo') : MOTIVO[f.motivo].nombre; }
function cortoMotivo(f) { return f.motivo === 'OTRO' ? (f.motivoTexto || 'Otro motivo') : MOTIVO[f.motivo].corto; }
function clienteMotivo(f) { return f.motivo === 'OTRO' ? (f.clienteTexto || 'una afectación en la red de su zona') : MOTIVO[f.motivo].cliente; }
function puede(vista) { const u = G.s.user; return !!u && CONFIG.roles[u.rol].vistas.includes(vista); }
const esWorkforce = () => { const u = G.s.user; return !!u && (u.rol === 'workforce' || u.rol === 'jefatura'); };

/* Posibles fallas que muestra la página: sin falla activa publicada y sin descartar en esta PC.
   "alerta" (5 clientes o 2 reportes) y "observacion" (3 o 4 clientes). */
function posiblesFallas(s, mf) {
  const activa = (n) => (mf.porNodo.get(n) || []).some((f) => f.estado === 'ACTIVA');
  const lista = (s.alertas || []).filter((a) => !activa(a.nodo) && !(s.descartadas[a.nodo] >= a.ultimo));
  return { alertas: lista.filter((a) => a.nivel !== 'observacion'), observacion: lista.filter((a) => a.nivel === 'observacion') };
}
const umbralAlertas = () => G.s.umbral || { minutos: CONFIG.alerta.minutos, clientes: CONFIG.alerta.clientesDistintos, observar: CONFIG.alerta.observar, reportes: CONFIG.alerta.reportes };
const lapsoAlerta = (a) => U.dur(Math.max(0, a.ultimo - a.primero));

/* Avisos de escritorio (notificaciones del navegador) para Workforce */
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
    Avisos.crear('Posible falla en ' + a.nodo, partes.join(' · ') + '. Clic para ver los clientes y el correo.', 'alertas-' + a.nodo, () => A.abrirPosibleFalla(a.nodo));
  },
  prueba() {
    const um = umbralAlertas();
    Avisos.crear('Avisos de Alertas activados', 'Te avisaremos aquí cuando ' + um.clientes + ' clientes distintos del mismo nodo consulten en ' + um.minutos + ' minutos.', 'alertas-prueba');
  }
};
const iniciales = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/* ---------- Íconos ---------- */
const ICONOS = {
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  ENERGIA: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
  FIBRA: '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8.2 8.6 20 18M8.2 15.4 20 6"/>',
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
  usuario: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.8-4 3.8-6.2 7.5-6.2s6.7 2.2 7.5 6.2"/>'
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
