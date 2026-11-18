import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarDadosReaisDaEquipe,
  periodoAtualDaEquipe,
  mesesDoPeriodo,
  resumirOs,
  pendenciasDaNovaTarefa,
  validarNovaTarefa,
  arvoreDoMapeamento,
  linhasDaPrevia,
  eventosDoLote,
  processosDoMapeamento,
  tarefasDoLote,
  meetsDoLote,
  membroSemCorrespondencia,
  paraBase64,
  enderecoDoMeet,
  membroUsuarioChave,
  conviteDoMeet,
  membroDaPessoa,
  pessoasDoProjeto,
  tituloDaReserva,
  textoDosModulos,
  fasesNovas,
  eventosDaReserva,
  fasesDaReserva,
  modulosDaFase,
} from './equipeDoProjetoDados.js';

const periodo = { de: '2026-11-01', ate: '2026-11-30' };
const projeto = {
  implantationId: 11267,
  mapeamentoExperience: [
    {
      processo: 'Configuração › Fiscal › Notas',
      stageId: 113,
      processesIds: [22],
      procedureIds: [101],
    },
    {
      processo: 'Configuração › Fiscal › Impostos',
      stageId: 113,
      processesIds: [22],
      procedureIds: [102],
    },
    {
      processo: 'Homologação › Compras › Pedido',
      stageId: 114,
      processesIds: [23],
      procedureIds: [201],
    },
    {
      processo: 'Homologação › Antigo sem módulo',
      stageId: 114,
      processesIds: [24],
      procedureIds: [202],
    },
  ],
};
const tarefa = {
  stageId: 113,
  procedureIds: [101, 102],
  titulo: 'Revisão de notas',
  data: '2026-11-09',
  horaInicio: '09:00',
  horaFim: '10:30',
  codUsu: 12001,
  personId: 25258,
  implantationId: 11267,
  applicationId: 34644,
};
const recurso = {
  codusu: 12001,
  nomeusu: 'Pessoa',
  codcargo: 1,
  descrcargo: 'Consultor',
  corHex: '#60a5fa',
  corConflitoHex: '#ef4444',
  problemaConexao: '',
};

test('período usa dias civis locais, incluindo fevereiro bissexto e virada do ano', () => {
  assert.deepEqual(periodoAtualDaEquipe(new Date(2028, 1, 4)), {
    de: '2028-02-01',
    ate: '2028-02-29',
  });
  assert.deepEqual(periodoAtualDaEquipe(new Date(2026, 11, 31)), {
    de: '2026-12-01',
    ate: '2026-12-31',
  });
});

test('período de vários meses vira um mês por página, recortado nas pontas', () => {
  assert.deepEqual(mesesDoPeriodo({ de: '2026-11-15', ate: '2027-02-10' }), [
    { de: '2026-11-15', ate: '2026-11-30' },
    { de: '2026-12-01', ate: '2026-12-31' },
    { de: '2027-01-01', ate: '2027-01-31' },
    { de: '2027-02-01', ate: '2027-02-10' },
  ]);
  assert.deepEqual(mesesDoPeriodo(periodo), [periodo]);
});

test('busca e persistência enviam o recurso inteiro retornado pela Agenda', async () => {
  const chamadas = [];
  const dados = criarDadosReaisDaEquipe(async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return { recursos: [recurso] };
  });
  const { recursos: pessoas } = await dados.buscarRecursos('João & Maria', periodo);
  const url = new URL(chamadas[0].url, 'http://hub');
  assert.equal(url.pathname, '/api/agenda/recursos');
  assert.deepEqual(Object.fromEntries(url.searchParams), { ...periodo, termo: 'João & Maria' });
  await dados.adicionarPessoa('cliente', 'projeto', pessoas[0]);
  assert.equal(chamadas[1].url, '/api/clientes/cliente/projetos/projeto/membros');
  assert.equal(chamadas[1].opcoes.metodo, 'POST');
  assert.equal(chamadas[1].opcoes.corpo, recurso);
  await dados.removerPessoa('cliente', 'projeto', pessoas[0]);
  assert.equal(chamadas[2].opcoes.metodo, 'DELETE');
  assert.ok(chamadas[2].url.endsWith('/membros/12001'));
  await dados.removerPessoa('cliente', 'projeto', membroSemCorrespondencia('João Sem Par'));
  assert.ok(chamadas[3].url.endsWith('/membros/Jo%C3%A3o%20Sem%20Par'));
});

