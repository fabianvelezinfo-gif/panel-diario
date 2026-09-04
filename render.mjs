#!/usr/bin/env node
// RENDER UMBRAL
// ------------------------------------------------------------------------
// Toma plantilla.html (el diseño, que no se toca) + data/radar.json (los
// indicadores) + data/portada.json (el contenido editorial del día) y
// escribe index.html más la copia en archivo/AAAA-MM-DD.html.
//
// No decide qué noticias publicar ni redacta nada: solo arma el HTML final
// a partir de datos ya elegidos y validados por otra parte del proceso.
// Si falta contenido editorial mínimo, no toca index.html — deja la portada
// de ayer publicada, tal como pide CLAUDE.md.
//
// Node >= 18. Sin dependencias externas.
//
// Uso normal (dentro de la routine diaria):
//   node render.mjs
//
// Uso para probar sin pisar la portada publicada:
//   node render.mjs --portada=ruta/al/portada.json --radar=ruta/al/radar.json \
//                    --out=/ruta/de/prueba.html --sin-archivo
// ------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

// Si el argumento ya es una ruta absoluta se respeta tal cual; si no, se
// resuelve contra la raíz del repo. path.join NO hace esta distinción
// (concatena un "/tmp/x" como si fuera relativo), por eso el chequeo manual.
function resolverRuta(valor, porDefecto) {
  const v = valor || porDefecto;
  return isAbsolute(v) ? v : join(__dirname, v);
}

const PLANTILLA_PATH = resolverRuta(args["plantilla"], "plantilla.html");
const RADAR_PATH = resolverRuta(args["radar"], "data/radar.json");
const PORTADA_PATH = resolverRuta(args["portada"], "data/portada.json");
const OUT_PATH = resolverRuta(args["out"], "index.html");
const ARCHIVO_DIR = resolverRuta(args["archivo-dir"], "archivo");
const SIN_ARCHIVO = Boolean(args["sin-archivo"]);

function log(msg) {
  console.log(`[RENDER] ${msg}`);
}
function logError(msg) {
  console.error(`[RENDER][ERROR] ${msg}`);
}

function leerJson(path, { requerido = true } = {}) {
  if (!existsSync(path)) {
    if (requerido) throw new Error(`No existe ${path}.`);
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// -------------------------- fecha/hora Argentina ---------------------------

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function fechaHoraTexto(d) {
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const mes = MESES[Number(partes.month) - 1];
  const hora = partes.hour === "24" ? "00" : partes.hour;
  return `${Number(partes.day)} ${mes} ${partes.year} | ${hora}:${partes.minute}`;
}

function fechaArchivoTexto(d) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }); // AAAA-MM-DD
  return fmt.format(d);
}

// ------------------------------ marcadores ---------------------------------

function reemplazarMarcador(html, nombre, contenidoNuevo) {
  const re = new RegExp(`(<!--\\s*INICIO ${nombre}\\s*-->)([\\s\\S]*?)(<!--\\s*FIN ${nombre}\\s*-->)`);
  if (!re.test(html)) throw new Error(`No se encontró el marcador ${nombre} en la plantilla.`);
  return html.replace(re, (_m, ini, _mid, fin) => `${ini}\n${contenidoNuevo}\n${fin}`);
}

function contenidoMarcador(html, nombre) {
  const re = new RegExp(`<!--\\s*INICIO ${nombre}\\s*-->([\\s\\S]*?)<!--\\s*FIN ${nombre}\\s*-->`);
  const m = re.exec(html);
  if (!m) throw new Error(`No se encontró el marcador ${nombre} en la plantilla.`);
  return m[1];
}

// ---------------------------- radar → HTML ----------------------------------

const ORDEN_RADAR = [
  "dolar_oficial",
  "dolar_blue",
  "brecha",
  "inflacion",
  "badlar",
  "cheques_rechazados",
  "ventas_minoristas",
  "confianza_consumidor",
];

