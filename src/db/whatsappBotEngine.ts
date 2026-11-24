import crypto from 'crypto';
import {
  OperacaoOrigem,
  UnifiedOperationReport,
  formatIsoDateBr,
  listAvailableOperationDates,
  findOperationReportsByDate,
  findOperationReportsLast24h,
  findSingleOperationReport,
  generateSingleOperationReportPdf,
  generateMultipleOperationsPdf
} from './whatsappPdfService';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com';
const ALLOWED_API_VERSIONS = new Set(['v23.0', 'v22.0', 'v21.0', 'v20.0', 'v19.0']);

export interface BotInteractiveButton {
  id: string;
  title: string; // Meta max 20 chars
}

export interface BotListRow {
  id: string;
  title: string; // Meta max 24 chars
  description?: string; // Meta max 72 chars
}

export interface BotReplyItem {
  kind: 'buttons' | 'list' | 'text' | 'document';
  header?: string;
  body: string;
  footer?: string;
  buttons?: BotInteractiveButton[];
  listButtonText?: string;
  listRows?: BotListRow[];
  documentFilename?: string;
  documentCaption?: string;
  documentDownloadUrl?: string;
  documentBuffer?: Buffer; // internal only, stripped before JSON response
}

export interface BotInputMessage {
  fromPhone: string;
  text?: string;
  buttonId?: string;
  buttonTitle?: string;
  listRowId?: string;
  listRowTitle?: string;
}

export interface BotProcessOptions {
  dryRun?: boolean; // true for Admin Simulator (no real Meta network call, returns reply bubbles + signed PDF link)
  signingKey: Buffer;
  decryptSecret: (encoded?: string | null) => string;
}

export interface SignedPdfTokenPayload {
  scope: 'single' | 'last24h' | 'period';
  origem?: OperacaoOrigem;
  id?: string;
  granularity?: 'DIA' | 'MES' | 'ANO';
  isoFilter?: string;
  exp: number;
}