test('prévia da planilha: linha sem executante no ERP fica bloqueada e fora do lote', () => {
  const linhas = linhasDaPrevia({
    linhas: [
      {
        linha: 2,
        etapa: 'E1',
        processo: 'Compras',
        consultorTexto: 'Ana',
        data: '2026-11-03',
        horaInicio: '09:00',
        horaFim: '12:00',
      },
      {
        linha: 3,
        etapa: 'E1',
        processo: 'Vendas',
        consultorTexto: 'Bia',
        data: '2026-11-04',
        horaInicio: '13:00',
        horaFim: '17:00',
      },
    ],
    consultores: [
      { texto: 'Ana', pessoa: { personId: 1 }, recurso: { codusu: 12001 } },
      { texto: 'Bia', pessoa: null, recurso: null },
    ],
  });
  assert.deepEqual(
    linhas.map((l) => [l.titulo, l.codUsu, l.incluir]),
    [
      ['Compras', 12001, true],
      ['Vendas', null, false],
    ],
  );
  linhas[1].incluir = true; // marcada à mão, mas sem executante: continua fora
  linhas[0].titulo = '  Compras ajustado ';
  assert.deepEqual(eventosDoLote(linhas), [
    {
      titulo: 'Compras ajustado',
      data: '2026-11-03',
      horaInicio: '09:00',
      horaFim: '12:00',
      codUsu: 12001,
    },
  ]);
});

test('paraBase64 converte o arquivo em blocos', () => {
  const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
  assert.equal(paraBase64(bytes.buffer), Buffer.from(bytes).toString('base64'));
});

function respostaEquipe(alteracoes = {}) {
  return {
    membros: [recurso],
    implantationId: 11267,
    eventos: [
      {
        codusu: 12001,
        inicio: '2026-11-09 09:00:00',
        fim: '2026-11-09 10:30:00',
        descrabrev: 'Demanda A',
        usulancador: 'GP.TESTE',
        allday: 'N',
        confirmado: 'S',
      },
      {
        codusu: 12002,
        inicio: '2026-11-10 11:00:00',
        fim: '2026-11-10 12:00:00',
        descrabrev: 'Demanda B',
        usulancador: 'OUTRO',
        confirmado: 'S',
      },
    ],
    os: [
      {
        id: 1,
        codusuResolvido: 12001,
        pessoa: 'Pessoa',
        dia: '2026-11-09',
        horasFeitas: '08:30',
        statusAceite: 'Concluído',
      },
      {
        id: 2,
        codusuResolvido: null,
        pessoa: 'Sem vínculo',
        dia: '2026-11-09',
        horasFeitas: '140:15',
        statusAceite: 'Gerado',
      },
      {
        id: 3,
        codusuResolvido: 12001,
        pessoa: 'Pessoa',
        dia: '2026-11-10',
        horasFeitas: 'inválido',
        statusAceite: 'Rejeitado',
      },
    ],
    ...alteracoes,
  };
}

