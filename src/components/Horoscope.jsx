import { useEffect, useMemo, useReducer, useState } from 'react';
import PropTypes from 'prop-types';
import useLocalStorageState from 'use-local-storage-state';
import {
  Box, Card, CardContent, CardHeader, Typography, Link,
  Stack, CircularProgress, Alert, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { fetchHoroscope, PERIODS } from '../api/horoscopeClient';
import { translateToEs } from '../api/translateClient';
import { loadHoroscope, saveHoroscope } from '../api/horoscopeCache';
import useConnectionStatus from '../hooks/useConnectionStatus';

/**
 * Convierte un string en formato ISO simple (YYYY-MM-DD) a un objeto Date.
 * - Si la cadena es nula o vacía, retorna null.
 * - Si faltan mes o día, asume enero (1) y día 1 por defecto.
 *
 * @param {string|null} s - Cadena con fecha en formato "YYYY-MM-DD".
 * @returns {Date|null} Objeto Date correspondiente o null si no se pudo parsear.
 */
const parseISODate = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/**
 * Determina el signo zodiacal a partir de una fecha.
 * - Usa los rangos de fechas convencionales del zodiaco occidental.
 * - Retorna el nombre en inglés en minúsculas (ej: "aries", "leo").
 *
 * @param {Date|null} date - Fecha de nacimiento.
 * @returns {string|null} Signo zodiacal en inglés o null si no se puede calcular.
 */
const zodiacFromDate = (date) => {
  if (!date) return null;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return 'aries';
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return 'taurus';
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return 'gemini';
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return 'cancer';
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return 'leo';
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return 'virgo';
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return 'libra';
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return 'scorpio';
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return 'sagittarius';
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return 'capricorn';
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return 'aquarius';
  if ((m === 2 && d >= 19) || (m === 3 && d <= 20)) return 'pisces';
  return null;
};

/**
 * Traduce un signo zodiacal en inglés a su representación en español.
 * - Si el signo no está en el mapa, retorna el valor original.
 *
 * @param {string} s - Signo en inglés (ej: "aries", "leo").
 * @returns {string} Nombre del signo en español o el valor original.
 */
const esSign = (s) => ({
  aries:'Aries', taurus:'Tauro', gemini:'Géminis', cancer:'Cáncer',
  leo:'Leo', virgo:'Virgo', libra:'Libra', scorpio:'Escorpio',
  sagittarius:'Sagitario', capricorn:'Capricornio', aquarius:'Acuario', pisces:'Piscis'
}[s] || s);

/**
 * Reducer para manejar el ciclo de estados en la obtención y traducción del horóscopo.
 *
 * Estados posibles en `state.status`:
 * - "idle": estado inicial, sin acciones realizadas.
 * - "loading": se está obteniendo el texto original del horóscopo.
 * - "loaded": el texto original llegó, y se está traduciendo.
 * - "error": no se pudo obtener el texto original, y no hay nada guardado.
 * - "success": hay algo que mostrar: una traducción, o el original si la
 *   traducción falló.
 *
 * Tipos de acción soportados:
 * - FETCH_START: marca el inicio de la carga del horóscopo (reinicia errores y textos).
 * - FETCH_SUCCESS: guarda el texto original y su fecha, y pasa a estado "loaded".
 * - FETCH_ERROR: registra un error de carga y pasa a estado "error".
 * - TRANSLATE_SUCCESS: guarda el texto traducido y pasa a estado "success".
 * - TRANSLATE_ERROR: registra un error de traducción, mantiene estado "success" pero sin texto traducido.
 * - CACHE_HIT: usa una traducción guardada. Con `stale: true` significa que
 *   la API no respondió y lo que se muestra es lo último que se guardó.
 */
const initialState = {
  status: 'idle', original: '', translated: '', date: null, stale: false, error: null, tError: null,
};
function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...initialState, status: 'loading' };
    case 'FETCH_SUCCESS': return { ...state, status: 'loaded', original: action.text, date: action.date };
    case 'FETCH_ERROR': return { ...state, status: 'error', error: action.error };
    case 'TRANSLATE_SUCCESS': return { ...state, status: 'success', translated: action.text };
    case 'TRANSLATE_ERROR': return { ...state, status: 'success', tError: action.error, translated: '' };
    case 'CACHE_HIT': return {
      ...state,
      status: 'success',
      original: action.entry.original,
      translated: action.entry.translated,
      date: action.entry.date,
      stale: action.stale,
    };
    default: throw new Error(`Acción no soportada: ${action.type}`);
  }
}

// Expresa la fecha que informa la API según su forma: un día, o un mes.
const monthFormat = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const formatApiDate = (s) => {
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) return monthFormat.format(parseISODate(s));
  return dayFormat.format(parseISODate(s));
};

