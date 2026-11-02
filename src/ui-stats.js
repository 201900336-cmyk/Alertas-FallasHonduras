/* ==========================================================================
   ALERTAS · Estadísticas para la jefatura y gerencia
   ========================================================================== */

function useAncho(ref, base) {
  const [w, setW] = useState(base || 600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((ent) => { const x = Math.floor(ent[0].contentRect.width); if (x > 0) setW(x); });
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return w;
}
function useTooltip() {
  const [t, setT] = useState(null);
  const mostrar = (e, contenido) => setT({ x: e.clientX, y: e.clientY, c: contenido });
  const ocultar = () => setT(null);
  const nodo = t ? html`<div class="tooltip" style=${'left:' + Math.min(t.x + 14, window.innerWidth - 200) + 'px;top:' + (t.y + 14) + 'px'}>${t.c}</div>` : null;
  return { mostrar, ocultar, nodo };
}
const techo = (v) => { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

const PERIODOS = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['90', '90 días']];

function VistaStats() {
  const s = useG();
  const [per, setPer] = useState('7');
  const [cons, setCons] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [intento, setIntento] = useState(0);
  const desde = per === 'hoy' ? U.inicioDia(s.now) : U.inicioDia(s.now - (Number(per) - 1) * U.DIA);
  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    Backend.estadisticas({ desde, porHora: per === 'hoy' })
      .then((r) => { if (vivo) { setCons(r); setCargando(false); } })
      .catch((e) => { if (vivo) { setError(e); setCargando(false); } });
    return () => { vivo = false; };
  }, [desde, per, s.meta.version, intento]);
  const d = useMemo(() => (cons ? calcular(s, cons, desde, per) : null), [cons, s.fallas, s.cat, s.cargas, desde, per]);
  const esJefe = s.user && CONFIG.roles[s.user.rol].equipo;
  if (!s.resumen && !s.cargando) return html`<${SinBase} />`;
  return html`<div>
    <div class="titulo-vista">
      <div><h1>Estadísticas</h1><p>Cómo se usa Alertas y dónde nos golpean las fallas. ${per === 'hoy' ? 'Hoy, ' + U.largo(s.now) + '.' : 'Desde el ' + U.dia(desde) + '.'}</p></div>
      <div class="der">
        <div class="seg" role="group" aria-label="Periodo">${PERIODOS.map(([k, t]) => html`<button type="button" aria-pressed=${per === k} onClick=${() => setPer(k)} key=${k}>${t}</button>`)}</div>
      </div>
    </div>
    ${error ? html`<div class="panel no-encontrado"><div class="ico"><${Ico} n="alerta" s=${24} /></div><div><h3>No se pudieron calcular las estadísticas</h3><p>${error.message}</p>
        <button class="btn btn-borde btn-chico" style="margin-top:12px" onClick=${() => setIntento(intento + 1)}>Intentar de nuevo</button></div></div>`
      : !d ? html`<div class="panel vacio"><b>Calculando…</b>Revisando la bitácora de consultas.</div>` : html`<div class=${cargando ? 'cargando' : ''}>
      <div class="panel kpis">
        <div class="kpi"><div class="l">Consultas en Alertas</div><div class="v">${U.n(d.consultas)}</div><div class="d">${d.clientesAprox ? '≈ ' : ''}${U.n(d.clientesUnicos)} clientes distintos</div></div>
        <div class="kpi"><div class="l">Explicadas por falla general</div><div class="v">${d.consultas ? U.pct(d.conFalla, d.consultas) + ' %' : '0 %'}</div><div class="d">${U.n(d.conFalla)} consultas con falla activa</div></div>
        <div class="kpi"><div class="l">Fallas publicadas</div><div class="v">${U.n(d.fallas.length)}</div><div class="d">${U.n(d.activas)} activas ahora</div></div>
        <div class="kpi"><div class="l">Clientes afectados</div><div class="v">${U.compact(d.afectados)}</div><div class="d">HFC ${U.compact(d.afH)}, GPON ${U.compact(d.afG)}</div></div>
        <div class="kpi"><div class="l">Duración promedio</div><div class="v">${d.mttr ? U.durCorto(d.mttr) : 'Sin datos'}</div><div class="d">del inicio a la solución</div></div>
        <div class="kpi"><div class="l">Tiempo en publicar</div><div class="v">${d.tPub ? U.durCorto(d.tPub) : 'Sin datos'}</div><div class="d">desde el inicio de la falla</div></div>
      </div>
      <div class="stats-grid">
        <section class="panel c-8"><div class="panel-cab"><h3>${per === 'hoy' ? 'Consultas por hora' : 'Consultas por día'}</h3></div>
          <div class="panel-cuerpo"><${GraficaConsultas} serie=${d.serie} porHora=${per === 'hoy'} /></div></section>
        <section class="panel c-4"><div class="panel-cab"><h3>HFC frente a GPON</h3></div>
          <div class="panel-cuerpo"><${Comparativo} d=${d} /></div></section>
        <section class="panel c-12"><${Deteccion} x=${d.det} /></section>
        <section class="panel c-7"><div class="panel-cab"><h3>Clientes afectados por departamento</h3><span class="der sub">Suma de clientes en las fallas del periodo</span></div>
          <div class="panel-cuerpo"><${MapaHonduras} valores=${d.porDep} fallas=${d.fallasPorDep} /></div></section>
        <section class="panel c-5"><div class="panel-cab"><h3>Motivos de las fallas</h3></div>
          <div class="panel-cuerpo">${d.motivos.length ? d.motivos.map(([m, n]) => html`<${HBar} etiqueta=${m} valor=${n} max=${d.motivos[0][1]} key=${m} />`) : html`<div class="vacio">Sin fallas en este periodo.</div>`}</div></section>
        <section class="panel c-7"><${TablaReincidentes} filas=${d.reincidentes} /></section>
        <section class="panel c-5"><${TablaClientes} filas=${d.topClientes} recurrentes=${d.recurrentes} /></section>
        <section class="panel c-12"><${Asesores} d=${d} /></section>
        ${esJefe && html`<section class="panel c-12"><${Equipo} d=${d} /></section>`}
      </div>
    </div>`}
  </div>`;
}