test('traduz OS sem perder status, horas longas ou ordens sem membro; mascara outros GPs', async () => {
  const chamadas = [];
  const dados = criarDadosReaisDaEquipe(async (url) => {
    chamadas.push(url);
    return url === '/api/sankhya/credenciais'
      ? { credenciais: [{ sistema: 'sankhya-erp', usuario: ' gp.teste ' }] }
      : respostaEquipe();
  });
  const equipe = await dados.lerEquipe('cliente', 'projeto', periodo);
  assert.ok(
    chamadas.includes('/api/clientes/cliente/projetos/projeto/equipe?de=2026-11-01&ate=2026-11-30'),
  );
  assert.deepEqual(resumirOs(equipe.os), { horas: 148.75, abertas: 1, concluidas: 1 });
  assert.equal(equipe.os[1].codusu, null);
  assert.equal(equipe.os[1].statusOriginal, 'Gerado');
  assert.equal(equipe.os[2].status, 'rejeitada');
  assert.equal(equipe.reservas[0].status, 'confirmado');
  assert.equal(equipe.reservas[0].fim, '2026-11-09 10:30:00');
  assert.deepEqual(equipe.reservas[1], {
    codusu: 12002,
    inicio: '2026-11-10',
    oque: 'Demanda B',
    proprio: false,
    doCliente: false,
  });
});

test('ausência de implantação mantém aviso e distingue OS indisponíveis de zero OS', async () => {
  const dados = criarDadosReaisDaEquipe(async (url) =>
    url === '/api/sankhya/credenciais'
      ? { credenciais: [] }
      : respostaEquipe({ implantationId: null, os: null, avisoOs: 'Sem implantação cadastrada' }),
  );
  const equipe = await dados.lerEquipe('a', 'b', periodo);
  assert.equal(equipe.osDisponiveis, false);
  assert.equal(equipe.avisoOs, 'Sem implantação cadastrada');
  assert.deepEqual(equipe.os, []);
  assert.ok(equipe.reservas.every((r) => !r.proprio && !r.fim && !r.status));
});

test('falha ao ler identidade não derruba equipe e mantém eventos sem horário', async () => {
  const dados = criarDadosReaisDaEquipe(async (url) => {
    if (url === '/api/sankhya/credenciais') throw new Error('Cofre indisponível');
    return respostaEquipe();
  });
  const equipe = await dados.lerEquipe('a', 'b', periodo);
  assert.ok(equipe.reservas.every((r) => !r.proprio && r.inicio.length === 10));
});

test('503 do shell e escrita parcial preservam o erro e nunca repetem a chamada', async () => {
  for (const erro of [
    Object.assign(new Error('Abra o desktop'), { shellIndisponivel: true }),
    Object.assign(new Error('Confira manualmente'), { indeterminado: true }),
  ]) {
    let quantidade = 0;
    const dados = criarDadosReaisDaEquipe(async () => {
      quantidade++;
      throw erro;
    });
    await assert.rejects(dados.reservarHorario('a', 'b', tarefa), (falha) => falha === erro);
    assert.equal(quantidade, 1);
  }
});

test('lança corpo real sem inventar vínculos e salva implantação inclusive null', async () => {
  const chamadas = [];
  const dados = criarDadosReaisDaEquipe(async (...args) => {
    chamadas.push(args);
  });
  await dados.reservarHorario('a', 'b', tarefa);
  assert.deepEqual(chamadas[0], [
    '/api/clientes/a/projetos/b/nova-tarefa',
    { metodo: 'POST', corpo: tarefa },
  ]);
  await dados.definirImplantacao('a', 'b', 11267);
  await dados.definirImplantacao('a', 'b', null);
  assert.deepEqual(chamadas[1][1], { metodo: 'PUT', corpo: { implantationId: 11267 } });
  assert.deepEqual(chamadas[2][1], { metodo: 'PUT', corpo: { implantationId: null } });
});

test('Nova Tarefa exige implantação, processo mapeado, intervalo e IDs positivos', () => {
  assert.equal(validarNovaTarefa(tarefa, projeto), null);
  for (const alteracao of [
    { stageId: 999 },
    { procedureIds: [] },
    { procedureIds: [201] },
    { titulo: '' },
    { titulo: 'x'.repeat(401) },
    { implantationId: 1 },
    { data: '2026-02-30' },
    { data: '' },
    { horaInicio: '25:00' },
    { horaFim: '09:00' },
    { horaFim: '08:59' },
    { codUsu: null },
    { personId: null },
    { personId: 0 },
    { personId: 1.2 },
    { personId: NaN },
    { applicationId: 0 },
    { applicationId: 1.5 },
  ])
    assert.ok(validarNovaTarefa({ ...tarefa, ...alteracao }, projeto), JSON.stringify(alteracao));
  assert.match(
    pendenciasDaNovaTarefa({ implantationId: null, mapeamentoExperience: [] }),
    /implanta.*mapeamento/,
  );
  assert.ok(validarNovaTarefa(tarefa, { ...projeto, mapeamentoExperience: [] }));
});

