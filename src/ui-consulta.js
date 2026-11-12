/* ==========================================================================
   ALERTAS · Vista de Consulta (Concentrix, Tiendas y todo el equipo)
   ========================================================================== */

const PLAY = { '3P': 'Triple play', '2P': 'Doble play', '1P': 'Un servicio' };

function VistaConsulta() {
  const s = useG();
  const mf = useMemo(() => Model.mapaFallas(s.fallas, s.now), [s.fallas, s.now]);
  const comunicados = useMemo(() => Model.comunicadosVigentes(s.comunicados), [s.comunicados]);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const ultima = useRef({ q: '', t: 0, res: null });
  // Aquí las fallas se cargan solas: un cambio que quedó pendiente estando en otra vista se trae al entrar
  const pendiente = s.remoto && A.cargaSola(s.remoto) ? s.remoto.version : 0;
  useEffect(() => { if (pendiente) A.recargar().catch(() => {}); }, [pendiente]);

  useEffect(() => {
    const k = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); inputRef.current && inputRef.current.focus(); inputRef.current && inputRef.current.select(); }
    };
    document.addEventListener('keydown', k);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => document.removeEventListener('keydown', k);
  }, []);

  function mostrar(r) {
    if (r.estado === 'ok') {
      const mfr = Model.mapaFallas(r.fallas || [], Date.now());
      const items = r.filas.map((rec) => ({ rec, v: Model.veredictoNodo(mfr, rec.nodo) }));
      const peor = items.slice().sort((a, b) => Model.PRIORIDAD[a.v.tipo] - Model.PRIORIDAD[b.v.tipo])[0];
      setSel(items.indexOf(peor));
      const rec = peor.rec;
      A.anotar({ t: Date.now(), contrato: rec.contrato, nodo: rec.nodo, r: peor.v.tipo, nombre: U.esEmpresa(rec.nombre, rec.categoria) ? rec.nombre : U.titulo(rec.nombre) });
    } else {
      setSel(0);
      A.anotar({ t: Date.now(), contrato: r.tipo === 'contrato' ? r.q : '', nodo: '', r: 'NO_ENCONTRADO' });
    }
    setRes(r);
  }

  async function consultar(texto) {
    const d = Model.tipoConsulta(texto);
    if (!d.tipo) { setRes(null); return; }
    setError(null);
    if (d.tipo === 'incompleto') { setRes({ estado: 'incompleto', q: d.d }); return; }
    // La misma búsqueda en menos de un minuto no vuelve al servidor
    if (ultima.current.q === d.d && Date.now() - ultima.current.t < 60000 && ultima.current.res) { mostrar(ultima.current.res); return; }
    setBuscando(true);
    try {
      const r = await A.buscar(texto);
      ultima.current = { q: d.d, t: Date.now(), res: r };
      mostrar(r);
    } catch (e) {
      if (e.codigo !== 'SESION') { setError(e); setRes(null); }
    } finally {
      setBuscando(false);
      setTimeout(() => inputRef.current && inputRef.current.select(), 0);
    }
  }

  function limpiar() {
    setQ(''); setRes(null); setError(null); setSel(0);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  }

  const detect = Model.tipoConsulta(q);
  const chip = !q ? null : detect.tipo === 'contrato' ? 'Contrato' : detect.tipo === 'dni' ? 'DNI' : detect.tipo === 'incompleto' ? 'DNI incompleto: ' + detect.d.length + ' de 13 dígitos' : null;

  if (s.cargando) return html`<div class="panel vacio" style="margin-top:20px"><b>Cargando…</b>Trayendo las fallas vigentes.</div>`;
  if (!s.resumen) return html`<${SinBase} />`;

  return html`<div class="consulta">
    <section aria-label="Consulta de cliente">
      ${comunicados.length > 0 && html`<${ComunicadosArriba} lista=${comunicados} now=${s.now} />`}
      ${veAlertas() && !esWorkforce() && html`<${PosiblesFallas} mf=${mf} />`}
      <form class="buscador" role="search" onSubmit=${(e) => { e.preventDefault(); consultar(q); }}>
        <label class="buscador-caja">
          <${Ico} n="lupa" s=${22} />
          <span class="sr">Contrato o DNI del cliente</span>
          <input ref=${inputRef} value=${q} inputmode="numeric" autocomplete="off" spellcheck="false"
            placeholder="Contrato o DNI del cliente"
            onInput=${(e) => setQ(e.currentTarget.value)}
            onKeyDown=${(e) => { if (e.key === 'Escape') limpiar(); }} />
          ${chip && html`<span class="detecta" data-k=${detect.tipo}>${chip}</span>`}
        </label>
        <button class="btn btn-primario btn-grande" type="submit" disabled=${!detect.tipo || detect.tipo === 'incompleto' || buscando}>${buscando ? 'Buscando…' : 'Consultar'}</button>
        <button class="btn btn-borde btn-grande limpiar" type="button" disabled=${!q && !res && !error} onClick=${limpiar}>Limpiar</button>
      </form>
      <p class="ayuda-busqueda">
        <span>Contrato de 6 a 8 dígitos o DNI de 13, con o sin guiones.</span>
        <span><span class="tecla">/</span> para buscar, <span class="tecla">Esc</span> para limpiar</span>
      </p>
      ${error ? html`<div class="resultado"><div class="panel no-encontrado">
            <div class="ico"><${Ico} n="alerta" s=${24} /></div>
            <div><h3>${error.codigo === 'LIMITE' ? 'Llegaste al límite de consultas' : 'No se pudo consultar'}</h3><p>${error.message}</p>
              ${error.codigo !== 'LIMITE' && html`<button class="btn btn-borde btn-chico" style="margin-top:12px" onClick=${() => consultar(q)}>Intentar de nuevo</button>`}</div>
          </div></div>`
        : res ? html`<div class=${'resultado-envoltura' + (buscando ? ' cargando' : '')}><${Resultado} res=${res} sel=${sel} setSel=${setSel} now=${s.now} /></div>`
        : buscando ? html`<div class="resultado"><div class="panel buscando"><span class="punto vivo"></span>Buscando en la base de clientes…</div></div>`
        : html`<${InicioAsesor} mf=${mf} onAbrir=${(c) => { setQ(String(c)); consultar(String(c)); }} />`}
    </section>
    <${RielFallas} mf=${mf} now=${s.now} comunicados=${comunicados} />
  </div>`;
}

function SinBase() {
  const puedeSubir = puede('base');
  const local = Backend.modo === 'local';
  return html`<div class="bienvenida">
    <h1>Todavía no hay base de clientes</h1>
    <p>${puedeSubir ? 'Sube la base semanal de contratos por nodo para empezar' + (local ? ', o prueba la herramienta con datos ficticios.' : '.') : 'Workforce HN debe subir la base semanal de contratos por nodo antes de poder consultar clientes.'}</p>
    ${puedeSubir && html`<div class="opciones-inicio">
      <div class="panel opcion"><h3>Subir la base</h3><p>${local ? 'El Excel semanal de BI con contrato, nodo, OLT y datos del cliente. En demostración se guarda solo en esta PC.' : 'El Excel semanal de BI. Se guarda en la base interna de Alertas y reemplaza la base anterior.'}</p>
        <button class="btn btn-primario" onClick=${() => ir('base')}><${Ico} n="subir" s=${16} />Ir a Base de clientes</button></div>
      ${local && html`<div class="panel opcion"><h3>Probar con datos de demostración</h3><p>Clientes, fallas y consultas inventados para conocer la herramienta o presentarla.</p>
        <button class="btn btn-borde" onClick=${() => A.cargarDemo()}>Cargar demostración</button></div>`}
    </div>`}
  </div>`;
}

