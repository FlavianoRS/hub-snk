/**
 * Planilha de cronograma da "Equipe do Projeto" (reserva da Agenda de Recursos pelo GP) —
 * pra importar reservas em lote em vez de preencher uma por uma.
 *
 * O modelo baixado copia a aba `Cópia de Cronograma_FAP` do cronograma ELLIX (padrão mais
 * usado entre os GPs, spec seção 2.1): mesmo layout em blocos por Etapa, mesmas cores. Na
 * importação o Hub procura essa aba pelo nome em qualquer `.xlsx` — o modelo dele ou o
 * cronograma que o GP já usa — e lê as colunas pelo nome do cabeçalho, não pela posição.
 * `Agenda meet` e `Tarefa` ficam no cabeçalho pro GP enxergar o padrão que já usa, mas o
 * parser não as lê.
 */
import ExcelJS from 'exceljs';

export const NOME_ABA_CRONOGRAMA = 'Cópia de Cronograma_FAP';

export const CABECALHO_MODELO = [
  'Etapa',
  'Processo',
  'Consultor',
  'Usuário Chave',
  'Data',
  'Hr início',
  'Hr fim',
  'Planejado',
  'Realizado',
  'Agenda meet',
  'Tarefa',
] as const;

/** Etapas do cronograma ELLIX — um bloco cada no modelo, o GP renomeia/apaga o que não usar. */
const ETAPAS_DO_MODELO = [
  'Validação de escopo',
  'Configuração',
  'Homologação',
  'Simulação',
  'Pré GO LIVE',
  'GO LIVE',
  'Operação assistida',
];
const LINHAS_POR_ETAPA = 6;

const COR_TEXTO = 'FF003944';
const COR_TITULO = 'FF66CC66';
const COR_PLANEJADO = 'FFA64D79';
const COR_REALIZADO = 'FFFF9900';
const COR_CINZA = 'FFEFEFEF';
const COR_BORDA_CABECALHO = 'FFB7B7B7';
const COR_BORDA = 'FF000000';

export interface LinhaEquipePlanilha {
  /** Linha 1-based na planilha, pra apontar erro de volta pro GP. */
  linha: number;
  etapa: string;
  processo: string;
  consultorTexto: string;
  /** `YYYY-MM-DD`. */
  data: string;
  /** `HH:mm`. */
  horaInicio: string;
  /** `HH:mm`. */
  horaFim: string;
}

export interface ErroLinhaPlanilha {
  linha: number;
  motivo: string;
}

export interface ResultadoLeituraPlanilha {
  linhas: LinhaEquipePlanilha[];
  erros: ErroLinhaPlanilha[];
}

