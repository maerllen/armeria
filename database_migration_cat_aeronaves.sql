-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO: UNIDADE CAT — AERONAVES E VINCULAÇÃO DE USUÁRIOS
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Migração idempotente (segura para rodar em bancos novos ou existentes).
-- ============================================================================

-- 1. Tabela de Aeronaves da Unidade CAT
CREATE TABLE IF NOT EXISTS `AERONAVES_UNIDADE` (
  `ID_AERONAVE` VARCHAR(64) NOT NULL,
  `TIPO_AERONAVE` ENUM('AVIÃO', 'HELICÓPTERO') NOT NULL,
  `PREFIXO_AERONAVE` VARCHAR(32) NOT NULL,
  `DESCRICAO_AERONAVE` VARCHAR(200) NOT NULL,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) NOT NULL,
  `CRIADO_POR_ID` VARCHAR(64) DEFAULT NULL,
  `CRIADO_POR_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_AERONAVE`),
  UNIQUE KEY `uk_aeronave_prefixo_unidade` (`PREFIXO_AERONAVE`, `UNIDADE_ID`),
  KEY `idx_aeronave_unidade` (`UNIDADE_ID`),
  KEY `idx_aeronave_tipo` (`TIPO_AERONAVE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Coluna CAT_FUNCAO_USUARIOS na tabela USUARIOS (Piloto, Copiloto, Operador Aerotático)
SET @col_cat_funcao_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'CAT_FUNCAO_USUARIOS'
);

SET @sql_add_cat_funcao := IF(
  @col_cat_funcao_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `CAT_FUNCAO_USUARIOS` VARCHAR(64) DEFAULT NULL AFTER `PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS`',
  'SELECT ''Coluna CAT_FUNCAO_USUARIOS já existe'' AS status'
);
PREPARE stmt_add_cat_funcao FROM @sql_add_cat_funcao;
EXECUTE stmt_add_cat_funcao;
DEALLOCATE PREPARE stmt_add_cat_funcao;

-- 3. Coluna CAT_AERONAVES_JSON na tabela USUARIOS (Lista JSON de IDs de aeronaves vinculadas)
SET @col_cat_aeronaves_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USUARIOS'
    AND COLUMN_NAME = 'CAT_AERONAVES_JSON'
);

SET @sql_add_cat_aeronaves := IF(
  @col_cat_aeronaves_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `CAT_AERONAVES_JSON` TEXT DEFAULT NULL AFTER `CAT_FUNCAO_USUARIOS`',
  'SELECT ''Coluna CAT_AERONAVES_JSON já existe'' AS status'
);
PREPARE stmt_add_cat_aeronaves FROM @sql_add_cat_aeronaves;
EXECUTE stmt_add_cat_aeronaves;
DEALLOCATE PREPARE stmt_add_cat_aeronaves;
