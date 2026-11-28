export type TempoAprovacaoModo = 'MENOR_IGUAL' | 'MAIOR_IGUAL';
export type FatorDistribuicaoNota = 'MARCA' | 'TEMPO' | 'MARCA_TEMPO' | 'ACERTOS' | 'TIROS_TEMPO';
export type TipoFaixaDistribuicao = 'MARCA' | 'TEMPO';

export interface DesempenhoDistribuicaoFaixa {
  tipo?: TipoFaixaDistribuicao; // Usado quando fator === 'MARCA_TEMPO' (faixas de 'TEMPO' e 'MARCA' no mesmo índice físico)
  valor: number; // MARCA: unidade de medida; TEMPO: segundos; ACERTOS: qtd acertos; TIROS_TEMPO: qtd tiros/acertos
  tempoSegundos?: number | null; // Usado quando fator === 'TIROS_TEMPO' (ex.: 2 tiros em 1 segundo -> valor: 2, tempoSegundos: 1)
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
  teveTiro?: boolean;
  quantidadeTiros?: number | null;
  quantidadeTirosPontuados?: number | null;
}

export interface DistributedScoreResult {
  hasInput: boolean;
  nota: number | null;
  matchedTier: DesempenhoDistribuicaoFaixa | null;
  matchedMarcaTier?: DesempenhoDistribuicaoFaixa | null;
  matchedTempoTier?: DesempenhoDistribuicaoFaixa | null;
  belowMinimumTier: boolean;
  achievedRate?: number | null; // Taxa de acertos/tiros por segundo (para TIROS_TEMPO)
}

export function normalizeTempoAprovacaoModo(val?: string | null): TempoAprovacaoModo {
  return String(val || '').trim().toUpperCase() === 'MAIOR_IGUAL' ? 'MAIOR_IGUAL' : 'MENOR_IGUAL';
}

export function normalizeFatorDistribuicao(val?: string | null): FatorDistribuicaoNota | null {
  const up = String(val || '').trim().toUpperCase();
  if (up === 'MARCA' || up === 'TEMPO' || up === 'MARCA_TEMPO' || up === 'ACERTOS' || up === 'TIROS_TEMPO') return up;
  return null;
}

export function computeTierRate(tier: DesempenhoDistribuicaoFaixa): number {
  const sec = Number(tier.tempoSegundos);
  if (Number.isFinite(sec) && sec > 0) {
    return tier.valor / sec;
  }
  return tier.valor;
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
    const rawTempo = item?.tempoSegundos;
    const parsedTempo =
      rawTempo !== undefined && rawTempo !== null && rawTempo !== '' && Number.isFinite(Number(rawTempo))
        ? Math.round(Number(rawTempo) * 100) / 100
        : null;
    const rawTipo = String(item?.tipo || '').trim().toUpperCase();
    const parsedTipo: TipoFaixaDistribuicao | undefined =
      rawTipo === 'TEMPO' ? 'TEMPO' : rawTipo === 'MARCA' ? 'MARCA' : undefined;
    cleaned.push({
      ...(parsedTipo ? { tipo: parsedTipo } : {}),
      valor: Math.round(valor * 100) / 100,
      ...(parsedTempo !== null && parsedTempo > 0 ? { tempoSegundos: parsedTempo } : {}),
      pontos: Math.round(pontos * 100) / 100
    });
  }
  return cleaned;
}

function matchSingleDimensionTier(
  regras: DesempenhoDistribuicaoFaixa[],
  inputValue: number,
  lowerIsBetter: boolean
): DesempenhoDistribuicaoFaixa | null {
  const sortedAsc = [...regras].sort((a, b) => a.valor - b.valor || a.pontos - b.pontos);
  if (lowerIsBetter) {
    for (const tier of sortedAsc) {
      if (inputValue <= tier.valor) {
        return tier;
      }
    }
    return null;
  }
  let matched: DesempenhoDistribuicaoFaixa | null = null;
  for (const tier of sortedAsc) {
    if (inputValue >= tier.valor) {
      matched = tier;
    } else {
      break;
    }
  }
  return matched;
}