const SUBHEADER = {
  daily: (d) => `Horóscopo del ${d}`,
  weekly: (d) => `Semana del ${d}`,
  monthly: (d) => `Mes de ${d}`,
};

export default function Horoscope({ profileTo = '/profile' }) {
  const [stored] = useLocalStorageState('WeatherApp/UserProfile', { defaultValue: null });
  const birthDate = stored?.birthDate || null;

  const sign = useMemo(() => zodiacFromDate(parseISODate(birthDate)), [birthDate]);
  const [period, setPeriod] = useState('daily');
  const [state, dispatch] = useReducer(reducer, initialState);

  // Como en useWeather: al volver la conexión el efecto se repite solo.
  const [status] = useConnectionStatus();
  const disconnected = status === 'offline';

  useEffect(() => {
    if (!sign) return;

    // Descarta respuestas atrasadas: si el usuario cambia de período con una
    // petición en vuelo, la respuesta vieja no debe pisar a la nueva.
    let current = true;

    (async () => {
      dispatch({ type: 'FETCH_START' });

      let fetched;
      try {
        fetched = await fetchHoroscope(sign, period);
      } catch (e) {
        if (!current) return;
        // Sin horóscopo nuevo, lo mejor que hay es el último guardado.
        const cached = loadHoroscope(sign, period);
        if (cached) dispatch({ type: 'CACHE_HIT', entry: cached, stale: true });
        else dispatch({ type: 'FETCH_ERROR', error: e?.message || 'fetch-failed' });
        return;
      }
      if (!current) return;

      const { text, date } = fetched;

      // Si ya tradujimos este mismo texto, no volvemos a pagar por traducirlo.
      const cached = loadHoroscope(sign, period);
      if (cached && cached.date === date && cached.original === text) {
        dispatch({ type: 'CACHE_HIT', entry: cached, stale: false });
        return;
      }

      dispatch({ type: 'FETCH_SUCCESS', text, date });

      try {
        const translated = await translateToEs(text);
        if (!current) return;
        saveHoroscope(sign, period, { date, original: text, translated });
        dispatch({ type: 'TRANSLATE_SUCCESS', text: translated });
      } catch (e) {
        if (!current) return;
        dispatch({ type: 'TRANSLATE_ERROR', error: e?.message || 'translate-failed' });
      }
    })();

    return () => { current = false; };
  }, [sign, period, disconnected]);

  // Sin fecha de nacimiento no hay signo que consultar.
  if (!birthDate) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Fecha de nacimiento no definida.{' '}
          <Link component={RouterLink} to={profileTo}>
            Ir al perfil
          </Link>
        </Typography>
      </Box>
    );
  }

  const busy = state.status === 'loading' || state.status === 'loaded';

  return (
    <Box sx={{ p: 2 }}>
      <Card elevation={2} sx={{ maxWidth: 640, mx: 'auto' }}>
        <CardHeader
          title={`Horóscopo de ${esSign(sign)}`}
          subheader={state.date ? SUBHEADER[period](formatApiDate(state.date)) : PERIODS[period]}
          sx={{ pb: 0.5 }}
        />
        <CardContent>
          <Stack spacing={2}>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="primary"
              value={period}
              // Con `exclusive`, volver a pulsar el botón activo entrega null.
              // Lo ignoramos para que siempre haya un período elegido.
              onChange={(_, value) => { if (value) setPeriod(value); }}
              aria-label="Período del horóscopo"
            >
              {Object.entries(PERIODS).map(([value, label]) => (
                <ToggleButton key={value} value={value}>{label}</ToggleButton>
              ))}
            </ToggleButtonGroup>

            {busy && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={20} />
                <Typography variant="body2">Obteniendo horóscopo…</Typography>
              </Stack>
            )}

            {state.status === 'error' && (
              <Alert severity="error">No se pudo obtener el horóscopo.</Alert>
            )}

            {state.status === 'success' && state.stale && (
              <Alert severity="info">
                No fue posible consultar el horóscopo. Se muestra el último guardado.
              </Alert>
            )}

            {state.status === 'success' && state.translated && (
              <Typography variant="body1">{state.translated}</Typography>
            )}

            {/* Error de traducción: mostramos el original, que algo es algo */}
            {state.status === 'success' && !state.translated && (
              <>
                <Alert severity="warning">No se pudo traducir el horóscopo. Se muestra en inglés.</Alert>
                <Typography variant="body2" color="text.secondary">
                  {state.original}
                </Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

Horoscope.propTypes = {
  profileTo: PropTypes.string,
};
