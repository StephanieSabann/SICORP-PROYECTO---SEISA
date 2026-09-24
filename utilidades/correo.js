/* Envío de correo OPCIONAL. Si no configuras nada, el sistema sigue
   funcionando normal — simplemente no manda el correo de verdad,
   solo se queda guardada la respuesta en la base de datos (que es lo
   que de verdad importa para el historial).

   Para activarlo de verdad:

   1) Corre en la terminal, dentro de la carpeta del proyecto:
        npm install nodemailer

   2) Agrega esto a tu archivo .env (con un correo de Gmail y una
      "contraseña de aplicación" — NO tu contraseña normal de Gmail,
      Google te deja generar una especial para esto en la
      configuración de seguridad de tu cuenta):

        EMAIL_USUARIO=tucorreo@gmail.com
        EMAIL_CLAVE=la_contraseña_de_aplicación_de_16_letras

   Mientras esas dos líneas no existan en tu .env, o mientras no
   instales nodemailer, esta función simplemente no hace nada (y no
   truena) — devuelve enviado:false para que el resto del sistema
   sepa que no se mandó, pero sin lanzar ningún error. */

async function enviarCorreoRespuesta({ para, asuntoOriginal, textoRespuesta }) {
    if (!process.env.EMAIL_USUARIO || !process.env.EMAIL_CLAVE) {
        return { enviado: false, motivo: "No hay credenciales de correo configuradas en .env." };
    }

    let nodemailer;
    try {
        nodemailer = require("nodemailer");
    } catch (error) {
        return { enviado: false, motivo: 'Falta instalar nodemailer (corre "npm install nodemailer").' };
    }

    try {
        const transportador = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USUARIO,
                pass: process.env.EMAIL_CLAVE
            }
        });

        await transportador.sendMail({
            from: `"SICORP — SEISA" <${process.env.EMAIL_USUARIO}>`,
            to: para,
            subject: "Re: " + (asuntoOriginal || "tu mensaje a SEISA"),
            text: textoRespuesta
        });

        return { enviado: true };
    } catch (error) {
        console.error("Error al enviar el correo de respuesta:", error);
        return { enviado: false, motivo: "Hubo un error al mandar el correo: " + error.message };
    }
}

module.exports = { enviarCorreoRespuesta };