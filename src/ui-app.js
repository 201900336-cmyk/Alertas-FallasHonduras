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

/* Acceso real: Genesys para Concentrix, Workforce y Jefatura; usuario genérico para Tiendas */
function Acceso() {
  const s = useG();
  const cfg = s.config || { genesys: {} };
  const [modo, setModo] = useState('tiendas');
  const [usuario, setUsuario] = useState(leerLS('alertas-usuario-tiendas', RT.usuarioTiendas || 'tiendas'));
  const [clave, setClave] = useState('');
  const [tienda, setTienda] = useState(leerLS('alertas-tienda', ''));
  const [nombre, setNombre] = useState(leerLS('alertas-nombre', ''));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const esTienda = modo === 'tiendas';
  const listo = usuario.trim() && clave && nombre.trim().length >= 3 && (!esTienda || tienda.trim().length >= 2);

  async function genesys() {
    setError(''); setOcupado(true);
    try { await Backend.genesysIr(); } catch (e) { setError(e.message); setOcupado(false); }
  }
  async function entrar(e) {
    e.preventDefault();
    if (!listo || ocupado) return;
    setError(''); setOcupado(true);
    try {
      const u = await Backend.conClave({ usuario: usuario.trim(), clave, nombre: nombre.trim(), tienda: esTienda ? tienda.trim() : '' });
      guardarLS('alertas-nombre', nombre.trim());
      if (esTienda) { guardarLS('alertas-tienda', tienda.trim()); guardarLS('alertas-usuario-tiendas', usuario.trim()); }
      setClave('');
      await A.entrar(u);
    } catch (err) { setError(err.message); setOcupado(false); }
  }
  return html`<div class="login">
    <${ArteAcceso} />
    <div class="login-form">
      <div class="login-caja">
        <div><h2>Entrar</h2></div>
        ${s.avisoAcceso && html`<div class="nota aviso-acceso" role="alert"><${Ico} n="info" s=${18} /><span>${s.avisoAcceso}</span></div>`}
        <section class="acceso-bloque">
          <h3>Concentrix, Workforce HN y Jefatura</h3>
          <button class="btn btn-primario btn-grande" style="width:100%" disabled=${ocupado || !cfg.genesys.activo} onClick=${genesys}>Entrar con Genesys</button>
          ${!cfg.genesys.activo && html`<p class="sub">Genesys todavía no está conectado.${cfg.temporal ? ' Mientras tanto, Workforce y Jefatura pueden usar el acceso temporal.' : ''}</p>`}
        </section>
        <form class="acceso-bloque" onSubmit=${entrar}>
          <div class="acceso-titulo">
            <h3>${esTienda ? 'Tiendas' : 'Acceso temporal'}</h3>
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
          <div class="fila-campos">
            ${esTienda && html`<label class="campo"><span>Tienda</span><input class="input" value=${tienda} onInput=${(e) => setTienda(e.currentTarget.value)} placeholder="Ejemplo: Multiplaza" /></label>`}
            <label class="campo" style=${esTienda ? '' : 'grid-column:1 / -1'}><span>Tu nombre</span><input class="input" value=${nombre} onInput=${(e) => setNombre(e.currentTarget.value)} autocomplete="name" placeholder="Ejemplo: Karla Zelaya" /></label>
          </div>
          <button class="btn btn-borde btn-grande" type="submit" disabled=${!listo || ocupado}>${ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
        ${error && html`<div class="nota error-acceso" role="alert"><${Ico} n="alerta" s=${18} /><span>${error}</span></div>`}
        <p class="sub pie-acceso">Cada consulta queda registrada con tu nombre.</p>
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
  const [tienda, setTienda] = useState(prev.tienda || '');
  const ok = nombre.trim().length >= 3 && (rol !== 'tiendas' || tienda.trim().length >= 2);
  const DESC = { concentrix: 'Call Center N1 y Redes Sociales, con Genesys', tiendas: 'Usuario genérico de tiendas', workforce: 'Publica y cierra fallas, con Genesys', jefatura: 'Todo, más el desempeño del equipo' };
  async function entrar(e) {
    e.preventDefault(); if (!ok) return;
    const datos = { nombre: U.titulo(nombre.trim()), rol, tienda: tienda.trim() };
    guardarLS('alertas-demo-usuario', datos);
    await A.entrar(await Backend.entrarDemo(datos));
  }
  return html`<div class="login">
    <${ArteAcceso} />
    <div class="login-form">
      <form class="login-caja" onSubmit=${entrar}>
        <div><h2>Entrar a la demostración</h2><p class="sub" style="margin:6px 0 0">${RT.api ? 'Modo demostración: datos inventados y guardados solo en esta PC.' : 'Todavía no hay servidor conectado en config.js, así que la página funciona en modo demostración.'}</p></div>
        ${s.avisoAcceso && html`<div class="nota aviso-acceso"><${Ico} n="info" s=${18} /><span>${s.avisoAcceso}</span></div>`}
        <div class="campo"><span>Acceso</span>
          <div class="roles" role="group" aria-label="Acceso">
            ${Object.entries(CONFIG.roles).map(([id, r]) => html`<button type="button" class="rol" aria-pressed=${rol === id} onClick=${() => setRol(id)} key=${id}><b>${r.corto}</b><span>${DESC[id]}</span></button>`)}
          </div>
        </div>
        <div class="fila-campos">
          <label class="campo" style=${rol === 'tiendas' ? '' : 'grid-column:1 / -1'}><span>Tu nombre</span><input class="input" value=${nombre} onInput=${(e) => setNombre(e.currentTarget.value)} autocomplete="name" placeholder="Ejemplo: Karla Zelaya" /></label>
          ${rol === 'tiendas' && html`<label class="campo"><span>Tienda</span><input class="input" value=${tienda} onInput=${(e) => setTienda(e.currentTarget.value)} placeholder="Ejemplo: Multiplaza" /></label>`}
        </div>
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
  const nAlertas = esWorkforce() ? s.alertas.filter((a) => !(s.descartadas[a.nodo] >= a.ultimo) && !mf.porNodo.has(a.nodo)).length : 0;
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
    <p><b>${CONFIG.equipo} hizo una actualización.</b> ${U.conPunto(quien + ' ' + (c.texto || 'hizo cambios') + (c.en ? ' a las ' + U.hora(c.en) : ''))} Actualiza para ver los cambios.</p>
    <button class="btn btn-chico" onClick=${A.actualizar}>Actualizar</button>
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
    <${AvisoCambios} />
    ${Backend.modo === 'local' && html`<div class="demo-cinta">${s.meta.demo ? 'Estás viendo datos de demostración: clientes, fallas y consultas inventados.' : 'Modo demostración: los datos se guardan solo en esta PC.'}${!RT.api ? ' Falta conectar el servidor en config.js.' : ''}</div>`}
    <main class="contenido" id="contenido">
      ${ruta === 'consulta' && html`<${VistaConsulta} />`}
      ${ruta === 'fallas' && html`<${VistaFallas} />`}
      ${ruta === 'base' && html`<${VistaBase} />`}
      ${ruta === 'stats' && html`<${VistaStats} />`}
    </main>
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