// Semántica de color: no depende de si el número subió o bajó en abstracto,
// depende de qué significa cada indicador para el negocio.
const REGLA_COLOR = {
  ventas_minoristas: (signo) => (signo > 0 ? "bien" : signo < 0 ? "mal" : "neutro"),
  confianza_consumidor: (signo) => (signo > 0 ? "bien" : signo < 0 ? "mal" : "neutro"),
  cheques_rechazados: (signo) => (signo > 0 ? "mal" : signo < 0 ? "bien" : "neutro"),
  brecha: (signo) => (signo > 0 ? "mal" : signo < 0 ? "bien" : "neutro"),
  dolar_oficial: () => "neutro",
  dolar_blue: () => "neutro",
  inflacion: () => "neutro",
  badlar: () => "neutro",
};

function nf(n, decimales = 2) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
}

function formatearValor(key, ind) {
  if (ind?.valor === null || ind?.valor === undefined) return "—";
  switch (key) {
    case "dolar_oficial":
    case "dolar_blue":
      return `$${nf(ind.valor, 2)}`;
    case "brecha":
      return `${nf(ind.valor, 1)}%`;
    case "inflacion":
      return `${nf(ind.valor, 1)}%`;
    case "badlar":
      return `${nf(ind.valor, 1)}%`;
    default:
      return `${nf(ind.valor, 1)}${ind.unidad ? " " + ind.unidad : ""}`;
  }
}

function formatearVariacion(key, ind) {
  if (ind?.variacion === null || ind?.variacion === undefined) {
    return { texto: "sin dato", clase: "neutro" };
  }
  const signo = ind.variacion > 0 ? 1 : ind.variacion < 0 ? -1 : 0;
  const flecha = signo > 0 ? "▲" : signo < 0 ? "▼" : "•";
  const sufijo = key === "dolar_oficial" || key === "dolar_blue" ? "" : " p.p.";
  const prefijoMoneda = key === "dolar_oficial" || key === "dolar_blue" ? "$" : "";
  const texto = `${flecha} ${prefijoMoneda}${nf(Math.abs(ind.variacion), key === "brecha" || key === "inflacion" || key === "badlar" ? 1 : 2)}${sufijo}`;
  const clase = (REGLA_COLOR[key] || (() => "neutro"))(signo);
  return { texto, clase };
}

function extraerIconosRadar(plantillaHtml) {
  const bloque = contenidoMarcador(plantillaHtml, "RADAR");
  const items = [...bloque.matchAll(/<li class="ind">\s*<span class="ico">([\s\S]*?)<\/span>/g)].map((m) => m[1]);
  if (items.length !== ORDEN_RADAR.length) {
    throw new Error(
      `La plantilla tiene ${items.length} filas de radar y se esperaban ${ORDEN_RADAR.length}. ` +
        `Revisá que nadie haya tocado la sección RADAR de plantilla.html.`
    );
  }
  return items;
}

function armarRadarHtml(plantillaHtml, radar) {
  const iconos = extraerIconosRadar(plantillaHtml);
  const indicadores = radar?.indicadores || {};

  const filas = ORDEN_RADAR.map((key, i) => {
    const ind = indicadores[key] || {};
    const val = formatearValor(key, ind);
    const { texto: varTexto, clase: varClase } = formatearVariacion(key, ind);
    return (
      `        <li class="ind">\n` +
      `          <span class="ico">${iconos[i]}</span>\n` +
      `          <span class="nom">${escapeHtml((ind.nombre || key).toUpperCase())}</span>\n` +
      `          <span class="val">${val}</span>\n` +
      `          <span class="var ${varClase}">${varTexto}</span>\n` +
      `        </li>`
    );
  });
  return filas.join("\n");
}

// "brecha" no es una fuente independiente: es un cálculo a partir de las
// otras dos, así que no suma nada nuevo a la lista de fuentes del radar.
function fuentesRadarUnicas(indicadores) {
  return [
    ...new Set(
      ORDEN_RADAR.filter((k) => k !== "brecha")
        .map((k) => indicadores[k]?.fuente)
        .filter((f) => f && typeof f === "string" && f.length > 0)
    ),
  ];
}

