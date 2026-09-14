import "server-only";

/**
 * Texto plano del PDF del resumen.
 *
 * El PDF nunca sale de este servidor. Si en algun momento se manda a una API
 * externa, primero hay que sacarle el bloque de cabecera: tiene CUIT, domicilio
 * y numero de cuenta.
 */
export async function extractPdfText(file: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(file));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
