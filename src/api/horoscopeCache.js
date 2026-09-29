// Caché de horóscopos traducidos, en localStorage.
//
// Sigue el modelo de weatherCache.js, con una entrada por combinación de signo
// y período. Cumple dos funciones:
//
// 1. Ahorrar traducciones. Cada llamada a Cloud Translation se cobra, y el
//    texto de un período no cambia hasta que empieza el siguiente. Si el
//    horóscopo que llega es el mismo que ya traducimos, se reutiliza.
// 2. Mostrar algo sin conexión: el último horóscopo guardado, con su fecha.

const PREFIX = 'WeatherApp/Horoscope/';

const keyFor = (sign, period) => `${PREFIX}${sign}/${period}`;

export function saveHoroscope(sign, period, { date, original, translated }) {
  try {
    const entry = { date, original, translated, savedAt: Date.now() };
    localStorage.setItem(keyFor(sign, period), JSON.stringify(entry));
  } catch (err) {
    console.warn('No se pudo guardar el horóscopo en caché:', err);
  }
}

export function loadHoroscope(sign, period) {
  try {
    const raw = localStorage.getItem(keyFor(sign, period));
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (
      typeof entry?.original !== 'string' ||
      typeof entry?.translated !== 'string' ||
      typeof entry?.savedAt !== 'number'
    ) {
      return null;
    }

    return entry;
  } catch (err) {
    console.warn('No se pudo leer el horóscopo en caché:', err);
    return null;
  }
}
