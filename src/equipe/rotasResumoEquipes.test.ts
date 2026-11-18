import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import type { AgendaDaEquipe } from './agendaDaEquipe.ts';
import { SessaoExpiradaError } from '../sankhya/experience.ts';
import type { ExperienceDaEquipe } from './experienceDaEquipe.ts';
import type { RepositorioClientes } from '../repositorio/repositorioClientes.ts';
import { registrarRotasDeEquipeDoProjeto } from './rotasEquipeDoProjeto.ts';

const url = '/api/equipes/resumo?de=2026-10-01&ate=2026-10-31';
function servidorCom(ordens: ExperienceDaEquipe['ordens']) {
  const servidor = Fastify();
  const membros = [{ codusu: 1, nomeusu: 'Marina Alves' }];
  const clientes = [
    {
      id: 'c1',
      nome: 'Cliente',
      projetos: [
        { id: 'p1', nome: 'Implantação', membros, implantationId: 100 },
        { id: 'p2', nome: 'Sem ID', membros, implantationId: null },
        { id: 'p3', nome: 'Falha', membros, implantationId: 300 },
        { id: 'p4', nome: 'Sem equipe', membros: [], implantationId: 400 },
      ],
    },
    { id: 'c2', nome: 'Sem projetos', projetos: [] },
  ];
  registrarRotasDeEquipeDoProjeto(
    servidor,
    new Proxy(
      {},
      {
        get() {
          throw new Error('Resumo não deve consultar Agenda');
        },
      },
    ) as AgendaDaEquipe,
    { ordens } as ExperienceDaEquipe,
    { listar: async () => clientes } as unknown as RepositorioClientes,
  );
  return servidor;
}

describe('GET /api/equipes/resumo', () => {
  it('isola projeto sem implantação e falha parcial, resolve membros e não consulta Agenda', async (t) => {
    const chamadas: unknown[][] = [];
    const servidor = servidorCom(async (...argumentos) => {
      chamadas.push(argumentos);
      if (argumentos[0] === 300) throw new Error('Experience indisponível');
      return [
        { id: 1, pessoa: 'Marina Alves' },
        { id: 2, pessoa: 'Outra Pessoa' },
      ] as Awaited<ReturnType<ExperienceDaEquipe['ordens']>>;
    });
    t.after(() => servidor.close());
    const resposta = await servidor.inject(url);
    assert.equal(resposta.statusCode, 200);
    const { clientes } = resposta.json();
    assert.equal(clientes.length, 1);
    assert.equal(clientes[0].projetos.length, 3);
    const [normal, semId, falha] = clientes[0].projetos;
    assert.equal(normal.os[0].codusuResolvido, 1);
    assert.equal(normal.os[1].codusuResolvido, null);
    assert.equal(normal.avisoOs, null);
    assert.equal(semId.os, null);
    assert.match(semId.avisoOs, /sem implantation_id/);
    assert.equal(falha.os, null);
    assert.equal(falha.avisoOs, 'Experience indisponível');
    assert.deepEqual(chamadas, [
      [100, null, '2026-10-01', '2026-10-31'],
      [300, null, '2026-10-01', '2026-10-31'],
    ]);
  });
  it('preserva 409 e o destino de configuração quando a sessão expira', async (t) => {
    const servidor = servidorCom(async () => {
      throw new SessaoExpiradaError('Sessão expirada');
    });
    t.after(() => servidor.close());
    const resposta = await servidor.inject(url);
    assert.equal(resposta.statusCode, 409);
    assert.deepEqual(resposta.json(), {
      mensagem: 'Sessão expirada',
      sessaoExpirada: true,
      configuracaoPendente: 'sessao-experience',
    });
  });
  it('valida período e inicia as consultas em paralelo', async (t) => {
    let liberar: () => void = () => {};
    const primeira = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const servidor = servidorCom(async (implantacao) => {
      if (implantacao === 100) await primeira;
      else liberar();
      return [];
    });
    t.after(() => servidor.close());
    assert.equal((await servidor.inject('/api/equipes/resumo')).statusCode, 400);
    assert.equal(
      (await servidor.inject('/api/equipes/resumo?de=2026-11-01&ate=2026-10-01')).statusCode,
      400,
    );
    assert.equal((await servidor.inject(url)).statusCode, 200);
  });
});
