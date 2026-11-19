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

const PRINT_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 caracteres sem ambiguidade (sem 0/O/1/I/L)
const PRINT_CODE_STORAGE_SEQ_KEY = 'armaria_print_code_monotonic_v1';
const MASK_45 = (1n << 45n) - 1n;

let lastMonotonicCounter = 0n;
const issuedPrintCodesInSession = new Set<string>();
let globalPrintHookInitialized = false;
let activeWindowPrintCode: string | null = null;

function readPersistedCounter(): bigint {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PRINT_CODE_STORAGE_SEQ_KEY);
      if (raw && /^\d+$/.test(raw)) {
        return BigInt(raw);
      }
    }
  } catch {
    // Ignorar falha de acesso ao localStorage em modo privado/restrito
  }
  return 0n;
}

function writePersistedCounter(value: bigint): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PRINT_CODE_STORAGE_SEQ_KEY, value.toString());
    }
  } catch {
    // Ignorar falha de gravação no localStorage
  }
}

/**
 * Permutação bijetiva em 45 bits (cada etapa é invertível mod 2^45):
 * garante que contadores monotônicos distintos NUNCA colidam e tenham aparência totalmente aleatória.
 */
function scramble45Bijective(value: bigint): bigint {
  let x = value & MASK_45;
  x = ((x ^ (x >> 22n)) * 0x1b873593d75n) & MASK_45; // multiplicador ímpar -> bijeção estrita mod 2^45
  x = ((x ^ (x >> 21n)) * 0x165667b19e3n) & MASK_45; // multiplicador ímpar -> bijeção estrita mod 2^45
  x = (x ^ (x >> 22n)) & MASK_45;
  return x;
}

function encodeBase32Fixed(value: bigint, length: number): string {
  let remaining = value;
  const chars = new Array<string>(length);
  for (let i = length - 1; i >= 0; i--) {
    chars[i] = PRINT_CODE_ALPHABET[Number(remaining & 31n)];
    remaining >>= 5n;
  }
  return chars.join('');
}

function generateCryptoBase32(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PRINT_CODE_ALPHABET[bytes[i] & 31];
  }
  return out;
}

/**
 * Gera um código aleatório único e irrepetível para documentos impressos.
 * Combina 45 bits de contador monotônico persistido (permutado bijetivamente) + 35 bits de CSPRNG
 * (80 bits totais em 16 caracteres Base32 sem ambiguidade visual): DOC-XXXX-XXXX-XXXX-XXXX.
 */
