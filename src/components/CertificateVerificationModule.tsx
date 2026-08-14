import React, { useState, useEffect } from 'react';
import { User, Certificado } from '../types';
import { storage } from '../services/storage';
import { stampPdfWithQrCode, printPdfFromBase64, generateQrCodeDataUrl } from '../utils/certificateStamper';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import {
  FileCheck,
  QrCode,
  Upload,
  Printer,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  User as UserIcon,
  Hash,
  Copy,
  Check,
  Trash2,
  Eye,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Shield,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';

interface CertificateVerificationModuleProps {
  currentUser: User | null;
}

export const CertificateVerificationModule: React.FC<CertificateVerificationModuleProps> = ({
  currentUser
}) => {
  // Tabs: 'emitir' | 'validar' | 'acervo'
  const [activeTab, setActiveTab] = useState<'emitir' | 'validar' | 'acervo'>('emitir');

  // Emission state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfArrayBuffer, setPdfArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string>('');
  const [certTitle, setCertTitle] = useState('');
  const [studentName, setStudentName] = useState('');
  const [cpfMasp, setCpfMasp] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [certDescription, setCertDescription] = useState('');
  const [stampPosition, setStampPosition] = useState<'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-right'>('bottom-right');
  const [stampAllPages, setStampAllPages] = useState(false);

  // Stamped result
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [stampedBase64, setStampedBase64] = useState('');
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [isSavedInDb, setIsSavedInDb] = useState(false);
  const [savedCertId, setSavedCertId] = useState<string | null>(null);

  // Validation tab state
  const [validationCodeInput, setValidationCodeInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validatedCert, setValidatedCert] = useState<Certificado | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Certificate Collection / Acervo
  const [certificatesList, setCertificatesList] = useState<Certificado[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [certToDelete, setCertToDelete] = useState<Certificado | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Success / error alerts
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshCertificates = async () => {
    try {
      await storage.refreshFromServer();
      setCertificatesList(storage.getCertificados());
    } catch (err) {
      console.error('Error refreshing certificates:', err);
    }
  };

  useEffect(() => {
    refreshCertificates();
  }, []);

  const handleFileChange = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFeedbackMessage({ type: 'error', text: 'Por favor, selecione um arquivo em formato PDF.' });
      return;
    }

    setPdfFile(file);
    setFeedbackMessage(null);
    setIsSavedInDb(false);
    setStampedBase64('');

    // Pre-populate title from filename if empty
    const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    if (!certTitle) {
      setCertTitle(cleanName);
    }

    const buffer = await file.arrayBuffer();
    setPdfArrayBuffer(buffer);

    // Convert to base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    setOriginalBase64(base64);

    // Auto generate a unique auth code
    const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const uniqueSuffix2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newAuthCode = `ACAD-${new Date().getFullYear()}-${uniqueSuffix}-${uniqueSuffix2}`;
    setGeneratedCode(newAuthCode);

    // Generate QR preview
    const verificationUrl = `${window.location.origin}${window.location.pathname}?validar=${encodeURIComponent(newAuthCode)}`;
    const qrUrl = await generateQrCodeDataUrl(verificationUrl);
    setQrPreviewUrl(qrUrl);
  };

  const handleGenerateStampedPdf = async () => {
    if (!pdfArrayBuffer || !originalBase64) {
      setFeedbackMessage({ type: 'error', text: 'Selecione um arquivo PDF antes de gerar o carimbo.' });
      return;
    }
    if (!certTitle.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Informe o título do certificado ou curso.' });
      return;
    }
    if (!studentName.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Informe o nome do aluno ou profissional certificado.' });
      return;
    }

    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const code = generatedCode || `ACAD-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      setGeneratedCode(code);

      const verificationUrl = `${window.location.origin}${window.location.pathname}?validar=${encodeURIComponent(code)}`;

      const { stampedPdfBase64, qrDataUrl } = await stampPdfWithQrCode(pdfArrayBuffer, {
        authCode: code,
        verificationUrl,
        studentName: studentName.trim(),
        courseTitle: certTitle.trim(),
        issueDate,
        position: stampPosition,
        stampAllPages
      });

      setStampedBase64(stampedPdfBase64);
      setQrPreviewUrl(qrDataUrl);

      // Automatically persist to DB
      const saveRes = await storage.saveCertificado({
        codigoAutenticacao: code,
        titulo: certTitle.trim(),
        nomeAluno: studentName.trim(),
        cpfMasp: cpfMasp.trim() || undefined,
        descricao: certDescription.trim() || undefined,
        nomeArquivo: pdfFile?.name || `certificado_${code}.pdf`,
        pdfBase64: originalBase64,
        pdfStampedBase64: stampedPdfBase64,
        tamanhoBytes: pdfFile?.size || Math.round((originalBase64.length * 3) / 4),
        tipoMime: 'application/pdf',
        dataEmissao: issueDate,
        status: 'Valido'
      });

      if (saveRes.success) {
        setIsSavedInDb(true);
        setSavedCertId(saveRes.id || null);
        await refreshCertificates();
        setFeedbackMessage({
          type: 'success',
          text: `QR Code inserido no certificado com sucesso! Registro oficial salvo no banco com o código: ${code}`
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: saveRes.error || 'Erro ao gravar certificado no banco de dados.'
        });
      }
    } catch (err: any) {
      console.error('Error stamping PDF:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Erro ao inserir o carimbo com QR Code no PDF.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintStamped = () => {
    const dataToPrint = stampedBase64 || originalBase64;
    if (!dataToPrint) return;
    printPdfFromBase64(dataToPrint, `Certificado - ${studentName}`);
  };

  const handleDownloadStamped = () => {
    const dataToDownload = stampedBase64 || originalBase64;
    if (!dataToDownload) return;
    const cleanBase64 = dataToDownload.includes(',') ? dataToDownload.split(',')[1] : dataToDownload;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${cleanBase64}`;
    link.download = `Certificado_Validado_${generatedCode || 'ACADEPOL'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}${window.location.pathname}?validar=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Validation search
  const handleValidateSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = validationCodeInput.trim();
    if (!cleanCode) {
      setValidationError('Digite ou cole o código de autenticação do certificado.');
      setValidatedCert(null);
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const res = await storage.verificarCertificado(cleanCode);
      if (res.success && res.certificate) {
        setValidatedCert(res.certificate);
        setValidationError(null);
      } else {
        setValidatedCert(null);
        setValidationError(res.error || 'Certificado não encontrado no registro oficial.');
      }
    } catch (err: any) {
      setValidatedCert(null);
      setValidationError(err.message || 'Erro ao validar certificado.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleOpenValidatorForCert = (cert: Certificado) => {
    setValidationCodeInput(cert.codigoAutenticacao);
    setValidatedCert(cert);
    setValidationError(null);
    setActiveTab('validar');
  };

  const handleDeleteCertificate = async () => {
    if (!certToDelete) return;
    const res = await storage.deleteCertificado(certToDelete.id);
    if (res.success) {
      setFeedbackMessage({ type: 'success', text: `Certificado ${certToDelete.codigoAutenticacao} excluído com sucesso.` });
      await refreshCertificates();
      if (validatedCert?.id === certToDelete.id) {
        setValidatedCert(null);
      }
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Erro ao excluir certificado.' });
    }
    setCertToDelete(null);
  };

  const filteredCertificates = certificatesList.filter(c => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      (c.titulo || '').toLowerCase().includes(q) ||
      (c.nomeAluno || '').toLowerCase().includes(q) ||
      (c.codigoAutenticacao || '').toLowerCase().includes(q) ||
      (c.cpfMasp || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Navigation Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl text-emerald-400">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">
                  Verificação e Emissão de Certificados com QR Code
                </h1>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/40 uppercase">
                  ACADEPOL
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Importe certificados em PDF, insira o QR Code oficial de segurança e valide documentos com verificação em tempo real.
              </p>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('emitir')}
              className={`px-4 py-2 rounded-xl transition flex items-center space-x-2 ${
                activeTab === 'emitir'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Importar & Carimbar QR Code</span>
            </button>

            <button
              onClick={() => setActiveTab('validar')}
              className={`px-4 py-2 rounded-xl transition flex items-center space-x-2 ${
                activeTab === 'validar'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Validar Certificado</span>
            </button>

            <button
              onClick={() => setActiveTab('acervo')}
              className={`px-4 py-2 rounded-xl transition flex items-center space-x-2 ${
                activeTab === 'acervo'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Acervo Registrado ({certificatesList.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-center justify-between border animate-in fade-in duration-150 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
          >
            Fechar
          </button>
        </div>
      )}

      {/* TAB 1: EMITIR / CARIMBAR CERTIFICADO COM QR CODE */}
      {activeTab === 'emitir' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Configuration Form */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  1. Selecionar Arquivo do Certificado (PDF)
                </h2>
              </div>

              {/* PDF Dropzone */}
              <div
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer relative overflow-hidden ${
                  pdfFile
                    ? 'border-emerald-500/50 bg-emerald-950/10'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'
                }`}
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-emerald-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  {pdfFile ? (
                    <div>
                      <p className="text-xs font-bold text-emerald-400 truncate max-w-xs mx-auto">
                        {pdfFile.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {(pdfFile.size / 1024).toFixed(1)} KB • Pronto para carimbo
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-slate-200">
                        Clique ou arraste o certificado em PDF aqui
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Formatos aceitos: Documento PDF (.pdf)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Metadata */}
              <div className="space-y-3.5 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Título do Certificado ou Nome do Curso *
                  </label>
                  <input
                    type="text"
                    value={certTitle}
                    onChange={(e) => setCertTitle(e.target.value)}
                    placeholder="Ex: Curso de Operador de Fuzil 5,56mm"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nome do Aluno / Policial Certificado *
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Ex: Marcus Vinícius Ferreira da Silva"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      CPF ou MASP (Opcional)
                    </label>
                    <input
                      type="text"
                      value={cpfMasp}
                      onChange={(e) => setCpfMasp(e.target.value)}
                      placeholder="Ex: 1255748 ou CPF"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Data de Emissão
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Posição do Carimbo com QR Code no PDF
                  </label>
                  <select
                    value={stampPosition}
                    onChange={(e: any) => setStampPosition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="bottom-right">Canto Inferior Direito (Recomendado)</option>
                    <option value="bottom-left">Canto Inferior Esquerdo</option>
                    <option value="bottom-center">Canto Inferior Central</option>
                    <option value="top-right">Canto Superior Direito</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="stampAll"
                    checked={stampAllPages}
                    onChange={(e) => setStampAllPages(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500"
                  />
                  <label htmlFor="stampAll" className="text-xs text-slate-300 cursor-pointer">
                    Carimbar todas as páginas do documento (Padrão: apenas a 1ª página)
                  </label>
                </div>

                {generatedCode && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">
                      Código de Autenticação Gerado:
                    </span>
                    <p className="text-xs font-bold text-amber-300 font-mono tracking-wider">
                      {generatedCode}
                    </p>
                  </div>
                )}

                {/* Stamp Action Button */}
                <button
                  type="button"
                  onClick={handleGenerateStampedPdf}
                  disabled={isProcessing || !pdfFile}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processando e Carimbando PDF...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Inserir QR Code & Salvar no Banco</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Live Preview / Interactive Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">
                    {stampedBase64 ? 'Certificado Carimbado com QR Code' : 'Pré-visualização do Certificado'}
                  </h3>
                </div>

                {stampedBase64 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/40 font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>QR Code Inserido</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons if Stamped */}
              {stampedBase64 && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-950 border border-emerald-500/30 rounded-2xl">
                  <button
                    onClick={handlePrintStamped}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center space-x-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Certificado</span>
                  </button>

                  <button
                    onClick={handleDownloadStamped}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Baixar PDF Carimbado</span>
                  </button>

                  <button
                    onClick={() => handleCopyLink(generatedCode)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    {copiedCode === generatedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                    <span>{copiedCode === generatedCode ? 'Link Copiado!' : 'Copiar Link Validador'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setValidationCodeInput(generatedCode);
                      handleValidateSearch();
                      setActiveTab('validar');
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ml-auto"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Testar Validação</span>
                  </button>
                </div>
              )}

              {/* Embedded Document Viewer */}
              <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[500px]">
                {stampedBase64 || originalBase64 ? (
                  <iframe
                    src={`data:application/pdf;base64,${stampedBase64 || originalBase64}#toolbar=1&navpanes=0&view=FitH`}
                    title="Certificado"
                    className="w-full h-[600px] border-0 rounded-2xl bg-white"
                  />
                ) : (
                  <div className="p-8 text-center text-slate-500 space-y-3">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-slate-300">
                        Nenhum certificado selecionado
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Envie um arquivo PDF no formulário ao lado para pré-visualizar e estampar o QR Code de autenticidade.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VALIDAR CERTIFICADO */}
      {activeTab === 'validar' && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <form onSubmit={handleValidateSearch} className="space-y-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Verificar Autenticidade do Certificado
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={validationCodeInput}
                    onChange={(e) => setValidationCodeInput(e.target.value)}
                    placeholder="Cole o código do certificado (ex: ACAD-2026-X9Y2-K8M1)"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono tracking-wider"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isValidating}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50"
                >
                  {isValidating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Consultando...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Verificar Certificado</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="p-4 bg-rose-950/50 border border-rose-500/40 rounded-2xl text-rose-200 text-xs flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-300">Certificado Não Encontrado</p>
                <p className="text-slate-300 mt-0.5">{validationError}</p>
              </div>
            </div>
          )}

          {/* Validated Certificate Screen */}
          {validatedCert && (
            <div className="space-y-6">
              {/* Green Glow Official Validation Box */}
              <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/90 border-2 border-emerald-500/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400/80 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400 animate-pulse" />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 bg-emerald-500/20 border border-emerald-400/40 rounded-full text-emerald-300 text-xs font-bold tracking-wider uppercase">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Documento Oficial Autenticado</span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      CERTIFICADO ORIGINAL E VALIDADO
                    </h2>

                    <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
                      Este documento confere rigorosamente com o registro oficial da <strong>Academia de Polícia Civil (ACADEPOL)</strong>. Todos os dados abaixo e o arquivo digital exibido são autênticos.
                    </p>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="pt-6 border-t border-emerald-500/30 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Título / Curso:</span>
                    </span>
                    <p className="text-sm font-bold text-slate-100 mt-1 truncate" title={validatedCert.titulo}>
                      {validatedCert.titulo}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                      <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Aluno / Beneficiário:</span>
                    </span>
                    <p className="text-sm font-bold text-slate-100 mt-1 truncate" title={validatedCert.nomeAluno}>
                      {validatedCert.nomeAluno}
                    </p>
                    {validatedCert.cpfMasp && (
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        Doc: {validatedCert.cpfMasp}
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                      <Hash className="w-3.5 h-3.5 text-amber-400" />
                      <span>Código de Autenticação:</span>
                    </span>
                    <p className="text-sm font-bold text-amber-300 font-mono mt-1 tracking-wider">
                      {validatedCert.codigoAutenticacao}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-sky-400" />
                      <span>Data de Emissão:</span>
                    </span>
                    <p className="text-sm font-bold text-slate-100 mt-1">
                      {validatedCert.dataEmissao 
                        ? new Date(validatedCert.dataEmissao).toLocaleDateString('pt-BR') 
                        : (validatedCert.createdAt ? new Date(validatedCert.createdAt).toLocaleDateString('pt-BR') : 'Hoje')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Exact Stored PDF Viewer with Actions */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <FileCheck className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-100">
                      Visualização do Certificado Original Validado
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => printPdfFromBase64(validatedCert.pdfStampedBase64 || validatedCert.pdfBase64, `Certificado - ${validatedCert.nomeAluno}`)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition flex items-center space-x-2"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Imprimir Certificado</span>
                    </button>

                    <button
                      onClick={() => {
                        const data = validatedCert.pdfStampedBase64 || validatedCert.pdfBase64;
                        const clean = data.includes(',') ? data.split(',')[1] : data;
                        const link = document.createElement('a');
                        link.href = `data:application/pdf;base64,${clean}`;
                        link.download = validatedCert.nomeArquivo || `Certificado_${validatedCert.codigoAutenticacao}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-2"
                    >
                      <Download className="w-4 h-4 text-indigo-400" />
                      <span>Baixar PDF</span>
                    </button>
                  </div>
                </div>

                {/* PDF Container */}
                <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[600px]">
                  <iframe
                    src={`data:application/pdf;base64,${validatedCert.pdfStampedBase64 || validatedCert.pdfBase64}#toolbar=1&navpanes=0&view=FitH`}
                    title="Certificado Validado"
                    className="w-full h-[700px] border-0 rounded-2xl bg-white"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ACERVO DE CERTIFICADOS SALVOS */}
      {activeTab === 'acervo' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span>Acervo Oficial de Certificados Registrados</span>
              </h2>
              <p className="text-xs text-slate-400">
                Total de {certificatesList.length} documento(s) com carimbo de autenticidade digital e PDF armazenado.
              </p>
            </div>

            {/* Filter Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filtrar por aluno, curso ou código..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Certificate Table */}
          {filteredCertificates.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <FileCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-400">
                Nenhum certificado encontrado
              </p>
              <p className="text-[11px] text-slate-500">
                Utilize a aba "Importar & Carimbar QR Code" para registrar o primeiro certificado.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-3">Código Oficial</th>
                    <th className="py-3 px-3">Aluno / Beneficiário</th>
                    <th className="py-3 px-3">Título do Certificado</th>
                    <th className="py-3 px-3">Emissão</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCertificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                        {cert.codigoAutenticacao}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-100">
                        {cert.nomeAluno}
                        {cert.cpfMasp && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            Doc: {cert.cpfMasp}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-300 max-w-xs truncate" title={cert.titulo}>
                        {cert.titulo}
                      </td>
                      <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                        {cert.dataEmissao 
                          ? new Date(cert.dataEmissao).toLocaleDateString('pt-BR')
                          : (cert.createdAt ? new Date(cert.createdAt).toLocaleDateString('pt-BR') : '-')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          {cert.status || 'Válido'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenValidatorForCert(cert)}
                            title="Validar & Visualizar"
                            className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded-lg transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => printPdfFromBase64(cert.pdfStampedBase64 || cert.pdfBase64, `Certificado - ${cert.nomeAluno}`)}
                            title="Imprimir Certificado"
                            className="p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleCopyLink(cert.codigoAutenticacao)}
                            title="Copiar Link Validador"
                            className="p-1.5 text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                          >
                            {copiedCode === cert.codigoAutenticacao ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => setCertToDelete(cert)}
                            title="Excluir Certificado"
                            className="p-1.5 text-rose-400 hover:bg-slate-800 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {certToDelete && (
        <ConfirmDeleteModal
          isOpen={!!certToDelete}
          title="Excluir Registro de Certificado"
          message={`Tem certeza que deseja excluir o certificado "${certToDelete.titulo}" emitido para "${certToDelete.nomeAluno}" (Código: ${certToDelete.codigoAutenticacao})? O arquivo PDF armazenado será removido permanentemente do banco de dados.`}
          onConfirm={handleDeleteCertificate}
          onCancel={() => setCertToDelete(null)}
        />
      )}
    </div>
  );
};
