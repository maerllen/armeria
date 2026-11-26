import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  WhatsappApiConfig,
  WhatsappTemplate,
  WhatsappRegraComunicacao,
  WhatsappMensagemLog,
  WhatsappWebhookEvento,
  WhatsappAmbiente,
  WhatsappModoAtendimento,
  WhatsappTemplateCategoria,
  WhatsappTemplateHeaderTipo,
  WhatsappDestinatarioTipo,
  WhatsappBotReplyItem
} from '../types';
import { TopLayerAlert } from './TopLayerAlert';
import {
  MessageCircle,
  Settings,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  Key,
  ShieldCheck,
  Plus,
  Edit,
  Trash2,
  Save,
  Webhook,
  Activity,
  Sparkles,
  Radio,
  Clock,
  Users,
  Search,
  X,
  Bot,
  Download,
  List,
  RotateCcw,
  UploadCloud,
  CornerDownRight,
  ExternalLink
} from 'lucide-react';

interface ModuloWhatsappProps {
  currentUser: User;
  allUsers: User[];
}

type WhatsappTab = 'config-api' | 'templates' | 'comunicacao';

const API_VERSION_OPTIONS = ['v23.0', 'v22.0', 'v21.0', 'v20.0', 'v19.0'];

const IDIOMA_OPTIONS = [
  { value: 'pt_BR', label: 'Português (Brasil) — pt_BR' },
  { value: 'en_US', label: 'Inglês (EUA) — en_US' },
  { value: 'es', label: 'Espanhol — es' }
];

const DESTINATARIO_LABELS: Record<WhatsappDestinatarioTipo, string> = {
  USUARIO_DESTINO: 'Usuário vinculado ao evento',
  RESPONSAVEL_UNIDADE: 'Responsável / Armeiro da Unidade',
  ADMINISTRADORES: 'Administradores da Unidade',
  NUMERO_FIXO: 'Número Fixo Específico'
};

