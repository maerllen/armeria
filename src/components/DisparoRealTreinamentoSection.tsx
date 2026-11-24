import React from 'react';
import { Crosshair, Check } from 'lucide-react';
import {
  DisparoRealArmaItem,
  TipoArmaDisparoReal,
  TIPOS_ARMA_DISPARO_REAL
} from '../types';
import { escapeHtmlText } from '../utils/printHelper';

export interface DisparoRealValidationResult {
  error?: string;
  normalized: DisparoRealArmaItem[];
}

export function validateDisparoReal(
  disparoReal: boolean,
  disparosReais: DisparoRealArmaItem[]
): DisparoRealValidationResult {
  if (!disparoReal) {
    return { normalized: [] };
  }

  const allowed = new Set<TipoArmaDisparoReal>(TIPOS_ARMA_DISPARO_REAL);
  const seen = new Set<TipoArmaDisparoReal>();
  const normalized: DisparoRealArmaItem[] = [];

  for (const item of disparosReais || []) {
    if (!item || !allowed.has(item.tipoArma) || seen.has(item.tipoArma)) continue;
    const qty = Number(item.quantidadeTiros);
    if (!Number.isInteger(qty) || qty <= 0) {
      return {
        error: `Informe uma quantidade válida de tiros (maior que zero) para ${item.tipoArma}.`,
        normalized: []
      };
    }
    if (qty > 100000) {
      return {
        error: `A quantidade de tiros informada para ${item.tipoArma} excede o limite permitido.`,
        normalized: []
      };
    }
    seen.add(item.tipoArma);
    normalized.push({ tipoArma: item.tipoArma, quantidadeTiros: qty });
  }

  if (normalized.length === 0) {
    return {
      error: 'Selecione ao menos um tipo de arma (Pistola, Fuzil, Submetralhadora ou Espingarda) e informe a quantidade de tiros.',
      normalized: []
    };
  }

  return { normalized };
}

export function getTotalTirosDisparoReal(disparosReais?: DisparoRealArmaItem[]): number {
  if (!Array.isArray(disparosReais)) return 0;
  return disparosReais.reduce((acc, item) => acc + (Number(item?.quantidadeTiros) > 0 ? Math.trunc(Number(item.quantidadeTiros)) : 0), 0);
}

export function formatDisparosReaisText(
  disparoReal?: boolean,
  disparosReais?: DisparoRealArmaItem[]
): string {
  if (!disparoReal || !Array.isArray(disparosReais) || disparosReais.length === 0) {
    return 'Não';
  }
  const parts = disparosReais
    .filter(item => item && item.tipoArma && Number(item.quantidadeTiros) > 0)
    .map(item => `${item.tipoArma}: ${Math.trunc(Number(item.quantidadeTiros))} ${Math.trunc(Number(item.quantidadeTiros)) === 1 ? 'tiro' : 'tiros'}`);
  if (parts.length === 0) return 'Sim';
  const total = getTotalTirosDisparoReal(disparosReais);
  return parts.length > 1 ? `${parts.join(' • ')} (Total: ${total} tiros)` : parts[0];
}

export function buildDisparoRealPrintBoxHtml(
  disparoReal?: boolean,
  disparosReais?: DisparoRealArmaItem[]
): string {
  if (!disparoReal || !Array.isArray(disparosReais) || disparosReais.length === 0) {
    return '';
  }
  const validItems = disparosReais.filter(item => item && item.tipoArma && Number(item.quantidadeTiros) > 0);
  if (validItems.length === 0) return '';
  const totalTiros = getTotalTirosDisparoReal(validItems);

  const itemsHtml = validItems
    .map(item => {
      const qty = Math.trunc(Number(item.quantidadeTiros));
      return `<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#ffffff;font-size:11px;"><strong>${escapeHtmlText(item.tipoArma)}:</strong> ${qty} ${qty === 1 ? 'tiro' : 'tiros'}</span>`;
    })
    .join('');

  return `
    <div style="border:1px solid #cbd5e1;border-radius:6px;padding:9px 12px;margin:10px 0 12px;background:#f8fafc;">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#334155;margin-bottom:5px;border-bottom:1px solid #e2e8f0;padding-bottom:3px;">
        Treinamento com Disparo Real — Sim (Total: ${totalTiros} ${totalTiros === 1 ? 'tiro' : 'tiros'})
      </div>
      <div>${itemsHtml}</div>
    </div>
  `;
}

