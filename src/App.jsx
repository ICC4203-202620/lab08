import { useMemo } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import useLocalStorageState from 'use-local-storage-state';
import {
  AppBar, Toolbar, Typography, Button, Container,
  BottomNavigation, BottomNavigationAction, Paper, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import HomeIcon from '@mui/icons-material/Home';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Home from './components/Home';
import Search from './components/Search';
import UserProfile from './components/UserProfile';
import Horoscope from './components/Horoscope';
import ConnectionStatus from './components/ConnectionStatus';

const TITLES = {
  '/search': 'Buscar ciudad',
  '/profile': 'Perfil',
  '/horoscope': 'Horóscopo',
};

// Lo que sale de localStorage pudo escribirlo otra aplicación del mismo origen.
// Todos los laboratorios corren en localhost:5173, y no todos guardan los
// favoritos igual: algunas versiones guardan objetos { id, name, ... } en vez de
// nombres. Se conservan los nombres válidos, sin duplicados, y el resto se
// descarta; si algo no es un arreglo, se vuelve al valor por defecto.
const DEFAULT_FAVORITES = ['Santiago de Chile'];

function normalizeFavorites(value) {
  if (!Array.isArray(value)) return DEFAULT_FAVORITES;
  const names = value
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter((name) => typeof name === 'string' && name.trim());
  return [...new Set(names)];
}

// Las cuatro secciones de la aplicación. La barra superior y la inferior se
// construyen desde esta misma lista, para que no puedan quedar distintas.
const SECTIONS = [
  { to: '/', label: 'Inicio', icon: <HomeIcon /> },
  { to: '/search', label: 'Buscar', icon: <SearchIcon /> },
  { to: '/profile', label: 'Perfil', icon: <PersonIcon /> },
  { to: '/horoscope', label: 'Horóscopo', icon: <AutoAwesomeIcon /> },
];

function App() {
  // Favorites persisted
  const [storedFavorites, setFavorites] = useLocalStorageState('WeatherApp/Favorites', {
    defaultValue: DEFAULT_FAVORITES,
  });
  // Las operaciones de abajo escriben siempre a partir de la lista ya
  // normalizada, de modo que la primera modificación deja limpio lo guardado.
  const favorites = useMemo(() => normalizeFavorites(storedFavorites), [storedFavorites]);

  const isFavorite = (name) => favorites.includes(name);

  const onAddFavorite = (name) => {
    if (!name) return;
    if (!favorites.includes(name)) setFavorites([...favorites, name]);
  };

  const removeFavorite = (name) => {
    setFavorites(favorites.filter((c) => c !== name));
  };

  const location = useLocation();
  const title = useMemo(() => TITLES[location.pathname] ?? 'Clima', [location.pathname]);

  // En un teléfono los cuatro botones no caben en la barra superior. Por
  // debajo del breakpoint `sm` (600 px) la navegación baja a una
  // BottomNavigation, que además queda al alcance del pulgar.
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <>
      <AppBar position="fixed">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          {!compact && SECTIONS.map(({ to, label, icon }) => (
            <Button key={to} color="inherit" component={Link} to={to} startIcon={icon}>
              {label}
            </Button>
          ))}
        </Toolbar>
      </AppBar>
      <Toolbar />
      <ConnectionStatus />
      {/* Con la barra inferior, el padding final evita que tape lo último de cada pantalla */}
      <Container component="main" maxWidth="md" sx={{ pb: compact ? 9 : 0 }}>
        <Routes>
          <Route path="/" element={<Home favorites={favorites} removeFavorite={removeFavorite} />} />
          <Route path="/search" element={<Search isFavorite={isFavorite} onAddFavorite={onAddFavorite} />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/horoscope" element={<Horoscope profileTo="/profile" />} />
        </Routes>
      </Container>

      {compact && (
        <Paper
          elevation={3}
          sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar }}
        >
          <BottomNavigation showLabels value={location.pathname}>
            {SECTIONS.map(({ to, label, icon }) => (
              <BottomNavigationAction
                key={to}
                component={Link}
                to={to}
                value={to}
                label={label}
                icon={icon}
              />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </>
  );
}

export default App;
