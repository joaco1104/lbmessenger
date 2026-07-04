// Optimización server-side de imágenes de perfil (foto, banner, fondo).
//
// El cliente ya redimensiona/comprime antes de enviar (ver public/js/chat.js),
// pero eso es solo una ayuda: cualquiera podría llamar a la API directamente
// con una imagen sin procesar. Como MongoDB Atlas free tier solo da ~512MB,
// re-comprimimos aquí también antes de guardar, para no depender únicamente
// del navegador y mantener el tamaño real bajo control.
//
// Si algo falla (formato raro, memoria, etc.) se devuelve la imagen original
// tal cual llegó, para no romper la subida por un error de optimización.
const sharp = require('sharp');

const DATA_URI_REGEX = /^data:image\/(jpeg|gif);base64,([\s\S]+)$/;

async function optimizeDataUri(dataUri, maxDimension) {
  const match = DATA_URI_REGEX.exec(dataUri);
  if (!match) return dataUri;
  const [, type, base64] = match;

  try {
    const input = Buffer.from(base64, 'base64');
    const resizeOpts = { width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true };

    let output;
    if (type === 'gif') {
      // { animated: true } conserva todos los cuadros al redimensionar.
      output = await sharp(input, { animated: true }).resize(resizeOpts).gif().toBuffer();
    } else {
      output = await sharp(input).resize(resizeOpts).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    }

    // Si la "optimización" resultó más pesada (imagen ya muy chica/simple),
    // nos quedamos con la original.
    if (output.length >= input.length) return dataUri;
    return `data:image/${type};base64,${output.toString('base64')}`;
  } catch (err) {
    console.error('No se pudo optimizar la imagen, se guarda la original:', err.message);
    return dataUri;
  }
}

module.exports = { optimizeDataUri };