export function buildDisparoRealInlineHtml(
  disparoReal?: boolean,
  disparosReais?: DisparoRealArmaItem[]
): string {
  if (!disparoReal || !Array.isArray(disparosReais) || disparosReais.length === 0) {
    return '';
  }
  const summary = formatDisparosReaisText(disparoReal, disparosReais);
  return `<div style="margin-bottom:4px;font-size:9.5px;color:#9a3412;"><strong>Disparo Real:</strong> ${escapeHtmlText(summary)}</div>`;
}

interface DisparoRealSummaryBlockProps {
  disparoReal?: boolean;
  disparosReais?: DisparoRealArmaItem[];
  compact?: boolean;
}

export const DisparoRealSummaryBlock: React.FC<DisparoRealSummaryBlockProps> = ({
  disparoReal,
  disparosReais,
  compact = false
}) => {
  const validItems = Array.isArray(disparosReais)
    ? disparosReais.filter(item => item && item.tipoArma && Number(item.quantidadeTiros) > 0)
    : [];

  if (!disparoReal || validItems.length === 0) {
    return null;
  }

  const totalTiros = getTotalTirosDisparoReal(validItems);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-orange-400 font-bold flex items-center space-x-1 mr-1">
          <Crosshair className="w-3.5 h-3.5" />
          <span>Disparo Real ({totalTiros} {totalTiros === 1 ? 'tiro' : 'tiros'}):</span>
        </span>
        {validItems.map(item => {
          const qty = Math.trunc(Number(item.quantidadeTiros));
          return (
            <span
              key={item.tipoArma}
              className="px-2 py-0.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-200 font-semibold"
            >
              <strong>{item.tipoArma}:</strong> {qty} {qty === 1 ? 'tiro' : 'tiros'}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-orange-500/30 rounded-xl p-3.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-orange-400 uppercase font-bold flex items-center space-x-1.5">
          <Crosshair className="w-3.5 h-3.5" />
          <span>Treinamento com Disparo Real — Sim</span>
        </span>
        <span className="px-2 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/30 text-orange-300 font-mono font-bold text-[11px]">
          Total: {totalTiros} {totalTiros === 1 ? 'tiro' : 'tiros'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {validItems.map(item => {
          const qty = Math.trunc(Number(item.quantidadeTiros));
          return (
            <div
              key={item.tipoArma}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
            >
              <span className="font-bold text-slate-100">{item.tipoArma}</span>
              <span className="font-mono font-bold text-orange-300">
                {qty} {qty === 1 ? 'tiro' : 'tiros'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DisparoRealTreinamentoSectionProps {
  disparoReal: boolean;
  disparosReais: DisparoRealArmaItem[];
  onChangeDisparoReal: (value: boolean) => void;
  onChangeDisparosReais: (items: DisparoRealArmaItem[]) => void;
  idPrefix?: string;
}

export const DisparoRealTreinamentoSection: React.FC<DisparoRealTreinamentoSectionProps> = ({
  disparoReal,
  disparosReais,
  onChangeDisparoReal,
  onChangeDisparosReais,
  idPrefix = 'trein'
}) => {
  const selectedMap = new Map<TipoArmaDisparoReal, number>();
  for (const item of disparosReais || []) {
    if (item && item.tipoArma) {
      selectedMap.set(item.tipoArma, item.quantidadeTiros);
    }
  }

  const totalTiros = getTotalTirosDisparoReal(disparosReais);

  const handleToggleWeapon = (weapon: TipoArmaDisparoReal) => {
    if (selectedMap.has(weapon)) {
      onChangeDisparosReais(disparosReais.filter(item => item.tipoArma !== weapon));
    } else {
      const next = [...disparosReais, { tipoArma: weapon, quantidadeTiros: 0 }];
      next.sort(
        (a, b) =>
          TIPOS_ARMA_DISPARO_REAL.indexOf(a.tipoArma) -
          TIPOS_ARMA_DISPARO_REAL.indexOf(b.tipoArma)
      );
      onChangeDisparosReais(next);
    }
  };

  const handleShotsChange = (weapon: TipoArmaDisparoReal, rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 6);
    const parsed = digitsOnly === '' ? 0 : Math.min(100000, parseInt(digitsOnly, 10));
    onChangeDisparosReais(
      disparosReais.map(item =>
        item.tipoArma === weapon ? { ...item, quantidadeTiros: parsed } : item
      )
    );
  };

  return (
    <div
      className={`bg-slate-950/80 border rounded-xl p-4 space-y-3.5 text-xs transition ${
        disparoReal ? 'border-orange-500/45' : 'border-slate-800'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-200 uppercase flex items-center space-x-2">
            <Crosshair className={`w-4 h-4 ${disparoReal ? 'text-orange-400' : 'text-slate-400'}`} />
            <span>Treinamento com disparo real?</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Informe se houve emprego de munição real e a quantidade de tiros efetuados por tipo de armamento.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0 sm:w-48">
          <button
            type="button"
            onClick={() => {
              onChangeDisparoReal(false);
              onChangeDisparosReais([]);
            }}
            className={`py-2 px-3 rounded-xl border font-bold transition ${
              !disparoReal
                ? 'bg-slate-800 border-slate-500 text-slate-100 shadow'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Não
          </button>
          <button
            type="button"
            onClick={() => onChangeDisparoReal(true)}
            className={`py-2 px-3 rounded-xl border font-bold transition ${
              disparoReal
                ? 'bg-orange-500/20 border-orange-400 text-orange-300 shadow'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Sim
          </button>
        </div>
      </div>

      {disparoReal && (
        <div className="pt-3 border-t border-slate-800/90 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase text-orange-300">
              Selecione o(s) armamento(s) utilizado(s) e informe a quantidade de tiros *
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 border border-orange-500/35 text-orange-300 font-mono font-bold text-[11px]">
              {disparosReais.length} arma(s) • {totalTiros} {totalTiros === 1 ? 'tiro' : 'tiros'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {TIPOS_ARMA_DISPARO_REAL.map(weapon => {
              const isSelected = selectedMap.has(weapon);
              const shots = selectedMap.get(weapon) ?? 0;
              const inputId = `${idPrefix}-disparo-${weapon.toLowerCase()}`;
              return (
                <div
                  key={weapon}
                  className={`rounded-xl border p-3 transition flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-orange-500/10 border-orange-400/70 shadow-sm'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleWeapon(weapon)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <span
                      className={`font-bold text-xs ${
                        isSelected ? 'text-orange-200' : 'text-slate-300'
                      }`}
                    >
                      {weapon}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition shrink-0 ${
                        isSelected
                          ? 'bg-orange-500 border-orange-400 text-slate-950'
                          : 'bg-slate-950 border-slate-700 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  </button>

                  {isSelected ? (
                    <div className="space-y-1">
                      <label
                        htmlFor={inputId}
                        className="block text-[10px] font-bold uppercase text-orange-300/90"
                      >
                        Quantidade de tiros *
                      </label>
                      <input
                        id={inputId}
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        inputMode="numeric"
                        value={shots > 0 ? String(shots) : ''}
                        onChange={e => handleShotsChange(weapon, e.target.value)}
                        placeholder="Ex: 50"
                        className="w-full bg-slate-950 border border-orange-500/50 text-slate-100 font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-400"
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500">
                      Clique para marcar este armamento
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