function armarRadarMeta(radar) {
  const indicadores = radar?.indicadores || {};
  const fuentes = fuentesRadarUnicas(indicadores);
  const actualizado = radar?.actualizado ? fechaHoraTexto(new Date(radar.actualizado)) : "—";
  const fuentesTxt = fuentes.length > 0 ? fuentes.join(", ") : "—";
  return `        Actualizado: ${actualizado}<br>Fuente: ${fuentesTxt}`;
}

// --------------------------- portada → HTML ---------------------------------

function validarPortadaMinima(portada) {
  const errores = [];
  if (!portada || typeof portada !== "object") errores.push("data/portada.json no es un objeto válido.");
  if (!portada?.panorama?.titulo) errores.push("Falta panorama.titulo.");
  if (!portada?.panorama?.bajada) errores.push("Falta panorama.bajada.");
  if (!Array.isArray(portada?.lo_importante) || portada.lo_importante.length < 2) {
    errores.push("lo_importante necesita al menos dos tarjetas (CLAUDE.md: 'tres, o dos si no hay más').");
  }
  return errores;
}

function armarLoUltimo(items) {
  const lista = Array.isArray(items) ? items.slice(0, 3) : [];
  return lista
    .map((it) => `      <li><a href="${escapeAttr(it.url || "#")}">${escapeHtml(it.titular)}</a></li>`)
    .join("\n");
}

function armarPanorama(p) {
  return (
    `    <article class="panorama">\n` +
    `      <div class="texto">\n` +
    `        <p class="kicker">${escapeHtml(p.kicker || "PANORAMA DIARIO")}</p>\n` +
    `        <h1>${escapeHtml(p.titulo)}</h1>\n` +
    `        <p>${escapeHtml(p.bajada)}</p>\n` +
    `        <a class="boton" href="${escapeAttr(p.link || "#analisis-completo")}">LEER ANÁLISIS COMPLETO\n` +
    `          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>\n` +
    `      </div>\n` +
    `      <div class="foto"><img src="${escapeAttr(p.imagen || "portada.jpg")}" alt="" onerror="this.remove()"></div>\n` +
    `    </article>`
  );
}

function armarLoImportante(tarjetas) {
  return tarjetas
    .slice(0, 3)
    .map(
      (t) =>
        `      <article class="tarjeta">\n` +
        `        <p class="kicker">${escapeHtml(t.kicker || "")}</p>\n` +
        `        <div class="cuerpo">\n` +
        `          <div>\n` +
        `            <h3>${escapeHtml(t.titular)}</h3>\n` +
        `            <p>${escapeHtml(t.texto)}</p>\n` +
        `          </div>\n` +
        `        </div>\n` +
        `        <p class="pie">${escapeHtml(t.pie || "")}</p>\n` +
        `      </article>`
    )
    .join("\n");
}

function armarAnalisis(a) {
  if (!a) return null;
  return (
    `    <section class="destacado">\n` +
    `      <p class="kicker">${escapeHtml(a.kicker || "ANÁLISIS DESTACADO")}</p>\n` +
    `      <h3>${escapeHtml(a.titulo)}</h3>\n` +
    `      <p>${escapeHtml(a.texto)}</p>\n` +
    `      <div class="firma">\n` +
    `        <img class="av" src="${escapeAttr(a.avatar || "autor.jpg")}" alt="" onerror="this.remove()">\n` +
    `        <div><b>Por ${escapeHtml(a.autor || "Fabián Vélez")}</b><span>${escapeHtml(a.cargo || "Director editorial")}</span></div>\n` +
    `      </div>\n` +
    `    </section>`
  );
}

function armarHerramienta(h) {
  if (!h) return null; // se deja lo que ya haya en la plantilla ese día
  return (
    `    <section class="herram">\n` +
    `      <p class="kicker">HERRAMIENTA DEL DÍA</p>\n` +
    `      <h3>${escapeHtml(h.titulo)}</h3>\n` +
    `      <p>${escapeHtml(h.texto)}</p>\n` +
    `      <a class="ir" href="${escapeAttr(h.link || "#simulador")}">IR AL SIMULADOR\n` +
    `        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>\n` +
    `      <svg class="adorno" width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">\n` +
    `        <rect x="4" y="2" width="16" height="20" rx="2"/><rect x="7" y="5" width="10" height="4"/>\n` +
    `        <circle cx="8.5" cy="13" r=".9"/><circle cx="12" cy="13" r=".9"/><circle cx="15.5" cy="13" r=".9"/>\n` +
    `        <circle cx="8.5" cy="17" r=".9"/><circle cx="12" cy="17" r=".9"/><circle cx="15.5" cy="17" r=".9"/>\n` +
    `      </svg>\n` +
    `    </section>`
  );
}

