import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import ExcelJS from 'exceljs';
import type { AgendaDaEquipe } from './agendaDaEquipe.ts';
import { RecusaDaExperienceError, type ExperienceDaEquipe } from './experienceDaEquipe.ts';
import type { RepositorioClientes } from '../repositorio/repositorioClientes.ts';
import {
  registrarRotasDeEquipeDoProjeto,
  eventoDoCliente,
  loginDoEmail,
  pessoaDoConsultor,
  termosDaPesquisaDeUsuario,
} from './rotasEquipeDoProjeto.ts';
import { situacaoNaAgenda } from './rotasNovaTarefa.ts';
import type { EventoAgenda } from '../tipos.ts';
import { PonteDoDesktopError } from '../sankhya/ponteDoDesktop.ts';

describe('termosDaPesquisaDeUsuario', () => {
  it('nome completo vira o login nome.ultimo_sobrenome e, depois, só o sobrenome', () => {
    assert.deepEqual(termosDaPesquisaDeUsuario('Gustavo Ricardo Pinto'), [
      'Gustavo.Pinto',
      'Pinto',
    ]);
  });

  it('uma palavra (login, nome ou código) segue como veio', () => {
    assert.deepEqual(termosDaPesquisaDeUsuario(' gustavo.pinto '), ['gustavo.pinto']);
    assert.deepEqual(termosDaPesquisaDeUsuario('12229'), ['12229']);
    assert.deepEqual(termosDaPesquisaDeUsuario('   '), []);
  });
});

describe('pessoaDoConsultor', () => {
  const pessoas = [
    { personId: 346, nome: 'Andre Ricci Da Silva', email: 'andre.ricci@sankhya.com.br', papel: '' },
    { personId: 1831, nome: 'André Segatto', email: 'andre.segatto@sankhya.com.br', papel: '' },
    {
      personId: 23504,
      nome: 'Gustavo Ricardo Pinto',
      email: 'gustavo.pinto@sankhya.com.br',
      papel: '',
    },
  ];

  it('casa nome abreviado da planilha com o nome completo da Experience', () => {
    assert.equal(pessoaDoConsultor('Gustavo Pinto', pessoas)?.personId, 23504);
    assert.equal(pessoaDoConsultor('Andre Segatto', pessoas)?.personId, 1831);
  });

  it('nome ambíguo ou desconhecido fica sem pessoa', () => {
    assert.equal(pessoaDoConsultor('Andre', pessoas), null);
    assert.equal(pessoaDoConsultor('Fulano da Silva', pessoas), null);
  });
});

describe('loginDoEmail', () => {
  it('só e-mail corporativo vira login do ERP', () => {
    assert.equal(loginDoEmail('Gustavo.Pinto@sankhya.com.br'), 'gustavo.pinto');
    assert.equal(loginDoEmail('aureo@amatools.com.br'), null);
  });
});

describe('situacaoNaAgenda', () => {
  const base = { codusu: 12229, codparc: 85482, nomeusu: 'GUSTAVO', usulancador: 'GP' };
  const oaco = {
    ...base,
    inicio: '2026-11-03 09:00:00',
    fim: '2026-11-03 12:00:00',
    descrabrev: 'OACO - Compras',
  } as EventoAgenda;
  const pedido = {
    codUsu: 12229,
    data: '2026-11-03',
    horaInicio: '09:00',
    horaFim: '12:00',
    titulo: 'OACO - Simulação',
  };

  it('mesmo parceiro cobrindo o horário: reaproveita, não grava outro', () => {
    assert.equal(situacaoNaAgenda([oaco], pedido, 85482).tipo, 'existente');
    assert.equal(
      situacaoNaAgenda([oaco], { ...pedido, horaInicio: '10:00', horaFim: '11:00' }, 85482).tipo,
      'existente',
    );
  });

  it('outro cliente, evento parcial ou sem parceiro conhecido com outro título: ocupado', () => {
    assert.equal(situacaoNaAgenda([oaco], pedido, 293).tipo, 'ocupado');
    assert.equal(situacaoNaAgenda([oaco], { ...pedido, horaFim: '13:00' }, 85482).tipo, 'ocupado');
    assert.equal(situacaoNaAgenda([oaco], pedido, null).tipo, 'ocupado');
    assert.equal(
      situacaoNaAgenda([oaco], { ...pedido, titulo: 'OACO - Compras' }, null).tipo,
      'existente',
    );
  });

  it('outro executante ou horário que só encosta: livre', () => {
    assert.equal(situacaoNaAgenda([oaco], { ...pedido, codUsu: 1 }, 85482).tipo, 'livre');
    assert.equal(
      situacaoNaAgenda([oaco], { ...pedido, horaInicio: '12:00', horaFim: '18:00' }, 85482).tipo,
      'livre',
    );
  });
});

