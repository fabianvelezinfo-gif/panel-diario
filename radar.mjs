#!/usr/bin/env node
// RADAR UMBRAL
// ------------------------------------------------------------------------
// Consulta fuentes oficiales, valida lo que devuelven y escribe
// data/radar.json (últimos valores) y data/historico_radar.json (serie).
//
// Regla de base: los números salen de acá, no de un modelo de lenguaje.
// Si una fuente falla o el dato parece raro, este script NO inventa nada:
// deja el valor anterior tal cual, marca "requiere_revision" y lo escribe
// en el log. Un indicador vacío es correcto. Un indicador inventado no.
//
// Node >= 18 (usa fetch nativo). Sin dependencias externas.
// Uso: node radar.mjs   (se corre parado en la raíz del repo)
//
// Variables de entorno opcionales (para cambiar de endpoint o testear):
//   BCRA_MONETARIAS_BASE    default https://api.bcra.gob.ar/estadisticas/v4.0/monetarias
//   DATOS_GOB_SERIES_BASE   default https://apis.datos.gob.ar/series/api/series
//   BLUELYTICS_BASE         default https://api.bluelytics.com.ar/v2/latest
//   RADAR_FETCH_TIMEOUT_MS  default 15000
//
// Probado en vivo el 2026-09-04 contra las cuatro fuentes reales (ver aviso
// de la corrida): dólar oficial y BADLAR salen de la misma API de BCRA
// (Estadísticas Monetarias v4.0 — la v3.0 está deprecada, HTTP 410), el
// dólar blue de Bluelytics, y la inflación del índice de IPC de INDEC
// publicado en datos.gob.ar, del que se derivan mensual/interanual/
// acumulada acá mismo (esa serie es el índice, no el porcentaje ya hecho).
//
// Dominios que la routine tiene que dejar pasar (entorno en Full, o Custom
// con esta lista) para que el radar traiga datos de verdad:
//   api.bcra.gob.ar
//   apis.datos.gob.ar
//   api.bluelytics.com.ar
//
// Cheques rechazados, ventas minoristas y confianza del consumidor NO
// tienen todavía una fuente automatizable confirmada (ver más abajo, en
// FETCHERS_PENDIENTES) — quedan sin dato a propósito, no simulados.
// ------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RADAR_PATH = join(__dirname, "data", "radar.json");
const HIST_PATH = join(__dirname, "data", "historico_radar.json");

const BCRA_MONETARIAS_BASE =
  process.env.BCRA_MONETARIAS_BASE || "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const DATOS_GOB_SERIES_BASE =
  process.env.DATOS_GOB_SERIES_BASE || "https://apis.datos.gob.ar/series/api/series";
const BLUELYTICS_BASE =
  process.env.BLUELYTICS_BASE || "https://api.bluelytics.com.ar/v2/latest";
const FETCH_TIMEOUT_MS = Number(process.env.RADAR_FETCH_TIMEOUT_MS || 15000);

// Serie de INDEC en el catálogo de series de tiempo de datos.gob.ar, confirmada
// en vivo el 2026-09-04: "IPC. Nivel General Nacional. Base dic 2016. Mensual."
// (dataset 145, campo 148.3_INIVELNAL_DICI_M_26, fuente declarada INDEC).
// Es el ÍNDICE (base dic-2016=100), no el porcentaje ya calculado — mensual,
// interanual y acumulada se derivan de esta misma serie más abajo. El guard
// de contenido igual queda: si el id cambiara de significado, corta el dato
// en vez de publicar algo mal atribuido.
const SERIE_IPC_NIVEL_GENERAL_MENSUAL = "148.3_INIVELNAL_DICI_M_26";

// ------------------------------- utilidades -------------------------------

function log(msg) {
  console.log(`[RADAR] ${msg}`);
}
function logError(msg) {
  console.error(`[RADAR][ERROR] ${msg}`);
}

function readJsonSafe(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    logError(`No se pudo leer ${path} (${err.message}) — se usa el valor por defecto.`);
    return fallback;
  }
}

