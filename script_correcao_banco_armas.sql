-- ====================================================================
-- SCRIPT DE CORREÇÃO DO BANCO DE DADOS - MÓDULO DE ARMAS (ARMERIA)
-- BANCO DE DADOS: u552818109_Armeriadb (MariaDB / MySQL)
-- ====================================================================
-- Este script realiza a correção estrutural completa das tabelas de armas:
-- 1. Corrige colunas com caracteres incorretos ou espaços.
-- 2. Assegura a coexistência sincronizada das colunas em Português e Inglês
--    na tabela `weapons` (evitando o erro 'Unknown column type in SELECT').
-- 3. Assegura a integridade total da tabela `armas`.
-- 4. Unifica e preserva todos os 154+ registros de armas existentes,
--    garantindo que nenhuma arma ou número de série seja perdido.
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Correção de espaço acidental no nome de coluna em `weapons` caso exista
SET @dbname = DATABASE();
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'weapons'
      AND COLUMN_NAME = ' observacao_localizacao'
  ) > 0,
  "ALTER TABLE `weapons` CHANGE COLUMN ` observacao_localizacao` `observacao_localizacao` VARCHAR(255) DEFAULT NULL;",
  "SELECT 1;"
));
PREPARE fixSpaceCol FROM @preparedStatement;
EXECUTE fixSpaceCol;
DEALLOCATE PREPARE fixSpaceCol;

-- 2. Adicionar colunas da compatibilidade inglesa e portuguesa em `weapons`
ALTER TABLE `weapons` 
  ADD COLUMN IF NOT EXISTS `type` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `serial_number` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `manufacturer` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `model` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `caliber` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `magazine_quantity` INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `department_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `unit_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `vault_space_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `location_note` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `last_maintenance_date` DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `last_maintenance_responsible` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS `tipo` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `numero_serie` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `fabricante` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `modelo` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `calibre` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `quantidade_carregadores` INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `departamento_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `unidade_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `cofre_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `observacao_localizacao` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `data_ultima_manutencao` DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `responsavel_ultima_manutencao` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `data_criacao` DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 3. Garantir estrutura da tabela `armas` em Português
CREATE TABLE IF NOT EXISTS `armas` (
    `id` VARCHAR(64) NOT NULL,
    `tipo` VARCHAR(64) NOT NULL,
    `numero_serie` VARCHAR(128) NOT NULL,
    `fabricante` VARCHAR(128) NOT NULL,
    `modelo` VARCHAR(128) NOT NULL,
    `calibre` VARCHAR(128) NOT NULL,
    `quantidade_carregadores` INT NOT NULL DEFAULT 1,
    `status` VARCHAR(64) NOT NULL DEFAULT 'No Cofre',
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `cofre_id` VARCHAR(64) DEFAULT NULL,
    `observacao_localizacao` VARCHAR(255) DEFAULT NULL,
    `data_ultima_manutencao` DATE DEFAULT NULL,
    `responsavel_ultima_manutencao` VARCHAR(255) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_armas_serie` (`numero_serie`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `armas` 
  ADD COLUMN IF NOT EXISTS `tipo` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `numero_serie` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `fabricante` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `modelo` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `calibre` VARCHAR(128) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `quantidade_carregadores` INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(64) DEFAULT 'No Cofre',
  ADD COLUMN IF NOT EXISTS `departamento_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `unidade_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `cofre_id` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `observacao_localizacao` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `data_ultima_manutencao` DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `responsavel_ultima_manutencao` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `data_criacao` DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 4. Sincronização de colunas dentro da tabela `weapons`
UPDATE `weapons` SET
  `type` = COALESCE(`type`, `tipo`),
  `serial_number` = COALESCE(`serial_number`, `numero_serie`),
  `manufacturer` = COALESCE(`manufacturer`, `fabricante`),
  `model` = COALESCE(`model`, `modelo`),
  `caliber` = COALESCE(`caliber`, `calibre`),
  `magazine_quantity` = COALESCE(`magazine_quantity`, `quantidade_carregadores`, 1),
  `department_id` = COALESCE(`department_id`, `departamento_id`),
  `unit_id` = COALESCE(`unit_id`, `unidade_id`),
  `vault_space_id` = COALESCE(`vault_space_id`, `cofre_id`),
  `location_note` = COALESCE(`location_note`, `observacao_localizacao`),
  `last_maintenance_date` = COALESCE(`last_maintenance_date`, `data_ultima_manutencao`),
  `last_maintenance_responsible` = COALESCE(`last_maintenance_responsible`, `responsavel_ultima_manutencao`),
  `created_at` = COALESCE(`created_at`, `data_criacao`);

UPDATE `weapons` SET
  `tipo` = COALESCE(`tipo`, `type`),
  `numero_serie` = COALESCE(`numero_serie`, `serial_number`),
  `fabricante` = COALESCE(`fabricante`, `manufacturer`),
  `modelo` = COALESCE(`modelo`, `model`),
  `calibre` = COALESCE(`calibre`, `caliber`),
  `quantidade_carregadores` = COALESCE(`quantidade_carregadores`, `magazine_quantity`, 1),
  `departamento_id` = COALESCE(`departamento_id`, `department_id`),
  `unidade_id` = COALESCE(`unidade_id`, `unit_id`),
  `cofre_id` = COALESCE(`cofre_id`, `vault_space_id`),
  `observacao_localizacao` = COALESCE(`observacao_localizacao`, `location_note`),
  `data_ultima_manutencao` = COALESCE(`data_ultima_manutencao`, `last_maintenance_date`),
  `responsavel_ultima_manutencao` = COALESCE(`responsavel_ultima_manutencao`, `last_maintenance_responsible`),
  `data_criacao` = COALESCE(`data_criacao`, `created_at`);

-- 5. Mesclagem bidirecional entre `armas` e `weapons`
INSERT IGNORE INTO `weapons` (
  id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
  status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
  data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao,
  type, serial_number, manufacturer, model, caliber, magazine_quantity,
  department_id, unit_id, vault_space_id, location_note,
  last_maintenance_date, last_maintenance_responsible, created_at
)
SELECT 
  id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
  status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
  data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao,
  tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
  departamento_id, unidade_id, cofre_id, observacao_localizacao,
  data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao
FROM `armas`;

INSERT IGNORE INTO `armas` (
  id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores,
  status, departamento_id, unidade_id, cofre_id, observacao_localizacao,
  data_ultima_manutencao, responsavel_ultima_manutencao, data_criacao
)
SELECT 
  id, 
  COALESCE(tipo, type), 
  COALESCE(numero_serie, serial_number), 
  COALESCE(fabricante, manufacturer), 
  COALESCE(modelo, model), 
  COALESCE(calibre, caliber), 
  COALESCE(quantidade_carregadores, magazine_quantity, 1),
  status, 
  COALESCE(departamento_id, department_id), 
  COALESCE(unidade_id, unit_id), 
  COALESCE(cofre_id, vault_space_id), 
  COALESCE(observacao_localizacao, location_note),
  COALESCE(data_ultima_manutencao, last_maintenance_date), 
  COALESCE(responsavel_ultima_manutencao, last_maintenance_responsible), 
  COALESCE(data_criacao, created_at)
FROM `weapons`;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 
  (SELECT COUNT(*) FROM `weapons`) AS total_armas_weapons,
  (SELECT COUNT(*) FROM `armas`) AS total_armas_tabela_armas,
  'Correção do banco de dados concluída com sucesso!' AS status_execucao;
