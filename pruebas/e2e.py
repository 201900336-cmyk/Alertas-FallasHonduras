"""Prueba de punta a punta: la página contra el servidor de prueba (Code.gs en el emulador).
Uso: python3 pruebas/e2e.py [puerto] [ruta-excel-real-opcional] [carpeta-capturas]"""
import os, sys, json, time, urllib.request
from playwright.sync_api import sync_playwright

PUERTO = sys.argv[1] if len(sys.argv) > 1 else '8787'
EXCEL = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
OUT = (sys.argv[3] if len(sys.argv) > 3 else 'capturas') + '/'
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
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='es-HN', timezone_id='America/Tegucigalpa')
    errores = []
    def pagina():
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        return pg

    print('1. Tiendas con usuario genérico')
    t = pagina(); t.goto(APP); t.wait_for_selector('text=Entrar con Genesys')
    t.screenshot(path=OUT + 'e01_acceso.png')
    ok('tiendas' == t.locator('input[autocomplete=username]').input_value(), 'el usuario de Tiendas viene sugerido')
    t.fill('input[type=password]', 'mala-clave'); t.fill('input[placeholder="Ejemplo: Multiplaza"]', 'Multiplaza'); t.fill('input[autocomplete=name]', 'Pedro Mejía')
    t.click('button:has-text("Entrar") >> nth=-1'); t.wait_for_selector('.error-acceso')
    ok('incorrectos' in t.locator('.error-acceso').inner_text(), 'clave mala muestra el error')
    t.fill('input[type=password]', 'ClaroTiendas2026'); t.click('form button[type=submit]')
    t.wait_for_selector('.buscador-caja input', timeout=15000)
    ok(t.locator('.nav').count() == 0, 'Tiendas no ve el menú de Workforce')
    ok('Multiplaza' in t.locator('.usuario-txt').inner_text(), 'la barra muestra la tienda')
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
    w.screenshot(path=OUT + 'e03_publicar.png')
    w.click('.publicar-barra .btn-primario'); w.click('.modal .btn-primario')
    w.wait_for_selector('.falla-card', timeout=15000)
    ok(w.locator('.falla-card').count() >= 1, f'falla publicada en el servidor ({total} clientes)')

    print('3. Tiendas recibe el aviso y ve la falla')
    t.goto(APP + '#consulta'); t.wait_for_selector('.aviso', timeout=15000)
    ok('Ana López publicó la falla' in t.locator('.aviso p').inner_text(), 'aviso con quién publicó', t.locator('.aviso p').inner_text())
    t.click('.aviso .btn'); t.wait_for_selector('.falla-item')
    ok(t.locator('.mapa path[fill*="seq-5"]').count() >= 1, 'el mapa pinta el departamento afectado')
    t.screenshot(path=OUT + 'e04_tiendas_mapa.png')
    c_falla = http('/test/contrato?nodo=' + ejemplos[0])['contrato']
    t.fill('.buscador-caja input', c_falla); t.keyboard.press('Enter'); t.wait_for_selector('.veredicto', timeout=15000)
    ok(t.locator('.veredicto').get_attribute('data-s') == 'FALLA', 'el cliente ' + c_falla + ' del nodo ' + ejemplos[0] + ' sale con Falla general')
    ok('Le comento' in t.locator('.guion-texto').inner_text(), 'Tiendas recibe el guion')
    t.screenshot(path=OUT + 'e05_tiendas_falla.png')

    print('4. Concentrix entra con Genesys y consulta')
    http('/test/genesys?correo=karla.zelaya@concentrix.com&nombre=Karla%20Zelaya')
    a = pagina(); a.goto(APP); a.click('text=Entrar con Genesys'); a.wait_for_selector('.buscador-caja input', timeout=15000)
    ok('Concentrix' in a.locator('.usuario-txt').inner_text(), 'cualquier usuario de Genesys entra como Concentrix')
    c_ok = http('/test/contrato?nodo=' + ejemplos[2])['contrato']
    a.fill('.buscador-caja input', c_ok); a.keyboard.press('Enter'); a.wait_for_selector('.veredicto', timeout=15000)
    ok(a.locator('.veredicto').get_attribute('data-s') == 'SIN_FALLA', 'un cliente de otro nodo sale Sin falla general')
    a.click('button:has-text("Reportar posible falla")'); a.wait_for_selector('text=Aviso enviado')
    ok(True, 'Concentrix reporta una posible falla')
    for i, modo in enumerate(('html', '503')):
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

    print('5. Alertas tempranas para Workforce')
    for k in range(3):
        c = http(f'/test/contrato?nodo={ejemplos[2]}&n={k}')['contrato']
        a.fill('.buscador-caja input', c); a.keyboard.press('Enter'); a.wait_for_timeout(700)
    w.goto(APP + '#fallas')
    for k in range(20):   # el servidor guarda las alertas 30 s en caché
        w.evaluate('() => A.revisarAlertas()'); w.wait_for_timeout(2000)
        if w.locator('.alertas .alerta').count(): break
    ok(w.locator('.alertas .alerta').count() >= 1 and ejemplos[2] in w.locator('.alertas .alerta').first.inner_text(), 'Workforce ve la posible falla sin publicar en ' + ejemplos[2])
    w.screenshot(path=OUT + 'e06_alerta.png')

    print('6. Sesión vencida')
    t.evaluate("() => { const s = JSON.parse(sessionStorage.getItem('alertas-sesion')); s.token = s.token.slice(0, -4) + 'AAAA'; sessionStorage.setItem('alertas-sesion', JSON.stringify(s)); }")
    t.reload(); t.wait_for_selector('text=Tu sesión venció', timeout=15000)
    ok(t.locator('.aviso-acceso').count() == 1 and t.locator('.buscador-caja').count() == 0, 'si la sesión no vale, vuelve a Entrar con el aviso')
    t.screenshot(path=OUT + 'e06b_sesion_vencida.png')

    print('7. Acceso temporal de Workforce')
    x = pagina(); x.goto(APP); x.wait_for_selector('text=Entrar con Genesys')
    x.click('.acceso-titulo button:has-text("Temporal")')
    ok(x.locator('input[placeholder="Ejemplo: Multiplaza"]').count() == 0, 'el acceso temporal no pide tienda')
    x.fill('input[autocomplete=username]', 'workforce.temporal'); x.fill('input[type=password]', 'Workforce2026!'); x.fill('input[autocomplete=name]', 'Mario Rivera')
    x.click('form button[type=submit]'); x.wait_for_selector('.nav', timeout=15000)
    ok('Workforce' in x.locator('.usuario-txt').inner_text(), 'entra como Workforce con la clave temporal')

    if EXCEL:
        print('8. Subir la base real desde la página')
        x.goto(APP + '#base'); x.wait_for_selector('.zona-carga input[type=file]')
        x.set_input_files('.zona-carga input[type=file]', EXCEL)
        x.wait_for_selector('text=Lista para publicar', timeout=120000)
        x.screenshot(path=OUT + 'e07_lista.png')
        t0 = time.time(); x.click('text=Publicar base')
        x.wait_for_timeout(1500); x.screenshot(path=OUT + 'e08_subiendo.png')
        x.wait_for_selector('text=Base actualizada', timeout=600000)
        e = http('/test/estado')
        ok(e['filasBase'] == 160629, f'la base real quedó completa en el Sheet ({e["filasBase"] - 1} filas, {time.time() - t0:.0f} s en el emulador)', e)
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
        x.goto(APP + '#stats'); x.wait_for_selector('.kpis', timeout=60000); x.wait_for_timeout(800)
        x.screenshot(path=OUT + 'e12_stats.png', full_page=True)
        ok(x.locator('.kpi .v').first.inner_text() != '0', 'estadísticas con las consultas del servidor')

    ok(not [e for e in errores if 'ERR_' not in e and 'status of 503' not in e], 'sin errores de JavaScript en las páginas', errores[:5])   # los 503 son los que simula la prueba
    b.close()
print('\n' + ('TODO BIEN' if not fallos else f'{len(fallos)} FALLAS: ' + '; '.join(fallos)))