function writeJsonPretty(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function fetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function nowIsoArgentina() {
  // Guardamos el instante real en ISO 8601 con offset; quien lea el archivo
  // puede formatearlo como quiera. -03:00 es el offset de Argentina todo el año.
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const diffMs = now.getTime() - local.getTime();
  const withOffset = new Date(now.getTime() - diffMs);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${withOffset.getFullYear()}-${pad(withOffset.getMonth() + 1)}-${pad(withOffset.getDate())}T` +
    `${pad(withOffset.getHours())}:${pad(withOffset.getMinutes())}:${pad(withOffset.getSeconds())}-03:00`
  );
}

function plantillaIndicador(nombre, unidad, frecuencia) {
  return {
    nombre,
    valor: null,
    unidad,
    periodo: "",
    fecha_dato: "",
    valor_anterior: null,
    variacion: null,
    fuente: "",
    url_fuente: "",
    consultado: "",
    frecuencia,
    requiere_revision: false,
  };
}

// ------------------------------- fetchers ---------------------------------
// Cada fetcher devuelve { valor, unidad, periodo, fecha_dato, fuente, url_fuente, extra? }
// o tira una excepción con un mensaje explicando qué falló.

// El catálogo de BCRA Monetarias v4.0 trae ~1600 variables, cada una con su
// ÚLTIMO valor informado (ultValorInformado/ultFechaInformada) — alcanza con
// un solo pedido para dólar oficial minorista y BADLAR, así que se pide una
// sola vez por corrida y se comparte entre los dos fetchers.
let catalogoMonetariasPromise = null;
function obtenerCatalogoMonetarias() {
  if (!catalogoMonetariasPromise) {
    catalogoMonetariasPromise = fetchJson(`${BCRA_MONETARIAS_BASE}?limit=3000`).then((json) => {
      if (!Array.isArray(json?.results)) throw new Error("La respuesta de BCRA Monetarias no tiene 'results'.");
      return json.results;
    });
  }
  return catalogoMonetariasPromise;
}

async function fetchDolarOficial() {
  const catalogo = await obtenerCatalogoMonetarias();
  const candidatos = catalogo.filter((r) => {
    const d = String(r.descripcion || "").toLowerCase();
    return d.includes("tipo de cambio") && d.includes("minorista");
  });
  if (candidatos.length === 0) {
    throw new Error("No se encontró 'tipo de cambio minorista' en el catálogo de BCRA Monetarias.");
  }
  const elegido = candidatos.find((r) => r.categoria === "Principales Variables") || candidatos[0];
  const valor = Number(elegido.ultValorInformado);
  if (!isFiniteNumber(valor)) throw new Error("El dólar oficial minorista no vino con un valor numérico.");

  return {
    valor,
    unidad: "ARS",
    periodo: elegido.ultFechaInformada,
    fecha_dato: elegido.ultFechaInformada,
    fuente: "BCRA",
    url_fuente: BCRA_MONETARIAS_BASE,
    extra: { descripcion_original: elegido.descripcion },
  };
}

async function fetchDolarBlue() {
  const json = await fetchJson(BLUELYTICS_BASE);
  const venta = Number(json?.blue?.value_sell);
  const compra = Number(json?.blue?.value_buy);
  if (!isFiniteNumber(venta)) throw new Error("Bluelytics no trajo un valor de venta numérico para el blue.");
  const fecha = (json?.last_update || "").slice(0, 10) || isoDate(new Date());

  return {
    valor: venta,
    unidad: "ARS",
    periodo: fecha,
    fecha_dato: fecha,
    fuente: "Bluelytics",
    url_fuente: "https://api.bluelytics.com.ar/v2/latest",
    extra: { compra: isFiniteNumber(compra) ? compra : null, venta },
  };
}

async function fetchBadlar() {
  const catalogo = await obtenerCatalogoMonetarias();
  // Hay varias variables con "BADLAR" en la descripción (privados/públicos,
  // TNA/TEA, más los "márgenes sobre BADLAR" que no son la tasa en sí).
  // Nos quedamos con BADLAR de bancos privados, se descartan los márgenes,
  // y entre lo que queda se prefiere la variable "Principal" en TNA.
  const candidatos = catalogo.filter((r) => {
    const d = String(r.descripcion || "").toLowerCase();
    return d.includes("badlar") && d.includes("privados") && !d.includes("margen");
  });
  if (candidatos.length === 0) {
    throw new Error("No se encontró 'BADLAR ... privados' en el catálogo de BCRA Monetarias.");
  }
  const elegido =
    candidatos.find(
      (r) => r.categoria === "Principales Variables" && String(r.unidadExpresion || "").toLowerCase().includes("nominal anual")
    ) ||
    candidatos.find((r) => r.categoria === "Principales Variables") ||
    candidatos[0];

  const valor = Number(elegido.ultValorInformado);
  if (!isFiniteNumber(valor)) throw new Error("El valor de BADLAR devuelto no es numérico.");

  return {
    valor,
    unidad: "% TNA",
    periodo: elegido.ultFechaInformada,
    fecha_dato: elegido.ultFechaInformada,
    fuente: "BCRA",
    url_fuente: BCRA_MONETARIAS_BASE,
    extra: { descripcion_original: elegido.descripcion, unidad_original: elegido.unidadExpresion },
  };
}

async function fetchInflacionMensual() {
  // Se pide serie desc con 24 meses: alcanza para variación mensual (t vs t-1),
  // interanual (t vs t-12) y acumulada del año (t vs diciembre del año anterior),
  // sea cual sea el mes actual.
  const url = `${DATOS_GOB_SERIES_BASE}/?ids=${SERIE_IPC_NIVEL_GENERAL_MENSUAL}&limit=24&sort=desc&metadata=full`;
  const json = await fetchJson(url);

  // Guarda de identidad: valida que la respuesta sea realmente sobre el IPC
  // antes de aceptar el número, en vez de confiar a ciegas en el id de serie.
  const crudo = JSON.stringify(json).toLowerCase();
  if (!crudo.includes("precios al consumidor")) {
    throw new Error(
      "La respuesta de datos.gob.ar no menciona el IPC — el id de serie puede haber cambiado. No se publica el dato."
    );
  }

  const filas = Array.isArray(json?.data) ? json.data : [];
  if (filas.length < 2) throw new Error("La serie de IPC no trajo suficientes puntos para calcular la variación.");

  const [fechaActual, indiceActualRaw] = filas[0];
  const indiceActual = Number(indiceActualRaw);
  const indiceAnterior = Number(filas[1][1]);
  if (!isFiniteNumber(indiceActual) || !isFiniteNumber(indiceAnterior)) {
    throw new Error("El índice de IPC no vino con valores numéricos en los últimos dos puntos.");
  }

  const mensual = ((indiceActual / indiceAnterior) - 1) * 100;

  const filaInteranual = filas[12];
  const interanual =
    filaInteranual && isFiniteNumber(Number(filaInteranual[1]))
      ? ((indiceActual / Number(filaInteranual[1])) - 1) * 100
      : null;

  const anioActual = Number(String(fechaActual).slice(0, 4));
  const filaDicAnterior = filas.find((f) => String(f[0]).startsWith(`${anioActual - 1}-12`));
  const acumulada =
    filaDicAnterior && isFiniteNumber(Number(filaDicAnterior[1]))
      ? ((indiceActual / Number(filaDicAnterior[1])) - 1) * 100
      : null;

  const fecha = String(fechaActual).slice(0, 10);
  const periodo = fecha.slice(0, 7); // AAAA-MM

  return {
    valor: Number(mensual.toFixed(2)),
    unidad: "%",
    periodo,
    fecha_dato: fecha,
    fuente: "INDEC (vía datos.gob.ar, Subsecretaría de Programación Macroeconómica)",
    url_fuente: `https://apis.datos.gob.ar/series/api/series/?ids=${SERIE_IPC_NIVEL_GENERAL_MENSUAL}`,
    extra: {
      tipo: "mensual",
      interanual: interanual !== null ? Number(interanual.toFixed(2)) : null,
      acumulada: acumulada !== null ? Number(acumulada.toFixed(2)) : null,
      indice_nivel_general: indiceActual,
    },
  };
}

