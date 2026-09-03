# Reglas de este sitio

Sitio de una página que se regenera todos los días. Lo publica GitHub Pages desde la rama `main`.

## Qué hay en el repo

- `index.html` — la portada de hoy. Se reescribe entera en cada corrida.
- `plantilla.html` — la estructura y el diseño. **No la modifiques**: copiala y rellenala.
- `archivo/AAAA-MM-DD.html` — una copia de cada portada, para poder mirar atrás.
- `datos.json` — el contenido del día en crudo, por si más adelante lo consume otra cosa.

## Cómo se arma la portada

1. Leé `plantilla.html` y respetá su estructura, sus clases CSS y su tipografía al pie de la letra.
2. Reemplazá solo el contenido entre los marcadores `<!-- INICIO ... -->` y `<!-- FIN ... -->`.
3. Escribí `index.html` y la copia en `archivo/`.
4. Actualizá `datos.json` con los mismos datos.
5. Hacé commit directo a `main` con el mensaje `Portada del AAAA-MM-DD`.

Nunca cambies el CSS ni el diseño por tu cuenta. Si algo no entra, acortá el texto.

## Cómo escribir

- Español rioplatense, frases cortas, sin adjetivos de más.
- Cada bloque: un titular propio de hasta 70 caracteres, dos o tres frases de explicación,
  y una frase sobre por qué le importa a este negocio.
- **Redactá todo con tus palabras.** Nunca copies frases textuales de los artículos.
- Siempre el enlace a la fuente original. Si no tenés fuente, no publiques el bloque.
- Si un dato no lo pudiste verificar, decilo en el texto en vez de darlo por cierto.
- Nada de relleno: seis bloques buenos, o cuatro si no hay más. Nunca inventes para llegar al número.

## Semáforo

Cada bloque lleva una señal según qué significa para el negocio:
`verde` favorable · `amarillo` neutro o para seguir de cerca · `rojo` preocupante.

## Contexto del negocio

Comercio minorista en Córdoba, Argentina. Nueva sucursal en Villa Carlos Paz.
Lo que más pesa: tipo de cambio, inflación y precios de consumo masivo, costos laborales,
actividad del comercio minorista, y todo lo que mueva el turismo en Carlos Paz.

## Si algo sale mal

Si no conseguís información suficiente para armar la portada, **no toques `index.html`**:
dejá publicada la de ayer y explicá en el resumen de la sesión qué pasó.
Una portada vieja es mejor que una portada vacía o inventada.