describe('POST .../planilha/previa', () => {
  const ID_CLIENTE = '11111111-1111-4111-8111-111111111111';
  const ID_PROJETO = '22222222-2222-4222-8222-222222222222';

  async function planilhaBase64(linhas: string[][]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const aba = workbook.addWorksheet('Cronograma');
    aba.addRow(['Etapa', 'Processo', 'Consultor', 'Data', 'Hr início', 'Hr fim']);
    for (const linha of linhas) aba.addRow(linha);
    return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
  }

  function servidorCom(implantationId: number | null, pesquisas: string[] = []) {
    const servidor = Fastify();
    registrarRotasDeEquipeDoProjeto(
      servidor,
      {
        pesquisarUsuariosDoErp: async (termo: string) => {
          pesquisas.push(termo);
          return {
            conteudo: JSON.stringify({
              usuarios: [
                { codusu: 12469, nomeusu: 'GUSTAVO.PINTO', nomeCompleto: '', descrcargo: 'GP' },
              ],
            }),
          };
        },
      } as unknown as AgendaDaEquipe,
      {
        pessoasDoProjeto: async () => [
          {
            personId: 23504,
            nome: 'Gustavo Ricardo Pinto',
            email: 'gustavo.pinto@sankhya.com.br',
            papel: 'Gerente/Analista de Projeto',
          },
          { personId: 24539, nome: 'Aureo Duarte', email: 'aureo@amatools.com.br', papel: '' },
        ],
      } as unknown as ExperienceDaEquipe,
      {
        buscarPorId: async () => ({
          projetos: [{ id: ID_PROJETO, implantationId, membros: [] }],
        }),
      } as unknown as RepositorioClientes,
    );
    return servidor;
  }

  const url = `/api/clientes/${ID_CLIENTE}/projetos/${ID_PROJETO}/planilha/previa`;

  it('casa cada consultor com a Experience e o ERP, sem gravar nada', async () => {
    const pesquisas: string[] = [];
    const arquivoBase64 = await planilhaBase64([
      ['Etapa 1', 'Compras', 'Gustavo Pinto', '03/11/2026', '09:00', '12:00', '', ''],
      ['', 'Vendas', 'Gustavo Pinto', '04/11/2026', '13:00', '17:00', '', ''],
      ['', 'Fiscal', 'Aureo Duarte', '05/11/2026', '09:00', '10:00', '', ''],
      ['', 'Estoque', 'Fulano da Silva', '06/11/2026', '09:00', '10:00', '', ''],
    ]);
    const resposta = await servidorCom(11267, pesquisas).inject({
      method: 'POST',
      url,
      payload: { arquivoBase64 },
    });

    assert.equal(resposta.statusCode, 200);
    const corpo = resposta.json();
    assert.equal(corpo.linhas.length, 4);
    assert.deepEqual(
      corpo.consultores.map(
        (c: { texto: string; pessoa: unknown; recurso: { codusu: number } | null }) => [
          c.texto,
          c.pessoa !== null,
          c.recurso?.codusu ?? null,
        ],
      ),
      [
        ['Gustavo Pinto', true, 12469],
        ['Aureo Duarte', true, null], // do cliente: está na Experience, não no ERP
        ['Fulano da Silva', false, null],
      ],
    );
    assert.deepEqual(pesquisas, ['gustavo.pinto']); // uma pesquisa por consultor, não por linha
  });

  it('sem implantation_id do projeto, recusa antes de ler a planilha', async () => {
    const resposta = await servidorCom(null).inject({
      method: 'POST',
      url,
      payload: { arquivoBase64: 'x' },
    });
    assert.equal(resposta.statusCode, 400);
    assert.match(resposta.json().mensagem, /implantation_id/);
  });
});

