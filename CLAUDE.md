# UMBRAL — reglas del sitio

Sitio de una página que se regenera automáticamente. Lo publica GitHub Pages desde `main`.
Cobertura: **finanzas, empresas y economía real**. Nada de política partidaria, policiales,
deportes ni espectáculos.

## Archivos

| Archivo | Qué es | ¿Se toca? |
|---|---|---|
| `plantilla.html` | Diseño e identidad visual. | **Nunca.** Se copia y se rellena. |
| `index.html` | La portada de hoy. | Se reescribe entera en cada corrida. |
| `archivo/AAAA-MM-DD.html` | Copia de cada portada. | Se agrega una por día. |
| `data/radar.json` | Últimos valores de los indicadores. | Lo escribe el script del radar. |
| `data/historico_radar.json` | Serie histórica de indicadores. | Solo se agrega, nunca se reescribe. |
| `data/portada.json` | El contenido editorial del día. | Se reescribe cada día. |

## Cómo se arma la portada

1. Actualizar los datos del radar (ver más abajo).
2. Buscar y seleccionar las noticias del día.
3. Copiar `plantilla.html` y reemplazar **solo** lo que está entre los marcadores
   `<!-- INICIO X -->` y `<!-- FIN X -->`. Los marcadores están listados al principio de la plantilla.
4. Escribir `index.html` y la copia en `archivo/`.
5. Commit a `main` con el mensaje `Portada del AAAA-MM-DD`.

No cambies el CSS, las clases ni la estructura. Si un texto no entra, acortá el texto.

## Regla número uno: los datos no se inventan

Nunca inventes un valor, una fecha, una fuente o una URL. Nunca estimes un indicador para
completar el tablero. Nunca conviertas una cifra mencionada en una noticia en un dato oficial.

Si no hay dato nuevo, se conserva el último válido y se muestra su fecha real. Un indicador
en blanco es correcto; un indicador inventado es un error grave.

Los números salen del script del radar, que los toma de fuentes oficiales. La IA redacta,
clasifica, resume y explica. La IA no produce cifras.

## Radar

Ocho indicadores: dólar oficial, dólar blue, brecha, inflación, tasa Badlar, cheques
rechazados, ventas minoristas, confianza del consumidor.

Cada uno tiene su propia frecuencia real de publicación. El dólar es diario; la inflación
y las ventas minoristas son mensuales. No busques a diario lo que se publica una vez por mes,
y no simules movimiento donde no lo hay.

Prioridad de fuentes: BCRA → INDEC → otros organismos oficiales → la institución responsable
del índice → cámaras empresariales → fuentes financieras reconocidas. Los medios periodísticos
solo como respaldo cuando la fuente primaria no sea accesible.

**Fecha del dato ≠ fecha del sitio.** El sitio puede actualizarse el 4 de septiembre y mostrar
inflación de agosto. Eso está bien y hay que mostrarlo así.

### Colores del radar

La clase de la variación es semántica, no direccional:

- `bien` (verde): ventas minoristas o confianza que suben; cheques rechazados o brecha que bajan.
- `mal` (rojo): lo inverso de lo anterior.
- `neutro` (gris): dólar, inflación y tasa. Subir o bajar no es bueno ni malo por sí solo.

## Editorial

**Panorama diario.** No es la noticia más repetida: es la de mayor impacto potencial sobre
finanzas empresariales, pymes, capital de trabajo, costos, consumo, financiamiento o
rentabilidad. Estructura: qué pasó, por qué importa, qué cambia para una empresa.

**Lo más importante.** Tres temas *distintos entre sí*. Si las tres tarjetas dicen lo mismo
con otras palabras, está mal. Buscá diversidad: mercados, actividad, financiamiento, empresas,
gestión, impuestos, consumo, costos.

**Lo último.** Titulares recientes del recorte de UMBRAL, no un feed general.

**Cómo escribir.** Español rioplatense, frases cortas, sin adjetivos de más. Titulares propios
de hasta 70 caracteres. Redactá siempre con tus palabras: nunca copies frases textuales de los
artículos. Siempre el enlace a la fuente. Sin fuente, no se publica.

Nada de relleno. Tres tarjetas buenas, o dos si no hay más. Nunca inventes para llegar al número.

## Si algo falla

Un error en el radar **no** debe impedir que se publiquen las noticias, y al revés.
Cada parte se completa con lo que tenga y deja constancia de lo que faltó.

Si no hay material suficiente para armar la portada entera, **no toques `index.html`**:
dejá publicada la de ayer y explicá en el resumen de la sesión qué pasó. Una portada de ayer
es mejor que una portada vacía o inventada.

## Contexto del lector

Dueños y directivos de pymes argentinas, con foco en Córdoba. Deciden sobre capital de trabajo,
financiamiento, stock, precios y costos. Lo que les importa: cuánto cuesta la plata, cuánto
aguanta el consumo, qué se les viene en costos y qué líneas de crédito hay abiertas.
