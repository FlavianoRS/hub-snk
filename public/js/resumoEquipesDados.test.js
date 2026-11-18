import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adaptarResumoEquipes,
  agregarResumoEquipes,
  criarDadosDoResumoEquipes,
  numeroDoResumo,
} from './resumoEquipesDados.js';

const membro = (codusu, nomeusu) => ({ codusu, nomeusu });
const os = (id, codusuResolvido, horasFeitas, statusAceite = 'Concluído') => ({
  id,
  codusuResolvido,
  horasFeitas,
  statusAceite,
});
function exemplo() {
  return adaptarResumoEquipes({
    clientes: [
      {
        id: 'c1',
        nome: 'Cliente Árvore',
        projetos: [
          {
            id: 'p1',
            nome: 'Fiscal',
            membros: [membro(1, 'Marina'), membro(2, 'Diego')],
            os: [
              os(1, 1, '2:30'),
              os(2, 2, '1:15', 'Aberto'),
              os(3, null, '3:00'),
              os(4, 1, '0:30', 'Rejeitado'),
            ],
          },
          {
            id: 'p2',
            nome: 'Produção',
            membros: [membro(1, 'Marina'), membro(3, 'Ana')],
            os: [os(5, 1, '4:00', 'Aberto'), os(6, 3, '2:00')],
          },
          { id: 'vazio', nome: 'Sem equipe', membros: [], os: [] },
        ],
      },
      {
        id: 'c2',
        nome: 'Cliente sem OS',
        projetos: [
          { id: 'p3', nome: 'Financeiro', membros: [membro(2, 'Diego')], os: [], avisoOs: null },
        ],
      },
      {
        id: 'c3',
        nome: 'Indisponível',
        projetos: [
          {
            id: 'p4',
            nome: 'Sem implantação',
            membros: [membro(4, 'Carlos')],
            os: null,
            avisoOs: 'sem implantation_id',
          },
        ],
      },
    ],
  });
}

describe('Resumo das equipes', () => {
  it('agrega projeto, cliente e geral reutilizando a tradução de horas e status da Equipe', () => {
    const resultado = agregarResumoEquipes(exemplo());
    assert.deepEqual(resultado.resumo, {
      horas: 13.25,
      abertas: 2,
      concluidas: 3,
      clientes: 3,
      projetos: 4,
      pessoas: 4,
    });
    assert.deepEqual(resultado.clientes[0].projetos[0].resumo, {
      horas: 7.25,
      abertas: 1,
      concluidas: 2,
    });
    assert.deepEqual(resultado.clientes[0].resumo, { horas: 13.25, abertas: 2, concluidas: 3 });
    assert.equal(resultado.clientes[1].projetos[0].resumo.horas, 0);
    assert.equal(resultado.clientes[2].projetos[0].os, null);
    assert.equal(resultado.clientes[2].projetos[0].avisoOs, 'sem implantation_id');
  });
  it('filtra uma pessoa, exclui OS sem dono e mantém equipe completa com PESSOAS filtradas/total', () => {
    const resultado = agregarResumoEquipes(exemplo(), { pessoas: [1] });
    assert.deepEqual(resultado.resumo, {
      horas: 7,
      abertas: 1,
      concluidas: 1,
      clientes: 1,
      projetos: 2,
      pessoas: 1,
    });
    const projeto = resultado.clientes[0].projetos[0];
    assert.equal(projeto.pessoas, '1/2');
    assert.equal(projeto.membros.length, 2);
    assert.equal(projeto.membros[0].selecionada, true);
    assert.equal(projeto.membros[1].selecionada, false);
  });
  it('duas pessoas somam só suas OS e preservam cliente sem OS no período', () => {
    const resultado = agregarResumoEquipes(exemplo(), { pessoas: [1, 2] });
    assert.deepEqual(resultado.resumo, {
      horas: 8.25,
      abertas: 2,
      concluidas: 1,
      clientes: 2,
      projetos: 3,
      pessoas: 2,
    });
    assert.equal(resultado.clientes[0].projetos[0].pessoas, '2/2');
    assert.equal(resultado.clientes[1].projetos[0].pessoas, '1/1');
    assert.equal(resultado.clientes[1].projetos[0].resumo.horas, 0);
  });
  it('destaque de pessoa compartilhada usa o conjunto inteiro mesmo ao filtrar cliente/projeto', () => {
    const base = exemplo();
    const copia = structuredClone(base);
    const resultado = agregarResumoEquipes(base, {
      clientes: ['c1'],
      projetos: [base[0].projetos[0].chave],
    });
    assert.equal(resultado.clientes[0].projetos[0].membros[0].compartilhada, true);
    assert.equal(resultado.clientes[0].projetos[0].membros[1].compartilhada, true);
    assert.deepEqual(base, copia);
    assert.equal(resultado.opcoes.pessoas.find((p) => p.id === 1).quantidadeProjetos, 2);
  });
  it('busca cliente, projeto e pessoa, combina filtros e não confunde nomes iguais com ids diferentes', () => {
    assert.equal(agregarResumoEquipes(exemplo(), { busca: 'arvore' }).resumo.projetos, 2);
    assert.equal(agregarResumoEquipes(exemplo(), { busca: 'produção' }).resumo.projetos, 1);
    assert.equal(agregarResumoEquipes(exemplo(), { busca: 'Carlos' }).resumo.projetos, 1);
    assert.equal(
      agregarResumoEquipes(exemplo(), { clientes: ['c2'], pessoas: [1] }).resumo.projetos,
      0,
    );
    const base = exemplo();
    base[0].projetos[1].membros[0] = membro(99, 'Marina');
    assert.equal(
      agregarResumoEquipes(base).clientes[0].projetos[0].membros[0].compartilhada,
      false,
    );
  });
  it('zero e indisponível viram traço; horas fracionadas mantêm a precisão', () => {
    for (const valor of [0, null, undefined]) assert.equal(numeroDoResumo(valor, 'h'), '—');
    assert.equal(numeroDoResumo(1.25, 'h'), '1,25h');
    assert.equal(numeroDoResumo(3), '3');
  });
  it('transporta só o período na rota e traduz OS sem nova regra de cálculo', async () => {
    const pedidos = [];
    const dados = criarDadosDoResumoEquipes(async (url) => {
      pedidos.push(url);
      return {
        clientes: [
          {
            id: 'c',
            nome: 'Cliente',
            projetos: [{ id: 'p', membros: [membro(1, 'Marina')], os: [os(1, 1, '1:30')] }],
          },
        ],
      };
    });
    const base = await dados.ler({ de: '2026-10-01', ate: '2026-10-31' });
    assert.deepEqual(pedidos, ['/api/equipes/resumo?de=2026-10-01&ate=2026-10-31']);
    assert.equal(base[0].projetos[0].os[0].horas, 1.5);
  });
});
