// TODO: esta línea silencia al linter mientras el componente esté a medio
// escribir, porque los imports todavía no se usan. Bórrala al terminar el
// ejercicio y ejecuta `yarn lint`: no debería quedar ninguna advertencia.
/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useReducer } from 'react';
import PropTypes from 'prop-types';
import useLocalStorageState from 'use-local-storage-state';
import {
  Box, Card, CardContent, CardHeader, Typography, Link,
  Stack, CircularProgress, Alert
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { fetchHoroscope } from '../api/horoscopeClient';
import { translateToEs } from '../api/translateClient';

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
 * - "error": ocurrió un error al obtener el texto original.
 * - "success": se intentó traducir (con éxito o con error).
 *
 * Tipos de acción soportados:
 * - FETCH_START: marca el inicio de la carga del horóscopo (reinicia errores y textos).
 * - FETCH_SUCCESS: guarda el texto original obtenido y pasa a estado "loaded".
 * - FETCH_ERROR: registra un error de carga y pasa a estado "error".
 * - TRANSLATE_SUCCESS: guarda el texto traducido y pasa a estado "success".
 * - TRANSLATE_ERROR: registra un error de traducción, mantiene estado "success" pero sin texto traducido.
 *
 * El signo no forma parte de este estado: se calcula en cada render a partir
 * de la fecha de nacimiento guardada, y copiarlo aquí solo crearía una segunda
 * versión del mismo dato que habría que mantener sincronizada.
 *
 * @param {object} state - Estado actual.
 * @param {{type: string, text?: string, error?: any}} action - Acción despachada.
 * @returns {object} Nuevo estado actualizado según la acción.
 */
const initialState = { status: 'idle', original: '', translated: '', error: null, tError: null };
function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, status: 'loading', error: null, tError: null, original: '', translated: '' };
    case 'FETCH_SUCCESS': return { ...state, status: 'loaded', original: action.text };
    case 'FETCH_ERROR': return { ...state, status: 'error', error: action.error };
    case 'TRANSLATE_SUCCESS': return { ...state, status: 'success', translated: action.text };
    case 'TRANSLATE_ERROR': return { ...state, status: 'success', tError: action.error, translated: '' };
    default: throw new Error(`Acción no soportada: ${action.type}`);
  }
}

export default function Horoscope({ profileTo = '/profile' }) {
  // 1. Obtener el perfil almacenado en localStorage (puede ser null).
  //    La clave usada en localStorage es "WeatherApp/UserProfile".
  //    Pista: puedes usar el hook useLocalStorageState, con defaultValue: null.
  const stored = null; /* TODO: hook de localStorage */

  // 2. Obtener la fecha de nacimiento desde stored. Ver UserProfile.jsx en la
  //    rama solution, o tu propia versión del ejercicio 1: se guarda como
  //    texto "YYYY-MM-DD" en la propiedad birthDate.
  const birthDate = null; /* TODO: extraer birthDate de stored */

  // 3. Calcular el signo zodiacal a partir de la fecha de nacimiento.
  //    Pista: usar useMemo con zodiacFromDate(parseISODate(birthDate)).
  const sign = null; /* TODO: calcular signo zodiacal */

  // 4. Crear estado con useReducer usando el reducer y el estado inicial.
  /* TODO: const [state, dispatch] = ... */

  // 5. Hook de efecto: obtener el horóscopo del servidor y traducirlo, cada
  //    vez que cambie el signo.
  //    - Si no hay signo, no hacer nada.
  //    - Al iniciar: dispatch({ type: 'FETCH_START' }).
  //    - Luego: llamar fetchHoroscope(sign).
  //      Si hay éxito: dispatch({ type: 'FETCH_SUCCESS', text: original }).
  //      Intentar traducir con translateToEs(original).
  //      Si hay éxito: dispatch({ type: 'TRANSLATE_SUCCESS', text: translated }).
  //      Si falla: dispatch({ type: 'TRANSLATE_ERROR', error: ... }).
  //    - Si falla la carga inicial: dispatch({ type: 'FETCH_ERROR', error: ... }).
  //    - Descartar respuestas atrasadas con la bandera `current` que conociste
  //      en el laboratorio 7 (ver src/hooks/useWeather.js): true al empezar,
  //      false en la función de limpieza, y revisarla después de cada await.
  /* TODO: useEffect para fetch + translate */

  // 6. Renderizado del componente:
  //    - Si birthDate no está definido: mostrar un mensaje (Typography con caption)
  //      que diga "Fecha de nacimiento no definida" y un Link a profileTo.
  //      Pista: <Link component={RouterLink} to={profileTo}>.
  //    - Si sí hay birthDate: renderizar un Card con:
  //        • CardHeader con el título "Horóscopo de {esSign(sign)}"
  //        • Mostrar distintos contenidos según state.status:
  //            - "loading" o "loaded": CircularProgress y texto "Obteniendo horóscopo…"
  //            - "error": Alert de error al obtener horóscopo
  //            - "success" con traducción: mostrar texto traducido
  //            - "success" sin traducción: mostrar Alert de error + texto original
  return (
    <Box sx={{ p: 2 }}>
      {/* TODO: reemplazar este aviso por el JSX descrito arriba */}
      <Alert severity="info">
        El componente Horoscope está por implementar. Revisa los comentarios en
        src/components/Horoscope.jsx.
      </Alert>
    </Box>
  );
}

Horoscope.propTypes = {
  profileTo: PropTypes.string,
};
