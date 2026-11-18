import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Credenciais } from '../sankhya/credenciais.ts';
import { Experience } from '../sankhya/experience.ts';
import {
  ConfirmacaoDaExperienceError,
  ExperienceDaEquipe,
  codparcDaEmpresa,
  processoDaLinha,
} from './experienceDaEquipe.ts';

describe('processoDaLinha', () => {
  it('lê a coluna Processo em texto ou lista, ignorando ids', () => {
    assert.equal(
      processoDaLinha({ process_name: 'Atendimento Avulso', process_id: 9 }),
      'Atendimento Avulso',
    );
    assert.equal(
      processoDaLinha({ processes: [{ name: 'Compras' }, { name: 'Vendas' }], processes_ids: [1] }),
      'Compras, Vendas',
    );
    assert.equal(processoDaLinha({ person_name: 'Ana', email: 'a@b.c' }), '');
  });
});

/*
 * Experience falsa: `fetch` trocado por uma função que responde por caminho e anota cada
 * chamada. Nada sai da máquina — `/accepted-os` e o e-mail nunca são chamados de verdade.
 */
const fetchOriginal = globalThis.fetch;
let chamadas: { caminho: string; corpo: Record<string, unknown> }[];
let falharEmail: boolean;
let falharAceite: boolean;
let confirmacaoNoInsert: string;

const IMPLANTACOES = [11, 12, 13, 14, 15];
const IMPLANTACAO_DA_OS = 14;

