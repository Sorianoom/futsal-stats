import { generateServiceWorker } from "../src/pwa/generate.ts";

// Se ejecuta tras `next build`: escribe out/sw.js con los ficheros del sitio exportado y una copia
// en public/, que es lo que Vercel publica (lo añadido a out/ después del build no se sirve).
const { version, urls } = await generateServiceWorker("out", "src/pwa/sw.template.js", "public");
console.log(`sw.js generado: versión ${version}, ${urls.length} ficheros precargados`);
