import { generateServiceWorker } from "../src/pwa/generate.ts";

// Se ejecuta tras `next build`: escribe out/sw.js con los ficheros del sitio exportado.
const { version, urls } = await generateServiceWorker("out", "src/pwa/sw.template.js");
console.log(`sw.js generado: versión ${version}, ${urls.length} ficheros precargados`);
