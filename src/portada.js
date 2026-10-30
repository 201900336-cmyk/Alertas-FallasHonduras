/* ==========================================================================
   ALERTAS · Portada (pantalla de entrada)
   Honduras de noche: la red entre ciudades, una tormenta eléctrica sobre la
   costa norte y, en ciclo de 18 s, tres fallas de ejemplo (rayo, nodo en rojo,
   departamento marcado). Abajo a la derecha, el zoom a Tegucigalpa y sus colonias.
   Es una ilustración: no muestra datos reales ni conteos.
   ========================================================================== */

const Portada = (() => {
  /* Ciudades sobre el mapa (proyección del mapa: x = (lon + 89.35) * 160.77, y = (16.52 - lat) * 166.38).
     [x, y, nombre visible, posición de la etiqueta]. Tegucigalpa va sin nombre: lo lleva el zoom de abajo. */
  const N = {
    teg: [346.9, 407.2, '', 'izq'], sps: [213.0, 169.0, 'San Pedro Sula', 'izq'], lce: [412.8, 126.5, 'La Ceiba', 'izq'],
    cho: [347.1, 535.6, 'Choluteca', 'der'], roa: [452.2, 34.0, 'Roatán', 'der'], jut: [503.3, 308.4, 'Juticalpa', 'der'],
    ple: [897.6, 208.5, 'Puerto Lempira', 'izq'],
    src: [91.1, 291.7], com: [274.9, 342.7], dan: [444.8, 413.7], pro: [249.2, 186.3], tru: [546.6, 100.4], tel: [302.8, 122.6],
    pco: [226, 118], sig: [244.4, 319.4], gra: [123.3, 322.2], esp: [187.6, 369.4], nac: [300.1, 496.9], oco: [26.8, 347.2],
    sba: [179.5, 266.8], cat: [554.7, 286.2], toc: [538.6, 139.2], yor: [356.4, 230.7], oln: [447.5, 172.5], chm: [224.6, 150.7], lpz: [268.0, 366.6]
  };
  /* Enlaces: f = fibra con datos que viajan, s = fibra quieta, r = radio o submarino (punteado) */
  const E = [
    ['pco', 'chm', 'f'], ['chm', 'sps', 'f'], ['sps', 'pro', 'f'], ['pro', 'tel', 's'], ['tel', 'lce', 'f'], ['lce', 'toc', 'f'], ['toc', 'tru', 's'],
    ['lce', 'roa', 'r'], ['lce', 'oln', 's'], ['oln', 'yor', 's'], ['yor', 'pro', 's'], ['sps', 'sba', 's'], ['sba', 'src', 'f'], ['src', 'oco', 's'],
    ['src', 'gra', 's'], ['gra', 'esp', 's'], ['esp', 'sig', 's'], ['sps', 'sig', 'f'], ['sig', 'com', 'f'], ['com', 'lpz', 's'], ['com', 'teg', 'f'],
    ['teg', 'dan', 's'], ['teg', 'nac', 'f'], ['nac', 'cho', 'f'], ['teg', 'jut', 'f'], ['jut', 'cat', 's'], ['cat', 'ple', 'r']
  ];
  /* Las tres escenas del ciclo */
  const ESCENAS = [
    { n: 'lce', depto: 'ATLANTIDA', motivo: 'Falla de energía comercial', lugar: 'La Ceiba, Atlántida', pos: 'der',
      rayo: [[380, -38], [392, -6], [382, 18], [400, 44], [392, 68], [409, 92], [402, 110], [412, 124]], rama: [[400, 44], [422, 58], [415, 80]] },
    { n: 'sps', depto: 'CORTES', motivo: 'Reemplazo de equipo', lugar: 'San Pedro Sula, Cortés', pos: 'abajo',
      rayo: [[254, -38], [240, 0], [249, 26], [229, 58], [238, 86], [220, 114], [228, 138], [213, 166]], rama: [[238, 86], [256, 100], [250, 122]] },
    { n: 'teg', depto: 'FRANCISCO MORAZAN', motivo: 'Corte de fibra óptica', lugar: 'Tegucigalpa, Col. Kennedy', pos: 'izq' }
  ];

  const linea = (a, b) => 'M' + N[a][0] + ' ' + N[a][1] + 'L' + N[b][0] + ' ' + N[b][1];
  const trazo = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L');

  function Reticula() {
    // Paralelos y meridianos de cada grado, apenas visibles
    const d = [56.3, 217, 377.8, 538.6, 699.3, 860.1].map((x) => 'M' + x + ' -40V715').join('')
      + [86.5, 252.9, 419.3, 585.7].map((y) => 'M0 ' + y + 'H1000').join('');
    return html`<path class="pt-reticula" d=${d} />`;
  }

  function Alerta(e, i) {
    const [x, y] = N[e.n];
    const w = Math.round(Math.max(e.motivo.length * 9.7, e.lugar.length * 7.8) + 34), h = 58;
    const bx = e.pos === 'der' ? x + 20 : e.pos === 'izq' ? x - 20 - w : x - 46;
    const by = e.pos === 'abajo' ? y + 22 : y - 29;
    return html`<g class=${'pt-alerta esc esc-' + (i + 1)}>
      <circle class="pt-onda" cx=${x} cy=${y} r="9" />
      <circle class="pt-onda o2" cx=${x} cy=${y} r="9" />
      <circle class="pt-foco" cx=${x} cy=${y} r="6.5" />
      <rect class="pt-rotulo" x=${bx} y=${by} width=${w} height=${h} rx="8" />
      <rect class="pt-rotulo-barra" x=${bx} y=${by + 10} width="3.5" height=${h - 20} rx="1.75" />
      <text class="pt-rotulo-m" x=${bx + 17} y=${by + 25}>${e.motivo}</text>
      <text class="pt-rotulo-l" x=${bx + 17} y=${by + 45}>${e.lugar}</text>
    </g>`;
  }

  function Ciudad() {
    // Cuadras de una ciudad vista desde arriba, el río Choluteca y algunas colonias de Tegucigalpa
    const calles = [];
    for (let i = 0; i <= 17; i++) calles.push('M' + (640 + i * 24) + ' 420V760');
    for (let j = 0; j <= 16; j++) calles.push('M620 ' + (430 + j * 21) + 'H1050');
    const rio = 'M736 486C760 540 720 575 770 610S793 668 761 693';
    const colonias = [['Comayagüela', 698, 650], ['El Centro', 786, 548], ['Palmira', 852, 536], ['Miraflores', 910, 572], ['Loarque', 790, 684]];
    return html`<g class="pt-urbe">
      <rect class="pt-urbe-marco" x="680" y="440" width="310" height="265" rx="14" />
      <text class="pt-urbe-titulo" x="698" y="471">Tegucigalpa</text>
      <g clip-path="url(#pt-recorte-urbe)">
        <rect class="pt-urbe-fondo" x="692" y="486" width="286" height="207" />
        <g transform="rotate(-12 835 590)">
          <path class="pt-urbe-calles" d=${calles.join('')} />
          <rect class="pt-urbe-zona esc esc-3" x="852" y="618" width="96" height="52" rx="4" />
        </g>
        <path class="pt-urbe-avenida" d="M700 655C760 690 880 690 978 612M790 520C840 515 900 505 978 498M862 486C876 540 898 600 905 693" />
        <path class="pt-urbe-rio-borde" d=${rio} />
        <path class="pt-urbe-rio" d=${rio} />
        ${colonias.map(([t, x, y]) => html`<text class="pt-urbe-colonia" x=${x} y=${y}>${t}</text>`)}
        <text class="pt-urbe-colonia" x="872" y="682">Col. Kennedy</text>
        <g class="esc esc-3">
          <circle class="pt-onda" cx="910" cy="629" r="7" />
          <circle class="pt-onda o2" cx="910" cy="629" r="7" />
          <circle class="pt-foco" cx="910" cy="629" r="5.5" />
          <text class="pt-urbe-colonia roja" x="872" y="682">Col. Kennedy</text>
        </g>
      </g>
    </g>`;
  }

  function Escena() {
    const deps = (typeof HN_MAPA !== 'undefined' && HN_MAPA.deps) || {};
    const claves = Object.keys(deps);
    const [tx, ty] = N.teg;
    return html`<svg viewBox="0 -40 1000 755" preserveAspectRatio="xMidYMid meet" focusable="false">
      <defs>
        <radialGradient id="pt-nube"><stop offset="0" stop-color="#c9cdd2" stop-opacity=".2" /><stop offset=".6" stop-color="#8a9099" stop-opacity=".08" /><stop offset="1" stop-color="#8a9099" stop-opacity="0" /></radialGradient>
        <radialGradient id="pt-nucleo"><stop offset="0" stop-color="#e3241b" stop-opacity=".42" /><stop offset="1" stop-color="#e3241b" stop-opacity="0" /></radialGradient>
        <radialGradient id="pt-desvanecer"><stop offset="0" stop-color="#fff" /><stop offset=".65" stop-color="#fff" stop-opacity=".45" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient>
        <pattern id="pt-gotas" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(16)"><rect width="1.3" height="5.5" fill="#d6dadf" /></pattern>
        <mask id="pt-mascara-nube"><ellipse cx="300" cy="38" rx="270" ry="112" fill="url(#pt-desvanecer)" /></mask>
        <clipPath id="pt-recorte-urbe"><rect x="692" y="486" width="286" height="207" rx="8" /></clipPath>
      </defs>
      <${Reticula} />
      <g class="pt-costa">${claves.map((k) => html`<path d=${deps[k].d} />`)}</g>
      <g class="pt-deptos">${claves.map((k) => html`<path d=${deps[k].d} />`)}</g>
      ${ESCENAS.map((e, i) => deps[e.depto] && html`<path class=${'pt-tinte esc esc-' + (i + 1)} d=${deps[e.depto].d} />`)}
      <g class="pt-tormenta">
        <ellipse cx="300" cy="38" rx="270" ry="112" fill="url(#pt-nube)" />
        <ellipse cx="300" cy="38" rx="270" ry="112" fill="url(#pt-gotas)" mask="url(#pt-mascara-nube)" opacity=".3" />
        <ellipse cx="335" cy="22" rx="130" ry="58" fill="url(#pt-nucleo)" />
      </g>
      <g class="pt-enlaces">${E.map(([a, b, t]) => html`<path class=${'pt-enlace t-' + t} d=${linea(a, b)} />`)}</g>
      <g>${E.filter((x) => x[2] === 'f').map(([a, b], i) => html`<path class="pt-paquete" d=${linea(a, b)} pathLength="100"
        style=${'animation-duration:' + (2.4 + ((i * 0.53) % 2)).toFixed(2) + 's;animation-delay:-' + ((i * 0.91) % 3).toFixed(2) + 's'} />`)}</g>
      <g class="pt-lupa">
        <circle cx=${tx} cy=${ty} r="27" />
        <path d=${'M' + (tx + 22) + ' ' + (ty - 16) + 'L680 452M' + (tx + 20) + ' ' + (ty + 18) + 'L680 694'} />
      </g>
      <g>${Object.keys(N).map((k) => {
        const [x, y, nombre, pos] = N[k];
        return html`<g>
          ${pos && html`<circle class="pt-halo" cx=${x} cy=${y} r="9.5" />`}
          <circle class=${'pt-nodo' + (pos ? ' mayor' : '')} cx=${x} cy=${y} r=${pos ? 4.6 : 3.1} />
          ${nombre && html`<text class="pt-ciudad" x=${pos === 'izq' ? x - 16 : x + 15} y=${pos === 'abajo' ? y + 30 : y + 5}
            text-anchor=${pos === 'izq' ? 'end' : pos === 'abajo' ? 'middle' : 'start'}>${nombre}</text>`}
        </g>`;
      })}</g>
      <${Ciudad} />
      ${ESCENAS.map((e, i) => e.rayo && html`<g class=${'pt-rayo rayo-' + (i + 1)}>
        <path class="pt-rayo-brillo" d=${trazo(e.rayo) + trazo(e.rama)} />
        <path class="pt-rayo-nucleo" d=${trazo(e.rayo) + trazo(e.rama)} />
      </g>`)}
      ${ESCENAS.map(Alerta)}
    </svg>`;
  }

  return { Escena };
})();

/* Panel izquierdo de la entrada (acceso real y demostración) */
function ArteAcceso() {
  return html`<div class="login-arte portada">
    <div class="portada-lluvia" aria-hidden="true"><i class="capa-1"></i><i class="capa-2"></i></div>
    <div class="portada-destello d1" aria-hidden="true"></div>
    <div class="portada-destello d2" aria-hidden="true"></div>
    <div class="marca"><div class="marca-glifo"><${Ico} n="marca" s=${20} /></div><div><div class="marca-nombre">${CONFIG.app}</div><div class="marca-bajada" style="color:inherit;opacity:.7">${CONFIG.bajada}</div></div></div>
    <div class="portada-escena" aria-hidden="true"><${Portada.Escena} /></div>
    <div class="portada-texto">
      <h1>¿Hay falla<br />en su zona?</h1>
      <p>Certifica en segundos si el cliente está dentro de una falla general de la red fija, y le da a quien atiende las palabras para explicárselo.</p>
    </div>
  </div>`;
}
