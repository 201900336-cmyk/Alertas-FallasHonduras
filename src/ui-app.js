/* ==========================================================================
   ALERTAS · Aplicación: arranque, acceso, barra superior y aviso de cambios
   ========================================================================== */

function Arranque() {
  const s = useG();
  return html`<div class="arranque"><div>
    <div class="marca-glifo"><${Ico} n="marca" s=${30} /></div>
    <div class="marca-nombre" style="font-size:28px">${CONFIG.app}</div>
    <p>${s.arranque === 'error' ? s.mensaje : s.mensaje}</p>
    ${s.arranque === 'error' && html`<button class="btn btn-primario" style="margin-top:16px" onClick=${() => location.reload()}>Intentar de nuevo</button>`}
  </div></div>`;
}

/* ---------- Tienda: lista desplegable que se puede buscar ----------
   Al escribir parte del nombre aparecen las tiendas que coinciden (sin importar tildes ni
   mayúsculas) y hay que elegir una de la lista. Teclado: flechas, Enter y Escape. */
const normTienda = (t) => U.sinAcentos(t).toLowerCase().replace(/\s+/g, ' ').trim();
const sinCac = (t) => String(t || '').replace(/^CAC\s+/i, '');
const esCac = (t) => /^CAC\s+/i.test(String(t || ''));
const palabrasTienda = (q) => normTienda(q).split(' ').filter((p) => p && p !== 'cac');
function ordenarTiendas(lista) {
  const vistas = new Set();
  return (lista || []).filter((t) => { const k = normTienda(t); if (!k || vistas.has(k)) return false; vistas.add(k); return true; })
    .sort((a, b) => sinCac(a).localeCompare(sinCac(b), 'es', { sensitivity: 'base' }));
}
/* La tienda de la lista que corresponde a lo escrito (con o sin "CAC"), o '' si no hay una exacta */
function tiendaDeLista(lista, t) {
  const k = normTienda(t);
  return (k && (lista || []).find((x) => normTienda(x) === k || normTienda(sinCac(x)) === k)) || '';
}
/* Primero las que empiezan con lo escrito, después las que tienen una palabra que empieza así, al final el resto */
function buscarTiendas(lista, q) {
  const ps = palabrasTienda(q);
  if (!ps.length) return lista;
  return lista.map((t) => {
    const n = normTienda(sinCac(t));
    if (!ps.every((p) => n.includes(p))) return null;
    return [n.startsWith(ps[0]) ? 0 : (' ' + n).includes(' ' + ps[0]) ? 1 : 2, t];
  }).filter(Boolean).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}
/* Marca en negrita lo que coincide con lo escrito */
function resaltarTienda(t, q) {
  const ps = palabrasTienda(q), letras = [...t];
  if (!ps.length) return t;
  let n = ''; const pos = [];
  letras.forEach((c, i) => { const x = U.sinAcentos(c).toLowerCase(); n += x; for (let k = 0; k < x.length; k++) pos.push(i); });
  const marca = letras.map(() => false);
  ps.forEach((p) => { for (let k = n.indexOf(p); k >= 0; k = n.indexOf(p, k + 1)) for (let j = k; j < k + p.length; j++) marca[pos[j]] = true; });
  const partes = []; let buf = '', m = marca[0];
  letras.forEach((c, i) => { if (marca[i] !== m) { partes.push(m ? html`<mark>${buf}</mark>` : buf); buf = ''; m = marca[i]; } buf += c; });
  partes.push(m ? html`<mark>${buf}</mark>` : buf);
  return partes;
}

