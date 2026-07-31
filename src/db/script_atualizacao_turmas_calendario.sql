-- =============================================================================
-- SCRIPT DE MIGRAÇÃO / ATUALIZAÇÃO: COLUNAS DE CALENDÁRIO NA TABELA COURSE_CLASSES
-- =============================================================================
-- Adiciona o suporte ao vínculo com o Calendário de Aulas (turma_calendario),
-- armazenando a data da primeira e da última aula identificadas no horário.
-- =============================================================================

-- 1. Adicionar colunas para suporte às datas de aulas e vínculo com o calendário
ALTER TABLE `course_classes` ADD COLUMN `first_class_date` VARCHAR(32) DEFAULT NULL COMMENT 'Data da primeira aula (AAAA-MM-DD) no calendário';
ALTER TABLE `course_classes` ADD COLUMN `last_class_date` VARCHAR(32) DEFAULT NULL COMMENT 'Data da última aula (AAAA-MM-DD) no calendário';
ALTER TABLE `course_classes` ADD COLUMN `turma_calendario` VARCHAR(64) DEFAULT NULL COMMENT 'Código da turma no calendário de aulas (ex: DL 01, IP 01, EP 01)';

-- 2. Índice recomendado para otimização de busca por turma do calendário
ALTER TABLE `course_classes` ADD INDEX `idx_course_classes_turma_cal` (`turma_calendario`);
