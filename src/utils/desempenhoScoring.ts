export type TempoAprovacaoModo = 'MENOR_IGUAL' | 'MAIOR_IGUAL';
export type FatorDistribuicaoNota = 'MARCA' | 'TEMPO';

export interface DesempenhoDistribuicaoFaixa {
  valor: number; // Se fator === 'MARCA': valor na unidade de medida; se fator === 'TEMPO': segundos
  pontos: number; // Pontuação/nota atribuída a esta faixa
}

export interface DesempenhoScoringMarkerLike {
  usaTempo?: boolean;
  tempoMinSegundos?: number | null;
  tempoMaxSegundos?: number | null;
  tempoAprovacaoSegundos?: number | null;
  tempoAprovacaoModo?: TempoAprovacaoModo | null;
  notaMinima: number;
  notaMaxima: number;
  notaAprovacao: number;
  usaDistribuicaoNota?: boolean;
  fatorDistribuicao?: FatorDistribuicaoNota | null;
  regrasDistribuicao?: DesempenhoDistribuicaoFaixa[] | null;
}

export interface DistributedScoreResult {
  hasInput: boolean;
  nota: number | null;
  matchedTier: DesempenhoDistribuicaoFaixa | null;
  belowMinimumTier: boolean;
}

export function normalizeTempoAprovacaoModo(val?: string | null): TempoAprovacaoModo {
  return String(val || '').trim().toUpperCase() === 'MAIOR_IGUAL' ? 'MAIOR_IGUAL' : 'MENOR_IGUAL';
}

export function normalizeFatorDistribuicao(val?: string | null): FatorDistribuicaoNota | null {
  const up = String(val || '').trim().toUpperCase();
  if (up === 'MARCA' || up === 'TEMPO') return up;
  return null;
}

export function parseRegrasDistribuicao(raw: any): DesempenhoDistribuicaoFaixa[] {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }
  const cleaned: DesempenhoDistribuicaoFaixa[] = [];
  for (const item of list) {
    const valor = Number(item?.valor);
    const pontos = Number(item?.pontos);
    if (!Number.isFinite(valor) || valor < 0) continue;
    if (!Number.isFinite(pontos) || pontos < 0) continue;
    cleaned.push({
      valor: Math.round(valor * 100) / 100,
      pontos: Math.round(pontos * 100) / 100
    });
  }
  return cleaned;
}

/**
 * Calcula a nota automaticamente a partir da tabela de distribuição configurada no marcador.
 *
 * Regras de degrau (valor exato ou faixa atingida antes do próximo degrau):
 * - Fator MARCA (Distância / Repetição / Execução): maior valor é melhor.
 *   Ex: 100m = 3 pts, 200m = 4 pts => 199m vale 3 pts, 200m e 201m valem 4 pts. Abaixo de 100m vale notaMinima.
 * - Fator TEMPO com modo MENOR_IGUAL (Invertido - ex: Corrida): menor tempo é melhor.
 *   Ex: 03:00 = 6 pts, 02:30 = 8 pts, 02:00 = 10 pts => 02:45 vale 6 pts, 02:30 vale 8 pts, 03:01 vale notaMinima.
 * - Fator TEMPO com modo MAIOR_IGUAL (Normal - ex: Prancha/Resistência): maior tempo é melhor.
 *   Ex: 01:00 = 5 pts, 02:00 = 8 pts => 01:59 vale 5 pts, 02:00 ou mais vale 8 pts, 00:59 vale notaMinima.
 */
