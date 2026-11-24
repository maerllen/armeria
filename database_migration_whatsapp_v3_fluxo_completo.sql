-- ============================================================================
-- MIGRAÇÃO INCREMENTAL — FLUXO COMPLETO WHATSAPP (OPERAÇÕES, TREINAMENTOS, ARMARIA) (v3)
-- Compatível com MySQL 8.0+ / MariaDB 10.4+ (Script 100% idempotente)
-- ============================================================================

-- 1. Sessão de conversa interativa por telefone
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

-- 2. Sessões temporárias autenticadas para Solicitar / Devolver Cautela a partir do WhatsApp
CREATE TABLE IF NOT EXISTS `WHATSAPP_SESSOES_TEMPORARIAS` (
  `ID_SESSAO` VARCHAR(64) NOT NULL,
  `TOKEN_HASH` VARCHAR(128) NOT NULL,
  `TIPO_FLUXO` ENUM('SOLICITAR_CAUTELA', 'DEVOLVER_CAUTELA') NOT NULL,
  `USUARIO_ID` VARCHAR(64) NOT NULL,
  `TELEFONE_CLIENTE` VARCHAR(32) NOT NULL,
  `STATUS_SESSAO` ENUM('ATIVA', 'CONCLUIDA', 'EXPIRADA', 'CANCELADA') NOT NULL DEFAULT 'ATIVA',
  `EXPIRA_EM` DATETIME NOT NULL,
  `CONCLUIDA_EM` DATETIME DEFAULT NULL,
  `RESUMO_ACAO` TEXT DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_SESSAO`),
  UNIQUE KEY `uk_wpp_sess_temp_hash` (`TOKEN_HASH`),
  KEY `idx_wpp_sess_temp_user` (`USUARIO_ID`),
  KEY `idx_wpp_sess_temp_status` (`STATUS_SESSAO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Atualiza descrição da regra de Atendimento Interativo
UPDATE `WHATSAPP_REGRAS_COMUNICACAO`
SET `DESCRICAO` = 'Atendimento interativo completo: Operações e Treinamentos (por DIA/MÊS/ANO, MÊS/ANO, ANO ou 24h com filtro por unidade permitida) e Armaria (Solicitar/Devolver cautela em página temporária, Recibos separados e Relatórios por período).'
WHERE `EVENTO_SISTEMA` = 'ATENDIMENTO_BOT_INTERATIVO';
