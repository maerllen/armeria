-- ============================================================================
-- MIGRAÇÃO SQL v3 — MÓDULO RELATÓRIOS: AVALIAÇÃO APTO / INAPTO (SEM PONTUAÇÃO)
-- Sistema ARMARIA / Polícia Civil de Minas Gerais
-- Compatível com MariaDB 10.4+ / 11.x (Hostinger) e MySQL 8+ (UTF8MB4)
-- Seguro para reaplicação (idempotente — não apaga dados existentes)
-- ============================================================================
-- Alterações incluídas:
-- 1. DESEMPENHO_MARCADORES:
--    - MODO_AVALIACAO: 'PONTUACAO' (padrão numérico) ou 'APTO_INAPTO' (qualitativo,
--      sem pontuação numérica e com controle de tempo opcional, suportando
--      distribuição simples ou mista por Marca/Tempo com resultado Apto ou Inapto).
-- 2. DESEMPENHO_RESULTADOS:
--    - MODO_AVALIACAO_REF: registro histórico do modo de avaliação vigente na
--      avaliação ('PONTUACAO' ou 'APTO_INAPTO') para exibição em gráficos,
--      fichas individuais, fichas da unidade e PDFs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Atualização da tabela DESEMPENHO_MARCADORES
-- ----------------------------------------------------------------------------
ALTER TABLE `DESEMPENHO_MARCADORES`
  ADD COLUMN IF NOT EXISTS `MODO_AVALIACAO` VARCHAR(20) NOT NULL DEFAULT 'PONTUACAO'
    COMMENT 'PONTUACAO = nota numérica | APTO_INAPTO = avaliação qualitativa Apto/Inapto sem pontuação'
    AFTER `CATEGORIA`;

-- ----------------------------------------------------------------------------
-- 2. Atualização da tabela DESEMPENHO_RESULTADOS
-- ----------------------------------------------------------------------------
ALTER TABLE `DESEMPENHO_RESULTADOS`
  ADD COLUMN IF NOT EXISTS `MODO_AVALIACAO_REF` VARCHAR(20) NOT NULL DEFAULT 'PONTUACAO'
    COMMENT 'Modo de avaliação vigente na avaliação (PONTUACAO ou APTO_INAPTO)'
    AFTER `NOTA_APROVACAO_REF`;

-- ----------------------------------------------------------------------------
-- 3. Normalização retroativa segura para registros existentes
-- ----------------------------------------------------------------------------
UPDATE `DESEMPENHO_MARCADORES`
   SET `MODO_AVALIACAO` = 'PONTUACAO'
 WHERE `MODO_AVALIACAO` IS NULL OR `MODO_AVALIACAO` = '';

UPDATE `DESEMPENHO_RESULTADOS`
   SET `MODO_AVALIACAO_REF` = 'PONTUACAO'
 WHERE `MODO_AVALIACAO_REF` IS NULL OR `MODO_AVALIACAO_REF` = '';

-- ============================================================================
-- FIM DA MIGRAÇÃO SQL v3 — MODO APTO / INAPTO
-- ============================================================================
