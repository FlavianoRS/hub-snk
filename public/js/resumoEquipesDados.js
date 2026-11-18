import { periodoAtualDaEquipe, resumirOs, traduzirOs } from './equipeDoProjetoDados.js';

const normalizar = (texto) =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
export const chaveDoProjeto = (cliente, projeto) => JSON.stringify([cliente.id, projeto.id]);
export const numeroDoResumo = (valor, sufixo = '') =>
  valor ? `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}` : '—';

export function adaptarResumoEquipes(resposta) {
  return resposta.clientes
    .map((cliente) => ({
      ...cliente,
      projetos: cliente.projetos
        .filter((projeto) => projeto.membros.length)
        .map((projeto) => ({
          ...projeto,
          chave: chaveDoProjeto(cliente, projeto),
          os: projeto.os === null ? null : projeto.os.map(traduzirOs),
        })),
    }))
    .filter((cliente) => cliente.projetos.length);
}

export function opcoesDoResumo(clientes) {
  const pessoas = new Map();
  for (const cliente of clientes)
    for (const projeto of cliente.projetos)
      for (const membro of projeto.membros) {
        if (membro.codusu === null) continue;
        if (!pessoas.has(membro.codusu))
          pessoas.set(membro.codusu, {
            id: membro.codusu,
            nome: membro.nomeusu,
            projetos: new Set(),
          });
        pessoas.get(membro.codusu).projetos.add(projeto.chave);
      }
  const ordenar = (lista) => lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    clientes: ordenar(clientes.map(({ id, nome }) => ({ id, nome }))),
    projetos: ordenar(
      clientes.flatMap((cliente) =>
        cliente.projetos.map((projeto) => ({
          id: projeto.chave,
          nome: projeto.nome,
          detalhe: cliente.nome,
        })),
      ),
    ),
    pessoas: ordenar(
      [...pessoas.values()].map(({ projetos, ...pessoa }) => ({
        ...pessoa,
        quantidadeProjetos: projetos.size,
      })),
    ),
  };
}

/** Filtros nunca alteram a base: o destaque considera todos os projetos do GP. */
export function agregarResumoEquipes(clientes, filtros = {}) {
  const selecionados = (chave) => new Set(filtros[chave] ?? []);
  const clientesSelecionados = selecionados('clientes');
  const projetosSelecionados = selecionados('projetos');
  const pessoasSelecionadas = selecionados('pessoas');
  const porPessoa = pessoasSelecionadas.size > 0;
  const termo = normalizar(filtros.busca?.trim());
  const opcoes = opcoesDoResumo(clientes);
  const compartilhadas = new Set(
    opcoes.pessoas.filter((p) => p.quantidadeProjetos > 1).map((p) => p.id),
  );
  const pessoasVisiveis = new Set();
  const visiveis = clientes.flatMap((cliente) => {
    if (clientesSelecionados.size && !clientesSelecionados.has(cliente.id)) return [];
    const projetos = cliente.projetos.flatMap((projeto) => {
      if (projetosSelecionados.size && !projetosSelecionados.has(projeto.chave)) return [];
      const membrosFiltrados = projeto.membros.filter(
        (m) => !porPessoa || pessoasSelecionadas.has(m.codusu),
      );
      if (porPessoa && !membrosFiltrados.length) return [];
      if (
        termo &&
        !normalizar(
          [cliente.nome, projeto.nome, ...projeto.membros.map((m) => m.nomeusu)].join(' '),
        ).includes(termo)
      )
        return [];
      for (const membro of membrosFiltrados)
        if (membro.codusu !== null) pessoasVisiveis.add(membro.codusu);
      const os = projeto.os?.filter((ordem) => !porPessoa || pessoasSelecionadas.has(ordem.codusu));
      return [
        {
          ...projeto,
          resumo: resumirOs(os ?? []),
          pessoas: porPessoa
            ? `${membrosFiltrados.length}/${projeto.membros.length}`
            : projeto.membros.length,
          membros: projeto.membros.map((m) => ({
            ...m,
            compartilhada: compartilhadas.has(m.codusu),
            selecionada: porPessoa && pessoasSelecionadas.has(m.codusu),
          })),
        },
      ];
    });
    return projetos.length ? [{ ...cliente, projetos, resumo: somarResumos(projetos) }] : [];
  });
  return {
    clientes: visiveis,
    resumo: {
      ...somarResumos(visiveis),
      clientes: visiveis.length,
      projetos: visiveis.reduce((n, c) => n + c.projetos.length, 0),
      pessoas: pessoasVisiveis.size,
    },
    porPessoa,
    opcoes,
  };
}

function somarResumos(itens) {
  return itens.reduce(
    (total, item) => ({
      horas: total.horas + item.resumo.horas,
      abertas: total.abertas + item.resumo.abertas,
      concluidas: total.concluidas + item.resumo.concluidas,
    }),
    { horas: 0, abertas: 0, concluidas: 0 },
  );
}

export function criarDadosDoResumoEquipes(requisitar) {
  return {
    async ler(periodo = periodoAtualDaEquipe()) {
      return adaptarResumoEquipes(
        await requisitar(`/api/equipes/resumo?${new URLSearchParams(periodo)}`),
      );
    },
  };
}
