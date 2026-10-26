import React from 'react';
import { Movement, Weapon, VaultSpace } from '../types';
import { formatTimestamp } from '../utils/masks';
import { ShieldCheck, Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

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
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Cautela - ${movement.weaponSerialNumber} - PCMG</title>
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
            <div class="subtitle">SISTEMA DE ARMERIA • TERMO DE MOVIMENTAÇÃO DE CARGA</div>
          </div>
          <div class="reg-id">
            Nº REGISTRO<br>
            <span style="font-size: 15px; font-weight: 900;">#${movement.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>STATUS:</strong> ${(movement.status || 'FINALIZADO').toUpperCase()}</div>
          <div><strong>Data:</strong> ${formatTimestamp(movement.createdAt)}</div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">1. Dados do Policial (Cautelante)</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Nome Completo:</span> <span class="val">${movement.requesterName}</span></div>
            <div class="field"><span class="label">MASP:</span> <span class="val">${movement.requesterMasp}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">2. Especificação do Armamento e Munição</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Tipo / Modelo:</span> <span class="val">${movement.weaponType} ${movement.weaponModel}</span></div>
            <div class="field"><span class="label">Nº de Série:</span> <span class="val">${movement.weaponSerialNumber}</span></div>
            <div class="field"><span class="label">Calibre:</span> <span class="val">${movement.caliber}</span></div>
            <div class="field"><span class="label">Munição Cautelada:</span> <span class="val">${movement.ammunitionCount} un</span></div>
            <div class="field"><span class="label">Carregadores:</span> <span class="val">${movement.magazineCount} un</span></div>
            <div class="field"><span class="label">Cofre Retirada:</span> <span class="val">${withdrawalVault?.code || 'Cofre Principal'}</span></div>
          </div>
        </div>

        <div class="box" style="margin-bottom: 14px;">
          <div class="box-title">3. Auditoria e Armeiros Responsáveis</div>
          <div class="grid" style="margin-bottom: 0;">
            <div class="field"><span class="label">Armeiro Aprovador:</span> <span class="val">${movement.approvedByUserName || 'Pendente'}</span></div>
            <div class="field"><span class="label">Confirmado Por (Devolução):</span> <span class="val">${movement.returnConfirmedByUserName || 'Não Devolvido'}</span></div>
          </div>
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${movement.requesterName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Policial Cautelante (MASP: ${movement.requesterMasp})</span>
          </div>
          <div class="sig-line">
            ${movement.returnConfirmedByUserName || movement.approvedByUserName || 'Armeiro Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro da Unidade</span>
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
