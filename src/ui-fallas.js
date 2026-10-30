/* ==========================================================================
   ALERTAS · Vista de Fallas (Workforce HN, Datos y Fallas)
   ========================================================================== */

const aLocal = (ts) => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const deLocal = (s) => (s ? new Date(s).getTime() : null);

function VistaFallas() {
  const s = useG();
  const mf = useMemo(() => Model.mapaFallas(s.fallas, s.now), [s.fallas, s.now]);
  const alertas = useMemo(() => s.alertas.filter((a) => !(s.descartadas[a.nodo] >= a.ultimo) && !mf.porNodo.has(a.nodo)), [s.alertas, s.descartadas, mf]);
  const [tab, setTab] = useState('publicar');
  const [edicion, setEdicion] = useState(null);
  const [semilla, setSemilla] = useState(null);
  const [cerrando, setCerrando] = useState(null);

  if (s.cargando) return html`<div class="panel vacio" style="margin-top:20px"><b>Cargando…</b></div>`;
  if (!s.cat) return html`<${SinBase} />`;
  const pestanas = [
    ['publicar', edicion ? 'Editar ' + edicion.id : 'Publicar falla', null],
    ['activas', 'Activas', mf.activas.length],
    ['resueltas', 'Resueltas ' + CONFIG.horasVisibleTrasCierre + ' h', mf.resueltas.length],
    ['historial', 'Historial', s.fallas.length]
  ];
  const editar = (f) => { setEdicion(f); setSemilla(null); setTab('publicar'); window.scrollTo({ top: 0 }); };
  return html`<div>
    <div class="titulo-vista">
      <div><h1>Fallas</h1><p>Lo que publiques aquí lo ven los asesores al instante al consultar un cliente.</p></div>
    </div>
    ${alertas.length > 0 && html`<${Alertas} alertas=${alertas} onCrear=${(n) => { setEdicion(null); setSemilla({ nodos: [n], k: Date.now() }); setTab('publicar'); }} />`}
    <div class="pestanas" role="tablist">
      ${pestanas.map(([id, txt, n]) => html`<button role="tab" aria-selected=${tab === id} onClick=${() => setTab(id)} key=${id}>
        ${txt}${n != null && html`<span class="n">${n}</span>`}</button>`)}
    </div>
    ${tab === 'publicar' && html`<${FormFalla} key=${edicion ? edicion.id : 'nueva' + (semilla ? semilla.k : '')} edicion=${edicion} semilla=${semilla} mf=${mf}
        onListo=${(f, editada) => { setEdicion(null); setSemilla(null); setTab('activas'); tostada(editada ? 'Cambios guardados en ' + f.id : 'Falla ' + f.id + ' publicada'); }}
        onCancelar=${() => { setEdicion(null); setTab('activas'); }} />`}
    ${tab === 'activas' && html`<${ListaFallas} fallas=${mf.activas} vacio="No hay fallas activas. Cuando llegue un correo con nodos afectados, publícala en la pestaña Publicar falla."
        onEditar=${editar} onCerrar=${setCerrando} smsTodas=${true} />`}
    ${tab === 'resueltas' && html`<${ListaFallas} fallas=${mf.resueltas} vacio=${'No hay fallas cerradas en las últimas ' + CONFIG.horasVisibleTrasCierre + ' horas.'} />`}
    ${tab === 'historial' && html`<${Historial} />`}
    ${cerrando && html`<${ModalCerrar} f=${cerrando} onCerrar=${() => setCerrando(null)} />`}
  </div>`;
}

/* ---------- Alertas tempranas ---------- */
function Alertas({ alertas, onCrear }) {
  const s = G.s;
  return html`<div class="alertas" role="region" aria-label="Posibles fallas sin publicar">
    ${alertas.slice(0, 4).map((a) => {
      const info = Model.infoNodo(s.cat, a.nodo);
      return html`<div class="alerta" key=${a.nodo}>
        <div class="ico"><${Ico} n="alerta" s=${20} /></div>
        <div>
          <b>Posible falla sin publicar en ${a.nodo}</b>
          <p>${a.nClientes} ${U.plural(a.nClientes, 'cliente distinto consultó', 'clientes distintos consultaron')} en los últimos ${CONFIG.alerta.minutos} min${a.reportes ? ' y ' + U.plural(a.reportes, 'un asesor la reportó', a.reportes + ' asesores la reportaron') : ''}.
            ${info ? ' ' + U.lugar(info.muni) + ', ' + U.n(info.total) + ' clientes en el nodo.' : ''} Última consulta ${U.hace(a.ultimo, s.now)}.</p>
        </div>
        <div class="acc">
          <button class="btn btn-primario btn-chico" onClick=${() => onCrear(a.nodo)}>Crear falla con este nodo</button>
          <button class="btn btn-fantasma btn-chico" onClick=${() => A.descartarAlerta(a.nodo)}>Descartar</button>
        </div>
      </div>`;
    })}
  </div>`;
}