export function generateUniquePrintCode(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const persisted = readPersistedCounter();
    const base = lastMonotonicCounter > persisted ? lastMonotonicCounter : persisted;
    const nowMs = BigInt(Date.now());
    const nextCounter = nowMs > base ? nowMs : base + 1n;
    lastMonotonicCounter = nextCounter;
    writePersistedCounter(nextCounter);

    const uniquePart = encodeBase32Fixed(scramble45Bijective(nextCounter), 9); // 9 chars bijetivos (nunca repete)
    const randomPart = generateCryptoBase32(7); // 7 chars CSPRNG (34,3 bilhões de combinações por ms)

    // Intercala os caracteres para distribuição visual totalmente aleatória
    const merged: string[] = [];
    for (let i = 0; i < 9; i++) {
      merged.push(uniquePart[i]);
      if (i < randomPart.length) {
        merged.push(randomPart[i]);
      }
    }

    const raw = merged.join(''); // 16 caracteres
    const formatted = `DOC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
    if (!issuedPrintCodesInSession.has(formatted)) {
      issuedPrintCodesInSession.add(formatted);
      return formatted;
    }
  }

  // Fallback extremo (nunca esperado)
  const fallback = generateCryptoBase32(16);
  const formatted = `DOC-${fallback.slice(0, 4)}-${fallback.slice(4, 8)}-${fallback.slice(8, 12)}-${fallback.slice(12, 16)}`;
  issuedPrintCodesInSession.add(formatted);
  return formatted;
}

function formatPrintIssuedAtBr(): string {
  try {
    return new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return new Date().toLocaleString('pt-BR');
  }
}

const WINDOW_PRINT_STAMP_ID = 'armaria-window-print-stamp';
const WINDOW_PRINT_STYLE_ID = 'armaria-window-print-stamp-style';

function removeWindowPrintCodeStamp(): void {
  activeWindowPrintCode = null;
  if (typeof document === 'undefined') return;
  const el = document.getElementById(WINDOW_PRINT_STAMP_ID);
  if (el) el.remove();
  const st = document.getElementById(WINDOW_PRINT_STYLE_ID);
  if (st) st.remove();
}

function attachWindowPrintCodeStamp(forcedCode?: string): string {
  const code = forcedCode || activeWindowPrintCode || generateUniquePrintCode();
  activeWindowPrintCode = code;

  if (typeof document === 'undefined' || !document.body) return code;

  let styleEl = document.getElementById(WINDOW_PRINT_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = WINDOW_PRINT_STYLE_ID;
    styleEl.textContent = `
      #${WINDOW_PRINT_STAMP_ID} {
        display: none !important;
      }
      @media print {
        body {
          padding-bottom: 24px !important;
        }
        #${WINDOW_PRINT_STAMP_ID} {
          display: flex !important;
          visibility: visible !important;
          position: fixed !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2147483647 !important;
          justify-content: space-between !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 4px 10px !important;
          background: #ffffff !important;
          border-top: 1px solid #475569 !important;
          color: #0f172a !important;
          font-family: "Courier New", Courier, monospace !important;
          font-size: 8.5px !important;
          line-height: 1.25 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #${WINDOW_PRINT_STAMP_ID} .armaria-wp-code {
          font-weight: 900 !important;
          letter-spacing: 0.6px !important;
          color: #000000 !important;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  let stampEl = document.getElementById(WINDOW_PRINT_STAMP_ID);
  if (!stampEl) {
    stampEl = document.createElement('div');
    stampEl.id = WINDOW_PRINT_STAMP_ID;
    document.body.appendChild(stampEl);
  }

  const issuedAt = formatPrintIssuedAtBr();
  stampEl.setAttribute('data-armaria-print-code', code);
  stampEl.innerHTML = `
    <span>CÓDIGO ÚNICO DO DOCUMENTO: <span class="armaria-wp-code">${escapeHtmlText(code)}</span></span>
    <span>Emissão: ${escapeHtmlText(issuedAt)} • Sistema ARMARIA PCMG</span>
  `;

  return code;
}

/**
 * Registra gancho global para que até mesmo impressões diretas (Ctrl+P) recebam código único irrepetível.
 */
export function initGlobalPrintCodeHook(): void {
  if (globalPrintHookInitialized || typeof window === 'undefined') return;
  globalPrintHookInitialized = true;

  window.addEventListener('beforeprint', () => {
    if (!activeWindowPrintCode) {
      attachWindowPrintCodeStamp();
    }
  });

  window.addEventListener('afterprint', () => {
    setTimeout(() => {
      removeWindowPrintCodeStamp();
    }, 150);
  });
}

if (typeof window !== 'undefined') {
  initGlobalPrintCodeHook();
}