describe('POST /api/google/meet', () => {
  function servidorDoMeet(criarMeetNoGoogle: (url: string) => Promise<{ meet: string }>) {
    const servidor = Fastify();
    registrarRotasDeEquipeDoProjeto(
      servidor,
      { criarMeetNoGoogle } as unknown as AgendaDaEquipe,
      {} as ExperienceDaEquipe,
      {} as RepositorioClientes,
    );
    return servidor;
  }
  const evento = 'https://calendar.google.com/calendar/render?action=TEMPLATE&vcon=meet';

  it('só repassa ao shell endereço do Google Agenda', async () => {
    const pedidos: string[] = [];
    const servidor = servidorDoMeet(async (url) => {
      pedidos.push(url);
      return { meet: 'https://meet.google.com/abc-defg-hij' };
    });
    const fora = await servidor.inject({
      method: 'POST',
      url: '/api/google/meet',
      payload: { url: 'https://exemplo.com/calendar/render?' },
    });
    assert.equal(fora.statusCode, 400);
    const certo = await servidor.inject({
      method: 'POST',
      url: '/api/google/meet',
      payload: { url: evento },
    });
    assert.equal(certo.statusCode, 200);
    assert.deepEqual(certo.json(), { meet: 'https://meet.google.com/abc-defg-hij' });
    assert.deepEqual(pedidos, [evento]);
  });

  it('falha do shell volta com o status e a mensagem dele', async () => {
    const servidor = servidorDoMeet(async () => {
      throw new PonteDoDesktopError('Google não está logado no Hub.', 409);
    });
    const resposta = await servidor.inject({
      method: 'POST',
      url: '/api/google/meet',
      payload: { url: evento },
    });
    assert.equal(resposta.statusCode, 409);
    assert.equal(resposta.json().mensagem, 'Google não está logado no Hub.');
  });
});

describe('Meet gravado e lembrete do Sankhya ID', () => {
  const ID_CLIENTE = '11111111-1111-4111-8111-111111111111';
  const ID_PROJETO = '22222222-2222-4222-8222-222222222222';

  function servidorCom(reenviar: (personId: number) => Promise<void>) {
    let projeto: Record<string, unknown> = { id: ID_PROJETO, meets: [], lembretesSankhyaId: {} };
    const servidor = Fastify();
    registrarRotasDeEquipeDoProjeto(
      servidor,
      {
        criarMeetNoGoogle: async () => ({ meet: 'https://meet.google.com/abc' }),
      } as unknown as AgendaDaEquipe,
      { reenviarEmailDoSankhyaId: reenviar } as unknown as ExperienceDaEquipe,
      {
        buscarPorId: async () => ({ projetos: [projeto] }),
        alterarProjeto: async (_c: string, _p: string, mudar: (p: unknown) => object) => {
          projeto = { ...projeto, ...mudar(projeto) };
          return projeto;
        },
      } as unknown as RepositorioClientes,
    );
    return { servidor, projeto: () => projeto };
  }

  it('Meet com data fica no projeto, substituindo o do mesmo horário', async () => {
    const { servidor, projeto } = servidorCom(async () => {});
    const payload = {
      url: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
      projeto: {
        id: ID_CLIENTE,
        idProjeto: ID_PROJETO,
        data: '2026-11-10',
        inicio: '09:00',
        fim: '10:00',
      },
    };
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await servidor.inject({ method: 'POST', url: '/api/google/meet', payload })).statusCode,
        200,
      );
    assert.deepEqual(projeto().meets, [
      { data: '2026-11-10', inicio: '09:00', fim: '10:00', link: 'https://meet.google.com/abc' },
    ]);
  });

  it('reenvia pela Experience e guarda a data; conta já ativa vira 409', async () => {
    const reenviados: number[] = [];
    const { servidor, projeto } = servidorCom(async (personId) => {
      if (personId === 2)
        throw new RecusaDaExperienceError('O Sankhya ID desta pessoa já está ativo.');
      reenviados.push(personId);
    });
    const url = (personId: number) =>
      `/api/clientes/${ID_CLIENTE}/projetos/${ID_PROJETO}/pessoas/${personId}/lembrete-sankhya-id`;
    const ok = await servidor.inject({ method: 'POST', url: url(27780) });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual(reenviados, [27780]);
    assert.ok((projeto().lembretesSankhyaId as Record<string, string>)['27780']);
    assert.equal((await servidor.inject({ method: 'POST', url: url(2) })).statusCode, 409);
  });
});

