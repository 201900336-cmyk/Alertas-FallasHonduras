/* ==========================================================================
   ALERTAS · Utilidades (formato, texto, tiempo)
   ========================================================================== */

const U = (() => {
  const nf = new Intl.NumberFormat('es-HN');
  const nf1 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 1 });
  const fHora = new Intl.DateTimeFormat('es-HN', { hour: 'numeric', minute: '2-digit' });
  const fDia = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short' });
  const fDiaAnio = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', year: 'numeric' });
  const fLargo = new Intl.DateTimeFormat('es-HN', { weekday: 'long', day: 'numeric', month: 'long' });
  const MIN = 60000, HORA = 3600000, DIA = 86400000;

  const n = (v) => nf.format(Math.round(v || 0));
  const n1 = (v) => nf1.format(v || 0);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const compact = (v) => {
    v = v || 0;
    if (v >= 1e6) return nf1.format(v / 1e6) + ' M';
    if (v >= 1e4) return nf1.format(v / 1e3) + ' mil';
    return nf.format(Math.round(v));
  };

  /* Fechas guardadas como días desde 1970 (sin zona horaria) */
  const fDiaUTC = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fechaDias = (d) => (d ? fDiaUTC.format(new Date(d * 86400000)) : 'Sin fecha');
  function antiguedad(d, now) {
    if (!d) return '';
    const dias = Math.floor((now || Date.now()) / 86400000) - d;
    if (dias < 0) return '';
    if (dias < 14) return dias === 1 ? '1 día' : dias + ' días';
    if (dias < 61) return Math.floor(dias / 7) + ' semanas';
    const meses = Math.floor(dias / 30.44);
    if (meses < 24) return meses + ' meses';
    return Math.floor(meses / 12) + ' años';
  }

  const hora = (ts) => fHora.format(new Date(ts)).replace(/\s/g, '\u00a0');
  const dia = (ts) => fDia.format(new Date(ts));
  const diaAnio = (ts) => fDiaAnio.format(new Date(ts));
  const largo = (ts) => fLargo.format(new Date(ts));
  const inicioDia = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const esHoy = (ts, now) => inicioDia(ts) === inicioDia(now || Date.now());
  const diaRel = (ts, now) => {
    now = now || Date.now();
    const d = Math.round((inicioDia(now) - inicioDia(ts)) / DIA);
    if (d === 0) return 'hoy';
    if (d === 1) return 'ayer';
    if (d === -1) return 'mañana';
    return 'el ' + dia(ts);
  };
  /* "las 3:00 p. m." o "la 1:30 p. m." (la una lleva "la") */
  const las = (ts) => { const h = hora(ts); return (/^1:/.test(h) ? 'la ' : 'las ') + h; };
  const cuando = (ts, now) => diaRel(ts, now) + ' a ' + las(ts);
  const cuandoCorto = (ts, now) => (esHoy(ts, now) ? hora(ts) : dia(ts) + ', ' + hora(ts));

  const dur = (ms) => {
    ms = Math.max(0, ms || 0);
    if (ms < MIN) return 'menos de 1 min';
    const h = Math.floor(ms / HORA), m = Math.floor((ms % HORA) / MIN);
    if (h >= 48) return Math.floor(h / 24) + ' días';
    if (!h) return m + ' min';
    return m ? h + ' h ' + m + ' min' : h + ' h';
  };
  const hace = (ts, now) => 'hace ' + dur((now || Date.now()) - ts);
  const durCorto = (ms) => {
    ms = Math.max(0, ms || 0);
    if (ms < MIN) return '< 1 min';
    const h = Math.floor(ms / HORA), m = Math.floor((ms % HORA) / MIN);
    if (h >= 48) return Math.floor(h / 24) + ' días';
    if (!h) return m + ' min';
    return m ? h + ' h ' + m + ' m' : h + ' h';
  };
  /* SMS: con solo caracteres GSM-7 cada SMS admite 160 (153 por parte si son varias); con cualquier otro
     pasa a UCS-2 y admite 70 (67 por parte). Los de la tabla extendida cuentan doble.
     Notifícame quita las tildes que no están en GSM-7 (á, í, ó, ú…) y manda el SMS en GSM-7: la prueba del
     2 nov llegó como "la conexion con Notificame funciona (señal 1/2)". Por eso esas tildes no cambian el largo
     (se cuentan ya sin tilde, en "sinTilde"); la ñ, la é y la / sí llegan. Lo demás (comillas curvas, emojis…)
     sigue como "raros": no se sabe cómo llega y obligaría a UCS-2. */
  const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM7_EXT = '^{}\\[~]|€';
  const TILDES = { á: 'a', í: 'i', ó: 'o', ú: 'u', Á: 'A', Í: 'I', Ó: 'O', Ú: 'U', ê: 'e', â: 'a', ô: 'o', î: 'i', û: 'u', ç: 'c', ï: 'i', ë: 'e' };
  function partesSms(texto) {
    let n = 0;
    const raros = [], sinTilde = [];
    for (const ch of String(texto)) {
      const c = TILDES[ch] || ch;
      if (c !== ch && sinTilde.indexOf(ch) < 0) sinTilde.push(ch);
      if (GSM7.indexOf(c) >= 0) n++;
      else if (GSM7_EXT.indexOf(c) >= 0) n += 2;
      else if (raros.indexOf(ch) < 0) raros.push(ch);
    }
    if (!raros.length) return { gsm: true, caracteres: n, partes: n <= 160 ? 1 : Math.ceil(n / 153), limite: 160, raros, sinTilde };
    const u = String(texto).length;            // en UCS-2 un emoji ocupa dos
    return { gsm: false, caracteres: u, partes: u <= 70 ? 1 : Math.ceil(u / 67), limite: 70, raros, sinTilde };
  }
  /* Cambia lo que no cabe en GSM-7 por su forma simple (á→a, “ ”→", …→...): así se ve tal como le llega al cliente */
  const SIN_TILDE = Object.assign({ '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '\u00a0': ' ', '\u202f': ' ' }, TILDES);
  const sinTildesSms = (t) => String(t).replace(/[áíóúÁÍÓÚêâôîûçïë“”‘’–—…\u00a0\u202f]/g, (c) => SIN_TILDE[c] || c);

  /* Agrega punto final solo si hace falta (las horas ya terminan en "p. m.") */
  const conPunto = (s) => (/[.!?]$/.test(String(s).trim()) ? String(s) : s + '.');
  const horas = (ms) => ms / HORA;

  /* Texto */
  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const digitos = (s) => String(s == null ? '' : s).replace(/\D+/g, '');
  const MINUS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von', 'el']);
  function titulo(s) {
    if (!s) return '';
    const ws = String(s).toLowerCase().split(' ');
    return ws.map((w, i) => {
      if (!w) return w;
      if (/[a-zñ]\.[a-zñ]/.test(w) || (/\d/.test(w) && /[a-zñ]/.test(w))) return w.toUpperCase();
      if (i > 0 && MINUS.has(w) && !/\.$/.test(ws[i - 1])) return w;
      return w.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    }).join(' ');
  }
  const ACENTOS = { Morazan: 'Morazán', Cortes: 'Cortés', Atlantida: 'Atlántida', Paraiso: 'Paraíso', Colon: 'Colón', Copan: 'Copán',
    Intibuca: 'Intibucá', Bahia: 'Bahía', Barbara: 'Bárbara', Danli: 'Danlí', Roatan: 'Roatán', Jose: 'José', Maria: 'María', Belen: 'Belén',
    Union: 'Unión', Concepcion: 'Concepción', Guanaja: 'Guanaja', Santa: 'Santa', Ocotepeque: 'Ocotepeque', Juticalpa: 'Juticalpa' };
  const lugar = (s) => titulo(s).split(' ').map((w) => ACENTOS[w] || w).join(' ');
  const esEmpresa = (nombre, categoria) =>
    /\b(S\.?\s?A\.?|S\.? DE R\.?L|C\.?V\.?|BANCO|ASOCIACION|FUNDACION|IGLESIA|COLEGIO|ESCUELA|INSTITUTO|HOTEL|RESTAURANTE|EMPRESA|CORPORACION|INVERSIONES|COMERCIAL|DISTRIBUIDORA|MUNICIPALIDAD|SECRETARIA|CLINICA|HOSPITAL)\b/.test(sinAcentos(nombre || '').toUpperCase())
    || /CORPORATIVO|EMPRESARIAL|PYME/.test(categoria || '');
  const primerNombre = (nombre) => titulo(String(nombre || '').split(' ')[0] || '');

  function formatoDni(raw) {
    const d = digitos(raw);
    if (d.length === 13) return d.slice(0, 4) + '-' + d.slice(4, 8) + '-' + d.slice(8);
    return String(raw || '').trim();
  }

  /* Red */
  const esVirtual = (nodo) => /VIRTUAL|VITUAL/i.test(nodo || '');
  // ID de una falla tal como se muestra: sin guiones (las de antes del 2 nov 2026 se guardaron como F-261030-05)
  const idFalla = (id) => String(id == null ? '' : id).replace(/-/g, '');
  // Cómo se nombra una falla: el número de falla que pone Workforce (F1254585) o, si no lo tiene, el ID de Alertas
  const numeroFalla = (f) => (f && f.numero ? String(f.numero).replace(/-/g, '') : idFalla(f && f.id));
  function oltBase(olt) { return String(olt || '').split('/')[0]; }
  function oltNombre(olt) {
    const b = oltBase(olt);
    if (!/^M\d\d_/.test(b)) return b;
    let s = b.replace(/^M\d\d_[A-Z0-9]+_/, '').replace(/^OLT_/, '');
    return titulo(s.replace(/_/g, ' '));
  }
  function oltPuerto(olt) {
    const p = String(olt || '').split('/');
    if (p.length < 4) return null;
    return { marco: p[1], tarjeta: p[2], puerto: p[3] };
  }

  /* Varios */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }
  /* Copia con formato (para pegar en Outlook con la tabla) y en texto (para donde no acepta formato) */
  async function copiarHtml(html, texto) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' })
        })]);
        return true;
      }
    } catch (e) { /* sigue con el respaldo */ }
    try {
      const div = document.createElement('div');
      div.innerHTML = html;
      Object.assign(div.style, { position: 'fixed', left: '-10000px', top: '0' });
      document.body.appendChild(div);
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(div); sel.removeAllRanges(); sel.addRange(r);
      const ok = document.execCommand('copy');
      sel.removeAllRanges(); div.remove();
      if (ok) return true;
    } catch (e) { /* último recurso: solo texto */ }
    return copiar(texto);
  }
  function descargarCsv(nombre, filas) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = '﻿' + filas.map((f) => f.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  /* Archivo de texto tal cual (sin marca BOM): lo usan plataformas como Notifícame */
  function descargarTexto(nombre, texto, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo || 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  const plural = (k, uno, varios) => (k === 1 ? uno : varios);
  const listaNatural = (arr, max) => {
    max = max || 3;
    if (!arr.length) return '';
    if (arr.length <= max) return arr.length === 1 ? arr[0] : arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
    return arr.slice(0, max).join(', ') + ' y ' + (arr.length - max) + ' más';
  };

  return { MIN, HORA, DIA, n, n1, pct, compact, fechaDias, antiguedad, hora, las, dia, diaAnio, largo, inicioDia, esHoy, diaRel, cuando, cuandoCorto,
    dur, durCorto, conPunto, hace, horas, sinAcentos, digitos, titulo, lugar, esEmpresa, primerNombre, formatoDni, esVirtual, idFalla, numeroFalla, oltBase, oltNombre,
    oltPuerto, uid, copiar, copiarHtml, descargarCsv, descargarTexto, plural, listaNatural, partesSms, sinTildesSms };
})();