/* ---------- Formulario de publicación / edición ---------- */
function FormFalla({ edicion, semilla, mf, onListo, onCancelar }) {
  const s = useG();
  const cat = s.cat;
  const ini = edicion || {};
  const [nodos, setNodos] = useState(edicion ? edicion.nodos.slice() : semilla ? semilla.nodos.slice() : []);
  const [texto, setTexto] = useState('');
  const [desconocidos, setDesconocidos] = useState([]);
  const [motivo, setMotivo] = useState(ini.motivo || '');
  const [motivoTexto, setMotivoTexto] = useState(ini.motivoTexto || '');
  const [clienteTexto, setClienteTexto] = useState(ini.clienteTexto || '');
  const [inicio, setInicio] = useState(aLocal(ini.inicio || Date.now()));
  const [eta, setEta] = useState(ini.eta ? 'custom' : 'sin');
  const [etaCustom, setEtaCustom] = useState(ini.eta ? aLocal(ini.eta) : aLocal(Date.now() + 2 * U.HORA));
  const [referencia, setReferencia] = useState(ini.referencia || '');
  const [detalle, setDetalle] = useState(ini.detalle || '');
  const [sug, setSug] = useState([]);
  const [activo, setActivo] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nota, setNota] = useState(null);
  const taRef = useRef(null);
  const agregadoEn = useRef(0);
  const textoRef = useRef(''); textoRef.current = texto;
  const nodosRef = useRef([]); nodosRef.current = nodos;
  const pendiente = useRef(false);
  const ejemplos = useMemo(() => Model.ejemplos(cat), [cat]);
  const clientesDe = (lista) => lista.reduce((a, n) => a + ((cat.nodos.get(n) || {}).total || 0), 0);

  const imp = useMemo(() => Model.impacto(cat, nodos), [cat, nodos]);
  const ocupados = useMemo(() => {
    const m = new Map();
    for (const f of mf.activas) if (!edicion || f.id !== edicion.id) for (const n of f.nodos) m.set(n, f.id);
    return m;
  }, [mf, edicion]);

  const tokenActual = (t) => { const p = t.split(/[\s,;|\/]+/); return p[p.length - 1] || ''; };
  function onInput(e) {
    const t = e.currentTarget.value; setTexto(t);
    const tok = tokenActual(t);
    setSug(tok.length >= 2 ? Model.sugerir(cat, tok, 7) : []); setActivo(0);
  }
  function sumar(lista) { setNodos((prev) => [...new Set(prev.concat(lista))]); }
  /* Lee el texto, agrega los nodos que reconoce y devuelve lo que encontró (o null) */
  function procesar(fuente) {
    const r = Model.leerNodos(cat, fuente);
    if (!r.validos.length && !r.desconocidos.length) return null;
    sumar(r.validos); setDesconocidos(r.desconocidos);
    return r;
  }
  /* Confirma en pantalla lo que se acaba de agregar */
  function confirmarAgregados(agregados) {
    const lista = [...new Set(agregados)];
    const nuevos = lista.filter((n) => !nodosRef.current.includes(n));
    if (nuevos.length) setNota({ tipo: 'ok', nodos: nuevos, clientes: clientesDe(nuevos) });
    else if (lista.length) setNota({ tipo: 'repetidos', nodos: lista });
    else setNota(null);
  }
  function agregarTexto(t) {
    pendiente.current = false;
    const fuente = t == null ? textoRef.current : t;
    if (!fuente.trim()) {
      // Si se acaba de agregar al salir de la caja, no hay nada más que avisar
      if (Date.now() - agregadoEn.current > 1500) { setNota({ tipo: 'vacio' }); taRef.current && taRef.current.focus(); }
      return;
    }
    const r = procesar(fuente);
    if (!r) { setNota({ tipo: 'nada', texto: fuente.trim() }); taRef.current && taRef.current.focus(); return; }
    setTexto(''); setSug([]); agregadoEn.current = Date.now();
    confirmarAgregados(r.validos);
  }
  function elegir(x) {
    const lista = x.tipo === 'olt' ? x.nodos : [x.code];
    const tok = tokenActual(texto);
    const resto = texto.slice(0, texto.length - tok.length);
    const r = resto.trim() ? procesar(resto) : null;
    sumar(lista);
    confirmarAgregados(lista.concat(r ? r.validos : []));
    setTexto(''); setSug([]); agregadoEn.current = Date.now();
    taRef.current && taRef.current.focus();
  }
  /* Al salir de la caja, los nodos escritos se agregan solos para no perderlos.
     Si se salió con un clic, se espera a que el clic termine: así la página no se
     mueve debajo del puntero y el clic llega a donde el usuario apuntó. */
  function alSalir(e) {
    setSug([]);
    if (!(texto.trim() && Model.leerNodos(cat, texto).validos.length)) return;
    if (!G.punteroAbajo) { agregarTexto(); return; }
    pendiente.current = true;
    const luego = () => setTimeout(() => { if (pendiente.current && textoRef.current.trim()) agregarTexto(textoRef.current); pendiente.current = false; }, 0);
    document.addEventListener('pointerup', luego, { once: true, capture: true });
  }
  function alPegar(e) {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\s,;]/.test(t.trim())) return;
    const junto = texto + ' ' + t;
    const r = Model.leerNodos(cat, junto);
    if (r.validos.length || r.desconocidos.length) { e.preventDefault(); agregarTexto(junto); }
  }
  function onKey(e) {
    if (sug.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setActivo((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + sug.length) % sug.length); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (sug.length) elegir(sug[activo]); else if (texto.trim()) agregarTexto(); return; }
    if (e.key === 'Escape') setSug([]);
  }

  const etaTs = eta === 'sin' ? null : eta === 'custom' ? deLocal(etaCustom) : Date.now() + Number(eta) * U.MIN;
  const motivoOk = motivo && (motivo !== 'OTRO' || (motivoTexto.trim() && clienteTexto.trim()));
  const listo = nodos.length > 0 && motivoOk;
  const borrador = {
    id: edicion ? edicion.id : 'Nueva', nodos, motivo: motivo || 'ENERGIA', motivoTexto, clienteTexto, inicio: deLocal(inicio) || Date.now(),
    eta: etaTs, estado: 'ACTIVA', publicadaEn: Date.now(), publicadaPor: A.quien()
  };
  const ejemplo = useMemo(() => {
    if (!nodos.length) return null;
    const info = Model.infoNodo(cat, nodos[0]);
    return { i: 'ejemplo', contrato: '0000000', nombre: '', categoria: 'RESIDENCIAL', nodo: nodos[0], tecnologia: info ? info.tecnologia : '' };
  }, [cat, nodos]);

  function cambiosDetalle() {
    const d = [];
    const add = nodos.filter((n) => !edicion.nodos.includes(n)), quit = edicion.nodos.filter((n) => !nodos.includes(n));
    if (add.length) d.push('agregó ' + U.listaNatural(add, 3));
    if (quit.length) d.push('quitó ' + U.listaNatural(quit, 3));
    if (motivo !== edicion.motivo) d.push('cambió el motivo');
    if ((etaTs || null) !== (edicion.eta || null)) d.push('cambió la hora estimada');
    if (aLocal(edicion.inicio) !== inicio) d.push('cambió la hora de inicio');
    if (referencia !== (edicion.referencia || '') || detalle !== (edicion.detalle || '')) d.push('actualizó notas');
    const t = d.join(', ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Sin cambios';
  }

  async function guardar() {
    setGuardando(true);
    try {
      const datos = { nodos, motivo, motivoTexto: motivo === 'OTRO' ? motivoTexto.trim() : '', clienteTexto: motivo === 'OTRO' ? clienteTexto.trim() : '', referencia: referencia.trim(), detalle: detalle.trim(), inicio: deLocal(inicio) || Date.now(), eta: etaTs };
      let f;
      if (edicion) f = await A.editarFalla(edicion.id, datos, cambiosDetalle());
      else f = await A.publicarFalla(datos);
      setConfirmar(false); onListo(f, !!edicion);
    } catch (e) { tostada('No se pudo guardar: ' + e.message); } finally { setGuardando(false); }
  }

  return html`<div class="form-falla">
    <div class="panel">
      <div class="paso">
        <div class="paso-cab"><span class="paso-num">1</span><div><h3>Nodos afectados</h3><p>Pega el texto del correo o escribe los nodos y presiona Agregar nodos. También puedes buscar una OLT para agregar todos sus nodos.</p></div></div>
        <div class="entrada-nodos">
          <textarea ref=${taRef} class="textarea" rows="3" value=${texto} aria-label="Nodos afectados"
            placeholder=${'Ejemplo: ' + ejemplos.join(', ')}
            onInput=${onInput} onKeyDown=${onKey} onBlur=${alSalir} onPaste=${alPegar}></textarea>
          <button type="button" class="btn btn-borde btn-chico agregar" onClick=${() => agregarTexto()}><${Ico} n="mas" s=${15} />Agregar nodos</button>
          ${sug.length > 0 && html`<div class="sugerencias" role="listbox">
            ${sug.map((x, k) => html`<button type="button" role="option" data-activo=${k === activo} key=${k} onMouseDown=${(e) => { e.preventDefault(); elegir(x); }}>
              <span class="tipo">${x.tipo === 'olt' ? 'OLT' : 'Nodo'}</span>
              <span class="nombre">${x.tipo === 'olt' ? html`${x.nombre}<small>Agrega sus ${x.nodos.length} nodos GPON</small>` : html`<span class="codigo">${x.code}</span>`}</span>
              <span class="cnt">${U.n(x.total)} clientes</span>
            </button>`)}
          </div>`}
        </div>
        <div class="nota-nodos" role="status" aria-live="polite">${nota && html`<${NotaNodos} nota=${nota} ejemplos=${ejemplos} />`}</div>
        ${desconocidos.length > 0 && html`<div class="aviso-linea"><${Ico} n="alerta" s=${16} /><span>
          No están en la base: ${desconocidos.map((d, k) => html`<span key=${d.token}>${k ? ', ' : ''}<b class="codigo">${d.token}</b>${d.sugerencia && html` (¿<button onClick=${() => { sumar([d.sugerencia]); setDesconocidos(desconocidos.filter((x) => x.token !== d.token)); }}>${d.sugerencia}</button>?)`}</span>`)}.
        </span></div>`}
        ${nodos.length > 0 && html`<div class="lista-nodos">
          ${nodos.map((n) => { const c = cat.nodos.get(n) || { total: 0, hfc: 0, gpon: 0 }; const t = c.gpon > c.hfc ? 'GPON' : 'HFC'; return html`<span class="nodo-chip" data-t=${t} data-ocupado=${ocupados.has(n)} key=${n} title=${t + ', ' + U.n(c.total) + ' clientes'}>
            <span class="codigo">${n}</span><span class="cn">${U.n(c.total)}</span>
            <button class="x" aria-label=${'Quitar ' + n} onClick=${() => { setNodos(nodos.filter((x) => x !== n)); setNota(null); }}><${Ico} n="x" s=${14} /></button></span>`; })}
        </div>
        <div class="fila-nodos"><span class="sub">${U.plural(nodos.length, '1 nodo agregado', nodos.length + ' nodos agregados')}</span>
          <button class="btn btn-fantasma btn-chico" onClick=${() => { setNodos([]); setDesconocidos([]); setNota(null); }}>Quitar todos</button></div>`}
        ${nodos.some((n) => ocupados.has(n)) && html`<div class="aviso-linea"><${Ico} n="info" s=${16} />
          <span>${U.listaNatural(nodos.filter((n) => ocupados.has(n)), 4)} ya ${nodos.filter((n) => ocupados.has(n)).length === 1 ? 'está' : 'están'} en otra falla activa (${[...new Set(nodos.filter((n) => ocupados.has(n)).map((n) => ocupados.get(n)))].join(', ')}). Puedes publicarla igual; el asesor verá la más reciente.</span></div>`}
      </div>

      <div class="paso">
        <div class="paso-cab"><span class="paso-num">2</span><div><h3>Motivo</h3><p>El asesor se lo explica al cliente con palabras sencillas.</p></div></div>
        <div class="motivos" role="group" aria-label="Motivo de la falla">
          ${CONFIG.motivos.map((m) => html`<button type="button" class="motivo" aria-pressed=${motivo === m.id} onClick=${() => setMotivo(m.id)} key=${m.id}>
            <${Ico} n=${m.id} s=${20} />${m.nombre}</button>`)}
        </div>
        ${motivo === 'OTRO' && html`<div class="fila-campos" style="margin-top:14px">
          <label class="campo"><span>Nombre del motivo</span><input class="input" value=${motivoTexto} onInput=${(e) => setMotivoTexto(e.currentTarget.value)} placeholder="Ejemplo: Vandalismo en gabinete" /></label>
          <label class="campo"><span>Cómo se lo explica el asesor al cliente</span><input class="input" value=${clienteTexto} onInput=${(e) => setClienteTexto(e.currentTarget.value)} placeholder="un daño en uno de nuestros equipos de la zona" /></label>
        </div>`}
      </div>

      <div class="paso">
        <div class="paso-cab"><span class="paso-num">3</span><div><h3>Tiempos</h3><p>La hora estimada aparece en el guion del asesor.</p></div></div>
        <div class="fila-campos">
          <label class="campo"><span>Inicio de la afectación</span><input class="input" type="datetime-local" value=${inicio} onInput=${(e) => setInicio(e.currentTarget.value)} /></label>
          <div class="campo"><span>Solución estimada</span>
            <div class="eta-opciones">
              <div class="seg" role="group" aria-label="Solución estimada">
                <button type="button" aria-pressed=${eta === 'sin'} onClick=${() => setEta('sin')}>Sin hora</button>
                ${CONFIG.etaOpciones.map((o) => html`<button type="button" aria-pressed=${eta === String(o.min)} onClick=${() => setEta(String(o.min))} key=${o.min}>${o.label}</button>`)}
                <button type="button" aria-pressed=${eta === 'custom'} onClick=${() => setEta('custom')}>Otra</button>
              </div>
            </div>
            ${eta === 'custom' ? html`<input class="input" type="datetime-local" value=${etaCustom} onInput=${(e) => setEtaCustom(e.currentTarget.value)} />`
              : etaTs ? html`<small>${U.conPunto('Quedaría para ' + U.cuando(etaTs, s.now))}</small>` : html`<small>El guion dirá que se trabaja en el menor tiempo posible.</small>`}
          </div>
        </div>
      </div>

      <div class="paso">
        <div class="paso-cab"><span class="paso-num">4</span><div><h3>Referencia y notas internas</h3><p>Solo las ve Workforce HN.</p></div></div>
        <div class="fila-campos">
          <label class="campo"><span>Referencia del correo o ticket</span><input class="input" value=${referencia} onInput=${(e) => setReferencia(e.currentTarget.value)} placeholder="Ejemplo: Correo NOC #9114" /></label>
          <label class="campo"><span>Notas</span><input class="input" value=${detalle} onInput=${(e) => setDetalle(e.currentTarget.value)} placeholder="Ejemplo: ENEE reporta corte en el circuito" /></label>
        </div>
      </div>
    </div>

    <div class="impacto">
      <div class="panel impacto-cifra">
        <div class="sub">Clientes afectados</div>
        <div class="grande">${U.n(imp.total)}</div>
        <div class="grande-l">${nodos.length ? 'en ' + U.plural(imp.nodos, '1 nodo', imp.nodos + ' nodos') + (imp.corp ? ', ' + U.plural(imp.corp, '1 cliente empresarial', imp.corp + ' clientes empresariales') : '') : 'Agrega nodos para ver a quiénes afecta'}</div>
        ${imp.total > 0 && html`<div class="split">
          <div class="split-barra">${imp.hfc > 0 && html`<i class="h" style=${'flex-grow:' + imp.hfc}></i>`}${imp.gpon > 0 && html`<i class="g" style=${'flex-grow:' + imp.gpon}></i>`}</div>
          <div class="split-leyenda"><span class="tec" data-t="HFC">HFC <b>${U.n(imp.hfc)}</b></span><span class="tec" data-t="GPON">GPON <b>${U.n(imp.gpon)}</b></span></div>
        </div>
        <ul class="zonas">${imp.munis.slice(0, 5).map(([m, c]) => html`<li key=${m}><span>${U.lugar(m)}</span><b>${U.n(c)}</b></li>`)}</ul>`}
      </div>
      <div class="panel preview">
        <div class="preview-cab">Así lo verá el asesor</div>
        ${ejemplo && motivo ? html`<${Veredicto} v=${{ tipo: 'FALLA', falla: borrador }} rec=${ejemplo} now=${s.now} />
            <div class="guion-texto"><${Resaltado} partes=${partesGuion({ tipo: 'FALLA', falla: borrador }, ejemplo, 'llamada', s.now)} /></div>`
          : html`<div class="vacio" style="padding:10px 4px">Agrega al menos un nodo y elige el motivo para ver la vista previa.</div>`}
      </div>
      <div class="publicar-barra">
        ${edicion && html`<button class="btn btn-borde btn-grande" onClick=${onCancelar}>Cancelar</button>`}
        <button class="btn btn-primario btn-grande" disabled=${!listo} onClick=${() => setConfirmar(true)}>${edicion ? 'Guardar cambios' : 'Publicar falla'}</button>
      </div>
    </div>

    ${confirmar && html`<${Modal} titulo=${edicion ? 'Guardar cambios en ' + edicion.id : 'Publicar falla'} onCerrar=${() => setConfirmar(false)}
        sub=${edicion ? cambiosDetalle() + '. Todos los que estén usando Alertas recibirán el aviso para actualizar.' : 'Los asesores la verán de inmediato al consultar a estos clientes.'}
        pie=${html`<button class="btn btn-borde" onClick=${() => setConfirmar(false)}>Revisar</button>
          <button class="btn btn-primario" disabled=${guardando} onClick=${guardar}>${edicion ? 'Guardar cambios' : 'Publicar falla'}</button>`}>
      <div class="nota"><${Ico} n=${motivo} s=${18} /><div><b>${nombreMotivo(borrador)}</b> en ${U.listaNatural(nodos, 4)}.<br/>
        ${U.n(imp.total)} clientes: HFC ${U.n(imp.hfc)}, GPON ${U.n(imp.gpon)}.${etaTs ? ' ' + U.conPunto('Solución estimada: ' + U.cuandoCorto(etaTs, s.now)) : ''}</div></div>
    </${Modal}>`}
  </div>`;
}

