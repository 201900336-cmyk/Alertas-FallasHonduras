/* Configuración de Alertas. Es lo único que se edita a mano en GitHub.

   api          URL de la aplicación web de Apps Script (termina en /exec).
                Mientras esté vacía, la página abre en modo demostración con datos ficticios.
   usuarioTiendas  El usuario genérico de Tiendas que aparece ya escrito al entrar.
   redireccion  La dirección exacta de esta página, la misma que se registra en Genesys
                como URI de redirección. Si la página se muda (por ejemplo, a un dominio
                propio), se cambia aquí y en Genesys.

   Este archivo es público: aquí no van contraseñas ni datos de clientes. */
window.ALERTAS_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbwkAkF2qIRIkAB0_CXkUevniH-mq54hEvEiPnJBwvVZx_yewa7iBdTXsPmFnDGAOJSUJQ/exec',
  usuarioTiendas: 'Tiendasnivelnacional',
  redireccion: 'https://201900336-cmyk.github.io/Alertas-FallasHonduras/'
};
