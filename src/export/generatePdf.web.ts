import type { GeneratePdfResult } from './pdfTypes';

export type { GeneratePdfResult } from './pdfTypes';
export { buildExportFilename } from './pdfTypes';

const PAGE_WIDTH_PX = 794;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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

async function printHtmlInBrowser(html: string): Promise<void> {
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
      'opacity:0',
      'pointer-events:none',
      'z-index:-1',
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

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(fallbackTimer);
        iframe.remove();
      };
      const fallbackTimer = window.setTimeout(() => {
        cleanup();
        resolve();
      }, 120000);
      win.addEventListener(
        'afterprint',
        () => {
          cleanup();
          resolve();
        },
        { once: true },
      );
      try {
        win.focus();
        win.print();
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  } catch (e) {
    iframe.remove();
    throw e;
  }
}

async function generateTauriPdf(html: string): Promise<Uint8Array> {
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = await invoke<number[]>('export_pdf', { html });
  if (!Array.isArray(bytes) || bytes.length < 500) {
    throw new Error('Generated PDF is empty');
  }
  return Uint8Array.from(bytes);
}

export async function generatePdfFromHtml(
  html: string,
  _filename: string,
): Promise<GeneratePdfResult> {
  if (isTauri()) {
    const bytes = await generateTauriPdf(html);
    return { kind: 'bytes', bytes };
  }

  await printHtmlInBrowser(html);
  return { kind: 'printed' };
}