/* Respuesta visible después de presionar Agregar nodos */
function NotaNodos({ nota, ejemplos }) {
  const ej = U.listaNatural(ejemplos.slice(0, 2), 2).replace(' y ', ' o ');
  if (nota.tipo === 'ok') {
    return html`<div class="nota-linea" data-tipo="ok"><${Ico} n="check" s=${16} /><span>
      ${nota.nodos.length === 1 ? html`Agregaste <b class="codigo">${nota.nodos[0]}</b>` : html`Agregaste ${nota.nodos.length} nodos (<b class="codigo">${U.listaNatural(nota.nodos, 4)}</b>)`}: ${U.n(nota.clientes)} ${U.plural(nota.clientes, 'cliente', 'clientes')}. Ya cuentan en el total de la derecha.</span></div>`;
  }
  if (nota.tipo === 'repetidos') return html`<div class="nota-linea" data-tipo="info"><${Ico} n="info" s=${16} /><span>${U.listaNatural(nota.nodos, 4)} ya ${nota.nodos.length === 1 ? 'estaba' : 'estaban'} en la lista.</span></div>`;
  if (nota.tipo === 'vacio') return html`<div class="nota-linea" data-tipo="info"><${Ico} n="info" s=${16} /><span>Primero escribe o pega los nodos en el cuadro, por ejemplo <b class="codigo">${ejemplos.join(', ')}</b>, y luego presiona Agregar nodos.</span></div>`;
  return html`<div class="nota-linea" data-tipo="alerta"><${Ico} n="alerta" s=${16} /><span>No encontré códigos de nodo en "${nota.texto.length > 40 ? nota.texto.slice(0, 40) + '…' : nota.texto}". Un nodo se escribe como <b class="codigo">${ej}</b>.</span></div>`;
}

