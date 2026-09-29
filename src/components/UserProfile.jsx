import { useMemo, useState } from 'react';
import {
  Box, Paper, Stack, TextField, Button, Typography,
  Snackbar, Alert, InputAdornment, CircularProgress,
  Checkbox, FormControlLabel
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useLocalStorageState from 'use-local-storage-state';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RoomIcon from '@mui/icons-material/Room';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { reverseGeocodeServer, forwardGeocodeServer } from '../api/geocodeClient';
import useConnectionStatus from '../hooks/useConnectionStatus';

/* ---------- Helpers de fechas ---------- */
const MIN_AGE = 13;

const pad = (n) => String(n).padStart(2, '0');
// Fecha local como "YYYY-MM-DD". Se evita toISOString(), que convierte a UTC:
// en Chile, una fecha elegida a las 22:00 quedaría guardada como el día siguiente.
const toLocalISODate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISODate = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const calcAge = (birth, today = new Date()) => {
  if (!birth || Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};
// Última fecha de nacimiento que cumple la edad mínima hoy. Es una función, y
// no una constante calculada al cargar el módulo, para que no quede desfasada
// si la aplicación sigue abierta después de medianoche.
const latestAllowedBirthDate = () => {
  const t = new Date();
  return new Date(t.getFullYear() - MIN_AGE, t.getMonth(), t.getDate());
};

/* ---------- Validación ---------- */
const name = Yup.string()
  .trim()
  .required('Obligatorio')
  .max(50, 'Máximo 50 caracteres')
  .matches(/^[\p{L}\p{M}\s.'-]+$/u, 'Solo letras y espacios');

const schema = Yup.object({
  firstName: name,
  lastName: name,
  address: Yup.string()
    .required('Obligatorio')
    .min(5, 'Muy corta')
    .max(120, 'Máximo 120 caracteres'),
  lat: Yup.number().nullable(),
  lng: Yup.number().nullable(),
  birthDate: Yup.string()
    .nullable()
    .required('Obligatorio')
    .test('valid-iso', 'Fecha inválida', (v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      return !Number.isNaN(parseISODate(v).getTime());
    })
    .test('not-future', 'No puede ser futura', (v) => parseISODate(v) <= new Date())
    .test('min-age', `Debes tener al menos ${MIN_AGE} años`, (v) => calcAge(parseISODate(v)) >= MIN_AGE),
  newsletter: Yup.boolean(),
  // Ejercicio 3: el correo es obligatorio solo si se pidió el horóscopo por
  // correo. La regla vive en el esquema, junto a las demás, y el JSX no
  // necesita saber nada de ella.
  email: Yup.string()
    .trim()
    .email('Correo inválido')
    .when('newsletter', {
      is: true,
      then: (s) => s.required('Obligatorio si quieres recibir el horóscopo'),
      otherwise: (s) => s.notRequired(),
    }),
});

/* ---------- Estado persistido ---------- */
// La edad no se edita: se deriva de la fecha de nacimiento y se guarda junto
// con el resto al enviar el formulario.
const defaultFormValues = {
  firstName: '',
  lastName: '',
  birthDate: null,   // "YYYY-MM-DD" | null
  address: '',
  lat: null,
  lng: null,
  newsletter: false,
  email: '',
};

const defaultPersistedProfile = { ...defaultFormValues, age: null };

export default function UserProfile() {
  const [storedProfile, setStoredProfile] = useLocalStorageState('WeatherApp/UserProfile', {
    defaultValue: defaultPersistedProfile,
  });

  // Solo los campos del formulario. Un perfil guardado con una versión
  // anterior de la aplicación puede traer propiedades de más (age) o de menos
  // (newsletter, email); los valores por defecto cubren las que falten.
  const initialFormValues = Object.fromEntries(
    Object.entries(defaultFormValues).map(([k, v]) => [k, storedProfile?.[k] ?? v])
  );

  const [locating, setLocating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'info' });
  const notify = (sev, msg) => setSnack({ open: true, sev, msg });
  const closeSnack = () => setSnack((s) => ({ ...s, open: false }));

  // Ejercicio 6: la ubicación y la verificación de direcciones necesitan red.
  const [status] = useConnectionStatus();
  const offline = status === 'offline';

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: initialFormValues,
    validationSchema: schema,
    validateOnMount: true,
    onSubmit: (values) => {
      const payload = {
        ...values,
        age: calcAge(parseISODate(values.birthDate)),
      };
      setStoredProfile(payload);
      notify('success', 'Perfil guardado');
    },
  });

  const err = (f) => Boolean(formik.touched[f] && formik.errors[f]);
  const help = (f) => (formik.touched[f] && formik.errors[f]) || ' ';

  // Edad derivada para mostrar mientras el usuario elige la fecha.
  const derivedAge = useMemo(
    () => calcAge(parseISODate(formik.values.birthDate)),
    [formik.values.birthDate]
  );

  const setCoords = (lat, lng) => {
    formik.setFieldValue('lat', lat, false);
    formik.setFieldValue('lng', lng, false);
  };

  const geolocErrorMessage = (e) => {
    if (!e) return 'No se pudo obtener tu ubicación';
    switch (e.code) {
      case 1: return 'Permiso de ubicación denegado';
      case 2: return 'Posición no disponible';
      case 3: return 'Tiempo de espera agotado';
      default: return e.message || 'Error de geolocalización';
    }
  };

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      notify('warning', 'Tu navegador no soporta geolocalización.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const rev = await reverseGeocodeServer(latitude, longitude);
          if (rev?.formatted) {
            formik.setFieldValue('address', rev.formatted, true);
            setCoords(rev.lat ?? latitude, rev.lng ?? longitude);
            notify('success', 'Dirección detectada.');
          } else {
            notify('warning', 'No se encontró una dirección para tu ubicación.');
          }
        } catch {
          notify('error', 'Error consultando el geocoder.');
        } finally {
          setLocating(false);
        }
      },
      (e) => {
        notify('warning', geolocErrorMessage(e));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Ejercicio 4: forward geocoding de la dirección escrita a mano.
  const handleVerifyAddress = async () => {
    setVerifying(true);
    try {
      const fwd = await forwardGeocodeServer(formik.values.address.trim());
      if (fwd?.formatted) {
        formik.setFieldValue('address', fwd.formatted, true);
        setCoords(fwd.lat, fwd.lng);
        notify('success', 'Dirección verificada.');
      } else {
        notify('warning', 'Google no encontró esa dirección. Revisa cómo está escrita.');
      }
    } catch {
      notify('error', 'Error consultando el geocoder.');
    } finally {
      setVerifying(false);
    }
  };

  // Si el usuario edita la dirección a mano, las coordenadas guardadas dejan
  // de corresponder a lo escrito, y se descartan.
  const handleAddressChange = (e) => {
    formik.handleChange(e);
    if (formik.values.lat != null) setCoords(null, null);
  };

  // DatePicker entrega un Date (o null, o una fecha inválida mientras el
  // usuario escribe a medias), no un evento, así que el valor se fija a mano.
  const handleBirthDateChange = (d) => {
    let value = null;
    if (d) value = Number.isNaN(d.getTime()) ? 'invalid' : toLocalISODate(d);
    formik.setFieldValue('birthDate', value, true);
  };

  const handleNewsletterChange = (e) => {
    formik.handleChange(e);
    // Al desmarcar, el error del correo ya no aplica y no debería seguir en rojo.
    if (!e.target.checked) formik.setFieldTouched('email', false, false);
  };

  const busy = locating || verifying;

  return (
    <Box sx={{ m: 2 }}>
      <Paper elevation={3} sx={{ p: 3, maxWidth: 640, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          Perfil de Usuario
        </Typography>

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
          <form onSubmit={formik.handleSubmit} noValidate>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Nombre"
                  name="firstName"
                  value={formik.values.firstName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={err('firstName')}
                  helperText={help('firstName')}
                  slotProps={{ htmlInput: { maxLength: 50 } }}
                />
                <TextField
                  fullWidth
                  label="Apellido"
                  name="lastName"
                  value={formik.values.lastName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={err('lastName')}
                  helperText={help('lastName')}
                  slotProps={{ htmlInput: { maxLength: 50 } }}
                />
              </Stack>

              {/* Ejercicio 1: fecha de nacimiento en lugar de la edad */}
              <DatePicker
                label="Fecha de nacimiento"
                value={parseISODate(formik.values.birthDate)}
                onChange={handleBirthDateChange}
                onClose={() => formik.setFieldTouched('birthDate', true)}
                disableFuture
                openTo="year"
                maxDate={latestAllowedBirthDate()}
                format="dd/MM/yyyy"
                slotProps={{
                  textField: {
                    name: 'birthDate',
                    fullWidth: true,
                    // Con la estructura accesible del campo, el foco lo reciben
                    // el día, el mes y el año por separado, y no el <input> que
                    // lleva `name`, del que depende formik.handleBlur. Por eso
                    // el campo se marca como visitado explícitamente.
                    onBlur: () => formik.setFieldTouched('birthDate', true),
                    error: err('birthDate'),
                    helperText:
                      err('birthDate')
                        ? formik.errors.birthDate
                        : derivedAge != null ? `Edad: ${derivedAge} años` : ' ',
                  },
                }}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Dirección"
                  name="address"
                  value={formik.values.address}
                  onChange={handleAddressChange}
                  onBlur={formik.handleBlur}
                  error={err('address')}
                  helperText={help('address')}
                  multiline
                  minRows={2}
                  slotProps={{
                    htmlInput: { maxLength: 120 },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <RoomIcon />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Stack spacing={1} sx={{ justifyContent: 'center', minWidth: { sm: 200 } }}>
                  <Button
                    onClick={handleUseMyLocation}
                    variant="outlined"
                    startIcon={locating ? <CircularProgress size={16} /> : <MyLocationIcon />}
                    disabled={busy || offline}
                  >
                    {locating ? 'Obteniendo…' : 'Usar mi ubicación'}
                  </Button>
                  <Button
                    onClick={handleVerifyAddress}
                    variant="outlined"
                    startIcon={verifying ? <CircularProgress size={16} /> : <FactCheckIcon />}
                    disabled={busy || offline || Boolean(formik.errors.address)}
                  >
                    {verifying ? 'Verificando…' : 'Verificar dirección'}
                  </Button>
                </Stack>
              </Stack>

              {offline && (
                <Typography variant="caption" color="text.secondary">
                  Sin conexión: la ubicación y la verificación de direcciones necesitan consultar a Google.
                </Typography>
              )}

              {(formik.values.lat != null && formik.values.lng != null) && (
                <Typography variant="caption" color="text.secondary">
                  Coordenadas guardadas: {Number(formik.values.lat).toFixed(5)}, {Number(formik.values.lng).toFixed(5)}
                </Typography>
              )}

              {/* Ejercicio 3: casilla y correo con validación condicional */}
              <FormControlLabel
                control={
                  <Checkbox
                    name="newsletter"
                    checked={formik.values.newsletter}
                    onChange={handleNewsletterChange}
                  />
                }
                label="Quiero recibir el horóscopo por correo"
              />
              <TextField
                fullWidth
                label="Correo electrónico"
                name="email"
                type="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                disabled={!formik.values.newsletter}
                error={err('email')}
                helperText={help('email')}
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />

              {/* useFlexGap y flexWrap: en un teléfono los tres botones pasan a una segunda línea en vez de desbordarse */}
              <Stack direction="row" spacing={2} useFlexGap sx={{ pt: 1, flexWrap: 'wrap' }}>
                <Button type="submit" variant="contained" disabled={!formik.isValid}>
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => formik.resetForm({ values: initialFormValues })}
                >
                  Restablecer
                </Button>
                <Button
                  type="button"
                  color="secondary"
                  onClick={() => formik.resetForm({ values: defaultFormValues })}
                >
                  Limpiar
                </Button>
              </Stack>
            </Stack>
          </form>
        </LocalizationProvider>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={2200}
        onClose={closeSnack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled" onClose={closeSnack}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
