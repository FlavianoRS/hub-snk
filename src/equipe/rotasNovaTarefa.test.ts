import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import type { AgendaDaEquipe } from './agendaDaEquipe.ts';
import { SessaoExpiradaError } from '../sankhya/experience.ts';
import { RecusaDaExperienceError, type ExperienceDaEquipe } from './experienceDaEquipe.ts';
import type { RepositorioClientes } from '../repositorio/repositorioClientes.ts';
import {
  escolhaNoMapeamento,
  mapeamentoDosProcedimentos,
  registrarRotasDeNovaTarefa,
} from './rotasNovaTarefa.ts';

function servidorCom(personIdDoEmail: (email: string) => Promise<number | null>) {
  const servidor = Fastify();
  registrarRotasDeNovaTarefa(
    servidor,
    {} as AgendaDaEquipe,
    { personIdDoEmail } as unknown as ExperienceDaEquipe,
    {} as RepositorioClientes,
  );
  return servidor;
}

describe('GET /api/experience/pessoas/por-login', () => {
  it('procura pelo e-mail login@sankhya.com.br em minúsculas', async () => {
    const pedidos: string[] = [];
    const servidor = servidorCom(async (email) => (pedidos.push(email), 23504));
    const resposta = await servidor.inject('/api/experience/pessoas/por-login?login=GUSTAVO.PINTO');
    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(resposta.json(), { personId: 23504, email: 'gustavo.pinto@sankhya.com.br' });
    assert.deepEqual(pedidos, ['gustavo.pinto@sankhya.com.br']);
  });

  it('404 sem usuário, 400 com login inválido, 409 sem sessão', async () => {
    assert.equal(
      (await servidorCom(async () => null).inject('/api/experience/pessoas/por-login?login=x.y'))
        .statusCode,
      404,
    );
    assert.equal(
      (await servidorCom(async () => 1).inject('/api/experience/pessoas/por-login?login=a%40b.com'))
        .statusCode,
      400,
    );
    const semSessao = servidorCom(async () => {
      throw new SessaoExpiradaError('sem sessão');
    });
    assert.equal(
      (await semSessao.inject('/api/experience/pessoas/por-login?login=x.y')).statusCode,
      409,
    );
  });
});