/* ---------- Resultado de la búsqueda ---------- */
/* reporte: desde Reportes (Nodo o cliente), sin el guion para el cliente y con su historial de un año */
function Resultado({ res, sel, setSel, now, reporte }) {
  const s = G.s;
  if (res.estado === 'incompleto') {
    return html`<div class="resultado"><div class="panel no-encontrado">
      <div class="ico"><${Ico} n="info" s=${24} /></div>
      <div><h3>Ese DNI está incompleto</h3><p>Escribiste ${res.q.length} dígitos. Un DNI tiene 13, por ejemplo 0801-1990-12345. Un contrato tiene de 6 a 8.</p></div>
    </div></div>`;
  }
  if (res.estado === 'no') {
    const fechaBase = s.resumen && s.resumen.en ? U.dia(s.resumen.en) : '';
    return html`<div class="resultado"><div class="panel no-encontrado">
      <div class="ico"><${Ico} n="lupa" s=${24} /></div>
      <div><h3>No encontramos ${res.tipo === 'dni' ? 'el DNI' : 'el contrato'} ${res.tipo === 'dni' ? U.formatoDni(res.q) : res.q}</h3>
        <p>No está en la base${fechaBase ? ' cargada el ' + fechaBase : ''}. Confirma el número con el cliente${res.tipo === 'contrato' ? ' o búscalo por su DNI' : ' o pídele el número de contrato'}. Si es un cliente nuevo, valídalo en los sistemas internos.</p></div>
    </div></div>`;
  }
  const mfr = Model.mapaFallas(res.fallas || [], now);
  const items = res.filas.map((rec) => ({ rec, v: Model.veredictoNodo(mfr, rec.nodo) }));
  const actual = items[Math.min(sel, items.length - 1)];
  const contratos = new Set(items.map((x) => x.rec.contrato)).size;
  const lista = res.historial ? (res.historial[actual.rec.nodo] || []) : null;
  const rein = lista ? Model.reincidente(lista, actual.rec, now) : false;
  return html`<div class="resultado">
    ${items.length > 1 && html`<div class="servicios" role="group" aria-label="Servicios encontrados">
      <span>${res.tipo === 'dni' && contratos > 1 ? 'Este DNI tiene ' + contratos + ' contratos' : 'Este contrato tiene ' + items.length + ' servicios'}</span>
      ${items.map((x, k) => html`<button class="servicio-btn" aria-pressed=${k === sel} onClick=${() => setSel(k)} key=${k}>
        <span class=${'punto p-' + x.v.tipo}></span><span class="num">${x.rec.contrato}</span><span class="sub">${x.rec.nodo}</span>
      </button>`)}
    </div>`}
    <${Veredicto} v=${actual.v} rec=${actual.rec} now=${now} />
    <div class=${'cliente-guion' + (reporte ? ' solo' : '')}>
      <${TarjetaCliente} rec=${actual.rec} v=${actual.v} now=${now} />
      ${!reporte && html`<${Guion} rec=${actual.rec} v=${actual.v} now=${now} rein=${rein} key=${actual.rec.i + actual.v.tipo} />`}
    </div>
    ${lista && html`<${HistorialCliente} rec=${actual.rec} lista=${lista} now=${now} rein=${rein} reporte=${reporte} key=${actual.rec.i} />`}
  </div>`;
}

/* ---------- Historial de fallas del cliente ---------- */
const PERIODOS_HIST = [[90, '90 días', 'en 90 días'], [180, '6 meses', 'en 6 meses'], [365, '1 año', 'en 1 año']];
// En Reportes también por mes y por fechas: Ajustes da notas de crédito por el tiempo que el cliente estuvo sin servicio
const PERIODOS_AJUSTES = [['mes', 'Este mes'], ['anterior', 'Mes pasado'], ['90', '90 días'], ['180', '6 meses'], ['365', '1 año'], ['fechas', 'Fechas']];
const CLAVE_PER_CLIENTE = 'alertas-reporte-cliente-per';
const fechaHist = (t, now) => (U.esHoy(t, now) ? 'Hoy, ' + U.hora(t) : U.dia(t) + ', ' + U.hora(t));
// Con el año, para Ajustes: "5 oct 2026, 10:00 a. m. → 12:00 p. m." (si termina el mismo día, solo la hora)
const fechasAjustes = (f) => U.diaAnio(f.inicio) + ', ' + U.hora(f.inicio) + ' → '
  + (!f.fin ? 'sigue activa' : U.inicioDia(f.fin) === U.inicioDia(f.inicio) ? U.hora(f.fin) : U.diaAnio(f.fin) + ', ' + U.hora(f.fin));
const cacheContactos = new Map();

/* Las consultas anteriores del contrato se piden aparte, después del veredicto, para no hacer más lenta la búsqueda */
function useContactos(contrato) {
  const [c, setC] = useState(null);
  useEffect(() => {
    let vivo = true;
    const k = String(contrato), e = cacheContactos.get(k);
    if (e && Date.now() - e.t < 60000) { setC(e.r); return undefined; }
    setC(null);
    Backend.contactos({ contrato: k }).then((r) => { cacheContactos.set(k, { t: Date.now(), r }); if (vivo) setC(r); }, () => { if (vivo) setC({ error: true }); });
    return () => { vivo = false; };
  }, [contrato]);
  return c;
}

function leerPeriodoCliente() {
  try { const v = localStorage.getItem(CLAVE_PER_CLIENTE); if (PERIODOS_AJUSTES.some((p) => p[0] === v)) return v; } catch (e) { /* sin almacenamiento */ }
  return '365';
}

