-- ====================================================================
-- SCRIPT DE ATUALIZAÇÃO DO BANCO DE DADOS (MYSQL / MARIADB)
-- SISTEMA ARMERIA - MÓDULO ARMAS
-- FUNCIONALIDADE: CONTROLE DE MANUTENÇÃO NA UNIDADE OU FORA DELA (ARMEIRO EXTERNO)
-- E RETORNO / RECEBIMENTO PARA O COFRE DE ORIGEM
-- ====================================================================

USE `u552818109_Armeriadb`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Modificar a coluna 'status' da tabela 'armas' para VARCHAR(64),
-- permitindo armazenar 'EM MANUTENÇÃO', 'No Cofre', 'Em Trânsito', etc.
ALTER TABLE `armas` 
MODIFY COLUMN `status` VARCHAR(64) NOT NULL DEFAULT 'No Cofre';

-- 2. Adicionar novas colunas na tabela 'armas' para registrar se a manutenção é na unidade ou fora,
-- dados do armeiro/oficina externa, motivo e data de envio.
SET @dbname = DATABASE();
SET @tablename = "armas";

-- tipo_manutencao ('UNIDADE' ou 'FORA_DA_UNIDADE')
SET @col = "tipo_manutencao";
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0,
  "SELECT 1",
  "ALTER TABLE `armas` ADD COLUMN `tipo_manutencao` VARCHAR(32) DEFAULT NULL AFTER `responsavel_ultima_manutencao`;"
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- local_manutencao (Nome do armeiro externo ou oficina)
SET @col = "local_manutencao";
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0,
  "SELECT 1",
  "ALTER TABLE `armas` ADD COLUMN `local_manutencao` VARCHAR(255) DEFAULT NULL AFTER `tipo_manutencao`;"
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- motivo_manutencao (Motivo / Descrição da manutenção)
SET @col = "motivo_manutencao";
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0,
  "SELECT 1",
  "ALTER TABLE `armas` ADD COLUMN `motivo_manutencao` TEXT DEFAULT NULL AFTER `local_manutencao`;"
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- data_envio_manutencao (Data em que foi encaminhada para manutenção fora da unidade)
SET @col = "data_envio_manutencao";
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename AND COLUMN_NAME = @col) > 0,
  "SELECT 1",
  "ALTER TABLE `armas` ADD COLUMN `data_envio_manutencao` DATE DEFAULT NULL AFTER `motivo_manutencao`;"
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Atualizar a View 'weapons' para refletir os novos campos e status
CREATE OR REPLACE VIEW `weapons` AS 
SELECT 
    id, 
    tipo AS type, 
    numero_serie AS serial_number, 
    fabricante AS manufacturer, 
    modelo AS model, 
    calibre, 
    quantidade_carregadores AS magazine_quantity, 
    status, 
    departamento_id AS department_id, 
    unidade_id AS unit_id, 
    cofre_id AS vault_space_id, 
    observacao_localizacao AS location_note, 
    data_ultima_manutencao AS last_maintenance_date, 
    responsavel_ultima_manutencao AS last_maintenance_responsible,
    tipo_manutencao AS maintenance_location_type,
    local_manutencao AS maintenance_location,
    motivo_manutencao AS maintenance_reason,
    data_envio_manutencao AS maintenance_sent_date,
    data_criacao AS created_at 
FROM `armas`;

-- 4. Criar tabela de histórico de manutenções de armas (para auditoria completa de envio e retorno)
CREATE TABLE IF NOT EXISTS `historico_manutencao_armas` (
    `id` VARCHAR(64) NOT NULL PRIMARY KEY,
    `arma_id` VARCHAR(64) NOT NULL,
    `numero_serie` VARCHAR(128) NOT NULL,
    `tipo_manutencao` VARCHAR(32) NOT NULL COMMENT 'UNIDADE ou FORA_DA_UNIDADE',
    `local_manutencao` VARCHAR(255) DEFAULT NULL COMMENT 'Nome da oficina ou armeiro externo',
    `motivo` TEXT DEFAULT NULL,
    `data_envio` DATE NOT NULL,
    `responsavel_envio` VARCHAR(255) NOT NULL,
    `data_retorno` DATE DEFAULT NULL,
    `responsavel_retorno` VARCHAR(255) DEFAULT NULL,
    `laudo_retorno` TEXT DEFAULT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'EM_ANDAMENTO' COMMENT 'EM_ANDAMENTO ou CONCLUIDA',
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_hist_manut_arma` (`arma_id`),
    KEY `idx_hist_manut_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Tabela armas, view weapons e tabela de historico de manutencoes atualizadas com sucesso!' AS Resultado;
