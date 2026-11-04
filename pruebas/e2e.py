"""Prueba de punta a punta: la página contra el servidor de prueba (Code.gs en el emulador).
Uso: python3 pruebas/e2e.py [puerto] [ruta-excel-real-opcional] [carpeta-capturas]"""
import os, re, sys, json, time, urllib.request
from playwright.sync_api import sync_playwright

PUERTO = sys.argv[1] if len(sys.argv) > 1 else '8787'
EXCEL = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
OUT = (sys.argv[3] if len(sys.argv) > 3 else 'capturas') + '/'
# Opcional: el Excel de la semana siguiente (con un .json al lado que dice qué cambió) para probar la carga por cambios
EXCEL2 = sys.argv[4] if len(sys.argv) > 4 else None
os.makedirs(OUT, exist_ok=True)
APP = f'http://localhost:{PUERTO}/app/'
fallos = []
def ok(c, t, extra=''):
    print(('  ✓ ' if c else '  ✗ ') + t + ('' if c else f'  →  {extra}'))
    if not c: fallos.append(t)
def http(path):
    return json.loads(urllib.request.urlopen(f'http://localhost:{PUERTO}{path}').read())
def http_post(cuerpo):
    req = urllib.request.Request(f'http://localhost:{PUERTO}/exec', data=json.dumps(cuerpo).encode(), headers={'Content-Type': 'text/plain'})
    return json.loads(urllib.request.urlopen(req).read())

