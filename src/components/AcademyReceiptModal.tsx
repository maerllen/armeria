import React from 'react';
import { CourseMovement, Weapon, VaultSpace } from '../types';
import { formatTimestamp, formatMasp } from '../utils/masks';
import { ShieldCheck, Printer, X, FileText, GraduationCap } from 'lucide-react';

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
  const handlePrint = () => {
    window.print();
  };

  const totalAmmo = movement.ammoQuantity || movement.ammoSupplied || 0;
  const ammoReturned = movement.ammoReturned || 0;
  const ammoUsed = (movement.ammoUsed !== undefined) ? movement.ammoUsed : Math.max(0, totalAmmo - ammoReturned);

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
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">TURMA / CURSO:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.className} ({movement.courseName})</span>
              </div>
              <div>
                <span className="text-slate-400 print:text-gray-600 block text-[10px]">CARREIRA / MATÉRIA:</span>
                <span className="font-bold text-slate-100 print:text-black">{movement.career} • Disciplina: {movement.subject}</span>
              </div>
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
                      <div className="font-bold text-slate-100 print:text-black">{w.type} {w.brand} {w.model}</div>
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
