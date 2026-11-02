/* ==========================================================================
   ALERTAS · Vista de Consulta (Concentrix, Tiendas y todo el equipo)
   ========================================================================== */

const PLAY = { '3P': 'Triple play', '2P': 'Doble play', '1P': 'Un servicio' };

function VistaConsulta() {
  const s = useG();
  const mf = useMemo(() => Model.mapaFallas(s.fallas, s.now), [s.fallas, s.now]);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const ultima = useRef({ q: '', t: 0, res: null });

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
    <${RielFallas} mf=${mf} now=${s.now} />
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
function Resultado({ res, sel, setSel, now }) {
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
    <div class="cliente-guion">
      <${TarjetaCliente} rec=${actual.rec} v=${actual.v} now=${now} />
      <${Guion} rec=${actual.rec} v=${actual.v} now=${now} rein=${rein} key=${actual.rec.i + actual.v.tipo} />
    </div>
    ${lista && html`<${HistorialCliente} rec=${actual.rec} lista=${lista} now=${now} rein=${rein} key=${actual.rec.i} />`}
  </div>`;
}

/* ---------- Historial de fallas del cliente ---------- */
const PERIODOS_HIST = [[90, '90 días', 'en 90 días'], [180, '6 meses', 'en 6 meses'], [365, '1 año', 'en 1 año']];
const fechaHist = (t, now) => (U.esHoy(t, now) ? 'Hoy, ' + U.hora(t) : U.dia(t) + ', ' + U.hora(t));
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

function HistorialCliente({ rec, lista, now, rein }) {
  const [dias, setDias] = useState(90);
  const per = PERIODOS_HIST.find((p) => p[0] === dias);
  const h = Model.historialCliente(lista, rec, now, dias);
  const c = useContactos(rec.contrato);
  const wf = puede('fallas');
  return html`<section class="panel historial-cliente" aria-label="Historial de fallas del cliente">
    <div class="panel-cab">
      <h3>Historial de fallas de este cliente</h3>
      ${rein && html`<span class="marca-estado" data-s="FALLA" title=${CONFIG.reincidente.fallas + ' o más fallas en ' + CONFIG.reincidente.dias + ' días'}>Cliente reincidente</span>`}
      <div class="der"><div class="seg" role="group" aria-label="Periodo">
        ${PERIODOS_HIST.map(([d, t]) => html`<button type="button" aria-pressed=${dias === d} onClick=${() => setDias(d)} key=${d}>${t}</button>`)}
      </div></div>
    </div>
    <div class="hist-kpis">
      <div><b class="num">${U.n(h.total)}</b><span>${U.plural(h.total, 'falla', 'fallas')} ${per[2]}</span></div>
      <div><b class="num">${h.total ? U.dur(h.ms) : '0 h'}</b><span>sin servicio en total</span></div>
      <div><b class="num">${!c ? '…' : c.error ? '—' : U.n(c.n7)}</b>
        <span>${U.plural(c && !c.error ? c.n7 : 2, 'consulta anterior', 'consultas anteriores')} en 7 días</span>
        ${c && !c.error && html`<small>${c.anterior ? 'La anterior: ' + fechaHist(c.anterior, now) : 'Sin consultas en los últimos 30 días'}</small>`}</div>
    </div>
    ${h.total ? html`<ol class="hist-lista">${h.fallas.map((f) => html`<li key=${f.id}>
        <span class="hist-punto" data-s=${f.fin ? 'RESUELTA' : 'FALLA'}></span>
        <div class="hist-motivo"><b>${nombreMotivo(f)}</b><span class="sub">Nodo ${rec.nodo}</span></div>
        <div class="num hist-fechas">${fechaHist(f.inicio, now)} → ${f.fin ? fechaHist(f.fin, now) : 'sigue activa'}</div>
        <div class="num hist-dur">${U.dur((f.fin || now) - f.inicio)}</div>
        <div class="hist-etiquetas">${!f.fin && html`<span class="marca-estado" data-s="FALLA">Activa</span>`}${wf && f.numero && html`<span class="chip codigo">${f.numero}</span>`}</div>
      </li>`)}</ol>`
      : html`<div class="vacio hist-vacio"><b>Sin fallas ${per[2]}</b>Workforce HN no ha registrado fallas en su nodo en este periodo.</div>`}
    <p class="sub hist-pie">Fallas registradas en Alertas para el nodo actual del cliente (${rec.nodo})${rec.fecha ? ', desde que es cliente' : ''}.</p>
  </section>`;
}

function Veredicto({ v, rec, now }) {
  const f = v.falla;
  let titulo = '', l1 = '', l2 = '', sello = '';
  if (v.tipo === 'FALLA') {
    titulo = 'Falla general';
    l1 = nombreMotivo(f) + ' en el nodo ' + rec.nodo + '.';
    l2 = 'Afectado desde las ' + U.hora(f.inicio) + ' (' + U.hace(f.inicio, now) + '). '
      + (f.eta ? (f.eta > now ? U.conPunto('Solución estimada: ' + U.cuandoCorto(f.eta, now)) : 'La hora estimada (' + U.hora(f.eta) + ') ya pasó; Workforce HN sigue dando seguimiento.') : 'Aún sin hora estimada de solución.');
    sello = 'Falla ' + U.idFalla(f.id) + ', publicada ' + U.cuandoCorto(f.publicadaEn, now);
  } else if (v.tipo === 'RESUELTA') {
    titulo = 'Falla resuelta';
    l1 = U.conPunto(nombreMotivo(f) + ' en el nodo ' + rec.nodo + ', solucionada ' + U.cuando(f.cerradaEn, now));
    l2 = 'Si el cliente sigue sin servicio, pídele reiniciar su equipo antes de escalar.';
    sello = 'Falla ' + U.idFalla(f.id);
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
      <div class="dato"><div class="l">Colonia</div><div class="v">${U.titulo(rec.colonia) || 'Sin dato'}</div></div>
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
  if (v.tipo === 'FALLA') {
    const etaOk = f.eta && f.eta > now;
    const etaTxt = etaOk ? (U.esHoy(f.eta, now) ? 'alrededor de las ' + U.hora(f.eta) : U.diaRel(f.eta, now) + ' alrededor de las ' + U.hora(f.eta)) : '';
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
  const recos = CONFIG.recomendaciones[v.tipo] || [];
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

/* ---------- Mapa de Honduras con las fallas activas ---------- */
function MapaVivo({ mf }) {
  const valores = {}, fallasDep = {};
  for (const f of mf.activas) for (const [dep, n] of ((f.impacto && f.impacto.deps) || [])) {
    const k = U.sinAcentos(dep).toUpperCase();
    valores[k] = (valores[k] || 0) + n;
    fallasDep[k] = (fallasDep[k] || 0) + 1;
  }
  const deps = Object.keys(valores).length;
  return html`<section class="panel" aria-label="Mapa de fallas activas">
    <div class="panel-cab"><div><h3>Fallas activas por departamento</h3>
      <div class="sub">${mf.activas.length ? U.n(mf.clientesActivos) + ' clientes afectados en ' + U.plural(deps, '1 departamento', deps + ' departamentos') : 'No hay fallas activas en este momento'}</div></div></div>
    <div class="panel-cuerpo"><${MapaHonduras} valores=${valores} fallas=${fallasDep} vacio="Sin fallas activas en el país." apilado=${true} nombres=${true} /></div>
  </section>`;
}

/* ---------- Riel con las fallas activas y recientes ---------- */
function RielFallas({ mf, now }) {
  return html`<aside class="panel riel" aria-label="Fallas en la red">
    <div class="panel-cab"><h2>Fallas en la red</h2><span class="der sub">${mf.activas.length ? U.n(mf.clientesActivos) + ' clientes afectados' : ''}</span></div>
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

function FallaItem({ f, now }) {
  const [abierto, setAbierto] = useState(false);
  const activa = f.estado === 'ACTIVA';
  const restante = activa ? 0 : CONFIG.horasVisibleTrasCierre * U.HORA - (now - f.cerradaEn);
  const imp = f.impacto || { total: 0, hfc: 0, gpon: 0, deps: [] };
  return html`<button type="button" class="falla-item" data-s=${f.estado} aria-expanded=${abierto} onClick=${() => setAbierto(!abierto)}>
    <div class="t"><span>${cortoMotivo(f)}</span><span class="id">${U.idFalla(f.id)}</span></div>
    <div class="nodos">${U.listaNatural(f.nodos, 3)}</div>
    <div class="m">
      ${activa ? html`<span>Desde las ${U.hora(f.inicio)}, ${U.hace(f.inicio, now)}</span>${f.eta && html`<span>Solución estimada: ${U.cuandoCorto(f.eta, now)}</span>`}`
        : html`<span>Resuelta ${U.cuandoCorto(f.cerradaEn, now)}</span><span>Se oculta en ${U.dur(restante)}</span>`}
      <span class="impacto-linea"><span><b class="num">${U.n(imp.total)}</b> clientes</span>
        ${imp.hfc > 0 && html`<span class="tec" data-t="HFC">HFC${imp.gpon > 0 ? ' ' + U.n(imp.hfc) : ''}</span>`}
        ${imp.gpon > 0 && html`<span class="tec" data-t="GPON">GPON${imp.hfc > 0 ? ' ' + U.n(imp.gpon) : ''}</span>`}</span>
    </div>
    ${abierto && html`<div class="det">
      ${f.nodos.map((n) => html`<span class="chip codigo" key=${n}>${n}</span>`)}
      <div class="sub" style="width:100%;margin-top:4px">
        ${(imp.munis || []).slice(0, 3).map((m) => U.lugar(m[0])).join(', ')}${(imp.munis || []).length ? '. ' : ''}Publicada por ${f.publicadaPor.nombre}, ${U.cuandoCorto(f.publicadaEn, now)}.
      </div>
    </div>`}
  </button>`;
}