/**
 * Calcula a nota automaticamente a partir da tabela de distribuição configurada no marcador.
 *
 * Regras de degrau (valor exato ou faixa atingida antes do próximo degrau):
 * - Fator MARCA (Distância / Repetição / Execução): maior valor é melhor.
 *   Ex: 100m = 3 pts, 200m = 4 pts => 199m vale 3 pts, 200m e 201m valem 4 pts. Abaixo de 100m vale notaMinima.
 * - Fator MARCA_TEMPO (Misto — Marca/Repetição + Tempo no mesmo índice físico):
 *   Permite combinar faixas de Tempo e faixas de Marca/Repetição no mesmo índice.
 *   Quando ambos forem informados: se a soma das maiores faixas de Tempo e Marca couber em notaMaxima,
 *   soma os pontos obtidos em cada grupo; caso contrário, aplica a maior pontuação atingida entre os dois grupos.
 * - Fator ACERTOS (Tiros pontuados — Marcador Tático): maior número de acertos é melhor.
 * - Fator TIROS_TEMPO (Distribuição Cruzada — Acertos/Tiros por segundo): maior taxa (acertos / tempoSegundos) é melhor.
 * - Fator TEMPO com modo MENOR_IGUAL (Invertido - ex: Corrida): menor tempo é melhor.
 * - Fator TEMPO com modo MAIOR_IGUAL (Normal - ex: Prancha/Resistência): maior tempo é melhor.
 */
