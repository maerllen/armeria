import React from 'react';
import { CourseMovement, Weapon, VaultSpace } from '../types';
import { formatTimestamp, formatMasp } from '../utils/masks';
import { ShieldCheck, Printer, X, FileText, GraduationCap } from 'lucide-react';
import { printDocumentInPage } from '../utils/printHelper';

interface AcademyReceiptModalProps {
  movement: CourseMovement;
  weapons?: Weapon[];
  vaultSpaces?: VaultSpace[];
  onClose: () => void;
}

export const AcademyReceiptModal: React.FC<AcademyReceiptModalProps> = ({
  movement,
  weapons = [],
  vaultSpaces = [],
  onClose
}) => {
  const totalAmmo = movement.ammoQuantity || movement.ammoSupplied || 0;
  const ammoReturned = movement.ammoReturned || 0;
  const ammoUsed = (movement.ammoUsed !== undefined) ? movement.ammoUsed : Math.max(0, totalAmmo - ammoReturned);

  const handlePrint = () => {
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Recibo Mapa de Aula - ${movement.turmaCode || movement.className} - PCMG</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000; }
          .subtitle { font-size: 11px; font-weight: 700; color: #374151; margin-top: 2px; }
          .reg-id { font-family: monospace; font-size: 12px; font-weight: bold; text-align: right; }
          .status-bar { background: #f3f4f6; border: 1px solid #d1d5db; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; font-family: monospace; font-size: 11px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
          .full-width { grid-column: span 2; }
          .box { border: 1px solid #9ca3af; border-radius: 8px; padding: 12px; font-family: monospace; }
          .box-title { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; color: #111827; letter-spacing: 0.5px; }
          .field { margin-bottom: 6px; }
          .label { font-size: 9px; font-weight: bold; color: #4b5563; text-transform: uppercase; display: block; }
          .val { font-size: 12px; font-weight: bold; color: #000; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; margin-top: 6px; }
          .stat-item { background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px; border-radius: 6px; }
          .signatures { margin-top: 45px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-family: monospace; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; padding-top: 8px; font-weight: bold; }
          .footer { margin-top: 35px; text-align: center; font-size: 9px; color: #6b7280; font-family: monospace; border-top: 1px solid #e5e7eb; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">POLÍCIA CIVIL • ESTADO DE MINAS GERAIS</div>
            <div class="subtitle">ACADEMIA DE POLÍCIA CIVIL • MAPA DE AULA E MOVIMENTAÇÃO DE MATERIAL</div>
          </div>
          <div class="reg-id">
            REGISTRO DE AULA<br>
            <span style="font-size: 15px; font-weight: 900;">#${movement.id}</span>
          </div>
        </div>

        <div class="status-bar">
          <div><strong>STATUS DO MAPA:</strong> ${(movement.status || 'EM AULA').toUpperCase()}</div>
          <div><strong>Emissão:</strong> ${formatTimestamp(movement.issuedAt)}</div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="box-title">1. Identificação da Aula</div>
            <div class="field"><span class="label">Turma:</span> <span class="val">${movement.turmaCode || movement.className}</span></div>
            <div class="field"><span class="label">Curso / Carreira:</span> <span class="val">${movement.courseName} (${movement.career || 'N/A'})</span></div>
            <div class="field"><span class="label">Disciplina:</span> <span class="val">${movement.subject || 'MEAF'}</span></div>
            <div class="field"><span class="label">Plano de Aula:</span> <span class="val">${movement.lessonPlanName || 'Plano Padrão'} (Aula ${movement.lessonNumber || 1})</span></div>
          </div>

          <div class="box">
            <div class="box-title">2. Pessoal Responsável</div>
            <div class="field"><span class="label">Professor Responsável:</span> <span class="val">${movement.teacherName}</span></div>
            <div class="field"><span class="label">Emitido por (Armeiro):</span> <span class="val">${movement.issuedByUserName || 'Armeiro Responsável'}</span></div>
            ${movement.returnedByUserName ? `<div class="field"><span class="label">Recebido por (Devolução):</span> <span class="val">${movement.returnedByUserName}</span></div>` : ''}
          </div>

          <div class="box full-width">
            <div class="box-title">3. Armamento e Materiais Fornecidos</div>
            <div class="field"><span class="label">Caixa de Armas / Conjunto:</span> <span class="val">${movement.boxName || 'Sem Caixa Vinculada'}</span></div>
            ${movement.returnedMaterials ? `<div class="field"><span class="label">Materiais Registrados no Fechamento:</span> <span class="val">${movement.returnedMaterials}</span></div>` : ''}
          </div>

          ${totalAmmo > 0 ? `
          <div class="box full-width">
            <div class="box-title">4. Balanço de Munições</div>
            <div class="stats-grid">
              <div class="stat-item"><span class="label">Calibre</span><span class="val">${movement.ammoCaliber || 'N/A'}</span></div>
              <div class="stat-item"><span class="label">Fornecida</span><span class="val">${totalAmmo} un</span></div>
              <div class="stat-item"><span class="label">Utilizada</span><span class="val">${movement.status === 'Devolvido' || movement.status === 'Finalizada' ? ammoUsed + ' un' : '-'}</span></div>
              <div class="stat-item"><span class="label">Devolvida ao Cofre</span><span class="val">${movement.status === 'Devolvido' || movement.status === 'Finalizada' ? ammoReturned + ' un' : '-'}</span></div>
            </div>
          </div>
          ` : ''}

          ${movement.notes ? `
          <div class="box full-width">
            <div class="box-title">5. Observações</div>
            <div style="font-size: 11px;">${movement.notes}</div>
          </div>
          ` : ''}
        </div>

        <div class="signatures">
          <div class="sig-line">
            ${movement.issuedByUserName || 'Armeiro Responsável'}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Armeiro Emissor</span>
          </div>
          <div class="sig-line">
            ${movement.teacherName}<br>
            <span style="font-weight: normal; font-size: 9px; color: #4b5563;">Professor / Policial Responsável</span>
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl my-8 overflow-hidden">
        
        {/* Modal Top Actions (Hidden on print) */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
            <GraduationCap className="w-5 h-5 text-amber-400" />
            <span>Recibo / Mapa de Aula da Academia de Polícia</span>
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
                  ACADEMIA DE POLÍCIA CIVIL • MAPA DE AULA E MOVIMENTAÇÃO DE MATERIAL
                </p>
              </div>
            </div>

            <div className="text-right font-mono text-xs">
              <span className="text-slate-400 print:text-black block text-[10px]">REGISTRO DE AULA</span>
              <span className="font-bold text-amber-400 print:text-black uppercase">{movement.id}</span>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs print:bg-gray-100 print:border-gray-300">
            <div>
              <span className="text-slate-400 print:text-gray-700 block text-[10px] uppercase font-bold">Status do Registro:</span>
              <span className="font-bold text-amber-400 print:text-black uppercase">{movement.status}</span>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-300 print:text-black">
              Emissão: {formatTimestamp(movement.issuedAt)}
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            
            {/* Class & Course Details */}
            <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400 col-span-2 sm:col-span-1">
              <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider">
                1. Identificação da Aula
              </h3>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px] font-bold uppercase">CÓDIGO DA TURMA:</span>
                <span className="font-extrabold text-amber-400 print:text-black text-base font-mono">{movement.turmaCode || movement.className}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px] font-bold uppercase">PROFESSOR RESPONSÁVEL:</span>
                <span className="font-bold text-slate-100 print:text-black text-sm">{movement.teacherName}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px] font-bold uppercase">CURSO / CARREIRA:</span>
                <span className="font-semibold text-slate-200 print:text-black">{movement.courseName} ({movement.career}) • Disciplina: {movement.subject}</span>
              </div>
              {movement.lessonPlanName && (
                <div>
                  <span className="text-slate-400 print:text-gray-600 block text-[10px] font-bold uppercase">PLANO DE AULA / AULA Nº:</span>
                  <span className="font-bold text-slate-100 print:text-black">{movement.lessonPlanName} (Aula {movement.lessonNumber})</span>
                </div>
              )}
            </div>

            {/* Responsible Teacher / Officer */}
            <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400 col-span-2 sm:col-span-1">
              <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider">
                2. Responsável pela Retirada
              </h3>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">PROFESSOR / RESPONSÁVEL:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.teacherName}</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">ARMAMENRO RETIRADO POR:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.issuedByUserName}</span>
              </div>
            </div>

            {/* Ammunition Log */}
            {totalAmmo > 0 && (
              <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400 col-span-2">
                <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider">
                  3. Balanço de Munições da Aula
                </h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-slate-900 print:bg-gray-100 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 print:text-gray-600 block font-bold">CALIBRE</span>
                    <span className="font-bold text-slate-100 print:text-black text-sm">{movement.ammoCaliber || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-900 print:bg-gray-100 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 print:text-gray-600 block font-bold">FORNECIDA</span>
                    <span className="font-bold text-amber-400 print:text-black text-sm">{totalAmmo} un</span>
                  </div>
                  <div className="bg-slate-900 print:bg-gray-100 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 print:text-gray-600 block font-bold">UTILIZADA</span>
                    <span className="font-bold text-slate-100 print:text-black text-sm">{movement.status === 'Devolvido' ? ammoUsed : '-'} un</span>
                  </div>
                  <div className="bg-slate-900 print:bg-gray-100 p-2 rounded-lg">
                    <span className="text-[10px] text-slate-400 print:text-gray-600 block font-bold">DEVOLVIDA AO COFRE</span>
                    <span className="font-bold text-emerald-400 print:text-black text-sm">{movement.status === 'Devolvido' ? ammoReturned : '-'} un</span>
                  </div>
                </div>
              </div>
            )}

            {/* Weapon Box / Weapons List */}
            <div className="border border-slate-800 rounded-xl p-4 space-y-2 print:border-gray-400 col-span-2">
              <h3 className="text-xs font-bold text-amber-400 print:text-black uppercase tracking-wider">
                4. Armamento Fornecido
              </h3>
              {movement.boxName ? (
                <div className="text-slate-200 print:text-black font-semibold">
                  Caixa de Armas de Aula: <span className="text-amber-400 print:text-black">{movement.boxName}</span>
                </div>
              ) : null}
              {weapons.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {weapons.map(w => (
                    <div key={w.id} className="bg-slate-900 print:bg-gray-100 p-2 rounded text-[11px] border border-slate-800 print:border-gray-300">
                      <div className="font-bold text-slate-100 print:text-black">{w.type} {w.manufacturer || ''} {w.model}</div>
                      <div className="text-amber-400 print:text-black font-mono">Série: {w.serialNumber} • Cal: {w.caliber}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-[11px] italic">Sem armas associadas individualmente.</p>
              )}
            </div>

            {/* Observações */}
            {movement.notes && (
              <div className="border border-slate-800 rounded-xl p-4 space-y-1 print:border-gray-400 col-span-2">
                <h3 className="text-[11px] font-bold text-amber-400 print:text-black uppercase">Observações</h3>
                <p className="text-slate-200 print:text-black text-xs leading-relaxed">{movement.notes}</p>
              </div>
            )}

            {/* Devolução Info */}
            {movement.status === 'Devolvido' && (
              <div className="border border-emerald-800/60 bg-emerald-950/20 rounded-xl p-4 space-y-2 print:border-gray-400 col-span-2">
                <h3 className="text-xs font-bold text-emerald-400 print:text-black uppercase tracking-wider">
                  5. Confirmação de Retorno / Devolução
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 print:text-gray-600 block text-[10px]">DEVOLVIDO POR:</span>
                    <span className="font-bold text-slate-100 print:text-black">{movement.returnedByUserName || movement.teacherName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-gray-600 block text-[10px]">DATA DO RETORNO:</span>
                    <span className="font-bold text-slate-100 print:text-black">{movement.returnedAt ? formatTimestamp(movement.returnedAt) : '-'}</span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Signatures for print */}
          <div className="pt-12 grid grid-cols-2 gap-12 font-mono text-center text-xs print:pt-16">
            <div className="border-t border-slate-700 print:border-black pt-2">
              <span className="font-bold text-slate-200 print:text-black block">{movement.issuedByUserName}</span>
              <span className="text-slate-400 print:text-gray-600 text-[10px]">Armeiro Responsável</span>
            </div>
            <div className="border-t border-slate-700 print:border-black pt-2">
              <span className="font-bold text-slate-200 print:text-black block">{movement.teacherName}</span>
              <span className="text-slate-400 print:text-gray-600 text-[10px]">Professor / Policial Responsável</span>
            </div>
          </div>

          <div className="text-center font-mono text-[9px] text-slate-500 print:text-gray-500 pt-4 border-t border-slate-800 print:border-gray-300">
            Documento gerado eletronicamente pelo Sistema de Armeria da Polícia Civil em {new Date().toLocaleString('pt-BR')}
          </div>

        </div>

      </div>
    </div>
  );
};
