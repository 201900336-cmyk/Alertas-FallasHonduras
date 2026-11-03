/* ==========================================================================
   ALERTAS · Portada (pantalla de entrada)
   Honduras de noche: la red entre ciudades, las antenas dando señal, las
   cuadrillas que recorren la red y una tormenta eléctrica sobre la costa norte.
   En ciclo de 18 s, tres fallas de ejemplo. En cada una: el rayo, el nodo en
   rojo, el departamento marcado y la antena sin señal; una cuadrilla sale de una
   ciudad cercana con la baliza encendida, sube la escalera, el técnico trabaja
   y el servicio queda restablecido (la antena vuelve a dar señal).
   A la derecha del mapa, el zoom a Tegucigalpa y sus colonias.
   Es una ilustración: no muestra datos reales ni conteos.
   ========================================================================== */

const Portada = (() => {
  /* Ciudades sobre el mapa (proyección del mapa: x = (lon + 89.35) * 160.77, y = (16.52 - lat) * 166.38).
     [x, y, nombre visible, posición de la etiqueta]. Tegucigalpa va sin nombre: lo lleva el zoom de abajo. */
  const N = {
    teg: [346.9, 407.2, '', 'izq'], sps: [213.0, 169.0, 'San Pedro Sula', 'izq'], lce: [412.8, 126.5, 'La Ceiba', 'abajo-izq'],
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
  /* Antenas: [x, y del pie]. Las dos primeras son las de las fallas de La Ceiba y San Pedro Sula. */
  const TORRES = [[384, 130], [247, 138], [482, 292], [640, 240], [850, 302], [300, 305], [138, 258]];
  /* Las tres escenas del ciclo. desde: la ciudad de donde sale la cuadrilla; torre: la antena que se queda sin
     señal (la cuadrilla se estaciona al pie y sube la escalera). Sin torre, la cuadrilla llega al nodo. */
  const ESCENAS = [
    { n: 'lce', depto: 'ATLANTIDA', motivo: 'Falla de energía comercial', lugar: 'La Ceiba, Atlántida', pos: 'der', desde: 'tel', torre: 0,
      rayo: [[372, -38], [386, -10], [375, 12], [392, 34], [381, 52], [391, 64], [384, 76]], rama: [[392, 34], [412, 48], [406, 66]] },
    { n: 'sps', depto: 'CORTES', motivo: 'Reemplazo de equipo', lugar: 'San Pedro Sula, Cortés', pos: 'abajo', desde: 'tel', torre: 1,
      rayo: [[262, -38], [250, -6], [260, 18], [244, 42], [256, 60], [242, 72], [247, 84]], rama: [[244, 42], [226, 58], [232, 76]] },
    { n: 'teg', depto: 'FRANCISCO MORAZAN', motivo: 'Corte de fibra óptica', lugar: 'Tegucigalpa, Col. Kennedy', pos: 'izq', desde: 'dan' }
  ];
  const ESTADOS = [['Cuadrilla en camino', 'pt-e-camino'], ['Técnicos trabajando', 'pt-e-trabajo'], ['Servicio restablecido', 'pt-e-listo']];
  const retraso = (i) => (1.2 + i * 6) + 's';
  /* Tamaño de las antenas y de las camionetas sobre el mapa (en el zoom de Tegucigalpa van más grandes) */
  const ESC_TORRE = 1.25, ESC_CAMION = 1.3, ESC_URBE = 1.5;
  /* Cuadrillas que recorren la red todo el tiempo, de ida y vuelta (puntos o ciudades). No pasan por donde salen
     los rótulos de las fallas. desfase: en qué parte del recorrido arrancan, para que no salgan todas juntas. */
  const RONDAS = [
    { p: [[414.5, 364.5], 'jut', 'cat'], vel: 16, desfase: 0.3 },
    { p: ['sig', 'esp', 'gra', 'src', [135.3, 279.3]], vel: 16, desfase: 0.62 },
    { p: ['nac', [333.2, 524.4]], vel: 8, desfase: 0.1 }
  ];

  const linea = (a, b) => 'M' + N[a][0] + ' ' + N[a][1] + 'L' + N[b][0] + ' ' + N[b][1];
  const trazo = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L');
  const punto = (p) => (typeof p === 'string' ? N[p].slice(0, 2) : p);

  /* Ida y vuelta a velocidad constante, con una pausa en cada punta. Al cambiar de sentido la camioneta da la
     vuelta (0.3 s). Devuelve la duración y los fotogramas [segundo, x, y, sentido]. */
  function recorrido(pts, vel, pausa) {
    const ev = [];
    let t = 0, s = pts[1][0] >= pts[0][0] ? 1 : -1;
    const inicial = s;
    ev.push([0, pts[0][0], pts[0][1], s]);
    const tramo = (lista) => {
      for (let i = 1; i < lista.length; i++) {
        const a = lista[i - 1], b = lista[i];
        const ns = b[0] > a[0] + 0.5 ? 1 : b[0] < a[0] - 0.5 ? -1 : s;
        if (ns !== s) { t += 0.3; s = ns; ev.push([t, a[0], a[1], s]); }
        t += Math.hypot(b[0] - a[0], b[1] - a[1]) / vel;
        ev.push([t, b[0], b[1], s]);
      }
      const fin = lista[lista.length - 1];
      t += pausa; ev.push([t, fin[0], fin[1], s]);
    };
    tramo(pts); tramo(pts.slice().reverse());
    if (s !== inicial) { t += 0.3; ev.push([t, pts[0][0], pts[0][1], inicial]); }
    return { dur: t, ev };
  }
  const fotogramas = (nombre, r) => '@keyframes ' + nombre + '{' + r.ev.map(([t, x, y, s]) =>
    (t / r.dur * 100).toFixed(3) + '%{transform:translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scaleX(' + s + ')}').join('') + '}';

  function Reticula() {
    // Paralelos y meridianos de cada grado, apenas visibles
    const d = [56.3, 217, 377.8, 538.6, 699.3, 860.1].map((x) => 'M' + x + ' -12V600').join('')
      + [86.5, 252.9, 419.3, 585.7].map((y) => 'M0 ' + y + 'H1000').join('');
    return html`<path class="pt-reticula" d=${d} />`;
  }

  function Alerta(e, i) {
    const [x, y] = N[e.n];
    // A la derecha del título va "Ejemplo": la portada también muestra datos reales (el monitoreo en vivo)
    const w = Math.round(Math.max(e.motivo.length * 9.7, e.lugar.length * 7.8, 172) + 34 + 70), h = 84;
    const bx = e.pos === 'der' ? x + 20 : e.pos === 'izq' ? x - 20 - w : x - 46;
    const by = e.pos === 'abajo' ? y + 22 : y - 29;
    return html`<g class=${'pt-alerta esc esc-' + (i + 1)} style=${'--d:' + retraso(i)}>
      <g class="pt-activo">
        <circle class="pt-onda" cx=${x} cy=${y} r="9" />
        <circle class="pt-onda o2" cx=${x} cy=${y} r="9" />
        <circle class="pt-foco" cx=${x} cy=${y} r="6.5" />
      </g>
      <g class="pt-ok">
        <circle class="pt-ok-fondo" cx=${x} cy=${y} r="9" />
        <path class="pt-ok-check" d=${'M' + (x - 4) + ' ' + y + 'l2.8 2.9l5.4-5.8'} />
      </g>
      <rect class="pt-rotulo" x=${bx} y=${by} width=${w} height=${h} rx="8" />
      <rect class="pt-rotulo-barra" x=${bx} y=${by + 10} width="3.5" height=${h - 20} rx="1.75" />
      <text class="pt-rotulo-m" x=${bx + 17} y=${by + 25}>${e.motivo}</text>
      <rect class="pt-rotulo-ej-caja" x=${bx + w - 72} y=${by + 11} width="60" height="19" rx="9.5" />
      <text class="pt-rotulo-ej" x=${bx + w - 42} y=${by + 24.5} text-anchor="middle">Ejemplo</text>
      <text class="pt-rotulo-l" x=${bx + 17} y=${by + 45}>${e.lugar}</text>
      ${ESTADOS.map(([t, c]) => html`<text class=${'pt-rotulo-e ' + c} x=${bx + 17} y=${by + 69} key=${c}>${t}</text>`)}
    </g>`;
  }

  /* Antena de telecomunicaciones: torre de celosía pintada en franjas rojas y blancas, como las de Honduras
     (norma de aviación: 7 franjas iguales, las de los extremos del color oscuro), con sus paneles y la señal
     que sale a los dos lados. (0, 0) es el pie. La de una falla se queda sin señal, con la luz en rojo, hasta
     que se restablece. */
  const FRANJAS = Array.from({ length: 7 }, (_, k) => [k / 7, (k + 1) / 7, k % 2 ? '#eef0f2' : '#e0412b']);
  const arco = (r) => {
    const c = (r * 0.788).toFixed(2), a = (34 + r * 0.616).toFixed(2), b = (34 - r * 0.616).toFixed(2);
    return 'M' + c + ' -' + a + 'A' + r + ' ' + r + ' 0 0 1 ' + c + ' -' + b + 'M-' + c + ' -' + a + 'A' + r + ' ' + r + ' 0 0 0 -' + c + ' -' + b;
  };
  const ARCOS = [6.5, 10.5, 14.5].map(arco);
  const REJA = 'M-5 0L-1.3 -30M5 0L1.3 -30M-5 0L4.38 -5L-3.77 -10L3.15 -15L-2.53 -20L1.92 -25L-1.3 -30'
    + 'M5 0L-4.38 -5L3.77 -10L-3.15 -15L2.53 -20L-1.92 -25L1.3 -30M-3.2 -30H3.2M0 -30V-40.5';
  const PANELES = 'M-4.3 -36.4h1.7v5.6h-1.7zM2.6 -36.4h1.7v5.6h-1.7zM-1.9 -23.6a2.1 2.1 0 0 0 0 4.2z';
  function Torre({ t, i }) {
    const esc = ESCENAS.findIndex((e) => e.torre === i);
    return html`<g class=${'pt-torre' + (esc >= 0 ? ' con-falla f' + (esc + 1) : '')} transform=${'translate(' + t[0] + ' ' + t[1] + ') scale(' + ESC_TORRE + ')'}
      style=${'--t:-' + ((i * 0.83) % 2.4).toFixed(2) + 's' + (esc >= 0 ? ';--d:' + retraso(esc) : '')}>
      <path class="pt-torre-cuerpo" d="M-5 0L-1.3 -30H1.3L5 0z" />
      <path class="pt-torre-reja" d=${REJA} />
      <path class="pt-torre-panel" d=${PANELES} />
      <g class="pt-senal">${ARCOS.map((d, k) => html`<path class=${'pt-arco a' + k} d=${d} key=${k} />`)}</g>
      <circle class="pt-torre-luz" cy="-41.6" r="1.2" />
      ${esc >= 0 && html`<g class="pt-torre-falla"><circle class="pt-torre-falla-halo" cy="-41.6" r="6" /><circle cy="-41.6" r="1.9" /></g>
        <circle class="pt-torre-vuelve" cy="-34" r="7" />`}
    </g>`;
  }

  /* Camioneta de la cuadrilla, vista de lado y mirando a la derecha; (0, 0) es el suelo entre las ruedas.
     Lleva la escalera en el techo; en el sitio la sube y el técnico trabaja arriba (chispas). */
  const ESCALONES = Array.from({ length: 8 }, (_, i) => 'M' + (-16 + i * 3) + ' -14.2V-16.4').join('');
  function Camion({ baliza, sube }) {
    return html`<g class="pt-camion">
      <path class="pt-faro-luz" d="M17.6 -7.4L44 -13V-0.6L17.6 -5.2z" />
      <path class="pt-camion-soporte" d="M-15.5 -12V-14.2M0.5 -12V-14.2" />
      <path class="pt-camion-cuerpo" d="M-17.5 -5.2V-11a1 1 0 0 1 1-1H2.5V-4.2H-16.5a1 1 0 0 1-1-1zM2.5 -4.2V-12.6H9.6L13.2 -8.4H16.4a1.2 1.2 0 0 1 1.2 1.2V-5.4a1.2 1.2 0 0 1-1.2 1.2z" />
      <path class="pt-camion-vidrio" d="M4.2 -11.2H9L11.5 -8.4H4.2z" />
      <path class="pt-camion-linea" d="M-17.5 -7.6H2.5M-11 -11.2V-4.8M-4.5 -11.2V-4.8" />
      <circle class="pt-faro" cx="17" cy="-6.4" r="0.95" />
      <g class="pt-rueda"><circle cx="-9.5" cy="-2.9" r="2.9" /><circle cx="10" cy="-2.9" r="2.9" /></g>
      <g class="pt-rin"><circle cx="-9.5" cy="-2.9" r="1" /><circle cx="10" cy="-2.9" r="1" /></g>
      <g class=${'pt-escalera' + (sube ? ' sube' : '')}><path d=${'M-18.5 -14.2H6.5M-18.5 -16.4H6.5' + ESCALONES} /></g>
      ${baliza && html`<g class="pt-baliza"><circle class="pt-baliza-halo" cx="8.5" cy="-13.2" r="6" /><path class="pt-baliza-luz" d="M7.2 -12.6a1.3 1.3 0 0 1 2.6 0z" /></g>`}
      ${sube && html`<g class="pt-obrero">
        <path class="pt-obrero-cuerpo" d="M-10.4 -25.6l0.9 -5.2h2.6l0.2 5.2z" />
        <circle class="pt-obrero-cara" cx="-8.1" cy="-32.6" r="1.3" />
        <path class="pt-obrero-casco" d="M-9.9 -32.9a1.8 1.8 0 0 1 3.6 0z" />
        <g class="pt-chispas"><path class="pt-chispa" d="M-1.6 -36.6l2.4 -2.6M-0.6 -34.2h3.4M-3.4 -38.2v-3.2M-0.8 -31.6l2.4 1.8" /></g>
      </g>`}
    </g>`;
  }

  /* La cuadrilla de una falla: sale de una ciudad cercana con la baliza encendida, se estaciona al pie de la
     antena (o junto al nodo), sube la escalera y el técnico trabaja hasta que el servicio queda restablecido */
  function Cuadrilla(e, i) {
    const [x0, y0] = N[e.desde];
    let xs, ys;
    if (e.torre >= 0) {
      // La escalera subida queda contra la antena: la camioneta un poco adelante del pie
      const [tx, ty] = TORRES[e.torre], d = 2.6 * ESC_CAMION;
      xs = tx + (tx >= x0 ? d : -d); ys = ty;
    } else {
      const [x1, y1] = N[e.n], dx = x1 - x0, dy = y1 - y0, largo = Math.hypot(dx, dy), k = Math.max(0, (largo - 24) / largo);
      xs = +(x0 + dx * k).toFixed(1); ys = +(y0 + dy * k).toFixed(1);
    }
    return html`<g class=${'pt-cuadrilla esc esc-' + (i + 1)} style=${'--d:' + retraso(i)}>
      <path class="pt-ruta" d=${'M' + x0 + ' ' + y0 + 'L' + xs + ' ' + ys} pathLength="100" />
      <g class="pt-viaje" style=${'--x0:' + x0 + 'px;--y0:' + y0 + 'px;--x1:' + xs + 'px;--y1:' + ys + 'px'}>
        <g transform=${'scale(' + (xs < x0 ? -ESC_CAMION : ESC_CAMION) + ' ' + ESC_CAMION + ')'}><${Camion} baliza=${true} sube=${e.torre >= 0} /></g>
      </g>
    </g>`;
  }

  /* Las cuadrillas que recorren la red */
  function Rondas({ lista, prefijo, escala }) {
    return html`<g>${lista.map((r, i) => {
      const pts = r.p.map(punto), rec = recorrido(pts, r.vel, 1.6), nombre = prefijo + i;
      const s0 = pts[1][0] >= pts[0][0] ? 1 : -1;
      return html`<g key=${nombre}>
        <style>${fotogramas(nombre, rec)}</style>
        <g class="pt-ronda" transform=${'translate(' + pts[0][0] + ' ' + pts[0][1] + ')' + (s0 < 0 ? ' scale(-1 1)' : '')}
          style=${'animation:' + nombre + ' ' + rec.dur.toFixed(2) + 's linear infinite;animation-delay:-' + (rec.dur * r.desfase).toFixed(2) + 's'}>
          <g transform=${'scale(' + escala + ')'}><${Camion} /></g>
        </g>
      </g>`;
    })}</g>`;
  }

  function Ciudad() {
    // Cuadras de una ciudad vista desde arriba, el río Choluteca y algunas colonias de Tegucigalpa
    const calles = [];
    for (let i = 0; i <= 17; i++) calles.push('M' + (640 + i * 24) + ' 420V760');
    for (let j = 0; j <= 16; j++) calles.push('M620 ' + (430 + j * 21) + 'H1050');
    const rio = 'M736 486C760 540 720 575 770 610S793 668 761 693';
    const colonias = [['Comayagüela', 698, 650], ['El Centro', 786, 548], ['Palmira', 852, 536], ['Miraflores', 910, 572], ['Loarque', 790, 684]];
    // En el zoom todo se ve más cerca: la camioneta va más grande
    const [xa, ya, xb, yb] = [792, 560, 884, 618];
    // Dibujado en 680..990 x 440..705 y llevado a la derecha del mapa (Nicaragua), donde no tapa ningún departamento
    return html`<g class="pt-urbe" transform="translate(712 345) scale(0.9) translate(-680 -440)">
      <rect class="pt-urbe-marco" x="680" y="440" width="310" height="265" rx="14" />
      <text class="pt-urbe-titulo" x="698" y="471">Tegucigalpa</text>
      <g clip-path="url(#pt-recorte-urbe)">
        <rect class="pt-urbe-fondo" x="692" y="486" width="286" height="207" />
        <g transform="rotate(-12 835 590)">
          <path class="pt-urbe-calles" d=${calles.join('')} />
          <rect class="pt-urbe-zona esc esc-3" style=${'--d:' + retraso(2)} x="852" y="618" width="96" height="52" rx="4" />
        </g>
        <path class="pt-urbe-avenida" d="M700 655C760 690 880 690 978 612M790 520C840 515 900 505 978 498M862 486C876 540 898 600 905 693" />
        <path class="pt-urbe-rio-borde" d=${rio} />
        <path class="pt-urbe-rio" d=${rio} />
        ${colonias.map(([t, x, y]) => html`<text class="pt-urbe-colonia" x=${x} y=${y}>${t}</text>`)}
        <text class="pt-urbe-colonia" x="872" y="682">Col. Kennedy</text>
        <${Rondas} lista=${[{ p: [[812, 518], [900, 507.5], [956, 501]], vel: 14, desfase: 0.55 }]} prefijo="pt-ronda-urbe-" escala=${ESC_URBE} />
        <g class="esc esc-3" style=${'--d:' + retraso(2)}>
          <g class="pt-activo">
            <circle class="pt-onda" cx="910" cy="629" r="7" />
            <circle class="pt-onda o2" cx="910" cy="629" r="7" />
            <circle class="pt-foco" cx="910" cy="629" r="5.5" />
          </g>
          <text class="pt-urbe-colonia roja" x="872" y="682">Col. Kennedy</text>
          <path class="pt-ruta" d=${'M' + xa + ' ' + ya + 'L' + xb + ' ' + yb} pathLength="100" />
          <g transform=${'translate(' + (xb - 2.6 * ESC_URBE) + ' ' + yb + ') scale(' + ESC_URBE + ')'}><path class="pt-poste" d="M0 0V-41M-6 -37.4H6M-4.6 -37.4v1.8M4.6 -37.4v1.8" /></g>
          <g class="pt-viaje" style=${'--x0:' + xa + 'px;--y0:' + ya + 'px;--x1:' + xb + 'px;--y1:' + yb + 'px'}>
            <g transform=${'scale(' + ESC_URBE + ')'}><${Camion} baliza=${true} sube=${true} /></g>
          </g>
        </g>
      </g>
    </g>`;
  }

  function Escena() {
    const deps = (typeof HN_MAPA !== 'undefined' && HN_MAPA.deps) || {};
    const claves = Object.keys(deps);
    const [tx, ty] = N.teg;
    return html`<svg viewBox="0 -12 1000 612" preserveAspectRatio="xMidYMax meet" focusable="false">
      <defs>
        <radialGradient id="pt-nube"><stop offset="0" stop-color="#c9cdd2" stop-opacity=".2" /><stop offset=".6" stop-color="#8a9099" stop-opacity=".08" /><stop offset="1" stop-color="#8a9099" stop-opacity="0" /></radialGradient>
        <radialGradient id="pt-nucleo"><stop offset="0" stop-color="#e3241b" stop-opacity=".42" /><stop offset="1" stop-color="#e3241b" stop-opacity="0" /></radialGradient>
        <radialGradient id="pt-desvanecer"><stop offset="0" stop-color="#fff" /><stop offset=".65" stop-color="#fff" stop-opacity=".45" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient>
        <radialGradient id="pt-destello-ambar"><stop offset="0" stop-color="#ffb22e" stop-opacity=".95" /><stop offset=".4" stop-color="#ffb22e" stop-opacity=".35" /><stop offset="1" stop-color="#ffb22e" stop-opacity="0" /></radialGradient>
        <linearGradient id="pt-haz"><stop offset="0" stop-color="#f4f5f6" stop-opacity=".42" /><stop offset="1" stop-color="#f4f5f6" stop-opacity="0" /></linearGradient>
        <linearGradient id="pt-franjas" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="-30">
          ${FRANJAS.map(([a, b, c], k) => html`<stop offset=${a} stop-color=${c} key=${'a' + k} /><stop offset=${b} stop-color=${c} key=${'b' + k} />`)}
        </linearGradient>
        <radialGradient id="pt-brillo-rojo"><stop offset="0" stop-color="#e3241b" stop-opacity=".85" /><stop offset=".45" stop-color="#e3241b" stop-opacity=".3" /><stop offset="1" stop-color="#e3241b" stop-opacity="0" /></radialGradient>
        <pattern id="pt-gotas" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(16)"><rect width="1.3" height="5.5" fill="#d6dadf" /></pattern>
        <mask id="pt-mascara-nube"><ellipse cx="300" cy="38" rx="270" ry="112" fill="url(#pt-desvanecer)" /></mask>
        <clipPath id="pt-recorte-urbe"><rect x="692" y="486" width="286" height="207" rx="8" /></clipPath>
      </defs>
      <${Reticula} />
      <g class="pt-costa">${claves.map((k) => html`<path d=${deps[k].d} />`)}</g>
      <g class="pt-deptos">${claves.map((k) => html`<path d=${deps[k].d} />`)}</g>
      ${ESCENAS.map((e, i) => deps[e.depto] && html`<path class=${'pt-tinte esc esc-' + (i + 1)} style=${'--d:' + retraso(i)} d=${deps[e.depto].d} />`)}
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
        <path d=${'M' + (tx + 22) + ' ' + (ty - 16) + 'L712 356M' + (tx + 20) + ' ' + (ty + 18) + 'L712 572'} />
      </g>
      <g>${TORRES.map((t, i) => html`<${Torre} t=${t} i=${i} key=${i} />`)}</g>
      <g>${Object.keys(N).map((k) => {
        const [x, y, nombre, pos] = N[k];
        return html`<g>
          ${pos && html`<circle class="pt-halo" cx=${x} cy=${y} r="9.5" />`}
          <circle class=${'pt-nodo' + (pos ? ' mayor' : '')} cx=${x} cy=${y} r=${pos ? 4.6 : 3.1} />
        </g>`;
      })}</g>
      <${Rondas} lista=${RONDAS} prefijo="pt-ronda-" escala=${ESC_CAMION} />
      <g>${Object.keys(N).filter((k) => N[k][2]).map((k) => {
        const [x, y, nombre, pos] = N[k];
        const izq = pos === 'izq' || pos === 'arriba-izq' || pos === 'abajo-izq';
        return html`<text class="pt-ciudad" x=${pos === 'izq' ? x - 16 : pos === 'der' ? x + 15 : pos === 'arriba-izq' ? x - 4 : pos === 'abajo-izq' ? x - 6 : x}
          y=${pos === 'abajo' ? y + 30 : pos === 'abajo-izq' ? y + 27 : pos === 'arriba' || pos === 'arriba-izq' ? y - 16 : y + 5}
          text-anchor=${izq ? 'end' : pos === 'der' ? 'start' : 'middle'}>${nombre}</text>`;
      })}</g>
      <${Ciudad} />
      ${ESCENAS.map((e, i) => e.rayo && html`<g class=${'pt-rayo rayo-' + (i + 1)}>
        <path class="pt-rayo-brillo" d=${trazo(e.rayo) + trazo(e.rama)} />
        <path class="pt-rayo-nucleo" d=${trazo(e.rayo) + trazo(e.rama)} />
      </g>`)}
      ${ESCENAS.map(Cuadrilla)}
      ${ESCENAS.map(Alerta)}
    </svg>`;
  }

  /* En el panel de entrada: la misma antena, chica, en la esquina de arriba a la derecha, y su señal en ondas
     tenues que cruzan el panel (con los colores del tema). La antena queda en (320, 320) del dibujo. */
  function Fondo() {
    return html`<svg class="acceso-fondo" viewBox="0 0 640 640" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="af-franjas" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="-30">
          ${FRANJAS.map(([a, b, c], k) => html`<stop offset=${a} style=${'stop-color:' + (k % 2 ? 'var(--ink-3)' : c)} key=${'a' + k} /><stop offset=${b} style=${'stop-color:' + (k % 2 ? 'var(--ink-3)' : c)} key=${'b' + k} />`)}
        </linearGradient>
      </defs>
      ${[56, 112, 168, 224, 280].map((r) => html`<circle class="af-onda" cx="320" cy="320" r=${r} key=${r} />`)}
      <circle class="af-ping" cx="320" cy="320" r="40" />
      <g transform="translate(320 366) scale(1.35)">
        <path class="af-cuerpo" d="M-5 0L-1.3 -30H1.3L5 0z" />
        <path class="af-reja" d=${REJA} />
        <path class="af-panel" d=${PANELES} />
        ${ARCOS.map((d, k) => html`<path class=${'af-arco a' + k} d=${d} key=${k} />`)}
      </g>
    </svg>`;
  }

  /* Monitoreo en vivo, con datos reales del servidor: el nodo con más clientes de cada departamento y si está en
     una falla activa (sin cantidades). Una mira recorre los departamentos de oeste a este (los que tienen falla,
     primero) y el panel de arriba dice qué nodo es y cómo está. La mira va en un SVG aparte, encima del mapa y
     con el mismo encuadre, para que cada paso no vuelva a armar el mapa. */
  const claveDep = (d) => U.sinAcentos(String(d || '')).toUpperCase().replace(/\s+/g, ' ').trim();
  function ordenMonitoreo(mon) {
    const lista = ((mon && mon.nodos) || []).filter((x) => x && x.n).map((x) => Object.assign({}, x, { dk: claveDep(x.d) })).filter((x) => HN_NOMBRES[x.dk]);
    return lista.sort((a, b) => (Number(!!b.falla) - Number(!!a.falla)) || (HN_NOMBRES[a.dk][0] - HN_NOMBRES[b.dk][0]));
  }
  const nombreDep = (x) => HN_NOMBRES[x.dk].slice(2).join(' ');
  function Mira({ nodo }) {
    const deps = (typeof HN_MAPA !== 'undefined' && HN_MAPA.deps) || {};
    const [x, y] = HN_NOMBRES[nodo.dk];
    return html`<svg class="pt-monitor" viewBox="0 -12 1000 612" preserveAspectRatio="xMidYMax meet" focusable="false" aria-hidden="true">
      ${deps[nodo.dk] && html`<path class=${'pt-mon-depto' + (nodo.falla ? ' falla' : '')} d=${deps[nodo.dk].d} key=${nodo.dk + nodo.n} />`}
      <g class=${'pt-mira' + (nodo.falla ? ' falla' : '')} style=${'transform:translate(' + x + 'px,' + y + 'px)'}>
        <circle class="pt-mira-pulso" r="11" />
        <circle class="pt-mira-aro" r="9" />
        <path class="pt-mira-marcas" d="M-14 0h-6M14 0h6M0 -14v-6M0 14v6" />
        <circle class="pt-mira-centro" r="2.2" />
      </g>
    </svg>`;
  }
  function Panel({ nodo, conFalla }) {
    return html`<div class=${'monitor' + (nodo.falla ? ' falla' : '')}>
      <div class="monitor-cab"><span class="monitor-punto"></span>Monitoreo en vivo</div>
      <div class="monitor-nodo" key=${nodo.dk + nodo.n}>
        <b>${nodo.n}</b>
        <span>${nombreDep(nodo)}<i class="monitor-estado">${nodo.falla ? 'Falla activa' : 'En línea'}</i></span>
      </div>
      <div class=${'monitor-pie' + (conFalla ? ' hay' : '')}>${conFalla ? U.plural(conFalla, '1 nodo principal con falla activa', conFalla + ' nodos principales con falla activa') : 'Nodo con más clientes de cada departamento'}</div>
    </div>`;
  }

  return { Escena, Fondo, Mira, Panel, ordenMonitoreo };
})();

/* Panel izquierdo de la entrada (acceso real y demostración) */
/* El monitoreo se pide al abrir la entrada y cada minuto mientras sigue abierta; la mira pasa a otro
   departamento cada 2.8 s. Si el servidor no lo tiene (Code.gs anterior) o no hay base, no se muestra. */
const PASO_MONITOREO = 2800;
function ArteAcceso() {
  const [mon, setMon] = useState(null);
  const [paso, setPaso] = useState(0);
  useEffect(() => {
    let vivo = true;
    const traer = () => Backend.monitoreo().then((r) => { if (vivo && r && Array.isArray(r.nodos)) setMon(r); }).catch(() => {});
    traer();
    const t = setInterval(traer, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const lista = useMemo(() => Portada.ordenMonitoreo(mon), [mon]);
  useEffect(() => {
    if (lista.length < 2) return undefined;
    const t = setInterval(() => setPaso((k) => k + 1), PASO_MONITOREO);
    return () => clearInterval(t);
  }, [lista.length]);
  const actual = lista.length ? lista[paso % lista.length] : null;
  const escena = useMemo(() => html`<${Portada.Escena} />`, []);
  return html`<div class="login-arte portada">
    <div class="portada-lluvia" aria-hidden="true"><i class="capa-1"></i><i class="capa-2"></i></div>
    <div class="portada-destello d1" aria-hidden="true"></div>
    <div class="portada-destello d2" aria-hidden="true"></div>
    <div class="marca"><div class="marca-glifo"><${Ico} n="marca" s=${20} /></div><div><div class="marca-nombre">${CONFIG.app}</div><div class="marca-bajada" style="color:inherit;opacity:.7">${CONFIG.bajada}</div></div></div>
    ${actual && html`<${Portada.Panel} nodo=${actual} conFalla=${lista.filter((x) => x.falla).length} />`}
    <div class="portada-escena" aria-hidden="true">${escena}${actual && html`<${Portada.Mira} nodo=${actual} />`}</div>
    <div class="portada-texto">
      <h1>Fallas de red, al instante.</h1>
      <p>Certifica en segundos si el cliente está dentro de una falla general de la red fija, y le da a quien atiende las palabras para explicárselo.</p>
    </div>
  </div>`;
}
