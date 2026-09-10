import * as Print from 'expo-print';
import type { GeneratePdfResult } from './pdfTypes';

export type { GeneratePdfResult } from './pdfTypes';
export { buildExportFilename } from './pdfTypes';

/** A4 at 72dpi, used by expo-print page size. */
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

export async function generatePdfFromHtml(
  html: string,
  _filename: string,
): Promise<GeneratePdfResult> {
  const result = await Print.printToFileAsync({
    html,
    width: A4_WIDTH,
    height: A4_HEIGHT,
  });
  return { kind: 'file', uri: result.uri };
}