function HistorialCliente({ rec, lista, now, rein, reporte }) {
  const [dias, setDias] = useState(90);
  const [per, setPerEstado] = useState(() => (reporte ? leerPeriodoCliente() : ''));
  const [fechas, setFechas] = useState(() => ({ desde: Model.isoDia(new Date(now).setDate(1)), hasta: Model.isoDia(now) }));
  const [copiado, setCopiado] = useState(false);
  const setPer = (p) => { setPerEstado(p); try { localStorage.setItem(CLAVE_PER_CLIENTE, p); } catch (e) { /* sin almacenamiento */ } };
  const rango = reporte ? Model.periodoAfectacion(per, now, fechas) : null;
  const h = Model.historialCliente(lista, rec, now, dias, rango);
  const enPer = reporte ? rango.en : PERIODOS_HIST.find((p) => p[0] === dias)[2];
  const c = useContactos(rec.contrato);
  // Cuántas veces llamó durante cada falla (Concentrix y Tiendas). En la falla activa no cuenta la llamada de
  // ahora (las consultas de los últimos 10 minutos): lo útil es saber si ya había llamado por esta falla.
  const llamadas = (f) => (!c || !c.veces ? 0 : Model.llamadasEn(c.veces, f.inicio, f.fin || now - 10 * U.MIN));
  // En Reportes: sus llamadas al Call Center y visitas a Tiendas en 30 días (las búsquedas de Workforce no cuentan)
  const llamadas30 = c && c.veces ? Model.llamadasEn(c.veces, now - 30 * U.DIA, now) : 0;
  const ultimaLlamada = c && c.veces && c.veces.length ? Math.max(...c.veces) : null;
  const hoyIso = Model.isoDia(now), minIso = Model.isoDia(new Date(now).setDate(new Date(now).getDate() - Model.DIAS_HISTORIAL));
  const cambiarFecha = (k) => (e) => { const v = e.target.value; if (v) setFechas((x) => Object.assign({}, x, { [k]: v })); };
  async function copiarAjustes() {
    const r = Model.resumenAfectacion(h, rec, now);
    if (!(await U.copiarHtml(r.html, r.texto))) { tostada('No se pudo copiar. Descarga el CSV o selecciona el texto y usa Ctrl+C.'); return; }
    setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    tostada('Resumen copiado: pégalo en el caso o en el correo con Ctrl+V');
  }
  function descargar() { const r = Model.resumenAfectacion(h, rec, now); U.descargarCsv(r.archivo, r.filas); }
  const pend = h.pendientes.length;
  return html`<section class="panel historial-cliente" aria-label="Historial de fallas del cliente">
    <div class="panel-cab">
      <h3>Historial de fallas de este cliente</h3>
      ${rein && html`<span class="marca-estado" data-s="FALLA" title=${CONFIG.reincidente.fallas + ' o más fallas en ' + CONFIG.reincidente.dias + ' días'}>Cliente reincidente</span>`}
      <div class="der"><div class="seg" role="group" aria-label="Periodo">
        ${reporte ? PERIODOS_AJUSTES.map(([k, t]) => html`<button type="button" aria-pressed=${per === k} onClick=${() => setPer(k)} key=${k}>${t}</button>`)
          : PERIODOS_HIST.map(([d, t]) => html`<button type="button" aria-pressed=${dias === d} onClick=${() => setDias(d)} key=${d}>${t}</button>`)}
      </div></div>
    </div>
    ${reporte && html`<div class="hist-barra">
      ${per === 'fechas' && html`<div class="hist-rango">
        <label>Desde <input class="input" type="date" value=${fechas.desde} min=${minIso} max=${hoyIso} onChange=${cambiarFecha('desde')} aria-label="Desde" /></label>
        <label>Hasta <input class="input" type="date" value=${fechas.hasta} min=${minIso} max=${hoyIso} onChange=${cambiarFecha('hasta')} aria-label="Hasta" /></label>
      </div>`}
      <span class="hist-periodo">${U.conMayuscula(Model.textoPeriodo(h.desde, h.hasta, now))}${h.desdeAlta ? ' (es cliente desde esa fecha)' : ''}</span>
      <div class="der">
        <button class="btn btn-borde btn-chico" type="button" onClick=${copiarAjustes} title="El cliente, el periodo, cada falla con su inicio, fin y duración, y el tiempo total. Se pega en el caso o en Outlook (con tabla)">
          <${Ico} n=${copiado ? 'check' : 'copiar'} s=${15} />${copiado ? 'Copiado' : 'Copiar para Ajustes'}</button>
        <button class="btn btn-borde btn-chico" type="button" onClick=${descargar}><${Ico} n="descargar" s=${15} />Descargar CSV</button>
      </div>
    </div>`}
    <div class="hist-kpis">
      <div><b class="num">${U.n(h.total)}</b><span>${U.plural(h.total, 'falla', 'fallas')} ${enPer}</span></div>
      ${reporte ? html`<div class="hist-total"><b class="num">${U.durHM(h.msConfirmado)}</b><span>tiempo total de afectación</span>
          <small>${U.n2(h.msConfirmado / U.HORA)} horas · ${U.n2(h.msConfirmado / U.DIA)} días</small>
          ${h.solape > 0 && html`<small>${U.durHM(h.solape)} en que coincidieron dos fallas cuenta una sola vez</small>`}
          ${pend > 0 && html`<small class="hist-pendiente">No suma ${pend === 1 ? 'la posible falla' : 'las ' + pend + ' posibles fallas'} en validación</small>`}</div>`
        : html`<div><b class="num">${h.total ? U.dur(h.ms) : '0 h'}</b><span>sin servicio en total</span></div>`}
      ${reporte ? html`<div><b class="num">${!c ? '…' : c.error ? '—' : U.n(llamadas30)}</b>
          <span>${U.plural(c && !c.error ? llamadas30 : 2, 'llamada', 'llamadas')} en 30 días</span>
          ${c && !c.error && html`<small>${ultimaLlamada ? 'La última: ' + fechaHist(ultimaLlamada, now) : 'No llamó en los últimos 30 días'}</small>`}</div>`
        : html`<div><b class="num">${!c ? '…' : c.error ? '—' : U.n(c.n7)}</b>
          <span>${U.plural(c && !c.error ? c.n7 : 2, 'consulta anterior', 'consultas anteriores')} en 7 días</span>
          ${c && !c.error && html`<small>${c.anterior ? 'La anterior: ' + fechaHist(c.anterior, now) : 'Sin consultas en los últimos 30 días'}</small>`}</div>`}
    </div>
    ${h.total ? html`<ol class="hist-lista">${h.fallas.map((f) => { const llamo = llamadas(f); return html`<li key=${f.id}>
        <span class="hist-punto" data-s=${f.fin ? 'RESUELTA' : 'FALLA'}></span>
        <div class="hist-motivo"><b>${nombreMotivo(f)}</b><span class="sub">Nodo ${rec.nodo}</span></div>
        <div class="num hist-fechas">${reporte ? fechasAjustes(f) : html`${fechaHist(f.inicio, now)} → ${f.fin ? fechaHist(f.fin, now) : 'sigue activa'}`}</div>
        <div class="num hist-dur">${reporte ? U.durHM(f.duracion) : U.dur((f.fin || now) - f.inicio)}${reporte && (Model.esPosible(f) ? html`<small>no se suma</small>`
          : f.recortada ? html`<small>${U.durHM(f.dentro)} en el periodo</small>` : !f.fin ? html`<small>hasta ahora</small>` : '')}</div>
        <div class="hist-etiquetas">${!f.fin && html`<span class="marca-estado" data-s="FALLA">${Model.esPosible(f) ? 'En validación' : 'Activa'}</span>`}${llamo > 0 && html`<span class="chip llamo" title=${f.fin ? 'Llamadas de este cliente durante la falla (varias búsquedas en la misma llamada cuentan una vez)' : 'Llamadas anteriores de este cliente durante esta falla, sin contar la de ahora'}>
          <${Ico} n="telefono" s=${13} />${f.fin ? U.plural(llamo, 'Llamó 1 vez', 'Llamó ' + llamo + ' veces') : U.plural(llamo, 'Ya había llamado 1 vez', 'Ya había llamado ' + llamo + ' veces')}</span>`}${f.numero && html`<span class="chip codigo">${U.numeroFalla(f)}</span>`}</div>
      </li>`; })}</ol>`
      : html`<div class="vacio hist-vacio"><b>Sin fallas ${enPer}</b>Workforce HN no ha registrado fallas en su nodo en este periodo.</div>`}
    <p class="sub hist-pie">Fallas registradas en Alertas para el nodo actual del cliente (${rec.nodo})${rec.fecha ? ', desde que es cliente' : ''}.${reporte
      ? ' El tiempo de afectación va del inicio al cierre de cada falla, en minutos; si dos fallas coinciden, ese tiempo cuenta una vez, y las posibles fallas en validación no se suman.' : ''} "Llamó" cuenta sus llamadas al Call Center y visitas a Tiendas durante cada falla, en los últimos 30 días.</p>
  </section>`;
}

