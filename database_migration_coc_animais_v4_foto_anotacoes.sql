-- ============================================================================
-- MIGRAÇÃO IDEMPOTENTE (MySQL 8.0+ / MariaDB 10.4+)
-- Módulo COC / Canil K9 — Prontuário de Animais (v4):
--   1. Garante coluna ANOTACOES_CONDUTOR_CACHORRO (VARCHAR 500) em CACHORROS_CANIL
--   2. Adiciona coluna ANOTACOES_CONDUTOR_ATUALIZADO_EM (DATETIME) em CACHORROS_CANIL
--      para registrar data e hora da última alteração das anotações do condutor
--   3. Garante que FOTO_URL_CACHORRO seja MEDIUMTEXT para suportar envio de foto
--      do animal diretamente pelo cadastro/edição
-- ============================================================================

-- 1. Garante coluna ANOTACOES_CONDUTOR_CACHORRO em CACHORROS_CANIL
SET @col_anot_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'CACHORROS_CANIL'
     AND COLUMN_NAME = 'ANOTACOES_CONDUTOR_CACHORRO'
);
SET @sql_add_anot := IF(
  @col_anot_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `ANOTACOES_CONDUTOR_CACHORRO` VARCHAR(500) DEFAULT NULL AFTER `OBSERVACOES_CACHORRO`',
  'SELECT 1'
);
PREPARE stmt_add_anot FROM @sql_add_anot;
EXECUTE stmt_add_anot;
DEALLOCATE PREPARE stmt_add_anot;

-- 2. Adiciona coluna ANOTACOES_CONDUTOR_ATUALIZADO_EM em CACHORROS_CANIL
SET @col_anot_upd_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'CACHORROS_CANIL'
     AND COLUMN_NAME = 'ANOTACOES_CONDUTOR_ATUALIZADO_EM'
);
SET @sql_add_anot_upd := IF(
  @col_anot_upd_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `ANOTACOES_CONDUTOR_ATUALIZADO_EM` DATETIME DEFAULT NULL AFTER `ANOTACOES_CONDUTOR_CACHORRO`',
  'SELECT 1'
);
PREPARE stmt_add_anot_upd FROM @sql_add_anot_upd;
EXECUTE stmt_add_anot_upd;
DEALLOCATE PREPARE stmt_add_anot_upd;

-- 3. Garante que FOTO_URL_CACHORRO exista e suporte imagens em base64 (MEDIUMTEXT)
SET @col_foto_type := (
  SELECT LOWER(DATA_TYPE)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'CACHORROS_CANIL'
     AND COLUMN_NAME = 'FOTO_URL_CACHORRO'
   LIMIT 1
);
SET @sql_fix_foto := IF(
  @col_foto_type IS NULL,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `FOTO_URL_CACHORRO` MEDIUMTEXT DEFAULT NULL AFTER `UNIDADE_ID_CACHORRO`',
  IF(
    @col_foto_type NOT IN ('mediumtext', 'longtext'),
    'ALTER TABLE `CACHORROS_CANIL` MODIFY COLUMN `FOTO_URL_CACHORRO` MEDIUMTEXT DEFAULT NULL',
    'SELECT 1'
  )
);
PREPARE stmt_fix_foto FROM @sql_fix_foto;
EXECUTE stmt_fix_foto;
DEALLOCATE PREPARE stmt_fix_foto;