export function calculateDistributedScore(
  marker: DesempenhoScoringMarkerLike,
  valorMarca: number | null | undefined,
  tempoSegundos: number | null | undefined
): DistributedScoreResult {
  const regras = parseRegrasDistribuicao(marker.regrasDistribuicao);
  const fator = normalizeFatorDistribuicao(marker.fatorDistribuicao);

  if (!marker.usaDistribuicaoNota || !fator || regras.length === 0) {
    return { hasInput: false, nota: null, matchedTier: null, belowMinimumTier: false };
  }

  const inputValue = fator === 'TEMPO' ? tempoSegundos : valorMarca;
  if (inputValue === undefined || inputValue === null || !Number.isFinite(inputValue)) {
    return { hasInput: false, nota: null, matchedTier: null, belowMinimumTier: false };
  }

  const clampNota = (n: number) =>
    Math.round(Math.max(marker.notaMinima, Math.min(marker.notaMaxima, n)) * 100) / 100;

  const tempoModo = normalizeTempoAprovacaoModo(marker.tempoAprovacaoModo);
  const sortedAsc = [...regras].sort((a, b) => a.valor - b.valor || a.pontos - b.pontos);

  if (fator === 'TEMPO' && tempoModo === 'MENOR_IGUAL') {
    // Menor tempo = melhor desempenho. Encontra a faixa mais exigente (menor valor) que seja >= tempo realizado.
    let matched: DesempenhoDistribuicaoFaixa | null = null;
    for (const tier of sortedAsc) {
      if (inputValue <= tier.valor) {
        matched = tier;
        break;
      }
    }
    if (!matched) {
      return {
        hasInput: true,
        nota: clampNota(marker.notaMinima),
        matchedTier: null,
        belowMinimumTier: true
      };
    }
    return {
      hasInput: true,
      nota: clampNota(matched.pontos),
      matchedTier: matched,
      belowMinimumTier: false
    };
  }

  // Fator MARCA ou TEMPO com modo MAIOR_IGUAL: maior valor = melhor desempenho.
  // Encontra a maior faixa cujo valor <= índice atingido.
  let matched: DesempenhoDistribuicaoFaixa | null = null;
  for (const tier of sortedAsc) {
    if (inputValue >= tier.valor) {
      matched = tier;
    } else {
      break;
    }
  }

  if (!matched) {
    return {
      hasInput: true,
      nota: clampNota(marker.notaMinima),
      matchedTier: null,
      belowMinimumTier: true
    };
  }

  return {
    hasInput: true,
    nota: clampNota(matched.pontos),
    matchedTier: matched,
    belowMinimumTier: false
  };
}

/**
 * Avalia se o tempo realizado cumpre o critério de aprovação do marcador.
 * - MENOR_IGUAL (Invertido): aprovado se tempoSegundos <= tempoAprovacaoSegundos (ex: 03:00 ou menos aprovado, 03:01 reprovado).
 * - MAIOR_IGUAL (Normal): aprovado se tempoSegundos >= tempoAprovacaoSegundos (ex: 03:00 ou mais aprovado, 02:59 reprovado).
 */
export function isTempoAprovado(
  marker: Pick<DesempenhoScoringMarkerLike, 'usaTempo' | 'tempoAprovacaoSegundos' | 'tempoAprovacaoModo'>,
  tempoSegundos: number | null | undefined
): boolean {
  if (!marker.usaTempo) return true;
  if (marker.tempoAprovacaoSegundos === undefined || marker.tempoAprovacaoSegundos === null) return true;
  if (tempoSegundos === undefined || tempoSegundos === null || !Number.isFinite(tempoSegundos)) return true;

  const modo = normalizeTempoAprovacaoModo(marker.tempoAprovacaoModo);
  if (modo === 'MAIOR_IGUAL') {
    return tempoSegundos >= marker.tempoAprovacaoSegundos;
  }
  return tempoSegundos <= marker.tempoAprovacaoSegundos;
}

export function evaluateDesempenhoApproval(
  marker: DesempenhoScoringMarkerLike,
  notaObtida: number,
  tempoSegundos: number | null | undefined
): boolean {
  const scoreOk = notaObtida >= marker.notaAprovacao;
  const timeOk = isTempoAprovado(marker, tempoSegundos);
  return scoreOk && timeOk;
}
