# Cómo cambiar cada cosa

Todo el sistema son cuatro piezas. Saber cuál toca es la mitad del trabajo.

| Quiero cambiar… | Lo cambio en… |
|---|---|
| Colores, tipografía, cómo se ve | `plantilla.html` |
| Qué temas busca cada día | El prompt de la routine |
| Cómo escribe, cuántos bloques, reglas fijas | `CLAUDE.md` |
| Hora y frecuencia | La routine, en claude.ai/code/routines |
| De dónde salen los números | `radar.mjs` |

**La regla general:** si es *cómo se ve*, es la plantilla. Si es *qué buscar hoy*, es el prompt.
Si es *cómo trabajar siempre*, es `CLAUDE.md`.

---

## Cambiar los colores

Están todos arriba de `plantilla.html`, en el bloque `:root`. Cambiás el hex y cambia todo el sitio.

```css
--papel:#F4F4EF;    /* fondo */
--tinta:#101B21;    /* texto y titulares */
--noche:#0C2630;    /* barras y tarjetas oscuras */
--menta:#2ECFB0;    /* el acento, sobre fondo oscuro */
--menta-txt:#0E8E77; /* el acento en texto, sobre fondo claro */
```

Son dos verdes porque el menta claro sobre papel casi no se lee. Si cambiás el acento, cambiá los dos.

## Cambiar la tipografía

En la línea `<link>` de Google Fonts, arriba del todo, y después en las variables de `font-family`.
Los titulares usan `Source Serif 4`; la interfaz usa `Inter`. Cambiá el nombre en los dos lugares
o no va a tomar.

## Cambiar los temas que cubre

En el prompt de la routine, el punto 1. Ahí está la lista de qué buscar. Editás la routine en
claude.ai/code/routines, reescribís esa línea y listo — desde mañana busca otra cosa.

## Cambiar el horario

Misma pantalla, sección del disparador. Se carga en tu horario y las corridas se escalonan unos
minutos, así que puede arrancar 9:05 en vez de 9:00. El mínimo entre corridas es una hora.

## Agregar o sacar un indicador del Radar

Son dos lugares: la fila en `plantilla.html`, dentro de los marcadores `RADAR`, y la obtención
del dato en `radar.mjs`. Si agregás la fila sin la fuente, te queda un indicador vacío para siempre.

## Cambiar quién firma los análisis

En `plantilla.html`, dentro de los marcadores `ANALISIS`, en el bloque `.firma`.

## Cambiar el lector al que le hablás

El último párrafo de `CLAUDE.md`. Es el que más rinde de todo el archivo: cuanto más específico
sea, mejor sale la línea de "qué cambia para una empresa". Poné qué vendés, qué proveedores te
pegan, qué te quita el sueño.

---

## El atajo para todo lo anterior

No hace falta que pelees con GitHub para editar archivos. Abrí Claude Code parado en el
repositorio y pedíselo en castellano:

- "Cambiá el acento del sitio a naranja"
- "Sacá la columna de herramienta del día y agrandá el radar"
- "Agregá riesgo país al radar, sacalo del BCRA"
- "En CLAUDE.md, cambiá el contexto del lector: somos una cadena de supermercados"

Él edita los archivos y hace el commit. Revisá lo que hizo antes de darlo por bueno.

---

## Cuando algo no funciona

**La página no se actualizó.** Lo más probable: la routine dejó el trabajo en una rama
`claude/...` en vez de `main`. GitHub Pages solo publica `main`. Entrá a la sesión de la corrida
y pedile que mergee, o mirá si `main` tiene reglas de protección puestas.

**Un número se ve raro.** Buscalo en `data/radar.json`: ahí está la fuente, la URL y la fecha
real. Si tiene `requiere_revision: true`, el sistema ya lo detectó y no lo publicó.

**Se ve la portada de ayer.** Puede ser correcto: si no hubo material suficiente, `CLAUDE.md`
le indica dejar la anterior en vez de publicar algo vacío. Leé el resumen de la corrida.

**La corrida figura en verde pero no hizo nada.** El verde significa que la sesión arrancó y
terminó sin error de infraestructura, no que la tarea haya salido bien. Hay que abrirla y leerla.

**El radar no trae datos.** Casi seguro es la red del entorno. El entorno Default de las routines
solo deja pasar una lista predefinida de dominios, y BCRA o INDEC no están en ella. Editá la
routine, abrí el entorno y poné el acceso de red en **Full**, o en **Custom** con los dominios
de tus fuentes.

---

## Lo que no cambia

Dos reglas que conviene no aflojar, porque son la diferencia entre un sitio útil y uno peligroso.

**Los números no los escribe la IA.** Salen de un script que consulta fuentes oficiales. Si el
script falla, el dato queda vacío. Si un modelo redacta cifras, cuando falla inventa un número
plausible — y eso no se nota hasta que alguien toma una decisión con él.

**Fecha del dato y fecha del sitio son cosas distintas.** El sitio se actualiza hoy y puede
mostrar inflación de agosto. Está bien, y hay que mostrarlo así.