export function createSignedPdfToken(payload: Omit<SignedPdfTokenPayload, 'exp'>, signingKey: Buffer): string {
  const full: SignedPdfTokenPayload = {
    ...payload,
    exp: Date.now() + 15 * 60 * 1000 // 15 minutos
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedPdfToken(token: string, signingKey: Buffer): SignedPdfTokenPayload | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;
  const expectedSig = crypto.createHmac('sha256', signingKey).update(encoded).digest('base64url');
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedPdfTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeText(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function truncateText(val: string, max: number): string {
  const clean = String(val || '').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1))}…`;
}

function parseUserDate(granularity: 'DIA' | 'MES' | 'ANO', raw: string): { iso: string; display: string } | null {
  const clean = String(raw || '').trim();
  if (granularity === 'DIA') {
    // DD/MM/YYYY or DD-MM-YYYY
    let m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      const d = Number(dd);
      const mo = Number(mm);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
      }
    }
    // YYYY-MM-DD
    m = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      const dd = m[3].padStart(2, '0');
      const d = Number(dd);
      const mo = Number(mm);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return { iso: `${yyyy}-${mm}-${dd}`, display: `${dd}/${mm}/${yyyy}` };
      }
    }
    return null;
  }

  if (granularity === 'MES') {
    // MM/YYYY or MM-YYYY
    let m = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const mm = m[1].padStart(2, '0');
      const yyyy = m[2];
      const mo = Number(mm);
      if (mo >= 1 && mo <= 12) {
        return { iso: `${yyyy}-${mm}`, display: `${mm}/${yyyy}` };
      }
    }
    // YYYY-MM
    m = clean.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (m) {
      const yyyy = m[1];
      const mm = m[2].padStart(2, '0');
      const mo = Number(mm);
      if (mo >= 1 && mo <= 12) {
        return { iso: `${yyyy}-${mm}`, display: `${mm}/${yyyy}` };
      }
    }
    return null;
  }

  // ANO: YYYY
  const m = clean.match(/^(\d{4})$/);
  if (m) {
    const yr = Number(m[1]);
    if (yr >= 2000 && yr <= 2100) {
      return { iso: m[1], display: m[1] };
    }
  }
  return null;
}

async function getSession(pool: any, phone: string): Promise<{ etapa: string; contexto: any }> {
  try {
    const [rows]: any = await pool.query(
      'SELECT ETAPA_ATUAL, CONTEXTO_JSON FROM WHATSAPP_CONVERSAS_SESSAO WHERE TELEFONE_CLIENTE = ? LIMIT 1',
      [phone]
    );
    if (!rows?.[0]) return { etapa: 'INICIO', contexto: {} };
    let contexto: any = {};
    try {
      contexto = rows[0].CONTEXTO_JSON ? JSON.parse(rows[0].CONTEXTO_JSON) : {};
    } catch {
      contexto = {};
    }
    return { etapa: String(rows[0].ETAPA_ATUAL || 'INICIO'), contexto };
  } catch {
    return { etapa: 'INICIO', contexto: {} };
  }
}

async function saveSession(pool: any, phone: string, etapa: string, contexto: any = {}): Promise<void> {
  await pool.query(
    `INSERT INTO WHATSAPP_CONVERSAS_SESSAO (TELEFONE_CLIENTE, ETAPA_ATUAL, CONTEXTO_JSON, ULTIMA_INTERACAO_EM, DATA_CRIACAO)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       ETAPA_ATUAL = VALUES(ETAPA_ATUAL),
       CONTEXTO_JSON = VALUES(CONTEXTO_JSON),
       ULTIMA_INTERACAO_EM = NOW()`,
    [phone, etapa, JSON.stringify(contexto || {})]
  );
}

export async function resetBotSession(pool: any, phone: string): Promise<void> {
  await saveSession(pool, phone, 'INICIO', {});
}

function buildMainMenuReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Central Operacional — PCMG',
    body: 'Olá! Bem-vindo ao atendimento automático do sistema.\nSelecione abaixo uma das opções desejadas para prosseguir:',
    footer: 'Escolha uma opção nos botões abaixo',
    buttons: [
      { id: 'MENU_OPERACOES', title: 'Operações' },
      { id: 'MENU_TREINAMENTOS', title: 'Treinamentos' },
      { id: 'MENU_ARMARIA', title: 'Armaria' }
    ]
  };
}

function buildOperacoesMenuReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Relatórios de Operações',
    body:
      'Escolha como deseja consultar e baixar os relatórios de operações em PDF:\n\n' +
      '• *Relatórios Por data* — filtrar por dia, mês ou ano e escolher o relatório para baixar em PDF\n' +
      '• *Relatório das últimas 24h* — baixar em PDF os relatórios de operações das últimas 24 horas',
    footer: 'Selecione uma das opções abaixo',
    buttons: [
      { id: 'OP_POR_DATA', title: 'Relatórios Por data' },
      { id: 'OP_ULTIMAS_24H', title: 'Relat. últimas 24h' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildEscolherTipoDataReply(): BotReplyItem {
  return {
    kind: 'buttons',
    header: 'Relatórios por Data',
    body: 'Como deseja filtrar os relatórios de operações?\nEscolha se prefere selecionar por *Dia*, *Mês* ou *Ano*:',
    footer: 'Você poderá baixar o PDF na próxima etapa',
    buttons: [
      { id: 'OP_FILTRO_DIA', title: 'Por Dia' },
      { id: 'OP_FILTRO_MES', title: 'Por Mês' },
      { id: 'OP_FILTRO_ANO', title: 'Por Ano' }
    ]
  };
}

async function buildSelecionarValorDataReply(
  pool: any,
  granularity: 'DIA' | 'MES' | 'ANO'
): Promise<BotReplyItem> {
  const available = await listAvailableOperationDates(pool, granularity);
  const formatoExemplo =
    granularity === 'DIA'
      ? 'DD/MM/AAAA (ex: 24/11/2026)'
      : granularity === 'MES'
      ? 'MM/AAAA (ex: 11/2026)'
      : 'AAAA (ex: 2026)';
  const labelTipo = granularity === 'DIA' ? 'dia' : granularity === 'MES' ? 'mês' : 'ano';

  if (available.length > 0) {
    const rows: BotListRow[] = available.map(opt => ({
      id: `OP_DATEVAL::${granularity}::${opt.value}`,
      title: truncateText(opt.label, 24),
      description: `${opt.count} relatório(s) de operação encontrado(s)`
    }));
    rows.push({
      id: 'VOLTAR_MENU',
      title: 'Voltar ao Menu',
      description: 'Retornar ao menu principal (Operações, Treinamentos, Armaria)'
    });

    return {
      kind: 'list',
      header: `Filtrar Operações por ${granularity === 'DIA' ? 'Dia' : granularity === 'MES' ? 'Mês' : 'Ano'}`,
      body: `Selecione um ${labelTipo} na lista abaixo ou digite diretamente no formato *${formatoExemplo}*:`,
      footer: 'Selecione ou digite a data desejada',
      listButtonText: `Escolher ${labelTipo}`,
      listRows: rows
    };
  }

  return {
    kind: 'buttons',
    header: `Filtrar Operações por ${granularity === 'DIA' ? 'Dia' : granularity === 'MES' ? 'Mês' : 'Ano'}`,
    body: `Ainda não encontramos registros recentes listados automaticamente.\nDigite o ${labelTipo} desejado no formato *${formatoExemplo}* para pesquisar:`,
    footer: 'Digite a data ou volte ao menu',
    buttons: [
      { id: 'OP_POR_DATA', title: 'Trocar Filtro' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

function buildReportSelectionListReply(
  reports: UnifiedOperationReport[],
  granularity: 'DIA' | 'MES' | 'ANO',
  isoFilter: string,
  displayFilter: string
): BotReplyItem {
  const rows: BotListRow[] = [];

  if (reports.length > 1) {
    rows.push({
      id: `OP_PDF_ALL::${granularity}::${isoFilter}`,
      title: truncateText(`Baixar Todos (${reports.length} PDF)`, 24),
      description: truncateText(`PDF consolidado com todos os relatórios de ${displayFilter}`, 72)
    });
  }

  const maxIndividual = reports.length > 1 ? 8 : 9;
  reports.slice(0, maxIndividual).forEach((r, idx) => {
    const shortDate = formatIsoDateBr(r.dataOperacao).slice(0, 5);
    const title = truncateText(`${idx + 1}. ${shortDate} ${r.origem} - ${r.municipio}`, 24);
    const desc = truncateText(`${r.unidadeNome} • ${r.horaOperacao} • ${r.criadorNome}`, 72);
    rows.push({
      id: `OP_PDF::${r.origem}::${r.id}`,
      title,
      description: desc
    });
  });

  rows.push({
    id: 'OP_POR_DATA',
    title: 'Escolher outra data',
    description: 'Voltar para escolher outro dia, mês ou ano'
  });

  const summaryLines = reports
    .slice(0, maxIndividual)
    .map(
      (r, idx) =>
        `*${idx + 1}.* ${formatIsoDateBr(r.dataOperacao)} ${r.horaOperacao} — *${r.origem}* (${r.municipio}/${r.estado})`
    )
    .join('\n');

  return {
    kind: 'list',
    header: `Operações — ${displayFilter}`,
    body: `Encontramos *${reports.length}* relatório(s) de operações para *${displayFilter}*:\n\n${summaryLines}\n\nSelecione abaixo qual relatório deseja baixar em *PDF* (ou digite o número):`,
    footer: 'Toque no botão abaixo para selecionar o PDF',
    listButtonText: 'Selecionar PDF',
    listRows: rows
  };
}

async function buildTreinamentosSummaryReply(pool: any): Promise<BotReplyItem> {
  let countCanil = 0;
  let countPol = 0;
  try {
    const [r1]: any = await pool.query(
      'SELECT COUNT(*) AS cnt FROM RELATORIOS_TREINAMENTO_CANIL WHERE DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
    countCanil = Number(r1?.[0]?.cnt || 0);
  } catch {}
  try {
    const [r2]: any = await pool.query(
      'SELECT COUNT(*) AS cnt FROM RELATORIOS_TREINAMENTO_POLICIAL WHERE DATA_CRIACAO >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
    countPol = Number(r2?.[0]?.cnt || 0);
  } catch {}

  return {
    kind: 'buttons',
    header: 'Módulo de Treinamentos',
    body:
      `Resumo dos últimos 30 dias no sistema:\n` +
      `• Treinamentos COC / K9: *${countCanil}* relatório(s)\n` +
      `• Treinamentos Unidades Policiais: *${countPol}* relatório(s)\n\n` +
      `Para consultar e baixar relatórios operacionais em PDF, acesse *Operações* ou retorne ao menu principal.`,
    footer: 'Atendimento PCMG',
    buttons: [
      { id: 'MENU_OPERACOES', title: 'Operações' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

async function buildArmariaSummaryReply(pool: any): Promise<BotReplyItem> {
  let totalArmas = 0;
  let cautelasPendentes = 0;
  try {
    const [r1]: any = await pool.query('SELECT COUNT(*) AS cnt FROM ARMAS');
    totalArmas = Number(r1?.[0]?.cnt || 0);
  } catch {}
  try {
    const [r2]: any = await pool.query("SELECT COUNT(*) AS cnt FROM ACAUTELAR_ARMAS WHERE STATUS = 'Pendente'");
    cautelasPendentes = Number(r2?.[0]?.cnt || 0);
  } catch {}

  return {
    kind: 'buttons',
    header: 'Módulo Armaria',
    body:
      `Panorama rápido da Armaria no sistema:\n` +
      `• Armamentos cadastrados: *${totalArmas}*\n` +
      `• Cautelas de armas pendentes: *${cautelasPendentes}*\n\n` +
      `Para detalhes de cautelas, utilize o portal web Armeria PCMG ou escolha outra opção abaixo:`,
    footer: 'Atendimento PCMG',
    buttons: [
      { id: 'MENU_OPERACOES', title: 'Operações' },
      { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
    ]
  };
}

// ============================================================================
// DISPATCH REAL PARA META CLOUD API (Interactive Buttons, List, Text, PDF Doc)
// ============================================================================
async function uploadPdfToMetaMedia(
  apiVersion: string,
  phoneNumberId: string,
  accessToken: string,
  pdfBuffer: Buffer,
  filename: string
): Promise<{ mediaId?: string; error?: string }> {
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    form.append('file', blob, filename);

    const res = await fetch(`${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: form
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json?.id) {
      return { mediaId: String(json.id) };
    }
    return {
      error: json?.error?.error_user_msg || json?.error?.message || `Erro HTTP ${res.status} ao enviar PDF para a Meta Media API`
    };
  } catch (err: any) {
    return { error: err?.message || 'Erro de rede ao enviar PDF para graph.facebook.com' };
  }
}