export function injectUniquePrintCodeIntoHtml(htmlContent: string, printCode?: string): string {
  const code = printCode || generateUniquePrintCode();
  const issuedAt = formatPrintIssuedAtBr();

  if (typeof DOMParser === 'undefined') {
    const fallbackBanner = `<div data-armaria-print-code="${escapeHtmlText(code)}" style="margin-top:8px;padding:5px 10px;border:1px solid #475569;border-radius:4px;background:#f8fafc;color:#0f172a;font-family:'Courier New',Courier,monospace;font-size:9px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid;"><span><strong>CÓDIGO ÚNICO DO DOCUMENTO:</strong> <strong style="letter-spacing:0.6px;color:#000;">${escapeHtmlText(code)}</strong></span><span>Emissão: ${escapeHtmlText(issuedAt)} • Sistema ARMARIA PCMG</span></div>`;
    if (/<\/body>/i.test(htmlContent)) {
      return htmlContent.replace(/<\/body>/i, `${fallbackBanner}</body>`);
    }
    return `${htmlContent}${fallbackBanner}`;
  }

  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  if (!doc.body || doc.querySelector('[data-armaria-print-code]')) {
    return htmlContent;
  }

  const stampStyle = doc.createElement('style');
  stampStyle.setAttribute('data-armaria-print-code-style', 'true');
  stampStyle.textContent = `
    .armaria-doc-code-topbar {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 2px 6px 4px 6px !important;
      margin: 0 0 6px 0 !important;
      border-bottom: 1px dashed #64748b !important;
      font-family: "Courier New", Courier, monospace !important;
      font-size: 8.5px !important;
      line-height: 1.25 !important;
      color: #0f172a !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .armaria-doc-code-topbar strong,
    .armaria-doc-code-footer strong,
    .armaria-doc-code-inline strong {
      font-weight: 900 !important;
      letter-spacing: 0.6px !important;
      color: #000000 !important;
    }
    .armaria-doc-code-footer {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 8px !important;
      margin-top: 8px !important;
      padding: 5px 10px !important;
      border: 1px solid #475569 !important;
      border-radius: 4px !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      font-family: "Courier New", Courier, monospace !important;
      font-size: 8.5px !important;
      line-height: 1.3 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .armaria-doc-code-inline {
      margin-top: 3px !important;
      font-family: "Courier New", Courier, monospace !important;
      font-size: 8.5px !important;
      color: #0f172a !important;
      font-weight: 700 !important;
    }
  `;
  doc.head.appendChild(stampStyle);

  // 1. Micro-faixa superior com o código único visível logo no topo do documento
  const topBar = doc.createElement('div');
  topBar.className = 'armaria-doc-code-topbar';
  topBar.setAttribute('data-armaria-print-code', code);
  topBar.innerHTML = `
    <span>CÓDIGO ÚNICO DO DOCUMENTO: <strong>${escapeHtmlText(code)}</strong></span>
    <span>Emissão: ${escapeHtmlText(issuedAt)}</span>
  `;
  doc.body.insertBefore(topBar, doc.body.firstChild);

  // 2. Se o documento possuir múltiplos rodapés por página (ex.: Página 1 de 2 e Página 2 de 2),
  // inclui a referência do código em cada rodapé para rastreabilidade em todas as folhas.
  const existingFooters = Array.from(doc.querySelectorAll('.footer-note, .footer'));
  if (existingFooters.length > 1) {
    existingFooters.forEach(footerEl => {
      const inlineCode = doc.createElement('div');
      inlineCode.className = 'armaria-doc-code-inline';
      inlineCode.innerHTML = `Código Único do Documento: <strong>${escapeHtmlText(code)}</strong>`;
      footerEl.appendChild(inlineCode);
    });
  }

  // 3. Faixa institucional de validação no rodapé final do documento
  const footerBar = doc.createElement('div');
  footerBar.className = 'armaria-doc-code-footer';
  footerBar.setAttribute('data-armaria-print-code-footer', code);
  footerBar.innerHTML = `
    <span>CÓDIGO ÚNICO DE CONTROLE / IMPRESSÃO: <strong>${escapeHtmlText(code)}</strong></span>
    <span>Emissão: ${escapeHtmlText(issuedAt)} • Sistema ARMARIA PCMG</span>
  `;
  doc.body.appendChild(footerBar);

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

export function printWithWindowTitle(docTitle: string) {
  const safeTitle = sanitizeDocumentName(docTitle);
  const previousTitle = typeof document !== 'undefined' ? document.title : '';
  let restored = false;

  attachWindowPrintCodeStamp(generateUniquePrintCode());

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    if (typeof document !== 'undefined') {
      document.title = previousTitle;
    }
    removeWindowPrintCodeStamp();
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

  const uniquePrintCode = generateUniquePrintCode();
  let processedHtml = keepArmorerSignatureOnly(htmlContent);
  processedHtml = injectUniquePrintCodeIntoHtml(processedHtml, uniquePrintCode);
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
