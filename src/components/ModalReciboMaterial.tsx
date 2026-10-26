import React from 'react';
import { CautelaMaterial, User, Department, Unit } from '../types';
import { Printer, X, Shield, Calendar, UserCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatMasp } from '../utils/masks';

interface MaterialReceiptModalProps {
  cautela: CautelaMaterial;
  currentUser: User | null;
  departments: Department[];
  units: Unit[];
  onClose: () => void;
}

export const MaterialReceiptModal: React.FC<MaterialReceiptModalProps> = ({
  cautela,
  currentUser,
  departments,
  units,
  onClose
}) => {
  const dept = departments.find(d => d.id === cautela.departamentoId);
  const unit = units.find(u => u.id === cautela.unidadeId);

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr?: string | Date) => {
    if (!dateStr) return 'Não informada';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString('pt-BR');
  };

  const formatDateOnly = (dateStr?: string | Date) => {
    if (!dateStr) return 'Não informada';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('pt-BR');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8 print:m-0 print:border-0 print:shadow-none print:bg-white print:text-black">
        
        {/* Modal Action Bar (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700 print:hidden">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <span className="text-base font-bold text-slate-100">
              Comprovante de Cautela de Material • Protocolo: {cautela.protocolo || cautela.id}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl flex items-center space-x-2 transition shadow-lg shadow-amber-500/20"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Termo</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700/60 transition"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Body (Optimized for Screen and Print) */}
        <div className="p-8 space-y-6 text-slate-200 print:text-black print:p-4 bg-slate-900 print:bg-white">
          
          {/* Header */}
          <div className="text-center border-b pb-4 border-slate-700 print:border-slate-300">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 bg-amber-500/20 text-amber-400 print:text-black rounded-full flex items-center justify-center border border-amber-500/30">
                <Shield className="w-7 h-7" />
              </div>
            </div>
            <h2 className="text-lg font-black tracking-wide uppercase">Polícia Civil do Estado</h2>
            <h3 className="text-sm font-bold text-slate-400 print:text-slate-700 uppercase">
              {dept?.name || 'Departamento Policial'} • {unit?.name || 'Unidade Policial'}
            </h3>
            <p className="text-xs text-slate-400 print:text-slate-600 font-mono mt-1">
              TERMO DE RESPONSABILIDADE E CAUTELA DE MATERIAL / EQUIPAMENTO
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-amber-500/10 print:bg-slate-100 border border-amber-500/30 print:border-slate-300 rounded-lg text-xs font-mono font-bold text-amber-300 print:text-black">
              PROTOCOLO: {cautela.protocolo || cautela.id}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between text-xs bg-slate-800/60 print:bg-slate-50 p-3 rounded-xl border border-slate-700/50 print:border-slate-200">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 print:text-slate-600">Status Atual:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                cautela.status === 'Em Uso'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : cautela.status === 'Consumido'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : cautela.status === 'Devolvido com Anomalia'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {cautela.status}
              </span>
            </div>
            <div>
              <span className="text-slate-400 print:text-slate-600">Data Retirada: </span>
              <span className="font-semibold text-slate-200 print:text-black font-mono">{formatDate(cautela.dataRetirada)}</span>
            </div>
          </div>

          {/* Material Details Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 print:text-black">
              1. Identificação do Material Acautelado
            </h4>
            <div className="border border-slate-700 print:border-slate-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-800 print:bg-slate-200 text-slate-300 print:text-black">
                  <tr>
                    <th className="p-2.5 font-bold">Material</th>
                    <th className="p-2.5 font-bold">Tipo / Categoria</th>
                    <th className="p-2.5 font-bold text-center">Quantidade</th>
                    <th className="p-2.5 font-bold">Previsão Devolução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-slate-200 text-slate-200 print:text-black">
                  <tr>
                    <td className="p-2.5 font-semibold text-sm">{cautela.materialNome}</td>
                    <td className="p-2.5">{cautela.tipoMaterialNome || 'Geral'}</td>
                    <td className="p-2.5 text-center font-bold text-sm font-mono">{cautela.quantidade} un</td>
                    <td className="p-2.5 font-mono">{formatDateOnly(cautela.dataPrevistaDevolucao)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Recipient Details */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 print:text-black">
              2. Dados do Destinatário ({cautela.tipoDestinatario === 'interno' ? 'Servidor Interno' : 'Usuário Externo'})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-800/40 print:bg-slate-50 p-4 rounded-xl border border-slate-700/50 print:border-slate-200">
              {cautela.tipoDestinatario === 'interno' ? (
                <>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">Nome do Servidor:</span>
                    <strong className="text-slate-100 print:text-black text-sm">{cautela.usuarioInternoNome}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">MASP / Matrícula:</span>
                    <span className="font-mono text-slate-200 print:text-black font-semibold">
                      {formatMasp(cautela.usuarioInternoMasp || '')}
                    </span>
                  </div>
                  {cautela.usuarioInternoCargo && (
                    <div>
                      <span className="text-slate-400 print:text-slate-600 block">Cargo / Função:</span>
                      <span className="text-slate-200 print:text-black">{cautela.usuarioInternoCargo}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">Nome Completo:</span>
                    <strong className="text-slate-100 print:text-black text-sm">{cautela.usuarioExternoNome}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">Documento (CPF/RG):</span>
                    <span className="font-mono text-slate-200 print:text-black font-semibold">{cautela.usuarioExternoDocumento || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">Órgão / Instituição:</span>
                    <span className="text-slate-200 print:text-black">{cautela.usuarioExternoOrgao || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block">Telefone / Contato:</span>
                    <span className="text-slate-200 print:text-black font-mono">{cautela.usuarioExternoTelefone || 'Não informado'}</span>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 pt-2 border-t border-slate-700/50 print:border-slate-200">
                <span className="text-slate-400 print:text-slate-600 block">Finalidade / Motivo da Cautela:</span>
                <p className="text-slate-200 print:text-black italic mt-0.5">{cautela.finalidade}</p>
              </div>
            </div>
          </div>

          {/* Historical Return / Anomalies if returned or consumed */}
          {(cautela.dataDevolucao || cautela.relatoUsoAnomalias || cautela.foiConsumido) && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 print:text-black">
                3. Registro de Devolução / Comunicação de Uso e Ocorrências
              </h4>
              <div className="text-xs bg-slate-800/40 print:bg-slate-50 p-4 rounded-xl border border-slate-700/50 print:border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400 print:text-slate-600">Data de Encerramento: </span>
                    <span className="font-mono font-semibold text-slate-200 print:text-black">{formatDate(cautela.dataDevolucao)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-slate-600">Recebido por: </span>
                    <span className="font-semibold text-slate-200 print:text-black">{cautela.responsavelRecebimentoNome || 'Armeiro'}</span>
                  </div>
                </div>

                {cautela.foiConsumido && (
                  <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 print:text-purple-900 font-semibold flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Material consumido / utilizado em operação. Declarada baixa permanente no estoque de armaria.</span>
                  </div>
                )}

                {cautela.relatoUsoAnomalias && (
                  <div>
                    <span className="text-slate-400 print:text-slate-600 block font-semibold">Relato de Uso / Anomalias Registradas:</span>
                    <p className="text-slate-200 print:text-black mt-1 whitespace-pre-wrap bg-slate-900/50 print:bg-white p-2.5 rounded border border-slate-700 print:border-slate-300">
                      {cautela.relatoUsoAnomalias}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="text-[11px] text-slate-400 print:text-slate-600 border-t border-slate-800 print:border-slate-300 pt-3 text-justify leading-relaxed">
            O recebedor acima identificado declara ter recebido em perfeito estado de conservação e funcionamento o(s) material(is) e equipamento(s) descritos neste documento, comprometendo-se a zelar pela sua guarda, manutenção e integridade física, respondendo disciplinar, civil e criminalmente por eventuais perdas, extravios ou avarias resultantes de negligência, imprudência ou imperícia, nos termos do regulamento policial vigente.
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs text-slate-300 print:text-black">
            <div>
              <div className="border-t border-slate-600 print:border-slate-400 pt-2 mx-4">
                <p className="font-bold">{cautela.responsavelEntregaNome || 'Armeiro Responsável'}</p>
                <p className="text-[10px] text-slate-400 print:text-slate-600">
                  {cautela.responsavelEntregaMasp ? `MASP: ${formatMasp(cautela.responsavelEntregaMasp)}` : 'Entrega / Armaria'}
                </p>
              </div>
            </div>

            <div>
              <div className="border-t border-slate-600 print:border-slate-400 pt-2 mx-4">
                <p className="font-bold">
                  {cautela.tipoDestinatario === 'interno' ? cautela.usuarioInternoNome : cautela.usuarioExternoNome}
                </p>
                <p className="text-[10px] text-slate-400 print:text-slate-600">
                  {cautela.tipoDestinatario === 'interno'
                    ? (cautela.usuarioInternoMasp ? `MASP: ${formatMasp(cautela.usuarioInternoMasp)}` : 'Servidor Recebedor')
                    : `Doc: ${cautela.usuarioExternoDocumento || 'Destinatário Externo'}`}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
