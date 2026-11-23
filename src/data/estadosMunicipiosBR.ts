import { MUNICIPIOS_MG } from './municipiosMG';

export interface EstadoBR {
  sigla: string;
  nome: string;
}

export const ESTADOS_BR: readonly EstadoBR[] = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
];

export const DEPARTAMENTOS_APOIO_OPERACAO: readonly string[] = [
  'COE',
  '1º Belo Horizonte',
  '2º Contagem',
  '3º Vespasiano',
  '4º Juiz de Fora',
  '5º Uberaba',
  '6º Lavras',
  '7º Divinópolis',
  '8º Governador Valadares',
  '9º Uberlândia',
  '10º Patos de Minas',
  '11º Montes Claros',
  '12º Ipatinga',
  '13º Barbacena',
  '14º Curvelo',
  '15º Teófilo Otoni',
  '16º Unaí',
  '17º Pouso Alegre',
  '18º Poços de Caldas',
  '19º Sete Lagoas',
  'DEOESP',
  'DECCOF',
  'DHPP',
  'DENARC',
  'DEFAM',
  'DEPATRI',
  'DEMA',
  'DEICT'
];

const FALLBACK_MUNICIPIOS_POR_UF: Record<string, readonly string[]> = {
  AC: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó'],
  AL: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios', 'União dos Palmares'],
  AP: ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Mazagão'],
  AM: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Itabuna', 'Juazeiro', 'Ilhéus', 'Lauro de Freitas', 'Barreiras', 'Teixeira de Freitas', 'Porto Seguro'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral', 'Crato', 'Itapipoca'],
  DF: ['Brasília'],
  ES: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Cachoeiro de Itapemirim', 'Linhares', 'Colatina', 'Guarapari', 'São Mateus'],
  GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia', 'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Catalão', 'Itumbiara', 'Formosa'],
  MA: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias', 'Codó', 'Paço do Lumiar'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra', 'Cáceres', 'Sorriso'],
  MS: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã', 'Naviraí'],
  MG: MUNICIPIOS_MG,
  PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Parauapebas', 'Castanhal', 'Abaetetuba'],
  PB: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux', 'Sousa', 'Cajazeiras'],
  PR: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava'],
  PE: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina', 'Paulista', 'Cabo de Santo Agostinho'],
  PI: ['Teresina', 'Parnaíba', 'Picos', 'Piripiri', 'Floriano'],
  RJ: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Belford Roxo', 'Campos dos Goytacazes', 'São João de Meriti', 'Petrópolis', 'Volta Redonda', 'Macaé', 'Cabo Frio', 'Angra dos Reis', 'Resende'],
  RN: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba', 'Caicó'],
  RS: ['Porto Alegre', 'Caxias do Sul', 'Canoas', 'Pelotas', 'Santa Maria', 'Gravataí', 'Viamão', 'Novo Hamburgo', 'Passo Fundo'],
  RO: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal'],
  RR: ['Boa Vista', 'Rorainópolis', 'Caracaraí', 'Pacaraima'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó', 'Criciúma', 'Itajaí', 'Balneário Camboriú', 'Lages'],
  SP: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'Sorocaba', 'Ribeirão Preto', 'São José dos Campos', 'Santos', 'Bauru', 'Piracicaba', 'Franca', 'Jundiaí', 'São José do Rio Preto', 'Presidente Prudente', 'Barueri', 'Taubaté'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'Estância'],
  TO: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins']
};

const municipiosCache = new Map<string, string[]>([
  ['MG', [...MUNICIPIOS_MG]]
]);

export function getCachedMunicipiosPorUF(uf: string): string[] {
  const norm = String(uf || 'MG').trim().toUpperCase();
  return municipiosCache.get(norm) || [...(FALLBACK_MUNICIPIOS_POR_UF[norm] || [])];
}

export async function fetchMunicipiosPorUF(uf: string): Promise<string[]> {
  const norm = String(uf || 'MG').trim().toUpperCase();
  if (municipiosCache.has(norm)) {
    return municipiosCache.get(norm)!;
  }

  // 1. Tenta o endpoint local (proxy com cache em servidor para IBGE)
  try {
    const res = await fetch(`/api/ibge/municipios/${encodeURIComponent(norm)}`, {
      headers: { 'x-skip-preloader': 'true' }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const list = data.map((item: any) => String(item)).filter(Boolean);
        municipiosCache.set(norm, list);
        return list;
      }
    }
  } catch {
    // continua para fallback direto IBGE
  }

  // 2. Fallback direto à API oficial pública do IBGE
  try {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(norm)}/municipios?orderBy=nome`
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const list = data
          .map((m: any) => String(m?.nome || '').trim())
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
        municipiosCache.set(norm, list);
        return list;
      }
    }
  } catch {
    // continua para fallback embutido
  }

  const fallback = [...(FALLBACK_MUNICIPIOS_POR_UF[norm] || [])];
  municipiosCache.set(norm, fallback);
  return fallback;
}
