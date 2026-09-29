// Períodos que acepta el backend. El valor es el nombre que usa la API; la
// etiqueta es lo que ve el usuario.
export const PERIODS = {
  daily: 'Hoy',
  weekly: 'Semana',
  monthly: 'Mes',
};

// Devuelve el texto del horóscopo junto con la fecha que informa la API: un
// día (2026-09-29), el lunes de la semana (2026-09-28) o un mes (2026-09),
// según el período. La fecha es lo que permite saber si una traducción
// guardada sigue vigente (ver horoscopeCache.js).
export async function fetchHoroscope(sign, period = 'daily') {
  const qs = new URLSearchParams({ sign, period });
  const res = await fetch(`/api/horoscope?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const text =
    json?.data?.horoscope_data ||
    json?.data?.horoscope ||
    json?.horoscope ||
    '';
  if (!text) throw new Error('Formato de respuesta inesperado');
  return { text, date: json?.data?.date ?? null };
}
