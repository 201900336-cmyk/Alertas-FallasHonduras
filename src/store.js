/* ==========================================================================
   ALERTAS · Capa de datos
   --------------------------------------------------------------------------
   Esta versión guarda todo en el navegador (IndexedDB) de la PC donde se abre.
   La base de clientes nunca sale de la PC. Varias pestañas del mismo
   navegador comparten los datos y se avisan entre sí cuando hay cambios.

   Para usarlo entre varias PCs (Workforce publica, el call center consulta)
   solo hay que reemplazar este objeto por uno que hable con el servidor que
   elijan (mismas funciones: init, leerTodo, confirmar, agregarLog, leerLogs,
   borrarTodo, alCambiar, alLog). El resto de la aplicación no cambia.
   ========================================================================== */

const Store = (() => {
  const DB = 'alertas-hn', VER = 1;
  const PESTANA = U.uid();
  let db = null, memoria = null, version = 0;
  const alCambiarFns = new Set(), alLogFns = new Set();
  let canal = null, sondeo = null;

  const peticion = (r) => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });

  function abrir() {
    return new Promise((ok, mal) => {
      let r;
      try { r = indexedDB.open(DB, VER); } catch (e) { mal(e); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('logs')) d.createObjectStore('logs', { autoIncrement: true });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
      r.onblocked = () => mal(new Error('La base local está bloqueada por otra pestaña.'));
    });
  }

  async function init() {
    try {
      if (!('indexedDB' in window)) throw new Error('sin IndexedDB');
      db = await abrir();
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* opcional */ }
    } catch (e) {
      memoria = { kv: {}, logs: [] };
    }
    try {
      canal = new BroadcastChannel('alertas-hn');
      canal.onmessage = (ev) => recibir(ev.data);
    } catch (e) { canal = null; }
    window.addEventListener('storage', (ev) => {
      if (ev.key === 'alertas-hn-aviso' && ev.newValue) { try { recibir(JSON.parse(ev.newValue)); } catch (e) { /* nada */ } }
    });
    sondeo = setInterval(revisar, CONFIG.segundosRevision * 1000);
    return { persistente: !memoria };
  }

  async function leer(clave) {
    if (memoria) return memoria.kv[clave];
    return peticion(db.transaction('kv').objectStore('kv').get(clave));
  }
  async function guardar(obj) {
    if (memoria) { Object.assign(memoria.kv, obj); return; }
    await new Promise((ok, mal) => {
      const tx = db.transaction('kv', 'readwrite'); const s = tx.objectStore('kv');
      for (const k in obj) s.put(obj[k], k);
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error || new Error('Guardado cancelado'));
    });
  }

  async function leerTodo(opciones) {
    const sinBase = opciones && opciones.sinBase;
    const [meta, base, baseHist, fallas] = await Promise.all(['meta', sinBase ? null : 'base', 'baseHist', 'fallas'].map((k) => (k ? leer(k) : null)));
    const m = meta || { version: 0 };
    version = m.version || 0;
    return { meta: m, base: base || null, baseHist: baseHist || [], fallas: fallas || [] };
  }
  async function leerMeta() { return (await leer('meta')) || { version: 0 }; }
  async function leerFallas() { return (await leer('fallas')) || []; }

  /* Guarda cambios de Workforce, sube la versión y avisa a todas las sesiones abiertas */
  async function confirmar(cambio, cambios) {
    const meta = await leerMeta();
    const nueva = Object.assign({}, meta, cambios.meta || {}, {
      version: (meta.version || 0) + 1,
      cambio: Object.assign({}, cambio, { en: Date.now(), pestana: PESTANA })
    });
    const datos = Object.assign({}, cambios); datos.meta = nueva;
    await guardar(datos);
    version = nueva.version;
    avisar({ tipo: 'version', version: nueva.version, cambio: nueva.cambio, pestana: PESTANA });
    return nueva;
  }

  /* Fallas que cambian sin que los demás tengan que actualizar (por ejemplo, un envío de SMS) */
  async function guardarFallas(fallas) { await guardar({ fallas }); }

  async function agregarLog(entrada) {
    if (memoria) memoria.logs.push(entrada);
    else await peticion(db.transaction('logs', 'readwrite').objectStore('logs').add(entrada));
    avisar({ tipo: 'log', log: entrada, pestana: PESTANA });
  }
  async function agregarLogs(lista) {
    if (memoria) { memoria.logs.push(...lista); return; }
    await new Promise((ok, mal) => {
      const tx = db.transaction('logs', 'readwrite'); const s = tx.objectStore('logs');
      for (const l of lista) s.add(l);
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error);
    });
  }
  async function leerLogs(desde) {
    desde = desde || 0;
    const todos = memoria ? memoria.logs : await peticion(db.transaction('logs').objectStore('logs').getAll());
    return desde ? todos.filter((l) => l.t >= desde) : todos;
  }
  async function borrarLogs() {
    if (memoria) { memoria.logs = []; return; }
    await peticion(db.transaction('logs', 'readwrite').objectStore('logs').clear());
  }
  async function borrarTodo() {
    if (memoria) { memoria = { kv: {}, logs: [] }; return; }
    await new Promise((ok, mal) => {
      const tx = db.transaction(['kv', 'logs'], 'readwrite');
      tx.objectStore('kv').clear(); tx.objectStore('logs').clear();
      tx.oncomplete = ok; tx.onerror = () => mal(tx.error);
    });
  }

  function avisar(msg) {
    try { canal && canal.postMessage(msg); } catch (e) { /* nada */ }
    try { localStorage.setItem('alertas-hn-aviso', JSON.stringify(Object.assign({ r: Math.random() }, msg))); } catch (e) { /* nada */ }
  }
  const vistos = new Set();
  function recibir(msg) {
    if (!msg || msg.pestana === PESTANA) return;
    if (msg.tipo === 'version' && msg.version > version) alCambiarFns.forEach((fn) => fn(msg));
    if (msg.tipo === 'log' && msg.log) {
      const k = msg.log.t + '|' + msg.log.u + '|' + msg.log.c;
      if (vistos.has(k)) return; vistos.add(k);
      alLogFns.forEach((fn) => fn(msg.log));
    }
  }
  async function revisar() {
    try {
      const m = await leerMeta();
      if (m.version > version) alCambiarFns.forEach((fn) => fn({ version: m.version, cambio: m.cambio }));
    } catch (e) { /* nada */ }
  }

  return {
    init, leerTodo, leerMeta, leerFallas, guardarFallas, confirmar, agregarLog, agregarLogs, leerLogs, borrarLogs, borrarTodo,
    alCambiar: (fn) => { alCambiarFns.add(fn); return () => alCambiarFns.delete(fn); },
    alLog: (fn) => { alLogFns.add(fn); return () => alLogFns.delete(fn); },
    get version() { return version; },
    get persistente() { return !memoria; }
  };
})();
