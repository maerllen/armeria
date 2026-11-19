-- ============================================================================
-- SCRIPT SQL COMPLETO DE ATUALIZAÇÃO: MÓDULO RELATÓRIOS (COC / CANIL K9 + VIATURAS)
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Script 100% idempotente: pode ser executado com segurança em bancos novos ou
-- já em produção, pois verifica a existência de cada tabela, coluna e índice
-- antes de criar ou alterar.
--
-- O QUE ESTE SCRIPT CONFIGURA:
--   1. Permissões do perfil Operador Canino na tabela USUARIOS
--      (incluindo "Ver Relatórios de todas as Equipes" para Relatórios da Unidade)
--   2. Suporte a até 2 condutores na tabela CACHORROS_CANIL
--      (para pré-seleção automática dos cães nos Relatórios de Treinamento e Operações)
--   3. Tabela VIATURAS_UNIDADE
--      (cadastro de viaturas por unidade com Descrição e Placa no padrão AAA-XAXX)
--   4. Tabela RELATORIOS_TREINAMENTO_CANIL
--      (treinamentos individuais/coletivos, múltiplos cães e assinaturas)
--   5. Tabela RELATORIOS_OPERACOES_CANIL
--      (operações K9, comarca MG, solicitação, viaturas, operadores, materiais encontrados)
-- ============================================================================


-- ============================================================================
-- 1. TABELA USUARIOS: Permissões do Operador Canino (Relatórios & Canil)
-- ============================================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USUARIOS' AND COLUMN_NAME = 'PODE_CRIAR_BAIAS_ANIMAIS_USUARIOS'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `PODE_CRIAR_BAIAS_ANIMAIS_USUARIOS` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "Coluna USUARIOS.PODE_CRIAR_BAIAS_ANIMAIS_USUARIOS já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USUARIOS' AND COLUMN_NAME = 'PODE_CADASTRAR_MED_CANIL_USUARIOS'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `PODE_CADASTRAR_MED_CANIL_USUARIOS` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "Coluna USUARIOS.PODE_CADASTRAR_MED_CANIL_USUARIOS já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USUARIOS' AND COLUMN_NAME = 'PODE_MINISTRAR_MED_CANIL_USUARIOS'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `PODE_MINISTRAR_MED_CANIL_USUARIOS` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "Coluna USUARIOS.PODE_MINISTRAR_MED_CANIL_USUARIOS já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'USUARIOS' AND COLUMN_NAME = 'PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `USUARIOS` ADD COLUMN `PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT "Coluna USUARIOS.PODE_VER_RELATORIOS_EQUIPES_CANIL_USUARIOS já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- 2. TABELA CACHORROS_CANIL: Suporte a 2 Condutores (pré-seleção nos relatórios)
-- ============================================================================

