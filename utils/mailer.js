// Envío de correo OTP vía Resend (API HTTP), en reemplazo de
// Nodemailer + SMTP. Se usa fetch nativo (Node >= 18, ya requerido en
// package.json) para no agregar dependencias nuevas.
//
// Se migra desde SMTP porque en Render (plan free) el puerto SMTP
// saliente suele estar bloqueado o es poco confiable, provocando los
// timeouts vistos en producción. Resend evita el protocolo SMTP: es
// una simple llamada HTTPS a su API.
const RESEND_API_URL = 'https://api.resend.com/emails';

// Timeout "duro" propio para toda la operación: aunque fetch no se
// cuelgue indefinidamente como SMTP, seguimos queriendo responder
// antes del gateway timeout de la plataforma si Resend tarda mucho.
const HARD_TIMEOUT_MS = 12000;

async function sendOTPEmail(toEmail, otpCode) {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env;

  if (!RESEND_API_KEY || !EMAIL_FROM) {
    // Falla rápido y con un mensaje claro en vez de intentar llamar a
    // la API sin credenciales válidas.
    throw new Error(
      'Configuración de Resend incompleta: revisa RESEND_API_KEY y EMAIL_FROM en las variables de entorno.'
    );
  }

  const html = `
    <div style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: auto; border: 2px solid #0055cc; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(to bottom, #4d90fe, #0055cc); padding: 14px; color: white;">
        <h2 style="margin:0;">LBMessenger</h2>
      </div>
      <div style="padding: 20px; background: #f0f4ff;">
        <p>Hola 👋</p>
        <p>Tu código de verificación es:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0055cc;">${otpCode}</p>
        <p>Este código expira en ${process.env.OTP_EXPIRES_MINUTES || 10} minutos.</p>
        <p style="color:#888; font-size:12px;">Si no solicitaste esto, ignora este correo.</p>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: toEmail,
        subject: 'Tu código de verificación - LBMessenger',
        html
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      // Resend responde JSON con detalle del error (401 credenciales,
      // 422 remitente/dominio no verificado, 429 rate limit, etc.).
      let details = '';
      try {
        const errorBody = await response.json();
        details = errorBody.message || JSON.stringify(errorBody);
      } catch (_) {
        details = await response.text().catch(() => '');
      }
      const err = new Error(
        `Resend respondió ${response.status}: ${details || 'sin detalle'}`
      );
      err.status = response.status;
      throw err;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(
        `Timeout: el envío de correo tardó más de ${HARD_TIMEOUT_MS}ms.`
      );
      timeoutErr.code = 'EMAIL_HARD_TIMEOUT';
      console.error('Error enviando correo OTP:', { message: timeoutErr.message });
      throw timeoutErr;
    }
    console.error('Error enviando correo OTP:', {
      message: err.message,
      status: err.status
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendOTPEmail };
