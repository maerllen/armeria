import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';

// ============================================================================
// PALETA E CONSTANTES INSTITUCIONAIS (IDÊNTICAS AOS RELATÓRIOS DO SISTEMA)
// ============================================================================
export const PCMG_COLORS = {
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
  ink: rgb(0.059, 0.09, 0.165), // #0f172a
  slate900: rgb(0.067, 0.094, 0.153), // #111827
  slate800: rgb(0.118, 0.161, 0.231), // #1e293b
  slate700: rgb(0.2, 0.255, 0.333), // #334155
  slate600: rgb(0.278, 0.333, 0.412), // #475569
  slate500: rgb(0.392, 0.455, 0.545), // #64748b
  slate400: rgb(0.58, 0.639, 0.722), // #94a3b8
  slate300: rgb(0.796, 0.835, 0.882), // #cbd5e1
  slate200: rgb(0.886, 0.91, 0.941), // #e2e8f0
  slate100: rgb(0.945, 0.961, 0.976), // #f1f5f9
  slate50: rgb(0.973, 0.98, 0.988), // #f8fafc
  grayRow: rgb(0.976, 0.98, 0.984), // #f9fafb
  amber700: rgb(0.706, 0.325, 0.035), // #b45309
  amber600: rgb(0.851, 0.467, 0.024), // #d97706
  amberBg: rgb(0.996, 0.953, 0.78), // #fef3c7
  amberBorder: rgb(0.988, 0.827, 0.302), // #fcd34d
  amberText: rgb(0.573, 0.251, 0.055), // #92400e
  emerald700: rgb(0.016, 0.471, 0.341), // #047857
  emeraldBg: rgb(0.82, 0.98, 0.898), // #d1fae5
  emeraldBorder: rgb(0.431, 0.906, 0.718), // #6ee7b7
  emeraldText: rgb(0.024, 0.373, 0.275), // #065f46
  redBg: rgb(0.996, 0.886, 0.886), // #fee2e2
  redBorder: rgb(0.988, 0.647, 0.647), // #fca5a5
  redText: rgb(0.6, 0.106, 0.106), // #991b1b
  sky700: rgb(0.012, 0.412, 0.631), // #0369a1
  purple700: rgb(0.427, 0.157, 0.851) // #6d28d9
};

const DOC_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

let cachedDefaultLogoBytes: Buffer | null | undefined = undefined;

function loadDefaultSystemLogoBytes(): Buffer | null {
  if (cachedDefaultLogoBytes !== undefined) return cachedDefaultLogoBytes;
  const candidates = [
    path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'Distintivo_da_Pol_cia_Civil_de_Minas_Gerais_15bab05c.png'),
    path.resolve(process.cwd(), 'dist', 'assets', 'aistudio', 'Distintivo_da_Pol_cia_Civil_de_Minas_Gerais_15bab05c.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedDefaultLogoBytes = fs.readFileSync(p);
        return cachedDefaultLogoBytes;
      }
    } catch {
      // ignora
    }
  }
  cachedDefaultLogoBytes = null;
  return null;
}

export async function tryEmbedSystemLogo(doc: PDFDocument, dataUri?: string | null): Promise<PDFImage | null> {
  if (dataUri && typeof dataUri === 'string') {
    const match = dataUri.trim().match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (match) {
      try {
        const kind = match[1].toLowerCase();
        const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
        if (bytes.length > 0 && bytes.length <= 4 * 1024 * 1024) {
          if (kind === 'png') return await doc.embedPng(bytes);
          return await doc.embedJpg(bytes);
        }
      } catch {
        // tenta fallback padrão
      }
    }
  }

  const defaultBytes = loadDefaultSystemLogoBytes();
  if (defaultBytes) {
    try {
      return await doc.embedPng(defaultBytes);
    } catch {
      return null;
    }
  }
  return null;
}

export function generateUniqueDocControlCode(): string {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (let i = 0; i < 16; i++) {
    raw += DOC_CODE_ALPHABET[bytes[i] & 31];
  }
  return `DOC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function sanitizePdfText(input?: string | null): string {
  return String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ')
    .trim();
}

export function formatDateTimeBr(date: Date): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
}

export function formatMaspBr(masp?: string | null): string {
  const digits = String(masp || '').replace(/\D/g, '');
  if (!digits) return String(masp || 'N/I');
  if (digits.length === 7) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

export function formatIntBr(n: number): string {
  try {
    return new Intl.NumberFormat('pt-BR').format(Math.round(n || 0));
  } catch {
    return String(Math.round(n || 0));
  }
}

export function formatDecimalBr(n: number): string {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0';
  try {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: Number.isInteger(num) ? 0 : 1,
      maximumFractionDigits: 3
    }).format(num);
  } catch {
    return String(num);
  }
}

function normalizeUpperAscii(val?: string | null): string {
  return String(val || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function fitTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
  const clean = sanitizePdfText(text).replace(/\n/g, ' ');
  if (!clean) return '-';
  if (font.widthOfTextAtSize(clean, fontSize) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

export function wrapCellLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines = 6
): string[] {
  const clean = sanitizePdfText(text);
  if (!clean) return ['-'];

  const paragraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const words = trimmed.split(' ');
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let part = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(part + ch, fontSize) > maxWidth) {
              if (part) lines.push(part);
              part = ch;
            } else {
              part += ch;
            }
          }
          current = part;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }

  if (lines.length === 0) return ['-'];
  if (lines.length <= maxLines) return lines;
  const sliced = lines.slice(0, maxLines);
  sliced[maxLines - 1] = fitTextToWidth(`${sliced[maxLines - 1]}...`, font, fontSize, maxWidth);
  return sliced;
}

// Micro-faixa superior idêntica ao `armaria-doc-code-topbar` do printHelper.ts
export function drawTopUniqueCodeBar(
  page: PDFPage,
  pageWidth: number,
  pageHeight: number,
  marginX: number,
  fontMono: PDFFont,
  fontMonoBold: PDFFont,
  docCode: string,
  emissaoBr: string
): number {
  const topY = pageHeight - 20;
  const leftLabel = 'CODIGO UNICO DO DOCUMENTO: ';
  const leftLabelW = fontMono.widthOfTextAtSize(leftLabel, 7.3);

  page.drawText(leftLabel, {
    x: marginX,
    y: topY,
    size: 7.3,
    font: fontMono,
    color: PCMG_COLORS.ink
  });
  page.drawText(docCode, {
    x: marginX + leftLabelW,
    y: topY,
    size: 7.3,
    font: fontMonoBold,
    color: PCMG_COLORS.black
  });

  const rightText = `Emissao: ${emissaoBr}`;
  const rightW = fontMono.widthOfTextAtSize(rightText, 7.3);
  page.drawText(rightText, {
    x: pageWidth - marginX - rightW,
    y: topY,
    size: 7.3,
    font: fontMono,
    color: PCMG_COLORS.ink
  });

  // Linha tracejada inferior (#64748b)
  const lineY = topY - 4.5;
  page.drawLine({
    start: { x: marginX, y: lineY },
    end: { x: pageWidth - marginX, y: lineY },
    thickness: 0.6,
    dashArray: [3, 2],
    color: PCMG_COLORS.slate500
  });

  return lineY - 8;
}

// Faixa inferior idêntica ao `.footer` + `armaria-doc-code-footer` do printHelper.ts
export function drawInstitutionalFooters(params: {
  doc: PDFDocument;
  marginX: number;
  pageWidth: number;
  fontMono: PDFFont;
  fontMonoBold: PDFFont;
  docCode: string;
  emissaoBr: string;
  footerLeftText: string;
}): void {
  const pages = params.doc.getPages();
  const totalPages = pages.length;
  const contentWidth = params.pageWidth - params.marginX * 2;

  pages.forEach((p, idx) => {
    // 1. Linha discreta + texto de rodapé do módulo
    const moduleFooterY = 34;
    p.drawLine({
      start: { x: params.marginX, y: moduleFooterY + 10 },
      end: { x: params.pageWidth - params.marginX, y: moduleFooterY + 10 },
      thickness: 0.6,
      color: PCMG_COLORS.slate300
    });

    p.drawText(fitTextToWidth(params.footerLeftText, params.fontMono, 7.2, contentWidth - 110), {
      x: params.marginX,
      y: moduleFooterY + 1,
      size: 7.2,
      font: params.fontMono,
      color: PCMG_COLORS.slate500
    });

    const pageStr = `Pagina ${idx + 1} de ${totalPages}`;
    const pageW = params.fontMonoBold.widthOfTextAtSize(pageStr, 7.2);
    p.drawText(pageStr, {
      x: params.pageWidth - params.marginX - pageW,
      y: moduleFooterY + 1,
      size: 7.2,
      font: params.fontMonoBold,
      color: PCMG_COLORS.slate600
    });

    // 2. Faixa institucional de validação (armaria-doc-code-footer)
    const boxY = 12;
    const boxH = 16;
    p.drawRectangle({
      x: params.marginX,
      y: boxY,
      width: contentWidth,
      height: boxH,
      color: PCMG_COLORS.slate50,
      borderColor: PCMG_COLORS.slate600,
      borderWidth: 0.75
    });

    const ctrlLabel = 'CODIGO UNICO DE CONTROLE / IMPRESSAO: ';
    const ctrlLabelW = params.fontMonoBold.widthOfTextAtSize(ctrlLabel, 7.1);
    p.drawText(ctrlLabel, {
      x: params.marginX + 6,
      y: boxY + 5,
      size: 7.1,
      font: params.fontMonoBold,
      color: PCMG_COLORS.ink
    });
    p.drawText(params.docCode, {
      x: params.marginX + 6 + ctrlLabelW,
      y: boxY + 5,
      size: 7.1,
      font: params.fontMonoBold,
      color: PCMG_COLORS.black
    });

    const rightCtrl = `Emissao: ${params.emissaoBr} - Sistema ARMARIA PCMG`;
    const rightCtrlW = params.fontMono.widthOfTextAtSize(rightCtrl, 7.1);
    p.drawText(rightCtrl, {
      x: params.pageWidth - params.marginX - 6 - rightCtrlW,
      y: boxY + 5,
      size: 7.1,
      font: params.fontMono,
      color: PCMG_COLORS.ink
    });
  });
}

// ============================================================================
// AUXILIARES DE AGRUPAMENTO POR UNIDADE E TABELA RESUMO (1ª PÁGINA POR UNIDADE)
// ============================================================================
function groupRecordsByUnit<T extends { unidadeNome: string }>(
  records: T[]
): Array<{ unitName: string; records: T[] }> {
  const map = new Map<string, T[]>();
  for (const r of records) {
    const unitName = String(r.unidadeNome || 'Sem Unidade').trim() || 'Sem Unidade';
    const list = map.get(unitName) || [];
    list.push(r);
    map.set(unitName, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([unitName, list]) => ({ unitName, records: list }));
}

function cleanSummaryVal(val?: string | null): string {
  const s = String(val || '').trim();
  if (!s || s === '-' || s === '—' || s.toUpperCase() === 'N/A') return '';
  return s;
}

function formatUnitsLabel(qty: number, capitalized = false): string {
  const unitWord =
    qty === 1
      ? capitalized
        ? 'Unidade'
        : 'unidade'
      : capitalized
        ? 'Unidades'
        : 'unidades';
  return `${formatIntBr(qty)} ${unitWord}`;
}

interface SummaryColSpec {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  mono?: boolean;
}

function drawSummaryTableWithPagination(params: {
  page: PDFPage;
  cursorY: number;
  marginX: number;
  pageWidth: number;
  contentWidth: number;
  footerSafeY: number;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  fontMono: PDFFont;
  fontMonoBold: PDFFont;
  sectionTitle: string;
  headerVariant: 'dark' | 'light-bar' | 'light-underline' | 'slate800-amber';
  columns: SummaryColSpec[];
  rows: Array<Record<string, string>>;
  totalLabel: string;
  totalValue: string;
  onNewPage: () => { page: PDFPage; cursorY: number };
}): { page: PDFPage; cursorY: number } {
  let { page, cursorY } = params;
  const { marginX, pageWidth, contentWidth, footerSafeY, fontRegular, fontBold, fontMono, fontMonoBold, columns } = params;

  const drawTitleAndHeader = (isContinuation: boolean) => {
    const titleStr = isContinuation ? `${params.sectionTitle} (CONTINUACAO)` : params.sectionTitle;

    if (params.headerVariant === 'light-bar') {
      const secH = 19;
      page.drawRectangle({
        x: marginX,
        y: cursorY - secH,
        width: contentWidth,
        height: secH,
        color: PCMG_COLORS.ink
      });
      page.drawText(fitTextToWidth(titleStr, fontBold, 8.4, contentWidth - 16), {
        x: marginX + 8,
        y: cursorY - 12.8,
        size: 8.4,
        font: fontBold,
        color: PCMG_COLORS.white
      });
      cursorY -= secH;

      const thH = 20;
      page.drawRectangle({
        x: marginX,
        y: cursorY - thH,
        width: contentWidth,
        height: thH,
        color: PCMG_COLORS.slate100,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.7
      });
      let colX = marginX;
      for (const col of columns) {
        page.drawRectangle({
          x: colX,
          y: cursorY - thH,
          width: col.width,
          height: thH,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.5
        });
        const lbl = fitTextToWidth(col.label, fontBold, 7.6, col.width - 10);
        const tx =
          col.align === 'right'
            ? colX + col.width - 6 - fontBold.widthOfTextAtSize(lbl, 7.6)
            : col.align === 'center'
              ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 7.6)) / 2
              : colX + 6;
        page.drawText(lbl, { x: tx, y: cursorY - 13, size: 7.6, font: fontBold, color: PCMG_COLORS.ink });
        colX += col.width;
      }
      cursorY -= thH;
      return;
    }

    if (params.headerVariant === 'slate800-amber') {
      page.drawRectangle({
        x: marginX,
        y: cursorY - 13,
        width: 3.5,
        height: 13,
        color: PCMG_COLORS.amber600
      });
      page.drawText(fitTextToWidth(titleStr, fontBold, 8.8, contentWidth - 14), {
        x: marginX + 8,
        y: cursorY - 10,
        size: 8.8,
        font: fontBold,
        color: PCMG_COLORS.slate900
      });
      cursorY -= 17;

      const thH = 21;
      page.drawRectangle({
        x: marginX,
        y: cursorY - thH,
        width: contentWidth,
        height: thH,
        color: PCMG_COLORS.slate800
      });
      let colX = marginX;
      for (const col of columns) {
        page.drawRectangle({
          x: colX,
          y: cursorY - thH,
          width: col.width,
          height: thH,
          borderColor: PCMG_COLORS.slate700,
          borderWidth: 0.5
        });
        const lbl = fitTextToWidth(col.label, fontBold, 7.6, col.width - 10);
        const tx =
          col.align === 'right'
            ? colX + col.width - 6 - fontBold.widthOfTextAtSize(lbl, 7.6)
            : col.align === 'center'
              ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 7.6)) / 2
              : colX + 6;
        page.drawText(lbl, { x: tx, y: cursorY - 13.5, size: 7.6, font: fontBold, color: PCMG_COLORS.white });
        colX += col.width;
      }
      cursorY -= thH;
      return;
    }

    if (params.headerVariant === 'light-underline') {
      page.drawText(fitTextToWidth(titleStr, fontBold, 9.0, contentWidth), {
        x: marginX,
        y: cursorY - 10,
        size: 9.0,
        font: fontBold,
        color: PCMG_COLORS.ink
      });
      cursorY -= 16;

      const thH = 21;
      page.drawRectangle({
        x: marginX,
        y: cursorY - thH,
        width: contentWidth,
        height: thH,
        color: PCMG_COLORS.slate100
      });
      page.drawLine({
        start: { x: marginX, y: cursorY - thH },
        end: { x: pageWidth - marginX, y: cursorY - thH },
        thickness: 1.5,
        color: PCMG_COLORS.slate400
      });
      let colX = marginX;
      for (const col of columns) {
        const lbl = fitTextToWidth(col.label, fontBold, 7.8, col.width - 10);
        const tx =
          col.align === 'right'
            ? colX + col.width - 6 - fontBold.widthOfTextAtSize(lbl, 7.8)
            : col.align === 'center'
              ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 7.8)) / 2
              : colX + 6;
        page.drawText(lbl, { x: tx, y: cursorY - 13.5, size: 7.8, font: fontBold, color: PCMG_COLORS.ink });
        colX += col.width;
      }
      cursorY -= thH;
      return;
    }

    // Default: 'dark' (Armas)
    page.drawText(fitTextToWidth(titleStr, fontBold, 8.8, contentWidth), {
      x: marginX,
      y: cursorY - 10,
      size: 8.8,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    cursorY -= 15;

    const thH = 20;
    page.drawRectangle({
      x: marginX,
      y: cursorY - thH,
      width: contentWidth,
      height: thH,
      color: PCMG_COLORS.ink
    });
    let colX = marginX;
    for (const col of columns) {
      const lbl = fitTextToWidth(col.label, fontBold, 7.6, col.width - 10);
      const tx =
        col.align === 'right'
          ? colX + col.width - 6 - fontBold.widthOfTextAtSize(lbl, 7.6)
          : col.align === 'center'
            ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 7.6)) / 2
            : colX + 6;
      page.drawText(lbl, { x: tx, y: cursorY - 13, size: 7.6, font: fontBold, color: PCMG_COLORS.white });
      colX += col.width;
    }
    cursorY -= thH;
  };

  drawTitleAndHeader(false);

  const fontSize = 8.4;
  const lineH = 10.8;

  params.rows.forEach((rowMap, idx) => {
    const wrapped: Record<string, string[]> = {};
    let maxLines = 1;
    for (const col of columns) {
      const f = col.mono ? (col.bold ? fontMonoBold : fontMono) : col.bold ? fontBold : fontRegular;
      const lines = wrapCellLines(rowMap[col.key] || '-', f, fontSize, col.width - 12, 4);
      wrapped[col.key] = lines;
      if (lines.length > maxLines) maxLines = lines.length;
    }

    const rowH = Math.max(22, maxLines * lineH + 8);
    if (cursorY - rowH < footerSafeY + 26) {
      const next = params.onNewPage();
      page = next.page;
      cursorY = next.cursorY;
      drawTitleAndHeader(true);
    }

    const rowBottomY = cursorY - rowH;
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: rowBottomY,
        width: contentWidth,
        height: rowH,
        color: PCMG_COLORS.slate50
      });
    }

    let colX = marginX;
    for (const col of columns) {
      page.drawRectangle({
        x: colX,
        y: rowBottomY,
        width: col.width,
        height: rowH,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.5
      });

      const f = col.mono ? (col.bold ? fontMonoBold : fontMono) : col.bold ? fontBold : fontRegular;
      const lines = wrapped[col.key] || ['-'];
      lines.forEach((line, lIdx) => {
        const tx =
          col.align === 'right'
            ? colX + col.width - 6 - f.widthOfTextAtSize(line, fontSize)
            : col.align === 'center'
              ? colX + (col.width - f.widthOfTextAtSize(line, fontSize)) / 2
              : colX + 6;
        page.drawText(line, {
          x: tx,
          y: cursorY - 13.2 - lIdx * lineH,
          size: fontSize,
          font: f,
          color: col.bold ? PCMG_COLORS.black : PCMG_COLORS.ink
        });
      });

      colX += col.width;
    }

    cursorY = rowBottomY;
  });

  // Linha de total geral da unidade
  const totalH = 24;
  if (cursorY - totalH < footerSafeY + 6) {
    const next = params.onNewPage();
    page = next.page;
    cursorY = next.cursorY;
  }
  const totalBottomY = cursorY - totalH;
  page.drawRectangle({
    x: marginX,
    y: totalBottomY,
    width: contentWidth,
    height: totalH,
    color: PCMG_COLORS.slate100,
    borderColor: PCMG_COLORS.slate400,
    borderWidth: 0.8
  });

  const lastCol = columns[columns.length - 1];
  const valFit = fitTextToWidth(params.totalValue, fontMonoBold, 9.0, Math.max(lastCol.width + 120, contentWidth * 0.45));
  const valW = fontMonoBold.widthOfTextAtSize(valFit, 9.0);
  const lblFit = fitTextToWidth(params.totalLabel, fontBold, 8.2, contentWidth - valW - 24);
  page.drawText(lblFit, {
    x: marginX + 8,
    y: totalBottomY + 8,
    size: 8.2,
    font: fontBold,
    color: PCMG_COLORS.ink
  });
  page.drawText(valFit, {
    x: pageWidth - marginX - 8 - valW,
    y: totalBottomY + 7.5,
    size: 9.0,
    font: fontMonoBold,
    color: PCMG_COLORS.black
  });
  cursorY = totalBottomY;

  return { page, cursorY };
}

// ============================================================================
// 1. PDF DE ARMAS — LAYOUT IDÊNTICO AO ModalImprimirArsenal.tsx (A4 Retrato)
// ============================================================================
export interface SystemArmaPdfRecord {
  id: string;
  tipo: string;
  numeroSerie: string;
  fabricante: string;
  modelo: string;
  calibre: string;
  status: string;
  unidadeNome: string;
  cofreCodigo: string;
  cofreTipo: string;
  policialAcautelado: string;
  carregadores: number;
  tirosDisparados: number;
  ultimaManutencaoData: string;
  ultimaManutencaoResp: string;
  observacao: string;
}

export async function generateSystemArmasPdf(params: {
  tituloDoc: string;
  filtroTipoLabel: string;
  departamentoLabel: string;
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  solicitanteRole: string;
  logoDataUri: string | null;
  records: SystemArmaPdfRecord[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${params.tituloDoc} - ${params.unidadeLabel}`);
  doc.setAuthor('Sistema de Armaria - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2; // 539.28pt
  const footerSafeY = 56;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);
  const authCode = `PCMG-ARS-${params.geradoEm.getFullYear()}${String(params.geradoEm.getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const columns = [
    { key: 'idx', label: '#', width: 20, align: 'center' as const },
    { key: 'tipo', label: 'TIPO', width: 55, align: 'left' as const },
    { key: 'fab', label: 'FABRICANTE', width: 52, align: 'left' as const },
    { key: 'modelo', label: 'MODELO', width: 58, align: 'left' as const },
    { key: 'calibre', label: 'CALIBRE', width: 48, align: 'left' as const },
    { key: 'serie', label: 'N. DE SERIE', width: 65, align: 'left' as const },
    { key: 'local', label: 'LOCALIZACAO / COFRE', width: 95, align: 'left' as const },
    { key: 'carreg', label: 'CARR.', width: 28, align: 'center' as const },
    { key: 'situacao', label: 'SITUACAO', width: 64, align: 'left' as const },
    { key: 'manut', label: 'ULT. MANUT.', width: contentWidth - (20 + 55 + 52 + 58 + 48 + 65 + 95 + 28 + 64), align: 'left' as const }
  ];

  const drawTableHeader = (page: PDFPage, y: number, sectionBanner?: string): number => {
    if (sectionBanner) {
      page.drawText(fitTextToWidth(sectionBanner, fontBold, 8.6, contentWidth), {
        x: marginX,
        y: y - 9,
        size: 8.6,
        font: fontBold,
        color: PCMG_COLORS.ink
      });
      y -= 14;
    }
    const h = 18;
    page.drawRectangle({
      x: marginX,
      y: y - h,
      width: contentWidth,
      height: h,
      color: PCMG_COLORS.ink
    });
    let colX = marginX;
    for (const col of columns) {
      const lbl = fitTextToWidth(col.label, fontBold, 6.7, col.width - 4);
      const tx =
        col.align === 'center'
          ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 6.7)) / 2
          : colX + 3;
      page.drawText(lbl, {
        x: tx,
        y: y - 12,
        size: 6.7,
        font: fontBold,
        color: PCMG_COLORS.white
      });
      colX += col.width;
    }
    return y - h;
  };

  const drawUnitPageHeader = (
    page: PDFPage,
    unitDisplayLabel: string,
    unitRecords: SystemArmaPdfRecord[],
    options: { showInfoPanel: boolean; showTableHeader: boolean; sectionBanner?: string }
  ): number => {
    let y = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr);

    const headerTopY = y;
    let textX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(40, 40);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 40 + (40 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      textX = marginX + dims.width + 10;
    }

    const pillW = 162;
    const titleMaxW = contentWidth - (textX - marginX) - pillW - 10;

    page.drawText('POLICIA CIVIL DO ESTADO DE MINAS GERAIS', {
      x: textX,
      y: headerTopY - 11,
      size: 10.5,
      font: fontBold,
      color: PCMG_COLORS.black
    });
    page.drawText(fitTextToWidth(params.departamentoLabel.toUpperCase(), fontBold, 8.2, titleMaxW), {
      x: textX,
      y: headerTopY - 23,
      size: 8.2,
      font: fontBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(
      fitTextToWidth('RELACAO E INVENTARIO OFICIAL DO ARSENAL DE ARMAMENTO', fontBold, 8.8, titleMaxW),
      {
        x: textX,
        y: headerTopY - 36,
        size: 8.8,
        font: fontBold,
        color: PCMG_COLORS.ink
      }
    );

    const pillX = pageWidth - marginX - pillW;
    const pillH = 34;
    page.drawRectangle({
      x: pillX,
      y: headerTopY - pillH - 2,
      width: pillW,
      height: pillH,
      color: PCMG_COLORS.slate100,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.75
    });
    const authLine = `AUTENTICACAO: ${authCode}`;
    const emisLine = `EMISSAO: ${emissaoBr.slice(0, 16)}`;
    const authW = fontMonoBold.widthOfTextAtSize(authLine, 6.7);
    const emisW = fontMono.widthOfTextAtSize(emisLine, 6.7);
    page.drawText(authLine, {
      x: pillX + pillW - 6 - authW,
      y: headerTopY - 14,
      size: 6.7,
      font: fontMonoBold,
      color: PCMG_COLORS.ink
    });
    page.drawText(emisLine, {
      x: pillX + pillW - 6 - emisW,
      y: headerTopY - 26,
      size: 6.7,
      font: fontMono,
      color: PCMG_COLORS.slate700
    });

    y = headerTopY - 46;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.ink
    });
    y -= 10;

    if (options.showInfoPanel) {
      const typeCountMap = new Map<string, number>();
      const caliberCountMap = new Map<string, number>();
      let totalCarregadores = 0;
      for (const r of unitRecords) {
        const tKey = r.tipo || 'Outros';
        const cKey = r.calibre || 'N/A';
        typeCountMap.set(tKey, (typeCountMap.get(tKey) || 0) + 1);
        caliberCountMap.set(cKey, (caliberCountMap.get(cKey) || 0) + 1);
        totalCarregadores += Number(r.carregadores || 0);
      }
      const typeSummaryLine = Array.from(typeCountMap.entries())
        .map(([t, c]) => `${t}: ${c} un.`)
        .join('   ');
      const caliberSummaryLine =
        Array.from(caliberCountMap.entries())
          .map(([c, cnt]) => `${c}: ${cnt} un.`)
          .join('   ') + `   |   Total de Carregadores da Carga: ${totalCarregadores} un.`;

      const infoH = 62;
      page.drawRectangle({
        x: marginX,
        y: y - infoH,
        width: contentWidth,
        height: infoH,
        color: PCMG_COLORS.slate50,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.75
      });

      const leftColX = marginX + 8;
      const rightColX = marginX + Math.round(contentWidth * 0.62);
      const leftMaxW = rightColX - leftColX - 10;
      const rightMaxW = marginX + contentWidth - rightColX - 8;

      page.drawText('UNIDADE POLICIAL DE LOTACAO / ARSENAL', {
        x: leftColX,
        y: y - 12,
        size: 6.8,
        font: fontBold,
        color: PCMG_COLORS.slate500
      });
      page.drawText(fitTextToWidth(unitDisplayLabel.toUpperCase(), fontBold, 9.8, leftMaxW), {
        x: leftColX,
        y: y - 24,
        size: 9.8,
        font: fontBold,
        color: PCMG_COLORS.black
      });
      page.drawText('CRITERIOS DO FILTRO / ESCOPO DA RELACAO', {
        x: leftColX,
        y: y - 40,
        size: 6.8,
        font: fontBold,
        color: PCMG_COLORS.slate500
      });
      page.drawText(
        fitTextToWidth(`Situacao: TODAS AS ARMAS - Tipo: ${params.filtroTipoLabel}`, fontBold, 8, leftMaxW),
        {
          x: leftColX,
          y: y - 51,
          size: 8,
          font: fontBold,
          color: PCMG_COLORS.slate800
        }
      );

      page.drawText('ARMEIRO / OPERADOR RESPONSAVEL PELA EMISSAO', {
        x: rightColX,
        y: y - 12,
        size: 6.5,
        font: fontBold,
        color: PCMG_COLORS.slate500
      });
      page.drawText(
        fitTextToWidth(`${params.solicitanteNome} (MASP: ${formatMaspBr(params.solicitanteMasp)})`, fontBold, 7.8, rightMaxW),
        {
          x: rightColX,
          y: y - 22,
          size: 7.8,
          font: fontBold,
          color: PCMG_COLORS.ink
        }
      );
      page.drawText(fitTextToWidth(`Perfil: ${params.solicitanteRole || 'Policial Civil'}`, fontRegular, 6.8, rightMaxW), {
        x: rightColX,
        y: y - 31,
        size: 6.8,
        font: fontRegular,
        color: PCMG_COLORS.slate500
      });
      page.drawText('TOTAL DE ARMAS DA UNIDADE', {
        x: rightColX,
        y: y - 43,
        size: 6.5,
        font: fontBold,
        color: PCMG_COLORS.slate500
      });
      page.drawText(`${unitRecords.length} arma(s) cadastrada(s)`, {
        x: rightColX,
        y: y - 55,
        size: 10,
        font: fontMonoBold,
        color: PCMG_COLORS.black
      });

      y -= infoH + 8;

      const statsH = 40;
      page.drawRectangle({
        x: marginX,
        y: y - statsH,
        width: contentWidth,
        height: statsH,
        color: PCMG_COLORS.slate100,
        borderColor: PCMG_COLORS.slate200,
        borderWidth: 0.75
      });
      page.drawText('DISTRIBUICAO BELICA:', {
        x: marginX + 8,
        y: y - 11,
        size: 7.3,
        font: fontBold,
        color: PCMG_COLORS.slate700
      });
      page.drawText(fitTextToWidth(typeSummaryLine, fontMonoBold, 7.4, contentWidth - 16), {
        x: marginX + 8,
        y: y - 22,
        size: 7.4,
        font: fontMonoBold,
        color: PCMG_COLORS.ink
      });
      page.drawText(fitTextToWidth(caliberSummaryLine, fontMono, 7.2, contentWidth - 16), {
        x: marginX + 8,
        y: y - 33,
        size: 7.2,
        font: fontMono,
        color: PCMG_COLORS.slate700
      });

      y -= statsH + 10;
    }

    if (options.showTableHeader) {
      return drawTableHeader(page, y, options.sectionBanner);
    }
    return y;
  };

  const unitGroups = groupRecordsByUnit(params.records);
  const isMultiUnit = unitGroups.length > 1;
  const fontSize = 6.9;
  const lineH = 9.0;

  let page!: PDFPage;
  let cursorY = 0;

  for (const unitGroup of unitGroups) {
    const unitDisplayLabel = isMultiUnit ? unitGroup.unitName : params.unidadeLabel;

    // 1. PÁGINA DE RESUMO DE ESTOQUE DA UNIDADE (Calibre | Tipo | Modelo | Quantidade em Estoque)
    const groupedSummary = new Map<string, { calibre: string; tipo: string; modelo: string; qtd: number }>();
    for (const r of unitGroup.records) {
      const cal = cleanSummaryVal(r.calibre) || '-';
      const tip = cleanSummaryVal(r.tipo) || 'Arma de Fogo';
      const mod = cleanSummaryVal(r.modelo) || '-';
      const key = `${normalizeUpperAscii(cal)}||${normalizeUpperAscii(tip)}||${normalizeUpperAscii(mod)}`;
      const existing = groupedSummary.get(key);
      if (existing) {
        existing.qtd += 1;
      } else {
        groupedSummary.set(key, { calibre: cal, tipo: tip, modelo: mod, qtd: 1 });
      }
    }
    const summaryRows = Array.from(groupedSummary.values())
      .sort((a, b) => {
        const tc = a.tipo.localeCompare(b.tipo, 'pt-BR');
        if (tc !== 0) return tc;
        const cc = a.calibre.localeCompare(b.calibre, 'pt-BR');
        if (cc !== 0) return cc;
        return a.modelo.localeCompare(b.modelo, 'pt-BR');
      })
      .map(item => ({
        calibre: item.calibre,
        tipo: item.tipo,
        modelo: item.modelo,
        qtd: formatUnitsLabel(item.qtd, false)
      }));

    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showInfoPanel: true,
      showTableHeader: false
    });

    const summaryCols: SummaryColSpec[] = [
      { key: 'calibre', label: 'CALIBRE', width: 115, align: 'left', mono: true, bold: true },
      { key: 'tipo', label: 'TIPO DE ARMA', width: 135, align: 'left', bold: true },
      { key: 'modelo', label: 'MODELO', width: contentWidth - (115 + 135 + 125), align: 'left', bold: false },
      { key: 'qtd', label: 'QUANTIDADE EM ESTOQUE', width: 125, align: 'right', mono: true, bold: true }
    ];

    const summaryRes = drawSummaryTableWithPagination({
      page,
      cursorY,
      marginX,
      pageWidth,
      contentWidth,
      footerSafeY,
      fontRegular,
      fontBold,
      fontMono,
      fontMonoBold,
      sectionTitle: `RESUMO DO ESTOQUE DE ARMAMENTO POR TIPO E MODELO - ${unitDisplayLabel.toUpperCase()}`,
      headerVariant: 'dark',
      columns: summaryCols,
      rows: summaryRows,
      totalLabel: `TOTAL EM ESTOQUE (${unitDisplayLabel.toUpperCase()})`,
      totalValue: formatUnitsLabel(unitGroup.records.length, false),
      onNewPage: () => {
        const nextPage = doc.addPage([pageWidth, pageHeight]);
        const nextY = drawUnitPageHeader(nextPage, unitDisplayLabel, unitGroup.records, {
          showInfoPanel: false,
          showTableHeader: false
        });
        return { page: nextPage, cursorY: nextY };
      }
    });
    page = summaryRes.page;
    cursorY = summaryRes.cursorY;

    // 2. RELAÇÃO COMPLETA DA UNIDADE (INICIA EM NOVA PÁGINA)
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showInfoPanel: false,
      showTableHeader: true,
      sectionBanner: `RELACAO COMPLETA DE ARMAMENTO - ${unitDisplayLabel.toUpperCase()} (${unitGroup.records.length} registro(s))`
    });

    unitGroup.records.forEach((rec, index) => {
      const locationLine2 = rec.cofreCodigo
        ? `Cofre: ${rec.cofreCodigo}${rec.cofreTipo ? ` (${rec.cofreTipo})` : ''}`
        : rec.policialAcautelado
          ? `Acaut.: ${rec.policialAcautelado}`
          : rec.status === 'Em Trânsito'
            ? 'Em Cautela / Transito'
            : 'Armazem / Nao Alocada';

      const manutText = rec.ultimaManutencaoData
        ? `${rec.ultimaManutencaoData}${rec.ultimaManutencaoResp ? ` (${rec.ultimaManutencaoResp})` : ''}`
        : 'Sem reg.';

      const cellValues: Record<string, string> = {
        idx: String(index + 1).padStart(2, '0'),
        tipo: (rec.tipo || 'ARMA DE FOGO').toUpperCase(),
        fab: rec.fabricante || '-',
        modelo: rec.modelo || '-',
        calibre: rec.calibre || '-',
        serie: rec.numeroSerie || '-',
        local: `${rec.unidadeNome}\n${locationLine2}`,
        carreg: String(rec.carregadores || 0),
        situacao: rec.status || 'No Cofre',
        manut: manutText
      };

      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;
      for (const col of columns) {
        const f =
          col.key === 'serie' || col.key === 'idx' || col.key === 'carreg'
            ? fontMonoBold
            : col.key === 'calibre' || col.key === 'manut'
              ? fontMono
              : col.key === 'tipo' || col.key === 'modelo'
                ? fontBold
                : fontRegular;
        const lines = wrapCellLines(cellValues[col.key] || '-', f, fontSize, col.width - 6, 4);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const rowH = Math.max(18, maxLines * lineH + 6);
      if (cursorY - rowH < footerSafeY + 6) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
          showInfoPanel: false,
          showTableHeader: true,
          sectionBanner: `RELACAO COMPLETA DE ARMAMENTO - ${unitDisplayLabel.toUpperCase()} (CONTINUACAO)`
        });
      }

      const rowBottomY = cursorY - rowH;
      if (index % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.grayRow
        });
      }

      let colX = marginX;
      for (const col of columns) {
        page.drawRectangle({
          x: colX,
          y: rowBottomY,
          width: col.width,
          height: rowH,
          borderColor: PCMG_COLORS.slate200,
          borderWidth: 0.45
        });

        const lines = wrapped[col.key] || ['-'];

        if (col.key === 'situacao') {
          const stNorm = normalizeUpperAscii(rec.status);
          const badgeStyle = stNorm.includes('COFRE')
            ? { bg: PCMG_COLORS.emeraldBg, border: PCMG_COLORS.emeraldBorder, text: PCMG_COLORS.emeraldText }
            : stNorm.includes('TRANSIT') || stNorm.includes('ACAUTEL')
              ? { bg: PCMG_COLORS.amberBg, border: PCMG_COLORS.amberBorder, text: PCMG_COLORS.amberText }
              : { bg: PCMG_COLORS.redBg, border: PCMG_COLORS.redBorder, text: PCMG_COLORS.redText };

          const badgeLabel = fitTextToWidth((rec.status || 'NO COFRE').toUpperCase(), fontMonoBold, 5.9, col.width - 10);
          const badgeW = Math.min(col.width - 5, fontMonoBold.widthOfTextAtSize(badgeLabel, 5.9) + 6);
          const badgeH = 11.5;
          const badgeY = rowBottomY + (rowH - badgeH) / 2;
          page.drawRectangle({
            x: colX + 2.5,
            y: badgeY,
            width: badgeW,
            height: badgeH,
            color: badgeStyle.bg,
            borderColor: badgeStyle.border,
            borderWidth: 0.6
          });
          page.drawText(badgeLabel, {
            x: colX + 5.5,
            y: badgeY + 3.5,
            size: 5.9,
            font: fontMonoBold,
            color: badgeStyle.text
          });
        } else {
          const f =
            col.key === 'serie' || col.key === 'idx' || col.key === 'carreg'
              ? fontMonoBold
              : col.key === 'calibre' || col.key === 'manut'
                ? fontMono
                : col.key === 'tipo' || col.key === 'modelo'
                  ? fontBold
                  : fontRegular;
          lines.forEach((line, lIdx) => {
            const isLocalSub = col.key === 'local' && lIdx > 0;
            const useFont = col.key === 'local' && lIdx === 0 ? fontBold : isLocalSub ? fontMono : f;
            const useSize = isLocalSub ? 6.2 : col.key === 'manut' ? 6.2 : fontSize;
            const useColor = isLocalSub || col.key === 'manut' ? PCMG_COLORS.slate600 : col.key === 'serie' ? PCMG_COLORS.black : PCMG_COLORS.ink;
            const tx =
              col.align === 'center'
                ? colX + (col.width - useFont.widthOfTextAtSize(line, useSize)) / 2
                : colX + 3;
            page.drawText(line, {
              x: tx,
              y: cursorY - 9.5 - lIdx * lineH,
              size: useSize,
              font: useFont,
              color: useColor
            });
          });
        }

        colX += col.width;
      }

      cursorY = rowBottomY;
    });
  }

  // Declaração de Conferência Física e Sistêmica + Assinaturas (exatamente como ModalImprimirArsenal.tsx)
  const closingBlockH = 120;
  if (cursorY - closingBlockH < footerSafeY) {
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr) - 8;
  }

  cursorY -= 12;
  const stmtH = 40;
  page.drawRectangle({
    x: marginX,
    y: cursorY - stmtH,
    width: contentWidth,
    height: stmtH,
    color: PCMG_COLORS.slate50,
    borderColor: PCMG_COLORS.slate400,
    borderWidth: 0.75
  });
  page.drawText('DECLARACAO DE CONFERENCIA FISICA E SISTEMICA:', {
    x: marginX + 8,
    y: cursorY - 12,
    size: 7.3,
    font: fontBold,
    color: PCMG_COLORS.slate700
  });
  const stmtLines = wrapCellLines(
    'Certifico que o armamento constante na presente relacao pertence a carga desta Unidade Policial e que todos os dados tecnicos, numeros de serie, dotacoes de carregadores e localizacoes de cofre foram devidamente conferidos e conferem com o acervo fisico em custodia.',
    fontItalic,
    7.2,
    contentWidth - 16,
    3
  );
  stmtLines.forEach((ln, i) => {
    page.drawText(ln, {
      x: marginX + 8,
      y: cursorY - 22 - i * 8.5,
      size: 7.2,
      font: fontItalic,
      color: PCMG_COLORS.slate700
    });
  });

  cursorY -= stmtH + 34;

  // Assinaturas duplas
  const sigW = 230;
  const leftSigX = marginX + 12;
  const rightSigX = pageWidth - marginX - sigW - 12;

  const drawCenteredSig = (x: number, w: number, line1: string, line2: string, line3: string) => {
    page.drawLine({
      start: { x, y: cursorY },
      end: { x: x + w, y: cursorY },
      thickness: 1.1,
      color: PCMG_COLORS.ink
    });
    const l1 = fitTextToWidth(line1, fontBold, 8, w);
    const l2 = fitTextToWidth(line2, fontMono, 7, w);
    const l3 = fitTextToWidth(line3, fontMonoBold, 6.8, w);
    page.drawText(l1, { x: x + (w - fontBold.widthOfTextAtSize(l1, 8)) / 2, y: cursorY - 11, size: 8, font: fontBold, color: PCMG_COLORS.black });
    page.drawText(l2, { x: x + (w - fontMono.widthOfTextAtSize(l2, 7)) / 2, y: cursorY - 20, size: 7, font: fontMono, color: PCMG_COLORS.slate600 });
    page.drawText(l3, { x: x + (w - fontMonoBold.widthOfTextAtSize(l3, 6.8)) / 2, y: cursorY - 29, size: 6.8, font: fontMonoBold, color: PCMG_COLORS.slate600 });
  };

  drawCenteredSig(
    leftSigX,
    sigW,
    params.solicitanteNome.toUpperCase(),
    `MASP: ${formatMaspBr(params.solicitanteMasp)} - ${params.solicitanteRole || 'Policial Civil'}`,
    'ARMEIRO RESPONSAVEL / ENCARREGADO DE MATERIAL BELICO'
  );
  drawCenteredSig(
    rightSigX,
    sigW,
    'AUTORIDADE POLICIAL / DELEGADO TITULAR',
    'CHEFIA DA UNIDADE POLICIAL / DELEGACIA',
    'VISTO E CONFERENCIA DA CARGA BELICA'
  );

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `SISTEMA DE ARMARIA - POLICIA CIVIL DE MINAS GERAIS (PCMG) | Registro de Auditoria: ${authCode}`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================================
// 2. PDF DE MUNIÇÕES — LAYOUT IDÊNTICO AO ModuloMunicao.tsx (A4 Retrato)
// ============================================================================
export interface SystemMunicaoPdfRecord {
  unidadeNome: string;
  calibreNome: string;
  fabricante: string;
  tipo: string;
  peso: string;
  lote: string;
  anoFabricacao: string;
  destinacao: string;
  cofreCodigo: string;
  cofreDescricao: string;
  quantidade: number;
  atualizadoEm: string;
  observacao: string;
}

export async function generateSystemMunicoesPdf(params: {
  calibreDisplayLabel: string;
  isTodosCalibres: boolean;
  modoRelatorio: 'por_calibre' | 'por_unidade';
  departamentoLabel: string;
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  logoDataUri: string | null;
  records: SystemMunicaoPdfRecord[];
}): Promise<Buffer> {
  const isPorUnidade = params.modoRelatorio === 'por_unidade';
  const doc = await PDFDocument.create();
  doc.setTitle(
    isPorUnidade
      ? `Relação de Munições por Unidade - ${params.unidadeLabel}`
      : `Relação de Munições (${params.calibreDisplayLabel}) - ${params.unidadeLabel}`
  );
  doc.setAuthor('Sistema de Gestão Bélica - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2;
  const footerSafeY = 56;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);

  const columns = [
    { key: 'calibre', label: 'CALIBRE', width: 64, align: 'left' as const },
    { key: 'fabLote', label: 'FABRICANTE / LOTE', width: 92, align: 'left' as const },
    { key: 'tipoPeso', label: 'TIPO / PESO', width: 76, align: 'left' as const },
    { key: 'anoDest', label: 'ANO / DESTINACAO', width: 72, align: 'left' as const },
    { key: 'cofreUni', label: 'COFRE / UNIDADE', width: 82, align: 'left' as const },
    { key: 'obs', label: 'OBSERVACOES', width: contentWidth - (64 + 92 + 76 + 72 + 82 + 48), align: 'left' as const },
    { key: 'qtd', label: 'QTD (UN)', width: 48, align: 'right' as const }
  ];

  const drawTableHeader = (page: PDFPage, y: number, sectionTitle: string): number => {
    const secH = 18;
    page.drawRectangle({
      x: marginX,
      y: y - secH,
      width: contentWidth,
      height: secH,
      color: PCMG_COLORS.ink
    });
    page.drawText(fitTextToWidth(sectionTitle, fontBold, 8.2, contentWidth - 16), {
      x: marginX + 8,
      y: y - 12.2,
      size: 8.2,
      font: fontBold,
      color: PCMG_COLORS.white
    });
    y -= secH;

    const thH = 18;
    page.drawRectangle({
      x: marginX,
      y: y - thH,
      width: contentWidth,
      height: thH,
      color: PCMG_COLORS.slate100,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.7
    });

    let colX = marginX;
    for (const col of columns) {
      page.drawRectangle({
        x: colX,
        y: y - thH,
        width: col.width,
        height: thH,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.5
      });
      const lbl = fitTextToWidth(col.label, fontBold, 6.8, col.width - 6);
      const tx =
        col.align === 'right'
          ? colX + col.width - 4 - fontBold.widthOfTextAtSize(lbl, 6.8)
          : colX + 4;
      page.drawText(lbl, {
        x: tx,
        y: y - 12,
        size: 6.8,
        font: fontBold,
        color: PCMG_COLORS.ink
      });
      colX += col.width;
    }

    return y - thH;
  };

  const drawUnitPageHeader = (
    page: PDFPage,
    unitDisplayLabel: string,
    unitRecords: SystemMunicaoPdfRecord[],
    options: { showMetaAndKpis: boolean; showTableHeader: boolean; detailSectionTitle?: string }
  ): number => {
    let y = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr);

    const headerTopY = y;
    let textX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(44, 44);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 44 + (44 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      textX = marginX + dims.width + 10;
    }

    const badgeW = 148;
    const titleMaxW = contentWidth - (textX - marginX) - badgeW - 10;

    page.drawText('POLICIA CIVIL DO ESTADO DE MINAS GERAIS', {
      x: textX,
      y: headerTopY - 12,
      size: 10.5,
      font: fontBold,
      color: PCMG_COLORS.black
    });
    page.drawText(fitTextToWidth(params.departamentoLabel, fontBold, 8.2, titleMaxW), {
      x: textX,
      y: headerTopY - 24,
      size: 8.2,
      font: fontBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(fitTextToWidth(unitDisplayLabel, fontRegular, 8, titleMaxW), {
      x: textX,
      y: headerTopY - 36,
      size: 8,
      font: fontRegular,
      color: PCMG_COLORS.slate600
    });

    const badgeX = pageWidth - marginX - badgeW;
    const badgeH = 34;
    page.drawRectangle({
      x: badgeX,
      y: headerTopY - badgeH - 4,
      width: badgeW,
      height: badgeH,
      color: PCMG_COLORS.slate100,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.75
    });
    const b1 = 'INVENTARIO DE MUNICOES';
    const b2 = fitTextToWidth(
      isPorUnidade ? `UNIDADE: ${unitDisplayLabel.toUpperCase()}` : `CALIBRE: ${params.calibreDisplayLabel.toUpperCase()}`,
      fontMonoBold,
      7.4,
      badgeW - 10
    );
    page.drawText(b1, {
      x: badgeX + badgeW - 6 - fontMonoBold.widthOfTextAtSize(b1, 6.8),
      y: headerTopY - 16,
      size: 6.8,
      font: fontMonoBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(b2, {
      x: badgeX + badgeW - 6 - fontMonoBold.widthOfTextAtSize(b2, 7.4),
      y: headerTopY - 29,
      size: 7.4,
      font: fontMonoBold,
      color: PCMG_COLORS.black
    });

    y = headerTopY - 48;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.black
    });
    y -= 10;

    if (options.showMetaAndKpis) {
      const uLotes = unitRecords.length;
      const uQtd = unitRecords.reduce((s, r) => s + r.quantidade, 0);
      const uOper = unitRecords
        .filter(r => normalizeUpperAscii(r.destinacao).includes('OPERAC'))
        .reduce((s, r) => s + r.quantidade, 0);
      const uTrein = unitRecords
        .filter(r => normalizeUpperAscii(r.destinacao).includes('TREIN'))
        .reduce((s, r) => s + r.quantidade, 0);
      const uOutros = Math.max(0, uQtd - uOper - uTrein);

      const metaH = 54;
      page.drawRectangle({
        x: marginX,
        y: y - metaH,
        width: contentWidth,
        height: metaH,
        color: PCMG_COLORS.slate50,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.75
      });

      const col1X = marginX + 10;
      const col2X = marginX + contentWidth / 2 + 6;
      const halfW = contentWidth / 2 - 18;

      page.drawText('ESCOPO / CALIBRE SELECIONADO', { x: col1X, y: y - 11, size: 6.7, font: fontBold, color: PCMG_COLORS.slate500 });
      page.drawText(
        fitTextToWidth(isPorUnidade ? 'Relacao por Unidade (Todos os Calibres)' : `Relacao por Calibre (${params.calibreDisplayLabel})`, fontBold, 8.4, halfW),
        { x: col1X, y: y - 22, size: 8.4, font: fontBold, color: PCMG_COLORS.ink }
      );
      page.drawText('DATA E HORA DA EMISSAO', { x: col1X, y: y - 35, size: 6.7, font: fontBold, color: PCMG_COLORS.slate500 });
      page.drawText(emissaoBr, { x: col1X, y: y - 46, size: 8.2, font: fontBold, color: PCMG_COLORS.ink });

      page.drawText('UNIDADE POLICIAL', { x: col2X, y: y - 11, size: 6.7, font: fontBold, color: PCMG_COLORS.slate500 });
      page.drawText(fitTextToWidth(unitDisplayLabel, fontBold, 8.4, halfW), { x: col2X, y: y - 22, size: 8.4, font: fontBold, color: PCMG_COLORS.ink });
      page.drawText('ARMEIRO / SOLICITANTE EMITENTE', { x: col2X, y: y - 35, size: 6.7, font: fontBold, color: PCMG_COLORS.slate500 });
      page.drawText(
        fitTextToWidth(`${params.solicitanteNome} (MASP: ${formatMaspBr(params.solicitanteMasp)})`, fontBold, 8.1, halfW),
        { x: col2X, y: y - 46, size: 8.1, font: fontBold, color: PCMG_COLORS.ink }
      );

      y -= metaH + 8;

      const kpis = [
        { label: 'TOTAL EM ESTOQUE', val: `${formatIntBr(uQtd)} un`, color: PCMG_COLORS.ink },
        { label: 'LOTES EM ESTOQUE', val: String(uLotes), color: PCMG_COLORS.ink },
        { label: 'OPERACIONAL', val: `${formatIntBr(uOper)} un`, color: PCMG_COLORS.emerald700 },
        { label: 'TREINAMENTO', val: `${formatIntBr(uTrein)} un`, color: PCMG_COLORS.amber700 },
        { label: 'RESERVA / OUTROS', val: `${formatIntBr(uOutros)} un`, color: PCMG_COLORS.slate700 }
      ];
      const gap = 6;
      const kpiW = (contentWidth - gap * (kpis.length - 1)) / kpis.length;
      const kpiH = 32;
      kpis.forEach((k, idx) => {
        const kx = marginX + idx * (kpiW + gap);
        page.drawRectangle({
          x: kx,
          y: y - kpiH,
          width: kpiW,
          height: kpiH,
          color: PCMG_COLORS.white,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.7
        });
        const lW = fontBold.widthOfTextAtSize(k.label, 6.2);
        const vW = fontMonoBold.widthOfTextAtSize(k.val, 9.5);
        page.drawText(k.label, {
          x: kx + (kpiW - lW) / 2,
          y: y - 11,
          size: 6.2,
          font: fontBold,
          color: PCMG_COLORS.slate500
        });
        page.drawText(k.val, {
          x: kx + (kpiW - vW) / 2,
          y: y - 24,
          size: 9.5,
          font: fontMonoBold,
          color: k.color
        });
      });

      y -= kpiH + 10;
    }

    if (options.showTableHeader) {
      return drawTableHeader(
        page,
        y,
        options.detailSectionTitle ||
          (isPorUnidade
            ? `DETALHAMENTO DO ESTOQUE DE MUNICOES - ${unitDisplayLabel.toUpperCase()}`
            : `DETALHAMENTO DO ESTOQUE DE MUNICOES (${params.calibreDisplayLabel.toUpperCase()}) - ${unitDisplayLabel.toUpperCase()}`)
      );
    }
    return y;
  };

  const unitGroups = groupRecordsByUnit(params.records);
  const isMultiUnit = unitGroups.length > 1;
  const fontSize = 7.1;
  const lineH = 9.4;

  let page!: PDFPage;
  let cursorY = 0;

  for (const unitGroup of unitGroups) {
    const unitDisplayLabel = isMultiUnit ? unitGroup.unitName : params.unidadeLabel;
    const unitTotalQtd = unitGroup.records.reduce((s, r) => s + r.quantidade, 0);

    // 1. PÁGINA DE RESUMO DE ESTOQUE DA UNIDADE (Calibre | Tipo / Peso | Quantidade em Estoque)
    const groupedSummary = new Map<string, { calibre: string; tipoPeso: string; qtd: number }>();
    for (const r of unitGroup.records) {
      const cal = cleanSummaryVal(r.calibreNome) || '-';
      const tip = cleanSummaryVal(r.tipo);
      const pes = cleanSummaryVal(r.peso);
      const tipoPeso = [tip, pes].filter(Boolean).join(' ') || '-';
      const key = `${normalizeUpperAscii(cal)}||${normalizeUpperAscii(tipoPeso)}`;
      const existing = groupedSummary.get(key);
      if (existing) {
        existing.qtd += Number(r.quantidade || 0);
      } else {
        groupedSummary.set(key, { calibre: cal, tipoPeso, qtd: Number(r.quantidade || 0) });
      }
    }
    const summaryRows = Array.from(groupedSummary.values())
      .sort((a, b) => {
        const cc = a.calibre.localeCompare(b.calibre, 'pt-BR');
        if (cc !== 0) return cc;
        return a.tipoPeso.localeCompare(b.tipoPeso, 'pt-BR');
      })
      .map(item => ({
        calibre: item.calibre,
        tipoPeso: item.tipoPeso,
        qtd: formatUnitsLabel(item.qtd, false)
      }));

    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showMetaAndKpis: true,
      showTableHeader: false
    });

    const summaryCols: SummaryColSpec[] = [
      { key: 'calibre', label: 'CALIBRE', width: 135, align: 'left', bold: true },
      { key: 'tipoPeso', label: 'TIPO / PESO', width: contentWidth - (135 + 145), align: 'left', bold: false },
      { key: 'qtd', label: 'QUANTIDADE EM ESTOQUE', width: 145, align: 'right', mono: true, bold: true }
    ];

    const summaryRes = drawSummaryTableWithPagination({
      page,
      cursorY,
      marginX,
      pageWidth,
      contentWidth,
      footerSafeY,
      fontRegular,
      fontBold,
      fontMono,
      fontMonoBold,
      sectionTitle: `RESUMO DE ESTOQUE DE MUNICOES POR CALIBRE E TIPO - ${unitDisplayLabel.toUpperCase()}`,
      headerVariant: 'light-bar',
      columns: summaryCols,
      rows: summaryRows,
      totalLabel: `TOTAL DE MUNICOES EM ESTOQUE (${unitDisplayLabel.toUpperCase()})`,
      totalValue: formatUnitsLabel(unitTotalQtd, false),
      onNewPage: () => {
        const nextPage = doc.addPage([pageWidth, pageHeight]);
        const nextY = drawUnitPageHeader(nextPage, unitDisplayLabel, unitGroup.records, {
          showMetaAndKpis: false,
          showTableHeader: false
        });
        return { page: nextPage, cursorY: nextY };
      }
    });
    page = summaryRes.page;
    cursorY = summaryRes.cursorY;

    // 2. RELAÇÃO COMPLETA DE LOTES DA UNIDADE (INICIA EM NOVA PÁGINA)
    const detailTitle = isPorUnidade
      ? `RELACAO COMPLETA DO ESTOQUE DE MUNICOES - ${unitDisplayLabel.toUpperCase()}`
      : `RELACAO COMPLETA DO ESTOQUE DE MUNICOES (${params.calibreDisplayLabel.toUpperCase()}) - ${unitDisplayLabel.toUpperCase()}`;

    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showMetaAndKpis: false,
      showTableHeader: true,
      detailSectionTitle: detailTitle
    });

    unitGroup.records.forEach((rec, index) => {
      const tipoPeso = rec.peso ? `${rec.tipo} (${rec.peso})` : rec.tipo;
      const fabLote = `${rec.fabricante || '-'} / ${rec.lote || 'S/L'}`;
      const anoDest = `${rec.anoFabricacao || '-'} / ${rec.destinacao || 'Operacional'}`;
      const cofreUni = `${rec.cofreCodigo}${rec.cofreDescricao ? ` (${rec.cofreDescricao})` : ''}\n${rec.unidadeNome}`;
      const obsText = [rec.observacao, rec.atualizadoEm ? `Atu: ${rec.atualizadoEm}` : ''].filter(Boolean).join(' | ') || '-';

      const rawValues: Record<string, string> = {
        calibre: rec.calibreNome,
        fabLote,
        tipoPeso,
        anoDest,
        cofreUni,
        obs: obsText,
        qtd: formatIntBr(rec.quantidade)
      };

      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;
      for (const col of columns) {
        const f = col.key === 'calibre' ? fontBold : col.key === 'qtd' ? fontMonoBold : fontRegular;
        const lines = wrapCellLines(rawValues[col.key] || '-', f, fontSize, col.width - 7, 5);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const rowH = Math.max(18, maxLines * lineH + 6);
      if (cursorY - rowH < footerSafeY + 6) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
          showMetaAndKpis: false,
          showTableHeader: true,
          detailSectionTitle: `${detailTitle} (CONTINUACAO)`
        });
      }

      const rowBottomY = cursorY - rowH;
      if (index % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.slate50
        });
      }

      let colX = marginX;
      for (const col of columns) {
        page.drawRectangle({
          x: colX,
          y: rowBottomY,
          width: col.width,
          height: rowH,
          borderColor: PCMG_COLORS.slate200,
          borderWidth: 0.5
        });
        const lines = wrapped[col.key] || ['-'];
        const f = col.key === 'calibre' ? fontBold : col.key === 'qtd' ? fontMonoBold : fontRegular;
        const color = col.key === 'obs' ? PCMG_COLORS.slate700 : PCMG_COLORS.ink;

        lines.forEach((line, lIdx) => {
          const useSize = col.key === 'obs' ? 6.5 : fontSize;
          const tx =
            col.align === 'right'
              ? colX + col.width - 4 - f.widthOfTextAtSize(line, useSize)
              : colX + 4;
          page.drawText(line, {
            x: tx,
            y: cursorY - 9.8 - lIdx * lineH,
            size: useSize,
            font: f,
            color
          });
        });

        colX += col.width;
      }

      cursorY = rowBottomY;
    });

    // tfoot row (#f8fafc, bold) para a unidade
    const tfootH = 20;
    if (cursorY - tfootH < footerSafeY + 6) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
        showMetaAndKpis: false,
        showTableHeader: true,
        detailSectionTitle: detailTitle
      });
    }
    const tfootY = cursorY - tfootH;
    page.drawRectangle({
      x: marginX,
      y: tfootY,
      width: contentWidth,
      height: tfootH,
      color: PCMG_COLORS.slate50,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.75
    });
    const totalLbl = `TOTAL DE MUNICOES (${unitDisplayLabel.toUpperCase()}):`;
    const totalVal = `${formatIntBr(unitTotalQtd)} un`;
    const valW = fontMonoBold.widthOfTextAtSize(totalVal, 8.8);
    const lblW = fontBold.widthOfTextAtSize(totalLbl, 7.8);
    page.drawText(totalLbl, {
      x: pageWidth - marginX - 66 - lblW,
      y: tfootY + 6.5,
      size: 7.8,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawText(totalVal, {
      x: pageWidth - marginX - 4 - valW,
      y: tfootY + 6,
      size: 8.8,
      font: fontMonoBold,
      color: PCMG_COLORS.black
    });
    cursorY = tfootY;
  }

  // Texto certificador (.info-footer-box) + Assinatura centralizada do Armeiro (idêntico ao ModuloMunicao.tsx)
  const closingH = 104;
  if (cursorY - closingH < footerSafeY) {
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr) - 8;
  }

  cursorY -= 12;
  const certH = 34;
  page.drawRectangle({
    x: marginX,
    y: cursorY - certH,
    width: contentWidth,
    height: certH,
    color: PCMG_COLORS.slate50
  });
  page.drawRectangle({
    x: marginX,
    y: cursorY - certH,
    width: 3,
    height: certH,
    color: PCMG_COLORS.ink
  });
  const certLines = wrapCellLines(
    `Certifico que o inventario acima reflete fielmente o material belico (municoes) sob guarda na unidade ${params.unidadeLabel} na presente data, conforme conferencia fisica realizada pelo armeiro responsavel.`,
    fontRegular,
    7.6,
    contentWidth - 18,
    3
  );
  certLines.forEach((ln, i) => {
    page.drawText(ln, {
      x: marginX + 10,
      y: cursorY - 11 - i * 9.5,
      size: 7.6,
      font: fontRegular,
      color: PCMG_COLORS.slate800
    });
  });

  cursorY -= certH + 34;

  // Assinatura centralizada (300pt)
  const sigW = 300;
  const sigX = (pageWidth - sigW) / 2;
  page.drawLine({
    start: { x: sigX, y: cursorY },
    end: { x: sigX + sigW, y: cursorY },
    thickness: 1,
    color: PCMG_COLORS.black
  });
  const sName = fitTextToWidth(params.solicitanteNome, fontBold, 8.6, sigW);
  const sRole = fitTextToWidth(
    `MASP: ${formatMaspBr(params.solicitanteMasp)} - Armeiro / Responsavel pelo Material Belico`,
    fontRegular,
    7.4,
    sigW
  );
  page.drawText(sName, {
    x: sigX + (sigW - fontBold.widthOfTextAtSize(sName, 8.6)) / 2,
    y: cursorY - 12,
    size: 8.6,
    font: fontBold,
    color: PCMG_COLORS.ink
  });
  page.drawText(sRole, {
    x: sigX + (sigW - fontRegular.widthOfTextAtSize(sRole, 7.4)) / 2,
    y: cursorY - 22,
    size: 7.4,
    font: fontRegular,
    color: PCMG_COLORS.slate600
  });

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `Relatorio emitido via Sistema de Gestao Belica da PCMG em ${emissaoBr}.`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================================
// 3. PDF DE EXPLOSIVOS — LAYOUT IDÊNTICO AO ModuloExplosivos.tsx (A4 Paisagem)
// ============================================================================
export interface SystemExplosivoPdfRecord {
  nome: string;
  tipo: string;
  subtipo: string;
  quantidade: number;
  unidadeMedida: string;
  lote: string;
  fabricante: string;
  dataFabricacao: string;
  dataValidade: string;
  validadeRaw: Date | null;
  classeRisco: string;
  localArmazenamento: string;
  cofreCodigo: string;
  cofreDescricao: string;
  status: string;
  unidadeNome: string;
  observacoes: string;
}

export async function generateSystemExplosivosPdf(params: {
  departamentoLabel: string;
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  logoDataUri: string | null;
  records: SystemExplosivoPdfRecord[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Inventário do Paiol de Explosivos - ${params.unidadeLabel}`);
  doc.setAuthor('Sistema de Armaria - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2;
  const footerSafeY = 56;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);
  const nowMs = Date.now();
  const in90DaysMs = nowMs + 90 * 24 * 60 * 60 * 1000;

  const fixedCols = 114 + 84 + 54 + 88 + 64 + 86 + 70 + 68 + 54;
  const columns = [
    { key: 'nome', label: 'NOME DO EXPLOSIVO', width: 114, align: 'left' as const },
    { key: 'tipo', label: 'TIPO / SUBTIPO', width: 84, align: 'left' as const },
    { key: 'qtd', label: 'QUANTIDADE', width: 54, align: 'center' as const },
    { key: 'lote', label: 'LOTE', width: 88, align: 'left' as const },
    { key: 'fab', label: 'FABRICANTE', width: 64, align: 'left' as const },
    { key: 'risco', label: 'CLASSE DE RISCO', width: 86, align: 'left' as const },
    { key: 'datas', label: 'FABR. / VALIDADE', width: 70, align: 'left' as const },
    { key: 'local', label: 'LOCAL DO COFRE', width: 68, align: 'left' as const },
    { key: 'status', label: 'STATUS', width: 54, align: 'center' as const },
    { key: 'obs', label: 'OBSERVACOES / SERIAIS', width: contentWidth - fixedCols, align: 'left' as const }
  ];

  const drawTableHeader = (page: PDFPage, y: number, sectionBanner?: string): number => {
    if (sectionBanner) {
      page.drawText(fitTextToWidth(sectionBanner, fontBold, 8.8, contentWidth), {
        x: marginX,
        y: y - 9,
        size: 8.8,
        font: fontBold,
        color: PCMG_COLORS.ink
      });
      y -= 15;
    }
    const h = 20;
    page.drawRectangle({
      x: marginX,
      y: y - h,
      width: contentWidth,
      height: h,
      color: PCMG_COLORS.slate100
    });
    page.drawLine({
      start: { x: marginX, y: y - h },
      end: { x: pageWidth - marginX, y: y - h },
      thickness: 1.5,
      color: PCMG_COLORS.slate400
    });
    let colX = marginX;
    for (const col of columns) {
      const lbl = fitTextToWidth(col.label, fontBold, 7.0, col.width - 6);
      const tx =
        col.align === 'center'
          ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 7.0)) / 2
          : colX + 4;
      page.drawText(lbl, {
        x: tx,
        y: y - 13,
        size: 7.0,
        font: fontBold,
        color: PCMG_COLORS.ink
      });
      colX += col.width;
    }
    return y - h;
  };

  const drawUnitPageHeader = (
    page: PDFPage,
    unitDisplayLabel: string,
    unitRecords: SystemExplosivoPdfRecord[],
    options: { showKpis: boolean; showTableHeader: boolean; sectionBanner?: string }
  ): number => {
    let y = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr);

    const headerTopY = y;
    if (logoImage) {
      const dims = logoImage.scaleToFit(44, 44);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 44 + (44 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
    }

    const h1 = 'POLICIA CIVIL DE MINAS GERAIS';
    const h2 = 'RELATORIO DE INVENTARIO DO PAIOL DE EXPLOSIVOS';
    const h3 = `Departamento: ${params.departamentoLabel}  |  Unidade: ${unitDisplayLabel}  |  Emissao: ${emissaoBr}`;

    page.drawText(h1, {
      x: (pageWidth - fontBold.widthOfTextAtSize(h1, 13)) / 2,
      y: headerTopY - 13,
      size: 13,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawText(h2, {
      x: (pageWidth - fontBold.widthOfTextAtSize(h2, 10.5)) / 2,
      y: headerTopY - 27,
      size: 10.5,
      font: fontBold,
      color: PCMG_COLORS.slate600
    });
    const h3Fit = fitTextToWidth(h3, fontRegular, 8.2, contentWidth - 110);
    page.drawText(h3Fit, {
      x: (pageWidth - fontRegular.widthOfTextAtSize(h3Fit, 8.2)) / 2,
      y: headerTopY - 40,
      size: 8.2,
      font: fontRegular,
      color: PCMG_COLORS.slate500
    });

    y = headerTopY - 48;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.ink
    });
    y -= 10;

    if (options.showKpis) {
      const uTotalItens = unitRecords.length;
      const uOperacionais = unitRecords.filter(r => normalizeUpperAscii(r.status).includes('OPERAC')).length;
      const uVencidos = unitRecords.filter(r => r.validadeRaw && r.validadeRaw.getTime() < nowMs).length;
      const uAVencer = unitRecords.filter(
        r => r.validadeRaw && r.validadeRaw.getTime() >= nowMs && r.validadeRaw.getTime() <= in90DaysMs
      ).length;
      const byMeasureMap = new Map<string, number>();
      for (const r of unitRecords) {
        const um = r.unidadeMedida || 'un';
        byMeasureMap.set(um, (byMeasureMap.get(um) || 0) + r.quantidade);
      }
      const medidasResumo =
        Array.from(byMeasureMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([um, qty]) => `${formatDecimalBr(qty)} ${um}`)
          .join(' | ') || '-';

      const kpis = [
        { label: 'ITENS / LOTES NO PAIOL', val: String(uTotalItens), color: PCMG_COLORS.ink },
        { label: 'OPERACIONAIS', val: String(uOperacionais), color: PCMG_COLORS.emerald700 },
        { label: 'QUANTITATIVOS TOTAIS', val: fitTextToWidth(medidasResumo, fontMonoBold, 8.5, 170), color: PCMG_COLORS.ink },
        { label: 'VENCIDOS', val: String(uVencidos), color: uVencidos > 0 ? PCMG_COLORS.redText : PCMG_COLORS.ink },
        { label: 'A VENCER (90 DIAS)', val: String(uAVencer), color: uAVencer > 0 ? PCMG_COLORS.amber700 : PCMG_COLORS.ink }
      ];
      const gap = 8;
      const kpiW = (contentWidth - gap * (kpis.length - 1)) / kpis.length;
      const kpiH = 30;
      kpis.forEach((k, idx) => {
        const kx = marginX + idx * (kpiW + gap);
        page.drawRectangle({
          x: kx,
          y: y - kpiH,
          width: kpiW,
          height: kpiH,
          color: PCMG_COLORS.slate50,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.7
        });
        page.drawText(k.label, {
          x: kx + (kpiW - fontBold.widthOfTextAtSize(k.label, 6.4)) / 2,
          y: y - 10.5,
          size: 6.4,
          font: fontBold,
          color: PCMG_COLORS.slate500
        });
        page.drawText(k.val, {
          x: kx + (kpiW - fontMonoBold.widthOfTextAtSize(k.val, 9)) / 2,
          y: y - 23,
          size: 9,
          font: fontMonoBold,
          color: k.color
        });
      });
      y -= kpiH + 10;
    }

    if (options.showTableHeader) {
      return drawTableHeader(page, y, options.sectionBanner);
    }
    return y;
  };

  const unitGroups = groupRecordsByUnit(params.records);
  const isMultiUnit = unitGroups.length > 1;
  const fontSize = 7.2;
  const lineH = 9.4;

  let page!: PDFPage;
  let cursorY = 0;

  for (const unitGroup of unitGroups) {
    const unitDisplayLabel = isMultiUnit ? unitGroup.unitName : params.unidadeLabel;

    // 1. PÁGINA DE RESUMO DE ESTOQUE DA UNIDADE (Tipo | Subtipo | Quantidade em Estoque)
    const groupedSummary = new Map<string, { tipo: string; subtipo: string; um: string; qtd: number }>();
    const byMeasureTotal = new Map<string, number>();
    for (const r of unitGroup.records) {
      const tip = cleanSummaryVal(r.tipo) || '-';
      const sub =
        cleanSummaryVal(r.subtipo) ||
        (cleanSummaryVal(r.nome) && normalizeUpperAscii(r.nome) !== normalizeUpperAscii(tip)
          ? cleanSummaryVal(r.nome)
          : '-');
      const um = cleanSummaryVal(r.unidadeMedida) || 'un';
      const key = `${normalizeUpperAscii(tip)}||${normalizeUpperAscii(sub)}||${normalizeUpperAscii(um)}`;
      const existing = groupedSummary.get(key);
      if (existing) {
        existing.qtd += Number(r.quantidade || 0);
      } else {
        groupedSummary.set(key, { tipo: tip, subtipo: sub, um, qtd: Number(r.quantidade || 0) });
      }
      byMeasureTotal.set(um, (byMeasureTotal.get(um) || 0) + Number(r.quantidade || 0));
    }

    const summaryRows = Array.from(groupedSummary.values())
      .sort((a, b) => {
        const tc = a.tipo.localeCompare(b.tipo, 'pt-BR');
        if (tc !== 0) return tc;
        const sc = a.subtipo.localeCompare(b.subtipo, 'pt-BR');
        if (sc !== 0) return sc;
        return a.um.localeCompare(b.um, 'pt-BR');
      })
      .map(item => ({
        tipo: item.tipo,
        subtipo: item.subtipo,
        qtd: `${formatDecimalBr(item.qtd)} ${item.um}`
      }));

    const totalByMeasureStr =
      Array.from(byMeasureTotal.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([um, qty]) => `${formatDecimalBr(qty)} ${um}`)
        .join(' | ') || '-';

    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showKpis: true,
      showTableHeader: false
    });

    const summaryCols: SummaryColSpec[] = [
      { key: 'tipo', label: 'TIPO DE EXPLOSIVO', width: 250, align: 'left', bold: true },
      { key: 'subtipo', label: 'SUBTIPO', width: contentWidth - (250 + 185), align: 'left', bold: false },
      { key: 'qtd', label: 'QUANTIDADE EM ESTOQUE', width: 185, align: 'right', mono: true, bold: true }
    ];

    const summaryRes = drawSummaryTableWithPagination({
      page,
      cursorY,
      marginX,
      pageWidth,
      contentWidth,
      footerSafeY,
      fontRegular,
      fontBold,
      fontMono,
      fontMonoBold,
      sectionTitle: `RESUMO DO ESTOQUE DE EXPLOSIVOS POR TIPO E SUBTIPO - ${unitDisplayLabel.toUpperCase()}`,
      headerVariant: 'light-underline',
      columns: summaryCols,
      rows: summaryRows,
      totalLabel: `TOTAIS EM ESTOQUE (${unitDisplayLabel.toUpperCase()})`,
      totalValue: totalByMeasureStr,
      onNewPage: () => {
        const nextPage = doc.addPage([pageWidth, pageHeight]);
        const nextY = drawUnitPageHeader(nextPage, unitDisplayLabel, unitGroup.records, {
          showKpis: false,
          showTableHeader: false
        });
        return { page: nextPage, cursorY: nextY };
      }
    });
    page = summaryRes.page;
    cursorY = summaryRes.cursorY;

    // 2. RELAÇÃO COMPLETA DA UNIDADE (INICIA EM NOVA PÁGINA)
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showKpis: false,
      showTableHeader: true,
      sectionBanner: `RELACAO COMPLETA DE EXPLOSIVOS - ${unitDisplayLabel.toUpperCase()} (${unitGroup.records.length} registro(s))`
    });

    unitGroup.records.forEach((rec, index) => {
      const tipoFull = [rec.tipo, rec.subtipo].filter(Boolean).join(' / ');
      let valTag = '';
      if (rec.validadeRaw) {
        if (rec.validadeRaw.getTime() < nowMs) valTag = ' [VENCIDO]';
        else if (rec.validadeRaw.getTime() <= in90DaysMs) valTag = ' [A VENCER]';
      }
      const localStr = [
        rec.localArmazenamento,
        rec.cofreCodigo && rec.cofreCodigo !== rec.localArmazenamento ? `Cofre ${rec.cofreCodigo}` : '',
        rec.unidadeNome
      ]
        .filter(Boolean)
        .join('\n');

      const rawValues: Record<string, string> = {
        nome: rec.nome,
        tipo: tipoFull || '-',
        qtd: `${formatDecimalBr(rec.quantidade)} ${rec.unidadeMedida}`,
        lote: rec.lote || '-',
        fab: rec.fabricante || '-',
        risco: rec.classeRisco || '-',
        datas: `Fab: ${rec.dataFabricacao}\nVal: ${rec.dataValidade}${valTag}`,
        local: localStr || '-',
        status: rec.status || 'Operacional',
        obs: rec.observacoes || '-'
      };

      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;
      for (const col of columns) {
        const f =
          col.key === 'nome' || col.key === 'local' || col.key === 'status'
            ? fontBold
            : col.key === 'qtd'
              ? fontMonoBold
              : col.key === 'lote'
                ? fontMono
                : fontRegular;
        const maxL = col.key === 'obs' ? 12 : 5;
        const lines = wrapCellLines(rawValues[col.key] || '-', f, fontSize, col.width - 7, maxL);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const rowH = Math.max(20, maxLines * lineH + 7);
      if (cursorY - rowH < footerSafeY + 6) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
          showKpis: false,
          showTableHeader: true,
          sectionBanner: `RELACAO COMPLETA DE EXPLOSIVOS - ${unitDisplayLabel.toUpperCase()} (CONTINUACAO)`
        });
      }

      const rowBottomY = cursorY - rowH;
      if (index % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.slate50
        });
      }
      page.drawLine({
        start: { x: marginX, y: rowBottomY },
        end: { x: pageWidth - marginX, y: rowBottomY },
        thickness: 0.7,
        color: PCMG_COLORS.slate300
      });

      let colX = marginX;
      for (const col of columns) {
        const lines = wrapped[col.key] || ['-'];
        const f =
          col.key === 'nome' || col.key === 'local' || col.key === 'status'
            ? fontBold
            : col.key === 'qtd'
              ? fontMonoBold
              : col.key === 'lote'
                ? fontMono
                : fontRegular;
        const color = col.key === 'local' ? PCMG_COLORS.sky700 : PCMG_COLORS.ink;
        const useSize = col.key === 'risco' || col.key === 'obs' ? 6.7 : fontSize;

        lines.forEach((line, lIdx) => {
          const tx =
            col.align === 'center'
              ? colX + (col.width - f.widthOfTextAtSize(line, useSize)) / 2
              : colX + 4;
          page.drawText(line, {
            x: tx,
            y: cursorY - 10 - lIdx * lineH,
            size: useSize,
            font: f,
            color
          });
        });
        colX += col.width;
      }

      cursorY = rowBottomY;
    });
  }

  // Assinaturas duplas idênticas ao ModuloExplosivos.tsx
  if (cursorY - 68 < footerSafeY) {
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr) - 18;
  }

  cursorY -= 36;
  const sigW = 240;
  const leftSigX = marginX + 95;
  const rightSigX = pageWidth - marginX - 95 - sigW;

  const drawExpSig = (x: number, l1: string, l2: string, l3: string) => {
    page.drawLine({
      start: { x, y: cursorY },
      end: { x: x + sigW, y: cursorY },
      thickness: 0.9,
      color: PCMG_COLORS.ink
    });
    const t1 = fitTextToWidth(l1, fontBold, 8.2, sigW);
    const t2 = fitTextToWidth(l2, fontRegular, 7.6, sigW);
    const t3 = fitTextToWidth(l3, fontRegular, 7.6, sigW);
    page.drawText(t1, { x: x + (sigW - fontBold.widthOfTextAtSize(t1, 8.2)) / 2, y: cursorY - 11, size: 8.2, font: fontBold, color: PCMG_COLORS.ink });
    if (l2) page.drawText(t2, { x: x + (sigW - fontRegular.widthOfTextAtSize(t2, 7.6)) / 2, y: cursorY - 21, size: 7.6, font: fontRegular, color: PCMG_COLORS.slate700 });
    if (l3) page.drawText(t3, { x: x + (sigW - fontRegular.widthOfTextAtSize(t3, 7.6)) / 2, y: cursorY - 31, size: 7.6, font: fontRegular, color: PCMG_COLORS.slate700 });
  };

  drawExpSig(leftSigX, params.solicitanteNome, `MASP: ${formatMaspBr(params.solicitanteMasp)}`, 'Responsavel pelo Paiol / Explosivista');
  drawExpSig(rightSigX, 'Visto da Autoridade Policial', 'Titular da Unidade Policial', '');

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `Sistema de Armaria PCMG - Relatorio de Inventario do Paiol de Explosivos | Unidade: ${params.unidadeLabel}`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================================
// 4. PDF DE MATERIAIS — LAYOUT IDÊNTICO AO ModuloMateriais.tsx (A4 Paisagem)
// ============================================================================
export interface SystemMaterialPdfRecord {
  id: string;
  nome: string;
  tipoNome: string;
  categoria: string;
  consumivel: boolean;
  numeroSerie: string;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  quantidadeEmUso: number;
  quantidadeConsumida: number;
  passivoDepositoPoliciais: boolean;
  validade: string;
  validadeRaw: Date | null;
  localGuarda: string;
  cofreCodigo: string;
  cofreDescricao: string;
  unidadeNome: string;
  departamentoNome: string;
  acautelamentoResumo: string;
  isAcautelado: boolean;
  criadoPorNome: string;
  criadoEm: string;
  observacoes: string;
}