// Indicadores sin fuente automatizable confirmada todavía. No se scrapea
// HTML ni se arma un número a partir de una noticia: se deja constancia de
// por qué no hay dato, tal como pide la regla de "vacío y bien señalizado
// antes que una fuente frágil".
const FETCHERS_PENDIENTES = {
  cheques_rechazados:
    "BCRA no publica una API pública con la serie agregada de cheques rechazados (su API de " +
    "'Cheques' es para consultar un cheque puntual, no un total por período). El dato oficial sale " +
    "del Informe sobre Bancos en PDF — no se arma un scraper de PDF para esto sin confirmarlo antes.",
  ventas_minoristas:
    "CAME no publica una API pública para su índice de ventas minoristas pyme; el reporte sale como " +
    "PDF/nota de prensa. Si preferís usar la Encuesta de Supermercados de INDEC en su lugar, avisame " +
    "explícitamente — no se cambia la fuente en silencio.",
  confianza_consumidor:
    "El ICC de la Universidad Di Tella se publica como planilla/PDF, sin API pública confirmada.",
};

// ------------------------------- orquestación ------------------------------

async function actualizarIndicador({ key, nombre, unidad, frecuencia, previo, fetcher, anomalia }) {
  // nombre/unidad/frecuencia son configuración del código de hoy: si el
  // JSON guardado trae otros valores (por un cambio de texto en una corrida
  // anterior), no deben pisar lo que el código dice ahora. Solo los DATOS
  // (valor, fecha, fuente, etc.) vienen del archivo previo.
  const previoValido = previo && typeof previo === "object" ? previo : plantillaIndicador(nombre, unidad, frecuencia);
  const base = { ...previoValido, nombre, unidad, frecuencia };
  const consultado = nowIsoArgentina();

  let candidato;
  try {
    candidato = await fetcher();
  } catch (err) {
    logError(`${nombre}: ${err.message} — se conserva el último valor válido.`);
    return { ...base, consultado };
  }

  if (!isFiniteNumber(candidato.valor) || !candidato.fuente || !(candidato.periodo || candidato.fecha_dato)) {
    logError(`${nombre}: la respuesta no pasó la validación mínima (valor/fuente/fecha) — se conserva el anterior.`);
    return { ...base, consultado };
  }

  const esMismoPeriodo =
    base.fecha_dato && candidato.fecha_dato && base.fecha_dato === candidato.fecha_dato;

  if (esMismoPeriodo) {
    log(`${nombre} sin período nuevo — se conserva ${base.periodo || base.fecha_dato}.`);
    return { ...base, consultado, unidad: candidato.unidad || base.unidad, ...candidato.extra };
  }

  const anterior = isFiniteNumber(base.valor) ? base.valor : null;
  if (anomalia && anterior !== null && anomalia(candidato.valor, anterior)) {
    logError(
      `${nombre}: el valor nuevo (${candidato.valor}) se aleja demasiado del anterior (${anterior}) — ` +
        `no se publica, queda requiere_revision.`
    );
    return { ...base, consultado, requiere_revision: true };
  }

  const variacion = anterior !== null ? Number((candidato.valor - anterior).toFixed(4)) : null;

  log(
    `${nombre} actualizado — ${candidato.valor} ${candidato.unidad || unidad} (${candidato.fuente}, ${candidato.fecha_dato})`
  );

  return {
    nombre,
    valor: candidato.valor,
    unidad: candidato.unidad || unidad,
    periodo: candidato.periodo || candidato.fecha_dato,
    fecha_dato: candidato.fecha_dato,
    valor_anterior: anterior,
    variacion,
    fuente: candidato.fuente,
    url_fuente: candidato.url_fuente,
    consultado,
    frecuencia,
    requiere_revision: false,
    ...(candidato.extra || {}),
  };
}

