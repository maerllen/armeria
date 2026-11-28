import * as pdfjsLib from 'pdfjs-dist';
import {
  DesempenhoGrupoParticipante,
  DesempenhoMarcador,
  ResultadoAptoInapto
} from '../types';

export interface PdfTextItem {
  str: string;
  x: number;
  xEnd: number;
  xCenter: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PdfPageExtract {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

export interface ExtractedMarkerValue {
  usuarioId: string;
  usuarioNome: string;
  marcadorId: string;
  marcadorNome: string;
  valorMarca?: string;
  tempoInput?: string;
  resultadoApto?: ResultadoAptoInapto;
  natacao50m?: ResultadoAptoInapto | null;
  flutuacao5m?: ResultadoAptoInapto | null;
  rawExtracted: string;
}

export interface PdfImportSummary {
  entries: ExtractedMarkerValue[];
  matchedUsersCount: number;
  matchedUserNames: string[];
  unmatchedGroupUsersCount: number;
  recognizedColumns: string[];
  pagesScanned: number;
  totalTextItems: number;
}

type TestFamily =
  | 'BARRA_FIXA'
  | 'ABDOMINAL'
  | 'FLEXAO_BRACO'
  | 'COOPER'
  | 'NATACAO'
  | 'CORRIDA'
  | 'GENERIC';

interface HeaderCluster {
  text: string;
  norm: string;
  minX: number;
  maxX: number;
  centerX: number;
  minTop: number;
  maxBottom: number;
  items: PdfTextItem[];
}

interface SubColumnDef {
  label: string;
  norm: string;
  xStart: number;
  xEnd: number;
  centerX: number;
}

interface TableColumnDef {
  role: 'N' | 'POLICIAL' | 'CARREIRA' | 'MASP' | 'TEST';
  family?: TestFamily;
  rawHeader: string;
  normHeader: string;
  baseHeader: string;
  xStart: number;
  xEnd: number;
  centerX: number;
  subColumns: SubColumnDef[];
}

interface SubHeaderBand {
  top: number;
  bottom: number;
  items: PdfTextItem[];
}

interface TableLayout {
  columns: TableColumnDef[];
  policialCol: TableColumnDef;
  maspCol: TableColumnDef | null;
  testCols: TableColumnDef[];
  headerBottom: number;
}

export function normalizeTextForMatch(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuotes(raw: string): string {
  return String(raw || '')
    // Convert two consecutive single quotes / primes to double quote first
    .replace(/''|’’|‘’|′′/g, '"')
    // Convert typographic double quotes & double prime to straight double quote
    .replace(/[“”″„]/g, '"')
    // Convert typographic single quotes & prime to straight single quote
    .replace(/[‘’′´`]/g, "'");
}

function stripHeaderSuffixes(norm: string): string {
  return norm
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectTestFamily(rawText: string): TestFamily | null {
  const norm = normalizeTextForMatch(rawText);
  if (!norm) return null;
  if (norm.includes('BARRA FIXA') || (norm.includes('BARRA') && norm.includes('FIXA'))) {
    return 'BARRA_FIXA';
  }
  if (norm.includes('ABDOMINAL') || norm.includes('ABDOMINAIS')) {
    return 'ABDOMINAL';
  }
  if (
    norm.includes('FLEXAO DE BRACO') ||
    norm.includes('FLEXAO BRACO') ||
    (norm.includes('FLEXAO') && norm.includes('BRACO')) ||
    /\bFLEXAO\b/.test(norm)
  ) {
    return 'FLEXAO_BRACO';
  }
  if (norm.includes('COOPER')) {
    return 'COOPER';
  }
  if (norm.includes('NATACAO') || norm.includes('FLUTUACAO') || norm.includes('50 METROS LIVRES')) {
    return 'NATACAO';
  }
  if (norm.includes('CORRIDA') && !norm.includes('COOPER')) {
    return 'CORRIDA';
  }
  return null;
}

function isNonTestIdentityHeader(norm: string): 'N' | 'POLICIAL' | 'CARREIRA' | 'MASP' | null {
  const clean = norm.replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (clean === 'N' || clean === 'NO' || clean === 'NUM' || clean === 'ORD' || clean === 'ITEM') {
    return 'N';
  }
  if (clean === 'POLICIAL' || clean.includes('POLICIAL') || clean === 'SERVIDOR' || clean === 'AVALIADO') {
    return 'POLICIAL';
  }
  if (clean === 'CARREIRA' || clean === 'CARREI RA' || clean === 'CARGO' || clean.replace(/\s/g, '') === 'CARREIRA') {
    return 'CARREIRA';
  }
  if (clean === 'MASP' || clean === 'MATRICULA') {
    return 'MASP';
  }
  return null;
}

function isSubHeaderToken(norm: string): boolean {
  if (!norm) return false;
  return (
    norm.includes('QUANTIDADE') ||
    norm.includes('REPETICOES') ||
    norm.includes('REPETICAO') ||
    norm.includes('PONTUACAO') ||
    norm.includes('DISTANCIA') ||
    norm.includes('PERCORRIDA') ||
    norm.includes('50 METROS') ||
    norm.includes('LIVRES') ||
    norm.includes('FLUTUACAO')
  );
}

export function formatSecondsToMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseNumericToken(raw: string, allowThousandsDot = false): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (allowThousandsDot && /^\d{1,2}\.\d{3}$/.test(trimmed)) {
    return trimmed.replace('.', '');
  }
  const normalized = trimmed.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return String(num);
}

/**
 * Extracts all non-empty parenthesized values from a text line.
 */
function extractParenthesizedContents(line: string): string[] {
  const results: string[] = [];
  const normLine = normalizeQuotes(line);
  const regex = /\(([^()]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normLine)) !== null) {
    const inner = match[1].trim();
    if (inner) results.push(inner);
  }
  return results;
}

/**
 * Parses a time string using single-quote for minutes (e.g. 25') and double-quote for seconds (e.g. 18"),
 * or mm:ss format.
 */
export function parseQuotedTimeToSeconds(inner: string): number | null {
  const clean = normalizeQuotes(inner).replace(/\s+/g, '');
  if (!clean) return null;

  // Format: 25'18" or 25'18 or 25'
  const minSecMatch = clean.match(/^(\d{1,3})'(?:(\d{1,2})"?)?$/);
  if (minSecMatch) {
    const mins = Number(minSecMatch[1]);
    const secs = minSecMatch[2] ? Number(minSecMatch[2]) : 0;
    if (Number.isFinite(mins) && Number.isFinite(secs)) {
      return mins * 60 + secs;
    }
  }

  // Format: 30" or 18"
  const secOnlyMatch = clean.match(/^(\d{1,4})"$/);
  if (secOnlyMatch) {
    const secs = Number(secOnlyMatch[1]);
    if (Number.isFinite(secs)) return secs;
  }

  // Format: 25:18
  const colonMatch = clean.match(/^(\d{1,3}):(\d{1,2})$/);
  if (colonMatch) {
    const mins = Number(colonMatch[1]);
    const secs = Number(colonMatch[2]);
    if (Number.isFinite(mins) && Number.isFinite(secs)) {
      return mins * 60 + secs;
    }
  }

  return null;
}

function reconstructLinesFromItems(items: PdfTextItem[], yTolerance = 4.5): string[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.top - b.top || a.x - b.x);
  const groups: PdfTextItem[][] = [];

  for (const item of sorted) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([item]);
      continue;
    }
    const avgTop = lastGroup.reduce((s, x) => s + x.top, 0) / lastGroup.length;
    if (Math.abs(item.top - avgTop) <= yTolerance) {
      lastGroup.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map(group => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    let out = '';
    let prevEnd: number | null = null;
    for (const it of ordered) {
      const piece = it.str;
      if (!piece) continue;
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        const noSpaceAfterPrev = /[(‘“"']$/.test(out);
        const noSpaceBeforeCurr = /^[)’”"',.:;]/.test(piece);
        if (gap > 1.8 && !noSpaceAfterPrev && !noSpaceBeforeCurr && !out.endsWith(' ') && !piece.startsWith(' ')) {
          out += ' ';
        }
      }
      out += piece;
      prevEnd = it.xEnd;
    }
    return out.replace(/\s+/g, ' ').trim();
  });
}

function clusterItemsHorizontally(items: PdfTextItem[], gapTolerance = 5): HeaderCluster[] {
  if (items.length === 0) return [];
  // Sort by width descending first so wide labels anchor overlapping narrower lines (like "TESTE" over "FLEXÃO DE BRAÇO")
  const byWidth = [...items].sort((a, b) => b.width - a.width || a.x - b.x);
  const clusters: { minX: number; maxX: number; items: PdfTextItem[] }[] = [];

  for (const item of byWidth) {
    let matched: { minX: number; maxX: number; items: PdfTextItem[] } | null = null;
    for (const c of clusters) {
      const overlaps =
        item.x <= c.maxX + gapTolerance && item.xEnd >= c.minX - gapTolerance;
      const centerInside =
        item.xCenter >= c.minX - gapTolerance && item.xCenter <= c.maxX + gapTolerance;
      if (overlaps || centerInside) {
        matched = c;
        break;
      }
    }
    if (matched) {
      matched.items.push(item);
      matched.minX = Math.min(matched.minX, item.x);
      matched.maxX = Math.max(matched.maxX, item.xEnd);
    } else {
      clusters.push({ minX: item.x, maxX: item.xEnd, items: [item] });
    }
  }

  // Merge any clusters that now overlap after expansion
  clusters.sort((a, b) => a.minX - b.minX);
  const merged: typeof clusters = [];
  for (const c of clusters) {
    const prev = merged[merged.length - 1];
    if (prev && c.minX <= prev.maxX + gapTolerance) {
      prev.items.push(...c.items);
      prev.minX = Math.min(prev.minX, c.minX);
      prev.maxX = Math.max(prev.maxX, c.maxX);
    } else {
      merged.push(c);
    }
  }

  return merged.map(c => {
    const lines = reconstructLinesFromItems(c.items, 4.5);
    const text = lines.join(' ').replace(/\s+/g, ' ').trim();
    const minTop = Math.min(...c.items.map(i => i.top));
    const maxBottom = Math.max(...c.items.map(i => i.bottom));
    return {
      text,
      norm: normalizeTextForMatch(text),
      minX: c.minX,
      maxX: c.maxX,
      centerX: (c.minX + c.maxX) / 2,
      minTop,
      maxBottom,
      items: c.items
    };
  });
}

/**
 * Finds the best vertical split X between two adjacent columns using whitespace gutter projection
 * across all table data items, falling back to fallbackX if no clean gap exists.
 */
function findVerticalGutterSplit(
  dataItems: PdfTextItem[],
  leftAnchorX: number,
  rightAnchorX: number,
  fallbackX: number
): number {
  if (rightAnchorX <= leftAnchorX + 2) return fallbackX;
  const minSearch = Math.floor(leftAnchorX);
  const maxSearch = Math.ceil(rightAnchorX);
  const span = maxSearch - minSearch;
  if (span <= 2 || span > 2000) return fallbackX;

  const relevant = dataItems.filter(it => it.xEnd >= minSearch && it.x <= maxSearch);
  if (relevant.length === 0) return fallbackX;

  // Count how many text items overlap each integer X point
  const counts = new Uint16Array(span + 1);
  for (const it of relevant) {
    const s = Math.max(0, Math.floor(it.x) - minSearch);
    const e = Math.min(span, Math.ceil(it.xEnd) - minSearch);
    for (let i = s; i <= e; i++) {
      counts[i] += 1;
    }
  }

  let minCount = Infinity;
  for (let i = 0; i <= span; i++) {
    if (counts[i] < minCount) minCount = counts[i];
  }

  // Find longest contiguous run with minCount, preferring the one closest to fallbackX
  let bestMid = fallbackX;
  let bestScore = -Infinity;
  let i = 0;
  while (i <= span) {
    if (counts[i] !== minCount) {
      i++;
      continue;
    }
    const runStart = i;
    while (i <= span && counts[i] === minCount) i++;
    const runEnd = i - 1;
    const runWidth = runEnd - runStart + 1;
    const runMid = minSearch + (runStart + runEnd) / 2;
    const distFromFallback = Math.abs(runMid - fallbackX);
    // Prefer wider clean gutters that are close to the geometric fallback
    const score = runWidth * 2 - distFromFallback * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestMid = runMid;
    }
  }

  return bestMid;
}

function findSubHeaderBands(items: PdfTextItem[], minTop: number, maxBottom: number): SubHeaderBand[] {
  const candidates = items.filter(it => it.top >= minTop && it.top <= maxBottom);
  if (candidates.length === 0) return [];

  // Group items into horizontal lines first
  const sorted = [...candidates].sort((a, b) => a.top - b.top || a.x - b.x);
  const lines: { top: number; bottom: number; items: PdfTextItem[]; textNorm: string }[] = [];

  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.top - last.top) <= 4.5) {
      last.items.push(it);
      last.bottom = Math.max(last.bottom, it.bottom);
    } else {
      lines.push({ top: it.top, bottom: it.bottom, items: [it], textNorm: '' });
    }
  }

  for (const line of lines) {
    line.textNorm = normalizeTextForMatch(reconstructLinesFromItems(line.items).join(' '));
  }

  const subHeaderLines = lines.filter(line => {
    let hits = 0;
    if (line.textNorm.includes('QUANTIDADE') || line.textNorm.includes('REPETICOES')) hits++;
    if (line.textNorm.includes('PONTUACAO')) hits++;
    if (line.textNorm.includes('DISTANCIA') || line.textNorm.includes('PERCORRIDA')) hits++;
    if (line.textNorm.includes('50 METROS') || line.textNorm.includes('LIVRES')) hits++;
    if (line.textNorm.includes('FLUTUACAO')) hits++;
    // Also count multiple occurrences of PONTUACAO or QUANTIDADE on the same line
    const multiCount = (line.textNorm.match(/PONTUACAO|QUANTIDADE|REPETICOES|DISTANCIA|PERCORRIDA|LIVRES|FLUTUACAO/g) || []).length;
    return hits >= 2 || multiCount >= 2;
  });

  // Merge stacked 2-line sub-headers (e.g. "Quantidade" line + "de repetições" line within 18pt)
  const bands: SubHeaderBand[] = [];
  for (const line of subHeaderLines) {
    const prev = bands[bands.length - 1];
    if (prev && line.top - prev.bottom <= 14) {
      prev.items.push(...line.items);
      prev.bottom = Math.max(prev.bottom, line.bottom);
    } else {
      bands.push({
        top: line.top,
        bottom: line.bottom,
        items: [...line.items]
      });
    }
  }

  return bands;
}

function buildTableLayoutFromHeader(
  page: PdfPageExtract,
  policialAnchor: PdfTextItem,
  regionBottom: number
): TableLayout | null {
  // Find first sub-header band below the POLICIAL anchor to cap the main header band
  const nearbySubBands = findSubHeaderBands(page.items, policialAnchor.top + 4, regionBottom);
  const firstSubBand = nearbySubBands[0] || null;

  // Main header spans vertically around the POLICIAL anchor
  const headerMinTop = Math.max(0, policialAnchor.top - 32);
  const headerMaxTop = firstSubBand
    ? Math.min(policialAnchor.bottom + 36, firstSubBand.top - 2)
    : policialAnchor.bottom + 36;

  const headerItems = page.items.filter(
    it =>
      it.top >= headerMinTop &&
      it.top <= headerMaxTop &&
      !isSubHeaderToken(normalizeTextForMatch(it.str))
  );

  // Filter out title/banner text far above the header row (if there's a big vertical gap above the header block)
  const sortedHeaderY = [...headerItems].sort((a, b) => a.top - b.top);
  const mainHeaderItems = sortedHeaderY.filter(
    it => Math.abs(it.top - policialAnchor.top) <= 28
  );

  const rawClusters = clusterItemsHorizontally(mainHeaderItems, 5);
  if (rawClusters.length < 2) return null;

  const headerBottom = Math.max(...rawClusters.map(c => c.maxBottom));
  const dataItems = page.items.filter(
    it => it.top > headerBottom + 2 && it.top <= regionBottom
  );

  // Build coarse main column definitions
  const cols: TableColumnDef[] = rawClusters.map((c, idx) => {
    const prev = idx > 0 ? rawClusters[idx - 1] : null;
    const next = idx < rawClusters.length - 1 ? rawClusters[idx + 1] : null;
    const coarseLeft = prev ? (prev.maxX + c.minX) / 2 : 0;
    const coarseRight = next ? (c.maxX + next.minX) / 2 : page.width;
    const identityRole = isNonTestIdentityHeader(c.norm);
    const family = identityRole ? undefined : detectTestFamily(c.norm) || 'GENERIC';
    return {
      role: identityRole || 'TEST',
      family,
      rawHeader: c.text,
      normHeader: c.norm,
      baseHeader: stripHeaderSuffixes(c.norm),
      xStart: coarseLeft,
      xEnd: coarseRight,
      centerX: c.centerX,
      subColumns: []
    };
  });

  const policialCol = cols.find(c => c.role === 'POLICIAL');
  if (!policialCol) return null;
  const maspCol = cols.find(c => c.role === 'MASP') || null;
  const testCols = cols.filter(c => c.role === 'TEST');

  // Refine main column boundaries using sub-header clusters + whitespace gutters!
  if (firstSubBand) {
    const subClusters = clusterItemsHorizontally(firstSubBand.items, 3);

    // Assign each sub-header cluster to the nearest test column by X-center
    const assignedSubs = new Map<TableColumnDef, HeaderCluster[]>();
    for (const tc of testCols) assignedSubs.set(tc, []);

    for (const sc of subClusters) {
      if (sc.centerX < policialCol.xEnd) continue;
      let bestCol: TableColumnDef | null = null;
      let bestDist = Infinity;
      for (const tc of testCols) {
        const dist = Math.abs(sc.centerX - tc.centerX);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = tc;
        }
      }
      if (bestCol) {
        assignedSubs.get(bestCol)!.push(sc);
      }
    }

    // Refine main column borders between adjacent test columns using the rightmost sub-cluster of col[i]
    // and leftmost sub-cluster of col[i+1]
    for (let i = 0; i < cols.length - 1; i++) {
      const leftCol = cols[i];
      const rightCol = cols[i + 1];
      const leftSubs = assignedSubs.get(leftCol) || [];
      const rightSubs = assignedSubs.get(rightCol) || [];
      const leftAnchor =
        leftSubs.length > 0 ? leftSubs[leftSubs.length - 1].centerX : leftCol.centerX;
      const rightAnchor =
        rightSubs.length > 0 ? rightSubs[0].centerX : rightCol.centerX;
      const fallback = (leftAnchor + rightAnchor) / 2;
      const splitX = findVerticalGutterSplit(
        dataItems,
        Math.min(leftAnchor + 4, rightAnchor - 2),
        Math.max(rightAnchor - 4, leftAnchor + 2),
        fallback
      );
      leftCol.xEnd = splitX;
      rightCol.xStart = splitX;
    }

    // Build sub-columns for each test column
    for (const tc of testCols) {
      const subs = (assignedSubs.get(tc) || []).sort((a, b) => a.centerX - b.centerX);
      if (subs.length === 2) {
        // Exact algebraic split when 2 sub-columns are centered inside [xStart, xEnd]
        const algebraicFallback = Math.max(
          subs[0].centerX + 4,
          Math.min(
            subs[1].centerX - 4,
            subs[0].centerX + subs[1].centerX - (tc.xStart + tc.xEnd) / 2
          )
        );
        const subSplit = findVerticalGutterSplit(
          dataItems,
          subs[0].centerX,
          subs[1].centerX,
          algebraicFallback
        );
        tc.subColumns = [
          {
            label: subs[0].text,
            norm: subs[0].norm,
            xStart: tc.xStart,
            xEnd: subSplit,
            centerX: subs[0].centerX
          },
          {
            label: subs[1].text,
            norm: subs[1].norm,
            xStart: subSplit,
            xEnd: tc.xEnd,
            centerX: subs[1].centerX
          }
        ];
      } else if (subs.length > 2) {
        tc.subColumns = subs.map((sc, sIdx) => {
          const sLeft =
            sIdx === 0
              ? tc.xStart
              : findVerticalGutterSplit(
                  dataItems,
                  subs[sIdx - 1].centerX,
                  sc.centerX,
                  (subs[sIdx - 1].centerX + sc.centerX) / 2
                );
          const sRight =
            sIdx === subs.length - 1
              ? tc.xEnd
              : findVerticalGutterSplit(
                  dataItems,
                  sc.centerX,
                  subs[sIdx + 1].centerX,
                  (sc.centerX + subs[sIdx + 1].centerX) / 2
                );
          return {
            label: sc.text,
            norm: sc.norm,
            xStart: sLeft,
            xEnd: sRight,
            centerX: sc.centerX
          };
        });
      } else {
        // Fallback: split test column into two equal halves
        const mid = (tc.xStart + tc.xEnd) / 2;
        tc.subColumns = [
          { label: 'Coluna 1', norm: 'COLUNA 1', xStart: tc.xStart, xEnd: mid, centerX: (tc.xStart + mid) / 2 },
          { label: 'Coluna 2', norm: 'COLUNA 2', xStart: mid, xEnd: tc.xEnd, centerX: (mid + tc.xEnd) / 2 }
        ];
      }
    }
  } else {
    // No sub-headers found: split each test column in half by whitespace gutter
    for (let i = 0; i < cols.length - 1; i++) {
      const splitX = findVerticalGutterSplit(
        dataItems,
        cols[i].centerX,
        cols[i + 1].centerX,
        (cols[i].xEnd + cols[i + 1].xStart) / 2
      );
      cols[i].xEnd = splitX;
      cols[i + 1].xStart = splitX;
    }
    for (const tc of testCols) {
      const mid = (tc.xStart + tc.xEnd) / 2;
      tc.subColumns = [
        { label: 'Coluna 1', norm: 'COLUNA 1', xStart: tc.xStart, xEnd: mid, centerX: (tc.xStart + mid) / 2 },
        { label: 'Coluna 2', norm: 'COLUNA 2', xStart: mid, xEnd: tc.xEnd, centerX: (mid + tc.xEnd) / 2 }
      ];
    }
  }

  return {
    columns: cols,
    policialCol,
    maspCol,
    testCols,
    headerBottom
  };
}

function getItemsInBox(
  items: PdfTextItem[],
  xStart: number,
  xEnd: number,
  yTop: number,
  yBottom: number
): PdfTextItem[] {
  return items.filter(
    it =>
      it.xCenter >= xStart &&
      it.xCenter <= xEnd &&
      it.top >= yTop &&
      it.top <= yBottom
  );
}

function matchParticipant(
  policialText: string,
  maspText: string,
  participantes: DesempenhoGrupoParticipante[]
): DesempenhoGrupoParticipante | null {
  const normPdfName = normalizeTextForMatch(policialText)
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const pdfMaspDigits = String(maspText || '').replace(/\D/g, '');

  if (!normPdfName && !pdfMaspDigits) return null;

  // 1. Exact full name match
  for (const p of participantes) {
    const normUser = normalizeTextForMatch(p.usuarioNome)
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (normPdfName && normUser && normPdfName === normUser) {
      return p;
    }
  }

  // 2. Exact MASP digits match (at least 5 digits)
  if (pdfMaspDigits.length >= 5) {
    for (const p of participantes) {
      const userMaspDigits = String(p.usuarioMasp || '').replace(/\D/g, '');
      if (userMaspDigits.length >= 5 && userMaspDigits === pdfMaspDigits) {
        return p;
      }
    }
  }

  // 3. Strong name token match (handles line wrapping / middle connectors)
  const stopWords = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);
  const pdfTokens = normPdfName.split(' ').filter(t => t.length > 1 && !stopWords.has(t));
  if (pdfTokens.length >= 2) {
    for (const p of participantes) {
      const normUser = normalizeTextForMatch(p.usuarioNome)
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const userTokens = normUser.split(' ').filter(t => t.length > 1 && !stopWords.has(t));
      if (userTokens.length < 2) continue;
      const pdfSet = new Set(pdfTokens);
      const userSet = new Set(userTokens);
      const allPdfInUser = pdfTokens.every(t => userSet.has(t));
      const allUserInPdf = userTokens.every(t => pdfSet.has(t));
      const sameFirstAndLast =
        pdfTokens[0] === userTokens[0] &&
        pdfTokens[pdfTokens.length - 1] === userTokens[userTokens.length - 1];
      if ((allPdfInUser || allUserInPdf) && sameFirstAndLast) {
        return p;
      }
    }
  }

  return null;
}

function findMatchingGroupMarkers(
  col: TableColumnDef,
  marcadores: DesempenhoMarcador[]
): { marker: DesempenhoMarcador; natacaoSubTarget?: 'BOTH' | '50M' | 'FLUTUACAO' }[] {
  const matches: { marker: DesempenhoMarcador; natacaoSubTarget?: 'BOTH' | '50M' | 'FLUTUACAO' }[] = [];

  for (const m of marcadores) {
    const mNorm = normalizeTextForMatch(m.nome);
    const mBase = stripHeaderSuffixes(mNorm);
    const mFamily = detectTestFamily(m.nome);

    if (col.family === 'NATACAO') {
      if (mNorm.includes('50 METROS') || (mNorm.includes('NATACAO') && mNorm.includes('50'))) {
        matches.push({ marker: m, natacaoSubTarget: '50M' });
        continue;
      }
      if (mNorm.includes('FLUTUACAO')) {
        matches.push({ marker: m, natacaoSubTarget: 'FLUTUACAO' });
        continue;
      }
      if (mFamily === 'NATACAO' || mNorm.includes('NATACAO')) {
        matches.push({ marker: m, natacaoSubTarget: 'BOTH' });
        continue;
      }
    }

    if (col.family && col.family !== 'GENERIC' && mFamily === col.family) {
      matches.push({ marker: m });
      continue;
    }

    // Generic name comparison (ignoring suffixes like "- CAP - CAT - COC" and "(20 REP - 60")")
    if (
      col.baseHeader.length >= 4 &&
      mBase.length >= 4 &&
      (mBase === col.baseHeader ||
        mBase.startsWith(col.baseHeader) ||
        col.baseHeader.startsWith(mBase))
    ) {
      matches.push({ marker: m });
    }
  }

  return matches;
}

function extractAptoInaptoFromLines(lines: string[]): ResultadoAptoInapto | null {
  for (const rawLine of lines) {
    const line = normalizeQuotes(rawLine);
    // Check INAPTO first so "Inapto (X)" never matches "Apto (X)"
    if (/\binapto\b[^()]*\(\s*x\s*\)/i.test(line) || /\(\s*x\s*\)[^()]*\binapto\b/i.test(line)) {
      return 'INAPTO';
    }
    if (!/\binapto\b/i.test(line) && (/\bapto\b[^()]*\(\s*x\s*\)/i.test(line) || /\(\s*x\s*\)[^()]*\bapto\b/i.test(line))) {
      return 'APTO';
    }
  }
  // Fallback if Apto/Inapto and (X) are on adjacent lines inside the same sub-column
  const joined = normalizeQuotes(lines.join(' '));
  if (/\binapto\s*\(\s*x\s*\)/i.test(joined)) return 'INAPTO';
  if (/(?:^|[^a-zA-Z])apto\s*\(\s*x\s*\)/i.test(joined)) return 'APTO';
  return null;
}

function pickSubColumn(
  col: TableColumnDef,
  matcher: (norm: string) => boolean,
  fallbackIndex: number
): SubColumnDef | null {
  const found = col.subColumns.find(sc => matcher(sc.norm));
  if (found) return found;
  return col.subColumns[fallbackIndex] || col.subColumns[0] || null;
}

function extractValueForColumn(
  col: TableColumnDef,
  items: PdfTextItem[],
  dataTop: number,
  dataBottom: number
): {
  valorMarca?: string;
  tempoInput?: string;
  resultadoApto?: ResultadoAptoInapto;
  natacao50m?: ResultadoAptoInapto | null;
  flutuacao5m?: ResultadoAptoInapto | null;
  rawExtracted: string;
} | null {
  if (col.family === 'BARRA_FIXA') {
    const sub = pickSubColumn(
      col,
      n => n.includes('QUANTIDADE') || n.includes('REPETIC'),
      0
    );
    if (!sub) return null;
    const lines = reconstructLinesFromItems(
      getItemsInBox(items, sub.xStart, sub.xEnd, dataTop, dataBottom)
    );
    for (const line of lines) {
      for (const inner of extractParenthesizedContents(line)) {
        // Ignore pure mark X
        if (/^x$/i.test(inner)) continue;
        // If followed by double quotes (or quoted minute/second time), treat as time (seconds)
        if (inner.includes('"') || inner.includes("'")) {
          const secs = parseQuotedTimeToSeconds(inner);
          if (secs !== null) {
            const mmss = formatSecondsToMMSS(secs);
            return { tempoInput: mmss, rawExtracted: mmss };
          }
        }
        const num = parseNumericToken(inner, false);
        if (num !== null) {
          return { valorMarca: num, rawExtracted: num };
        }
      }
    }
    return null;
  }

  if (col.family === 'ABDOMINAL' || col.family === 'FLEXAO_BRACO') {
    const sub = pickSubColumn(
      col,
      n => n.includes('QUANTIDADE') || n.includes('REPETIC'),
      0
    );
    if (!sub) return null;
    const lines = reconstructLinesFromItems(
      getItemsInBox(items, sub.xStart, sub.xEnd, dataTop, dataBottom)
    );
    for (const line of lines) {
      for (const inner of extractParenthesizedContents(line)) {
        if (/^x$/i.test(inner)) continue;
        const num = parseNumericToken(inner, false);
        if (num !== null) {
          return { valorMarca: num, rawExtracted: num };
        }
      }
    }
    return null;
  }

  if (col.family === 'COOPER') {
    const sub = pickSubColumn(col, n => n.includes('PONTUACAO'), 1);
    if (!sub) return null;
    const lines = reconstructLinesFromItems(
      getItemsInBox(items, sub.xStart, sub.xEnd, dataTop, dataBottom)
    );
    for (const line of lines) {
      for (const inner of extractParenthesizedContents(line)) {
        if (/^x$/i.test(inner)) continue;
        const num = parseNumericToken(inner, true);
        if (num !== null) {
          return { valorMarca: num, rawExtracted: num };
        }
      }
    }
    return null;
  }

  if (col.family === 'CORRIDA') {
    const sub = pickSubColumn(col, n => n.includes('PONTUACAO'), 1);
    if (!sub) return null;
    const lines = reconstructLinesFromItems(
      getItemsInBox(items, sub.xStart, sub.xEnd, dataTop, dataBottom)
    );
    for (const line of lines) {
      for (const inner of extractParenthesizedContents(line)) {
        if (/^x$/i.test(inner)) continue;
        const secs = parseQuotedTimeToSeconds(inner);
        if (secs !== null) {
          const mmss = formatSecondsToMMSS(secs);
          return { tempoInput: mmss, rawExtracted: mmss };
        }
      }
    }
    return null;
  }

  if (col.family === 'NATACAO') {
    const sub50 = pickSubColumn(
      col,
      n => n.includes('50') || n.includes('METROS') || n.includes('LIVRE'),
      0
    );
    const subFlut = pickSubColumn(col, n => n.includes('FLUTUACAO'), 1);
    const lines50 = sub50
      ? reconstructLinesFromItems(
          getItemsInBox(items, sub50.xStart, sub50.xEnd, dataTop, dataBottom)
        )
      : [];
    const linesFlut = subFlut
      ? reconstructLinesFromItems(
          getItemsInBox(items, subFlut.xStart, subFlut.xEnd, dataTop, dataBottom)
        )
      : [];

    const res50 = extractAptoInaptoFromLines(lines50);
    const resFlut = extractAptoInaptoFromLines(linesFlut);
    if (!res50 && !resFlut) return null;

    const combined: ResultadoAptoInapto =
      res50 === 'INAPTO' || resFlut === 'INAPTO' ? 'INAPTO' : 'APTO';
    const rawParts: string[] = [];
    if (res50) rawParts.push(`50m: ${res50 === 'APTO' ? 'Apto' : 'Inapto'}`);
    if (resFlut) rawParts.push(`Flutuação: ${resFlut === 'APTO' ? 'Apto' : 'Inapto'}`);

    return {
      resultadoApto: combined,
      natacao50m: res50,
      flutuacao5m: resFlut,
      rawExtracted: rawParts.join(' • ') || (combined === 'APTO' ? 'Apto' : 'Inapto')
    };
  }

  // Generic test column matching a marker name in the group
  const linesAll = reconstructLinesFromItems(
    getItemsInBox(items, col.xStart, col.xEnd, dataTop, dataBottom)
  );
  const aptoRes = extractAptoInaptoFromLines(linesAll);
  if (aptoRes) {
    return { resultadoApto: aptoRes, rawExtracted: aptoRes === 'APTO' ? 'Apto' : 'Inapto' };
  }
  for (const line of linesAll) {
    for (const inner of extractParenthesizedContents(line)) {
      if (/^x$/i.test(inner)) continue;
      if (inner.includes('"') || inner.includes("'")) {
        const secs = parseQuotedTimeToSeconds(inner);
        if (secs !== null) {
          const mmss = formatSecondsToMMSS(secs);
          return { tempoInput: mmss, rawExtracted: mmss };
        }
      }
      const num = parseNumericToken(inner, true);
      if (num !== null) {
        return { valorMarca: num, rawExtracted: num };
      }
    }
  }
  return null;
}

function segmentParticipantBandsWithoutSubHeaders(
  items: PdfTextItem[],
  layout: TableLayout,
  regionTop: number,
  regionBottom: number
): { nameTop: number; nameBottom: number; dataTop: number; dataBottom: number }[] {
  const polItems = getItemsInBox(
    items,
    layout.policialCol.xStart,
    layout.policialCol.xEnd,
    regionTop,
    regionBottom
  ).sort((a, b) => a.top - b.top);

  if (polItems.length === 0) return [];

  // Cluster stacked lines of each name (lines within 16pt belong to the same name block)
  const nameBlocks: { top: number; bottom: number; items: PdfTextItem[] }[] = [];
  for (const it of polItems) {
    const prev = nameBlocks[nameBlocks.length - 1];
    if (prev && it.top - prev.bottom <= 14) {
      prev.items.push(it);
      prev.bottom = Math.max(prev.bottom, it.bottom);
    } else {
      nameBlocks.push({ top: it.top, bottom: it.bottom, items: [it] });
    }
  }

  return nameBlocks.map((blk, idx) => {
    const prevBlk = idx > 0 ? nameBlocks[idx - 1] : null;
    const nextBlk = idx < nameBlocks.length - 1 ? nameBlocks[idx + 1] : null;
    const bandTop = prevBlk ? (prevBlk.bottom + blk.top) / 2 : regionTop;
    const bandBottom = nextBlk ? (blk.bottom + nextBlk.top) / 2 : regionBottom;
    return {
      nameTop: bandTop,
      nameBottom: bandBottom,
      dataTop: bandTop,
      dataBottom: bandBottom
    };
  });
}

export function parseTafPdfPages(
  pages: PdfPageExtract[],
  participantes: DesempenhoGrupoParticipante[],
  marcadores: DesempenhoMarcador[]
): PdfImportSummary {
  const extractedMap = new Map<string, ExtractedMarkerValue>();
  const recognizedColumnsSet = new Set<string>();
  const matchedUserIds = new Set<string>();
  const matchedUserNamesMap = new Map<string, string>();
  let totalTextItems = 0;
  let carryOverLayout: TableLayout | null = null;

  for (const page of pages) {
    totalTextItems += page.items.length;
    if (page.items.length === 0) continue;

    // Find all "POLICIAL" main header anchors on this page
    const policialAnchors = page.items
      .filter(it => {
        const n = normalizeTextForMatch(it.str);
        return n === 'POLICIAL' || n === 'SERVIDOR';
      })
      .sort((a, b) => a.top - b.top);

    const regions: { layout: TableLayout; regionTop: number; regionBottom: number }[] = [];

    if (policialAnchors.length > 0) {
      for (let idx = 0; idx < policialAnchors.length; idx++) {
        const anchor = policialAnchors[idx];
        const nextAnchor = policialAnchors[idx + 1];
        const regionBottom = nextAnchor ? nextAnchor.top - 20 : page.height;
        const layout = buildTableLayoutFromHeader(page, anchor, regionBottom);
        if (layout) {
          regions.push({
            layout,
            regionTop: layout.headerBottom + 1,
            regionBottom
          });
          carryOverLayout = layout;
        }
      }
    } else if (carryOverLayout) {
      // Page continues previous page's table without repeating the main header
      regions.push({
        layout: carryOverLayout,
        regionTop: 0,
        regionBottom: page.height
      });
    }

    for (const region of regions) {
      const { layout, regionTop, regionBottom } = region;

      // Determine which test columns in this table match markers in the active group
      const matchedTestCols = layout.testCols
        .map(col => ({
          col,
          markerMatches: findMatchingGroupMarkers(col, marcadores)
        }))
        .filter(x => x.markerMatches.length > 0);

      for (const mt of matchedTestCols) {
        recognizedColumnsSet.add(mt.col.rawHeader);
      }

      if (matchedTestCols.length === 0) continue;

      const subBands = findSubHeaderBands(page.items, regionTop, regionBottom);

      let participantBands: {
        nameTop: number;
        nameBottom: number;
        dataTop: number;
        dataBottom: number;
      }[] = [];

      if (subBands.length >= 2) {
        // Repeated sub-header per participant (standard PCMG TAF sheet)
        participantBands = subBands.map((band, bIdx) => {
          const nextBand = subBands[bIdx + 1];
          const bandEnd = nextBand ? nextBand.top - 1 : regionBottom;
          return {
            nameTop: band.top - 2,
            nameBottom: bandEnd,
            dataTop: band.bottom + 0.5,
            dataBottom: bandEnd
          };
        });
      } else if (subBands.length === 1) {
        // Single sub-header at top: check if there's 1 participant or multiple below it
        const sub = subBands[0];
        const segmented = segmentParticipantBandsWithoutSubHeaders(
          page.items,
          layout,
          sub.top - 2,
          regionBottom
        );
        if (segmented.length <= 1) {
          participantBands = [
            {
              nameTop: sub.top - 2,
              nameBottom: regionBottom,
              dataTop: sub.bottom + 0.5,
              dataBottom: regionBottom
            }
          ];
        } else {
          participantBands = segmented.map((b, idx) => ({
            ...b,
            dataTop: idx === 0 ? Math.max(b.dataTop, sub.bottom + 0.5) : b.dataTop
          }));
        }
      } else {
        participantBands = segmentParticipantBandsWithoutSubHeaders(
          page.items,
          layout,
          regionTop,
          regionBottom
        );
      }

      for (const band of participantBands) {
        const polLines = reconstructLinesFromItems(
          getItemsInBox(
            page.items,
            layout.policialCol.xStart,
            layout.policialCol.xEnd,
            band.nameTop,
            band.nameBottom
          )
        );
        const policialText = polLines.join(' ').trim();
        const maspLines = layout.maspCol
          ? reconstructLinesFromItems(
              getItemsInBox(
                page.items,
                layout.maspCol.xStart,
                layout.maspCol.xEnd,
                band.nameTop,
                band.nameBottom
              )
            )
          : [];
        const maspText = maspLines.join(' ').trim();

        const matchedUser = matchParticipant(policialText, maspText, participantes);
        if (!matchedUser) continue;

        for (const { col, markerMatches } of matchedTestCols) {
          const extracted = extractValueForColumn(
            col,
            page.items,
            band.dataTop,
            band.dataBottom
          );
          if (!extracted) continue;

          for (const mm of markerMatches) {
            let finalApto = extracted.resultadoApto;
            let finalRaw = extracted.rawExtracted;

            if (col.family === 'NATACAO' && mm.natacaoSubTarget === '50M') {
              if (!extracted.natacao50m) continue;
              finalApto = extracted.natacao50m;
              finalRaw = finalApto === 'APTO' ? 'Apto' : 'Inapto';
            } else if (col.family === 'NATACAO' && mm.natacaoSubTarget === 'FLUTUACAO') {
              if (!extracted.flutuacao5m) continue;
              finalApto = extracted.flutuacao5m;
              finalRaw = finalApto === 'APTO' ? 'Apto' : 'Inapto';
            }

            const mapKey = `${matchedUser.usuarioId}__${mm.marker.id}`;
            extractedMap.set(mapKey, {
              usuarioId: matchedUser.usuarioId,
              usuarioNome: matchedUser.usuarioNome,
              marcadorId: mm.marker.id,
              marcadorNome: mm.marker.nome,
              valorMarca: extracted.valorMarca,
              tempoInput: extracted.tempoInput,
              resultadoApto: finalApto,
              natacao50m: extracted.natacao50m,
              flutuacao5m: extracted.flutuacao5m,
              rawExtracted: finalRaw
            });
            matchedUserIds.add(matchedUser.usuarioId);
            matchedUserNamesMap.set(matchedUser.usuarioId, matchedUser.usuarioNome);
          }
        }
      }
    }
  }

  return {
    entries: Array.from(extractedMap.values()),
    matchedUsersCount: matchedUserIds.size,
    matchedUserNames: Array.from(matchedUserNamesMap.values()),
    unmatchedGroupUsersCount: Math.max(0, participantes.length - matchedUserIds.size),
    recognizedColumns: Array.from(recognizedColumnsSet),
    pagesScanned: pages.length,
    totalTextItems
  };
}

export async function extractTafPdfFromBuffer(
  data: ArrayBuffer | Uint8Array,
  participantes: DesempenhoGrupoParticipante[],
  marcadores: DesempenhoMarcador[],
  workerSrc?: string
): Promise<PdfImportSummary> {
  if (workerSrc && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;

  try {
    const pages: PdfPageExtract[] = [];
    for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
      const page = await pdf.getPage(pNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const items: PdfTextItem[] = [];

      for (const rawItem of textContent.items as any[]) {
        const str = typeof rawItem?.str === 'string' ? rawItem.str : '';
        if (!str.trim()) continue;
        const tx = Array.isArray(rawItem.transform) ? rawItem.transform : [1, 0, 0, 1, 0, 0];
        const x = Number(tx[4] || 0);
        const yPdf = Number(tx[5] || 0);
        const width = Math.max(1, Number(rawItem.width || 0));
        const height = Math.max(6, Number(rawItem.height || Math.abs(tx[3]) || 10));
        // Convert bottom-left PDF coordinates to top-down coordinates
        const top = viewport.height - yPdf - height;
        const bottom = top + height;
        items.push({
          str,
          x,
          xEnd: x + width,
          xCenter: x + width / 2,
          top,
          bottom,
          width,
          height
        });
      }

      pages.push({
        pageNumber: pNum,
        width: viewport.width,
        height: viewport.height,
        items
      });
    }

    return parseTafPdfPages(pages, participantes, marcadores);
  } finally {
    try {
      if (typeof (pdf as any)?.cleanup === 'function') {
        await (pdf as any).cleanup();
      }
      if (typeof loadingTask?.destroy === 'function') {
        await loadingTask.destroy();
      }
    } catch {
      // Ignore cleanup errors on already-disposed PDF instances
    }
  }
}
