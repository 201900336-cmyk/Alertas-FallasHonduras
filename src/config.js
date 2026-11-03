/* ==========================================================================
   ALERTAS · Configuración general
   Todo lo que el equipo puede querer ajustar está aquí.
   ========================================================================== */

const CONFIG = {
  app: 'Alertas',
  bajada: 'Servicios Fijos HN',
  equipo: 'Workforce HN',

  // Una falla cerrada sigue visible para los asesores durante estas horas.
  horasVisibleTrasCierre: 72,

  // Cliente reincidente: tantas fallas en su nodo en estos días (desde que es cliente).
  reincidente: { fallas: 3, dias: 90 },

  // Posible falla: un nodo sin falla publicada al que en los últimos 60 minutos le consultaron
  // 5 o más clientes distintos (Concentrix y Tiendas; las búsquedas de Workforce no cuentan),
  // o que 2 asesores reportaron. Con 3 o 4 clientes el nodo queda en observación.
  // El aviso de escritorio no se repite para el mismo nodo antes de 2 horas.
  alerta: { minutos: 60, clientesDistintos: 5, observar: 3, reportes: 2, horasReaviso: 2 },

  // Tiendas que se eligen al entrar con la cuenta de Tiendas. La lista que vale es la hoja Tiendas
  // de la base interna (el servidor la manda al abrir la página); esta solo se usa si el servidor
  // todavía no la manda y en la demostración.
  tiendas: [
    'CAC Castaños', 'CAC Comayagua', 'CAC Mall El Dorado', 'CAC Mall Multiplaza TGU', 'CAC Plaza Miraflores', 'CAC Siguatepeque',
    'CAC Catacamas', 'CAC Centro TGU', 'CAC Danli', 'CAC Juticalpa', 'CAC Mall Premier', 'CAC Metromall', 'CAC Peatonal',
    'CAC Choluteca Centro', 'CAC City Mall TGU', 'CAC Mall Cascadas', 'CAC San Lorenzo', 'CAC Unimall Choluteca', 'CAC Ventu TGU',
    'CAC Ceiba Centro', 'CAC Ceiba Mall Megaplaza', 'CAC Olanchito', 'CAC Roatan', 'CAC Tela Centro', 'CAC Tocoa Centro',
    'CAC City Mall SPS', 'CAC La Entrada Copan', 'CAC Mall Multiplaza SPS', 'CAC Santa Barbara', 'CAC Santa Rosa de Copan',
    'CAC Terminal de buses', 'CAC Villanueva', 'CAC Centro SPS', 'CAC Galerias del Valle', 'CAC Megamall SPS', 'CAC Paseo Proceres',
    'CAC Progreso', 'CAC Puerto Cortes'
  ],

  // Cada cuántos segundos se revisa si hubo una actualización de Workforce (una vez por minuto
  // alcanza y, con cientos de páginas abiertas, le quita mucha carga al servidor).
  segundosRevision: 60,

  roles: {
    concentrix: { nombre: 'Concentrix, Call Center N1 y Redes Sociales', corto: 'Concentrix', canal: 'Concentrix', vistas: ['consulta'], entrada: 'Genesys' },
    tiendas: { nombre: 'Tiendas Claro', corto: 'Tiendas', canal: 'Tiendas', vistas: ['consulta'], entrada: 'Usuario de Tiendas' },
    // Supervisores de Call Center: el panel de los asesores más las posibles fallas (aviso y reporte); no publican fallas
    supervisor: { nombre: 'Supervisores de Call Center', corto: 'Supervisor', canal: 'Supervisor', vistas: ['consulta'], alertas: true, entrada: 'Genesys' },
    workforce: { nombre: 'Workforce HN, Datos y Fallas', corto: 'Workforce HN', canal: 'Workforce HN', vistas: ['consulta', 'fallas', 'base', 'stats'], alertas: true, entrada: 'Genesys' },
    jefatura: { nombre: 'Jefatura y Gerencia', corto: 'Jefatura', canal: 'Jefatura', vistas: ['consulta', 'fallas', 'base', 'stats'], equipo: true, alertas: true, entrada: 'Genesys' }
  },

  // "cliente" es la forma en que el asesor le explica el motivo al cliente.
  // VALIDACION: posible falla general, para publicarla apenas llega el aviso de 5 clientes mientras el VOC
  // la confirma. Al confirmarla se edita y se le pone el motivo real; si se cierra así, queda descartada.
  motivos: [
    { id: 'VALIDACION', nombre: 'Posible falla general', corto: 'Posible falla', posible: true,
      cliente: 'un posible inconveniente en la red de su zona que nuestro equipo técnico está validando' },
    { id: 'ENERGIA', nombre: 'Falla de energía comercial', corto: 'Energía comercial',
      cliente: 'una interrupción del suministro de energía eléctrica que afecta nuestros equipos en su zona' },
    { id: 'FIBRA', nombre: 'Corte de fibra óptica', corto: 'Corte de fibra',
      cliente: 'un daño en la fibra óptica que lleva el servicio a su zona' },
    // Eventos externos con mensaje de SMS aprobado ("Segmentación de motivos 2.0")
    { id: 'CORTO', nombre: 'Corto circuito externo', corto: 'Corto circuito externo',
      cliente: 'un corto circuito externo, ajeno a nuestra red, en su zona' },
    { id: 'TERCEROS', nombre: 'Daño en infraestructura por terceros', corto: 'Daño por terceros',
      cliente: 'daños causados por terceros en la infraestructura de su zona' },
    { id: 'POSTES', nombre: 'Caída de postes', corto: 'Caída de postes',
      cliente: 'la caída de postes por un incidente externo en su zona' },
    { id: 'VIA', nombre: 'Eventos en vía pública', corto: 'Vía pública',
      cliente: 'daños ocasionados por terceros en la vía pública de su zona' },
    { id: 'EQUIPO', nombre: 'Reemplazo de equipo', corto: 'Reemplazo de equipo',
      cliente: 'el reemplazo de un equipo de nuestra red que da servicio a su zona' },
    { id: 'RUIDO', nombre: 'Limpieza de ruido', corto: 'Limpieza de ruido',
      cliente: 'trabajos para mejorar la calidad de la señal en su zona' },
    { id: 'MANTENIMIENTO', nombre: 'Mantenimiento preventivo', corto: 'Mantenimiento',
      cliente: 'un mantenimiento preventivo programado en la red de su zona' },
    { id: 'OTRO', nombre: 'Otro motivo', corto: 'Otro', cliente: '' }
  ],

  etaOpciones: [
    { min: 60, label: '1 h' }, { min: 120, label: '2 h' }, { min: 240, label: '4 h' }, { min: 480, label: '8 h' }
  ],

  // Recomendaciones que acompañan al guion, por veredicto.
  recomendaciones: {
    FALLA: [
      'Explícale el motivo y la hora estimada de solución, si la hay.',
      'Recuérdale que no necesita reiniciar ni desconectar sus equipos.',
      'Si lo que reporta no tiene que ver con la falla, sigue con el soporte normal.'
    ],
    RESUELTA: [
      'Pídele reiniciar el equipo antes de escalar el caso.',
      'Si sigue sin servicio después de reiniciar, sigue con el soporte normal.'
    ],
    SIN_FALLA: [
      'Si el cliente dice que sus vecinos tampoco tienen servicio, usa Reportar posible falla: Workforce HN recibe la alerta cuando varios clientes del mismo nodo llaman.'
    ],
    SIN_NODO: [],
    POSIBLE: [
      'Es una posible falla: Workforce HN la está validando con el VOC. Si se confirma, aquí verás el motivo y la hora estimada.',
      'Si lo que reporta el cliente es distinto a lo de sus vecinos (por ejemplo, solo un equipo o una sola TV), sigue con el soporte normal.'
    ]
  },

  // Los SMS a los clientes (Notifícame) son solo los mensajes aprobados por Claro: están en el servidor
  // (SMS_APROBADOS en servidor/Code.gs), uno por motivo de evento externo, y se mandan tal cual.

  // Nota corta para pegar en la descripción del caso en Qflow, según el resultado de la consulta. Así todos
  // documentan igual. {nodo} {numero} {motivo} {inicio} {eta} {cerrada} {contrato} se reemplazan con los datos
  // del cliente y la falla; {inicio} y {cerrada} ya traen "las" o el día ("ayer a las 3:00 p. m.").
  notaQflow: {
    FALLA: 'Cliente en falla general {numero} ({motivo}), nodo {nodo}, desde {inicio}; {eta}. Se le informó al cliente.',
    POSIBLE: 'Cliente en posible falla general, nodo {nodo}, desde {inicio}; en validación con el VOC. Se le informó al cliente.',
    RESUELTA: 'Cliente en falla general {numero} ({motivo}), nodo {nodo}, solucionada {cerrada}. Se le indicó reiniciar el equipo.',
    SIN_FALLA: 'Sin falla general en el nodo {nodo}. Se continúa con el soporte normal.',
    SIN_NODO: 'Nodo virtual ({nodo}): no se puede confirmar una falla general. Se continúa con el soporte normal.'
  }};

const MOTIVO = Object.fromEntries(CONFIG.motivos.map((m) => [m.id, m]));