SET @tbl_cao_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL'
);

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND COLUMN_NAME = 'USUARIO_INTERNO_2_ID_CACHORRO'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `USUARIO_INTERNO_2_ID_CACHORRO` VARCHAR(64) DEFAULT NULL AFTER `USUARIO_INTERNO_CARGO_CACHORRO`',
  'SELECT "Coluna CACHORROS_CANIL.USUARIO_INTERNO_2_ID_CACHORRO OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND COLUMN_NAME = 'USUARIO_INTERNO_2_NOME_CACHORRO'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `USUARIO_INTERNO_2_NOME_CACHORRO` VARCHAR(255) DEFAULT NULL AFTER `USUARIO_INTERNO_2_ID_CACHORRO`',
  'SELECT "Coluna CACHORROS_CANIL.USUARIO_INTERNO_2_NOME_CACHORRO OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND COLUMN_NAME = 'USUARIO_INTERNO_2_MASP_CACHORRO'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `USUARIO_INTERNO_2_MASP_CACHORRO` VARCHAR(32) DEFAULT NULL AFTER `USUARIO_INTERNO_2_NOME_CACHORRO`',
  'SELECT "Coluna CACHORROS_CANIL.USUARIO_INTERNO_2_MASP_CACHORRO OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND COLUMN_NAME = 'USUARIO_INTERNO_2_CARGO_CACHORRO'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD COLUMN `USUARIO_INTERNO_2_CARGO_CACHORRO` VARCHAR(64) DEFAULT NULL AFTER `USUARIO_INTERNO_2_MASP_CACHORRO`',
  'SELECT "Coluna CACHORROS_CANIL.USUARIO_INTERNO_2_CARGO_CACHORRO OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND INDEX_NAME = 'idx_cao_condutor_1'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD KEY `idx_cao_condutor_1` (`USUARIO_INTERNO_ID_CACHORRO`)',
  'SELECT "Índice idx_cao_condutor_1 OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CACHORROS_CANIL' AND INDEX_NAME = 'idx_cao_condutor_2'
);
SET @sql := IF(@tbl_cao_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `CACHORROS_CANIL` ADD KEY `idx_cao_condutor_2` (`USUARIO_INTERNO_2_ID_CACHORRO`)',
  'SELECT "Índice idx_cao_condutor_2 OK."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- 3. TABELA VIATURAS_UNIDADE: Cadastro de Viaturas por Unidade (Placa AAA-XAXX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `VIATURAS_UNIDADE` (
  `ID_VIATURA` VARCHAR(64) NOT NULL,
  `PLACA_VIATURA` VARCHAR(8) NOT NULL COMMENT 'Padrão AAA-XAXX (A=letra maiúscula, X=número)',
  `DESCRICAO_VIATURA` VARCHAR(160) NOT NULL COMMENT 'Marca e modelo da viatura',
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) NOT NULL,
  `CRIADO_POR_ID` VARCHAR(64) DEFAULT NULL,
  `CRIADO_POR_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_VIATURA`),
  UNIQUE KEY `uk_viatura_placa_unidade` (`PLACA_VIATURA`, `UNIDADE_ID`),
  KEY `idx_viatura_unidade` (`UNIDADE_ID`),
  KEY `idx_viatura_placa` (`PLACA_VIATURA`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 4. TABELA RELATORIOS_TREINAMENTO_CANIL: Relatórios de Treinamento (COC / K9)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `RELATORIOS_TREINAMENTO_CANIL` (
  `ID_REL_TREINAMENTO` VARCHAR(64) NOT NULL,
  `DATA_TREINAMENTO` VARCHAR(10) NOT NULL,
  `CONDUTOR_ID` VARCHAR(64) NOT NULL,
  `CONDUTOR_NOME` VARCHAR(255) NOT NULL,
  `CONDUTOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `CONDUTOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `CACHORRO_ID` VARCHAR(64) NOT NULL,
  `CACHORRO_NOME` VARCHAR(255) NOT NULL,
  `CACHORRO_RACA` VARCHAR(128) DEFAULT NULL,
  `CACHORRO_MICROCHIP` VARCHAR(64) DEFAULT NULL,
  `CACHORROS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Lista JSON de múltiplos cães do relator',
  `MODALIDADE_LOCAL` ENUM('Interno', 'Externo') NOT NULL DEFAULT 'Interno',
  `MODALIDADE_PARTICIPACAO` ENUM('Sozinho', 'Coletivo') NOT NULL DEFAULT 'Sozinho',
  `DESCRICAO` TEXT NOT NULL,
  `PARTICIPANTES_JSON` LONGTEXT DEFAULT NULL COMMENT 'Lista JSON de participantes coletivos, cães e assinaturas',
  `CONDUTOR_ASSINADO` TINYINT(1) NOT NULL DEFAULT 1,
  `CONDUTOR_ASSINADO_EM` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REL_TREINAMENTO`),
  KEY `idx_rel_trein_data` (`DATA_TREINAMENTO`),
  KEY `idx_rel_trein_condutor` (`CONDUTOR_ID`),
  KEY `idx_rel_trein_cao` (`CACHORRO_ID`),
  KEY `idx_rel_trein_unit` (`UNIDADE_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RELATORIOS_TREINAMENTO_CANIL' AND COLUMN_NAME = 'CACHORROS_JSON'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `RELATORIOS_TREINAMENTO_CANIL` ADD COLUMN `CACHORROS_JSON` LONGTEXT DEFAULT NULL AFTER `CACHORRO_MICROCHIP`',
  'SELECT "Coluna RELATORIOS_TREINAMENTO_CANIL.CACHORROS_JSON já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- 5. TABELA RELATORIOS_OPERACOES_CANIL: Relatórios de Operações (COC / K9)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `RELATORIOS_OPERACOES_CANIL` (
  `ID_REL_OPERACAO` VARCHAR(64) NOT NULL,
  `DATA_OPERACAO` VARCHAR(10) NOT NULL,
  `HORA_OPERACAO` VARCHAR(5) NOT NULL DEFAULT '06:00',
  `COMARCA` VARCHAR(160) NOT NULL COMMENT 'Município de Minas Gerais',
  `SOLICITACAO_TIPO` ENUM('CEPOLC', 'SEI', 'Outros') NOT NULL DEFAULT 'CEPOLC',
  `SOLICITACAO_OUTROS_DETALHES` VARCHAR(255) DEFAULT NULL,
  `MATERIAL_ENCONTRADO` TINYINT(1) NOT NULL DEFAULT 0,
  `MATERIAIS_ENCONTRADOS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Lista JSON de materiais (Droga, Arma, Munição, Explosivos) e animais responsáveis',
  `OPERADORES_JSON` LONGTEXT NOT NULL COMMENT 'Lista JSON de operadores caninos participantes e seus cães',
  `VIATURAS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Lista JSON das viaturas utilizadas na operação (id, placa, descricao)',
  `DETALHAMENTO` TEXT NOT NULL COMMENT 'Detalhamento da operação (até 1000 caracteres)',
  `CRIADOR_ID` VARCHAR(64) NOT NULL,
  `CRIADOR_NOME` VARCHAR(255) NOT NULL,
  `CRIADOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `CRIADOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REL_OPERACAO`),
  KEY `idx_rel_op_data` (`DATA_OPERACAO`),
  KEY `idx_rel_op_comarca` (`COMARCA`),
  KEY `idx_rel_op_criador` (`CRIADOR_ID`),
  KEY `idx_rel_op_unit` (`UNIDADE_ID`),
  KEY `idx_rel_op_criacao` (`DATA_CRIACAO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Caso a tabela RELATORIOS_OPERACOES_CANIL já existisse sem a coluna VIATURAS_JSON:
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RELATORIOS_OPERACOES_CANIL' AND COLUMN_NAME = 'VIATURAS_JSON'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_CANIL` ADD COLUMN `VIATURAS_JSON` LONGTEXT DEFAULT NULL AFTER `OPERADORES_JSON`',
  'SELECT "Coluna RELATORIOS_OPERACOES_CANIL.VIATURAS_JSON já existe."'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- FIM DA MIGRAÇÃO DO MÓDULO RELATÓRIOS
-- ============================================================================
SELECT 'Migração do Módulo Relatórios (Treinamento, Operações e Viaturas) concluída com sucesso!' AS STATUS;
