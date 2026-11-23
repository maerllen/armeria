-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO: RELATÓRIO DE OPERAÇÕES POLICIAL (SINOPSE) + VIATURAS
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Migração idempotente (segura para rodar em bancos novos ou existentes).
-- NÃO altera nenhuma tabela ou dado da unidade COC / Operador Canino.
-- ============================================================================

-- 1. Garante a tabela VIATURAS_UNIDADE (cadastro por Administrador vinculado à unidade)
CREATE TABLE IF NOT EXISTS `VIATURAS_UNIDADE` (
  `ID_VIATURA` VARCHAR(64) NOT NULL,
  `PLACA_VIATURA` VARCHAR(8) NOT NULL,
  `DESCRICAO_VIATURA` VARCHAR(160) NOT NULL,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) NOT NULL,
  `CRIADO_POR_ID` VARCHAR(64) DEFAULT NULL,
  `CRIADO_POR_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_VIATURA`),
  UNIQUE KEY `uk_viatura_placa_unidade` (`PLACA_VIATURA`, `UNIDADE_ID`),
  KEY `idx_viatura_unidade` (`UNIDADE_ID`),
  KEY `idx_viatura_dept` (`DEPARTAMENTO_ID`),
  KEY `idx_viatura_placa` (`PLACA_VIATURA`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Garante a tabela REGISTROS_TIROS_ARMAS (registro automático de disparos em armas do acervo)
CREATE TABLE IF NOT EXISTS `REGISTROS_TIROS_ARMAS` (
  `ID_REGISTROS_TIROS` VARCHAR(64) NOT NULL,
  `ARMA_ID` VARCHAR(64) NOT NULL,
  `NUMERO_SERIE` VARCHAR(128) NOT NULL,
  `QUANTIDADE_TIROS` INT NOT NULL DEFAULT 0,
  `MOTIVO` VARCHAR(255) DEFAULT NULL,
  `POLICIAL_NOME` VARCHAR(255) DEFAULT NULL,
  `POLICIAL_MASP` VARCHAR(64) DEFAULT NULL,
  `TOTAL_TIROS_APOS` INT NOT NULL DEFAULT 0,
  `DATA_REGISTRO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REGISTROS_TIROS`),
  KEY `idx_reg_tiros_arma` (`ARMA_ID`),
  KEY `idx_reg_tiros_serie` (`NUMERO_SERIE`),
  KEY `idx_reg_tiros_data` (`DATA_REGISTRO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabela principal: RELATORIOS_OPERACOES_POLICIAL (Sinopse de Operação — Unidades não-COC)
CREATE TABLE IF NOT EXISTS `RELATORIOS_OPERACOES_POLICIAL` (
  `ID_REL_OP_POL` VARCHAR(64) NOT NULL,
  `DATA_OPERACAO` VARCHAR(10) NOT NULL COMMENT 'Data da operação no formato YYYY-MM-DD',
  `HORA_SAIDA_BASE` VARCHAR(5) NOT NULL DEFAULT '06:00' COMMENT 'Horário de saída da base (HH:mm)',
  `HORA_OPERACAO` VARCHAR(5) NOT NULL DEFAULT '06:00' COMMENT 'Horário da operação (HH:mm)',
  `ESTADO_OPERACAO` VARCHAR(2) NOT NULL DEFAULT 'MG' COMMENT 'UF principal da operação',
  `MUNICIPIO_OPERACAO` VARCHAR(160) NOT NULL COMMENT 'Município principal da operação',
  `APENAS_UM_MUNICIPIO` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = Sim, 0 = Não (teve outros municípios)',
  `OUTROS_MUNICIPIOS_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com [{uf, municipio}] adicionais sem repetição',
  `VIATURAS_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com [{id, placa, descricao}] usadas na operação',
  `OPERADORES_JSON` LONGTEXT NOT NULL COMMENT 'JSON com operadores e assinaturas eletrônicas (auto-assinado após 30 dias)',
  `ACIONAMENTO_VIA` ENUM('CEPOLC', 'CHEFIA', 'SEI', 'OUTROS') NOT NULL DEFAULT 'CEPOLC',
  `ACIONAMENTO_OUTROS_DESC` VARCHAR(250) DEFAULT NULL COMMENT 'Descrição quando acionamento = OUTROS (máx 250 chars)',
  `TIPO_ATENDIMENTO` ENUM('Operação prevista', 'Operação extraordinária', 'Emergencial') NOT NULL DEFAULT 'Operação prevista',
  `DEPARTAMENTOS_APOIO_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com array de departamentos de apoio selecionados',
  `DESCRICAO_APOIO` VARCHAR(250) DEFAULT NULL COMMENT 'Descrição do apoio em Operação extraordinária (máx 250 chars)',
  `DESCRICAO_EMERGENCIA` VARCHAR(250) DEFAULT NULL COMMENT 'Descrição da emergência (máx 250 chars)',
  `SINOPSE` TEXT NOT NULL COMMENT 'Sinopse da operação (máx 1000 caracteres)',
  `DETALHES_ADICIONAIS_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com Mandado de Prisão, Mandado de Busca e Gerenciamento de Crise',
  `UTILIZOU_ARMA` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Sim (utilizou arma de fogo ou incapacitação elétrica)',
  `UTILIZOU_ARMA_FOGO` TINYINT(1) NOT NULL DEFAULT 0,
  `ARMAS_FOGO_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com armas de fogo (ACERVO ou FORA_DO_ACERVO) e quantidade de tiros',
  `UTILIZOU_ARMA_ELETRICA` TINYINT(1) NOT NULL DEFAULT 0,
  `ARMAS_ELETRICAS_JSON` LONGTEXT DEFAULT NULL COMMENT 'JSON com armas de incapacitação elétrica selecionadas da unidade',
  `HOUVE_OBITO` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Sim (óbito no atendimento ou em decorrência dele)',
  `SINOPSE_OBITO` TEXT DEFAULT NULL COMMENT 'Sinopse sobre o momento do óbito (máx 600 caracteres)',
  `CRIADOR_ID` VARCHAR(64) NOT NULL,
  `CRIADOR_NOME` VARCHAR(255) NOT NULL,
  `CRIADOR_MASP` VARCHAR(32) NOT NULL DEFAULT '',
  `CRIADOR_CARGO` VARCHAR(128) DEFAULT NULL,
  `DEPARTAMENTO_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_ID` VARCHAR(64) DEFAULT NULL,
  `UNIDADE_NOME` VARCHAR(255) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DATA_ATUALIZACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REL_OP_POL`),
  KEY `idx_rel_op_pol_data` (`DATA_OPERACAO`),
  KEY `idx_rel_op_pol_criador` (`CRIADOR_ID`),
  KEY `idx_rel_op_pol_unit` (`UNIDADE_ID`),
  KEY `idx_rel_op_pol_dept` (`DEPARTAMENTO_ID`),
  KEY `idx_rel_op_pol_tipo` (`TIPO_ATENDIMENTO`),
  KEY `idx_rel_op_pol_obito` (`HOUVE_OBITO`),
  KEY `idx_rel_op_pol_criacao` (`DATA_CRIACAO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Garante que ARMAS possui a coluna TIROS_DISPARADOS_ARMAS (caso banco antigo)
SET @db_name = DATABASE();

SET @col_tiros := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'ARMAS'
    AND COLUMN_NAME = 'TIROS_DISPARADOS_ARMAS'
);
SET @sql_stmt := IF(
  @col_tiros = 0,
  'ALTER TABLE `ARMAS` ADD COLUMN `TIROS_DISPARADOS_ARMAS` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- FIM DO SCRIPT DE ATUALIZAÇÃO
-- ============================================================================