function Veredicto({ v, rec, now }) {
  const f = v.falla;
  let titulo = '', l1 = '', l2 = '', sello = '';
  if (v.tipo === 'FALLA' && Model.esPosible(f)) {
    titulo = 'Posible falla general';
    l1 = 'Workforce HN está validando con el equipo técnico una posible falla en el nodo ' + rec.nodo + '.';
    l2 = 'Reportada desde ' + U.las(f.inicio) + ' (' + U.hace(f.inicio, now) + '). '
      + (f.eta && f.eta > now ? U.conPunto('Solución estimada: ' + U.cuandoCorto(f.eta, now)) : 'Todavía sin confirmar ni hora estimada.');
    sello = 'Posible falla, publicada ' + U.cuandoCorto(f.publicadaEn, now);
  } else if (v.tipo === 'FALLA') {
    titulo = 'Falla general';
    l1 = nombreMotivo(f) + ' en el nodo ' + rec.nodo + '.';
    l2 = 'Afectado desde ' + U.las(f.inicio) + ' (' + U.hace(f.inicio, now) + '). '
      + (f.eta ? (f.eta > now ? U.conPunto('Solución estimada: ' + U.cuandoCorto(f.eta, now)) : 'La hora estimada (' + U.hora(f.eta) + ') ya pasó; Workforce HN sigue dando seguimiento.') : 'Aún sin hora estimada de solución.');
    sello = 'Falla ' + U.numeroFalla(f) + ', publicada ' + U.cuandoCorto(f.publicadaEn, now);
  } else if (v.tipo === 'RESUELTA') {
    titulo = 'Falla resuelta';
    l1 = U.conPunto(nombreMotivo(f) + ' en el nodo ' + rec.nodo + ', solucionada ' + U.cuando(f.cerradaEn, now));
    l2 = 'Si el cliente sigue sin servicio, pídele reiniciar su equipo antes de escalar.';
    sello = 'Falla ' + U.numeroFalla(f);
  } else if (v.tipo === 'SIN_FALLA') {
    titulo = 'Sin falla general';
    l1 = 'El nodo ' + rec.nodo + ' no tiene fallas reportadas por Workforce HN.';
    l2 = 'Sigue con el flujo normal de soporte.';
  } else {
    titulo = 'Nodo sin identificar';
    l1 = 'El cliente está en un nodo virtual (' + rec.nodo + '), así que no se puede certificar una falla general.';
    l2 = 'Sigue con el flujo normal de soporte.';
  }
  return html`<div class="veredicto" data-s=${v.tipo} role="status" aria-live="polite">
    <div><h2>${titulo}</h2><p>${l1}</p><p>${l2}</p></div>
    <${Senal} tipo=${v.tipo} />
    ${sello && html`<span class="sello">${sello}</span>`}
  </div>`;
}

function TarjetaCliente({ rec, v, now }) {
  const empresa = U.esEmpresa(rec.nombre, rec.categoria);
  const nombre = empresa ? rec.nombre : U.titulo(rec.nombre);
  const gpon = rec.tecnologia === 'GPON';
  const puerto = gpon ? U.oltPuerto(rec.olt) : null;
  const tapVirtual = /VIRTUAL|VITUAL/.test(rec.nap || '');
  const dni = U.formatoDni(rec.dni);
  return html`<article class="panel cliente" aria-label="Datos del cliente">
    <h2 class="cliente-nombre">${nombre || 'Sin nombre en la base'}</h2>
    <div class="cliente-ids">
      <span>Contrato <b>${rec.contrato}</b><${BotonCopiar} texto=${rec.contrato} etiqueta="contrato" /></span>
      <span>DNI <b>${dni || 'Sin dato'}</b>${dni && html`<${BotonCopiar} texto=${dni} etiqueta="DNI" />`}</span>
      ${rec.categoria && rec.categoria !== 'RESIDENCIAL' && html`<span class="etiqueta-corp">${U.titulo(rec.categoria)}</span>`}
    </div>
    <div class="nodo-bloque" data-s=${v.tipo} data-largo=${rec.nodo.length > 9}>
      <span class="lbl">Nodo del cliente</span>
      <div class="nodo-codigo">${rec.nodo}</div>
      <div class="nodo-meta">
        <${Tec} t=${rec.tecnologia} />
        ${gpon && puerto && html`<span>OLT <b>${U.oltNombre(rec.olt)}</b>, tarjeta <b>${puerto.tarjeta}</b>, puerto <b>${puerto.puerto}</b></span>`}
        ${gpon && html`<span>NAP <b>${rec.nap}</b></span>`}
        ${!gpon && html`<span>${tapVirtual ? 'Tap sin asignar en sistema' : html`Tap <b>${rec.nap}</b>`}</span>`}
      </div>
    </div>
    <div class="datos">
      <div class="dato"><div class="l">Producto</div><div class="v num">${rec.producto || 'Sin dato'}</div></div>
      <div class="dato"><div class="l">Servicios</div><div class="v">${PLAY[rec.play] || 'Sin dato'}${rec.play && html`<small>${rec.play}</small>`}</div></div>
      <div class="dato"><div class="l">Cliente desde</div><div class="v">${U.fechaDias(rec.fecha)}${rec.fecha ? html`<small>${U.antiguedad(rec.fecha, now)} con nosotros</small>` : ''}</div></div>
      <div class="dato"><div class="l">Departamento</div><div class="v">${U.lugar(rec.departamento) || 'Sin dato'}</div></div>
      <div class="dato"><div class="l">Municipio</div><div class="v">${U.lugar(rec.municipio) || 'Sin dato'}</div></div>
      <div class="dato"><div class="l">Colonia</div><div class="v">${U.colonia(rec.colonia) || 'Sin dato'}</div></div>
      ${rec.megas && html`<div class="dato"><div class="l">Velocidad</div><div class="v">${rec.megas}</div></div>`}
    </div>
  </article>`;
}

/* ---------- Guion ---------- */
function partesGuion(v, rec, modo, now, rein) {
  const f = v.falla;
  const empresa = U.esEmpresa(rec.nombre, rec.categoria);
  const nombre = empresa ? '' : U.primerNombre(rec.nombre);
  const M = (x) => ({ v: x });
  const motivo = f ? clienteMotivo(f) : '';
  if (v.tipo === 'FALLA' && Model.esPosible(f)) {
    if (modo === 'chat') {
      return ['Hola', nombre ? ', ' : '', nombre ? M(nombre) : '', '. Validamos su contrato ', M(String(rec.contrato)),
        ': varios clientes de su zona nos reportaron el mismo inconveniente y nuestro equipo técnico ya está validando ', M('una posible falla general'),
        '. Lamentamos las molestias.', rein ? ' Sabemos que no es la primera vez que le pasa en los últimos meses.' : '', '\n\n',
        'Cuando se solucione, su servicio se restablecerá de forma automática. ¡Gracias por su paciencia!'];
    }
    return ['Le comento, ', nombre ? M(nombre) : 'estimado cliente', ', que validando su contrato vemos que varios clientes de su zona nos han reportado el mismo inconveniente, y nuestro equipo técnico ya está validando ',
      M('una posible falla general'), ' en la red que da servicio a su zona. Lamentamos mucho las molestias.',
      rein ? ' Sabemos que no es la primera vez que su servicio se ve afectado en los últimos meses y entendemos su molestia.' : '', '\n\n',
      'En cuanto se confirme y se solucione, su servicio se restablecerá de forma automática, sin que tenga que hacer nada.\n\n',
      'Le agradecemos mucho su paciencia y comprensión.'];
  }
  if (v.tipo === 'FALLA') {
    const etaOk = f.eta && f.eta > now;
    const etaTxt = etaOk ? (U.esHoy(f.eta, now) ? 'alrededor de ' + U.las(f.eta) : U.diaRel(f.eta, now) + ' alrededor de ' + U.las(f.eta)) : '';
    if (modo === 'chat') {
      return ['Hola', nombre ? ', ' : '', nombre ? M(nombre) : '', '. Validamos su contrato ', M(String(rec.contrato)),
        ' y su servicio se encuentra dentro de una afectación general por ', M(motivo), '. Lamentamos mucho las molestias.',
        rein ? ' Sabemos que no es la primera vez que le pasa en los últimos meses.' : '', '\n\n',
        'Nuestro equipo técnico ya trabaja para restablecerlo lo antes posible', etaOk ? ' (hora estimada: ' : '', etaOk ? M(etaTxt.replace('alrededor de las ', '')) : '', etaOk ? ')' : '',
        '. No necesita reiniciar sus equipos; el servicio volverá de forma automática.\n\n¡Gracias por su paciencia!'];
    }
    return ['Le comento, ', nombre ? M(nombre) : 'estimado cliente', ', que validando su contrato en nuestro sistema vemos que su servicio depende de un nodo que en este momento presenta una afectación por ',
      M(motivo), '. Lamentamos mucho las molestias que esto le ocasiona.',
      rein ? ' Sabemos que no es la primera vez que su servicio se ve afectado en los últimos meses y entendemos su molestia.' : '', '\n\n',
      'Nuestro equipo técnico ya está trabajando para solventar la falla en el menor tiempo posible', etaOk ? ', y estimamos que su servicio quede restablecido ' : '', etaOk ? M(etaTxt) : '',
      (etaOk && /\.$/.test(etaTxt) ? ' ' : '. ') + 'No es necesario que reinicie sus equipos: una vez se solucione, el servicio se restablecerá de forma automática.\n\n',
      'Le agradecemos mucho su paciencia y comprensión.'];
  }
  if (v.tipo === 'RESUELTA') {
    const cuando = U.cuando(f.cerradaEn, now);
    if (modo === 'chat') {
      return ['Hola', nombre ? ', ' : '', nombre ? M(nombre) : '', '. Validamos su contrato ', M(String(rec.contrato)), ': la afectación por ', M(motivo),
        ' ya fue solucionada ', M(cuando), (/\.$/.test(cuando) ? ' ' : '. ') + 'Lamentamos las molestias.',
        rein ? ' Sabemos que no es la primera vez que le pasa en los últimos meses.' : '', '\n\n',
        'Para normalizar su servicio, por favor apague su equipo, desconéctelo de la corriente 30 segundos y vuelva a conectarlo. Si continúa sin servicio, escríbanos y con gusto lo seguimos revisando.'];
    }
    return ['Le comento, ', nombre ? M(nombre) : 'estimado cliente', ', que validando su contrato vemos que su servicio se vio afectado por ', M(motivo),
      ', la cual nuestro equipo técnico ya solucionó ', M(cuando), (/\.$/.test(cuando) ? ' ' : '. ') + 'Lamentamos las molestias ocasionadas.',
      rein ? ' Sabemos que no es la primera vez que su servicio se ve afectado en los últimos meses.' : '', '\n\n',
      'Para que su servicio se normalice, le pido por favor apagar su equipo, desconectarlo de la corriente por 30 segundos y volverlo a conectar. Si después de eso continúa sin servicio, con gusto lo seguimos revisando.'];
  }
  return [];
}

