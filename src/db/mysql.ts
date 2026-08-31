import mysql from 'mysql2/promise';

const rawHost = process.env.DB_HOST || 'srv888.hstgr.io';
const effectiveHost = (rawHost === 'localhost' || rawHost === '127.0.0.1') ? 'srv888.hstgr.io' : rawHost;

export const dbConfig = {
  host: effectiveHost,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'u552818109_Armeriadb',
  user: process.env.DB_USER || 'u552818109_Armeria_user',
  password: process.env.DB_PASSWORD || 'OtR2832120135++--',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000,
};

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

export async function testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
    const [rows]: any = await connection.query('SELECT 1 as connected, NOW() as server_time, VERSION() as version');
    connection.release();
    return {
      success: true,
      message: 'Conexão com o banco de dados MySQL realizada com sucesso!',
      details: rows[0],
    };
  } catch (error: any) {
    console.error('[MySQL Error]', error.message);
    return {
      success: false,
      message: `Erro ao conectar com o banco de dados MySQL (${error.code || 'UNKNOWN'}): ${error.message}`,
    };
  }
}

export async function initializeDatabaseSchema(): Promise<{ success: boolean; message: string; log?: string[] }> {
  const logs: string[] = [];
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
    logs.push('Conectado ao servidor MySQL.');

    // Ensure database exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${dbConfig.database}\`;`);
    logs.push(`Banco de dados '${dbConfig.database}' selecionado.`);

    // Disable FK checks during initialization
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. Departamentos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`departamentos\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`codigo\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Unidades
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`unidades\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_unidades_dept\` (\`departamento_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Usuários
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`usuarios\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`masp\` VARCHAR(32) NOT NULL,
        \`senha\` VARCHAR(255) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`telefone\` VARCHAR(32) DEFAULT NULL,
        \`cargo\` VARCHAR(64) NOT NULL,
        \`perfil\` ENUM('Policial', 'Armeiro', 'Administrador', 'Geral') NOT NULL DEFAULT 'Policial',
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`pode_mover_municao\` TINYINT(1) NOT NULL DEFAULT 0,
        \`pode_mover_armas\` TINYINT(1) NOT NULL DEFAULT 0,
        \`tem_acesso_sistema\` TINYINT(1) NOT NULL DEFAULT 1,
        \`eh_professor\` TINYINT(1) NOT NULL DEFAULT 0,
        \`disciplina_professor\` VARCHAR(32) DEFAULT NULL,
        \`professor_sigla\` VARCHAR(64) DEFAULT NULL,
        \`deve_alterar_senha\` TINYINT(1) NOT NULL DEFAULT 1,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_usuarios_masp\` (\`masp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Calibres
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`calibres\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(128) NOT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_calibres_nome\` (\`nome\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Cursos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`cursos\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`modelos_permitidos\` JSON NOT NULL,
        \`calibres_permitidos\` JSON NOT NULL,
        \`tipos_armas_permitidos\` JSON DEFAULT NULL,
        \`tiros_por_aluno\` INT DEFAULT 0,
        \`tiros_por_tipo_arma\` JSON DEFAULT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Tipos de Armas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`tipos_armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(100) NOT NULL,
        \`modelos\` JSON NOT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Cursos do Usuário
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`usuario_cursos\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`usuario_id\` VARCHAR(64) NOT NULL,
        \`curso_id\` VARCHAR(64) NOT NULL,
        \`data_conclusao\` DATE DEFAULT NULL,
        \`data_validade\` DATE DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Cofres
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`cofres\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`codigo\` VARCHAR(64) NOT NULL,
        \`tipo\` ENUM('ARMAS', 'MUNIÇÕES') NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Armas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`tipo\` VARCHAR(64) NOT NULL,
        \`numero_serie\` VARCHAR(128) NOT NULL,
        \`fabricante\` VARCHAR(128) NOT NULL,
        \`modelo\` VARCHAR(128) NOT NULL,
        \`calibre\` VARCHAR(128) NOT NULL,
        \`quantidade_carregadores\` INT NOT NULL DEFAULT 1,
        \`status\` ENUM('No Cofre', 'Em Trânsito', 'Manutenção', 'Pendente de Recibo') NOT NULL DEFAULT 'No Cofre',
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`cofre_id\` VARCHAR(64) DEFAULT NULL,
        \`observacao_localizacao\` VARCHAR(255) DEFAULT NULL,
        \`data_ultima_manutencao\` DATE DEFAULT NULL,
        \`responsavel_ultima_manutencao\` VARCHAR(255) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_armas_serie\` (\`numero_serie\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Estoque de Munições
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`estoque_municoes\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`calibre_id\` VARCHAR(64) NOT NULL,
        \`quantidade\` INT NOT NULL DEFAULT 0,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`cofre_id\` VARCHAR(64) DEFAULT NULL,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 11. Movimentações de Armas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`movimentacoes_armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`arma_id\` VARCHAR(64) NOT NULL,
        \`numero_serie_arma\` VARCHAR(128) NOT NULL,
        \`modelo_arma\` VARCHAR(128) NOT NULL,
        \`tipo_arma\` VARCHAR(64) DEFAULT NULL,
        \`calibre\` VARCHAR(128) DEFAULT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`requerente_id\` VARCHAR(64) NOT NULL,
        \`nome_requerente\` VARCHAR(255) NOT NULL,
        \`masp_requerente\` VARCHAR(32) NOT NULL,
        \`cofre_retirada_id\` VARCHAR(64) DEFAULT NULL,
        \`cofre_devolucao_id\` VARCHAR(64) DEFAULT NULL,
        \`quantidade_municao\` INT NOT NULL DEFAULT 0,
        \`quantidade_carregadores\` INT NOT NULL DEFAULT 0,
        \`quantidade_municao_devolucao\` INT NOT NULL DEFAULT 0,
        \`quantidade_carregadores_devolucao\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(64) NOT NULL,
        \`aprovado_por_usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`aprovado_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`data_aprovacao\` DATETIME DEFAULT NULL,
        \`recibo_confirmado_por_usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`recibo_confirmado_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`data_recibo\` DATETIME DEFAULT NULL,
        \`possui_divergencia\` TINYINT(1) NOT NULL DEFAULT 0,
        \`justificativa_divergencia\` TEXT DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 12. Movimentações de Munições
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`movimentacoes_municoes\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`tipo\` ENUM('Entrada', 'Saída') NOT NULL,
        \`calibre_id\` VARCHAR(64) NOT NULL,
        \`quantidade\` INT NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`cofre_id\` VARCHAR(64) DEFAULT NULL,
        \`destinatario_ou_motivo\` VARCHAR(255) NOT NULL,
        \`tipo_responsavel\` VARCHAR(32) DEFAULT 'SISTEMA',
        \`responsavel_usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`responsavel_nome\` VARCHAR(255) DEFAULT NULL,
        \`responsavel_masp\` VARCHAR(64) DEFAULT NULL,
        \`observacao\` VARCHAR(500) DEFAULT NULL,
        \`quantidade_devolvida\` INT DEFAULT 0,
        \`data_devolucao\` DATETIME DEFAULT NULL,
        \`devolvido_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_usuario\` VARCHAR(255) NOT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 13. Logs de Auditoria
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`logs_auditoria\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`modulo\` VARCHAR(64) NOT NULL,
        \`acao\` VARCHAR(64) NOT NULL,
        \`detalhes\` TEXT NOT NULL,
        \`usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_usuario\` VARCHAR(255) NOT NULL,
        \`masp_usuario\` VARCHAR(32) NOT NULL,
        \`perfil_usuario\` VARCHAR(32) NOT NULL,
        \`endereco_ip\` VARCHAR(64) DEFAULT NULL,
        \`data_hora\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 14. Cursos Academia
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`cursos_academia\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`tipo\` ENUM('Formação', 'Ensino Continuado') NOT NULL,
        \`carreira\` VARCHAR(64) DEFAULT NULL,
        \`codigo\` VARCHAR(64) DEFAULT NULL,
        \`datas\` JSON DEFAULT NULL,
        \`nome_departamento\` VARCHAR(255) DEFAULT NULL,
        \`data_inicio\` DATE DEFAULT NULL,
        \`numero_modulo\` INT DEFAULT NULL,
        \`quantidade_aulas\` INT NOT NULL DEFAULT 1,
        \`dados_aulas\` JSON NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 15. Caixas de Armas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`caixas_armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`tipo_curso\` VARCHAR(64) NOT NULL,
        \`quantidade_armas\` INT NOT NULL,
        \`ids_armas\` JSON NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 16. Substituições Caixa de Armas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`substituicoes_caixa_armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`caixa_id\` VARCHAR(64) NOT NULL,
        \`nome_caixa\` VARCHAR(255) NOT NULL,
        \`arma_antiga_id\` VARCHAR(64) NOT NULL,
        \`descricao_arma_antiga\` VARCHAR(255) NOT NULL,
        \`arma_nova_id\` VARCHAR(64) NOT NULL,
        \`descricao_arma_nova\` VARCHAR(255) NOT NULL,
        \`motivo\` VARCHAR(500) NOT NULL,
        \`nome_professor\` VARCHAR(255) DEFAULT NULL,
        \`nome_responsavel\` VARCHAR(255) NOT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 17. Turmas do Curso
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`turmas_curso\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`curso_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_curso\` VARCHAR(255) NOT NULL,
        \`disciplina\` ENUM('MEAF', 'TAP', 'DP') NOT NULL,
        \`carreira\` VARCHAR(64) NOT NULL,
        \`sigla_carreira\` VARCHAR(16) NOT NULL,
        \`numero_turma\` VARCHAR(32) NOT NULL,
        \`codigo\` VARCHAR(64) NOT NULL,
        \`quantidade_alunos\` INT NOT NULL DEFAULT 1,
        \`ids_professores\` JSON NOT NULL,
        \`nome_professor\` VARCHAR(255) DEFAULT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`primeira_data_aula\` VARCHAR(32) DEFAULT NULL,
        \`ultima_data_aula\` VARCHAR(32) DEFAULT NULL,
        \`turma_calendario\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 18. Planos de Aula
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`planos_aula\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome\` VARCHAR(255) NOT NULL,
        \`carreira\` VARCHAR(64) NOT NULL,
        \`ano\` INT NOT NULL,
        \`tipo\` VARCHAR(64) NOT NULL,
        \`codigo_turma\` VARCHAR(64) DEFAULT NULL,
        \`quantidade_aulas\` INT NOT NULL DEFAULT 1,
        \`dados_aulas\` JSON NOT NULL,
        \`departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 19. Movimentações da Turma
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`movimentacoes_turma\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`curso_id\` VARCHAR(64) DEFAULT NULL,
        \`turma_id\` VARCHAR(64) DEFAULT NULL,
        \`codigo_turma\` VARCHAR(64) DEFAULT NULL,
        \`plano_aula_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_plano_aula\` VARCHAR(255) DEFAULT NULL,
        \`numero_aula\` INT NOT NULL DEFAULT 1,
        \`nome_professor\` VARCHAR(255) DEFAULT NULL,
        \`caixa_armas_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_caixa_armas\` VARCHAR(255) DEFAULT NULL,
        \`ids_armas\` JSON DEFAULT NULL,
        \`calibre_id\` VARCHAR(64) DEFAULT NULL,
        \`cofre_id\` VARCHAR(64) DEFAULT NULL,
        \`municao_fornecida\` INT DEFAULT 0,
        \`quantidade_alunos\` INT DEFAULT 0,
        \`tiros_por_aluno\` INT DEFAULT 0,
        \`tiros_instrutor\` INT DEFAULT 0,
        \`municao_usada\` INT DEFAULT 0,
        \`municao_devolvida\` INT DEFAULT 0,
        \`carregadores_extras\` INT DEFAULT 0,
        \`status\` ENUM('Em Aula', 'Finalizada') NOT NULL DEFAULT 'Em Aula',
        \`emitido_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`devolvido_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`materiais_devolvidos\` TEXT DEFAULT NULL,
        \`observacoes\` TEXT DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_devolucao\` DATETIME DEFAULT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 20. Aluno Turma
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`aluno_turma\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`turma_id\` VARCHAR(64) DEFAULT NULL,
        \`turma_aluno\` VARCHAR(64) NOT NULL,
        \`modulo_aluno\` VARCHAR(64) DEFAULT NULL,
        \`professor_aluno\` VARCHAR(255) DEFAULT NULL,
        \`instrutor1_aluno\` VARCHAR(255) DEFAULT NULL,
        \`instrutor2_aluno\` VARCHAR(255) DEFAULT NULL,
        \`instrutor3_aluno\` VARCHAR(255) DEFAULT NULL,
        \`instrutor4_aluno\` VARCHAR(255) DEFAULT NULL,
        \`masp_aluno\` VARCHAR(64) DEFAULT NULL,
        \`nome_aluno\` VARCHAR(255) NOT NULL,
        \`situacao_aluno\` VARCHAR(64) NOT NULL DEFAULT 'Ativo',
        \`departamento_aluno\` VARCHAR(255) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_aluno_turma_id\` (\`turma_id\`),
        KEY \`idx_aluno_turma_code\` (\`turma_aluno\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 21. Aluno Aulas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`aluno_aulas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`aluno_id\` VARCHAR(64) NOT NULL,
        \`aula_nome_aluno\` VARCHAR(255) NOT NULL,
        \`aula_numero_aluno\` INT NOT NULL DEFAULT 1,
        \`aula_data_aluno\` DATE DEFAULT NULL,
        \`aula_hora_aluno\` VARCHAR(32) DEFAULT NULL,
        \`aula_conteudo_aluno\` VARCHAR(500) DEFAULT NULL,
        \`observacao_aluno\` TEXT DEFAULT NULL,
        \`nota_aluno\` VARCHAR(32) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_aluno_aulas_aluno\` (\`aluno_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 22. Calendario Aulas
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`calendario_aulas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`data_calendario\` DATE NOT NULL,
        \`horario_calendario\` VARCHAR(64) NOT NULL,
        \`turma_calendario\` VARCHAR(64) NOT NULL,
        \`sigla_calendario\` VARCHAR(64) NOT NULL,
        \`disciplina_calendario\` VARCHAR(255) DEFAULT NULL,
        \`sala_calendario\` VARCHAR(100) DEFAULT NULL,
        \`curso_calendario\` VARCHAR(255) DEFAULT NULL,
        \`modulo_calendario\` VARCHAR(100) DEFAULT NULL,
        \`ano_calendario\` VARCHAR(64) DEFAULT NULL,
        \`numero_aula_calendario\` VARCHAR(64) DEFAULT NULL,
        \`equipe_calendario\` VARCHAR(100) DEFAULT NULL,
        \`observacao_calendario\` TEXT DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 23. Equipe Calendario
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`equipe_calendario\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`nome_da_equipe\` VARCHAR(100) NOT NULL,
        \`materia\` VARCHAR(100) NOT NULL,
        \`tipo_curso\` VARCHAR(100) NOT NULL DEFAULT 'Curso de Formação',
        \`nome_do_curso\` VARCHAR(255) NOT NULL,
        \`codigo_curso\` VARCHAR(100) DEFAULT NULL,
        \`dates_curso\` TEXT DEFAULT NULL,
        \`modulo\` VARCHAR(100) NOT NULL,
        \`ano\` VARCHAR(10) DEFAULT NULL,
        \`data\` DATE DEFAULT NULL,
        \`professor_titular_id\` VARCHAR(64) DEFAULT NULL,
        \`professor_titular_nome\` VARCHAR(255) DEFAULT NULL,
        \`sigla_professor\` VARCHAR(64) DEFAULT NULL,
        \`instrutor_id\` VARCHAR(64) DEFAULT NULL,
        \`instrutor_nome\` VARCHAR(255) DEFAULT NULL,
        \`sigla_instrutor\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 24. Professores Equipe
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`professores_equipe\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`equipe_id\` VARCHAR(64) NOT NULL,
        \`nome_professor\` VARCHAR(255) DEFAULT NULL,
        \`sigla_professor\` VARCHAR(64) DEFAULT NULL,
        \`titular\` VARCHAR(10) DEFAULT 'Não',
        \`instrutor\` VARCHAR(10) DEFAULT NULL,
        \`tipo_funcao\` VARCHAR(50) DEFAULT 'INSTRUTOR',
        \`professor_titular_id\` VARCHAR(64) DEFAULT NULL,
        \`professor_titular_nome\` VARCHAR(255) DEFAULT NULL,
        \`instrutor_id\` VARCHAR(64) DEFAULT NULL,
        \`instrutor_nome\` VARCHAR(255) DEFAULT NULL,
        \`sigla_instrutor\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_prof_eq_id\` (\`equipe_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 25. Auxiliar Tabela Equipe
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`auxiliar_tabela_equipe\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`equipe_id\` VARCHAR(64) DEFAULT NULL,
        \`nome_da_equipe\` VARCHAR(100) NOT NULL,
        \`turma_id\` VARCHAR(64) DEFAULT NULL,
        \`codigo_turma\` VARCHAR(64) NOT NULL,
        \`materia\` VARCHAR(100) NOT NULL,
        \`professor_titular_id\` VARCHAR(64) DEFAULT NULL,
        \`professor_titular_nome\` VARCHAR(255) DEFAULT NULL,
        \`sigla_professor\` VARCHAR(64) DEFAULT NULL,
        \`professores\` JSON DEFAULT NULL,
        \`data_inicio\` DATE NOT NULL,
        \`data_fim\` DATE NOT NULL,
        \`observacao\` TEXT DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_aux_eq_equipe\` (\`equipe_id\`),
        KEY \`idx_aux_eq_turma\` (\`codigo_turma\`),
        KEY \`idx_aux_eq_periodo\` (\`data_inicio\`, \`data_fim\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 26. Certificados
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`certificados\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`codigo_autenticacao\` VARCHAR(128) NOT NULL,
        \`titulo\` VARCHAR(255) NOT NULL,
        \`nome_aluno\` VARCHAR(255) NOT NULL,
        \`cpf_masp\` VARCHAR(64) DEFAULT NULL,
        \`descricao\` TEXT DEFAULT NULL,
        \`nome_arquivo\` VARCHAR(255) NOT NULL,
        \`pdf_base64\` LONGTEXT NOT NULL,
        \`pdf_stamped_base64\` LONGTEXT DEFAULT NULL,
        \`tamanho_bytes\` INT DEFAULT NULL,
        \`tipo_mime\` VARCHAR(64) DEFAULT 'application/pdf',
        \`data_emissao\` DATE DEFAULT NULL,
        \`criado_por_usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`criado_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`status\` ENUM('Valido', 'Revogado') NOT NULL DEFAULT 'Valido',
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`data_atualizacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_codigo_autenticacao\` (\`codigo_autenticacao\`),
        KEY \`idx_cert_nome_aluno\` (\`nome_aluno\`),
        KEY \`idx_cert_cpf_masp\` (\`cpf_masp\`),
        KEY \`idx_cert_data_emissao\` (\`data_emissao\`),
        KEY \`idx_cert_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 27. Transferências de Armas entre Unidades
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`transferencias_armas\` (
        \`id\` VARCHAR(64) NOT NULL,
        \`numero_protocolo\` VARCHAR(64) DEFAULT NULL,
        \`data_transferencia\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`origem_departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`origem_departamento_nome\` VARCHAR(255) DEFAULT NULL,
        \`origem_unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`origem_unidade_nome\` VARCHAR(255) DEFAULT NULL,
        \`destino_departamento_id\` VARCHAR(64) DEFAULT NULL,
        \`destino_departamento_nome\` VARCHAR(255) DEFAULT NULL,
        \`destino_unidade_id\` VARCHAR(64) DEFAULT NULL,
        \`destino_unidade_nome\` VARCHAR(255) DEFAULT NULL,
        \`destino_cofre_id\` VARCHAR(64) DEFAULT NULL,
        \`destino_cofre_codigo\` VARCHAR(64) DEFAULT NULL,
        \`responsavel_id\` VARCHAR(64) NOT NULL,
        \`responsavel_nome\` VARCHAR(255) NOT NULL,
        \`responsavel_masp\` VARCHAR(32) NOT NULL,
        \`responsavel_perfil\` VARCHAR(64) NOT NULL,
        \`transportador_nome\` VARCHAR(255) NOT NULL,
        \`transportador_masp\` VARCHAR(32) NOT NULL,
        \`transportador_cargo\` VARCHAR(64) DEFAULT NULL,
        \`motivo\` TEXT NOT NULL,
        \`armas_json\` JSON NOT NULL,
        \`total_armas\` INT NOT NULL DEFAULT 1,
        \`total_carregadores\` INT NOT NULL DEFAULT 0,
        \`observacao\` TEXT DEFAULT NULL,
        \`status\` ENUM('Pendente', 'Recebido', 'Cancelado') NOT NULL DEFAULT 'Pendente',
        \`recebido_em\` DATETIME DEFAULT NULL,
        \`recebido_por_usuario_id\` VARCHAR(64) DEFAULT NULL,
        \`recebido_por_nome\` VARCHAR(255) DEFAULT NULL,
        \`recebido_por_masp\` VARCHAR(32) DEFAULT NULL,
        \`recebido_por_perfil\` VARCHAR(64) DEFAULT NULL,
        \`data_criacao\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_trf_origem\` (\`origem_unidade_id\`),
        KEY \`idx_trf_destino\` (\`destino_unidade_id\`),
        KEY \`idx_trf_status\` (\`status\`),
        KEY \`idx_trf_data\` (\`data_transferencia\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migrations for existing transferencias_armas tables
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`status\` ENUM('Pendente', 'Recebido', 'Cancelado') NOT NULL DEFAULT 'Pendente';`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`recebido_em\` DATETIME DEFAULT NULL;`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`recebido_por_usuario_id\` VARCHAR(64) DEFAULT NULL;`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`recebido_por_nome\` VARCHAR(255) DEFAULT NULL;`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`recebido_por_masp\` VARCHAR(32) DEFAULT NULL;`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE \`transferencias_armas\` ADD COLUMN \`recebido_por_perfil\` VARCHAR(64) DEFAULT NULL;`);
    } catch (_) {}

    // Create Backwards Compatible SQL Views for legacy English code queries
    try {
      await connection.query(`CREATE OR REPLACE VIEW \`departments\` AS SELECT id, nome AS name, codigo AS code, data_criacao AS created_at FROM \`departamentos\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`units\` AS SELECT id, departamento_id AS department_id, nome AS name, data_criacao AS created_at FROM \`unidades\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`users\` AS SELECT id, masp, senha AS password, nome AS name, telefone AS phone, cargo, perfil AS role, departamento_id AS department_id, unidade_id AS unit_id, pode_mover_municao AS can_move_ammo, pode_mover_armas AS can_move_weapons, tem_acesso_sistema AS has_system_access, eh_professor AS is_teacher, disciplina_professor AS teacher_subject, professor_sigla, deve_alterar_senha AS must_change_password, data_criacao AS created_at FROM \`usuarios\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`calibers\` AS SELECT id, nome AS name, data_criacao AS created_at FROM \`calibres\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`available_weapon_types\` AS SELECT id, nome AS name, modelos AS models, data_criacao AS created_at FROM \`tipos_armas\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`vault_spaces\` AS SELECT id, codigo AS code, tipo AS type, departamento_id AS department_id, unidade_id AS unit_id, data_criacao AS created_at FROM \`cofres\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`weapons\` AS SELECT id, tipo AS type, numero_serie AS serial_number, fabricante AS manufacturer, modelo AS model, calibre, quantidade_carregadores AS magazine_quantity, status, departamento_id AS department_id, unidade_id AS unit_id, cofre_id AS vault_space_id, observacao_localizacao AS location_note, data_ultima_manutencao AS last_maintenance_date, responsavel_ultima_manutencao AS last_maintenance_responsible, data_criacao AS created_at FROM \`armas\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`weapon_transfers\` AS SELECT id, numero_protocolo AS protocol_number, data_transferencia AS transfer_date, origem_departamento_id AS origin_department_id, origem_departamento_nome AS origin_department_name, origem_unidade_id AS origin_unit_id, origem_unidade_nome AS origin_unit_name, destino_departamento_id AS destination_department_id, destino_departamento_nome AS destination_department_name, destino_unidade_id AS destination_unit_id, destino_unidade_nome AS destination_unit_name, destino_cofre_id AS destination_vault_space_id, destino_cofre_codigo AS destination_vault_space_code, responsavel_id AS transferred_by_user_id, responsavel_nome AS transferred_by_user_name, responsavel_masp AS transferred_by_user_masp, responsavel_perfil AS transferred_by_user_role, transportador_nome AS receiver_or_transporter_name, transportador_masp AS receiver_or_transporter_masp, transportador_cargo AS receiver_or_transporter_cargo, motivo AS reason, armas_json AS weapons_json, total_armas AS total_weapons, total_carregadores AS total_magazines, observacao AS observation, status, recebido_em AS received_at, recebido_por_usuario_id AS received_by_user_id, recebido_por_nome AS received_by_user_name, recebido_por_masp AS received_by_user_masp, recebido_por_perfil AS received_by_user_role, data_criacao AS created_at FROM \`transferencias_armas\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`ammo_stocks\` AS SELECT id, calibre_id, quantidade AS quantity, departamento_id AS department_id, unidade_id AS unit_id, cofre_id AS vault_space_id, data_atualizacao AS updated_at FROM \`estoque_municoes\`;`);

      await connection.query(`CREATE OR REPLACE VIEW \`courses\` AS SELECT id, nome AS name, modelos_permitidos AS allowed_models, calibres_permitidos AS allowed_calibers, tipos_armas_permitidos AS allowed_weapon_types, tiros_por_aluno AS shots_per_student, tiros_por_tipo_arma AS shots_per_weapon_type, departamento_id AS department_id, data_criacao AS created_at FROM \`cursos\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`user_courses\` AS SELECT id, usuario_id AS user_id, curso_id, data_conclusao AS completion_date, data_validade AS expiration_date, data_criacao AS created_at FROM \`usuario_cursos\`;`);
      await connection.query(`CREATE OR REPLACE VIEW \`audit_logs\` AS SELECT id, modulo AS module, acao AS action, detalhes AS details, usuario_id AS user_id, nome_usuario AS user_name, masp_usuario AS user_masp, perfil_usuario AS user_role, endereco_ip AS ip_address, data_hora AS timestamp FROM \`logs_auditoria\`;`);
    } catch (e) {
      console.warn('Views backwards compatibility warning:', e);
    }

    // --- SEED INITIAL DATA IN PORTUGUESE TABLES IF EMPTY ---
    const [deptRows]: any = await connection.query('SELECT COUNT(*) as count FROM departamentos');
    if (deptRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'departamentos'...");
      await connection.query(`
        INSERT INTO departamentos (id, nome, codigo) VALUES
        ('dept-acad', 'ACADEMIA DE POLICIA', 'ACADEPOL'),
        ('dept-coe', 'DEPARTAMENTO DE OPERAÇÕES ESTRATÉGICAS (COE)', 'DOE-COE'),
        ('dept-dhpp', 'DEPARTAMENTO DE HOMICÍDIOS E PROTEÇÃO À PESSOA (DHPP)', 'DHPP'),
        ('dept-dic', 'DEPARTAMENTO DE INVESTIGAÇÕES CRIMINAIS (DIC)', 'DIC');
      `);
    }

    const [unitRows]: any = await connection.query('SELECT COUNT(*) as count FROM unidades');
    if (unitRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'unidades'...");
      await connection.query(`
        INSERT INTO unidades (id, departamento_id, nome) VALUES
        ('unit-acad-meaf', 'dept-acad', 'MEAF - Módulo de Ensino de Armamento e Tiro'),
        ('unit-coe-insp', 'dept-coe', 'INSPETORIA COE'),
        ('unit-coe-grt', 'dept-coe', 'GRUPO DE RESGATE TÁTICO (GRT)'),
        ('unit-dhpp-1', 'dept-dhpp', '1ª DELEGACIA DE HOMICÍDIOS'),
        ('unit-dic-cargas', 'dept-dic', 'DELEGACIA DE REPRESSÃO AO ROUBO DE CARGAS');
      `);
    }

    const [wtRows]: any = await connection.query('SELECT COUNT(*) as count FROM tipos_armas');
    if (wtRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'tipos_armas'...");
      await connection.query(`
        INSERT INTO tipos_armas (id, nome, modelos) VALUES
        ('wt-pistola', 'Pistola', '["PT100", "PT24/7", "TS9", "Glock G22", "Glock G17", "Glock G19", "PT840", "PT92", "M&P9", "APX"]'),
        ('wt-fuzil', 'Fuzil', '["T4", "IA2", "MD97", "FAL 7.62", "M4A1", "AR-15", "HK416"]'),
        ('wt-submet', 'Submetralhadora', '["SMT40", "MT12", "MP5", "UMP40", "SAF 9mm"]'),
        ('wt-espingarda', 'Espingarda', '["Calibre 12 CBC 586", "Calibre 12 Benelli M4", "Calibre 12 Mossberg 500", "Calibre 12 Boito"]'),
        ('wt-revolver', 'Revólver', '["RT 889", "RT 85", "RT 82", "RT 357"]'),
        ('wt-carabina', 'Carabina', '["CT40", "CT9", "CCT9"]');
      `);
    }

    const [caliberRows]: any = await connection.query('SELECT COUNT(*) as count FROM calibres');
    if (caliberRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'calibres'...");
      await connection.query(`
        INSERT INTO calibres (id, nome) VALUES
        ('cal-556', '5,56x45mm'),
        ('cal-40', '.40 S&W'),
        ('cal-9mm', '9x19mm'),
        ('cal-380', '.380 ACP'),
        ('cal-12ga', '12 GA');
      `);
    }

    const [courseRows]: any = await connection.query('SELECT COUNT(*) as count FROM cursos');
    if (courseRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'cursos'...");
      await connection.query(`
        INSERT INTO cursos (id, nome, modelos_permitidos, calibres_permitidos, departamento_id) VALUES
        ('course-fuzil', 'Operador de fuzil', '["T4", "IA2", "M4A1"]', '["5,56x45mm"]', 'dept-coe'),
        ('course-pistola', 'Operador de Pistola', '["PT92", "Glock G22", "TH40", "PT840"]', '[".40 S&W", "9x19mm"]', 'dept-coe'),
        ('course-12', 'Operador de Espingarda C12', '["CBC 586-P", "Benelli M4"]', '["12 GA"]', 'dept-coe');
      `);
    }

    const [vaultRows]: any = await connection.query('SELECT COUNT(*) as count FROM cofres');
    if (vaultRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'cofres'...");
      await connection.query(`
        INSERT INTO cofres (id, codigo, tipo, departamento_id, unidade_id) VALUES
        ('vault-acad-1', 'COFRE-MEAF-01', 'ARMAS', 'dept-acad', 'unit-acad-meaf'),
        ('vault-acad-2', 'COFRE-MEAF-02', 'MUNIÇÕES', 'dept-acad', 'unit-acad-meaf'),
        ('vault-coe-1', 'A1-G1', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-2', 'A1-G2', 'ARMAS', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-3', 'C1-L1', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
        ('vault-coe-4', 'C1-L2', 'MUNIÇÕES', 'dept-coe', 'unit-coe-insp'),
        ('vault-dhpp-1', 'B1-G1', 'ARMAS', 'dept-dhpp', 'unit-dhpp-1'),
        ('vault-dhpp-2', 'M1-L1', 'MUNIÇÕES', 'dept-dhpp', 'unit-dhpp-1');
      `);
    }

    const [userRows]: any = await connection.query('SELECT COUNT(*) as count FROM usuarios');
    if (userRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'usuarios'...");
      await connection.query(`
        INSERT INTO usuarios (id, masp, senha, nome, telefone, cargo, perfil, departamento_id, unidade_id, pode_mover_municao, pode_mover_armas, tem_acesso_sistema, deve_alterar_senha) VALUES
        ('usr-master-geral', '1255748', '1255748', 'Administrador Geral Master', '31999998888', 'Delegado', 'Geral', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 1),
        ('usr-admin-coe', '2222222', '2222222', 'Dr. Roberto Silva (Admin DOE)', '31988887777', 'Delegado', 'Administrador', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0),
        ('usr-armeiro-coe', '3333333', '3333333', 'Agente Carlos Andrade (Armeiro COE)', '31977776666', 'Investigador', 'Armeiro', 'dept-coe', 'unit-coe-insp', 1, 1, 1, 0),
        ('usr-prof-meaf-1', '6666666', '6666666', 'Prof. Marcus Vinícius (Instrutor MEAF)', '31944443333', 'Investigador', 'Policial', 'dept-acad', 'unit-acad-meaf', 1, 1, 1, 0),
        ('usr-policial-coe', '4444444', '4444444', 'Policial Eduardo Costa', '31966665555', 'Investigador', 'Policial', 'dept-coe', 'unit-coe-insp', 0, 0, 1, 0),
        ('usr-policial-dhpp', '5555555', '5555555', 'Escrivã Ana Lima', '31955554444', 'Escrivão', 'Policial', 'dept-dhpp', 'unit-dhpp-1', 0, 0, 1, 0);
      `);

      await connection.query(`
        INSERT INTO usuario_cursos (id, usuario_id, curso_id, data_conclusao, data_validade) VALUES
        ('uc-1', 'usr-master-geral', 'course-fuzil', '2025-10-15', '2027-10-15'),
        ('uc-2', 'usr-master-geral', 'course-pistola', '2025-11-20', '2027-11-20'),
        ('uc-3', 'usr-admin-coe', 'course-fuzil', '2025-05-10', '2027-05-10'),
        ('uc-4', 'usr-admin-coe', 'course-pistola', '2025-06-01', '2027-06-01'),
        ('uc-5', 'usr-armeiro-coe', 'course-fuzil', '2025-01-15', '2027-01-15'),
        ('uc-6', 'usr-armeiro-coe', 'course-pistola', '2025-02-10', '2027-02-10'),
        ('uc-7', 'usr-armeiro-coe', 'course-12', '2025-03-01', '2027-03-01'),
        ('uc-8', 'usr-policial-coe', 'course-fuzil', '2025-08-12', '2027-08-12'),
        ('uc-9', 'usr-policial-coe', 'course-pistola', '2023-01-10', '2025-01-10'),
        ('uc-10', 'usr-policial-dhpp', 'course-pistola', '2025-04-10', '2027-04-10');
      `);
    }

    const [weaponRows]: any = await connection.query('SELECT COUNT(*) as count FROM armas');
    if (weaponRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'armas'...");
      await connection.query(`
        INSERT INTO armas (id, tipo, numero_serie, fabricante, modelo, calibre, quantidade_carregadores, status, departamento_id, unidade_id, cofre_id, data_ultima_manutencao, responsavel_ultima_manutencao) VALUES
        ('weap-1', 'Fuzil', 'EKG-5486', 'Taurus', 'T4', '5,56x45mm', 4, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-1', '2026-05-10', 'Agente Carlos Andrade'),
        ('weap-2', 'Pistola', 'PT-998822', 'Taurus', 'PT92', '.40 S&W', 3, 'No Cofre', 'dept-coe', 'unit-coe-insp', 'vault-coe-2', '2026-06-15', 'Agente Carlos Andrade'),
        ('weap-3', 'Espingarda', 'CBC-12009', 'CBC', 'CBC 586-P', '12 GA', 1, 'No Cofre', 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-1', '2026-04-01', 'Armeiro DHPP');
      `);
    }

    const [ammoStockRows]: any = await connection.query('SELECT COUNT(*) as count FROM estoque_municoes');
    if (ammoStockRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'estoque_municoes'...");
      await connection.query(`
        INSERT INTO estoque_municoes (id, calibre_id, quantidade, departamento_id, unidade_id, cofre_id) VALUES
        ('stock-1', 'cal-556', 2500, 'dept-coe', 'unit-coe-insp', 'vault-coe-3'),
        ('stock-2', 'cal-40', 1200, 'dept-coe', 'unit-coe-insp', 'vault-coe-4'),
        ('stock-3', 'cal-9mm', 800, 'dept-dhpp', 'unit-dhpp-1', 'vault-dhpp-2'),
        ('stock-acad-40', 'cal-40', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2'),
        ('stock-acad-9mm', 'cal-9mm', 5000, 'dept-acad', 'unit-acad-meaf', 'vault-acad-2');
      `);
    }

    const [auditRows]: any = await connection.query('SELECT COUNT(*) as count FROM logs_auditoria');
    if (auditRows[0].count === 0) {
      logs.push("Inserindo dados iniciais em 'logs_auditoria'...");
      await connection.query(`
        INSERT INTO logs_auditoria (id, data_hora, usuario_id, nome_usuario, masp_usuario, perfil_usuario, modulo, acao, detalhes, endereco_ip) VALUES
        ('log-1', NOW(), 'usr-master-geral', 'Administrador Geral Master', '1255748', 'Geral', 'Sistema', 'Remodelagem do Banco', 'Inicialização do banco de dados 100% remodelado e traduzido para o Português', '127.0.0.1');
      `);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
    connection.release();

    return {
      success: true,
      message: 'Todas as tabelas do MySQL foram remodeladas e organizadas em Português com sucesso!',
      log: logs,
    };
  } catch (err: any) {
    console.error('[MySQL Init Schema Error]', err);
    return {
      success: false,
      message: `Erro ao inicializar tabelas MySQL: ${err.message}`,
      log: logs,
    };
  }
}
