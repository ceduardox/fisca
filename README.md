# Ghost

Panel privado para guardar un numero base y generar links compartibles. Cuando alguien abre un link, Ghost registra la informacion normal disponible por navegador y servidor: IP, user agent, sistema operativo, navegador, idioma, pantalla, zona horaria y datos de dispositivo cuando el navegador los expone.

## Desarrollo

1. Copia `.env.example` a `.env`.
2. Configura `DATABASE_URL`.
3. Instala dependencias:

```bash
npm install
```

4. Inicia:

```bash
npm start
```

## Railway

Conecta el repo y crea una base PostgreSQL. Variables esperadas:

- `DATABASE_URL`
- `SESSION_SECRET`
- `GHOST_ADMIN_USER`
- `GHOST_ADMIN_PASSWORD`
- `PUBLIC_BASE_URL`
- `DEFAULT_REDIRECT_URL` opcional; por defecto usa `https://news.google.com/`

El primer arranque crea el usuario admin si no existe.
