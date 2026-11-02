/* ==========================================================================
   ALERTAS · Configuración general
   Todo lo que el equipo puede querer ajustar está aquí.
   ========================================================================== */

const CONFIG = {
  app: 'Alertas',
  bajada: 'Servicios Fijos HN',
  equipo: 'Workforce HN',

  // Una falla cerrada sigue visible para los asesores durante estas horas.
  horasVisibleTrasCierre: 36,

  // Cliente reincidente: tantas fallas en su nodo en estos días (desde que es cliente).
  reincidente: { fallas: 3, dias: 90 },

  // Alerta temprana: un nodo sin falla publicada que recibe consultas de
  // varios clientes distintos en poco tiempo.
  alerta: { minutos: 60, clientesDistintos: 3 },

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
    workforce: { nombre: 'Workforce HN, Datos y Fallas', corto: 'Workforce HN', canal: 'Workforce HN', vistas: ['consulta', 'fallas', 'base', 'stats'], entrada: 'Genesys' },
    jefatura: { nombre: 'Jefatura y Gerencia', corto: 'Jefatura', canal: 'Jefatura', vistas: ['consulta', 'fallas', 'base', 'stats'], equipo: true, entrada: 'Genesys' }
  },

  // "cliente" es la forma en que el asesor le explica el motivo al cliente.
  motivos: [
    { id: 'ENERGIA', nombre: 'Falla de energía comercial', corto: 'Energía comercial',
      cliente: 'una interrupción del suministro de energía eléctrica que afecta nuestros equipos en su zona' },
    { id: 'FIBRA', nombre: 'Corte de fibra óptica', corto: 'Corte de fibra',
      cliente: 'un daño en la fibra óptica que lleva el servicio a su zona' },
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
    SIN_NODO: []
  }
};

const MOTIVO = Object.fromEntries(CONFIG.motivos.map((m) => [m.id, m]));
