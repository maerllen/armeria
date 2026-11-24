-- ============================================================================
-- MIGRAÇÃO INCREMENTAL — FLUXO INTERATIVO & TEMPLATE MENU WHATSAPP (v2)
-- Compatível com MySQL 8.0+ / MariaDB 10.4+ (Script 100% idempotente)
-- ============================================================================

-- 1. Tabela de controle de sessão da conversa interativa por telefone
CREATE TABLE IF NOT EXISTS `WHATSAPP_CONVERSAS_SESSAO` (
  `TELEFONE_CLIENTE` VARCHAR(32) NOT NULL,
  `ETAPA_ATUAL` VARCHAR(64) NOT NULL DEFAULT 'INICIO',
  `CONTEXTO_JSON` LONGTEXT DEFAULT NULL,
  `ULTIMA_INTERACAO_EM` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`TELEFONE_CLIENTE`),
  KEY `idx_wpp_sessao_etapa` (`ETAPA_ATUAL`),
  KEY `idx_wpp_sessao_interacao` (`ULTIMA_INTERACAO_EM`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Template de Menu Principal com 3 botões Quick Reply (Operações, Treinamentos, Armaria)
INSERT IGNORE INTO `WHATSAPP_TEMPLATES` (
  `ID_TEMPLATE`,
  `NOME_TEMPLATE`,
  `IDIOMA`,
  `CATEGORIA`,
  `STATUS_META`,
  `CABECALHO_TIPO`,
  `CABECALHO_TEXTO`,
  `CORPO_TEXTO`,
  `RODAPE_TEXTO`,
  `VARIAVEIS_EXEMPLO_JSON`,
  `BOTOES_JSON`,
  `ORIGEM`,
  `ATIVO`,
  `DATA_CRIACAO`
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
  '[{"type":"QUICK_REPLY","text":"Operações"},{"type":"QUICK_REPLY","text":"Treinamentos"},{"type":"QUICK_REPLY","text":"Armaria"}]',
  'LOCAL',
  1,
  NOW()
);

-- 3. Regra de Comunicação para Atendimento Automático Interativo via Webhook
INSERT IGNORE INTO `WHATSAPP_REGRAS_COMUNICACAO` (
  `ID_REGRA`,
  `EVENTO_SISTEMA`,
  `NOME_EXIBICAO`,
  `DESCRICAO`,
  `TEMPLATE_ID`,
  `TEMPLATE_NOME`,
  `DESTINATARIO_TIPO`,
  `MAPEAMENTO_VARIAVEIS_JSON`,
  `ATIVO`,
  `DATA_CRIACAO`
) VALUES (
  'wpp-regra-07',
  'ATENDIMENTO_BOT_INTERATIVO',
  'Menu Interativo de Atendimento (Operações / Treinamentos / Armaria)',
  'Responde automaticamente quando um cliente envia mensagem, exibindo o menu de botões e permitindo baixar relatórios de operações por data (dia/mês/ano) ou das últimas 24h em PDF.',
  'wpp-tpl-menu-principal',
  'menu_atendimento_principal',
  'USUARIO_DESTINO',
  '[]',
  1,
  NOW()
);
