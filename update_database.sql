-- ====================================================================
-- SCRIPT DE ATUALIZAÇÃO E REMODELAGEM DO BANCO DE DADOS MYSQL
-- Traduz todas as tabelas e colunas para o Português, limpa elementos não utilizados
-- e gera Views para compatibilidade legada.
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Criar Tabelas Principais em Português se não existirem
CREATE TABLE IF NOT EXISTS `departamentos` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `codigo` VARCHAR(64) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `unidades` (
    `id` VARCHAR(64) NOT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` VARCHAR(64) NOT NULL,
    `masp` VARCHAR(32) NOT NULL,
    `senha` VARCHAR(255) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `telefone` VARCHAR(32) DEFAULT NULL,
    `cargo` VARCHAR(64) NOT NULL,
    `perfil` ENUM('Policial', 'Armeiro', 'Administrador', 'Geral') NOT NULL DEFAULT 'Policial',
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `pode_mover_municao` TINYINT(1) NOT NULL DEFAULT 0,
    `pode_mover_armas` TINYINT(1) NOT NULL DEFAULT 0,
    `tem_acesso_sistema` TINYINT(1) NOT NULL DEFAULT 1,
    `eh_professor` TINYINT(1) NOT NULL DEFAULT 0,
    `disciplina_professor` VARCHAR(32) DEFAULT NULL,
    `professor_sigla` VARCHAR(64) DEFAULT NULL,
    `deve_alterar_senha` TINYINT(1) NOT NULL DEFAULT 1,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_usuarios_masp` (`masp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calibres` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(128) NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_calibres_nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cursos` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `modelos_permitidos` JSON NOT NULL,
    `calibres_permitidos` JSON NOT NULL,
    `tipos_armas_permitidos` JSON DEFAULT NULL,
    `tiros_por_aluno` INT DEFAULT 0,
    `tiros_por_tipo_arma` JSON DEFAULT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tipos_armas` (
    `id` VARCHAR(64) NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `modelos` JSON NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cofres` (
    `id` VARCHAR(64) NOT NULL,
    `codigo` VARCHAR(64) NOT NULL,
    `tipo` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `armas` (
    `id` VARCHAR(64) NOT NULL,
    `tipo` VARCHAR(64) NOT NULL,
    `numero_serie` VARCHAR(128) NOT NULL,
    `fabricante` VARCHAR(128) NOT NULL,
    `modelo` VARCHAR(128) NOT NULL,
    `calibre` VARCHAR(128) NOT NULL,
    `quantidade_carregadores` INT NOT NULL DEFAULT 1,
    `status` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo') NOT NULL DEFAULT 'No Cofre',
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

CREATE TABLE IF NOT EXISTS `estoque_municoes` (
    `id` VARCHAR(64) NOT NULL,
    `calibre_id` VARCHAR(64) NOT NULL,
    `quantidade` INT NOT NULL DEFAULT 0,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `cofre_id` VARCHAR(64) DEFAULT NULL,
    `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movimentacoes_armas` (
    `id` VARCHAR(64) NOT NULL,
    `arma_id` VARCHAR(64) NOT NULL,
    `numero_serie_arma` VARCHAR(128) NOT NULL,
    `modelo_arma` VARCHAR(128) NOT NULL,
    `tipo_arma` VARCHAR(64) DEFAULT NULL,
    `calibre` VARCHAR(128) DEFAULT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `requerente_id` VARCHAR(64) NOT NULL,
    `nome_requerente` VARCHAR(255) NOT NULL,
    `masp_requerente` VARCHAR(32) NOT NULL,
    `cofre_retirada_id` VARCHAR(64) DEFAULT NULL,
    `cofre_devolucao_id` VARCHAR(64) DEFAULT NULL,
    `quantidade_municao` INT NOT NULL DEFAULT 0,
    `quantidade_carregadores` INT NOT NULL DEFAULT 0,
    `quantidade_municao_devolucao` INT NOT NULL DEFAULT 0,
    `quantidade_carregadores_devolucao` INT NOT NULL DEFAULT 0,
    `status` VARCHAR(64) NOT NULL,
    `aprovado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
    `aprovado_por_nome` VARCHAR(255) DEFAULT NULL,
    `data_aprovacao` DATETIME DEFAULT NULL,
    `recibo_confirmado_por_usuario_id` VARCHAR(64) DEFAULT NULL,
    `recibo_confirmado_por_nome` VARCHAR(255) DEFAULT NULL,
    `data_recibo` DATETIME DEFAULT NULL,
    `possui_divergencia` TINYINT(1) NOT NULL DEFAULT 0,
    `justificativa_divergencia` TEXT DEFAULT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `data_atualizacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `movimentacoes_municoes` (
    `id` VARCHAR(64) NOT NULL,
    `tipo` ENUM('Entrada', 'Saída') NOT NULL,
    `calibre_id` VARCHAR(64) NOT NULL,
    `quantidade` INT NOT NULL,
    `departamento_id` VARCHAR(64) DEFAULT NULL,
    `unidade_id` VARCHAR(64) DEFAULT NULL,
    `cofre_id` VARCHAR(64) DEFAULT NULL,
    `destinatario_ou_motivo` VARCHAR(255) NOT NULL,
    `tipo_responsavel` VARCHAR(32) DEFAULT 'SISTEMA',
    `responsavel_usuario_id` VARCHAR(64) DEFAULT NULL,
    `responsavel_nome` VARCHAR(255) DEFAULT NULL,
    `responsavel_masp` VARCHAR(64) DEFAULT NULL,
    `observacao` VARCHAR(500) DEFAULT NULL,
    `quantidade_devolvida` INT DEFAULT 0,
    `data_devolucao` DATETIME DEFAULT NULL,
    `devolvido_por_nome` VARCHAR(255) DEFAULT NULL,
    `usuario_id` VARCHAR(64) DEFAULT NULL,
    `nome_usuario` VARCHAR(255) NOT NULL,
    `data_criacao` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `logs_auditoria` (
    `id` VARCHAR(64) NOT NULL,
    `modulo` VARCHAR(64) NOT NULL,
    `acao` VARCHAR(64) NOT NULL,
    `detalhes` TEXT NOT NULL,
    `usuario_id` VARCHAR(64) DEFAULT NULL,
    `nome_usuario` VARCHAR(255) NOT NULL,
    `masp_usuario` VARCHAR(32) NOT NULL,
    `perfil_usuario` VARCHAR(32) NOT NULL,
    `endereco_ip` VARCHAR(64) DEFAULT NULL,
    `data_hora` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrar dados das tabelas em Inglês (se existirem)
INSERT IGNORE INTO `departamentos` (`id`, `nome`, `codigo`, `data_criacao`) SELECT `id`, `name`, `code`, `created_at` FROM `departments` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='departments');
INSERT IGNORE INTO `unidades` (`id`, `departamento_id`, `nome`, `data_criacao`) SELECT `id`, `department_id`, `name`, `created_at` FROM `units` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='units');
INSERT IGNORE INTO `usuarios` (`id`, `masp`, `senha`, `nome`, `telefone`, `cargo`, `perfil`, `departamento_id`, `unidade_id`, `pode_mover_municao`, `pode_mover_armas`, `tem_acesso_sistema`, `deve_alterar_senha`, `data_criacao`) SELECT `id`, `masp`, `password`, `name`, `phone`, `cargo`, `role`, `department_id`, `unit_id`, `can_move_ammo`, `can_move_weapons`, `has_system_access`, `must_change_password`, `created_at` FROM `users` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users');
INSERT IGNORE INTO `calibres` (`id`, `nome`, `data_criacao`) SELECT `id`, `name`, `created_at` FROM `calibers` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calibers');
INSERT IGNORE INTO `cursos` (`id`, `nome`, `modelos_permitidos`, `calibres_permitidos`, `departamento_id`, `data_criacao`) SELECT `id`, `name`, `allowed_models`, `allowed_calibers`, `department_id`, `created_at` FROM `courses` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses');
INSERT IGNORE INTO `tipos_armas` (`id`, `nome`, `modelos`, `data_criacao`) SELECT `id`, `name`, `models`, `created_at` FROM `available_weapon_types` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='available_weapon_types');
INSERT IGNORE INTO `cofres` (`id`, `codigo`, `tipo`, `departamento_id`, `unidade_id`, `data_criacao`) SELECT `id`, `code`, `type`, `department_id`, `unit_id`, `created_at` FROM `vault_spaces` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vault_spaces');
INSERT IGNORE INTO `armas` (`id`, `tipo`, `numero_serie`, `fabricante`, `modelo`, `calibre`, `quantidade_carregadores`, `status`, `departamento_id`, `unidade_id`, `cofre_id`, `data_criacao`) SELECT `id`, `type`, `serial_number`, `manufacturer`, `model`, `caliber`, `magazine_quantity`, `status`, `department_id`, `unit_id`, `vault_space_id`, `created_at` FROM `weapons` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='weapons');
INSERT IGNORE INTO `estoque_municoes` (`id`, `calibre_id`, `quantidade`, `departamento_id`, `unidade_id`, `cofre_id`, `data_atualizacao`) SELECT `id`, `caliber_id`, `quantity`, `department_id`, `unit_id`, `vault_space_id`, `updated_at` FROM `ammo_stocks` WHERE EXISTS (SELECT * FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ammo_stocks');

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Banco de dados reformulado, traduzido para o Português e organizado com sucesso!' AS Resultado;
