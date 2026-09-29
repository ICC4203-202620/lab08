import { useMemo } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import useLocalStorageState from 'use-local-storage-state';
import { AppBar, Toolbar, Typography, Button, Container } from '@mui/material';
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

function App() {
  // Favorites persisted
  const [favorites, setFavorites] = useLocalStorageState('WeatherApp/Favorites', {
    defaultValue: ['Santiago de Chile'],
  });

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

  return (
    <>
      <AppBar position="fixed">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>
          <Button color="inherit" component={Link} to="/" startIcon={<HomeIcon />}>
            Inicio
          </Button>
          <Button color="inherit" component={Link} to="/search" startIcon={<SearchIcon />}>
            Buscar
          </Button>
          <Button color="inherit" component={Link} to="/profile" startIcon={<PersonIcon />}>
            Perfil
          </Button>
          <Button color="inherit" component={Link} to="/horoscope" startIcon={<AutoAwesomeIcon />}>
            Horóscopo
          </Button>
        </Toolbar>
      </AppBar>
      <Toolbar />
      <ConnectionStatus />
      <Container component="main" maxWidth="md">
        <Routes>
          <Route path="/" element={<Home favorites={favorites} removeFavorite={removeFavorite} />} />
          <Route path="/search" element={<Search isFavorite={isFavorite} onAddFavorite={onAddFavorite} />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/horoscope" element={<Horoscope profileTo="/profile" />} />
        </Routes>
      </Container>
    </>
  );
}

export default App;