/* ---------- Listas de fallas ---------- */
function ListaFallas({ fallas, vacio, onEditar, onCerrar, smsTodas }) {
  if (!fallas.length) return html`<div class="panel vacio"><b>Nada por aquí</b>${vacio}</div>`;
  return html`<div>
    ${smsTodas && fallas.length > 1 && html`<${BarraSmsTodas} n=${fallas.length} />`}
    <div class="fallas-lista">${fallas.map((f) => html`<${TarjetaFallaAdmin} f=${f} key=${f.id} onEditar=${onEditar} onCerrar=${onCerrar} />`)}</div>
  </div>`;
}

/* Descarga de celulares para avisar por SMS (Notifícame) */
function useSms(id) {
  const [ocupado, setOcupado] = useState(false);
  const [r, setR] = useState(null);
  async function descargar() {
    setOcupado(true);
    try {
      const x = await A.telefonosSms(id);
      setR(x);
      tostada(x.telefonos.length ? 'Listo: ' + U.n(x.telefonos.length) + ' números en ' + x.archivo : 'Esa falla no tiene clientes con celular en la base.');
    } catch (e) { tostada(e.message); }
    setOcupado(false);
  }
  return { ocupado, r, descargar };
}
function ResumenSms({ r }) {
  return html`<p class="nota-sms"><${Ico} n="info" s=${16} /><span>
    <b>${U.n(r.telefonos.length)} ${U.plural(r.telefonos.length, 'número', 'números')}</b> para ${U.n(r.clientes)} ${U.plural(r.clientes, 'cliente', 'clientes')}${r.conCelular > r.telefonos.length ? ' (algunos comparten el mismo celular)' : ''}.
    ${r.soloFijo > 0 ? ' ' + U.n(r.soloFijo) + ' solo tienen teléfono fijo, que no recibe SMS.' : ''}${r.sinTelefono > 0 ? ' ' + U.n(r.sinTelefono) + ' no tienen teléfono en la base.' : ''}
  </span></p>`;
}
function BarraSmsTodas({ n }) {
  const sms = useSms('activas');
  return html`<div class="panel barra-sms">
    <div><b>Avisar por SMS a todas las fallas activas</b><span>Un solo archivo con los celulares de los clientes de las ${n} fallas, sin repetir.</span></div>
    <button class="btn btn-borde btn-chico" disabled=${sms.ocupado} onClick=${sms.descargar}><${Ico} n="descargar" s=${15} />${sms.ocupado ? 'Preparando…' : 'Teléfonos de todas'}</button>
    ${sms.r && html`<${ResumenSms} r=${sms.r} />`}
  </div>`;
}