test('enderecoDoMeet monta o evento do Google Agenda com os convidados', () => {
  const url = new URL(enderecoDoMeet('Cliente X · Projeto Y', ['FLAVIANO.SANTOS', 'ana.lima']));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Cliente X · Projeto Y');
  assert.equal(
    url.searchParams.get('add'),
    'flaviano.santos@sankhya.com.br,ana.lima@sankhya.com.br',
  );
  assert.equal(url.searchParams.get('vcon'), 'meet');
  assert.equal(url.searchParams.get('dates'), null);
  const comHorario = new URL(
    enderecoDoMeet('X', ['a'], { data: '2026-10-30', inicio: '09:00', fim: '10:30' }),
  );
  assert.equal(comHorario.searchParams.get('dates'), '20261030T090000/20261030T103000');
  // Usuário chave do cliente vai pelo e-mail, sem o domínio da Sankhya.
  assert.equal(
    new URL(enderecoDoMeet('X', ['ana.lima', 'Aureo@AmaTools.com.br'])).searchParams.get('add'),
    'ana.lima@sankhya.com.br,aureo@amatools.com.br',
  );
});

test('conviteDoMeet: login do ERP, e-mail do usuário chave ou ninguém', () => {
  assert.equal(conviteDoMeet({ codusu: 1, nomeusu: 'ANA.LIMA' }), 'ANA.LIMA');
  assert.equal(
    conviteDoMeet({ codusu: null, email: 'aureo@amatools.com.br' }),
    'aureo@amatools.com.br',
  );
  assert.equal(conviteDoMeet({ codusu: null, email: '' }), null);
  assert.equal(conviteDoMeet({ codusu: null }), null);
});

test('usuário chave: entra sem codusu e é achado na equipe por person_id, login ou nome', () => {
  const cliente = {
    personId: 24539,
    nome: 'Aureo Duarte',
    email: 'aureo@amatools.com.br',
    papel: 'Usuário(a) Chave',
  };
  const chave = membroUsuarioChave(cliente);
  assert.equal(chave.codusu, null);
  assert.equal(chave.usuarioChave, true);
  assert.equal(chave.personId, 24539);
  assert.equal(chave.email, 'aureo@amatools.com.br');

  const consultor = { codusu: 12469, nomeusu: 'GUSTAVO.PINTO' };
  const semPar = { codusu: null, nomeusu: 'Áureo Duarte' };
  assert.equal(membroDaPessoa([consultor, chave], cliente), chave);
  assert.equal(
    membroDaPessoa([consultor], {
      personId: 1,
      nome: 'Gustavo Ricardo Pinto',
      email: 'gustavo.pinto@sankhya.com.br',
    }),
    consultor,
  );
  assert.equal(membroDaPessoa([semPar], { ...cliente, personId: 2, nome: 'aureo duarte' }), semPar);
  assert.equal(membroDaPessoa([consultor], cliente), null);
});

