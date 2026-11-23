-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO: RELATÓRIO DE OPERAÇÕES CAT (V3)
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Atualiza a tabela RELATORIOS_OPERACOES_CAT para contemplar:
--  1. APOIO_OUTRO_DEPARTAMENTO (TINYINT(1)): indica se houve apoio a outro(s)
--     departamento(s) na seção Local da Operação.
--  2. DEPARTAMENTOS_APOIO_JSON (LONGTEXT): lista JSON dos departamentos do
--     estado apoiados na operação (um ou mais).
--  3. Garante a coluna EQUIPE_SOLO_JSON como LONGTEXT para armazenar o novo
--     formato enriquecido de Piloto de Aeronave Não Tripulada (Drone),
--     incluindo: origemDrone (VIATURA | CAT | COE | EXTERNO | DESCONHECIDO),
--     viaturaPlaca, unitId, unitName, desconhecido, nome e MASP.
--  4. Garante de forma idempotente as colunas da V2 (HORARIO_SAIDA_BASE,
--     TEVE_OBITO, QTD_OBITOS, MESMO_DETALHAMENTO_OBITOS e
--     OBITOS_DETALHAMENTOS_JSON), caso ainda não tenham sido aplicadas.
--
-- Script 100% idempotente (seguro para executar em bancos novos ou em produção).
-- NÃO altera nenhuma tabela da unidade COC / Canil.
-- ============================================================================

-- 1. Garantir colunas V2 caso ainda não existam
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

-- 2. APOIO_OUTRO_DEPARTAMENTO (Local da Operação -> Apoio a outro departamento?)
SET @col_aod_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'APOIO_OUTRO_DEPARTAMENTO'
);
SET @sql_add_aod := IF(
  @col_aod_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `APOIO_OUTRO_DEPARTAMENTO` TINYINT(1) NOT NULL DEFAULT 0 AFTER `OUTROS_MUNICIPIOS_JSON`',
  'SELECT ''Coluna APOIO_OUTRO_DEPARTAMENTO já existe'' AS status'
);
PREPARE stmt_aod FROM @sql_add_aod;
EXECUTE stmt_aod;
DEALLOCATE PREPARE stmt_aod;

-- 3. DEPARTAMENTOS_APOIO_JSON (Lista JSON dos departamentos do estado apoiados)
SET @col_da_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND COLUMN_NAME = 'DEPARTAMENTOS_APOIO_JSON'
);
SET @sql_add_da := IF(
  @col_da_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD COLUMN `DEPARTAMENTOS_APOIO_JSON` LONGTEXT DEFAULT NULL AFTER `APOIO_OUTRO_DEPARTAMENTO`',
  'SELECT ''Coluna DEPARTAMENTOS_APOIO_JSON já existe'' AS status'
);
PREPARE stmt_da FROM @sql_add_da;
EXECUTE stmt_da;
DEALLOCATE PREPARE stmt_da;

-- 4. Garantir EQUIPE_SOLO_JSON como LONGTEXT (suporta pilotos de drone de Viatura, CAT, COE, Externo e Desconhecido)
ALTER TABLE `RELATORIOS_OPERACOES_CAT`
  MODIFY COLUMN `EQUIPE_SOLO_JSON` LONGTEXT DEFAULT NULL;

-- 5. Índice auxiliar opcional para consultas por apoio a outro departamento
SET @idx_aod_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CAT'
    AND INDEX_NAME = 'idx_rel_op_cat_apoio_dept'
);
SET @sql_add_idx_aod := IF(
  @idx_aod_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CAT` ADD INDEX `idx_rel_op_cat_apoio_dept` (`APOIO_OUTRO_DEPARTAMENTO`)',
  'SELECT ''Índice idx_rel_op_cat_apoio_dept já existe'' AS status'
);
PREPARE stmt_idx_aod FROM @sql_add_idx_aod;
EXECUTE stmt_idx_aod;
DEALLOCATE PREPARE stmt_idx_aod;

-- 6. Conferência da estrutura atualizada
SHOW COLUMNS FROM `RELATORIOS_OPERACOES_CAT`;