with sync_playwright() as p:
    b = p.chromium.launch()
    # Sin animaciones: la portada animada en varias pestañas a la vez cargaba de más al navegador de prueba
    # y a veces Playwright no alcanzaba a ver el botón de entrar (la página sí estaba lista).
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-HN', timezone_id='America/Tegucigalpa', reduced_motion='reduce')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])   # para revisar el correo que se copia
    errores = []
    # Los avisos de escritorio son obligatorios para entrar, y el Chromium de prueba no tiene notificaciones: cada
    # pestaña las simula. permiso: cómo está el navegador al abrir; pide: lo que responde si Alertas pregunta.
    # Lo que se avisa queda en window.__avisos.
    def pagina(permiso='granted', pide='granted', enfocada=True):
        pg = ctx.new_page()
        pg.bring_to_front()   # con varias pestañas a la vez, la nueva queda al frente (si no, a veces Playwright no la ve a tiempo)
        pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        pg.add_init_script("""window.__avisos = [];
          window.Notification = class { constructor(t, o) { window.__avisos.push({ t, b: (o || {}).body, tag: (o || {}).tag }); } close() {}
            static requestPermission() { window.Notification.permission = '%s'; return Promise.resolve('%s'); } };
          window.Notification.permission = '%s';""" % (pide, pide, permiso) + ('' if enfocada else ' document.hasFocus = () => false;'))
        return pg

    print('1. Tiendas con usuario genérico')
    t = pagina(); t.goto(APP); t.wait_for_selector('text=Entrar con Genesys')
    # Monitoreo en vivo de la portada: el nodo con más clientes de un departamento, con su estado real
    t.wait_for_selector('.monitor-nodo b', timeout=15000)
    mon = http_post({'accion': 'monitoreo'})['datos']['nodos']
    cod, estado = t.evaluate("() => { const m = document.querySelector('.monitor'); return [m.querySelector('.monitor-nodo b').textContent.trim(), m.querySelector('.monitor-estado').textContent.trim()]; }")
    nodo = next((x for x in mon if x['n'] == cod), None)
    ok(nodo is not None and estado == ('Falla activa' if nodo['falla'] else 'En línea') and t.locator('.pt-mira').count() == 1,
       'la portada muestra el monitoreo en vivo: un nodo principal del servidor con su estado real y la mira en su departamento', [cod, estado])
    ok(t.locator('.pt-rotulo-ej').count() == 3, 'las alertas de la animación dicen "Ejemplo"')
    t.screenshot(path=OUT + 'e01_acceso.png')
    ok('tiendas' == t.locator('input[autocomplete=username]').input_value(), 'el usuario de Tiendas viene sugerido')
    t.fill('input[type=password]', 'mala-clave'); t.fill('input[autocomplete=name]', 'Pedro Mejía')
    # La tienda se busca escribiendo y hay que elegirla de la lista
    SEL = '.selector-tienda input'
    entrar_activo = lambda: t.locator('form button[type=submit]').is_enabled()
    t.click(SEL)
    ok(t.locator('.selector-opcion').count() == 38, 'al tocar el campo Tienda se despliegan las 38 tiendas', t.locator('.selector-opcion').count())
    ok(not entrar_activo(), 'sin elegir la tienda no deja entrar')
    t.fill(SEL, 'multipla')
    nombres = t.locator('.selector-opcion .nombre').all_inner_texts()
    ok(nombres == ['Mall Multiplaza SPS', 'Mall Multiplaza TGU'], 'al escribir "multipla" quedan solo las dos Multiplaza', nombres)
    t.screenshot(path=OUT + 'e01b_tiendas_busqueda.png')
    t.locator('.selector-opcion', has_text='Multiplaza TGU').click()
    ok(t.locator(SEL).input_value() == 'CAC Mall Multiplaza TGU' and t.locator('.selector-lista').count() == 0 and entrar_activo(),
       'al elegirla queda el nombre completo, se cierra la lista y ya deja entrar', t.locator(SEL).input_value())
    t.fill(SEL, 'Tienda inventada'); t.press(SEL, 'Tab')
    ok(t.locator('.selector-aviso').count() == 1 and not entrar_activo(), 'un nombre que no está en la lista no deja entrar y pide elegir de la lista')
    t.fill(SEL, 'cholu'); t.press(SEL, 'ArrowDown'); t.press(SEL, 'Enter')
    ok(t.locator(SEL).input_value() == 'CAC Unimall Choluteca', 'con el teclado: flecha abajo y Enter eligen la tienda', t.locator(SEL).input_value())
    t.fill(SEL, 'santa ros'); t.press(SEL, 'Tab')
    ok(t.locator(SEL).input_value() == 'CAC Santa Rosa de Copan' and entrar_activo(), 'si lo escrito coincide con una sola tienda, al salir del campo queda elegida', t.locator(SEL).input_value())
    t.fill(SEL, 'mall multiplaza tgu'); t.press(SEL, 'Enter')
    ok(t.locator(SEL).input_value() == 'CAC Mall Multiplaza TGU', 'Enter elige la primera de la lista', t.locator(SEL).input_value())
    # El nombre tiene que ser real (nombre y apellido) y queda en nombre propio
    NOM = 'input[autocomplete=name]'
    for malo in ('el pepe', 'la mera mera', 'Pepe'):
        t.fill(NOM, malo); t.press(NOM, 'Tab')
        ok(t.locator('.campo-error').count() == 1 and not entrar_activo(), f'"{malo}" no sirve como nombre: ' + (t.locator('.campo-error').inner_text() if t.locator('.campo-error').count() else ''))
    t.fill(NOM, 'pedro   MEJÍA'); t.press(NOM, 'Tab')
    ok(t.locator(NOM).input_value() == 'Pedro Mejía' and t.locator('.campo-error').count() == 0 and entrar_activo(), 'al salir del campo, "pedro   MEJÍA" queda como Pedro Mejía', t.locator(NOM).input_value())
    t.click('button:has-text("Entrar") >> nth=-1'); t.wait_for_selector('.error-acceso')
    ok('incorrectos' in t.locator('.error-acceso').inner_text(), 'clave mala muestra el error')
    t.fill('input[type=password]', 'ClaroTiendas2026'); t.click('form button[type=submit]')
    t.wait_for_selector('.buscador-caja input', timeout=15000)
    ok(t.locator('.nav').count() == 0, 'Tiendas no ve el menú de Workforce')
    ok('CAC Mall Multiplaza TGU' in t.locator('.usuario-txt').inner_text(), 'la barra muestra la tienda', t.locator('.usuario-txt').inner_text())
    ok(t.locator('svg.mapa').count() == 1, 'Tiendas ve el mapa de fallas en su pantalla de inicio')
    html = t.content()
    ok('ClaroTiendas2026' not in html and 'ClaroTiendas2026' not in json.dumps(t.evaluate('() => ({...sessionStorage, ...localStorage})')), 'la contraseña no queda en la página ni en el navegador')
    t.screenshot(path=OUT + 'e02_tiendas_inicio.png')
    # Probar los avisos: cada prueba lleva su propia etiqueta (con la misma, Windows la dejaba en el centro de
    # notificaciones sin mostrarla) y se abre la ayuda con dónde sale y qué revisar en la PC si no sale
    t.click('button.usuario'); t.click('.menu button:has-text("Probar los avisos")')
    t.wait_for_selector('.modal:has-text("Te mandamos un aviso de prueba")', timeout=5000)
    t.click('.modal-pie button:has-text("Probar otra vez")'); t.wait_for_timeout(300)
    pr = [x for x in t.evaluate('() => window.__avisos') if x['t'] == 'Avisos de Alertas activados']
    ok(len(pr) == 2 and all(x['tag'] for x in pr) and pr[0]['tag'] != pr[1]['tag'], 'Probar los avisos manda un aviso cada vez, cada uno con su propia etiqueta', pr)
    ayuda = t.locator('.modal').inner_text()
    ok('abajo a la derecha' in ayuda and 'Configuración › Sistema › Notificaciones' in ayuda and 'No molestar' in ayuda and 'Asistente de concentración' in ayuda,
       'la ayuda dice dónde sale el aviso y qué revisar en Windows si no sale', ayuda)
    t.screenshot(path=OUT + 'e02c_prueba_avisos.png')
    t.click('.modal-pie button:has-text("Listo")'); t.wait_for_timeout(300)
    ok(t.locator('.modal').count() == 0, 'Listo cierra la ayuda')
    t.goto(APP + '#fallas'); t.wait_for_timeout(500)
    ok(t.locator('.buscador-caja').count() == 1, 'Tiendas no puede abrir Fallas aunque escriba la dirección')

    print('1b. Tiendas con los avisos bloqueados en el navegador')
    t2 = pagina(permiso='denied', pide='denied')
    t2.goto(APP); t2.wait_for_selector('text=Entrar con Genesys')
    t2.fill('input[type=password]', 'ClaroTiendas2026'); t2.fill('input[autocomplete=name]', 'daniela ramirez'); t2.press('input[autocomplete=name]', 'Tab')
    t2.click('.selector-tienda input'); t2.fill('.selector-tienda input', 'metromall'); t2.locator('.selector-opcion', has_text='Metromall').click()
    t2.click('form button[type=submit]'); t2.wait_for_selector('.puerta-avisos', timeout=15000)
    ok('Daniela Ramirez' in t2.locator('.usuario-txt').inner_text() and 'bloqueados' in t2.locator('.puerta-avisos h1').inner_text() and 'Permitir' in t2.locator('.puerta-pasos').inner_text(),
       'con los avisos bloqueados, explica cómo permitirlos desde el candado (y el nombre quedó como Daniela Ramirez)', t2.locator('.usuario-txt').inner_text())
    t2.screenshot(path=OUT + 'e02b_avisos_bloqueados.png')
    t2.click('.puerta-avisos button:has-text("Seguir sin avisos")'); t2.wait_for_selector('.buscador-caja input', timeout=10000)
    ok(True, 'si el navegador no deja cambiarlo, puede seguir sin avisos (queda registrado)')

    print('2. Workforce entra con Genesys (PKCE)')
    http('/test/genesys?correo=ana.lopez@claro.com.hn&nombre=Ana%20Lopez')
    w = pagina(); w.goto(APP); w.wait_for_selector('text=Entrar con Genesys')
    w.click('text=Entrar con Genesys')
    w.wait_for_selector('.usuario-txt', timeout=15000)
    ok('Ana López' in w.locator('.usuario-txt').inner_text() and 'Workforce' in w.locator('.usuario-txt').inner_text(), 'vuelve de Genesys como Workforce con su nombre de la hoja Usuarios', w.locator('.usuario-txt').inner_text())
    ok('code=' not in w.url, 'la dirección queda limpia después del login', w.url)
    ejemplos = w.evaluate("() => Model.ejemplos(G.s.cat)")
    w.goto(APP + '#fallas'); w.wait_for_selector('.entrada-nodos textarea')
    w.locator('.entrada-nodos textarea').fill(' '.join(ejemplos[:2]))
    w.click('button.agregar'); w.wait_for_timeout(300)
    ok(len(w.locator('.nodo-chip').all()) == 2, 'agrega los nodos con el catálogo del servidor: ' + ', '.join(ejemplos[:2]))
    total = w.locator('.impacto-cifra .grande').inner_text()
    w.click('button.motivo:has-text("energía")'); w.click('.eta-opciones button:has-text("2 h")')
    w.fill('input.numero-falla', 'f 1254585'); w.fill('input[placeholder="Ejemplo: Correo NOC #9114"]', 'Correo NOC #9150')
    w.locator('.paso', has_text='Número de falla').screenshot(path=OUT + 'e03b_numero_falla.png')
    w.screenshot(path=OUT + 'e03_publicar.png')
    w.click('.publicar-barra .btn-primario'); w.click('.modal .btn-primario')
    w.wait_for_selector('.falla-card', timeout=15000)
    ok(w.locator('.falla-card').count() >= 1, f'falla publicada en el servidor ({total} clientes)')
    ok(w.locator('.falla-card .id').first.inner_text() == 'F1254585', 'la tarjeta se nombra con el número de falla F1254585', w.locator('.falla-card .id').first.inner_text())
    w.locator('.falla-card').first.screenshot(path=OUT + 'e03c_tarjeta.png')
    c_falla = http('/test/contrato?nodo=' + ejemplos[0])['contrato']
    w.goto(APP + '#consulta'); w.wait_for_selector('.buscador-caja input')
    w.fill('.buscador-caja input', c_falla); w.keyboard.press('Enter'); w.wait_for_selector('.historial-cliente', timeout=15000)
    ok('F1254585' in w.locator('.historial-cliente').inner_text(), 'en la consulta, Workforce ve el número de falla en el historial del cliente')

    print('3. Tiendas recibe el aviso y ve la falla')
    t.goto(APP + '#consulta'); t.wait_for_selector('.aviso', timeout=15000)
    ok('Ana López publicó la falla' in t.locator('.aviso p').inner_text(), 'aviso con quién publicó', t.locator('.aviso p').inner_text())
    t.click('.aviso .btn'); t.wait_for_selector('.falla-item')
    ok('F1254585' in t.locator('.falla-item .id').all_inner_texts() and 'NOC #9150' not in json.dumps(t.evaluate('() => G.s.fallas')) and 'NOC #9150' not in t.content(),
       'Tiendas ve la falla con su número de falla (F1254585), sin la referencia', t.locator('.falla-item .id').all_inner_texts())
    # El panel dice el departamento con sus nodos y, debajo, las colonias afectadas
    tarjeta = t.locator('.riel .falla-item', has_text='F1254585')
    z = t.evaluate("""() => { const f = G.s.fallas.find((x) => x.numero === 'F1254585'); const z = Model.zonaFalla(G.s.cat, f);
      return { dep: U.lugar(z.deps[0] || ''), col: z.top[0] || '', nodos: f.nodos, con: !!G.s.cat.conColonias }; }""")
    zona = tarjeta.locator('.zona').inner_text()
    ok(z['con'] and z['dep'] and z['col'] and z['dep'] in zona and all(n in zona for n in z['nodos']) and z['col'] in tarjeta.locator('.colonias').inner_text(),
       f'el panel dice el departamento con sus nodos ({zona}) y, debajo, las colonias afectadas', tarjeta.inner_text())
    tarjeta.locator('.falla-item-cab').click(); t.wait_for_selector('.riel .zona-muni', timeout=5000)
    ok(tarjeta.locator('.zona-muni').count() >= 1 and tarjeta.locator('.zona-cols .chip').count() >= 1, 'al tocarla salen sus colonias por municipio')
    ok(tarjeta.locator('.det-acc button', has_text='nodos').count() == 0, 'con 3 nodos o menos ya están todos a la vista: no hace falta Ver los nodos')
    t.locator('.riel').screenshot(path=OUT + 'e04b_panel_colonias.png')
    ok(t.locator('.mapa path[fill*="seq-5"]').count() >= 1, 'el mapa pinta el departamento afectado')
    cab = t.locator('.mapa-grid.apilado .hbar.cab').inner_text()
    ok('Departamento' in cab and 'Clientes' in cab, 'en Consulta el mapa va a todo lo ancho, con la lista abajo y los encabezados Departamento y Clientes')
    t.screenshot(path=OUT + 'e04_tiendas_mapa.png', full_page=True)
    t.fill('.buscador-caja input', c_falla); t.keyboard.press('Enter'); t.wait_for_selector('.veredicto', timeout=15000)
    ok(t.locator('.veredicto').get_attribute('data-s') == 'FALLA', 'el cliente ' + c_falla + ' del nodo ' + ejemplos[0] + ' sale con Falla general')
    ok('Le comento' in t.locator('.guion-texto').inner_text(), 'Tiendas recibe el guion')
    t.wait_for_selector('.historial-cliente .hist-lista li', timeout=15000)
    hist = t.locator('.historial-cliente').inner_text()
    ok('Falla de energía comercial' in hist and 'sigue activa' in hist and 'F1254585' in hist, 'Tiendas ve el historial de fallas del cliente, con el número de falla')
    t.wait_for_function("() => { const b = document.querySelector('.hist-kpis > div:last-child b'); return b && b.textContent !== '…'; }", timeout=15000)
    ok(t.locator('.hist-kpis > div:last-child b').inner_text() in ('0', '1'), 'y cuántas veces lo consultaron antes (' + t.locator('.hist-kpis > div:last-child').inner_text().replace('\n', ' ') + ')')
    t.screenshot(path=OUT + 'e05_tiendas_falla.png', full_page=True)
    t.set_viewport_size({'width': 390, 'height': 844}); t.wait_for_timeout(400)
    t.screenshot(path=OUT + 'e05b_tiendas_telefono.png', full_page=True)
    t.set_viewport_size({'width': 1440, 'height': 900})

    print('4. Concentrix entra con Genesys y consulta')
    http('/test/genesys?correo=karla.zelaya@concentrix.com&nombre=Karla%20Zelaya')
    a = pagina(); a.goto(APP); a.click('text=Entrar con Genesys'); a.wait_for_selector('.buscador-caja input', timeout=15000)
    ok('Concentrix' in a.locator('.usuario-txt').inner_text(), 'cualquier usuario de Genesys entra como Concentrix')
    c_ok = http('/test/contrato?nodo=' + ejemplos[2])['contrato']
    a.fill('.buscador-caja input', c_ok); a.keyboard.press('Enter'); a.wait_for_selector('.veredicto', timeout=15000)
    ok(a.locator('.veredicto').get_attribute('data-s') == 'SIN_FALLA', 'un cliente de otro nodo sale Sin falla general')
    a.click('button:has-text("Reportar posible falla")'); a.wait_for_selector('text=Aviso enviado')
    ok(True, 'Concentrix reporta una posible falla')
    ok('Sin fallas' in a.locator('.historial-cliente').inner_text(), 'un cliente sin fallas en su nodo: el historial lo dice')
    a.click('button.limpiar'); a.wait_for_selector('.mini-kpis', timeout=5000)
    ok(a.locator('.buscador-caja input').input_value() == '' and a.locator('.veredicto').count() == 0, 'Limpiar borra el contrato y el resultado')
    for i, modo in enumerate(('html', '503', 'get')):
        c_otro = http(f'/test/contrato?nodo={ejemplos[2]}&n={5 + i}')['contrato']   # otro contrato: el repetido sale de la memoria de la página
        a.keyboard.press('Escape'); a.fill('.buscador-caja input', ''); a.wait_for_timeout(200)
        http(f'/test/ocupado?n=2&modo={modo}')
        a.fill('.buscador-caja input', c_otro); a.keyboard.press('Enter')
        a.wait_for_selector(f'.cliente-ids:has-text("{c_otro}")', timeout=20000)
        ok(http('/test/ocupado')['quedan'] == 0 and a.locator('text=No se pudo consultar').count() == 0, f'con el servidor saturado un momento ({modo}), la búsqueda se reintenta sola')
    a.fill('.buscador-caja input', '99'); a.keyboard.press('Enter'); a.wait_for_selector('.no-encontrado', timeout=15000)
    ok('No encontramos' in a.locator('.no-encontrado h3').inner_text(), 'contrato inexistente: mensaje claro')
    a.keyboard.press('Escape'); a.fill('.buscador-caja input', ''); a.wait_for_timeout(300)
    ok(a.locator('.recientes li').count() >= 2, 'sus últimas consultas de la sesión aparecen en el inicio')

    print('5. Posibles fallas para Workforce')
    # Un nodo que nadie ha consultado en la prueba
    nodoPF = w.evaluate("(ej) => [...G.s.cat.nodos.values()].filter((n) => !U.esVirtual(n.code) && n.total >= 12 && !ej.includes(n.code)).map((n) => n.code).sort()[0]", ejemplos)
    contratosPF = [http(f'/test/contrato?nodo={nodoPF}&n={k}')['contrato'] for k in range(5)]
    # El aviso de escritorio, simulado: se anota lo que se avisa, como si Alertas estuviera minimizado
    w.evaluate("""() => { window.__avisos = []; document.hasFocus = () => false;
      window.Notification = class { constructor(t, o) { window.__avisos.push({ t, b: (o || {}).body, tag: (o || {}).tag }); } close() {} static requestPermission() { return Promise.resolve('granted'); } };
      window.Notification.permission = 'granted'; G.set({ permisoAvisos: 'granted' }); }""")
    w.evaluate("() => ir('fallas')")
    def buscar_en(contratos):
        for c in contratos:
            a.fill('.buscador-caja input', c); a.keyboard.press('Enter'); a.wait_for_selector(f'.cliente-ids:has-text("{c}")', timeout=20000)
    def revisar(cond):
        for k in range(25):   # el servidor guarda la lista 30 s en caché
            w.evaluate('() => A.revisarAlertas()'); w.wait_for_timeout(1500)
            if cond(): return True
        return False
    buscar_en(contratosPF[:3])
    ok(revisar(lambda: w.locator('.obs-chip', has_text=nodoPF).count() > 0), f'con 3 clientes de {nodoPF}, Workforce lo ve en observación')
    ok(not w.evaluate('() => window.__avisos.length'), 'en observación todavía no hay aviso de escritorio')
    buscar_en(contratosPF[3:5])
    ok(revisar(lambda: w.locator('.pf-tarjeta', has_text=nodoPF).count() > 0), f'con 5 clientes distintos es posible falla en {nodoPF}')
    avisos = w.evaluate('() => window.__avisos')
    ok(any(x['t'] == 'Posible falla en ' + nodoPF and '5 clientes distintos' in x['b'] for x in avisos), 'llega el aviso de escritorio', avisos)
    w.screenshot(path=OUT + 'e06_posible_falla.png')
    w.evaluate("() => ir('consulta')"); w.wait_for_selector('.aviso-pf', timeout=5000)
    ok(nodoPF in w.locator('.aviso-pf').inner_text(), 'en las otras vistas aparece la barra de la posible falla')
    w.click('.aviso-pf .btn:has-text("Ver clientes")'); w.wait_for_selector('.pf-vista table', timeout=30000)
    ok(w.locator('.pf-vista table tr').count() - 1 == 5, 'el detalle trae los 5 clientes', w.locator('.pf-vista table tr').count() - 1)
    w.click('.pf-botones .btn-primario'); w.wait_for_timeout(500)
    clip = w.evaluate("""async () => { const out = {}; for (const it of await navigator.clipboard.read()) for (const t of it.types) out[t] = await (await it.getType(t)).text(); return out; }""")
    ok('<table' in clip.get('text/html', '') and all(c in clip.get('text/html', '') for c in contratosPF) and 'Saludos' in clip.get('text/plain', '') and nodoPF in clip.get('text/plain', ''),
       'Copiar correo deja el correo con la tabla de los clientes, con formato y en texto', list(clip.keys()))
    ok(nodoPF in w.locator('.pf-asunto b').inner_text() and '5 clientes' in w.locator('.pf-asunto b').inner_text(), 'con el asunto listo', w.locator('.pf-asunto b').inner_text())
    w.screenshot(path=OUT + 'e06b_correo.png')
    w.click('.modal-pie button:has-text("Marcar como reportada")'); w.wait_for_selector('.pf-marca', timeout=15000)
    ok('Ana López' in w.locator('.pf-marca').inner_text(), 'se marca como reportada')
    w.click('.modal-pie button:has-text("Cerrar")')

    print('5b. Supervisor de Call Center')
    http('/test/genesys?correo=sofia.mejia@concentrix.com&nombre=Sofia%20Mejia')
    s = pagina(permiso='default', pide='granted', enfocada=False)   # el navegador todavía no ha preguntado; Alertas a un lado
    s.goto(APP); s.wait_for_selector('text=Entrar con Genesys')
    ok('supervisores' in s.locator('.acceso-bloque h3').first.inner_text(), 'la entrada con Genesys dice que es también para los supervisores', s.locator('.acceso-bloque h3').first.inner_text())
    s.click('text=Entrar con Genesys'); s.wait_for_selector('.usuario-txt', timeout=15000)
    ok('Sofía Mejía' in s.locator('.usuario-txt').inner_text() and 'Supervisor' in s.locator('.usuario-txt').inner_text() and s.locator('.nav').count() == 0,
       'la supervisora entra con Genesys (rol de la hoja Usuarios), sin el menú de Workforce', s.locator('.usuario-txt').inner_text())
    # Avisos obligatorios: hasta que los permita, no ve la consulta
    s.wait_for_selector('.puerta-avisos', timeout=10000)
    ok('Es obligatorio' in s.locator('.puerta-avisos').inner_text() and 'publique una falla y cuando se resuelva, y cuando haya una posible falla' in s.locator('.puerta-avisos').inner_text()
       and s.locator('.buscador-caja').count() == 0, 'al entrar, los avisos de escritorio son obligatorios: no ve la consulta hasta activarlos')
    s.screenshot(path=OUT + 'e06s_avisos_obligatorios.png')
    s.click('.puerta-avisos button:has-text("Activar avisos")'); s.wait_for_selector('.buscador-caja input', timeout=10000)
    av = s.evaluate('() => window.__avisos')
    ok(s.locator('.puerta-avisos').count() == 0 and any(x['t'] == 'Avisos de Alertas activados' and 'publique una falla y cuando se resuelva' in x['b'] for x in av),
       'al permitirlos sigue a la consulta (el panel de los asesores) y llega el aviso de prueba', av)
    s.screenshot(path=OUT + 'e06s_supervisor_inicio.png')
    s.wait_for_selector(f'.posibles .pf-tarjeta:has-text("{nodoPF}")', timeout=20000)
    tarjeta_s = s.locator('.pf-tarjeta', has_text=nodoPF)
    ok('Reportada al VOC por Ana López' in tarjeta_s.inner_text() and tarjeta_s.locator('button:has-text("Crear falla")').count() == 0,
       'arriba de la consulta ve las posibles fallas: la de Workforce ya reportada y sin el botón Crear falla', tarjeta_s.inner_text())
    tarjeta_s.locator('button:has-text("Ver clientes")').click(); s.wait_for_selector('.pf-vista table', timeout=30000)
    ok(s.locator('.pf-marca button:has-text("Quitar marca")').count() == 0 and s.locator('.modal-pie button:has-text("Reporté al VOC")').count() == 0
       and s.locator('.modal-pie button:has-text("Crear falla")').count() == 0, 'en una ya reportada por otro no puede quitar la marca ni volver a reportarla')
    s.click('.modal-pie button:has-text("Cerrar")')
    # Otra posible falla, que nadie ha reportado
    nodoPF2 = w.evaluate("(ya) => [...G.s.cat.nodos.values()].filter((n) => !U.esVirtual(n.code) && n.total >= 12 && !ya.includes(n.code)).map((n) => n.code).sort()[1]", ejemplos + [nodoPF])
    buscar_en([http(f'/test/contrato?nodo={nodoPF2}&n={k}')['contrato'] for k in range(5)])
    def revisar_s(cond):
        for k in range(25):
            s.evaluate('() => A.revisarAlertas()'); s.wait_for_timeout(1500)
            if cond(): return True
        return False
    ok(revisar_s(lambda: s.locator('.pf-tarjeta', has_text=nodoPF2).count() > 0), f'con 5 clientes de {nodoPF2}, la supervisora ve la posible falla')
    av = s.evaluate('() => window.__avisos')
    ok(any(x['t'] == 'Posible falla en ' + nodoPF2 for x in av) and s.locator('.aviso-pf', has_text=nodoPF2).count() == 1, 'y le llega el aviso de escritorio y la barra de arriba', av)
    s.locator('.aviso-pf .btn:has-text("Ver clientes")').click(); s.wait_for_selector('.pf-vista table', timeout=30000)
    ok(s.locator('.modal-pie button:has-text("Avisar a Workforce")').count() == 1 and s.locator('.modal-pie button:has-text("Reporté al VOC")').count() == 1
       and s.locator('.modal-pie button:has-text("Crear falla")').count() == 0, 'puede avisarle a Workforce o reportarla al VOC, pero no crear la falla')
    ok('Supervisión de Call Center' in s.locator('.pf-vista').inner_text() and 'Sofía Mejía' in s.locator('.pf-vista').inner_text(), 'el correo lo firma ella, de Supervisión de Call Center')
    s.fill('.pf-nota input', 'Clientes sin internet ni cable desde las 9')
    s.screenshot(path=OUT + 'e06t_supervisor_modal.png')
    s.click('.modal-pie button:has-text("Avisar a Workforce")'); s.wait_for_selector('.pf-marca', timeout=15000)
    marca_s = s.locator('.pf-marca').inner_text()
    ok('Sofía Mejía (supervisor) le avisó a Workforce' in marca_s and 'Clientes sin internet' in marca_s and s.locator('.pf-marca button:has-text("Quitar marca")').count() == 1
       and s.locator('.modal-pie button:has-text("Avisar a Workforce")').count() == 0 and s.locator('.modal-pie button:has-text("Reporté al VOC")').count() == 1,
       'queda el aviso con su nota; puede quitarlo o, cuando lo reporte, marcarlo al VOC', marca_s)
    s.click('.modal-pie button:has-text("Cerrar")')
    # Workforce recibe el aviso de la supervisora: tarjeta, barra y aviso de escritorio (sigue pendiente para ellos)
    w.evaluate('() => { window.__avisos = []; }')
    ok(revisar(lambda: 'le avisó a Workforce' in (w.locator('.pf-tarjeta', has_text=nodoPF2).inner_text() if w.locator('.pf-tarjeta', has_text=nodoPF2).count() else '')) or
       w.locator('.aviso-pf', has_text='Sofía Mejía').count() == 1, 'a Workforce le llega el aviso de la supervisora')
    av = w.evaluate('() => window.__avisos')
    ok(any(x['t'] == 'Sofía Mejía avisa: posible falla en ' + nodoPF2 and 'Clientes sin internet' in x['b'] for x in av), 'como aviso de escritorio, con su nota', av)
    ok(w.locator('.aviso-pf', has_text='Sofía Mejía (supervisor) avisa').count() == 1, 'y en la barra de arriba', w.locator('.aviso-pf').all_inner_texts())
    w.screenshot(path=OUT + 'e06u_workforce_aviso_supervisor.png')
    w.evaluate("() => ir('fallas')"); w.wait_for_selector(f'.pf-tarjeta:has-text("{nodoPF2}")', timeout=10000)
    t_wf = w.locator('.pf-tarjeta', has_text=nodoPF2)
    ok(t_wf.get_attribute('data-reportada') != 'true' and t_wf.locator('button:has-text("Crear falla")').count() == 1, 'para Workforce sigue pendiente, con Crear falla', t_wf.get_attribute('data-reportada'))
    t_wf.screenshot(path=OUT + 'e06v_tarjeta_aviso.png')
    w.evaluate("() => ir('consulta')")
    # La supervisora la reporta al VOC
    s.locator('.pf-tarjeta', has_text=nodoPF2).locator('button:has-text("Ver clientes")').click(); s.wait_for_selector('.pf-vista table', timeout=30000)
    s.click('.modal-pie button:has-text("Reporté al VOC")'); s.wait_for_selector('.pf-marca:has-text("Reportada al VOC por Sofía Mejía")', timeout=15000)
    ok(True, 'después la marca como reportada al VOC')
    s.click('.modal-pie button:has-text("Cerrar")')
    ok(s.locator('.pf-tarjeta', has_text=nodoPF2).get_attribute('data-reportada') == 'true', 'y su tarjeta queda como reportada')
    s.screenshot(path=OUT + 'e06w_supervisor_panel.png')

    print('6. Sesión vencida')
    t.evaluate("() => { const s = JSON.parse(sessionStorage.getItem('alertas-sesion')); s.token = s.token.slice(0, -4) + 'AAAA'; sessionStorage.setItem('alertas-sesion', JSON.stringify(s)); }")
    t.reload(); t.wait_for_selector('text=Tu sesión venció', timeout=15000)
    ok(t.locator('.aviso-acceso').count() == 1 and t.locator('.buscador-caja').count() == 0, 'si la sesión no vale, vuelve a Entrar con el aviso')
    ok(t.locator('.selector-tienda input').input_value() == 'CAC Metromall' and t.locator('input[autocomplete=username]').input_value() == 'tiendas'
       and t.locator('input[autocomplete=name]').input_value() == 'Daniela Ramirez',
       'esta PC recuerda la tienda, el usuario y el nombre de la última entrada de Tiendas (Daniela Ramirez, CAC Metromall)', t.locator('.selector-tienda input').input_value())
    t.screenshot(path=OUT + 'e06b_sesion_vencida.png')

    print('7. Otra persona de Workforce entra con Genesys (no hay acceso temporal)')
    http('/test/genesys?correo=mario.rivera@claro.com.hn&nombre=Mario%20Rivera')
    x = pagina(); x.goto(APP); x.wait_for_selector('text=Entrar con Genesys')
    ok(x.locator('button:has-text("Temporal")').count() == 0 and x.locator('text=Acceso temporal').count() == 0 and 'Tiendas' in x.locator('form.acceso-bloque h3').inner_text(),
       'la entrada solo ofrece Genesys y Tiendas: no hay acceso temporal')
    x.click('text=Entrar con Genesys'); x.wait_for_selector('.nav', timeout=15000)
    ok('Mario Rivera' in x.locator('.usuario-txt').inner_text() and 'Workforce' in x.locator('.usuario-txt').inner_text(), 'Mario Rivera entra con Genesys como Workforce', x.locator('.usuario-txt').inner_text())
    x.evaluate("() => ir('fallas')"); x.wait_for_selector(f'.pf-tarjeta:has-text("{nodoPF}")', timeout=20000)
    ok('Reportada al VOC por Ana López' in x.locator('.pf-tarjeta', has_text=nodoPF).inner_text(), 'el resto de Workforce ve que Ana López ya reportó la posible falla')
    x.locator('.pf-tarjeta', has_text=nodoPF).locator('button:has-text("Crear falla")').click()
    x.wait_for_selector(f'.lista-nodos .nodo-chip:has-text("{nodoPF}")', timeout=5000)
    ok(x.locator('.lista-nodos .nodo-chip').count() == 1, 'Crear falla deja el nodo listo en Publicar falla')
    ok(x.locator('.motivo-posible').get_attribute('aria-pressed') == 'true', 'con el motivo "Posible falla general" ya elegido')
    primera = x.evaluate("""(n) => { const a = G.s.alertas.find((x) => x.nodo === n); const d = new Date(a.primero); const p = (v) => String(v).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }""", nodoPF)
    ok(x.locator('input[type=datetime-local]').first.input_value() == primera, 'y el inicio en la primera llamada de los clientes (' + primera[11:] + ')', x.locator('input[type=datetime-local]').first.input_value())
    x.locator('.paso', has_text='Motivo').screenshot(path=OUT + 'e06c_motivo_posible.png')
    x.click('.publicar-barra .btn-primario'); x.click('.modal .btn-primario')
    x.wait_for_selector(f'.falla-card:has-text("{nodoPF}")', timeout=15000)
    fpos = x.evaluate("(n) => G.s.fallas.find((f) => f.estado === 'ACTIVA' && f.motivo === 'VALIDACION' && f.nodos.includes(n))", nodoPF)
    det = (fpos or {}).get('deteccion') or {}
    ok(fpos and det.get('clientes') == 5 and det.get('llamadas', 0) >= 5 and det.get('aviso') and det['primera'] <= det['aviso'] <= fpos['publicadaEn'],
       f'se publica como posible falla y el servidor guarda la detección ({det.get("llamadas")} llamadas de {det.get("clientes")} clientes antes de publicar)', det)
    tarjeta_pf = x.locator('.falla-card', has_text=nodoPF)
    ok('En validación' in tarjeta_pf.inner_text() and tarjeta_pf.locator('button:has-text("Descartar")').count() == 1, 'la tarjeta dice En validación y ofrece Descartar')
    a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)
    a.fill('.buscador-caja input', contratosPF[1]); a.keyboard.press('Enter'); a.wait_for_selector(f'.cliente-ids:has-text("{contratosPF[1]}")', timeout=20000)
    ok(a.locator('.veredicto').get_attribute('data-s') == 'FALLA' and 'Posible falla general' in a.locator('.veredicto').inner_text(), 'Concentrix ve "Posible falla general" en ese nodo')
    a.wait_for_selector('.nota-qflow', timeout=5000)
    nota = a.locator('.nota-qflow p').inner_text()
    ok(nota.startswith('Cliente en posible falla general, nodo ' + nodoPF) and 'en validación con el VOC' in nota, 'con la nota para Qflow: ' + nota)
    a.click('.nota-qflow button'); a.wait_for_timeout(300)
    ok(a.evaluate('() => navigator.clipboard.readText()') == nota and 'Nota copiada' in a.locator('.nota-qflow button').inner_text(), 'Copiar nota del caso la deja en el portapapeles')
    a.locator('.guion').screenshot(path=OUT + 'e06d_nota_qflow.png')
    # Descartarla: el VOC no encontró falla
    tarjeta_pf.locator('button:has-text("Descartar")').click(); x.wait_for_selector('.modal:has-text("Descartar la posible falla")', timeout=5000)
    x.fill('.modal input[placeholder^="Ejemplo: El VOC"]', 'El VOC no encontró falla'); x.click('.modal .btn-peligro'); x.wait_for_timeout(1500)
    # Aviso de escritorio de la descartada: a la supervisora le llega que ya no hay posible falla en ese nodo
    s.evaluate('() => Backend.estado().then((e) => A.avisarFallas(e))'); s.wait_for_timeout(300)
    av = [v for v in s.evaluate('() => window.__avisos') if v['t'].startswith('Se descartó la posible falla')]
    ok(len(av) == 1 and 'No se confirmó falla en ' + nodoPF in av[0]['b'] and 'sigue el flujo normal' in av[0]['b'] and 'El VOC no encontró' not in av[0]['b'],
       'al descartarla, a la supervisora le llega el aviso de que se descartó: ' + (av[0]['b'] if av else ''), s.evaluate('() => window.__avisos'))
    a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)
    a.fill('.buscador-caja input', contratosPF[2]); a.keyboard.press('Enter'); a.wait_for_selector(f'.cliente-ids:has-text("{contratosPF[2]}")', timeout=20000)
    a.wait_for_selector('.historial-cliente', timeout=15000)
    ok(a.locator('.veredicto').get_attribute('data-s') == 'SIN_FALLA' and 'Posible falla' not in a.locator('.historial-cliente').inner_text(),
       'descartada, Concentrix ya no la ve (ni como resuelta ni en el historial del cliente)', a.locator('.veredicto').get_attribute('data-s'))
    x.evaluate('() => A.revisarAlertas()'); x.wait_for_timeout(1500)
    ok(x.locator('.pf-tarjeta', has_text=nodoPF).count() == 0, 'y el aviso de posible falla no vuelve a salir con los mismos clientes')
    # Llamó: Tiendas consultó a c_falla durante F1254585; al cerrarla, el historial lo marca
    f_energia = x.evaluate("() => G.s.fallas.find((f) => f.numero === 'F1254585').id")
    x.evaluate("(id) => A.cerrarFalla(id, Date.now(), 'Energía restablecida')", f_energia); x.wait_for_timeout(1000)
    # Aviso de escritorio de la falla resuelta
    s.evaluate('() => Backend.estado().then((e) => A.avisarFallas(e))'); s.wait_for_timeout(300)
    av = [v for v in s.evaluate('() => window.__avisos') if v['t'] == 'Falla resuelta: F1254585']
    ok(len(av) == 1 and av[0]['b'].startswith('Falla de energía comercial en ') and re.search(r'Servicio restablecido hoy a las? \d', av[0]['b']) and 'la cerró Mario Rivera' in av[0]['b'],
       'al cerrar una falla, a la supervisora le llega "Falla resuelta: F1254585": ' + (av[0]['b'] if av else ''), s.evaluate('() => window.__avisos'))
    a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)
    a.fill('.buscador-caja input', c_falla); a.keyboard.press('Enter'); a.wait_for_selector('.historial-cliente .hist-lista li', timeout=15000)
    a.wait_for_selector('.hist-etiquetas .llamo', timeout=15000)
    ok(a.locator('.hist-etiquetas .llamo').first.inner_text().strip() == 'Llamó 1 vez', 'el historial marca que el cliente llamó durante esa falla (sin contar las búsquedas de Workforce)', a.locator('.hist-etiquetas .llamo').all_inner_texts())
    nota = a.locator('.nota-qflow p').inner_text()
    ok(nota.startswith('Cliente en falla general F1254585 (energía comercial), nodo ') and 'solucionada hoy a' in nota, 'nota para Qflow de una falla resuelta: ' + nota)
    a.locator('.historial-cliente').screenshot(path=OUT + 'e06e_llamo.png')
    x.goto(APP + '#stats'); x.wait_for_selector('.deteccion', timeout=60000); x.wait_for_timeout(800)
    det_txt = x.locator('.deteccion').inner_text()
    ok('1 posible falla descartada' in det_txt and 'F1254585' in det_txt and 'De la primera llamada a publicar' in det_txt,
       'Estadísticas: detección de fallas, sin la posible falla descartada (la cuenta aparte)', det_txt[:300])
    x.locator('.deteccion').screenshot(path=OUT + 'e06f_deteccion.png')

    print('7b. SMS a los clientes con Notifícame (solo mensajes aprobados)')
    x.goto(APP + '#fallas'); x.wait_for_selector('.pestanas', timeout=15000)
    x.click('button[role=tab]:has-text("Resueltas")'); x.wait_for_selector('.falla-card', timeout=10000)
    ok(x.locator('.falla-card', has_text='F1254585').locator('button.enviar-sms').count() == 0, 'una falla resuelta ya no tiene botón de SMS (no se avisa el servicio restablecido)')
    x.evaluate("""() => { window.__avisos = []; document.hasFocus = () => false;
      window.Notification = class { constructor(t, o) { window.__avisos.push({ t, b: (o || {}).body, tag: (o || {}).tag }); } close() {} static requestPermission() { return Promise.resolve('granted'); } };
      window.Notification.permission = 'granted'; G.set({ permisoAvisos: 'granted' }); }""")
    x.evaluate("(n) => A.publicarFalla({ nodos: n, motivo: 'POSTES', numero: 'F1254600' })", ejemplos[:2]); x.wait_for_timeout(800)
    # Aviso de escritorio de la falla nueva: le llega a todos los que lo activaron (aquí, la supervisora), no a quien la publicó
    for pg in (s, x): pg.evaluate('() => Backend.estado().then((e) => A.avisarFallas(e))')
    s.wait_for_timeout(300)
    av = [v for v in s.evaluate('() => window.__avisos') if 'F1254600' in v['t']]
    ok(len(av) == 1 and av[0]['t'] == 'Nueva falla publicada: F1254600' and 'Caída de postes en ' + ejemplos[0] in av[0]['b'] and 'Mario Rivera' in av[0]['b'],
       'al publicar una falla, a la supervisora le llega el aviso de escritorio: ' + (av[0]['b'] if av else ''), s.evaluate('() => window.__avisos'))
    ok(len(av) == 1 and re.search(r'^alertas-falla-.+-PUBLICADA-\d+$', av[0]['tag'] or ''), 'el aviso lleva la etiqueta de esa falla, ese cambio y esa versión (si se repite el cambio, también sale en pantalla)', av)
    ok(not [v for v in x.evaluate('() => window.__avisos') if 'Nueva falla' in v['t']], 'a quien la publicó no le llega su propio aviso')
    s.evaluate('() => Backend.estado().then((e) => A.avisarFallas(e))'); s.wait_for_timeout(300)
    ok(len([v for v in s.evaluate('() => window.__avisos') if 'F1254600' in v['t']]) == 1, 'y el aviso llega una sola vez')
    a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)   # Concentrix recibe el aviso de la falla nueva
    def abrir_sms():
        x.goto(APP + '#fallas'); x.wait_for_selector('.pestanas', timeout=15000)
        x.click('button[role=tab]:has-text("Activas")'); x.wait_for_selector('.falla-card', timeout=10000)
        t = x.locator('.falla-card', has_text='F1254600')
        t.locator('button.enviar-sms').click()
        x.wait_for_selector('.sms-cifra', timeout=60000); x.wait_for_timeout(300)
        return t
    t_sms = abrir_sms()
    n_sms = int(re.sub(r'\D', '', x.locator('.sms-cifra b').inner_text()))
    msj_sms = x.locator('.sms-texto').inner_text()
    n_ctrl = 3                                                       # números de control del servidor de prueba
    ok(n_sms > 0 and x.locator('.sms-aprobado').input_value() == 'POSTES' and x.locator('.sms-aprobado option').count() == 6
       and msj_sms.startswith('CLARO:') and 'Se reporta dano en infraestructura publica (postes)' in msj_sms,
       f'en una falla por caída de postes sale su mensaje aprobado, tal cual, para {n_sms} clientes (y se puede elegir otro de los 6 aprobados)')
    ok(x.locator('textarea').count() == 0 and 'tal como está aprobado' in x.locator('.sms-contador').inner_text(), 'el texto no se puede editar: ' + x.locator('.sms-contador').inner_text())
    ok('Además va a 3 números de control del equipo' in x.locator('.sms-cifras').inner_text(), 'dice que también van los 3 números de control del equipo')
    x.locator('.modal').screenshot(path=OUT + 'e06g_sms.png')
    antes_sms = http('/test/sms?limite=10,1')['enviados']        # el primer grupo: Notifícame acepta 10 y pide esperar
    x.click('.modal-pie .btn-primario'); x.click('.modal-pie button:has-text("Sí, enviar")')
    x.wait_for_selector('.sms-progreso-txt:has-text("más despacio")', timeout=60000)
    ok(http('/test/sms')['enviados'] - antes_sms == 10, 'si Notifícame pide esperar, la página lo dice y espera: ' + x.locator('.sms-progreso-txt').inner_text())
    van = 10 - n_ctrl                                                # el primer grupo: los 3 de control y 7 clientes
    x.locator('.modal').screenshot(path=OUT + 'e06h_sms_pausa.png')
    x.reload(); x.wait_for_selector('.usuario-txt', timeout=60000)   # se cerró la página a medio envío
    t_sms = abrir_sms()
    seguir = x.locator('.modal-pie .btn-primario').inner_text()
    ok('sin terminar: van ' + str(van) + ' de ' + str(n_sms) in x.locator('.sms-modal').inner_text() and seguir == 'Seguir enviando a ' + str(n_sms - van)
       and x.locator('.sms-texto').inner_text() == msj_sms, 'al volver, ofrece seguir el mismo envío: "' + seguir + '"')
    x.locator('.modal').screenshot(path=OUT + 'e06h_sms_seguir.png')
    x.click('.modal-pie .btn-primario'); x.click('.modal-pie button:has-text("Sí, enviar")')
    x.wait_for_selector('.sms-resultado', timeout=180000); x.wait_for_timeout(300)
    r_sms = http('/test/sms')
    res_txt = x.locator('.sms-resultado').inner_text().replace(',', '')
    ok(r_sms['enviados'] - antes_sms == n_sms + n_ctrl and r_sms['repetidos'] == 0 and r_sms['malFirmados'] == 0 and str(n_sms) + ' SMS enviados' in res_txt
       and 'También salió a los 3 números de control' in res_txt, f'Notifícame recibió los {n_sms} SMS y los 3 de control, una vez cada uno y bien firmados', r_sms)
    x.locator('.modal').screenshot(path=OUT + 'e06h_sms_listo.png')
    x.click('.modal-pie button:has-text("Listo")'); x.wait_for_timeout(300)
    ok('Aviso de falla a ' + str(n_sms) + ' clientes y 3 de control' in t_sms.locator('dl.meta').inner_text().replace(',', ''), 'la tarjeta muestra el envío, con los de control')
    marca = t_sms.locator('.marca-sms').inner_text().replace(',', '') if t_sms.locator('.marca-sms').count() else ''
    ok('Clientes informados' in marca and str(n_sms) + ' por SMS' in marca, 'y a la vista la marca "Clientes informados" con cuántos y a qué hora', marca)
    t_sms.screenshot(path=OUT + 'e06i_tarjeta_informados.png')
    t_sms.locator('button.enviar-sms').click(); x.wait_for_selector('.sms-cifra', timeout=60000); x.wait_for_timeout(300)
    ok('Ya les llegó a todos' in x.locator('.sms-cifras').inner_text() and x.locator('.modal-pie .btn-primario').is_disabled(), 'al abrirlo otra vez, no se le repite a nadie')
    x.keyboard.press('Escape')

    print('7c. Reportes: conexiones y SMS de Notifícame (Workforce y Jefatura)')
    ok(a.locator('.nav').count() == 0 and s.locator('.nav').count() == 0, 'Concentrix y los supervisores no tienen la sección Reportes')
    x.goto(APP + '#reportes'); x.wait_for_selector('.conex-tabla tbody tr', timeout=30000); x.wait_for_timeout(500)
    ok(x.locator('.nav a[aria-current=page]').inner_text().strip() == 'Reportes' and x.locator('.pestanas button[aria-selected=true]').inner_text().strip() == 'Conexiones',
       'Reportes abre en Conexiones')
    fila = lambda nombre: x.locator('.conex-tabla tbody tr', has_text=nombre)
    ok(fila('Daniela Ramirez').count() == 1 and 'CAC Metromall' in fila('Daniela Ramirez').inner_text() and 'Bloqueados' in fila('Daniela Ramirez').inner_text(),
       'Daniela Ramirez (Tiendas, CAC Metromall) sale con los avisos bloqueados', fila('Daniela Ramirez').inner_text() if fila('Daniela Ramirez').count() else '')
    ok('Supervisor' in fila('Sofía Mejía').inner_text() and 'Activados' in fila('Sofía Mejía').inner_text() and 'Activados' in fila('Pedro Mejía').inner_text(),
       'la supervisora y Pedro Mejía (Tiendas) con los avisos activados')
    karla = fila('Karla Zelaya').locator('td').all_inner_texts()
    ok(len(karla) == 6 and karla[1] == 'Concentrix' and int(karla[4].replace(',', '')) >= 5, 'Karla Zelaya (Concentrix) con sus consultas de hoy: ' + (karla[4] if len(karla) > 4 else ''), karla)
    kp = x.locator('.conex-kpis .kpi').all_inner_texts()
    ok(len(kp) == 4 and kp[0].startswith('Entraron hoy') and 'Sin avisos activados' in kp[3], 'arriba: cuántos entraron hoy, cuántos no entran hace días, quién entró y no consultó, y sin avisos', kp)
    x.screenshot(path=OUT + 'e07_conexiones.png', full_page=True)
    x.click('.conex-cab button:has-text("Sin avisos activados")'); x.wait_for_timeout(300)
    nombres = x.locator('.conex-tabla tbody tr td:first-child b').all_inner_texts()
    ok('Daniela Ramirez' in nombres and 'Sofía Mejía' not in nombres, 'el filtro "Sin avisos activados" deja a quien los tiene bloqueados', nombres)
    x.click('.conex-cab button:has-text("Todos") >> nth=1'); x.fill('.conex-buscar input', 'metromall'); x.wait_for_timeout(300)
    ok(x.locator('.conex-tabla tbody tr').count() == 1, 'buscar "metromall" deja solo a quien entró desde esa tienda')
    with x.expect_download() as dl: x.click('.conex-cab button:has-text("Descargar CSV")')
    crudo = open(dl.value.path(), 'rb').read().decode('utf-8-sig').split('\r\n')
    ok(crudo[0].startswith('Nombre,Acceso,Tienda,Usuario,Primera entrada,Última entrada,Entradas,Consultas (hoy)') and any(l.startswith('Daniela Ramirez,Tiendas,CAC Metromall,,') and l.endswith(',Bloqueados') for l in crudo),
       'Descargar CSV: ' + dl.value.suggested_filename + ', con Daniela Ramirez y sus avisos bloqueados', crudo[:3])
    x.fill('.conex-buscar input', '')
    # Reporte de SMS: el envío de F1254600 (caída de postes) que mandó Mario Rivera en 7b
    x.click('.pestanas button:has-text("SMS de Notifícame")'); x.wait_for_selector('.sms-tabla tbody tr', timeout=30000); x.wait_for_timeout(300)
    env = x.locator('.sms-tabla tbody tr', has_text='F1254600')
    celdas = env.locator('td').all_inner_texts() if env.count() == 1 else []
    ok(len(celdas) == 8 and 'Caída de postes' in celdas[1] and celdas[2].startswith('Caída de postes') and 'Mario Rivera' in celdas[3]
       and celdas[4].replace(',', '').startswith(str(n_sms)) and celdas[6] == '3' and celdas[7].replace(',', '').startswith(str(2 * (n_sms + 3))),
       f'el reporte de SMS trae el envío de F1254600: mensaje "Caída de postes", Mario Rivera, {n_sms} clientes, 3 de control y {2 * (n_sms + 3)} partes', celdas)
    kp = x.locator('.conex-kpis .kpi').all_inner_texts()
    ok(len(kp) == 4 and kp[0].startswith('Envíos') and kp[1].startswith('Clientes avisados') and str(n_sms) in kp[1].replace(',', '') and 'Mario Rivera' in x.locator('.sms-personas').inner_text(),
       'arriba: envíos, clientes avisados, partes de SMS y con error, y cuánto mandó cada persona', kp)
    env.locator('button:has-text("Ver el texto")').click()
    ok('Se reporta dano en infraestructura publica (postes)' in env.locator('.sms-texto-rep').inner_text(), 'con "Ver el texto" se lee el mensaje exacto que se mandó')
    x.screenshot(path=OUT + 'e07b_reporte_sms.png', full_page=True)
    with x.expect_download() as dl: x.click('.reporte-barra button:has-text("Descargar CSV")')
    crudo = open(dl.value.path(), 'rb').read().decode('utf-8-sig').split('\r\n')
    ok(crudo[0].startswith('Fecha,Terminó,Falla,ID de Alertas,Motivo,Nodos,Aviso,Mensaje,Texto,Envió,Clientes,Enviados') and any(',F1254600,' in l and 'Mario Rivera' in l for l in crudo)
       and not any(re.search(r'504\d{8}', l) for l in crudo), 'Descargar CSV: ' + dl.value.suggested_filename + ', sin teléfonos', crudo[:2])

    if EXCEL:
        print('8. Subir la base real desde la página')
        x.goto(APP + '#base'); x.wait_for_selector('.zona-carga input[type=file]')
        x.set_input_files('.zona-carga input[type=file]', EXCEL)
        x.wait_for_selector('text=Lista para publicar', timeout=120000)
        servicios = int(re.sub(r'\D', '', x.locator('.panel', has_text='Lista para publicar').locator('.resumen-base .num').first.inner_text()))
        con_tel = x.locator('text=Trae teléfonos').count() > 0
        x.screenshot(path=OUT + 'e07_lista.png')
        t0 = time.time(); x.click('text=Publicar base')
        x.wait_for_timeout(1500); x.screenshot(path=OUT + 'e08_subiendo.png')
        x.wait_for_selector('text=Base actualizada', timeout=600000)
        ok('solo con los cambios' not in x.locator('.tostadas').inner_text(), 'la primera carga con columnas nuevas se sube completa')
        e = http('/test/estado')
        ok(e['filasBase'] == servicios + 1, f'la base real quedó completa en la base interna ({e["filasBase"] - 1} filas, {time.time() - t0:.0f} s en el emulador)', e)
        ok(x.locator('.tabla tbody tr').count() >= 2, 'el historial muestra las dos cargas')
        x.screenshot(path=OUT + 'e09_base.png', full_page=True)
        a.wait_for_selector('.aviso', timeout=20000)
        ok('actualizó la base' in a.locator('.aviso p').inner_text(), 'Concentrix recibe el aviso de la base nueva')
        a.click('.aviso .btn'); a.wait_for_timeout(800)
        cli = http('/test/cliente?i=0')
        a.fill('.buscador-caja input', cli['contrato']); a.keyboard.press('Enter'); a.wait_for_selector('.cliente-ids:has-text("' + cli['contrato'] + '")', timeout=15000)
        ok(cli['nombre'].split(' ')[0].lower() in a.locator('.cliente-nombre').inner_text().lower(), 'Concentrix encuentra al primer cliente de la base real por contrato')
        if len(cli['dni']) == 13:
            a.fill('.buscador-caja input', cli['dni']); a.keyboard.press('Enter'); a.wait_for_timeout(1500)
            ok(cli['contrato'] in a.locator('.servicios, .cliente-ids').first.inner_text() or cli['contrato'] in a.content(), 'y por DNI sin guiones')
        a.screenshot(path=OUT + 'e10_concentrix_real.png')
        nodos3 = x.evaluate("() => Model.ejemplos(G.s.cat)")
        x.goto(APP + '#fallas'); x.wait_for_selector('.entrada-nodos textarea')
        x.locator('.entrada-nodos textarea').fill(', '.join(nodos3)); x.click('button.agregar'); x.wait_for_timeout(300)
        esperado = x.evaluate("(n) => Model.impacto(G.s.cat, n).total", nodos3)
        ok(x.locator('.impacto-cifra .grande').inner_text().replace(',', '').strip() == str(esperado), f'impacto real de {", ".join(nodos3)}: {esperado} clientes')
        x.click('button.motivo:has-text("fibra")'); x.click('.publicar-barra .btn-primario'); x.click('.modal .btn-primario'); x.wait_for_timeout(1500)
        a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)
        c_n = http('/test/contrato?nodo=' + nodos3[0])['contrato']
        a.fill('.buscador-caja input', c_n); a.keyboard.press('Enter'); a.wait_for_selector('.veredicto[data-s=FALLA]', timeout=15000)
        ok(True, 'un cliente de ' + nodos3[0] + ' sale con Falla general')
        a.screenshot(path=OUT + 'e11_concentrix_falla.png')
        x.goto(APP + '#fallas'); x.click('button[role=tab]:has-text("Activas")'); x.wait_for_selector('.falla-card')
        tarjeta = x.locator('.falla-card', has_text=nodos3[0]).first
        if con_tel:
            with x.expect_download() as d: tarjeta.locator('button.sms').click()
            crudo = open(d.value.path(), 'rb').read()          # en binario: el modo texto de Python cambia \r\n por \n
            lineas = crudo.decode('utf-8').split('\r\n')
            nums = [l for l in lineas[1:] if l]
            malos = [n for n in nums if not re.fullmatch(r'504[3789]\d{7}', n)]
            ok(not crudo.startswith(b'\xef\xbb\xbf') and lineas[0] == 'telefono' and nums and not malos and len(set(nums)) == len(nums),
               f'descarga para Notifícame: {len(nums)} celulares de {", ".join(nodos3)} con 504, sin repetir ({d.value.suggested_filename})',
               {'encabezado': lineas[0], 'lineas': len(lineas), 'mal_formados': len(malos), 'repetidos': len(nums) - len(set(nums))})   # sin imprimir números de clientes
            x.wait_for_selector('.falla-card .nota-sms'); ok(True, 'muestra cuántos clientes tienen celular, solo fijo o ninguno')
            if x.locator('.barra-sms').count() == 0:
                # "Teléfonos de todas" sale con dos o más fallas activas: se publica otra (un nodo grande que no esté en falla)
                otro = x.evaluate("(ya) => [...G.s.cat.nodos.values()].filter((n) => /^[A-Z]{3}(GC)?\\d{2}$/.test(n.code) && !ya.includes(n.code)).sort((a, b) => b.total - a.total)[0].code", nodos3)
                x.click('button[role=tab]:has-text("Publicar")'); x.wait_for_selector('.entrada-nodos textarea')
                x.locator('.entrada-nodos textarea').fill(otro); x.click('button.agregar'); x.wait_for_timeout(300)
                x.click('button.motivo:has-text("fibra")'); x.click('.publicar-barra .btn-primario'); x.click('.modal .btn-primario'); x.wait_for_timeout(1500)
                x.click('button[role=tab]:has-text("Activas")'); x.wait_for_selector('.barra-sms', timeout=15000)
            with x.expect_download() as d2: x.click('.barra-sms button')
            todas = [l for l in open(d2.value.path(), 'rb').read().decode('utf-8').split('\r\n')[1:] if l]
            ok(len(todas) >= len(nums) > 0 and set(nums) <= set(todas) and len(set(todas)) == len(todas), f'todas las fallas activas en un solo archivo ({len(todas)} números)')
            x.screenshot(path=OUT + 'e11b_sms.png', full_page=True)
        else:
            tarjeta.locator('button.sms').click(); x.wait_for_selector('text=no trae la columna TELEFONO', timeout=15000)
            ok(True, 'con una base sin teléfonos, avisa que falta la columna TELEFONO')
        if EXCEL2:
            print('8b. La base de la semana siguiente: solo los cambios')
            info = json.load(open(EXCEL2 + '.json'))
            x.goto(APP + '#base'); x.wait_for_selector('.zona-carga input[type=file]')
            x.wait_for_timeout(5000)    # que se vaya la tostada de la carga anterior
            x.set_input_files('.zona-carga input[type=file]', EXCEL2)
            x.wait_for_selector('text=Lista para publicar', timeout=120000)
            ok('Solo se sube lo que cambió' in x.locator('.panel', has_text='Lista para publicar').inner_text(), 'explica que solo se sube lo que cambió')
            w0 = http('/test/estado')['cuota']['escriturasHoja']
            t0 = time.time(); x.click('text=Publicar base')
            x.wait_for_selector('.tostada:has-text("solo con los cambios")', timeout=120000)
            tost = x.locator('.tostada', has_text='solo con los cambios').inner_text()
            e = http('/test/estado')
            ok(e['filasConDatos'] == info['filas'], f'la base interna quedó con las {info["filas"]} filas del Excel nuevo ({time.time() - t0:.1f} s en el emulador): "{tost}"', e)
            ok(e['cuota']['escriturasHoja'] - w0 <= 6, f'con {e["cuota"]["escriturasHoja"] - w0} escrituras en la hoja (la carga completa usó más de 30)')
            x.screenshot(path=OUT + 'e11c_cambios.png', full_page=True)
            a.wait_for_selector('.aviso', timeout=20000); a.click('.aviso .btn'); a.wait_for_timeout(800)
            a.fill('.buscador-caja input', info['nuevo']); a.keyboard.press('Enter'); a.wait_for_selector('.cliente-ids:has-text("' + info['nuevo'] + '")', timeout=15000)
            ok(True, 'Concentrix ya encuentra un contrato nuevo de esa semana')
            a.fill('.buscador-caja input', info['quitado']); a.keyboard.press('Enter'); a.wait_for_selector('.no-encontrado', timeout=15000)
            ok(True, 'y ya no encuentra uno que salió')
            a.fill('.buscador-caja input', info['cambiado']); a.keyboard.press('Enter'); a.wait_for_selector('.cliente-ids:has-text("' + info['cambiado'] + '")', timeout=15000)
            ok(a.locator('article.cliente .nodo-codigo').first.inner_text().strip() == info['nodoNuevo'], f'un cliente que cambió de nodo sale con el nodo nuevo ({info["nodoNuevo"]})')
        x.goto(APP + '#stats'); x.wait_for_selector('.kpis', timeout=60000); x.wait_for_timeout(800)
        x.screenshot(path=OUT + 'e12_stats.png', full_page=True)
        ok(x.locator('.kpi .v').first.inner_text() != '0', 'estadísticas con las consultas del servidor')

    ok(not [e for e in errores if 'ERR_' not in e and 'status of 503' not in e], 'sin errores de JavaScript en las páginas', errores[:5])   # los 503 son los que simula la prueba
    b.close()
print('\n' + ('TODO BIEN' if not fallos else f'{len(fallos)} FALLAS: ' + '; '.join(fallos)))
