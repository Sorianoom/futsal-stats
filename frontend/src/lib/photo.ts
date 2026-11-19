/** Fotos de jugadores: se recortan en cuadrado y se reducen en el navegador antes de subirlas. */

/** Lado de la foto guardada, en px: de sobra para la ficha más grande (y pantallas retina). */
export const PHOTO_SIZE = 384;
const QUALITY = 0.85;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Recorta el centro de la imagen en cuadrado y la reduce a PHOTO_SIZE. Sale en WebP; si el
 * navegador no sabe codificarlo, en JPEG. Lanza un Error si el fichero no es una imagen legible.
 */
export async function squarePhoto(file: Blob): Promise<Blob> {
  // createImageBitmap respeta la orientación EXIF de las fotos del móvil.
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Sin canvas");
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE,
    );
    const webp = await toBlob(canvas, "image/webp");
    if (webp?.type === "image/webp") return webp;
    const jpeg = await toBlob(canvas, "image/jpeg");
    if (!jpeg) throw new Error("No se pudo preparar la foto");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