export async function generateSystemMateriaisPdf(params: {
  departamentoLabel: string;
  unidadeLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  logoDataUri: string | null;
  records: SystemMaterialPdfRecord[];
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Relatório de Materiais - ${params.unidadeLabel}`);
  doc.setAuthor('Sistema de Armaria - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 26;
  const contentWidth = pageWidth - marginX * 2; // 789.89pt
  const footerSafeY = 56;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);
  const nowMs = Date.now();

  const fixedCols = 20 + 96 + 76 + 74 + 68 + 68 + 80 + 96 + 38 + 52;
  const columns = [
    { key: 'idx', label: '#', width: 20, align: 'center' as const },
    { key: 'nome', label: 'NOME DO MATERIAL', width: 96, align: 'left' as const },
    { key: 'tipo', label: 'TIPO / CATEGORIA', width: 76, align: 'left' as const },
    { key: 'serie', label: 'N. SERIE / PATR.', width: 74, align: 'left' as const },
    { key: 'cofre', label: 'COFRE / LOCAL', width: 68, align: 'left' as const },
    { key: 'unidade', label: 'DEPTO / UNIDADE', width: 68, align: 'left' as const },
    { key: 'estoque', label: 'ESTOQUE (T/D/U/C)', width: 80, align: 'left' as const },
    { key: 'acaut', label: 'ACAUTELAMENTO / SIT.', width: 96, align: 'left' as const },
    { key: 'cautelavel', label: 'CAUT.', width: 38, align: 'center' as const },
    { key: 'validade', label: 'VALIDADE', width: 52, align: 'left' as const },
    { key: 'obs', label: 'OBSERVACOES', width: contentWidth - fixedCols, align: 'left' as const }
  ];

  const drawTableHeader = (page: PDFPage, y: number, sectionBanner?: string): number => {
    if (sectionBanner) {
      page.drawRectangle({
        x: marginX,
        y: y - 12,
        width: 3.5,
        height: 12,
        color: PCMG_COLORS.amber600
      });
      page.drawText(fitTextToWidth(sectionBanner, fontBold, 8.5, contentWidth - 12), {
        x: marginX + 8,
        y: y - 9.5,
        size: 8.5,
        font: fontBold,
        color: PCMG_COLORS.slate900
      });
      y -= 16;
    }

    const h = 19;
    page.drawRectangle({
      x: marginX,
      y: y - h,
      width: contentWidth,
      height: h,
      color: PCMG_COLORS.slate800
    });
    let colX = marginX;
    for (const col of columns) {
      page.drawRectangle({
        x: colX,
        y: y - h,
        width: col.width,
        height: h,
        borderColor: PCMG_COLORS.slate700,
        borderWidth: 0.5
      });
      const lbl = fitTextToWidth(col.label, fontBold, 6.5, col.width - 5);
      const tx =
        col.align === 'center'
          ? colX + (col.width - fontBold.widthOfTextAtSize(lbl, 6.5)) / 2
          : colX + 3;
      page.drawText(lbl, {
        x: tx,
        y: y - 12.5,
        size: 6.5,
        font: fontBold,
        color: PCMG_COLORS.white
      });
      colX += col.width;
    }
    return y - h;
  };

  const drawUnitPageHeader = (
    page: PDFPage,
    unitDisplayLabel: string,
    unitRecords: SystemMaterialPdfRecord[],
    options: { showKpis: boolean; showTableHeader: boolean; sectionBanner?: string }
  ): number => {
    let y = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr);

    const headerTopY = y;
    let textX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(42, 42);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 42 + (42 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      textX = marginX + dims.width + 10;
    }

    page.drawText('POLICIA CIVIL DO ESTADO DE MINAS GERAIS', {
      x: textX,
      y: headerTopY - 15,
      size: 12,
      font: fontBold,
      color: PCMG_COLORS.slate900
    });
    page.drawText(`SISTEMA DE ARMARIA - RELATORIO DE MATERIAIS (${unitDisplayLabel.toUpperCase()})`, {
      x: textX,
      y: headerTopY - 29,
      size: 8.5,
      font: fontBold,
      color: PCMG_COLORS.amber700
    });

    const m1 = `Emissor: ${params.solicitanteNome} (MASP: ${formatMaspBr(params.solicitanteMasp)})`;
    const m2 = `Emitido em: ${emissaoBr}`;
    page.drawText(m1, {
      x: pageWidth - marginX - fontMonoBold.widthOfTextAtSize(m1, 7.4),
      y: headerTopY - 16,
      size: 7.4,
      font: fontMonoBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(m2, {
      x: pageWidth - marginX - fontMono.widthOfTextAtSize(m2, 7.4),
      y: headerTopY - 28,
      size: 7.4,
      font: fontMono,
      color: PCMG_COLORS.slate700
    });

    y = headerTopY - 46;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.slate900
    });
    y -= 9;

    if (options.showKpis) {
      const uItens = unitRecords.length;
      const uTotal = unitRecords.reduce((s, r) => s + r.quantidadeTotal, 0);
      const uDisp = unitRecords.reduce((s, r) => s + r.quantidadeDisponivel, 0);
      const uUso = unitRecords.reduce((s, r) => s + r.quantidadeEmUso, 0);
      const uCons = unitRecords.reduce((s, r) => s + r.quantidadeConsumida, 0);

      const fH = 20;
      page.drawRectangle({
        x: marginX,
        y: y - fH,
        width: contentWidth,
        height: fH,
        color: PCMG_COLORS.slate50,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.7
      });
      page.drawText(
        fitTextToWidth(
          `Filtros Aplicados: Departamento: ${params.departamentoLabel} - Unidade: ${unitDisplayLabel}`,
          fontBold,
          7.6,
          contentWidth - 16
        ),
        {
          x: marginX + 8,
          y: y - 13,
          size: 7.6,
          font: fontBold,
          color: PCMG_COLORS.ink
        }
      );
      y -= fH + 8;

      const kpis = [
        { label: 'REGISTROS', val: String(uItens), color: PCMG_COLORS.ink },
        { label: 'QTD TOTAL', val: `${formatIntBr(uTotal)} un`, color: PCMG_COLORS.ink },
        { label: 'DISPONIVEL', val: `${formatIntBr(uDisp)} un`, color: PCMG_COLORS.emerald700 },
        { label: 'EM USO', val: `${formatIntBr(uUso)} un`, color: PCMG_COLORS.amber700 },
        { label: 'CONSUMIDOS', val: `${formatIntBr(uCons)} un`, color: PCMG_COLORS.purple700 }
      ];
      const gap = 8;
      const kpiW = (contentWidth - gap * 4) / 5;
      const kpiH = 31;
      kpis.forEach((k, idx) => {
        const kx = marginX + idx * (kpiW + gap);
        page.drawRectangle({
          x: kx,
          y: y - kpiH,
          width: kpiW,
          height: kpiH,
          color: PCMG_COLORS.white,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.7
        });
        page.drawText(k.label, {
          x: kx + (kpiW - fontBold.widthOfTextAtSize(k.label, 6.5)) / 2,
          y: y - 11,
          size: 6.5,
          font: fontBold,
          color: PCMG_COLORS.slate500
        });
        page.drawText(k.val, {
          x: kx + (kpiW - fontMonoBold.widthOfTextAtSize(k.val, 10)) / 2,
          y: y - 24,
          size: 10,
          font: fontMonoBold,
          color: k.color
        });
      });
      y -= kpiH + 10;
    }

    if (options.showTableHeader) {
      return drawTableHeader(page, y, options.sectionBanner);
    }
    return y;
  };

  const unitGroups = groupRecordsByUnit(params.records);
  const isMultiUnit = unitGroups.length > 1;
  const fontSize = 6.9;
  const lineH = 9.0;

  let page!: PDFPage;
  let cursorY = 0;

  for (const unitGroup of unitGroups) {
    const unitDisplayLabel = isMultiUnit ? unitGroup.unitName : params.unidadeLabel;
    const unitTotalQtd = unitGroup.records.reduce((s, r) => s + r.quantidadeTotal, 0);

    // 1. PÁGINA DE RESUMO DE ESTOQUE DA UNIDADE (Tipo | Nome do Material | Quantidade em Estoque)
    const groupedSummary = new Map<string, { tipo: string; nome: string; qtd: number }>();
    for (const r of unitGroup.records) {
      const tip = cleanSummaryVal(r.tipoNome) || 'Geral';
      const nom = cleanSummaryVal(r.nome) || '-';
      const key = `${normalizeUpperAscii(tip)}||${normalizeUpperAscii(nom)}`;
      const existing = groupedSummary.get(key);
      if (existing) {
        existing.qtd += Number(r.quantidadeTotal || 0);
      } else {
        groupedSummary.set(key, { tipo: tip, nome: nom, qtd: Number(r.quantidadeTotal || 0) });
      }
    }

    const summaryRows = Array.from(groupedSummary.values())
      .sort((a, b) => {
        const tc = a.tipo.localeCompare(b.tipo, 'pt-BR');
        if (tc !== 0) return tc;
        return a.nome.localeCompare(b.nome, 'pt-BR');
      })
      .map(item => ({
        tipo: item.tipo,
        nome: item.nome,
        qtd: formatUnitsLabel(item.qtd, true)
      }));

    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showKpis: true,
      showTableHeader: false
    });

    const summaryCols: SummaryColSpec[] = [
      { key: 'tipo', label: 'TIPO DE MATERIAL', width: 220, align: 'left', bold: true },
      { key: 'nome', label: 'NOME DO MATERIAL', width: contentWidth - (220 + 165), align: 'left', bold: false },
      { key: 'qtd', label: 'QUANTIDADE EM ESTOQUE', width: 165, align: 'right', mono: true, bold: true }
    ];

    const summaryRes = drawSummaryTableWithPagination({
      page,
      cursorY,
      marginX,
      pageWidth,
      contentWidth,
      footerSafeY,
      fontRegular,
      fontBold,
      fontMono,
      fontMonoBold,
      sectionTitle: `RESUMO DO ESTOQUE DE MATERIAIS POR TIPO E NOME - ${unitDisplayLabel.toUpperCase()}`,
      headerVariant: 'slate800-amber',
      columns: summaryCols,
      rows: summaryRows,
      totalLabel: `TOTAL EM ESTOQUE (${unitDisplayLabel.toUpperCase()})`,
      totalValue: formatUnitsLabel(unitTotalQtd, true),
      onNewPage: () => {
        const nextPage = doc.addPage([pageWidth, pageHeight]);
        const nextY = drawUnitPageHeader(nextPage, unitDisplayLabel, unitGroup.records, {
          showKpis: false,
          showTableHeader: false
        });
        return { page: nextPage, cursorY: nextY };
      }
    });
    page = summaryRes.page;
    cursorY = summaryRes.cursorY;

    // 2. RELAÇÃO COMPLETA DA UNIDADE (INICIA EM NOVA PÁGINA)
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
      showKpis: false,
      showTableHeader: true,
      sectionBanner: `RELACAO DETALHADA DE MATERIAIS - ${unitDisplayLabel.toUpperCase()} (${unitGroup.records.length} registro(s))`
    });

    unitGroup.records.forEach((rec, index) => {
      const tipoStr = `${rec.tipoNome}\n${rec.categoria || 'Geral'} (${rec.consumivel ? 'Consumivel' : 'Permanente'})`;
      const cofreStr = `${rec.localGuarda || rec.cofreCodigo || '-'}${rec.cofreDescricao ? `\n${rec.cofreDescricao}` : ''}`;
      const uniStr = `${rec.unidadeNome}${rec.departamentoNome ? `\n${rec.departamentoNome}` : ''}`;
      const estoqueStr = `Tot: ${formatIntBr(rec.quantidadeTotal)}\nD:${formatIntBr(rec.quantidadeDisponivel)} | U:${formatIntBr(rec.quantidadeEmUso)} | C:${formatIntBr(rec.quantidadeConsumida)}`;
      const valStr =
        rec.validadeRaw && rec.validadeRaw.getTime() < nowMs ? `${rec.validade} [VENC.]` : rec.validade || '-';

      const rawValues: Record<string, string> = {
        idx: String(index + 1),
        nome: rec.nome,
        tipo: tipoStr,
        serie: rec.numeroSerie || '-',
        cofre: cofreStr,
        unidade: uniStr,
        estoque: estoqueStr,
        acaut: rec.acautelamentoResumo || (rec.isAcautelado ? `ACAUTELADO (${rec.quantidadeEmUso} un.)` : 'NO COFRE'),
        cautelavel: rec.passivoDepositoPoliciais ? 'SIM' : 'NAO',
        validade: valStr,
        obs: rec.observacoes || '-'
      };

      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;
      for (const col of columns) {
        const f =
          col.key === 'nome' || col.key === 'cautelavel'
            ? fontBold
            : col.key === 'idx' || col.key === 'serie' || col.key === 'estoque'
              ? fontMono
              : fontRegular;
        const lines = wrapCellLines(rawValues[col.key] || '-', f, fontSize, col.width - 6, 7);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const rowH = Math.max(19, maxLines * lineH + 6);
      if (cursorY - rowH < footerSafeY + 6) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawUnitPageHeader(page, unitDisplayLabel, unitGroup.records, {
          showKpis: false,
          showTableHeader: true,
          sectionBanner: `RELACAO DETALHADA DE MATERIAIS - ${unitDisplayLabel.toUpperCase()} (CONTINUACAO)`
        });
      }

      const rowBottomY = cursorY - rowH;
      if (index % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.slate50
        });
      }

      let colX = marginX;
      for (const col of columns) {
        page.drawRectangle({
          x: colX,
          y: rowBottomY,
          width: col.width,
          height: rowH,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.45
        });

        const lines = wrapped[col.key] || ['-'];
        lines.forEach((line, lIdx) => {
          let useFont = fontRegular;
          let useColor = PCMG_COLORS.slate900;
          let useSize = fontSize;

          if (col.key === 'nome') {
            useFont = fontBold;
          } else if (col.key === 'idx' || col.key === 'serie') {
            useFont = fontMono;
          } else if (col.key === 'estoque') {
            useFont = lIdx === 0 ? fontMonoBold : fontMono;
            useSize = 6.5;
          } else if (col.key === 'tipo' || col.key === 'cofre' || col.key === 'unidade') {
            useFont = lIdx === 0 ? (col.key === 'cofre' ? fontMonoBold : fontBold) : fontRegular;
            if (lIdx > 0) {
              useColor = PCMG_COLORS.slate600;
              useSize = 6.3;
            }
          } else if (col.key === 'acaut') {
            useFont = lIdx === 0 ? fontBold : fontRegular;
            useColor = rec.isAcautelado
              ? lIdx === 0
                ? PCMG_COLORS.amber700
                : PCMG_COLORS.slate700
              : PCMG_COLORS.emerald700;
            useSize = lIdx === 0 ? 6.7 : 6.3;
          } else if (col.key === 'cautelavel') {
            useFont = fontBold;
          }

          const tx =
            col.align === 'center'
              ? colX + (col.width - useFont.widthOfTextAtSize(line, useSize)) / 2
              : colX + 3;
          page.drawText(line, {
            x: tx,
            y: cursorY - 9.5 - lIdx * lineH,
            size: useSize,
            font: useFont,
            color: useColor
          });
        });
        colX += col.width;
      }

      cursorY = rowBottomY;
    });
  }

  // Assinatura centralizada idêntica ao ModuloMateriais.tsx
  if (cursorY - 60 < footerSafeY) {
    page = doc.addPage([pageWidth, pageHeight]);
    cursorY = drawTopUniqueCodeBar(page, pageWidth, pageHeight, marginX, fontMono, fontMonoBold, docCode, emissaoBr) - 18;
  }

  cursorY -= 32;
  const sigW = 280;
  const sigX = (pageWidth - sigW) / 2;
  page.drawLine({
    start: { x: sigX, y: cursorY },
    end: { x: sigX + sigW, y: cursorY },
    thickness: 1,
    color: PCMG_COLORS.slate900
  });
  const s1 = fitTextToWidth(params.solicitanteNome, fontBold, 8.4, sigW);
  const s2 = `MASP: ${formatMaspBr(params.solicitanteMasp)}`;
  page.drawText(s1, {
    x: sigX + (sigW - fontBold.widthOfTextAtSize(s1, 8.4)) / 2,
    y: cursorY - 11,
    size: 8.4,
    font: fontBold,
    color: PCMG_COLORS.slate900
  });
  page.drawText(s2, {
    x: sigX + (sigW - fontRegular.widthOfTextAtSize(s2, 7.6)) / 2,
    y: cursorY - 21,
    size: 7.6,
    font: fontRegular,
    color: PCMG_COLORS.slate600
  });

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `Sistema de Armeria PCMG - Relatorio gerado em ${emissaoBr} | Unidade: ${params.unidadeLabel}`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================================
// 5. PDF DE SINOPSE OPERACIONAL — LAYOUT IDÊNTICO AO "IMPRIMIR HISTÓRICO"
//    (Módulo Relatórios -> Relatório da unidade -> Operações — A4 Paisagem)
// ============================================================================
export interface SystemCatOpPdfRecord {
  id: string;
  unidadeNome: string;
  dataOperacao: string; // YYYY-MM-DD
  horarioDecolagem: string;
  horarioVooOperacao: string;
  estadoOperacao: string;
  municipioOperacao: string;
  apenasUmMunicipio: boolean;
  outrosMunicipios: Array<{ municipio: string; uf: string }>;
  apoioOutroDepartamento: boolean;
  departamentosApoio: string[];
  comEmpregoAeronave: boolean;
  tipoVoo: string;
  aeronaves: Array<{
    tipo: string;
    prefixo: string;
    horasVoo: string;
    pilotoNome: string;
    copilotoNome: string;
  }>;
  tripulantesOperacionais: Array<{ name: string }>;
  viaturas: Array<{ placa: string; descricao: string; operadores: Array<{ name: string }> }>;
  equipeSolo: Array<{ name: string }>;
  sinopseVoo: string;
  teveDisparosCat: boolean;
  totalDisparosCat: number;
  teveObito: boolean;
  quantidadeObitos: number;
}

export interface SystemPolicialOpPdfRecord {
  id: string;
  unidadeNome: string;
  dataOperacao: string; // YYYY-MM-DD
  horarioOperacao: string;
  estadoOperacao: string;
  municipioOperacao: string;
  apenasUmMunicipio: boolean;
  outrosMunicipios: Array<{ municipio: string; uf: string }>;
  tipoAtendimento: string;
  acionamentoVia: string;
  departamentosApoio: string[];
  viaturas: Array<{ placa: string; descricao: string }>;
  operadores: Array<{ name: string; masp: string }>;
  criadorNome: string;
  sinopse: string;
  detalhesExtras: string[];
}

export interface SystemCanilOpPdfRecord {
  id: string;
  unidadeNome: string;
  dataOperacao: string; // YYYY-MM-DD
  horaOperacao: string;
  estadoOperacao: string;
  comarca: string;
  solicitacaoTexto: string;
  apoioOutroDepartamento: boolean;
  departamentosApoio: string[];
  viaturas: Array<{ placa: string; descricao: string }>;
  materialEncontrado: boolean;
  materiaisEncontrados: Array<{ tipo: string; cachorros: string[] }>;
  operadores: Array<{ name: string; cachorros: string[] }>;
  criadorNome: string;
  detalhamento: string;
}

function formatIsoDateOnlyBr(iso?: string | null): string {
  const s = String(iso || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s || '-';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function sumCatFlightHoursHHMM(aeronaves: Array<{ horasVoo?: string }>): string {
  let totalMin = 0;
  for (const a of aeronaves) {
    const raw = String(a?.horasVoo || '').trim();
    const m = raw.match(/^(\d{1,4}):(\d{2})$/);
    if (m) {
      totalMin += Number(m[1]) * 60 + Number(m[2]);
    }
  }
  if (totalMin <= 0) return '';
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export async function generateSystemSinopseOperacionalPdf(params: {
  departamentoLabel: string;
  unidadeLabel: string;
  isTodosUnidades: boolean;
  periodoLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  logoDataUri: string | null;
  catOps: SystemCatOpPdfRecord[];
  polOps: SystemPolicialOpPdfRecord[];
  canilOps: SystemCanilOpPdfRecord[];
}): Promise<Buffer> {
  const totalCount = params.catOps.length + params.polOps.length + params.canilOps.length;
  const isCocOnly =
    !params.isTodosUnidades &&
    params.canilOps.length > 0 &&
    params.catOps.length === 0 &&
    params.polOps.length === 0;

  const doc = await PDFDocument.create();
  doc.setTitle(
    isCocOnly
      ? `Histórico de Relatórios da Unidade — Canil K9 (COC)`
      : `Histórico de Relatórios da Unidade — ${params.unidadeLabel}`
  );
  doc.setAuthor('Sistema ARMARIA - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  // A4 Paisagem (idêntico ao @page { size: A4 landscape; margin: 12mm; } do Imprimir Histórico)
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2; // 785.89pt
  const footerSafeY = 54;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);

  const totalCatFlightHours =
    params.catOps.length > 0
      ? sumCatFlightHoursHHMM(
          params.catOps.flatMap(r => (r.comEmpregoAeronave ? r.aeronaves || [] : []))
        )
      : '';

  // Distribuição por unidade quando selecionado "Todos"
  const unitCounts = new Map<string, number>();
  for (const r of [...params.catOps, ...params.polOps, ...params.canilOps]) {
    const uName = r.unidadeNome || 'Sem Unidade';
    unitCounts.set(uName, (unitCounts.get(uName) || 0) + 1);
  }
  const unitBreakdownText =
    params.isTodosUnidades && unitCounts.size > 0
      ? '   |   Por unidade: ' +
        Array.from(unitCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([u, c]) => `${u}: ${c}`)
          .join(' - ')
      : '';

  const filtersSummaryText = `Tipo: Operacoes - Unidade: ${params.unidadeLabel} - Periodo: ${params.periodoLabel}`;

  const drawPageTopHeader = (page: PDFPage, isFirstPage: boolean): number => {
    let y = drawTopUniqueCodeBar(
      page,
      pageWidth,
      pageHeight,
      marginX,
      fontMono,
      fontMonoBold,
      docCode,
      emissaoBr
    );

    const headerTopY = y;
    let textX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(42, 42);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 42 + (42 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      textX = marginX + dims.width + 10;
    }

    const rightBlockW = 240;
    const titleMaxW = contentWidth - (textX - marginX) - rightBlockW - 10;
    const mainTitle = isCocOnly
      ? 'POLICIA CIVIL DE MINAS GERAIS - HISTORICO DE RELATORIOS DA UNIDADE (COC / CANIL K9)'
      : 'POLICIA CIVIL DE MINAS GERAIS - HISTORICO DE RELATORIOS DA UNIDADE';

    page.drawText(fitTextToWidth(mainTitle, fontBold, 10.6, titleMaxW), {
      x: textX,
      y: headerTopY - 14,
      size: 10.6,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawText(
      fitTextToWidth(
        `${params.departamentoLabel} - Unidade: ${params.unidadeLabel}`,
        fontRegular,
        8.6,
        titleMaxW
      ),
      {
        x: textX,
        y: headerTopY - 29,
        size: 8.6,
        font: fontRegular,
        color: PCMG_COLORS.slate600
      }
    );

    const emitLine = fitTextToWidth(
      `Emitido por: ${params.solicitanteNome}${
        params.solicitanteMasp ? ` (MASP ${formatMaspBr(params.solicitanteMasp)})` : ''
      }`,
      fontBold,
      7.9,
      rightBlockW
    );
    const dateLine = `Emissao: ${emissaoBr}`;
    page.drawText(emitLine, {
      x: pageWidth - marginX - fontBold.widthOfTextAtSize(emitLine, 7.9),
      y: headerTopY - 15,
      size: 7.9,
      font: fontBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(dateLine, {
      x: pageWidth - marginX - fontRegular.widthOfTextAtSize(dateLine, 7.8),
      y: headerTopY - 28,
      size: 7.8,
      font: fontRegular,
      color: PCMG_COLORS.slate700
    });

    y = headerTopY - 46;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.ink
    });
    y -= 9;

    if (isFirstPage) {
      // .filters-box (#f8fafc, border #cbd5e1)
      const filterLines = wrapCellLines(
        `FILTROS APLICADOS: ${filtersSummaryText}`,
        fontRegular,
        7.8,
        contentWidth - 16,
        3
      );
      const filterBoxH = Math.max(20, filterLines.length * 10 + 9);
      page.drawRectangle({
        x: marginX,
        y: y - filterBoxH,
        width: contentWidth,
        height: filterBoxH,
        color: PCMG_COLORS.slate50,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.75
      });
      filterLines.forEach((ln, idx) => {
        page.drawText(ln, {
          x: marginX + 8,
          y: y - 12 - idx * 10,
          size: 7.8,
          font: idx === 0 ? fontBold : fontRegular,
          color: PCMG_COLORS.ink
        });
      });
      y -= filterBoxH + 8;

      // .summary-bar
      const summaryParts = [
        `Total de registros: ${totalCount}`,
        `Operacoes: ${totalCount}`,
        totalCatFlightHours ? `Total Horas de Voo (CAT): ${totalCatFlightHours}` : ''
      ].filter(Boolean);
      const summaryText = summaryParts.join('   |   ') + unitBreakdownText;
      const summaryLines = wrapCellLines(summaryText, fontBold, 8, contentWidth, 2);
      summaryLines.forEach((ln, idx) => {
        page.drawText(ln, {
          x: marginX,
          y: y - 8 - idx * 10,
          size: 8,
          font: fontBold,
          color: PCMG_COLORS.slate700
        });
      });
      y -= summaryLines.length * 10 + 6;
    }

    return y;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = drawPageTopHeader(page, true);

  interface TableColSpec {
    key: string;
    label: string;
    width: number;
    mono?: boolean;
    boldFirstLine?: boolean;
  }

  const drawColsHeader = (cols: TableColSpec[]): void => {
    const thH = 18;
    page.drawRectangle({
      x: marginX,
      y: cursorY - thH,
      width: contentWidth,
      height: thH,
      color: PCMG_COLORS.slate200,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.7
    });
    let colX = marginX;
    for (const col of cols) {
      page.drawRectangle({
        x: colX,
        y: cursorY - thH,
        width: col.width,
        height: thH,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.55
      });
      const lbl = fitTextToWidth(col.label, fontBold, 7.1, col.width - 8);
      page.drawText(lbl, {
        x: colX + 4,
        y: cursorY - 11.8,
        size: 7.1,
        font: fontBold,
        color: PCMG_COLORS.slate800
      });
      colX += col.width;
    }
    cursorY -= thH;
  };

  const drawSectionHeaderAndTableHead = (sectionTitle: string, cols: TableColSpec[]): void => {
    const neededH = 18 + 18 + 22; // título + header + 1 linha mínima
    if (cursorY - neededH < footerSafeY) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = drawPageTopHeader(page, false);
    }

    // .section-title (bold uppercase #0f172a + border-bottom #cbd5e1)
    page.drawText(fitTextToWidth(sectionTitle.toUpperCase(), fontBold, 8.8, contentWidth), {
      x: marginX,
      y: cursorY - 10,
      size: 8.8,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawLine({
      start: { x: marginX, y: cursorY - 14 },
      end: { x: pageWidth - marginX, y: cursorY - 14 },
      thickness: 0.85,
      color: PCMG_COLORS.slate300
    });
    cursorY -= 18;

    drawColsHeader(cols);
  };

  const drawTableRows = (
    sectionTitle: string,
    cols: TableColSpec[],
    rows: Array<Record<string, string>>
  ): void => {
    drawSectionHeaderAndTableHead(sectionTitle, cols);

    const fontSize = 7.4;
    const lineH = 9.6;

    rows.forEach((rowMap, rowIdx) => {
      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;

      for (const col of cols) {
        const useFont = col.mono ? fontMono : fontRegular;
        const lines = wrapCellLines(rowMap[col.key] || '-', useFont, fontSize, col.width - 8, 30);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const maxUsableHeight = pageHeight - 135 - footerSafeY;
      const rawRowH = Math.max(20, maxLines * lineH + 8);
      const rowH = Math.min(rawRowH, maxUsableHeight);

      if (cursorY - rowH < footerSafeY) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawPageTopHeader(page, false);
        drawColsHeader(cols);
      }

      const rowBottomY = cursorY - rowH;
      if (rowIdx % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.grayRow
        });
      }

      const maxRenderableLines = Math.max(1, Math.floor((rowH - 6) / lineH));
      let colX = marginX;
      for (const col of cols) {
        page.drawRectangle({
          x: colX,
          y: rowBottomY,
          width: col.width,
          height: rowH,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.5
        });

        const lines = (wrapped[col.key] || ['-']).slice(0, maxRenderableLines);
        lines.forEach((line, lIdx) => {
          const isFirst = lIdx === 0;
          const useFont = col.mono
            ? isFirst
              ? fontMonoBold
              : fontMono
            : col.boldFirstLine && isFirst
              ? fontBold
              : fontRegular;
          const useSize = col.mono && !isFirst ? 6.9 : fontSize;
          const useColor =
            col.mono && !isFirst
              ? PCMG_COLORS.slate600
              : PCMG_COLORS.ink;

          page.drawText(line, {
            x: colX + 4,
            y: cursorY - 10.5 - lIdx * lineH,
            size: useSize,
            font: useFont,
            color: useColor
          });
        });

        colX += col.width;
      }

      cursorY = rowBottomY;
    });

    cursorY -= 10;
  };

  // --- SEÇÃO 1: RELATÓRIOS DE OPERAÇÕES CAT ---
  if (params.catOps.length > 0) {
    const wData = Math.round(contentWidth * 0.09);
    const wMun = Math.round(contentWidth * 0.13);
    const wMod = Math.round(contentWidth * 0.12);
    const wAero = Math.round(contentWidth * 0.20);
    const wVtr = Math.round(contentWidth * 0.15);
    const wSin = contentWidth - (wData + wMun + wMod + wAero + wVtr);

    const catCols: TableColSpec[] = [
      { key: 'data', label: 'DATA / HORARIO', width: wData, mono: true },
      { key: 'mun', label: 'MUNICIPIO(S) / UF', width: wMun, boldFirstLine: true },
      { key: 'mod', label: 'MODALIDADE / VOO', width: wMod, boldFirstLine: true },
      { key: 'aero', label: 'AERONAVE E TRIPULACAO', width: wAero },
      { key: 'vtr', label: 'VIATURAS / EQUIPE', width: wVtr },
      { key: 'sin', label: 'SINOPSE / OCORRENCIAS', width: wSin }
    ];

    const catRows = params.catOps.map(rel => {
      const muns = [
        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
        ...(!rel.apenasUmMunicipio
          ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`)
          : [])
      ];
      if (rel.apoioOutroDepartamento && rel.departamentosApoio.length > 0) {
        muns.push(`Apoio: ${rel.departamentosApoio.join(', ')}`);
      }

      const aeroParts: string[] = [];
      if (rel.comEmpregoAeronave && rel.aeronaves.length > 0) {
        for (const a of rel.aeronaves) {
          aeroParts.push(`${a.tipo} ${a.prefixo} (${a.horasVoo || '00:00'})`);
          aeroParts.push(
            `Piloto: ${a.pilotoNome || '-'}${a.copilotoNome ? ` - Copiloto: ${a.copilotoNome}` : ''}`
          );
        }
        if (rel.tripulantesOperacionais.length > 0) {
          aeroParts.push(
            `Op. Aerotaticos: ${rel.tripulantesOperacionais.map(t => t.name).join(', ')}`
          );
        }
      } else {
        aeroParts.push('Sem emprego de aeronave');
      }

      const vtrParts: string[] = [];
      if (rel.viaturas.length > 0) {
        for (const v of rel.viaturas) {
          vtrParts.push(`${v.placa}${v.descricao ? ` (${v.descricao})` : ''}`);
          if (v.operadores.length > 0) {
            vtrParts.push(v.operadores.map(o => o.name).join(', '));
          }
        }
      } else if (!rel.comEmpregoAeronave && rel.equipeSolo.length > 0) {
        vtrParts.push(rel.equipeSolo.map(s => s.name).join(', '));
      } else {
        vtrParts.push('-');
      }

      const sinParts = [rel.sinopseVoo || '-'];
      if (rel.teveDisparosCat) {
        sinParts.push(
          `Disparos CAT: ${rel.totalDisparosCat} tiro(s)${
            rel.teveObito ? ` - Obitos: ${rel.quantidadeObitos}` : ''
          }`
        );
      } else if (rel.teveObito) {
        sinParts.push(`Obitos: ${rel.quantidadeObitos}`);
      }

      const dateLines = [
        formatIsoDateOnlyBr(rel.dataOperacao),
        `${rel.horarioDecolagem || '--:--'}-${rel.horarioVooOperacao || '--:--'}`
      ];
      if (params.isTodosUnidades && rel.unidadeNome) {
        dateLines.push(rel.unidadeNome);
      }

      return {
        data: dateLines.join('\n'),
        mun: muns.join('\n'),
        mod: [
          rel.comEmpregoAeronave ? 'Com Aeronave' : 'Sem Aeronave',
          rel.comEmpregoAeronave && rel.tipoVoo ? rel.tipoVoo : ''
        ]
          .filter(Boolean)
          .join('\n'),
        aero: aeroParts.join('\n'),
        vtr: vtrParts.join('\n'),
        sin: sinParts.join('\n')
      };
    });

    const catTitle = `Relatorios de Operacoes CAT (${params.catOps.length})${
      totalCatFlightHours ? ` - Total Horas de Voo: ${totalCatFlightHours}` : ''
    }`;
    drawTableRows(catTitle, catCols, catRows);
  }

  // --- SEÇÃO 2: RELATÓRIOS DE OPERAÇÕES DA UNIDADE (POLICIAL: COE, CORE, CAP, etc.) ---
  if (params.polOps.length > 0) {
    const wData = Math.round(contentWidth * 0.09);
    const wMun = Math.round(contentWidth * 0.13);
    const wAtd = Math.round(contentWidth * 0.15);
    const wVtr = Math.round(contentWidth * 0.13);
    const wOps = Math.round(contentWidth * 0.18);
    const wSin = contentWidth - (wData + wMun + wAtd + wVtr + wOps);

    const polCols: TableColSpec[] = [
      { key: 'data', label: 'DATA / HORA', width: wData, mono: true },
      { key: 'mun', label: 'MUNICIPIO(S) / UF', width: wMun, boldFirstLine: true },
      { key: 'atd', label: 'ATENDIMENTO / APOIO', width: wAtd, boldFirstLine: true },
      { key: 'vtr', label: 'VIATURAS', width: wVtr },
      { key: 'ops', label: 'POLICIAIS / OPERADORES', width: wOps },
      { key: 'sin', label: 'SINOPSE / DESFECHO', width: wSin }
    ];

    const polRows = params.polOps.map(rel => {
      const muns = [
        `${rel.municipioOperacao}/${rel.estadoOperacao}`,
        ...(!rel.apenasUmMunicipio
          ? (rel.outrosMunicipios || []).map(m => `${m.municipio}/${m.uf}`)
          : [])
      ];

      const atdLines = [rel.tipoAtendimento || '-', `Via: ${rel.acionamentoVia || '-'}`];
      if (rel.departamentosApoio.length > 0) {
        atdLines.push(`Apoio: ${rel.departamentosApoio.join(', ')}`);
      }

      const vtrLines =
        rel.viaturas.length > 0
          ? rel.viaturas.map(v => `${v.placa}${v.descricao ? ` - ${v.descricao}` : ''}`)
          : ['-'];

      const opsLines =
        rel.operadores.length > 0
          ? rel.operadores.map(
              o => `${o.name}${o.masp ? ` (${formatMaspBr(o.masp)})` : ''}`
            )
          : [rel.criadorNome || '-'];

      const sinLines = [rel.sinopse || '-'];
      if (rel.detalhesExtras.length > 0) {
        sinLines.push(`Detalhes: ${rel.detalhesExtras.join(' | ')}`);
      }

      const dateLines = [formatIsoDateOnlyBr(rel.dataOperacao), rel.horarioOperacao || '--:--'];
      if (params.isTodosUnidades && rel.unidadeNome) {
        dateLines.push(rel.unidadeNome);
      }

      return {
        data: dateLines.join('\n'),
        mun: muns.join('\n'),
        atd: atdLines.join('\n'),
        vtr: vtrLines.join('\n'),
        ops: opsLines.join('\n'),
        sin: sinLines.join('\n')
      };
    });

    drawTableRows(`Relatorios de Operacoes da Unidade (${params.polOps.length})`, polCols, polRows);
  }

  // --- SEÇÃO 3: RELATÓRIOS DE OPERAÇÕES K9 / COC ---
  if (params.canilOps.length > 0) {
    const wData = Math.round(contentWidth * 0.08);
    const wCid = Math.round(contentWidth * 0.11);
    const wSol = Math.round(contentWidth * 0.10);
    const wVtr = Math.round(contentWidth * 0.14);
    const wMat = Math.round(contentWidth * 0.14);
    const wOps = Math.round(contentWidth * 0.18);
    const wDet = contentWidth - (wData + wCid + wSol + wVtr + wMat + wOps);

    const canilCols: TableColSpec[] = [
      { key: 'data', label: 'DATA / HORA', width: wData, mono: true },
      { key: 'cid', label: 'CIDADE / UF', width: wCid, boldFirstLine: true },
      { key: 'sol', label: 'SOLICITACAO', width: wSol },
      { key: 'vtr', label: 'VEICULOS / VIATURAS', width: wVtr },
      { key: 'mat', label: 'MATERIAL ENCONTRADO', width: wMat },
      { key: 'ops', label: 'OPERADORES & ANIMAIS', width: wOps },
      { key: 'det', label: 'DETALHAMENTO', width: wDet }
    ];

    const canilRows = params.canilOps.map(rel => {
      const solLines = [rel.solicitacaoTexto || '-'];
      if (rel.apoioOutroDepartamento && rel.departamentosApoio.length > 0) {
        solLines.push(`Apoio: ${rel.departamentosApoio.join('; ')}`);
      }

      const vtrLines =
        rel.viaturas.length > 0
          ? rel.viaturas.map(v => `${v.placa}${v.descricao ? ` - ${v.descricao}` : ''}`)
          : ['-'];

      const matLines = !rel.materialEncontrado
        ? ['Nao']
        : rel.materiaisEncontrados.length > 0
          ? rel.materiaisEncontrados.map(
              m => `${m.tipo} (${m.cachorros.length > 0 ? m.cachorros.join(', ') : '-'})`
            )
          : ['Sim'];

      const opsLines =
        rel.operadores.length > 0
          ? rel.operadores.map(
              o => `${o.name} (${o.cachorros.length > 0 ? o.cachorros.join(', ') : 'Sem animal'})`
            )
          : [rel.criadorNome || '-'];

      const dateLines = [formatIsoDateOnlyBr(rel.dataOperacao), rel.horaOperacao || '--:--'];
      if (params.isTodosUnidades && rel.unidadeNome) {
        dateLines.push(rel.unidadeNome);
      }

      return {
        data: dateLines.join('\n'),
        cid: `${rel.comarca || '-'} / ${rel.estadoOperacao || 'MG'}`,
        sol: solLines.join('\n'),
        vtr: vtrLines.join('\n'),
        mat: matLines.join('\n'),
        ops: opsLines.join('\n'),
        det: rel.detalhamento || '-'
      };
    });

    const canilTitle = isCocOnly
      ? `Relatorios de Operacoes K9 (${params.canilOps.length})`
      : `Relatorios de Operacoes K9 / COC (${params.canilOps.length})`;
    drawTableRows(canilTitle, canilCols, canilRows);
  }

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `Sistema ARMARIA - Policia Civil de Minas Gerais | Historico consolidado da unidade ${params.unidadeLabel}`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// ============================================================================
// 6. SINOPSE DE TREINAMENTO — IDÊNTICO AO "MÓDULO RELATÓRIOS -> IMPRIMIR HISTÓRICO"
//    (Relatório da Unidade — Histórico de Relatórios de Treinamento)
// ============================================================================
export interface SystemPolicialTreinPdfRecord {
  id: string;
  unidadeNome: string;
  dataTreinamento: string;
  tituloTreinamento: string;
  modalidadeLocal: string;
  modalidadeParticipacao: string;
  operadorNome: string;
  operadorMasp: string;
  participantes: Array<{ name: string; unitName?: string }>;
  outrasUnidades: string[];
  disparoRealResumo: string;
  descricao: string;
}