describe('POST /api/clientes/:id/projetos/:idProjeto/nova-tarefa', () => {
  const idCliente = '11111111-1111-4111-8111-111111111111';
  const idProjeto = '22222222-2222-4222-8222-222222222222';
  const corpo = {
    stageId: 113,
    procedureIds: [101],
    titulo: 'Simulação',
    data: '2026-10-29',
    horaInicio: '09:00',
    horaFim: '12:00',
    codUsu: 12229,
    personId: 21042,
    implantationId: 12230,
    applicationId: 36835,
  };
  const repositorio = {
    buscarPorId: async () => ({
      projetos: [
        {
          id: idProjeto,
          mapeamentoExperience: [
            { processo: 'compras', stageId: 113, processesIds: [22], procedureIds: [101] },
          ],
        },
      ],
    }),
  } as unknown as RepositorioClientes;

  /** Resposta de `carregarAgendas` com os eventos dados (formato do ERP). */
  const agendaCom = (
    eventos: {
      nu: number;
      codusu: number;
      codparc?: number;
      de: string;
      ate: string;
      oque: string;
    }[],
  ) => ({
    conteudo: JSON.stringify({
      status: '1',
      responseBody: {
        timeLine: {
          lane: [
            {
              properties: { CODUSU: { $: '12229' }, NOMEUSU: { $: 'GUSTAVO' } },
              task: eventos.map((e) => ({
                allDay: 'false',
                start: e.de,
                end: e.ate,
                properties: {
                  NUEVENTO: { $: String(e.nu) },
                  CODUSU: { $: String(e.codusu) },
                  NOMEUSU: { $: 'GUSTAVO' },
                  CODPARC: { $: e.codparc ? String(e.codparc) : '' },
                  DESCRABREV: { $: e.oque },
                  USULANCADOR: { $: 'RAPHAELA.BORGES' },
                },
              })),
            },
          ],
        },
      },
    }),
  });

  /** Credenciais com agenda que muda depois de gravar (o evento novo aparece na releitura). */
  function credenciaisCom(antes: Parameters<typeof agendaCom>[0], depois = antes) {
    const gravados: { codParc?: number; confirmado?: boolean }[] = [];
    const cancelados: number[] = [];
    return {
      gravados,
      cancelados,
      credenciais: {
        consultarAgendaDeRecursos: async () => agendaCom(gravados.length ? depois : antes),
        salvarEventoNaAgenda: async (evento: { codParc?: number }) => {
          gravados.push(evento);
        },
        cancelarEventoNaAgenda: async (nu: number) => {
          cancelados.push(nu);
        },
      } as never,
    };
  }

  const recusando = (tarefas: unknown[]) =>
    ({
      parceiroDaImplantacao: async () => 85482,
      criarTarefa: async (dados: unknown) => {
        tarefas.push(dados);
        throw new RecusaDaExperienceError('O Consultor selecionado não está disponível.');
      },
    }) as never;

  it('grava confirmado e com o parceiro; recusa da Experience desfaz o evento criado', async () => {
    const tarefas: unknown[] = [];
    const doHub = {
      nu: 777,
      codusu: 12229,
      codparc: 85482,
      de: '29/10/2026 09:00',
      ate: '29/10/2026 12:00',
      oque: 'Simulação',
    };
    const { gravados, cancelados, credenciais } = credenciaisCom([], [doHub]);
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(servidor, credenciais, recusando(tarefas), repositorio);

    const resposta = await servidor.inject({
      method: 'POST',
      url: `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa`,
      payload: corpo,
    });

    assert.equal(gravados[0]!.confirmado, true);
    assert.equal(gravados[0]!.codParc, 85482);
    assert.equal((tarefas[0] as { personId: number }).personId, 21042);
    assert.equal(resposta.statusCode, 409);
    assert.deepEqual(cancelados, [777]);
    assert.match(resposta.json().mensagem, /recusou.*foi excluído/s);
  });

  it('evento do mesmo parceiro no horário: não grava outro, só lança a tarefa', async () => {
    const tarefas: unknown[] = [];
    const { gravados, credenciais } = credenciaisCom([
      {
        nu: 5,
        codusu: 12229,
        codparc: 85482,
        de: '29/10/2026 08:00',
        ate: '29/10/2026 18:00',
        oque: 'OACO',
      },
    ]);
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      credenciais,
      {
        parceiroDaImplantacao: async () => 85482,
        criarTarefa: async (dados: unknown) => (tarefas.push(dados), {}),
      } as never,
      repositorio,
    );
    const resposta = await servidor.inject({
      method: 'POST',
      url: `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa`,
      payload: corpo,
    });
    assert.equal(resposta.statusCode, 200);
    assert.equal(gravados.length, 0);
    assert.equal(tarefas.length, 1);
    assert.match(resposta.json().mensagem, /já existia.*reaproveitado/);
  });

  it('horário com agendamento de outro cliente: 409 sem gravar nada', async () => {
    const tarefas: unknown[] = [];
    const { gravados, credenciais } = credenciaisCom([
      {
        nu: 6,
        codusu: 12229,
        codparc: 293,
        de: '29/10/2026 11:00',
        ate: '29/10/2026 15:00',
        oque: 'EMMIG',
      },
    ]);
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(servidor, credenciais, recusando(tarefas), repositorio);
    const resposta = await servidor.inject({
      method: 'POST',
      url: `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa`,
      payload: corpo,
    });
    assert.equal(resposta.statusCode, 409);
    assert.equal(gravados.length + tarefas.length, 0);
    assert.match(resposta.json().mensagem, /já tem agendamento.*EMMIG.*Nada foi gravado/s);
  });

  it('repassa a observação e avisa quando a Experience pediu confirmação', async () => {
    const tarefas: { observacao?: string }[] = [];
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      credenciaisCom([]).credenciais,
      {
        parceiroDaImplantacao: async () => 85482,
        criarTarefa: async (dados: { observacao?: string }) => {
          tarefas.push(dados);
          return { confirmacaoAutomatica: 'confirm_creation' };
        },
      } as never,
      repositorio,
    );

    const resposta = await servidor.inject({
      method: 'POST',
      url: `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa`,
      payload: { ...corpo, observacao: '  Operação assistida — Backoffice  ' },
    });

    assert.equal(resposta.statusCode, 200);
    assert.equal(tarefas[0]!.observacao, 'Operação assistida — Backoffice');
    assert.equal(resposta.json().confirmacaoAutomatica, 'confirm_creation');
    assert.match(resposta.json().mensagem, /pediu confirmação/);
  });

  it('lote da Experience: sem agenda do cliente não grava nada; com agenda lança', async () => {
    const tarefas: unknown[] = [];
    const comImplantacao = {
      buscarPorId: async () => ({
        projetos: [
          {
            id: idProjeto,
            implantationId: 12230,
            mapeamentoExperience: [
              { processo: 'compras', stageId: 113, processesIds: [22], procedureIds: [101] },
            ],
          },
        ],
      }),
    } as unknown as RepositorioClientes;
    const experience = {
      parceiroDaImplantacao: async () => 85482,
      personIdDoEmail: async () => 21042,
      pedidosDaEtapa: async () => [{ id: 36835, nome: 'Pedido' }],
      criarTarefa: async (dados: unknown) => (tarefas.push(dados), {}),
    } as never;
    const linha = {
      codUsu: 12229,
      titulo: 'OACO - Compras',
      data: '2026-10-29',
      horaInicio: '09:00',
      horaFim: '12:00',
      stageId: 113,
      procedureIds: [101],
    };
    const lancar = (agenda: Parameters<typeof agendaCom>[0]) => {
      const servidor = Fastify();
      registrarRotasDeNovaTarefa(
        servidor,
        credenciaisCom(agenda).credenciais,
        experience,
        comImplantacao,
      );
      return servidor.inject({
        method: 'POST',
        url: `/api/clientes/${idCliente}/projetos/${idProjeto}/experience/lote`,
        payload: { tarefas: [linha, { ...linha, data: '2026-10-30' }] },
      });
    };

    // Agenda só no dia 29: a linha do 30 trava o lote inteiro.
    const evento29 = {
      nu: 1,
      codusu: 12229,
      codparc: 85482,
      de: '29/10/2026 09:00',
      ate: '29/10/2026 12:00',
      oque: 'OACO',
    };
    const recusado = await lancar([evento29]);
    assert.equal(recusado.statusCode, 409);
    assert.deepEqual(
      recusado.json().pendencias.map((p: { indice: number }) => p.indice),
      [1],
    );
    assert.match(recusado.json().pendencias[0].motivo, /não há agenda/);
    assert.equal(tarefas.length, 0);

    const aceito = await lancar([
      evento29,
      { ...evento29, nu: 2, de: '30/10/2026 08:00', ate: '30/10/2026 18:00' },
    ]);
    assert.equal(aceito.statusCode, 200);
    assert.equal(tarefas.length, 2);
    assert.equal((tarefas[0] as { applicationId: number }).applicationId, 36835);
  });

  it('recusa lista de pessoas', async () => {
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(servidor, {} as never, {} as never, repositorio);
    const resposta = await servidor.inject({
      method: 'POST',
      url: `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa`,
      payload: { ...corpo, personId: [21042, 865] },
    });
    assert.equal(resposta.statusCode, 400);
  });
});

