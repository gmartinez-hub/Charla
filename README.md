# Mangos · Charla de finanzas personales

Presentación HTML de 24 diapositivas, índices `0–23`, compatible con la guía de la app Mangos. No necesita instalación de paquetes ni build. Conserva la narrativa de la charla y permite avanzar con flechas, Espacio, Page Up/Down o swipe horizontal. Home/Escape vuelve a la portada; End va al cierre. Anterior funciona tanto en modo local como durante la sincronización.

## Abrir y verificar

La referencia de pruebas es Node 24.20.0 (compatible desde 24.19, fijado en CI y `.nvmrc`); el servidor de ejemplo usa Python 3.

```sh
python3 -m http.server 4174 --bind 127.0.0.1
# Abrir http://127.0.0.1:4174

npm run check
# O sin npm:
node --check controller.mjs
node --check presentation.mjs
node --check config.mjs
node --test tests/*.test.mjs
```

Servir los archivos por HTTP: abrir `index.html` como `file://` puede bloquear los módulos del navegador. La navegación local funciona sin Supabase. Las fuentes tienen fallback local; el SDK remoto sólo se carga si el presentador inicia la sincronización.

## Uso durante la charla

1. Abrí la presentación y Mangos. Quienes quieran seguirla deben activar la guía en la app.
2. Navegá localmente hasta donde quieras empezar. **Abrir la página no publica nada.**
3. Pulsá **Iniciar sincronización**. “Conectado” aparece sólo cuando el backend confirma el estado del slide actual sin error.
4. Navegá con los controles o el teclado. Mientras se publica un cambio aparece “Sincronizando…”. Un error muestra “Sin confirmar” y permite reintentar explícitamente; la navegación local sigue disponible.
5. Al terminar, pulsá **Detener sincronización** y esperá “Sincronización detenida” antes de cerrar la pestaña. Cerrar o recargar no equivale a detener: no se envían escrituras desde `unload` cuya entrega no pueda confirmarse.

Usar una sola ventana de presentador para una charla. El contrato heredado tiene una única fila `live` y no arbitra varios presentadores. El navegador avisa al intentar salir si la charla puede seguir activa.

El selector **Tema** controla sólo la estética de la presentación, sin convertir los importes ilustrativos de las diapositivas. Auto muestra la superficie fría en la diapositiva 19; ARS y USD mantienen la selección manual. Los acentos lima y mango se conservan en ambos temas.

## Archivos y dependencia

- `index.html`: contenido editable, exactamente 24 diapositivas y controles accesibles.
- `theme.css`: superficies cálidas/frías, tipografía legible, móvil con scroll y reducción de movimiento.
- `controller.mjs`: navegación y cola de escritura serializada; sólo conserva el último cambio pendiente.
- `presentation.mjs`: conecta botones, teclado y estado visual con el controlador; carga el SDK bajo demanda.
- `config.mjs`: conserva el proyecto y la clave **pública** existentes de la presentación. No contiene una clave de servicio. La clave pública no autoriza a un presentador por sí misma: la política de escritura sigue siendo responsabilidad de la configuración del backend.
- `tests/`: controlador real con transporte simulado y prueba de los controles del navegador con un DOM mínimo.

Supabase JS está fijado a **2.112.3**, UMD en jsDelivr, con verificación de integridad SHA-384. Se verificó que el archivo existe y coincide con el UMD del paquete instalado en la app. La navegación no depende de la disponibilidad de ese CDN. No se agregaron dependencias npm.

## Compatibilidad y release conjunto

La base recuperada de esta presentación es `89643206c67602630742c337803934d115eb8034`. La implementación vive en la rama `codex/mangos-coherent-release`. El commit final de la app y de la charla debe registrarse junto en el documento de release al revisar ambos repositorios; estos archivos todavía no representan una publicación en producción.

Compatible con el contrato de `finanzas-pro/src/tour/steps.js` y `finanzas-pro/docs/tour-integration.md` de la misma entrega:

| Índice de slide | Paso de Mangos |
| --- | --- |
| 4 | Metas → Nueva meta |
| 6 | Resumen → Tu meta / plan |
| 8 | Resumen → Disponible del mes |
| 9 | Movimientos → Presupuestos |
| 10 | Movimientos → Recurrentes |
| 11 | Importar → CSV |
| 12 | Resumen → Qué cambió, calculado con los registros |
| 18 | Inversiones → Portfolio / Agregar |
| 19 | Resumen → Mostrar USD de forma determinista |
| 20 | Metas → Vincular inversión |
| 21 | Resumen → Indicadores y contexto financiero |
| 23 | Cierre → Resumen; no scanner |

No insertar ni reordenar diapositivas sin cambiar y probar este contrato en ambos repositorios. El número mostrado en el contador es índice + 1.

La única escritura remota es un upsert de `public.charla_state` con `{id:'live', slide: índiceEntero, active: booleano, updated_at: ISO8601}`. No se escriben datos financieros. Las peticiones se serializan: no sale una nueva hasta que termina la anterior, y saltos rápidos reemplazan el estado pendiente por el más reciente. Detener encola `active:false` detrás de la petición en curso. Un error no se presenta como éxito ni produce un bucle automático de reintentos. Se mantiene el esquema y la configuración existentes; no se modificaron RLS ni credenciales.

Antes de publicar ambas revisiones: ejecutar `npm run check`, abrir las 24 diapositivas en desktop/móvil, recorrer los 12 pasos de la app con transporte simulado y comprobar los estados vacíos. El QA automático no realiza lecturas ni escrituras al backend real. Para rollback, restaurar las versiones de app y charla registradas como pareja compatible.

Fuentes de API: [Supabase upsert](https://supabase.com/docs/reference/javascript/upsert), [changelog](https://supabase.com/changelog). Los ejemplos monetarios de la charla son ilustrativos; se eliminaron tasas temporales que podían confundirse con cotizaciones vigentes.
