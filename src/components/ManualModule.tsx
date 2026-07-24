import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  CheckCircle2, 
  Lock, 
  KeyRound, 
  ShieldCheck, 
  Crosshair, 
  Disc, 
  Building2, 
  Users, 
  ArrowRightLeft, 
  AlertTriangle,
  Info,
  BookOpen,
  Award
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import bannerImg from '../assets/images/manual_banner_1784916894069.jpg';
import flowImg from '../assets/images/manual_flow_1784916908441.jpg';
import securityImg from '../assets/images/manual_security_1784916924264.jpg';

export const ManualModule: React.FC = () => {
  const manualRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'acesso' | 'cautela' | 'municoes' | 'gestao'>('all');

  const handleDownloadPDF = async () => {
    if (!manualRef.current) return;
    try {
      setIsGeneratingPdf(true);
      const element = manualRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#090d16'
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Manual_Operacional_Armeria_PC.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF do manual:', error);
      alert('Ocorreu um erro ao gerar o arquivo PDF. Você também pode utilizar a opção de Impressão.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Action Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass p-5 rounded-2xl border border-slate-800 print:hidden">
        <div>
          <h2 className="text-xl font-black text-slate-100 font-mono tracking-tight flex items-center space-x-2">
            <BookOpen className="w-6 h-6 text-amber-400" />
            <span>MANUAL OPERACIONAL DO SISTEMA</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Documentação técnica e guia ilustrado de procedimentos para a Armeria da Polícia Civil.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrint}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-sm"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Imprimir</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center space-x-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-950" />
            <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Baixar Manual em PDF'}</span>
          </button>
        </div>
      </div>

      {/* Filter Navigation for On-Screen Reading */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 print:hidden">
        {[
          { id: 'all', label: 'Manual Completo' },
          { id: 'acesso', label: '1. Acesso & Segurança' },
          { id: 'cautela', label: '2. Cautela & Devolução' },
          { id: 'municoes', label: '3. Gestão de Munições' },
          { id: 'gestao', label: '4. Perfis & Locais' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Printable Manual Container */}
      <div
        ref={manualRef}
        id="printable-manual"
        className="bg-slate-950 text-slate-200 p-8 md:p-12 rounded-2xl border border-slate-800 space-y-12 shadow-2xl print:bg-white print:text-black print:border-none print:p-0"
      >
        {/* Cover / Header Banner */}
        <div className="border-b border-slate-800 print:border-gray-300 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black font-mono tracking-wider text-slate-100 print:text-black">
                  POLÍCIA CIVIL • SISTEMA DE ARMERIA
                </h1>
                <p className="text-xs text-amber-400 font-semibold font-mono tracking-wide">
                  MANUAL DE INSTRUÇÃO E NORMAS DE PROCEDIMENTO
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-bold px-3 py-1 rounded-full uppercase">
                Versão 2.0 • Oficial
              </span>
              <p className="text-[10px] text-slate-500 mt-1 print:text-gray-600">Documento de Controle Interno</p>
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-slate-800 my-6 shadow-md">
            <img
              src={bannerImg}
              alt="Armeria PC Dashboard"
              className="w-full h-64 object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent flex items-end p-6">
              <p className="text-sm font-medium text-slate-200 max-w-2xl drop-shadow">
                Guia ilustrado de utilização do sistema integrado de controle de carga, cautela de armas, estoque de munições e gestão de cofres.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Acesso e Troca Obrigatória de Senha */}
        {(activeTab === 'all' || activeTab === 'acesso') && (
          <section className="space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
              <KeyRound className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-100 font-mono">
                1. Autenticação, Primeiro Acesso e Troca Obrigatória de Senha
              </h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              O acesso ao sistema de Armeria é estritamente pessoal e intransferível, realizado através do número de <strong>MASP</strong> e senha cadastrada. Por motivos de segurança cibernética e auditoria, o sistema impõe regras rígidas de acesso inicial:
            </p>

            <div className="grid md:grid-cols-2 gap-6 my-4">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                  <Lock className="w-4 h-4" />
                  <span>Primeiro Acesso (MASP = Senha)</span>
                </div>
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                  <li>No momento do cadastro de um novo policial, a senha inicial atribuída é automaticamente o próprio <strong>número do MASP</strong>.</li>
                  <li>Quando o usuário efetuar login utilizando a senha igual ao MASP, o sistema bloqueará a navegação comum e direcionará <strong>obrigatoriamente</strong> para a tela de Redefinição de Senha.</li>
                  <li>O policial não conseguirá prosseguir no sistema sem antes criar uma nova senha personalizada.</li>
                </ul>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Requisitos de Senha e Redefinição</span>
                </div>
                <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
                  <li>A nova senha deve possuir no <strong>mínimo 6 dígitos</strong>.</li>
                  <li>A nova senha <strong>não pode ser igual ao número do MASP</strong>.</li>
                  <li>Perfis autorizados (<strong>Geral, Administrador ou Armeiro</strong>) possuem o recurso de resetar a senha de um policial para o MASP padrão através do modulo de edição de dados.</li>
                </ul>
              </div>
            </div>

            <div className="bg-amber-950/20 border border-amber-800/50 p-4 rounded-xl flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  Regra de Inalterabilidade do MASP
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  O número de <strong>MASP</strong> representa a chave primária de identificação do policial na instituição. Uma vez cadastrado no sistema, o MASP <strong>não pode ser editado por nenhum perfil de usuário</strong>, garantindo a integridade dos registros históricos e auditoria de movimentações.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Section 2: Cautela e Devolução de Armamento */}
        {(activeTab === 'all' || activeTab === 'cautela') && (
          <section className="space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
              <Crosshair className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-100 font-mono">
                2. Fluxo de Cautela e Devolução de Armas
              </h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              O processo de cautela (retirada) e devolução de armas e munições é totalmente rastreável e requer a aprovação do Armeiro responsável da unidade/departamento.
            </p>

            <div className="my-4 rounded-2xl overflow-hidden border border-slate-800 shadow-lg">
              <img
                src={flowImg}
                alt="Fluxo de Cautela e Devolução"
                className="w-full h-64 object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                <span className="text-xs font-black text-amber-400 font-mono">PASSO 1</span>
                <h4 className="text-sm font-bold text-slate-200">Solicitação de Cautela</h4>
                <p className="text-xs text-slate-400">
                  O policial solicita a retirada de uma arma no sistema. O sistema verifica automaticamente se o policial possui <strong>curso do calibre correspondente válido (concluído há menos de 2 anos)</strong>.
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                <span className="text-xs font-black text-amber-400 font-mono">PASSO 2</span>
                <h4 className="text-sm font-bold text-slate-200">Validação pelo Armeiro</h4>
                <p className="text-xs text-slate-400">
                  O Armeiro acessa o módulo de Movimentações, confere os dados da arma (número de série, localização no cofre) e aprova ou rejeita a cautela.
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                <span className="text-xs font-black text-amber-400 font-mono">PASSO 3</span>
                <h4 className="text-sm font-bold text-slate-200">Devolução com Conferência</h4>
                <p className="text-xs text-slate-400">
                  Ao devolver o armamento, o Armeiro confere a quantidade de carregadores e estado da arma. Em caso de divergência ou danos, é obrigatório preencher justificativa formal.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Section 3: Gestão de Munições */}
        {(activeTab === 'all' || activeTab === 'municoes') && (
          <section className="space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
              <Disc className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-100 font-mono">
                3. Gestão de Munições e Estoques
              </h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              O módulo de munições permite o gerenciamento por calibres cadastrados e locais físicos no cofre:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3">
                <h4 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                  <Disc className="w-4 h-4 text-amber-400" />
                  <span>Cadastramento de Lotes de Munição</span>
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cada lote de munição é vinculado a um calibre (ex: .9mm, .40 S&W, 5.56mm), com informações sobre tipo (Treinamento ou Operacional), marca, quantidade em unidades e o local exato no cofre (gaveta/armário).
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3">
                <h4 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span>Entradas, Saídas e Cautela de Munição</span>
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Registros de reposição de estoque aumentam o saldo do lote, enquanto saídas para instrução de tiro ou cautela individual debitam do saldo com registro nominal do responsável.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Section 4: Perfis de Usuário, Cursos e Locais do Cofre */}
        {(activeTab === 'all' || activeTab === 'gestao') && (
          <section className="space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-800/80 pb-3">
              <Users className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-slate-100 font-mono">
                4. Perfis de Usuário, Abrangência e Gestão de Cofres
              </h2>
            </div>

            <div className="my-4 rounded-2xl overflow-hidden border border-slate-800 shadow-lg">
              <img
                src={securityImg}
                alt="Hierarquia de Segurança e Perfis"
                className="w-full h-64 object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-amber-400 font-mono">Níveis de Permissão (Roles):</h3>
              <div className="grid md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                  <span className="font-bold text-amber-400">Perfil GERAL:</span>
                  <p className="text-slate-300 mt-1">
                    Acesso irrestrito a todos os departamentos, unidades, edição de usuários, exclusões de segurança e auditoria global.
                  </p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                  <span className="font-bold text-amber-400">Perfil ADMINISTRADOR:</span>
                  <p className="text-slate-300 mt-1">
                    Gestão de usuários, armas e munições dentro do seu departamento/unidade vinculado. Pode resetar senhas de policiais.
                  </p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                  <span className="font-bold text-amber-400">Perfil ARMEIRO:</span>
                  <p className="text-slate-300 mt-1">
                    Responsável pelo recebimento, entrega, manutenção e controle físico do cofre. Pode ter abrangência por todo o departamento ou apenas sua unidade.
                  </p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
                  <span className="font-bold text-amber-400">Perfil POLICIAL:</span>
                  <p className="text-slate-300 mt-1">
                    Acesso ao seu perfil, consulta aos seus cursos cadastrados e solicitação de cautelas de armamento.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl space-y-3 mt-6">
              <h3 className="text-base font-bold text-slate-100 font-mono flex items-center space-x-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Validade dos Cursos e Habilitações</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Para que um policial possa cautelar um armamento de determinado calibre (ex: Fuzil 5.56mm ou Pistola .40), ele precisa ter um curso de habilitação cadastrado com data de conclusão válida. Pela norma de segurança, <strong>cursos concluídos há mais de 2 anos (730 dias) são considerados expirados</strong> e impedem a cautela até a realização de reciclagem.
              </p>
            </div>
          </section>
        )}

        {/* Footer info for print & PDF */}
        <div className="pt-8 border-t border-slate-800 text-center text-xs text-slate-500 print:text-gray-600 space-y-1">
          <p className="font-mono font-bold text-slate-400 print:text-black">
            SISTEMA DE ARMERIA - POLÍCIA CIVIL DO ESTADO
          </p>
          <p>Documento gerado eletronicamente para fins de instrução técnica e operacional.</p>
        </div>
      </div>
    </div>
  );
};