function Guion({ rec, v, now, rein }) {
  const u = G.s.user;
  const [modo, setModoEstado] = useState(leerLS('alertas-modo-guion', 'llamada'));
  const setModo = (m) => { guardarLS('alertas-modo-guion', m); setModoEstado(m); };
  const [reportado, setReportado] = useState(false);
  const recos = (v.tipo === 'FALLA' && Model.esPosible(v.falla) ? CONFIG.recomendaciones.POSIBLE : CONFIG.recomendaciones[v.tipo]) || [];
  const nota = Model.notaQflow(v, rec, now);
  const [notaCopiada, setNotaCopiada] = useState('');
  const conGuion = v.tipo === 'FALLA' || v.tipo === 'RESUELTA';
  const partes = conGuion ? partesGuion(v, rec, modo, now, rein) : [];
  const texto = partes.map((p) => (typeof p === 'string' ? p : p.v)).join('');
  async function reportar() {
    setReportado(true);
    try { await A.reportar(rec); tostada('Aviso enviado a Workforce HN'); } catch (e) { setReportado(false); tostada(e.message); }
  }
  return html`<aside class="panel guion" aria-label="Guion para el cliente">
    <div class="guion-cab">
      <h3>${conGuion ? 'Qué decirle al cliente' : 'Siguiente paso'}</h3>
      ${conGuion && html`<div class="seg" role="group" aria-label="Canal">
        <button type="button" aria-pressed=${modo === 'llamada'} onClick=${() => setModo('llamada')}>Llamada</button>
        <button type="button" aria-pressed=${modo === 'chat'} onClick=${() => setModo('chat')}>Chat</button>
      </div>`}
    </div>
    ${conGuion
      ? html`<div class="guion-texto"><${Resaltado} partes=${partes} /></div>
        <div class="guion-acciones">
          <button class="btn btn-primario" onClick=${async () => { if (await U.copiar(texto)) tostada('Guion copiado'); }}><${Ico} n="copiar" s=${16} />Copiar guion</button>
        </div>`
      : html`<div class="guion-texto">${v.tipo === 'SIN_FALLA'
          ? 'No hay una falla general publicada para el nodo ' + rec.nodo + '. Atiende el caso con el flujo normal de soporte en los sistemas internos.'
          : 'Este cliente no tiene un nodo real asignado. Atiende el caso con el flujo normal de soporte en los sistemas internos.'}</div>
        ${v.tipo === 'SIN_FALLA' && html`<div class="guion-acciones">
          <button class="btn btn-borde" disabled=${reportado} onClick=${reportar}><${Ico} n="bandera" s=${16} />${reportado ? 'Aviso enviado' : 'Reportar posible falla en ' + rec.nodo}</button>
        </div>`}`}
    ${recos.length > 0 && html`<ul class="recos">${recos.map((r) => html`<li><${Ico} n="derecha" s=${16} /><span>${r}</span></li>`)}</ul>`}
    ${nota && html`<div class="nota-qflow">
      <div class="nota-qflow-cab"><span>Nota del caso para Qflow</span>
        <button class="btn btn-borde btn-chico" onClick=${async () => { if (await U.copiar(nota)) { setNotaCopiada(nota); tostada('Nota copiada: pégala en la descripción del caso en Qflow'); } }}>
          <${Ico} n=${notaCopiada === nota ? 'check' : 'copiar'} s=${15} />${notaCopiada === nota ? 'Nota copiada' : 'Copiar nota del caso'}</button></div>
      <p>${nota}</p>
    </div>`}
  </aside>`;
}

/* ---------- Estado inicial del asesor ---------- */
const ETIQUETA_RESULTADO = { FALLA: 'Falla', RESUELTA: 'Resuelta', SIN_FALLA: 'Sin falla', SIN_NODO: 'Nodo virtual', NO_ENCONTRADO: 'No encontrado' };

function InicioAsesor({ mf, onAbrir }) {
  const s = useG();
  const hoy = U.inicioDia(s.now);
  const mias = s.misConsultas.filter((l) => l.t >= hoy);
  const conFalla = mias.filter((l) => l.r === 'FALLA').length;
  const recientes = mias.slice(0, 8);
  return html`<div class="inicio">
    <div class="panel mini-kpis">
      <div><b class="num">${U.n(mias.length)}</b><span>Tus consultas de hoy</span></div>
      <div><b class="num">${U.n(conFalla)}</b><span>Con falla general${mias.length ? ' (' + U.pct(conFalla, mias.length) + ' %)' : ''}</span></div>
      <div><b class="num">${U.n(mf.clientesActivos)}</b><span>Clientes en fallas activas</span></div>
    </div>
    <${MapaVivo} mf=${mf} />
    <div class="panel">
      <div class="panel-cab"><h3>Tus últimas consultas</h3><span class="der sub">Hoy</span></div>
      ${recientes.length
        ? html`<ul class="recientes">${recientes.map((l, k) => html`<li key=${k}>
            <button disabled=${!l.contrato} onClick=${() => l.contrato && onAbrir(l.contrato)}>
              <span class="hora">${U.hora(l.t)}</span>
              <span class="quien">${l.contrato ? html`${l.nombre || 'Contrato ' + l.contrato}<small>Contrato ${l.contrato}${l.nodo ? ', nodo ' + l.nodo : ''}</small>` : 'Búsqueda sin resultado'}</span>
              <span class="marca-estado" data-s=${l.r}>${ETIQUETA_RESULTADO[l.r] || l.r}</span>
            </button></li>`)}</ul>`
        : html`<div class="vacio"><b>Aún no has consultado clientes hoy</b>Escribe el contrato o el DNI arriba y presiona Enter.</div>`}
    </div>
  </div>`;
}

/* ---------- Mapa en vivo: las fallas activas del país ----------
   Un panel oscuro, como una pantalla de monitoreo: un círculo que late por cada departamento afectado (del
   tamaño de sus clientes), los totales, lo de la última hora y los últimos movimientos. Se dibuja en un lienzo
   de tamaño fijo (Model.VIVO) que se escala al ancho del panel: así las etiquetas se colocan una sola vez, sin
   encimarse, y nada se descuadra en una pantalla más chica o más grande. En un panel angosto (un teléfono) el
   lienzo queda solo con el mapa y sus círculos, y los letreros bajan uno tras otro. */
