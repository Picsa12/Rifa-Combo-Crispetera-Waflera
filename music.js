
document.addEventListener("DOMContentLoaded", () => {
    const musica = document.getElementById("musicaRifa");
    const boton = document.getElementById("activarMusica");

    if (!musica || !boton) return;

    // La canción se reproduce una sola vez.
    musica.loop = false;

    // Intentar reproducir automáticamente al abrir la página.
    musica.play()
        .then(() => {
            boton.hidden = true;
        })
        .catch(() => {
            // Si el navegador bloquea el audio, mostrar el botón.
            boton.hidden = false;
        });

    // Reproducción manual cuando el visitante pulsa el botón.
    boton.addEventListener("click", () => {
        musica.play()
            .then(() => {
                boton.hidden = true;
            })
            .catch(() => {
                boton.hidden = false;
                boton.textContent = "No se pudo reproducir. Intenta nuevamente.";
            });
    });

    // No mostrar el botón cuando la canción termine.
    musica.addEventListener("ended", () => {
        boton.hidden = true;
    });

    // Mostrar el botón si el archivo de audio no puede cargarse.
    musica.addEventListener("error", () => {
        boton.hidden = false;
        boton.textContent = "No se pudo cargar la música";
    });
});
