-- ============================================================================
-- MIGRAÇÃO SQL — MÓDULO ARMAS / CAUTELA DE ARMAS: CAUTELA EXTERNA
-- Sistema ARMARIA / Polícia Civil de Minas Gerais
-- Compatível com MariaDB 10.4+ / 11.x (Hostinger) e MySQL 8+ (UTF8MB4)
-- Seguro para reaplicação (idempotente — não apaga dados existentes)
-- ============================================================================
-- Alterações incluídas:
-- 1. ACAUTELAR_ARMAS:
--    - IS_EXTERNA_ACAUTELAR_ARMAS: identifica cautelas feitas para pessoas fora do sistema (0 = interna, 1 = externa)
--    - REQUERENTE_DEPARTAMENTO_EXTERNO_ACAUTELAR_ARMAS: departamento informado manualmente para recebedor externo
--    - REQUERENTE_UNIDADE_EXTERNA_ACAUTELAR_ARMAS: unidade informada manualmente para recebedor externo
--    - REQUERENTE_CARGO_ACAUTELAR_ARMAS: ampliado para VARCHAR(100) para comportar cargos inseridos manualmente
--    - Índice auxiliar idx_acaut_externa para consultas/filtros de cautelas externas
-- 2. MOVIMENTACOES_MUNICOES:
--    - Garante a existência de TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES (VARCHAR(32)) para registrar 'EXTERNO'
--      quando houver munição associada à cautela externa
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Atualização da tabela ACAUTELAR_ARMAS
-- ----------------------------------------------------------------------------
ALTER TABLE `ACAUTELAR_ARMAS`
  ADD COLUMN IF NOT EXISTS `IS_EXTERNA_ACAUTELAR_ARMAS` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '0 = cautela interna (usuário cadastrado) | 1 = cautela externa (pessoa fora do sistema)'
    AFTER `REQUERENTE_TELEFONE_ACAUTELAR_ARMAS`,
  ADD COLUMN IF NOT EXISTS `REQUERENTE_DEPARTAMENTO_EXTERNO_ACAUTELAR_ARMAS` VARCHAR(180) DEFAULT NULL
    COMMENT 'Departamento de origem inserido manualmente para cautela externa'
    AFTER `IS_EXTERNA_ACAUTELAR_ARMAS`,
  ADD COLUMN IF NOT EXISTS `REQUERENTE_UNIDADE_EXTERNA_ACAUTELAR_ARMAS` VARCHAR(180) DEFAULT NULL
    COMMENT 'Unidade de origem inserida manualmente para cautela externa'
    AFTER `REQUERENTE_DEPARTAMENTO_EXTERNO_ACAUTELAR_ARMAS`;

-- Amplia a coluna de cargo para aceitar descrições manuais de cargos externos
ALTER TABLE `ACAUTELAR_ARMAS`
  MODIFY COLUMN `REQUERENTE_CARGO_ACAUTELAR_ARMAS` VARCHAR(100) DEFAULT NULL
    COMMENT 'Cargo/função do recebedor (interno ou informado manualmente em cautela externa)';

-- Índice auxiliar para filtragem de cautelas externas
CREATE INDEX IF NOT EXISTS `idx_acaut_externa`
  ON `ACAUTELAR_ARMAS` (`IS_EXTERNA_ACAUTELAR_ARMAS`);

-- ----------------------------------------------------------------------------
-- 2. Garantia de coluna compatível em MOVIMENTACOES_MUNICOES (munição opcional)
-- ----------------------------------------------------------------------------
ALTER TABLE `MOVIMENTACOES_MUNICOES`
  ADD COLUMN IF NOT EXISTS `TIPO_RESPONSAVEL_MOVIMENTACOES_MUNICOES` VARCHAR(32) DEFAULT 'SISTEMA'
    COMMENT 'SISTEMA = policial cadastrado | EXTERNO = recebedor externo fora do sistema';

-- ----------------------------------------------------------------------------
-- 3. Normalização retroativa segura para registros existentes
-- ----------------------------------------------------------------------------
UPDATE `ACAUTELAR_ARMAS`
   SET `IS_EXTERNA_ACAUTELAR_ARMAS` = 0
 WHERE `IS_EXTERNA_ACAUTELAR_ARMAS` IS NULL;

-- ============================================================================
-- FIM DA MIGRAÇÃO SQL — CAUTELA EXTERNA DE ARMAS
-- ============================================================================
