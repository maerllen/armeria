import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  processWhatsappBotInteraction,
  resetBotSession,
  verifySignedPdfToken,
  sendDirectWhatsappText,
  resolveWhatsappUserContext
} from './whatsappBotEngine';
import {
  OperacaoOrigem,
  TreinamentoOrigem,
  findSingleOperationReport,
  findOperationReportsLast24h,
  findOperationReportsByDate,
  generateSingleOperationReportPdf,
  generateMultipleOperationsPdf,
  findSingleTrainingReport,
  findTrainingReportsLast24h,
  findTrainingReportsByDate,
  generateSingleTrainingReportPdf,
  generateMultipleTrainingsPdf,
  findSingleArmariaReceipt,
  generateArmariaReceiptPdf,
  findArmariaCautelasByPeriod,
  generateArmariaCautelasReportPdf,
  formatIsoDateBr
} from './whatsappPdfService';

interface WhatsappRoutesDeps {
  getPool: () => any;
  insertAuditLog: (
    moduleName: string,
    action: string,
    details: string,
    user?: { id?: string; name?: string; masp?: string; role?: string },
    ip?: string
  ) => Promise<void>;
}

const META_GRAPH_BASE_URL = 'https://graph.facebook.com';
const ALLOWED_API_VERSIONS = new Set(['v23.0', 'v22.0', 'v21.0', 'v20.0', 'v19.0']);
const DEFAULT_CONFIG_ID = 'default';

let cachedKey: Buffer | null = null;
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const seed =
    process.env.WHATSAPP_ENCRYPTION_KEY?.trim() ||
    process.env.DB_PASSWORD?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    'armeria-whatsapp-internal-key';
  cachedKey = crypto.scryptSync(seed, 'pcmg-armeria-whatsapp-v1', 32);
  return cachedKey;
}

function encryptSecret(plain: string): string {
  const clean = String(plain || '').trim();
  if (!clean) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(encoded?: string | null): string {
  const raw = String(encoded || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('v1:')) return raw;
  const parts = raw.split(':');
  if (parts.length !== 4) return '';
  try {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const data = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function maskSecret(plain: string): string {
  const clean = String(plain || '').trim();
  if (!clean) return '';
  if (clean.length <= 10) return '••••••••••';
  return `${clean.slice(0, 4)}••••••••••••${clean.slice(-4)}`;
}

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '');
}

function sanitizeNumericId(val?: string | null): string {
  const clean = String(val || '').trim();
  if (!clean) return '';
  return /^\d{5,30}$/.test(clean) ? clean : '';
}

function sanitizeTemplateName(val?: string | null): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 128);
}