test('pessoas do projeto: Experience + quem só aparece nas OS, uma linha por pessoa', () => {
  const consultor = { codusu: 12469, nomeusu: 'GUSTAVO.PINTO' };
  const linhas = pessoasDoProjeto({
    pessoas: [consultor],
    pessoasExperience: [
      {
        personId: 23504,
        nome: 'Gustavo Ricardo Pinto',
        email: 'gustavo.pinto@sankhya.com.br',
        papel: 'GP',
      },
      {
        personId: 824,
        nome: 'Edna Santana',
        email: 'edna.santana@sankhya.com.br',
        papel: 'Consultora',
      },
    ],
    os: [
      { pessoa: 'Edna Santana', horas: 2 },
      { pessoa: 'Edna  Santana ', horas: 1 },
      { pessoa: 'Naiane Costa', horas: 4 },
    ],
  });
  assert.deepEqual(
    linhas.map((l) => [l.pessoa.nome, l.membro === consultor, l.ordens.length]),
    [
      ['Edna Santana', false, 2],
      ['Gustavo Ricardo Pinto', true, 0],
      ['Naiane Costa', false, 1],
    ],
  );
  assert.equal(linhas[2].pessoa.personId, null);
});

test('reserva de vários dias: título com fase e um evento por dia e executante', () => {
  assert.equal(tituloDaReserva('Amatools', 'GO LIVE', ' Virada '), 'Amatools - GO LIVE | Virada');
  assert.equal(tituloDaReserva('Amatools', 'GO LIVE'), 'Amatools - GO LIVE');
  assert.equal(
    tituloDaReserva('Amatool', 'Homologação', '', ['Compras', 'Vendas', ' Pagamentos ']),
    'Amatool - Homologação : Compras / Vendas / Pagamentos',
  );
  assert.equal(
    tituloDaReserva('Amatool', 'Homologação', 'Virada', ['Compras']),
    'Amatool - Homologação : Compras | Virada',
  );
  assert.equal(textoDosModulos(['Compras', '', 'Vendas']), 'Compras / Vendas');
  assert.equal(
    eventosDaReserva({
      dias: new Set(['2026-11-04']),
      codusus: [1],
      horaInicio: '09:00',
      horaFim: '18:00',
      titulo: 'T',
      descricao: 'Compras / Vendas',
    })[0].descricao,
    'Compras / Vendas',
  );
  assert.deepEqual(
    eventosDaReserva({
      dias: new Set(['2026-11-05', '2026-11-04']),
      codusus: [1, 2, 1],
      horaInicio: '09:00',
      horaFim: '18:00',
      titulo: 'T',
    }).map((e) => [e.data, e.codUsu]),
    [
      ['2026-11-04', 1],
      ['2026-11-04', 2],
      ['2026-11-05', 1],
      ['2026-11-05', 2],
    ],
  );
});

test('fases da planilha: só as que o projeto não tem, sem repetir', () => {
  assert.deepEqual(
    fasesNovas(
      [
        { etapa: 'Configuração' },
        { etapa: 'GO LIVE' },
        { etapa: 'configuracao' },
        { etapa: 'Simulação' },
      ],
      ['go live'],
    ),
    ['Configuração', 'Simulação'],
  );
});

test('prévia com cliente: "O quê" já sai no padrão cliente - fase | processo', () => {
  const [linha] = linhasDaPrevia(
    {
      linhas: [
        {
          linha: 2,
          etapa: 'E1',
          processo: 'Compras',
          consultorTexto: 'Ana',
          data: '2026-11-03',
          horaInicio: '09:00',
          horaFim: '12:00',
        },
      ],
      consultores: [],
    },
    'Amatools',
  );
  assert.equal(linha.titulo, 'Amatools - E1 | Compras');
});

