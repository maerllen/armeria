import React from 'react';
import { WeaponTransfer } from '../types';
import { formatTimestamp } from '../utils/masks';
import { ShieldCheck, Printer, X, FileText, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface TransferReceiptModalProps {
  transfer: WeaponTransfer;
  onClose: () => void;
}

export const TransferReceiptModal: React.FC<TransferReceiptModalProps> = ({
  transfer,
  onClose
}) => {
  const handlePrint = () => {
    const weaponsRowsHtml = transfer.weapons.map((w, index) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px; text-align: center; font-weight: bold;">${index + 1}</td>
        <td style="padding: 8px; font-weight: bold; font-family: monospace;">${w.serialNumber}</td>
        <td style="padding: 8px;">${w.type} - ${w.model}</td>
        <td style="padding: 8px;">${w.manufacturer}</td>
        <td style="padding: 8px;">${w.caliber}</td>
        <td style="padding: 8px; text-align: center;">${w.magazineQuantity}</td>
        <td style="padding: 8px; text-align: center;">${w.originVaultCode || '-'}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Transferência - ${transfer.protocolNumber || transfer.id} - PCMG</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #111827;
            background: #fff;
            margin: 0;
            padding: 16px;
            font-size: 11px;
            line-height: 1.4;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .title {
            font-size: 15px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #000;
          }
          .subtitle {
            font-size: 11px;
            font-weight: 700;
            color: #374151;
            margin-top: 2px;
          }
          .reg-id {
            font-family: monospace;
            font-size: 11px;
            font-weight: bold;
            text-align: right;
          }
          .status-bar {
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            font-family: monospace;
            font-size: 11px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
          }
          .box {
            border: 1px solid #9ca3af;
            border-radius: 6px;
            padding: 10px;
            font-family: monospace;
            margin-bottom: 12px;
          }
          .box-title {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            margin-bottom: 6px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 4px;
            color: #111827;
            letter-spacing: 0.5px;
          }
          .field {
            margin-bottom: 4px;
          }
          .label {
            font-size: 8.5px;
            font-weight: bold;
            color: #4b5563;
            text-transform: uppercase;
            display: block;
          }
          .val {
            font-size: 11px;
            font-weight: bold;
            color: #000;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-family: monospace;
            font-size: 10.5px;
            margin-top: 6px;
          }
          th {
            background-color: #f3f4f6;
            border-bottom: 1.5px solid #000;
            padding: 6px 8px;
            text-align: left;
            font-size: 9.5px;
            text-transform: uppercase;
          }
          .signatures {
            margin-top: 35px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            text-align: center;
            font-family: monospace;
            font-size: 10.5px;
          }
          .sig-line {
            border-top: 1px solid #000;
            padding-top: 6px;
            font-weight: bold;
          }
          .footer {
            margin-top: 25px;
            text-align: center;
            font-size: 8.5px;
            color: #6b7280;
            font-family: monospace;
            border-top: 1px solid #e5e7eb;
            padding-top: 8px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">SISTEMA DE ARMERIA • GUIA DE TRANSFERÊNCIA DE ARMAMENTO ENTRE UNIDADES</div>
          </div>
          <div class="reg-id">
            PROTOCOLO / REGISTRO<br>
            <span style="font-size: 14px; font-weight: 900; color: #1e3a8a;">${transfer.protocolNumber || transfer.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>SITUAÇÃO:</strong> TRANSFERÊNCIA CONCLUÍDA</div>
          <div><strong>DATA / HORA:</strong> ${formatTimestamp(transfer.transferDate || transfer.createdAt)}</div>
        </div>

        <div class="grid">
          <div class="box" style="margin-bottom: 0;">
            <div class="box-title">1. Unidade de Origem (Remetente)</div>
            <div class="field"><span class="label">Departamento:</span> <span class="val">${transfer.originDepartmentName || 'Não especificado'}</span></div>
            <div class="field"><span class="label">Unidade / Delegacia:</span> <span class="val">${transfer.originUnitName || 'Não especificado'}</span></div>
            <div class="field"><span class="label">Responsável pelo Envio:</span> <span class="val">${transfer.transferredByUserName} (MASP: ${transfer.transferredByUserMasp}) - ${transfer.transferredByUserRole}</span></div>
          </div>

          <div class="box" style="margin-bottom: 0;">
            <div class="box-title">2. Unidade de Destino (Recebedora)</div>
            <div class="field"><span class="label">Departamento:</span> <span class="val">${transfer.destinationDepartmentName || 'Não especificado'}</span></div>
            <div class="field"><span class="label">Unidade / Delegacia:</span> <span class="val">${transfer.destinationUnitName}</span></div>
            <div class="field"><span class="label">Local no Cofre Destino:</span> <span class="val">${transfer.destinationVaultSpaceCode || 'Cofre Principal'}</span></div>
          </div>
        </div>

        <div class="box">
          <div class="box-title">3. Policial Transportador / Recebedor & Justificativa</div>
          <div class="grid" style="margin-bottom: 4px;">
            <div class="field"><span class="label">Nome do Policial Responsável:</span> <span class="val">${transfer.receiverOrTransporterName}</span></div>
            <div class="field"><span class="label">MASP / Cargo:</span> <span class="val">${transfer.receiverOrTransporterMasp} ${transfer.receiverOrTransporterCargo ? ' - ' + transfer.receiverOrTransporterCargo : ''}</span></div>
          </div>
          <div class="field"><span class="label">Motivo / Justificativa da Transferência:</span> <span class="val" style="font-weight: normal; color: #1f2937;">${transfer.reason}</span></div>
          ${transfer.observation ? `<div class="field" style="margin-top: 4px;"><span class="label">Observações Adicionais:</span> <span class="val" style="font-weight: normal; color: #1f2937;">${transfer.observation}</span></div>` : ''}
        </div>

        <div class="box">
          <div class="box-title">4. Relação de Armamentos Transferidos (${transfer.totalWeapons} arma(s) | ${transfer.totalMagazines} carregador(es))</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 30px;">Item</th>
                <th>Nº de Série</th>
                <th>Tipo / Modelo</th>
                <th>Fabricante</th>
                <th>Calibre</th>
                <th style="text-align: center;">Carregadores</th>
                <th style="text-align: center;">Cofre Origem</th>
              </tr>
            </thead>
            <tbody>
              ${weaponsRowsHtml}
            </tbody>
          </table>
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${transfer.transferredByUserName}<br>
            <span style="font-weight: normal; font-size: 8.5px; color: #4b5563;">Armeiro / Responsável pelo Envio (MASP: ${transfer.transferredByUserMasp})</span>
          </div>
          <div class="sig-line">
            ${transfer.receiverOrTransporterName}<br>
            <span style="font-weight: normal; font-size: 8.5px; color: #4b5563;">Policial Transportador / Recebedor (MASP: ${transfer.receiverOrTransporterMasp})</span>
          </div>
        </div>

        <div class="footer">
          Documento oficial gerado eletronicamente pelo Sistema de Armeria da Polícia Civil do Estado de Minas Gerais.<br>
          Validação de autenticidade no sistema via protocolo nº <strong>${transfer.protocolNumber || transfer.id}</strong> em ${new Date().toLocaleString('pt-BR')}.
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  return (
    <div id="transfer-receipt-modal" className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl my-8 overflow-hidden">
        
        {/* Modal Top Actions */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400">
            <FileText className="w-5 h-5" />
            <span className="font-semibold text-white">Guia de Transferência de Armas entre Unidades</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="print-transfer-receipt-btn"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Gerar PDF</span>
            </button>
            <button
              id="close-transfer-receipt-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable View */}
        <div className="p-6 md:p-8 max-h-[80vh] overflow-y-auto bg-slate-950/40 text-slate-200 space-y-6">
          
          {/* Header Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-white tracking-wide text-base">POLÍCIA CIVIL DE MINAS GERAIS</h3>
                  <p className="text-xs text-slate-400 font-mono">TERMO OFICIAL DE TRANSFERÊNCIA DE CARGA BÉLICA</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Protocolo</div>
                <div className="text-sm font-mono font-bold text-amber-400">{transfer.protocolNumber || transfer.id}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{formatTimestamp(transfer.transferDate || transfer.createdAt)}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> Transferência Concluída e Registrada
              </span>
              <span className="text-slate-300 font-mono">
                {transfer.totalWeapons} arma(s) • {transfer.totalMagazines} carregador(es)
              </span>
            </div>
          </div>

          {/* Origin and Destination Pathway */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <Building2 className="w-4 h-4" /> Unidade de Origem (Remetente)
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400">Departamento:</span>
                  <p className="font-semibold text-white">{transfer.originDepartmentName || 'Geral'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Unidade:</span>
                  <p className="font-semibold text-white">{transfer.originUnitName || 'Não especificada'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Armeiro / Responsável:</span>
                  <p className="font-semibold text-white">{transfer.transferredByUserName} (MASP: {transfer.transferredByUserMasp})</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <ArrowRight className="w-4 h-4" /> Unidade de Destino (Recebedora)
              </div>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400">Departamento:</span>
                  <p className="font-semibold text-white">{transfer.destinationDepartmentName || 'Geral'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Unidade:</span>
                  <p className="font-semibold text-white">{transfer.destinationUnitName}</p>
                </div>
                <div>
                  <span className="text-slate-400">Local de Guarda no Cofre:</span>
                  <p className="font-semibold text-white">{transfer.destinationVaultSpaceCode || 'Cofre Principal'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Transporter and Motive */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Policial Transportador & Justificativa
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Policial Transportador / Recebedor:</span>
                <p className="font-semibold text-white">{transfer.receiverOrTransporterName}</p>
              </div>
              <div>
                <span className="text-slate-400">MASP / Cargo:</span>
                <p className="font-semibold text-white">{transfer.receiverOrTransporterMasp} {transfer.receiverOrTransporterCargo ? `• ${transfer.receiverOrTransporterCargo}` : ''}</p>
              </div>
            </div>
            <div className="text-xs pt-1 border-t border-slate-800/50">
              <span className="text-slate-400">Motivo / Finalidade:</span>
              <p className="text-slate-200 mt-0.5">{transfer.reason}</p>
            </div>
            {transfer.observation && (
              <div className="text-xs pt-1 border-t border-slate-800/50">
                <span className="text-slate-400">Observações:</span>
                <p className="text-slate-300 mt-0.5">{transfer.observation}</p>
              </div>
            )}
          </div>

          {/* Weapons Table */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
              <span>Armamentos Transferidos ({transfer.weapons.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-2">#</th>
                    <th className="py-2 px-2">Nº Série</th>
                    <th className="py-2 px-2">Tipo / Modelo</th>
                    <th className="py-2 px-2">Fabricante</th>
                    <th className="py-2 px-2">Calibre</th>
                    <th className="py-2 px-2 text-center">Carregadores</th>
                    <th className="py-2 px-2 text-center">Cofre Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 font-mono text-slate-300">
                  {transfer.weapons.map((w, idx) => (
                    <tr key={w.weaponId || idx} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-2 text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-2 font-bold text-amber-400">{w.serialNumber}</td>
                      <td className="py-2.5 px-2 text-white font-sans">{w.type} {w.model}</td>
                      <td className="py-2.5 px-2 text-slate-300 font-sans">{w.manufacturer}</td>
                      <td className="py-2.5 px-2">{w.caliber}</td>
                      <td className="py-2.5 px-2 text-center">{w.magazineQuantity}</td>
                      <td className="py-2.5 px-2 text-center">{w.originVaultCode || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures Preview */}
          <div className="pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-t border-slate-700 pt-2 font-medium text-slate-300">
                {transfer.transferredByUserName}
              </div>
              <p className="text-[11px] text-slate-500">Armeiro / Responsável Envio (MASP: {transfer.transferredByUserMasp})</p>
            </div>
            <div className="space-y-1">
              <div className="border-t border-slate-700 pt-2 font-medium text-slate-300">
                {transfer.receiverOrTransporterName}
              </div>
              <p className="text-[11px] text-slate-500">Policial Transportador / Recebedor (MASP: {transfer.receiverOrTransporterMasp})</p>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-amber-600/20"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Recibo em PDF</span>
          </button>
        </div>

      </div>
    </div>
  );
};