function sanitizeSafePublicUrl(val?: string | null): string {
  const raw = String(val || '').trim().slice(0, 255);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      const cleanPath = parsed.pathname
        .replace(/\/+$/, '')
        .replace(/\/api\/whatsapp\/webhook$/i, '');
      return parsed.origin + cleanPath;
    }
  } catch {
    return '';
  }
  return '';
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localhost')
  ) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }
  if (h.includes(':')) {
    if (h === '::' || h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

/**
 * Valida URL de Custom Webhook do Make.com (apenas HTTPS em domínios oficiais *.make.com / *.integromat.com).
 */
function sanitizeMakeWebhookUrl(val?: string | null): string {
  const raw = String(val || '').trim().slice(0, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    if (parsed.port && parsed.port !== '443') return '';
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLocalHostname(host)) return '';
    const isOfficialMakeHost =
      host === 'make.com' ||
      host.endsWith('.make.com') ||
      host === 'integromat.com' ||
      host.endsWith('.integromat.com');
    if (!isOfficialMakeHost) return '';
    if (!parsed.pathname || parsed.pathname === '/') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function sanitizePublicHttpsMediaUrl(val?: string | null): string {
  const raw = String(val || '').trim().slice(0, 1000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    if (isPrivateOrLocalHostname(parsed.hostname)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function stripBrazilDdiForDisplay(phone?: string | null): string {
  let digits = normalizePhoneDigits(phone);
  if (digits.startsWith('0055') && digits.length >= 14) digits = digits.slice(4);
  else if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  return digits;
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

let whatsappSchemaEnsured = false;
async function ensureWhatsappSchema(pool: any): Promise<void> {
  if (whatsappSchemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_CONFIGURACAO_API\` (
        \`ID_CONFIG\` VARCHAR(64) NOT NULL,
        \`AMBIENTE\` ENUM('TESTE', 'PRODUCAO') NOT NULL DEFAULT 'TESTE',
        \`ATIVO\` TINYINT(1) NOT NULL DEFAULT 0,
        \`NOME_PERFIL_EXIBICAO\` VARCHAR(160) DEFAULT NULL,
        \`NUMERO_TELEFONE_EXIBICAO\` VARCHAR(32) DEFAULT NULL,
        \`API_VERSAO\` VARCHAR(12) NOT NULL DEFAULT 'v22.0',
        \`PHONE_NUMBER_ID\` VARCHAR(64) DEFAULT NULL,
        \`WABA_ID\` VARCHAR(64) DEFAULT NULL,
        \`META_APP_ID\` VARCHAR(64) DEFAULT NULL,
        \`ACCESS_TOKEN_ENC\` TEXT DEFAULT NULL,
        \`APP_SECRET_ENC\` TEXT DEFAULT NULL,
        \`WEBHOOK_VERIFY_TOKEN\` VARCHAR(160) DEFAULT NULL,
        \`CALLBACK_URL_PUBLICA\` VARCHAR(255) DEFAULT NULL,
        \`NUMERO_TESTE_PADRAO\` VARCHAR(32) DEFAULT NULL,
        \`MODO_ATENDIMENTO\` VARCHAR(24) NOT NULL DEFAULT 'BOT_INTERNO',
        \`MAKE_WEBHOOK_ATIVO\` TINYINT(1) NOT NULL DEFAULT 0,
        \`MAKE_WEBHOOK_URL\` VARCHAR(500) DEFAULT NULL,
        \`MAKE_WEBHOOK_SECRET_ENC\` TEXT DEFAULT NULL,
        \`MAKE_ENCAMINHAR_STATUS\` TINYINT(1) NOT NULL DEFAULT 0,
        \`MAKE_API_KEY_ENC\` TEXT DEFAULT NULL,
        \`MAKE_ULTIMO_TESTE_STATUS\` VARCHAR(32) NOT NULL DEFAULT 'NAO_TESTADO',
        \`MAKE_ULTIMO_TESTE_MENSAGEM\` TEXT DEFAULT NULL,
        \`MAKE_ULTIMO_TESTE_EM\` DATETIME DEFAULT NULL,
        \`ULTIMO_TESTE_STATUS\` VARCHAR(32) NOT NULL DEFAULT 'NAO_TESTADO',
        \`ULTIMO_TESTE_MENSAGEM\` TEXT DEFAULT NULL,
        \`ULTIMO_TESTE_EM\` DATETIME DEFAULT NULL,
        \`ATUALIZADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
        \`ATUALIZADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL,
        PRIMARY KEY (\`ID_CONFIG\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migração idempotente das colunas de integração Make.com em tabelas pré-existentes
    try {
      const [cols]: any = await pool.query('SHOW COLUMNS FROM WHATSAPP_CONFIGURACAO_API');
      const colNames = new Set((cols || []).map((c: any) => String(c.Field || '').toUpperCase()));
      const alterClauses: string[] = [];
      if (!colNames.has('MODO_ATENDIMENTO')) alterClauses.push("ADD COLUMN `MODO_ATENDIMENTO` VARCHAR(24) NOT NULL DEFAULT 'BOT_INTERNO'");
      if (!colNames.has('MAKE_WEBHOOK_ATIVO')) alterClauses.push('ADD COLUMN `MAKE_WEBHOOK_ATIVO` TINYINT(1) NOT NULL DEFAULT 0');
      if (!colNames.has('MAKE_WEBHOOK_URL')) alterClauses.push('ADD COLUMN `MAKE_WEBHOOK_URL` VARCHAR(500) DEFAULT NULL');
      if (!colNames.has('MAKE_WEBHOOK_SECRET_ENC')) alterClauses.push('ADD COLUMN `MAKE_WEBHOOK_SECRET_ENC` TEXT DEFAULT NULL');
      if (!colNames.has('MAKE_ENCAMINHAR_STATUS')) alterClauses.push('ADD COLUMN `MAKE_ENCAMINHAR_STATUS` TINYINT(1) NOT NULL DEFAULT 0');
      if (!colNames.has('MAKE_API_KEY_ENC')) alterClauses.push('ADD COLUMN `MAKE_API_KEY_ENC` TEXT DEFAULT NULL');
      if (!colNames.has('MAKE_ULTIMO_TESTE_STATUS')) alterClauses.push("ADD COLUMN `MAKE_ULTIMO_TESTE_STATUS` VARCHAR(32) NOT NULL DEFAULT 'NAO_TESTADO'");
      if (!colNames.has('MAKE_ULTIMO_TESTE_MENSAGEM')) alterClauses.push('ADD COLUMN `MAKE_ULTIMO_TESTE_MENSAGEM` TEXT DEFAULT NULL');
      if (!colNames.has('MAKE_ULTIMO_TESTE_EM')) alterClauses.push('ADD COLUMN `MAKE_ULTIMO_TESTE_EM` DATETIME DEFAULT NULL');
      if (alterClauses.length > 0) {
        await pool.query(`ALTER TABLE WHATSAPP_CONFIGURACAO_API ${alterClauses.join(', ')}`);
      }
    } catch (migErr) {
      console.warn('Aviso ao migrar colunas Make em WHATSAPP_CONFIGURACAO_API:', migErr);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_TEMPLATES\` (
        \`ID_TEMPLATE\` VARCHAR(64) NOT NULL,
        \`META_TEMPLATE_ID\` VARCHAR(64) DEFAULT NULL,
        \`NOME_TEMPLATE\` VARCHAR(128) NOT NULL,
        \`IDIOMA\` VARCHAR(16) NOT NULL DEFAULT 'pt_BR',
        \`CATEGORIA\` ENUM('UTILITY', 'AUTHENTICATION', 'MARKETING') NOT NULL DEFAULT 'UTILITY',
        \`STATUS_META\` VARCHAR(32) NOT NULL DEFAULT 'RASCUNHO',
        \`CABECALHO_TIPO\` ENUM('NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO') NOT NULL DEFAULT 'NONE',
        \`CABECALHO_TEXTO\` VARCHAR(120) DEFAULT NULL,
        \`CORPO_TEXTO\` TEXT NOT NULL,
        \`RODAPE_TEXTO\` VARCHAR(120) DEFAULT NULL,
        \`VARIAVEIS_EXEMPLO_JSON\` TEXT DEFAULT NULL,
        \`BOTOES_JSON\` TEXT DEFAULT NULL,
        \`ORIGEM\` ENUM('LOCAL', 'META_SYNC') NOT NULL DEFAULT 'LOCAL',
        \`ATIVO\` TINYINT(1) NOT NULL DEFAULT 1,
        \`CRIADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
        \`CRIADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL,
        PRIMARY KEY (\`ID_TEMPLATE\`),
        UNIQUE KEY \`uq_whatsapp_tpl_nome_idioma\` (\`NOME_TEMPLATE\`, \`IDIOMA\`),
        KEY \`idx_whatsapp_tpl_status\` (\`STATUS_META\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_REGRAS_COMUNICACAO\` (
        \`ID_REGRA\` VARCHAR(64) NOT NULL,
        \`EVENTO_SISTEMA\` VARCHAR(80) NOT NULL,
        \`NOME_EXIBICAO\` VARCHAR(160) NOT NULL,
        \`DESCRICAO\` VARCHAR(300) DEFAULT NULL,
        \`TEMPLATE_ID\` VARCHAR(64) DEFAULT NULL,
        \`TEMPLATE_NOME\` VARCHAR(128) DEFAULT NULL,
        \`DESTINATARIO_TIPO\` ENUM('USUARIO_DESTINO', 'RESPONSAVEL_UNIDADE', 'ADMINISTRADORES', 'NUMERO_FIXO') NOT NULL DEFAULT 'USUARIO_DESTINO',
        \`NUMERO_DESTINO_FIXO\` VARCHAR(32) DEFAULT NULL,
        \`MAPEAMENTO_VARIAVEIS_JSON\` TEXT DEFAULT NULL,
        \`HORARIO_INICIO\` VARCHAR(5) NOT NULL DEFAULT '00:00',
        \`HORARIO_FIM\` VARCHAR(5) NOT NULL DEFAULT '23:59',
        \`RESPEITAR_SILENCIO\` TINYINT(1) NOT NULL DEFAULT 0,
        \`MAX_TENTATIVAS\` INT NOT NULL DEFAULT 3,
        \`ATIVO\` TINYINT(1) NOT NULL DEFAULT 0,
        \`ATUALIZADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
        \`ATUALIZADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL,
        PRIMARY KEY (\`ID_REGRA\`),
        UNIQUE KEY \`uq_whatsapp_regra_evento\` (\`EVENTO_SISTEMA\`),
        KEY \`idx_whatsapp_regra_tpl\` (\`TEMPLATE_ID\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_MENSAGENS\` (
        \`ID_MENSAGEM\` VARCHAR(64) NOT NULL,
        \`DIRECAO\` ENUM('SAIDA', 'ENTRADA') NOT NULL DEFAULT 'SAIDA',
        \`TELEFONE_DESTINO\` VARCHAR(32) NOT NULL,
        \`TELEFONE_ORIGEM\` VARCHAR(32) DEFAULT NULL,
        \`USUARIO_DESTINO_ID\` VARCHAR(64) DEFAULT NULL,
        \`USUARIO_DESTINO_NOME\` VARCHAR(255) DEFAULT NULL,
        \`TIPO_MENSAGEM\` VARCHAR(32) NOT NULL DEFAULT 'template',
        \`TEMPLATE_NOME\` VARCHAR(128) DEFAULT NULL,
        \`EVENTO_SISTEMA\` VARCHAR(80) DEFAULT NULL,
        \`CONTEUDO_RESUMO\` TEXT DEFAULT NULL,
        \`META_MESSAGE_ID\` VARCHAR(160) DEFAULT NULL,
        \`STATUS_ENTREGA\` VARCHAR(32) NOT NULL DEFAULT 'PENDENTE',
        \`ERRO_CODIGO\` VARCHAR(64) DEFAULT NULL,
        \`ERRO_MENSAGEM\` TEXT DEFAULT NULL,
        \`PAYLOAD_REQUISICAO_JSON\` LONGTEXT DEFAULT NULL,
        \`PAYLOAD_RESPOSTA_JSON\` LONGTEXT DEFAULT NULL,
        \`ENVIADO_POR_ID\` VARCHAR(64) DEFAULT NULL,
        \`ENVIADO_POR_NOME\` VARCHAR(255) DEFAULT NULL,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`DATA_ATUALIZACAO\` DATETIME DEFAULT NULL,
        PRIMARY KEY (\`ID_MENSAGEM\`),
        KEY \`idx_wpp_msg_meta_id\` (\`META_MESSAGE_ID\`),
        KEY \`idx_wpp_msg_tel\` (\`TELEFONE_DESTINO\`),
        KEY \`idx_wpp_msg_status\` (\`STATUS_ENTREGA\`),
        KEY \`idx_wpp_msg_data\` (\`DATA_CRIACAO\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_WEBHOOK_EVENTOS\` (
        \`ID_EVENTO\` VARCHAR(64) NOT NULL,
        \`TIPO_EVENTO\` VARCHAR(64) NOT NULL DEFAULT 'other',
        \`ASSINATURA_VALIDA\` TINYINT(1) NOT NULL DEFAULT 0,
        \`WABA_ID\` VARCHAR(64) DEFAULT NULL,
        \`PHONE_NUMBER_ID\` VARCHAR(64) DEFAULT NULL,
        \`RESUMO\` VARCHAR(255) DEFAULT NULL,
        \`PAYLOAD_JSON\` LONGTEXT DEFAULT NULL,
        \`DATA_RECEBIMENTO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`ID_EVENTO\`),
        KEY \`idx_wpp_wh_tipo\` (\`TIPO_EVENTO\`),
        KEY \`idx_wpp_wh_data\` (\`DATA_RECEBIMENTO\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_CONVERSAS_SESSAO\` (
        \`TELEFONE_CLIENTE\` VARCHAR(32) NOT NULL,
        \`ETAPA_ATUAL\` VARCHAR(64) NOT NULL DEFAULT 'INICIO',
        \`CONTEXTO_JSON\` LONGTEXT DEFAULT NULL,
        \`ULTIMA_INTERACAO_EM\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`TELEFONE_CLIENTE\`),
        KEY \`idx_wpp_sessao_etapa\` (\`ETAPA_ATUAL\`),
        KEY \`idx_wpp_sessao_interacao\` (\`ULTIMA_INTERACAO_EM\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`WHATSAPP_SESSOES_TEMPORARIAS\` (
        \`ID_SESSAO\` VARCHAR(64) NOT NULL,
        \`TOKEN_HASH\` VARCHAR(128) NOT NULL,
        \`TIPO_FLUXO\` ENUM('SOLICITAR_CAUTELA', 'DEVOLVER_CAUTELA') NOT NULL,
        \`USUARIO_ID\` VARCHAR(64) NOT NULL,
        \`TELEFONE_ORIGEM\` VARCHAR(32) NOT NULL,
        \`STATUS_SESSAO\` ENUM('ATIVA', 'CONCLUIDA', 'EXPIRADA') NOT NULL DEFAULT 'ATIVA',
        \`EXPIRA_EM\` DATETIME NOT NULL,
        \`CONCLUIDA_EM\` DATETIME DEFAULT NULL,
        \`DATA_CRIACAO\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`ID_SESSAO\`),
        UNIQUE KEY \`uq_wpp_temp_token_hash\` (\`TOKEN_HASH\`),
        KEY \`idx_wpp_temp_usuario\` (\`USUARIO_ID\`),
        KEY \`idx_wpp_temp_status\` (\`STATUS_SESSAO\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seed inicial da configuração padrão se não existir
    const [cfgRows]: any = await pool.query(
      'SELECT COUNT(*) as cnt FROM WHATSAPP_CONFIGURACAO_API WHERE ID_CONFIG = ?',
      [DEFAULT_CONFIG_ID]
    );
    if (!cfgRows?.[0]?.cnt) {
      const initialVerifyToken = `pcmg_wpp_${crypto.randomBytes(12).toString('hex')}`;
      await pool.query(
        `INSERT IGNORE INTO WHATSAPP_CONFIGURACAO_API (
          ID_CONFIG, AMBIENTE, ATIVO, API_VERSAO, WEBHOOK_VERIFY_TOKEN, ULTIMO_TESTE_STATUS, DATA_CRIACAO
        ) VALUES (?, 'TESTE', 0, 'v22.0', ?, 'NAO_TESTADO', NOW())`,
        [DEFAULT_CONFIG_ID, initialVerifyToken]
      );
    }

    // Seed do template padrão hello_world do Sandbox Meta
    const [tplRows]: any = await pool.query('SELECT COUNT(*) as cnt FROM WHATSAPP_TEMPLATES');
    if (!tplRows?.[0]?.cnt) {
      await pool.query(
        `INSERT IGNORE INTO WHATSAPP_TEMPLATES (
          ID_TEMPLATE, NOME_TEMPLATE, IDIOMA, CATEGORIA, STATUS_META,
          CABECALHO_TIPO, CORPO_TEXTO, RODAPE_TEXTO, VARIAVEIS_EXEMPLO_JSON, ORIGEM, ATIVO, DATA_CRIACAO
        ) VALUES (
          'wpp-tpl-hello-world', 'hello_world', 'en_US', 'UTILITY', 'APPROVED',
          'NONE',
          'Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta.',
          'WhatsApp Business Platform sample message',
          '[]', 'LOCAL', 1, NOW()
        )`
      );
    }

    // Seed idempotente da template interativa de Menu Principal (Operações, Treinamentos, Armaria)
    const defaultMainButtons = JSON.stringify([
      { type: 'QUICK_REPLY', text: 'Operações' },
      { type: 'QUICK_REPLY', text: 'Treinamentos' },
      { type: 'QUICK_REPLY', text: 'Armaria' }
    ]);
    await pool.query(
      `INSERT IGNORE INTO WHATSAPP_TEMPLATES (
        ID_TEMPLATE, NOME_TEMPLATE, IDIOMA, CATEGORIA, STATUS_META,
        CABECALHO_TIPO, CABECALHO_TEXTO, CORPO_TEXTO, RODAPE_TEXTO,
        VARIAVEIS_EXEMPLO_JSON, BOTOES_JSON, ORIGEM, ATIVO, DATA_CRIACAO
      ) VALUES (
        'wpp-tpl-menu-principal',
        'menu_atendimento_principal',
        'pt_BR',
        'UTILITY',
        'RASCUNHO',
        'TEXT',
        'Central Operacional — PCMG',
        'Olá! Bem-vindo ao atendimento automático do sistema. Selecione abaixo uma das opções desejadas para prosseguir:',
        'Escolha uma opção nos botões abaixo',
        '[]',
        ?,
        'LOCAL',
        1,
        NOW()
      )`,
      [defaultMainButtons]
    );
    await pool.query(
      `UPDATE WHATSAPP_TEMPLATES
       SET CABECALHO_TEXTO = 'Central Operacional — PCMG',
           CORPO_TEXTO = 'Olá! Bem-vindo ao atendimento automático do sistema. Selecione abaixo uma das opções desejadas para prosseguir:',
           BOTOES_JSON = ?,
           DATA_ATUALIZACAO = NOW()
       WHERE ID_TEMPLATE = 'wpp-tpl-menu-principal'
         AND CABECALHO_TEXTO = 'Bem vindo(a) ao COEapp'`,
      [defaultMainButtons]
    );

    // Seed das regras padrão de comunicação
    const [regraRows]: any = await pool.query('SELECT COUNT(*) as cnt FROM WHATSAPP_REGRAS_COMUNICACAO');
    if (!regraRows?.[0]?.cnt) {
      const defaultRegras = [
        [
          'wpp-regra-01',
          'CAUTELA_ARMA_PENDENTE',
          'Cautela de Arma Pendente de Aceite',
          'Notifica o policial quando há uma cautela de armamento aguardando assinatura/aceite.',
          'USUARIO_DESTINO',
          JSON.stringify(['usuario.nome', 'cautela.codigo', 'unidade.nome'])
        ],
        [
          'wpp-regra-02',
          'CAUTELA_MUNICAO_PENDENTE',
          'Cautela de Munição Pendente',
          'Notifica o policial sobre cautela de munições emitida ou pendente.',
          'USUARIO_DESTINO',
          JSON.stringify(['usuario.nome', 'cautela.codigo', 'unidade.nome'])
        ],
        [
          'wpp-regra-03',
          'CAUTELA_MATERIAL_PENDENTE',
          'Cautela de Material Pendente',
          'Notifica o policial sobre cautela de material tático/operacional pendente.',
          'USUARIO_DESTINO',
          JSON.stringify(['usuario.nome', 'cautela.codigo', 'unidade.nome'])
        ],
        [
          'wpp-regra-04',
          'RELATORIO_ASSINATURA_PENDENTE',
          'Assinatura Pendente em Relatório',
          'Alerta integrantes citados em relatórios operacionais ou de treinamento aguardando assinatura.',
          'USUARIO_DESTINO',
          JSON.stringify(['usuario.nome', 'relatorio.tipo', 'relatorio.data'])
        ],
        [
          'wpp-regra-05',
          'VACINA_K9_VENCIMENTO',
          'Alerta de Reforço Vacinal K9',
          'Avisa condutores e responsáveis quando uma vacina de cão K9 está próxima do vencimento.',
          'RESPONSAVEL_UNIDADE',
          JSON.stringify(['animal.nome', 'vacina.nome', 'vacina.proxima_dose'])
        ],
        [
          'wpp-regra-06',
          'BOAS_VINDAS_USUARIO',
          'Boas-vindas / Novo Cadastro',
          'Envia orientação inicial de acesso quando um novo usuário é cadastrado no sistema.',
          'USUARIO_DESTINO',
          JSON.stringify(['usuario.nome', 'usuario.masp', 'unidade.nome'])
        ]
      ];
      for (const r of defaultRegras) {
        await pool.query(
          `INSERT IGNORE INTO WHATSAPP_REGRAS_COMUNICACAO (
            ID_REGRA, EVENTO_SISTEMA, NOME_EXIBICAO, DESCRICAO, DESTINATARIO_TIPO, MAPEAMENTO_VARIAVEIS_JSON, ATIVO, DATA_CRIACAO
          ) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
          r
        );
      }
    }

    // Seed idempotente da regra do Atendimento Interativo via Webhook
    await pool.query(
      `INSERT IGNORE INTO WHATSAPP_REGRAS_COMUNICACAO (
        ID_REGRA, EVENTO_SISTEMA, NOME_EXIBICAO, DESCRICAO, TEMPLATE_ID, TEMPLATE_NOME,
        DESTINATARIO_TIPO, MAPEAMENTO_VARIAVEIS_JSON, ATIVO, DATA_CRIACAO
      ) VALUES (
        'wpp-regra-07',
        'ATENDIMENTO_BOT_INTERATIVO',
        'Menu Interativo de Atendimento (Operações / Treinamentos / Armaria)',
        'Responde automaticamente mensagens recebidas no WhatsApp com o menu de Operações, Treinamentos e Armaria (emissão de PDFs, recibos e links temporários de cautela/devolução).',
        'wpp-tpl-menu-principal',
        'menu_atendimento_principal',
        'USUARIO_DESTINO',
        '[]',
        1,
        NOW()
      )`
    );
    await pool.query(
      `UPDATE WHATSAPP_REGRAS_COMUNICACAO
       SET NOME_EXIBICAO = 'Menu Interativo de Atendimento (Operações / Treinamentos / Armaria)',
           DESCRICAO = 'Responde automaticamente mensagens recebidas no WhatsApp com o menu de Operações, Treinamentos e Armaria (emissão de PDFs, recibos e links temporários de cautela/devolução).',
           DATA_ATUALIZACAO = NOW()
       WHERE ID_REGRA = 'wpp-regra-07'
         AND NOME_EXIBICAO = 'Menu Interativo COEapp (Armaria / Relatórios / Ficha de desempenho)'`
    );

    whatsappSchemaEnsured = true;
  } catch (err) {
    console.warn('Aviso ao verificar schema do módulo WhatsApp:', err);
  }
}

async function verifyWhatsappAdmin(
  pool: any,
  req: Request
): Promise<{ ok: boolean; status?: number; error?: string; user?: any }> {
  const actorId = String(
    req.headers['x-actor-id'] || req.body?.actor?.id || req.query?.actorId || ''
  ).trim();
  if (!actorId) {
    return { ok: false, status: 401, error: 'Usuário não autenticado para acessar o módulo WhatsApp.' };
  }
  const [rows]: any = await pool.query(
    `SELECT ID_USUARIOS as id, NOME_USUARIOS as name, MASP_USUARIOS as masp,
            PERFIL_USUARIOS as role, ROLES_USUARIOS as rolesJson
     FROM USUARIOS WHERE ID_USUARIOS = ? LIMIT 1`,
    [actorId]
  );
  const u = rows?.[0];
  if (!u) {
    return { ok: false, status: 403, error: 'Usuário não encontrado.' };
  }
  let roles: string[] = [String(u.role || '')];
  if (u.rolesJson) {
    try {
      const arr = typeof u.rolesJson === 'string' ? JSON.parse(u.rolesJson) : u.rolesJson;
      if (Array.isArray(arr)) roles = [...roles, ...arr.map(String)];
    } catch {}
  }
  const norm = roles.map(r => r.toLowerCase());
  if (!norm.includes('administrador') && !norm.includes('administrativo') && !norm.includes('geral')) {
    return {
      ok: false,
      status: 403,
      error: 'Acesso restrito a usuários com perfil Administrador.'
    };
  }
  return { ok: true, user: u };
}

async function loadRawWhatsappConfig(pool: any): Promise<any | null> {
  await ensureWhatsappSchema(pool);
  const [rows]: any = await pool.query(
    'SELECT * FROM WHATSAPP_CONFIGURACAO_API WHERE ID_CONFIG = ? LIMIT 1',
    [DEFAULT_CONFIG_ID]
  );
  return rows?.[0] || null;
}

function mapPublicConfig(row: any) {
  const rawToken = decryptSecret(row?.ACCESS_TOKEN_ENC);
  const rawSecret = decryptSecret(row?.APP_SECRET_ENC);
  const rawMakeSecret = decryptSecret(row?.MAKE_WEBHOOK_SECRET_ENC);
  const rawMakeApiKey = decryptSecret(row?.MAKE_API_KEY_ENC);
  const rawModo = String(row?.MODO_ATENDIMENTO || 'BOT_INTERNO').toUpperCase();
  const modoAtendimento = rawModo === 'MAKE' || rawModo === 'AMBOS' ? rawModo : 'BOT_INTERNO';

  return {
    id: row?.ID_CONFIG || DEFAULT_CONFIG_ID,
    ambiente: row?.AMBIENTE === 'PRODUCAO' ? 'PRODUCAO' : 'TESTE',
    ativo: Boolean(row?.ATIVO),
    nomePerfilExibicao: row?.NOME_PERFIL_EXIBICAO || '',
    numeroTelefoneExibicao: row?.NUMERO_TELEFONE_EXIBICAO || '',
    apiVersion: row?.API_VERSAO || 'v22.0',
    phoneNumberId: row?.PHONE_NUMBER_ID || '',
    wabaId: row?.WABA_ID || '',
    metaAppId: row?.META_APP_ID || '',
    hasAccessToken: Boolean(rawToken),
    accessTokenMasked: rawToken ? maskSecret(rawToken) : '',
    hasAppSecret: Boolean(rawSecret),
    appSecretMasked: rawSecret ? maskSecret(rawSecret) : '',
    webhookVerifyToken: row?.WEBHOOK_VERIFY_TOKEN || '',
    callbackUrlPublica: row?.CALLBACK_URL_PUBLICA || '',
    numeroTestePadrao: row?.NUMERO_TESTE_PADRAO || '',
    modoAtendimento,
    makeWebhookAtivo: Boolean(row?.MAKE_WEBHOOK_ATIVO),
    makeWebhookUrl: row?.MAKE_WEBHOOK_URL || '',
    makeEncaminharStatus: Boolean(row?.MAKE_ENCAMINHAR_STATUS),
    hasMakeWebhookSecret: Boolean(rawMakeSecret),
    makeWebhookSecretMasked: rawMakeSecret ? maskSecret(rawMakeSecret) : '',
    hasMakeApiKey: Boolean(rawMakeApiKey),
    makeApiKeyMasked: rawMakeApiKey ? maskSecret(rawMakeApiKey) : '',
    makeUltimoTesteStatus: row?.MAKE_ULTIMO_TESTE_STATUS || 'NAO_TESTADO',
    makeUltimoTesteMensagem: row?.MAKE_ULTIMO_TESTE_MENSAGEM || '',
    makeUltimoTesteEm: row?.MAKE_ULTIMO_TESTE_EM || null,
    ultimoTesteStatus: row?.ULTIMO_TESTE_STATUS || 'NAO_TESTADO',
    ultimoTesteMensagem: row?.ULTIMO_TESTE_MENSAGEM || '',
    ultimoTesteEm: row?.ULTIMO_TESTE_EM || null,
    atualizadoPorNome: row?.ATUALIZADO_POR_NOME || null,
    updatedAt: row?.DATA_ATUALIZACAO || null
  };
}

async function verifyMakeApiKey(
  pool: any,
  req: Request
): Promise<{ ok: boolean; status?: number; error?: string; cfgRow?: any }> {
  const cfgRow = await loadRawWhatsappConfig(pool);
  const expectedKey = decryptSecret(cfgRow?.MAKE_API_KEY_ENC);
  if (!expectedKey) {
    return {
      ok: false,
      status: 503,
      error: 'API Key de integração com o Make.com ainda não foi gerada na aba Configuração da API.'
    };
  }
  const headerKey = String(req.headers['x-make-api-key'] || '').trim();
  const authHeader = String(req.headers['authorization'] || '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const provided = headerKey || bearerKey;
  if (!provided || !timingSafeTextEqual(provided, expectedKey)) {
    return {
      ok: false,
      status: 401,
      error: 'Chave de autenticação inválida. Envie o header X-Make-Api-Key ou Authorization: Bearer <chave>.'
    };
  }
  return { ok: true, cfgRow };
}

async function forwardPayloadToMake(
  pool: any,
  cfgRow: any,
  payload: Record<string, any>,
  options?: { overrideSecret?: string; skipSecret?: boolean }
): Promise<{
  ok: boolean;
  status?: number;
  responseText?: string;
  gatewayHeader?: string;
  makeActualStatus?: string;
  sentAuthHeader?: boolean;
  error?: string;
}> {
  const targetUrl = sanitizeMakeWebhookUrl(cfgRow?.MAKE_WEBHOOK_URL);
  if (!targetUrl) {
    return { ok: false, error: 'URL do Custom Webhook do Make.com não configurada ou inválida.' };
  }

  const webhookSecret = options?.skipSecret
    ? ''
    : typeof options?.overrideSecret === 'string' && options.overrideSecret.trim()
      ? options.overrideSecret.trim()
      : decryptSecret(cfgRow?.MAKE_WEBHOOK_SECRET_ENC);

  // Envia POST limpo apenas com Content-Type: application/json quando não houver segredo configurado
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (webhookSecret) {
    headers['x-make-apikey'] = webhookSecret;
    headers['X-Webhook-Secret'] = webhookSecret;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = (await res.text().catch(() => '')).slice(0, 500);
    const gatewayHeader = res.headers.get('x-powered-by') || '';
    const makeActualStatus = res.headers.get('make-actual-status') || '';
    const evId = `wpp-mk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await pool.query(
      `INSERT INTO WHATSAPP_WEBHOOK_EVENTOS (
        ID_EVENTO, TIPO_EVENTO, ASSINATURA_VALIDA, RESUMO, PAYLOAD_JSON, DATA_RECEBIMENTO
      ) VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        evId,
        res.ok ? 'make_forward' : 'make_forward_error',
        res.ok ? 1 : 0,
        res.ok
          ? `Encaminhado ao Make.com com sucesso (HTTP ${res.status}): ${payload.eventType || 'event'}`
          : `Falha ao encaminhar ao Make.com (HTTP ${res.status}): ${text.slice(0, 140)}`,
        JSON.stringify({
          eventType: payload.eventType || 'minimal_test',
          httpStatus: res.status,
          gatewayHeader: gatewayHeader || undefined,
          makeActualStatus: makeActualStatus || undefined,
          sentAuthHeader: Boolean(webhookSecret),
          response: text
        }).slice(0, 10000)
      ]
    );
    return {
      ok: res.ok,
      status: res.status,
      responseText: text,
      gatewayHeader,
      makeActualStatus,
      sentAuthHeader: Boolean(webhookSecret)
    };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'Timeout (8s) ao contatar o webhook do Make.com' : err?.message || 'Erro de rede';
    try {
      const evId = `wpp-mk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO WHATSAPP_WEBHOOK_EVENTOS (
          ID_EVENTO, TIPO_EVENTO, ASSINATURA_VALIDA, RESUMO, PAYLOAD_JSON, DATA_RECEBIMENTO
        ) VALUES (?, 'make_forward_error', 0, ?, ?, NOW())`,
        [evId, `Erro ao encaminhar ao Make.com: ${msg.slice(0, 180)}`, JSON.stringify({ eventType: payload.eventType, error: msg })]
      );
    } catch {}
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

function mapTemplateRow(row: any) {
  let variaveisExemplo: string[] = [];
  let botoes: any[] = [];
  try {
    const parsed = row.VARIAVEIS_EXEMPLO_JSON ? JSON.parse(row.VARIAVEIS_EXEMPLO_JSON) : [];
    if (Array.isArray(parsed)) variaveisExemplo = parsed.map(String);
  } catch {}
  try {
    const parsed = row.BOTOES_JSON ? JSON.parse(row.BOTOES_JSON) : [];
    if (Array.isArray(parsed)) botoes = parsed;
  } catch {}
  return {
    id: row.ID_TEMPLATE,
    metaTemplateId: row.META_TEMPLATE_ID || null,
    nome: row.NOME_TEMPLATE,
    idioma: row.IDIOMA || 'pt_BR',
    categoria: row.CATEGORIA || 'UTILITY',
    statusMeta: row.STATUS_META || 'RASCUNHO',
    cabecalhoTipo: row.CABECALHO_TIPO || 'NONE',
    cabecalhoTexto: row.CABECALHO_TEXTO || '',
    corpoTexto: row.CORPO_TEXTO || '',
    rodapeTexto: row.RODAPE_TEXTO || '',
    variaveisExemplo,
    botoes,
    origem: row.ORIGEM || 'LOCAL',
    ativo: Boolean(row.ATIVO),
    criadoPorNome: row.CRIADO_POR_NOME || null,
    createdAt: row.DATA_CRIACAO || null,
    updatedAt: row.DATA_ATUALIZACAO || null
  };
}

function mapRegraRow(row: any) {
  let mapeamentoVariaveis: string[] = [];
  try {
    const parsed = row.MAPEAMENTO_VARIAVEIS_JSON ? JSON.parse(row.MAPEAMENTO_VARIAVEIS_JSON) : [];
    if (Array.isArray(parsed)) mapeamentoVariaveis = parsed.map(String);
  } catch {}
  return {
    id: row.ID_REGRA,
    eventoSistema: row.EVENTO_SISTEMA,
    nomeExibicao: row.NOME_EXIBICAO,
    descricao: row.DESCRICAO || '',
    templateId: row.TEMPLATE_ID || null,
    templateNome: row.TEMPLATE_NOME || '',
    destinatarioTipo: row.DESTINATARIO_TIPO || 'USUARIO_DESTINO',
    numeroDestinoFixo: row.NUMERO_DESTINO_FIXO || '',
    mapeamentoVariaveis,
    horarioInicio: row.HORARIO_INICIO || '00:00',
    horarioFim: row.HORARIO_FIM || '23:59',
    respeitarSilencio: Boolean(row.RESPEITAR_SILENCIO),
    maxTentativas: Number(row.MAX_TENTATIVAS || 3),
    ativo: Boolean(row.ATIVO),
    atualizadoPorNome: row.ATUALIZADO_POR_NOME || null,
    updatedAt: row.DATA_ATUALIZACAO || null
  };
}

async function sendMetaCloudMessage(
  pool: any,
  cfgRow: any,
  params: {
    toPhone: string;
    mode: 'template' | 'text';
    templateName?: string;
    languageCode?: string;
    bodyParameters?: string[];
    textBody?: string;
    usuarioDestinoId?: string | null;
    usuarioDestinoNome?: string | null;
    eventoSistema?: string | null;
    tipoMensagem?: string;
    actor?: { id?: string; name?: string };
  }
) {
  const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
  const phoneNumberId = sanitizeNumericId(cfgRow?.PHONE_NUMBER_ID);
  const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);

  if (!phoneNumberId || !accessToken) {
    return {
      success: false,
      error: 'Configure o Phone Number ID e o Access Token na aba Configuração da API antes de enviar mensagens.'
    };
  }

  const cleanTo = normalizePhoneDigits(params.toPhone);
  if (cleanTo.length < 10 || cleanTo.length > 15) {
    return {
      success: false,
      error: 'Informe um número de destino válido com DDI e DDD (ex: 5531999990000).'
    };
  }

  let payload: any;
  let resumo = '';
  let tplNameForLog: string | null = null;

  if (params.mode === 'template') {
    const cleanTpl = sanitizeTemplateName(params.templateName);
    if (!cleanTpl) {
      return { success: false, error: 'Informe um nome de template válido.' };
    }
    const lang = String(params.languageCode || 'pt_BR').trim().slice(0, 16) || 'pt_BR';
    tplNameForLog = cleanTpl;
    const components: any[] = [];
    const cleanBodyParams = (params.bodyParameters || [])
      .map(v => String(v ?? '').trim())
      .filter(Boolean);
    if (cleanBodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: cleanBodyParams.map(text => ({ type: 'text', text: text.slice(0, 500) }))
      });
    }
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: cleanTpl,
        language: { code: lang },
        ...(components.length > 0 ? { components } : {})
      }
    };
    resumo = `Template "${cleanTpl}" (${lang})${cleanBodyParams.length ? ` • Vars: ${cleanBodyParams.join(', ')}` : ''}`;
  } else {
    const bodyText = String(params.textBody || '').trim().slice(0, 4096);
    if (!bodyText) {
      return { success: false, error: 'Digite o texto da mensagem.' };
    }
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: {
        preview_url: false,
        body: bodyText
      }
    };
    resumo = bodyText.slice(0, 400);
  }

  const msgId = `wpp-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const endpointUrl = `${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`;

  let metaMessageId: string | null = null;
  let statusEntrega = 'PENDENTE';
  let erroCodigo: string | null = null;
  let erroMensagem: string | null = null;
  let responseJson: any = null;

  try {
    const metaRes = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    responseJson = await metaRes.json().catch(() => ({}));

    if (metaRes.ok && responseJson?.messages?.[0]?.id) {
      metaMessageId = String(responseJson.messages[0].id);
      statusEntrega = 'ENVIADA';
    } else {
      statusEntrega = 'FALHOU';
      erroCodigo = String(responseJson?.error?.code || metaRes.status);
      erroMensagem =
        responseJson?.error?.error_user_msg ||
        responseJson?.error?.message ||
        `Erro HTTP ${metaRes.status} na Meta Cloud API`;
    }
  } catch (networkErr: any) {
    statusEntrega = 'FALHOU';
    erroCodigo = 'NETWORK_ERROR';
    erroMensagem = networkErr?.message || 'Falha de conexão com graph.facebook.com';
  }

  await pool.query(
    `INSERT INTO WHATSAPP_MENSAGENS (
      ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
      USUARIO_DESTINO_ID, USUARIO_DESTINO_NOME, TIPO_MENSAGEM, TEMPLATE_NOME,
      EVENTO_SISTEMA, CONTEUDO_RESUMO, META_MESSAGE_ID, STATUS_ENTREGA,
      ERRO_CODIGO, ERRO_MENSAGEM, PAYLOAD_REQUISICAO_JSON, PAYLOAD_RESPOSTA_JSON,
      ENVIADO_POR_ID, ENVIADO_POR_NOME, DATA_CRIACAO
    ) VALUES (?, 'SAIDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      msgId,
      cleanTo,
      cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
      params.usuarioDestinoId || null,
      params.usuarioDestinoNome || null,
      params.tipoMensagem || params.mode,
      tplNameForLog,
      params.eventoSistema || null,
      resumo,
      metaMessageId,
      statusEntrega,
      erroCodigo,
      erroMensagem,
      JSON.stringify(payload),
      responseJson ? JSON.stringify(responseJson) : null,
      params.actor?.id || null,
      params.actor?.name || null
    ]
  );

  if (statusEntrega === 'ENVIADA') {
    return {
      success: true,
      id: msgId,
      metaMessageId,
      statusEntrega,
      response: responseJson
    };
  }
  return {
    success: false,
    id: msgId,
    statusEntrega,
    errorCode: erroCodigo,
    error: erroMensagem || 'Falha ao enviar mensagem pelo WhatsApp Cloud API.'
  };
}