function TarjetaFallaAdmin({ f, onEditar, onCerrar }) {
  const s = useG();
  const now = s.now;
  const activa = f.estado === 'ACTIVA';
  const imp = f.impacto || {};
  const fin = activa ? now : f.cerradaEn;
  const [verHist, setVerHist] = useState(false);
  const sms = useSms(f.id);
  return html`<article class="panel falla-card" data-s=${f.estado}>
    <div class="falla-card-cab">
      <div><span class="id">${f.id}</span><h3>${nombreMotivo(f)}</h3></div>
      <div class="der"><span class="marca-estado" data-s=${activa ? 'FALLA' : 'RESUELTA'}>${activa ? 'Activa' : 'Resuelta'}</span></div>
    </div>
    <div class="lista-nodos" style="margin-top:0">${f.nodos.slice(0, 10).map((n) => html`<span class="chip codigo" key=${n}>${n}</span>`)}${f.nodos.length > 10 && html`<span class="chip">y ${f.nodos.length - 10} más</span>`}</div>
    <div class="cifras">
      <div><b class="num">${U.n(imp.total)}</b><span>clientes</span></div>
      <div><b class="num">${U.n(f.nodos.length)}</b><span>${f.nodos.length === 1 ? 'nodo' : 'nodos'}</span></div>
      <div><b>${U.durCorto(fin - f.inicio)}</b><span>${activa ? 'lleva la falla' : 'duró'}</span></div>
    </div>
    <${BarraTec} hfc=${imp.hfc} gpon=${imp.gpon} leyenda=${true} />
    <dl class="meta">
      <dt>Inicio</dt><dd>${U.cuandoCorto(f.inicio, now)}</dd>
      ${activa && html`<dt>Estimada</dt><dd>${f.eta ? U.cuandoCorto(f.eta, now) + (f.eta < now ? ' (ya pasó)' : '') : 'Sin hora'}</dd>`}
      <dt>Publicó</dt><dd>${f.publicadaPor.nombre}, ${U.cuandoCorto(f.publicadaEn, now)}</dd>
      ${!activa && html`<dt>Cerró</dt><dd>${f.cerradaPor ? f.cerradaPor.nombre : ''}, ${U.cuandoCorto(f.cerradaEn, now)}</dd>`}
      ${!activa && Model.visible(f, now) && html`<dt>Visible</dt><dd>${U.dur(CONFIG.horasVisibleTrasCierre * U.HORA - (now - f.cerradaEn))} más para los asesores</dd>`}
      ${f.referencia && html`<dt>Referencia</dt><dd>${f.referencia}</dd>`}
      ${f.detalle && html`<dt>Notas</dt><dd>${f.detalle}</dd>`}
      ${f.notaCierre && html`<dt>Cierre</dt><dd>${f.notaCierre}</dd>`}
    </dl>
    <div class="acc">
      ${activa && onCerrar && html`<button class="btn btn-peligro btn-chico" onClick=${() => onCerrar(f)}><${Ico} n="cerrar" s=${16} />Cerrar falla</button>`}
      ${activa && onEditar && html`<button class="btn btn-borde btn-chico" onClick=${() => onEditar(f)}><${Ico} n="lapiz" s=${15} />Editar</button>`}
      ${!activa && Model.visible(f, now) && html`<button class="btn btn-borde btn-chico" onClick=${async () => { try { await A.reabrirFalla(f.id); tostada('Falla ' + f.id + ' reabierta'); } catch (e) { tostada(e.message); } }}>Reabrir</button>`}
      <button class="btn btn-borde btn-chico sms" disabled=${sms.ocupado} onClick=${sms.descargar}><${Ico} n="descargar" s=${15} />${sms.ocupado ? 'Preparando…' : 'Teléfonos para SMS'}</button>
      <button class="btn btn-fantasma btn-chico" onClick=${() => setVerHist(true)}>Historial de cambios</button>
    </div>
    ${sms.r && html`<${ResumenSms} r=${sms.r} />`}
    ${verHist && html`<${ModalHistorialFalla} f=${f} onCerrar=${() => setVerHist(false)} />`}
  </article>`;
}

