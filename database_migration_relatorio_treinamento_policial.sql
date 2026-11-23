-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO: RELATÓRIO DE TREINAMENTO POLICIAL (UNIDADES NÃO-COC)
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Migração idempotente (segura para rodar em bancos novos ou existentes).
-- NÃO altera nenhuma tabela da unidade COC / Operador Canino.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `RELATORIOS_TREINAMENTO_POLICIAL` (
  `ID_REL_TREIN_POL` VARCHAR(64) NOT NULL,
  `DATA_TREINAMENTO` VARCHAR(10) NOT NULL COMMENT 'Data do treinamento no formato YYYY-MM-DD',
  `OPERADOR_ID` VARCHAR(64) NOT NULL COMMENT 'ID do Operador Digitador (criador do relatório)',
  `OPERADOR_NOME` VARCHAR(255) NOT NULL,
  `OPERADOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `OPERADOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `MODALIDADE_LOCAL` ENUM('Interno', 'Externo') NOT NULL DEFAULT 'Interno',
  `TITULO_TREINAMENTO` ENUM('Operacional', 'Tático', 'Físico', '3C') NOT NULL DEFAULT 'Operacional',
  `MODALIDADE_PARTICIPACAO` ENUM('Sozinho', 'Coletivo') NOT NULL DEFAULT 'Sozinho',
  `PARTICIPACAO_OUTRAS_UNIDADES` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Sim, 0 = Não',
  `OUTRAS_UNIDADES_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com array de outras unidades participantes [{id, name}]',
  `PARTICIPANTES_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com até 100 participantes [{userId, name, masp, cargo, unitId, unitName, signed, signedAt}]',
  `DESCRICAO` TEXT NOT NULL COMMENT 'Descrição do treinamento do dia (máx. 1000 caracteres)',
  `OPERADOR_ASSINADO` TINYINT(1) NOT NULL DEFAULT 1,
  `OPERADOR_ASSINADO_EM` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REL_TREIN_POL`),
  KEY `idx_rel_trein_pol_data` (`DATA_TREINAMENTO`),
  KEY `idx_rel_trein_pol_operador` (`OPERADOR_ID`),
  KEY `idx_rel_trein_pol_unit` (`UNIDADE_ID`),
  KEY `idx_rel_trein_pol_titulo` (`TITULO_TREINAMENTO`),
  KEY `idx_rel_trein_pol_criacao` (`DATA_CRIACAO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VERIFICAÇÃO IDEMPOTENTE DE COLUNAS (caso a tabela já exista parcialmente)
-- ============================================================================
SET @db_name = DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_POLICIAL'
    AND COLUMN_NAME = 'PARTICIPACAO_OUTRAS_UNIDADES'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_POLICIAL` ADD COLUMN `PARTICIPACAO_OUTRAS_UNIDADES` TINYINT(1) NOT NULL DEFAULT 0 AFTER `MODALIDADE_PARTICIPACAO`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_POLICIAL'
    AND COLUMN_NAME = 'OUTRAS_UNIDADES_JSON'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_POLICIAL` ADD COLUMN `OUTRAS_UNIDADES_JSON` LONGTEXT DEFAULT NULL AFTER `PARTICIPACAO_OUTRAS_UNIDADES`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_POLICIAL'
    AND COLUMN_NAME = 'UNIDADE_NOME'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_POLICIAL` ADD COLUMN `UNIDADE_NOME` VARCHAR(255) DEFAULT NULL AFTER `UNIDADE_ID`',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- FIM DO SCRIPT DE ATUALIZAÇÃO
-- ============================================================================