/* ---------- Cálculos ----------
   Lo que sale de la bitácora de consultas lo calcula el servidor (c);
   lo que sale de las fallas se calcula aquí con el catálogo de nodos. */
const claveDia = (t) => new Date(U.inicioDia(t) + 12 * U.HORA).toISOString().slice(0, 10);
function calcular(s, c, desde, per) {
  const cat = s.cat, now = s.now;
  // Las posibles fallas que el VOC descartó no fueron fallas: no cuentan en las estadísticas
  const delPeriodo = s.fallas.filter((f) => f.publicadaEn >= desde);
  const fallas = delPeriodo.filter((f) => !Model.descartada(f));
  const cerradas = fallas.filter((f) => f.estado === 'CERRADA');
  const prom = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const mttr = prom(cerradas.map((f) => f.cerradaEn - f.inicio));
  const tPub = prom(fallas.map((f) => Math.max(0, f.publicadaEn - f.inicio)));
  let afH = 0, afG = 0;
  fallas.forEach((f) => { afH += f.impacto.hfc || 0; afG += f.impacto.gpon || 0; });

  // Serie continua (horas del día o cada día del periodo)
  const porClave = new Map((c.serie || []).map((x) => [String(x.k), x]));
  const serie = [];
  if (per === 'hoy') {
    for (let h = 0; h < 24; h++) { const x = porClave.get(String(h)) || {}; serie.push({ k: h, t: desde + h * U.HORA, falla: x.falla || 0, otras: x.otras || 0 }); }
  } else {
    for (let t = desde, k = 0; t <= now && k < 120; t = U.inicioDia(t + 30 * U.HORA), k++) { const x = porClave.get(claveDia(t)) || {}; serie.push({ k, t, falla: x.falla || 0, otras: x.otras || 0 }); }
  }

  // Tecnología
  const tc = c.tecConsultas || {};
  const tec = { HFC: { fallas: 0, clientes: afH, horas: 0, consultas: tc.HFC || 0 }, GPON: { fallas: 0, clientes: afG, horas: 0, consultas: tc.GPON || 0 } };
  fallas.forEach((f) => {
    tec[(f.impacto.gpon || 0) > (f.impacto.hfc || 0) ? 'GPON' : 'HFC'].fallas++;
    const h = U.horas((f.cerradaEn || now) - f.inicio);
    tec.HFC.horas += h * (f.impacto.hfc || 0); tec.GPON.horas += h * (f.impacto.gpon || 0);
  });

  // Motivos y departamentos
  const mot = new Map(); fallas.forEach((f) => { const k = nombreMotivo(f); mot.set(k, (mot.get(k) || 0) + 1); });
  const motivos = [...mot.entries()].sort((a, b) => b[1] - a[1]);
  const porDep = {}, fallasPorDep = {};
  fallas.forEach((f) => (f.impacto.deps || []).forEach(([dep, n]) => { const k = U.sinAcentos(dep).toUpperCase(); porDep[k] = (porDep[k] || 0) + n; fallasPorDep[k] = (fallasPorDep[k] || 0) + 1; }));

  // Nodos reincidentes
  const nodos = new Map();
  fallas.forEach((f) => f.nodos.forEach((n) => {
    let e = nodos.get(n); if (!e) { e = { nodo: n, fallas: 0, horas: 0, ultima: 0, motivos: new Map() }; nodos.set(n, e); }
    e.fallas++; e.horas += U.horas((f.cerradaEn || now) - f.inicio); e.ultima = Math.max(e.ultima, f.inicio);
    const mk = cortoMotivo(f); e.motivos.set(mk, (e.motivos.get(mk) || 0) + 1);
  }));
  const reincidentes = [...nodos.values()].sort((a, b) => b.fallas - a.fallas || b.horas - a.horas).slice(0, 10)
    .map((e) => Object.assign(e, { info: Model.infoNodo(cat, e.nodo), motivo: [...e.motivos.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
  let recurrentes = 0;
  nodos.forEach((e) => { if (e.fallas >= 3 && cat && cat.nodos.get(e.nodo)) recurrentes += cat.nodos.get(e.nodo).total; });
  const topClientes = (c.topContratos || []).map((x) => ({ i: x.contrato, consultas: x.consultas, fallas: (nodos.get(x.nodo) || {}).fallas || 0, rec: { contrato: x.contrato, nombre: x.nombre, nodo: x.nodo, categoria: x.categoria } }));

  // Equipo Workforce y bitácora
  const eq = new Map();
  const persona = (p) => { const k = p.u || p.nombre; let e = eq.get(k); if (!e) { e = { nombre: p.nombre, publicadas: 0, cerradas: 0, ediciones: 0, clientes: 0, tPub: [], dur: [] }; eq.set(k, e); } return e; };
  const bitacora = [];
  s.fallas.forEach((f) => f.historial.forEach((h) => {
    if (h.en < desde) return;
    const e = persona(h.por);
    if (h.accion === 'PUBLICADA') { e.publicadas++; e.clientes += f.impacto.total || 0; e.tPub.push(Math.max(0, f.publicadaEn - f.inicio)); }
    if (h.accion === 'CERRADA') { e.cerradas++; if (f.cerradaEn) e.dur.push(f.cerradaEn - f.inicio); }
    if (h.accion === 'EDITADA' || h.accion === 'REABIERTA') e.ediciones++;
    bitacora.push({ en: h.en, quien: h.por.nombre, texto: verboAccion(h.accion) + ' la falla ' + U.numeroFalla(f) + (h.detalle ? ': ' + h.detalle : '') });
  }));
  (s.cargas || []).forEach((b) => { if (b.en >= desde) bitacora.push({ en: b.en, quien: b.por.nombre, texto: 'subió la base de clientes (' + U.n(b.filas) + ' servicios)' }); });
  bitacora.sort((a, b) => b.en - a.en);
  const equipo = [...eq.values()].map((e) => Object.assign(e, { tPubP: prom(e.tPub), durP: prom(e.dur) })).sort((a, b) => b.publicadas - a.publicadas);

  // Detección: cuánto pasó desde la primera llamada del nodo hasta publicar la falla. El servidor lo
  // calcula y lo guarda al publicarla; las fallas publicadas antes de este cambio no lo tienen.
  const mediana = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const conDato = fallas.filter((f) => f.deteccion).sort((a, b) => b.publicadaEn - a.publicadaEn);
  const conLlamadas = conDato.filter((f) => f.deteccion.primera);
  const conAviso = conDato.filter((f) => f.deteccion.aviso);
  const det = {
    filas: conDato, sinDato: fallas.length - conDato.length, descartadas: delPeriodo.length - fallas.length,
    conLlamadas: conLlamadas.length, primera: mediana(conLlamadas.map((f) => f.publicadaEn - f.deteccion.primera)),
    conAviso: conAviso.length, aviso: mediana(conAviso.map((f) => f.publicadaEn - f.deteccion.aviso)),
    antes: conDato.length - conLlamadas.length, clientes: conDato.reduce((a, f) => a + (f.deteccion.clientes || 0), 0)
  };

  return { consultas: c.consultas || 0, conFalla: c.conFalla || 0, clientesUnicos: c.clientesUnicos || 0, clientesAprox: !!c.clientesAprox, fallas, activas: s.fallas.filter((f) => f.estado === 'ACTIVA').length,
    afectados: afH + afG, afH, afG, mttr, tPub, serie, tec, motivos, porDep, fallasPorDep, reincidentes, topClientes, recurrentes,
    canales: c.canales || {}, asesores: c.asesores || [], reportes: c.reportes || 0, equipo, bitacora, det };
}

/* ---------- Gráficas ---------- */
function GraficaConsultas({ serie, porHora }) {
  const ref = useRef(null); const W = useAncho(ref, 700); const tt = useTooltip();
  const H = 260, mi = 40, md = 8, ms = 12, mb = 28;
  const max = techo(Math.max(1, ...serie.map((x) => x.falla + x.otras)));
  const n = serie.length, banda = (W - mi - md) / n, bw = Math.max(3, Math.min(24, banda * 0.62));
  const y = (v) => ms + (H - ms - mb) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const cadaX = porHora ? 3 : Math.ceil(n / Math.max(1, Math.floor((W - mi) / 64)));
  const etiqueta = (x) => (porHora ? (x.k === 0 ? '12 a. m.' : x.k === 12 ? '12 p. m.' : x.k < 12 ? x.k + ' a. m.' : (x.k - 12) + ' p. m.') : U.dia(x.t));
  return html`<div class="grafica" ref=${ref}>
    <div class="leyenda"><span><i style="background:var(--falla)"></i>Con falla general</span><span><i style="background:var(--chart-rest)"></i>Otras consultas</span></div>
    <svg width=${W} height=${H} role="img" aria-label="Consultas en el tiempo">
      ${ticks.map((t) => html`<g key=${t}><line class="rejilla" x1=${mi} x2=${W - md} y1=${y(t)} y2=${y(t)} /><text x=${mi - 8} y=${y(t) + 4} text-anchor="end">${U.compact(t)}</text></g>`)}
      ${serie.map((x, k) => {
        const cx = mi + banda * k + banda / 2, x0 = cx - bw / 2;
        const tot = x.falla + x.otras;
        const yF = y(x.falla), yT = y(tot);
        const r = Math.min(4, bw / 2);
        const barra = (yTop, yBot, redondo, color) => {
          if (yBot - yTop < 0.5) return null;
          const h = yBot - yTop;
          if (!redondo) return html`<rect x=${x0} y=${yTop} width=${bw} height=${h} fill=${color} />`;
          const rr = Math.min(r, h);
          return html`<path d=${'M' + x0 + ' ' + yBot + 'V' + (yTop + rr) + 'Q' + x0 + ' ' + yTop + ' ' + (x0 + rr) + ' ' + yTop + 'H' + (x0 + bw - rr) + 'Q' + (x0 + bw) + ' ' + yTop + ' ' + (x0 + bw) + ' ' + (yTop + rr) + 'V' + yBot + 'Z'} fill=${color} />`;
        };
        const gap = x.falla > 0 && x.otras > 0 ? 2 : 0;
        return html`<g key=${k}>
          ${barra(yF, y(0), x.otras === 0, 'var(--falla)')}
          ${barra(yT, yF - gap, true, 'var(--chart-rest)')}
          ${(porHora || k % cadaX === 0) && html`<text x=${cx} y=${H - 8} text-anchor="middle">${porHora ? (k % 3 === 0 ? etiqueta(x) : '') : etiqueta(x)}</text>`}
          <rect x=${mi + banda * k} y=${ms} width=${banda} height=${H - ms - mb} fill="transparent" tabindex="0"
            onPointerMove=${(e) => tt.mostrar(e, html`<div class="tl">${porHora ? etiqueta(x) : U.largo(x.t)}</div><div class="tv">${U.n(tot)} consultas</div>
              <div class="tr"><i style="background:var(--falla)"></i>${U.n(x.falla)} con falla</div><div class="tr"><i style="background:var(--chart-rest)"></i>${U.n(x.otras)} otras</div>`)}
            onPointerLeave=${tt.ocultar} onFocus=${(e) => { const b = e.currentTarget.getBoundingClientRect(); tt.mostrar({ clientX: b.left + b.width / 2, clientY: b.top + 20 }, html`<div class="tv">${U.n(tot)} consultas</div><div class="tl">${U.n(x.falla)} con falla</div>`); }} onBlur=${tt.ocultar} />
        </g>`;
      })}
      <line class="eje" x1=${mi} x2=${W - md} y1=${y(0)} y2=${y(0)} />
    </svg>
    ${tt.nodo}
  </div>`;
}

function HBar({ etiqueta, valor, max, color, sufijo }) {
  return html`<div class="hbar"><span>${etiqueta}</span>
    <span class="pista"><i style=${'width:' + Math.max(2, (valor / Math.max(1, max)) * 100) + '%' + (color ? ';background:' + color : '')}></i></span>
    <span class="val">${U.n(valor)}${sufijo || ''}</span></div>`;
}

function Comparativo({ d }) {
  const t = d.tec;
  const filas = [
    ['Fallas publicadas', t.HFC.fallas, t.GPON.fallas, ''],
    ['Clientes afectados', t.HFC.clientes, t.GPON.clientes, ''],
    ['Horas sin servicio por cliente', Math.round(t.HFC.horas), Math.round(t.GPON.horas), ' h'],
    ['Consultas con falla', t.HFC.consultas, t.GPON.consultas, '']
  ];
  return html`<div>
    <div class="leyenda"><span><i style="background:var(--hfc)"></i>HFC</span><span><i style="background:var(--gpon)"></i>GPON</span></div>
    ${filas.map(([l, h, g, suf]) => { const m = Math.max(1, h, g); return html`<div class="comp-fila" key=${l}>
      <div class="comp-l">${l}</div>
      <div class="comp-barras">
        <span class="pista"><i style=${'width:' + Math.max(1.5, (h / m) * 100) + '%;background:var(--hfc)'}></i></span><b class="num">${U.n(h)}${suf}</b>
        <span class="pista"><i style=${'width:' + Math.max(1.5, (g / m) * 100) + '%;background:var(--gpon)'}></i></span><b class="num">${U.n(g)}${suf}</b>
      </div>
    </div>`; })}
    <p class="sub" style="margin:4px 0 0">Una falla cuenta como HFC o GPON según la mayoría de sus clientes.</p>
  </div>`;
}

/* Dónde va el nombre de cada departamento (en las coordenadas del mapa, 1000 x 589): el punto más adentro
   de cada uno, calculado con su contorno. Los nombres largos van en dos líneas; Islas de la Bahía, en el mar. */
const HN_NOMBRES = {
  OCOTEPEQUE: [45, 333, 'Ocotepeque'], COPAN: [70, 264, 'Copán'], LEMPIRA: [116, 373, 'Lempira'], INTIBUCA: [196, 345, 'Intibucá'],
  'LA PAZ': [229, 404, 'La Paz'], VALLE: [286, 491, 'Valle'], CHOLUTECA: [356, 542, 'Choluteca'], 'EL PARAISO': [444, 408, 'El Paraíso'],
  'FRANCISCO MORAZAN': [367, 343, 'Francisco', 'Morazán'], COMAYAGUA: [271, 305, 'Comayagua'], 'SANTA BARBARA': [156, 217, 'Santa', 'Bárbara'],
  CORTES: [216, 163, 'Cortés'], YORO: [327, 218, 'Yoro'], ATLANTIDA: [338, 145, 'Atlántida'], COLON: [663, 146, 'Colón'],
  OLANCHO: [585, 281, 'Olancho'], 'GRACIAS A DIOS': [781, 218, 'Gracias a Dios'], 'ISLAS DE LA BAHIA': [515, 58, 'Islas de la Bahía']
};

function MapaHonduras({ valores, fallas, vacio, apilado, nombres }) {
  const tt = useTooltip();
  const [tabla, setTabla] = useState(false);
  const max = Math.max(0, ...Object.values(valores));
  const clase = (v) => (!v || !max ? 0 : Math.max(1, Math.ceil((v / max) * 5)));
  const lista = Object.entries(valores).sort((a, b) => b[1] - a[1]);
  return html`<div class="grafica">
    <div class=${'mapa-grid' + (apilado ? ' apilado' : '')}>
      <svg class="mapa" viewBox=${'0 0 ' + HN_MAPA.w + ' ' + HN_MAPA.h} role="img" aria-label="Mapa de Honduras por departamento">
        ${Object.entries(HN_MAPA.deps).map(([k, dep]) => { const v = valores[k] || 0; return html`<path key=${k} d=${dep.d} fill=${'var(--seq-' + clase(v) + ')'} tabindex="0"
          onPointerMove=${(e) => tt.mostrar(e, html`<div class="tl">${dep.name}</div><div class="tv">${U.n(v)} clientes</div><div class="tl">${U.plural(fallas[k] || 0, '1 falla', (fallas[k] || 0) + ' fallas')}</div>`)}
          onPointerLeave=${tt.ocultar} onFocus=${(e) => { const b = e.currentTarget.getBoundingClientRect(); tt.mostrar({ clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }, html`<div class="tl">${dep.name}</div><div class="tv">${U.n(v)} clientes</div>`); }} onBlur=${tt.ocultar} />`; })}
        ${nombres && Object.entries(HN_NOMBRES).map(([k, [x, y, ...lineas]]) => { const c = clase(valores[k] || 0); return html`<text key=${'n-' + k} class="mapa-nombre" data-tono=${c >= 4 ? 'oscuro' : c === 3 ? 'medio' : ''} x=${x} y=${y} aria-hidden="true">
          ${lineas.map((l, i) => html`<tspan x=${x} dy=${i ? '1.15em' : (0.35 - 0.575 * (lineas.length - 1)) + 'em'} key=${i}>${l}</tspan>`)}</text>`; })}
      </svg>
      <div>
        ${lista.length ? html`<div class="hbar cab"><span>Departamento</span><span></span><span class="val">Clientes</span></div>
          ${lista.slice(0, apilado ? 18 : 6).map(([k, v]) => html`<${HBar} etiqueta=${HN_MAPA.deps[k] ? HN_MAPA.deps[k].name : U.lugar(k)} valor=${v} max=${lista[0][1]} color="var(--seq-4)" key=${k} />`)}`
          : html`<div class="vacio">${vacio || 'Sin fallas en este periodo.'}</div>`}
      </div>
    </div>
    <div class="escala"><span>Menos</span><span class="rampa">${[1, 2, 3, 4, 5].map((k) => html`<i style=${'background:var(--seq-' + k + ')'} key=${k}></i>`)}</span><span>Más clientes afectados</span>
      <button class="ver-tabla" style="margin-left:auto" onClick=${() => setTabla(!tabla)}>${tabla ? 'Ocultar tabla' : 'Ver como tabla'}</button></div>
    ${tabla && html`<table class="tabla" style="margin-top:10px"><thead><tr><th>Departamento</th><th class="der">Clientes afectados</th><th class="der">Fallas</th></tr></thead>
      <tbody>${lista.map(([k, v]) => html`<tr key=${k}><td>${HN_MAPA.deps[k] ? HN_MAPA.deps[k].name : U.lugar(k)}</td><td class="der">${U.n(v)}</td><td class="der">${U.n(fallas[k] || 0)}</td></tr>`)}</tbody></table>`}
    ${tt.nodo}
  </div>`;
}

/* ---------- Detección: de la primera llamada a la publicación ----------
   Cada fila es una falla: la barra va desde que llamó el primer cliente hasta que se publicó; la parte
   ámbar es desde el aviso de posible falla (5 clientes distintos o 2 avisos de asesores). */
function Deteccion({ x }) {
  const [todas, setTodas] = useState(false);
  const lista = todas ? x.filas : x.filas.slice(0, 8);
  const espera = (f) => (f.deteccion.primera ? f.publicadaEn - f.deteccion.primera : 0);
  const max = Math.max(20 * U.MIN, ...lista.map(espera));
  const pct = (ms) => Math.max(0, Math.min(100, (ms / max) * 100));
  const nodos = (f) => f.nodos.slice(0, 3).join(', ') + (f.nodos.length > 3 ? ' +' + (f.nodos.length - 3) : '');
  const fecha = (t) => new Date(t).toLocaleString('es-HN');
  const minutos = (ms) => Math.round(ms / U.MIN);
  const exportar = () => U.descargarCsv('deteccion-fallas.csv', [['Número de falla', 'Motivo', 'Nodos', 'Publicada', 'Primera llamada', 'Aviso de posible falla',
    'Minutos desde la primera llamada', 'Minutos desde el aviso', 'Llamadas antes de publicar', 'Clientes antes de publicar']]
    .concat(x.filas.map((f) => { const t = f.deteccion; return [U.numeroFalla(f), nombreMotivo(f), f.nodos.join(' '), fecha(f.publicadaEn), t.primera ? fecha(t.primera) : '',
      t.aviso ? fecha(t.aviso) : '', t.primera ? minutos(f.publicadaEn - t.primera) : 0, t.aviso ? minutos(f.publicadaEn - t.aviso) : '', t.llamadas, t.clientes]; })));
  const nota = 'Cuenta las consultas de Concentrix y Tiendas en los nodos de la falla en las 4 horas antes de publicarla, sin pausas de más de 45 minutos entre una y otra ni antes de publicar. '
    + 'El aviso es el momento en que se juntaron ' + CONFIG.alerta.clientesDistintos + ' clientes distintos en ' + CONFIG.alerta.minutos + ' minutos o ' + CONFIG.alerta.reportes + ' avisos de asesores. '
    + (x.sinDato ? U.plural(x.sinDato, '1 falla del periodo se publicó', x.sinDato + ' fallas del periodo se publicaron') + ' antes de que Alertas midiera esto y no ' + (x.sinDato === 1 ? 'tiene' : 'tienen') + ' el dato.' : '');
  return html`<div class="deteccion">
    <div class="panel-cab"><div><h3>Detección de fallas</h3><div class="sub">Cuánto pasó desde que los clientes empezaron a llamar hasta que se publicó la falla</div></div>
      <div class="der">
        ${x.descartadas ? html`<span class="chip">${U.plural(x.descartadas, '1 posible falla descartada', x.descartadas + ' posibles fallas descartadas')}</span>` : null}
        <button class="btn btn-borde btn-chico" disabled=${!x.filas.length} onClick=${exportar}><${Ico} n="descargar" s=${15} />CSV</button>
      </div></div>
    ${x.filas.length ? html`
      <div class="kpis det-kpis">
        <div class="kpi"><div class="l">De la primera llamada a publicar</div><div class="v">${x.conLlamadas ? U.durCorto(x.primera) : 'Sin datos'}</div>
          <div class="d">${x.conLlamadas ? 'Mediana de ' + U.plural(x.conLlamadas, '1 falla', x.conLlamadas + ' fallas') : 'Ninguna falla tuvo llamadas antes'}</div></div>
        <div class="kpi"><div class="l">Del aviso a publicar</div><div class="v">${x.conAviso ? U.durCorto(x.aviso) : 'Sin datos'}</div>
          <div class="d">${x.conAviso ? 'Mediana de ' + U.plural(x.conAviso, '1 falla', x.conAviso + ' fallas') + ' con aviso antes' : 'El aviso no se activó antes de publicar'}</div></div>
        <div class="kpi"><div class="l">Publicadas antes de que llamaran</div><div class="v">${U.pct(x.antes, x.filas.length)} %</div>
          <div class="d">${x.antes} de ${U.plural(x.filas.length, '1 falla', x.filas.length + ' fallas')}</div></div>
        <div class="kpi"><div class="l">Clientes que llamaron antes</div><div class="v">${U.n(x.clientes)}</div>
          <div class="d">Se atendieron sin saber de la falla</div></div>
      </div>
      <div class="panel-cuerpo">
        ${x.conLlamadas > 0 && html`<div class="leyenda"><span><i style="background:var(--chart-ink)"></i>Clientes llamando, sin aviso todavía</span><span><i style="background:var(--resuelta)"></i>Del aviso de posible falla a la publicación</span></div>`}
        <div class="tabla-envoltura"><table class="tabla det-tabla">
          <thead><tr><th>Falla</th><th class="det-nodos">Nodos</th><th>Publicada</th><th>Desde la primera llamada</th><th>Aviso de posible falla</th><th class="der">Antes de publicar</th></tr></thead>
          <tbody>${lista.map((f) => { const t = f.deteccion, total = espera(f), deAviso = t.aviso ? f.publicadaEn - t.aviso : 0; return html`<tr key=${f.id}>
            <td><b class="num">${U.numeroFalla(f)}</b><div class="sub">${cortoMotivo(f)}</div><div class="sub codigo det-nodos-movil">${nodos(f)}</div></td>
            <td class="codigo det-nodos">${nodos(f)}</td>
            <td class="num">${U.dia(f.publicadaEn)}, ${U.hora(f.publicadaEn)}</td>
            <td>${t.primera ? html`<div class="det-linea" title=${'Primera llamada: ' + U.hora(t.primera) + (t.aviso ? '. Aviso: ' + U.hora(t.aviso) : '')}>
                <span class="det-pista"><i style=${'width:' + pct(total - deAviso) + '%'}></i>${deAviso ? html`<i class="det-aviso" style=${'width:' + pct(deAviso) + '%'}></i>` : null}</span>
                <b class="num">${U.durCorto(total)}</b></div>`
              : html`<span class="det-ok"><${Ico} n="check" s=${15} />Nadie había llamado</span>`}</td>
            <td>${t.aviso ? U.durCorto(deAviso) + ' antes de publicar' : t.llamadas ? html`<span class="sub">No se activó: nunca hubo ${CONFIG.alerta.clientesDistintos} clientes en ${CONFIG.alerta.minutos} min</span>` : ''}</td>
            <td class="der">${t.llamadas ? html`${U.plural(t.llamadas, '1 llamada', t.llamadas + ' llamadas')}<div class="sub">${U.plural(t.clientes, '1 cliente', t.clientes + ' clientes')}</div>` : html`<span class="sub">Ninguna</span>`}</td>
          </tr>`; })}</tbody></table></div>
        ${x.filas.length > 8 && html`<button class="ver-tabla" onClick=${() => setTodas(!todas)}>${todas ? 'Ver menos' : 'Ver las ' + x.filas.length + ' fallas'}</button>`}
        <p class="sub det-nota">${nota}</p>
      </div>`
    : html`<div class="panel-cuerpo"><div class="vacio">${x.sinDato ? 'Las fallas de este periodo se publicaron antes de que Alertas midiera la detección.' : 'Sin fallas en este periodo.'}</div>
        ${x.sinDato ? html`<p class="sub det-nota">${nota}</p>` : null}</div>`}
  </div>`;
}

/* ---------- Tablas ---------- */
function TablaReincidentes({ filas }) {
  const max = filas.length ? filas[0].fallas : 1;
  const exportar = () => U.descargarCsv('nodos-reincidentes.csv', [['Nodo', 'Tecnología', 'Municipio', 'Fallas', 'Horas afectado', 'Clientes en el nodo', 'Motivo más común', 'Última falla']]
    .concat(filas.map((f) => [f.nodo, f.info ? f.info.tecnologia : '', f.info ? U.lugar(f.info.muni) : '', f.fallas, U.n1(f.horas), f.info ? f.info.total : '', f.motivo, new Date(f.ultima).toLocaleString('es-HN')])));
  return html`<div>
    <div class="panel-cab"><div><h3>Nodos reincidentes</h3><div class="sub">Para la reunión de los lunes con el área técnica</div></div>
      <div class="der"><button class="btn btn-borde btn-chico" disabled=${!filas.length} onClick=${exportar}><${Ico} n="descargar" s=${15} />CSV</button></div></div>
    <div class="panel-cuerpo tabla-envoltura">
      ${filas.length ? html`<table class="tabla"><thead><tr><th>Nodo</th><th>Zona</th><th>Fallas</th><th class="der">Horas</th><th class="der">Clientes</th><th>Motivo más común</th><th>Última</th></tr></thead>
        <tbody>${filas.map((f) => html`<tr key=${f.nodo}>
          <td><span class="codigo">${f.nodo}</span><div><${Tec} t=${f.info ? f.info.tecnologia : ''} /></div></td>
          <td>${f.info ? U.lugar(f.info.muni) : ''}</td>
          <td style="min-width:110px"><div style="display:flex;align-items:center;gap:8px"><b class="num">${f.fallas}</b><span style=${'height:8px;border-radius:0 3px 3px 0;background:var(--chart-ink);width:' + Math.round((f.fallas / max) * 70) + 'px'}></span></div></td>
          <td class="der">${U.n1(f.horas)}</td>
          <td class="der">${f.info ? U.n(f.info.total) : ''}</td>
          <td>${f.motivo}</td>
          <td class="num">${U.dia(f.ultima)}</td></tr>`)}</tbody></table>`
      : html`<div class="vacio">Sin fallas en este periodo.</div>`}
    </div>
  </div>`;
}

function TablaClientes({ filas, recurrentes }) {
  return html`<div>
    <div class="panel-cab"><div><h3>Clientes con más afectaciones</h3><div class="sub">${recurrentes ? U.n(recurrentes) + ' clientes estuvieron en 3 o más fallas en este periodo' : 'Ordenados por consultas estando en falla'}</div></div></div>
    <div class="panel-cuerpo tabla-envoltura">
      ${filas.length ? html`<table class="tabla"><thead><tr><th>Cliente</th><th>Nodo</th><th class="der">Fallas</th><th class="der">Consultas</th></tr></thead>
        <tbody>${filas.map((x) => html`<tr key=${x.i}>
          <td><b>${U.esEmpresa(x.rec.nombre, x.rec.categoria) ? x.rec.nombre : U.titulo(x.rec.nombre)}</b><div class="sub num">Contrato ${x.rec.contrato}</div></td>
          <td class="codigo">${x.rec.nodo}</td><td class="der">${x.fallas}</td><td class="der">${x.consultas}</td></tr>`)}</tbody></table>`
      : html`<div class="vacio">Sin clientes afectados en este periodo.</div>`}
    </div>
  </div>`;
}

function Asesores({ d }) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? d.asesores : d.asesores.slice(0, 8);
  return html`<div>
    <div class="panel-cab"><div><h3>Uso por canal y asesor</h3><div class="sub">${U.n(d.reportes)} ${U.plural(d.reportes, 'aviso de posible falla enviado', 'avisos de posible falla enviados')} por asesores</div></div>
      <div class="der">${Object.entries(d.canales).map(([c, n]) => html`<span class="chip" key=${c}>${c}: <b class="num">${U.n(n)}</b></span>`)}</div></div>
    <div class="panel-cuerpo tabla-envoltura">
      ${lista.length ? html`<table class="tabla"><thead><tr><th>Asesor</th><th>Canal</th><th class="der">Consultas</th><th class="der">Con falla</th><th class="der">% con falla</th><th class="der">Sin resultado</th></tr></thead>
        <tbody>${lista.map((a) => html`<tr key=${a.u}><td class="fuerte">${a.nombre}</td><td>${a.canal}</td><td class="der">${U.n(a.n)}</td><td class="der">${U.n(a.falla)}</td><td class="der">${U.pct(a.falla, a.n)} %</td><td class="der">${U.n(a.noEnc)}</td></tr>`)}</tbody></table>
        ${d.asesores.length > 8 && html`<button class="ver-tabla" onClick=${() => setTodos(!todos)}>${todos ? 'Ver menos' : 'Ver los ' + d.asesores.length + ' asesores'}</button>`}`
      : html`<div class="vacio">Sin consultas en este periodo.</div>`}
    </div>
  </div>`;
}

function Equipo({ d }) {
  const [verTodo, setVerTodo] = useState(false);
  return html`<div>
    <div class="panel-cab"><div><h3>Equipo Workforce HN</h3><div class="sub">Quién publica, edita y cierra las fallas</div></div></div>
    <div class="panel-cuerpo equipo-grid">
      <div class="tabla-envoltura">
        ${d.equipo.length ? html`<table class="tabla"><thead><tr><th>Persona</th><th class="der">Publicadas</th><th class="der">Cerradas</th><th class="der">Ediciones</th><th class="der">Clientes publicados</th><th class="der">Tarda en publicar</th></tr></thead>
          <tbody>${d.equipo.map((e) => html`<tr key=${e.nombre}><td class="fuerte">${e.nombre}</td><td class="der">${e.publicadas}</td><td class="der">${e.cerradas}</td><td class="der">${e.ediciones}</td><td class="der">${U.n(e.clientes)}</td><td class="der">${e.publicadas ? U.dur(e.tPubP) : ''}</td></tr>`)}</tbody></table>`
        : html`<div class="vacio">Nadie ha publicado fallas en este periodo.</div>`}
      </div>
      <div>
        <div style="font-size:13px;font-weight:650;color:var(--ink-2);margin-bottom:6px">Bitácora</div>
        <ul class="bitacora">${(verTodo ? d.bitacora : d.bitacora.slice(0, 8)).map((b, k) => html`<li key=${k}><span class="cuando">${U.dia(b.en)}, ${U.hora(b.en)}</span><span><b>${b.quien}</b> ${b.texto}</span></li>`)}</ul>
        ${d.bitacora.length > 8 && html`<button class="ver-tabla" onClick=${() => setVerTodo(!verTodo)}>${verTodo ? 'Ver menos' : 'Ver toda la bitácora'}</button>`}
      </div>
    </div>
  </div>`;
}