describe('tarefas da Experience: listar e excluir', () => {
  const idCliente = '11111111-1111-4111-8111-111111111111';
  const idProjeto = '22222222-2222-4222-8222-222222222222';
  const repositorio = {
    buscarPorId: async () => ({ projetos: [{ id: idProjeto, implantationId: 11441 }] }),
  } as unknown as RepositorioClientes;

  it('lista pela sessão da GP (caminho) filtrando a pessoa, sem o bruto', async () => {
    const chamadas: unknown[][] = [];
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      {} as AgendaDaEquipe,
      {
        descobrirPersonId: async () => 25258,
        tarefas: async (...args: unknown[]) => (
          chamadas.push(args),
          [{ id: 4630241, dia: '2026-11-05', bruto: { x: 1 } }]
        ),
      } as never,
      repositorio,
    );
    const resposta = await servidor.inject(
      `/api/clientes/${idCliente}/projetos/${idProjeto}/tarefas-experience?personId=865`,
    );
    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(chamadas, [[11441, 865, 25258]]);
    assert.deepEqual(resposta.json().tarefas, [{ id: 4630241, dia: '2026-11-05' }]);
  });

  it('exclui pelo id; recusa vira 409 e id inválido 400', async () => {
    const excluidas: number[] = [];
    let recusar = false;
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      {} as AgendaDaEquipe,
      {
        excluirTarefa: async (id: number) => {
          if (recusar) throw new RecusaDaExperienceError('Tarefa já concluída.');
          excluidas.push(id);
        },
      } as never,
      repositorio,
    );
    const ok = await servidor.inject({ method: 'DELETE', url: '/api/experience/tarefas/4630241' });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(excluidas, [4630241]);
    recusar = true;
    const recusa = await servidor.inject({ method: 'DELETE', url: '/api/experience/tarefas/1' });
    assert.equal(recusa.statusCode, 409);
    assert.equal(
      (await servidor.inject({ method: 'DELETE', url: '/api/experience/tarefas/abc' })).statusCode,
      400,
    );
  });
});

