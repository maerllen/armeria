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
-- Inclui o Armeiro Responsável e Credenciamento PF da Armeria Externa
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
  
  -- Campos para Manutenção Externa (endereço, oficina e credenciamento)
  `ARMERIA_NOME` VARCHAR(255) DEFAULT NULL,
  `ARMERIA_CEP` VARCHAR(16) DEFAULT NULL,
  `ARMERIA_LOGRADOURO` VARCHAR(255) DEFAULT NULL,
  `ARMERIA_NUMERO` VARCHAR(32) DEFAULT NULL,
  `ARMERIA_COMPLEMENTO` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_BAIRRO` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_CIDADE` VARCHAR(128) DEFAULT NULL,
  `ARMERIA_ESTADO` VARCHAR(8) DEFAULT NULL,
  `ARMERIA_ARMEIRO_RESPONSAVEL` VARCHAR(255) DEFAULT NULL,
  `ARMERIA_CREDENCIAMENTO_PF` VARCHAR(128) DEFAULT NULL,
  
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

-- Atualização se a tabela MANUTENCOES_ARMAS já existir:
ALTER TABLE `MANUTENCOES_ARMAS`
  ADD COLUMN IF NOT EXISTS `ARMERIA_ARMEIRO_RESPONSAVEL` VARCHAR(255) DEFAULT NULL AFTER `ARMERIA_ESTADO`,
  ADD COLUMN IF NOT EXISTS `ARMERIA_CREDENCIAMENTO_PF` VARCHAR(128) DEFAULT NULL AFTER `ARMERIA_ARMEIRO_RESPONSAVEL`;

-- ------------------------------------------------------------------------------
-- 3. TABELA DE ARMERIAS EXTERNAS CREDENCIADAS (`ARMERIAS_EXTERNAS`)
-- Cadastro persistente de armerias com Armeiro Responsável e Credenciamento PF
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
  `ARMEIRO_RESPONSAVEL` VARCHAR(255) DEFAULT NULL,
  `CREDENCIAMENTO_PF` VARCHAR(128) DEFAULT NULL,
  `DATA_CRIACAO` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_ARMERIAS_EXTERNAS`),
  KEY `idx_armeria_nome` (`NOME`),
  KEY `idx_armeria_cred_pf` (`CREDENCIAMENTO_PF`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atualização se a tabela ARMERIAS_EXTERNAS já existir:
ALTER TABLE `ARMERIAS_EXTERNAS`
  ADD COLUMN IF NOT EXISTS `ARMEIRO_RESPONSAVEL` VARCHAR(255) DEFAULT NULL AFTER `CONTATO`,
  ADD COLUMN IF NOT EXISTS `CREDENCIAMENTO_PF` VARCHAR(128) DEFAULT NULL AFTER `ARMEIRO_RESPONSAVEL`;

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

-- ------------------------------------------------------------------------------
-- 7. ATUALIZAÇÃO DA TABELA DE COFRES (`COFRES`)
-- Permite criação de locais para armazenar explosivos (Paiol / Cofre de Explosivos)
-- ------------------------------------------------------------------------------
ALTER TABLE `COFRES` 
  MODIFY COLUMN `TIPO_COFRES` ENUM('ARMAS', 'MUNIÇÕES', 'EXPLOSIVOS') NOT NULL DEFAULT 'ARMAS';

-- ------------------------------------------------------------------------------
-- 8. TABELA DE EXPLOSIVOS E DETONANTES (`EXPLOSIVOS`)
-- Cadastro completo com Tipo de Explosivo, Nome, Unidade de Medida, Quantidade e Local do Cofre
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `EXPLOSIVOS` (
  `ID_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `NOME_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `TIPO_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `SUBTIPO_EXPLOSIVOS` VARCHAR(128) DEFAULT NULL,
  `QUANTIDADE_EXPLOSIVOS` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `UNIDADE_MEDIDA_EXPLOSIVOS` VARCHAR(32) NOT NULL DEFAULT 'kg',
  `LOTE_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `FABRICANTE_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `DATA_FABRICACAO_EXPLOSIVOS` DATE DEFAULT NULL,
  `DATA_VALIDADE_EXPLOSIVOS` DATE DEFAULT NULL,
  `CLASSE_RISCO_EXPLOSIVOS` VARCHAR(128) NOT NULL DEFAULT '1.1D',
  `LOCAL_ARMAZENAMENTO_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `COFRE_ID_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL,
  `STATUS_EXPLOSIVOS` ENUM('Disponível', 'Em Uso/Operação', 'Vencido', 'Quarentena/Perícia', 'Descartado') NOT NULL DEFAULT 'Disponível',
  `DEPARTAMENTO_ID_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `UNIDADE_ID_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `OBSERVACOES_EXPLOSIVOS` TEXT DEFAULT NULL,
  `DATA_CRIACAO_EXPLOSIVOS` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_EXPLOSIVOS`),
  KEY `idx_explosivos_dept` (`DEPARTAMENTO_ID_EXPLOSIVOS`),
  KEY `idx_explosivos_unidade` (`UNIDADE_ID_EXPLOSIVOS`),
  KEY `idx_explosivos_tipo` (`TIPO_EXPLOSIVOS`),
  KEY `idx_explosivos_status` (`STATUS_EXPLOSIVOS`),
  KEY `idx_explosivos_lote` (`LOTE_EXPLOSIVOS`),
  KEY `idx_explosivos_cofre` (`COFRE_ID_EXPLOSIVOS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `EXPLOSIVOS` 
  ADD COLUMN IF NOT EXISTS `COFRE_ID_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL AFTER `LOCAL_ARMAZENAMENTO_EXPLOSIVOS`;

-- ------------------------------------------------------------------------------
-- 9. TABELA DE MOVIMENTAÇÕES DE EXPLOSIVOS (`MOVIMENTACOES_EXPLOSIVOS`)
-- Livro de registro auditável de entradas, saídas, consumo e destruição
-- Padrão de colunas em conformidade com o backend e phpMyAdmin
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `MOVIMENTACOES_EXPLOSIVOS` (
  `ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `NOME_EXPLOSIVO_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `TIPO_MOVIMENTACAO_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `QUANTIDADE_MOVIMENTACOES_EXPLOSIVOS` DECIMAL(12,3) NOT NULL,
  `UNIDADE_MEDIDA_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(32) NOT NULL DEFAULT 'kg',
  `MOTIVO_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `RESPONSAVEL_NOME_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) NOT NULL,
  `RESPONSAVEL_MASP_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL,
  `RESPONSAVEL_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL,
  `LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) DEFAULT NULL,
  `COFRE_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL,
  `LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) DEFAULT NULL,
  `DATA_MOVIMENTACAO_EXPLOSIVOS` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DEPARTAMENTO_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `UNIDADE_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `OBSERVACOES_MOVIMENTACOES_EXPLOSIVOS` TEXT DEFAULT NULL,
  PRIMARY KEY (`ID_MOVIMENTACOES_EXPLOSIVOS`),
  KEY `idx_mov_exp_item` (`EXPLOSIVO_ID_MOVIMENTACOES_EXPLOSIVOS`),
  KEY `idx_mov_exp_tipo` (`TIPO_MOVIMENTACAO_EXPLOSIVOS`),
  KEY `idx_mov_exp_cofre` (`COFRE_ID_MOVIMENTACOES_EXPLOSIVOS`),
  KEY `idx_mov_exp_data` (`DATA_MOVIMENTACAO_EXPLOSIVOS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migração para instalações existentes de MOVIMENTACOES_EXPLOSIVOS:
