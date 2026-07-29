-- =============================================================================
-- SCRIPT DE BANCO DE DADOS MYSQL PARA O MÓDULO CALENDÁRIO DE AULAS (ACADEPOL)
-- =============================================================================
-- Tabela para armazenar cronograma de aulas, horários, turmas, disciplinas, 
-- salas, cursos de formação, módulos, ano, equipes e observações.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `calendario_aulas` (
  `id` VARCHAR(64) NOT NULL,
  `data_calendario` DATE NOT NULL COMMENT 'Data da aula (AAAA-MM-DD)',
  `horario_calendario` VARCHAR(64) NOT NULL COMMENT 'Horário (ex: 08:00 as 09:40, 10:00 as 11:40, 14:00 as 15:40, 16:00 as 16:40)',
  `turma_calendario` VARCHAR(64) NOT NULL COMMENT 'Identificador da turma (ex: DL1, DL2, EP1)',
  `sigla_calendario` VARCHAR(64) NOT NULL COMMENT 'Sigla da disciplina (ex: MEAF, DPI, DIRPEN)',
  `disciplina_calendario` VARCHAR(255) DEFAULT NULL COMMENT 'Nome completo da disciplina',
  `sala_calendario` VARCHAR(100) DEFAULT NULL COMMENT 'Sala ou local da aula (ex: SL01, Estande, Auditório)',
  `curso_calendario` VARCHAR(255) DEFAULT NULL COMMENT 'Nome do Curso de Formação (herdeiro do módulo Curso de Formação)',
  `modulo_calendario` VARCHAR(100) DEFAULT NULL COMMENT 'Módulo do Curso (ex: Módulo I, Módulo II)',
  `ano_calendario` VARCHAR(64) DEFAULT NULL COMMENT 'Ano letivo do calendário (ex: 2026)',
  `numero_aula_calendario` VARCHAR(64) DEFAULT NULL COMMENT 'Número da Aula (ex: 1, 2, Aula 01)',
  `equipe_calendario` VARCHAR(100) DEFAULT NULL COMMENT 'Equipe de instrução ou professores responsável',
  `observacao_calendario` TEXT DEFAULT NULL COMMENT 'Observações adicionais da aula',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cal_data` (`data_calendario`),
  KEY `idx_cal_sigla` (`sigla_calendario`),
  KEY `idx_cal_turma` (`turma_calendario`),
  KEY `idx_cal_sala` (`sala_calendario`),
  KEY `idx_cal_modulo` (`modulo_calendario`),
  KEY `idx_cal_ano` (`ano_calendario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Garantir que colunas mais recentes existam em instalações existentes
ALTER TABLE `calendario_aulas` ADD COLUMN IF NOT EXISTS `modulo_calendario` VARCHAR(100) DEFAULT NULL;
ALTER TABLE `calendario_aulas` ADD COLUMN IF NOT EXISTS `ano_calendario` VARCHAR(64) DEFAULT NULL;

-- Exemplo de inserção para teste de funcionamento do calendário
INSERT INTO `calendario_aulas` 
  (`id`, `data_calendario`, `horario_calendario`, `turma_calendario`, `sigla_calendario`, `disciplina_calendario`, `sala_calendario`, `curso_calendario`, `modulo_calendario`, `ano_calendario`, `numero_aula_calendario`, `equipe_calendario`, `observacao_calendario`, `created_at`)
VALUES 
  ('cal-demo-1', '2026-06-29', '10:00 as 11:40', 'DL1', 'MEAF', 'Manuseio e Emprego de Armas de Fogo', 'SL01', 'Curso de Formação de Delegados de Polícia', 'Módulo I', '2026', '1', 'Equipe Alpha', 'Primeira aula prática de tiro e segurança', NOW()),
  ('cal-demo-2', '2026-07-01', '10:00 as 11:40', 'DL1', 'MEAF', 'Manuseio e Emprego de Armas de Fogo', 'Estande', 'Curso de Formação de Delegados de Polícia', 'Módulo I', '2026', '2', 'Equipe Alpha', 'Segunda aula no Estande de Tiro', NOW())
ON DUPLICATE KEY UPDATE `created_at` = VALUES(`created_at`);
