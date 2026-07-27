import React from 'react';
import { AmmunitionMovement, VaultSpace, Caliber } from '../types';
import { formatTimestamp } from '../utils/masks';
import { ShieldCheck, Printer, X, Disc, ArrowUpRight, RotateCcw } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface AmmunitionReceiptModalProps {
  movement: AmmunitionMovement;
  calibers: Caliber[];
  vaultSpaces: VaultSpace[];
  onClose: () => void;
  isReturnReceipt?: boolean;
  returnAmountPrinted?: number;
}

export const AmmunitionReceiptModal: React.FC<AmmunitionReceiptModalProps> = ({
  movement,
  calibers,
  vaultSpaces,
  onClose,
  isReturnReceipt = false,
  returnAmountPrinted
}) => {
  const caliber = calibers.find(c => c.id === movement.caliberId);
  const vault = vaultSpaces.find(v => v.id === movement.vaultSpaceId);

  const responsibleText = movement.responsibleName 
    ? `${movement.responsibleName}${movement.responsibleMasp ? ` (MASP/Doc: ${movement.responsibleMasp})` : ''} ${movement.responsibleType === 'FORA_DO_SISTEMA' ? '[FORA DO SISTEMA]' : '[SISTEMA]'}`
    : movement.recipientOrReason;

  const handlePrint = () => {
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Munição - ${caliber?.name || 'Munição'} - PCMG</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMERIA • COMPROVANTE DE MOVIMENTAÇÃO DE MUNIÇÃO</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${movement.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>TIPO:</strong> ${isReturnReceipt ? 'DEVOLUÇÃO DE MUNIÇÃO' : (movement.type === 'SAIDA' ? 'SAÍDA / FORNECIMENTO' : 'ENTRADA / REPOSIÇÃO')}</div>
          <div><strong>Data:</strong> ${formatTimestamp(movement.timestamp)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados do Material</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Calibre:</span> <span class="val">${caliber?.name || 'Munição'}</span></div>
            <div class="field"><span class="label">Quantidade:</span> <span class="val">${isReturnReceipt ? (returnAmountPrinted || movement.returnedQuantity || 0) : movement.quantity} unidades</span></div>
            <div class="field"><span class="label">Cofre de Armazenamento:</span> <span class="val">${vault?.code || 'Cofre Principal'}</span></div>
            <div class="field"><span class="label">Armeiro Operador:</span> <span class="val">${movement.userName}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Destino e Responsável</div>
          <div class="field"><span class="label">Destinatário / Motivo:</span> <span class="val">${responsibleText}</span></div>
          ${movement.notes ? `<div class="field" style="margin-top: 6px;"><span class="label">Observações:</span> <span class="val" style="font-weight: normal;">${movement.notes}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${movement.responsibleName || 'Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Recebedor / Responsável</span>
          </div>
          <div class="sig-line">
            ${movement.userName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Operador</span>
          </div>
        </div>

        <div class="footer">
          Documento gerado eletronicamente pelo Sistema de Armeria da Polícia Civil em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl my-8 overflow-hidden">
        
        {/* Modal Top Actions (Hidden on print) */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
            <Disc className="w-5 h-5 text-amber-400" />
            <span>
              {isReturnReceipt 
                ? 'Recibo de Devolução de Munição Não Utilizada' 
                : 'Recibo de Movimentação / Saída de Munição'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition flex items-center space-x-1.5 shadow"
            >
              <Printer className="w-4 h-4 text-slate-950" />
              <span>Imprimir Recibo</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div className="p-8 bg-slate-950 text-slate-100 space-y-6 print:bg-white print:text-black print:p-0 print:m-0">
          
          {/* Header */}
          <div className="border-b border-slate-800 print:border-black pb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center print:border-black">
                <ShieldCheck className="w-6 h-6 text-amber-400 print:text-black" />
              </div>
              <div>
                <h1 className="text-base font-black font-mono uppercase tracking-wider text-slate-100 print:text-black">
                  POLÍCIA CIVIL • ESTADO DE MINAS GERAIS
                </h1>
                <p className="text-[11px] font-mono text-amber-400 print:text-black font-bold">
                  SISTEMA DE ARMERIA • TERMO DE {isReturnReceipt ? 'DEVOLUÇÃO DE MUNIÇÃO' : 'MOVIMENTAÇÃO DE MUNIÇÃO'}
                </p>
              </div>
            </div>

            <div className="text-right font-mono text-xs">
              <span className="text-slate-400 print:text-black block text-[10px]">Nº REGISTRO</span>
              <span className="font-bold text-amber-400 print:text-black uppercase">{movement.id}</span>
            </div>
          </div>

          {/* Type / Action Badge */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs print:bg-gray-100 print:border-gray-300">
            <div>
              <span className="text-slate-400 print:text-gray-700 block text-[10px] uppercase font-bold">Operação:</span>
              <span className="font-bold text-amber-400 print:text-black">
                {isReturnReceipt ? 'DEVOLUÇÃO DE SOBRA (CURSO / TESTE)' : `SAÍDA DE MUNIÇÃO - ${movement.recipientOrReason.toUpperCase()}`}
              </span>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-300 print:text-black">
              Data do Registro: {formatTimestamp(movement.createdAt)}
            </div>
          </div>

          {/* Detalhes do Policial Responsável */}
          <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400">
            <h3 className="text-xs font-bold font-mono text-amber-400 print:text-black uppercase tracking-wider">
              1. Policial Responsável pela Retirada / Devolução
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">NOME COMPLETO:</span>
                <span className="font-bold text-slate-100 print:text-black">
                  {movement.responsibleName || movement.recipientOrReason}
                </span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">MASP / DOCUMENTO:</span>
                <span className="font-bold text-amber-400 print:text-black">
                  {movement.responsibleMasp || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">VÍNCULO AO SISTEMA:</span>
                <span className="font-bold text-slate-200 print:text-black">
                  {movement.responsibleType === 'FORA_DO_SISTEMA' ? 'Fora do Sistema' : 'Cadastrado no Sistema'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">ARMEIRO REGISTRADOR:</span>
                <span className="font-bold text-slate-200 print:text-black">
                  {movement.userName}
                </span>
              </div>
            </div>
          </div>

          {/* Detalhes da Munição */}
          <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400">
            <h3 className="text-xs font-bold font-mono text-amber-400 print:text-black uppercase tracking-wider">
              2. Especificação da Munição e Local do Cofre
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">CALIBRE:</span>
                <span className="font-bold text-amber-400 print:text-black">{caliber ? caliber.name : movement.caliberId}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">LOCAL DO COFRE:</span>
                <span className="font-bold text-slate-100 print:text-black">{vault ? vault.code : 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">MOTIVO / TIPO:</span>
                <span className="font-bold text-slate-200 print:text-black">{movement.recipientOrReason}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">QUANTIDADE RETIRADA:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.quantity} unidades</span>
              </div>
              
              {movement.returnedQuantity !== undefined && movement.returnedQuantity > 0 && (
                <div>
                  <span className="text-slate-400 print:text-gray-600 block text-[10px]">QUANTIDADE DEVOLVIDA:</span>
                  <span className="font-bold text-emerald-400 print:text-black">{movement.returnedQuantity} unidades</span>
                </div>
              )}

              {isReturnReceipt && returnAmountPrinted !== undefined && (
                <div>
                  <span className="text-slate-400 print:text-gray-600 block text-[10px]">QTD DEVOLVIDA NESTA ETAPA:</span>
                  <span className="font-bold text-emerald-400 print:text-black">{returnAmountPrinted} unidades</span>
                </div>
              )}
            </div>

            {/* Observação (até 500 caracteres) */}
            {movement.observation && (
              <div className="mt-3 pt-3 border-t border-slate-800 print:border-gray-300 font-mono">
                <span className="text-slate-400 print:text-gray-700 block text-[10px] font-bold uppercase">OBSERVAÇÕES DO REGISTRO:</span>
                <p className="text-xs text-slate-200 print:text-black italic bg-slate-900 print:bg-gray-100 p-2 rounded-lg mt-1 border border-slate-800 print:border-gray-300">
                  {movement.observation}
                </p>
              </div>
            )}
          </div>

          {/* Assinaturas */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs font-mono">
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-black w-full pb-1"></div>
              <span className="font-bold block text-slate-200 print:text-black">
                {movement.responsibleName || movement.recipientOrReason}
              </span>
              <span className="text-[10px] text-slate-500 print:text-gray-700 block">
                Policial Responsável {movement.responsibleMasp ? `(MASP: ${movement.responsibleMasp})` : ''}
              </span>
            </div>

            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-black w-full pb-1"></div>
              <span className="font-bold block text-slate-200 print:text-black">
                {movement.returnedByUserName || movement.userName}
              </span>
              <span className="text-[10px] text-slate-500 print:text-gray-700 block">
                Armeiro Responsável da Unidade
              </span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center text-[10px] text-slate-500 print:text-gray-600 font-mono pt-4 border-t border-slate-800/60 print:border-gray-300">
            Documento de Movimentação e Devolução de Munição gerado eletronicamente pelo Sistema de Armeria da Polícia Civil.
          </div>

        </div>

      </div>
    </div>
  );
};
