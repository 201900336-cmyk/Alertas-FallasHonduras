/* ==========================================================================
   ALERTAS · Datos de demostración (todo ficticio)
   Sirven para presentar la herramienta sin mostrar clientes reales.
   ========================================================================== */

const Demo = (() => {
  function prng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NOMBRES_M = ['José', 'Juan', 'Carlos', 'Luis', 'Jorge', 'Mario', 'Francisco', 'Óscar', 'Roberto', 'Miguel', 'Héctor', 'Kevin', 'Josué', 'Elvin', 'Wilmer', 'Marvin', 'Edwin', 'Denis', 'Allan', 'Selvin', 'Nelson', 'Fredy', 'Ángel', 'Cristian', 'David', 'Daniel', 'Andrés', 'Ramón', 'Julio', 'Gerson'];
  const NOMBRES_F = ['María', 'Ana', 'Karla', 'Sandra', 'Gloria', 'Rosa', 'Wendy', 'Iris', 'Lesly', 'Dania', 'Suyapa', 'Melissa', 'Alejandra', 'Fernanda', 'Gabriela', 'Daniela', 'Paola', 'Nancy', 'Reina', 'Lourdes', 'Claudia', 'Patricia', 'Yolanda', 'Marcela', 'Andrea', 'Lucía', 'Carmen', 'Elena', 'Dilcia', 'Xiomara'];
  const SEGUNDOS_M = ['Antonio', 'Alberto', 'Enrique', 'Fernando', 'Javier', 'Manuel', 'Rafael', 'Gustavo', 'Armando', 'Ernesto'];
  const SEGUNDOS_F = ['Isabel', 'Elizabeth', 'Patricia', 'Margarita', 'Alejandra', 'Yamileth', 'Esperanza', 'Concepción', 'Mercedes', 'Beatriz'];
  const APELLIDOS = ['López', 'Martínez', 'Hernández', 'Rodríguez', 'García', 'Flores', 'Mejía', 'Reyes', 'Cruz', 'Zelaya', 'Castillo', 'Ramírez', 'Sánchez', 'Pérez', 'Gómez', 'Banegas', 'Turcios', 'Ordóñez', 'Maradiaga', 'Funes', 'Aguilar', 'Rivera', 'Bonilla', 'Matute', 'Ponce', 'Andino', 'Velásquez', 'Paz', 'Zúniga', 'Alvarado', 'Lagos', 'Midence', 'Carías', 'Sierra', 'Valladares', 'Osorto'];
  const EMPRESAS = ['Inversiones El Roble S. de R.L.', 'Ferretería La Unión', 'Clínica Santa Fe', 'Distribuidora Maya S.A.', 'Colegio Bilingüe Los Pinos', 'Restaurante El Fogón', 'Farmacia San Rafael', 'Hotel Plaza Real', 'Repostería Doña Tina', 'Taller Mecánico El Pistón'];
  const COLONIAS = ['Col. Kennedy', 'Col. Miraflores', 'Col. Las Colinas', 'Barrio El Centro', 'Col. Altos de Toncontín', 'Res. Plaza', 'Col. Hato de Enmedio', 'Col. Loarque', 'Col. Las Brisas', 'Barrio Guadalupe', 'Col. Jardines del Valle', 'Res. Los Álamos', 'Col. Satélite', 'Col. Trejo', 'Barrio Río de Piedras', 'Col. Fesitranh', 'Col. Universidad', 'Col. San Ángel', 'Col. La Pradera', 'Barrio La Granja'];

  // municipio -> departamento, peso, prefijo DNI, nodos HFC, grupos GPON (OLT)
  const ZONAS = [
    { dep: 'FRANCISCO MORAZAN', mun: 'DISTRITO CENTRAL', p: 34, dni: '0801', hfc: { GRA: 12, UVA: 8 }, gpon: [['VENGC', 14, 'VENTU'], ['KENGC', 8, 'KENNEDY']] },
    { dep: 'CORTES', mun: 'SAN PEDRO SULA', p: 22, dni: '0501', hfc: { VIC: 10, ROB: 6, SCA: 6 }, gpon: [['ALTGC', 10, 'ALTAMIRA']] },
    { dep: 'CORTES', mun: 'CHOLOMA', p: 4, dni: '0502', hfc: {}, gpon: [['CHOGC', 6, 'CHOLOMA']] },
    { dep: 'CHOLUTECA', mun: 'CHOLUTECA', p: 6, dni: '0601', hfc: { CHO: 4 }, gpon: [['CHLGC', 4, 'CHOLUTECA']] },
    { dep: 'EL PARAISO', mun: 'DANLI', p: 4, dni: '0703', hfc: {}, gpon: [['DNLGC', 8, 'DANLI 03']] },
    { dep: 'ATLANTIDA', mun: 'LA CEIBA', p: 4, dni: '0101', hfc: {}, gpon: [['CBAGC', 6, 'CEIBA']] },
    { dep: 'OLANCHO', mun: 'JUTICALPA', p: 3, dni: '1501', hfc: {}, gpon: [['JCPGC', 5, 'JUTICALPA']] },
    { dep: 'COMAYAGUA', mun: 'COMAYAGUA', p: 3, dni: '0301', hfc: { COM: 3 }, gpon: [] },
    { dep: 'COMAYAGUA', mun: 'SIGUATEPEQUE', p: 2, dni: '0318', hfc: {}, gpon: [['SIGGC', 4, 'GRANJA DELIA']] },
    { dep: 'ISLAS DE LA BAHIA', mun: 'ROATAN', p: 3, dni: '1101', hfc: {}, gpon: [['ROAGC', 5, 'ROATAN']] },
    { dep: 'VALLE', mun: 'NACAOME', p: 1, dni: '1701', hfc: {}, gpon: [['NACGC', 4, 'NACAOME']] },
    { dep: 'VALLE', mun: 'SAN LORENZO', p: 2, dni: '1708', hfc: {}, gpon: [['SLOGC', 4, 'SAN LORENZO']] },
    { dep: 'YORO', mun: 'EL PROGRESO', p: 2, dni: '1804', hfc: { PRO: 4 }, gpon: [] },
    { dep: 'COPAN', mun: 'SANTA ROSA DE COPAN', p: 2, dni: '0401', hfc: {}, gpon: [['SRCGC', 4, 'SANTA ROSA']] },
    { dep: 'INTIBUCA', mun: 'LA ESPERANZA', p: 1, dni: '1001', hfc: {}, gpon: [['ESPGC', 3, 'LA ESPERANZA']] },
    { dep: 'LA PAZ', mun: 'LA PAZ', p: 1, dni: '1201', hfc: {}, gpon: [['LPAGC', 3, 'LA PAZ']] },
    { dep: 'COLON', mun: 'TRUJILLO', p: 1, dni: '0201', hfc: {}, gpon: [['TRUGC', 2, 'TRUJILLO']] },
    { dep: 'SANTA BARBARA', mun: 'SANTA BARBARA', p: 1, dni: '1601', hfc: {}, gpon: [['SBAGC', 2, 'SANTA BARBARA']] },
    { dep: 'LEMPIRA', mun: 'GRACIAS', p: 1, dni: '1301', hfc: {}, gpon: [['GRCGC', 2, 'GRACIAS']] }
  ];

  const WORKFORCE = [
    { u: 'alopez', nombre: 'Ana López' }, { u: 'cmejia', nombre: 'Carlos Mejía' },
    { u: 'dflores', nombre: 'Daniela Flores' }, { u: 'jbanegas', nombre: 'Jorge Banegas' }
  ];
  /* [usuario, nombre, acceso, tienda] */
  const ASESORES = [
    ['karla.zelaya@concentrix.com', 'Karla Zelaya', 'Concentrix', ''], ['josue.cruz@concentrix.com', 'Josué Cruz', 'Concentrix', ''],
    ['marvin.reyes@concentrix.com', 'Marvin Reyes', 'Concentrix', ''], ['dania.paz@concentrix.com', 'Dania Paz', 'Concentrix', ''],
    ['elvin.turcios@concentrix.com', 'Elvin Turcios', 'Concentrix', ''], ['lesly.bonilla@concentrix.com', 'Lesly Bonilla', 'Concentrix', ''],
    ['wilmer.funes@concentrix.com', 'Wilmer Funes', 'Concentrix', ''], ['suyapa.matute@concentrix.com', 'Suyapa Matute', 'Concentrix', ''],
    ['iris.carias@concentrix.com', 'Iris Carías', 'Concentrix', ''], ['allan.ponce@concentrix.com', 'Allan Ponce', 'Concentrix', ''],
    ['melissa.valladares@concentrix.com', 'Melissa Valladares', 'Concentrix', ''],
    ['tiendas:pedro mejia@multiplaza', 'Pedro Mejía', 'Tiendas', 'Multiplaza'], ['tiendas:rosa flores@city mall sps', 'Rosa Flores', 'Tiendas', 'City Mall SPS'],
    ['tiendas:kevin paz@mega mall', 'Kevin Paz', 'Tiendas', 'Mega Mall']
  ];

  function generar(now) {
    now = now || Date.now();
    const r = prng(20261029);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const ent = (a, b) => a + Math.floor(r() * (b - a + 1));
    const builder = ALERTAS_PARSER.makeBuilder(10000);

    // Catálogo de nodos
    const nodos = [];
    ZONAS.forEach((z, zi) => {
      for (const pre in z.hfc) for (let k = 1; k <= z.hfc[pre]; k++) nodos.push({ code: pre + String(k).padStart(2, '0'), tec: 'HFC', z, peso: 0.6 + r() });
      z.gpon.forEach(([pre, cant, olt], oi) => {
        for (let k = 1; k <= cant; k++) nodos.push({ code: pre + String(k).padStart(2, '0'), tec: 'GPON', z, olt: 'M00_DEMO' + String(zi * 3 + oi).padStart(2, '0') + '_OLT_' + olt.replace(/ /g, '_'), slot: 1 + Math.floor((k - 1) / 4), peso: 0.4 + r() });
      });
    });
    nodos.push({ code: 'VGRA_TAP_VIRTUAL', tec: 'HFC', z: ZONAS[0], peso: 1.2, virtual: true });
    const porZona = new Map(); nodos.forEach((nd) => { if (!porZona.has(nd.z)) porZona.set(nd.z, []); porZona.get(nd.z).push(nd); });
    const pesoZona = ZONAS.map((z) => z.p); const sumaZ = pesoZona.reduce((a, b) => a + b, 0);
    const elegirZona = () => { let x = r() * sumaZ; for (let i = 0; i < ZONAS.length; i++) { x -= pesoZona[i]; if (x <= 0) return ZONAS[i]; } return ZONAS[0]; };
    const elegirNodo = (z) => { const l = porZona.get(z); const s = l.reduce((a, b) => a + b.peso, 0); let x = r() * s; for (const nd of l) { x -= nd.peso; if (x <= 0) return nd; } return l[0]; };

    const usados = new Set();
    const nuevoContrato = () => { let c; do { c = r() < 0.15 ? ent(150000, 999999) : ent(1000000, 1650000); } while (usados.has(c)); usados.add(c); return c; };
    const dias = (y, m, d) => Math.floor(Date.UTC(y, m, d) / 864e5);
    const hoyDias = Math.floor(now / 864e5);
    const personas = [];

    const TOTAL = 9200;
    for (let k = 0; k < TOTAL; k++) {
      const z = elegirZona(); const nd = elegirNodo(z);
      let persona;
      if (personas.length > 50 && r() < 0.05) persona = pick(personas);
      else {
        const emp = r() < 0.018;
        const fem = r() < 0.52;
        const nombre = emp ? pick(EMPRESAS) : [fem ? pick(NOMBRES_F) : pick(NOMBRES_M), r() < 0.7 ? pick(fem ? SEGUNDOS_F : SEGUNDOS_M) : '', pick(APELLIDOS), pick(APELLIDOS)].filter(Boolean).join(' ');
        const dni = emp ? z.dni + ent(1995, 2020) + String(ent(0, 999999)).padStart(6, '0') : z.dni + '-' + ent(1955, 2005) + '-' + String(ent(0, 99999)).padStart(5, '0');
        persona = { nombre: U.sinAcentos(nombre).toUpperCase(), dni, emp };
        personas.push(persona);
      }
      const gpon = nd.tec === 'GPON';
      const anio = gpon ? (r() < 0.55 ? 2026 : ent(2021, 2025)) : ent(2009, 2026);
      let fecha = dias(anio, ent(0, 11), ent(1, 28)); if (fecha > hoyDias - 2) fecha = hoyDias - ent(2, 200);
      const tap = ent(1, 64);
      const rec = {
        contrato: nuevoContrato(), producto: ent(60000, 2650000), fecha,
        nodo: nd.code, tecnologia: nd.tec,
        olt: gpon ? nd.olt + '/0/' + nd.slot + '/' + ent(0, 15) : (nd.virtual ? 'VGRA_VIRTUAL' : nd.code),
        nap: gpon ? nd.code + '/GT/' + String(tap).padStart(2, '0') + '-' + String(tap + 1).padStart(2, '0') : (nd.virtual ? 'VGRA_TAP_VIRTUAL' : (r() < 0.3 ? 'TAP VIRTUAL ' + nd.code : nd.code + 'B4' + ent(10, 44) + '/' + ent(101, 304) + '/' + ent(1, 8))),
        categoria: persona.emp ? pick(['CORPORATIVO', 'PYME CORPORATIVO', 'EMPRESARIAL']) : (r() < 0.006 ? 'EMPLEADOS' : 'RESIDENCIAL'),
        play: r() < 0.8 ? '3P' : r() < 0.55 ? '1P' : '2P',
        departamento: z.dep, municipio: z.mun, colonia: pick(COLONIAS).toUpperCase(), megas: '',
        nombre: persona.nombre, dni: persona.dni
      };
      builder.add(rec);
      // Algunos contratos con dos servicios
      if (r() < 0.004) builder.add(Object.assign({}, rec, { producto: ent(60000, 2650000), nodo: 'VGRA_TAP_VIRTUAL', olt: 'VGRA_VIRTUAL', nap: 'VGRA_TAP_VIRTUAL', tecnologia: 'HFC' }));
    }
    const base = builder.finish({ archivo: 'Base de demostración (ficticia)', columnas: [], columnasUsadas: [], tieneMegas: false, segundos: 0, demo: true });
    return { base, nodos };
  }

  /* Fallas, consultas e historial de cargas ficticios alrededor de "ahora" */
  function escenario(ix, cat, nodos, now) {
    const r = prng(7);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const ent = (a, b) => a + Math.floor(r() * (b - a + 1));
    const M = U.MIN, H = U.HORA, D = U.DIA;
    const fallas = [];
    const motivosPeso = [['ENERGIA', 34], ['FIBRA', 26], ['MANTENIMIENTO', 14], ['EQUIPO', 11], ['RUIDO', 10], ['OTRO', 5]];
    const motivoAzar = () => { let x = r() * 100; for (const [m, p] of motivosPeso) { x -= p; if (x <= 0) return m; } return 'ENERGIA'; };
    const hist = (accion, en, por, detalle) => ({ accion, en, por, detalle: detalle || '' });
    const crear = (o) => {
      const imp = Model.impacto(cat, o.nodos);
      const f = Object.assign({
        motivoTexto: '', clienteTexto: '', detalle: '', referencia: '', eta: null, cerradaEn: null, cerradaPor: null, notaCierre: '',
        impacto: { total: imp.total, hfc: imp.hfc, gpon: imp.gpon, corp: imp.corp, deps: imp.deps.slice(0, 6), munis: imp.munis.slice(0, 6) }
      }, o);
      f.historial = [hist('PUBLICADA', f.publicadaEn, f.publicadaPor, U.plural(f.nodos.length, '1 nodo', f.nodos.length + ' nodos'))].concat(o.historialExtra || []);
      if (f.estado === 'CERRADA') f.historial.push(hist('CERRADA', f.cerradaEn, f.cerradaPor, f.notaCierre));
      delete f.historialExtra;
      f.id = Model.nuevoId(fallas, f.publicadaEn);
      fallas.push(f);
      return f;
    };
    const W = WORKFORCE;
    const hfcCodes = nodos.filter((n) => n.tec === 'HFC' && !n.virtual).map((n) => n.code);
    const gponCodes = nodos.filter((n) => n.tec === 'GPON').map((n) => n.code);
    const reincidentes = ['CHO02', 'DNLGC04', 'ROAGC02', 'GRA05', 'ALTGC07'];

    // Historial de 30 días (cerradas hace más de 36 h)
    for (let d = 30; d >= 2; d--) {
      const cuantas = r() < 0.25 ? 0 : ent(1, 2);
      for (let k = 0; k < cuantas; k++) {
        const inicio = now - d * D + ent(6, 21) * H + ent(0, 59) * M;
        if (now - inicio < 40 * H) continue;
        const usarReinc = r() < 0.35;
        const tecG = r() < 0.5;
        const pool = tecG ? gponCodes : hfcCodes;
        const n0 = usarReinc ? pick(reincidentes) : pick(pool);
        const extra = r() < 0.4 ? [pick(pool)] : [];
        const motivo = motivoAzar();
        const pub = inicio + ent(6, 45) * M;
        const dura = ent(40, 540) * M;
        const por = pick(W), cierra = pick(W);
        crear({
          nodos: [...new Set([n0].concat(extra))], motivo, inicio, publicadaEn: pub, publicadaPor: por,
          eta: r() < 0.6 ? pub + ent(1, 6) * H : null, estado: 'CERRADA', cerradaEn: pub + dura, cerradaPor: cierra,
          notaCierre: pick(['Servicio restablecido', 'Energía restablecida por la ENEE', 'Empalme de fibra terminado', 'Equipo reemplazado', 'Trabajo concluido']),
          referencia: 'Correo NOC #' + ent(4000, 9999),
          motivoTexto: motivo === 'OTRO' ? 'Vandalismo en gabinete' : '', clienteTexto: motivo === 'OTRO' ? 'un daño en uno de nuestros equipos de la zona' : ''
        });
      }
    }
    // Resuelta hace 33 h (por ocultarse) y hace 14 h
    crear({ nodos: ['VIC05', 'VIC06'], motivo: 'RUIDO', inicio: now - 38 * H, publicadaEn: now - 37.6 * H, publicadaPor: W[3], estado: 'CERRADA', cerradaEn: now - 33 * H, cerradaPor: W[3], notaCierre: 'Limpieza concluida', referencia: 'Correo NOC #8812' });
    crear({ nodos: ['VENGC07'], motivo: 'EQUIPO', inicio: now - 19 * H, publicadaEn: now - 18.7 * H, publicadaPor: W[0], eta: now - 15 * H, estado: 'CERRADA', cerradaEn: now - 14 * H, cerradaPor: W[1], notaCierre: 'Tarjeta reemplazada', referencia: 'Correo NOC #9020' });
    // Activas
    const f1 = crear({ nodos: ['GRA03', 'GRA04', 'GRA07'], motivo: 'ENERGIA', inicio: now - 95 * M, publicadaEn: now - 82 * M, publicadaPor: W[2], eta: now + 65 * M, estado: 'ACTIVA', referencia: 'Correo NOC #9114', detalle: 'ENEE reporta corte en circuito de la zona.' });
    const pubF2 = now - 32 * M;
    const f2 = crear({ nodos: ['ALTGC03', 'ALTGC04', 'ALTGC05', 'ALTGC08'], motivo: 'FIBRA', inicio: now - 44 * M, publicadaEn: pubF2, publicadaPor: W[1], estado: 'ACTIVA', referencia: 'Correo NOC #9121', detalle: 'Corte por trabajos de terceros en bulevar.',
      historialExtra: [hist('EDITADA', now - 21 * M, W[1], 'Agregó ALTGC08')] });

    // Consultas de 30 días
    const logs = [];
    const filasDe = (codes) => Model.filasDeNodos(ix, codes);
    const asesor = () => pick(ASESORES);
    const reg = (i) => Model.registro(ix, i);
    const frecuentes = [];
    const logFalla = (f, i, t) => {
      const x = reg(i); const a = asesor();
      logs.push({ t, u: a[0], un: a[1], canal: a[2], tienda: a[3], q: r() < 0.82 ? 'contrato' : 'dni', c: x.contrato, n: x.nodo, tec: x.tecnologia, dep: x.departamento, r: 'FALLA', f: f.id, tipo: 'consulta' });
    };
    for (const f of fallas) {
      const fin = f.estado === 'CERRADA' ? f.cerradaEn : now;
      if (f.publicadaEn > now) continue;
      const filas = filasDe(f.nodos); if (!filas.length) continue;
      const cuantas = Math.max(2, Math.round(filas.length * (0.05 + r() * 0.07)));
      const elegidos = [];
      for (let k = 0; k < cuantas; k++) {
        const i = pick(filas); elegidos.push(i);
        logFalla(f, i, f.publicadaEn + r() * Math.max(1, Math.min(fin, now - M) - f.publicadaEn));
      }
      if (elegidos.length) frecuentes.push(elegidos[0]);
      // algunos vuelven a llamar
      for (const i of elegidos.slice(0, 2)) if (r() < 0.6) logFalla(f, i, f.publicadaEn + r() * Math.max(1, Math.min(fin, now - M) - f.publicadaEn));
      // consultas después del cierre (resuelta)
      if (f.estado === 'CERRADA') for (let k = 0; k < Math.round(cuantas * 0.15); k++) {
        const i = pick(filas); const x = reg(i); const a = asesor(); const t = f.cerradaEn + r() * 10 * H;
        if (t < now) logs.push({ t, u: a[0], un: a[1], canal: a[2], tienda: a[3], q: 'contrato', c: x.contrato, n: x.nodo, tec: x.tecnologia, dep: x.departamento, r: 'RESUELTA', f: f.id, tipo: 'consulta' });
      }
    }
    // Clientes frecuentes: vuelven en varias fallas de su nodo reincidente
    for (const i of frecuentes.slice(0, 6)) {
      const x = reg(i);
      const fs = fallas.filter((f) => f.nodos.includes(x.nodo));
      for (const f of fs) for (let k = 0; k < ent(1, 2); k++) logFalla(f, i, Math.min(now - M, f.publicadaEn + r() * 3 * H));
    }
    // Consultas sin falla (fondo) con curva por hora
    const pesoHora = [1, 0.5, 0.3, 0.3, 0.4, 1, 3, 6, 9, 10, 9, 8, 7, 7, 8, 8, 7, 8, 9, 9, 7, 5, 3, 2];
    const sumaH = pesoHora.reduce((a, b) => a + b, 0);
    const todas = ix.n;
    for (let d = 30; d >= 0; d--) {
      const diaIni = U.inicioDia(now - d * D);
      const total = ent(140, 260);
      for (let k = 0; k < total; k++) {
        let x0 = r() * sumaH, h = 0; for (; h < 24; h++) { x0 -= pesoHora[h]; if (x0 <= 0) break; }
        const t = diaIni + h * H + r() * H; if (t > now - 2 * M) continue;
        const a = asesor(); const u = r();
        if (u < 0.05) { logs.push({ t, u: a[0], un: a[1], canal: a[2], tienda: a[3], q: 'contrato', c: null, n: '', tec: '', dep: '', r: 'NO_ENCONTRADO', f: null, tipo: 'consulta' }); continue; }
        const i = Math.floor(r() * todas); const x = reg(i);
        const enFalla = fallas.some((f) => f.nodos.includes(x.nodo) && f.publicadaEn <= t && (f.estado === 'ACTIVA' || f.cerradaEn > t));
        if (enFalla) continue;
        logs.push({ t, u: a[0], un: a[1], canal: a[2], tienda: a[3], q: r() < 0.82 ? 'contrato' : 'dni', c: x.contrato, n: x.nodo, tec: x.tecnologia, dep: x.departamento, r: U.esVirtual(x.nodo) ? 'SIN_NODO' : 'SIN_FALLA', f: null, tipo: 'consulta' });
      }
    }
    // Alerta temprana: varios clientes de SCA05 sin falla publicada en los últimos minutos
    const sca = filasDe(['SCA05']);
    [38, 27, 19, 11, 6].forEach((mins, k) => {
      const x = reg(sca[k * 7 % sca.length]); const a = ASESORES[k % ASESORES.length];
      logs.push({ t: now - mins * M, u: a[0], un: a[1], canal: a[2], tienda: a[3], q: 'contrato', c: x.contrato, n: x.nodo, tec: x.tecnologia, dep: x.departamento, r: 'SIN_FALLA', f: null, tipo: k === 4 ? 'reporte' : 'consulta' });
    });
    logs.sort((a, b) => a.t - b.t);

    const baseHist = [21, 14, 7, 2].map((d, k) => ({
      en: U.inicioDia(now - d * D) + 7.5 * H, por: k % 2 ? W[3] : W[0], archivo: 'Contrato por Nodo (demo) semana ' + (k + 1) + '.xlsx',
      filas: ix.n - (3 - k) * ent(40, 90), hfc: ix.resumen.hfc, gpon: ix.resumen.gpon - (3 - k) * ent(30, 60), nodos: ix.resumen.nodos,
      nuevos: k ? ent(60, 140) : null, bajas: k ? ent(10, 40) : null, cambiosNodo: k ? ent(2, 15) : null
    }));
    return { fallas, logs, baseHist, f1, f2 };
  }

  return { generar, escenario, WORKFORCE, ASESORES };
})();
