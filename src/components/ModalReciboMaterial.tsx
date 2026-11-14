import React, { useMemo } from 'react';
import {
  CautelaMaterial,
  User,
  Department,
  Unit,
  getSystemLogo,
  DEFAULT_SYSTEM_LOGO
} from '../types';
import { storage } from '../services/storage';
import { Printer, X, Shield, AlertTriangle } from 'lucide-react';
import { formatMasp } from '../utils/masks';
import { printDocumentInPage, buildStandardDocumentTitle, escapeHtmlText } from '../utils/printHelper';

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
  const allUnits = storage.getAllUnits().length > 0 ? storage.getAllUnits() : units;
  const allDepts = storage.getAllDepartments().length > 0 ? storage.getAllDepartments() : departments;
  const dept = allDepts.find(d => d.id === cautela.departamentoId) || departments.find(d => d.id === cautela.departamentoId);
  const unit = allUnits.find(u => u.id === cautela.unidadeId) || units.find(u => u.id === cautela.unidadeId);

  const { matObj, tipoObj, originVaultText, destVaultText, validadeText, categoriaLabel } = useMemo(() => {
    const mats = storage.getMateriais(currentUser);
    const mat = mats.find(m => m.id === cautela.materialId);
    const tipos = storage.getTiposMateriais();
    const tipo = mat?.tipoMaterialId ? tipos.find(t => t.id === mat.tipoMaterialId) : undefined;
    const vaults = storage.getVaultSpaces(currentUser);
    const originVaultId = cautela.vaultSpaceId || mat?.vaultSpaceId;
    const originVault = originVaultId ? vaults.find(v => v.id === originVaultId) : undefined;
    const destVault = cautela.destinationVaultSpaceId
      ? vaults.find(v => v.id === cautela.destinationVaultSpaceId)
      : undefined;

    const originText = originVault
      ? `${originVault.code}${originVault.descricaoCurta ? ` — ${originVault.descricaoCurta}` : ''}`
      : (mat?.localGuarda || 'Cofre de Materiais da Unidade');

    const destText = destVault
      ? `${destVault.code}${destVault.descricaoCurta ? ` — ${destVault.descricaoCurta}` : ''}`
      : '';

    const valText = mat?.validade
      ? new Date(mat.validade).toLocaleDateString('pt-BR')
      : 'Não perecível / Indeterminada';

    const catText = tipo
      ? `${tipo.categoria || 'Geral'} (${tipo.ehConsumivel ? 'Consumível' : 'Permanente / Durável'})`
      : 'Material Operacional';

    return {
      matObj: mat,
      tipoObj: tipo,
      originVaultText: originText,
      destVaultText: destText,
      validadeText: valText,
      categoriaLabel: catText
    };
  }, [cautela, currentUser]);

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

  const handlePrint = () => {
    const rawLogo = getSystemLogo(unit, dept) || DEFAULT_SYSTEM_LOGO;
    const resolveLogo = (src: string) => {
      if (src.startsWith('data:') || src.startsWith('blob:') || /^https?:\/\//i.test(src)) return src;
      if (typeof window !== 'undefined' && window.location?.origin) {
        try {
          return new URL(src.startsWith('/') ? src : `/${src}`, window.location.origin).href;
        } catch {
          return src;
        }
      }
      return src;
    };
    const logoSrc = resolveLogo(rawLogo);
    const fallbackLogoSrc = resolveLogo(DEFAULT_SYSTEM_LOGO);

    const isFinished = Boolean(cautela.dataDevolucao);
    const isConsumo = cautela.seraDevolvida === false || Boolean(cautela.foiConsumido);

    const materialSigner =
      cautela.tipoDestinatario === 'interno'
        ? (cautela.usuarioInternoNome || cautela.responsavelEntregaNome)
        : (cautela.usuarioExternoNome || cautela.responsavelEntregaNome);
    const docTitle = buildStandardDocumentTitle(
      isFinished
        ? 'Termo de Devolução (Cautela de Materiais)'
        : isConsumo
        ? 'Recibo de Consumo (Cautela de Materiais)'
        : 'Recibo de Cautela (Cautela de Materiais)',
      cautela.protocolo || cautela.materialNome,
      materialSigner || 'Solicitante'
    );

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtmlText(docTitle)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 10px 14px; color: #1e293b; font-size: 11px; line-height: 1.35; }
          .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header img.unit-logo { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
          .header-text { flex: 1; text-align: center; padding-right: 64px; }
          .header-text h1 { font-size: 13px; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; }
          .header-text h2 { font-size: 11px; margin: 2px 0; font-weight: 700; color: #334155; text-transform: uppercase; }
          .header-text h3 { font-size: 10px; margin: 2px 0 0; font-weight: 600; color: #475569; }
          .doc-title { background: #0f172a; color: #fff; text-align: center; padding: 6px 8px; font-weight: bold; font-size: 12px; border-radius: 4px; margin-bottom: 12px; letter-spacing: 0.5px; }
          .doc-title.consumo { background: #9a3412; }
          .section { border: 1px solid #cbd5e1; border-radius: 5px; padding: 8px 12px; margin-bottom: 10px; page-break-inside: avoid; }
          .section-title { font-weight: bold; font-size: 10px; text-transform: uppercase; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
          .field { font-size: 10.5px; }
          .label { font-weight: bold; color: #475569; }
          .declaration { font-size: 10px; text-align: justify; line-height: 1.4; margin-top: 8px; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #0f172a; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; text-align: center; page-break-inside: avoid; }
          .sig-line { border-top: 1px solid #0f172a; padding-top: 5px; font-size: 10px; }
          .footer { margin-top: 18px; text-align: center; font-size: 9px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="unit-logo" src="${logoSrc}" alt="Logo da Unidade" onerror="this.onerror=null;this.src='${fallbackLogoSrc}';" />
          <div class="header-text">
            <h1>Polícia Civil do Estado de Minas Gerais</h1>
            <h2>${dept?.name || 'Departamento de Polícia Civil'}</h2>
            <h3>${unit?.name || 'Unidade Policial'} — Controle de Materiais e Paiol</h3>
          </div>
        </div>

        <div class="doc-title ${isConsumo ? 'consumo' : ''}">
          ${
            isFinished
              ? 'TERMO DE DEVOLUÇÃO / BAIXA DE MATERIAL'
              : isConsumo
              ? 'RECIBO DE ENTREGA DE MATERIAL (CONSUMO)'
              : 'TERMO DE CAUTELA E RESPONSABILIDADE DE MATERIAL'
          }
        </div>

        <div class="section">
          <div class="section-title">1. Dados Completos do Material Acautelado</div>
          <div class="grid">
            <div class="field"><span class="label">Protocolo:</span> ${cautela.protocolo || cautela.id}</div>
            <div class="field"><span class="label">Status Atual:</span> ${cautela.status}</div>
            <div class="field"><span class="label">Material:</span> ${matObj?.nome || cautela.materialNome}</div>
            <div class="field"><span class="label">Tipo:</span> ${matObj?.tipoMaterialNome || cautela.tipoMaterialNome || 'Material Operacional'}</div>
            <div class="field"><span class="label">Categoria / Natureza:</span> ${categoriaLabel}</div>
            <div class="field"><span class="label">Nº de Série / Patrimônio:</span> ${matObj?.numeroSerie || 'Não informado'}</div>
            <div class="field"><span class="label">Cofre de Origem / Local:</span> ${originVaultText}</div>
            <div class="field"><span class="label">Validade do Material:</span> ${validadeText}</div>
            <div class="field"><span class="label">Quantidade Retirada:</span> <strong>${cautela.quantidade} un.</strong></div>
            <div class="field"><span class="label">Modalidade:</span> ${cautela.seraDevolvida === false ? 'Consumo (Sem devolução obrigatória)' : 'Passivo de Devolução'}</div>
            <div class="field"><span class="label">Unidade / Depto:</span> ${unit?.name || matObj?.unidadeNome || '-'} • ${dept?.name || matObj?.departamentoNome || '-'}</div>
            <div class="field"><span class="label">Data de Retirada:</span> ${formatDate(cautela.dataRetirada)}</div>
            ${cautela.dataPrevistaDevolucao ? `<div class="field"><span class="label">Previsão Devolução:</span> ${formatDateOnly(cautela.dataPrevistaDevolucao)}</div>` : ''}
            ${cautela.dataDevolucao ? `<div class="field"><span class="label">Data de Encerramento:</span> ${formatDate(cautela.dataDevolucao)}</div>` : ''}
            ${destVaultText ? `<div class="field"><span class="label">Cofre de Retorno:</span> ${destVaultText}</div>` : ''}
            ${matObj?.observacoes ? `<div class="field" style="grid-column: span 2;"><span class="label">Especificações / Observações do Material:</span> ${matObj.observacoes}</div>` : ''}
            ${cautela.observacoes ? `<div class="field" style="grid-column: span 2;"><span class="label">Observações da Cautela:</span> ${cautela.observacoes}</div>` : ''}
          </div>
        </div>

        <div class="section">
          <div class="section-title">2. Dados do Destinatário (${cautela.tipoDestinatario === 'interno' ? 'Servidor Interno' : 'Usuário Externo'})</div>
          <div class="grid">
            ${
              cautela.tipoDestinatario === 'interno'
                ? `
                  <div class="field"><span class="label">Nome do Servidor:</span> ${cautela.usuarioInternoNome || '-'}</div>
                  <div class="field"><span class="label">MASP / Matrícula:</span> ${formatMasp(cautela.usuarioInternoMasp || '') || '-'}</div>
                  <div class="field"><span class="label">Cargo / Função:</span> ${cautela.usuarioInternoCargo || 'Policial Civil'}</div>
                `
                : `
                  <div class="field"><span class="label">Nome Completo:</span> ${cautela.usuarioExternoNome || '-'}</div>
                  <div class="field"><span class="label">Documento (CPF/RG):</span> ${cautela.usuarioExternoDocumento || '-'}</div>
                  <div class="field"><span class="label">Órgão / Instituição:</span> ${cautela.usuarioExternoOrgao || '-'}</div>
                  <div class="field"><span class="label">Telefone / Contato:</span> ${cautela.usuarioExternoTelefone || '-'}</div>
                `
            }
            <div class="field" style="grid-column: span 2;"><span class="label">Finalidade / Motivo:</span> ${cautela.finalidade}</div>
            ${cautela.relatoUsoAnomalias ? `<div class="field" style="grid-column: span 2;"><span class="label">Relato de Uso / Ocorrências:</span> ${cautela.relatoUsoAnomalias}</div>` : ''}
          </div>
        </div>

        <div class="declaration">
          O recebedor acima identificado declara ter recebido em perfeito estado de conservação e funcionamento o material <strong>${cautela.quantidade}x ${matObj?.nome || cautela.materialNome}</strong>${matObj?.numeroSerie ? ` (Pat./Série: <strong>${matObj.numeroSerie}</strong>)` : ''}, retirado do cofre <strong>${originVaultText}</strong>, comprometendo-se a zelar pela sua guarda, manutenção e integridade física nos termos do regulamento policial vigente.
        </div>

        <div class="signatures">
          <div class="sig-line">
            <strong>${cautela.responsavelEntregaNome || 'Armeiro Responsável'}</strong><br/>
            Armeiro / Entrega<br/>
            ${cautela.responsavelEntregaMasp ? `MASP: ${formatMasp(cautela.responsavelEntregaMasp)}` : 'Armaria'}
          </div>
          <div class="sig-line">
            <strong>${cautela.tipoDestinatario === 'interno' ? cautela.usuarioInternoNome : cautela.usuarioExternoNome}</strong><br/>
            ${cautela.tipoDestinatario === 'interno' ? (cautela.usuarioInternoCargo || 'Servidor Recebedor') : (cautela.usuarioExternoOrgao || 'Destinatário Externo')}<br/>
            ${cautela.tipoDestinatario === 'interno' ? `MASP: ${formatMasp(cautela.usuarioInternoMasp || '') || '-'}` : `Doc: ${cautela.usuarioExternoDocumento || '-'}`}
          </div>
        </div>

        <div class="footer">
          Documento emitido eletronicamente pelo Sistema Armaria PCMG em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printDocumentInPage(html);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Modal Action Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/80 border-b border-slate-700">
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

        {/* Document Body */}
        <div className="p-8 space-y-6 text-slate-200 bg-slate-900 max-h-[82vh] overflow-y-auto">
          
          {/* Header */}
          <div className="text-center border-b pb-4 border-slate-700">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center border border-amber-500/30">
                <Shield className="w-7 h-7" />
              </div>
            </div>
            <h2 className="text-lg font-black tracking-wide uppercase">Polícia Civil do Estado de Minas Gerais</h2>
            <h3 className="text-sm font-bold text-slate-400 uppercase">
              {dept?.name || 'Departamento Policial'} • {unit?.name || 'Unidade Policial'}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              TERMO DE RESPONSABILIDADE E CAUTELA DE MATERIAL / EQUIPAMENTO
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs font-mono font-bold text-amber-300">
              PROTOCOLO: {cautela.protocolo || cautela.id}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between text-xs bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Status Atual:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                cautela.status === 'Em Uso' || cautela.status === 'AUTORIZADA'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : cautela.status === 'Consumido' || cautela.status === 'CONSUMIDA'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : cautela.status === 'Devolvido com Anomalia'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {cautela.status}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Data Retirada: </span>
              <span className="font-semibold text-slate-200 font-mono">{formatDate(cautela.dataRetirada)}</span>
            </div>
          </div>

          {/* Material Full Details */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              1. Dados Completos do Material Acautelado
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
              <div>
                <span className="text-slate-400 block">Material:</span>
                <strong className="text-slate-100 text-sm">{matObj?.nome || cautela.materialNome}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Tipo / Categoria:</span>
                <strong className="text-slate-200">
                  {matObj?.tipoMaterialNome || cautela.tipoMaterialNome || tipoObj?.nome || 'Geral'} — {categoriaLabel}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Nº de Série / Patrimônio:</span>
                <span className="font-mono text-amber-300 font-semibold">{matObj?.numeroSerie || 'Não informado'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Cofre de Saída / Local de Guarda:</span>
                <span className="font-mono text-cyan-300 font-semibold">{originVaultText}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Quantidade Retirada:</span>
                <strong className="font-mono text-sm text-emerald-300">{cautela.quantidade} un</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Modalidade:</span>
                <span className="text-slate-200 font-semibold">
                  {cautela.seraDevolvida === false ? 'Material de Consumo' : 'Passivo de Devolução'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Validade do Material:</span>
                <span className="text-slate-200 font-mono">{validadeText}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Previsão de Devolução:</span>
                <span className="text-slate-200 font-mono">{formatDateOnly(cautela.dataPrevistaDevolucao)}</span>
              </div>
              {destVaultText && (
                <div>
                  <span className="text-slate-400 block">Cofre de Retorno:</span>
                  <span className="text-cyan-300 font-mono">{destVaultText}</span>
                </div>
              )}
              {matObj?.observacoes && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400 block">Especificações / Observações do Material:</span>
                  <p className="text-slate-200 mt-0.5">{matObj.observacoes}</p>
                </div>
              )}
              {cautela.observacoes && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-700/50">
                  <span className="text-slate-400 block">Observações da Cautela:</span>
                  <p className="text-slate-200 mt-0.5">{cautela.observacoes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Recipient Details */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              2. Dados do Destinatário ({cautela.tipoDestinatario === 'interno' ? 'Servidor Interno' : 'Usuário Externo'})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
              {cautela.tipoDestinatario === 'interno' ? (
                <>
                  <div>
                    <span className="text-slate-400 block">Nome do Servidor:</span>
                    <strong className="text-slate-100 text-sm">{cautela.usuarioInternoNome}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">MASP / Matrícula:</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      {formatMasp(cautela.usuarioInternoMasp || '')}
                    </span>
                  </div>
                  {cautela.usuarioInternoCargo && (
                    <div>
                      <span className="text-slate-400 block">Cargo / Função:</span>
                      <span className="text-slate-200">{cautela.usuarioInternoCargo}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <span className="text-slate-400 block">Nome Completo:</span>
                    <strong className="text-slate-100 text-sm">{cautela.usuarioExternoNome}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Documento (CPF/RG):</span>
                    <span className="font-mono text-slate-200 font-semibold">{cautela.usuarioExternoDocumento || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Órgão / Instituição:</span>
                    <span className="text-slate-200">{cautela.usuarioExternoOrgao || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Telefone / Contato:</span>
                    <span className="text-slate-200 font-mono">{cautela.usuarioExternoTelefone || 'Não informado'}</span>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 pt-2 border-t border-slate-700/50">
                <span className="text-slate-400 block">Finalidade / Motivo da Cautela:</span>
                <p className="text-slate-200 italic mt-0.5">{cautela.finalidade}</p>
              </div>
            </div>
          </div>

          {/* Historical Return / Anomalies if returned or consumed */}
          {(cautela.dataDevolucao || cautela.relatoUsoAnomalias || cautela.foiConsumido) && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                3. Registro de Devolução / Comunicação de Uso e Ocorrências
              </h4>
              <div className="text-xs bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400">Data de Encerramento: </span>
                    <span className="font-mono font-semibold text-slate-200">{formatDate(cautela.dataDevolucao)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Recebido por: </span>
                    <span className="font-semibold text-slate-200">{cautela.responsavelRecebimentoNome || 'Armeiro'}</span>
                  </div>
                </div>

                {cautela.foiConsumido && (
                  <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 font-semibold flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Material consumido / utilizado em operação. Declarada baixa permanente no estoque de armaria.</span>
                  </div>
                )}

                {cautela.relatoUsoAnomalias && (
                  <div>
                    <span className="text-slate-400 block font-semibold">Relato de Uso / Anomalias Registradas:</span>
                    <p className="text-slate-200 mt-1 whitespace-pre-wrap bg-slate-900/50 p-2.5 rounded border border-slate-700">
                      {cautela.relatoUsoAnomalias}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legal Disclaimer */}
          <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-3 text-justify leading-relaxed">
            O recebedor acima identificado declara ter recebido em perfeito estado de conservação e funcionamento o(s) material(is) e equipamento(s) descritos neste documento, comprometendo-se a zelar pela sua guarda, manutenção e integridade física, respondendo disciplinar, civil e criminalmente por eventuais perdas, extravios ou avarias resultantes de negligência, imprudência ou imperícia, nos termos do regulamento policial vigente.
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs text-slate-300">
            <div>
              <div className="border-t border-slate-600 pt-2 mx-4">
                <p className="font-bold">{cautela.responsavelEntregaNome || 'Armeiro Responsável'}</p>
                <p className="text-[10px] text-slate-400">
                  {cautela.responsavelEntregaMasp ? `MASP: ${formatMasp(cautela.responsavelEntregaMasp)}` : 'Entrega / Armaria'}
                </p>
              </div>
            </div>

            <div>
              <div className="border-t border-slate-600 pt-2 mx-4">
                <p className="font-bold">
                  {cautela.tipoDestinatario === 'interno' ? cautela.usuarioInternoNome : cautela.usuarioExternoNome}
                </p>
                <p className="text-[10px] text-slate-400">
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