describe('eventoDoCliente', () => {
  const cliente = { nome: 'Amatool', nomesCompletos: [] };
  it('casa pelo parceiro, pelo título sem [SAR #n] e pelo formato do Hub', () => {
    const e = (nomeparc: string, descrabrev: string) =>
      eventoDoCliente({ nomeparc, descrabrev }, cliente);
    assert.equal(
      e('AMATOOLS COMERCIAL E IMPORTADORA LTDA', '[SAR #1445] AMATOOLS COMERCIAL'),
      true,
    );
    assert.equal(e('', '[SAR #1445] AMATOOLS COMERCIAL E IMPORTA'), true);
    assert.equal(e('', 'Amatool - Configuração | Kickoff'), true);
    assert.equal(e('EFALL MATERIAIS ELETRICOS', '[SAR #1817] EFALL MATERIAIS ELETRICOS'), false);
    assert.equal(e('', ''), false);
  });

  it('evento lançado direto no OM casa pelo parceiro da implantação, mesmo com outro nome', () => {
    const evento = {
      nomeparc: 'OUTRA RAZAO SOCIAL LTDA',
      descrabrev: 'Treinamento',
      codparc: 85482,
    };
    assert.equal(eventoDoCliente(evento, cliente), false);
    assert.equal(eventoDoCliente(evento, cliente, 85482), true);
    assert.equal(eventoDoCliente(evento, cliente, 999), false);
  });
});

describe('POST /api/google/meet guarda o Meet mesmo quando o shell falha', () => {
  it('sem salvar sozinho, guarda sem link e devolve o erro para a tela abrir o navegador', async () => {
    let projeto: Record<string, unknown> = { id: '22222222-2222-4222-8222-222222222222' };
    const servidor = Fastify();
    registrarRotasDeEquipeDoProjeto(
      servidor,
      {
        criarMeetNoGoogle: async () => {
          throw new PonteDoDesktopError('Gmail não logado', 502);
        },
      } as unknown as AgendaDaEquipe,
      {} as ExperienceDaEquipe,
      {
        alterarProjeto: async (_c: string, _p: string, mudar: (p: unknown) => object) => {
          projeto = { ...projeto, ...mudar(projeto) };
          return projeto;
        },
      } as unknown as RepositorioClientes,
    );
    const resposta = await servidor.inject({
      method: 'POST',
      url: '/api/google/meet',
      payload: {
        url: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
        projeto: {
          id: '11111111-1111-4111-8111-111111111111',
          idProjeto: '22222222-2222-4222-8222-222222222222',
          data: '2026-11-12',
          inicio: '14:00',
          fim: '15:00',
          titulo: 'Amatool - Configuração',
          fase: 'Configuração',
          convidados: [{ codusu: 13274, nome: 'RAPHAELA.BORGES' }],
        },
      },
    });
    assert.notEqual(resposta.statusCode, 200);
    assert.deepEqual(projeto.meets, [
      {
        data: '2026-11-12',
        inicio: '14:00',
        fim: '15:00',
        titulo: 'Amatool - Configuração',
        fase: 'Configuração',
        convidados: [{ codusu: 13274, nome: 'RAPHAELA.BORGES' }],
        link: null,
      },
    ]);
  });
});