const VIVO_ANGOSTO = 780, VIVO_MOVIMIENTOS = 4;
const VIVO_TIERRA = [29, 36, 45], VIVO_ROJO = [226, 68, 79];
const tinteVivo = (t) => 'rgb(' + VIVO_TIERRA.map((c, i) => Math.round(c + (VIVO_ROJO[i] - c) * t)).join(',') + ')';

function MapaVivo({ mf }) {
  const s = useG();
  const V = Model.VIVO;
  const ref = useRef(null);
  const ancho = useAncho(ref, V.w);
  const tt = useTooltip();
  const [tabla, setTabla] = useState(false);
  const v = useMemo(() => Model.mapaVivo(s.cat, mf, s.now, s.avisos), [s.cat, mf, s.now, s.avisos]);
  const movs = v.movimientos.slice(0, VIVO_MOVIMIENTOS);
  const hayHora = v.fallas > 0 || v.nuevas > 0 || v.resueltas > 0;
  const haySueltos = v.deps.some((d) => !d.principal);
  const angosto = ancho < VIVO_ANGOSTO;
  const esc = useMemo(() => Model.escenaVivo(v, HN_NOMBRES, angosto ? [] : Model.fijosVivo({ hora: hayHora, leyenda: v.departamentos > 0, movimientos: movs.length })),
    [v, angosto, hayHora, movs.length]);
  const k = Math.min(1.25, ancho / V.w);
  const porDep = new Map(v.deps.map((d) => [d.k, d]));
  const max = Math.max(1, ...v.deps.filter((d) => d.principal).map((d) => d.clientes));
  const nombreDep = (clave, crudo) => (HN_MAPA.deps[clave] ? HN_MAPA.deps[clave].name : U.lugar(crudo || clave));
  const clientesTxt = (n) => U.n(n) + (n === 1 ? ' cliente' : ' clientes');
  const fallasTxt = (n) => U.plural(n, '1 falla', n + ' fallas');
  const detalleDep = (d) => (d.principal ? fallasTxt(d.fallas) + ' · desde ' + U.hace(d.desde, s.now) : 'de una falla de otro departamento');
  const aviso = (clave) => {
    const d = porDep.get(clave);
    return d ? html`<div class="tl">${nombreDep(clave)}</div><div class="tv">${clientesTxt(d.clientes)}</div><div class="tl">${detalleDep(d)}</div>`
      : html`<div class="tl">${nombreDep(clave)}</div><div class="tv">Sin fallas activas</div>`;
  };
  const alCentro = (e, clave) => { const b = e.currentTarget.getBoundingClientRect(); tt.mostrar({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }, aviso(clave)); };
  // En la leyenda, los círculos van al mismo tamaño que en el mapa (en un panel angosto el mapa va reducido)
  const disco = (n) => { const d = Math.max(6, Math.round(2 * Model.radioVivo(n) * (angosto ? k : 1))); return 'width:' + d + 'px;height:' + d + 'px'; };
  const zonaMov = (m) => (m.zona.length ? ' en ' + U.listaNatural(m.zona.map((z) => nombreDep(Model.claveDep(z), z)), 2) : '');
  const haceMov = (t) => (s.now - t < U.MIN ? 'ahora' : U.hace(t, s.now));
  const cada = CONFIG.segundosRevision === 60 ? 'cada minuto' : 'cada ' + CONFIG.segundosRevision + ' s';

  const total = html`<div class="vivo-total">
    ${v.fallas
      ? html`<div class="l">Clientes afectados</div><div class="v num">${U.n(v.clientes)}</div>
          <div class="d"><b>${fallasTxt(v.fallas)} · ${U.plural(v.nodos, '1 nodo', U.n(v.nodos) + ' nodos')}</b></div>
          <div class="d">${U.plural(v.departamentos, '1 departamento', v.departamentos + ' departamentos')}</div>`
      : html`<div class="v sin">Sin fallas activas</div><div class="d">${CONFIG.equipo} no ha publicado fallas en este momento.</div>`}
  </div>`;
  const hora = hayHora && html`<div class="vivo-hora">
    <div><b>${v.nuevas || v.resueltas
      ? html`<span class="n-falla num">${v.nuevas}</span> ${U.plural(v.nuevas, 'nueva', 'nuevas')} · <span class="n-res num">${v.resueltas}</span> ${U.plural(v.resueltas, 'resuelta', 'resueltas')}`
      : 'Sin cambios'}</b><span>en la última hora</span></div>
    ${v.antigua && html`<div><b class="num">${U.dur(s.now - v.antigua.inicio)}</b><span>lleva la más antigua</span></div>`}
  </div>`;
  const leyenda = v.departamentos > 0 && html`<div class="vivo-leyenda">
    <div><span class="ico"><i class="vivo-disco" style=${disco(1000)}></i></span>1,000 clientes</div>
    <div><span class="ico"><i class="vivo-disco" style=${disco(100)}></i></span>200 o menos</div>
    ${haySueltos && html`<div><span class="ico"><i class="vivo-pto"></i></span>Pocos clientes de una falla vecina</div>`}
    <div><span class="ico"><i class="vivo-cuenta">2</i></span>Fallas en el departamento</div>
  </div>`;
  const movimientos = movs.length > 0 && html`<div class="vivo-movs">
    <h4>Últimos movimientos</h4>
    <ul>${movs.map((m) => { const titulo = cortoMotivo(m.falla) + zonaMov(m); return html`<li key=${m.id} data-t=${m.tipo}><i></i><div><b title=${titulo}>${titulo}</b>
      <span>${m.tipo === 'RESUELTA' ? 'Resuelta ' + haceMov(m.t) + ' · duró ' + U.dur(m.duracion)
        : (m.tipo === 'REABIERTA' ? 'Reabierta ' : 'Publicada ') + haceMov(m.t) + (m.clientes ? ' · ' + clientesTxt(m.clientes) : '')}</span></div></li>`; })}</ul>
  </div>`;
  // En un panel angosto no hay nombres ni etiquetas en el mapa: los departamentos que solo tienen un punto lo conservan
  const puntos = angosto ? esc.nombres.filter((n) => n.d).concat(esc.puntos) : esc.puntos;

  return html`<section class="panel vivo-panel" ref=${ref} aria-label="Fallas activas en Honduras, en vivo">
    <div class="vivo-cab">
      <span class="vivo-estado" data-e=${s.sinConexion ? 'sin' : 'vivo'}><span class=${'punto' + (s.sinConexion ? '' : ' vivo')}></span>${s.sinConexion ? 'Sin conexión' : 'En vivo'}</span>
      <h3>Fallas activas en Honduras</h3>
      <div class="der">
        <span class="vivo-revisado"><b class="num">${U.hora(s.revisado || s.now)}</b> · ${s.sinConexion ? 'lo último que llegó' : 'se actualiza solo ' + cada}</span>
        <button type="button" class="vivo-ver-tabla" aria-expanded=${tabla} onClick=${() => setTabla(!tabla)}>${tabla ? 'Ocultar tabla' : 'Ver como tabla'}</button>
      </div>
    </div>
    <div class="vivo-lienzo" style=${'height:' + Math.round(V.h * k) + 'px'}>
      <div class="vivo-escena" style=${'transform:scale(' + k + ')'}>
        <svg class="vivo-tierra" viewBox=${'0 0 ' + HN_MAPA.w + ' ' + HN_MAPA.h} aria-hidden="true"
          style=${'left:' + V.x + 'px;top:' + V.y + 'px;width:' + HN_MAPA.w * V.s + 'px;height:' + HN_MAPA.h * V.s + 'px'}>
          ${Object.entries(HN_MAPA.deps).map(([clave, dep]) => { const d = porDep.get(clave); return html`<path key=${clave} d=${dep.d}
            style=${d && d.principal ? 'fill:' + tinteVivo(0.07 + 0.11 * Math.sqrt(d.clientes / max)) : ''}
            onPointerMove=${(e) => tt.mostrar(e, aviso(clave))} onPointerLeave=${tt.ocultar} />`; })}
        </svg>
        ${!angosto && esc.nombres.map((n) => html`<div class="vivo-nombre" key=${'n-' + n.id} style=${'left:' + n.x + 'px;top:' + n.y + 'px'} aria-hidden="true">
          ${n.lineas.map((l, i) => html`${i ? html`<br />` : null}${l}`)}${n.d && html`<i class="vivo-pto"></i>`}</div>`)}
        ${puntos.map((n) => html`<i class="vivo-pto suelto" key=${'p-' + n.id} style=${'left:' + n.x + 'px;top:' + n.y + 'px'} aria-hidden="true"></i>`)}
        ${esc.marcas.map((m, i) => html`<div class="vivo-marca" key=${'m-' + m.id} data-dep=${m.id} tabindex="0" role="img"
          aria-label=${m.nombre + ': ' + clientesTxt(m.d.clientes) + ', ' + detalleDep(m.d)}
          style=${'left:' + m.x + 'px;top:' + m.y + 'px;width:' + 2 * m.r + 'px;height:' + 2 * m.r + 'px'}
          onPointerMove=${(e) => tt.mostrar(e, aviso(m.id))} onPointerLeave=${tt.ocultar} onFocus=${(e) => alCentro(e, m.id)} onBlur=${tt.ocultar}>
          <span class="vivo-onda" style=${'animation-delay:' + (i % 4) * 0.8 + 's'}></span>${m.r >= 9 && html`<i></i>`}</div>`)}
        ${!angosto && esc.marcas.filter((m) => m.etiqueta).map((m) => html`<div class="vivo-etq" key=${'e-' + m.id} data-dep=${m.id} data-lado=${m.etiqueta.lado} aria-hidden="true"
          style=${'left:' + m.etiqueta.x + 'px;top:' + m.etiqueta.y + 'px;width:' + m.etiqueta.w + 'px'}>
          <b>${m.nombre}<i class="vivo-cuenta">${m.d.fallas}</i></b><span><strong class="num">${U.n(m.d.clientes)}</strong>${m.d.clientes === 1 ? ' cliente' : ' clientes'}</span></div>`)}
        ${!angosto && html`${total}${hora}${leyenda}${movimientos}`}
      </div>
    </div>
    ${angosto && html`<div class="vivo-abajo">
      ${total}${hora}
      ${esc.marcas.length > 0 && html`<ul class="vivo-lista">${esc.marcas.map((m) => html`<li key=${m.id}><b>${m.nombre}<i class="vivo-cuenta">${m.d.fallas}</i></b><span class="num">${clientesTxt(m.d.clientes)}</span></li>`)}</ul>`}
      ${movimientos}${leyenda}
    </div>`}
    ${tabla && html`<div class="vivo-tabla"><table class="tabla">
      <thead><tr><th>Departamento</th><th class="der">Clientes afectados</th><th class="der">Fallas</th><th class="der">Desde</th></tr></thead>
      <tbody>${v.deps.length
        ? v.deps.map((d) => html`<tr key=${d.k}><td>${nombreDep(d.k, d.nombre)}</td><td class="der">${U.n(d.clientes)}</td>
            <td class="der">${d.principal ? d.fallas : html`<span class="sub">de otro departamento</span>`}</td><td class="der">${U.hace(d.desde, s.now)}</td></tr>`)
        : html`<tr><td colspan="4" class="sub">Sin fallas activas en el país.</td></tr>`}</tbody>
    </table></div>`}
    ${tt.nodo}
  </section>`;
}