test('cronograma: só reservas do cliente, mesmo horário vira um meet com todos', async () => {
  const { linhasDoCronograma, filtrarCronograma, htmlDoCronograma, destinatariosDoCronograma } =
    await import('./equipeDoProjetoDados.js');
  const ev = (codusu, nomeusu, inicio, fim, descrabrev) => ({
    codusu,
    nomeusu,
    inicio,
    fim,
    descrabrev,
  });
  const linhas = linhasDoCronograma({
    cliente: 'Amatools',
    eventos: [
      ev(
        1,
        'ANA.LIMA',
        '2026-11-10 09:00:00',
        '2026-11-10 10:00:00',
        'Amatools - Compras | Kickoff',
      ),
      ev(2, 'RUI.SA', '2026-11-10 09:00:00', '2026-11-10 10:00:00', 'Amatools - Compras | Kickoff'),
      ev(2, 'RUI.SA', '2026-11-09 14:00:00', '2026-11-09 15:00:00', 'Amatools - Vendas'),
      ev(1, 'ANA.LIMA', '2026-11-09 08:00:00', '2026-11-09 09:00:00', 'Outro Cliente - Compras'),
      {
        ...ev(1, 'ANA.LIMA', '2026-11-11 09:00:00', '2026-11-11 18:00:00', '[SAR #1445] AMATOOLS'),
        doCliente: true,
      },
    ],
    meets: [
      { data: '2026-11-10', inicio: '09:00', fim: '10:00', link: 'https://meet.google.com/x' },
    ],
    pessoasExperience: [{ nome: 'Ana Lima', email: 'ana.lima@sankhya.com.br', papel: '' }],
  });
  assert.deepEqual(
    linhas.map((l) => [l.data, l.inicio, l.fase, l.assunto, l.participantes, l.meet]),
    [
      ['2026-11-09', '14:00', 'Vendas', '', ['RUI.SA'], null],
      [
        '2026-11-10',
        '09:00',
        'Compras',
        'Kickoff',
        ['Ana Lima', 'RUI.SA'],
        'https://meet.google.com/x',
      ],
      ['2026-11-11', '09:00', 'Sem fase', '[SAR #1445] AMATOOLS', ['Ana Lima'], null],
    ],
  );
  assert.equal(
    filtrarCronograma(linhas, { fases: new Set(['Compras']), codusus: new Set([2]) }).length,
    1,
  );
  // Título com módulos (17/11): a fase fica limpa e os módulos vão para o assunto.
  const [comModulos] = linhasDoCronograma({
    cliente: 'Amatools',
    eventos: [
      ev(
        1,
        'ANA.LIMA',
        '2026-11-12 09:00:00',
        '2026-11-12 10:00:00',
        'Amatools - Homologação : Compras / Vendas | Virada',
      ),
    ],
  });
  assert.deepEqual(
    [comModulos.fase, comModulos.assunto],
    ['Homologação', 'Compras / Vendas | Virada'],
  );
  assert.equal(
    filtrarCronograma(linhas, { fases: new Set(['Vendas']), codusus: new Set([1]) }).length,
    0,
  );
  const html = htmlDoCronograma([{ ...linhas[0], assunto: '<b>x</b>' }]);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && html.includes('09/11/2026'));

  const { para, sugestoes } = destinatariosDoCronograma(
    [
      { nome: 'Chave', email: 'Chave@cli.com', papel: 'Usuário(a) Chave' },
      { nome: 'Lider', email: 'lider@cli.com', papel: 'Líder do Projeto' },
    ],
    [
      { codusu: 1, nomeusu: 'ANA.LIMA' },
      { codusu: null, nomeusu: 'Chave' },
    ],
  );
  assert.deepEqual(para, ['chave@cli.com']);
  assert.deepEqual(
    sugestoes.map((s) => s.email),
    ['lider@cli.com', 'ana.lima@sankhya.com.br'],
  );
});

test('Sankhya ID: aguardando e com erro entram; inexistente, ativo e sem conta ficam de fora', async () => {
  const { pendentesDoSankhyaId } = await import('./equipeDoProjetoDados.js');
  const p = (personId, nome, situacaoConta, erroSankhyaId = false) => ({
    personId,
    nome,
    email: '',
    papel: '',
    situacaoConta,
    erroSankhyaId,
  });
  const pendentes = pendentesDoSankhyaId(
    [
      p(1, 'Rony', 'aguardando_verificacao'),
      p(2, 'Erica', 'inexistente'),
      p(3, 'Ana', 'ativo', true),
      p(4, 'Hebert', 'ativo'),
      p(5, 'Gustavo', null),
    ],
    { 1: '2026-11-05T12:00:00.000Z' },
  );
  assert.deepEqual(
    pendentes.map((x) => [x.pessoa.personId, x.motivo, x.ultimoLembrete]),
    [
      [3, 'Erro no Sankhya ID', null],
      [1, 'Aguardando verificação', '2026-11-05T12:00:00.000Z'],
    ],
  );
});

