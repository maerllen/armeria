import React, { useState, useEffect } from 'react';
import { Certificado } from '../types';
import { storage } from '../services/storage';
import { printPdfFromBase64 } from '../utils/certificateStamper';
import {
  ShieldCheck,
  CheckCircle2,
  Printer,
  Download,
  Search,
  FileCheck,
  Calendar,
  User,
  Hash,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Shield,
  Loader2,
  Copy,
  Check
} from 'lucide-react';

interface PublicCertificateValidatorProps {
  initialCode?: string;
  onBackToApp?: () => void;
}

export const PublicCertificateValidator: React.FC<PublicCertificateValidatorProps> = ({
  initialCode = '',
  onBackToApp
}) => {
  const [searchCode, setSearchCode] = useState(initialCode);
  const [isLoading, setIsLoading] = useState(false);
  const [certificate, setCertificate] = useState<Certificado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [pdfZoom, setPdfZoom] = useState<number>(100);

  const fetchCertificate = async (codeToSearch: string) => {
    const cleanCode = codeToSearch.trim();
    if (!cleanCode) {
      setError('Por favor, informe o código de autenticação do certificado.');
      setCertificate(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await storage.verificarCertificado(cleanCode);
      if (res.success && res.certificate) {
        setCertificate(res.certificate);
        setError(null);
      } else {
        setCertificate(null);
        setError(res.error || 'Certificado não encontrado. Verifique se o código foi digitado corretamente.');
      }
    } catch (err: any) {
      setCertificate(null);
      setError(err.message || 'Erro de comunicação ao validar certificado.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      fetchCertificate(initialCode);
    }
  }, [initialCode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCertificate(searchCode);
  };

  const handlePrint = () => {
    if (!certificate) return;
    const pdfData = certificate.pdfStampedBase64 || certificate.pdfBase64;
    printPdfFromBase64(pdfData, `Certificado - ${certificate.nomeAluno}`);
  };

  const handleDownload = () => {
    if (!certificate) return;
    const pdfData = certificate.pdfStampedBase64 || certificate.pdfBase64;
    const cleanBase64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${cleanBase64}`;
    link.download = certificate.nomeArquivo || `Certificado_${certificate.codigoAutenticacao}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = () => {
    if (!certificate) return;
    const url = `${window.location.origin}${window.location.pathname}?validar=${encodeURIComponent(certificate.codigoAutenticacao)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const getPdfSrc = () => {
    if (!certificate) return '';
    const raw = certificate.pdfStampedBase64 || certificate.pdfBase64;
    if (!raw) return '';
    if (raw.startsWith('data:application/pdf;base64,')) return raw;
    return `data:application/pdf;base64,${raw}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Institutional Header */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl text-emerald-400">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-wide">
                  PORTAL OFICIAL DE VALIDAÇÃO DE CERTIFICADOS
                </h1>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase">
                  Autenticidade Digital
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Academia de Polícia Civil • ACADEPOL • Sistema de Armaria e Ensino
              </p>
            </div>
          </div>

          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center space-x-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar ao Sistema</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Search / Validation Bar */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
          <form onSubmit={handleSearchSubmit} className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Consultar Autenticidade por Código de Verificação
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  placeholder="Ex: ACAD-2026-X9Y2-K8M1 ou cole o código presente no QR Code"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono tracking-wider"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Verificar Autenticidade</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Digite o código alfanumérico impresso no certificado ou escaneado pelo QR Code para atestar a veracidade do registro.
            </p>
          </form>
        </section>

        {/* Error Notification */}
        {error && (
          <div className="p-4 bg-rose-950/50 border border-rose-500/40 rounded-2xl text-rose-200 text-xs flex items-start space-x-3 animate-in fade-in duration-200">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-300">Certificado Não Encontrado ou Inválido</p>
              <p className="text-slate-300 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Successful Validation Section */}
        {certificate && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Primary Validation Banner */}
            <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/80 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400 animate-pulse" />
                </div>

                <div className="flex-1 space-y-2">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 bg-emerald-500/20 border border-emerald-400/40 rounded-full text-emerald-300 text-xs font-bold tracking-wider uppercase">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Registro Oficial Confirmado</span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    CERTIFICADO ORIGINAL E VALIDADO
                  </h2>

                  <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
                    Este documento foi autenticado com sucesso e corresponde integralmente ao registro emitido pela <strong>Academia de Polícia Civil (ACADEPOL)</strong>. Todos os dados e o arquivo digital abaixo são autênticos e conferem com o código do QR Code.
                  </p>
                </div>
              </div>

              {/* Certificate Metadata Grid */}
              <div className="mt-6 pt-6 border-t border-emerald-500/30 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Título / Curso:</span>
                  </span>
                  <p className="text-sm font-bold text-slate-100 mt-1 truncate" title={certificate.titulo}>
                    {certificate.titulo}
                  </p>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Nome do Aluno:</span>
                  </span>
                  <p className="text-sm font-bold text-slate-100 mt-1 truncate" title={certificate.nomeAluno}>
                    {certificate.nomeAluno}
                  </p>
                  {certificate.cpfMasp && (
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                      Doc: {certificate.cpfMasp}
                    </span>
                  )}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                    <Hash className="w-3.5 h-3.5 text-amber-400" />
                    <span>Código de Autenticação:</span>
                  </span>
                  <p className="text-sm font-bold text-amber-300 font-mono mt-1 tracking-wider">
                    {certificate.codigoAutenticacao}
                  </p>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>Data de Emissão:</span>
                  </span>
                  <p className="text-sm font-bold text-slate-100 mt-1">
                    {certificate.dataEmissao 
                      ? new Date(certificate.dataEmissao).toLocaleDateString('pt-BR') 
                      : (certificate.createdAt ? new Date(certificate.createdAt).toLocaleDateString('pt-BR') : 'Data não informada')}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Arquivo Oficial: <strong>{certificate.nomeArquivo}</strong></span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Certificado</span>
                </button>

                <button
                  onClick={handleDownload}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-2"
                >
                  <Download className="w-4 h-4 text-indigo-400" />
                  <span>Baixar PDF</span>
                </button>

                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-2"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>
              </div>
            </div>

            {/* Exactly the Certificate Rendered */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    Visualização Exata do Certificado Validado
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Documento Autenticado
                </span>
              </div>

              {/* Embedded PDF Viewer Container */}
              <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[550px] sm:min-h-[750px]">
                {getPdfSrc() ? (
                  <iframe
                    src={`${getPdfSrc()}#toolbar=1&navpanes=0&view=FitH`}
                    title={`Certificado - ${certificate.titulo}`}
                    className="w-full h-[600px] sm:h-[800px] border-0 rounded-2xl bg-white"
                  />
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p>O arquivo PDF não pôde ser carregado na pré-visualização.</p>
                  </div>
                )}
              </div>

              {/* Bottom Quick Print Button */}
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handlePrint}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-bold shadow-xl shadow-emerald-600/30 transition flex items-center space-x-2.5"
                >
                  <Printer className="w-5 h-5" />
                  <span>Imprimir Certificado Validado</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State / Initial Instructions */}
        {!certificate && !error && !isLoading && (
          <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">
              Validação Instantânea de Certificados ACADEPOL
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Utilize a câmera do seu celular para escanear o QR Code impresso no certificado, ou digite o código alfanumérico no campo acima para verificar a autenticidade, visualizar e imprimir o documento original registrado.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900/60 border-t border-slate-800/80 py-4 px-4 text-center text-[11px] text-slate-500">
        Polícia Civil do Estado de Minas Gerais • Academia de Polícia Civil (ACADEPOL) • Sistema Integrado de Armaria e Gestão de Ensino
      </footer>
    </div>
  );
};