/* ---------- Comunicados: avisos informativos de Workforce que no son una falla de nodo ----------
   Solo título y contexto (por ejemplo, una falla general de DTH o de canales). Van arriba de las fallas, en violeta
   y con la etiqueta "Informativo", hasta que Workforce los retira. No cambian el resultado de ninguna consulta. */
const cuandoComunicado = (verbo, ts, now) => (U.esHoy(ts, now)
  ? verbo + ' a ' + U.las(ts) + ', ' + (now - ts < U.MIN ? 'ahora' : U.hace(ts, now)) : verbo + ' ' + U.cuando(ts, now));
/* Un comunicado en el panel. El contexto se corta a 4 líneas con "Ver todo"; al tocarlo se abre completo (ahí el
   texto se puede seleccionar y copiar) y dice quién lo publicó. donde: el panel o la parte de arriba de la consulta
   (el mismo comunicado sale en los dos sitios y cada uno necesita su propio id). previa: la vista previa de
   Workforce, que no se abre. */
function ComunicadoItem({ c, now, donde, previa }) {
  const [abierto, setAbierto] = useState(false);
  const [cortado, setCortado] = useState(false);
  const ref = useRef(null);
  // ¿El contexto no cabe en las líneas que se ven? Se mide en pantalla y se vuelve a medir si cambia el ancho
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setCortado(el.scrollHeight > el.clientHeight + 1);
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [c.contexto, abierto]);
  const marca = Model.marcaComunicado(c, now);
  const idDet = 'com-det-' + (donde || 'panel') + '-' + c.id;
  const cabeza = html`<div class="com-cab"><span class="com-etiqueta"><${Ico} n="megafono" s=${15} />Informativo</span>
      ${marca && html`<span class="com-marca"><i></i>${marca === 'NUEVO' ? 'Nuevo' : 'Actualizado'}</span>`}</div>
    <div class="com-titulo">${c.titulo}</div>`;
  const resumen = html`<div class="com-contexto" ref=${ref}>${c.contexto}</div>
    ${cortado && html`<span class="com-ver">Ver todo</span>`}
    <div class="com-meta">${c.editadoEn ? cuandoComunicado('Actualizado', c.editadoEn, now) : cuandoComunicado('Publicado', c.publicadoEn, now)}</div>`;
  if (previa) return html`<div class="com-item"><div class="com-item-cab">${cabeza}${resumen}</div></div>`;
  return html`<div class="com-item" data-abierto=${abierto}>
    <button type="button" class="com-item-cab" aria-expanded=${abierto} aria-controls=${idDet} onClick=${() => setAbierto(!abierto)}>
      ${cabeza}${!abierto && resumen}
    </button>
    ${abierto && html`<div class="com-det" id=${idDet}>
      <div class="com-contexto completo">${c.contexto}</div>
      <div><button type="button" class="enlace com-menos" onClick=${() => setAbierto(false)}>Ver menos</button></div>
      <div class="com-pie">
        <span>${cuandoComunicado('Publicado', c.publicadoEn, now)}</span>
        ${c.editadoEn && html`<span>${cuandoComunicado('Actualizado', c.editadoEn, now)}</span>`}
        ${c.publicadoPor && c.publicadoPor.nombre && html`<span>Por ${c.publicadoPor.nombre}</span>`}
      </div>
    </div>`}
  </div>`;
}
/* En una pantalla angosta el panel de fallas queda debajo de la consulta: ahí los comunicados suben al principio
   (con el contexto a 2 líneas), para que nadie tenga que bajar a buscarlos. En pantallas anchas esto no se ve. */
function ComunicadosArriba({ lista, now }) {
  return html`<div class="com-arriba" role="region" aria-label="Comunicados">
    <h4><span>Comunicados</span><span>${lista.length}</span></h4>
    ${lista.map((c) => html`<${ComunicadoItem} c=${c} now=${now} donde="arriba" key=${c.id} />`)}
  </div>`;
}