test('selo do Sankhya ID: ativo, aguardando e erro aparecem; inexistente não; sem situação vira cinza', async () => {
  const { situacaoDoSankhyaId } = await import('./equipeDoProjetoDados.js');
  assert.equal(situacaoDoSankhyaId({ situacaoConta: 'ativo' }).rotulo, 'Sankhya ID ativo');
  assert.equal(situacaoDoSankhyaId({ situacaoConta: 'aguardando_verificacao' }).classe, 'atencao');
  assert.equal(situacaoDoSankhyaId({ situacaoConta: 'ativo', erroSankhyaId: true }).classe, 'erro');
  assert.equal(situacaoDoSankhyaId({ situacaoConta: 'inexistente' }), null);
  assert.equal(situacaoDoSankhyaId({ situacaoConta: null }).rotulo, 'Sem Sankhya ID informado');
  assert.equal(situacaoDoSankhyaId(undefined).classe, '');
});

test('cronograma: Meet gerado pelo Hub vira linha com os convidados ou junta-se à reserva', async () => {
  const { linhasDoCronograma } = await import('./equipeDoProjetoDados.js');
  const linhas = linhasDoCronograma({
    cliente: 'Amatool',
    eventos: [
      {
        codusu: 7145,
        nomeusu: 'ANDRE.SEGATTO',
        inicio: '2026-11-17 09:00:00',
        fim: '2026-11-17 18:00:00',
        descrabrev: '[SAR #5198] AMATOOLS',
        doCliente: true,
      },
    ],
    meets: [
      {
        data: '2026-11-12',
        inicio: '14:00',
        fim: '15:00',
        titulo: 'Amatool - Configuração | Alinhamento',
        fase: 'Configuração',
        link: null,
        convidados: [
          { codusu: 13274, nome: 'RAPHAELA.BORGES' },
          { codusu: 7145, nome: 'ANDRE.SEGATTO' },
        ],
      },
      {
        data: '2026-11-17',
        inicio: '09:00',
        fim: '18:00',
        titulo: 'Amatool · tese',
        link: 'https://meet.google.com/y',
        convidados: [{ codusu: 13274, nome: 'RAPHAELA.BORGES' }],
      },
    ],
    pessoasExperience: [
      { nome: 'Raphaela Borges', email: 'raphaela.borges@sankhya.com.br', papel: '' },
    ],
  });
  assert.deepEqual(
    linhas.map((l) => [l.data, l.fase, l.assunto, l.participantes, l.meet]),
    [
      ['2026-11-12', 'Configuração', 'Alinhamento', ['Raphaela Borges', 'ANDRE.SEGATTO'], null],
      [
        '2026-11-17',
        'Sem fase',
        '[SAR #5198] AMATOOLS',
        ['ANDRE.SEGATTO', 'Raphaela Borges'],
        'https://meet.google.com/y',
      ],
    ],
  );
});

