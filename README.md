# Rifa Crispetera 00–99

Aplicación web estática para publicar una rifa, recibir solicitudes de números y aprobar manualmente los pagos desde un panel privado.

## Incluye
- Cartón interactivo de números 00–99.
- Estados disponible, pendiente y confirmado.
- Registro público con nombre, apellido y celular.
- Una solicitud puede contener varios números.
- Registro atómico: evita que dos participantes obtengan el mismo número.
- Panel privado con Supabase Auth.
- Acción **Aprobar pago y confirmar números** para aprobar todos los números de una solicitud en una sola transacción.
- Acción para rechazar una solicitud y liberar sus números.
- Configuración administrativa de nombre, premio, fecha y precio.
- El teléfono no se expone en la vista pública.
- Los nombres, apellidos, números relacionados y fecha de solicitud sí se muestran públicamente.

## 1. Crear proyecto Supabase
1. Crea un proyecto en https://supabase.com/.
2. Entra a **SQL Editor**.
3. Abre `supabase/schema.sql`, copia todo su contenido y ejecútalo.
4. En **Project Settings > API**, copia Project URL y la clave `anon` / publishable.
5. Copia `config.example.js` como `config.js` y pega esos dos valores.

No uses la clave `service_role` en el navegador ni la subas a GitHub.

## 2. Crear el administrador
1. En Supabase abre **Authentication > Users** y crea tu usuario administrador con correo y contraseña.
2. Copia el correo que registraste.
3. En SQL Editor ejecuta, sustituyendo el correo:

```sql
insert into public.raffle_admins(user_id)
select id from auth.users where email = 'TU_CORREO_ADMIN'
on conflict (user_id) do nothing;
```

Sólo los usuarios agregados a `raffle_admins` pueden administrar la rifa. Crear una cuenta en Authentication no concede permisos por sí solo.

## 3. Añadir la foto de la crispetera
Copia tu fotografía a la carpeta `assets` y nómbrala exactamente `crispetera.jpg`. Si es PNG, cambia el nombre en `index.html` o convierte la imagen a JPG.

## 4. Probar localmente
No abras `index.html` directamente si el navegador bloquea recursos. Puedes usar la extensión Live Server de VS Code o ejecutar un servidor local:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`.

## 5. Publicar con GitHub Pages
1. Crea un repositorio GitHub, por ejemplo `rifa-crispetera`.
2. Sube `index.html`, `styles.css`, `app.js`, `config.js` y la carpeta `assets`.
3. En GitHub entra a **Settings > Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**, rama `main`, carpeta `/root`.
5. Guarda y espera la URL pública.

**Importante:** `config.js` contiene sólo la URL y la clave pública anon de Supabase. La seguridad depende de las políticas RLS y funciones SQL del proyecto. No publiques claves secretas.

## Reglas de negocio actuales
- La solicitud bloquea temporalmente sus números como `pending`.
- No hay vencimiento automático configurado: el administrador aprueba o rechaza manualmente.
- Aprobar confirma todos los números de la solicitud en una sola operación.
- Rechazar libera todos los números de la solicitud.
- El ganador se determina con las dos últimas cifras del premio mayor de la Lotería de Boyacá; la validación del resultado es manual.
- La configuración inicial del sorteo es 14 de noviembre de 2026 y $5.000 COP por número.

## Antes de usarla en una rifa real
Haz pruebas con números ficticios y dos navegadores simultáneos. Verifica registro, concurrencia, aprobación, rechazo y acceso no autorizado. Revisa también las condiciones legales aplicables a la organización y publicidad de rifas en Colombia y el tratamiento de datos personales. El proyecto es una base funcional inicial, no una certificación legal ni una auditoría de seguridad.