export interface SystemCanilTreinPdfRecord {
  id: string;
  unidadeNome: string;
  dataTreinamento: string;
  horaTreinamento: string;
  condutorNome: string;
  condutorMasp: string;
  condutorCachorros: Array<{ nome: string; raca?: string }>;
  modalidadeLocal: string;
  modalidadeParticipacao: string;
  participantes: Array<{ name: string; cachorros: string[] }>;
  topicos: Array<{ topico: string; aplicarTodosK9: boolean; cachorros: string[] }>;
  disparoRealResumo: string;
  descricao: string;
}

export async function generateSystemSinopseTreinamentoPdf(params: {
  departamentoLabel: string;
  unidadeLabel: string;
  isTodosUnidades: boolean;
  periodoLabel: string;
  solicitacaoId: string;
  geradoEm: Date;
  solicitanteNome: string;
  solicitanteMasp: string;
  logoDataUri: string | null;
  polTrains: SystemPolicialTreinPdfRecord[];
  canilTrains: SystemCanilTreinPdfRecord[];
}): Promise<Buffer> {
  const totalCount = params.polTrains.length + params.canilTrains.length;
  const isCocOnly =
    !params.isTodosUnidades &&
    params.canilTrains.length > 0 &&
    params.polTrains.length === 0;

  const doc = await PDFDocument.create();
  doc.setTitle(
    isCocOnly
      ? `Histórico de Treinamentos da Unidade — Canil K9 (COC)`
      : `Histórico de Treinamentos da Unidade — ${params.unidadeLabel}`
  );
  doc.setAuthor('Sistema ARMARIA - Polícia Civil de Minas Gerais');
  doc.setCreator('Sistema ARMARIA PCMG');

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await doc.embedFont(StandardFonts.CourierBold);
  const logoImage = await tryEmbedSystemLogo(doc, params.logoDataUri);

  // A4 Paisagem (idêntico ao @page { size: A4 landscape; margin: 12mm; } do Imprimir Histórico)
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 28;
  const contentWidth = pageWidth - marginX * 2; // 785.89pt
  const footerSafeY = 54;

  const docCode = generateUniqueDocControlCode();
  const emissaoBr = formatDateTimeBr(params.geradoEm);

  // Distribuição por unidade quando selecionado "Todos"
  const unitCounts = new Map<string, number>();
  for (const r of [...params.polTrains, ...params.canilTrains]) {
    const uName = r.unidadeNome || 'Sem Unidade';
    unitCounts.set(uName, (unitCounts.get(uName) || 0) + 1);
  }
  const unitBreakdownText =
    params.isTodosUnidades && unitCounts.size > 0
      ? '   |   Por unidade: ' +
        Array.from(unitCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
          .map(([u, c]) => `${u}: ${c}`)
          .join(' - ')
      : '';

  const filtersSummaryText = `Tipo: Treinamento - Unidade: ${params.unidadeLabel} - Periodo: ${params.periodoLabel}`;

  const drawPageTopHeader = (page: PDFPage, isFirstPage: boolean): number => {
    let y = drawTopUniqueCodeBar(
      page,
      pageWidth,
      pageHeight,
      marginX,
      fontMono,
      fontMonoBold,
      docCode,
      emissaoBr
    );

    const headerTopY = y;
    let textX = marginX;
    if (logoImage) {
      const dims = logoImage.scaleToFit(42, 42);
      page.drawImage(logoImage, {
        x: marginX,
        y: headerTopY - 42 + (42 - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      textX = marginX + dims.width + 10;
    }

    const rightBlockW = 240;
    const titleMaxW = contentWidth - (textX - marginX) - rightBlockW - 10;
    const mainTitle = isCocOnly
      ? 'POLICIA CIVIL DE MINAS GERAIS - HISTORICO DE TREINAMENTOS DA UNIDADE (COC / CANIL K9)'
      : 'POLICIA CIVIL DE MINAS GERAIS - HISTORICO DE TREINAMENTOS DA UNIDADE';

    page.drawText(fitTextToWidth(mainTitle, fontBold, 10.6, titleMaxW), {
      x: textX,
      y: headerTopY - 14,
      size: 10.6,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawText(
      fitTextToWidth(
        `${params.departamentoLabel} - Unidade: ${params.unidadeLabel}`,
        fontRegular,
        8.6,
        titleMaxW
      ),
      {
        x: textX,
        y: headerTopY - 29,
        size: 8.6,
        font: fontRegular,
        color: PCMG_COLORS.slate600
      }
    );

    const emitLine = fitTextToWidth(
      `Emitido por: ${params.solicitanteNome}${
        params.solicitanteMasp ? ` (MASP ${formatMaspBr(params.solicitanteMasp)})` : ''
      }`,
      fontBold,
      7.9,
      rightBlockW
    );
    const dateLine = `Emissao: ${emissaoBr}`;
    page.drawText(emitLine, {
      x: pageWidth - marginX - fontBold.widthOfTextAtSize(emitLine, 7.9),
      y: headerTopY - 15,
      size: 7.9,
      font: fontBold,
      color: PCMG_COLORS.slate700
    });
    page.drawText(dateLine, {
      x: pageWidth - marginX - fontRegular.widthOfTextAtSize(dateLine, 7.8),
      y: headerTopY - 28,
      size: 7.8,
      font: fontRegular,
      color: PCMG_COLORS.slate700
    });

    y = headerTopY - 46;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageWidth - marginX, y },
      thickness: 1.8,
      color: PCMG_COLORS.ink
    });
    y -= 9;

    if (isFirstPage) {
      const filterLines = wrapCellLines(
        `FILTROS APLICADOS: ${filtersSummaryText}`,
        fontRegular,
        7.8,
        contentWidth - 16,
        3
      );
      const filterBoxH = Math.max(20, filterLines.length * 10 + 9);
      page.drawRectangle({
        x: marginX,
        y: y - filterBoxH,
        width: contentWidth,
        height: filterBoxH,
        color: PCMG_COLORS.slate50,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.75
      });
      filterLines.forEach((ln, idx) => {
        page.drawText(ln, {
          x: marginX + 8,
          y: y - 12 - idx * 10,
          size: 7.8,
          font: idx === 0 ? fontBold : fontRegular,
          color: PCMG_COLORS.ink
        });
      });
      y -= filterBoxH + 8;

      const summaryParts = [
        `Total de registros: ${totalCount}`,
        `Treinamentos: ${totalCount}`,
        params.polTrains.length > 0 && params.canilTrains.length > 0
          ? `Unidades Policiais: ${params.polTrains.length}   |   Canil K9: ${params.canilTrains.length}`
          : ''
      ].filter(Boolean);
      const summaryText = summaryParts.join('   |   ') + unitBreakdownText;
      const summaryLines = wrapCellLines(summaryText, fontBold, 8, contentWidth, 2);
      summaryLines.forEach((ln, idx) => {
        page.drawText(ln, {
          x: marginX,
          y: y - 8 - idx * 10,
          size: 8,
          font: fontBold,
          color: PCMG_COLORS.slate700
        });
      });
      y -= summaryLines.length * 10 + 6;
    }

    return y;
  };

  let page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = drawPageTopHeader(page, true);

  interface TableColSpec {
    key: string;
    label: string;
    width: number;
    mono?: boolean;
    boldFirstLine?: boolean;
  }

  const drawColsHeader = (cols: TableColSpec[]): void => {
    const thH = 18;
    page.drawRectangle({
      x: marginX,
      y: cursorY - thH,
      width: contentWidth,
      height: thH,
      color: PCMG_COLORS.slate200,
      borderColor: PCMG_COLORS.slate300,
      borderWidth: 0.7
    });
    let colX = marginX;
    for (const col of cols) {
      page.drawRectangle({
        x: colX,
        y: cursorY - thH,
        width: col.width,
        height: thH,
        borderColor: PCMG_COLORS.slate300,
        borderWidth: 0.55
      });
      const lbl = fitTextToWidth(col.label, fontBold, 7.1, col.width - 8);
      page.drawText(lbl, {
        x: colX + 4,
        y: cursorY - 11.8,
        size: 7.1,
        font: fontBold,
        color: PCMG_COLORS.slate800
      });
      colX += col.width;
    }
    cursorY -= thH;
  };

  const drawSectionHeaderAndTableHead = (sectionTitle: string, cols: TableColSpec[]): void => {
    const neededH = 18 + 18 + 22;
    if (cursorY - neededH < footerSafeY) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = drawPageTopHeader(page, false);
    }

    page.drawText(fitTextToWidth(sectionTitle.toUpperCase(), fontBold, 8.8, contentWidth), {
      x: marginX,
      y: cursorY - 10,
      size: 8.8,
      font: fontBold,
      color: PCMG_COLORS.ink
    });
    page.drawLine({
      start: { x: marginX, y: cursorY - 14 },
      end: { x: pageWidth - marginX, y: cursorY - 14 },
      thickness: 0.85,
      color: PCMG_COLORS.slate300
    });
    cursorY -= 18;

    drawColsHeader(cols);
  };

  const drawTableRows = (
    sectionTitle: string,
    cols: TableColSpec[],
    rows: Array<Record<string, string>>
  ): void => {
    drawSectionHeaderAndTableHead(sectionTitle, cols);

    const fontSize = 7.4;
    const lineH = 9.6;

    rows.forEach((rowMap, rowIdx) => {
      const wrapped: Record<string, string[]> = {};
      let maxLines = 1;

      for (const col of cols) {
        const useFont = col.mono ? fontMono : fontRegular;
        const lines = wrapCellLines(rowMap[col.key] || '-', useFont, fontSize, col.width - 8, 30);
        wrapped[col.key] = lines;
        if (lines.length > maxLines) maxLines = lines.length;
      }

      const maxUsableHeight = pageHeight - 135 - footerSafeY;
      const rawRowH = Math.max(20, maxLines * lineH + 8);
      const rowH = Math.min(rawRowH, maxUsableHeight);

      if (cursorY - rowH < footerSafeY) {
        page = doc.addPage([pageWidth, pageHeight]);
        cursorY = drawPageTopHeader(page, false);
        drawColsHeader(cols);
      }

      const rowBottomY = cursorY - rowH;
      if (rowIdx % 2 === 1) {
        page.drawRectangle({
          x: marginX,
          y: rowBottomY,
          width: contentWidth,
          height: rowH,
          color: PCMG_COLORS.grayRow
        });
      }

      const maxRenderableLines = Math.max(1, Math.floor((rowH - 6) / lineH));
      let colX = marginX;
      for (const col of cols) {
        page.drawRectangle({
          x: colX,
          y: rowBottomY,
          width: col.width,
          height: rowH,
          borderColor: PCMG_COLORS.slate300,
          borderWidth: 0.5
        });

        const lines = (wrapped[col.key] || ['-']).slice(0, maxRenderableLines);
        lines.forEach((line, lIdx) => {
          const isFirst = lIdx === 0;
          const useFont = col.mono
            ? isFirst
              ? fontMonoBold
              : fontMono
            : col.boldFirstLine && isFirst
              ? fontBold
              : fontRegular;
          const useSize = col.mono && !isFirst ? 6.9 : fontSize;
          const useColor = col.mono && !isFirst ? PCMG_COLORS.slate600 : PCMG_COLORS.ink;

          page.drawText(line, {
            x: colX + 4,
            y: cursorY - 10.5 - lIdx * lineH,
            size: useSize,
            font: useFont,
            color: useColor
          });
        });

        colX += col.width;
      }

      cursorY = rowBottomY;
    });

    cursorY -= 10;
  };

  // --- SEÇÃO 1: RELATÓRIOS DE TREINAMENTO DA UNIDADE (COE, CORE, CAT, CAP, etc.) ---
  if (params.polTrains.length > 0) {
    const wData = Math.round(contentWidth * 0.09);
    const wTit = Math.round(contentWidth * 0.12);
    const wOps = Math.round(contentWidth * 0.22);
    const wOut = Math.round(contentWidth * 0.15);
    const wDesc = contentWidth - (wData + wTit + wOps + wOut);

    const polCols: TableColSpec[] = [
      { key: 'data', label: 'DATA', width: wData, mono: true },
      { key: 'tit', label: 'TITULO / MODALIDADE', width: wTit, boldFirstLine: true },
      { key: 'ops', label: 'OPERADOR DIGITADOR E PARTICIPANTES', width: wOps, boldFirstLine: true },
      { key: 'out', label: 'OUTRAS UNIDADES', width: wOut },
      { key: 'desc', label: 'DESCRICAO', width: wDesc }
    ];

    const polRows = params.polTrains.map(rel => {
      const dateLines = [formatIsoDateOnlyBr(rel.dataTreinamento)];
      if (params.isTodosUnidades && rel.unidadeNome) {
        dateLines.push(rel.unidadeNome);
      }

      const titLines = [
        rel.tituloTreinamento || 'Operacional',
        `${rel.modalidadeLocal || 'Interno'} - ${rel.modalidadeParticipacao || 'Sozinho'}`
      ];

      const opsLines = [rel.operadorNome || '-'];
      if (rel.operadorMasp) {
        opsLines.push(`MASP: ${formatMaspBr(rel.operadorMasp)}`);
      }
      if (rel.participantes.length > 0) {
        opsLines.push(
          rel.participantes
            .map(p => `${p.name}${p.unitName ? ` (${p.unitName})` : ''}`)
            .join('; ')
        );
      }

      const outStr = rel.outrasUnidades.length > 0 ? rel.outrasUnidades.join(', ') : '-';

      const descLines: string[] = [];
      if (rel.disparoRealResumo) {
        descLines.push(`Disparo Real: ${rel.disparoRealResumo}`);
      }
      descLines.push(rel.descricao || '-');

      return {
        data: dateLines.join('\n'),
        tit: titLines.join('\n'),
        ops: opsLines.join('\n'),
        out: outStr,
        desc: descLines.join('\n')
      };
    });

    drawTableRows(
      `Relatorios de Treinamento da Unidade (${params.polTrains.length})`,
      polCols,
      polRows
    );
  }

  // --- SEÇÃO 2: RELATÓRIOS DE TREINAMENTO K9 / COC (CANIL) ---
  if (params.canilTrains.length > 0) {
    const wData = Math.round(contentWidth * 0.09);
    const wCond = Math.round(contentWidth * 0.18);
    const wK9 = Math.round(contentWidth * 0.16);
    const wLoc = Math.round(contentWidth * 0.09);
    const wPart = Math.round(contentWidth * 0.12);
    const wDesc = contentWidth - (wData + wCond + wK9 + wLoc + wPart);

    const canilCols: TableColSpec[] = [
      { key: 'data', label: 'DATA', width: wData, mono: true },
      { key: 'cond', label: 'CONDUTOR', width: wCond, boldFirstLine: true },
      { key: 'k9', label: 'ANIMAL(IS) K9', width: wK9, boldFirstLine: true },
      { key: 'loc', label: 'LOCAL', width: wLoc },
      { key: 'part', label: 'PARTICIPACAO', width: wPart },
      { key: 'desc', label: 'DESCRICAO DO TREINAMENTO', width: wDesc }
    ];

    const canilRows = params.canilTrains.map(rel => {
      const dateLines = [formatIsoDateOnlyBr(rel.dataTreinamento)];
      if (rel.horaTreinamento) {
        dateLines.push(rel.horaTreinamento);
      }
      if (params.isTodosUnidades && rel.unidadeNome) {
        dateLines.push(rel.unidadeNome);
      }

      const condLines = [rel.condutorNome || '-'];
      if (rel.condutorMasp) {
        condLines.push(`MASP: ${formatMaspBr(rel.condutorMasp)}`);
      }

      const k9Lines =
        rel.condutorCachorros.length > 0
          ? rel.condutorCachorros.map(c => `${c.nome}${c.raca ? ` (${c.raca})` : ''}`)
          : ['Sem animal'];
      if (rel.modalidadeParticipacao === 'Coletivo' && rel.participantes.length > 0) {
        k9Lines.push(
          rel.participantes
            .map(
              p => `${p.name} (${p.cachorros.length > 0 ? p.cachorros.join(', ') : 'Sem animal'})`
            )
            .join('; ')
        );
      }

      const partLines = [rel.modalidadeParticipacao || 'Sozinho'];
      if (rel.modalidadeParticipacao === 'Coletivo' && rel.participantes.length > 0) {
        partLines.push(`+${rel.participantes.length} policial(is)`);
      }

      const descLines: string[] = [];
      if (rel.topicos.length > 0) {
        const topicosTxt = rel.topicos
          .map(
            t =>
              `${t.topico} (${
                t.aplicarTodosK9 ? 'Todos os K9' : t.cachorros.join(', ') || 'Sem K9'
              })`
          )
          .join(' - ');
        descLines.push(`Topicos: ${topicosTxt}`);
      }
      if (rel.disparoRealResumo) {
        descLines.push(`Disparo Real: ${rel.disparoRealResumo}`);
      }
      descLines.push(rel.descricao || '-');

      return {
        data: dateLines.join('\n'),
        cond: condLines.join('\n'),
        k9: k9Lines.join('\n'),
        loc: rel.modalidadeLocal || 'Interno',
        part: partLines.join('\n'),
        desc: descLines.join('\n')
      };
    });

    const canilTitle = isCocOnly
      ? `Relatorios de Treinamento K9 (${params.canilTrains.length})`
      : `Relatorios de Treinamento K9 / COC (${params.canilTrains.length})`;
    drawTableRows(canilTitle, canilCols, canilRows);
  }

  drawInstitutionalFooters({
    doc,
    marginX,
    pageWidth,
    fontMono,
    fontMonoBold,
    docCode,
    emissaoBr,
    footerLeftText: `Sistema ARMARIA - Policia Civil de Minas Gerais | Historico de treinamentos da unidade ${params.unidadeLabel}`
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}