function actualizarPendiente(key, previo, nombre, unidad, frecuencia) {
  const previoValido = previo && typeof previo === "object" ? previo : plantillaIndicador(nombre, unidad, frecuencia);
  const base = { ...previoValido, nombre, unidad, frecuencia };
  logError(`${nombre}: ${FETCHERS_PENDIENTES[key]}`);
  return { ...base, consultado: nowIsoArgentina(), nota: FETCHERS_PENDIENTES[key] };
}

function calcularBrecha(dolarOficial, dolarBlue, previo) {
  const nombre = "Brecha cambiaria (blue vs. oficial)";
  const unidad = "%";
  const previoValido = previo && typeof previo === "object" ? previo : plantillaIndicador(nombre, unidad, "diaria");
  const base = { ...previoValido, nombre, unidad, frecuencia: "diaria" };
  const consultado = nowIsoArgentina();

  const oficial = dolarOficial?.valor;
  const blue = dolarBlue?.valor;
  if (!isFiniteNumber(oficial) || !isFiniteNumber(blue) || oficial <= 0) {
    logError("Brecha cambiaria: falta dólar oficial o blue válidos hoy — se conserva la anterior.");
    return { ...base, consultado };
  }

  const valor = Number((((blue - oficial) / oficial) * 100).toFixed(2));
  const fecha_dato = dolarBlue.fecha_dato && dolarOficial.fecha_dato
    ? [dolarOficial.fecha_dato, dolarBlue.fecha_dato].sort().pop() // la más reciente de las dos
    : dolarBlue.fecha_dato || dolarOficial.fecha_dato;

  if (base.fecha_dato === fecha_dato && isFiniteNumber(base.valor)) {
    log("Brecha cambiaria sin cambios respecto de la última corrida.");
    return { ...base, consultado };
  }

  if (isFiniteNumber(base.valor) && (valor < -20 || valor > 300)) {
    logError(`Brecha cambiaria: ${valor}% está fuera de rango esperado — no se publica, queda requiere_revision.`);
    return { ...base, consultado, requiere_revision: true };
  }

  const anterior = isFiniteNumber(base.valor) ? base.valor : null;
  log(`Brecha cambiaria actualizada — ${valor}% (oficial ${oficial} vs. blue ${blue}).`);

  return {
    nombre,
    valor,
    unidad,
    periodo: fecha_dato,
    fecha_dato,
    valor_anterior: anterior,
    variacion: anterior !== null ? Number((valor - anterior).toFixed(2)) : null,
    fuente: "Calculado a partir de BCRA (oficial) y Bluelytics (blue)",
    url_fuente: "",
    consultado,
    frecuencia: "diaria",
    requiere_revision: false,
    valor_dolar_oficial_usado: oficial,
    valor_dolar_blue_usado: blue,
  };
}

