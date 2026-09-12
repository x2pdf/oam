import * as Print from 'expo-print';
import html2pdf from 'html2pdf.js';
import type { GeneratePdfResult } from './pdfTypes';

export type { GeneratePdfResult } from './pdfTypes';
export { buildExportFilename } from './pdfTypes';

const PAGE_WIDTH_PX = 794;

function resolveHtml2Pdf(): typeof html2pdf {
  const mod = html2pdf as unknown as { default?: typeof html2pdf };
  const fn = typeof html2pdf === 'function' ? html2pdf : mod.default;
  if (typeof fn !== 'function') {
    throw new Error('html2pdf is not available');
  }
  return fn;
}

function loadSrcdoc(iframe: HTMLIFrameElement, html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Export HTML iframe timed out'));
    }, 15000);
    iframe.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    iframe.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('Failed to load export HTML'));
    };
    iframe.srcdoc = html;
  });
}

async function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

async function htmlToPdfBytes(html: string, filename: string): Promise<Uint8Array> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'oam-pdf-export');
  iframe.setAttribute(
    'style',
    [
      'position:fixed',
      'top:0',
      'left:0',
      `width:${PAGE_WIDTH_PX}px`,
      'height:1123px',
      'border:0',
      'background:#ffffff',
      'opacity:1',
      'pointer-events:none',
      'z-index:2147483646',
    ].join(';'),
  );
  document.body.appendChild(iframe);

  try {
    await loadSrcdoc(iframe, html);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc?.documentElement || !doc.body || !win) {
      throw new Error('Export iframe has no document');
    }

    await waitForImages(doc);
    const contentHeight = Math.max(
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight,
      1123,
    );
    iframe.style.height = `${contentHeight}px`;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const makePdf = resolveHtml2Pdf();
    const blob: Blob = await makePdf()
      .set({
        margin: [20, 0, 20, 0],
        filename,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          windowWidth: PAGE_WIDTH_PX,
          windowHeight: contentHeight,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      } as never)
      .from(doc.body)
      .outputPdf('blob');

    if (!blob || blob.size < 500) {
      throw new Error('Generated PDF is empty');
    }
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    iframe.remove();
  }
}

export async function generatePdfFromHtml(
  html: string,
  filename: string,
): Promise<GeneratePdfResult> {
  try {
    const bytes = await htmlToPdfBytes(html, filename);
    return { kind: 'bytes', bytes };
  } catch (e) {
    console.warn('html2pdf failed, falling back to print dialog', e);
    await Print.printAsync({ html });
    return { kind: 'printed' };
  }
}
