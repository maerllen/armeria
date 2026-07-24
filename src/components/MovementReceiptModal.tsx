import React from 'react';
import { Movement, Weapon, VaultSpace } from '../types';
import { formatTimestamp } from '../utils/masks';
import { ShieldCheck, Printer, X, FileText, CheckCircle2 } from 'lucide-react';

interface MovementReceiptModalProps {
  movement: Movement;
  weapon?: Weapon;
  vaultSpaces: VaultSpace[];
  onClose: () => void;
}

export const MovementReceiptModal: React.FC<MovementReceiptModalProps> = ({
  movement,
  weapon,
  vaultSpaces,
  onClose
}) => {
  const withdrawalVault = vaultSpaces.find(v => v.id === movement.withdrawalVaultSpaceId);
  const returnVault = vaultSpaces.find(v => v.id === movement.returnVaultSpaceId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl my-8 overflow-hidden">
        
        {/* Modal Top Actions (Hidden on print) */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
            <FileText className="w-5 h-5 text-amber-400" />
            <span>Recibo de Movimentação de Armamento</span>
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

        {/* Printable Receipt Content Container */}
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
                  SISTEMA DE ARMERIA • TERMO DE MOVIMENTAÇÃO DE CARGA
                </p>
              </div>
            </div>

            <div className="text-right font-mono text-xs">
              <span className="text-slate-400 print:text-black block text-[10px]">Nº REGISTRO</span>
              <span className="font-bold text-amber-400 print:text-black uppercase">{movement.id}</span>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs print:bg-gray-100 print:border-gray-300">
            <div>
              <span className="text-slate-400 print:text-gray-700 block text-[10px] uppercase font-bold">Status do Registro:</span>
              <span className="font-bold text-amber-400 print:text-black">{movement.status}</span>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-300 print:text-black">
              Solicitado em: {formatTimestamp(movement.createdAt)}
            </div>
          </div>

          {/* Policial Details */}
          <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400">
            <h3 className="text-xs font-bold font-mono text-amber-400 print:text-black uppercase tracking-wider">
              1. Dados do Policial (Cautelante)
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">NOME COMPLETO:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.requesterName}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">MASP:</span>
                <span className="font-bold text-amber-400 print:text-black">{movement.requesterMasp}</span>
              </div>
            </div>
          </div>

          {/* Armamento & Munição Details */}
          <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400">
            <h3 className="text-xs font-bold font-mono text-amber-400 print:text-black uppercase tracking-wider">
              2. Especificação do Armamento e Munição
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">TIPO / MODELO:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.weaponType} {movement.weaponModel}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">SÉRIE:</span>
                <span className="font-bold text-amber-400 print:text-black">{movement.weaponSerialNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">CALIBRE:</span>
                <span className="font-bold text-slate-200 print:text-black">{movement.caliber}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">MUNIÇÃO CAUTELADA:</span>
                <span className="font-bold text-slate-200 print:text-black">{movement.ammunitionCount} un</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">CARREGADORES:</span>
                <span className="font-bold text-slate-200 print:text-black">{movement.magazineCount} un</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">COFRE RETIRADA:</span>
                <span className="font-bold text-slate-200 print:text-black">{withdrawalVault?.code || 'Cofre Principal'}</span>
              </div>
            </div>
          </div>

          {/* Approvals & Returns */}
          <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400">
            <h3 className="text-xs font-bold font-mono text-amber-400 print:text-black uppercase tracking-wider">
              3. Auditoria e Armeiros Responsáveis
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">ARMEIRO APROVADOR:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.approvedByUserName || 'Pendente'}</span>
                {movement.approvalDate && (
                  <span className="text-[10px] text-slate-500 print:text-gray-600 block">{formatTimestamp(movement.approvalDate)}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">RECIBO DE DEVOLUÇÃO:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.returnConfirmedByUserName || 'Não Devolvido'}</span>
                {movement.returnDate && (
                  <span className="text-[10px] text-slate-500 print:text-gray-600 block">{formatTimestamp(movement.returnDate)}</span>
                )}
              </div>
            </div>

            {movement.divergenceJustification && (
              <div className="mt-2 pt-2 border-t border-slate-800 print:border-gray-300">
                <span className="text-red-400 print:text-red-700 block text-[10px] font-bold">JUSTIFICATIVA DE DIVERGÊNCIA:</span>
                <p className="text-xs text-slate-300 print:text-black italic">{movement.divergenceJustification}</p>
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs font-mono">
            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-black w-full pb-1"></div>
              <span className="font-bold block text-slate-200 print:text-black">{movement.requesterName}</span>
              <span className="text-[10px] text-slate-500 print:text-gray-700 block">Policial Cautelante (MASP: {movement.requesterMasp})</span>
            </div>

            <div className="space-y-1">
              <div className="border-b border-slate-700 print:border-black w-full pb-1"></div>
              <span className="font-bold block text-slate-200 print:text-black">
                {movement.returnConfirmedByUserName || movement.approvedByUserName || 'Armeiro Responsável'}
              </span>
              <span className="text-[10px] text-slate-500 print:text-gray-700 block">Armeiro da Unidade</span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center text-[10px] text-slate-500 print:text-gray-600 font-mono pt-4 border-t border-slate-800/60 print:border-gray-300">
            Documento de Cautela e Devolução de Armamento gerado eletronicamente pelo Sistema de Armeria PC.
          </div>

        </div>

      </div>
    </div>
  );
};