describe('mapeamento importado da Experience', () => {
  const item = (
    etapa: string,
    stageId: number,
    processoId: number,
    procedimento: string,
    procedimentoId: number,
    modulo = 'Vendas',
  ) => ({ etapa, stageId, processoId, modulo, procedimento, procedimentoId });

  it('um item por Etapa+Módulo+Procedimento, com o módulo no rótulo e desempate', () => {
    assert.deepEqual(
      mapeamentoDosProcedimentos([
        item('Operação assistida', 45, 120, 'Operação assistida', 4652),
        item('Operação assistida', 45, 120, 'Operação assistida', 4652),
        item('Simulação', 117, 23, 'Compra', 9028, 'Compras'),
        item('Simulação', 117, 30, 'Compra', 9028, 'Financeiro'),
        item('Configuração', 113, 32, 'Cadastro', 900),
        item('Configuração', 113, 32, 'Cadastro', 901),
        item('Configuração', 113, 33, 'A › B', 902, ''),
      ]),
      [
        {
          processo: 'Operação assistida › Vendas › Operação assistida',
          stageId: 45,
          processesIds: [120],
          procedureIds: [4652],
        },
        {
          processo: 'Simulação › Compras › Compra',
          stageId: 117,
          processesIds: [23],
          procedureIds: [9028],
        },
        {
          processo: 'Simulação › Financeiro › Compra',
          stageId: 117,
          processesIds: [30],
          procedureIds: [9028],
        },
        {
          processo: 'Configuração › Vendas › Cadastro (900)',
          stageId: 113,
          processesIds: [32],
          procedureIds: [900],
        },
        {
          processo: 'Configuração › Vendas › Cadastro (901)',
          stageId: 113,
          processesIds: [32],
          procedureIds: [901],
        },
        {
          processo: 'Configuração › Processo 33 › A - B',
          stageId: 113,
          processesIds: [33],
          procedureIds: [902],
        },
      ],
    );
  });

  it('atividade da Experience entra no rótulo entre módulo e procedimento', () => {
    assert.equal(
      mapeamentoDosProcedimentos([
        {
          ...item('Homologação', 114, 22, 'Pedido de compra', 116, 'Compras'),
          atividade: 'Registro e histórico das compras',
        },
      ])[0]!.processo,
      'Homologação › Compras › Registro e histórico das compras › Pedido de compra',
    );
  });

  it('rota importa pela sessão da GP e grava no projeto; sem implantação 409', async () => {
    const idCliente = '11111111-1111-4111-8111-111111111111';
    const idProjeto = '22222222-2222-4222-8222-222222222222';
    let implantationId: number | null = 11441;
    const gravado: unknown[][] = [];
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      {} as AgendaDaEquipe,
      {
        descobrirPersonId: async () => 25258,
        procedimentosDaImplantacao: async (...args: unknown[]) => (
          gravado.push(['leu', ...args]),
          { itens: [item('Operação assistida', 45, 120, 'Operação assistida', 4652)], avisos: [] }
        ),
      } as never,
      {
        buscarPorId: async () => ({
          id: idCliente,
          projetos: [{ id: idProjeto, nome: 'EMMIG', implantationId }],
        }),
        definirMapeamentoExperienceDoProjeto: async (...args: unknown[]) => (
          gravado.push(args),
          { mapeamentoExperience: args[2] }
        ),
      } as unknown as RepositorioClientes,
    );
    const url = `/api/clientes/${idCliente}/projetos/${idProjeto}/mapeamento-experience/importar`;
    const ok = await servidor.inject({ method: 'POST', url });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(gravado, [
      ['leu', 11441, 25258],
      [
        idCliente,
        idProjeto,
        [
          {
            processo: 'Operação assistida › Vendas › Operação assistida',
            stageId: 45,
            processesIds: [120],
            procedureIds: [4652],
          },
        ],
      ],
    ]);
    implantationId = null;
    assert.equal((await servidor.inject({ method: 'POST', url })).statusCode, 409);
  });
});