function SelectorTienda({ valor, onCambio, lista }) {
  const tiendas = useMemo(() => ordenarTiendas(lista), [lista]);
  const [texto, setTexto] = useState(valor || '');
  const [abierto, setAbierto] = useState(false);
  const [filtrar, setFiltrar] = useState(false);   // al abrir se ven todas; al escribir, solo las que coinciden
  const [activo, setActivo] = useState(-1);         // la que elige Enter (-1: ninguna)
  const [salio, setSalio] = useState(false);
  const [lugar, setLugar] = useState({ arriba: false, alto: 300 });
  const elegida = useRef(valor || ''), centrar = useRef(false), recienEntro = useRef(false);
  const inputRef = useRef(null), listaRef = useRef(null);
  elegida.current = valor || '';
  const opciones = filtrar ? buscarTiendas(tiendas, texto) : tiendas;
  const iActivo = Math.min(activo, opciones.length - 1);

  /* La lista se abre hacia abajo; si abajo no cabe (pantalla baja o el teclado del celular), hacia arriba.
     Nunca más alta que el espacio visible, para que la página no se mueva. */
  function medir() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect(), vv = window.visualViewport;
    const ini = vv ? vv.offsetTop : 0, fin = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const abajo = fin - r.bottom - 14, arriba = r.top - ini - 14;
    const haciaArriba = abajo < 190 && arriba > abajo;
    setLugar({ arriba: haciaArriba, alto: Math.max(110, Math.min(300, Math.floor(haciaArriba ? arriba : abajo))) });
  }
  useEffect(() => {
    if (!abierto) return;
    const vv = window.visualViewport, op = { passive: true };
    window.addEventListener('resize', medir); window.addEventListener('scroll', medir, op);
    if (vv) { vv.addEventListener('resize', medir); vv.addEventListener('scroll', medir, op); }
    return () => {
      window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, op);
      if (vv) { vv.removeEventListener('resize', medir); vv.removeEventListener('scroll', medir, op); }
    };
  }, [abierto]);
  // La opción activa siempre a la vista dentro de la lista (al abrir, la elegida queda al centro)
  htmPreact.useLayoutEffect(() => {
    const l = listaRef.current;
    if (!abierto || !l) return;
    const el = l.querySelector('[data-activo="true"]');
    if (!el) { l.scrollTop = 0; return; }
    const top = el.offsetTop, h = el.offsetHeight;
    if (centrar.current) { centrar.current = false; l.scrollTop = top - (l.clientHeight - h) / 2; return; }
    if (top < l.scrollTop) l.scrollTop = top - 6;
    else if (top + h > l.scrollTop + l.clientHeight) l.scrollTop = top + h - l.clientHeight + 6;
  }, [abierto, iActivo, filtrar, texto]);

  function abrirTodas() {
    const i = tiendas.indexOf(elegida.current);
    medir(); centrar.current = i >= 0;
    setFiltrar(false); setActivo(i); setAbierto(true);
  }
  function elegir(t) {
    elegida.current = t; onCambio(t);
    setTexto(t); setFiltrar(false); setAbierto(false); setSalio(false);
  }
  function alEscribir(e) {
    const v = e.currentTarget.value;
    if (!abierto) medir();
    setTexto(v); setFiltrar(true); setActivo(0); setAbierto(true); setSalio(false);
    const exacta = tiendaDeLista(tiendas, v);
    elegida.current = exacta;
    if (exacta !== valor) onCambio(exacta);
  }
  function alSalir() {
    setAbierto(false); setFiltrar(false);
    if (elegida.current) { setTexto(elegida.current); return; }
    // Si lo escrito solo coincide con una tienda, se elige esa
    const m = texto.trim() ? buscarTiendas(tiendas, texto) : [];
    if (m.length === 1) elegir(m[0]);
    else setSalio(true);
  }
  function alTecla(e) {
    recienEntro.current = false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) { if (filtrar) { medir(); setAbierto(true); } else abrirTodas(); return; }
      if (!opciones.length) return;
      const n = opciones.length, abajo = e.key === 'ArrowDown';
      setActivo(iActivo < 0 ? (abajo ? 0 : n - 1) : (iActivo + (abajo ? 1 : -1) + n) % n);
      return;
    }
    if (e.key === 'Enter' && abierto) {
      e.preventDefault();
      if (iActivo >= 0) elegir(opciones[iActivo]);
      else if (opciones.length === 1) elegir(opciones[0]);
      else setAbierto(false);
      return;
    }
    if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); setAbierto(false); }
  }

  const aviso = salio && !valor && texto.trim();
  return html`<div class="campo selector-tienda">
    <label class="titulo" for="campo-tienda">Tienda</label>
    <div class="selector-caja">
      <input ref=${inputRef} id="campo-tienda" class="input" value=${texto} placeholder="Escribe o elige tu tienda"
        role="combobox" aria-autocomplete="list" aria-expanded=${abierto} aria-controls="lista-tiendas"
        aria-activedescendant=${abierto && iActivo >= 0 ? 'tienda-' + iActivo : null} aria-invalid=${aviso ? 'true' : null}
        autocomplete="off" autocapitalize="none" spellcheck="false"
        onInput=${alEscribir} onKeyDown=${alTecla} onBlur=${alSalir} onFocus=${() => { recienEntro.current = true; }}
        onClick=${(e) => {
          // Al entrar con un clic a una tienda ya elegida, queda seleccionada: lo que se escriba la reemplaza
          if (recienEntro.current && valor) e.currentTarget.select();
          recienEntro.current = false;
          if (!abierto) abrirTodas();
        }} />
      <button type="button" class="selector-flecha" tabindex="-1" aria-label=${abierto ? 'Cerrar la lista de tiendas' : 'Ver todas las tiendas'}
        onMouseDown=${(e) => { e.preventDefault(); if (abierto) setAbierto(false); else { abrirTodas(); if (inputRef.current) inputRef.current.focus(); recienEntro.current = false; } }}>
        <${Ico} n="abajo" s=${18} /></button>
      ${abierto && html`<div class="selector-lista" role="listbox" id="lista-tiendas" aria-label="Tiendas" ref=${listaRef}
          data-lado=${lugar.arriba ? 'arriba' : 'abajo'} style=${'max-height:' + lugar.alto + 'px'}>
        ${opciones.length ? opciones.map((t, k) => html`<div class="selector-opcion" role="option" id=${'tienda-' + k} key=${t}
            aria-selected=${t === valor} data-activo=${k === iActivo}
            onMouseDown=${(e) => { e.preventDefault(); elegir(t); }} onMouseMove=${() => { if (k !== iActivo) setActivo(k); }}>
            ${esCac(t) && html`<span class="cac">CAC</span>`}<span class="nombre">${resaltarTienda(sinCac(t), filtrar ? texto : '')}</span>
            ${t === valor && html`<${Ico} n="check" s=${16} />`}
          </div>`)
          : html`<div class="selector-vacio">Ninguna tienda coincide con «${texto.trim()}». Revisa cómo se escribe o elige de la lista.</div>`}
      </div>`}
    </div>
    ${aviso && html`<small class="selector-aviso" role="alert">Elige tu tienda de la lista.</small>`}
  </div>`;
}

