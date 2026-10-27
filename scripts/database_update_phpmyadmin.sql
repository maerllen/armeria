-- ==============================================================================
-- SISARM - SISTEMA INTEGRADO DE GESTÃO DE ARMAMENTOS E MUNIÇÕES
-- SCRIPT DE ATUALIZAÇÃO / INSTALAÇÃO PARA PHPMYADMIN (MariaDB / MySQL)
-- ==============================================================================
-- Padrão do banco:
-- - Nomenclatura das tabelas em MAIÚSCULAS no plural
-- - Sufixo/prefixo padronizado por entidade
-- - CHARSET: utf8mb4 / COLLATION: utf8mb4_unicode_ci
-- - ENGINE: InnoDB
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. ATUALIZAÇÃO DA TABELA `ARMAS`
-- Adiciona o controle de contagem de tiros e vaga anterior no cofre
-- Atualiza o ENUM de STATUS para incluir 'Manutenção'
-- ------------------------------------------------------------------------------
ALTER TABLE `ARMAS` 
  MODIFY COLUMN `STATUS_ARMAS` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo', 'Em Sala de Aula') NOT NULL DEFAULT 'No Cofre';

ALTER TABLE `ARMAS` 
  ADD COLUMN IF NOT EXISTS `TIROS_DISPARADOS_ARMAS` INT(11) NOT NULL DEFAULT 0 AFTER `DATA_CRIACAO_ARMAS`,
  ADD COLUMN IF NOT EXISTS `LOCAL_ANTERIOR_COFRE_ID_ARMAS` VARCHAR(64) DEFAULT NULL AFTER `TIROS_DISPARADOS_ARMAS`;

