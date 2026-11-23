-- =========================================================================
-- MIGRAÇÃO DE BANCO DE DADOS — UNIDADE COC / CANIL K9 (V2)
-- Compatível com MySQL 8.0+ e MariaDB 10.4+ (Script 100% idempotente)
--
-- Alterações incluídas:
--   1) RELATORIOS_TREINAMENTO_CANIL:
--      - HORA_TREINAMENTO (HH:mm do registro do treinamento)
--      - TOPICOS_TREINAMENTO_JSON (snapshot JSON dos tópicos e K9 vinculados)
--   2) RELATORIOS_TREINAMENTO_CANIL_TOPICOS_K9 (Nova tabela relacional):
--      - Armazena cada tópico de treinamento por animal K9 junto com data,
--        hora, dados do condutor e dados do animal, permitindo consultas
--        e históricos individuais por cão K9 e por tópico.
--   3) RELATORIOS_OPERACOES_CANIL:
--      - ESTADO_OPERACAO (UF da operação, padrão 'MG')
--      - APOIO_OUTRO_DEPARTAMENTO (0 = Não, 1 = Sim)
--      - DEPARTAMENTOS_APOIO_JSON (lista JSON de departamentos PCMG apoiados)
--      - Índices para consulta rápida por UF e apoio a outro departamento.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) RELATORIOS_TREINAMENTO_CANIL: HORA_TREINAMENTO e TOPICOS_TREINAMENTO_JSON
-- -------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_CANIL'
    AND COLUMN_NAME = 'HORA_TREINAMENTO'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_CANIL` ADD COLUMN `HORA_TREINAMENTO` VARCHAR(5) DEFAULT NULL AFTER `DATA_TREINAMENTO`',
  'SELECT ''Coluna HORA_TREINAMENTO ja existe em RELATORIOS_TREINAMENTO_CANIL'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_CANIL'
    AND COLUMN_NAME = 'TOPICOS_TREINAMENTO_JSON'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_CANIL` ADD COLUMN `TOPICOS_TREINAMENTO_JSON` LONGTEXT DEFAULT NULL AFTER `PARTICIPANTES_JSON`',
  'SELECT ''Coluna TOPICOS_TREINAMENTO_JSON ja existe em RELATORIOS_TREINAMENTO_CANIL'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- 2) NOVA TABELA RELACIONAL: RELATORIOS_TREINAMENTO_CANIL_TOPICOS_K9
--    Registra cada tópico executado por cada animal K9 com data, hora,
--    condutor e dados do animal para consultas futuras por animal.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `RELATORIOS_TREINAMENTO_CANIL_TOPICOS_K9` (
  `ID_TOPICO_K9` VARCHAR(64) NOT NULL,
  `ID_REL_TREINAMENTO` VARCHAR(64) NOT NULL,
  `TOPICO` VARCHAR(64) NOT NULL,
  `DATA_TREINAMENTO` VARCHAR(10) NOT NULL,
  `HORA_TREINAMENTO` VARCHAR(5) NOT NULL DEFAULT '00:00',
  `CONDUTOR_ID` VARCHAR(64) NOT NULL,
  `CONDUTOR_NOME` VARCHAR(255) NOT NULL,
  `CONDUTOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `CONDUTOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `CACHORRO_ID` VARCHAR(64) NOT NULL,
  `CACHORRO_NOME` VARCHAR(160) NOT NULL,
  `CACHORRO_RACA` VARCHAR(128) DEFAULT NULL,
  `CACHORRO_MICROCHIP` VARCHAR(64) DEFAULT NULL,
  `APLICAR_TODOS_K9` TINYINT(1) NOT NULL DEFAULT 0,
  `MODALIDADE_LOCAL` VARCHAR(16) NOT NULL DEFAULT 'Interno',
  `MODALIDADE_PARTICIPACAO` VARCHAR(16) NOT NULL DEFAULT 'Sozinho',
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_TOPICO_K9`),
  KEY `idx_rtk9_relatorio` (`ID_REL_TREINAMENTO`),
  KEY `idx_rtk9_cachorro` (`CACHORRO_ID`),
  KEY `idx_rtk9_topico` (`TOPICO`),
  KEY `idx_rtk9_data` (`DATA_TREINAMENTO`),
  KEY `idx_rtk9_cao_topico` (`CACHORRO_ID`, `TOPICO`),
  KEY `idx_rtk9_condutor` (`CONDUTOR_ID`),
  KEY `idx_rtk9_unit` (`UNIDADE_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 3) RELATORIOS_OPERACOES_CANIL: ESTADO_OPERACAO e APOIO A OUTRO DEPARTAMENTO
-- -------------------------------------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL'
    AND COLUMN_NAME = 'ESTADO_OPERACAO'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD COLUMN `ESTADO_OPERACAO` VARCHAR(2) NOT NULL DEFAULT ''MG'' AFTER `HORA_OPERACAO`',
  'SELECT ''Coluna ESTADO_OPERACAO ja existe em RELATORIOS_OPERACOES_CANIL'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Garante que registros legados sem UF fiquem preenchidos com 'MG'
UPDATE `RELATORIOS_OPERACOES_CANIL`
SET `ESTADO_OPERACAO` = 'MG'
WHERE `ESTADO_OPERACAO` IS NULL OR TRIM(`ESTADO_OPERACAO`) = '';

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL'
    AND COLUMN_NAME = 'APOIO_OUTRO_DEPARTAMENTO'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD COLUMN `APOIO_OUTRO_DEPARTAMENTO` TINYINT(1) NOT NULL DEFAULT 0 AFTER `SOLICITACAO_OUTROS_DETALHES`',
  'SELECT ''Coluna APOIO_OUTRO_DEPARTAMENTO ja existe em RELATORIOS_OPERACOES_CANIL'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL'
    AND COLUMN_NAME = 'DEPARTAMENTOS_APOIO_JSON'
);
SET @sql_stmt := IF(
  @col_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD COLUMN `DEPARTAMENTOS_APOIO_JSON` LONGTEXT DEFAULT NULL AFTER `APOIO_OUTRO_DEPARTAMENTO`',
  'SELECT ''Coluna DEPARTAMENTOS_APOIO_JSON ja existe em RELATORIOS_OPERACOES_CANIL'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Índices opcionais em RELATORIOS_OPERACOES_CANIL
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL'
    AND INDEX_NAME = 'idx_rel_op_estado'
);
SET @sql_stmt := IF(
  @idx_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD INDEX `idx_rel_op_estado` (`ESTADO_OPERACAO`)',
  'SELECT ''Indice idx_rel_op_estado ja existe'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL'
    AND INDEX_NAME = 'idx_rel_op_apoio_dept'
);
SET @sql_stmt := IF(
  @idx_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD INDEX `idx_rel_op_apoio_dept` (`APOIO_OUTRO_DEPARTAMENTO`)',
  'SELECT ''Indice idx_rel_op_apoio_dept ja existe'' AS info'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- 4) VERIFICAÇÃO FINAL DAS ESTRUTURAS
-- -------------------------------------------------------------------------
SHOW COLUMNS FROM `RELATORIOS_TREINAMENTO_CANIL`;
SHOW COLUMNS FROM `RELATORIOS_TREINAMENTO_CANIL_TOPICOS_K9`;
SHOW COLUMNS FROM `RELATORIOS_OPERACOES_CANIL`;
