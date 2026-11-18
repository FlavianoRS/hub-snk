import { iconeDeUsuarioChave } from './equipeDoProjeto.js';
import { periodoAtualDaEquipe } from './equipeDoProjetoDados.js';
import { agregarResumoEquipes, numeroDoResumo } from './resumoEquipesDados.js';

/** Quadro do GP: os filtros trabalham sobre a última leitura, sem consultar a Experience. */
export function iniciarResumoEquipes({
  mount,
  criarElemento: el,
  criarBotao: botao,
  dados,
  abrirProjeto,
  podeGerenciar,
  exibirAviso,
  criarLinkDaConfiguracaoDoErro,
}) {
  let base = [];
  let periodo = periodoAtualDaEquipe();
  let versao = 0;
  const filtros = { clientes: [], projetos: [], pessoas: [], busca: '' };
  const raiz = el('section', 'resumo-equipes');
  const cabecalho = el('div', 'resumo-equipes-cabecalho');
  const titulo = el('div');
  const subtitulo = el('p', 'texto-auxiliar');
  titulo.append(el('h2', null, 'Resumo das equipes'), subtitulo);
  const controles = el('div', 'resumo-equipes-controles');
  const busca = el('input', 'busca');
  busca.type = 'search';
  busca.placeholder = 'Buscar cliente, projeto ou pessoa';
  busca.setAttribute('aria-label', busca.placeholder);
  busca.addEventListener('input', () => {
    filtros.busca = busca.value;
    renderizar();
  });
  const seletorPeriodo = el('details', 'resumo-equipes-periodo');
  const rotuloPeriodo = el('summary', 'btn');
  const formPeriodo = el('form', 'resumo-equipes-popover equipe-periodo');
  const campos = {};
  for (const [nome, rotulo] of [
    ['de', 'De'],
    ['ate', 'Até'],
  ]) {
    const label = el('label', 'campo', rotulo);
    const input = el('input');
    input.type = 'date';
    input.name = nome;
    input.required = true;
    input.value = periodo[nome];
    campos[nome] = input;
    label.append(input);
    formPeriodo.append(label);
  }
  const aplicarPeriodo = botao('btn primario', 'Consultar período', () => {});
  aplicarPeriodo.type = 'submit';
  formPeriodo.append(aplicarPeriodo);
  formPeriodo.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!formPeriodo.reportValidity()) return;
    if (campos.de.value > campos.ate.value) {
      exibirAviso('O fim deve ser igual ou posterior ao início.', 'erro');
      return;
    }
    periodo = { de: campos.de.value, ate: campos.ate.value };
    seletorPeriodo.open = false;
    void carregar();
  });
  seletorPeriodo.append(rotuloPeriodo, formPeriodo);
  const atualizar = botao('btn', 'Atualizar', () => void carregar());
  controles.append(busca, seletorPeriodo, atualizar);
  cabecalho.append(titulo, controles);
  const situacao = el('p', 'texto-auxiliar');
  situacao.setAttribute('role', 'status');
  situacao.hidden = true;
  const kpis = el('div', 'resumo-equipes-kpis');
  const barra = el('div', 'resumo-equipes-filtros');
  const quadroCabecalho = el('div', 'resumo-equipes-quadro-cabecalho');
  const quantidadeClientes = el('h3');
  const setas = el('div', 'resumo-equipes-setas');
  const quadro = el('div', 'resumo-equipes-quadro');
  quadro.tabIndex = 0;
  quadro.setAttribute(
    'aria-label',
    'Projetos por cliente; role horizontalmente para ver mais clientes',
  );
  const anterior = botao('btn', '‹', () => quadro.scrollBy({ left: -296, behavior: 'smooth' }));
  const proximo = botao('btn', '›', () => quadro.scrollBy({ left: 296, behavior: 'smooth' }));
  anterior.setAttribute('aria-label', 'Clientes anteriores');
  proximo.setAttribute('aria-label', 'Próximos clientes');
  setas.append(anterior, proximo);
  quadroCabecalho.append(quantidadeClientes, setas);
  raiz.append(
    el('p', 'texto-auxiliar', 'Painel do GP › Resumo das equipes'),
    cabecalho,
    situacao,
    kpis,
    barra,
    quadroCabecalho,
    quadro,
  );
  mount.append(raiz);

  function fecharSeletores(exceto) {
    for (const details of raiz.querySelectorAll('details'))
      if (details !== exceto) details.open = false;
  }
  raiz.addEventListener('click', (evento) => {
    const details = evento.target.closest('details');
    fecharSeletores(details);
  });
  document.addEventListener('click', (evento) => {
    if (!raiz.contains(evento.target)) fecharSeletores();
  });
  raiz.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    const aberto = raiz.querySelector('details[open]');
    fecharSeletores();
    aberto?.querySelector('summary').focus();
  });

  function seletor(chave, rotulo, opcoes) {
    const details = el('details', 'resumo-equipes-seletor');
    const resumo = el(
      'summary',
      filtros[chave].length ? 'resumo-equipes-filtro ativo' : 'resumo-equipes-filtro',
    );
    const nomes = opcoes.filter((o) => filtros[chave].includes(o.id)).map((o) => o.nome);
    resumo.append(
      el('span', null, `${rotulo}: `),
      el('strong', null, nomes.length ? nomes.join(', ') : chave === 'pessoas' ? 'Todas' : 'Todos'),
    );
    if (filtros[chave].length) {
      const limpar = botao('resumo-equipes-limpar-seletor', '×', (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        filtros[chave] = [];
        renderizar();
      });
      limpar.setAttribute('aria-label', `Limpar filtro ${rotulo}`);
      resumo.append(limpar);
    } else resumo.append(el('span', null, '▾'));
    const painel = el('div', 'resumo-equipes-popover');
    painel.setAttribute('role', 'group');
    painel.setAttribute('aria-label', `Selecionar ${rotulo.toLocaleLowerCase('pt-BR')}`);
    const pesquisa = el('input', 'busca');
    pesquisa.type = 'search';
    pesquisa.placeholder = `Buscar ${rotulo.toLocaleLowerCase('pt-BR')}`;
    pesquisa.setAttribute('aria-label', pesquisa.placeholder);
    const lista = el('div', 'resumo-equipes-opcoes');
    let rascunho = new Set(filtros[chave]);
    const rodape = el('div', 'resumo-equipes-seletor-rodape');
    const contagem = el('span', 'texto-auxiliar');
    const aplicar = botao('btn primario', '', () => {
      filtros[chave] = [...rascunho];
      renderizar();
      barra.querySelector(`[data-filtro="${chave}"] summary`)?.focus();
    });
    function listar() {
      const termo = pesquisa.value.trim().toLocaleLowerCase('pt-BR');
      lista.replaceChildren();
      for (const opcao of [...opcoes].sort(
        (a, b) => Number(rascunho.has(b.id)) - Number(rascunho.has(a.id)),
      )) {
        if (!`${opcao.nome} ${opcao.detalhe ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
          continue;
        const label = el(
          'label',
          `resumo-equipes-opcao${rascunho.has(opcao.id) ? ' marcada' : ''}`,
        );
        const check = el('input');
        check.type = 'checkbox';
        check.checked = rascunho.has(opcao.id);
        check.addEventListener('change', () => {
          if (check.checked) rascunho.add(opcao.id);
          else rascunho.delete(opcao.id);
          listar();
          [...lista.querySelectorAll('input')]
            .find((input) => input.dataset.id === String(opcao.id))
            ?.focus();
        });
        check.dataset.id = String(opcao.id);
        const nome = el('span', null, opcao.nome);
        if (opcao.detalhe) nome.append(el('small', null, opcao.detalhe));
        label.append(check, nome);
        lista.append(label);
      }
      if (!lista.hasChildNodes()) lista.append(el('p', 'texto-auxiliar', 'Nenhum resultado.'));
      contagem.textContent = `${rascunho.size} selecionados`;
      aplicar.textContent = `Aplicar (${rascunho.size})`;
    }
    pesquisa.addEventListener('input', listar);
    details.addEventListener('toggle', () => {
      if (details.open) {
        rascunho = new Set(filtros[chave]);
        pesquisa.value = '';
        listar();
        pesquisa.focus();
      }
    });
    rodape.append(contagem, aplicar);
    painel.append(pesquisa, lista, rodape);
    details.dataset.filtro = chave;
    details.append(resumo, painel);
    listar();
    return details;
  }

  function estatistica(rotulo, valor, classe, grande = false) {
    const bloco = el(
      grande ? 'div' : 'span',
      grande ? 'resumo-equipes-kpi' : 'resumo-equipes-stat',
    );
    const numero = el('strong', valor === '—' ? 'resumo-equipes-zero' : classe, valor);
    const label = el('span', null, rotulo);
    if (grande) bloco.append(label, numero);
    else bloco.append(numero, label);
    return bloco;
  }

  function renderizar() {
    const { clientes, resumo, porPessoa, opcoes } = agregarResumoEquipes(base, filtros);
    const data = (iso) => iso.split('-').reverse().join('/');
    rotuloPeriodo.textContent = `Período: ${data(periodo.de)} – ${data(periodo.ate)} ▾`;
    subtitulo.textContent = `Seus projetos como GP · ${resumo.clientes} clientes · ${resumo.projetos} projetos · ${resumo.pessoas} pessoas${porPessoa ? ' filtradas' : ''}`;
    kpis.replaceChildren(
      estatistica('Horas de OS no período', numeroDoResumo(resumo.horas, ' h'), '', true),
      estatistica('OS abertas', numeroDoResumo(resumo.abertas), 'resumo-equipes-abertas', true),
      estatistica(
        'OS concluídas',
        numeroDoResumo(resumo.concluidas),
        'resumo-equipes-concluidas',
        true,
      ),
      estatistica('Pessoas', numeroDoResumo(resumo.pessoas), 'resumo-equipes-pessoas', true),
    );
    barra.replaceChildren(
      el('span', 'texto-auxiliar', 'Filtrar'),
      seletor('clientes', 'Cliente', opcoes.clientes),
      seletor('projetos', 'Projeto', opcoes.projetos),
      seletor('pessoas', 'Pessoa', opcoes.pessoas),
    );
    if (
      filtros.clientes.length ||
      filtros.projetos.length ||
      filtros.pessoas.length ||
      filtros.busca
    )
      barra.append(
        botao('resumo-equipes-link', 'Limpar filtros', () => {
          filtros.clientes = [];
          filtros.projetos = [];
          filtros.pessoas = [];
          filtros.busca = '';
          busca.value = '';
          renderizar();
        }),
      );
    if (porPessoa)
      barra.append(el('span', 'texto-auxiliar', '· horas e OS somente das pessoas filtradas'));
    barra.append(el('span', 'resumo-equipes-legenda', 'Pessoa em mais de um projeto'));
    quantidadeClientes.textContent = `Clientes (${clientes.length})`;
    const posicao = quadro.scrollLeft;
    quadro.replaceChildren();
    for (const cliente of clientes) {
      const coluna = el('section', 'resumo-equipes-coluna');
      const cab = el('header');
      cab.append(
        el('h3', null, cliente.nome),
        el(
          'p',
          'texto-auxiliar',
          `${cliente.projetos.length} ${cliente.projetos.length === 1 ? 'projeto' : 'projetos'} · ${numeroDoResumo(cliente.resumo.horas, ' h')} no período`,
        ),
      );
      coluna.append(cab);
      for (const projeto of cliente.projetos) {
        const card = botao('resumo-equipes-projeto', '', () => {
          if (podeGerenciar()) abrirProjeto(cliente, projeto);
        });
        card.setAttribute(
          'aria-label',
          `Abrir Equipe do Projeto: ${projeto.nome}, ${cliente.nome}`,
        );
        const stats = el('span', 'resumo-equipes-stats');
        stats.append(
          estatistica('Horas', numeroDoResumo(projeto.resumo.horas, 'h'), ''),
          estatistica('Abertas', numeroDoResumo(projeto.resumo.abertas), 'resumo-equipes-abertas'),
          estatistica(
            'Concluídas',
            numeroDoResumo(projeto.resumo.concluidas),
            'resumo-equipes-concluidas',
          ),
          estatistica(
            'Pessoas',
            typeof projeto.pessoas === 'string' ? projeto.pessoas : numeroDoResumo(projeto.pessoas),
            'resumo-equipes-pessoas',
          ),
        );
        const pessoas = el('span', 'resumo-equipes-membros');
        for (const membro of projeto.membros) {
          const chip = el(
            'span',
            `resumo-equipes-pessoa${membro.compartilhada ? ' compartilhada' : ''}${membro.selecionada ? ' selecionada' : ''}`,
            membro.nomeusu,
          );
          if (membro.usuarioChave) chip.prepend(iconeDeUsuarioChave(el));
          if (membro.compartilhada) chip.title = 'Pessoa em mais de um projeto';
          pessoas.append(chip);
        }
        card.append(
          el('span', 'resumo-equipes-projeto-nome', projeto.nome),
          el(
            'span',
            `resumo-equipes-fase${projeto.faseAtual ? '' : ' vazia'}`,
            projeto.faseAtual ? `Fase: ${projeto.faseAtual}` : 'Fase não definida',
          ),
          stats,
          pessoas,
        );
        if (projeto.avisoOs) card.append(el('span', 'resumo-equipes-aviso', projeto.avisoOs));
        card.append(el('span', 'resumo-equipes-abrir', 'Abrir projeto ›'));
        coluna.append(card);
      }
      quadro.append(coluna);
    }
    if (!clientes.length)
      quadro.append(
        el(
          'p',
          'texto-auxiliar',
          base.length
            ? 'Nenhum projeto corresponde aos filtros.'
            : 'Nenhum projeto com equipe definida neste Hub. Adicione pessoas na guia Equipe do Projeto.',
        ),
      );
    quadro.scrollLeft = posicao;
    atualizarSetas();
  }
  function atualizarSetas() {
    anterior.disabled = quadro.scrollLeft <= 1;
    proximo.disabled = quadro.scrollLeft + quadro.clientWidth >= quadro.scrollWidth - 1;
  }
  quadro.addEventListener('scroll', atualizarSetas);
  new ResizeObserver(atualizarSetas).observe(quadro);

  async function carregar() {
    if (!podeGerenciar()) return;
    const leitura = ++versao;
    base = [];
    atualizar.disabled = true;
    situacao.hidden = false;
    situacao.textContent = 'Consultando OS na Experience…';
    raiz.setAttribute('aria-busy', 'true');
    renderizar();
    quadro.replaceChildren(el('p', 'texto-auxiliar', 'Consultando OS na Experience…'));
    try {
      const resultado = await dados.ler(periodo);
      if (leitura !== versao || !podeGerenciar()) return;
      base = resultado;
      situacao.hidden = true;
      renderizar();
    } catch (erro) {
      if (leitura !== versao || !podeGerenciar()) return;
      // Evita misturar números do período anterior com o cabeçalho do novo período.
      kpis.replaceChildren();
      quadro.replaceChildren();
      quantidadeClientes.textContent = 'Clientes';
      subtitulo.textContent = 'Seus projetos como GP';
      situacao.textContent = erro.message;
      const configuracao = criarLinkDaConfiguracaoDoErro?.(erro);
      if (configuracao) situacao.append(' ', configuracao);
      const repetir = botao('btn', 'Tentar novamente', () => void carregar());
      quadro.append(repetir);
      exibirAviso(erro.message, 'erro');
    } finally {
      if (leitura === versao) {
        atualizar.disabled = false;
        raiz.setAttribute('aria-busy', 'false');
      }
    }
  }
  return {
    abrir: carregar,
    aplicarAcessos() {
      if (!podeGerenciar()) {
        versao++;
        base = [];
        fecharSeletores();
        kpis.replaceChildren();
        quadro.replaceChildren();
      }
    },
  };
}