-- ------------------------------------------------------------------------------
-- 2. TABELA DE MANUTENÇÕES DE ARMAS (`MANUTENCOES_ARMAS`)
-- Registra manutenções internas (na unidade) e externas (armerias especializadas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `MANUTENCOES_ARMAS` (
  `ID_MANUTENCOES_ARMAS` VARCHAR(64) NOT NULL,
  `ARMA_ID_MANUTENCOES_ARMAS` VARCHAR(64) NOT NULL,
  `NUMERO_SERIE_ARMAS` VARCHAR(64) NOT NULL,
  `TIPO_MANUTENCAO` ENUM('Interna', 'Externa') NOT NULL DEFAULT 'Interna',
  `DATA_ENVIO` DATETIME NOT NULL,
  `ARMEIRO_ENVIO_ID` VARCHAR(64) DEFAULT NULL,
  `ARMEIRO_ENVIO_NOME` VARCHAR(255) NOT NULL,
  `DESCRICAO_ENVIO` TEXT NOT NULL,
  `TIROS_NO_MOMENTO` INT(11) NOT NULL DEFAULT 0,
  `STATUS_MANUTENCAO` ENUM('EM_ANDAMENTO', 'CONCLUIDA') NOT NULL DEFAULT 'EM_ANDAMENTO',
  
  -- Campos para Manutenção Externa (endereço e oficina)
  `ARMERIA_NOME` VARCHAR(255) DEFAULT NULL,
  `ARMERIA_CEP` VARCHAR(16) DEFAULT NULL,
  `ARMERIA_LOGRADOURO` VARCHAR(255) DEFAULT NULL,
  `ARMERIA_NUMERO` VARCHAR(32) DEFAULT NULL,
  `ARMERIA_COMPLEMENTO` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_BAIRRO` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_CIDADE` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_ESTADO` VARCHAR(8) DEFAULT NULL,
  
  -- Campos de Recebimento da Manutenção
  `DATA_RETORNO` DATETIME DEFAULT NULL,
  `ARMEIRO_RETORNO_ID` VARCHAR(64) DEFAULT NULL,
  `ARMEIRO_RETORNO_NOME` VARCHAR(255) DEFAULT NULL,
  `DESCRICAO_RETORNO` TEXT DEFAULT NULL,
  `COFRE_ORIGINAL_ID` VARCHAR(64) DEFAULT NULL,
  
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_MANUTENCOES_ARMAS`),
  KEY `idx_manut_arma` (`ARMA_ID_MANUTENCOES_ARMAS`),
  KEY `idx_manut_status` (`STATUS_MANUTENCAO`),
  KEY `idx_manut_serie` (`NUMERO_SERIE_ARMAS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. TABELA DE ARMERIAS EXTERNAS (`ARMERIAS_EXTERNAS`)
-- Cadastro persistente de oficinas para autocomplete rápido e histórico
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ARMERIAS_EXTERNAS` (
  `ID_ARMERIAS_EXTERNAS` VARCHAR(64) NOT NULL,
  `NOME` VARCHAR(255) NOT NULL,
  `CEP` VARCHAR(16) DEFAULT NULL,
  `LOGRADOURO` VARCHAR(255) DEFAULT NULL,
  `NUMERO` VARCHAR(32) DEFAULT NULL,
  `COMPLEMENTO` VARCHAR(128) DEFAULT NULL,
  `BAIRRO` VARCHAR(128) DEFAULT NULL,
  `CIDADE` VARCHAR(128) DEFAULT NULL,
  `ESTADO` VARCHAR(8) DEFAULT NULL,
  `TELEFONE` VARCHAR(32) DEFAULT NULL,
  `CONTATO` VARCHAR(128) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_ARMERIAS_EXTERNAS`),
  KEY `idx_armeria_nome` (`NOME`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. TABELA DE REGISTRO DE DISPAROS / TIROS (`REGISTROS_TIROS_ARMAS`)
-- Registra cada lote de disparos efetuados em treinamento/estande por policial
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `REGISTROS_TIROS_ARMAS` (
  `ID_REGISTROS_TIROS` VARCHAR(64) NOT NULL,
  `ARMA_ID` VARCHAR(64) NOT NULL,
  `NUMERO_SERIE` VARCHAR(64) NOT NULL,
  `QUANTIDADE_TIROS` INT(11) NOT NULL,
  `MOTIVO` VARCHAR(128) NOT NULL DEFAULT 'Treinamento',
  `POLICIAL_NOME` VARCHAR(255) NOT NULL,
  `POLICIAL_MASP` VARCHAR(64) DEFAULT NULL,
  `TOTAL_TIROS_APOS` INT(11) NOT NULL DEFAULT 0,
  `DATA_REGISTRO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_REGISTROS_TIROS`),
  KEY `idx_tiros_arma` (`ARMA_ID`),
  KEY `idx_tiros_data` (`DATA_REGISTRO`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. ATUALIZAÇÃO DA TABELA `MOVIMENTACOES_MUNICOES`
-- Garante campos para o policial responsável pela movimentação direta no cofre
-- ------------------------------------------------------------------------------
ALTER TABLE `MOVIMENTACOES_MUNICOES`
  ADD COLUMN IF NOT EXISTS `RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES` VARCHAR(255) DEFAULT NULL AFTER `TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES`,
  ADD COLUMN IF NOT EXISTS `RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES` VARCHAR(64) DEFAULT NULL AFTER `RESPONSAVEL_NOME_MOVIMENTACOES_MUNICOES`,
  ADD COLUMN IF NOT EXISTS `RESPONSAVEL_USUARIO_ID_MOVIMENTACOES_MUNICOES` VARCHAR(64) DEFAULT NULL AFTER `RESPONSAVEL_MASP_MOVIMENTACOES_MUNICOES`;

-- ------------------------------------------------------------------------------
-- 6. ATUALIZAÇÃO DA VIEW `weapons`
-- Compatibilidade com a API TypeScript e aplicação React
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `weapons` AS 
SELECT 
  `ARMAS`.`ID_ARMAS` AS `id`,
  `ARMAS`.`TIPO_ARMAS` AS `type`,
  `ARMAS`.`TIPO_ARMAS` AS `tipo`,
  `ARMAS`.`NUMERO_SERIE_ARMAS` AS `serial_number`,
  `ARMAS`.`NUMERO_SERIE_ARMAS` AS `numero_serie`,
  `ARMAS`.`FABRICANTE_ARMAS` AS `manufacturer`,
  `ARMAS`.`FABRICANTE_ARMAS` AS `fabricante`,
  `ARMAS`.`MODELO_ARMAS` AS `model`,
  `ARMAS`.`MODELO_ARMAS` AS `modelo`,
  `ARMAS`.`CALIBRE_ARMAS` AS `caliber`,
  `ARMAS`.`CALIBRE_ARMAS` AS `calibre`,
  `ARMAS`.`QUANTIDADE_CARREGADORES_ARMAS` AS `magazine_quantity`,
  `ARMAS`.`QUANTIDADE_CARREGADORES_ARMAS` AS `quantidade_carregadores`,
  `ARMAS`.`STATUS_ARMAS` AS `status`,
  `ARMAS`.`DEPARTAMENTO_ID_ARMAS` AS `department_id`,
  `ARMAS`.`DEPARTAMENTO_ID_ARMAS` AS `departamento_id`,
  `ARMAS`.`UNIDADE_ID_ARMAS` AS `unit_id`,
  `ARMAS`.`UNIDADE_ID_ARMAS` AS `unidade_id`,
  `ARMAS`.`COFRE_ID_ARMAS` AS `vault_space_id`,
  `ARMAS`.`COFRE_ID_ARMAS` AS `cofre_id`,
  `ARMAS`.`OBSERVACAO_LOCALIZACAO_ARMAS` AS `location_note`,
  `ARMAS`.`OBSERVACAO_LOCALIZACAO_ARMAS` AS `observacao_localizacao`,
  `ARMAS`.`DATA_ULTIMA_MANUTENCAO_ARMAS` AS `last_maintenance_date`,
  `ARMAS`.`DATA_ULTIMA_MANUTENCAO_ARMAS` AS `data_ultima_manutencao`,
  `ARMAS`.`RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS` AS `last_maintenance_responsible`,
  `ARMAS`.`RESPONSAVEL_ULTIMA_MANUTENCAO_ARMAS` AS `responsavel_ultima_manutencao`,
  `ARMAS`.`TIROS_DISPARADOS_ARMAS` AS `shot_count`,
  `ARMAS`.`TIROS_DISPARADOS_ARMAS` AS `tiros_disparados`,
  `ARMAS`.`LOCAL_ANTERIOR_COFRE_ID_ARMAS` AS `previous_vault_space_id`,
  `ARMAS`.`LOCAL_ANTERIOR_COFRE_ID_ARMAS` AS `local_anterior_cofre_id`,
  `ARMAS`.`DATA_CRIACAO_ARMAS` AS `created_at`,
  `ARMAS`.`DATA_CRIACAO_ARMAS` AS `data_criacao` 
FROM `ARMAS`;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- FIM DO SCRIPT
-- ==============================================================================
