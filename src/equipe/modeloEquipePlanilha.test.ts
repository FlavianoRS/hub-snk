import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import { gerarModeloEquipeXlsx, interpretarPlanilhaEquipe } from './modeloEquipePlanilha.ts';

/** Cabeçalho do modelo antigo (sem Usuário Chave/Planejado/Realizado): as colunas são lidas pelo nome. */
const CABECALHO_CURTO = [
  'Etapa',
  'Processo',
  'Consultor',
  'Data',
  'Hr início',
  'Hr fim',
  'Agenda meet',
  'Tarefa',
];

async function planilhaCom(linhas: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet('Cronograma');
  planilha.addRow(CABECALHO_CURTO);
  for (const linha of linhas) planilha.addRow(linha);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('gerarModeloEquipeXlsx', () => {
  it('gera um .xlsx com o cabeçalho esperado e uma linha de exemplo válida', async () => {
    const buffer = await gerarModeloEquipeXlsx();
    const lido = await interpretarPlanilhaEquipe(buffer);
    assert.deepEqual(lido.erros, []);
    assert.equal(lido.linhas.length, 1);
    assert.equal(lido.linhas[0]?.consultorTexto, 'Fulano da Silva');
    assert.equal(lido.linhas[0]?.data, '2026-11-15');
    assert.equal(lido.linhas[0]?.horaInicio, '09:00');
    assert.equal(lido.linhas[0]?.horaFim, '12:00');
  });
});

describe('interpretarPlanilhaEquipe', () => {
  it('herda a Etapa das linhas seguintes do mesmo bloco', async () => {
    const buffer = await planilhaCom([
      ['Levantamento', 'Reunião 1', 'Fulano', '01/11/2026', '09:00', '10:00', '', ''],
      ['', 'Reunião 2', 'Fulano', '02/11/2026', '09:00', '10:00', '', ''],
      ['Construção', 'Dev 1', 'Ciclano', '03/11/2026', '14:00', '18:00', '', ''],
      ['', 'Dev 2', 'Ciclano', '04/11/2026', '14:00', '18:00', '', ''],
    ]);
    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.deepEqual(erros, []);
    assert.deepEqual(
      linhas.map((l) => l.etapa),
      ['Levantamento', 'Levantamento', 'Construção', 'Construção'],
    );
  });

  it('aceita Data como texto quando a planilha não formata a célula como data', async () => {
    const buffer = await planilhaCom([
      ['Etapa', 'Processo', 'Fulano', '22/10/2026', '09:00', '10:00', '', ''],
    ]);
    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.deepEqual(erros, []);
    assert.equal(linhas[0]?.data, '2026-10-22');
  });

  it('pula linha totalmente vazia sem gerar erro', async () => {
    const buffer = await planilhaCom([
      ['Etapa', 'Processo', 'Fulano', '01/11/2026', '09:00', '10:00', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', 'Processo 2', 'Fulano', '02/11/2026', '09:00', '10:00', '', ''],
    ]);
    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.deepEqual(erros, []);
    assert.equal(linhas.length, 2);
  });

  it('reporta erro de linha sem derrubar as outras', async () => {
    const buffer = await planilhaCom([
      ['Etapa', 'Processo', 'Fulano', '01/11/2026', '09:00', '10:00', '', ''],
      ['', 'Processo 2', '', '02/11/2026', '09:00', '10:00', '', ''],
      ['', 'Processo 3', 'Ciclano', '03/11/2026', '18:00', '09:00', '', ''],
    ]);
    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.equal(linhas.length, 1);
    assert.equal(erros.length, 2);
    assert.equal(erros[0]?.linha, 3);
    assert.match(erros[0]?.motivo ?? '', /Consultor/);
    assert.equal(erros[1]?.linha, 4);
    assert.match(erros[1]?.motivo ?? '', /Hr fim/);
  });

  it('rejeita planilha sem o cabeçalho do cronograma em nenhuma aba', async () => {
    const workbook = new ExcelJS.Workbook();
    const planilha = workbook.addWorksheet('Outra');
    planilha.addRow(['Fase', 'Atividade']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.equal(linhas.length, 0);
    assert.equal(erros.length, 1);
    assert.match(erros[0]?.motivo ?? '', /nenhuma aba/);
  });

  it('num cronograma de fora, lê a aba "Cópia de Cronograma_FAP" em blocos (layout ELLIX)', async () => {
    const workbook = new ExcelJS.Workbook();
    // Aba anterior com cabeçalho parecido: não pode ganhar da aba pelo nome.
    workbook.addWorksheet('Cronograma_FAP').addRow(CABECALHO_CURTO);
    const aba = workbook.addWorksheet('Cópia de Cronograma_FAP');
    const cabecalho = (consultor: string) => [
      '',
      'Etapa',
      'Processo',
      consultor,
      'Usuário Chave',
      'Data',
      'Hr início',
      'Hr fim',
      'Planejado',
    ];
    const hora = (h: number) => new Date(Date.UTC(1899, 11, 30, h));
    aba.getRow(2).values = ['', '', '', '', '', new Date(Date.UTC(1900, 0, 11)), '', 'TOTAL'];
    aba.getRow(5).values = ['', '', 'Agendas', 'Agendas', 'Agendas'];
    aba.mergeCells('C5:H5');
    aba.getRow(6).values = cabecalho('Consultor');
    aba.getRow(7).values = [
      '',
      'Validação',
      'Produção',
      'Said',
      'Flávia',
      '22/10/2026',
      hora(14),
      hora(18),
    ];
    aba.getRow(9).values = [
      '',
      '',
      'Compras',
      'Allan',
      'Joaquim',
      '26/10/2026',
      hora(14),
      hora(18),
    ];
    aba.mergeCells('B7:B9');
    aba.getRow(11).values = ['', '', 'Agendas'];
    aba.mergeCells('C11:H11');
    aba.getRow(12).values = cabecalho('Analista');
    aba.getRow(13).values = [
      '',
      'Configuração',
      'Backoffice',
      'Allan',
      '-',
      new Date(Date.UTC(2026, 2, 11)),
      hora(9),
      hora(18),
    ];
    aba.getCell('F13').numFmt = 'mm/dd/yyyy'; // Sheets en-US: "03/11/2026" digitado vira 11/mar
    aba.getRow(14).values = [
      '',
      '',
      'Tributação',
      'Marcus',
      '-',
      new Date(Date.UTC(2026, 10, 13)),
      hora(9),
      hora(13),
    ];
    aba.getCell('F14').numFmt = 'mm/dd/yyyy'; // dia > 12: não dá pra trocar, vale a data real
    aba.getRow(16).values = ['', '', '', '', '', '', '', 'TOTAL HR'];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { linhas, erros } = await interpretarPlanilhaEquipe(buffer);
    assert.deepEqual(erros, []);
    assert.deepEqual(
      linhas.map((l) => [
        l.linha,
        l.etapa,
        l.processo,
        l.consultorTexto,
        l.data,
        l.horaInicio,
        l.horaFim,
      ]),
      [
        [7, 'Validação', 'Produção', 'Said', '2026-10-22', '14:00', '18:00'],
        [9, 'Validação', 'Compras', 'Allan', '2026-10-26', '14:00', '18:00'],
        [13, 'Configuração', 'Backoffice', 'Allan', '2026-11-03', '09:00', '18:00'],
        [14, 'Configuração', 'Tributação', 'Marcus', '2026-11-13', '09:00', '13:00'],
      ],
    );
  });
});
