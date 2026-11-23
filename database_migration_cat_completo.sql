-- ============================================================================
-- SCRIPT SQL COMPLETO: UNIDADE CAT (UNIDADES/DEPTOS, USUÁRIOS E OPERAÇÕES CAT)
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Migração 100% idempotente (segura para executar em bancos novos ou existentes).
-- Contempla:
--   1) Módulo Unidades/Deptos: tabela AERONAVES_UNIDADE (exclusiva CAT)
--   2) Módulo Usuários: colunas CAT_FUNCAO_USUARIOS e CAT_AERONAVES_JSON em USUARIOS
--   3) Módulo Relatórios (CAT): tabela RELATORIOS_OPERACOES_CAT
-- NÃO altera nenhuma tabela ou estrutura da unidade COC / Canil K9.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MÓDULO UNIDADES/DEPTOS — TABELA DE AERONAVES DA UNIDADE CAT
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. MÓDULO USUÁRIOS — FUNÇÃO NA CAT E AERONAVES HABILITADAS/VINCULADAS
-- ----------------------------------------------------------------------------

-- 2A. Coluna CAT_FUNCAO_USUARIOS ('Piloto', 'Copiloto', 'Operador Aerotático')
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
  'SELECT ''Coluna CAT_FUNCAO_USUARIOS já existe em USUARIOS'' AS status'
);
PREPARE stmt_add_cat_funcao FROM @sql_add_cat_funcao;
EXECUTE stmt_add_cat_funcao;
DEALLOCATE PREPARE stmt_add_cat_funcao;

-- 2B. Coluna CAT_AERONAVES_JSON (Array JSON com os IDs das aeronaves vinculadas ao policial da CAT)
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
  'SELECT ''Coluna CAT_AERONAVES_JSON já existe em USUARIOS'' AS status'
);
PREPARE stmt_add_cat_aeronaves FROM @sql_add_cat_aeronaves;
EXECUTE stmt_add_cat_aeronaves;
DEALLOCATE PREPARE stmt_add_cat_aeronaves;

-- ----------------------------------------------------------------------------
-- 3. MÓDULO RELATÓRIOS — RELATÓRIO DE OPERAÇÕES DA UNIDADE CAT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `RELATORIOS_OPERACOES_CAT` (
  `ID_REL_OP_CAT` VARCHAR(64) NOT NULL,
  `COM_EMPREGO_AERONAVE` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = Com emprego de aeronave, 0 = Sem emprego de aeronave',
  `DATA_SAIDA_BASE` VARCHAR(10) NOT NULL COMMENT 'YYYY-MM-DD',
  `DATA_OPERACAO` VARCHAR(10) NOT NULL COMMENT 'YYYY-MM-DD',
  `HORARIO_DECOLAGEM` VARCHAR(5) NOT NULL DEFAULT '06:00' COMMENT 'HH:mm',
  `HORARIO_VOO_OPERACAO` VARCHAR(5) NOT NULL DEFAULT '06:00' COMMENT 'HH:mm',
  `ESTADO_OPERACAO` VARCHAR(2) NOT NULL DEFAULT 'MG',
  `MUNICIPIO_OPERACAO` VARCHAR(160) NOT NULL,
  `APENAS_UM_MUNICIPIO` TINYINT(1) NOT NULL DEFAULT 1,
  `OUTROS_MUNICIPIOS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de { uf, municipio }',
  `AERONAVES_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de aeronaves com piloto, copiloto e horasVoo individuais',
  `HORAS_TOTAIS_VOO` VARCHAR(16) NOT NULL DEFAULT '00:00' COMMENT 'Somatório HH:mm das horas de voo',
  `VIATURAS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de viaturas com operadores embarcados e tipoApoio',
  `TIPO_VOO` VARCHAR(64) DEFAULT NULL COMMENT 'APOIO OPERACIONAL | APOIO EXTRAORDINÁRIO | TRANSPORTE DE AUTORIDADES | OUTROS TIPOS',
  `TIPO_VOO_OUTROS_DESC` VARCHAR(200) DEFAULT NULL,
  `TEVE_TRIPULANTE_OPERACIONAL` TINYINT(1) NOT NULL DEFAULT 0,
  `QTD_TRIPULANTES_OPERACIONAIS` INT NOT NULL DEFAULT 0,
  `TRIPULANTES_OPERACIONAIS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de tripulantes operacionais da CAT',
  `TEVE_TRIPULANTE_OUTRA_UNIDADE` TINYINT(1) NOT NULL DEFAULT 0,
  `TRIPULANTES_OUTRA_UNIDADE_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de tripulantes de outras unidades do COE',
  `TEVE_EQUIPE_SOLO` TINYINT(1) NOT NULL DEFAULT 0,
  `EQUIPE_SOLO_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de operadores em solo com operacaoSolo e apoioLogisticoDescricao',
  `TEVE_EMBARCADO_EXTERNO` TINYINT(1) NOT NULL DEFAULT 0,
  `EMBARCADOS_EXTERNOS_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de embarcados externos (COE, outro depto/unidade ou fora do sistema)',
  `TRIPULANTES_DESEMBARCARAM` TINYINT(1) NOT NULL DEFAULT 0,
  `PARTICIPOU_CAPTURA_LOCALIZACAO` TINYINT(1) NOT NULL DEFAULT 0,
  `CAPTURAS_LOCALIZACOES_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de { tipo, quantidade, detalhes }',
  `TEVE_DISPAROS_CAT` TINYINT(1) NOT NULL DEFAULT 0,
  `DISPAROS_CAT_JSON` LONGTEXT DEFAULT NULL COMMENT 'Array JSON de armas (acervo ou fora do acervo) e quantidadeTiros',
  `SINOPSE_VOO` TEXT NOT NULL COMMENT 'Sinopse do voo/operação (máx 1000 caracteres)',
  `OPERADORES_JSON` LONGTEXT NOT NULL COMMENT 'Lista consolidada de operadores do sistema para controle de assinaturas eletrônicas',
  `CRIADOR_ID` VARCHAR(64) NOT NULL,
  `CRIADOR_NOME` VARCHAR(255) NOT NULL,
  `CRIADOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `CRIADOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REL_OP_CAT`),
  KEY `idx_rel_op_cat_data` (`DATA_OPERACAO`),
  KEY `idx_rel_op_cat_criador` (`CRIADOR_ID`),
  KEY `idx_rel_op_cat_unit` (`UNIDADE_ID`),
  KEY `idx_rel_op_cat_dept` (`DEPARTAMENTO_ID`),
  KEY `idx_rel_op_cat_criacao` (`DATA_CRIACAO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
