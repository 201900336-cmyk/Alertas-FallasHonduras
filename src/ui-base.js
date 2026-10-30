/* ==========================================================================
   ALERTAS · Base de clientes (carga semanal)
   ========================================================================== */

/* Lee el archivo en segundo plano para no congelar la pantalla */
function leerBase(buffer, nombre, alProgreso) {
  return new Promise((ok, mal) => {
    let w = null;
    try {
      const url = URL.createObjectURL(new Blob([ALERTAS_WORKER_SRC], { type: 'text/javascript' }));
      w = new Worker(url);
      URL.revokeObjectURL(url);
    } catch (e) { w = null; }
    if (!w) { ALERTAS_PARSER.parseFile(buffer, nombre, alProgreso).then(ok, mal); return; }
    let ultimo = -1;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'p') { const p = Math.floor(m.p * 100); if (p !== ultimo) { ultimo = p; alProgreso(m.p); } }
      else if (m.tipo === 'ok') { w.terminate(); ok(m.base); }
      else if (m.tipo === 'error') { w.terminate(); mal(new Error(m.msg)); }
    };
    w.onerror = (e) => { w.terminate(); if (e.preventDefault) e.preventDefault(); ALERTAS_PARSER.parseFile(buffer, nombre, alProgreso).then(ok, mal); };
    try { w.postMessage({ buf: buffer.slice(0), nombre }); } catch (e) { w.terminate(); ALERTAS_PARSER.parseFile(buffer, nombre, alProgreso).then(ok, mal); }
  });
}

function contarTec(base, t) {
  const k = base.dicts.tecnologia.indexOf(t); if (k < 0) return 0;
  let n = 0; const c = base.cols.tecnologia; for (let i = 0; i < c.length; i++) if (c[i] === k) n++;
  return n;
}