function formatDateTimeBr(val?: string | null): string {
  if (!val) return '—';
  const s = String(val).replace('T', ' ').slice(0, 19);
  const [datePart, timePart] = s.split(' ');
  const parts = (datePart || '').split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}${timePart ? ` ${timePart.slice(0, 5)}` : ''}`;
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(18);
  window.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `pcmg_wpp_${hex}`;
}

function countTemplatePlaceholders(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g);
  if (!matches) return 0;
  const nums = matches.map(m => Number(m.replace(/\D/g, ''))).filter(n => n > 0);
  return nums.length > 0 ? Math.max(...nums) : 0;
}

export const ModuloWhatsapp: React.FC<ModuloWhatsappProps> = ({ currentUser, allUsers }) => {
  const [activeTab, setActiveTab] = useState<WhatsappTab>('config-api');
  const [successMsg, setSuccessMsg] = useState<{ id: number; text: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<{ id: number; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const notifySuccess = (text: string) => {
    setSuccessMsg({ id: Date.now() + Math.random(), text });
    setErrorMsg(null);
  };

  const notifyError = (text: string) => {
    setErrorMsg({ id: Date.now() + Math.random(), text });
    setSuccessMsg(null);
  };

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-actor-id': currentUser.id
    }),
    [currentUser.id]
  );

  // --- STATE: CONFIGURAÇÃO DA API ---
  const [config, setConfig] = useState<WhatsappApiConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [formAmbiente, setFormAmbiente] = useState<WhatsappAmbiente>('TESTE');
  const [formAtivo, setFormAtivo] = useState(false);
  const [formApiVersion, setFormApiVersion] = useState('v22.0');
  const [formPhoneNumberId, setFormPhoneNumberId] = useState('');
  const [formWabaId, setFormWabaId] = useState('');
  const [formMetaAppId, setFormMetaAppId] = useState('');
  const [formNomePerfil, setFormNomePerfil] = useState('');
  const [formNumeroExibicao, setFormNumeroExibicao] = useState('');
  const [formAccessToken, setFormAccessToken] = useState('');
  const [formAppSecret, setFormAppSecret] = useState('');
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [formVerifyToken, setFormVerifyToken] = useState('');
  const [formCallbackPublica, setFormCallbackPublica] = useState('');
  const [formNumeroTeste, setFormNumeroTeste] = useState('');

  // --- STATE: INTEGRAÇÃO MAKE.COM & DIAGNÓSTICO DE WEBHOOK ---
  const [formModoAtendimento, setFormModoAtendimento] = useState<WhatsappModoAtendimento>('BOT_INTERNO');
  const [formMakeWebhookAtivo, setFormMakeWebhookAtivo] = useState(false);
  const [formMakeWebhookUrl, setFormMakeWebhookUrl] = useState('');
  const [formMakeEncaminharStatus, setFormMakeEncaminharStatus] = useState(false);
  const [formMakeWebhookSecret, setFormMakeWebhookSecret] = useState('');
  const [showMakeWebhookSecret, setShowMakeWebhookSecret] = useState(false);
  const [newlyGeneratedMakeApiKey, setNewlyGeneratedMakeApiKey] = useState<string | null>(null);
  const [generatingMakeApiKey, setGeneratingMakeApiKey] = useState(false);
  const [testingMakeWebhook, setTestingMakeWebhook] = useState(false);
  const [checkingWebhookHealth, setCheckingWebhookHealth] = useState(false);
  const [webhookDiagnostics, setWebhookDiagnostics] = useState<{
    overall: 'OK' | 'WARN' | 'ERROR';
    webhookUrl: string;
    checks: Array<{ key: string; label: string; status: 'ok' | 'warn' | 'error'; detail: string }>;
  } | null>(null);

  // Disparo de teste na aba Config API
  const [testMode, setTestMode] = useState<'template' | 'text'>('template');
  const [testPhone, setTestPhone] = useState('');
  const [testTemplateName, setTestTemplateName] = useState('hello_world');
  const [testTemplateLang, setTestTemplateLang] = useState('en_US');
  const [testTemplateVars, setTestTemplateVars] = useState('');
  const [testFreeText, setTestFreeText] = useState('Teste de integração da API Oficial do WhatsApp (Armeria PCMG).');
  const [lastTestDispatchResult, setLastTestDispatchResult] = useState<{
    ok: boolean;
    message: string;
    wamid?: string;
  } | null>(null);

  // --- STATE: TEMPLATES ---
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsappTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmDeleteTplId, setConfirmDeleteTplId] = useState<string | null>(null);

  const [tplForm, setTplForm] = useState<{
    nome: string;
    idioma: string;
    categoria: WhatsappTemplateCategoria;
    cabecalhoTipo: WhatsappTemplateHeaderTipo;
    cabecalhoTexto: string;
    corpoTexto: string;
    rodapeTexto: string;
    variaveisExemploText: string;
    botoesText: string;
    enviarParaMeta: boolean;
  }>({
    nome: '',
    idioma: 'pt_BR',
    categoria: 'UTILITY',
    cabecalhoTipo: 'NONE',
    cabecalhoTexto: '',
    corpoTexto: '',
    rodapeTexto: '',
    variaveisExemploText: '',
    botoesText: '',
    enviarParaMeta: false
  });
  const [submittingTplId, setSubmittingTplId] = useState<string | null>(null);

  // --- STATE: SIMULADOR INTERATIVO DO BOT WHATSAPP ---
  interface SimChatEntry {
    id: string;
    sender: 'client' | 'bot';
    text?: string;
    reply?: WhatsappBotReplyItem;
    time: string;
  }
  const [simMessages, setSimMessages] = useState<SimChatEntry[]>([]);
  const [simInput, setSimInput] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simEtapa, setSimEtapa] = useState('INICIO');
  const [simAsUserId, setSimAsUserId] = useState<string>(currentUser.id);
  const [openListMsgId, setOpenListMsgId] = useState<string | null>(null);

  // --- STATE: COMUNICAÇÃO (REGRAS, ENVIO MANUAL, LOGS E WEBHOOKS) ---
  const [regras, setRegras] = useState<WhatsappRegraComunicacao[]>([]);
  const [mensagens, setMensagens] = useState<WhatsappMensagemLog[]>([]);
  const [webhookEventos, setWebhookEventos] = useState<WhatsappWebhookEvento[]>([]);
  const [loadingComunicacao, setLoadingComunicacao] = useState(false);
  const [savingRegraId, setSavingRegraId] = useState<string | null>(null);
  const [showNovaRegraModal, setShowNovaRegraModal] = useState(false);
  const [novaRegraForm, setNovaRegraForm] = useState({
    eventoSistema: '',
    nomeExibicao: '',
    descricao: '',
    templateId: '',
    destinatarioTipo: 'USUARIO_DESTINO' as WhatsappDestinatarioTipo,
    numeroDestinoFixo: '',
    mapeamentoText: 'usuario.nome'
  });

  // Envio manual na aba Comunicação
  const [manualUserId, setManualUserId] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualMode, setManualMode] = useState<'template' | 'text'>('template');
  const [manualTemplateId, setManualTemplateId] = useState('');
  const [manualVarsText, setManualVarsText] = useState('');
  const [manualTextBody, setManualTextBody] = useState('');
  const [sendingManual, setSendingManual] = useState(false);
  const [logSubTab, setLogSubTab] = useState<'mensagens' | 'webhooks'>('mensagens');
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);

  const hydrateConfigForm = (cfg: WhatsappApiConfig) => {
    setConfig(cfg);
    setFormAmbiente(cfg.ambiente || 'TESTE');
    setFormAtivo(Boolean(cfg.ativo));
    setFormApiVersion(cfg.apiVersion || 'v22.0');
    setFormPhoneNumberId(cfg.phoneNumberId || '');
    setFormWabaId(cfg.wabaId || '');
    setFormMetaAppId(cfg.metaAppId || '');
    setFormNomePerfil(cfg.nomePerfilExibicao || '');
    setFormNumeroExibicao(cfg.numeroTelefoneExibicao || '');
    setFormVerifyToken(cfg.webhookVerifyToken || '');
    setFormCallbackPublica(cfg.callbackUrlPublica || '');
    setFormNumeroTeste(cfg.numeroTestePadrao || '');
    setFormModoAtendimento(cfg.modoAtendimento || 'BOT_INTERNO');
    setFormMakeWebhookAtivo(Boolean(cfg.makeWebhookAtivo));
    setFormMakeWebhookUrl(cfg.makeWebhookUrl || '');
    setFormMakeEncaminharStatus(Boolean(cfg.makeEncaminharStatus));
    setFormMakeWebhookSecret('');
    setTestPhone(prev => prev || cfg.numeroTestePadrao || '');
    setFormAccessToken('');
    setFormAppSecret('');
  };

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/whatsapp/config', { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao carregar configuração da API WhatsApp.');
      } else {
        hydrateConfigForm(data);
      }
    } catch (err: any) {
      notifyError(err.message || 'Erro ao conectar ao servidor.');
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/whatsapp/templates', { headers: authHeaders });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setTemplates(data);
      }
    } catch {
      // handled silently
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadComunicacao = async () => {
    setLoadingComunicacao(true);
    try {
      const [regRes, msgRes] = await Promise.all([
        fetch('/api/whatsapp/regras', { headers: authHeaders }),
        fetch('/api/whatsapp/mensagens', { headers: authHeaders })
      ]);
      const regData = await regRes.json();
      const msgData = await msgRes.json();
      if (regRes.ok && Array.isArray(regData)) {
        setRegras(regData);
      }
      if (msgRes.ok) {
        setMensagens(Array.isArray(msgData.mensagens) ? msgData.mensagens : []);
        setWebhookEventos(Array.isArray(msgData.webhookEventos) ? msgData.webhookEventos : []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingComunicacao(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadTemplates();
    loadComunicacao();
  }, [currentUser.id]);

  const computedBasePublicUrl = useMemo(() => {
    const raw = formCallbackPublica.trim()
      ? formCallbackPublica.trim().replace(/\/+$/, '').replace(/\/api\/whatsapp\/webhook$/i, '')
      : window.location.origin;
    return raw;
  }, [formCallbackPublica]);

  const computedWebhookUrl = useMemo(() => {
    return `${computedBasePublicUrl}/api/whatsapp/webhook`;
  }, [computedBasePublicUrl]);

  const computedMakeEnviarUrl = useMemo(() => {
    return `${computedBasePublicUrl}/api/whatsapp/make/enviar`;
  }, [computedBasePublicUrl]);

  const computedMakeUsuarioUrl = useMemo(() => {
    return `${computedBasePublicUrl}/api/whatsapp/make/consultar-usuario`;
  }, [computedBasePublicUrl]);

  const computedMakeStatusUrl = useMemo(() => {
    return `${computedBasePublicUrl}/api/whatsapp/make/status`;
  }, [computedBasePublicUrl]);

  const computedTermsUrl = useMemo(() => {
    return `${computedBasePublicUrl}/termos-de-servico`;
  }, [computedBasePublicUrl]);

  const computedPrivacyUrl = useMemo(() => {
    return `${computedBasePublicUrl}/politica-de-privacidade`;
  }, [computedBasePublicUrl]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      notifyError('Não foi possível copiar para a área de transferência.');
    }
  };

  // --- HANDLERS: CONFIGURAÇÃO DA API ---
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          ambiente: formAmbiente,
          ativo: formAtivo,
          apiVersion: formApiVersion,
          phoneNumberId: formPhoneNumberId.trim(),
          wabaId: formWabaId.trim(),
          metaAppId: formMetaAppId.trim(),
          nomePerfilExibicao: formNomePerfil.trim(),
          numeroTelefoneExibicao: formNumeroExibicao.trim(),
          accessToken: formAccessToken.trim() || undefined,
          appSecret: formAppSecret.trim() || undefined,
          webhookVerifyToken: formVerifyToken.trim(),
          callbackUrlPublica: formCallbackPublica.trim(),
          numeroTestePadrao: formNumeroTeste.trim(),
          modoAtendimento: formModoAtendimento,
          makeWebhookAtivo: formMakeWebhookAtivo,
          makeWebhookUrl: formMakeWebhookUrl.trim(),
          makeEncaminharStatus: formMakeEncaminharStatus,
          makeWebhookSecret: formMakeWebhookSecret.trim() || undefined,
          actor: currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao salvar configuração da API WhatsApp.');
      } else {
        if (data.config) hydrateConfigForm(data.config);
        notifySuccess('Configuração da API Oficial do WhatsApp e Make.com salva com sucesso.');
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleClearSecret = async (field: 'accessToken' | 'appSecret' | 'makeWebhookSecret' | 'makeApiKey') => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          ambiente: formAmbiente,
          ativo: formAtivo,
          apiVersion: formApiVersion,
          phoneNumberId: formPhoneNumberId.trim(),
          wabaId: formWabaId.trim(),
          metaAppId: formMetaAppId.trim(),
          nomePerfilExibicao: formNomePerfil.trim(),
          numeroTelefoneExibicao: formNumeroExibicao.trim(),
          webhookVerifyToken: formVerifyToken.trim(),
          callbackUrlPublica: formCallbackPublica.trim(),
          numeroTestePadrao: formNumeroTeste.trim(),
          modoAtendimento: formModoAtendimento,
          makeWebhookAtivo: formMakeWebhookAtivo,
          makeWebhookUrl: formMakeWebhookUrl.trim(),
          makeEncaminharStatus: formMakeEncaminharStatus,
          clearAccessToken: field === 'accessToken',
          clearAppSecret: field === 'appSecret',
          clearMakeWebhookSecret: field === 'makeWebhookSecret',
          clearMakeApiKey: field === 'makeApiKey',
          actor: currentUser
        })
      });
      const data = await res.json();
      if (res.ok && data.config) {
        hydrateConfigForm(data.config);
        if (field === 'makeApiKey') setNewlyGeneratedMakeApiKey(null);
        notifySuccess(
          field === 'accessToken'
            ? 'Access Token removido.'
            : field === 'appSecret'
            ? 'App Secret removido.'
            : field === 'makeWebhookSecret'
            ? 'Segredo do Webhook Make removido.'
            : 'API Key do Make removida.'
        );
      } else {
        notifyError(data.error || 'Erro ao remover credencial.');
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCheckWebhookHealth = async () => {
    setCheckingWebhookHealth(true);
    try {
      const res = await fetch('/api/whatsapp/webhook/testar', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actor: currentUser })
      });
      const data = await res.json();
      if (res.ok) {
        setWebhookDiagnostics({
          overall: data.overall || 'OK',
          webhookUrl: data.webhookUrl || computedWebhookUrl,
          checks: Array.isArray(data.checks) ? data.checks : []
        });
        if (data.overall === 'OK') {
          notifySuccess('Diagnóstico concluído: Webhook pronto para Meta e Make.com!');
        } else if (data.overall === 'WARN') {
          notifySuccess('Diagnóstico concluído com alertas opcionais. Veja os detalhes no cartão.');
        } else {
          notifyError('Diagnóstico encontrou pendências obrigatórias. Veja o cartão de saúde do Webhook.');
        }
      } else {
        notifyError(data.error || 'Erro ao executar diagnóstico do Webhook.');
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setCheckingWebhookHealth(false);
    }
  };

  const handleGenerateMakeApiKey = async () => {
    setGeneratingMakeApiKey(true);
    try {
      const res = await fetch('/api/whatsapp/make/gerar-api-key', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actor: currentUser })
      });
      const data = await res.json();
      if (res.ok && data.apiKey) {
        setNewlyGeneratedMakeApiKey(data.apiKey);
        if (data.config) hydrateConfigForm(data.config);
        notifySuccess('Nova API Key do Make gerada! Copie e guarde agora no seu cenário do Make.com.');
      } else {
        notifyError(data.error || 'Erro ao gerar API Key do Make.');
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setGeneratingMakeApiKey(false);
    }
  };

  const handleTestMakeWebhook = async (options?: { minimal?: boolean; skipSecret?: boolean }) => {
    if (!formMakeWebhookUrl.trim()) {
      notifyError('Cole a URL do Custom Webhook do Make.com antes de testar.');
      return;
    }
    setTestingMakeWebhook(true);
    try {
      const res = await fetch('/api/whatsapp/make/testar', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          makeWebhookUrl: formMakeWebhookUrl.trim(),
          makeWebhookSecret: options?.skipSecret ? undefined : (formMakeWebhookSecret.trim() || undefined),
          minimal: Boolean(options?.minimal),
          skipSecret: Boolean(options?.skipSecret),
          actor: currentUser
        })
      });
      const data = await res.json();
      if (data.config) hydrateConfigForm(data.config);
      if (res.ok && data.success) {
        notifySuccess(data.message || 'Evento de teste recebido pelo Make.com com sucesso!');
        loadComunicacao();
      } else {
        notifyError(data.message || data.error || 'Falha ao enviar evento de teste para o Make.com.');
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setTestingMakeWebhook(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      const res = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actor: currentUser })
      });
      const data = await res.json();
      if (data.config) hydrateConfigForm(data.config);
      if (res.ok && data.success) {
        notifySuccess(data.message || 'Conexão validada com sucesso na Meta Graph API.');
      } else {
        notifyError(data.message || data.error || 'Falha ao conectar na Meta Graph API.');
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setTestingConn(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      notifyError('Informe o número de destino com DDI e DDD (ex: 5531999990000).');
      return;
    }
    setSendingTest(true);
    setLastTestDispatchResult(null);
    try {
      const bodyParameters = testTemplateVars
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          toPhone: testPhone.trim(),
          mode: testMode,
          templateName: testTemplateName.trim(),
          languageCode: testTemplateLang.trim(),
          bodyParameters,
          textBody: testFreeText,
          actor: currentUser
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLastTestDispatchResult({
          ok: true,
          message: 'Mensagem de teste aceita pela Meta Cloud API!',
          wamid: data.metaMessageId
        });
        notifySuccess('Mensagem de teste disparada com sucesso pela API Oficial do WhatsApp.');
        loadComunicacao();
      } else {
        setLastTestDispatchResult({
          ok: false,
          message: data.error || 'A Meta API recusou o envio de teste.'
        });
        notifyError(data.error || 'Erro ao enviar mensagem de teste.');
        loadComunicacao();
      }
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setSendingTest(false);
    }
  };

  // --- HANDLERS: TEMPLATES ---
  const openCreateTemplateModal = () => {
    setEditingTemplate(null);
    setTplForm({
      nome: '',
      idioma: 'pt_BR',
      categoria: 'UTILITY',
      cabecalhoTipo: 'NONE',
      cabecalhoTexto: '',
      corpoTexto: 'Olá {{1}}, você possui uma notificação do sistema Armeria PCMG referente a {{2}}.',
      rodapeTexto: 'Polícia Civil de Minas Gerais',
      variaveisExemploText: 'Nome do Policial; Cautela #001',
      botoesText: '',
      enviarParaMeta: false
    });
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = (tpl: WhatsappTemplate) => {
    setEditingTemplate(tpl);
    setTplForm({
      nome: tpl.nome,
      idioma: tpl.idioma,
      categoria: tpl.categoria,
      cabecalhoTipo: tpl.cabecalhoTipo,
      cabecalhoTexto: tpl.cabecalhoTexto || '',
      corpoTexto: tpl.corpoTexto,
      rodapeTexto: tpl.rodapeTexto || '',
      variaveisExemploText: (tpl.variaveisExemplo || []).join('; '),
      botoesText: (tpl.botoes || []).map(b => b.text).filter(Boolean).join('; '),
      enviarParaMeta: false
    });
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      const variaveisExemplo = tplForm.variaveisExemploText
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);
      const botoes = tplForm.botoesText
        .split(';')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map(text => ({ type: 'QUICK_REPLY', text }));

      const url = editingTemplate ? `/api/whatsapp/templates/${editingTemplate.id}` : '/api/whatsapp/templates';
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify({
          nome: tplForm.nome,
          idioma: tplForm.idioma,
          categoria: tplForm.categoria,
          cabecalhoTipo: tplForm.cabecalhoTipo,
          cabecalhoTexto: tplForm.cabecalhoTexto,
          corpoTexto: tplForm.corpoTexto,
          rodapeTexto: tplForm.rodapeTexto,
          variaveisExemplo,
          botoes,
          enviarParaMeta: !editingTemplate && tplForm.enviarParaMeta,
          actor: currentUser
        })
      });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao salvar template.');
      } else {
        setShowTemplateModal(false);
        await loadTemplates();
        notifySuccess(
          editingTemplate
            ? 'Template atualizada com sucesso.'
            : tplForm.enviarParaMeta
            ? 'Template cadastrada e enviada para aprovação na Meta!'
            : 'Template salva com sucesso.'
        );
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSubmitTemplateToMeta = async (tpl: WhatsappTemplate) => {
    setSubmittingTplId(tpl.id);
    try {
      const res = await fetch(`/api/whatsapp/templates/${tpl.id}/submit-meta`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actor: currentUser })
      });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao enviar template para aprovação na Meta.');
      } else {
        await loadTemplates();
        notifySuccess(`Template "${tpl.nome}" enviada para aprovação na Meta!`);
      }
    } finally {
      setSubmittingTplId(null);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    const res = await fetch(`/api/whatsapp/templates/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ actor: currentUser })
    });
    const data = await res.json();
    if (res.ok) {
      setConfirmDeleteTplId(null);
      await loadTemplates();
      notifySuccess('Template removida.');
    } else {
      notifyError(data.error || 'Erro ao remover template.');
    }
  };

  const handleSyncMetaTemplates = async () => {
    setSyncingTemplates(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ actor: currentUser })
      });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao sincronizar templates da Meta.');
      } else {
        if (Array.isArray(data.templates)) setTemplates(data.templates);
        notifySuccess(`Sincronização concluída: ${data.syncedCount || 0} template(s) obtida(s) da Meta.`);
      }
    } finally {
      setSyncingTemplates(false);
    }
  };

  // --- HANDLERS: SIMULADOR INTERATIVO DO BOT ---
  const nowTimeLabel = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const sendBotSimulation = async (payload: {
    displayLabel: string;
    text?: string;
    buttonId?: string;
    buttonTitle?: string;
    listRowId?: string;
    listRowTitle?: string;
  }) => {
    setSimLoading(true);
    setOpenListMsgId(null);
    const clientEntry: SimChatEntry = {
      id: `sim-c-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sender: 'client',
      text: payload.displayLabel,
      time: nowTimeLabel()
    };
    setSimMessages(prev => [...prev, clientEntry]);

    try {
      const res = await fetch('/api/whatsapp/bot/simular', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          simulateAsUserId: simAsUserId || currentUser.id,
          text: payload.text || '',
          buttonId: payload.buttonId || '',
          buttonTitle: payload.buttonTitle || '',
          listRowId: payload.listRowId || '',
          listRowTitle: payload.listRowTitle || ''
        })
      });
      const data = await res.json();
      if (!res.ok) {
        notifyError(data.error || 'Erro ao simular interação do bot WhatsApp.');
      } else {
        setSimEtapa(data.etapaAtual || 'INICIO');
        const replies: WhatsappBotReplyItem[] = Array.isArray(data.replies) ? data.replies : [];
        const botEntries: SimChatEntry[] = replies.map((r, i) => ({
          id: `sim-b-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          sender: 'bot',
          reply: r,
          time: nowTimeLabel()
        }));
        setSimMessages(prev => [...prev, ...botEntries]);
      }
    } catch (err: any) {
      notifyError(err.message || 'Falha na simulação do fluxo.');
    } finally {
      setSimLoading(false);
    }
  };

  const handleResetSimulation = async (overrideUserId?: string) => {
    await fetch('/api/whatsapp/bot/reset', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ simulateAsUserId: overrideUserId || simAsUserId || currentUser.id })
    }).catch(() => {});
    setSimMessages([]);
    setSimEtapa('INICIO');
    setOpenListMsgId(null);
  };

  // --- HANDLERS: COMUNICAÇÃO ---
  const handleUpdateRegraLocal = (id: string, patch: Partial<WhatsappRegraComunicacao>) => {
    setRegras(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSaveRegra = async (regra: WhatsappRegraComunicacao) => {
    setSavingRegraId(regra.id);
    try {
      const tpl = templates.find(t => t.id === regra.templateId);
      const res = await fetch(`/api/whatsapp/regras/${regra.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          ...regra,
          templateNome: tpl ? tpl.nome : regra.templateNome || null,
          actor: currentUser
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.regra) {
          setRegras(prev => prev.map(r => (r.id === regra.id ? data.regra : r)));
        }
        notifySuccess(`Regra "${regra.nomeExibicao}" atualizada.`);
      } else {
        notifyError(data.error || 'Erro ao atualizar regra de comunicação.');
      }
    } finally {
      setSavingRegraId(null);
    }
  };

  const handleCreateRegra = async (e: React.FormEvent) => {
    e.preventDefault();
    const tpl = templates.find(t => t.id === novaRegraForm.templateId);
    const res = await fetch('/api/whatsapp/regras', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        eventoSistema: novaRegraForm.eventoSistema,
        nomeExibicao: novaRegraForm.nomeExibicao,
        descricao: novaRegraForm.descricao,
        templateId: novaRegraForm.templateId || null,
        templateNome: tpl?.nome || null,
        destinatarioTipo: novaRegraForm.destinatarioTipo,
        numeroDestinoFixo: novaRegraForm.numeroDestinoFixo,
        mapeamentoVariaveis: novaRegraForm.mapeamentoText
          .split(';')
          .map(s => s.trim())
          .filter(Boolean),
        ativo: true,
        actor: currentUser
      })
    });
    const data = await res.json();
    if (res.ok) {
      setShowNovaRegraModal(false);
      setNovaRegraForm({
        eventoSistema: '',
        nomeExibicao: '',
        descricao: '',
        templateId: '',
        destinatarioTipo: 'USUARIO_DESTINO',
        numeroDestinoFixo: '',
        mapeamentoText: 'usuario.nome'
      });
      await loadComunicacao();
      notifySuccess('Nova regra de comunicação criada.');
    } else {
      notifyError(data.error || 'Erro ao criar regra.');
    }
  };

  const handleDeleteRegra = async (id: string) => {
    const res = await fetch(`/api/whatsapp/regras/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ actor: currentUser })
    });
    if (res.ok) {
      await loadComunicacao();
      notifySuccess('Regra removida.');
    } else {
      const data = await res.json().catch(() => ({}));
      notifyError(data.error || 'Erro ao remover regra.');
    }
  };

  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) {
      notifyError('Informe o telefone do destinatário com DDI e DDD.');
      return;
    }
    const targetUser = allUsers.find(u => u.id === manualUserId);
    const selectedTpl = templates.find(t => t.id === manualTemplateId);
    if (manualMode === 'template' && !selectedTpl) {
      notifyError('Selecione uma template cadastrada para disparo.');
      return;
    }

    setSendingManual(true);
    try {
      const res = await fetch('/api/whatsapp/enviar-manual', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          toPhone: manualPhone.trim(),
          mode: manualMode,
          templateName: selectedTpl?.nome,
          languageCode: selectedTpl?.idioma,
          bodyParameters: manualVarsText
            .split(';')
            .map(s => s.trim())
            .filter(Boolean),
          textBody: manualTextBody,
          usuarioDestinoId: targetUser?.id || null,
          usuarioDestinoNome: targetUser?.name || null,
          actor: currentUser
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notifySuccess(`Mensagem enviada com sucesso! ID Meta: ${data.metaMessageId}`);
        setManualTextBody('');
        setManualVarsText('');
        await loadComunicacao();
      } else {
        notifyError(data.error || 'Falha no envio da mensagem.');
        await loadComunicacao();
      }
    } finally {
      setSendingManual(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      t =>
        t.nome.toLowerCase().includes(q) ||
        t.corpoTexto.toLowerCase().includes(q) ||
        t.statusMeta.toLowerCase().includes(q)
    );
  }, [templates, templateSearch]);

  const previewRenderedBody = useMemo(() => {
    const vars = tplForm.variaveisExemploText
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    return tplForm.corpoTexto.replace(/\{\{(\d+)\}\}/g, (match, numStr) => {
      const idx = Number(numStr) - 1;
      return vars[idx] ? `[${vars[idx]}]` : match;
    });
  }, [tplForm.corpoTexto, tplForm.variaveisExemploText]);

  const renderStatusBadge = (status: string) => {
    const st = String(status || '').toUpperCase();
    if (st === 'APPROVED' || st === 'CONECTADO' || st === 'ENTREGUE' || st === 'LIDA') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-black uppercase">
          <CheckCircle2 className="w-3 h-3" />
          {st}
        </span>
      );
    }
    if (st === 'ENVIADA' || st === 'PENDING' || st === 'RECEBIDA') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 text-[10px] font-black uppercase">
          <Radio className="w-3 h-3" />
          {st}
        </span>
      );
    }
    if (st === 'REJECTED' || st === 'ERRO' || st === 'FALHOU') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/35 text-red-300 text-[10px] font-black uppercase">
          <XCircle className="w-3 h-3" />
          {st}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase">
        {st || 'RASCUNHO'}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {successMsg && (
        <TopLayerAlert
          key={successMsg.id}
          type="success"
          message={successMsg.text}
          autoHideMs={3000}
          onClose={() => setSuccessMsg(null)}
        />
      )}
      {errorMsg && (
        <TopLayerAlert
          key={errorMsg.id}
          type="error"
          message={errorMsg.text}
          autoHideMs={3000}
          onClose={() => setErrorMsg(null)}
        />
      )}

      {/* Cabeçalho do Módulo WhatsApp */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 shrink-0">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-tight">WhatsApp — API Oficial Meta Cloud</h1>
              <span
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                  config?.ambiente === 'PRODUCAO'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                Ambiente: {config?.ambiente === 'PRODUCAO' ? 'Produção' : 'Teste / Sandbox'}
              </span>
              {config && renderStatusBadge(config.ultimoTesteStatus)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Central administrativa para conexão com a API oficial do WhatsApp Business (Meta Graph API), gestão de
              templates e regras de comunicação do sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right text-[11px] text-slate-400">
            <div>
              Integração:{' '}
              <strong className={config?.ativo ? 'text-emerald-400' : 'text-slate-300'}>
                {config?.ativo ? 'ATIVA' : 'INATIVA'}
              </strong>
            </div>
            <div>
              Versão API: <strong className="font-mono text-slate-200">{config?.apiVersion || 'v22.0'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Abas do Módulo WhatsApp */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
        <button
          type="button"
          onClick={() => setActiveTab('config-api')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            activeTab === 'config-api'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Configuração da API</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            activeTab === 'templates'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Configuração das Templates ({templates.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('comunicacao')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center space-x-2 ${
            activeTab === 'comunicacao'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Configuração da Comunicação ({regras.filter(r => r.ativo).length} ativa(s))</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* ABA 1: CONFIGURAÇÃO DA API                                            */}
      {/* ===================================================================== */}
      {activeTab === 'config-api' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Formulário Principal de Credenciais e Parâmetros da API */}
          <form
            onSubmit={handleSaveConfig}
            className="xl:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-emerald-300 uppercase flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  <span>Credenciais da API Oficial do WhatsApp (Meta Cloud API)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure os dados do aplicativo Meta Developers para testes e altere para produção quando desejar.
                </p>
              </div>
              {loadingConfig && <span className="text-xs text-slate-400">Carregando...</span>}
            </div>

            {/* Ambiente & Status Ativo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase block">
                  Ambiente de Operação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormAmbiente('TESTE')}
                    className={`py-2 px-3 rounded-lg text-xs font-black border transition ${
                      formAmbiente === 'TESTE'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Teste / Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAmbiente('PRODUCAO')}
                    className={`py-2 px-3 rounded-lg text-xs font-black border transition ${
                      formAmbiente === 'PRODUCAO'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Produção
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold text-slate-300 uppercase">Status da Integração</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Habilita ou pausa os disparos automáticos do sistema.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormAtivo(v => !v)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black border transition shrink-0 ${
                    formAtivo
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {formAtivo ? 'ATIVA' : 'DESATIVADA'}
                </button>
              </div>
            </div>

            {/* Identificadores Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Versão da Meta Graph API *
                </label>
                <select
                  value={formApiVersion}
                  onChange={e => setFormApiVersion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                >
                  {API_VERSION_OPTIONS.map(v => (
                    <option key={v} value={v}>
                      {v} (https://graph.facebook.com/{v})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Phone Number ID (ID do Número de Telefone) *
                </label>
                <input
                  type="text"
                  value={formPhoneNumberId}
                  onChange={e => setFormPhoneNumberId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 109876543210987"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  WABA ID (ID da Conta WhatsApp Business) *
                </label>
                <input
                  type="text"
                  value={formWabaId}
                  onChange={e => setFormWabaId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 104567890123456"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Meta App ID (ID do Aplicativo)
                </label>
                <input
                  type="text"
                  value={formMetaAppId}
                  onChange={e => setFormMetaAppId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 987654321098765"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Credenciais Secretas (Criptografadas no servidor) */}
            <div className="space-y-3.5 text-xs bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Credenciais de Autenticação (armazenadas criptografadas no servidor)</span>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-300">
                    Access Token (Token Permanente de Usuário do Sistema ou Token Temporário) *
                  </label>
                  {config?.hasAccessToken && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Salvo: {config.accessTokenMasked}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleClearSecret('accessToken')}
                        className="text-[10px] text-red-400 hover:text-red-300 underline"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showAccessToken ? 'text' : 'password'}
                    value={formAccessToken}
                    onChange={e => setFormAccessToken(e.target.value)}
                    placeholder={
                      config?.hasAccessToken
                        ? 'Deixe em branco para manter o token atual ou cole um novo token para substituir...'
                        : 'Cole aqui o token EAAG... gerado no Meta Developers / Business Manager'
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessToken(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    title="Mostrar/ocultar"
                  >
                    {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-300">
                    App Secret (Chave Secreta do App — para assinatura HMAC do Webhook)
                  </label>
                  {config?.hasAppSecret && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Salvo: {config.appSecretMasked}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleClearSecret('appSecret')}
                        className="text-[10px] text-red-400 hover:text-red-300 underline"
                      >
                        Limpar
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showAppSecret ? 'text' : 'password'}
                    value={formAppSecret}
                    onChange={e => setFormAppSecret(e.target.value)}
                    placeholder={
                      config?.hasAppSecret
                        ? 'Deixe em branco para manter o App Secret atual ou cole um novo...'
                        : 'Cole a Chave Secreta do Aplicativo (Configurações Básicas na Meta)'
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3 pr-10 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppSecret(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Identificação do Perfil & Número de Teste */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Nome de Exibição (Perfil)</label>
                <input
                  type="text"
                  value={formNomePerfil}
                  onChange={e => setFormNomePerfil(e.target.value)}
                  placeholder="Ex: Armeria PCMG"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Número Oficial Exibido</label>
                <input
                  type="text"
                  value={formNumeroExibicao}
                  onChange={e => setFormNumeroExibicao(e.target.value)}
                  placeholder="Ex: +55 31 99999-0000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Nº Padrão p/ Testes (DDI+DDD)</label>
                <input
                  type="text"
                  value={formNumeroTeste}
                  onChange={e => setFormNumeroTeste(e.target.value.replace(/\D/g, ''))}
                  placeholder="5531999990000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Webhook Configuration */}
            <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 text-cyan-300 font-black uppercase">
                <Webhook className="w-4 h-4" />
                <span>Configuração do Webhook (para copiar no Painel Meta Developers)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Domínio Público Base (opcional)</label>
                  <input
                    type="url"
                    value={formCallbackPublica}
                    onChange={e => setFormCallbackPublica(e.target.value)}
                    placeholder={window.location.origin}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Verify Token (Token de Verificação)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={formVerifyToken}
                      onChange={e => setFormVerifyToken(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setFormVerifyToken(generateSecureToken())}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold shrink-0"
                      title="Gerar novo token aleatório"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('verifyToken', formVerifyToken)}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold shrink-0"
                      title="Copiar Verify Token"
                    >
                      {copiedKey === 'verifyToken' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-400 block mb-1">URL de Callback do Webhook (cole na Meta)</label>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                  <code className="flex-1 text-cyan-300 font-mono text-[11px] truncate">{computedWebhookUrl}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('webhookUrl', computedWebhookUrl)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-bold text-[11px] flex items-center gap-1 shrink-0"
                  >
                    {copiedKey === 'webhookUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'webhookUrl' ? 'Copiado' : 'Copiar URL'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  No painel Meta Developers → WhatsApp → Configuração → Webhook, cadastre a URL acima, o Verify Token e
                  assine o campo <code className="text-slate-300">messages</code>.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                <div>
                  <label className="font-bold text-slate-400 block mb-1">
                    URL dos Termos de Serviço (cole em Meta Developers → Configurações do App → Básico)
                  </label>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                    <code className="flex-1 text-emerald-300 font-mono text-[11px] truncate">{computedTermsUrl}</code>
                    <a
                      href="/termos-de-servico"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy('termsUrl', computedTermsUrl)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'termsUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'termsUrl' ? 'Copiado' : 'Copiar URL'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-400 block mb-1">
                    URL da Política de Privacidade (opcional/complementar no Painel Meta Developers)
                  </label>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                    <code className="flex-1 text-sky-300 font-mono text-[11px] truncate">{computedPrivacyUrl}</code>
                    <a
                      href="/politica-de-privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy('privacyUrl', computedPrivacyUrl)}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 font-bold text-[11px] flex items-center gap-1 shrink-0"
                    >
                      {copiedKey === 'privacyUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'privacyUrl' ? 'Copiado' : 'Copiar URL'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Integração Bidirecional com a Plataforma Make.com */}
            <div className="bg-slate-950/75 border border-violet-500/35 rounded-xl p-4 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-violet-300 font-black uppercase">
                  <Sparkles className="w-4 h-4" />
                  <span>Integração com Make.com (Automação Bidirecional)</span>
                </div>
                {config && config.makeUltimoTesteStatus !== 'NAO_TESTADO' && renderStatusBadge(config.makeUltimoTesteStatus)}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                O Webhook oficial da Meta recebe e valida as mensagens com assinatura HMAC, deduplica reenvios e
                encaminha o JSON enriquecido (com os dados do policial no sistema) para o seu cenário no{' '}
                <strong className="text-violet-300">Make.com</strong>.
              </p>

              {/* Modo de Atendimento */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">Modo de Atendimento ao Receber Mensagem</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'BOT_INTERNO' as WhatsappModoAtendimento, label: 'Bot Interno', desc: 'Apenas bot nativo' },
                    { id: 'MAKE' as WhatsappModoAtendimento, label: 'Somente Make.com', desc: 'Automação no Make' },
                    { id: 'AMBOS' as WhatsappModoAtendimento, label: 'Make + Bot Interno', desc: 'Ambos simultâneos' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setFormModoAtendimento(opt.id);
                        if (opt.id !== 'BOT_INTERNO') setFormMakeWebhookAtivo(true);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        formModoAtendimento === opt.id
                          ? 'bg-violet-500/20 border-violet-400 text-violet-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-black text-[11px]">{opt.label}</div>
                      <div className="text-[10px] opacity-80">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Direção 1: Sistema -> Make (Custom Webhook) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">1. Sistema → Make.com (Gatilho Custom Webhook)</span>
                  <button
                    type="button"
                    onClick={() => setFormMakeWebhookAtivo(v => !v)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black border transition ${
                      formMakeWebhookAtivo
                        ? 'bg-violet-500 text-slate-950 border-violet-400'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {formMakeWebhookAtivo ? 'ENCAMINHAMENTO ATIVO' : 'ENCAMINHAMENTO PAUSADO'}
                  </button>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    URL do Custom Webhook do Make.com (ex: https://hook.us2.make.com/...)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={formMakeWebhookUrl}
                      onChange={e => setFormMakeWebhookUrl(e.target.value)}
                      placeholder="https://hook.us2.make.com/xxxxxxxxxxxxxxxxxxxx"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      disabled={testingMakeWebhook || !formMakeWebhookUrl.trim()}
                      onClick={() => handleTestMakeWebhook()}
                      className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-[11px] flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{testingMakeWebhook ? 'Enviando...' : 'Testar Webhook Make'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={testingMakeWebhook || !formMakeWebhookUrl.trim()}
                      onClick={() => handleTestMakeWebhook({ minimal: true, skipSecret: true })}
                      title="Envia POST puro com Content-Type: application/json, sem headers de autenticação e corpo mínimo WhatsApp"
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 font-bold text-[11px] shrink-0"
                    >
                      POST Mínimo (sem auth)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Dica: No Make, use o módulo <strong>Webhooks → Custom Webhook</strong>, clique em{' '}
                    <strong>Redetermine data structure</strong> e depois em <strong>Testar Webhook Make</strong>. Quando o campo de API Key abaixo está vazio, o envio é feito como <code>POST</code> limpo sem headers de autenticação.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="font-bold text-slate-300">API Key do Webhook Make — header x-make-apikey (opcional)</label>
                      {config?.hasMakeWebhookSecret && (
                        <button
                          type="button"
                          onClick={() => handleClearSecret('makeWebhookSecret')}
                          className="text-[10px] text-red-400 hover:text-red-300 underline"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showMakeWebhookSecret ? 'text' : 'password'}
                        value={formMakeWebhookSecret}
                        onChange={e => setFormMakeWebhookSecret(e.target.value)}
                        placeholder={
                          config?.hasMakeWebhookSecret
                            ? `Salvo (${config.makeWebhookSecretMasked}) — deixe vazio para manter`
                            : 'Deixe vazio se o Custom Webhook estiver sem API Key no Make'
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-slate-100 font-mono focus:outline-none focus:border-violet-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMakeWebhookSecret(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showMakeWebhookSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formMakeEncaminharStatus}
                      onChange={e => setFormMakeEncaminharStatus(e.target.checked)}
                      className="rounded border-slate-600 text-violet-500"
                    />
                    <span className="text-[11px] text-slate-300 font-semibold">
                      Também encaminhar status (entregue/lida)
                    </span>
                  </label>
                </div>

                {config?.makeUltimoTesteMensagem && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] ${
                      config.makeUltimoTesteStatus === 'CONECTADO'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    {config.makeUltimoTesteMensagem}
                  </div>
                )}
              </div>

              {/* Direção 2: Make -> Sistema (HTTP Request Modules) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">2. Make.com → Sistema (Módulo HTTP Request)</span>
                  <div className="flex items-center gap-2">
                    {config?.hasMakeApiKey && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Chave ativa: {config.makeApiKeyMasked}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={generatingMakeApiKey}
                      onClick={handleGenerateMakeApiKey}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Key className="w-3 h-3" />
                      <span>{generatingMakeApiKey ? 'Gerando...' : config?.hasMakeApiKey ? 'Rotacionar API Key' : 'Gerar API Key'}</span>
                    </button>
                  </div>
                </div>

                {newlyGeneratedMakeApiKey && (
                  <div className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] font-black text-amber-300 uppercase">
                      Copie agora sua API Key (exibida apenas uma vez) — Header: X-Make-Api-Key
                    </div>
                    <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                      <code className="flex-1 text-amber-200 font-mono text-[11px] break-all">
                        {newlyGeneratedMakeApiKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy('makeApiKey', newlyGeneratedMakeApiKey)}
                        className="px-2 py-1 rounded bg-amber-500 text-slate-950 font-black text-[10px] shrink-0"
                      >
                        {copiedKey === 'makeApiKey' ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-[11px]">
                  {[
                    { key: 'mkEnviar', method: 'POST', label: 'Enviar mensagem WhatsApp (text/template/buttons/list/document)', url: computedMakeEnviarUrl },
                    { key: 'mkUsuario', method: 'POST', label: 'Consultar policial por telefone (JSON: {"phone":"..."})', url: computedMakeUsuarioUrl },
                    { key: 'mkStatus', method: 'GET', label: 'Validar autenticação e status da integração', url: computedMakeStatusUrl }
                  ].map(ep => (
                    <div key={ep.key} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 space-y-0.5">
                      <div className="text-[10px] text-slate-400">{ep.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono font-black text-[9px]">
                          {ep.method}
                        </span>
                        <code className="flex-1 text-cyan-300 font-mono text-[10px] truncate">{ep.url}</code>
                        <button
                          type="button"
                          onClick={() => handleCopy(ep.key, ep.url)}
                          className="text-cyan-300 hover:text-white text-[10px] font-bold shrink-0"
                        >
                          {copiedKey === ep.key ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="text-[11px] text-slate-500">
                {config?.updatedAt
                  ? `Última atualização: ${formatDateTimeBr(config.updatedAt)}${
                      config.atualizadoPorNome ? ` por ${config.atualizadoPorNome}` : ''
                    }`
                  : 'Nenhuma atualização salva ainda.'}
              </div>
              <button
                type="submit"
                disabled={savingConfig}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-2 shadow transition"
              >
                <Save className="w-4 h-4" />
                <span>{savingConfig ? 'Salvando...' : 'Salvar Configurações da API'}</span>
              </button>
            </div>
          </form>

          {/* Coluna Direita: Diagnóstico, Teste de Conexão e Disparo de Mensagem de Teste */}
          <div className="xl:col-span-5 space-y-5">
            {/* Cartão 1: Teste de Conexão */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-100 uppercase flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Validação de Conexão com a Meta</span>
                </h3>
                {config && renderStatusBadge(config.ultimoTesteStatus)}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="text-slate-400">
                  Último diagnóstico:{' '}
                  <strong className="text-slate-200">{formatDateTimeBr(config?.ultimoTesteEm)}</strong>
                </div>
                <p
                  className={`font-medium leading-relaxed ${
                    config?.ultimoTesteStatus === 'CONECTADO'
                      ? 'text-emerald-300'
                      : config?.ultimoTesteStatus === 'ERRO'
                      ? 'text-red-300'
                      : 'text-slate-400'
                  }`}
                >
                  {config?.ultimoTesteMensagem ||
                    'Salve o Phone Number ID e o Access Token ao lado e clique no botão abaixo para validar a comunicação com graph.facebook.com.'}
                </p>
              </div>

              <button
                type="button"
                disabled={testingConn}
                onClick={handleTestConnection}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 transition"
              >
                <RefreshCw className={`w-4 h-4 ${testingConn ? 'animate-spin' : ''}`} />
                <span>{testingConn ? 'Validando na Meta Graph API...' : 'Testar Conexão com a API Meta'}</span>
              </button>
            </div>

            {/* Cartão 1B: Diagnóstico Completo do Webhook (Meta + Make) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-cyan-300 uppercase flex items-center gap-2">
                  <Webhook className="w-4 h-4" />
                  <span>Diagnóstico do Webhook (Meta + Make)</span>
                </h3>
                {webhookDiagnostics && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                      webhookDiagnostics.overall === 'OK'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : webhookDiagnostics.overall === 'WARN'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-red-500/15 border-red-500/40 text-red-300'
                    }`}
                  >
                    {webhookDiagnostics.overall === 'OK'
                      ? '100% PRONTO'
                      : webhookDiagnostics.overall === 'WARN'
                      ? 'COM ALERTAS'
                      : 'PENDÊNCIAS'}
                  </span>
                )}
              </div>

              {webhookDiagnostics ? (
                <div className="space-y-2 text-[11px]">
                  {webhookDiagnostics.checks.map(chk => (
                    <div
                      key={chk.key}
                      className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                        chk.status === 'ok'
                          ? 'bg-emerald-500/5 border-emerald-500/25 text-emerald-200'
                          : chk.status === 'warn'
                          ? 'bg-amber-500/5 border-amber-500/25 text-amber-200'
                          : 'bg-red-500/10 border-red-500/30 text-red-200'
                      }`}
                    >
                      {chk.status === 'ok' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : chk.status === 'warn' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">{chk.label}</div>
                        <div className="text-[10px] opacity-85 mt-0.5 break-all">{chk.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Clique abaixo para auditar a URL HTTPS, Verify Token, assinatura HMAC, credenciais Meta e conexão com
                  o Make.com.
                </p>
              )}

              <button
                type="button"
                disabled={checkingWebhookHealth}
                onClick={handleCheckWebhookHealth}
                className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{checkingWebhookHealth ? 'Verificando configurações...' : 'Verificar Saúde do Webhook'}</span>
              </button>
            </div>

            {/* Cartão 2: Envio Real de Mensagem de Teste */}
            <form
              onSubmit={handleSendTestMessage}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs"
            >
              <div>
                <h3 className="text-sm font-black text-amber-300 uppercase flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  <span>Enviar Mensagem de Teste Real</span>
                </h3>
                <p className="text-slate-400 mt-0.5">
                  No ambiente de teste (Sandbox Meta), cadastre seu celular na lista de destinatários autorizados na Meta
                  e utilize o template padrão <code className="text-amber-300">hello_world</code> (<code className="text-amber-300">en_US</code>).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTestMode('template')}
                  className={`py-2 rounded-xl font-bold border transition ${
                    testMode === 'template'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  Por Template (Recomendado)
                </button>
                <button
                  type="button"
                  onClick={() => setTestMode('text')}
                  className={`py-2 rounded-xl font-bold border transition ${
                    testMode === 'text'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  Texto Livre (Janela 24h)
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Número de Destino com DDI + DDD *
                </label>
                <input
                  type="text"
                  required
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 5531999990000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {testMode === 'template' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Nome da Template</label>
                      <input
                        type="text"
                        value={testTemplateName}
                        onChange={e => setTestTemplateName(e.target.value)}
                        placeholder="hello_world"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-300 block mb-1">Idioma</label>
                      <select
                        value={testTemplateLang}
                        onChange={e => setTestTemplateLang(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                      >
                        {IDIOMA_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.value}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">
                      Parâmetros do Corpo (separados por <code className="text-amber-300">;</code> — opcional)
                    </label>
                    <input
                      type="text"
                      value={testTemplateVars}
                      onChange={e => setTestTemplateVars(e.target.value)}
                      placeholder="Ex: Policial Silva; Cautela #1024"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Mensagem de Texto</label>
                  <textarea
                    rows={3}
                    value={testFreeText}
                    onChange={e => setTestFreeText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100"
                  />
                </div>
              )}

              {lastTestDispatchResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    lastTestDispatchResult.ok
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                      : 'bg-red-500/10 border-red-500/40 text-red-200'
                  }`}
                >
                  <div className="font-bold">{lastTestDispatchResult.message}</div>
                  {lastTestDispatchResult.wamid && (
                    <div className="font-mono text-[10px] text-emerald-300 mt-1 break-all">
                      wamid: {lastTestDispatchResult.wamid}
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={sendingTest}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                <span>{sendingTest ? 'Enviando...' : 'Disparar Mensagem de Teste'}</span>
              </button>
            </form>

            {/* Guia Teste -> Produção */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 text-xs space-y-1.5 text-slate-400">
              <div className="font-black text-slate-200 uppercase text-[11px]">
                Troca de Teste (Sandbox) para Produção
              </div>
              <p>
                Quando os testes estiverem aprovados, basta voltar a esta aba, alterar o ambiente para{' '}
                <strong className="text-emerald-300">Produção</strong>, atualizar o{' '}
                <strong className="text-slate-200">Phone Number ID</strong> definitivo, colar o{' '}
                <strong className="text-slate-200">Token Permanente</strong> do Usuário do Sistema no Meta Business
                Manager e salvar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 2: CONFIGURAÇÃO DAS TEMPLATES                                     */}
      {/* ===================================================================== */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="Buscar template por nome, texto ou status..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={syncingTemplates}
                onClick={handleSyncMetaTemplates}
                className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-4 h-4 ${syncingTemplates ? 'animate-spin' : ''}`} />
                <span>{syncingTemplates ? 'Sincronizando...' : 'Sincronizar da Meta (WABA)'}</span>
              </button>
              <button
                type="button"
                onClick={openCreateTemplateModal}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Template</span>
              </button>
            </div>
          </div>

          {loadingTemplates ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-xs text-slate-400">
              Carregando templates...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <FileText className="w-9 h-9 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Nenhuma template encontrada.</p>
              <p className="text-xs text-slate-500">
                Crie uma nova template local ou clique em &quot;Sincronizar da Meta&quot; para importar os modelos já
                aprovados na sua conta WhatsApp Business.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTemplates.map(tpl => (
                <div
                  key={tpl.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-black text-xs text-emerald-300 truncate">{tpl.nome}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {tpl.idioma} • {tpl.categoria} • {tpl.origem === 'META_SYNC' ? 'Meta Sync' : 'Local'}
                        </div>
                      </div>
                      {renderStatusBadge(tpl.statusMeta)}
                    </div>

                    {/* Preview estilo balão WhatsApp */}
                    <div className="bg-emerald-950/40 border border-emerald-500/25 rounded-xl p-3 space-y-1.5 text-xs">
                      {tpl.cabecalhoTipo === 'TEXT' && tpl.cabecalhoTexto && (
                        <div className="font-black text-white text-[11px]">{tpl.cabecalhoTexto}</div>
                      )}
                      {tpl.cabecalhoTipo !== 'NONE' && tpl.cabecalhoTipo !== 'TEXT' && (
                        <div className="text-[10px] font-mono uppercase text-emerald-400">
                          [Cabeçalho: {tpl.cabecalhoTipo}]
                        </div>
                      )}
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed text-[11.5px]">
                        {tpl.corpoTexto}
                      </p>
                      {tpl.rodapeTexto && (
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-emerald-500/15">
                          {tpl.rodapeTexto}
                        </div>
                      )}
                      {tpl.botoes && tpl.botoes.length > 0 && (
                        <div className="pt-2 mt-1.5 border-t border-emerald-500/20 flex flex-col gap-1">
                          {tpl.botoes.map((btn, idx) => (
                            <div
                              key={`${tpl.id}-btn-${idx}`}
                              className="w-full py-1.5 px-2.5 rounded-lg bg-slate-900/80 border border-emerald-500/30 text-center text-[11px] font-bold text-emerald-300"
                            >
                              {btn.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {tpl.variaveisExemplo.length > 0 && (
                      <div className="text-[10px] text-slate-400">
                        Variáveis ({countTemplatePlaceholders(tpl.corpoTexto)}):{' '}
                        <span className="text-slate-300">{tpl.variaveisExemplo.join(' | ')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setTestMode('template');
                          setTestTemplateName(tpl.nome);
                          setTestTemplateLang(tpl.idioma);
                          setTestTemplateVars((tpl.variaveisExemplo || []).join('; '));
                          setActiveTab('config-api');
                          notifySuccess(`Template "${tpl.nome}" carregada no painel de teste da API.`);
                        }}
                        className="text-amber-300 hover:text-amber-200 font-bold text-[11px] flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Usar no Teste</span>
                      </button>

                      {tpl.statusMeta === 'RASCUNHO' && (
                        <button
                          type="button"
                          disabled={submittingTplId === tpl.id}
                          onClick={() => handleSubmitTemplateToMeta(tpl)}
                          className="text-cyan-300 hover:text-cyan-200 disabled:opacity-50 font-bold text-[11px] flex items-center gap-1"
                          title="Enviar esta template com botões para aprovação na Meta"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>{submittingTplId === tpl.id ? 'Enviando...' : 'Enviar p/ Meta'}</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {confirmDeleteTplId === tpl.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            className="px-2 py-1 rounded-lg bg-red-600 text-white font-bold text-[11px]"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTplId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                          >
                            Não
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditTemplateModal(tpl)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300"
                            title="Editar template"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTplId(tpl.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400"
                            title="Excluir template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ABA 3: CONFIGURAÇÃO DA COMUNICAÇÃO                                    */}
      {/* ===================================================================== */}
      {activeTab === 'comunicacao' && (
        <div className="space-y-5">
          {/* Seção 0: Fluxo Interativo Automático & Simulador Real com PDF */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Mapa Visual do Fluxo de Atendimento */}
            <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-emerald-300 uppercase flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    <span>Fluxo Interativo do Atendimento</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Respondido automaticamente via Webhook oficial quando um cliente envia mensagem no WhatsApp.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="bg-slate-950/90 border border-emerald-500/35 rounded-xl p-3 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-emerald-400">
                    1. Mensagem Inicial → Central Operacional — PCMG
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Identifica o policial pelo telefone cadastrado e exibe o menu interativo principal:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 font-bold">
                      Operações
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold">
                      Treinamentos
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold">
                      Armaria
                    </span>
                  </div>
                </div>

                <div className="pl-3 space-y-2 border-l-2 border-emerald-500/30 ml-2">
                  <div className="bg-slate-950/80 border border-cyan-500/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-cyan-300">
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>2A. Operações &amp; Treinamentos (mesma lógica)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Oferece <strong className="text-cyan-200">Relatórios Por data</strong> (<em>DIA/MÊS/ANO</em>,{' '}
                      <em>MÊS/ANO</em> ou <em>ANO</em>) e <strong className="text-cyan-200">Relat. últimas 24h</strong>,
                      filtrando pela(s) unidade(s) permitida(s) ao perfil (ou{' '}
                      <strong className="text-emerald-300">Todas as Unidades</strong>) com envio de PDF individual ou
                      consolidado.
                    </p>
                  </div>

                  <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-300">
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>2B. Armaria (4 sub-opções)</span>
                    </div>
                    <ul className="text-[11px] text-slate-400 leading-relaxed space-y-1">
                      <li>
                        • <strong className="text-slate-200">Solicitar Cautelas / Devolver Cautelas:</strong> gera link
                        de sessão web temporária (30 min) autenticada para o policial.
                      </li>
                      <li>
                        • <strong className="text-slate-200">Recibos:</strong> emite PDF de recibos de Armas, Munições
                        e Materiais (próprios ou de outro policial para Armeiro/Admin).
                      </li>
                      <li>
                        • <strong className="text-slate-200">Relatórios:</strong> escolhe unidade (ou Todas) e período
                        (<em>Últimas 24h</em>, <em>Última semana</em>, <em>Mês atual</em> ou <em>Ano atual</em>) para
                        receber o PDF consolidado de cautelas.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulador Interativo em Tempo Real */}
            <div className="xl:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>Simulador Interativo do Bot (Dados Reais + PDF Real)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Teste o fluxo completo com as permissões reais de qualquer usuário cadastrado.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={simAsUserId}
                    onChange={e => {
                      const nextId = e.target.value;
                      setSimAsUserId(nextId);
                      handleResetSimulation(nextId);
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-100 max-w-[230px]"
                    title="Simular permissões como usuário"
                  >
                    <option value={currentUser.id}>
                      Você ({currentUser.name} — {currentUser.role})
                    </option>
                    {allUsers
                      .filter(u => u.id !== currentUser.id)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                  </select>
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-cyan-300">
                    Etapa: {simEtapa}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleResetSimulation()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reiniciar</span>
                  </button>
                </div>
              </div>

              {/* Área do Chat estilo WhatsApp */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 h-[360px] overflow-y-auto space-y-3">
                {simMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-3 px-4">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <Bot className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-200">
                        Envie uma mensagem para iniciar o atendimento interativo
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Clique no botão abaixo para simular o usuário enviando &quot;Olá&quot; e testar Operações,
                        Treinamentos e Armaria com PDFs reais.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={simLoading}
                      onClick={() => sendBotSimulation({ displayLabel: 'Olá', text: 'Olá' })}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Simular Mensagem &quot;Olá&quot;</span>
                    </button>
                  </div>
                ) : (
                  simMessages.map(entry =>
                    entry.sender === 'client' ? (
                      <div key={entry.id} className="flex justify-end">
                        <div className="max-w-[80%] bg-emerald-600/25 border border-emerald-500/40 rounded-2xl rounded-tr-sm px-3.5 py-2 text-xs text-emerald-50">
                          <div>{entry.text}</div>
                          <div className="text-[9px] text-emerald-300/70 text-right mt-0.5">{entry.time}</div>
                        </div>
                      </div>
                    ) : (
                      <div key={entry.id} className="flex justify-start">
                        <div className="max-w-[88%] bg-slate-900 border border-slate-700/80 rounded-2xl rounded-tl-sm p-3 text-xs space-y-2">
                          {entry.reply?.header && (
                            <div className="font-black text-white text-[11.5px]">{entry.reply.header}</div>
                          )}

                          {/* Cartão de PDF para Download Real */}
                          {entry.reply?.kind === 'document' && entry.reply.documentDownloadUrl ? (
                            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-3 space-y-2">
                              <div className="flex items-start gap-2.5">
                                <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/35 text-red-400 shrink-0">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-mono font-bold text-[11px] text-emerald-300 break-all">
                                    {entry.reply.documentFilename || 'Relatorio.pdf'}
                                  </div>
                                  <p className="text-[11px] text-slate-300 mt-0.5">{entry.reply.body}</p>
                                </div>
                              </div>
                              <a
                                href={entry.reply.documentDownloadUrl}
                                download={entry.reply.documentFilename || 'relatorio.pdf'}
                                className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center justify-center gap-1.5 transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Baixar PDF Real Gerado</span>
                              </a>
                            </div>
                          ) : entry.reply?.kind === 'link' && entry.reply.actionUrl ? (
                            <div className="bg-slate-950 border border-amber-500/40 rounded-xl p-3 space-y-2.5">
                              <div className="text-slate-200 whitespace-pre-wrap leading-relaxed text-[11.5px]">
                                {entry.reply.body}
                              </div>
                              <a
                                href={entry.reply.actionUrl}
                                className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] flex items-center justify-center gap-1.5 transition"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>{entry.reply.actionLabel || 'Abrir Página Temporária'}</span>
                              </a>
                            </div>
                          ) : (
                            <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                              {entry.reply?.body}
                            </div>
                          )}

                          {entry.reply?.footer && (
                            <div className="text-[10px] text-slate-400">{entry.reply.footer}</div>
                          )}

                          {/* Botões Interativos Clicáveis */}
                          {entry.reply?.kind === 'buttons' && entry.reply.buttons && (
                            <div className="pt-1.5 border-t border-slate-800 flex flex-col gap-1.5">
                              {entry.reply.buttons.map(btn => (
                                <button
                                  key={btn.id}
                                  type="button"
                                  disabled={simLoading}
                                  onClick={() =>
                                    sendBotSimulation({
                                      displayLabel: btn.title,
                                      buttonId: btn.id,
                                      buttonTitle: btn.title
                                    })
                                  }
                                  className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-400/60 text-emerald-300 font-bold text-[11.5px] transition text-center"
                                >
                                  {btn.title}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Lista Interativa Clicável */}
                          {entry.reply?.kind === 'list' && entry.reply.listRows && (
                            <div className="pt-1.5 border-t border-slate-800 space-y-1.5">
                              <button
                                type="button"
                                onClick={() => setOpenListMsgId(prev => (prev === entry.id ? null : entry.id))}
                                className="w-full py-1.5 px-3 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold text-[11.5px] flex items-center justify-center gap-1.5 transition"
                              >
                                <List className="w-3.5 h-3.5" />
                                <span>
                                  {entry.reply.listButtonText || 'Abrir Lista'} ({entry.reply.listRows.length})
                                </span>
                              </button>

                              {openListMsgId === entry.id && (
                                <div className="bg-slate-950 border border-slate-700 rounded-xl divide-y divide-slate-800 overflow-hidden">
                                  {entry.reply.listRows.map(row => (
                                    <button
                                      key={row.id}
                                      type="button"
                                      disabled={simLoading}
                                      onClick={() =>
                                        sendBotSimulation({
                                          displayLabel: row.title,
                                          listRowId: row.id,
                                          listRowTitle: row.title
                                        })
                                      }
                                      className="w-full text-left px-3 py-2 hover:bg-emerald-500/15 transition"
                                    >
                                      <div className="font-bold text-emerald-300 text-[11px]">{row.title}</div>
                                      {row.description && (
                                        <div className="text-[10px] text-slate-400 truncate">{row.description}</div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="text-[9px] text-slate-500 text-right">{entry.time}</div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>

              {/* Input de mensagem livre no simulador (para digitar datas DD/MM/AAAA, MM/AAAA, AAAA ou texto) */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const clean = simInput.trim();
                  if (!clean || simLoading) return;
                  setSimInput('');
                  sendBotSimulation({ displayLabel: clean, text: clean });
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={simInput}
                  onChange={e => setSimInput(e.target.value)}
                  placeholder='Digite uma mensagem (ex: "Olá", "24/11/2026", "11/2026", "2026")...'
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={simLoading || !simInput.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{simLoading ? '...' : 'Enviar'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Seção 1: Regras de Disparo Automático */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-emerald-300 uppercase flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  <span>Regras de Comunicação Automática por Evento</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Defina quais eventos do sistema disparam notificações via WhatsApp, qual template utilizar e os horários
                  permitidos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNovaRegraModal(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Regra</span>
              </button>
            </div>

            <div className="space-y-3">
              {regras.map(regra => (
                <div
                  key={regra.id}
                  className={`border rounded-xl p-4 space-y-3 transition ${
                    regra.ativo
                      ? 'bg-slate-950/90 border-emerald-500/35'
                      : 'bg-slate-950/50 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-xs text-white">{regra.nomeExibicao}</span>
                        <code className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                          {regra.eventoSistema}
                        </code>
                      </div>
                      {regra.descricao && <p className="text-[11px] text-slate-400 mt-0.5">{regra.descricao}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateRegraLocal(regra.id, { ativo: !regra.ativo })}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition ${
                          regra.ativo
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {regra.ativo ? 'Ativa' : 'Inativa'}
                      </button>
                      <button
                        type="button"
                        disabled={savingRegraId === regra.id}
                        onClick={() => handleSaveRegra(regra)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingRegraId === regra.id ? 'Salvando...' : 'Salvar'}</span>
                      </button>
                      {!regra.id.startsWith('wpp-regra-0') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteRegra(regra.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400"
                          title="Excluir regra personalizada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Template Vinculada
                      </label>
                      <select
                        value={regra.templateId || ''}
                        onChange={e => handleUpdateRegraLocal(regra.id, { templateId: e.target.value || null })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      >
                        <option value="">Selecione uma template...</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.nome} ({t.idioma}) — {t.statusMeta}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Destinatário</label>
                      <select
                        value={regra.destinatarioTipo}
                        onChange={e =>
                          handleUpdateRegraLocal(regra.id, {
                            destinatarioTipo: e.target.value as WhatsappDestinatarioTipo
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                      >
                        {(Object.keys(DESTINATARIO_LABELS) as WhatsappDestinatarioTipo[]).map(k => (
                          <option key={k} value={k}>
                            {DESTINATARIO_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {regra.destinatarioTipo === 'NUMERO_FIXO' ? (
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Número Fixo (DDI+DDD)
                        </label>
                        <input
                          type="text"
                          value={regra.numeroDestinoFixo || ''}
                          onChange={e =>
                            handleUpdateRegraLocal(regra.id, {
                              numeroDestinoFixo: e.target.value.replace(/\D/g, '')
                            })
                          }
                          placeholder="5531999990000"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Janela de Envio (Início — Fim)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={regra.horarioInicio}
                            onChange={e => handleUpdateRegraLocal(regra.id, { horarioInicio: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                          />
                          <span className="text-slate-500">às</span>
                          <input
                            type="time"
                            value={regra.horarioFim}
                            onChange={e => handleUpdateRegraLocal(regra.id, { horarioFim: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-100"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Mapeamento de Variáveis (;)
                      </label>
                      <input
                        type="text"
                        value={(regra.mapeamentoVariaveis || []).join('; ')}
                        onChange={e =>
                          handleUpdateRegraLocal(regra.id, {
                            mapeamentoVariaveis: e.target.value
                              .split(';')
                              .map(s => s.trim())
                              .filter(Boolean)
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seção 2: Disparo Manual Rápido + Logs de Comunicação e Webhooks */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <form
              onSubmit={handleSendManual}
              className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3.5 text-xs h-fit"
            >
              <h3 className="text-sm font-black text-amber-300 uppercase flex items-center gap-2">
                <Send className="w-4 h-4" />
                <span>Envio Manual pela API Oficial</span>
              </h3>

              <div>
                <label className="font-bold text-slate-300 block mb-1 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Vincular a Usuário do Sistema (opcional)</span>
                </label>
                <select
                  value={manualUserId}
                  onChange={e => {
                    const uid = e.target.value;
                    setManualUserId(uid);
                    const u = allUsers.find(usr => usr.id === uid);
                    if (u?.phone) {
                      const digits = u.phone.replace(/\D/g, '');
                      setManualPhone(digits.startsWith('55') ? digits : `55${digits}`);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                >
                  <option value="">Digitar número manualmente...</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.phone ? `(${u.phone})` : '(sem telefone)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">Telefone Destino (DDI + DDD) *</label>
                <input
                  type="text"
                  required
                  value={manualPhone}
                  onChange={e => setManualPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="5531999990000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setManualMode('template')}
                  className={`py-2 rounded-xl font-bold border ${
                    manualMode === 'template'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  Template
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode('text')}
                  className={`py-2 rounded-xl font-bold border ${
                    manualMode === 'text'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  Texto Livre
                </button>
              </div>

              {manualMode === 'template' ? (
                <>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Template *</label>
                    <select
                      value={manualTemplateId}
                      onChange={e => setManualTemplateId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    >
                      <option value="">Selecione uma template...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.nome} ({t.idioma}) — {t.statusMeta}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">
                      Parâmetros da Template (separados por ;)
                    </label>
                    <input
                      type="text"
                      value={manualVarsText}
                      onChange={e => setManualVarsText(e.target.value)}
                      placeholder="Ex: João Silva; Relatório #42"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Texto da Mensagem *</label>
                  <textarea
                    rows={3}
                    value={manualTextBody}
                    onChange={e => setManualTextBody(e.target.value)}
                    placeholder="Digite a mensagem..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={sendingManual}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{sendingManual ? 'Enviando...' : 'Enviar Mensagem Agora'}</span>
              </button>
            </form>

            {/* Histórico de Mensagens & Webhooks */}
            <div className="xl:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLogSubTab('mensagens')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      logSubTab === 'mensagens' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mensagens ({mensagens.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogSubTab('webhooks')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      logSubTab === 'webhooks' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Eventos de Webhook ({webhookEventos.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={loadComunicacao}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingComunicacao ? 'animate-spin' : ''}`} />
                  <span>Atualizar</span>
                </button>
              </div>

              {logSubTab === 'mensagens' ? (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {mensagens.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Nenhuma mensagem registrada ainda. Faça um envio de teste para visualizar o log completo aqui.
                    </div>
                  ) : (
                    mensagens.map(m => (
                      <div key={m.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                m.direcao === 'ENTRADA'
                                  ? 'bg-cyan-500/20 text-cyan-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {m.direcao}
                            </span>
                            <span className="font-mono font-bold text-slate-100">
                              {m.direcao === 'ENTRADA' ? m.telefoneOrigem : m.telefoneDestino}
                            </span>
                            {m.usuarioDestinoNome && (
                              <span className="text-slate-400">({m.usuarioDestinoNome})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {renderStatusBadge(m.statusEntrega)}
                            <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTimeBr(m.createdAt)}
                            </span>
                          </div>
                        </div>

                        {m.conteudoResumo && <div className="text-slate-300">{m.conteudoResumo}</div>}

                        {m.erroMensagem && (
                          <div className="text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-2.5 py-1.5 text-[11px] flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              {m.erroCodigo ? `[${m.erroCodigo}] ` : ''}
                              {m.erroMensagem}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                          <span>
                            {m.templateNome ? `Template: ${m.templateNome}` : `Tipo: ${m.tipoMensagem}`}
                            {m.eventoSistema ? ` • Evento: ${m.eventoSistema}` : ''}
                          </span>
                          {m.metaMessageId && (
                            <span className="font-mono text-slate-400 truncate max-w-[240px]">
                              wamid: {m.metaMessageId}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {webhookEventos.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Nenhum evento recebido no Webhook ainda. Configure a Callback URL no painel Meta Developers para
                      receber confirmações de entrega, leitura e respostas.
                    </div>
                  ) : (
                    webhookEventos.map(ev => (
                      <div key={ev.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px] uppercase font-bold">
                              {ev.tipoEvento}
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                ev.assinaturaValida ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {ev.assinaturaValida ? 'Assinatura OK' : 'Assinatura Inválida'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">
                            {formatDateTimeBr(ev.dataRecebimento)}
                          </span>
                        </div>
                        <div className="text-slate-300">{ev.resumo}</div>
                        {ev.payloadJson && (
                          <div>
                            <button
                              type="button"
                              onClick={() => setExpandedWebhookId(prev => (prev === ev.id ? null : ev.id))}
                              className="text-[10px] text-cyan-400 hover:underline font-bold"
                            >
                              {expandedWebhookId === ev.id ? 'Ocultar payload JSON' : 'Ver payload JSON'}
                            </button>
                            {expandedWebhookId === ev.id && (
                              <pre className="mt-1.5 p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300 overflow-x-auto max-h-40">
                                {ev.payloadJson}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar / Editar Template */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-300 uppercase">
                {editingTemplate ? `Editar Template: ${editingTemplate.nome}` : 'Nova Template de WhatsApp'}
              </h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Nome Técnico (snake_case) *</label>
                  <input
                    type="text"
                    required
                    value={tplForm.nome}
                    onChange={e =>
                      setTplForm({
                        ...tplForm,
                        nome: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                      })
                    }
                    placeholder="aviso_cautela_pendente"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Idioma *</label>
                  <select
                    value={tplForm.idioma}
                    onChange={e => setTplForm({ ...tplForm, idioma: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    {IDIOMA_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Categoria Meta *</label>
                  <select
                    value={tplForm.categoria}
                    onChange={e =>
                      setTplForm({ ...tplForm, categoria: e.target.value as WhatsappTemplateCategoria })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="UTILITY">UTILITY (Utilitário / Avisos)</option>
                    <option value="AUTHENTICATION">AUTHENTICATION (Autenticação)</option>
                    <option value="MARKETING">MARKETING</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tipo de Cabeçalho</label>
                  <select
                    value={tplForm.cabecalhoTipo}
                    onChange={e =>
                      setTplForm({ ...tplForm, cabecalhoTipo: e.target.value as WhatsappTemplateHeaderTipo })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="NONE">Sem cabeçalho</option>
                    <option value="TEXT">Texto</option>
                    <option value="IMAGE">Imagem</option>
                    <option value="DOCUMENT">Documento (PDF)</option>
                    <option value="VIDEO">Vídeo</option>
                  </select>
                </div>
                {tplForm.cabecalhoTipo === 'TEXT' && (
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-300 block mb-1">Texto do Cabeçalho</label>
                    <input
                      type="text"
                      maxLength={120}
                      value={tplForm.cabecalhoTexto}
                      onChange={e => setTplForm({ ...tplForm, cabecalhoTexto: e.target.value })}
                      placeholder="Ex: Aviso Oficial — Armeria PCMG"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">
                    Corpo da Mensagem * (use <code className="text-amber-300">{'{{1}}'}</code>,{' '}
                    <code className="text-amber-300">{'{{2}}'}</code> para variáveis)
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">{tplForm.corpoTexto.length} / 1024</span>
                </div>
                <textarea
                  required
                  rows={4}
                  maxLength={1024}
                  value={tplForm.corpoTexto}
                  onChange={e => setTplForm({ ...tplForm, corpoTexto: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Rodapé (opcional)</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={tplForm.rodapeTexto}
                    onChange={e => setTplForm({ ...tplForm, rodapeTexto: e.target.value })}
                    placeholder="Ex: Mensagem automática — não responda"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    Exemplos das Variáveis (separados por ;)
                  </label>
                  <input
                    type="text"
                    value={tplForm.variaveisExemploText}
                    onChange={e => setTplForm({ ...tplForm, variaveisExemploText: e.target.value })}
                    placeholder="Ex: Nome do Policial; Cautela #100"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1">
                  Botões Quick Reply (opcional — até 3 botões separados por <code className="text-amber-300">;</code>)
                </label>
                <input
                  type="text"
                  value={tplForm.botoesText}
                  onChange={e => setTplForm({ ...tplForm, botoesText: e.target.value })}
                  placeholder="Ex: Operações; Treinamentos; Armaria"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>

              {/* Preview */}
              <div className="bg-emerald-950/35 border border-emerald-500/30 rounded-xl p-3.5 space-y-1.5">
                <div className="text-[10px] font-black text-emerald-400 uppercase">Pré-visualização WhatsApp</div>
                {tplForm.cabecalhoTipo === 'TEXT' && tplForm.cabecalhoTexto && (
                  <div className="font-bold text-white">{tplForm.cabecalhoTexto}</div>
                )}
                <div className="text-slate-200 whitespace-pre-wrap">{previewRenderedBody || 'Digite o corpo...'}</div>
                {tplForm.rodapeTexto && <div className="text-[10px] text-slate-400 pt-1">{tplForm.rodapeTexto}</div>}
                {tplForm.botoesText
                  .split(';')
                  .map(s => s.trim())
                  .filter(Boolean)
                  .slice(0, 3).length > 0 && (
                  <div className="pt-2 mt-1 border-t border-emerald-500/25 flex flex-col gap-1">
                    {tplForm.botoesText
                      .split(';')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((label, idx) => (
                        <div
                          key={`preview-btn-${idx}`}
                          className="py-1.5 px-3 rounded-lg bg-slate-900/80 border border-emerald-500/35 text-center text-emerald-300 font-bold text-[11px]"
                        >
                          {label}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {!editingTemplate && (
                <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplForm.enviarParaMeta}
                    onChange={e => setTplForm({ ...tplForm, enviarParaMeta: e.target.checked })}
                    className="rounded border-slate-600 text-emerald-500"
                  />
                  <span className="text-slate-200 font-semibold">
                    Submeter imediatamente para aprovação na Meta Graph API (requer WABA ID e Access Token salvos)
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
                >
                  {savingTemplate ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Regra de Comunicação */}
      {showNovaRegraModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-300 uppercase">Nova Regra de Comunicação</h3>
              <button
                type="button"
                onClick={() => setShowNovaRegraModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateRegra} className="p-5 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Código do Evento *</label>
                <input
                  type="text"
                  required
                  value={novaRegraForm.eventoSistema}
                  onChange={e =>
                    setNovaRegraForm({
                      ...novaRegraForm,
                      eventoSistema: e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
                    })
                  }
                  placeholder="EX: ALERTA_MANUTENCAO_ARMA"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Nome de Exibição *</label>
                <input
                  type="text"
                  required
                  value={novaRegraForm.nomeExibicao}
                  onChange={e => setNovaRegraForm({ ...novaRegraForm, nomeExibicao: e.target.value })}
                  placeholder="Ex: Alerta de Manutenção de Armamento"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Descrição</label>
                <input
                  type="text"
                  value={novaRegraForm.descricao}
                  onChange={e => setNovaRegraForm({ ...novaRegraForm, descricao: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Template</label>
                  <select
                    value={novaRegraForm.templateId}
                    onChange={e => setNovaRegraForm({ ...novaRegraForm, templateId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    <option value="">Selecionar depois...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.nome} ({t.idioma})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Destinatário</label>
                  <select
                    value={novaRegraForm.destinatarioTipo}
                    onChange={e =>
                      setNovaRegraForm({
                        ...novaRegraForm,
                        destinatarioTipo: e.target.value as WhatsappDestinatarioTipo
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100"
                  >
                    {(Object.keys(DESTINATARIO_LABELS) as WhatsappDestinatarioTipo[]).map(k => (
                      <option key={k} value={k}>
                        {DESTINATARIO_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {novaRegraForm.destinatarioTipo === 'NUMERO_FIXO' && (
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Número Fixo (DDI + DDD)</label>
                  <input
                    type="text"
                    value={novaRegraForm.numeroDestinoFixo}
                    onChange={e =>
                      setNovaRegraForm({ ...novaRegraForm, numeroDestinoFixo: e.target.value.replace(/\D/g, '') })
                    }
                    placeholder="5531999990000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNovaRegraModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
                >
                  Criar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