function claveHistorico(key, ind) {
  return `${key}::${ind.periodo || ind.fecha_dato || ""}`;
}

function agregarHistorico(historico, indicadores) {
  const existentes = new Set(historico.map((h) => `${h.indicador}::${h.periodo || h.fecha_dato || ""}`));
  const agregados = [...historico];

  for (const [key, ind] of Object.entries(indicadores)) {
    if (!ind || !isFiniteNumber(ind.valor) || !(ind.periodo || ind.fecha_dato)) continue;
    const clave = claveHistorico(key, ind);
    if (existentes.has(clave)) continue;
    existentes.add(clave);
    agregados.push({
      indicador: key,
      nombre: ind.nombre,
      valor: ind.valor,
      unidad: ind.unidad,
      periodo: ind.periodo,
      fecha_dato: ind.fecha_dato,
      fuente: ind.fuente,
      url_fuente: ind.url_fuente,
      consultado: ind.consultado,
    });
  }
  return agregados;
}

async function main() {
  const prev = readJsonSafe(RADAR_PATH, { actualizado: null, indicadores: {} });
  const historico = readJsonSafe(HIST_PATH, []);
  const prevInd = prev.indicadores || {};

  const indicadores = {};

  indicadores.dolar_oficial = await actualizarIndicador({
    key: "dolar_oficial",
    nombre: "Dólar oficial (minorista, promedio vendedor — BCRA)",
    unidad: "ARS",
    frecuencia: "diaria",
    previo: prevInd.dolar_oficial,
    fetcher: fetchDolarOficial,
    anomalia: (nuevo, anterior) => Math.abs(nuevo - anterior) / anterior > 0.15,
  });

  indicadores.dolar_blue = await actualizarIndicador({
    key: "dolar_blue",
    nombre: "Dólar blue (venta)",
    unidad: "ARS",
    frecuencia: "diaria",
    previo: prevInd.dolar_blue,
    fetcher: fetchDolarBlue,
    anomalia: (nuevo, anterior) => Math.abs(nuevo - anterior) / anterior > 0.15,
  });

  indicadores.brecha = calcularBrecha(indicadores.dolar_oficial, indicadores.dolar_blue, prevInd.brecha);

  indicadores.inflacion = await actualizarIndicador({
    key: "inflacion",
    nombre: "Inflación mensual (IPC nivel general)",
    unidad: "%",
    frecuencia: "mensual",
    previo: prevInd.inflacion,
    fetcher: fetchInflacionMensual,
    anomalia: (nuevo) => nuevo < -2 || nuevo > 30,
  });

  indicadores.badlar = await actualizarIndicador({
    key: "badlar",
    nombre: "Tasa BADLAR (bancos privados)",
    unidad: "% TNA",
    frecuencia: "diaria / según disponibilidad",
    previo: prevInd.badlar,
    fetcher: fetchBadlar,
    anomalia: (nuevo, anterior) => Math.abs(nuevo - anterior) / anterior > 0.2,
  });

  indicadores.cheques_rechazados = actualizarPendiente(
    "cheques_rechazados",
    prevInd.cheques_rechazados,
    "Cheques rechazados",
    "%",
    "según publicación oficial"
  );
  indicadores.ventas_minoristas = actualizarPendiente(
    "ventas_minoristas",
    prevInd.ventas_minoristas,
    "Ventas minoristas (CAME)",
    "% i.a.",
    "mensual"
  );
  indicadores.confianza_consumidor = actualizarPendiente(
    "confianza_consumidor",
    prevInd.confianza_consumidor,
    "Confianza del consumidor (ICC-UTDT)",
    "índice",
    "mensual"
  );

  const nuevoRadar = { actualizado: nowIsoArgentina(), indicadores };
  const nuevoHistorico = agregarHistorico(historico, indicadores);

  writeJsonPretty(RADAR_PATH, nuevoRadar);
  writeJsonPretty(HIST_PATH, nuevoHistorico);

  log(`Listo. data/radar.json actualizado, data/historico_radar.json con ${nuevoHistorico.length} registros.`);
}

main().catch((err) => {
  logError(`Fallo no controlado del radar: ${err.stack || err.message}`);
  process.exitCode = 1;
});
