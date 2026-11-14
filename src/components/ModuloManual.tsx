import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  Printer,
  ShieldCheck,
  Crosshair,
  Disc,
  Package,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  Users
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  User,
  Department,
  Unit,
  Weapon,
  AmmunitionStock,
  Caliber,
  VaultSpace
} from '../types';
import {
  resolveCoeManualContext,
  ScreenPerfilNavegacaoCOE,
  ScreenCautelaArmaSolicitarCOE,
  ScreenCautelaArmaSaidaEntradaCOE,
  ScreenCautelaArmaDevolucaoCOE,
  ScreenCautelaMunicaoSolicitarCOE,
  ScreenCautelaMunicaoDevolverCOE,
  ScreenCautelaMaterialSolicitarCOE,
  ScreenCautelaMaterialDevolverCOE
} from './ManualSystemScreens';
import { buildStandardDocumentFilename, buildStandardDocumentTitle, printWithWindowTitle } from '../utils/printHelper';
import { storage } from '../services/storage';
import { showTopAlert } from './TopLayerAlert';

interface ManualModuleProps {
  currentUser?: User | null;
  departments?: Department[];
  units?: Unit[];
  users?: User[];
  weapons?: Weapon[];
  ammoStocks?: AmmunitionStock[];
  calibers?: Caliber[];
  vaultSpaces?: VaultSpace[];
}

type ManualSectionFilter =
  | 'all'
  | 'capa'
  | 'cautelar-arma'
  | 'saida-retorno'
  | 'devolver-arma'
  | 'municoes'
  | 'materiais';

