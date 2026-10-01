# Laboratorio 8: Formularios, validaciones y APIs remotas

En este laboratorio continuaremos desarrollando la aplicación de clima con React y MUI de los laboratorios 6 y 7. La aplicación sigue usando la API de [Open-Meteo](https://open-meteo.com/) para el clima, conserva su condición de PWA y sigue mostrando la última información guardada cuando no hay conexión.

Lo nuevo son dos pantallas y un servidor. La pantalla Perfil es un formulario construido con Formik y validado con Yup, que además puede completar la dirección del usuario a partir de su ubicación GPS. La pantalla Horóscopo lee la fecha de nacimiento del perfil, obtiene el horóscopo del día desde una API pública y lo traduce al español con la API de traducción de Google. Para que las API keys de Google no queden expuestas en el navegador, las llamadas a esos servicios pasan por un pequeño backend escrito con Express, en `server/index.js`.

## Pasos iniciales

### Node.js

Verifica tu versión de Node.js con `node -v`. Vite 8 requiere Node 20.19 o superior, o bien 22.12 o superior. Si tienes una versión anterior, actualízala con [nvm](https://github.com/nvm-sh/nvm) o con el instalador de [nodejs.org](https://nodejs.org/). El backend usa además `fetch` y la opción `--env-file`, que vienen incorporados en esas mismas versiones de Node.

### Créditos de Google Cloud

Google entregó al curso créditos para usar las APIs de Google Cloud Platform: 50 USD por estudiante. El aviso con las instrucciones para obtener el cupón está publicado en Canvas. Cada estudiante es responsable de solicitar y canjear su propio cupón antes de este laboratorio, porque sin una cuenta de facturación activa las APIs de Google responden `REQUEST_DENIED`.

Los créditos alcanzan de sobra para el laboratorio y para el proyecto del curso, siempre que la key no se filtre. Una key publicada en un repositorio la puede usar cualquiera, y el consumo se descuenta de tus créditos. Por eso conviene seguir desde ya dos precauciones, que se retoman en el ejercicio 8: restringir la key a las APIs que realmente usa, y crear una alerta de presupuesto en la sección *Billing* de la consola.

### Proyecto y API keys

En [Google Cloud Console](https://console.cloud.google.com/) ingresa con tus credenciales de `miuandes`, crea un proyecto llamado `icc4203-lab08` y asócialo a la cuenta de facturación donde canjeaste el cupón. Luego, en *APIs & Services*, busca y habilita las siguientes APIs:

* Geocoding API
* Cloud Translation API

Habilitar una API en el proyecto no basta: la key también tiene que estar autorizada para usarla. En la sección *Credentials* crea una API key (una sola sirve para ambos servicios), ábrela y, en *API restrictions*, elige *Restrict key* y marca las dos: Geocoding API y Cloud Translation API. Guarda los cambios, que pueden tardar unos minutos en aplicarse.

Revisa esa lista aunque no la hayas tocado. Una key creada desde la página de una API en particular puede quedar restringida solo a esa API, y el síntoma es engañoso: la traducción del horóscopo funciona y la geolocalización del perfil falla, con la misma key.

Copia el archivo de ejemplo de variables de entorno y completa las dos variables con tu key:

```sh
cp .env.example .env
```

```sh
GOOGLE_GEOCODING_API_KEY=tu-key
GOOGLE_TRANSLATE_API_KEY=tu-key
```

El archivo `.env` está en `.gitignore` y nunca debe subirse al repositorio.

### Dependencias y ejecución

Instala las dependencias:

```sh
yarn install    # o npm install
```

Preferimos Yarn para gestionar las dependencias de Javascript, pero npm sirve igual. La equivalencia es directa:

| Yarn | npm |
| --- | --- |
| `yarn install` | `npm install` |
| `yarn add <paquete>` | `npm install <paquete>` |
| `yarn dev` | `npm run dev` |

La última fila vale para cualquier script declarado en `package.json`, anteponiendo `npm run`. Como el repositorio no tiene `package-lock.json`, npm lee `yarn.lock` e instala las mismas versiones que resolvió Yarn. Elige uno de los dos y quédate con él, porque npm generará su propio archivo de lock y dos archivos de lock que se contradicen terminan en dependencias distintas para cada integrante del equipo.

Con las dependencias instaladas, lanza la aplicación:

```sh
yarn dev    # o npm run dev
```

Este comando levanta dos procesos a la vez, cada uno con su prefijo en la terminal: `WEB` es el servidor de desarrollo de Vite, en [http://localhost:5173/](http://localhost:5173/), y `API` es el backend de Express, en el puerto 5174. Si falta el archivo `.env`, el proceso `API` se detiene con un error que lo indica. Si el archivo existe pero alguna variable está vacía, el backend arranca igual y avisa con una línea `[WARN]`.

Como en el laboratorio 7, el service worker no se registra en modo desarrollo. Para probar la aplicación construida, con su comportamiento sin conexión, usa `yarn build` y luego `yarn preview`, que ahora también levanta el backend.

## Marco teórico

### Formularios en React con Formik

Trabajar con formularios en React puede ser tedioso: hay que mantener el estado de cada campo con `useState`, escribir funciones que validen cada uno, decidir cuándo mostrar los errores (al escribir, al salir del campo o al enviar) e implementar el envío. [Formik](https://formik.org/docs/overview) es una de las bibliotecas más usadas para resolver ese trabajo repetitivo, y ofrece un marco declarativo y uniforme para formularios de cualquier tamaño.

Sus piezas principales son las siguientes:

* Estado centralizado. Los valores de todos los campos viven en un solo objeto, `values`, y los cambios entran por `handleChange` y `handleBlur`.
* Validación integrada, síncrona o asíncrona, que se combina de forma natural con esquemas de Yup.
* Los objetos `errors` y `touched`, que indican qué campos tienen errores y cuáles ya fueron visitados por el usuario. Mostrar un error solo si el campo está en `touched` evita que el formulario aparezca lleno de mensajes en rojo antes de que el usuario escriba nada.
* Envío centralizado en `handleSubmit`, con banderas como `isSubmitting` e `isValid` para controlar los botones.
* Dos estilos de uso: los componentes `Formik`, `Form`, `Field` y `ErrorMessage`, o el hook `useFormik`, que es el que usa este proyecto.

La forma general con `useFormik` es esta:

```es6
const formik = useFormik({
  initialValues: { firstName: '' },
  validationSchema: schema,          // esquema de Yup, ver más abajo
  onSubmit: (values) => guardar(values),
});

<form onSubmit={formik.handleSubmit} noValidate>
  <TextField
    name="firstName"
    value={formik.values.firstName}
    onChange={formik.handleChange}
    onBlur={formik.handleBlur}
    error={Boolean(formik.touched.firstName && formik.errors.firstName)}
    helperText={formik.touched.firstName && formik.errors.firstName}
  />
</form>
```

El atributo `name` del campo es lo que conecta el `TextField` con Formik: `handleChange` lo usa para saber qué propiedad de `values` actualizar. El atributo `noValidate` del `<form>` desactiva la validación nativa del navegador, que de otro modo mostraría sus propios globos de error encima de los de la aplicación.

Cuando un campo no produce un evento de cambio estándar, como un selector de fecha, se actualiza el valor a mano con `formik.setFieldValue(nombre, valor)`. Lo verás en el ejercicio 1.

### Validaciones con Yup

Sin una biblioteca, validar datos obliga a escribir funciones manuales para cada regla: "el nombre no puede estar vacío", "el correo debe tener un formato válido", "la fecha debe ser anterior a hoy". El resultado es mucho código repetido, difícil de mantener y propenso a inconsistencias entre formularios. [Yup](https://github.com/jquense/yup) permite describir esas reglas de forma declarativa, como un esquema.

```es6
const schema = Yup.object({
  firstName: Yup.string().required('Obligatorio').max(50, 'Máximo 50 caracteres'),
  email: Yup.string().email('Correo inválido'),
});
```

Sus características principales:

* Esquemas que describen la forma de un objeto y las reglas de cada propiedad, con tipos `string`, `number`, `boolean`, `date`, `array` y `object`.
* Métodos encadenables: `.required()`, `.min()`, `.max()`, `.matches()`, `.email()`, `.integer()`.
* Reglas propias con `.test(nombre, mensaje, función)`, para lo que no cubren los métodos incluidos.
* Validación condicional con `.when()`, en la que una regla depende del valor de otro campo. La usarás en el ejercicio 3.
* Mensajes de error personalizables en cada regla.
* Transformaciones como `.trim()` o `.transform()`, que limpian el dato antes de validarlo.
* Uso fuera de React: el mismo esquema puede validar los datos de entrada en un backend de Node.

Con Formik, basta con pasar el esquema en `validationSchema`, y Formik lo aplica y llena `errors` automáticamente.

### Geolocalización en el navegador

La [API de geolocalización del W3C](https://developer.mozilla.org/es/docs/Web/API/Geolocation_API) es el mecanismo estándar del navegador para conocer la ubicación del dispositivo. En un teléfono suele venir del GPS; en un computador, de la red Wi-Fi o de la dirección IP, con bastante menos precisión.

```es6
navigator.geolocation.getCurrentPosition(
  (pos) => console.log(pos.coords.latitude, pos.coords.longitude),
  (err) => console.warn(err.code, err.message),
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
);
```

Tres detalles importan en la práctica:

* La API solo está disponible en un contexto seguro: una página servida por HTTPS o, para desarrollo, `localhost`. Si abres la aplicación desde otro equipo de la red con `http://192.168...`, `navigator.geolocation` no funcionará.
* El navegador pide permiso al usuario la primera vez. Si el usuario lo rechaza, la función de error recibe el código 1; los códigos 2 y 3 indican que la posición no está disponible y que se agotó el tiempo de espera.
* Las opciones del tercer argumento regulan el costo de la consulta. `enableHighAccuracy` pide el GPS aunque gaste más batería, `timeout` limita la espera y `maximumAge` acepta una posición obtenida hace poco, en milisegundos.

La API entrega coordenadas. Para convertirlas en una dirección legible hace falta un servicio de *reverse geocoding*, y en esta aplicación ese servicio es el Geocoding API de Google Maps Platform.

### Uso de APIs remotas y el backend como fachada

En los laboratorios anteriores la aplicación llamaba a Open-Meteo directamente desde el navegador. Eso es aceptable con APIs públicas y gratuitas que solo entregan datos de lectura. Con APIs comerciales, como las de Google, o con APIs que permiten modificar datos, el acceso directo es un problema: la key tendría que viajar en el código del frontend, y cualquiera podría leerla con las herramientas de desarrollo del navegador y usarla a tu costa.

La práctica recomendada es encapsular las llamadas a APIs protegidas en un backend. Aquí ese backend está en `server/index.js`, escrito con el microframework [Express](https://expressjs.com/) para Node (comparable en función a Rails en modo API, Sinatra, Flask o FastAPI). El backend guarda las keys y ofrece al frontend una fachada con endpoints propios, de modo que el navegador solo conversa con él.

**En el proyecto del curso, cuando tengan que trabajar con APIs remotas protegidas, deben seguir el mismo enfoque: agregar a su aplicación Rails controladores y rutas que reenvíen las peticiones del frontend a las APIs remotas, manteniendo las API keys en el servidor y fuera del alcance del frontend.**

En esta aplicación hay cuatro servicios remotos:

| servicio | quién lo llama | requiere key |
| --- | --- | --- |
| Open-Meteo, clima y geocodificación de ciudades | el navegador, directamente | no |
| Geocoding API de Google | el backend | sí |
| Cloud Translation API de Google | el backend | sí |
| [freehoroscopeapi.com](https://freehoroscopeapi.com/), horóscopo diario | el backend | no |

El horóscopo no necesita key y podría llamarse desde el navegador. Pasa por el backend por otra razón: el servidor puede validar los datos que reenvía (solo acepta los doce signos) y el frontend queda independiente del proveedor. Cuando la API de horóscopo que usaba este laboratorio en 2025 cambió de dominio, bastó con corregir una línea del servidor.

### Variables de entorno

Las keys llegan al backend como [variables de entorno](https://es.wikipedia.org/wiki/Variable_de_entorno), que el código lee en `process.env`. En desarrollo se definen en un archivo `.env`, que Node carga al iniciar gracias a la opción `--env-file=.env` de los scripts de `package.json`.

El archivo `.env` contiene secretos y va en `.gitignore`. El repositorio incluye en cambio un `.env.example`, con los nombres de las variables y sin valores, para que quien clone el proyecto sepa qué variables necesita definir.

## Descripción de la aplicación

La aplicación permite buscar ciudades, guardar favoritas y ver su clima en la pantalla de inicio, igual que en el laboratorio 7, incluido el funcionamiento sin conexión. A eso se suman un perfil de usuario con formulario validado y geolocalización, y una pantalla de horóscopo que depende de ese perfil.

## Componentes de la aplicación

`index.html`, `main.jsx`, el tema de MUI y los componentes `Home`, `Weather`, `Search`, `SearchResult` y `ConnectionStatus` son los del laboratorio 7 con sus ejercicios resueltos: `Search` maneja su estado con `useReducer`, y `Weather` obtiene sus datos con los hooks propios `useWeather` y `useNow`, en `src/hooks`. Si necesitas repasar cómo funcionan, el README del laboratorio 7 los describe en detalle.

Las novedades son las siguientes.

### Componente App

`App` agrega dos rutas, `/profile` y `/horoscope`, con sus botones en la barra superior. El título de la barra se obtiene ahora de un objeto `TITLES` indexado por ruta, en lugar de una cadena de `if`, porque con cuatro pantallas la tabla se lee mejor.

### Componente UserProfile

`UserProfile` implementa el perfil con `useFormik` y un esquema de Yup. Los campos son nombre, apellido, edad y dirección, y el perfil se guarda en `localStorage` bajo la clave `WeatherApp/UserProfile` con `useLocalStorageState`, siguiendo la convención de claves del laboratorio 7.

Algunos detalles que conviene leer en el código:

* Funciones `err(campo)` y `help(campo)`, que resumen la regla "mostrar el error solo si el campo fue visitado" para no repetirla en cada `TextField`.
* `enableReinitialize: true`, que hace que Formik vuelva a cargar los valores iniciales cuando cambia lo guardado en `localStorage`.
* El botón *Guardar*, deshabilitado mientras `formik.isValid` sea falso.
* *Restablecer* vuelve a lo último que se guardó, y *Limpiar* deja el formulario vacío. Ninguno de los dos toca `localStorage` hasta que el usuario vuelva a guardar.
* La edad se ingresa como texto. `handleAgeChange` descarta todo lo que no sea dígito, y el esquema la convierte a número con `.transform()` antes de validar que sea un entero mayor o igual a 13. El ejercicio 1 reemplaza este campo por una fecha de nacimiento.
* El botón *Usar mi ubicación* llama a `navigator.geolocation.getCurrentPosition` y, con las coordenadas, a `reverseGeocodeServer`. Si Google encuentra una dirección, la escribe en el campo con `formik.setFieldValue` y guarda también las coordenadas.

Una nota sobre MUI 9: las propiedades `inputProps` e `InputProps` de `TextField`, que verás en muchos ejemplos de internet, ya no existen. Su lugar lo ocupan `slotProps.htmlInput`, para los atributos del `<input>` (como `maxLength` o `inputMode`), y `slotProps.input`, para el componente que lo envuelve (como `startAdornment`).

```jsx
<TextField
  slotProps={{
    htmlInput: { maxLength: 120 },
    input: { startAdornment: <InputAdornment position="start"><RoomIcon /></InputAdornment> },
  }}
/>
```

### Componente Horoscope

`Horoscope` muestra el horóscopo del día según el signo zodiacal del usuario, calculado a partir de su fecha de nacimiento. En la rama `main` el componente está incompleto: trae las funciones auxiliares (`parseISODate`, `zodiacFromDate`, `esSign`) y el reducer que maneja la carga y la traducción, y una serie de comentarios numerados que guían su implementación en el ejercicio 2.

El reducer describe una secuencia de dos peticiones encadenadas, primero el horóscopo en inglés y después su traducción:

```
idle → loading → loaded → success
                   ↘ error
```

La traducción puede fallar sin que falle todo: en ese caso el estado queda en `success` con `translated` vacío, y el componente muestra el texto original en inglés junto con un aviso. Es preferible mostrar algo útil a mostrar solo un error.

### Clientes de API (`src/api`)

Cada servicio tiene un módulo cliente que encapsula la llamada, de modo que los componentes importan una función con nombre y no construyen URLs:

| módulo | función | endpoint del backend |
| --- | --- | --- |
| `geocodeClient.js` | `reverseGeocodeServer(lat, lng)` | `GET /api/geocode/reverse` |
| `geocodeClient.js` | `forwardGeocodeServer(address)` | `GET /api/geocode/forward` |
| `horoscopeClient.js` | `fetchHoroscope(sign)` | `GET /api/horoscope` |
| `translateClient.js` | `translateToEs(text)` | `POST /api/translate` |
| `weatherApi.js` | `fetchWeather`, `fetchWeatherMulti` | ninguno, llama a Open-Meteo |

Los tres clientes nuevos usan `fetch` en lugar de axios, para que conozcas ambas formas. Fíjate en una diferencia que importa: `fetch` solo rechaza la promesa cuando la petición no llega a destino, y un 404 o un 500 los entrega como respuesta normal. Por eso cada cliente revisa `res.ok` y lanza un error si hace falta. axios, en cambio, lanza el error por su cuenta ante cualquier estado distinto de 2xx.

Las rutas empiezan con `/api` y no llevan servidor ni puerto: el navegador las pide al mismo origen de la página, y Vite las reenvía al backend, como se explica más abajo.

### Backend (`server/index.js`)

El backend es una aplicación Express con cuatro endpoints:

* `GET /api/geocode/reverse?lat=…&lng=…`, de coordenadas a dirección.
* `GET /api/geocode/forward?address=…`, de dirección a coordenadas. El frontend todavía no lo usa; es materia del ejercicio 4.
* `GET /api/horoscope?sign=…`, que valida el signo contra una lista blanca y reenvía la consulta a freehoroscopeapi.com.
* `POST /api/translate`, que recibe `{ q, target }` y llama a Cloud Translation.

Los dos endpoints de geocodificación comparten la función `geocode`, que resume la respuesta de Google a los campos que usa el frontend y distingue tres desenlaces. Si Google responde `OK`, se devuelve la mejor coincidencia, elegida por `pickBestResult`: Google ordena los resultados por cercanía, de modo que el primero puede ser un paradero o un local, y en medio del mar solo entrega un *plus code* como `69GG2222+22`. La función prefiere una dirección de calle y descarta los plus codes; si no queda nada, responde igual que ante `ZERO_RESULTS`. Si Google responde `ZERO_RESULTS`, la consulta funcionó pero no hay dirección para esas coordenadas, y se devuelve `formatted: null` con estado 200. Cualquier otro estado, casi siempre `REQUEST_DENIED` por una key inválida, sin la API habilitada o sin facturación, se devuelve como error 502 junto con el mensaje de Google.

El servidor registra cada llamada en la terminal, con el prefijo `API`. La función `maskUrl` reemplaza la key por `***` antes de escribirla: los logs se copian en mensajes, se pegan en foros y se suben a servicios de monitoreo, y una key en un log es una key filtrada.

La configuración de CORS admite los orígenes `localhost:5173` y `localhost:4173`. Con el proxy de Vite el navegador cree hablar con su propio origen, pero en las peticiones POST envía igual el encabezado `Origin`, y sin esa lista la traducción fallaría.

### Proxy de Vite (`vite.config.js`)

`server.proxy` y `preview.proxy` reenvían al backend todas las rutas que empiezan con `/api`, tanto en `yarn dev` como en `yarn preview`. Gracias a eso el frontend usa rutas relativas y el navegador ve un solo origen. En producción, el mismo papel lo cumpliría el servidor web que sirve la aplicación, o la propia aplicación Rails.

### Service worker (`public/sw.js`)

El service worker del laboratorio 7 tiene dos cambios. Sus reglas dejan pasar sin tocarlas las rutas `/api/`, por la misma razón que deja pasar Open-Meteo: sin esa excepción, las respuestas del backend caerían en la estrategia de caché primero y el horóscopo de hoy se serviría también mañana. Y la constante `CACHE` pasó a `weather-app-v2`, para que el service worker del laboratorio anterior, registrado en el mismo `localhost:4173`, se reemplace limpiamente.

## Cómo probar lo nuevo

**Geolocalización sin moverse de la silla.** En Chrome y Edge, abre las herramientas de desarrollo, entra al menú de tres puntos, *More tools*, *Sensors*, y en *Location* elige una ciudad o escribe coordenadas. El botón *Usar mi ubicación* recibirá esa posición. Con la opción *Location unavailable* puedes provocar el error de código 2. Firefox no tiene un panel equivalente; ahí se prueba con la ubicación real.

**Lo que ve el navegador.** Con el panel *Network* abierto, usa *Usar mi ubicación* y entra a *Horóscopo*. Verás peticiones a `localhost:5173/api/...` y a Open-Meteo, y ninguna a `googleapis.com`. Esas las hace el backend, y aparecen en la terminal con la key enmascarada.

**Los errores de Google.** Si el perfil muestra "Error consultando el geocoder", mira la terminal: la línea `[rev]` dice qué respondió Google, y la respuesta completa, con el mensaje de Google, se ve también en el panel *Network* del navegador. Los casos más comunes:

| mensaje de Google | causa | solución |
| --- | --- | --- |
| `This API key is not authorized to use this service or API` | la key tiene restricción de APIs y Geocoding API no está en su lista | en *Credentials*, abre la key y agrega Geocoding API en *API restrictions* |
| `This API is not activated on your API project` o `This API project is not authorized to use this API` | la API no está habilitada en el proyecto | habilítala en *APIs & Services*, *Library* |
| `The provided API key is expired` o `API key not valid` | la key no existe o fue revocada | crea otra y actualiza `.env` |
| un mensaje sobre facturación (*billing*) | el proyecto no tiene cuenta de facturación | asócialo a la cuenta donde canjeaste el cupón |

Después de editar `.env` hay que reiniciar `yarn dev`: Node lee el archivo una sola vez, al arrancar. Los cambios en la consola de Google, en cambio, no requieren reiniciar nada, aunque pueden tardar unos minutos en aplicarse.

## Experimenta con el código

1. **Fecha de nacimiento.** Completa `UserProfile` reemplazando el campo de edad por uno de fecha de nacimiento. El usuario debe tener al menos 13 años, y de lo contrario se muestra un error. La edad (`age`) debe mantenerse sincronizada con la fecha y mostrarse junto a ella. Guarda la fecha como texto `YYYY-MM-DD` en la propiedad `birthDate` del perfil, porque es lo que espera `Horoscope`. El componente de MUI que debes usar es [`DatePicker`](https://mui.com/x/react-date-pickers/date-picker/), del paquete `@mui/x-date-pickers`, que ya está instalado. Para mostrar las fechas en formato `DD/MM/AAAA` y en español, envuelve `DatePicker` en un `LocalizationProvider` (tambien importado desde `@mui/x-date-pickers`) con estas propiedades:
   ```jsx
   <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
   ```
   `AdapterDateFns` también se importa desde `@mui/x-date-pickers`, y `es` desde `date-fns/locale`. Como `DatePicker` entrega un objeto `Date` y no un evento, tendrás que llamar a `formik.setFieldValue` en su `onChange`. Para las reglas de edad mínima y fecha no futura, `Yup.string().test(...)` te permite escribir la validación que necesites.

2. **Horóscopo.** Implementa `Horoscope` siguiendo los comentarios numerados de `src/components/Horoscope.jsx`, con el cliente `src/api/horoscopeClient.js` y el cliente de traducción `src/api/translateClient.js`. Necesitas haber resuelto el ejercicio 1, porque el signo se calcula a partir de `birthDate`. Cuando termines, borra la línea `eslint-disable` del comienzo del archivo y verifica que `yarn lint` no reclame nada.

3. **Validación condicional.** Agrega al perfil una casilla (`Checkbox` dentro de un `FormControlLabel`) con el texto "Quiero recibir el horóscopo por correo", y un campo de correo electrónico. El correo es obligatorio solo si la casilla está marcada, y debe tener formato válido cuando se ingrese. Resuélvelo con `.when()` de Yup, en el esquema y no en el JSX. Mientras la casilla esté desmarcada, el campo de correo debe verse deshabilitado.

4. **Verificar una dirección escrita a mano.** El backend tiene un endpoint de *forward geocoding* que el frontend no usa, y `src/api/geocodeClient.js` exporta su cliente, `forwardGeocodeServer`. Agrega un botón "Verificar dirección" que envíe al backend lo escrito en el campo de dirección. Si Google la encuentra, reemplaza el texto por la dirección normalizada que devuelve y guarda sus coordenadas; si no, avisa con el `Snackbar` que ya usa el componente. Piensa también qué debe pasar con las coordenadas guardadas cuando el usuario edita la dirección a mano: si se quedan, dejan de corresponder a lo escrito.

5. **Horóscopo semanal y mensual.** La API de horóscopo ofrece tres períodos, en las rutas `/get-horoscope/daily`, `/get-horoscope/weekly` y `/get-horoscope/monthly`. Agrega al endpoint `/api/horoscope` del backend un parámetro `period`, validado contra una lista blanca igual que el signo, y en `Horoscope` un `ToggleButtonGroup` con las opciones Hoy, Semana y Mes. El efecto que carga el horóscopo tendrá que depender también del período. Cuida el orden de las piezas: primero el servidor, que puedes probar con `curl`, luego el cliente y al final el componente.

6. **Horóscopo sin conexión y con menos gasto.** Cada visita a *Horóscopo* hace una llamada a Cloud Translation, que se descuenta de tus créditos aunque el texto sea el mismo de hace cinco minutos. Guarda en `localStorage` la traducción de cada combinación de signo, período y fecha (la respuesta de la API trae un campo `date`), y reutilízala en lugar de volver a traducir. Toma como modelo `src/api/weatherCache.js` del laboratorio 7, incluidos los `try` y la validación de lo que se lee. De paso, la pantalla funcionará sin conexión con lo último guardado. Para completar el ejercicio, usa `useConnectionStatus` en `UserProfile` para deshabilitar *Usar mi ubicación* mientras no haya red, con un texto que explique por qué.

7. **Navegación para teléfonos.** Abre la aplicación con el emulador de dispositivos de las herramientas de desarrollo en un teléfono de 360 píxeles de ancho: los cuatro botones de la barra superior no caben. En pantallas pequeñas, reemplázalos por una [`BottomNavigation`](https://mui.com/material-ui/react-bottom-navigation/) fija en la parte inferior, que es el patrón habitual de las aplicaciones móviles. Usa [`useMediaQuery`](https://mui.com/material-ui/react-use-media-query/) con `theme.breakpoints.down('sm')` para decidir cuál mostrar, y `useLocation` para marcar la pestaña activa. Recuerda dejar espacio al final del contenido, o la barra inferior tapará lo último de cada pantalla.

8. **La key bajo observación.** Este ejercicio no produce código.
   * Busca tu key en todo lo que recibe el navegador: el panel *Network*, el código fuente en *Sources* y el bundle generado en `dist/assets` tras `yarn build`. No debería aparecer en ninguna parte. Luego búscala en la terminal del backend, donde debería aparecer enmascarada.
   * En la consola de Google Cloud, quita momentáneamente Cloud Translation de las APIs permitidas para la key y recarga *Horóscopo*. Sigue el error desde la respuesta de Google, pasando por el log del backend, hasta lo que ve el usuario. Después restablece la restricción.
   * Crea una alerta de presupuesto en *Billing*, *Budgets & alerts*, por un monto bajo, por ejemplo 5 USD, y revisa en *APIs & Services* cuántas peticiones llevas hechas a cada API.

## Anexo: lo básico de Vite

Usamos [Vite](https://vite.dev/) como andamiaje para crear y construir la aplicación con React 19. Vite provee herramientas parecidas a los generadores de Rails para crear una aplicación de frontend desde cero, un servidor de desarrollo con recarga en caliente y el empaquetado para producción.

El objeto `"scripts"` de `package.json` declara las tareas disponibles:

* `dev`: levanta el frontend y el backend en modo desarrollo, en paralelo, con [concurrently](https://www.npmjs.com/package/concurrently). El backend corre con `node --watch`, que lo reinicia al guardar cambios en `server/index.js`.
* `dev:web` y `dev:api`: levantan cada uno por separado, por si prefieres tenerlos en terminales distintas.
* `build`: prepara la aplicación para producción, en `dist/`.
* `lint`: ejecuta ESLint para validar que el código cumpla las normas de calidad configuradas en `eslint.config.js`. Esa configuración declara tres entornos distintos: el navegador para `src/`, el service worker para `public/sw.js` y Node para `server/`, cada uno con sus propias variables globales.
* `preview`: sirve la aplicación construida, junto con el backend, para probarla como se vería en producción.

En `vite.config.js` hay dos agregados respecto de la configuración por defecto: el proxy hacia el backend, descrito más arriba, y `build.manifest`, que deja en `dist/assets-manifest.json` la lista de archivos que el service worker precachea al instalarse.