export function registerWhatsappRoutes(apiRouter: Router, deps: WhatsappRoutesDeps): void {
  const { getPool, insertAuditLog } = deps;

  // 1. OBTER CONFIGURAÇÃO DA API (Admin / Geral)
  apiRouter.get('/whatsapp/config', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const row = await loadRawWhatsappConfig(pool);
      return res.json(mapPublicConfig(row));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. SALVAR / ATUALIZAR CONFIGURAÇÃO DA API (Suporta Teste <-> Produção a qualquer momento)
  apiRouter.put('/whatsapp/config', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const existing = await loadRawWhatsappConfig(pool);
      const body = req.body || {};

      const ambiente = body.ambiente === 'PRODUCAO' ? 'PRODUCAO' : 'TESTE';
      const ativo = body.ativo ? 1 : 0;
      const nomePerfilExibicao = String(body.nomePerfilExibicao || '').trim().slice(0, 160) || null;
      const numeroTelefoneExibicao = String(body.numeroTelefoneExibicao || '').trim().slice(0, 32) || null;
      const rawVersion = String(body.apiVersion || 'v22.0').trim();
      if (!ALLOWED_API_VERSIONS.has(rawVersion)) {
        return res.status(400).json({ error: 'Versão da Meta Graph API inválida.' });
      }

      const rawPhoneId = String(body.phoneNumberId || '').trim();
      if (rawPhoneId && !/^\d{5,30}$/.test(rawPhoneId)) {
        return res.status(400).json({ error: 'Phone Number ID deve conter apenas dígitos (5 a 30 números).' });
      }
      const rawWabaId = String(body.wabaId || '').trim();
      if (rawWabaId && !/^\d{5,30}$/.test(rawWabaId)) {
        return res.status(400).json({ error: 'WABA ID (ID da Conta WhatsApp Business) deve conter apenas dígitos.' });
      }
      const rawAppId = String(body.metaAppId || '').trim();
      if (rawAppId && !/^\d{5,30}$/.test(rawAppId)) {
        return res.status(400).json({ error: 'Meta App ID deve conter apenas dígitos.' });
      }

      const cleanVerifyToken = String(body.webhookVerifyToken || existing?.WEBHOOK_VERIFY_TOKEN || '').trim().slice(0, 160);
      const cleanPublicUrl = sanitizeSafePublicUrl(body.callbackUrlPublica) || null;
      const cleanTestPhone = normalizePhoneDigits(body.numeroTestePadrao).slice(0, 20) || null;

      const rawModo = String(body.modoAtendimento ?? existing?.MODO_ATENDIMENTO ?? 'BOT_INTERNO').toUpperCase();
      const modoAtendimento = rawModo === 'MAKE' || rawModo === 'AMBOS' ? rawModo : 'BOT_INTERNO';
      const makeWebhookAtivo =
        body.makeWebhookAtivo !== undefined ? (body.makeWebhookAtivo ? 1 : 0) : existing?.MAKE_WEBHOOK_ATIVO ? 1 : 0;
      const makeEncaminharStatus =
        body.makeEncaminharStatus !== undefined
          ? body.makeEncaminharStatus
            ? 1
            : 0
          : existing?.MAKE_ENCAMINHAR_STATUS
          ? 1
          : 0;

      const rawMakeUrl =
        body.makeWebhookUrl !== undefined ? String(body.makeWebhookUrl || '').trim() : String(existing?.MAKE_WEBHOOK_URL || '').trim();
      let cleanMakeWebhookUrl: string | null = null;
      if (rawMakeUrl) {
        const sanitizedMake = sanitizeMakeWebhookUrl(rawMakeUrl);
        if (!sanitizedMake) {
          return res.status(400).json({
            error: 'URL do Webhook do Make inválida. Informe uma URL HTTPS oficial do Make (ex: https://hook.us2.make.com/...).'
          });
        }
        cleanMakeWebhookUrl = sanitizedMake;
      }

      let accessTokenEnc = existing?.ACCESS_TOKEN_ENC || null;
      if (body.clearAccessToken === true) {
        accessTokenEnc = null;
      } else if (typeof body.accessToken === 'string' && body.accessToken.trim().length > 0) {
        accessTokenEnc = encryptSecret(body.accessToken.trim());
      }

      let appSecretEnc = existing?.APP_SECRET_ENC || null;
      if (body.clearAppSecret === true) {
        appSecretEnc = null;
      } else if (typeof body.appSecret === 'string' && body.appSecret.trim().length > 0) {
        appSecretEnc = encryptSecret(body.appSecret.trim());
      }

      let makeWebhookSecretEnc = existing?.MAKE_WEBHOOK_SECRET_ENC || null;
      if (body.clearMakeWebhookSecret === true) {
        makeWebhookSecretEnc = null;
      } else if (typeof body.makeWebhookSecret === 'string' && body.makeWebhookSecret.trim().length > 0) {
        makeWebhookSecretEnc = encryptSecret(body.makeWebhookSecret.trim());
      }

      let makeApiKeyEnc = existing?.MAKE_API_KEY_ENC || null;
      if (body.clearMakeApiKey === true) {
        makeApiKeyEnc = null;
      }

      await pool.query(
        `UPDATE WHATSAPP_CONFIGURACAO_API SET
          AMBIENTE = ?,
          ATIVO = ?,
          NOME_PERFIL_EXIBICAO = ?,
          NUMERO_TELEFONE_EXIBICAO = ?,
          API_VERSAO = ?,
          PHONE_NUMBER_ID = ?,
          WABA_ID = ?,
          META_APP_ID = ?,
          ACCESS_TOKEN_ENC = ?,
          APP_SECRET_ENC = ?,
          WEBHOOK_VERIFY_TOKEN = ?,
          CALLBACK_URL_PUBLICA = ?,
          NUMERO_TESTE_PADRAO = ?,
          MODO_ATENDIMENTO = ?,
          MAKE_WEBHOOK_ATIVO = ?,
          MAKE_WEBHOOK_URL = ?,
          MAKE_WEBHOOK_SECRET_ENC = ?,
          MAKE_ENCAMINHAR_STATUS = ?,
          MAKE_API_KEY_ENC = ?,
          ATUALIZADO_POR_ID = ?,
          ATUALIZADO_POR_NOME = ?,
          DATA_ATUALIZACAO = NOW()
         WHERE ID_CONFIG = ?`,
        [
          ambiente,
          ativo,
          nomePerfilExibicao,
          numeroTelefoneExibicao,
          rawVersion,
          rawPhoneId || null,
          rawWabaId || null,
          rawAppId || null,
          accessTokenEnc,
          appSecretEnc,
          cleanVerifyToken || null,
          cleanPublicUrl,
          cleanTestPhone,
          modoAtendimento,
          makeWebhookAtivo,
          cleanMakeWebhookUrl,
          makeWebhookSecretEnc,
          makeEncaminharStatus,
          makeApiKeyEnc,
          auth.user.id,
          auth.user.name,
          DEFAULT_CONFIG_ID
        ]
      );

      await insertAuditLog(
        'WhatsApp',
        'Atualizar Configuração API',
        `Configuração Meta/Make atualizada (Ambiente: ${ambiente}, Ativo: ${ativo ? 'Sim' : 'Não'}, Modo: ${modoAtendimento}, Make: ${makeWebhookAtivo ? 'Ativo' : 'Inativo'})`,
        auth.user,
        req.ip
      );

      const updated = await loadRawWhatsappConfig(pool);
      return res.json({ success: true, config: mapPublicConfig(updated) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. TESTAR CONEXÃO REAL COM A META GRAPH API
  apiRouter.post('/whatsapp/test-connection', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
      const phoneNumberId = sanitizeNumericId(cfgRow?.PHONE_NUMBER_ID);
      const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);

      if (!phoneNumberId || !accessToken) {
        return res.status(400).json({
          error: 'Salve o Phone Number ID e o Access Token antes de testar a conexão.'
        });
      }

      const url = `${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`;

      let ok = false;
      let msg = '';
      let details: any = null;

      try {
        const metaRes = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const json: any = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && json?.id) {
          ok = true;
          details = {
            id: json.id,
            displayPhoneNumber: json.display_phone_number || '',
            verifiedName: json.verified_name || '',
            qualityRating: json.quality_rating || '',
            codeVerificationStatus: json.code_verification_status || ''
          };
          msg = `Conectado com sucesso: ${json.verified_name || 'Conta WhatsApp'} (${json.display_phone_number || json.id}) • Qualidade: ${json.quality_rating || 'N/D'}`;
        } else {
          msg = json?.error?.message || `Falha HTTP ${metaRes.status} ao validar credenciais na Meta Graph API.`;
        }
      } catch (netErr: any) {
        msg = `Erro de rede ao contatar graph.facebook.com: ${netErr?.message || 'Timeout'}`;
      }

      await pool.query(
        `UPDATE WHATSAPP_CONFIGURACAO_API SET
          ULTIMO_TESTE_STATUS = ?,
          ULTIMO_TESTE_MENSAGEM = ?,
          ULTIMO_TESTE_EM = NOW(),
          NOME_PERFIL_EXIBICAO = COALESCE(NULLIF(?, ''), NOME_PERFIL_EXIBICAO),
          NUMERO_TELEFONE_EXIBICAO = COALESCE(NULLIF(?, ''), NUMERO_TELEFONE_EXIBICAO)
         WHERE ID_CONFIG = ?`,
        [
          ok ? 'CONECTADO' : 'ERRO',
          msg.slice(0, 1000),
          details?.verifiedName || '',
          details?.displayPhoneNumber || '',
          DEFAULT_CONFIG_ID
        ]
      );

      await insertAuditLog(
        'WhatsApp',
        'Testar Conexão API',
        `Teste de conexão Meta Cloud API: ${ok ? 'CONECTADO' : 'ERRO'} — ${msg.slice(0, 200)}`,
        auth.user,
        req.ip
      );

      const updated = await loadRawWhatsappConfig(pool);
      return res.status(ok ? 200 : 400).json({
        success: ok,
        message: msg,
        details,
        config: mapPublicConfig(updated)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. ENVIAR MENSAGEM DE TESTE REAL (Aba Configuração da API)
  apiRouter.post('/whatsapp/send-test', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const { toPhone, mode, templateName, languageCode, bodyParameters, textBody } = req.body || {};

      const result = await sendMetaCloudMessage(pool, cfgRow, {
        toPhone: toPhone || cfgRow?.NUMERO_TESTE_PADRAO || '',
        mode: mode === 'text' ? 'text' : 'template',
        templateName: templateName || 'hello_world',
        languageCode: languageCode || 'en_US',
        bodyParameters: Array.isArray(bodyParameters) ? bodyParameters : [],
        textBody,
        tipoMensagem: 'test',
        eventoSistema: 'TESTE_API_ADMIN',
        actor: auth.user
      });

      await insertAuditLog(
        'WhatsApp',
        'Enviar Mensagem de Teste',
        `Envio de teste para ${normalizePhoneDigits(toPhone || cfgRow?.NUMERO_TESTE_PADRAO)}: ${result.success ? `OK (${result.metaMessageId})` : `FALHA (${result.error})`}`,
        auth.user,
        req.ip
      );

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. TEMPLATES — LISTAR, CRIAR, EDITAR, EXCLUIR E SINCRONIZAR DA META
  apiRouter.get('/whatsapp/templates', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const [rows]: any = await pool.query(
        'SELECT * FROM WHATSAPP_TEMPLATES ORDER BY STATUS_META = "APPROVED" DESC, NOME_TEMPLATE ASC'
      );
      return res.json((rows || []).map(mapTemplateRow));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/templates', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const body = req.body || {};
      const nome = sanitizeTemplateName(body.nome);
      if (!nome) {
        return res.status(400).json({
          error: 'Informe o nome técnico da template usando apenas letras minúsculas, números e underline (ex: aviso_cautela).'
        });
      }
      const idioma = String(body.idioma || 'pt_BR').trim().slice(0, 16) || 'pt_BR';
      const categoria = ['UTILITY', 'AUTHENTICATION', 'MARKETING'].includes(body.categoria)
        ? body.categoria
        : 'UTILITY';
      const cabecalhoTipo = ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'].includes(body.cabecalhoTipo)
        ? body.cabecalhoTipo
        : 'NONE';
      const cabecalhoTexto = cabecalhoTipo === 'TEXT' ? String(body.cabecalhoTexto || '').trim().slice(0, 120) : null;
      const corpoTexto = String(body.corpoTexto || '').trim().slice(0, 1024);
      if (!corpoTexto) {
        return res.status(400).json({ error: 'O corpo da mensagem da template é obrigatório.' });
      }
      const rodapeTexto = String(body.rodapeTexto || '').trim().slice(0, 120) || null;
      const variaveisExemplo = Array.isArray(body.variaveisExemplo)
        ? body.variaveisExemplo.map((v: any) => String(v || '').trim().slice(0, 120)).filter(Boolean)
        : [];
      const botoes = Array.isArray(body.botoes)
        ? body.botoes
            .map((b: any) => ({
              type: 'QUICK_REPLY',
              text: String(typeof b === 'string' ? b : b?.text || '').trim().slice(0, 25)
            }))
            .filter((b: any) => b.text.length > 0)
            .slice(0, 3)
        : [];

      let metaTemplateId: string | null = null;
      let statusMeta = 'RASCUNHO';
      let metaSubmitWarning = '';

      // Opcional: submeter diretamente para aprovação na Meta Graph API
      if (body.enviarParaMeta === true) {
        const cfgRow = await loadRawWhatsappConfig(pool);
        const wabaId = sanitizeNumericId(cfgRow?.WABA_ID);
        const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
        const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';

        if (!wabaId || !accessToken) {
          return res.status(400).json({
            error: 'Para enviar a template para aprovação na Meta, configure antes o WABA ID e o Access Token na aba Configuração da API.'
          });
        }

        const components: any[] = [];
        if (cabecalhoTipo === 'TEXT' && cabecalhoTexto) {
          components.push({ type: 'HEADER', format: 'TEXT', text: cabecalhoTexto });
        }
        const bodyComp: any = { type: 'BODY', text: corpoTexto };
        if (variaveisExemplo.length > 0) {
          bodyComp.example = { body_text: [variaveisExemplo] };
        }
        components.push(bodyComp);
        if (rodapeTexto) {
          components.push({ type: 'FOOTER', text: rodapeTexto });
        }
        if (botoes.length > 0) {
          components.push({
            type: 'BUTTONS',
            buttons: botoes.map((b: any) => ({ type: 'QUICK_REPLY', text: b.text }))
          });
        }

        const metaRes = await fetch(`${META_GRAPH_BASE_URL}/${apiVersion}/${wabaId}/message_templates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: nome,
            language: idioma,
            category: categoria,
            components
          })
        });
        const metaJson: any = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && metaJson?.id) {
          metaTemplateId = String(metaJson.id);
          statusMeta = String(metaJson.status || 'PENDING').toUpperCase();
        } else {
          return res.status(400).json({
            error: metaJson?.error?.error_user_msg || metaJson?.error?.message || 'Meta rejeitou a submissão da template.'
          });
        }
      }

      const id = `wpp-tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO WHATSAPP_TEMPLATES (
          ID_TEMPLATE, META_TEMPLATE_ID, NOME_TEMPLATE, IDIOMA, CATEGORIA, STATUS_META,
          CABECALHO_TIPO, CABECALHO_TEXTO, CORPO_TEXTO, RODAPE_TEXTO, VARIAVEIS_EXEMPLO_JSON, BOTOES_JSON,
          ORIGEM, ATIVO, CRIADO_POR_ID, CRIADO_POR_NOME, DATA_CRIACAO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOCAL', 1, ?, ?, NOW())`,
        [
          id,
          metaTemplateId,
          nome,
          idioma,
          categoria,
          statusMeta,
          cabecalhoTipo,
          cabecalhoTexto,
          corpoTexto,
          rodapeTexto,
          JSON.stringify(variaveisExemplo),
          JSON.stringify(botoes),
          auth.user.id,
          auth.user.name
        ]
      );

      await insertAuditLog(
        'WhatsApp',
        'Cadastrar Template',
        `Template "${nome}" (${idioma}) cadastrada${metaTemplateId ? ' e submetida à Meta' : ''}`,
        auth.user,
        req.ip
      );

      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_TEMPLATES WHERE ID_TEMPLATE = ? LIMIT 1', [id]);
      return res.json({ success: true, warning: metaSubmitWarning || undefined, template: mapTemplateRow(rows[0]) });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Já existe uma template com este mesmo nome e idioma.' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.put('/whatsapp/templates/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const { id } = req.params;
      const body = req.body || {};

      const nome = sanitizeTemplateName(body.nome);
      if (!nome) return res.status(400).json({ error: 'Nome de template inválido.' });
      const idioma = String(body.idioma || 'pt_BR').trim().slice(0, 16) || 'pt_BR';
      const categoria = ['UTILITY', 'AUTHENTICATION', 'MARKETING'].includes(body.categoria)
        ? body.categoria
        : 'UTILITY';
      const cabecalhoTipo = ['NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'].includes(body.cabecalhoTipo)
        ? body.cabecalhoTipo
        : 'NONE';
      const cabecalhoTexto = cabecalhoTipo === 'TEXT' ? String(body.cabecalhoTexto || '').trim().slice(0, 120) : null;
      const corpoTexto = String(body.corpoTexto || '').trim().slice(0, 1024);
      if (!corpoTexto) return res.status(400).json({ error: 'O corpo da mensagem é obrigatório.' });
      const rodapeTexto = String(body.rodapeTexto || '').trim().slice(0, 120) || null;
      const variaveisExemplo = Array.isArray(body.variaveisExemplo)
        ? body.variaveisExemplo.map((v: any) => String(v || '').trim().slice(0, 120)).filter(Boolean)
        : [];
      const botoes = Array.isArray(body.botoes)
        ? body.botoes
            .map((b: any) => ({
              type: 'QUICK_REPLY',
              text: String(typeof b === 'string' ? b : b?.text || '').trim().slice(0, 25)
            }))
            .filter((b: any) => b.text.length > 0)
            .slice(0, 3)
        : [];
      const ativo = body.ativo === false ? 0 : 1;

      await pool.query(
        `UPDATE WHATSAPP_TEMPLATES SET
          NOME_TEMPLATE = ?,
          IDIOMA = ?,
          CATEGORIA = ?,
          CABECALHO_TIPO = ?,
          CABECALHO_TEXTO = ?,
          CORPO_TEXTO = ?,
          RODAPE_TEXTO = ?,
          VARIAVEIS_EXEMPLO_JSON = ?,
          BOTOES_JSON = ?,
          ATIVO = ?,
          DATA_ATUALIZACAO = NOW()
         WHERE ID_TEMPLATE = ?`,
        [
          nome,
          idioma,
          categoria,
          cabecalhoTipo,
          cabecalhoTexto,
          corpoTexto,
          rodapeTexto,
          JSON.stringify(variaveisExemplo),
          JSON.stringify(botoes),
          ativo,
          id
        ]
      );

      await insertAuditLog('WhatsApp', 'Editar Template', `Template "${nome}" (${idioma}) atualizada`, auth.user, req.ip);
      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_TEMPLATES WHERE ID_TEMPLATE = ? LIMIT 1', [id]);
      return res.json({ success: true, template: rows?.[0] ? mapTemplateRow(rows[0]) : null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // SUBMETER TEMPLATE LOCAL EXISTENTE PARA APROVAÇÃO NA META (COM BOTÕES QUICK REPLY)
  apiRouter.post('/whatsapp/templates/:id/submit-meta', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const { id } = req.params;
      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_TEMPLATES WHERE ID_TEMPLATE = ? LIMIT 1', [id]);
      const tplRow = rows?.[0];
      if (!tplRow) return res.status(404).json({ error: 'Template não encontrada.' });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const wabaId = sanitizeNumericId(cfgRow?.WABA_ID);
      const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
      const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
      if (!wabaId || !accessToken) {
        return res.status(400).json({
          error: 'Configure o WABA ID e o Access Token na aba Configuração da API antes de enviar a template para aprovação na Meta.'
        });
      }

      const tpl = mapTemplateRow(tplRow);
      const components: any[] = [];
      if (tpl.cabecalhoTipo === 'TEXT' && tpl.cabecalhoTexto) {
        components.push({ type: 'HEADER', format: 'TEXT', text: tpl.cabecalhoTexto });
      }
      const bodyComp: any = { type: 'BODY', text: tpl.corpoTexto };
      if (tpl.variaveisExemplo.length > 0) {
        bodyComp.example = { body_text: [tpl.variaveisExemplo] };
      }
      components.push(bodyComp);
      if (tpl.rodapeTexto) {
        components.push({ type: 'FOOTER', text: tpl.rodapeTexto });
      }
      if (tpl.botoes.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: tpl.botoes.slice(0, 3).map((b: any) => ({
            type: 'QUICK_REPLY',
            text: String(b?.text || '').trim().slice(0, 25)
          }))
        });
      }

      const metaRes = await fetch(`${META_GRAPH_BASE_URL}/${apiVersion}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: tpl.nome,
          language: tpl.idioma,
          category: tpl.categoria,
          components
        })
      });
      const metaJson: any = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok || !metaJson?.id) {
        return res.status(400).json({
          error: metaJson?.error?.error_user_msg || metaJson?.error?.message || 'Meta rejeitou a submissão da template.'
        });
      }

      const statusMeta = String(metaJson.status || 'PENDING').toUpperCase();
      await pool.query(
        `UPDATE WHATSAPP_TEMPLATES SET META_TEMPLATE_ID = ?, STATUS_META = ?, DATA_ATUALIZACAO = NOW() WHERE ID_TEMPLATE = ?`,
        [String(metaJson.id), statusMeta, id]
      );
      await insertAuditLog(
        'WhatsApp',
        'Submeter Template Meta',
        `Template "${tpl.nome}" (${tpl.idioma}) enviada para aprovação na Meta (ID: ${metaJson.id})`,
        auth.user,
        req.ip
      );
      const [updated]: any = await pool.query('SELECT * FROM WHATSAPP_TEMPLATES WHERE ID_TEMPLATE = ? LIMIT 1', [id]);
      return res.json({ success: true, template: mapTemplateRow(updated[0]) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/whatsapp/templates/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const { id } = req.params;
      await pool.query('DELETE FROM WHATSAPP_TEMPLATES WHERE ID_TEMPLATE = ?', [id]);
      await insertAuditLog('WhatsApp', 'Excluir Template', `Template ID ${id} removida localmente`, auth.user, req.ip);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // SINCRONIZAR TEMPLATES OFICIAIS DA CONTA META (WABA)
  apiRouter.post('/whatsapp/templates/sync', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const wabaId = sanitizeNumericId(cfgRow?.WABA_ID);
      const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
      const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';

      if (!wabaId || !accessToken) {
        return res.status(400).json({
          error: 'Configure o WABA ID (WhatsApp Business Account ID) e o Access Token na aba Configuração da API para sincronizar templates da Meta.'
        });
      }

      const metaRes = await fetch(
        `${META_GRAPH_BASE_URL}/${apiVersion}/${wabaId}/message_templates?limit=100`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      const metaJson: any = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok || !Array.isArray(metaJson?.data)) {
        return res.status(400).json({
          error: metaJson?.error?.message || `Erro HTTP ${metaRes.status} ao consultar templates da Meta.`
        });
      }

      let syncedCount = 0;
      for (const tpl of metaJson.data) {
        const nome = sanitizeTemplateName(tpl.name);
        if (!nome) continue;
        const idioma = String(tpl.language || 'pt_BR').slice(0, 16);
        const categoria = ['UTILITY', 'AUTHENTICATION', 'MARKETING'].includes(String(tpl.category || '').toUpperCase())
          ? String(tpl.category).toUpperCase()
          : 'UTILITY';
        const statusMeta = String(tpl.status || 'PENDING').toUpperCase().slice(0, 32);
        const comps = Array.isArray(tpl.components) ? tpl.components : [];
        const headerComp = comps.find((c: any) => c.type === 'HEADER');
        const bodyComp = comps.find((c: any) => c.type === 'BODY');
        const footerComp = comps.find((c: any) => c.type === 'FOOTER');
        const buttonsComp = comps.find((c: any) => c.type === 'BUTTONS');

        const cabecalhoTipo = headerComp?.format
          ? ['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'].includes(String(headerComp.format).toUpperCase())
            ? String(headerComp.format).toUpperCase()
            : 'NONE'
          : 'NONE';
        const cabecalhoTexto = cabecalhoTipo === 'TEXT' ? String(headerComp?.text || '').slice(0, 120) : null;
        const corpoTexto = String(bodyComp?.text || '(Template sem corpo textual)').slice(0, 1024);
        const rodapeTexto = footerComp?.text ? String(footerComp.text).slice(0, 120) : null;
        const exampleArr = Array.isArray(bodyComp?.example?.body_text?.[0])
          ? bodyComp.example.body_text[0].map(String)
          : [];
        const botoes = Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons : [];

        const [existing]: any = await pool.query(
          'SELECT ID_TEMPLATE FROM WHATSAPP_TEMPLATES WHERE NOME_TEMPLATE = ? AND IDIOMA = ? LIMIT 1',
          [nome, idioma]
        );
        if (existing && existing.length > 0) {
          await pool.query(
            `UPDATE WHATSAPP_TEMPLATES SET
              META_TEMPLATE_ID = ?, CATEGORIA = ?, STATUS_META = ?,
              CABECALHO_TIPO = ?, CABECALHO_TEXTO = ?, CORPO_TEXTO = ?, RODAPE_TEXTO = ?,
              VARIAVEIS_EXEMPLO_JSON = ?, BOTOES_JSON = ?, ORIGEM = 'META_SYNC', DATA_ATUALIZACAO = NOW()
             WHERE ID_TEMPLATE = ?`,
            [
              String(tpl.id || ''),
              categoria,
              statusMeta,
              cabecalhoTipo,
              cabecalhoTexto,
              corpoTexto,
              rodapeTexto,
              JSON.stringify(exampleArr),
              JSON.stringify(botoes),
              existing[0].ID_TEMPLATE
            ]
          );
        } else {
          const id = `wpp-tpl-${Date.now()}-${syncedCount}-${Math.random().toString(36).substring(2, 5)}`;
          await pool.query(
            `INSERT INTO WHATSAPP_TEMPLATES (
              ID_TEMPLATE, META_TEMPLATE_ID, NOME_TEMPLATE, IDIOMA, CATEGORIA, STATUS_META,
              CABECALHO_TIPO, CABECALHO_TEXTO, CORPO_TEXTO, RODAPE_TEXTO,
              VARIAVEIS_EXEMPLO_JSON, BOTOES_JSON, ORIGEM, ATIVO, CRIADO_POR_ID, CRIADO_POR_NOME, DATA_CRIACAO
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'META_SYNC', 1, ?, ?, NOW())`,
            [
              id,
              String(tpl.id || ''),
              nome,
              idioma,
              categoria,
              statusMeta,
              cabecalhoTipo,
              cabecalhoTexto,
              corpoTexto,
              rodapeTexto,
              JSON.stringify(exampleArr),
              JSON.stringify(botoes),
              auth.user.id,
              auth.user.name
            ]
          );
        }
        syncedCount += 1;
      }

      await insertAuditLog(
        'WhatsApp',
        'Sincronizar Templates Meta',
        `Sincronizadas ${syncedCount} template(s) da conta WABA ${wabaId}`,
        auth.user,
        req.ip
      );

      const [allRows]: any = await pool.query(
        'SELECT * FROM WHATSAPP_TEMPLATES ORDER BY STATUS_META = "APPROVED" DESC, NOME_TEMPLATE ASC'
      );
      return res.json({ success: true, syncedCount, templates: (allRows || []).map(mapTemplateRow) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. REGRAS DE COMUNICAÇÃO
  apiRouter.get('/whatsapp/regras', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_REGRAS_COMUNICACAO ORDER BY NOME_EXIBICAO ASC');
      return res.json((rows || []).map(mapRegraRow));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/regras', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const body = req.body || {};
      const eventoSistema = String(body.eventoSistema || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_')
        .replace(/[^A-Z0-9_]/g, '')
        .slice(0, 80);
      const nomeExibicao = String(body.nomeExibicao || '').trim().slice(0, 160);
      if (!eventoSistema || !nomeExibicao) {
        return res.status(400).json({ error: 'Informe o código do evento e o nome de exibição da regra.' });
      }

      const id = `wpp-regra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const destTipo = ['USUARIO_DESTINO', 'RESPONSAVEL_UNIDADE', 'ADMINISTRADORES', 'NUMERO_FIXO'].includes(body.destinatarioTipo)
        ? body.destinatarioTipo
        : 'USUARIO_DESTINO';
      const numFixo = destTipo === 'NUMERO_FIXO' ? normalizePhoneDigits(body.numeroDestinoFixo).slice(0, 20) || null : null;
      const mapeamento = Array.isArray(body.mapeamentoVariaveis)
        ? body.mapeamentoVariaveis.map((v: any) => String(v || '').trim()).filter(Boolean)
        : [];
      const hIni = /^\d{2}:\d{2}$/.test(String(body.horarioInicio || '')) ? String(body.horarioInicio) : '00:00';
      const hFim = /^\d{2}:\d{2}$/.test(String(body.horarioFim || '')) ? String(body.horarioFim) : '23:59';
      const maxTentativas = Math.min(10, Math.max(1, Math.floor(Number(body.maxTentativas) || 3)));

      await pool.query(
        `INSERT INTO WHATSAPP_REGRAS_COMUNICACAO (
          ID_REGRA, EVENTO_SISTEMA, NOME_EXIBICAO, DESCRICAO, TEMPLATE_ID, TEMPLATE_NOME,
          DESTINATARIO_TIPO, NUMERO_DESTINO_FIXO, MAPEAMENTO_VARIAVEIS_JSON,
          HORARIO_INICIO, HORARIO_FIM, RESPEITAR_SILENCIO, MAX_TENTATIVAS, ATIVO,
          ATUALIZADO_POR_ID, ATUALIZADO_POR_NOME, DATA_CRIACAO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          eventoSistema,
          nomeExibicao,
          String(body.descricao || '').trim().slice(0, 300) || null,
          body.templateId || null,
          body.templateNome || null,
          destTipo,
          numFixo,
          JSON.stringify(mapeamento),
          hIni,
          hFim,
          body.respeitarSilencio ? 1 : 0,
          maxTentativas,
          body.ativo ? 1 : 0,
          auth.user.id,
          auth.user.name
        ]
      );

      await insertAuditLog('WhatsApp', 'Criar Regra de Comunicação', `Criada regra "${nomeExibicao}" (${eventoSistema})`, auth.user, req.ip);
      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_REGRAS_COMUNICACAO WHERE ID_REGRA = ? LIMIT 1', [id]);
      return res.json({ success: true, regra: mapRegraRow(rows[0]) });
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Já existe uma regra cadastrada para este código de evento.' });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.put('/whatsapp/regras/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const { id } = req.params;
      const body = req.body || {};

      const destTipo = ['USUARIO_DESTINO', 'RESPONSAVEL_UNIDADE', 'ADMINISTRADORES', 'NUMERO_FIXO'].includes(body.destinatarioTipo)
        ? body.destinatarioTipo
        : 'USUARIO_DESTINO';
      const numFixo = destTipo === 'NUMERO_FIXO' ? normalizePhoneDigits(body.numeroDestinoFixo).slice(0, 20) || null : null;
      const mapeamento = Array.isArray(body.mapeamentoVariaveis)
        ? body.mapeamentoVariaveis.map((v: any) => String(v || '').trim()).filter(Boolean)
        : [];
      const hIni = /^\d{2}:\d{2}$/.test(String(body.horarioInicio || '')) ? String(body.horarioInicio) : '00:00';
      const hFim = /^\d{2}:\d{2}$/.test(String(body.horarioFim || '')) ? String(body.horarioFim) : '23:59';
      const maxTentativas = Math.min(10, Math.max(1, Math.floor(Number(body.maxTentativas) || 3)));

      await pool.query(
        `UPDATE WHATSAPP_REGRAS_COMUNICACAO SET
          NOME_EXIBICAO = COALESCE(NULLIF(?, ''), NOME_EXIBICAO),
          DESCRICAO = ?,
          TEMPLATE_ID = ?,
          TEMPLATE_NOME = ?,
          DESTINATARIO_TIPO = ?,
          NUMERO_DESTINO_FIXO = ?,
          MAPEAMENTO_VARIAVEIS_JSON = ?,
          HORARIO_INICIO = ?,
          HORARIO_FIM = ?,
          RESPEITAR_SILENCIO = ?,
          MAX_TENTATIVAS = ?,
          ATIVO = ?,
          ATUALIZADO_POR_ID = ?,
          ATUALIZADO_POR_NOME = ?,
          DATA_ATUALIZACAO = NOW()
         WHERE ID_REGRA = ?`,
        [
          String(body.nomeExibicao || '').trim().slice(0, 160),
          String(body.descricao || '').trim().slice(0, 300) || null,
          body.templateId || null,
          body.templateNome || null,
          destTipo,
          numFixo,
          JSON.stringify(mapeamento),
          hIni,
          hFim,
          body.respeitarSilencio ? 1 : 0,
          maxTentativas,
          body.ativo ? 1 : 0,
          auth.user.id,
          auth.user.name,
          id
        ]
      );

      await insertAuditLog('WhatsApp', 'Atualizar Regra de Comunicação', `Atualizada regra ID ${id} (Ativa: ${body.ativo ? 'Sim' : 'Não'})`, auth.user, req.ip);
      const [rows]: any = await pool.query('SELECT * FROM WHATSAPP_REGRAS_COMUNICACAO WHERE ID_REGRA = ? LIMIT 1', [id]);
      return res.json({ success: true, regra: rows?.[0] ? mapRegraRow(rows[0]) : null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/whatsapp/regras/:id', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      await pool.query('DELETE FROM WHATSAPP_REGRAS_COMUNICACAO WHERE ID_REGRA = ?', [req.params.id]);
      await insertAuditLog('WhatsApp', 'Excluir Regra de Comunicação', `Excluída regra ID ${req.params.id}`, auth.user, req.ip);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 7. HISTÓRICO DE MENSAGENS, EVENTOS DE WEBHOOK E ENVIO MANUAL
  apiRouter.get('/whatsapp/mensagens', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const [msgRows]: any = await pool.query(
        `SELECT
          ID_MENSAGEM as id,
          DIRECAO as direcao,
          TELEFONE_DESTINO as telefoneDestino,
          TELEFONE_ORIGEM as telefoneOrigem,
          USUARIO_DESTINO_ID as usuarioDestinoId,
          USUARIO_DESTINO_NOME as usuarioDestinoNome,
          TIPO_MENSAGEM as tipoMensagem,
          TEMPLATE_NOME as templateNome,
          EVENTO_SISTEMA as eventoSistema,
          CONTEUDO_RESUMO as conteudoResumo,
          META_MESSAGE_ID as metaMessageId,
          STATUS_ENTREGA as statusEntrega,
          ERRO_CODIGO as erroCodigo,
          ERRO_MENSAGEM as erroMensagem,
          ENVIADO_POR_NOME as enviadoPorNome,
          DATA_CRIACAO as createdAt,
          DATA_ATUALIZACAO as updatedAt
         FROM WHATSAPP_MENSAGENS
         ORDER BY DATA_CRIACAO DESC
         LIMIT 100`
      );

      const [whRows]: any = await pool.query(
        `SELECT
          ID_EVENTO as id,
          TIPO_EVENTO as tipoEvento,
          ASSINATURA_VALIDA as assinaturaValida,
          WABA_ID as wabaId,
          PHONE_NUMBER_ID as phoneNumberId,
          RESUMO as resumo,
          PAYLOAD_JSON as payloadJson,
          DATA_RECEBIMENTO as dataRecebimento
         FROM WHATSAPP_WEBHOOK_EVENTOS
         ORDER BY DATA_RECEBIMENTO DESC
         LIMIT 50`
      );

      return res.json({
        mensagens: msgRows || [],
        webhookEventos: (whRows || []).map((w: any) => ({ ...w, assinaturaValida: Boolean(w.assinaturaValida) }))
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/enviar-manual', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const { toPhone, mode, templateName, languageCode, bodyParameters, textBody, usuarioDestinoId, usuarioDestinoNome } =
        req.body || {};

      const result = await sendMetaCloudMessage(pool, cfgRow, {
        toPhone,
        mode: mode === 'text' ? 'text' : 'template',
        templateName,
        languageCode,
        bodyParameters: Array.isArray(bodyParameters) ? bodyParameters : [],
        textBody,
        usuarioDestinoId: usuarioDestinoId || null,
        usuarioDestinoNome: usuarioDestinoNome || null,
        eventoSistema: 'ENVIO_MANUAL_ADMIN',
        tipoMensagem: mode === 'text' ? 'text' : 'template',
        actor: auth.user
      });

      await insertAuditLog(
        'WhatsApp',
        'Disparo Manual WhatsApp',
        `Disparo manual para ${normalizePhoneDigits(toPhone)}: ${result.success ? `ENVIADA (${result.metaMessageId})` : `FALHA (${result.error})`}`,
        auth.user,
        req.ip
      );

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8. WEBHOOK OFICIAL DA META WHATSAPP CLOUD API (Verificação GET + Recebimento POST + Encaminhamento Make.com)
  apiRouter.get('/whatsapp/webhook', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const cfgRow = await loadRawWhatsappConfig(pool);
      const mode = String(req.query['hub.mode'] || '').trim();
      const token = String(req.query['hub.verify_token'] || '').trim();
      const challenge = String(req.query['hub.challenge'] || '');
      const expectedToken = String(cfgRow?.WEBHOOK_VERIFY_TOKEN || '').trim();

      if (!mode && !token && !challenge) {
        return res.status(200).json({
          status: 'online',
          endpoint: '/api/whatsapp/webhook',
          verifyTokenConfigured: Boolean(expectedToken),
          hint: 'Configure esta URL no Painel Meta Developers (Webhook) com hub.mode=subscribe e o Verify Token salvo.'
        });
      }

      const valid = mode === 'subscribe' && Boolean(expectedToken) && timingSafeTextEqual(token, expectedToken);

      const evId = `wpp-wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO WHATSAPP_WEBHOOK_EVENTOS (
          ID_EVENTO, TIPO_EVENTO, ASSINATURA_VALIDA, RESUMO, PAYLOAD_JSON, DATA_RECEBIMENTO
        ) VALUES (?, 'verification', ?, ?, ?, NOW())`,
        [
          evId,
          valid ? 1 : 0,
          valid ? 'Verificação de Webhook aprovada pela Meta' : 'Falha na verificação de Webhook (token divergente)',
          JSON.stringify({ mode, challengeLength: challenge.length })
        ]
      );

      if (valid) {
        return res.status(200).type('text/plain').send(challenge);
      }
      return res.status(403).type('text/plain').send('Forbidden');
    } catch (err: any) {
      return res.status(500).type('text/plain').send('Internal Error');
    }
  });

  apiRouter.post('/whatsapp/webhook', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const cfgRow = await loadRawWhatsappConfig(pool);
      const appSecret = decryptSecret(cfgRow?.APP_SECRET_ENC);
      const signatureHeader = String(req.headers['x-hub-signature-256'] || '');
      const rawBody: Buffer | undefined = (req as any).rawBody;

      let signatureValid = true;
      if (appSecret) {
        if (!signatureHeader.startsWith('sha256=') || !rawBody) {
          signatureValid = false;
        } else {
          const expectedSig = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
          signatureValid = timingSafeTextEqual(signatureHeader, expectedSig);
        }
      }

      const body = req.body || {};
      const entries = Array.isArray(body.entry) ? body.entry : [];

      interface CollectedStatus {
        wabaId: string | null;
        phoneNumberId: string | null;
        displayPhoneNumber: string | null;
        statusObj: any;
      }
      interface CollectedMessage {
        wabaId: string | null;
        phoneNumberId: string | null;
        displayPhoneNumber: string | null;
        contactName: string;
        msgObj: any;
      }

      const collectedStatuses: CollectedStatus[] = [];
      const collectedMessages: CollectedMessage[] = [];

      for (const entry of entries) {
        const wabaId = entry?.id ? String(entry.id).slice(0, 64) : null;
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const phoneNumberId = value?.metadata?.phone_number_id
            ? String(value.metadata.phone_number_id).slice(0, 64)
            : null;
          const displayPhoneNumber = value?.metadata?.display_phone_number
            ? String(value.metadata.display_phone_number)
            : null;
          const contactsMap = new Map<string, string>();
          if (Array.isArray(value?.contacts)) {
            for (const c of value.contacts) {
              const waId = normalizePhoneDigits(c?.wa_id);
              const profName = String(c?.profile?.name || '').trim();
              if (waId && profName) contactsMap.set(waId, profName);
            }
          }
          if (Array.isArray(value?.statuses)) {
            for (const st of value.statuses) {
              collectedStatuses.push({ wabaId, phoneNumberId, displayPhoneNumber, statusObj: st });
            }
          }
          if (Array.isArray(value?.messages)) {
            for (const msg of value.messages) {
              const fromDigits = normalizePhoneDigits(msg?.from);
              collectedMessages.push({
                wabaId,
                phoneNumberId,
                displayPhoneNumber,
                contactName: contactsMap.get(fromDigits) || '',
                msgObj: msg
              });
            }
          }
        }
      }

      const firstWabaId = collectedMessages[0]?.wabaId || collectedStatuses[0]?.wabaId || (entries[0]?.id ? String(entries[0].id).slice(0, 64) : null);
      const firstPhoneId = collectedMessages[0]?.phoneNumberId || collectedStatuses[0]?.phoneNumberId || null;
      const tipoEvento =
        collectedMessages.length > 0 && collectedStatuses.length > 0
          ? 'messages_and_statuses'
          : collectedMessages.length > 0
          ? 'messages'
          : collectedStatuses.length > 0
          ? 'statuses'
          : 'other';

      const evId = `wpp-wh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO WHATSAPP_WEBHOOK_EVENTOS (
          ID_EVENTO, TIPO_EVENTO, ASSINATURA_VALIDA, WABA_ID, PHONE_NUMBER_ID, RESUMO, PAYLOAD_JSON, DATA_RECEBIMENTO
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          evId,
          tipoEvento,
          signatureValid ? 1 : 0,
          firstWabaId,
          firstPhoneId,
          signatureValid
            ? tipoEvento === 'statuses'
              ? `${collectedStatuses.length} atualização(ões) de status recebida(s)`
              : tipoEvento === 'messages'
              ? `${collectedMessages.length} mensagem(ns) recebida(s)`
              : tipoEvento === 'messages_and_statuses'
              ? `${collectedMessages.length} mensagem(ns) e ${collectedStatuses.length} status recebido(s)`
              : 'Evento Webhook Meta recebido'
            : 'Assinatura HMAC X-Hub-Signature-256 inválida — evento ignorado',
          JSON.stringify(body).slice(0, 60000)
        ]
      );

      if (!signatureValid) {
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }

      const publicBaseUrl =
        sanitizeSafePublicUrl(cfgRow?.CALLBACK_URL_PUBLICA) ||
        sanitizeSafePublicUrl(`${req.protocol}://${req.get('host')}`);

      // Responde 200 OK imediatamente para cumprir o SLA de <5s da Meta e evitar retries duplicados
      res.status(200).json({ received: true });

      // Processamento assíncrono seguro (status, deduplicação de mensagens, encaminhamento Make.com e bot interno)
      void (async () => {
        try {
          const modoAtendimento = String(cfgRow?.MODO_ATENDIMENTO || 'BOT_INTERNO').toUpperCase();
          const shouldForwardToMake =
            Boolean(cfgRow?.MAKE_WEBHOOK_ATIVO) &&
            Boolean(sanitizeMakeWebhookUrl(cfgRow?.MAKE_WEBHOOK_URL)) &&
            (modoAtendimento === 'MAKE' || modoAtendimento === 'AMBOS');
          const shouldRunInternalBot = modoAtendimento === 'BOT_INTERNO' || modoAtendimento === 'AMBOS';

          // 1) Atualiza status de entrega/leitura
          const statusMap: Record<string, string> = {
            sent: 'ENVIADA',
            delivered: 'ENTREGUE',
            read: 'LIDA',
            failed: 'FALHOU'
          };
          for (const item of collectedStatuses) {
            const st = item.statusObj;
            const wamid = String(st?.id || '').trim();
            const mappedStatus = statusMap[String(st?.status || '').toLowerCase()];
            if (wamid && mappedStatus) {
              const firstErr = Array.isArray(st?.errors) ? st.errors[0] : null;
              await pool.query(
                `UPDATE WHATSAPP_MENSAGENS SET
                  STATUS_ENTREGA = ?,
                  ERRO_CODIGO = COALESCE(?, ERRO_CODIGO),
                  ERRO_MENSAGEM = COALESCE(?, ERRO_MENSAGEM),
                  DATA_ATUALIZACAO = NOW()
                 WHERE META_MESSAGE_ID = ?`,
                [
                  mappedStatus,
                  firstErr?.code ? String(firstErr.code) : null,
                  firstErr?.title || firstErr?.message ? String(firstErr.title || firstErr.message) : null,
                  wamid
                ]
              );
            }

            if (shouldForwardToMake && Boolean(cfgRow?.MAKE_ENCAMINHAR_STATUS)) {
              await forwardPayloadToMake(pool, cfgRow, {
                source: 'armeria_pcmg_whatsapp',
                eventType: 'status',
                receivedAt: new Date().toISOString(),
                wabaId: item.wabaId,
                phoneNumberId: item.phoneNumberId,
                displayPhoneNumber: item.displayPhoneNumber,
                status: {
                  messageId: wamid,
                  recipientId: normalizePhoneDigits(st?.recipient_id),
                  status: String(st?.status || ''),
                  statusPtBr: mappedStatus || String(st?.status || ''),
                  timestamp: st?.timestamp || null,
                  errors: Array.isArray(st?.errors) ? st.errors : []
                }
              });
            }
          }

          // 2) Verifica se a regra do bot interativo está ativa
          let botRuleActive = true;
          if (shouldRunInternalBot) {
            try {
              const [botRuleRows]: any = await pool.query(
                "SELECT ATIVO FROM WHATSAPP_REGRAS_COMUNICACAO WHERE EVENTO_SISTEMA = 'ATENDIMENTO_BOT_INTERATIVO' LIMIT 1"
              );
              if (botRuleRows?.[0] !== undefined) {
                botRuleActive = Boolean(botRuleRows[0].ATIVO);
              }
            } catch {}
          }

          // 3) Processa cada mensagem recebida com deduplicação por META_MESSAGE_ID (wamid)
          for (const item of collectedMessages) {
            const msg = item.msgObj;
            const fromPhone = normalizePhoneDigits(msg?.from);
            if (!fromPhone) continue;

            const wamid = msg?.id ? String(msg.id).trim() : null;
            if (wamid) {
              const [dupRows]: any = await pool.query(
                "SELECT ID_MENSAGEM FROM WHATSAPP_MENSAGENS WHERE META_MESSAGE_ID = ? AND DIRECAO = 'ENTRADA' LIMIT 1",
                [wamid]
              );
              if (dupRows && dupRows.length > 0) {
                continue; // Ignora retry duplicado da Meta
              }
            }

            const buttonReplyId = msg?.interactive?.button_reply?.id || msg?.button?.payload || '';
            const buttonReplyTitle = msg?.interactive?.button_reply?.title || msg?.button?.text || '';
            const listReplyId = msg?.interactive?.list_reply?.id || '';
            const listReplyTitle = msg?.interactive?.list_reply?.title || '';
            const textContent =
              msg?.text?.body ||
              buttonReplyTitle ||
              listReplyTitle ||
              msg?.image?.caption ||
              msg?.document?.caption ||
              `[Mensagem tipo: ${msg?.type || 'desconhecido'}]`;

            const inboundId = `wpp-in-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            await pool.query(
              `INSERT INTO WHATSAPP_MENSAGENS (
                ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
                TIPO_MENSAGEM, CONTEUDO_RESUMO, META_MESSAGE_ID, STATUS_ENTREGA,
                PAYLOAD_RESPOSTA_JSON, DATA_CRIACAO
              ) VALUES (?, 'ENTRADA', ?, ?, 'inbound', ?, ?, 'RECEBIDA', ?, NOW())`,
              [
                inboundId,
                item.displayPhoneNumber || cfgRow?.NUMERO_TELEFONE_EXIBICAO || 'sistema',
                fromPhone,
                String(textContent).slice(0, 1000),
                wamid,
                JSON.stringify(msg)
              ]
            );

            // Encaminha para o Make.com com payload estruturado + dados do usuário no sistema
            if (shouldForwardToMake) {
              const matchedUser = await resolveWhatsappUserContext(pool, fromPhone).catch(() => null);
              await forwardPayloadToMake(pool, cfgRow, {
                source: 'armeria_pcmg_whatsapp',
                eventType: 'message',
                receivedAt: new Date().toISOString(),
                wabaId: item.wabaId,
                phoneNumberId: item.phoneNumberId,
                displayPhoneNumber: item.displayPhoneNumber || cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
                message: {
                  id: wamid,
                  from: fromPhone,
                  fromNormalized: stripBrazilDdiForDisplay(fromPhone),
                  contactName: item.contactName || null,
                  type: String(msg?.type || 'unknown'),
                  text: msg?.text?.body || '',
                  displayText: String(textContent),
                  buttonId: buttonReplyId || null,
                  buttonTitle: buttonReplyTitle || null,
                  listRowId: listReplyId || null,
                  listRowTitle: listReplyTitle || null,
                  timestamp: msg?.timestamp || null
                },
                usuarioSistema: matchedUser
                  ? {
                      encontrado: true,
                      id: matchedUser.id,
                      nome: matchedUser.name,
                      masp: matchedUser.masp,
                      cargo: matchedUser.cargo,
                      perfil: matchedUser.role,
                      perfis: matchedUser.roles,
                      unidadeId: matchedUser.unitId,
                      departamentoId: matchedUser.departmentId,
                      isArmeiroOrAdmin: matchedUser.isArmeiroOrAdmin,
                      unidadesPermitidas: matchedUser.permittedUnits.map(u => ({
                        id: u.id,
                        nome: u.name,
                        sigla: u.shortName
                      }))
                    }
                  : { encontrado: false },
                rawMetaMessage: msg
              });
            }

            // Dispara o atendimento interativo interno (se modo for BOT_INTERNO ou AMBOS)
            if (shouldRunInternalBot && botRuleActive && cfgRow?.ATIVO) {
              try {
                await processWhatsappBotInteraction(
                  pool,
                  cfgRow,
                  {
                    fromPhone,
                    text: msg?.text?.body || '',
                    buttonId: buttonReplyId,
                    buttonTitle: buttonReplyTitle,
                    listRowId: listReplyId,
                    listRowTitle: listReplyTitle
                  },
                  {
                    dryRun: false,
                    publicBaseUrl,
                    signingKey: getEncryptionKey(),
                    decryptSecret
                  }
                );
              } catch (botErr) {
                console.error('Erro no fluxo automático do Bot WhatsApp:', botErr);
              }
            }
          }
        } catch (asyncErr) {
          console.error('Erro no processamento assíncrono do webhook WhatsApp:', asyncErr);
        }
      })();
      return;
    } catch (err: any) {
      console.error('Erro ao processar webhook WhatsApp:', err);
      if (!res.headersSent) {
        return res.status(200).json({ received: true });
      }
      return;
    }
  });

  // 8B. DIAGNÓSTICO COMPLETO DO WEBHOOK (META + MAKE)
  apiRouter.post('/whatsapp/webhook/testar', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const verifyToken = String(cfgRow?.WEBHOOK_VERIFY_TOKEN || '').trim();
      const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
      const appSecret = decryptSecret(cfgRow?.APP_SECRET_ENC);
      const makeApiKey = decryptSecret(cfgRow?.MAKE_API_KEY_ENC);
      const rawBase = sanitizeSafePublicUrl(cfgRow?.CALLBACK_URL_PUBLICA) || sanitizeSafePublicUrl(`${req.protocol}://${req.get('host')}`);
      const webhookUrl = `${rawBase}/api/whatsapp/webhook`;
      const makeUrl = sanitizeMakeWebhookUrl(cfgRow?.MAKE_WEBHOOK_URL);
      const modo = String(cfgRow?.MODO_ATENDIMENTO || 'BOT_INTERNO').toUpperCase();

      const checks: Array<{ key: string; label: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [
        {
          key: 'https_url',
          label: 'URL Pública HTTPS do Webhook',
          status: webhookUrl.startsWith('https://') ? 'ok' : 'warn',
          detail: webhookUrl.startsWith('https://')
            ? `URL válida para Meta e Make: ${webhookUrl}`
            : `URL atual não usa HTTPS (${webhookUrl}). A Meta exige HTTPS público válido.`
        },
        {
          key: 'verify_token',
          label: 'Verify Token (Handshake GET Meta)',
          status: verifyToken.length >= 8 ? 'ok' : 'error',
          detail:
            verifyToken.length >= 8
              ? `Token configurado (${verifyToken.length} caracteres) com comparação segura timing-safe.`
              : 'Defina um Verify Token com pelo menos 8 caracteres e salve a configuração.'
        },
        {
          key: 'app_secret',
          label: 'App Secret (Validação HMAC X-Hub-Signature-256)',
          status: appSecret ? 'ok' : 'warn',
          detail: appSecret
            ? 'Ativo — todas as requisições POST da Meta são validadas criptograficamente via SHA-256.'
            : 'Opcional em testes, mas altamente recomendado preencher o App Secret para produção.'
        },
        {
          key: 'meta_credentials',
          label: 'Credenciais Meta Cloud API (Phone Number ID + Access Token)',
          status: sanitizeNumericId(cfgRow?.PHONE_NUMBER_ID) && accessToken ? 'ok' : 'error',
          detail:
            sanitizeNumericId(cfgRow?.PHONE_NUMBER_ID) && accessToken
              ? `Configuradas (Phone ID ${cfgRow.PHONE_NUMBER_ID} • API ${cfgRow.API_VERSAO || 'v22.0'}).`
              : 'Preencha e salve o Phone Number ID e o Access Token para enviar mensagens.'
        },
        {
          key: 'integration_active',
          label: 'Status da Integração & Modo de Atendimento',
          status: cfgRow?.ATIVO ? 'ok' : 'warn',
          detail: cfgRow?.ATIVO
            ? `Integração ATIVA • Modo: ${modo === 'MAKE' ? 'Somente Make.com' : modo === 'AMBOS' ? 'Make.com + Bot Interno' : 'Bot Interno'}.`
            : 'A integração está DESATIVADA. Ative o botão "ATIVA" para responder automaticamente.'
        },
        {
          key: 'make_outbound',
          label: 'Webhook de Saída para Make.com (Sistema → Make)',
          status:
            cfgRow?.MAKE_WEBHOOK_ATIVO && makeUrl
              ? 'ok'
              : modo === 'MAKE'
              ? 'error'
              : 'warn',
          detail:
            cfgRow?.MAKE_WEBHOOK_ATIVO && makeUrl
              ? `Ativo e apontando para ${new URL(makeUrl).hostname}.`
              : modo === 'MAKE'
              ? 'Modo "Somente Make.com" selecionado, mas o Custom Webhook do Make ainda não está ativo/preenchido.'
              : 'Não ativado. Preencha a URL do Custom Webhook do Make e ative para enviar eventos ao Make.'
        },
        {
          key: 'make_inbound',
          label: 'API Key para Make.com (Make → Sistema)',
          status: makeApiKey ? 'ok' : 'warn',
          detail: makeApiKey
            ? 'API Key gerada — Make.com já pode chamar /api/whatsapp/make/enviar e /consultar-usuario.'
            : 'Clique em "Gerar API Key do Make" para permitir que cenários do Make enviem mensagens pelo sistema.'
        }
      ];

      // Validação real de assinatura HMAC e contagem dos últimos eventos recebidos
      const [lastEvRows]: any = await pool.query(
        'SELECT TIPO_EVENTO, ASSINATURA_VALIDA, RESUMO, DATA_RECEBIMENTO FROM WHATSAPP_WEBHOOK_EVENTOS ORDER BY DATA_RECEBIMENTO DESC LIMIT 5'
      );

      const hasError = checks.some(c => c.status === 'error');
      const hasWarn = checks.some(c => c.status === 'warn');

      return res.json({
        success: !hasError,
        overall: hasError ? 'ERROR' : hasWarn ? 'WARN' : 'OK',
        webhookUrl,
        checks,
        recentEvents: lastEvRows || []
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8C. GERAR / ROTACIONAR API KEY DE INTEGRAÇÃO PARA O MAKE.COM
  apiRouter.post('/whatsapp/make/gerar-api-key', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await loadRawWhatsappConfig(pool);
      const plainKey = `pcmg_make_${crypto.randomBytes(24).toString('hex')}`;
      const encryptedKey = encryptSecret(plainKey);

      await pool.query(
        `UPDATE WHATSAPP_CONFIGURACAO_API SET
          MAKE_API_KEY_ENC = ?,
          ATUALIZADO_POR_ID = ?,
          ATUALIZADO_POR_NOME = ?,
          DATA_ATUALIZACAO = NOW()
         WHERE ID_CONFIG = ?`,
        [encryptedKey, auth.user.id, auth.user.name, DEFAULT_CONFIG_ID]
      );

      await insertAuditLog(
        'WhatsApp',
        'Gerar API Key Make.com',
        'Nova API Key de integração bidirecional Make.com gerada.',
        auth.user,
        req.ip
      );

      const updated = await loadRawWhatsappConfig(pool);
      return res.json({
        success: true,
        apiKey: plainKey,
        config: mapPublicConfig(updated)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8D. ENVIAR EVENTO DE TESTE ESTRUTURADO PARA O CUSTOM WEBHOOK DO MAKE.COM (para "Determine data structure")
  apiRouter.post('/whatsapp/make/testar', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      const cfgRow = await loadRawWhatsappConfig(pool);
      const overrideUrl = typeof req.body?.makeWebhookUrl === 'string' && req.body.makeWebhookUrl.trim()
        ? req.body.makeWebhookUrl.trim()
        : cfgRow?.MAKE_WEBHOOK_URL;
      const validMakeUrl = sanitizeMakeWebhookUrl(overrideUrl);

      if (!validMakeUrl) {
        return res.status(400).json({
          error: 'Informe e salve uma URL HTTPS válida de Custom Webhook do Make.com (ex: https://hook.us2.make.com/...).'
        });
      }

      const minimal = Boolean(req.body?.minimal);
      const skipSecret = Boolean(req.body?.skipSecret);
      const overrideSecret =
        typeof req.body?.makeWebhookSecret === 'string' && req.body.makeWebhookSecret.trim()
          ? req.body.makeWebhookSecret.trim()
          : undefined;

      const testPayload: Record<string, any> = minimal
        ? {
            object: 'whatsapp_business_account',
            entry: []
          }
        : {
            object: 'whatsapp_business_account',
            entry: [],
            source: 'armeria_pcmg_whatsapp',
            eventType: 'message',
            isTestEvent: true,
            receivedAt: new Date().toISOString(),
            wabaId: cfgRow?.WABA_ID || '000000000000000',
            phoneNumberId: cfgRow?.PHONE_NUMBER_ID || '000000000000000',
            displayPhoneNumber: cfgRow?.NUMERO_TELEFONE_EXIBICAO || '+55 31 99999-0000',
            message: {
              id: `wamid.TEST_${Date.now()}`,
              from: normalizePhoneDigits(cfgRow?.NUMERO_TESTE_PADRAO) || '5531999990000',
              fromNormalized: stripBrazilDdiForDisplay(cfgRow?.NUMERO_TESTE_PADRAO || '5531999990000'),
              contactName: auth.user.name || 'Policial Teste',
              type: 'text',
              text: 'Oi',
              displayText: 'Oi',
              buttonId: null,
              buttonTitle: null,
              listRowId: null,
              listRowTitle: null,
              timestamp: String(Math.floor(Date.now() / 1000))
            },
            usuarioSistema: {
              encontrado: true,
              id: auth.user.id,
              nome: auth.user.name,
              masp: auth.user.masp || '0000000',
              cargo: 'Policial Civil',
              perfil: auth.user.role || 'Administrador',
              perfis: [auth.user.role || 'Administrador'],
              unidadeId: 'unidade-teste',
              departamentoId: 'dep-teste',
              isArmeiroOrAdmin: true,
              unidadesPermitidas: [{ id: 'unidade-teste', nome: 'Unidade Exemplo', sigla: 'COE' }]
            }
          };

      const effectiveCfg = { ...cfgRow, MAKE_WEBHOOK_URL: validMakeUrl };
      const forwardResult = await forwardPayloadToMake(pool, effectiveCfg, testPayload, {
        overrideSecret,
        skipSecret
      });

      let statusMsg: string;
      if (forwardResult.ok) {
        statusMsg = `Conectado ao Make.com com sucesso (HTTP ${forwardResult.status} — ${forwardResult.responseText || 'Accepted'})`;
      } else if (forwardResult.status === 401) {
        const originInfo = forwardResult.gatewayHeader
          ? `Resposta direta de "${forwardResult.gatewayHeader}"`
          : 'Resposta HTTP 401 do servidor de destino';
        const authInfo = forwardResult.sentAuthHeader
          ? 'com header x-make-apikey'
          : 'em POST puro sem headers de autenticação';
        statusMsg = `Erro HTTP 401 (${forwardResult.responseText || 'Unauthorized'}) — ${originInfo} (${authInfo}). No Make.com, verifique se o webhook exige API Key (informe no campo x-make-apikey acima ou desative a autenticação no webhook) ou se a URL foi criada em "WhatsApp Business Cloud → Watch Events" em vez de "Webhooks → Custom Webhook".`;
      } else {
        statusMsg = forwardResult.error || `Erro HTTP ${forwardResult.status}: ${forwardResult.responseText || 'Falha no webhook Make'}`;
      }

      await pool.query(
        `UPDATE WHATSAPP_CONFIGURACAO_API SET
          MAKE_ULTIMO_TESTE_STATUS = ?,
          MAKE_ULTIMO_TESTE_MENSAGEM = ?,
          MAKE_ULTIMO_TESTE_EM = NOW()
         WHERE ID_CONFIG = ?`,
        [forwardResult.ok ? 'CONECTADO' : 'ERRO', statusMsg.slice(0, 1000), DEFAULT_CONFIG_ID]
      );

      await insertAuditLog(
        'WhatsApp',
        'Testar Webhook Make.com',
        `Teste de envio para Make.com: ${forwardResult.ok ? 'OK' : 'ERRO'} — ${statusMsg.slice(0, 200)}`,
        auth.user,
        req.ip
      );

      const updated = await loadRawWhatsappConfig(pool);
      return res.status(forwardResult.ok ? 200 : 400).json({
        success: forwardResult.ok,
        message: statusMsg,
        httpStatus: forwardResult.status,
        diagnostics: {
          method: 'POST',
          sentAuthHeader: forwardResult.sentAuthHeader,
          gatewayHeader: forwardResult.gatewayHeader || null,
          makeActualStatus: forwardResult.makeActualStatus || null
        },
        config: mapPublicConfig(updated)
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8E. ENDPOINTS DE ENTRADA PARA CENÁRIOS DO MAKE.COM (Autenticados via X-Make-Api-Key ou Bearer)
  apiRouter.get('/whatsapp/make/status', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyMakeApiKey(pool, req);
      if (!auth.ok) return res.status(auth.status || 401).json({ error: auth.error });

      const cfg = mapPublicConfig(auth.cfgRow);
      return res.json({
        ok: true,
        status: 'connected',
        ambiente: cfg.ambiente,
        ativo: cfg.ativo,
        apiVersion: cfg.apiVersion,
        modoAtendimento: cfg.modoAtendimento,
        makeWebhookAtivo: cfg.makeWebhookAtivo,
        hasMetaCredentials: Boolean(cfg.phoneNumberId && cfg.hasAccessToken),
        serverTime: new Date().toISOString()
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/make/consultar-usuario', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyMakeApiKey(pool, req);
      if (!auth.ok) return res.status(auth.status || 401).json({ error: auth.error });

      const phone = String(req.body?.phone || req.body?.telefone || '').trim();
      if (!phone) {
        return res.status(400).json({ error: 'Informe o campo "phone" no corpo JSON.' });
      }

      const matched = await resolveWhatsappUserContext(pool, phone);
      if (!matched) {
        return res.json({
          encontrado: false,
          phoneInformado: phone,
          phoneNormalizado: stripBrazilDdiForDisplay(phone)
        });
      }

      return res.json({
        encontrado: true,
        usuario: {
          id: matched.id,
          nome: matched.name,
          masp: matched.masp,
          cargo: matched.cargo,
          telefone: matched.phone,
          perfil: matched.role,
          perfis: matched.roles,
          unidadeId: matched.unitId,
          departamentoId: matched.departmentId,
          isArmeiroOrAdmin: matched.isArmeiroOrAdmin,
          isGlobal: matched.isGlobal,
          unidadesPermitidas: matched.permittedUnits.map(u => ({
            id: u.id,
            nome: u.name,
            sigla: u.shortName
          }))
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/make/enviar', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyMakeApiKey(pool, req);
      if (!auth.ok) return res.status(auth.status || 401).json({ error: auth.error });

      const cfgRow = auth.cfgRow;
      const body = req.body || {};
      const toPhone = normalizePhoneDigits(body.to || body.toPhone || body.telefone);
      if (toPhone.length < 10 || toPhone.length > 15) {
        return res.status(400).json({
          error: 'Informe o telefone de destino "to" com DDI e DDD (ex: 5531999990000).'
        });
      }

      const msgType = String(body.type || body.mode || 'text').toLowerCase().trim();

      // Reusa o enviador oficial para text e template
      if (msgType === 'text' || msgType === 'template') {
        const result = await sendMetaCloudMessage(pool, cfgRow, {
          toPhone,
          mode: msgType === 'template' ? 'template' : 'text',
          templateName: body.templateName,
          languageCode: body.languageCode || 'pt_BR',
          bodyParameters: Array.isArray(body.bodyParameters) ? body.bodyParameters : [],
          textBody: body.text || body.textBody || body.body,
          eventoSistema: 'MAKE_AUTOMACAO',
          tipoMensagem: msgType,
          actor: { id: 'make-automation', name: 'Make.com' }
        });
        return res.status(result.success ? 200 : 400).json(result);
      }

      // Mensagens interativas (buttons / list) e documentos (PDF/arquivo por URL HTTPS)
      const apiVersion = ALLOWED_API_VERSIONS.has(cfgRow?.API_VERSAO) ? cfgRow.API_VERSAO : 'v22.0';
      const phoneNumberId = sanitizeNumericId(cfgRow?.PHONE_NUMBER_ID);
      const accessToken = decryptSecret(cfgRow?.ACCESS_TOKEN_ENC);
      if (!phoneNumberId || !accessToken) {
        return res.status(400).json({
          error: 'Configure o Phone Number ID e o Access Token na aba Configuração da API.'
        });
      }

      let payload: any = null;
      let resumo = '';

      if (msgType === 'buttons') {
        const textBody = String(body.body || body.text || '').trim().slice(0, 1024);
        const rawButtons = Array.isArray(body.buttons) ? body.buttons : [];
        const buttons = rawButtons
          .map((b: any, idx: number) => ({
            id: String(typeof b === 'string' ? `btn_${idx + 1}` : b?.id || `btn_${idx + 1}`).slice(0, 256),
            title: String(typeof b === 'string' ? b : b?.title || '').trim().slice(0, 20)
          }))
          .filter((b: any) => b.title.length > 0)
          .slice(0, 3);
        if (!textBody || buttons.length === 0) {
          return res.status(400).json({ error: 'Para type="buttons", informe "body" e de 1 a 3 itens em "buttons".' });
        }
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            ...(body.header ? { header: { type: 'text', text: String(body.header).trim().slice(0, 60) } } : {}),
            body: { text: textBody },
            ...(body.footer ? { footer: { text: String(body.footer).trim().slice(0, 60) } } : {}),
            action: {
              buttons: buttons.map((b: any) => ({ type: 'reply', reply: { id: b.id, title: b.title } }))
            }
          }
        };
        resumo = `[Make Botões] ${body.header || ''} • ${buttons.map((b: any) => b.title).join(' | ')}`;
      } else if (msgType === 'list') {
        const textBody = String(body.body || body.text || '').trim().slice(0, 1024);
        const rawRows = Array.isArray(body.listRows || body.rows) ? body.listRows || body.rows : [];
        const rows = rawRows
          .map((r: any, idx: number) => ({
            id: String(r?.id || `row_${idx + 1}`).slice(0, 200),
            title: String(r?.title || '').trim().slice(0, 24),
            ...(r?.description ? { description: String(r.description).trim().slice(0, 72) } : {})
          }))
          .filter((r: any) => r.title.length > 0)
          .slice(0, 10);
        if (!textBody || rows.length === 0) {
          return res.status(400).json({ error: 'Para type="list", informe "body" e de 1 a 10 itens em "listRows".' });
        }
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'interactive',
          interactive: {
            type: 'list',
            ...(body.header ? { header: { type: 'text', text: String(body.header).trim().slice(0, 60) } } : {}),
            body: { text: textBody },
            ...(body.footer ? { footer: { text: String(body.footer).trim().slice(0, 60) } } : {}),
            action: {
              button: String(body.listButtonText || 'Selecionar').trim().slice(0, 20),
              sections: [
                {
                  title: String(body.sectionTitle || body.header || 'Opções').trim().slice(0, 24),
                  rows
                }
              ]
            }
          }
        };
        resumo = `[Make Lista] ${body.header || ''} (${rows.length} opções)`;
      } else if (msgType === 'document') {
        const docUrl = sanitizePublicHttpsMediaUrl(body.documentUrl || body.link);
        if (!docUrl) {
          return res.status(400).json({ error: 'Para type="document", informe uma URL HTTPS pública válida em "documentUrl".' });
        }
        const filename = String(body.filename || 'documento.pdf').trim().slice(0, 120);
        const caption = String(body.caption || body.body || '').trim().slice(0, 1024);
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'document',
          document: {
            link: docUrl,
            filename,
            ...(caption ? { caption } : {})
          }
        };
        resumo = `[Make Documento] ${filename}`;
      } else {
        return res.status(400).json({
          error: 'Tipo inválido. Use type: "text", "template", "buttons", "list" ou "document".'
        });
      }

      const msgId = `wpp-mk-out-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const endpointUrl = `${META_GRAPH_BASE_URL}/${apiVersion}/${phoneNumberId}/messages`;
      let metaMessageId: string | null = null;
      let statusEntrega = 'PENDENTE';
      let erroCodigo: string | null = null;
      let erroMensagem: string | null = null;
      let responseJson: any = null;

      try {
        const metaRes = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        responseJson = await metaRes.json().catch(() => ({}));
        if (metaRes.ok && responseJson?.messages?.[0]?.id) {
          metaMessageId = String(responseJson.messages[0].id);
          statusEntrega = 'ENVIADA';
        } else {
          statusEntrega = 'FALHOU';
          erroCodigo = String(responseJson?.error?.code || metaRes.status);
          erroMensagem =
            responseJson?.error?.error_user_msg ||
            responseJson?.error?.message ||
            `Erro HTTP ${metaRes.status} na Meta Cloud API`;
        }
      } catch (netErr: any) {
        statusEntrega = 'FALHOU';
        erroCodigo = 'NETWORK_ERROR';
        erroMensagem = netErr?.message || 'Falha de rede ao enviar via Meta Cloud API';
      }

      await pool.query(
        `INSERT INTO WHATSAPP_MENSAGENS (
          ID_MENSAGEM, DIRECAO, TELEFONE_DESTINO, TELEFONE_ORIGEM,
          TIPO_MENSAGEM, EVENTO_SISTEMA, CONTEUDO_RESUMO, META_MESSAGE_ID,
          STATUS_ENTREGA, ERRO_CODIGO, ERRO_MENSAGEM, PAYLOAD_REQUISICAO_JSON,
          PAYLOAD_RESPOSTA_JSON, ENVIADO_POR_NOME, DATA_CRIACAO
        ) VALUES (?, 'SAIDA', ?, ?, ?, 'MAKE_AUTOMACAO', ?, ?, ?, ?, ?, ?, ?, 'Make.com', NOW())`,
        [
          msgId,
          toPhone,
          cfgRow?.NUMERO_TELEFONE_EXIBICAO || null,
          msgType,
          resumo.slice(0, 600),
          metaMessageId,
          statusEntrega,
          erroCodigo,
          erroMensagem,
          JSON.stringify(payload),
          responseJson ? JSON.stringify(responseJson) : null
        ]
      );

      if (statusEntrega === 'ENVIADA') {
        return res.json({ success: true, id: msgId, metaMessageId, statusEntrega, response: responseJson });
      }
      return res.status(400).json({
        success: false,
        id: msgId,
        statusEntrega,
        errorCode: erroCodigo,
        error: erroMensagem || 'Falha ao enviar mensagem pelo WhatsApp Cloud API.'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. SIMULADOR INTERATIVO DO BOT NO PAINEL ADMIN (usa os dados reais do banco + PDF real)
  apiRouter.post('/whatsapp/bot/simular', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const cfgRow = await loadRawWhatsappConfig(pool);
      const body = req.body || {};
      const forcedUserId =
        typeof body.simulateAsUserId === 'string' && body.simulateAsUserId.trim()
          ? body.simulateAsUserId.trim()
          : auth.user.id;
      const simPhone =
        normalizePhoneDigits(body.fromPhone) ||
        `sim${String(forcedUserId).replace(/[^a-zA-Z0-9]/g, '').slice(-12) || '000001'}`;
      const publicBaseUrl =
        sanitizeSafePublicUrl(cfgRow?.CALLBACK_URL_PUBLICA) ||
        sanitizeSafePublicUrl(`${req.protocol}://${req.get('host')}`);

      const result = await processWhatsappBotInteraction(
        pool,
        cfgRow,
        {
          fromPhone: simPhone,
          text: typeof body.text === 'string' ? body.text : '',
          buttonId: typeof body.buttonId === 'string' ? body.buttonId : '',
          buttonTitle: typeof body.buttonTitle === 'string' ? body.buttonTitle : '',
          listRowId: typeof body.listRowId === 'string' ? body.listRowId : '',
          listRowTitle: typeof body.listRowTitle === 'string' ? body.listRowTitle : ''
        },
        {
          dryRun: true,
          forcedUserId,
          publicBaseUrl,
          signingKey: getEncryptionKey(),
          decryptSecret
        }
      );

      return res.json({
        success: true,
        etapaAtual: result.etapaAtual,
        replies: result.replies,
        resolvedUser: result.resolvedUser
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/bot/reset', async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const auth = await verifyWhatsappAdmin(pool, req);
      if (!auth.ok) return res.status(auth.status || 403).json({ error: auth.error });

      await ensureWhatsappSchema(pool);
      const targetUserId =
        typeof req.body?.simulateAsUserId === 'string' && req.body.simulateAsUserId.trim()
          ? req.body.simulateAsUserId.trim()
          : auth.user.id;
      const simPhone =
        normalizePhoneDigits(req.body?.fromPhone) ||
        `sim${String(targetUserId).replace(/[^a-zA-Z0-9]/g, '').slice(-12) || '000001'}`;
      await resetBotSession(pool, simPhone);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10. SESSÃO TEMPORÁRIA DE CAUTELA / DEVOLUÇÃO GERADA PELO WHATSAPP
  apiRouter.get('/whatsapp/sessao-temporaria/:token', async (req: Request, res: Response) => {
    try {
      const rawToken = String(req.params.token || '').trim();
      if (!/^[a-f0-9]{32,128}$/i.test(rawToken)) {
        return res.status(400).json({ error: 'Token de sessão temporária inválido.' });
      }

      const pool = getPool();
      await ensureWhatsappSchema(pool);
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const [sessRows]: any = await pool.query(
        `SELECT
           ID_SESSAO as id,
           TIPO_FLUXO as tipoFluxo,
           USUARIO_ID as userId,
           TELEFONE_ORIGEM as fromPhone,
           STATUS_SESSAO as status,
           EXPIRA_EM as expiresAt,
           CONCLUIDA_EM as concludedAt,
           (EXPIRA_EM > NOW()) as isNotExpired
         FROM WHATSAPP_SESSOES_TEMPORARIAS
         WHERE TOKEN_HASH = ?
         LIMIT 1`,
        [tokenHash]
      );

      const sess = sessRows?.[0];
      if (!sess) {
        return res.status(404).json({ error: 'Sessão temporária não encontrada.' });
      }

      if (sess.status === 'CONCLUIDA') {
        return res.status(410).json({
          error: 'Esta sessão temporária já foi concluída.',
          status: 'CONCLUIDA',
          message: 'Aguardando deferimento do responsável pela armaria para emitir recibo.'
        });
      }

      if (sess.status !== 'ATIVA' || !sess.isNotExpired) {
        await pool.query(
          "UPDATE WHATSAPP_SESSOES_TEMPORARIAS SET STATUS_SESSAO = 'EXPIRADA' WHERE ID_SESSAO = ?",
          [sess.id]
        );
        return res.status(410).json({
          error: 'Sessão temporária expirada. Solicite um novo link pelo WhatsApp.',
          status: 'EXPIRADA'
        });
      }

      // Carrega perfil completo do usuário (sem expor SENHA_USUARIOS)
      let uRow: any = null;
      try {
        const [rows]: any = await pool.query(
          `SELECT
             ID_USUARIOS as id,
             MASP_USUARIOS as masp,
             NOME_USUARIOS as name,
             TELEFONE_USUARIOS as phone,
             CARGO_USUARIOS as cargo,
             PERFIL_USUARIOS as role,
             ROLES_USUARIOS as roles_json,
             DEPARTAMENTO_ID_USUARIOS as department_id,
             UNIDADE_ID_USUARIOS as unit_id,
             ABRANGENCIA_GESTAO_USUARIOS as management_scope,
             PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
             PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
             TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
             EH_PROFESSOR_USUARIOS as is_teacher,
             DISCIPLINA_PROFESSOR_USUARIOS as teacher_subject,
             SIGLA_PROFESSOR_USUARIOS as professor_sigla,
             COORDENACAO_CURSO_USUARIOS as is_course_coordinator,
             MATERIA_COORDENACAO_USUARIOS as coordinator_subject,
             PODE_GERIR_FORMACAO_USUARIOS as can_manage_formacao,
             PODE_GERIR_CONTINUADO_USUARIOS as can_manage_continuado,
             PODE_CRIAR_CURSOS_USUARIOS as can_create_academy_courses,
             PODE_CRIAR_BAIAS_ANIMAIS_USUARIOS as can_manage_canil_animals,
             PODE_CADASTRAR_MED_CANIL_USUARIOS as can_register_canil_meds,
             PODE_MINISTRAR_MED_CANIL_USUARIOS as can_administer_canil_meds,
             PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS as can_view_all_canil_reports,
             DATA_CRIACAO_USUARIOS as created_at
           FROM USUARIOS
           WHERE ID_USUARIOS = ?
           LIMIT 1`,
          [sess.userId]
        );
        uRow = rows?.[0] || null;
      } catch {
        const [rows]: any = await pool.query(
          `SELECT
             ID_USUARIOS as id,
             MASP_USUARIOS as masp,
             NOME_USUARIOS as name,
             TELEFONE_USUARIOS as phone,
             CARGO_USUARIOS as cargo,
             PERFIL_USUARIOS as role,
             DEPARTAMENTO_ID_USUARIOS as department_id,
             UNIDADE_ID_USUARIOS as unit_id,
             ABRANGENCIA_GESTAO_USUARIOS as management_scope,
             PODE_MOVER_MUNICAO_USUARIOS as can_move_ammo,
             PODE_MOVER_ARMAS_USUARIOS as can_move_weapons,
             TEM_ACESSO_SISTEMA_USUARIOS as has_system_access,
             DATA_CRIACAO_USUARIOS as created_at
           FROM USUARIOS
           WHERE ID_USUARIOS = ?
           LIMIT 1`,
          [sess.userId]
        );
        uRow = rows?.[0] || null;
      }

      if (!uRow) {
        return res.status(404).json({ error: 'Usuário vinculado à sessão não encontrado.' });
      }

      let roles: string[] = [uRow.role];
      if (uRow.roles_json) {
        try {
          const parsed = JSON.parse(uRow.roles_json);
          if (Array.isArray(parsed) && parsed.length > 0) roles = parsed;
        } catch {}
      }

      const [courseRows]: any = await pool.query(
        `SELECT
           CURSO_ID_USUARIO_CURSOS as courseId,
           DATA_CONCLUSAO_USUARIO_CURSOS as completionDate,
           DATA_VALIDADE_USUARIO_CURSOS as expirationDate
         FROM USUARIO_CURSOS
         WHERE USUARIO_ID_USUARIO_CURSOS = ?`,
        [uRow.id]
      );

      const cfgRow = await loadRawWhatsappConfig(pool);
      const officialDigits = normalizePhoneDigits(cfgRow?.NUMERO_TELEFONE_EXIBICAO);

      const userPayload = {
        id: uRow.id,
        masp: uRow.masp,
        name: uRow.name,
        phone: uRow.phone || '',
        cargo: uRow.cargo || 'Investigador de Polícia',
        role: uRow.role,
        roles,
        departmentId: uRow.department_id || '',
        unitId: uRow.unit_id || '',
        managementScope: uRow.management_scope || 'unit',
        canMoveAmmunition: Boolean(uRow.can_move_ammo),
        canMoveWeapons: Boolean(uRow.can_move_weapons),
        hasSystemAccess: Boolean(uRow.has_system_access),
        mustChangePassword: false,
        isTeacher: Boolean(uRow.is_teacher),
        teacherSubject: uRow.teacher_subject || undefined,
        professorSigla: uRow.professor_sigla || undefined,
        isCourseCoordinator: Boolean(uRow.is_course_coordinator),
        coordinatorSubject: uRow.coordinator_subject || undefined,
        canManageFormacao: Boolean(uRow.can_manage_formacao),
        canManageContinuado: Boolean(uRow.can_manage_continuado),
        canCreateAcademyCourses: Boolean(uRow.can_create_academy_courses),
        canManageCanilAnimals: Boolean(uRow.can_manage_canil_animals),
        canRegisterCanilMeds: Boolean(uRow.can_register_canil_meds),
        canAdministerCanilMeds: Boolean(uRow.can_administer_canil_meds),
        canViewAllCanilReports: Boolean(uRow.can_view_all_canil_reports),
        courses: (courseRows || []).map((c: any) => ({
          courseId: c.courseId,
          completionDate: c.completionDate ? new Date(c.completionDate).toISOString().split('T')[0] : '',
          expirationDate: c.expirationDate ? new Date(c.expirationDate).toISOString().split('T')[0] : ''
        })),
        createdAt: uRow.created_at ? new Date(uRow.created_at).toISOString() : new Date().toISOString()
      };

      return res.json({
        valid: true,
        sessionId: sess.id,
        tipoFluxo: sess.tipoFluxo,
        expiresAt: sess.expiresAt,
        fromPhone: sess.fromPhone,
        whatsappReturnUrl: officialDigits ? `https://wa.me/${officialDigits}` : null,
        user: userPayload
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/whatsapp/sessao-temporaria/:token/concluir', async (req: Request, res: Response) => {
    try {
      const rawToken = String(req.params.token || '').trim();
      if (!/^[a-f0-9]{32,128}$/i.test(rawToken)) {
        return res.status(400).json({ error: 'Token de sessão temporária inválido.' });
      }

      const pool = getPool();
      await ensureWhatsappSchema(pool);
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const [sessRows]: any = await pool.query(
        `SELECT
           s.ID_SESSAO as id,
           s.TIPO_FLUXO as tipoFluxo,
           s.USUARIO_ID as userId,
           s.TELEFONE_ORIGEM as fromPhone,
           s.STATUS_SESSAO as status,
           (s.EXPIRA_EM > NOW()) as isNotExpired,
           u.NOME_USUARIOS as userName,
           u.MASP_USUARIOS as userMasp,
           u.PERFIL_USUARIOS as userRole
         FROM WHATSAPP_SESSOES_TEMPORARIAS s
         LEFT JOIN USUARIOS u ON u.ID_USUARIOS = s.USUARIO_ID
         WHERE s.TOKEN_HASH = ?
         LIMIT 1`,
        [tokenHash]
      );

      const sess = sessRows?.[0];
      if (!sess) {
        return res.status(404).json({ error: 'Sessão temporária não encontrada.' });
      }

      if (sess.status !== 'ATIVA' || !sess.isNotExpired) {
        return res.status(410).json({ error: 'Esta sessão temporária já foi encerrada ou expirou.' });
      }

      await pool.query(
        `UPDATE WHATSAPP_SESSOES_TEMPORARIAS
         SET STATUS_SESSAO = 'CONCLUIDA', CONCLUIDA_EM = NOW()
         WHERE ID_SESSAO = ?`,
        [sess.id]
      );

      const isDevolucao = sess.tipoFluxo === 'DEVOLVER_CAUTELA';
      const wppMessage = isDevolucao
        ? '✅ Solicitação de devolução de cautela registrada!\n\nAguardando deferimento do responsável pela armaria para emitir recibo.'
        : '✅ Solicitação de cautela registrada!\n\nAguardando deferimento do responsável pela armaria para emitir recibo.';

      const cfgRow = await loadRawWhatsappConfig(pool);
      const isSimulatedPhone = String(sess.fromPhone || '').startsWith('sim');
      let whatsappNotified = false;
      if (!isSimulatedPhone && cfgRow?.ATIVO && sess.fromPhone) {
        const sent = await sendDirectWhatsappText(
          pool,
          cfgRow,
          sess.fromPhone,
          wppMessage,
          decryptSecret,
          isDevolucao ? 'DEVOLUCAO_CAUTELA_WHATSAPP' : 'SOLICITACAO_CAUTELA_WHATSAPP'
        );
        whatsappNotified = sent.sentToMeta;
      }

      await insertAuditLog(
        'WHATSAPP',
        isDevolucao ? 'CONCLUIR_SESSAO_DEVOLUCAO_WPP' : 'CONCLUIR_SESSAO_CAUTELA_WPP',
        `Sessão temporária WhatsApp (${sess.tipoFluxo}) concluída por ${sess.userName || sess.userId}. Aguardando deferimento do responsável pela armaria.`,
        {
          id: sess.userId,
          name: sess.userName || undefined,
          masp: sess.userMasp || undefined,
          role: sess.userRole || undefined
        },
        req.ip
      );

      const officialDigits = normalizePhoneDigits(cfgRow?.NUMERO_TELEFONE_EXIBICAO);
      return res.json({
        success: true,
        whatsappNotified,
        message: 'Aguardando deferimento do responsável pela armaria para emitir recibo.',
        whatsappReturnUrl: officialDigits ? `https://wa.me/${officialDigits}` : null
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. DOWNLOAD DE PDF COM TOKEN ASSINADO DE CURTA DURAÇÃO (HMAC-SHA256)
  apiRouter.get('/whatsapp/pdf/download', async (req: Request, res: Response) => {
    try {
      const token = String(req.query.token || '').trim();
      const verified = verifySignedPdfToken(token, getEncryptionKey());
      if (!verified) {
        return res.status(403).json({ error: 'Link de download de PDF inválido ou expirado. Solicite novamente no WhatsApp.' });
      }

      const pool = getPool();
      let buffer: Buffer;
      let filename: string;
      const unitIds = Array.isArray(verified.unitIds) ? verified.unitIds : undefined;
      const unitLabel = verified.unitLabel || 'Unidades Permitidas';

      if (verified.scope === 'op_single' && verified.origem && verified.id) {
        const rep = await findSingleOperationReport(pool, verified.origem as OperacaoOrigem, verified.id);
        if (!rep || (unitIds && unitIds.length > 0 && rep.unidadeId && !unitIds.includes(rep.unidadeId))) {
          return res.status(404).json({ error: 'Relatório de operação não encontrado ou sem permissão.' });
        }
        const pdf = await generateSingleOperationReportPdf(rep);
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'op_last24h') {
        const reps = await findOperationReportsLast24h(pool, unitIds);
        if (reps.length === 0) {
          return res.status(404).json({ error: 'Nenhum relatório de operação encontrado nas últimas 24 horas.' });
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const pdf = await generateMultipleOperationsPdf(
          reps,
          `RELATORIOS DE OPERACOES — ULTIMAS 24H (${unitLabel})`,
          `Ultimas_24h_${unitLabel}_${todayIso}`
        );
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'op_period' && verified.granularity && verified.isoFilter) {
        const reps = await findOperationReportsByDate(pool, verified.granularity, verified.isoFilter, unitIds);
        if (reps.length === 0) {
          return res.status(404).json({ error: 'Nenhum relatório de operação encontrado para o período solicitado.' });
        }
        const display = verified.granularity === 'DIA' ? formatIsoDateBr(verified.isoFilter) : verified.isoFilter;
        const pdf = await generateMultipleOperationsPdf(
          reps,
          `RELATORIOS DE OPERACOES — ${display} (${unitLabel})`,
          `${verified.granularity}_${verified.isoFilter}_${unitLabel}`
        );
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'tr_single' && verified.origem && verified.id) {
        const rep = await findSingleTrainingReport(pool, verified.origem as TreinamentoOrigem, verified.id);
        if (!rep || (unitIds && unitIds.length > 0 && rep.unidadeId && !unitIds.includes(rep.unidadeId))) {
          return res.status(404).json({ error: 'Relatório de treinamento não encontrado ou sem permissão.' });
        }
        const pdf = await generateSingleTrainingReportPdf(rep);
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'tr_last24h') {
        const reps = await findTrainingReportsLast24h(pool, unitIds);
        if (reps.length === 0) {
          return res.status(404).json({ error: 'Nenhum relatório de treinamento encontrado nas últimas 24 horas.' });
        }
        const todayIso = new Date().toISOString().slice(0, 10);
        const pdf = await generateMultipleTrainingsPdf(
          reps,
          `RELATORIOS DE TREINAMENTOS — ULTIMAS 24H (${unitLabel})`,
          `Ultimas_24h_${unitLabel}_${todayIso}`
        );
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'tr_period' && verified.granularity && verified.isoFilter) {
        const reps = await findTrainingReportsByDate(pool, verified.granularity, verified.isoFilter, unitIds);
        if (reps.length === 0) {
          return res.status(404).json({ error: 'Nenhum relatório de treinamento encontrado para o período solicitado.' });
        }
        const display = verified.granularity === 'DIA' ? formatIsoDateBr(verified.isoFilter) : verified.isoFilter;
        const pdf = await generateMultipleTrainingsPdf(
          reps,
          `RELATORIOS DE TREINAMENTOS — ${display} (${unitLabel})`,
          `${verified.granularity}_${verified.isoFilter}_${unitLabel}`
        );
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'arm_receipt' && verified.receiptTipo && verified.id) {
        const rec = await findSingleArmariaReceipt(pool, verified.receiptTipo, verified.id);
        if (!rec) {
          return res.status(404).json({ error: 'Recibo de cautela não encontrado.' });
        }
        const pdf = await generateArmariaReceiptPdf(rec);
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else if (verified.scope === 'arm_report' && verified.period) {
        const data = await findArmariaCautelasByPeriod(pool, verified.period, unitIds);
        const totalCount = data.armas.length + data.municoes.length + data.materiais.length;
        if (totalCount === 0) {
          return res.status(404).json({ error: 'Nenhuma movimentação de armaria encontrada no período solicitado.' });
        }
        const periodLabels: Record<string, string> = {
          '24H': 'Últimas 24h',
          SEMANA: 'Última semana',
          MES_ATUAL: 'Mês atual',
          ANO_ATUAL: 'Ano atual'
        };
        const periodLabel = periodLabels[verified.period] || verified.period;
        const todayIso = new Date().toISOString().slice(0, 10);
        const pdf = await generateArmariaCautelasReportPdf(
          data,
          unitLabel,
          periodLabel,
          `${verified.period}_${unitLabel}_${todayIso}`
        );
        buffer = pdf.buffer;
        filename = pdf.filename;
      } else {
        return res.status(400).json({ error: 'Escopo de PDF inválido.' });
      }

      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
