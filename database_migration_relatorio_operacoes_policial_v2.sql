-- ============================================================================
-- SCRIPT SQL DE ATUALIZAÇÃO (v2): RELATÓRIO DE OPERAÇÕES POLICIAL
-- Banco de Dados: MySQL 8.0+ / MariaDB 10.4+
-- Sistema ARMARIA - Polícia Civil de Minas Gerais
-- ============================================================================
-- Migração 100% idempotente (segura para executar em bancos novos ou existentes).
-- NÃO altera tabelas da unidade COC / Operador Canino.
--
-- Novidades suportadas por esta atualização:
--   1. Óbitos:
--        - QUANTIDADE_OBITOS (quantidade de mortos)
--        - MESMA_SINOPSE_OBITO (1 = mesma sinopse / 0 = sinopses individuais)
--        - SINOPSES_OBITOS_JSON (array JSON com N sinopses de até 600 chars cada)
--   2. DETALHES_ADICIONAIS_JSON (coluna LONGTEXT já existente) agora também
--      armazena estruturadamente:
--        - mandadoPrisao: quantidadeAlvos, quantidadePresos,
--          foragidoNoLocalChegada, quantidadeFugiram, descricaoFuga (<=500 chars)
--        - mandadoBusca: armasArrecadadas [{ tipo, quantidade }],
--          drogasArrecadadas [{ tipo, quantidade, unidade ('kg'|'t') }],
--          veiculosArrecadados [{ tipo, quantidade }]
--        - gerenciamentoCrise: suicidioConsumado (boolean),
--          atuacaoAdotada ('Negociador'|'Arma de incapacitação'|'Outros'),
--          atuacaoOutrosDescricao (<=250 chars)
-- ============================================================================

-- 1. Garante que a tabela exista (caso o script v1 ainda não tenha sido aplicado)
CREATE TABLE IF NOT EXISTS `RELATORIOS_OPERACOES_POLICIAL` (
  `ID_REL_OP_POL` VARCHAR(64) NOT NULL,
  `DATA_OPERACAO` VARCHAR(10) NOT NULL,
  `HORA_SAIDA_BASE` VARCHAR(5) NOT NULL DEFAULT '06:00',
  `HORA_OPERACAO` VARCHAR(5) NOT NULL DEFAULT '06:00',
  `ESTADO_OPERACAO` VARCHAR(2) NOT NULL DEFAULT 'MG',
  `MUNICIPIO_OPERACAO` VARCHAR(160) NOT NULL,
  `APENAS_UM_MUNICIPIO` TINYINT(1) NOT NULL DEFAULT 1,
  `OUTROS_MUNICIPIOS_JSON` LONGTEXT DEFAULT NULL,
  `VIATURAS_JSON` LONGTEXT DEFAULT NULL,
  `OPERADORES_JSON` LONGTEXT NOT NULL,
  `ACIONAMENTO_VIA` ENUM('CEPOLC', 'CHEFIA', 'SEI', 'OUTROS') NOT NULL DEFAULT 'CEPOLC',
  `ACIONAMENTO_OUTROS_DESC` VARCHAR(250) DEFAULT NULL,
  `TIPO_ATENDIMENTO` ENUM('Operação prevista', 'Operação extraordinária', 'Emergencial') NOT NULL DEFAULT 'Operação prevista',
  `DEPARTAMENTOS_APOIO_JSON` LONGTEXT DEFAULT NULL,
  `DESCRICAO_APOIO` VARCHAR(250) DEFAULT NULL,
  `DESCRICAO_EMERGENCIA` VARCHAR(250) DEFAULT NULL,
  `SINOPSE` TEXT NOT NULL,
  `DETALHES_ADICIONAIS_JSON` LONGTEXT DEFAULT NULL,
  `UTILIZOU_ARMA` TINYINT(1) NOT NULL DEFAULT 0,
  `UTILIZOU_ARMA_FOGO` TINYINT(1) NOT NULL DEFAULT 0,
  `ARMAS_FOGO_JSON` LONGTEXT DEFAULT NULL,
  `UTILIZOU_ARMA_ELETRICA` TINYINT(1) NOT NULL DEFAULT 0,
  `ARMAS_ELETRICAS_JSON` LONGTEXT DEFAULT NULL,
  `HOUVE_OBITO` TINYINT(1) NOT NULL DEFAULT 0,
  `QUANTIDADE_OBITOS` INT NOT NULL DEFAULT 0,
  `MESMA_SINOPSE_OBITO` TINYINT(1) NOT NULL DEFAULT 1,
  `SINOPSE_OBITO` TEXT DEFAULT NULL,
  `SINOPSES_OBITOS_JSON` LONGTEXT DEFAULT NULL,
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

-- 2. Adiciona QUANTIDADE_OBITOS se ainda não existir
SET @col_exists_qtd := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_POLICIAL'
    AND COLUMN_NAME = 'QUANTIDADE_OBITOS'
);
SET @sql_add_qtd := IF(
  @col_exists_qtd = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_POLICIAL` ADD COLUMN `QUANTIDADE_OBITOS` INT NOT NULL DEFAULT 0 AFTER `HOUVE_OBITO`',
  'SELECT 1'
);
PREPARE stmt_qtd FROM @sql_add_qtd;
EXECUTE stmt_qtd;
DEALLOCATE PREPARE stmt_qtd;

-- 3. Adiciona MESMA_SINOPSE_OBITO se ainda não existir
SET @col_exists_mesma := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_POLICIAL'
    AND COLUMN_NAME = 'MESMA_SINOPSE_OBITO'
);
SET @sql_add_mesma := IF(
  @col_exists_mesma = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_POLICIAL` ADD COLUMN `MESMA_SINOPSE_OBITO` TINYINT(1) NOT NULL DEFAULT 1 AFTER `QUANTIDADE_OBITOS`',
  'SELECT 1'
);
PREPARE stmt_mesma FROM @sql_add_mesma;
EXECUTE stmt_mesma;
DEALLOCATE PREPARE stmt_mesma;

-- 4. Adiciona SINOPSES_OBITOS_JSON se ainda não existir
SET @col_exists_sinopses := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'RELATORIOS_OPERACOES_POLICIAL'
    AND COLUMN_NAME = 'SINOPSES_OBITOS_JSON'
);
SET @sql_add_sinopses := IF(
  @col_exists_sinopses = 0,
  'ALTER TABLE `RELATORIOS_OPERACOES_POLICIAL` ADD COLUMN `SINOPSES_OBITOS_JSON` LONGTEXT DEFAULT NULL AFTER `SINOPSE_OBITO`',
  'SELECT 1'
);
PREPARE stmt_sinopses FROM @sql_add_sinopses;
EXECUTE stmt_sinopses;
DEALLOCATE PREPARE stmt_sinopses;

-- 5. Backfill seguro para registros antigos onde HOUVE_OBITO = 1 e QUANTIDADE_OBITOS = 0
UPDATE `RELATORIOS_OPERACOES_POLICIAL`
SET `QUANTIDADE_OBITOS` = 1,
    `MESMA_SINOPSE_OBITO` = 1
WHERE `HOUVE_OBITO` = 1
  AND (`QUANTIDADE_OBITOS` IS NULL OR `QUANTIDADE_OBITOS` = 0);
