import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export interface StampOptions {
  authCode: string;
  verificationUrl: string;
  studentName?: string;
  courseTitle?: string;
  issueDate?: string;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-right';
  stampAllPages?: boolean;
}

/**
 * Generates a high quality QR Code data URL
 */
export async function generateQrCodeDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 300,
    color: {
      dark: '#0f172a', // Slate 900
      light: '#ffffff'
    }
  });
}

/**
 * Stamps a PDF with a verification QR Code and authenticity security box
 */
export async function stampPdfWithQrCode(
  pdfBuffer: ArrayBuffer | Uint8Array,
  options: StampOptions
): Promise<{ stampedPdfBytes: Uint8Array; stampedPdfBase64: string; qrDataUrl: string }> {
  const qrDataUrl = await generateQrCodeDataUrl(options.verificationUrl);
  const qrImageBytes = await fetch(qrDataUrl).then(res => res.arrayBuffer());

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  const pages = pdfDoc.getPages();
  const pagesToStamp = options.stampAllPages ? pages : [pages[0]];

  for (const page of pagesToStamp) {
    const { width, height } = page.getSize();

    // Box dimensions (PT)
    const boxWidth = 200;
    const boxHeight = 72;
    const padding = 6;
    const qrSize = 58;

    let boxX = width - boxWidth - 18;
    let boxY = 18;

    if (options.position === 'bottom-left') {
      boxX = 18;
      boxY = 18;
    } else if (options.position === 'bottom-center') {
      boxX = (width - boxWidth) / 2;
      boxY = 18;
    } else if (options.position === 'top-right') {
      boxX = width - boxWidth - 18;
      boxY = height - boxHeight - 18;
    }

    // 1. Draw solid background with subtle security border
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.98, 0.98, 0.99), // White/Off-white
      borderColor: rgb(0.2, 0.25, 0.35),
      borderWidth: 1,
      opacity: 0.95
    });

    // 2. Draw Top decorative header line
    page.drawRectangle({
      x: boxX,
      y: boxY + boxHeight - 3,
      width: boxWidth,
      height: 3,
      color: rgb(0.12, 0.45, 0.35) // Emerald/Dark green
    });

    // 3. Draw QR Code
    const qrX = boxX + padding;
    const qrY = boxY + (boxHeight - qrSize) / 2 - 1;
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize
    });

    // 4. Draw Authenticity Text & Security Metadata
    const textX = qrX + qrSize + 8;
    const textAvailableWidth = boxWidth - qrSize - padding * 2 - 8;

    // Header label
    page.drawText('AUTENTICIDADE DIGITAL', {
      x: textX,
      y: boxY + boxHeight - 14,
      size: 7.5,
      font: helveticaBold,
      color: rgb(0.08, 0.35, 0.25)
    });

    // Security subtitle
    page.drawText('Documento Validado ACADEPOL', {
      x: textX,
      y: boxY + boxHeight - 24,
      size: 6.5,
      font: helveticaFont,
      color: rgb(0.3, 0.35, 0.45)
    });

    // Auth Code Label
    page.drawText('Código de Verificação:', {
      x: textX,
      y: boxY + boxHeight - 35,
      size: 6,
      font: helveticaFont,
      color: rgb(0.4, 0.45, 0.5)
    });

    // Auth Code Value (Bold Monospace look)
    page.drawText(options.authCode, {
      x: textX,
      y: boxY + boxHeight - 46,
      size: 7,
      font: helveticaBold,
      color: rgb(0.1, 0.15, 0.25)
    });

    // Instructions
    page.drawText('Escaneie o QR Code para validar', {
      x: textX,
      y: boxY + boxHeight - 57,
      size: 5.5,
      font: helveticaFont,
      color: rgb(0.2, 0.4, 0.6)
    });

    page.drawText('ou acesse o portal de verificação', {
      x: textX,
      y: boxY + boxHeight - 65,
      size: 5,
      font: helveticaFont,
      color: rgb(0.45, 0.5, 0.55)
    });
  }

  const stampedPdfBytes = await pdfDoc.save();

  // Convert Uint8Array to Base64 cleanly
  let binary = '';
  const len = stampedPdfBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(stampedPdfBytes[i]);
  }
  const stampedPdfBase64 = btoa(binary);

  return {
    stampedPdfBytes,
    stampedPdfBase64,
    qrDataUrl
  };
}

/**
 * Utility to print a PDF by opening or loading it into a temporary iframe
 */
export function printPdfFromBase64(base64Data: string, title?: string) {
  try {
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    // Try printing with a hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.focus();
          iframe.contentWindow?.print();
        } catch {
          // Fallback to window open if iframe print fails
          window.open(blobUrl, '_blank');
        }
      }, 300);
    };

    document.body.appendChild(iframe);

    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      } catch {
        // cleanup ignore
      }
    }, 60000);
  } catch (err) {
    console.error('Error printing PDF:', err);
    // Fallback direct open
    const win = window.open();
    if (win) {
      win.document.write(
        `<iframe src="data:application/pdf;base64,${base64Data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
      );
      win.document.title = title || 'Certificado';
    }
  }
}