async function dispatchBotRepliesToMeta(
  pool: any,
  cfgRow: any,
  toPhone: string,
  replies: BotReplyItem[],
  decryptSecret: (encoded?: string | null) => string
): Promise<void> {
  const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
  const phoneNumberId = String(cfgRow?.PHONE_NUMBER_ID || '').trim();
  const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);

  if (!/^\d{5,30}$/.test(phoneNumberId) || !accessToken) {
    return;
  }

  const endpointUrl = `${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`;

  for (const item of replies) {
    let payload: any = null;
    let tipoMsg = 'interactive';
    let resumo = item.body.slice(0, 400);

    if (item.kind === 'buttons' && item.buttons && item.buttons.length > 0) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(item.header ? { header: { type: 'text', text: truncateText(item.header, 60) } } : {}),
          body: { text: truncateText(item.body, 1024) },
          ...(item.footer ? { footer: { text: truncateText(item.footer, 60) } } : {}),
          action: {
            buttons: item.buttons.slice(0, 3).map(b => ({
              type: 'reply',
              reply: {
                id: b.id.slice(0, 256),
                title: truncateText(b.title, 20)
              }
            }))
          }
        }
      };
      resumo = `[Menu Botões] ${item.header || ''} • ${item.buttons.map(b => b.title).join(' | ')}`;
    } else if (item.kind === 'list' && item.listRows && item.listRows.length > 0) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(item.header ? { header: { type: 'text', text: truncateText(item.header, 60) } } : {}),
          body: { text: truncateText(item.body, 1024) },
          ...(item.footer ? { footer: { text: truncateText(item.footer, 60) } } : {}),
          action: {
            button: truncateText(item.listButtonText || 'Selecionar', 20),
            sections: [
              {
                title: truncateText(item.header || 'Opções disponíveis', 24),
                rows: item.listRows.slice(0, 10).map(r => ({
                  id: r.id.slice(0, 200),
                  title: truncateText(r.title, 24),
                  ...(r.description ? { description: truncateText(r.description, 72) } : {})
                }))
              }
            ]
          }
        }
      };
      resumo = `[Lista Interativa] ${item.header || ''} (${item.listRows.length} opções)`;
    } else if (item.kind === 'document' && item.documentBuffer && item.documentFilename) {
      tipoMsg = 'document';
      const upload = await uploadPdfToMetaMedia(
        apiVersion,
        phoneNumberId,
        accessToken,
        item.documentBuffer,
        item.documentFilename
      );
      if (upload.mediaId) {
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'document',
          document: {
            id: upload.mediaId,
            filename: item.documentFilename,
            caption: truncateText(item.documentCaption || item.body, 1024)
          }
        };
        resumo = `[PDF Enviado] ${item.documentFilename}`;
      } else {
        // Fallback text alerting upload failure
        tipoMsg = 'text';
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: `O PDF (${item.documentFilename}) foi gerado, mas houve falha ao anexá-lo na API da Meta: ${upload.error}`
          }
        };
        resumo = `[Falha Upload PDF] ${item.documentFilename}: ${upload.error}`;
      }
    } else {
      tipoMsg = 'text';
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: truncateText(item.body, 4096)
        }
      };
    }

    const msgId = `wpp-bot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let metaMessageId: string | null = null;
    let statusEntrega = 'PENDENTE';
    let erroCodigo: string | null = null;
    let erroMensagem: string | null = null;
    let respJson: any = null;

    try {
      const metaRes = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      respJson = await metaRes.json().catch(() => ({}));
      if (metaRes.ok && respJson?.messages?.[0]?.id) {
        metaMessageId = String(respJson.messages[0].id);
        statusEntrega = 'ENVIADA';
      } else {
        statusEntrega = 'FALHOU';
        erroCodigo = String(respJson?.error?.code || metaRes.status);
        erroMensagem = respJson?.error?.error_user_msg || respJson?.error?.message || `Erro HTTP ${metaRes.status}`;
      }
    } catch (e: any) {
      statusEntrega = 'FALHOU';
      erroCodigo = 'NETWORK_ERROR';
      erroMensagem = e?.message || 'Erro de rede';
    }

    await pool.query(
      `INSERT INTO WHATSAPP_MENSAGENS (
        ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
        TIPO_MENSAGEM, EVENTO_SISTEMA, CONTEUDO_RESUMO, META_MESSAGE_ID,
        STATUS_ENTREGA, ERRO_CODIGO, ERRO_MENSAGEM, PAYLOAD_REQUISICAO_JSON,
        PAYLOAD_RESPOSTA_JSON, ENVIADO_POR_NOME, DATA_CRIACAO
      ) VALUES (?, 'SAIDA', ?, ?, ?, 'ATENDIMENTO_BOT_INTERATIVO', ?, ?, ?, ?, ?, ?, ?, 'Bot WhatsApp PCMG', NOW())`,
      [
        msgId,
        toPhone,
        cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
        tipoMsg,
        resumo,
        metaMessageId,
        statusEntrega,
        erroCodigo,
        erroMensagem,
        JSON.stringify(payload),
        respJson ? JSON.stringify(respJson) : null
      ]
    );
  }
}

// ============================================================================
// MOTOR PRINCIPAL DA MÁQUINA DE ESTADOS DO BOT INTERATIVO
// ============================================================================
export async function processWhatsappBotInteraction(
  pool: any,
  cfgRow: any,
  input: BotInputMessage,
  options: BotProcessOptions
): Promise<{ etapaAtual: string; replies: BotReplyItem[] }> {
  const phone = String(input.fromPhone || '').replace(/\D/g, '');
  const actionId = String(input.buttonId || input.listRowId || '').trim();
  const rawText = String(input.text || input.buttonTitle || input.listRowTitle || '').trim();
  const normText = normalizeText(rawText);

  const session = await getSession(pool, phone);
  let nextEtapa = session.etapa;
  let nextContexto = { ...(session.contexto || {}) };
  const replies: BotReplyItem[] = [];

  // Comandos globais para voltar ao Menu Principal
  const isResetCommand =
    actionId === 'VOLTAR_MENU' ||
    ['menu', 'inicio', 'voltar', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'start', 'ajuda'].includes(
      normText
    );

  // Helper para enviar PDF de um único relatório
  const emitSingleReportPdf = async (origem: OperacaoOrigem, reportId: string) => {
    const report = await findSingleOperationReport(pool, origem, reportId);
    if (!report) {
      replies.push({
        kind: 'buttons',
        header: 'Relatório não encontrado',
        body: 'Não foi possível localizar este relatório no banco de dados. Tente selecionar outra data ou relatório.',
        buttons: [
          { id: 'OP_POR_DATA', title: 'Relatórios Por data' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'OPERACOES_MENU';
      return;
    }

    const { buffer, filename } = await generateSingleOperationReportPdf(report);
    const token = createSignedPdfToken({ scope: 'single', origem, id: report.id }, options.signingKey);
    const caption = `Relatório de Operação — ${report.unidadeNome} (${formatIsoDateBr(report.dataOperacao)} • ${report.municipio}/${report.estado})`;

    replies.push({
      kind: 'document',
      header: 'PDF Pronto para Download',
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });

    replies.push({
      kind: 'buttons',
      body: 'Deseja consultar outro relatório de operações ou voltar ao menu principal?',
      buttons: [
        { id: 'OP_POR_DATA', title: 'Outra Data' },
        { id: 'OP_ULTIMAS_24H', title: 'Relat. últimas 24h' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'OPERACOES_MENU';
  };

  // Helper para enviar PDF consolidado das últimas 24h
  const emitLast24hPdf = async () => {
    const reports = await findOperationReportsLast24h(pool);
    if (reports.length === 0) {
      replies.push({
        kind: 'buttons',
        header: 'Relatório das Últimas 24h',
        body: 'Nenhum relatório de operação foi registrado nas últimas 24 horas.\nVocê pode consultar relatórios anteriores escolhendo *Relatórios Por data*.',
        buttons: [
          { id: 'OP_POR_DATA', title: 'Relatórios Por data' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'OPERACOES_MENU';
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const { buffer, filename } = await generateMultipleOperationsPdf(
      reports,
      'RELATORIOS DE OPERACOES — ULTIMAS 24 HORAS',
      `Ultimas_24h_${todayIso}`
    );
    const token = createSignedPdfToken({ scope: 'last24h' }, options.signingKey);
    const caption = `Relatórios de Operações das Últimas 24h (${reports.length} registro(s) encontrado(s))`;

    replies.push({
      kind: 'document',
      header: 'PDF — Últimas 24 Horas',
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });

    replies.push({
      kind: 'buttons',
      body: 'PDF dos relatórios de operações das últimas 24h enviado! O que deseja fazer agora?',
      buttons: [
        { id: 'OP_POR_DATA', title: 'Relatórios Por data' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'OPERACOES_MENU';
  };

  // Helper para enviar PDF consolidado de um período (Dia/Mês/Ano)
  const emitPeriodAllPdf = async (granularity: 'DIA' | 'MES' | 'ANO', isoFilter: string) => {
    const reports = await findOperationReportsByDate(pool, granularity, isoFilter);
    if (reports.length === 0) {
      replies.push({
        kind: 'buttons',
        header: 'Nenhum relatório encontrado',
        body: 'Não há relatórios de operações para o período informado.',
        buttons: [
          { id: 'OP_POR_DATA', title: 'Escolher outra data' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'OPERACOES_MENU';
      return;
    }

    const displayPeriod = granularity === 'DIA' ? formatIsoDateBr(isoFilter) : isoFilter;
    const { buffer, filename } = await generateMultipleOperationsPdf(
      reports,
      `RELATORIOS DE OPERACOES — ${displayPeriod}`,
      `${granularity}_${isoFilter}`
    );
    const token = createSignedPdfToken({ scope: 'period', granularity, isoFilter }, options.signingKey);
    const caption = `Relatórios de Operações — ${displayPeriod} (${reports.length} registro(s))`;

    replies.push({
      kind: 'document',
      header: `PDF Consolidado — ${displayPeriod}`,
      body: caption,
      documentFilename: filename,
      documentCaption: caption,
      documentDownloadUrl: `/api/whatsapp/pdf/download?token=${encodeURIComponent(token)}`,
      documentBuffer: buffer
    });

    replies.push({
      kind: 'buttons',
      body: 'Arquivo PDF enviado! Deseja realizar uma nova consulta?',
      buttons: [
        { id: 'OP_POR_DATA', title: 'Outra Data' },
        { id: 'OP_ULTIMAS_24H', title: 'Relat. últimas 24h' },
        { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
      ]
    });
    nextEtapa = 'OPERACOES_MENU';
  };

  // Helper para listar relatórios de uma data escolhida
  const handleDateLookup = async (granularity: 'DIA' | 'MES' | 'ANO', isoFilter: string, displayFilter: string) => {
    const reports = await findOperationReportsByDate(pool, granularity, isoFilter);
    if (reports.length === 0) {
      replies.push({
        kind: 'buttons',
        header: `Sem registros em ${displayFilter}`,
        body: `Não encontramos relatórios de operações para *${displayFilter}*.\nDeseja escolher outro dia, mês ou ano?`,
        buttons: [
          { id: 'OP_POR_DATA', title: 'Outra Data' },
          { id: 'OP_ULTIMAS_24H', title: 'Relat. últimas 24h' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
      nextEtapa = 'OPERACOES_MENU';
      return;
    }

    nextEtapa = 'OPERACOES_SELECIONAR_RELATORIO';
    nextContexto = {
      granularity,
      isoFilter,
      displayFilter,
      reports: reports.slice(0, 9).map(r => ({
        origem: r.origem,
        id: r.id
      }))
    };
    replies.push(buildReportSelectionListReply(reports, granularity, isoFilter, displayFilter));
  };

  // ==========================================================================
  // ROTEAMENTO POR AÇÃO / ESTADO
  // ==========================================================================
  if (isResetCommand) {
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(buildMainMenuReply());
  } else if (
    actionId === 'MENU_OPERACOES' ||
    normText === 'operacoes' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '1')
  ) {
    nextEtapa = 'OPERACOES_MENU';
    nextContexto = {};
    replies.push(buildOperacoesMenuReply());
  } else if (
    actionId === 'MENU_TREINAMENTOS' ||
    normText === 'treinamentos' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '2')
  ) {
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(await buildTreinamentosSummaryReply(pool));
  } else if (
    actionId === 'MENU_ARMARIA' ||
    normText === 'armaria' ||
    (session.etapa === 'MENU_PRINCIPAL' && normText === '3')
  ) {
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(await buildArmariaSummaryReply(pool));
  } else if (
    actionId === 'OP_POR_DATA' ||
    normText.includes('por data') ||
    (session.etapa === 'OPERACOES_MENU' && normText === '1')
  ) {
    nextEtapa = 'OPERACOES_ESCOLHER_TIPO_DATA';
    nextContexto = {};
    replies.push(buildEscolherTipoDataReply());
  } else if (
    actionId === 'OP_ULTIMAS_24H' ||
    normText.includes('24h') ||
    normText.includes('24 horas') ||
    (session.etapa === 'OPERACOES_MENU' && normText === '2')
  ) {
    await emitLast24hPdf();
  } else if (
    actionId === 'OP_FILTRO_DIA' ||
    (session.etapa === 'OPERACOES_ESCOLHER_TIPO_DATA' && (normText === 'dia' || normText === 'por dia' || normText === '1'))
  ) {
    nextEtapa = 'OPERACOES_AGUARDANDO_DIA';
    nextContexto = { granularity: 'DIA' };
    replies.push(await buildSelecionarValorDataReply(pool, 'DIA'));
  } else if (
    actionId === 'OP_FILTRO_MES' ||
    (session.etapa === 'OPERACOES_ESCOLHER_TIPO_DATA' && (normText === 'mes' || normText === 'por mes' || normText === '2'))
  ) {
    nextEtapa = 'OPERACOES_AGUARDANDO_MES';
    nextContexto = { granularity: 'MES' };
    replies.push(await buildSelecionarValorDataReply(pool, 'MES'));
  } else if (
    actionId === 'OP_FILTRO_ANO' ||
    (session.etapa === 'OPERACOES_ESCOLHER_TIPO_DATA' && (normText === 'ano' || normText === 'por ano' || normText === '3'))
  ) {
    nextEtapa = 'OPERACOES_AGUARDANDO_ANO';
    nextContexto = { granularity: 'ANO' };
    replies.push(await buildSelecionarValorDataReply(pool, 'ANO'));
  } else if (actionId.startsWith('OP_DATEVAL::')) {
    const [, granRaw, isoVal] = actionId.split('::');
    const gran = granRaw === 'DIA' || granRaw === 'MES' || granRaw === 'ANO' ? granRaw : 'DIA';
    const parsed = parseUserDate(gran, isoVal);
    if (parsed) {
      await handleDateLookup(gran, parsed.iso, parsed.display);
    } else {
      replies.push(await buildSelecionarValorDataReply(pool, gran));
    }
  } else if (actionId.startsWith('OP_PDF::')) {
    const [, origemRaw, repId] = actionId.split('::');
    if ((origemRaw === 'CANIL' || origemRaw === 'POLICIAL' || origemRaw === 'CAT') && repId) {
      await emitSingleReportPdf(origemRaw, repId);
    } else {
      replies.push(buildOperacoesMenuReply());
      nextEtapa = 'OPERACOES_MENU';
    }
  } else if (actionId.startsWith('OP_PDF_ALL::')) {
    const [, granRaw, isoFilter] = actionId.split('::');
    const gran = granRaw === 'DIA' || granRaw === 'MES' || granRaw === 'ANO' ? granRaw : 'DIA';
    if (isoFilter) {
      await emitPeriodAllPdf(gran, isoFilter);
    } else {
      replies.push(buildOperacoesMenuReply());
      nextEtapa = 'OPERACOES_MENU';
    }
  } else if (
    session.etapa === 'OPERACOES_AGUARDANDO_DIA' ||
    session.etapa === 'OPERACOES_AGUARDANDO_MES' ||
    session.etapa === 'OPERACOES_AGUARDANDO_ANO'
  ) {
    const gran: 'DIA' | 'MES' | 'ANO' =
      session.etapa === 'OPERACOES_AGUARDANDO_DIA'
        ? 'DIA'
        : session.etapa === 'OPERACOES_AGUARDANDO_MES'
        ? 'MES'
        : 'ANO';
    const parsed = parseUserDate(gran, rawText);
    if (parsed) {
      await handleDateLookup(gran, parsed.iso, parsed.display);
    } else {
      const formato =
        gran === 'DIA' ? 'DD/MM/AAAA (ex: 24/11/2026)' : gran === 'MES' ? 'MM/AAAA (ex: 11/2026)' : 'AAAA (ex: 2026)';
      replies.push({
        kind: 'buttons',
        header: 'Formato de data não reconhecido',
        body: `Por favor, informe uma data válida no formato *${formato}* ou escolha uma opção abaixo:`,
        buttons: [
          { id: 'OP_POR_DATA', title: 'Trocar Filtro' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
    }
  } else if (session.etapa === 'OPERACOES_SELECIONAR_RELATORIO' && /^\d+$/.test(normText)) {
    const idx = Number(normText) - 1;
    const savedList = Array.isArray(session.contexto?.reports) ? session.contexto.reports : [];
    const chosen = savedList[idx];
    if (chosen && (chosen.origem === 'CANIL' || chosen.origem === 'POLICIAL' || chosen.origem === 'CAT')) {
      await emitSingleReportPdf(chosen.origem, chosen.id);
    } else {
      replies.push({
        kind: 'buttons',
        body: `Número inválido. Selecione um relatório na lista ou digite um número de 1 a ${savedList.length}.`,
        buttons: [
          { id: 'OP_POR_DATA', title: 'Nova Busca' },
          { id: 'VOLTAR_MENU', title: 'Voltar ao Menu' }
        ]
      });
    }
  } else {
    // Qualquer outra mensagem inicial ou fora de fluxo retorna ao menu principal com os 3 botões
    nextEtapa = 'MENU_PRINCIPAL';
    nextContexto = {};
    replies.push(buildMainMenuReply());
  }

  await saveSession(pool, phone, nextEtapa, nextContexto);

  if (!options.dryRun) {
    await dispatchBotRepliesToMeta(pool, cfgRow, phone, replies, options.decryptSecret);
  }

  // Remove internal binary buffers before returning JSON
  const publicReplies: BotReplyItem[] = replies.map(({ documentBuffer: _buf, ...rest }) => rest);
  return { etapaAtual: nextEtapa, replies: publicReplies };
}