function responder(dados: unknown): Response {
  return new Response(JSON.stringify(dados), { headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  chamadas = [];
  falharEmail = false;
  falharAceite = false;
  confirmacaoNoInsert = 'confirm_creation';
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const caminho = String(url).replace(/^https:\/\/[^/]+\/prod/, '');
    const corpo = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    chamadas.push({ caminho, corpo });
    if (caminho === '/persons/information-by-email') return responder({ data: { user_id: 21986 } });
    // Gravação da GP (spec 4.4): a 1ª tentativa é a pergunta de confirmação, com cara de sucesso.
    if (caminho === '/tasks/insert') {
      return corpo.already_asked
        ? responder({ data: {}, response: { error: false, message: 'Inserido com sucesso' } })
        : responder({
            data: { error: true, error_code: confirmacaoNoInsert },
            response: { error: false, message: 'Inserido com sucesso' },
          });
    }
    if (caminho === '/implantations/filters') {
      return responder({
        data: {
          result: IMPLANTACOES.map((id) => ({
            id,
            fap: id * 100,
            full_count: IMPLANTACOES.length,
          })),
        },
      });
    }
    if (caminho.startsWith('/orders/filtering')) {
      const ids = new URL(`http://x${caminho}`).searchParams.get('implantation_ids')!.split(',');
      const tem = ids.map(Number).includes(IMPLANTACAO_DA_OS);
      return responder({
        data: {
          result: tem
            ? [{ order_id: 537403, accepted_os_status: 'Aceite não gerado', full_count: 1 }]
            : [],
        },
      });
    }
    if (caminho.startsWith('/tasks/filtering/implantation/14/')) {
      return responder({
        data: {
          result: [
            { id: 1, task_date: '16/09/2026', process_id: 7, stage_id: 3, full_count: 2 },
            { id: 2, task_date: '17/09/2026', process_id: 7, stage_id: 3, full_count: 2 },
          ],
        },
      });
    }
    if (caminho.startsWith('/tasks/filtering')) return responder({ data: { result: [] } });
    if (caminho === '/orders/tasks/validate') {
      return new Response(JSON.stringify({ response: { error: true, message: 'Erro 2287956' } }), {
        status: 500,
      });
    }
    if (caminho === '/orders/tasks/1/get-tasks-observations') {
      return responder({ data: 'Etapa: Configuração' });
    }
    if (caminho === '/persons/implantation/14/get-approvers') {
      return responder({ data: [{ full_name: 'Aprovador', email: 'a@cliente.com' }] });
    }
    if (caminho === '/orders/check-processes-orders') {
      return responder({ data: { results: [{ order_ids: [530001, 530002] }] } });
    }
    if (caminho === '/orders') return responder({ data: { order_id: 537403, numos: '7169595' } });
    if (caminho === '/accepted-os') {
      return falharAceite
        ? responder({ response: { error: true, message: 'aceite recusado' } })
        : responder({ data: { id: 98765 } });
    }
    if (caminho === '/accepted-os/send-email') {
      return falharEmail
        ? responder({ response: { error: true, message: 'sem aprovador' } })
        : responder({ data: {} });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

const payload = Buffer.from(JSON.stringify({ email: 'Consultor@Sankhya.com.br' })).toString(
  'base64url',
);
const credenciais = {
  revelar: async () => ({ token: `x.${payload}.y` }),
} as unknown as Credenciais;

describe('codparcDaEmpresa', () => {
  it('o número antes do hífen do company_name é o CODPARC', () => {
    assert.equal(codparcDaEmpresa('85482 - OACO PRODUTOS DE ACO'), 85482);
    assert.equal(codparcDaEmpresa('OACO PRODUTOS'), null);
    assert.equal(codparcDaEmpresa(null), null);
  });
});

describe('Experience — Nova Tarefa', () => {
  const tarefa = {
    implantationId: 11268,
    stageId: 117,
    processesIds: [22],
    procedureIds: [101],
    personId: 865,
    applicationId: 37154,
    dataDaTarefa: '2026-10-31',
    horaInicio: '07:30',
    horaFim: '11:30',
  };
  const inserts = () => chamadas.filter((chamada) => chamada.caminho === '/tasks/insert');

  it('confirm_creation (200 "Inserido com sucesso" sem gravar) reenvia com already_asked', async () => {
    const resultado = await new ExperienceDaEquipe(new Experience(credenciais)).criarTarefa({
      ...tarefa,
      observacao: 'Operação assistida — Backoffice — Todos',
    });
    assert.deepEqual(resultado, { confirmacaoAutomatica: 'confirm_creation' });
    assert.deepEqual(
      inserts().map((chamada) => chamada.corpo.already_asked),
      [false, true],
    );
    assert.equal(
      inserts()[1]!.corpo.additional_information,
      'Operação assistida — Backoffice — Todos',
    );
  });

  it('sem observação não manda additional_information; outra confirmação sobe como erro', async () => {
    confirmacaoNoInsert = 'outra_pergunta';
    await assert.rejects(
      new ExperienceDaEquipe(new Experience(credenciais)).criarTarefa(tarefa),
      (erro) => erro instanceof ConfirmacaoDaExperienceError && erro.codigo === 'outra_pergunta',
    );
    assert.equal(inserts().length, 1);
    assert.equal('additional_information' in inserts()[0]!.corpo, false);
  });
});

describe('Experience — procedimentos da implantação', () => {
  it('Etapa com `data` fora do formato não derruba a importação e vira aviso', async () => {
    const respostas: Record<string, unknown> = {
      '/stages/implantation/7/adapt-to-menu/true': [
        {
          stages: [
            { id: 45, title: 'Operação assistida' },
            { id: 129, title: 'Deploy Agent' },
          ],
        },
      ],
      '/processes/implantation/7/stage/45/person/9?isBetterPractices=false': [
        { id: 120, name: 'Vendas' },
      ],
      // Formato visto pela GP em 10/11: objeto, não lista.
      '/processes/implantation/7/stage/129/person/9?isBetterPractices=false': { message: 'x' },
      '/activities/implantation/7/process/120/stage/45/person/9': [
        { id: 1965, name: 'Acompanhamento' },
      ],
      '/procedures/implantation/7/activity/1965/person/9/stage/45': [
        { id: 4652, name: 'Operação assistida' },
        { id: 1, name: 'Desativado', pack_deactivated: true },
      ],
    };
    globalThis.fetch = (async (url: string) => {
      const caminho = String(url).replace(/^https:\/\/[^/]+\/prod/, '');
      return caminho in respostas
        ? responder({ data: respostas[caminho] })
        : new Response('{}', { status: 404 });
    }) as typeof fetch;

    const { itens, avisos } = await new ExperienceDaEquipe(
      new Experience(credenciais),
    ).procedimentosDaImplantacao(7, 9);
    assert.deepEqual(itens, [
      {
        etapa: 'Operação assistida',
        stageId: 45,
        processoId: 120,
        modulo: 'Vendas',
        atividade: 'Acompanhamento',
        procedimento: 'Operação assistida',
        procedimentoId: 4652,
      },
    ]);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0]!, /stage\/129.*"message":"x"/);
  });
});

describe('Experience — pedidos da Nova Tarefa', () => {
  it('devolve o id do pedido (application_id), não o código da OS do nome', async () => {
    let chamada = '';
    globalThis.fetch = (async (url: string) => {
      chamada = String(url).replace(/^https:\/\/[^/]+\/prod/, '');
      return responder({
        data: [
          { id: 36835, name: 'Código: 5837727 / Saldo: 156:57 / Tipo: IMPLANTACAO_ZERO' },
          { name: 'sem id' },
        ],
      });
    }) as typeof fetch;

    const pedidos = await new ExperienceDaEquipe(new Experience(credenciais)).pedidosDaEtapa(
      12230,
      114,
      [116, 132],
    );
    assert.equal(chamada, '/applications/implantation/12230/stage/114?procedures_ids=116,132');
    assert.deepEqual(pedidos, [
      { id: 36835, nome: 'Código: 5837727 / Saldo: 156:57 / Tipo: IMPLANTACAO_ZERO' },
    ]);
  });
});