export function calculateDistributedScore(
  marker: DesempenhoScoringMarkerLike,
  valorMarca: number | null | undefined,
  tempoSegundos: number | null | undefined,
  acertosTiros?: number | null | undefined
): DistributedScoreResult {
  const regras = parseRegrasDistribuicao(marker.regrasDistribuicao);
  const fator = normalizeFatorDistribuicao(marker.fatorDistribuicao);

  if (!marker.usaDistribuicaoNota || !fator || regras.length === 0) {
    return {
      hasInput: false,
      nota: null,
      matchedTier: null,
      matchedMarcaTier: null,
      matchedTempoTier: null,
      belowMinimumTier: false,
      achievedRate: null
    };
  }

  const clampNota = (n: number) =>
    Math.round(Math.max(marker.notaMinima, Math.min(marker.notaMaxima, n)) * 100) / 100;

  // Distribuição mista física: faixas de Tempo e de Repetição/Marca no mesmo índice
  if (fator === 'MARCA_TEMPO') {
    const tempoTiers = regras.filter(r => r.tipo === 'TEMPO');
    const marcaTiers = regras.filter(r => r.tipo !== 'TEMPO');
    const hasTempoInput =
      tempoTiers.length > 0 &&
      tempoSegundos !== undefined &&
      tempoSegundos !== null &&
      Number.isFinite(tempoSegundos) &&
      tempoSegundos >= 0;
    const hasMarcaInput =
      marcaTiers.length > 0 &&
      valorMarca !== undefined &&
      valorMarca !== null &&
      Number.isFinite(valorMarca) &&
      valorMarca >= 0;

    if (!hasTempoInput && !hasMarcaInput) {
      return {
        hasInput: false,
        nota: null,
        matchedTier: null,
        matchedMarcaTier: null,
        matchedTempoTier: null,
        belowMinimumTier: false,
        achievedRate: null
      };
    }

    const tempoModo = normalizeTempoAprovacaoModo(marker.tempoAprovacaoModo);
    const matchedTempoTier = hasTempoInput
      ? matchSingleDimensionTier(tempoTiers, tempoSegundos!, tempoModo === 'MENOR_IGUAL')
      : null;
    const matchedMarcaTier = hasMarcaInput
      ? matchSingleDimensionTier(marcaTiers, valorMarca!, false)
      : null;

    if (!matchedTempoTier && !matchedMarcaTier) {
      return {
        hasInput: true,
        nota: clampNota(marker.notaMinima),
        matchedTier: null,
        matchedMarcaTier: null,
        matchedTempoTier: null,
        belowMinimumTier: true,
        achievedRate: null
      };
    }

    if (matchedTempoTier && matchedMarcaTier) {
      const maxTempoPts = Math.max(...tempoTiers.map(t => t.pontos));
      const maxMarcaPts = Math.max(...marcaTiers.map(t => t.pontos));
      const isAdditiveScale = maxTempoPts + maxMarcaPts <= marker.notaMaxima + 1e-9;
      const combinedNota = isAdditiveScale
        ? clampNota(matchedTempoTier.pontos + matchedMarcaTier.pontos)
        : clampNota(Math.max(matchedTempoTier.pontos, matchedMarcaTier.pontos));
      const primaryTier =
        matchedMarcaTier.pontos >= matchedTempoTier.pontos ? matchedMarcaTier : matchedTempoTier;
      return {
        hasInput: true,
        nota: combinedNota,
        matchedTier: primaryTier,
        matchedMarcaTier,
        matchedTempoTier,
        belowMinimumTier: false,
        achievedRate: null
      };
    }

    const singleMatched = matchedMarcaTier || matchedTempoTier!;
    return {
      hasInput: true,
      nota: clampNota(singleMatched.pontos),
      matchedTier: singleMatched,
      matchedMarcaTier,
      matchedTempoTier,
      belowMinimumTier: false,
      achievedRate: null
    };
  }

  // Distribuição cruzada: Tiros / Acertos por segundo
  if (fator === 'TIROS_TEMPO') {
    const hits =
      acertosTiros !== undefined && acertosTiros !== null && Number.isFinite(acertosTiros)
        ? acertosTiros
        : valorMarca;
    if (
      hits === undefined ||
      hits === null ||
      !Number.isFinite(hits) ||
      hits < 0 ||
      tempoSegundos === undefined ||
      tempoSegundos === null ||
      !Number.isFinite(tempoSegundos) ||
      tempoSegundos <= 0
    ) {
      return { hasInput: false, nota: null, matchedTier: null, belowMinimumTier: false, achievedRate: null };
    }

    const achievedRate = Math.round((hits / tempoSegundos) * 10000) / 10000;
    const sortedByRateAsc = [...regras].sort(
      (a, b) => computeTierRate(a) - computeTierRate(b) || a.pontos - b.pontos
    );

    let matched: DesempenhoDistribuicaoFaixa | null = null;
    for (const tier of sortedByRateAsc) {
      const tierRate = computeTierRate(tier);
      if (achievedRate + 1e-9 >= tierRate) {
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
        belowMinimumTier: true,
        achievedRate
      };
    }

    return {
      hasInput: true,
      nota: clampNota(matched.pontos),
      matchedTier: matched,
      belowMinimumTier: false,
      achievedRate
    };
  }

  // Fator ACERTOS (Tiros pontuados)
  if (fator === 'ACERTOS') {
    const hits =
      acertosTiros !== undefined && acertosTiros !== null && Number.isFinite(acertosTiros)
        ? acertosTiros
        : valorMarca;
    if (hits === undefined || hits === null || !Number.isFinite(hits) || hits < 0) {
      return { hasInput: false, nota: null, matchedTier: null, belowMinimumTier: false, achievedRate: null };
    }

    const matched = matchSingleDimensionTier(regras, hits, false);
    if (!matched) {
      return {
        hasInput: true,
        nota: clampNota(marker.notaMinima),
        matchedTier: null,
        belowMinimumTier: true,
        achievedRate: null
      };
    }

    return {
      hasInput: true,
      nota: clampNota(matched.pontos),
      matchedTier: matched,
      belowMinimumTier: false,
      achievedRate: null
    };
  }

  const inputValue = fator === 'TEMPO' ? tempoSegundos : valorMarca;
  if (inputValue === undefined || inputValue === null || !Number.isFinite(inputValue)) {
    return { hasInput: false, nota: null, matchedTier: null, belowMinimumTier: false, achievedRate: null };
  }

  const tempoModo = normalizeTempoAprovacaoModo(marker.tempoAprovacaoModo);
  const matched = matchSingleDimensionTier(
    regras,
    inputValue,
    fator === 'TEMPO' && tempoModo === 'MENOR_IGUAL'
  );

  if (!matched) {
    return {
      hasInput: true,
      nota: clampNota(marker.notaMinima),
      matchedTier: null,
      belowMinimumTier: true,
      achievedRate: null
    };
  }

  return {
    hasInput: true,
    nota: clampNota(matched.pontos),
    matchedTier: matched,
    belowMinimumTier: false,
    achievedRate: null
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
