export function sanitizeDocumentName(rawName: string): string {
  return String(rawName ?? '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/^[-\s.]+|[-\s.]+$/g, '')
    .trim();
}

export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildStandardDocumentTitle(
  documentTypeWithModule: string,
  identification?: string | number | null,
  signerName?: string | null
): string {
  const parts = [documentTypeWithModule, identification, signerName]
    .map(part => sanitizeDocumentName(String(part ?? '')))
    .filter(Boolean);

  return parts.join(' - ') || 'Documento - Sistema Armaria PCMG';
}

export function buildStandardDocumentFilename(
  documentTypeWithModule: string,
  identification?: string | number | null,
  signerName?: string | null,
  extension: string = 'pdf'
): string {
  const cleanExt = extension.replace(/^\.+/, '').trim() || 'pdf';
  const baseTitle = buildStandardDocumentTitle(documentTypeWithModule, identification, signerName);
  return `${baseTitle}.${cleanExt}`;
}

export function printWithWindowTitle(docTitle: string) {
  const safeTitle = sanitizeDocumentName(docTitle);
  const previousTitle = typeof document !== 'undefined' ? document.title : '';
  let restored = false;

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    if (typeof document !== 'undefined') {
      document.title = previousTitle;
    }
  };

  if (typeof document !== 'undefined' && safeTitle) {
    document.title = safeTitle;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('afterprint', restoreTitle, { once: true });
    setTimeout(restoreTitle, 60000);
    window.print();
  }
}

function keepArmorerSignatureOnly(htmlContent: string): string {
  const document = new DOMParser().parseFromString(htmlContent, 'text/html');
  const title = (document.title || '').trim().toLowerCase();

  // Apply this layout change only to printouts from the ammunition, weapons, and vault modules.
  const isAmmoReceipt =
    title.startsWith('recibo de munição -') ||
    title.startsWith('recibo de munição (munições) -');
  const isAmmoMovementReport =
    title.startsWith('relatório de movimentações - cofre ') ||
    title.startsWith('relatório de movimentações (munições) - cofre ');
  const isAmmoVaultReport =
    title.startsWith('relatório de cofres de munições -') ||
    title.startsWith('relatório de cofres de munições (munições) -');
  const isVaultInventory =
    title.startsWith('inventário do cofre - espaço ') ||
    title.startsWith('inventário do cofre (cofres) -');
  const isArsenalInventory =
    title.startsWith('inventário oficial do arsenal -') ||
    title.startsWith('inventário oficial do arsenal (armas) -');

  if (!(isAmmoReceipt || isAmmoMovementReport || isAmmoVaultReport || isVaultInventory || isArsenalInventory)) {
    return htmlContent;
  }

  if (isArsenalInventory) {
    const containers = Array.from(document.querySelectorAll('.signatures-container'));
    containers.forEach(container => {
      const signatureBoxes = Array.from(container.querySelectorAll('.signature-box'));
      signatureBoxes.slice(1).forEach(box => box.remove());
    });
  } else {
    const signatureContainers = Array.from(document.querySelectorAll('.signatures'));
    signatureContainers.forEach(container => {
      const signatureBoxes = Array.from(container.querySelectorAll('.sig-box'));
      if (signatureBoxes.length > 1) {
        signatureBoxes.slice(1).forEach(box => box.remove());
      }

      const signatureLines = Array.from(container.querySelectorAll('.sig-line'));
      if (signatureLines.length > 1) {
        const armorerLine = isAmmoReceipt
          ? signatureLines.find(line => line.textContent?.includes('Armeiro Operador')) || signatureLines[signatureLines.length - 1]
          : signatureLines[0];

        signatureLines.forEach(line => {
          if (line !== armorerLine) line.remove();
        });
      }
    });
  }

  const printStyle = document.createElement('style');
  printStyle.textContent = `
    .signatures {
      display: grid !important;
      grid-template-columns: minmax(0, 250px) !important;
      justify-content: center !important;
      text-align: center !important;
    }
    .signatures .sig-line,
    .signatures .sig-box {
      justify-self: center !important;
      width: 250px !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    .signatures-container {
      display: grid !important;
      grid-template-columns: minmax(0, 300px) !important;
      justify-content: center !important;
    }
    .signatures-container .signature-box {
      width: 100% !important;
      max-width: 300px !important;
      justify-self: center !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(printStyle);

  return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
}

export function printDocumentInPage(htmlContent: string, overrideTitle?: string) {
  // Remove any previously existing print iframe
  const existingFrame = document.getElementById('system-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'system-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = '0px';
  iframe.style.zIndex = '-9999';

  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!frameDoc) return;

  let processedHtml = keepArmorerSignatureOnly(htmlContent);
  if (typeof window !== 'undefined' && window.location?.origin && !/<base\s/i.test(processedHtml)) {
    const baseTag = `<base href="${window.location.origin}/" />`;
    if (/<head[^>]*>/i.test(processedHtml)) {
      processedHtml = processedHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      processedHtml = `${baseTag}${processedHtml}`;
    }
  }

  frameDoc.open();
  frameDoc.write(processedHtml);
  frameDoc.close();

  const parsedDocTitle = sanitizeDocumentName(overrideTitle || frameDoc.title || '');
  if (parsedDocTitle) {
    frameDoc.title = parsedDocTitle;
  }

  let hasPrinted = false;
  let cleanedUp = false;
  const previousParentTitle = typeof document !== 'undefined' ? document.title : '';

  const cleanupPrintSession = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (typeof document !== 'undefined') {
      document.title = previousParentTitle;
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (e) {}
    }, 500);
  };

  const triggerPrint = () => {
    if (hasPrinted) return;
    hasPrinted = true;
    try {
      if (typeof document !== 'undefined' && parsedDocTitle) {
        document.title = parsedDocTitle;
      }
      iframe.contentWindow?.addEventListener('afterprint', cleanupPrintSession, { once: true });
      if (typeof window !== 'undefined') {
        window.addEventListener('afterprint', cleanupPrintSession, { once: true });
      }
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print error:', e);
    }
    setTimeout(cleanupPrintSession, 60000);
  };

  const images = Array.from(frameDoc.images || []);
  if (images.length === 0) {
    setTimeout(triggerPrint, 200);
    return;
  }

  const waitForImg = (img: HTMLImageElement) =>
    new Promise<void>(resolve => {
      const finish = () => {
        if (typeof img.decode === 'function') {
          img
            .decode()
            .catch(() => {})
            .finally(() => resolve());
        } else {
          resolve();
        }
      };

      if (img.complete) {
        finish();
      } else {
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      }
    });

  Promise.all(images.map(waitForImg)).then(() => {
    setTimeout(triggerPrint, 120);
  });

  // Fallback caso alguma imagem externa demore mais que o esperado
  setTimeout(triggerPrint, 2500);
}