function VistaBase() {
  const s = useG();
  const [est, setEst] = useState(null);
  const [encima, setEncima] = useState(false);
  const [confirmarDemo, setConfirmarDemo] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const r = s.resumen;
  const local = Backend.modo === 'local';
  const ult = s.cargas.length ? s.cargas[s.cargas.length - 1] : null;

  async function leer(file) {
    if (!file) return;
    if (!/\.(xlsx|csv|txt)$/i.test(file.name)) { setEst({ fase: 'error', msg: 'Ese archivo no es un Excel (.xlsx) ni un CSV.', archivo: file.name }); return; }
    setEst({ fase: 'leyendo', p: 0, archivo: file.name });
    try {
      const buf = await file.arrayBuffer();
      const base = await leerBase(buf, file.name, (p) => setEst((e) => (e && e.fase === 'leyendo' ? Object.assign({}, e, { p }) : e)));
      if (!base.filas) throw new Error('No encontré clientes en el archivo.');
      let conCelular = 0;
      if (base.tieneTelefono && base.cols.telefono) base.cols.telefono.forEach((t) => { if (/(^|\s)504[3789]/.test(t || '')) conCelular++; });
      setEst({ fase: 'listo', base, archivo: file.name, nodos: base.dicts.nodo.length - 1, gpon: contarTec(base, 'GPON'), hfc: contarTec(base, 'HFC'), conCelular });
    } catch (e) { setEst({ fase: 'error', msg: e.message || String(e), archivo: file.name }); }
  }
  async function publicar() {
    const base = est.base;
    setEst((e) => Object.assign({}, e, { fase: 'publicando', paso: { fase: 'preparando' } }));
    try {
      const res = await A.subirBase(base, (paso) => setEst((e) => (e && e.fase === 'publicando' ? Object.assign({}, e, { paso }) : e)));
      const c = res && res.comparacion;
      setEst(null);
      tostada('Base actualizada: ' + U.n(base.filas) + ' servicios' + (c ? ', ' + U.n(c.nuevos) + ' contratos nuevos' : ''));
    } catch (e) {
      setEst((x) => Object.assign({}, x, { fase: 'listo', errorPublicar: e.message }));
    }
  }
  const paso = est && est.paso;
  const pct = paso && paso.fase === 'subiendo' ? Math.round((paso.hechas / paso.total) * 100) : paso && paso.fase === 'guardando' ? 100 : 0;

  return html`<div>
    <div class="titulo-vista"><div><h1>Base de clientes</h1><p>${local
      ? 'El Excel semanal de BI con el contrato, nodo y OLT de cada cliente. En demostración se guarda solo en esta PC.'
      : 'El Excel semanal de BI con el contrato, nodo y OLT de cada cliente. Se guarda en el Sheet privado de Alertas y reemplaza la base anterior.'}</p></div></div>
    <div class="base-grid">
      <section class="panel">
        <div class="panel-cab"><h3>Base actual</h3>${s.meta.demo && html`<span class="der marca-estado" data-s="RESUELTA">Demostración</span>`}</div>
        ${r ? html`
          <div class="panel-cuerpo" style="padding-top:8px">
            <div class="sub">${(r.por && r.en) || ult ? html`Subida por <b style="color:var(--ink)">${(r.por && r.por.nombre) || ult.por.nombre}</b> el ${U.dia(r.en || ult.en)} a las ${U.hora(r.en || ult.en)}` : 'Sin registro de carga'}${r.archivo ? html`<br />${r.archivo}` : ''}</div>
          </div>
          <div class="resumen-base">
            <div><b class="num">${U.n(r.filas)}</b><span>servicios</span></div>
            <div><b class="num">${U.n(r.contratos)}</b><span>contratos</span></div>
            <div><b class="num">${U.n(r.nodos)}</b><span>nodos</span></div>
            <div><b class="num">${U.n(r.hfc)}</b><span class="tec" data-t="HFC">HFC</span></div>
            <div><b class="num">${U.n(r.gpon)}</b><span class="tec" data-t="GPON">GPON</span></div>
            <div><b class="num">${U.n(r.olts)}</b><span>OLT con nodos GPON</span></div>
          </div>
          <div class="panel-cuerpo" style="display:flex;flex-direction:column;gap:10px">
            ${r.virtuales > 0 && html`<div class="nota"><${Ico} n="info" s=${18} /><span>${U.n(r.virtuales)} clientes están en nodos virtuales (TAP VIRTUAL). Para ellos se muestra "Nodo sin identificar", porque no se puede certificar una falla general.</span></div>`}
            ${!r.tieneMegas && html`<div class="nota"><${Ico} n="info" s=${18} /><span>La base no trae la velocidad contratada. Si BI agrega una columna MEGAS o VELOCIDAD, aparecerá sola en la tarjeta del cliente.</span></div>`}
          </div>`
        : html`<div class="vacio"><b>Aún no hay base</b>Sube el Excel semanal para empezar.</div>`}
      </section>

      <section>
        ${(!est || est.fase === 'error') && html`<label class="zona-carga" data-encima=${encima}
            onDragOver=${(e) => { e.preventDefault(); setEncima(true); }} onDragLeave=${() => setEncima(false)}
            onDrop=${(e) => { e.preventDefault(); setEncima(false); leer(e.dataTransfer.files[0]); }}>
          <${Ico} n="subir" s=${30} />
          <h3>Sube la base de esta semana</h3>
          <p>Arrastra aquí el Excel (.xlsx) o un CSV con las columnas CONTRATO, PRODUCT_ID, GRUPO_NODO, OLT, NAP, TECNOLOGIA, NOMBRE_CLIENTE, DNI y las de ubicación.</p>
          <span class="btn btn-primario" style="margin-top:6px">Elegir archivo</span>
          <input type="file" accept=".xlsx,.csv,.txt" class="sr" onChange=${(e) => { const f = e.currentTarget.files[0]; if (f) leer(f); e.currentTarget.value = ''; }} />
          ${est && est.fase === 'error' && html`<div class="aviso-linea" style="justify-content:center"><${Ico} n="alerta" s=${16} /><span><b>${est.archivo}:</b> ${est.msg}</span></div>`}
        </label>`}
        ${est && est.fase === 'leyendo' && html`<div class="zona-carga">
          <h3>Leyendo ${est.archivo}</h3>
          <div class="progreso" role="progressbar" aria-valuenow=${Math.round(est.p * 100)} aria-valuemin="0" aria-valuemax="100"><i style=${'width:' + Math.round(est.p * 100) + '%'}></i></div>
          <p class="num">${Math.round(est.p * 100)} %</p>
        </div>`}
        ${est && est.fase === 'listo' && html`<div class="panel">
          <div class="panel-cab"><h3>Lista para publicar</h3><span class="der sub">${est.archivo}</span></div>
          <div class="resumen-base" style="margin-top:14px">
            <div><b class="num">${U.n(est.base.filas)}</b><span>servicios</span></div>
            <div><b class="num">${U.n(est.nodos)}</b><span>nodos</span></div>
            <div><b class="num">${U.n(est.gpon)}</b><span class="tec" data-t="GPON">GPON</span></div>
          </div>
          <div class="panel-cuerpo" style="display:flex;flex-direction:column;gap:12px">
            ${est.errorPublicar && html`<div class="nota" style="color:var(--falla-text)"><${Ico} n="alerta" s=${18} /><span>No se pudo publicar: ${est.errorPublicar} La base anterior sigue intacta.</span></div>`}
            ${est.base.tieneTelefono
              ? html`<div class="nota"><${Ico} n="info" s=${18} /><span>Trae teléfonos: ${U.n(est.conCelular)} de ${U.n(est.base.filas)} servicios tienen celular para avisar por SMS. Los números quedan con 504 adelante.</span></div>`
              : html`<div class="nota"><${Ico} n="info" s=${18} /><span>Esta base no trae la columna TELEFONO, así que no se van a poder descargar los celulares para SMS.</span></div>`}
            ${s.meta.demo && html`<div class="nota"><${Ico} n="alerta" s=${18} /><span>Al publicar se borran los datos de demostración: fallas, consultas e historial ficticios.</span></div>`}
            <div class="sub">${local ? '' : 'Se sube por partes y tarda unos minutos. Las búsquedas siguen funcionando con la base anterior hasta que termine. '}Al publicar, todos los que estén usando Alertas recibirán el aviso para actualizar. Quedará registrado que la subiste tú.</div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-borde" onClick=${() => setEst(null)}>Cancelar</button>
              <button class="btn btn-primario" style="flex:1" onClick=${publicar}>${est.errorPublicar ? 'Intentar de nuevo' : 'Publicar base'}</button>
            </div>
          </div>
        </div>`}
        ${est && est.fase === 'publicando' && html`<div class="zona-carga">
          <h3>${paso.fase === 'preparando' ? 'Preparando la base…' : paso.fase === 'subiendo' ? 'Subiendo ' + U.n(paso.hechas) + ' de ' + U.n(paso.total) : 'Guardando y reemplazando la base anterior…'}</h3>
          <div class="progreso" role="progressbar" aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100"><i style=${'width:' + pct + '%'}></i></div>
          <p>No cierres esta pestaña hasta que termine.</p>
        </div>`}
      </section>
    </div>

    <section class="panel" style="margin-top:20px">
      <div class="panel-cab"><h3>Historial de cargas</h3></div>
      <div class="panel-cuerpo tabla-envoltura">
        ${s.cargas.length ? html`<table class="tabla"><thead><tr><th>Fecha</th><th>Subió</th><th>Archivo</th><th class="der">Servicios</th><th class="der">Nuevos</th><th class="der">Ya no aparecen</th><th class="der">Cambios de nodo</th></tr></thead>
          <tbody>${s.cargas.slice().reverse().map((b, k) => html`<tr key=${k}><td class="num">${U.dia(b.en)}, ${U.hora(b.en)}</td><td class="fuerte">${b.por.nombre}</td><td>${b.archivo}</td>
            <td class="der">${U.n(b.filas)}</td><td class="der">${b.nuevos == null ? '' : U.n(b.nuevos)}</td><td class="der">${b.bajas == null ? '' : U.n(b.bajas)}</td><td class="der">${b.cambiosNodo == null ? '' : U.n(b.cambiosNodo)}</td></tr>`)}</tbody></table>`
        : html`<div class="vacio">Aquí verás quién subió cada base y cuándo.</div>`}
      </div>
    </section>

    ${local && html`<section class="panel" style="margin-top:20px">
      <div class="panel-cab"><h3>Datos de esta PC</h3></div>
      <div class="panel-cuerpo" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <span class="sub" style="flex:1;min-width:260px">En demostración, la base, las fallas y las consultas se guardan solo en este navegador.</span>
        <button class="btn btn-borde btn-chico" onClick=${() => setConfirmarDemo(true)}>Cargar demostración</button>
        <button class="btn btn-fantasma btn-chico" onClick=${() => setConfirmarBorrar(true)}><${Ico} n="papelera" s=${15} />Vaciar datos de esta PC</button>
      </div>
    </section>`}
    ${confirmarDemo && html`<${Modal} titulo="Cargar datos de demostración" sub="Reemplaza la base, las fallas y las consultas de esta PC por datos ficticios para practicar o presentar." onCerrar=${() => setConfirmarDemo(false)}
      pie=${html`<button class="btn btn-borde" onClick=${() => setConfirmarDemo(false)}>Cancelar</button><button class="btn btn-primario" onClick=${() => { setConfirmarDemo(false); A.cargarDemo(); }}>Cargar demostración</button>`}>
      <div class="nota"><${Ico} n="alerta" s=${18} /><span>Lo que haya ahora en esta PC se borra.</span></div>
    </${Modal}>`}
    ${confirmarBorrar && html`<${Modal} titulo="Vaciar datos de esta PC" sub="Borra la base de clientes, las fallas y las consultas guardadas en este navegador." onCerrar=${() => setConfirmarBorrar(false)}
      pie=${html`<button class="btn btn-borde" onClick=${() => setConfirmarBorrar(false)}>Cancelar</button><button class="btn btn-peligro" onClick=${async () => { setConfirmarBorrar(false); await A.borrarTodo(); tostada('Datos borrados de esta PC'); }}>Vaciar datos</button>`}>
      <div class="nota"><${Ico} n="alerta" s=${18} /><span>No se puede deshacer.</span></div>
    </${Modal}>`}
  </div>`;
}
