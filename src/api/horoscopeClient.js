export async function fetchHoroscope(sign) {
  const res = await fetch(`/api/horoscope?sign=${encodeURIComponent(sign)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const text =
    json?.data?.horoscope_data ||
    json?.data?.horoscope ||
    json?.horoscope ||
    '';
  if (!text) throw new Error('Formato de respuesta inesperado');
  return text;
}