test('mapeamento vira Etapa → módulos → atividades → opções, como a tela Etapas da Experience', () => {
  const arvore = arvoreDoMapeamento([
    ...projeto.mapeamentoExperience,
    {
      processo: 'Homologação › Compras › Registro das compras › Pedido',
      stageId: 114,
      procedureIds: [203],
    },
    {
      processo: 'Homologação › Compras › Registro das compras › Cotação',
      stageId: 114,
      procedureIds: [204],
    },
  ]);
  assert.deepEqual(arvore[0], {
    stageId: 113,
    etapa: 'Configuração',
    modulos: [
      {
        nome: 'Fiscal',
        atividades: [
          {
            nome: '',
            procedimentos: [
              { nome: 'Notas', ids: [101] },
              { nome: 'Impostos', ids: [102] },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(arvore[1].modulos, [
    {
      nome: 'Compras',
      atividades: [
        { nome: '', procedimentos: [{ nome: 'Pedido', ids: [201] }] },
        {
          nome: 'Registro das compras',
          procedimentos: [
            { nome: 'Pedido', ids: [203] },
            { nome: 'Cotação', ids: [204] },
          ],
        },
      ],
    },
    {
      nome: 'Procedimentos',
      atividades: [{ nome: '', procedimentos: [{ nome: 'Antigo sem módulo', ids: [202] }] }],
    },
  ]);
});

test('Meet da planilha: um por dia + horário + "O quê", executantes convidados sem repetir', () => {
  const linha = (codUsu, data, titulo = 'ELLIX - Homologação') => ({
    codUsu,
    data,
    horaInicio: '14:00',
    horaFim: '18:00',
    titulo,
    etapa: 'Homologação',
  });
  const nomes = new Map([
    [1, 'ALLAN'],
    [2, 'SAYD'],
  ]);
  assert.deepEqual(
    meetsDoLote(
      [
        linha(1, '2026-11-20'),
        linha(2, '2026-11-20'),
        linha(2, '2026-11-20'),
        linha(1, '2026-11-21'),
        linha(null, '2026-11-22'),
      ],
      (codusu) => nomes.get(codusu),
    ),
    [
      {
        data: '2026-11-20',
        inicio: '14:00',
        fim: '18:00',
        titulo: 'ELLIX - Homologação',
        fase: 'Homologação',
        convidados: [
          { codusu: 1, nome: 'ALLAN' },
          { codusu: 2, nome: 'SAYD' },
        ],
      },
      {
        data: '2026-11-21',
        inicio: '14:00',
        fim: '18:00',
        titulo: 'ELLIX - Homologação',
        fase: 'Homologação',
        convidados: [{ codusu: 1, nome: 'ALLAN' }],
      },
    ],
  );
});

test('planilha na Experience: um processo por Etapa › Módulo e a tarefa leva o escolhido', () => {
  const processos = processosDoMapeamento([
    { processo: 'Homologação › Compras › Pedido › Aprovar', stageId: 114, procedureIds: [116] },
    { processo: 'Homologação › Compras › Pedido › Cotar', stageId: 114, procedureIds: [117] },
    { processo: 'Simulação › Vendas › Preço', stageId: 117, procedureIds: [9028] },
  ]);
  assert.deepEqual(
    processos.map((p) => [p.rotulo, p.stageId, p.procedureIds]),
    [
      ['Homologação › Compras', 114, [116, 117]],
      ['Simulação › Vendas', 117, [9028]],
    ],
  );
  const linha = {
    incluir: true,
    codUsu: 11678,
    titulo: ' OACO - Compras ',
    data: '2026-11-18',
    horaInicio: '09:00',
    horaFim: '12:00',
    processoExperience: processos[0],
  };
  assert.deepEqual(tarefasDoLote([linha, { ...linha, incluir: false }]), [
    {
      codUsu: 11678,
      titulo: 'OACO - Compras',
      data: '2026-11-18',
      horaInicio: '09:00',
      horaFim: '12:00',
      stageId: 114,
      procedureIds: [116, 117],
    },
  ]);
});

test('Reservar: fase vem das Etapas importadas e os módulos são só os da Etapa', () => {
  const comFases = { ...projeto, fases: ['homologação', 'Virada'] };
  assert.deepEqual(fasesDaReserva(comFases), ['Configuração', 'Homologação', 'Virada']);
  assert.deepEqual(fasesDaReserva({ fases: ['Virada'] }), ['Virada']);
  assert.deepEqual(modulosDaFase(projeto, 'Configuração'), ['Fiscal']);
  assert.deepEqual(modulosDaFase(projeto, 'homologação'), ['Compras', 'Procedimentos']);
  assert.deepEqual(modulosDaFase(projeto, 'Virada'), []);
  assert.deepEqual(modulosDaFase(projeto, ''), []);
});