ALTER TABLE `MOVIMENTACOES_EXPLOSIVOS`
  MODIFY COLUMN `TIPO_MOVIMENTACAO_EXPLOSIVOS` VARCHAR(64) NOT NULL DEFAULT 'Saída',
  ADD COLUMN IF NOT EXISTS `COFRE_ID_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(64) DEFAULT NULL AFTER `LOCAL_ORIGEM_DESTINO_MOVIMENTACOES_EXPLOSIVOS`,
  ADD COLUMN IF NOT EXISTS `LOCAL_COFRE_MOVIMENTACOES_EXPLOSIVOS` VARCHAR(255) DEFAULT NULL AFTER `COFRE_ID_MOVIMENTACOES_EXPLOSIVOS`;

-- ------------------------------------------------------------------------------
-- 10. TABELA DE TIPOS DE EXPLOSIVOS (`TIPOS_EXPLOSIVOS`)
-- Cadastro gerenciável de tipos e classes de materiais explosivos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `TIPOS_EXPLOSIVOS` (
  `ID_TIPOS_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `NOME_TIPOS_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `DESCRICAO_TIPOS_EXPLOSIVOS` TEXT DEFAULT NULL,
  `DATA_CRIACAO_TIPOS_EXPLOSIVOS` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_TIPOS_EXPLOSIVOS`),
  UNIQUE KEY `uq_tipo_exp_nome` (`NOME_TIPOS_EXPLOSIVOS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carga inicial de tipos padrão de explosivos
INSERT IGNORE INTO `TIPOS_EXPLOSIVOS` (`ID_TIPOS_EXPLOSIVOS`, `NOME_TIPOS_EXPLOSIVOS`, `DESCRICAO_TIPOS_EXPLOSIVOS`) VALUES
('te-1', 'Alto Explosivo (Detonante)', 'Explosivos secundários de alta velocidade de detonação (C-4, PETN, TNT, Dinamite, Emulsão)'),
('te-2', 'Baixo Explosivo (Deflagrante/Pólvora)', 'Substâncias que queimam em velocidade subsônica (Pólvora negra, pólvoras sem fumaça)'),
('te-3', 'Iniciador / Detonador', 'Acessórios de iniciação sensíveis (Espoletas elétricas, não elétricas, acendedores)'),
('te-4', 'Granada / Dispositivo Tático', 'Artefatos manufaturados com carga de efeito moral, lacrimogêneo ou fragmentação'),
('te-5', 'Acessório de Demolição / Linha de Fogo', 'Cordel detonante, estopim lento, boosters, tubos de choque, retardadores'),
('te-6', 'Material Pirotécnico / Sinalização', 'Foguetes de sinalização, artifícios iluminativos e pirotécnicos'),
('te-default-0', 'Alto Explosivo (Detonante)', 'Explosivos secundários de alta velocidade de detonação'),
('te-default-1', 'Baixo Explosivo (Deflagrante / Pólvora)', 'Substâncias propelentes de queima subsônica'),
('te-default-2', 'Iniciador / Detonador / Acessório', 'Dispositivos de acionamento, espoletas e estopins'),
('te-default-3', 'Granada / Artefato Não Letal / Tático', 'Dispositivos de efeito moral, fumígenos e lacrimogêneos'),
('te-default-4', 'Acessório de Demolição / Cordel Detonante', 'Cordéis detonantes e linhas de fogo de demolição'),
('te-default-5', 'Pirotécnico / Iluminação / Sinalização', 'Sinalizadores e artifícios pirotécnicos'),
('te-default-6', 'Carga Oca / Arrombamento Tático (Breaching)', 'Cargas moldadas para entrada tática e corte');

-- ------------------------------------------------------------------------------
-- 11. TABELA DE SUBTIPOS DE EXPLOSIVOS (`SUBTIPOS_EXPLOSIVOS`)
-- Cadastro gerenciável de subtipos vinculados a um tipo específico
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SUBTIPOS_EXPLOSIVOS` (
  `ID_SUBTIPOS_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `TIPO_ID_SUBTIPOS_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `TIPO_NOME_SUBTIPOS_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `NOME_SUBTIPOS_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `DESCRICAO_SUBTIPOS_EXPLOSIVOS` TEXT DEFAULT NULL,
  `DATA_CRIACAO_SUBTIPOS_EXPLOSIVOS` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_SUBTIPOS_EXPLOSIVOS`),
  KEY `idx_subtipo_tipo` (`TIPO_ID_SUBTIPOS_EXPLOSIVOS`),
  KEY `idx_subtipo_tipo_nome` (`TIPO_NOME_SUBTIPOS_EXPLOSIVOS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carga inicial de subtipos padrão vinculados
INSERT IGNORE INTO `SUBTIPOS_EXPLOSIVOS` (`ID_SUBTIPOS_EXPLOSIVOS`, `TIPO_ID_SUBTIPOS_EXPLOSIVOS`, `TIPO_NOME_SUBTIPOS_EXPLOSIVOS`, `NOME_SUBTIPOS_EXPLOSIVOS`, `DESCRICAO_SUBTIPOS_EXPLOSIVOS`) VALUES
('sub-1', 'te-1', 'Alto Explosivo (Detonante)', 'C-4 / Composição C-4 Plastificada', 'Carga de corte e demolição especial'),
('sub-2', 'te-1', 'Alto Explosivo (Detonante)', 'Emulsão Encartuchada Britex / Semigelatina', 'Emulsão de alta densidade encartuchada'),
('sub-3', 'te-1', 'Alto Explosivo (Detonante)', 'TNT (Trinitrotolueno) em Bloco', 'Blocos de demolição militar padrão'),
('sub-4', 'te-1', 'Alto Explosivo (Detonante)', 'PETN / Tetranitrato de Pentaeritritol', 'Cargas de corte linear e booster'),
('sub-5', 'te-2', 'Baixo Explosivo (Deflagrante/Pólvora)', 'Pólvora Química Sem Fumaça (Smokeless)', 'Propelente de queima progressiva'),
('sub-6', 'te-2', 'Baixo Explosivo (Deflagrante/Pólvora)', 'Pólvora Negra Graus 2Fa / 3Fa', 'Para acionamentos específicos e efeitos'),
('sub-7', 'te-3', 'Iniciador / Detonador', 'Espoleta Elétrica Instantânea nº 8', 'Detonador de fio metálico sensível'),
('sub-8', 'te-3', 'Iniciador / Detonador', 'Espoleta Não-Elétrica (Tubo de Choque)', 'Acionamento por onda de choque de baixa energia'),
('sub-9', 'te-3', 'Iniciador / Detonador', 'Estopim Lento / Tubo de Ignifugação', 'Acionamento de segurança temporizado'),
('sub-10', 'te-4', 'Granada / Dispositivo Tático', 'Granada de Efeito Moral / Luz e Som', 'Dispositivo de atordoamento tático'),
('sub-11', 'te-4', 'Granada / Dispositivo Tático', 'Granada Lacrimogênea CS/OC', 'Artefato fumígeno incapacitante'),
('sub-12', 'te-5', 'Acessório de Demolição / Linha de Fogo', 'Cordel Detonante NP-10 (10g/m)', 'Linha de fogo para detonação simultânea'),
('sub-13', 'te-5', 'Acessório de Demolição / Linha de Fogo', 'Booster / Reforçador de Pentolita 150g', 'Reforçador para detonação em massa');

-- ------------------------------------------------------------------------------
-- 12. TABELA DE FABRICANTES DE EXPLOSIVOS (`FABRICANTES_EXPLOSIVOS`)
-- Cadastro homologado de indústrias e fornecedores bélicos / pirotécnicos
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `FABRICANTES_EXPLOSIVOS` (
  `ID_FABRICANTES_EXPLOSIVOS` VARCHAR(64) NOT NULL,
  `NOME_FABRICANTES_EXPLOSIVOS` VARCHAR(128) NOT NULL,
  `PAIS_FABRICANTES_EXPLOSIVOS` VARCHAR(64) DEFAULT 'Brasil',
  `DESCRICAO_FABRICANTES_EXPLOSIVOS` TEXT DEFAULT NULL,
  `DATA_CRIACAO_FABRICANTES_EXPLOSIVOS` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_FABRICANTES_EXPLOSIVOS`),
  UNIQUE KEY `uq_fab_nome` (`NOME_FABRICANTES_EXPLOSIVOS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carga inicial de fabricantes homologados
INSERT IGNORE INTO `FABRICANTES_EXPLOSIVOS` (`ID_FABRICANTES_EXPLOSIVOS`, `NOME_FABRICANTES_EXPLOSIVOS`, `PAIS_FABRICANTES_EXPLOSIVOS`, `DESCRICAO_FABRICANTES_EXPLOSIVOS`) VALUES
('fab-1', 'IMBEL (Indústria de Material Bélico do Brasil)', 'Brasil', 'Fabricante nacional militar de explosivos e espoletas'),
('fab-2', 'CBC (Companhia Brasileira de Cartuchos)', 'Brasil', 'Fabricante de munições, pólvoras e dispositivos'),
('fab-3', 'Britanite / Enaex Brasil', 'Brasil', 'Fabricante de emulsões encartuchadas e cordéis detonantes'),
('fab-4', 'Condor Tecnologias Não Letais', 'Brasil', 'Fabricante de granadas táticas e pirotécnicos de sinalização'),
('fab-5', 'Austin Powder Brasil', 'Brasil', 'Fabricante de explosivos industriais e iniciadores'),
('fab-6', 'Maxam Brasil', 'Brasil', 'Fabricante de sistemas de iniciação e altos explosivos'),
('fab-7', 'Nitroquímica / Outro Fornecedor Homologado', 'Brasil', 'Fornecedor certificado pelo Exército Brasileiro');

-- Atualização dos status suportados em EXPLOSIVOS
ALTER TABLE `EXPLOSIVOS` 
  MODIFY COLUMN `STATUS_EXPLOSIVOS` ENUM('Operacional', 'Instrução', 'Destruição', 'Disponível', 'Em Uso/Operação', 'Vencido', 'Quarentena/Perícia', 'Descartado') NOT NULL DEFAULT 'Operacional';

-- ------------------------------------------------------------------------------
-- 13. LOGOS PERSONALIZADAS DE DEPARTAMENTOS E UNIDADES
-- Adiciona suporte a logotipos em DEPARTAMENTOS e UNIDADES
-- ------------------------------------------------------------------------------
ALTER TABLE `DEPARTAMENTOS`
  ADD COLUMN IF NOT EXISTS `LOGO_URL_DEPARTAMENTOS` LONGTEXT DEFAULT NULL AFTER `CODIGO_DEPARTAMENTOS`;

ALTER TABLE `UNIDADES`
  ADD COLUMN IF NOT EXISTS `LOGO_URL_UNIDADES` LONGTEXT DEFAULT NULL AFTER `NOME_UNIDADES`;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- FIM DO SCRIPT
-- ==============================================================================