const ACCION = { PUBLICADA: 'Publicó', EDITADA: 'Editó', CERRADA: 'Cerró', REABIERTA: 'Reabrió' };
function ModalHistorialFalla({ f, onCerrar }) {
  const now = G.s.now;
  return html`<${Modal} titulo=${'Historial de ' + f.id} sub=${nombreMotivo(f) + ' en ' + U.listaNatural(f.nodos, 3)} onCerrar=${onCerrar}
      pie=${html`<button class="btn btn-primario" onClick=${onCerrar}>Listo</button>`}>
    <ul class="bitacora">${f.historial.slice().reverse().map((h, k) => html`<li key=${k}>
      <span class="cuando">${U.dia(h.en)}, ${U.hora(h.en)}</span>
      <span><b>${h.por.nombre}</b> ${(ACCION[h.accion] || h.accion).toLowerCase()} la falla${h.detalle ? ': ' + h.detalle : ''}.</span>
    </li>`)}</ul>
  </${Modal}>`;
}

function ModalCerrar({ f, onCerrar }) {
  const [hora, setHora] = useState(aLocal(Date.now()));
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function ok() {
    setOcupado(true);
    try { await A.cerrarFalla(f.id, Math.min(deLocal(hora) || Date.now(), Date.now()), nota.trim()); tostada('Falla ' + f.id + ' cerrada'); onCerrar(); }
    catch (e) { tostada(e.message); setOcupado(false); }
  }
  return html`<${Modal} titulo=${'Cerrar falla ' + f.id} onCerrar=${onCerrar}
      sub=${'Los asesores la verán como resuelta durante ' + CONFIG.horasVisibleTrasCierre + ' horas, y el guion le pedirá al cliente reiniciar su equipo.'}
      pie=${html`<button class="btn btn-borde" onClick=${onCerrar}>Cancelar</button><button class="btn btn-peligro" disabled=${ocupado} onClick=${ok}>Cerrar falla</button>`}>
    <label class="campo"><span>Hora de solución</span><input class="input" type="datetime-local" value=${hora} onInput=${(e) => setHora(e.currentTarget.value)} /></label>
    <label class="campo"><span>Nota de cierre</span><input class="input" value=${nota} onInput=${(e) => setNota(e.currentTarget.value)} placeholder="Ejemplo: Energía restablecida por la ENEE" /></label>
  </${Modal}>`;
}

