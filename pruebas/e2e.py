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

with sync_playwright() as p:
    b = p.chromium.launch()
    # Sin animaciones: la portada animada en varias pestañas a la vez cargaba de más al navegador de prueba
    # y a veces Playwright no alcanzaba a ver el botón de entrar (la página sí estaba lista).
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-HN', timezone_id='America/Tegucigalpa', reduced_motion='reduce')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])   # para revisar el correo que se copia
    errores = []
    def pagina():
        pg = ctx.new_page()
        pg.bring_to_front()   # con varias pestañas a la vez, la nueva queda al frente (si no, a veces Playwright no la ve a tiempo)
        pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        return pg

    print('1. Tiendas con usuario genérico')
    t = pagina(); t.goto(APP); t.wait_for_selector('text=Entrar con Genesys')
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
    t.goto(APP + '#fallas'); t.wait_for_timeout(500)
    ok(t.locator('.buscador-caja').count() == 1, 'Tiendas no puede abrir Fallas aunque escriba la dirección')

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
      window.Notification = class { constructor(t, o) { window.__avisos.push({ t, b: (o || {}).body }); } close() {} static requestPermission() { return Promise.resolve('granted'); } };
      window.Notification.permission = 'granted'; G.set({ permisoAvisos: 'granted', avisosEscritorio: true }); }""")
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

    print('6. Sesión vencida')
    t.evaluate("() => { const s = JSON.parse(sessionStorage.getItem('alertas-sesion')); s.token = s.token.slice(0, -4) + 'AAAA'; sessionStorage.setItem('alertas-sesion', JSON.stringify(s)); }")
    t.reload(); t.wait_for_selector('text=Tu sesión venció', timeout=15000)
    ok(t.locator('.aviso-acceso').count() == 1 and t.locator('.buscador-caja').count() == 0, 'si la sesión no vale, vuelve a Entrar con el aviso')
    ok(t.locator('.selector-tienda input').input_value() == 'CAC Mall Multiplaza TGU' and t.locator('input[autocomplete=username]').input_value() == 'tiendas',
       'esta PC recuerda la tienda y el usuario de Tiendas', t.locator('.selector-tienda input').input_value())
    t.screenshot(path=OUT + 'e06b_sesion_vencida.png')

    print('7. Acceso temporal de Workforce')
    x = pagina(); x.goto(APP); x.wait_for_selector('text=Entrar con Genesys')
    x.click('.acceso-titulo button:has-text("Temporal")')
    ok(x.locator('.selector-tienda').count() == 0, 'el acceso temporal no pide tienda')
    x.fill('input[autocomplete=username]', 'workforce.temporal'); x.fill('input[type=password]', 'Workforce2026!'); x.fill('input[autocomplete=name]', 'Mario Rivera')
    x.click('form button[type=submit]'); x.wait_for_selector('.nav', timeout=15000)
    ok('Workforce' in x.locator('.usuario-txt').inner_text(), 'entra como Workforce con la clave temporal')
    x.evaluate("() => ir('fallas')"); x.wait_for_selector(f'.pf-tarjeta:has-text("{nodoPF}")', timeout=20000)
    ok('Reportada por Ana López' in x.locator('.pf-tarjeta', has_text=nodoPF).inner_text(), 'el resto de Workforce ve que Ana López ya reportó la posible falla')
    x.locator('.pf-tarjeta', has_text=nodoPF).locator('button:has-text("Crear falla")').click()
    x.wait_for_selector(f'.lista-nodos .nodo-chip:has-text("{nodoPF}")', timeout=5000)
    ok(x.locator('.lista-nodos .nodo-chip').count() == 1, 'Crear falla deja el nodo listo en Publicar falla')

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