function armarUltimosAnalisis(items) {
  const svgLibro =
    `<svg class="marca-libro" width="13" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">` +
    `<path d="M6 3h12v18l-6-4.5L6 21Z"/></svg>`;
  return (Array.isArray(items) ? items.slice(0, 3) : [])
    .map(
      (it) =>
        `      <div class="fila">\n` +
        `        <span class="hora">${escapeHtml(it.hora || "")}</span>\n` +
        `        <div class="cont"><span class="et">${escapeHtml((it.etiqueta || "").toUpperCase())}</span><h4>${escapeHtml(it.titular)}</h4></div>\n` +
        `        ${svgLibro}\n` +
        `      </div>`
    )
    .join("\n");
}

function armarPieFuentes(radar, portada) {
  const indicadores = radar?.indicadores || {};
  const fuentesRadar = fuentesRadarUnicas(indicadores);
  const fuentesPortada = Array.isArray(portada?.fuentes) ? portada.fuentes.map((f) => f.nombre).filter(Boolean) : [];
  const todas = [...new Set([...fuentesRadar, ...fuentesPortada])];
  return `      Fuentes consultadas en esta edición: ${todas.length > 0 ? escapeHtml(todas.join(", ")) : "—"}`;
}

// ----------------------------------- main -----------------------------------

function main() {
  const plantilla = readFileSync(PLANTILLA_PATH, "utf8");
  const radar = leerJson(RADAR_PATH, { requerido: false }) || { actualizado: null, indicadores: {} };
  const portada = leerJson(PORTADA_PATH, { requerido: true });

  const errores = validarPortadaMinima(portada);
  if (errores.length > 0) {
    for (const e of errores) logError(e);
    logError(`No se escribe ${OUT_PATH} — falta contenido editorial mínimo. Queda publicada la portada anterior.`);
    process.exitCode = 1;
    return;
  }

  let html = plantilla;
  const ahora = new Date();

  html = reemplazarMarcador(html, "FECHA-HORA", fechaHoraTexto(ahora));
  html = reemplazarMarcador(html, "LO-ULTIMO", armarLoUltimo(portada.lo_ultimo));
  html = reemplazarMarcador(html, "PANORAMA", armarPanorama(portada.panorama));
  html = reemplazarMarcador(html, "RADAR", armarRadarHtml(plantilla, radar));
  html = reemplazarMarcador(html, "RADAR-META", armarRadarMeta(radar));
  html = reemplazarMarcador(html, "LO-IMPORTANTE", armarLoImportante(portada.lo_importante));

  const analisisHtml = armarAnalisis(portada.analisis);
  if (analisisHtml) html = reemplazarMarcador(html, "ANALISIS", analisisHtml);

  const herramientaHtml = armarHerramienta(portada.herramienta);
  if (herramientaHtml) html = reemplazarMarcador(html, "HERRAMIENTA", herramientaHtml);

  html = reemplazarMarcador(html, "ULTIMOS-ANALISIS", armarUltimosAnalisis(portada.ultimos_analisis));
  html = reemplazarMarcador(html, "PIE-FUENTES", armarPieFuentes(radar, portada));

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, html, "utf8");
  log(`Escrito ${OUT_PATH}.`);

  if (!SIN_ARCHIVO) {
    const nombreArchivo = `${fechaArchivoTexto(ahora)}.html`;
    const destino = join(ARCHIVO_DIR, nombreArchivo);
    mkdirSync(ARCHIVO_DIR, { recursive: true });
    writeFileSync(destino, html, "utf8");
    log(`Escrita la copia en ${destino}.`);
  }
}

main();