/* ---------- Historial completo ---------- */
function Historial() {
  const s = useG();
  const [txt, setTxt] = useState('');
  const [mot, setMot] = useState('');
  const [tec, setTec] = useState('');
  const [per, setPer] = useState('30');
  const [ver, setVer] = useState(null);
  const desde = per === 'todo' ? 0 : s.now - Number(per) * U.DIA;
  const q = txt.trim().toUpperCase();
  const lista = s.fallas.filter((f) => f.publicadaEn >= desde
    && (!mot || f.motivo === mot)
    && (!tec || (tec === 'HFC' ? (f.impacto.hfc >= f.impacto.gpon) : (f.impacto.gpon > f.impacto.hfc)))
    && (!q || f.id.includes(q) || f.nodos.some((n) => n.includes(q)) || f.publicadaPor.nombre.toUpperCase().includes(q)))
    .sort((a, b) => b.publicadaEn - a.publicadaEn);
  function exportar() {
    U.descargarCsv('fallas-alertas.csv', [['ID', 'Estado', 'Motivo', 'Nodos', 'Clientes', 'HFC', 'GPON', 'Inicio', 'Publicada', 'Publicó', 'Cerrada', 'Cerró', 'Duración (h)', 'Referencia']].concat(
      lista.map((f) => [f.id, f.estado === 'ACTIVA' ? 'Activa' : 'Resuelta', nombreMotivo(f), f.nodos.join(' '), f.impacto.total, f.impacto.hfc, f.impacto.gpon,
        new Date(f.inicio).toLocaleString('es-HN'), new Date(f.publicadaEn).toLocaleString('es-HN'), f.publicadaPor.nombre,
        f.cerradaEn ? new Date(f.cerradaEn).toLocaleString('es-HN') : '', f.cerradaPor ? f.cerradaPor.nombre : '',
        U.n1(U.horas((f.cerradaEn || s.now) - f.inicio)), f.referencia || ''])));
  }
  return html`<div class="panel">
    <div class="panel-cuerpo">
      <div class="filtros">
        <input class="input" style="min-width:220px" placeholder="Buscar nodo, ID o persona" value=${txt} onInput=${(e) => setTxt(e.currentTarget.value)} aria-label="Buscar" />
        <select class="select" value=${per} onChange=${(e) => setPer(e.currentTarget.value)} aria-label="Periodo">
          <option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="todo">Todo</option>
        </select>
        <select class="select" value=${mot} onChange=${(e) => setMot(e.currentTarget.value)} aria-label="Motivo">
          <option value="">Todos los motivos</option>${CONFIG.motivos.map((m) => html`<option value=${m.id}>${m.nombre}</option>`)}
        </select>
        <select class="select" value=${tec} onChange=${(e) => setTec(e.currentTarget.value)} aria-label="Tecnología">
          <option value="">HFC y GPON</option><option value="HFC">Mayormente HFC</option><option value="GPON">Mayormente GPON</option>
        </select>
        <span class="sub">${U.plural(lista.length, '1 falla', U.n(lista.length) + ' fallas')}</span>
        <button class="btn btn-borde btn-chico" style="margin-left:auto" onClick=${exportar} disabled=${!lista.length}><${Ico} n="descargar" s=${15} />Exportar CSV</button>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th>ID</th><th>Motivo</th><th>Nodos</th><th class="der">Clientes</th><th>Tecnología</th><th>Inicio</th><th class="der">Duración</th><th>Publicó</th><th>Cerró</th><th></th></tr></thead>
          <tbody>${lista.slice(0, 300).map((f) => html`<tr key=${f.id}>
            <td class="num fuerte">${f.id}</td>
            <td>${cortoMotivo(f)}</td>
            <td class="codigo" style="max-width:220px">${U.listaNatural(f.nodos, 3)}</td>
            <td class="der">${U.n(f.impacto.total)}</td>
            <td><${BarraTec} hfc=${f.impacto.hfc} gpon=${f.impacto.gpon} /></td>
            <td class="num">${U.dia(f.inicio)}, ${U.hora(f.inicio)}</td>
            <td class="der">${f.estado === 'ACTIVA' ? html`<span class="marca-estado" data-s="FALLA">Activa</span>` : U.dur(f.cerradaEn - f.inicio)}</td>
            <td>${f.publicadaPor.nombre}</td>
            <td>${f.cerradaPor ? f.cerradaPor.nombre : ''}</td>
            <td><button class="btn btn-fantasma btn-chico" onClick=${() => setVer(f)}>Ver</button></td>
          </tr>`)}</tbody>
        </table>
        ${!lista.length && html`<div class="vacio"><b>Sin fallas en este filtro</b>Prueba con otro periodo o quita los filtros.</div>`}
      </div>
    </div>
    ${ver && html`<${ModalHistorialFalla} f=${ver} onCerrar=${() => setVer(null)} />`}
  </div>`;
}