function preencher(celula: ExcelJS.Cell, argb: string): void {
  celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function bordaFina(argb: string): Partial<ExcelJS.Borders> {
  const lado = { style: 'thin' as const, color: { argb } };
  return { top: lado, bottom: lado, left: lado, right: lado };
}

/** Hora como fração do dia (o que o Excel grava), pra fórmula `Hr fim - Hr início` funcionar. */
function hora(h: number, m = 0): Date {
  return new Date(Date.UTC(1899, 11, 30, h, m));
}

/** Gera o `.xlsx` no layout da aba `Cópia de Cronograma_FAP`, com uma linha de exemplo. */
export async function gerarModeloEquipeXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet(NOME_ABA_CRONOGRAMA, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  aba.columns = [
    7.86, 39.57, 53.86, 25.29, 29.29, 14.57, 10.86, 13, 13.57, 12.71, 13.86, 14.71,
  ].map((width) => ({ width, style: { font: { name: 'Roboto', size: 10 } } }));
  aba.getRow(1).height = 9;

  const titulos: number[] = [];
  let numero = 5;
  ETAPAS_DO_MODELO.forEach((etapa, indice) => {
    const primeira = numero + 2;
    const ultima = primeira + LINHAS_POR_ETAPA - 1;

    // Título do bloco: "Agendas" mesclado em C:H, total Planejado (roxo) e Realizado (laranja).
    const titulo = aba.getRow(numero);
    titulo.height = 23.25;
    aba.mergeCells(`C${numero}:H${numero}`);
    const celulaTitulo = titulo.getCell('C');
    celulaTitulo.value = 'Agendas';
    celulaTitulo.font = { name: 'Roboto', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    celulaTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
    celulaTitulo.border = bordaFina(COR_BORDA_CABECALHO);
    preencher(celulaTitulo, COR_TITULO);
    for (const coluna of ['I', 'J', 'K', 'L']) {
      const celula = titulo.getCell(coluna);
      const planejado = coluna === 'I';
      preencher(celula, planejado ? COR_PLANEJADO : COR_REALIZADO);
      celula.font = {
        name: 'Roboto',
        size: 10,
        bold: true,
        color: { argb: planejado ? 'FFFFFFFF' : 'FF000000' },
      };
      celula.alignment = { horizontal: 'center', vertical: 'middle' };
      celula.numFmt = '[h]:mm:ss';
      if (coluna === 'I' || coluna === 'J')
        celula.value = { formula: `SUM(${coluna}${primeira}:${coluna}${ultima})` };
    }
    titulos.push(numero);

    const cabecalho = aba.getRow(numero + 1);
    cabecalho.height = 23.25;
    CABECALHO_MODELO.forEach((nome, i) => {
      const celula = cabecalho.getCell(i + 2);
      celula.value = nome;
      celula.font = { name: 'Roboto', size: 10, color: { argb: 'FFFFFFFF' } };
      celula.alignment = { horizontal: 'center', vertical: 'middle' };
      celula.border = bordaFina(COR_BORDA_CABECALHO);
      preencher(celula, COR_TEXTO);
    });

    for (let n = primeira; n <= ultima; n++) {
      const linha = aba.getRow(n);
      linha.height = 23.25;
      for (let c = 2; c <= 12; c++) {
        const celula = linha.getCell(c);
        celula.border = bordaFina(COR_BORDA);
        celula.alignment = { horizontal: 'center', vertical: 'middle' };
        const preto = c === 5 || c === 6 || c >= 9;
        celula.font = {
          name: 'Roboto',
          size: 10,
          bold: c === 2,
          color: { argb: preto ? 'FF000000' : COR_TEXTO },
        };
        if (c >= 9) preencher(celula, COR_CINZA);
      }
      linha.getCell('F').numFmt = 'dd/mm/yyyy';
      linha.getCell('G').numFmt = 'hh:mm';
      linha.getCell('H').numFmt = 'hh:mm';
      linha.getCell('I').numFmt = '[h]:mm:ss';
      linha.getCell('J').numFmt = '[h]:mm:ss';
      linha.getCell('I').value = { formula: `IF(H${n}="","",H${n}-G${n})` };
    }
    aba.mergeCells(`B${primeira}:B${ultima}`);
    aba.getCell(`B${primeira}`).value = etapa;

    if (indice === 0) {
      const exemplo = aba.getRow(primeira);
      exemplo.getCell('C').value = 'Mapeamento de processos';
      exemplo.getCell('D').value = 'Fulano da Silva';
      exemplo.getCell('E').value = 'Usuário do cliente';
      exemplo.getCell('F').value = new Date(Date.UTC(2026, 10, 15));
      exemplo.getCell('G').value = hora(9);
      exemplo.getCell('H').value = hora(12);
      exemplo.getCell('C').note =
        'Linha de exemplo — pode apagar antes de importar, ou sobrescrever com a primeira reserva.';
    }
    numero = ultima + 2;
  });

  // Total geral no topo, igual ao cronograma: soma dos totais de cada bloco.
  const total = aba.getRow(2);
  total.height = 21;
  total.getCell('H').value = 'TOTAL';
  total.getCell('H').font = { name: 'Roboto', size: 10, bold: true };
  for (const [coluna, cor, fonte] of [
    ['I', COR_PLANEJADO, 'FFFFFFFF'],
    ['J', COR_REALIZADO, 'FF000000'],
  ] as const) {
    const celula = total.getCell(coluna);
    celula.value = { formula: titulos.map((t) => `${coluna}${t}`).join('+') };
    celula.numFmt = '[h]:mm:ss';
    celula.font = { name: 'Roboto', size: 10, bold: true, color: { argb: fonte } };
    celula.alignment = { horizontal: 'center', vertical: 'middle' };
    preencher(celula, cor);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object' && 'text' in valor)
    return String((valor as { text: unknown }).text ?? '');
  if (typeof valor === 'object' && 'richText' in valor) {
    return (valor as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
  }
  return String(valor).trim();
}

/** Nome de coluna/aba sem caixa, acento nem espaço sobrando, pra casar "Hr Inicio" com "Hr início". */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Aceita data real da planilha (célula formatada como data) ou texto `dd/mm/yyyy`.
 * Vale o que o GP vê na tela: cronograma do Google Sheets em locale en-US grava "03/11/2026"
 * digitado como 11 de março com formato `mm/dd/yyyy` (o ELLIX tem isso) — então, com formato
 * mês-primeiro, o dia e o mês exibidos são lidos como dd/mm.
 */
function paraDataIso(celula: ExcelJS.Cell): string | null {
  const valor = celula.value;
  if (valor instanceof Date) {
    let mes = valor.getUTCMonth() + 1;
    let dia = valor.getUTCDate();
    if (/^\W*m/i.test(celula.numFmt ?? '') && dia <= 12) [mes, dia] = [dia, mes];
    return `${valor.getUTCFullYear()}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  const texto = textoDaCelula(valor);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const [dia, mes, ano] = [m[1]!, m[2]!, m[3]!];
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

/** Aceita hora real da planilha (célula formatada como hora) ou texto `HH:mm`. */
function paraHoraHHmm(valor: ExcelJS.CellValue): string | null {
  if (valor instanceof Date) {
    const hora = String(valor.getUTCHours()).padStart(2, '0');
    const minuto = String(valor.getUTCMinutes()).padStart(2, '0');
    return `${hora}:${minuto}`;
  }
  const texto = textoDaCelula(valor);
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto);
  if (!m) return null;
  const [hora, minuto] = [m[1]!, m[2]!];
  return `${hora.padStart(2, '0')}:${minuto}`;
}

/** Colunas lidas → nomes aceitos no cabeçalho (o ELLIX usa "Analista" a partir do 2º bloco). */
const NOMES_DAS_COLUNAS = {
  etapa: ['etapa'],
  processo: ['processo'],
  consultor: ['consultor', 'analista'],
  data: ['data'],
  horaInicio: ['hr inicio'],
  horaFim: ['hr fim'],
} as const;
type Colunas = Record<keyof typeof NOMES_DAS_COLUNAS, number>;

/** Mapeia as colunas se a linha for um cabeçalho (tem todas as colunas lidas); senão `null`. */
function colunasDoCabecalho(row: ExcelJS.Row): Colunas | null {
  const colunas: Partial<Colunas> = {};
  row.eachCell((celula, coluna) => {
    const nome = normalizar(textoDaCelula(celula.value));
    for (const [campo, nomes] of Object.entries(NOMES_DAS_COLUNAS)) {
      if ((nomes as readonly string[]).includes(nome) && !colunas[campo as keyof Colunas])
        colunas[campo as keyof Colunas] = coluna;
    }
  });
  const completo = Object.keys(NOMES_DAS_COLUNAS).every((campo) => colunas[campo as keyof Colunas]);
  return completo ? (colunas as Colunas) : null;
}

interface LeituraDaAba extends ResultadoLeituraPlanilha {
  achouCabecalho: boolean;
}

/**
 * Lê uma aba em blocos: cada linha de cabeçalho (`Etapa | Processo | ...`) redefine as
 * colunas, e as linhas abaixo dela são reservas. `Etapa` só precisa vir na primeira linha do
 * bloco — as seguintes herdam (célula mesclada ou em branco, seção 2.1 da spec). Linha de
 * título mesclada sobre Processo/Consultor ("Agendas") e linha sem Processo/Consultor/Data
 * (totais, espaçadores) são puladas.
 */
function lerAba(aba: ExcelJS.Worksheet): LeituraDaAba {
  const linhas: LinhaEquipePlanilha[] = [];
  const erros: ErroLinhaPlanilha[] = [];
  let colunas: Colunas | null = null;
  let etapaAtual = '';

  for (let numero = 1; numero <= aba.rowCount; numero++) {
    const row = aba.getRow(numero);
    const doCabecalho = colunasDoCabecalho(row);
    if (doCabecalho) {
      colunas = doCabecalho;
      etapaAtual = '';
      continue;
    }
    if (!colunas) continue;

    const celulaProcesso = row.getCell(colunas.processo);
    if (celulaProcesso.isMerged && row.getCell(colunas.consultor).master === celulaProcesso.master)
      continue;

    const etapaBruta = textoDaCelula(row.getCell(colunas.etapa).value);
    const processo = textoDaCelula(celulaProcesso.value);
    const consultorTexto = textoDaCelula(row.getCell(colunas.consultor).value);
    const celulaData = row.getCell(colunas.data);

    if (etapaBruta) etapaAtual = etapaBruta;
    if (!processo && !consultorTexto && !textoDaCelula(celulaData.value)) continue;

    if (!etapaAtual) {
      erros.push({ linha: numero, motivo: 'sem Etapa, e nenhuma linha anterior definiu uma' });
      continue;
    }
    if (!processo) {
      erros.push({ linha: numero, motivo: 'Processo em branco' });
      continue;
    }
    if (!consultorTexto) {
      erros.push({ linha: numero, motivo: 'Consultor em branco' });
      continue;
    }
    const data = paraDataIso(celulaData);
    if (!data) {
      erros.push({ linha: numero, motivo: 'Data inválida (use dd/mm/aaaa)' });
      continue;
    }
    const horaInicio = paraHoraHHmm(row.getCell(colunas.horaInicio).value);
    const horaFim = paraHoraHHmm(row.getCell(colunas.horaFim).value);
    if (!horaInicio || !horaFim) {
      erros.push({ linha: numero, motivo: 'Hr início/Hr fim inválida (use HH:mm)' });
      continue;
    }
    if (horaFim <= horaInicio) {
      erros.push({ linha: numero, motivo: 'Hr fim não é depois de Hr início' });
      continue;
    }

    linhas.push({
      linha: numero,
      etapa: etapaAtual,
      processo,
      consultorTexto,
      data,
      horaInicio,
      horaFim,
    });
  }

  return { linhas, erros, achouCabecalho: colunas !== null };
}

/**
 * Lê o `.xlsx` enviado pelo GP. Procura primeiro a aba `Cópia de Cronograma_FAP`; sem ela (ou
 * sem cabeçalho nela), usa a primeira aba que tiver o cabeçalho `Etapa | Processo | ...`.
 */
export async function interpretarPlanilhaEquipe(buffer: Buffer): Promise<ResultadoLeituraPlanilha> {
  const workbook = new ExcelJS.Workbook();
  // `as any`: o `Buffer` dos tipos do exceljs não bate (nível de tipo, não runtime) com o
  // @types/node ^26 deste projeto.
  await workbook.xlsx.load(buffer as any);

  const alvo = normalizar(NOME_ABA_CRONOGRAMA);
  const abas = [...workbook.worksheets].sort(
    (a, b) => Number(normalizar(b.name) === alvo) - Number(normalizar(a.name) === alvo),
  );
  for (const aba of abas) {
    const { achouCabecalho, ...leitura } = lerAba(aba);
    if (achouCabecalho) return leitura;
  }
  return {
    linhas: [],
    erros: [
      {
        linha: 0,
        motivo: `nenhuma aba com o cabeçalho do cronograma (aba "${NOME_ABA_CRONOGRAMA}", colunas ${CABECALHO_MODELO.join(' | ')})`,
      },
    ],
  };
}
