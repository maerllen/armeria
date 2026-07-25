import React from 'react';
import { AmmunitionMovement, VaultSpace, Caliber } from '../types';
import { formatTimestamp } from '../utils/masks';
import { ShieldCheck, Printer, X, Disc, ArrowUpRight, RotateCcw } from 'lucide-react';

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

  const handlePrint = () => {
    window.print();
  };

  const responsibleText = movement.responsibleName 
    ? `${movement.responsibleName}${movement.responsibleMasp ? ` (MASP/Doc: ${movement.responsibleMasp})` : ''} ${movement.responsibleType === 'FORA_DO_SISTEMA' ? '[FORA DO SISTEMA]' : '[SISTEMA]'}`
    : movement.recipientOrReason;

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
