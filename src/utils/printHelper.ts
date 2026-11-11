function keepArmorerSignatureOnly(htmlContent: string): string {
  const document = new DOMParser().parseFromString(htmlContent, 'text/html');
  const title = (document.title || '').trim().toLowerCase();

  // Apply this layout change only to printouts from the ammunition, weapons, and vault modules.
  const isAmmoReceipt = title.startsWith('recibo de munição -');
  const isAmmoMovementReport = title.startsWith('relatório de movimentações - cofre ');
  const isAmmoVaultReport = title.startsWith('relatório de cofres de munições -');
  const isVaultInventory = title.startsWith('inventário do cofre - espaço ');
  const isArsenalInventory = title.startsWith('inventário oficial do arsenal -');

  if (!(isAmmoReceipt || isAmmoMovementReport || isAmmoVaultReport || isVaultInventory || isArsenalInventory)) {
    return htmlContent;
  }

  if (isArsenalInventory) {
    const signatureBoxes = Array.from(document.querySelectorAll('.signatures-container .signature-box'));
    signatureBoxes.slice(1).forEach(box => box.remove());
  } else {
    const signatureLines = Array.from(document.querySelectorAll('.signatures .sig-line'));
    const armorerLine = isAmmoReceipt
      ? signatureLines.find(line => line.textContent?.includes('Armeiro Operador')) || signatureLines[signatureLines.length - 1]
      : signatureLines[0];

    signatureLines.forEach(line => {
      if (line !== armorerLine) line.remove();
    });

    // The unit ammunition inventory uses .sig-box rather than .sig-line.
    const signatureBoxes = Array.from(document.querySelectorAll('.signatures .sig-box'));
    signatureBoxes.slice(1).forEach(box => box.remove());
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

export function printDocumentInPage(htmlContent: string) {
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

  frameDoc.open();
  frameDoc.write(keepArmorerSignatureOnly(htmlContent));
  frameDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Print error:', e);
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (e) {}
    }, 2000);
  }, 300);
}
