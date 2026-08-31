-- =============================================================================
-- SISTEMA DE GESTÃO DE ARMARIA POLICIAL (PCMG)
-- SCRIPT DE ATUALIZAÇÃO SQL: TRANSFERÊNCIA DE ARMAS E PENDÊNCIA DE RECEBIMENTO
-- =============================================================================
-- Este script atualiza a estrutura da tabela `transferencias_armas` e `armas` 
-- para suportar o fluxo completo de status: 'Pendente', 'Recebido' e 'Cancelado',
-- além dos campos de auditoria de quem recebeu o armamento no cofre de destino.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. ATUALIZAÇÃO DA TABELA `armas` (Garante o status 'Pendente de Recibo')
-- -----------------------------------------------------------------------------
ALTER TABLE `armas` 
MODIFY COLUMN `status` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo', 'Em Aula') NOT NULL DEFAULT 'No Cofre';

-- -----------------------------------------------------------------------------
-- 2. CRIAÇÃO OU ATUALIZAÇÃO DA TABELA `transferencias_armas`
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transferencias_armas` (
  `id` VARCHAR(64) NOT NULL,
  `numero_protocolo` VARCHAR(64) DEFAULT NULL,
  `data_transferencia` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `origem_departamento_id` VARCHAR(64) DEFAULT NULL,
  `origem_departamento_nome` VARCHAR(255) DEFAULT NULL,
  `origem_unidade_id` VARCHAR(64) DEFAULT NULL,
  `origem_unidade_nome` VARCHAR(255) DEFAULT NULL,
  `destino_departamento_id` VARCHAR(64) DEFAULT NULL,
  `destino_departamento_nome` VARCHAR(255) DEFAULT NULL,
  `destino_unidade_id` VARCHAR(64) DEFAULT NULL,
  `destino_unidade_nome` VARCHAR(255) DEFAULT NULL,
  `destino_cofre_id` VARCHAR(64) DEFAULT NULL,
  `destino_cofre_codigo` VARCHAR(64) DEFAULT NULL,
  `responsavel_id` VARCHAR(64) NOT NULL,
  `responsavel_nome` VARCHAR(255) NOT NULL,
  `responsavel_masp` VARCHAR(32) NOT NULL,
  `responsavel_perfil` VARCHAR(64) NOT NULL,
  `transportador_nome` VARCHAR(255) NOT NULL,
  `transportador_masp` VARCHAR(32) NOT NULL,
  `transportador_cargo` VARCHAR(64) DEFAULT NULL,
  `motivo` TEXT NOT NULL,
  `armas_json` JSON NOT NULL,
  `total_armas` INT NOT NULL DEFAULT 1,
  `total_carregadores` INT NOT NULL DEFAULT 0,
  `observacao` TEXT DEFAULT NULL,
  `status` ENUM('Pendente', 'Recebido', 'Cancelado') NOT NULL DEFAULT 'Pendente',
  `recebido_em` DATETIME DEFAULT NULL,
  `recebido_por_usuario_id` VARCHAR(64) DEFAULT NULL,
  `recebido_por_nome` VARCHAR(255) DEFAULT NULL,
  `recebido_por_masp` VARCHAR(32) DEFAULT NULL,
  `recebido_por_perfil` VARCHAR(64) DEFAULT NULL,
  `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trf_origem` (`origem_unidade_id`),
  KEY `idx_trf_destino` (`destino_unidade_id`),
  KEY `idx_trf_status` (`status`),
  KEY `idx_trf_data` (`data_transferencia`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. MIGRAÇÕES SEGURAS PARA BASES QUE JÁ POSSUEM A TABELA CRIADA ANTERIORMENTE
-- -----------------------------------------------------------------------------
SET @col_status = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='status');
SET @sql_status = IF(@col_status = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `status` ENUM(\'Pendente\', \'Recebido\', \'Cancelado\') NOT NULL DEFAULT \'Pendente\' AFTER `observacao`', 'SELECT 1');
PREPARE stmt FROM @sql_status; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_recebido_em = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='recebido_em');
SET @sql_recebido_em = IF(@col_recebido_em = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `recebido_em` DATETIME DEFAULT NULL AFTER `status`', 'SELECT 1');
PREPARE stmt FROM @sql_recebido_em; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_rec_usr_id = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='recebido_por_usuario_id');
SET @sql_rec_usr_id = IF(@col_rec_usr_id = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `recebido_por_usuario_id` VARCHAR(64) DEFAULT NULL AFTER `recebido_em`', 'SELECT 1');
PREPARE stmt FROM @sql_rec_usr_id; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_rec_usr_nome = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='recebido_por_nome');
SET @sql_rec_usr_nome = IF(@col_rec_usr_nome = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `recebido_por_nome` VARCHAR(255) DEFAULT NULL AFTER `recebido_por_usuario_id`', 'SELECT 1');
PREPARE stmt FROM @sql_rec_usr_nome; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_rec_usr_masp = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='recebido_por_masp');
SET @sql_rec_usr_masp = IF(@col_rec_usr_masp = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `recebido_por_masp` VARCHAR(32) DEFAULT NULL AFTER `recebido_por_nome`', 'SELECT 1');
PREPARE stmt FROM @sql_rec_usr_masp; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_rec_usr_perfil = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='transferencias_armas' AND column_name='recebido_por_perfil');
SET @sql_rec_usr_perfil = IF(@col_rec_usr_perfil = 0, 'ALTER TABLE `transferencias_armas` ADD COLUMN `recebido_por_perfil` VARCHAR(64) DEFAULT NULL AFTER `recebido_por_masp`', 'SELECT 1');
PREPARE stmt FROM @sql_rec_usr_perfil; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- 4. ATUALIZAÇÃO DA VIEW DE COMPATIBILIDADE `weapon_transfers`
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW `weapon_transfers` AS 
SELECT 
  id, 
  numero_protocolo AS protocol_number, 
  data_transferencia AS transfer_date, 
  origem_departamento_id AS origin_department_id, 
  origem_departamento_nome AS origin_department_name, 
  origem_unidade_id AS origin_unit_id, 
  origem_unidade_nome AS origin_unit_name, 
  destino_departamento_id AS destination_department_id, 
  destino_departamento_nome AS destination_department_name, 
  destino_unidade_id AS destination_unit_id, 
  destino_unidade_nome AS destination_unit_name, 
  destino_cofre_id AS destination_vault_space_id, 
  destino_cofre_codigo AS destination_vault_space_code, 
  responsavel_id AS transferred_by_user_id, 
  responsavel_nome AS transferred_by_user_name, 
  responsavel_masp AS transferred_by_user_masp, 
  responsavel_perfil AS transferred_by_user_role, 
  transportador_nome AS receiver_or_transporter_name, 
  transportador_masp AS receiver_or_transporter_masp, 
  transportador_cargo AS receiver_or_transporter_cargo, 
  motivo AS reason, 
  armas_json AS weapons_json, 
  total_armas AS total_weapons, 
  total_carregadores AS total_magazines, 
  observacao AS observation, 
  status,
  recebido_em AS received_at,
  recebido_por_usuario_id AS received_by_user_id,
  recebido_por_nome AS received_by_user_name,
  recebido_por_masp AS received_by_user_masp,
  recebido_por_perfil AS received_by_user_role,
  data_criacao AS created_at 
FROM `transferencias_armas`;

SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================
-- FIM DO SCRIPT
-- =============================================================================