const sanitizeClonedStylesForHtml2Canvas = (clonedDoc: Document) => {
  clonedDoc.documentElement.classList.remove('theme-light');
  clonedDoc.body.classList.remove('theme-light');
  const styleTags = Array.from(clonedDoc.querySelectorAll('style'));
  styleTags.forEach(tag => {
    if (tag.textContent && /oklch\(|oklab\(|color-mix\(/i.test(tag.textContent)) {
      tag.textContent = tag.textContent
        .replace(/oklch\([^)]+\)/gi, '#334155')
        .replace(/oklab\([^)]+\)/gi, '#334155')
        .replace(/color-mix\([^;{}]+\)/gi, '#334155');
    }
  });
};

export const ManualModule: React.FC<ManualModuleProps> = ({
  currentUser,
  departments = [],
  units = [],
  users = [],
  weapons = [],
  ammoStocks = [],
  calibers = [],
  vaultSpaces = []
}) => {
  const manualContainerRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState<ManualSectionFilter>('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');
  const [forceRenderAllForExport, setForceRenderAllForExport] = useState(false);

  const ctx = useMemo(
    () =>
      resolveCoeManualContext({
        currentUser: currentUser || storage.getCurrentUser(),
        departments,
        units,
        users,
        weapons,
        ammoStocks,
        calibers,
        vaultSpaces
      }),
    [currentUser, departments, units, users, weapons, ammoStocks, calibers, vaultSpaces]
  );

  const handleDownloadPDF = async () => {
    const previousFilter = activeFilter;
    try {
      setIsGeneratingPdf(true);
      setPdfProgressText('Preparando páginas...');
      if (previousFilter !== 'all') {
        setForceRenderAllForExport(true);
        await new Promise(resolve => setTimeout(resolve, 180));
      }

      const container = manualContainerRef.current;
      if (!container) {
        throw new Error('Conteúdo do manual não encontrado.');
      }

      const pageElements = Array.from(
        container.querySelectorAll('[data-manual-page]')
      ) as HTMLElement[];
      if (pageElements.length === 0) {
        throw new Error('Nenhuma página disponível para exportação.');
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth(); // 210mm
      const pageH = pdf.internal.pageSize.getHeight(); // 297mm
      const marginX = 8;
      const marginTop = 8;
      const footerH = 10;
      const maxImgW = pageW - marginX * 2;
      const maxImgH = pageH - marginTop - footerH;

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i];
        setPdfProgressText(`Renderizando pág. ${i + 1}/${pageElements.length}...`);

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: clonedDoc => {
            sanitizeClonedStylesForHtml2Canvas(clonedDoc);
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.94);
        const ratio = Math.min(maxImgW / canvas.width, maxImgH / canvas.height);
        const renderW = canvas.width * ratio;
        const renderH = canvas.height * ratio;
        const offsetX = (pageW - renderW) / 2;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', offsetX, marginTop, renderW, renderH);

        // Rodapé institucional em vetor nítido
        pdf.setDrawColor(203, 213, 225);
        pdf.line(marginX, pageH - 8.5, pageW - marginX, pageH - 8.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(
          `PCMG • Sistema de Armaria — Manual do Usuário Policial (${ctx.unitName})`,
          marginX,
          pageH - 4.5
        );
        pdf.text(
          `Página ${i + 1} de ${pageElements.length}`,
          pageW - marginX,
          pageH - 4.5,
          { align: 'right' }
        );
      }

      const loggedName = currentUser?.name || storage.getCurrentUser()?.name || ctx.policial.name;
      const filename = buildStandardDocumentFilename(
        'Manual do Usuário Policial',
        `Unidade ${ctx.unitSigla}`,
        loggedName,
        'pdf'
      );
      pdf.save(filename);
      showTopAlert(`Manual em PDF gerado com sucesso: ${filename}`, 'success');
    } catch (error) {
      console.error('Erro ao gerar PDF do Manual do Policial:', error);
      showTopAlert(
        'Não foi possível gerar o PDF automaticamente. Utilize o botão Imprimir -> Salvar como PDF.',
        'error'
      );
    } finally {
      setForceRenderAllForExport(false);
      setIsGeneratingPdf(false);
      setPdfProgressText('');
    }
  };

  const handlePrint = () => {
    const loggedName = currentUser?.name || storage.getCurrentUser()?.name || ctx.policial.name;
    const docTitle = buildStandardDocumentTitle(
      'Manual do Usuário Policial',
      `Unidade ${ctx.unitSigla}`,
      loggedName
    );
    printWithWindowTitle(docTitle);
  };

  const showPage = (section: ManualSectionFilter) =>
    forceRenderAllForExport || activeFilter === 'all' || activeFilter === section;

  const PageHeader: React.FC<{ pageNum: number; totalPages: number; sectionTitle: string }> = ({
    pageNum,
    totalPages,
    sectionTitle
  }) => (
    <div
      className="flex items-center justify-between gap-3 pb-3 mb-4"
      style={{ borderBottom: '2px solid #0f172a' }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src={ctx.logoSrc}
          alt="Brasão COE"
          className="w-9 h-9 object-contain rounded-lg shrink-0"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '2px' }}
        />
        <div className="min-w-0">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: '#b45309' }}>
            {ctx.departmentName} • UNIDADE {ctx.unitName}
          </div>
          <h3 className="text-sm sm:text-base font-black uppercase tracking-tight" style={{ color: '#0f172a' }}>
            {sectionTitle}
          </h3>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span
          className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-md inline-block"
          style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
        >
          PÁG. {String(pageNum).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
        </span>
      </div>
    </div>
  );

  const StepBox: React.FC<{ num: string; title: string; desc: React.ReactNode }> = ({
    num,
    title,
    desc
  }) => (
    <div
      className="rounded-xl p-3 space-y-1"
      style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-mono font-black px-2 py-0.5 rounded"
          style={{ backgroundColor: '#f59e0b', color: '#020617' }}
        >
          {num}
        </span>
        <span className="text-xs font-bold" style={{ color: '#0f172a' }}>
          {title}
        </span>
      </div>
      <div className="text-[11px] leading-relaxed" style={{ color: '#334155' }}>
        {desc}
      </div>
    </div>
  );

  const pageCardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: '16px',
    padding: '24px'
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Barra de Ações do Manual (oculta na impressão) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-5 rounded-2xl border border-slate-800 print:hidden">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Perfil Policial • Unidade {ctx.unitName}
            </span>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              {ctx.dataSourceLabel}
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 font-mono tracking-tight flex items-center gap-2 mt-1.5">
            <BookOpen className="w-6 h-6 text-amber-400 shrink-0" />
            <span>MANUAL DO USUÁRIO POLICIAL — {ctx.unitSigla}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Guia ilustrado com telas reais do sistema para cautela e devolução de armas, munições, materiais e controle de saída/entrada de armamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Imprimir</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-60"
          >
            <Download className="w-4 h-4 text-slate-950" />
            <span>{isGeneratingPdf ? pdfProgressText || 'Gerando PDF...' : 'Baixar Manual em PDF'}</span>
          </button>
        </div>
      </div>

      {/* Navegação por Tópicos na Tela */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden">
        {[
          { id: 'all', label: 'Manual Completo (8 Págs.)' },
          { id: 'capa', label: '1. Acesso & Dados COE' },
          { id: 'cautelar-arma', label: '2. Cautelar Arma' },
          { id: 'saida-retorno', label: '3. Saída & Entrada Arma' },
          { id: 'devolver-arma', label: '4. Devolver Arma' },
          { id: 'municoes', label: '5–6. Munições' },
          { id: 'materiais', label: '7–8. Materiais & Resumo' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFilter(tab.id as ManualSectionFilter)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
              activeFilter === tab.id
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =================================================================== */}
      {/* PÁGINAS A4 DO MANUAL (ESTILOS PUROS EM HEX SEGUROS PARA PDF/HTML2CANVAS) */}
      {/* =================================================================== */}
      <div ref={manualContainerRef} className="space-y-6">
        {/* PÁGINA 1: CAPA INSTITUCIONAL & ACESSO DO POLICIAL COE */}
        {showPage('capa') && (
          <section data-manual-page="1" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={1}
              totalPages={8}
              sectionTitle="1. Apresentação, Unidade COE e Navegação do Policial"
            />

            <div
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b' }}
                >
                  <ShieldCheck className="w-6 h-6" style={{ color: '#fbbf24' }} />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase" style={{ color: '#fbbf24' }}>
                    POLÍCIA CIVIL DE MINAS GERAIS • CONTROLE DE CARGA BÉLICA
                  </div>
                  <h4 className="text-base font-black tracking-tight" style={{ color: '#ffffff' }}>
                    MANUAL OPERACIONAL DO USUÁRIO POLICIAL
                  </h4>
                </div>
              </div>
              <div className="text-left sm:text-right text-[10px] font-mono" style={{ color: '#cbd5e1' }}>
                <div>Unidade Referência: <strong style={{ color: '#ffffff' }}>{ctx.unitName}</strong></div>
                <div>Emitido em: {new Date().toLocaleDateString('pt-BR')}</div>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Este manual orienta o policial lotado na unidade <strong>{ctx.unitName}</strong> ({ctx.departmentName}) a operar com segurança e agilidade todas as rotinas do sistema de Armaria: solicitação de cautelas e devoluções de <strong>armas</strong>, <strong>munições</strong> e <strong>materiais</strong>, além do registro de <strong>Saída</strong> e <strong>Entrada (Retorno)</strong> de armamentos acautelados com apontamento de disparos.
            </p>

            {/* Dados Reais Carregados do Banco da Unidade COE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-xl p-3 space-y-1.5" style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}>
                <div className="text-[10px] font-mono font-black uppercase flex items-center gap-1.5" style={{ color: '#0f172a' }}>
                  <Users className="w-3.5 h-3.5" style={{ color: '#b45309' }} />
                  Servidores Reais da Unidade {ctx.unitName}
                </div>
                <div style={{ color: '#334155' }}>
                  <div>• <strong>Policial Exemplo:</strong> {ctx.policial.name} (MASP {ctx.policial.masp})</div>
                  <div>• <strong>Armeiro Autorizador:</strong> {ctx.armeiro.name} (MASP {ctx.armeiro.masp})</div>
                  <div>• <strong>Em Posse (Saída Ativa):</strong> {ctx.armaComPolicial.holderName}</div>
                </div>
              </div>

              <div className="rounded-xl p-3 space-y-1.5" style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}>
                <div className="text-[10px] font-mono font-black uppercase flex items-center gap-1.5" style={{ color: '#0f172a' }}>
                  <Crosshair className="w-3.5 h-3.5" style={{ color: '#b45309' }} />
                  Acervo Real COE Usado nos Exemplos
                </div>
                <div style={{ color: '#334155' }}>
                  <div>• <strong>Armas:</strong> {ctx.armasCofre[0].manufacturer} {ctx.armasCofre[0].model} ({ctx.armasCofre[0].serial}), {ctx.armaAcautelada.model} ({ctx.armaAcautelada.serial})</div>
                  <div>• <strong>Munições:</strong> {ctx.municoes[0].caliber} {ctx.municoes[0].manufacturer} {ctx.municoes[0].tipo} {ctx.municoes[0].peso}</div>
                  <div>• <strong>Materiais:</strong> {ctx.materiais[0].name} (Série {ctx.materiais[0].serial})</div>
                </div>
              </div>
            </div>

            <ScreenPerfilNavegacaoCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 2: COMO CAUTELAR ARMA */}
        {showPage('cautelar-arma') && (
          <section data-manual-page="2" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={2}
              totalPages={8}
              sectionTitle="2. Como Cautelar Armamento (Solicitar Retirada de Arma)"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Para retirar um armamento do cofre da unidade <strong>{ctx.unitName}</strong>, acesse o menu lateral <strong>Cautela de armas</strong> e siga os quatro passos abaixo:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Abrir Nova Solicitação"
                desc={
                  <>
                    Clique no botão âmbar <strong>Solicitar Retirada de Arma</strong> (ou na aba <strong>Nova Solicitação</strong>) para listar as armas disponíveis no cofre da {ctx.unitName}.
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Selecionar Arma Real da Unidade"
                desc={
                  <>
                    Escolha o armamento desejado, como o{' '}
                    <strong>{ctx.armasCofre[0].manufacturer} {ctx.armasCofre[0].model}</strong> (Série{' '}
                    <span className="font-mono font-bold">{ctx.armasCofre[0].serial}</span> •{' '}
                    {ctx.armasCofre[0].caliber}).
                  </>
                }
              />
              <StepBox
                num="PASSO 3"
                title="Informar Finalidade e Munição"
                desc={
                  <>
                    Selecione o <strong>Motivo / Finalidade do Uso</strong> (<em>Operação</em>, <em>Plantão</em>, <em>Treinamento</em> ou <em>Serviço Ordinário</em>) e, se desejar, marque <strong>Desejo solicitar munições</strong> para indicar tipo e peso ao armeiro.
                  </>
                }
              />
              <StepBox
                num="PASSO 4"
                title="Aguardar Autorização do Armeiro"
                desc={
                  <>
                    Após enviar, a solicitação fica em <strong>Cautela de arma em análise</strong>. Assim que o armeiro (ex.: {ctx.armeiro.name}) deferir, a arma passa para <strong>Minhas Cautelas</strong>.
                  </>
                }
              />
            </div>

            <ScreenCautelaArmaSolicitarCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 3: DAR SAÍDA E DAR ENTRADA / RETORNO DA ARMA */}
        {showPage('saida-retorno') && (
          <section data-manual-page="3" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={3}
              totalPages={8}
              sectionTitle="3. Dar Saída, Dar Entrada (Retorno) e Histórico da Arma"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Nas cautelas ativas exibidas na aba <strong>Minhas Cautelas — Ativas em Posse</strong>, o sistema controla quando o armamento está fisicamente com o policial em serviço ou recolhido temporariamente na unidade, além de manter o histórico completo de movimentações:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <StepBox
                num="SAÍDA"
                title="Botão Dar Saída"
                desc={
                  <span className="flex flex-col gap-1">
                    <span>
                      Quando o status estiver <strong>Acautelada (Ativa)</strong>, clique em{' '}
                      <strong style={{ color: '#b45309' }}>Dar Saída</strong> ao sair para missão.
                    </span>
                    <span className="flex items-center gap-1 font-bold" style={{ color: '#0369a1' }}>
                      <ArrowUpRight className="w-3.5 h-3.5" /> Status muda para: Com o Policial
                    </span>
                  </span>
                }
              />
              <StepBox
                num="ENTRADA"
                title="Botão Dar Entrada (Retorno)"
                desc={
                  <span className="flex flex-col gap-1">
                    <span>
                      Com a arma em status <strong>Com o Policial</strong>, o botão passa a ser{' '}
                      <strong style={{ color: '#047857' }}>Dar Entrada</strong>. Informe a quantidade de tiros disparados no retorno.
                    </span>
                    <span className="flex items-center gap-1 font-bold" style={{ color: '#047857' }}>
                      <ArrowDownLeft className="w-3.5 h-3.5" /> Soma os tiros no total da arma
                    </span>
                  </span>
                }
              />
              <StepBox
                num="HISTÓRICO"
                title="Botão Histórico"
                desc={
                  <span className="flex flex-col gap-1">
                    <span>
                      Clique em <strong>Histórico</strong> no card da cautela para consultar todas as saídas, retornos, datas, autorizador e disparos daquela arma.
                    </span>
                    <span className="flex items-center gap-1 font-bold" style={{ color: '#0f172a' }}>
                      <History className="w-3.5 h-3.5" /> Auditoria vinculada ao ID da arma
                    </span>
                  </span>
                }
              />
            </div>

            <ScreenCautelaArmaSaidaEntradaCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 4: COMO DEVOLVER ARMA AO COFRE */}
        {showPage('devolver-arma') && (
          <section data-manual-page="4" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={4}
              totalPages={8}
              sectionTitle="4. Como Devolver Armamento ao Cofre (Encerrar Cautela)"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Para encerrar definitivamente a cautela da arma e devolvê-la ao cofre da unidade <strong>{ctx.unitName}</strong>, utilize o botão <strong>Devolver ao Cofre</strong> no card da cautela ativa em <strong>Minhas Cautelas</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Acionar Devolver ao Cofre"
                desc={
                  <>
                    Localize sua cautela ativa (ex.: <strong>{ctx.armaAcautelada.model}</strong>, Série{' '}
                    <span className="font-mono font-bold">{ctx.armaAcautelada.serial}</span>) e clique no botão{' '}
                    <strong>Devolver ao Cofre</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Conferir Arma, Carregadores e Disparos"
                desc={
                  <>
                    Informe se houve disparos ou defeito, confirme a devolução dos carregadores (ex.:{' '}
                    <strong>{ctx.armaAcautelada.magazines} unidades</strong>) e, se houver munição associada passível de devolução, informe a quantidade intacta.
                  </>
                }
              />
              <StepBox
                num="PASSO 3"
                title="Enviar Devolução (Pendente de Recibo)"
                desc={
                  <>
                    Clique em <strong>Enviar Devolução (Pendente de Recibo)</strong>. O card exibirá o selo{' '}
                    <strong>Aguardando Recibo do Armeiro</strong> até a conferência presencial no balcão da {ctx.unitName}.
                  </>
                }
              />
              <StepBox
                num="PASSO 4"
                title="Confirmação Física e Recibo"
                desc={
                  <>
                    O armeiro (ex.: {ctx.armeiro.name}) confere a arma no cofre <strong>{ctx.armaAcautelada.vaultCode}</strong> e confirma o recebimento. O <strong>Recibo de Devolução</strong> fica salvo em <strong>Meu Histórico</strong>.
                  </>
                }
              />
            </div>

            <ScreenCautelaArmaDevolucaoCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 5: COMO CAUTELAR MUNIÇÕES */}
        {showPage('municoes') && (
          <section data-manual-page="5" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={5}
              totalPages={8}
              sectionTitle="5. Como Cautelar Munições (Módulo Cautela de Munições)"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Para solicitar munições de forma avulsa (sem vínculo imediato com cautela de arma) na unidade <strong>{ctx.unitName}</strong>, acesse o menu <strong>Cautela de munições</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Acessar + Solicitar Munições"
                desc={
                  <>
                    No módulo <strong>Cautela de munições</strong>, clique no botão âmbar <strong>Solicitar Munições</strong> no topo ou na aba <strong>+ Solicitar Munições</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Escolher Modalidade de Retirada"
                desc={
                  <>
                    Selecione <strong>Munição Passiva de Devolução</strong> (uso em plantão/operação, devolvida depois ao paiol) ou <strong>Munição de Consumo</strong> (treinamento/instrução).
                  </>
                }
              />
              <StepBox
                num="PASSO 3"
                title="Selecionar Calibre, Tipo, Peso e Quantidade"
                desc={
                  <>
                    Escolha entre os lotes disponíveis na {ctx.unitName}, como{' '}
                    <strong>{ctx.municoes[0].caliber} {ctx.municoes[0].manufacturer} {ctx.municoes[0].tipo} {ctx.municoes[0].peso}</strong>{' '}
                    (Cofre {ctx.municoes[0].vaultCode}) ou <strong>{ctx.municoes[2]?.caliber || '9x19mm'}</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 4"
                title="Acompanhar Análise até Liberação"
                desc={
                  <>
                    Após enviar, acompanhe na aba <strong>Cautela de munição em análise</strong>. Com a liberação do armeiro, a cautela passa para <strong>Minhas Cautelas de Munições</strong>.
                  </>
                }
              />
            </div>

            <ScreenCautelaMunicaoSolicitarCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 6: COMO DEVOLVER MUNIÇÕES */}
        {showPage('municoes') && (
          <section data-manual-page="6" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={6}
              totalPages={8}
              sectionTitle="6. Como Devolver Munições (Avulsas ou Vinculadas a Arma)"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Munições marcadas como <strong>Passivas de Devolução</strong> permanecem listadas na aba <strong>Minhas Cautelas de Munições</strong> até o recolhimento completo ao paiol da {ctx.unitName}:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Abrir Solicitar Devolução"
                desc={
                  <>
                    Na aba <strong>Minhas Cautelas de Munições</strong>, localize a cautela ativa (ex.: <strong>100 un. • {ctx.municoes[0].caliber} {ctx.municoes[0].tipo}</strong>) e clique em <strong>Solicitar Devolução</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Se Vinculada a Arma: Escolher Modalidade"
                desc={
                  <>
                    Caso a munição tenha sido entregue junto com uma arma, o modal oferece <strong>Sem o Armamento Vinculado</strong> (devolve só a munição) ou <strong>Com o Armamento Vinculado (Em Conjunto)</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 3"
                title="Informar Munições Remanescentes Intactas"
                desc={
                  <>
                    Preencha o campo <strong>Munições Remanescentes (Devolvidas Intactas)</strong> com a quantidade exata que retorna ao cofre e registre eventuais observações.
                  </>
                }
              />
              <StepBox
                num="PASSO 4"
                title="Conferência pelo Armeiro e Histórico"
                desc={
                  <>
                    Entregue os cartuchos ao armeiro no paiol ({ctx.municoes[0].vaultCode}). Confirmado o recebimento, o registro vai para <strong>Meu Histórico Cautelas de Munições</strong>.
                  </>
                }
              />
            </div>

            <ScreenCautelaMunicaoDevolverCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 7: COMO CAUTELAR MATERIAIS */}
        {showPage('materiais') && (
          <section data-manual-page="7" style={pageCardStyle} className="space-y-4 break-after-page">
            <PageHeader
              pageNum={7}
              totalPages={8}
              sectionTitle="7. Como Cautelar Materiais (Módulo Cautela de Materiais)"
            />

            <p className="text-xs leading-relaxed" style={{ color: '#1e293b' }}>
              Para solicitar equipamentos operacionais habilitados para depósito policial na unidade <strong>{ctx.unitName}</strong> (como dispositivos <strong>TASER 10</strong>, acessórios e materiais táticos), acesse <strong>Cautela de materiais</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Clicar em Solicitar Material"
                desc={
                  <>
                    No módulo <strong>Cautela de materiais</strong>, clique em <strong>Solicitar Material</strong> (ou aba <strong>+ Solicitar Material</strong>).
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Definir Modalidade e Selecionar Item COE"
                desc={
                  <>
                    Mantenha <strong>Material Passivo de Devolução</strong> selecionado e escolha o equipamento disponível, como{' '}
                    <strong>{ctx.materiais[0].name}</strong> (Série{' '}
                    <span className="font-mono font-bold">{ctx.materiais[0].serial}</span> • Local {ctx.materiais[0].local}).
                  </>
                }
              />
              <StepBox
                num="PASSO 3"
                title="Preencher Finalidade e Acessórios"
                desc={
                  <>
                    Informe a quantidade, finalidade (ex.: <em>Serviço Policial Operacional / Plantão</em>) e confira os acessórios descritos ({ctx.materiais[0].observations}).
                  </>
                }
              />
              <StepBox
                num="PASSO 4"
                title="Acompanhar em Análise até Pagamento"
                desc={
                  <>
                    Acompanhe o pedido na aba <strong>Cautela de material em análise</strong>. Quando o armeiro confirmar o pagamento, o item aparecerá em <strong>Minhas Cautelas de Materiais</strong>.
                  </>
                }
              />
            </div>

            <ScreenCautelaMaterialSolicitarCOE ctx={ctx} />
          </section>
        )}

        {/* PÁGINA 8: COMO DEVOLVER MATERIAIS + QUADRO-RESUMO */}
        {showPage('materiais') && (
          <section data-manual-page="8" style={pageCardStyle} className="space-y-4">
            <PageHeader
              pageNum={8}
              totalPages={8}
              sectionTitle="8. Como Devolver Materiais & Quadro-Resumo Operacional"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <StepBox
                num="PASSO 1"
                title="Acessar Minhas Cautelas de Materiais"
                desc={
                  <>
                    Localize o item em uso (ex.: <strong>1x {ctx.materiais[0].name}</strong> — Série{' '}
                    <span className="font-mono font-bold">{ctx.materiais[0].serial}</span>) e clique no botão{' '}
                    <strong>Solicitar Devolução</strong>.
                  </>
                }
              />
              <StepBox
                num="PASSO 2"
                title="Informar Quantidade, Condição e Relato"
                desc={
                  <>
                    Informe a <strong>Quantidade Devolvida</strong>, selecione a <strong>Condição do Material</strong> (<em>Íntegro</em>, <em>Com Anomalia / Avaria</em> ou <em>Consumido / Extraviado</em>) e confirme os acessórios devolvidos antes de enviar ao armeiro.
                  </>
                }
              />
            </div>

            <ScreenCautelaMaterialDevolverCOE ctx={ctx} />

            {/* Quadro Resumo de Bolso */}
            <div
              className="rounded-xl p-3.5 space-y-2"
              style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}
            >
              <div className="text-[11px] font-mono font-black uppercase flex items-center gap-1.5" style={{ color: '#0f172a' }}>
                <FileText className="w-4 h-4" style={{ color: '#b45309' }} />
                Quadro-Resumo Rápido — Perfil Policial ({ctx.unitName})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div className="rounded-lg p-2" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }}>
                  <div className="font-bold flex items-center gap-1" style={{ color: '#b45309' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Cautelar
                  </div>
                  <div style={{ color: '#334155' }}>
                    Solicite em <em>Nova Solicitação</em> e aguarde aprovação do Armeiro da {ctx.unitName}.
                  </div>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }}>
                  <div className="font-bold flex items-center gap-1" style={{ color: '#0369a1' }}>
                    <ArrowUpRight className="w-3.5 h-3.5" /> Dar Saída
                  </div>
                  <div style={{ color: '#334155' }}>
                    Em <em>Minhas Cautelas</em>, clique em <strong>Dar Saída</strong> → status vira <em>Com o Policial</em>.
                  </div>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }}>
                  <div className="font-bold flex items-center gap-1" style={{ color: '#047857' }}>
                    <ArrowDownLeft className="w-3.5 h-3.5" /> Dar Entrada
                  </div>
                  <div style={{ color: '#334155' }}>
                    Clique em <strong>Dar Entrada</strong> no retorno e informe os <strong>tiros disparados</strong>.
                  </div>
                </div>
                <div className="rounded-lg p-2" style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1' }}>
                  <div className="font-bold flex items-center gap-1" style={{ color: '#0f172a' }}>
                    <RotateCcw className="w-3.5 h-3.5" /> Devolver
                  </div>
                  <div style={{ color: '#334155' }}>
                    Use <strong>Devolver ao Cofre / Solicitar Devolução</strong> e aguarde o recibo do Armeiro.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 text-[10px]" style={{ color: '#92400e' }}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Importante: Todo termo ou recibo emitido pelo sistema traz identificação oficial da carga e assinatura digital/física entre Policial e Armeiro da unidade {ctx.unitName}.
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