describe('GET …/nova-tarefa/pedidos', () => {
  it('confere Etapa + procedimentos no mapeamento e pergunta à Experience', async () => {
    const idCliente = '11111111-1111-4111-8111-111111111111';
    const idProjeto = '22222222-2222-4222-8222-222222222222';
    const lidos: unknown[][] = [];
    const servidor = Fastify();
    registrarRotasDeNovaTarefa(
      servidor,
      {} as AgendaDaEquipe,
      {
        pedidosDaEtapa: async (...args: unknown[]) => (
          lidos.push(args),
          [{ id: 36835, nome: 'Código: 5837727' }]
        ),
      } as never,
      {
        buscarPorId: async () => ({
          id: idCliente,
          projetos: [
            {
              id: idProjeto,
              implantationId: 12230,
              mapeamentoExperience: [
                {
                  processo: 'Homologação › Compras › Aprovação de compras',
                  stageId: 114,
                  processesIds: [22],
                  procedureIds: [116],
                },
              ],
            },
          ],
        }),
      } as unknown as RepositorioClientes,
    );
    const url = (stageId: string, procedimentos: string) =>
      `/api/clientes/${idCliente}/projetos/${idProjeto}/nova-tarefa/pedidos?${new URLSearchParams({ stageId, procedimentos })}`;
    const ok = await servidor.inject(url('114', '116'));
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json(), { pedidos: [{ id: 36835, nome: 'Código: 5837727' }] });
    assert.deepEqual(lidos, [[12230, 114, [116]]]);
    assert.equal((await servidor.inject(url('113', '116'))).statusCode, 404);
    assert.equal((await servidor.inject(url('114', 'x'))).statusCode, 400);
  });
});

describe('escolha de módulos e procedimentos', () => {
  const mapeamento = [
    { processo: 'Homologação › Compras › A', stageId: 114, processesIds: [22], procedureIds: [1] },
    { processo: 'Homologação › Compras › B', stageId: 114, processesIds: [22], procedureIds: [2] },
    {
      processo: 'Homologação › Precificação › C',
      stageId: 114,
      processesIds: [23],
      procedureIds: [3],
    },
    { processo: 'Configuração › Compras › A', stageId: 113, processesIds: [22], procedureIds: [4] },
  ];
  it('une os módulos dos procedimentos marcados, como a tela da Experience', () => {
    assert.deepEqual(escolhaNoMapeamento(mapeamento, 114, [1, 2, 3]), {
      processo: 'Homologação › Compras, Homologação › Precificação (3 procedimentos)',
      stageId: 114,
      processesIds: [22, 23],
      procedureIds: [1, 2, 3],
    });
    assert.equal(
      (escolhaNoMapeamento(mapeamento, 114, [2]) as { processo: string }).processo,
      'Homologação › Compras › B',
    );
  });
  it('recusa procedimento de outra Etapa', () => {
    assert.deepEqual(escolhaNoMapeamento(mapeamento, 114, [1, 4]), { faltando: [4] });
  });
});
