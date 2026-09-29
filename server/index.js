/*
 * Backend de la Weather App.
 *
 * Es una fachada: el frontend le pide datos a estos endpoints, y el servidor
 * los reenvía a las APIs de Google y a la de horóscopo agregando las API keys,
 * que nunca salen de aquí.
 *
 * Las keys se leen de variables de entorno. `yarn dev` lanza este archivo con
 * `node --env-file=.env`, que carga el archivo .env antes de ejecutar el código
 * (ver .env.example). No hace falta instalar dotenv: Node lo trae incorporado
 * desde la versión 20, igual que fetch.
 */
import express from 'express';
import cors from 'cors';

const PORT = 5174;

const app = express();
app.use(express.json());

// CORS. Mientras desarrollamos, el navegador no le habla directamente a este
// servidor sino al proxy de Vite (ver vite.config.js), pero las peticiones POST
// llevan igual el encabezado Origin de la página. Por eso la lista incluye los
// dos puertos de Vite: 5173 para `yarn dev` y 4173 para `yarn preview`.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://tu-dominio.com',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
}));

// ===== util común =====
const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const TRANSLATE_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
if (!GOOGLE_KEY) console.warn('[WARN] Falta GOOGLE_GEOCODING_API_KEY en .env');
if (!TRANSLATE_KEY) console.warn('[WARN] Falta GOOGLE_TRANSLATE_API_KEY en .env');

// Oculta la key al escribir una URL en el log.
const maskUrl = (url) => url.replace(/([?&]key=)[^&]+/, '$1***');

// fetch con tiempo máximo de espera. Devuelve el cuerpo ya interpretado como
// JSON cuando se puede, y como texto siempre, para poder registrar respuestas
// que no son JSON (una página de error, por ejemplo).
async function fetchJsonWithTimeout(url, { timeoutMs = 10000, ...init } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* no era JSON */ }
    return { ok: r.ok, status: r.status, json, text };
  } finally {
    clearTimeout(id);
  }
}

// Llama al Geocoding API de Google y reduce la respuesta a lo que usa el
// frontend. `params` lleva `latlng` (reverse) o `address` (forward).
async function geocode(tag, params, res) {
  if (!GOOGLE_KEY) return res.status(500).json({ error: 'Missing GOOGLE_GEOCODING_API_KEY' });

  const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', GOOGLE_KEY);

  try {
    const { ok, status, json } = await fetchJsonWithTimeout(u.toString(), {
      headers: { 'user-agent': 'WeatherApp-Server/1.0' },
    });

    console.log(`[${tag}]`, status, json?.status, maskUrl(u.toString()));

    if (!ok) {
      return res.status(502).json({
        error: 'google-http',
        httpStatus: status,
        url: maskUrl(u.toString()),
      });
    }

    // ZERO_RESULTS no es una falla: la consulta funcionó y no hubo nada que
    // devolver (coordenadas en medio del mar, una dirección inexistente). El
    // frontend lo distingue porque `formatted` viene en null.
    if (json?.status === 'ZERO_RESULTS') {
      return res.json({ status: json.status, formatted: null });
    }

    // Cualquier otro estado distinto de OK sí es un problema, y casi siempre
    // de configuración: REQUEST_DENIED significa que la key no existe, no tiene
    // habilitado el Geocoding API, o el proyecto no tiene facturación activa.
    if (json?.status !== 'OK') {
      return res.status(502).json({
        error: 'google-status',
        googleStatus: json?.status,
        errorMessage: json?.error_message,
        url: maskUrl(u.toString()),
      });
    }

    const best = json.results[0];
    const loc = best.geometry?.location || {};
    return res.json({
      status: json.status,
      formatted: best.formatted_address,
      placeId: best.place_id,
      lat: typeof loc.lat === 'number' ? loc.lat : null,
      lng: typeof loc.lng === 'number' ? loc.lng : null,
      types: best.types,
      components: best.address_components,
    });
  } catch (err) {
    console.error(`[${tag}] fetch failed:`, err?.name, err?.message);
    return res.status(502).json({
      error: 'geocode-proxy-failed',
      message: err?.name === 'AbortError' ? 'timeout' : 'network',
    });
  }
}

// ===== Reverse: coordenadas → dirección =====
app.get('/api/geocode/reverse', (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const language = (req.query.lang || 'es').toString();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'invalid lat/lng' });
  }

  return geocode('rev', { latlng: `${lat},${lng}`, language }, res);
});

// ===== Forward: dirección → coordenadas =====
app.get('/api/geocode/forward', (req, res) => {
  const address = (req.query.address || '').toString().trim();
  const language = (req.query.lang || 'es').toString();

  if (!address) return res.status(400).json({ error: 'address required' });

  return geocode('fwd', { address, language }, res);
});

// ===== Horóscopo =====
// Lista blanca de signos: el servidor no reenvía cualquier cosa que le llegue.
const SIGNS = new Set([
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra',
  'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]);

// Lista blanca de períodos, con la misma lógica que la de signos.
const PERIODS = new Set(['daily', 'weekly', 'monthly']);

app.get('/api/horoscope', async (req, res) => {
  const sign = String(req.query.sign || '').toLowerCase();
  const period = String(req.query.period || 'daily').toLowerCase();
  if (!SIGNS.has(sign)) return res.status(400).json({ error: 'invalid sign' });
  if (!PERIODS.has(period)) return res.status(400).json({ error: 'invalid period' });

  const u = new URL(`https://freehoroscopeapi.com/api/v1/get-horoscope/${period}`);
  u.searchParams.set('sign', sign);

  try {
    const { status, json } = await fetchJsonWithTimeout(u.toString(), {
      headers: { 'user-agent': 'WeatherApp-Server/1.0' },
    });
    console.log('[horoscope]', status, u.toString());
    if (!json) return res.status(502).json({ error: 'horoscope-bad-response' });
    return res.status(status).json(json);
  } catch (err) {
    console.error('[horoscope] fetch failed:', err?.name, err?.message);
    return res.status(502).json({ error: 'horoscope-proxy-failed' });
  }
});

// ===== Google Translate =====
app.post('/api/translate', async (req, res) => {
  if (!TRANSLATE_KEY) return res.status(500).json({ error: 'Missing GOOGLE_TRANSLATE_API_KEY' });

  const { q, target = 'es', source } = req.body || {};
  if (!q) return res.status(400).json({ error: 'q required' });

  const u = new URL('https://translation.googleapis.com/language/translate/v2');
  u.searchParams.set('key', TRANSLATE_KEY);

  try {
    const { status, json } = await fetchJsonWithTimeout(u.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, target, format: 'text', ...(source ? { source } : {}) }),
    });
    console.log('[translate]', status, maskUrl(u.toString()));
    return res.status(status).json(json);
  } catch (err) {
    console.error('[translate] fetch failed:', err?.name, err?.message);
    return res.status(502).json({ error: 'translate-proxy-failed' });
  }
});

app.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`));