/* ---------- Riel con los comunicados y las fallas activas y recientes ---------- */
function RielFallas({ mf, now, comunicados }) {
  const s = useG();
  // A quien publica la base: las colonias salen cuando se vuelve a publicar una base de antes de que se guardaran
  const faltanColonias = s.cat && !s.cat.conColonias && puede('base') && mf.activas.length + mf.resueltas.length > 0;
  return html`<aside class="panel riel" aria-label="Fallas en la red">
    <div class="panel-cab"><h2>Fallas en la red</h2><span class="der sub">${mf.activas.length ? U.n(mf.clientesActivos) + ' clientes afectados' : ''}</span></div>
    ${faltanColonias && html`<div class="nota atencion riel-nota falta-colonias"><${Ico} n="info" s=${16} /><span>Las colonias salen al volver a publicar la base en <a href="#base" onClick=${() => ir('base')}>Base</a>: sirve el mismo Excel de esta semana.</span></div>`}
    ${comunicados && comunicados.length > 0 && html`<div class="riel-seccion com-seccion">
      <h4><span>Comunicados</span><span>${comunicados.length}</span></h4>
      ${comunicados.map((c) => html`<${ComunicadoItem} c=${c} now=${now} key=${c.id} />`)}
    </div>`}
    <div class="riel-seccion">
      <h4><span>Activas</span><span>${mf.activas.length}</span></h4>
      ${mf.activas.length ? mf.activas.map((f) => html`<${FallaItem} f=${f} now=${now} key=${f.id} />`)
        : html`<div class="vacio" style="padding:14px 8px"><b>Sin fallas activas</b>Workforce HN no ha publicado fallas en este momento.</div>`}
    </div>
    <div class="riel-seccion">
      <h4><span>Resueltas, visibles ${CONFIG.horasVisibleTrasCierre} h</span><span>${mf.resueltas.length}</span></h4>
      ${mf.resueltas.length ? mf.resueltas.map((f) => html`<${FallaItem} f=${f} now=${now} key=${f.id} />`)
        : html`<div class="vacio" style="padding:10px 8px">Ninguna en las últimas ${CONFIG.horasVisibleTrasCierre} h.</div>`}
    </div>
  </aside>`;
}

/* Una falla en el panel: el departamento con sus nodos (los primeros 3 y cuántos más) y, debajo, las colonias con
   más clientes. Al tocarla se ven sus colonias por municipio y, si son más de 3 nodos, todos los nodos. */
const COLONIAS_POR_MUNICIPIO = 6, NODOS_A_LA_VISTA = 3;
function FallaItem({ f, now }) {
  const s = useG();
  const [abierto, setAbierto] = useState(false);
  const [todas, setTodas] = useState(false);
  const [verNodos, setVerNodos] = useState(false);
  const zona = useMemo(() => Model.zonaFalla(s.cat, f), [s.cat, f]);
  const activa = f.estado === 'ACTIVA';
  const restante = activa ? 0 : CONFIG.horasVisibleTrasCierre * U.HORA - (now - f.cerradaEn);
  const imp = f.impacto || { total: 0, hfc: 0, gpon: 0, deps: [] };
  const L = U.lugar;
  const unDep = zona.deps.length === 1;
  const nodos = U.listaNatural(f.nodos, NODOS_A_LA_VISTA);
  const masColonias = zona.colonias - zona.top.length;
  // Debajo: las colonias con más clientes; con una base de antes, que no las trae, los municipios (sin repetir el
  // departamento cuando el único municipio se llama igual, como La Paz)
  const munis = unDep && zona.munis.length === 1 && zona.munis[0] === zona.deps[0] ? [] : zona.munis;
  const debajo = zona.top.length
    ? (masColonias > 0 ? zona.top.join(', ') + ' y ' + U.plural(masColonias, '1 colonia más', U.n(masColonias) + ' colonias más') : U.listaNatural(zona.top, 3))
    : U.listaNatural(munis.map(L), 3);
  const grupos = zona.grupos ? zona.grupos.filter((g) => todas || g.principal) : [];
  const hayMas = !!zona.grupos && zona.grupos.some((g) => !g.principal || g.cols.length > COLONIAS_POR_MUNICIPIO);
  const muchosNodos = f.nodos.length > NODOS_A_LA_VISTA;
  const idDet = 'falla-det-' + f.id;
  return html`<div class="falla-item" data-s=${f.estado}>
    <button type="button" class="falla-item-cab" aria-expanded=${abierto} aria-controls=${idDet} onClick=${() => setAbierto(!abierto)}>
      <div class="t"><span>${cortoMotivo(f)}</span><span class="id">${U.numeroFalla(f)}</span></div>
      ${zona.deps.length
        ? html`<div class="zona"><${Ico} n="pin" s=${15} /><span><b>${U.listaNatural(zona.deps.map(L), 3)}</b> · <span class="nodos-zona">${nodos}</span></span></div>`
        : html`<div class="nodos">${nodos}</div>`}
      ${debajo && html`<div class="colonias">${debajo}</div>`}
      <div class="m">
        ${activa ? html`<span>Desde ${U.las(f.inicio)}, ${U.hace(f.inicio, now)}</span>${f.eta && html`<span>Solución estimada: ${U.cuandoCorto(f.eta, now)}</span>`}`
          : html`<span>Resuelta ${U.cuandoCorto(f.cerradaEn, now)}</span><span>Se oculta en ${U.dur(restante)}</span>`}
        <span class="impacto-linea"><span><b class="num">${U.n(imp.total)}</b> clientes</span>
          ${imp.hfc > 0 && html`<span class="tec" data-t="HFC">HFC${imp.gpon > 0 ? ' ' + U.n(imp.hfc) : ''}</span>`}
          ${imp.gpon > 0 && html`<span class="tec" data-t="GPON">GPON${imp.hfc > 0 ? ' ' + U.n(imp.gpon) : ''}</span>`}</span>
      </div>
    </button>
    ${abierto && html`<div class="det" id=${idDet}>
      ${zona.grupos
        ? grupos.map((g) => html`<div class="zona-grupo" key=${g.dep + '|' + g.muni}>
            <div class="zona-muni"><b>${L(g.muni) || 'Sin municipio'}</b>${(!unDep || !g.principal) && g.dep ? html`<span>${L(g.dep)}</span>` : ''}
              <span class="cuantos">${U.plural(g.n, '1 cliente', U.n(g.n) + ' clientes')}</span></div>
            <div class="zona-cols">
              ${(todas ? g.cols : g.cols.slice(0, COLONIAS_POR_MUNICIPIO)).map(([c]) => html`<span class="chip" key=${c}>${c}</span>`)}
              ${!todas && g.cols.length > COLONIAS_POR_MUNICIPIO && html`<button type="button" class="chip mas" title="Ver todas las colonias" onClick=${() => setTodas(true)}>+${U.n(g.cols.length - COLONIAS_POR_MUNICIPIO)}</button>`}
            </div>
          </div>`)
        : (imp.munis || []).length > 0 && html`<div class="zona-cols">${imp.munis.map(([m, n]) => html`<span class="chip" key=${m}>${L(m)} · ${U.n(n)}</span>`)}</div>`}
      ${(hayMas || muchosNodos) && html`<div class="det-acc">
        ${hayMas && html`<button type="button" class="enlace" onClick=${() => setTodas(!todas)}>${todas ? 'Ver menos' : 'Ver las ' + U.n(zona.colonias) + ' colonias'}</button>`}
        ${muchosNodos && html`<button type="button" class="enlace" aria-expanded=${verNodos} onClick=${() => setVerNodos(!verNodos)}>${verNodos ? 'Ocultar los nodos' : 'Ver los ' + U.n(f.nodos.length) + ' nodos'}</button>`}
      </div>`}
      ${verNodos && html`<div class="zona-cols nodos-falla">${f.nodos.map((n) => html`<span class="chip codigo" key=${n}>${n}</span>`)}</div>`}
      <div class="sub">${U.conPunto('Publicada por ' + f.publicadaPor.nombre + ', ' + U.cuandoCorto(f.publicadaEn, now))}</div>
    </div>`}
  </div>`;
}
