-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO: RELATÓRIO DE OPERAÇÕES CAT (V2)
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Adiciona colunas na tabela RELATORIOS_OPERACOES_CAT para:
--  1. HORARIO_SAIDA_BASE (Hora da Saída da Base)
--  2. TEVE_OBITO, QTD_OBITOS, MESMO_DETALHAMENTO_OBITOS e OBITOS_DETALHAMENTOS_JSON
--     (registro de óbitos quando houver disparos realizados)
--
-- Script 100% idempotente (seguro para executar em bancos novos ou em produção).
-- NÃO altera nenhuma tabela da unidade COC / Canil.
-- ============================================================================

-- 1. HORARIO_SAIDA_BASE
SET @col_hsb_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'HORARIO_SAIDA_BASE'
);
SET @sql_add_hsb := IF(
  @col_hsb_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `HORARIO_SAIDA_BASE` VARCHAR(5) DEFAULT NULL AFTER `DATA_SAIDA_BASE`',
  'SELECT ''Coluna HORARIO_SAIDA_BASE já existe'' AS status'
);
PREPARE stmt_hsb FROM @sql_add_hsb;
EXECUTE stmt_hsb;
DEALLOCATE PREPARE stmt_hsb;

-- 2. TEVE_OBITO
SET @col_to_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'TEVE_OBITO'
);
SET @sql_add_to := IF(
  @col_to_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `TEVE_OBITO` TINYINT(1) NOT NULL DEFAULT 0 AFTER `DISPAROS_CAT_JSON`',
  'SELECT ''Coluna TEVE_OBITO já existe'' AS status'
);
PREPARE stmt_to FROM @sql_add_to;
EXECUTE stmt_to;
DEALLOCATE PREPARE stmt_to;

-- 3. QTD_OBITOS
SET @col_qo_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'QTD_OBITOS'
);
SET @sql_add_qo := IF(
  @col_qo_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `QTD_OBITOS` INT NOT NULL DEFAULT 0 AFTER `TEVE_OBITO`',
  'SELECT ''Coluna QTD_OBITOS já existe'' AS status'
);
PREPARE stmt_qo FROM @sql_add_qo;
EXECUTE stmt_qo;
DEALLOCATE PREPARE stmt_qo;

-- 4. MESMO_DETALHAMENTO_OBITOS
SET @col_mdo_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'MESMO_DETALHAMENTO_OBITOS'
);
SET @sql_add_mdo := IF(
  @col_mdo_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `MESMO_DETALHAMENTO_OBITOS` TINYINT(1) NOT NULL DEFAULT 1 AFTER `QTD_OBITOS`',
  'SELECT ''Coluna MESMO_DETALHAMENTO_OBITOS já existe'' AS status'
);
PREPARE stmt_mdo FROM @sql_add_mdo;
EXECUTE stmt_mdo;
DEALLOCATE PREPARE stmt_mdo;

-- 5. OBITOS_DETALHAMENTOS_JSON
SET @col_od_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'OBITOS_DETALHAMENTOS_JSON'
);
SET @sql_add_od := IF(
  @col_od_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `OBITOS_DETALHAMENTOS_JSON` LONGTEXT DEFAULT NULL AFTER `MESMO_DETALHAMENTO_OBITOS`',
  'SELECT ''Coluna OBITOS_DETALHAMENTOS_JSON já existe'' AS status'
);
PREPARE stmt_od FROM @sql_add_od;
EXECUTE stmt_od;
DEALLOCATE PREPARE stmt_od;

-- 6. Conferência da estrutura atualizada
SHOW COLUMNS FROM `RELATORIOS_OPERACOES_CAT`;