/* Encabezado del panel de entrada: el saludo según la hora de esta PC y el título */
function saludoDeHora(h) {
  return h >= 5 && h < 12 ? ['Buenos días', 'sol'] : h >= 12 && h < 18 ? ['Buenas tardes', 'sol'] : ['Buenas noches', 'luna'];
}
function CabezaAcceso({ titulo, children }) {
  const [saludo, ico] = saludoDeHora(new Date().getHours());
  return html`<header class="login-cab">
    <p class="saludo"><${Ico} n=${ico} s=${16} /><span>${saludo}</span></p>
    <h2 class=${titulo.length > 14 ? 'largo' : null}>${titulo}</h2>
    ${children}
  </header>`;
}
/* Cada forma de entrar lleva su ícono, su nombre y para quién es */
function CabezaBloque({ ico, titulo, sub }) {
  return html`<div class="acceso-cab">
    <span class="acceso-ico"><${Ico} n=${ico} s=${20} /></span>
    <div class="acceso-cab-txt"><h3>${titulo}</h3><p class="sub">${sub}</p></div>
  </div>`;
}

/* Acceso real: Genesys para Concentrix, Workforce y Jefatura; usuario genérico para Tiendas */
function Acceso() {
  const s = useG();
  const cfg = s.config || { genesys: {} };
  const [modo, setModo] = useState('tiendas');
  const [usuario, setUsuario] = useState(leerLS('alertas-usuario-tiendas', RT.usuarioTiendas || 'tiendas'));
  const [clave, setClave] = useState('');
  const listaTiendas = (cfg.listaTiendas && cfg.listaTiendas.length) ? cfg.listaTiendas : CONFIG.tiendas;
  const [tienda, setTienda] = useState(() => tiendaDeLista(listaTiendas, leerLS('alertas-tienda', '')));
  const [nombre, setNombre] = useState(leerLS('alertas-nombre', ''));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const esTienda = modo === 'tiendas';
  const listo = usuario.trim() && clave && nombre.trim().length >= 3 && (!esTienda || !!tienda);

  async function genesys() {
    setError(''); setOcupado(true);
    try { await Backend.genesysIr(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  async function entrar(e) {
    e.preventDefault();
    if (!listo || ocupado) return;
    setError(''); setOcupado(true);
    try {
      const u = await Backend.conClave({ usuario: usuario.trim(), clave, nombre: nombre.trim(), tienda: esTienda ? tienda : '' });
      guardarLS('alertas-nombre', nombre.trim());
      if (esTienda) { guardarLS('alertas-tienda', u.tienda || tienda); guardarLS('alertas-usuario-tiendas', usuario.trim()); }
      setClave('');
      await A.entrar(u);
    } catch (err) { setError(err.message); setOcupado(false); }
  }
  return html`<div class="login">
    <${ArteAcceso} />
    <div class="login-form">
      <${Portada.Fondo} />
      <div class="login-caja">
        <${CabezaAcceso} titulo="Entrar" />
        ${s.avisoAcceso && html`<div class="nota aviso-acceso" role="alert"><${Ico} n="info" s=${18} /><span>${s.avisoAcceso}</span></div>`}
        <section class="acceso-bloque">
          <${CabezaBloque} ico="auricular" titulo="Concentrix, Workforce HN y Jefatura" sub="Con tu usuario de Genesys." />
          <button class="btn btn-primario btn-grande" style="width:100%" disabled=${ocupado || !cfg.genesys.activo} onClick=${genesys}>Entrar con Genesys</button>
          ${!cfg.genesys.activo && html`<p class="sub">Genesys todavía no está conectado.${cfg.temporal ? ' Mientras tanto, Workforce y Jefatura pueden usar el acceso temporal.' : ''}</p>`}
        </section>
        <div class="acceso-o" aria-hidden="true"><span>o</span></div>
        <form class="acceso-bloque" onSubmit=${entrar}>
          <div class="acceso-titulo">
            <${CabezaBloque} ico=${esTienda ? 'tienda' : 'reloj'} titulo=${esTienda ? 'Tiendas' : 'Acceso temporal'}
              sub=${esTienda ? 'Con el usuario de tiendas.' : 'Con tu cuenta temporal.'} />
            ${cfg.temporal && html`<div class="seg" role="group" aria-label="Tipo de acceso">
              <button type="button" aria-pressed=${esTienda} onClick=${() => { setModo('tiendas'); setUsuario(leerLS('alertas-usuario-tiendas', RT.usuarioTiendas || 'tiendas')); }}>Tiendas</button>
              <button type="button" aria-pressed=${!esTienda} onClick=${() => { setModo('temporal'); setUsuario(''); }}>Temporal</button>
            </div>`}
          </div>
          ${!cfg.tiendas && esTienda && html`<p class="sub">El acceso de Tiendas todavía no tiene contraseña configurada.</p>`}
          <div class="fila-campos">
            <label class="campo"><span>Usuario</span><input class="input" value=${usuario} onInput=${(e) => setUsuario(e.currentTarget.value)} autocomplete="username" autocapitalize="none" /></label>
            <label class="campo"><span>Contraseña</span><input class="input" type="password" value=${clave} onInput=${(e) => setClave(e.currentTarget.value)} autocomplete="current-password" /></label>
          </div>
          ${esTienda && html`<${SelectorTienda} valor=${tienda} onCambio=${setTienda} lista=${listaTiendas} />`}
          <label class="campo"><span>Tu nombre</span><input class="input" value=${nombre} onInput=${(e) => setNombre(e.currentTarget.value)} autocomplete="name" placeholder="Ejemplo: Karla Zelaya" /></label>
          <button class="btn btn-borde btn-grande" type="submit" disabled=${!listo || ocupado}>${ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
        ${error && html`<div class="nota error-acceso" role="alert"><${Ico} n="alerta" s=${18} /><span>${error}</span></div>`}
        <p class="sub pie-acceso"><${Ico} n="candado" s=${15} /><span>Cada consulta queda registrada con tu nombre.</span></p>
      </div>
    </div>
  </div>`;
}

/* Demostración: se elige el acceso sin contraseña, todo queda en esta PC */
function AccesoDemo() {
  const s = useG();
  const prev = leerLS('alertas-demo-usuario', {});
  const [nombre, setNombre] = useState(prev.nombre || '');
  const [rol, setRol] = useState(prev.rol || 'concentrix');
  const [tienda, setTienda] = useState(() => tiendaDeLista(CONFIG.tiendas, prev.tienda || ''));
  const ok = nombre.trim().length >= 3 && (rol !== 'tiendas' || !!tienda);
  const DESC = { concentrix: 'Call Center N1 y Redes Sociales, con Genesys', tiendas: 'Usuario genérico de tiendas', workforce: 'Publica y cierra fallas, con Genesys', jefatura: 'Todo, más el desempeño del equipo' };
  async function entrar(e) {
    e.preventDefault(); if (!ok) return;
    const datos = { nombre: U.titulo(nombre.trim()), rol, tienda: rol === 'tiendas' ? tienda : '' };
    guardarLS('alertas-demo-usuario', datos);
    await A.entrar(await Backend.entrarDemo(datos));
  }
  return html`<div class="login">
    <${ArteAcceso} />
    <div class="login-form">
      <${Portada.Fondo} />
      <form class="login-caja" onSubmit=${entrar}>
        <${CabezaAcceso} titulo="Entrar a la demostración">
          <p class="sub">${RT.api ? 'Modo demostración: datos inventados y guardados solo en esta PC.' : 'Todavía no hay servidor conectado en config.js, así que la página funciona en modo demostración.'}</p>
        <//>
        ${s.avisoAcceso && html`<div class="nota aviso-acceso"><${Ico} n="info" s=${18} /><span>${s.avisoAcceso}</span></div>`}
        <div class="campo"><span>Acceso</span>
          <div class="roles" role="group" aria-label="Acceso">
            ${Object.entries(CONFIG.roles).map(([id, r]) => html`<button type="button" class="rol" aria-pressed=${rol === id} onClick=${() => setRol(id)} key=${id}><b>${r.corto}</b><span>${DESC[id]}</span></button>`)}
          </div>
        </div>
        ${rol === 'tiendas' && html`<${SelectorTienda} valor=${tienda} onCambio=${setTienda} lista=${CONFIG.tiendas} />`}
        <label class="campo"><span>Tu nombre</span><input class="input" value=${nombre} onInput=${(e) => setNombre(e.currentTarget.value)} autocomplete="name" placeholder="Ejemplo: Karla Zelaya" /></label>
        <button class="btn btn-primario btn-grande" type="submit" disabled=${!ok}>Entrar</button>
      </form>
    </div>
  </div>`;
}

function BarraSuperior({ mf }) {
  const s = useG();
  const [menu, setMenu] = useState(false);
  const u = s.user, rol = CONFIG.roles[u.rol];
  const NAV = [['consulta', 'Consulta', 'lupa'], ['fallas', 'Fallas', 'fallas'], ['base', 'Base', 'base'], ['stats', 'Estadísticas', 'stats']];
  useEffect(() => {
    if (!menu) return;
    const c = (e) => { if (!e.target.closest('.usuario-zona')) setMenu(false); };
    const k = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', c); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', c); document.removeEventListener('keydown', k); };
  }, [menu]);
  const nAct = mf.activas.length;
  const nAlertas = esWorkforce() ? posiblesFallas(s, mf).alertas.length : 0;
  return html`<header class="topbar">
    <a class="marca" href="#consulta" onClick=${() => ir('consulta')}>
      <div class="marca-glifo"><${Ico} n="marca" s=${20} /></div>
      <div><div class="marca-nombre">${CONFIG.app}</div><div class="marca-bajada">${CONFIG.bajada}</div></div>
    </a>
    ${rol.vistas.length > 1 && html`<nav class="nav" aria-label="Secciones">
      ${NAV.filter(([id]) => rol.vistas.includes(id)).map(([id, txt, ico]) => html`<a href=${'#' + id} aria-current=${s.ruta === id ? 'page' : null} key=${id}>
        <${Ico} n=${ico} s=${17} /><span class="txt">${txt}</span>${id === 'fallas' && nAct > 0 && html`<span class="cuenta" title=${U.plural(nAct, '1 falla activa', nAct + ' fallas activas')}>${nAct}</span>`}${id === 'fallas' && nAlertas > 0 && html`<span class="cuenta alerta" title=${U.plural(nAlertas, '1 posible falla sin publicar', nAlertas + ' posibles fallas sin publicar')}>${nAlertas}</span>`}</a>`)}
    </nav>`}
    <div class="topbar-der">
      ${s.sinConexion && html`<span class="estado-red" data-s="SIN" title="No hay conexión con el servidor de Alertas"><span class="punto"></span><span class="txt">Sin conexión</span></span>`}
      <span class="estado-red" data-s=${nAct ? 'FALLA' : 'OK'} title=${nAct ? 'Fallas activas publicadas por Workforce HN' : 'No hay fallas activas publicadas'}>
        <span class=${'punto' + (nAct ? ' vivo' : '')}></span>
        <span class="txt">${nAct ? U.plural(nAct, '1 falla activa', nAct + ' fallas activas') + ', ' + U.n(mf.clientesActivos) + ' clientes' : 'Sin fallas activas'}</span>
      </span>
      <button class="btn btn-fantasma btn-icono" title=${'Tema: ' + (s.tema === 'auto' ? 'automático' : s.tema === 'dark' ? 'oscuro' : 'claro')} aria-label="Cambiar tema" onClick=${A.cambiarTema}>
        <${Ico} n=${s.tema === 'auto' ? 'auto' : s.tema === 'dark' ? 'luna' : 'sol'} s=${18} /></button>
      <div class="usuario-zona" style="position:relative">
        <button class="usuario" aria-haspopup="menu" aria-expanded=${menu} onClick=${() => setMenu(!menu)}>
          <span class="avatar">${iniciales(u.nombre)}</span>
          <span class="usuario-txt"><b>${u.nombre}</b><span>${rol.corto}${u.tienda ? ', ' + u.tienda : ''}</span></span>
          <${Ico} n="abajo" s=${16} />
        </button>
        ${menu && html`<div class="menu" role="menu">
          <div class="info"><b>${u.nombre}</b>${rol.nombre}${u.tienda ? html`<br />Tienda ${u.tienda}` : ''}<br />${u.origen === 'genesys' ? 'Entró con Genesys' : u.origen === 'demo' ? 'Demostración' : 'Usuario ' + String(u.u).split(':')[0]}</div>
          <hr />
          <button role="menuitem" onClick=${() => { setMenu(false); A.actualizar(); }}><${Ico} n="refrescar" s=${17} />Actualizar datos</button>
          <button role="menuitem" onClick=${() => { setMenu(false); A.salir(); }}><${Ico} n="salir" s=${17} />Salir</button>
        </div>`}
      </div>
    </div>
  </header>`;
}

function AvisoCambios() {
  const s = useG();
  const r = s.remoto;
  if (!r) return null;
  const c = r.cambio || {};
  const quien = c.por ? c.por.nombre : 'Alguien';
  return html`<div class="aviso" role="alert">
    <span class="aviso-icono"><${Ico} n="refrescar" s=${17} /></span>
    <p><b>${CONFIG.equipo} hizo una actualización.</b> ${U.conPunto(quien + ' ' + (c.texto || 'hizo cambios') + (c.en ? ' a ' + U.las(c.en) : ''))} Actualiza para ver los cambios.</p>
    <button class="btn btn-chico" onClick=${A.actualizar}>Actualizar</button>
  </div>`;
}

/* Una posible falla nueva para Workforce, en cualquier vista menos Fallas (ahí está el panel) */
function AvisoPosibleFalla({ mf }) {
  const s = useG();
  if (!esWorkforce() || s.ruta === 'fallas' || !s.alertasNuevas.length) return null;
  const lista = posiblesFallas(s, mf).alertas.filter((a) => s.alertasNuevas.includes(a.nodo) && !a.reportada);
  if (!lista.length) return null;
  const a = lista[0], otras = lista.length - 1;
  return html`<div class="aviso aviso-pf" role="alert">
    <span class="aviso-icono"><${Ico} n="alerta" s=${17} /></span>
    <p><b>Posible falla en ${a.nodo}.</b> ${U.plural(a.nClientes, '1 cliente', a.nClientes + ' clientes distintos')} en ${lapsoAlerta(a)}${a.reportes ? ', ' + U.plural(a.reportes, '1 reporte de asesor', a.reportes + ' reportes de asesores') : ''}.${otras ? ' Hay ' + U.plural(otras, 'otra más', otras + ' más') + ' en Fallas.' : ''}</p>
    <button class="btn btn-chico" onClick=${() => A.abrirPosibleFalla(a.nodo)}>Ver clientes y correo</button>
    <button class="btn btn-icono btn-chico aviso-x" aria-label="Cerrar el aviso" title="Cerrar el aviso (la posible falla sigue en Fallas)" onClick=${() => G.set({ alertasNuevas: [] })}><${Ico} n="x" s=${16} /></button>
  </div>`;
}

function Shell() {
  const s = useG();
  const mf = useMemo(() => Model.mapaFallas(s.fallas, s.now), [s.fallas, s.now]);
  const rol = CONFIG.roles[s.user.rol];
  const ruta = rol.vistas.includes(s.ruta) ? s.ruta : 'consulta';
  useEffect(() => { document.title = (mf.activas.length ? '(' + mf.activas.length + ') ' : '') + CONFIG.app + ', fallas de red fija'; }, [mf.activas.length]);
  return html`<div class="app">
    <${BarraSuperior} mf=${mf} />
    <div class="avisos-arriba"><${AvisoCambios} /><${AvisoPosibleFalla} mf=${mf} /></div>
    ${Backend.modo === 'local' && html`<div class="demo-cinta">${s.meta.demo ? 'Estás viendo datos de demostración: clientes, fallas y consultas inventados.' : 'Modo demostración: los datos se guardan solo en esta PC.'}${!RT.api ? ' Falta conectar el servidor en config.js.' : ''}</div>`}
    <main class="contenido" id="contenido">
      ${ruta === 'consulta' && html`<${VistaConsulta} />`}
      ${ruta === 'fallas' && html`<${VistaFallas} />`}
      ${ruta === 'base' && html`<${VistaBase} />`}
      ${ruta === 'stats' && html`<${VistaStats} />`}
    </main>
    ${esWorkforce() && s.alertaAbierta && html`<${ModalPosibleFalla} nodo=${s.alertaAbierta} key=${s.alertaAbierta} />`}
    <${Tostadas} />
  </div>`;
}

function App() {
  const s = useG();
  if (s.arranque !== 'listo') return html`<${Arranque} />`;
  if (!s.user) return html`${Backend.modo === 'local' ? html`<${AccesoDemo} />` : html`<${Acceso} />`}<${Tostadas} />`;
  return html`<${Shell} />`;
}

render(html`<${App} />`, document.getElementById('app'));
A.arrancar();
