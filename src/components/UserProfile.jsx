import { useState } from 'react';
import {
  Box, Paper, Stack, TextField, Button, Typography,
  Snackbar, Alert, InputAdornment, CircularProgress
} from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useLocalStorageState from 'use-local-storage-state';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RoomIcon from '@mui/icons-material/Room';
import { reverseGeocodeServer } from '../api/geocodeClient';

/* ---------- Validation ---------- */
const schema = Yup.object({
  firstName: Yup.string()
    .required('Obligatorio')
    .max(50, 'Máximo 50 caracteres')
    .matches(/^[\p{L}\p{M}\s.'-]+$/u, 'Solo letras y espacios'),
  lastName: Yup.string()
    .required('Obligatorio')
    .max(50, 'Máximo 50 caracteres')
    .matches(/^[\p{L}\p{M}\s.'-]+$/u, 'Solo letras y espacios'),
  address: Yup.string()
    .required('Obligatorio')
    .min(5, 'Muy corta')
    .max(120, 'Máximo 120 caracteres'),
  lat: Yup.number().nullable(),
  lng: Yup.number().nullable(),
  // Edad ingresada como texto, validada como número entero >= 13
  age: Yup.number()
    .transform((val, orig) => (orig === '' || orig == null ? undefined : Number(orig)))
    .typeError('Debes ingresar un número')
    .integer('Debe ser un número entero')
    .min(13, 'Debes tener al menos 13 años')
    .required('Obligatorio'),
});

/* ---------- Persisted state ---------- */
const defaultPersistedProfile = {
  firstName: '',
  lastName: '',
  address: '',
  lat: null,
  lng: null,
  age: null,
};

export default function UserProfile() {
  const [storedProfile, setStoredProfile] = useLocalStorageState('WeatherApp/UserProfile', {
    defaultValue: defaultPersistedProfile,
  });

  // Form values
  const defaultFormValues = {
    firstName: '',
    lastName: '',
    address: '',
    lat: null,
    lng: null,
    // Guardamos age como string en el form; convertimos a número en el submit
    age: '',
  };

  const initialFormValues = {
    ...defaultFormValues,
    ...(storedProfile || {}),
    // Asegura que age se muestre como texto si antes se guardó como número
    age:
      storedProfile?.age === null || storedProfile?.age === undefined
        ? ''
        : String(storedProfile.age),
  };

  const [savedOpen, setSavedOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [snack, setSnack] = useState({
    open: false,
    msg: '',
    sev: 'info',
  });

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: initialFormValues,
    validationSchema: schema,
    validateOnMount: true,
    onSubmit: (values) => {
      // Convertir age a número antes de persistir
      const payload = {
        ...values,
        age: values.age === '' ? null : Number(values.age),
      };
      setStoredProfile(payload);
      setSavedOpen(true);
    },
  });

  const err = (f) => Boolean(formik.touched[f] && formik.errors[f]);
  const help = (f) => (formik.touched[f] && formik.errors[f]) || ' ';

  const geolocErrorMessage = (e) => {
    if (!e) return 'No se pudo obtener tu ubicación';
    switch (e.code) {
      case 1: return 'Permiso de ubicación denegado';
      case 2: return 'Posición no disponible';
      case 3: return 'Tiempo de espera agotado';
      default: return e?.message || 'Error de geolocalización';
    }
  };

  const handleUseMyLocation = async () => {
    if (!('geolocation' in navigator)) {
      setSnack({ open: true, sev: 'warning', msg: 'Tu navegador no soporta geolocalización.' });
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
            formik.setFieldValue('lat', rev.lat ?? latitude, false);
            formik.setFieldValue('lng', rev.lng ?? longitude, false);
            setSnack({ open: true, sev: 'success', msg: 'Dirección detectada.' });
          } else {
            setSnack({ open: true, sev: 'warning', msg: `No se encontró dirección (status: ${rev?.status || 'ZERO_RESULTS'}).` });
          }
        } catch {
          setSnack({ open: true, sev: 'error', msg: 'Error consultando el geocoder.' });
        } finally {
          setLocating(false);
        }
      },
      (e) => {
        setSnack({ open: true, sev: 'warning', msg: geolocErrorMessage(e) });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Mantener solo dígitos en el input (sigue siendo un text field)
  const handleAgeChange = (e) => {
    const digitsOnly = e.target.value.replace(/[^\d]/g, '');
    formik.setFieldValue('age', digitsOnly, true);
  };

  return (
    <Box sx={{ m: 2 }}>
      <Paper elevation={3} sx={{ p: 3, maxWidth: 640, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          Perfil de Usuario
        </Typography>

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

            {/* Edad como campo de texto (solo números) */}
            <TextField
              fullWidth
              label="Edad"
              name="age"
              value={formik.values.age}
              onChange={handleAgeChange}
              onBlur={formik.handleBlur}
              error={err('age')}
              helperText={help('age')}
              placeholder="Ej: 18"
              // Sugiere el teclado numérico en móviles, sin dejar de ser un campo de texto
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Dirección"
                name="address"
                value={formik.values.address}
                onChange={formik.handleChange}
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
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Button
                  onClick={handleUseMyLocation}
                  variant="outlined"
                  startIcon={locating ? <CircularProgress size={16} /> : <MyLocationIcon />}
                  disabled={locating}
                >
                  {locating ? 'Obteniendo…' : 'Usar mi ubicación'}
                </Button>
              </Box>
            </Stack>

            {(formik.values.lat != null && formik.values.lng != null) && (
              <Typography variant="caption" color="text.secondary">
                Coordenadas guardadas: {Number(formik.values.lat).toFixed(5)}, {Number(formik.values.lng).toFixed(5)}
              </Typography>
            )}

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
      </Paper>

      <Snackbar
        open={savedOpen || snack.open}
        autoHideDuration={2200}
        onClose={() => { setSavedOpen(false); setSnack(s => ({ ...s, open: false })); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={savedOpen ? 'success' : snack.sev}
          variant="filled"
          onClose={() => { setSavedOpen(false); setSnack(s => ({ ...s, open: false })); }}
        >
          {savedOpen ? 'Perfil guardado' : snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
