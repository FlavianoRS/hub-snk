import {
  resumirOs,
  validarNovaTarefa,
  pendenciasDaNovaTarefa,
  arvoreDoMapeamento,
  periodoAtualDaEquipe,
  mesesDoPeriodo,
  linhasDaPrevia,
  eventosDoLote,
  tarefasDoLote,
  processosDoMapeamento,
  meetsDoLote,
  membroSemCorrespondencia,
  paraBase64,
  enderecoDoMeet,
  membroUsuarioChave,
  chaveDaPessoa,
  conviteDoMeet,
  pessoasDoProjeto,
  loginDoEmail,
  tituloDaReserva,
  textoDosModulos,
  fasesDaReserva,
  modulosDaFase,
  fasesNovas,
  eventosDaReserva,
  linhasDoCronograma,
  filtrarCronograma,
  htmlDoCronograma,
  textoDoCronograma,
  assuntoDoCronograma,
  destinatariosDoCronograma,
  emailValido,
  pendentesDoSankhyaId,
  situacaoDoSankhyaId,
  membroDaPessoa,
} from './equipeDoProjetoDados.js';

const STATUS = {
  concluida: ['Concluída', 'ok'],
  aberta: ['Aberta', 'atencao'],
  rejeitada: ['Rejeitada', 'erro'],
  confirmado: ['Confirmado', 'ok'],
  cancelado: ['Cancelado', 'erro'],
  'em-edicao': ['Em edição', 'atencao'],
};
const horas = (valor) => `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`;
const dia = (valor) => valor.slice(0, 10).split('-').reverse().join('/');
const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Chave dourada ao lado do nome do usuário chave (equipe do projeto e resumo das equipes). */
export function iconeDeUsuarioChave(el) {
  const icone = el('span', 'icone-usuario-chave');
  icone.setAttribute('role', 'img');
  icone.setAttribute('aria-label', 'Usuário chave');
  icone.title = 'Usuário chave';
  return icone;
}

/** Recebe os auxiliares do Hub e um adaptador substituível; nenhum fetch fica na UI. */
export function iniciarEquipeDoProjeto({
  criarElemento: el,
  criarBotao: botao,
  criarBotaoDeIcone: botaoDeIcone,
  iconeExpandir,
  exibirAviso,
  podeGerenciar,
  dados,
}) {
  const adicionar = document.getElementById('modal-equipe-adicionar');
  const reservar = document.getElementById('modal-equipe-reservar');
  const busca = document.getElementById('equipe-busca');
  const resultados = document.getElementById('equipe-resultados');
  const erroBusca = document.getElementById('equipe-erro-busca');
  const tituloBusca = document.getElementById('equipe-adicionar-titulo');
  const avisoBusca = document.getElementById('equipe-aviso-busca');
  const formulario = document.getElementById('formulario-equipe-reservar');
  const campo = (nome) => formulario.elements.namedItem(nome);
  const erroReserva = document.getElementById('equipe-erro-reserva');
  const importarProcessos = document.getElementById('equipe-importar-processos');
  const previa = document.getElementById('equipe-previa');
  const confirmar = document.getElementById('equipe-confirmar');
  const planilha = document.getElementById('modal-equipe-planilha');
  const arquivoPlanilha = document.getElementById('equipe-planilha-arquivo');
  const conteudoPlanilha = document.getElementById('equipe-planilha-conteudo');
  const erroPlanilha = document.getElementById('equipe-erro-planilha');
  const gravarPlanilha = document.getElementById('equipe-planilha-gravar');
  const meetDaPlanilha = document.getElementById('equipe-planilha-meet');
  const agendaDaPlanilha = document.getElementById('equipe-planilha-agenda');
  const experienceDaPlanilha = document.getElementById('equipe-planilha-experience');
  const cronograma = document.getElementById('modal-equipe-cronograma');
  const dialogoDia = document.getElementById('modal-equipe-dia');
  const tituloDia = document.getElementById('equipe-dia-titulo');
  const conteudoDia = document.getElementById('equipe-dia-conteudo');
  const subtituloDia = document.getElementById('equipe-dia-subtitulo');
  /** `{ contexto, versao, alterou }` do popup do dia aberto. */
  let estadoDia = null;
  const noCronograma = (id) => document.getElementById(`cronograma-${id}`);
  /** `{ contexto, equipe, periodo, para, fases, codusus, assuntoEditado, versao, enviando }`. */
  let estadoCronograma = null;
  const abasAtivas = new Map();
  const secoes = new Map();
  const expandidos = new Map();
  let contextoBusca = null;
  let contextoReserva = null;
  let versaoBusca = 0;
  let sequencia = 0;
  let temporizadorBusca;
  let enviando = false;
  let resultadoIndeterminado = false;
  let contextoPlanilha = null;
  /** `{ linhas (editáveis), consultores, erros }` da última planilha lida. */
  let previaPlanilha = null;
  let gravandoPlanilha = false;
  /** Membro sem correspondência que a busca vai substituir pelo usuário do ERP escolhido. */
  let substituirNaBusca = null;
  /** Quem recebe a pessoa escolhida quando a busca é a do executante da planilha. */
  let escolherNaBusca = null;

  // Ícones 16×16 do layout da aba (protótipo GP v1); traçados fixos, sem dado do usuário.
  const TRACADOS = {
    relogio: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2 M8 4v4l2.5 1.5',
    lista: 'M5 3h8 M5 8h8 M5 13h8 M2 3h.1 M2 8h.1 M2 13h.1',
    concluido: 'M14 7.4V8a6 6 0 1 1-3.6-5.5 M5 7l3 3 6-7',
    pessoas:
      'M10 14v-1a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v1 M5.5 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5 M11 2.5a2.5 2.5 0 0 1 0 4.7 M12 10a3 3 0 0 1 3 3v1',
    enviar: 'm14 2-4 12-3-5-5-3 12-4 M7 9l7-7',
    importar: 'M8 10V1 M4.5 4.5 8 1l3.5 3.5 M2 9v5h12V9',
    atualizar: 'M13.5 6a5.5 5.5 0 1 0 .2 4 M10 6h4V2',
    configurar:
      'm6 1-.5 2-1.5 1-2-.5L1 6l1.5 1.5v1L1 10l1 2.5 2-.5 1.5 1L6 15h4l.5-2 1.5-1 2 .5 1-2.5L13.5 8.5v-1L15 6l-1-2.5-2 .5-1.5-1L10 1H6 M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  };
  function icone(nome) {
    const caixa = el('span', 'equipe-icone');
    caixa.setAttribute('aria-hidden', 'true');
    caixa.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="${TRACADOS[nome]}"/></svg>`;
    return caixa;
  }
  /** Botão da barra com ícone e texto. */
  function botaoComIcone(classe, nome, texto, acao) {
    const b = botao(classe, undefined, acao);
    b.append(icone(nome), el('span', null, texto));
    return b;
  }
  /** Botão só com ícone (Atualizar, Configurações). */
  function botaoSoIcone(nome, rotulo, acao) {
    const b = botao('btn tiny ghost equipe-botao-icone', undefined, acao);
    b.append(icone(nome));
    b.title = rotulo;
    b.setAttribute('aria-label', rotulo);
    return b;
  }

  function mensagemDaFalha(falha) {
    return falha.shellIndisponivel
      ? `Abra o aplicativo desktop e verifique o login no Sankhya para consultar a agenda. ${falha.message}`
      : falha.message;
  }

  function erro(alvo, mensagem = '') {
    alvo.textContent = mensagem;
    alvo.hidden = !mensagem;
  }

  function selo(status, original) {
    const [rotulo, classe] = STATUS[status] ?? [status, ''];
    return el('span', `selo-situacao ${classe}`, original ?? rotulo);
  }

  /** `processo`: coluna "Processo" da aba Usuários da Experience, só do usuário chave. */
  function identidade(pessoa, processo = '') {
    const bloco = el('span', 'equipe-identidade');
    const nome = el('strong', null, pessoa.nomeusu);
    if (pessoa.usuarioChave) nome.prepend(iconeDeUsuarioChave(el));
    const cargo = pessoa.usuarioChave
      ? [pessoa.descrcargo, pessoa.email || 'sem e-mail', processo && `Processo: ${processo}`]
          .filter(Boolean)
          .join(' · ')
      : pessoa.descrcargo;
    bloco.append(nome, el('span', 'equipe-cargo', cargo));
    return bloco;
  }

  function avatar(pessoa) {
    const circulo = el('span', 'equipe-avatar');
    circulo.setAttribute('aria-hidden', 'true');
    // A cor vem da Agenda; só aceita o formato definido por RecursoAgenda.
    circulo.style.backgroundColor = corDe(pessoa);
    return circulo;
  }

  function tabela(titulo, colunas, linhas, mensagemVazia) {
    const bloco = el('section', 'equipe-bloco-tabela');
    bloco.append(el('h4', null, titulo));
    if (!linhas.length) {
      bloco.append(el('p', 'texto-auxiliar', mensagemVazia));
      return bloco;
    }
    const wrap = el('div', 'equipe-tabela-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', titulo);
    const tabela = el('table', 'equipe-tabela');
    const cabecalho = el('thead');
    const tr = el('tr');
    for (const coluna of colunas) {
      const th = el('th', null, coluna);
      th.scope = 'col';
      tr.append(th);
    }
    cabecalho.append(tr);
    const corpo = el('tbody');
    for (const linha of linhas) {
      const tr = el('tr');
      for (const valor of linha) {
        const td = el('td');
        td.append(valor);
        tr.append(td);
      }
      corpo.append(tr);
    }
    tabela.append(cabecalho, corpo);
    wrap.append(tabela);
    bloco.append(wrap);
    return bloco;
  }

  const corDe = (pessoa) =>
    /^#[\da-f]{6}$/i.test(pessoa?.corHex ?? '') ? pessoa.corHex : 'var(--accent)';

  /**
   * Grade Dom–Sáb de um mês por vez; período com mais de um mês ganha ‹ mês ›. Abre no mês
   * de hoje quando ele está no período, senão no primeiro; `mes` guarda o mês entre redesenhos.
   * Itens: `{ data, texto, title?, cor?, classe? }`. Com `selecao` ({ dias, alternar }), cada
   * dia vira botão que entra/sai da seleção.
   */
  function calendario({
    titulo,
    itens,
    periodo,
    vazio,
    selecao = null,
    mes = {},
    extra = [],
    abrirDia = null,
    rodape = null,
  }) {
    const bloco = el('section', 'equipe-bloco-tabela');
    const cabecalho = el('div', 'equipe-calendario-cabecalho');
    const subtitulo = el('p', 'texto-auxiliar', titulo);
    bloco.append(cabecalho, subtitulo, ...extra);
    if (!itens.length && !selecao) {
      bloco.append(el('p', 'texto-auxiliar', vazio));
      return bloco;
    }
    const VISIVEIS_POR_DIA = 3;
    const hojeIso = new Date().toLocaleDateString('sv-SE');
    const porDia = new Map();
    for (const item of itens) {
      if (!porDia.has(item.data)) porDia.set(item.data, []);
      porDia.get(item.data).push(item);
    }
    const meses = mesesDoPeriodo(periodo);
    const hoje = periodoAtualDaEquipe().de.slice(0, 7);
    if (!(mes.indice >= 0 && mes.indice < meses.length))
      mes.indice = Math.max(
        0,
        meses.findIndex((m) => m.de.startsWith(hoje)),
      );
    const wrap = el('div', 'equipe-tabela-wrap');

    function grade({ de, ate }) {
      const nomeDoMes = new Date(`${de}T00:00:00Z`).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      const grade = el('div', 'equipe-calendario');
      grade.setAttribute('aria-label', `${titulo} · ${nomeDoMes}`);
      for (const nome of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'])
        grade.append(el('span', 'equipe-calendario-semana', nome));
      const inicio = new Date(`${de}T00:00:00Z`);
      const fim = new Date(`${ate}T00:00:00Z`);
      for (let i = 0; i < inicio.getUTCDay(); i++) grade.append(el('span'));
      for (const data = new Date(inicio); data <= fim; data.setUTCDate(data.getUTCDate() + 1)) {
        const iso = data.toISOString().slice(0, 10);
        const fimDeSemana = data.getUTCDay() === 0 || data.getUTCDay() === 6;
        const classe = `equipe-calendario-dia${fimDeSemana ? ' fim-de-semana' : ''}${iso === hojeIso ? ' hoje' : ''}`;
        const celula = el(selecao ? 'button' : 'div', classe);
        celula.append(el('span', 'equipe-calendario-numero', String(data.getUTCDate())));
        if (selecao) {
          celula.type = 'button';
          celula.classList.add('selecionavel');
          celula.setAttribute('aria-pressed', String(selecao.dias.has(iso)));
          celula.title = `${dia(iso)} · clique para selecionar${abrirDia ? ' · duplo clique para ver e excluir os lançamentos' : ''}`;
          celula.addEventListener('click', () => {
            selecao.alternar(iso);
            celula.setAttribute('aria-pressed', String(selecao.dias.has(iso)));
          });
        }
        // Os dois cliques do duplo clique alternam a seleção duas vezes: ela volta como estava.
        if (abrirDia) celula.addEventListener('dblclick', () => abrirDia(iso));
        const doDia = porDia.get(iso) ?? [];
        for (const [indice, item] of doDia.entries()) {
          const evento = el('span', `equipe-calendario-evento ${item.classe ?? ''}`, item.texto);
          evento.title = `${dia(iso)} · ${item.title ?? item.texto}`;
          evento.style.borderLeftColor = item.cor ?? 'var(--accent)';
          evento.hidden = indice >= VISIVEIS_POR_DIA;
          celula.append(evento);
        }
        if (doDia.length > VISIVEIS_POR_DIA) {
          // Mostra o resto no próprio dia, sem mexer na seleção.
          const resto = doDia.length - VISIVEIS_POR_DIA;
          const mais = el(
            'span',
            'equipe-calendario-mais',
            `+${resto} atividade${resto > 1 ? 's' : ''}`,
          );
          mais.title = 'Mostrar todas as atividades do dia';
          mais.addEventListener('click', (evento) => {
            evento.stopPropagation();
            for (const oculto of celula.querySelectorAll('.equipe-calendario-evento[hidden]'))
              oculto.hidden = false;
            mais.remove();
          });
          mais.addEventListener('dblclick', (evento) => evento.stopPropagation());
          celula.append(mais);
        }
        grade.append(celula);
      }
      return [grade, nomeDoMes[0].toLocaleUpperCase('pt-BR') + nomeDoMes.slice(1)];
    }

    const rotulo = el('h4', 'equipe-calendario-mes');
    rotulo.setAttribute('aria-live', 'polite');
    cabecalho.append(rotulo);
    if (meses.length > 1) {
      const anterior = botao('btn tiny', '‹', () => mostrar(mes.indice - 1));
      const proximo = botao('btn tiny', '›', () => mostrar(mes.indice + 1));
      anterior.setAttribute('aria-label', 'Mês anterior');
      proximo.setAttribute('aria-label', 'Próximo mês');
      const navegacao = el('div', 'equipe-calendario-navegacao');
      navegacao.append(anterior, proximo);
      cabecalho.append(navegacao);
      function mostrar(indice) {
        mes.indice = indice;
        const [conteudo, nome] = grade(meses[indice]);
        wrap.replaceChildren(conteudo);
        rotulo.textContent = `${nome} (${indice + 1}/${meses.length})`;
        rotulo.title = `${meses.length} meses no período consultado`;
        anterior.disabled = indice === 0;
        proximo.disabled = indice === meses.length - 1;
      }
      mostrar(mes.indice);
    } else {
      const [conteudo, nome] = grade(meses[0]);
      wrap.append(conteudo);
      rotulo.textContent = nome;
    }
    bloco.append(wrap);
    if (rodape) bloco.append(rodape);
    return bloco;
  }

  /** Card recolhível no mesmo visual dos projetos; o estado sobrevive ao Atualizar. */
  function expansor(contexto, chave, titulo, conteudo, abertoPorPadrao) {
    if (!contexto.expansores.has(chave)) contexto.expansores.set(chave, abertoPorPadrao);
    const card = el('div', 'card card-projeto equipe-expansor');
    const corpo = el('div', 'card-projeto-corpo');
    corpo.append(conteudo);
    const alternar = botaoDeIcone(
      'btn tiny ghost botao-alternar-projeto',
      iconeExpandir,
      titulo,
      () => mostrar(!contexto.expansores.get(chave)),
    );
    const cabecalho = el('div', 'card-projeto-cabecalho');
    cabecalho.append(alternar, el('h3', 'card-projeto-titulo', titulo));
    function mostrar(aberto) {
      contexto.expansores.set(chave, aberto);
      corpo.hidden = !aberto;
      alternar.setAttribute('aria-expanded', String(aberto));
      const rotulo = `${aberto ? 'Ocultar' : 'Exibir'} ${titulo}`;
      alternar.title = rotulo;
      alternar.setAttribute('aria-label', rotulo);
    }
    mostrar(contexto.expansores.get(chave));
    card.append(cabecalho, corpo);
    return card;
  }

  /** "Informar e-mail" do usuário chave: regrava o membro com o e-mail novo. */
  function formularioDeEmail(contexto, pessoa) {
    const form = el('form', 'equipe-form-email');
    form.hidden = true;
    const campo = el('input', 'equipe-email-manual');
    campo.type = 'email';
    campo.required = true;
    campo.value = pessoa.email ?? '';
    campo.placeholder = 'e-mail do usuário chave';
    campo.setAttribute('aria-label', `E-mail de ${pessoa.nomeusu}`);
    const salvar = el('button', 'btn tiny primario', 'Salvar e-mail');
    salvar.type = 'submit';
    form.append(campo, salvar);
    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!podeGerenciar()) return;
      const email = campo.value.trim().toLowerCase();
      if (!emailValido(email)) {
        exibirAviso('Informe um e-mail válido.', 'erro');
        campo.focus();
        return;
      }
      salvar.disabled = true;
      try {
        await dados.adicionarPessoa(contexto.cliente.id, contexto.projeto.id, {
          ...pessoa,
          email,
        });
        await contexto.atualizar();
        exibirAviso(`E-mail de ${pessoa.nomeusu} salvo.`);
      } catch (falha) {
        exibirAviso(mensagemDaFalha(falha), 'erro');
      } finally {
        salvar.disabled = false;
      }
    });
    return form;
  }

  /** Card de um membro da equipe: OS e as ações dele; a agenda é a única, no topo. */
  function criarCard(pessoa, equipe, contexto, ordens) {
    const chaveCard = pessoa.codusu ?? `nome:${pessoa.nomeusu}`;
    const semCorrespondencia = pessoa.codusu === null;
    // Usuário chave sem codusu não recebe OS nem evento: nada a lançar nem a vincular.
    const soChave = semCorrespondencia && pessoa.usuarioChave;
    const card = el('details', 'equipe-pessoa');
    card.open = expandidos.get(contexto.chave)?.has(chaveCard) ?? false;
    card.addEventListener('toggle', () => {
      if (!expandidos.has(contexto.chave)) expandidos.set(contexto.chave, new Set());
      const abertos = expandidos.get(contexto.chave);
      if (card.open) abertos.add(chaveCard);
      else abertos.delete(chaveCard);
    });
    const cabecalho = el('summary', 'equipe-pessoa-cabecalho');
    const metricas = el('span', 'equipe-metricas');
    for (const [valor, rotulo] of [
      [equipe.osDisponiveis ? horas(resumirOs(ordens).horas) : '—', 'de OS'],
      [equipe.osDisponiveis ? ordens.length : '—', 'OS'],
    ]) {
      const metrica = el('span', 'equipe-metrica');
      metrica.append(el('strong', null, String(valor)), el('span', null, rotulo));
      metricas.append(metrica);
    }
    // Usuário chave: o e-mail é o convite do Meet (cliente não tem usuário no Sankhya).
    const formEmail = soChave ? formularioDeEmail(contexto, pessoa) : null;
    const [rotuloAcao, acaoPrincipal] = soChave
      ? [
          pessoa.email ? 'Alterar e-mail' : 'Informar e-mail',
          () => {
            card.open = true;
            formEmail.hidden = false;
            formEmail.querySelector('input').focus();
          },
        ]
      : semCorrespondencia
        ? ['Vincular usuário do ERP', () => abrirBusca(contexto, pessoa.nomeusu, pessoa)]
        : ['Nova Tarefa', () => abrirReserva(contexto, pessoa)];
    // Seleção única da agenda (reserva e convidados do Meet). Marcar não abre o card: o
    // clique fica no checkbox, que tem ativação própria.
    const marcar = el('input', 'equipe-marcar-meet');
    marcar.type = 'checkbox';
    marcar.setAttribute('aria-label', `Selecionar ${pessoa.nomeusu} para a reserva e o Meet`);
    marcar.title = pessoa.usuarioChave
      ? 'Convidado do Meet (usuário chave não entra na reserva da Agenda)'
      : 'Entra na reserva da Agenda e é convidado do Meet';
    marcar.checked = contexto.reserva.pessoas.has(chaveDaPessoa(pessoa));
    marcar.addEventListener('click', (evento) => evento.stopPropagation());
    marcar.addEventListener('change', () => {
      if (marcar.checked) contexto.reserva.pessoas.add(chaveDaPessoa(pessoa));
      else contexto.reserva.pessoas.delete(chaveDaPessoa(pessoa));
      contexto.redesenharAgenda();
    });
    // Status do Sankhya ID de quem está na equipe, sempre que a Experience informar.
    const pessoaExperience = equipe.pessoasExperience.find((p) => membroDaPessoa([pessoa], p));
    const sankhyaId = situacaoDoSankhyaId(pessoaExperience);
    cabecalho.append(
      // Usuário chave entra na seleção só com e-mail: é o endereço do convite do Meet.
      ...(conviteDoMeet(pessoa) && (!semCorrespondencia || soChave) ? [marcar] : []),
      avatar(pessoa),
      identidade(pessoa, pessoa.usuarioChave ? pessoaExperience?.processo : ''),
      ...(sankhyaId ? [el('span', `selo-situacao ${sankhyaId.classe}`, sankhyaId.rotulo)] : []),
      metricas,
      ...(rotuloAcao
        ? [
            botao('btn tiny primario equipe-acao-reserva', rotuloAcao, (evento) => {
              evento.preventDefault();
              evento.stopPropagation();
              acaoPrincipal();
            }),
          ]
        : []),
      el('span', 'equipe-chevron', '⌄'),
    );
    const corpo = el('div', 'equipe-pessoa-corpo');
    if (rotuloAcao)
      corpo.append(botao('btn tiny primario equipe-acao-expandida', rotuloAcao, acaoPrincipal));
    if (soChave)
      corpo.append(
        el(
          'p',
          'texto-auxiliar',
          'Usuário chave do projeto: não recebe OS nem evento na Agenda; com e-mail, é marcado para o convite do Meet.',
        ),
        formEmail,
      );
    else if (semCorrespondencia)
      corpo.append(
        el(
          'p',
          'texto-auxiliar',
          'Inserido pela planilha sem correspondência na Experience. Vincule um usuário do ERP para lançar na Agenda.',
        ),
      );
    corpo.append(
      tabela(
        'OS na Experience',
        ['OS', 'Data', 'Horas', 'Status'],
        ordens.map((os) => [
          `#${os.id}`,
          dia(os.dia),
          horas(os.horas),
          selo(os.status, os.statusOriginal),
        ]),
        equipe.osDisponiveis
          ? 'Nenhuma OS lançada para esta pessoa neste período.'
          : equipe.avisoOs,
      ),
    );
    const personId = pessoa.personId ?? pessoaExperience?.personId ?? null;
    if (personId && equipe.implantationId) corpo.append(tarefasDaPessoa(contexto, personId));
    corpo.append(
      botao('btn tiny perigo', 'Remover da equipe', async (evento) => {
        if (!podeGerenciar()) return;
        const acao = evento.currentTarget;
        acao.disabled = true;
        try {
          await dados.removerPessoa(contexto.cliente.id, contexto.projeto.id, pessoa);
          await contexto.atualizar();
          exibirAviso(`${pessoa.nomeusu} removida da equipe.`);
        } catch (falha) {
          exibirAviso(mensagemDaFalha(falha), 'erro');
        } finally {
          acao.disabled = false;
        }
      }),
    );
    card.append(cabecalho, corpo);
    return card;
  }

  /**
   * Tarefas abertas da pessoa na Experience, carregadas no clique (uma chamada por pessoa).
   * Excluir pede um segundo clique: é irreversível, e remarcar é excluir e lançar de novo.
   */
  function tarefasDaPessoa(contexto, personId) {
    const bloco = el('section', 'equipe-bloco-tabela');
    const carregar = botao('btn tiny', 'Ver tarefas na Experience', async () => {
      carregar.disabled = true;
      try {
        const { tarefas } = await dados.tarefasDaExperience(
          contexto.cliente.id,
          contexto.projeto.id,
          personId,
        );
        bloco.replaceWith(
          tabela(
            'Tarefas na Experience',
            ['Data', 'Horário', 'Etapa / Procedimento', 'Status', ''],
            tarefas.map((tarefa) => [
              dia(tarefa.dia),
              `${tarefa.horaInicio}–${tarefa.horaFim}`,
              [tarefa.etapa, tarefa.procedimento].filter(Boolean).join(' / '),
              tarefa.taskStatus,
              botaoExcluirTarefa(tarefa),
            ]),
            'Nenhuma tarefa aberta para esta pessoa.',
          ),
        );
      } catch (falha) {
        exibirAviso(mensagemDaFalha(falha), 'erro');
        carregar.disabled = false;
      }
    });
    bloco.append(carregar);
    return bloco;
  }

  const botaoExcluirTarefa = (tarefa, aoExcluir) =>
    botaoDeExcluir(
      `Excluir a tarefa ${tarefa.id} na Experience`,
      () => dados.excluirTarefa(tarefa.id),
      aoExcluir,
    );

  /** Excluir pede um segundo clique em até 4 s: as duas exclusões são irreversíveis. */
  function botaoDeExcluir(titulo, excluir, aoExcluir, rotulo = 'Excluir') {
    let armado = null;
    const acao = botao('btn tiny perigo', rotulo, async () => {
      if (!podeGerenciar()) return;
      if (!armado) {
        acao.textContent = 'Confirmar exclusão';
        armado = setTimeout(() => {
          armado = null;
          acao.textContent = rotulo;
        }, 4000);
        return;
      }
      clearTimeout(armado);
      armado = null;
      acao.disabled = true;
      try {
        const { mensagem } = await excluir();
        acao.closest('tr, .equipe-dia-item')?.remove();
        acao.textContent = rotulo;
        acao.disabled = false;
        aoExcluir?.();
        exibirAviso(mensagem);
      } catch (falha) {
        exibirAviso(mensagemDaFalha(falha), 'erro');
        acao.textContent = rotulo;
        acao.disabled = false;
      }
    });
    acao.title = titulo;
    return acao;
  }

  /**
   * Duplo clique num dia da agenda: o que este projeto tem lançado nele — eventos deste
   * cliente na Agenda de Recursos (de quem está na equipe) e tarefas abertas na Experience —
   * com Excluir em cada um. Fechar recarrega a equipe se algo foi excluído.
   */
  async function abrirLancamentosDoDia(contexto, iso) {
    if (!podeGerenciar() || !contexto.equipe) return;
    const equipe = contexto.equipe;
    const estado = { contexto, alterou: false };
    estadoDia = estado;
    const marcarAlteracao = () => {
      estado.alterou = true;
    };

    // Multiseleção: cada lançamento excluível ganha uma caixa; "Excluir selecionados" apaga
    // em sequência, tarefas da Experience antes dos eventos da Agenda que elas usam.
    const selecao = new Map();
    const contagem = el('span', 'texto-auxiliar');
    const marcadas = () => [...selecao.keys()].filter((m) => m.isConnected && m.checked);
    const todas = el('input');
    todas.type = 'checkbox';
    todas.setAttribute('aria-label', 'Selecionar todos os lançamentos do dia');
    const atualizarSelecao = () => {
      const visiveis = [...selecao.keys()].filter((m) => m.isConnected);
      const n = marcadas().length;
      contagem.textContent = n ? `${n} selecionado(s)` : '';
      excluirVarios.hidden = n === 0;
      todas.checked = visiveis.length > 0 && n === visiveis.length;
      todas.disabled = visiveis.length === 0;
      for (const m of visiveis)
        m.closest('.equipe-dia-item')?.classList.toggle('selecionado', m.checked);
      for (const lista of conteudoDia.querySelectorAll('.equipe-dia-lista:empty'))
        lista.replaceWith(el('p', 'texto-auxiliar', 'Nenhum lançamento restante neste grupo.'));
      const total = conteudoDia.querySelectorAll('.equipe-dia-item').length;
      subtituloDia.textContent = `${total} lançamento(s) · ${contexto.cliente.nome} · Agenda de Recursos e tarefas da Experience deste projeto`;
    };
    todas.addEventListener('change', () => {
      for (const m of selecao.keys()) if (m.isConnected) m.checked = todas.checked;
      atualizarSelecao();
    });
    const marcador = (titulo, ordem, excluir) => {
      const marca = el('input');
      marca.type = 'checkbox';
      marca.setAttribute('aria-label', `Selecionar ${titulo}`);
      marca.addEventListener('change', atualizarSelecao);
      selecao.set(marca, { ordem, excluir });
      return marca;
    };
    const aoExcluirUm = () => {
      marcarAlteracao();
      atualizarSelecao();
    };
    const excluirVarios = botaoDeExcluir(
      'Excluir todos os lançamentos selecionados',
      async () => {
        const alvos = marcadas().sort((a, b) => selecao.get(a).ordem - selecao.get(b).ordem);
        const falhas = [];
        let feitos = 0;
        for (const marca of alvos) {
          try {
            await selecao.get(marca).excluir();
            marca.closest('.equipe-dia-item')?.remove();
            selecao.delete(marca);
            feitos += 1;
          } catch (falha) {
            falhas.push(mensagemDaFalha(falha));
          }
        }
        if (feitos) marcarAlteracao();
        atualizarSelecao();
        if (falhas.length)
          throw new Error(
            `${feitos} excluído(s), ${falhas.length} com falha: ${falhas.join(' · ')}`,
          );
        return { mensagem: `${feitos} lançamento(s) excluído(s).` };
      },
      atualizarSelecao,
      'Excluir selecionados',
    );
    const rotuloTodas = el('label', 'equipe-reserva-pessoa');
    rotuloTodas.append(todas, ' Selecionar todos');
    const barra = el('div', 'equipe-dia-selecao');
    barra.append(rotuloTodas, contagem, excluirVarios);

    /** Card do lançamento: caixa, horário, o quê/origem e Excluir (ou "Somente leitura"). */
    const itemDoDia = ({ marca, inicio, fim, titulo, detalhe, cor, acao }) => {
      const item = el('article', 'equipe-dia-item');
      item.style.borderLeftColor = cor;
      const hora = el('div', 'equipe-dia-hora');
      hora.append(el('span', null, inicio));
      if (fim) hora.append(el('span', null, fim));
      const texto = el('div', 'equipe-dia-texto');
      texto.append(el('strong', null, titulo), el('span', 'texto-auxiliar', detalhe));
      item.append(
        marca ?? el('span'),
        hora,
        texto,
        acao ?? el('span', 'equipe-dia-leitura', 'Somente leitura'),
      );
      return item;
    };
    const grupo = (titulo, itens, vazio) => {
      const bloco = el('section', 'equipe-dia-grupo');
      bloco.append(el('h4', null, titulo));
      if (itens.length) {
        const lista = el('div', 'equipe-dia-lista');
        lista.append(...itens);
        bloco.append(lista);
      } else bloco.append(el('p', 'texto-auxiliar', vazio));
      return bloco;
    };

    const nomeDoDia = new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    tituloDia.textContent = nomeDoDia[0].toLocaleUpperCase('pt-BR') + nomeDoDia.slice(1);
    const membroDe = new Map(
      equipe.pessoas.filter((p) => p.codusu !== null).map((p) => [p.codusu, p]),
    );
    const eventos = equipe.eventos.filter(
      (e) => e.doCliente && e.inicio.slice(0, 10) <= iso && e.fim.slice(0, 10) >= iso,
    );
    const agenda = grupo(
      'Agenda de Recursos',
      eventos.map((e) => {
        const excluir = () =>
          dados.excluirEventoDaAgenda(contexto.cliente.id, contexto.projeto.id, e.nuevento, iso);
        const titulo = `o evento ${e.nuevento} da Agenda de Recursos`;
        const diaTodo = e.allday === 'S';
        return itemDoDia({
          marca: e.nuevento ? marcador(titulo, 1, excluir) : null,
          inicio: diaTodo ? 'Dia todo' : e.inicio.slice(11, 16),
          fim: diaTodo ? '' : e.fim.slice(11, 16),
          titulo: `${e.nomeusu}: ${e.descrabrev || e.descrlonga || '(sem descrição)'}`,
          detalhe: `Agenda de Recursos · lançado por ${e.usulancador || '—'}`,
          cor: corDe(membroDe.get(e.codusu)),
          acao: e.nuevento ? botaoDeExcluir(`Excluir ${titulo}`, excluir, aoExcluirUm) : null,
        });
      }),
      'Nenhum evento deste cliente na Agenda de Recursos neste dia.',
    );
    const tarefas = el('section', 'equipe-dia-grupo');
    tarefas.append(el('h4', null, 'Tarefas na Experience'));
    const aviso = el(
      'p',
      'equipe-dia-aviso',
      'Excluir pede um segundo clique para confirmar e não pode ser desfeito. Em "Excluir selecionados", as tarefas da Experience saem antes dos eventos da Agenda.',
    );
    conteudoDia.replaceChildren(barra, agenda, tarefas, aviso);
    atualizarSelecao();
    dialogoDia.showModal();

    if (!equipe.implantationId) {
      tarefas.append(
        el(
          'p',
          'texto-auxiliar',
          'Projeto sem implantation_id da Experience: sem tarefas para mostrar.',
        ),
      );
      return;
    }
    tarefas.append(el('p', 'texto-auxiliar', 'Carregando tarefas da Experience…'));
    const pessoas = equipe.pessoas
      .map((pessoa) => ({
        pessoa,
        personId:
          pessoa.personId ??
          equipe.pessoasExperience.find((p) => membroDaPessoa([pessoa], p))?.personId,
      }))
      .filter((item) => item.personId);
    const falhas = [];
    const itens = (
      await Promise.all(
        pessoas.map(async ({ pessoa, personId }) => {
          try {
            const resposta = await dados.tarefasDaExperience(
              contexto.cliente.id,
              contexto.projeto.id,
              personId,
            );
            return resposta.tarefas
              .filter((tarefa) => tarefa.dia === iso)
              .map((tarefa) =>
                itemDoDia({
                  marca: marcador(`a tarefa ${tarefa.id} na Experience`, 0, () =>
                    dados.excluirTarefa(tarefa.id),
                  ),
                  inicio: tarefa.horaInicio,
                  fim: tarefa.horaFim,
                  titulo: `${pessoa.nomeusu}: ${[tarefa.etapa, tarefa.procedimento].filter(Boolean).join(' / ') || `tarefa ${tarefa.id}`}`,
                  detalhe: `Tarefa na Experience · ${tarefa.taskStatus}`,
                  cor: 'var(--accent)',
                  acao: botaoExcluirTarefa(tarefa, aoExcluirUm),
                }),
              );
          } catch (falha) {
            falhas.push(`${pessoa.nomeusu}: ${mensagemDaFalha(falha)}`);
            return [];
          }
        }),
      )
    ).flat();
    if (estadoDia !== estado || !dialogoDia.open) return;
    const resultado = grupo(
      'Tarefas na Experience',
      itens,
      'Nenhuma tarefa aberta da equipe neste dia.',
    );
    for (const falha of falhas) resultado.append(el('p', 'erro-formulario', falha));
    tarefas.replaceWith(resultado);
    atualizarSelecao();
  }

  /**
   * Ligar um interruptor da tabela "Pessoas do projeto": a linha sai com animação enquanto
   * grava, e a releitura já não a traz (virou card da equipe). Falhou: a linha volta.
   */
  async function alterarEquipe(contexto, marcar, mudanca) {
    if (!podeGerenciar()) return;
    const linha = marcar.closest('tr');
    marcar.disabled = true;
    linha?.classList.add('equipe-linha-saindo');
    try {
      // `false`: foi para a busca manual — a linha volta, sem erro na tela.
      if ((await mudanca(contexto.cliente.id, contexto.projeto.id)) === false) throw null;
      await contexto.atualizar();
    } catch (falha) {
      linha?.classList.remove('equipe-linha-saindo');
      marcar.checked = false;
      marcar.disabled = false;
      if (falha) exibirAviso(mensagemDaFalha(falha), 'erro');
    }
  }

  /**
   * "Na equipe" = executa (tem codusu): acha o usuário do ERP pelo login do e-mail; sem
   * login ou sem achado, abre a busca já com o nome.
   */
  function entrarNaEquipe(contexto, pessoa, marcar) {
    const login = loginDoEmail(pessoa.email);
    return alterarEquipe(contexto, marcar, async (cliente, projeto) => {
      const recurso =
        login &&
        (await dados.buscarRecursos(login, contexto.periodo)).recursos.find(
          (r) => r.nomeusu.toLowerCase() === login,
        );
      if (!recurso) {
        void abrirBusca(contexto, pessoa.nome);
        return false;
      }
      await dados.adicionarPessoa(cliente, projeto, { ...recurso, personId: pessoa.personId });
    });
  }

  /** Usuário chave precisa de e-mail (convite do Meet); cliente não tem usuário no Sankhya. */
  function virarUsuarioChave(contexto, pessoa, marcar) {
    if (!emailValido(pessoa.email ?? '')) {
      marcar.checked = false;
      exibirAviso(
        `${pessoa.nome} está sem e-mail na Experience: informe o e-mail na linha ou, se for do Sankhya, use "Na equipe" para vincular o usuário do ERP.`,
        'erro',
      );
      marcar.closest('tr')?.querySelector('input[type="email"]')?.focus();
      return;
    }
    return alterarEquipe(contexto, marcar, (cliente, projeto) =>
      dados.adicionarPessoa(cliente, projeto, membroUsuarioChave(pessoa)),
    );
  }

  /**
   * Uma seleção só: usuários do projeto na Experience + quem tem OS no período. Quem já está
   * na equipe (ou é usuário chave) sai daqui e vira card; desfazer é pelo card.
   */
  function listaDePessoas(contexto, equipe) {
    const bloco = el('section', 'equipe-pessoas-do-projeto');
    if (equipe.implantationId === null) {
      bloco.append(
        el(
          'p',
          'texto-auxiliar',
          'Informe o ID da implantação nas configurações para listar os usuários do projeto na Experience.',
        ),
      );
      return bloco;
    }
    const linhas = pessoasDoProjeto(equipe)
      .filter(({ membro }) => !membro)
      .map(({ pessoa, ordens }) => {
        const quem = el('span', 'equipe-identidade');
        const temEmail = emailValido(pessoa.email ?? '');
        quem.append(
          el('strong', null, pessoa.nome),
          el('span', 'equipe-cargo', temEmail ? `${pessoa.papel} · ${pessoa.email}` : pessoa.papel),
        );
        // Sem e-mail na Experience (ou só nas OS): o GP informa, para o convite do Meet.
        const campoEmail = temEmail ? null : el('input', 'equipe-email-manual');
        if (campoEmail) {
          campoEmail.type = 'email';
          campoEmail.placeholder = 'e-mail (sem usuário no Sankhya)';
          campoEmail.setAttribute('aria-label', `E-mail de ${pessoa.nome}`);
          quem.append(campoEmail);
        }
        const comEmail = () =>
          campoEmail ? { ...pessoa, email: campoEmail.value.trim().toLowerCase() } : pessoa;
        const interruptor = (rotulo, ligar) => {
          const marcar = el('input', 'interruptor');
          marcar.type = 'checkbox';
          marcar.setAttribute('role', 'switch');
          marcar.setAttribute('aria-label', `${rotulo}: ${pessoa.nome}`);
          marcar.addEventListener('change', () => void ligar(contexto, comEmail(), marcar));
          return marcar;
        };
        const resumo = resumirOs(ordens);
        return [
          quem,
          equipe.osDisponiveis && ordens.length
            ? `${horas(resumo.horas)} · ${ordens.length} OS`
            : '—',
          interruptor('Na equipe', entrarNaEquipe),
          interruptor('Usuário chave', virarUsuarioChave),
        ];
      });
    bloco.append(
      tabela(
        'Experience e OS do período (incluídas no total)',
        ['Pessoa', 'OS no período', 'Na equipe', 'Usuário chave'],
        linhas,
        equipe.pessoasExperience.length || equipe.avisoPessoas
          ? 'Todos os usuários do projeto já estão na equipe.'
          : `A Experience não devolveu usuários para a implantação ${equipe.implantationId}. Confira se o ID é o número que aparece na URL do projeto na Experience (experience.sankhya.com.br/projeto/<ID>), não o FAP.`,
      ),
    );
    if (equipe.avisoPessoas) bloco.append(el('p', 'texto-auxiliar', equipe.avisoPessoas));
    return bloco;
  }

  /**
   * Quem do projeto ainda não ativou o Sankhya ID (ou ativou com erro). `inexistente` fica de
   * fora por decisão do usuário. Lembrete = reenvio oficial da Experience, só no clique.
   */
  function blocoDoSankhyaId(contexto, equipe) {
    const pendentes = pendentesDoSankhyaId(equipe.pessoasExperience, equipe.lembretesSankhyaId);
    if (!pendentes.length) return null;
    const linhas = pendentes.map(({ pessoa, motivo, ultimoLembrete }) => {
      const quem = el('span', 'equipe-identidade');
      quem.append(el('strong', null, pessoa.nome), el('span', 'equipe-cargo', pessoa.email));
      const situacao = selo(null, motivo);
      situacao.classList.add(pessoa.erroSankhyaId ? 'erro' : 'atencao');
      let armado = false;
      const reenviar = botao('btn tiny', 'Reenviar e-mail', async () => {
        const ultimoEnvio = equipe.lembretesSankhyaId[pessoa.personId];
        // Lembrete há menos de 24 h: o segundo clique confirma (a gravação mostrou 4× em 3 h).
        if (!armado && ultimoEnvio && Date.now() - new Date(ultimoEnvio).getTime() < 864e5) {
          armado = true;
          reenviar.textContent = 'Confirmar reenvio';
          return;
        }
        armado = false;
        reenviar.textContent = 'Reenviar e-mail';
        reenviar.disabled = true;
        try {
          const { enviadoEm } = await dados.lembrarSankhyaId(
            contexto.cliente.id,
            contexto.projeto.id,
            pessoa.personId,
          );
          equipe.lembretesSankhyaId[pessoa.personId] = enviadoEm;
          exibirAviso(`E-mail de verificação do Sankhya ID reenviado para ${pessoa.nome}.`);
          ultimo.textContent = dataHora(enviadoEm);
        } catch (falha) {
          exibirAviso(`Não foi possível reenviar: ${falha.message}`, 'erro');
        } finally {
          reenviar.disabled = false;
        }
      });
      const ultimo = el('span', 'texto-auxiliar', ultimoLembrete ? dataHora(ultimoLembrete) : '—');
      return [quem, situacao, ultimo, reenviar];
    });
    return tabela(
      `Sankhya ID pendente (${pendentes.length})`,
      ['Pessoa', 'Situação', 'Último lembrete', ''],
      linhas,
      '',
    );
  }

  /**
   * A tela de clientes recria o card do projeto a cada renderização; a seção é criada uma vez
   * e reaproveitada (ver `criarAbasDoProjeto`), por isso o resto lê `contexto.cliente`/
   * `contexto.projeto`, que recebem os objetos novos a cada renderização.
   */
  function criarSecaoDoProjeto(cliente, projeto) {
    const secao = el('section', 'equipe-projeto');
    const contexto = {
      cliente,
      projeto,
      chave: JSON.stringify([cliente.id, projeto.id]),
      equipe: null,
      periodo: periodoAtualDaEquipe(),
      /** Aberto/fechado de cada expansor (equipe, pessoas). */
      expansores: new Map(),
      /** Mês visível da agenda da equipe. */
      mesAgenda: {},
      /** Linhas da última planilha importada, mostradas na agenda como planejado. */
      planejado: [],
      /** Tipos da legenda desligados no clique (`os`, `agenda`, `outro-cliente`, …). */
      tiposOcultos: new Set(),
      /**
       * Seleção da agenda (dias) e dos cards (`codusu`): serve à reserva, ao Meet e à Nova
       * Tarefa; sobrevive ao Atualizar.
       */
      reserva: {
        dias: new Set(),
        pessoas: new Set(),
        /** Reservar também a agenda do GP logado (checkbox avulso, fora dos cards). */
        gp: true,
        fase: '',
        inicio: '09:00',
        fim: '18:00',
        observacao: '',
        /** Módulos da Experience: título (`: A / B`) e "Descrição completa" do evento. */
        modulos: [],
        /** Gerar o Meet de cada dia junto com a reserva. */
        comMeet: false,
      },
      reservando: false,
      gp: null,
      atualizarReserva: () => {},
      redesenharAgenda: () => {},
      atualizar,
      secao,
    };
    const conteudo = el('div', 'equipe-lista');

    // Cabeçalho da aba: projeto e vínculo com a Experience.
    const cabecalhoDaAba = el('header', 'equipe-cabecalho');
    const tituloDaAba = el('div');
    tituloDaAba.append(
      el('span', 'equipe-sobretitulo', 'Gestão do projeto'),
      el('h3', null, 'Equipe do projeto'),
      el('p', 'texto-auxiliar', `${cliente.nome} · ${projeto.nome}`),
    );
    const seloExperience = el('span', 'equipe-selo');
    contexto.desenharSeloExperience = () => {
      const id = contexto.projeto.implantationId;
      seloExperience.className = `equipe-selo${id ? ' verde' : ''}`;
      seloExperience.replaceChildren(
        el('i', 'equipe-ponto'),
        id ? `Experience vinculada · ${id}` : 'Sem implantação da Experience',
      );
    };
    contexto.desenharSeloExperience();
    cabecalhoDaAba.append(tituloDaAba, seloExperience);

    // Barra: período à esquerda; planilha, cronograma, pessoa e configurações à direita.
    const filtros = el('form', 'equipe-barra-periodo');
    filtros.append(el('span', 'texto-auxiliar', 'Período'));
    for (const [nome, rotulo] of [
      ['de', 'De'],
      ['ate', 'Até'],
    ]) {
      const input = el('input');
      input.type = 'date';
      input.name = nome;
      input.required = true;
      input.value = contexto.periodo[nome];
      input.setAttribute('aria-label', rotulo);
      if (nome === 'ate') filtros.append(el('span', 'texto-auxiliar', 'até'));
      filtros.append(input);
    }
    const consultar = botao('btn tiny', 'Consultar', () => {});
    consultar.type = 'submit';
    const recarregar = botaoSoIcone('atualizar', 'Atualizar', () => void atualizar());
    const situacao = el('span', 'texto-auxiliar');
    situacao.setAttribute('role', 'status');
    filtros.append(consultar, recarregar, situacao);
    filtros.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const de = filtros.elements.namedItem('de').value;
      const ate = filtros.elements.namedItem('ate').value;
      if (!de || !ate || de > ate) {
        exibirAviso(
          'Informe um período válido: o fim deve ser igual ou posterior ao início.',
          'erro',
        );
        return;
      }
      contexto.periodo = { de, ate };
      void atualizar();
    });
    // Precisam da equipe lida: ficam desligados até a primeira leitura.
    const acoesDaEquipe = [
      botaoComIcone('btn tiny', 'importar', 'Importar planilha', () => abrirPlanilha(contexto)),
      botaoComIcone('btn tiny', 'enviar', 'Enviar cronograma', () => abrirCronograma(contexto)),
      botao('btn tiny primario', '+ Adicionar pessoa', () => abrirBusca(contexto)),
    ];
    for (const acao of acoesDaEquipe) acao.disabled = true;
    // Configurações do projeto (engrenagem): implantação da Experience e fases.
    const configuracao = el('dialog', 'modal equipe-modal equipe-configuracao');
    contexto.abrirConfiguracao = () => {
      if (podeGerenciar()) configuracao.showModal();
    };
    const acoesDaBarra = el('div', 'equipe-barra-acoes');
    acoesDaBarra.append(
      ...acoesDaEquipe,
      el('span', 'equipe-barra-separador'),
      botaoSoIcone(
        'configurar',
        'Configurações do projeto (fases e Experience)',
        contexto.abrirConfiguracao,
      ),
    );
    const barra = el('div', 'equipe-barra');
    barra.append(filtros, acoesDaBarra);

    const fecharConfiguracao = () => configuracao.close();
    const cabecalhoConfiguracao = el('div', 'modal-cabecalho equipe-modal-cabecalho');
    const tituloConfiguracao = el('div');
    tituloConfiguracao.append(
      el('h2', null, 'Configurações do projeto'),
      el('p', null, 'Fases e vínculo com a Experience.'),
    );
    const xConfiguracao = botao('btn tiny ghost', '×', fecharConfiguracao);
    xConfiguracao.setAttribute('aria-label', 'Fechar configurações do projeto');
    cabecalhoConfiguracao.append(tituloConfiguracao, xConfiguracao);
    const formImplantacao = el('form', 'equipe-periodo');
    const labelImplantacao = el('label', 'campo', 'ID da implantação (implantation_id)');
    const implantacao = el('input');
    implantacao.type = 'number';
    implantacao.min = '1';
    implantacao.step = '1';
    implantacao.value = projeto.implantationId ?? '';
    labelImplantacao.append(implantacao);
    const salvarImplantacao = botao('btn', 'Salvar implantação', () => {});
    salvarImplantacao.type = 'submit';
    const erroImplantacao = el('p', 'erro-formulario');
    erroImplantacao.setAttribute('role', 'alert');
    erroImplantacao.hidden = true;
    formImplantacao.append(labelImplantacao, salvarImplantacao);
    formImplantacao.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (!podeGerenciar()) return;
      const valor = implantacao.value ? Number(implantacao.value) : null;
      if (valor !== null && (!Number.isSafeInteger(valor) || valor <= 0)) return;
      salvarImplantacao.disabled = true;
      erro(erroImplantacao);
      try {
        await dados.definirImplantacao(contexto.cliente.id, contexto.projeto.id, valor);
        contexto.projeto.implantationId = valor;
        contexto.desenharSeloExperience();
        await atualizar();
        exibirAviso('Implantação do projeto atualizada.');
      } catch (falha) {
        erro(erroImplantacao, mensagemDaFalha(falha));
      } finally {
        salvarImplantacao.disabled = false;
      }
    });
    const listaDeFases = el('div', 'equipe-fases');
    contexto.desenharFases = () => {
      const fases = contexto.projeto.fases ?? [];
      listaDeFases.replaceChildren(
        ...(fases.length
          ? fases.map((fase) => {
              const chip = el('span', 'equipe-fase', fase);
              const remover = botao('btn tiny ghost', '×', async () => {
                if (!podeGerenciar()) return;
                remover.disabled = true;
                try {
                  await salvarFases(
                    contexto,
                    (contexto.projeto.fases ?? []).filter((f) => f !== fase),
                  );
                  contexto.redesenharAgenda();
                } catch (falha) {
                  exibirAviso(mensagemDaFalha(falha), 'erro');
                  remover.disabled = false;
                }
              });
              remover.setAttribute('aria-label', `Remover a fase ${fase}`);
              chip.append(remover);
              return chip;
            })
          : [
              el(
                'span',
                'texto-auxiliar',
                'Nenhuma fase. Importe da planilha (coluna Etapa), importe as etapas da Experience ou crie abaixo.',
              ),
            ]),
      );
    };
    contexto.desenharFases();
    const formNovaFase = el('form', 'equipe-periodo');
    const nova = el('input');
    nova.type = 'text';
    nova.maxLength = 80;
    nova.placeholder = 'Nova fase. Ex.: Homologação';
    nova.setAttribute('aria-label', 'Nova fase');
    const criar = botao('btn', 'Criar fase', () => {});
    criar.type = 'submit';
    formNovaFase.append(nova, criar);
    formNovaFase.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const nome = nova.value.trim();
      if (!nome || !podeGerenciar()) return;
      criar.disabled = true;
      try {
        await salvarFases(contexto, [...(contexto.projeto.fases ?? []), nome]);
        // A fase criada passa a ser a da reserva, como quando era criada no painel.
        contexto.reserva.fase =
          contexto.projeto.fases.find(
            (f) => f.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'),
          ) ?? nome;
        nova.value = '';
        contexto.redesenharAgenda();
        exibirAviso(`Fase "${contexto.reserva.fase}" disponível no projeto.`);
      } catch (falha) {
        exibirAviso(mensagemDaFalha(falha), 'erro');
      } finally {
        criar.disabled = false;
      }
    });
    const secaoExperience = el('section', 'equipe-configuracao-secao');
    secaoExperience.append(
      el('h3', null, 'Experience'),
      formImplantacao,
      el(
        'p',
        'texto-auxiliar',
        'Cole o número da implantação da Experience. Deixe vazio para desvincular. O mapeamento Etapa/Procedimento deve estar cadastrado no projeto.',
      ),
      erroImplantacao,
    );
    const secaoFases = el('section', 'equipe-configuracao-secao');
    secaoFases.append(el('h3', null, 'Fases do projeto'), listaDeFases, formNovaFase);
    const corpoConfiguracao = el('div', 'modal-corpo');
    corpoConfiguracao.append(secaoExperience, secaoFases);
    const rodapeConfiguracao = el('div', 'modal-rodape');
    rodapeConfiguracao.append(botao('btn', 'Fechar', fecharConfiguracao));
    configuracao.append(cabecalhoConfiguracao, corpoConfiguracao, rodapeConfiguracao);
    secao.append(cabecalhoDaAba, barra, conteudo, configuracao);
    let versao = 0;
    // Com dados já na tela, atualiza por cima: o conteúdo antigo fica até a resposta chegar.
    async function atualizar() {
      const { cliente, projeto } = contexto;
      const leitura = ++versao;
      recarregar.disabled = true;
      situacao.textContent = 'Atualizando…';
      if (!contexto.equipe)
        conteudo.replaceChildren(
          el(
            'p',
            'texto-auxiliar',
            'Consultando Agenda e Experience… Isso pode levar alguns segundos.',
          ),
        );
      try {
        const equipe = await dados.lerEquipe(cliente.id, projeto.id, contexto.periodo);
        if (leitura !== versao || !podeGerenciar()) return;
        situacao.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        recarregar.disabled = false;
        contexto.equipe = equipe;
        projeto.implantationId = equipe.implantationId;
        const resumo = resumirOs(equipe.os);
        contexto.desenharSeloExperience();
        for (const acao of acoesDaEquipe) acao.disabled = false;
        const tiles = el('div', 'equipe-resumo');
        tiles.setAttribute('aria-label', 'Resumo da equipe no projeto');
        for (const [rotulo, nomeDoIcone, valor, nota, unidade] of [
          [
            'Horas de OS',
            'relogio',
            equipe.osDisponiveis ? horas(resumo.horas).replace(/ h$/, '') : '—',
            'no período consultado',
            equipe.osDisponiveis ? 'h' : '',
          ],
          [
            'OS abertas',
            'lista',
            equipe.osDisponiveis ? resumo.abertas : '—',
            'aguardando conclusão',
          ],
          [
            'OS concluídas',
            'concluido',
            equipe.osDisponiveis ? resumo.concluidas : '—',
            'no período consultado',
          ],
          ['Pessoas', 'pessoas', equipe.pessoas.length, 'na equipe do projeto'],
        ]) {
          const tile = el('div', `equipe-tile ${nomeDoIcone}`);
          const topo = el('div', 'equipe-tile-topo');
          topo.append(el('span', null, rotulo), icone(nomeDoIcone));
          const numero = el('strong', null, String(valor));
          if (unidade) numero.append(' ', el('small', null, unidade));
          tile.append(topo, numero, el('p', 'equipe-tile-nota', nota));
          tiles.append(tile);
        }
        tiles.append(tileDaFaseAtual(contexto));
        for (const chave of contexto.reserva.pessoas)
          if (!equipe.pessoas.some((p) => chaveDaPessoa(p) === chave))
            contexto.reserva.pessoas.delete(chave);
        const cabecalhoDaAgenda = el('div', 'equipe-secao-cabecalho');
        const tituloDaAgenda = el('div');
        tituloDaAgenda.append(
          el('h3', null, 'Agenda da equipe'),
          el(
            'p',
            'texto-auxiliar',
            `Planeje os próximos passos e acompanhe os compromissos · ${dia(contexto.periodo.de)} a ${dia(contexto.periodo.ate)}`,
          ),
        );
        cabecalhoDaAgenda.append(tituloDaAgenda);
        const lista = el('div', 'equipe-lista');
        lista.append(
          ...equipe.pessoas.map((pessoa) =>
            criarCard(
              pessoa,
              equipe,
              contexto,
              // ponytail: sem codusu não há como ligar OS/eventos; aparecem na tabela "Pessoas do projeto".
              pessoa.codusu === null ? [] : equipe.os.filter((os) => os.codusu === pessoa.codusu),
            ),
          ),
        );
        if (!equipe.pessoas.length)
          lista.append(el('p', 'secao-vazia', 'Adicione a primeira pessoa à equipe.'));
        const agenda = el('div', 'equipe-agenda');
        contexto.redesenharAgenda = () =>
          agenda.replaceChildren(...agendaDaEquipe(contexto, contexto.equipe));
        contexto.redesenharAgenda();
        conteudo.replaceChildren(tiles);
        if (equipe.avisoOs) conteudo.append(el('p', 'texto-auxiliar', equipe.avisoOs));
        const sankhyaId = blocoDoSankhyaId(contexto, equipe);
        if (sankhyaId) conteudo.append(sankhyaId);
        conteudo.append(
          cabecalhoDaAgenda,
          agenda,
          expansor(contexto, 'equipe', `Equipe (${equipe.pessoas.length})`, lista, true),
          expansor(
            contexto,
            'pessoas',
            'Pessoas do projeto · recomendadas',
            listaDePessoas(contexto, equipe),
            false,
          ),
        );
      } catch (falha) {
        if (leitura !== versao) return;
        recarregar.disabled = false;
        situacao.textContent = '';
        if (contexto.equipe) {
          exibirAviso(`Não foi possível atualizar a equipe: ${mensagemDaFalha(falha)}`, 'erro');
          return;
        }
        conteudo.replaceChildren(
          el('p', 'erro-formulario', mensagemDaFalha(falha)),
          botao('btn', 'Tentar novamente', atualizar),
        );
      }
    }
    void atualizar();
    return contexto;
  }

  /** Quem da equipe vai no Meet, como o projeto guarda (`nomeusu` = login do ERP). */
  function convidadosDoMeet(contexto, escolhido) {
    return contexto.equipe.pessoas
      .filter((p) => conviteDoMeet(p) && escolhido(p))
      .map((p) => ({ codusu: p.codusu, nome: p.nomeusu }));
  }

  /**
   * Salva o Meet no Google pela janela oculta. Com `registro` (Meet com data) o projeto guarda
   * o Meet — é a fonte do cronograma do cliente —, mesmo quando falha e o link abre no
   * navegador para o GP salvar (aí sem link).
   */
  async function salvarMeet(contexto, endereco, registro) {
    const { cliente, projeto } = contexto;
    const guardar = (link) => {
      if (!registro) return;
      const meets = contexto.equipe?.meets;
      if (!meets) return;
      const mesmo = (m) =>
        m.data === registro.data &&
        m.inicio === registro.inicio &&
        m.fim === registro.fim &&
        (m.titulo ?? '') === registro.titulo;
      meets.splice(0, meets.length, ...meets.filter((m) => !mesmo(m)), { ...registro, link });
    };
    try {
      const { meet } = await dados.criarMeet(
        endereco,
        registro && { id: cliente.id, idProjeto: projeto.id, ...registro },
      );
      guardar(meet || null);
      return meet;
    } catch (falha) {
      guardar(null);
      throw falha;
    }
  }

  /** Grava a lista inteira de fases (e a atual, se informada) e redesenha quem mostra fases. */
  async function salvarFases(contexto, fases, faseAtual) {
    const projeto = await dados.definirFases(
      contexto.cliente.id,
      contexto.projeto.id,
      fases,
      faseAtual,
    );
    contexto.projeto.fases = projeto.fases;
    contexto.projeto.faseAtual = projeto.faseAtual ?? null;
    contexto.desenharFases?.();
    contexto.desenharFaseAtual?.();
  }

  /** Card "Fase atual" ao lado de Pessoas; o Resumo das equipes mostra a mesma fase. */
  function tileDaFaseAtual(contexto) {
    const tile = el('div', 'equipe-tile');
    const seletor = el('select', 'equipe-fase-atual');
    seletor.setAttribute('aria-label', 'Fase atual do projeto');
    const topo = el('div', 'equipe-tile-topo');
    topo.append(el('span', null, 'Fase atual'));
    tile.classList.add('fase');
    tile.append(topo, seletor, el('p', 'equipe-tile-nota', 'Aplicada como padrão nas reservas'));
    contexto.desenharFaseAtual = () => {
      const fases = contexto.projeto.fases ?? [];
      const vazia = el('option', null, fases.length ? 'Não definida' : 'Crie uma fase');
      vazia.value = '';
      seletor.replaceChildren(
        vazia,
        ...fases.map((nome) => {
          const opcao = el('option', null, nome);
          opcao.value = nome;
          return opcao;
        }),
      );
      seletor.value = contexto.projeto.faseAtual ?? '';
      seletor.disabled = !fases.length;
    };
    seletor.addEventListener('change', async () => {
      if (!podeGerenciar()) return;
      seletor.disabled = true;
      try {
        await salvarFases(contexto, contexto.projeto.fases ?? [], seletor.value || null);
        // A fase atual passa a ser a da reserva/Meet; o GP ainda pode trocar na agenda.
        if (contexto.projeto.faseAtual) contexto.reserva.fase = contexto.projeto.faseAtual;
        contexto.redesenharAgenda();
        exibirAviso(
          contexto.projeto.faseAtual
            ? `Fase atual: ${contexto.projeto.faseAtual}.`
            : 'Fase atual removida.',
        );
      } catch (falha) {
        exibirAviso(mensagemDaFalha(falha), 'erro');
        contexto.desenharFaseAtual();
      }
    });
    contexto.desenharFaseAtual();
    return tile;
  }

  /** Marcados nos cards com agenda a reservar (usuário chave só é convidado do Meet). */
  const executantesMarcados = (contexto) =>
    contexto.equipe.pessoas.filter(
      (p) => p.codusu !== null && !p.usuarioChave && contexto.reserva.pessoas.has(p.codusu),
    );

  /** Executante da Agenda do GP logado: na equipe ou no cadastro do ERP pelo login. */
  async function gpDoProjeto(contexto) {
    const login = contexto.equipe?.usuarioErp?.toLowerCase();
    if (!login) return null;
    if (contexto.gp?.nomeusu.toLowerCase() === login) return contexto.gp;
    const iguais = (r) => r.codusu !== null && r.nomeusu.toLowerCase() === login;
    contexto.gp =
      contexto.equipe.pessoas.find(iguais) ??
      (await dados.buscarRecursos(login, contexto.periodo)).recursos.find(iguais) ??
      null;
    return contexto.gp;
  }

  /** Agendas da reserva: marcados nos cards + a do GP (sem repetir se ele também é card). */
  function agendasDaReserva(contexto) {
    const login = contexto.equipe.usuarioErp?.toLowerCase();
    const marcados = executantesMarcados(contexto);
    const gpNoCard = marcados.some((p) => p.nomeusu.toLowerCase() === login);
    return { marcados, comGp: Boolean(contexto.reserva.gp && login && !gpNoCard) };
  }

  /**
   * Meet dos dias selecionados: o link do Google cria um evento só, então sai um por dia,
   * salvo pela janela oculta; o que falhar abre no navegador para o GP salvar.
   */
  /**
   * Salva os Meets um a um pela janela oculta; o que falhar abre no navegador para o GP
   * salvar. `logins` = quem recebe o convite (e-mail login@sankhya.com.br).
   */
  async function salvarMeets(contexto, meets) {
    const falhas = [];
    for (const { logins, ...registro } of meets) {
      const endereco = enderecoDoMeet(registro.titulo, logins, registro);
      try {
        await salvarMeet(contexto, endereco, registro);
      } catch (falha) {
        falhas.push({ endereco, falha });
      }
    }
    for (const { endereco } of falhas) window.open(endereco, '_blank', 'noopener');
    return {
      falhou: falhas.length > 0,
      texto: falhas.length
        ? `${meets.length - falhas.length} Meet(s) salvo(s); ${falhas.length} abertos no Google para conferir e salvar (${mensagemDaFalha(falhas[0].falha)})`
        : `${meets.length} Meet(s) salvo(s) na sua agenda e convites enviados`,
    };
  }

  /** Um Meet por dia selecionado, com as pessoas marcadas nos cards como convidadas. */
  function meetsDosDias(contexto, dias) {
    const reserva = contexto.reserva;
    const titulo = reserva.fase
      ? tituloDaReserva(contexto.cliente.nome, reserva.fase, reserva.observacao, reserva.modulos)
      : `${contexto.cliente.nome} · ${contexto.projeto.nome}`;
    const marcado = (p) => reserva.pessoas.has(chaveDaPessoa(p));
    const logins = contexto.equipe.pessoas.filter(marcado).map(conviteDoMeet).filter(Boolean);
    const convidados = convidadosDoMeet(contexto, marcado);
    return [...dias].sort().map((data) => ({
      data,
      inicio: reserva.inicio,
      fim: reserva.fim,
      titulo,
      ...(reserva.fase ? { fase: reserva.fase } : {}),
      convidados,
      logins,
    }));
  }

  async function gerarMeetDosDias(contexto, acao) {
    const reserva = contexto.reserva;
    if (!podeGerenciar() || contexto.reservando) return;
    if (!(reserva.inicio && reserva.fim && reserva.inicio < reserva.fim)) {
      exibirAviso('Informe início e fim, com o fim depois do início.', 'erro');
      return;
    }
    contexto.reservando = true;
    contexto.atualizarReserva();
    acao.textContent = 'Salvando no Google…';
    try {
      const { texto, falhou } = await salvarMeets(contexto, meetsDosDias(contexto, reserva.dias));
      exibirAviso(`${texto}.`, falhou ? 'erro' : undefined);
    } finally {
      contexto.reservando = false;
      contexto.atualizarReserva();
    }
  }

  async function reservarDias(contexto, acao) {
    const reserva = contexto.reserva;
    if (!podeGerenciar() || contexto.reservando) return;
    if (!(reserva.inicio && reserva.fim && reserva.inicio < reserva.fim)) {
      exibirAviso('Informe início e fim, com o fim depois do início.', 'erro');
      return;
    }
    contexto.reservando = true;
    contexto.atualizarReserva();
    acao.textContent = 'Reservando…';
    try {
      const { marcados, comGp } = agendasDaReserva(contexto);
      const codusus = marcados.map((p) => p.codusu);
      if (comGp) {
        const gp = await gpDoProjeto(contexto);
        if (!gp)
          throw new Error(
            `${contexto.equipe.usuarioErp} não foi encontrado na Agenda de Recursos para reservar a sua agenda.`,
          );
        codusus.push(gp.codusu);
      }
      const eventos = eventosDaReserva({
        dias: reserva.dias,
        codusus,
        horaInicio: reserva.inicio,
        horaFim: reserva.fim,
        titulo: tituloDaReserva(
          contexto.cliente.nome,
          reserva.fase,
          reserva.observacao,
          reserva.modulos,
        ),
        descricao: textoDosModulos(reserva.modulos),
      });
      if (eventos.length > 300)
        throw new Error('No máximo 300 eventos por vez: selecione menos dias ou pessoas.');
      const { resultados } = await dados.lancarNaAgenda(
        contexto.cliente.id,
        contexto.projeto.id,
        eventos,
      );
      const contar = (situacao) => resultados.filter((r) => r.situacao === situacao).length;
      const falha = resultados.find((r) => r.situacao === 'erro');
      // Meet só dos dias com algum evento gravado agora: "já existia" pode já ter o Meet.
      const diasGravados = new Set(
        eventos.filter((_, i) => resultados[i]?.situacao === 'gravado').map((e) => e.data),
      );
      let meet = null;
      if (reserva.comMeet && diasGravados.size) {
        acao.textContent = 'Salvando Meet no Google…';
        meet = await salvarMeets(contexto, meetsDosDias(contexto, diasGravados));
      }
      exibirAviso(
        `${contar('gravado')} evento(s) reservado(s) na Agenda` +
          (contar('ja-existia') ? `, ${contar('ja-existia')} já existia(m)` : '') +
          (falha ? `, ${contar('erro')} com erro: ${falha.mensagem}` : '') +
          (meet ? `; ${meet.texto}` : '') +
          '.',
        falha || meet?.falhou ? 'erro' : undefined,
      );
      // Com erro a seleção fica: reenviar pula o que já gravou.
      if (!falha) {
        reserva.dias.clear();
        reserva.observacao = '';
      }
      await contexto.atualizar();
    } catch (falha) {
      exibirAviso(mensagemDaFalha(falha), 'erro');
    } finally {
      contexto.reservando = false;
      contexto.atualizarReserva();
    }
  }

  /**
   * Topo da agenda: fase, horário e as ações sobre os dias marcados na agenda e as pessoas
   * marcadas nos cards da Equipe (Nova Tarefa, gerar Meet, reservar na Agenda).
   */
  function painelDeReserva(contexto, equipe) {
    const reserva = contexto.reserva;
    const painel = el('form', 'equipe-reserva-dias');
    const rotulado = (rotulo, controle) => {
      const label = el('label', 'campo', rotulo);
      label.append(controle);
      return label;
    };
    const linhaDeMarcar = (caixa, texto, detalhe) => {
      const label = el('label', 'equipe-reserva-pessoa equipe-reserva-opcao');
      const textos = el('span', null, texto);
      textos.append(el('small', null, detalhe));
      label.append(caixa, textos);
      return label;
    };

    // Cabeçalho e dias selecionados na agenda.
    const contagem = el('span', 'equipe-selo verde');
    const cabecalho = el('div', 'equipe-reserva-cabecalho');
    cabecalho.append(el('h4', null, 'Planejar agenda'), contagem);
    const caixaDosDias = el('div', 'equipe-reserva-selecao');
    caixaDosDias.setAttribute('role', 'status');
    const tituloDosDias = el('strong');
    const chipsDosDias = el('div', 'equipe-reserva-chips');
    caixaDosDias.append(tituloDosDias, chipsDosDias);

    const fase = el('select');
    const preencherFases = () => {
      const fases = fasesDaReserva(contexto.projeto);
      if (!fases.includes(reserva.fase)) {
        const atual = contexto.projeto.faseAtual;
        reserva.fase = fases.includes(atual) ? atual : (fases[0] ?? '');
      }
      const opcoes = fases.map((nome) => {
        const item = el('option', null, nome);
        item.value = nome;
        return item;
      });
      if (!opcoes.length) {
        const vazia = el('option', null, 'Crie ou importe uma fase');
        vazia.value = '';
        opcoes.push(vazia);
      }
      fase.replaceChildren(...opcoes);
      fase.value = reserva.fase;
      fase.disabled = !fases.length;
    };
    preencherFases();
    fase.addEventListener('change', () => {
      reserva.fase = fase.value;
      preencherModulosDaFase();
      atualizarResumo();
    });
    const importarEtapas = botao(
      'btn tiny ghost equipe-link',
      'Importar etapas da Experience',
      async () => {
        if (!podeGerenciar()) return;
        importarEtapas.disabled = true;
        importarEtapas.textContent = 'Lendo Etapas na Experience…';
        try {
          const projeto = await dados.importarMapeamento(contexto.cliente.id, contexto.projeto.id);
          contexto.projeto.mapeamentoExperience = projeto.mapeamentoExperience;
          exibirAviso(`${projeto.mapeamentoExperience.length} processos importados da Experience.`);
          contexto.redesenharAgenda();
        } catch (falha) {
          exibirAviso(mensagemDaFalha(falha), 'erro');
          importarEtapas.disabled = false;
          importarEtapas.textContent = 'Importar etapas da Experience';
        }
      },
    );
    const campoFase = rotulado('Fase', fase);
    campoFase.append(importarEtapas);

    // Módulos da Etapa escolhida (pedido da GP em 17/11): vão no título e na "Descrição completa".
    const linhaModulos = el('details', 'equipe-reserva-modulos');
    linhaModulos.open = true;
    const nomeDosModulos = el('span', 'equipe-reserva-modulos-titulo');
    const contagemDosModulos = el('span', 'equipe-reserva-modulos-contagem');
    const resumoDosModulos = el('summary');
    resumoDosModulos.append(nomeDosModulos, contagemDosModulos);
    const listaDosModulos = el('div', 'equipe-reserva-modulos-lista');
    listaDosModulos.setAttribute('role', 'group');
    linhaModulos.append(resumoDosModulos, listaDosModulos);
    function preencherModulosDaFase() {
      const nomesDosModulos = modulosDaFase(contexto.projeto, reserva.fase);
      reserva.modulos = reserva.modulos.filter((nome) => nomesDosModulos.includes(nome));
      nomeDosModulos.textContent = `Módulos${reserva.fase ? ` de ${reserva.fase}` : ''}`;
      listaDosModulos.setAttribute('aria-label', nomeDosModulos.textContent);
      listaDosModulos.replaceChildren();
      if (!nomesDosModulos.length)
        listaDosModulos.append(
          el(
            'p',
            'texto-auxiliar',
            contexto.projeto.mapeamentoExperience?.length
              ? 'Esta fase não é uma Etapa da Experience; escolha uma Etapa para marcar os módulos.'
              : 'Importe as etapas da Experience para escolher a Etapa e os módulos.',
          ),
        );
      for (const nome of nomesDosModulos) {
        const rotulo = el('label', 'equipe-reserva-modulo');
        const caixa = el('input');
        caixa.type = 'checkbox';
        caixa.checked = reserva.modulos.includes(nome);
        caixa.addEventListener('change', () => {
          // Na ordem da Experience, não na ordem dos cliques.
          reserva.modulos = nomesDosModulos.filter((n) =>
            n === nome ? caixa.checked : reserva.modulos.includes(n),
          );
          atualizarResumo();
        });
        rotulo.append(caixa, el('span', null, nome));
        listaDosModulos.append(rotulo);
      }
    }
    preencherModulosDaFase();

    const hora = (chave) => {
      const input = el('input');
      input.type = 'time';
      input.required = true;
      input.value = reserva[chave];
      input.addEventListener('input', () => {
        reserva[chave] = input.value;
        atualizarResumo();
      });
      return input;
    };
    const linhaHorario = el('div', 'equipe-reserva-horario');
    linhaHorario.append(rotulado('Início', hora('inicio')), rotulado('Fim', hora('fim')));
    const observacao = el('input');
    observacao.type = 'text';
    observacao.maxLength = 150;
    observacao.placeholder = 'Ex.: Validação do financeiro';
    observacao.value = reserva.observacao;
    observacao.addEventListener('input', () => {
      reserva.observacao = observacao.value;
      atualizarResumo();
    });
    const campoObservacao = rotulado('Observação', observacao);
    campoObservacao.insertBefore(
      el('small', 'equipe-reserva-dica', 'Opcional · aparece no título após |'),
      observacao,
    );

    const caixaDoTitulo = el('div', 'equipe-reserva-titulo');
    const titulo = el('strong');
    caixaDoTitulo.append(el('span', 'texto-auxiliar', 'Título na agenda'), titulo);

    // Pessoas marcadas nos cards da Equipe, agenda do GP e Meet.
    const cabecalhoPessoas = el('div', 'equipe-reserva-cabecalho');
    const irParaEquipe = botao('btn tiny ghost equipe-link', 'Selecionar na equipe ↓', () =>
      contexto.secao
        .querySelector('.equipe-pessoa, .equipe-expansor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    cabecalhoPessoas.append(el('span', 'texto-auxiliar', 'Pessoas selecionadas'), irParaEquipe);
    const pessoas = el('p', 'equipe-reserva-pessoas-texto');
    const login = equipe.usuarioErp;
    if (!login) reserva.gp = false;
    const marcarGp = el('input');
    marcarGp.type = 'checkbox';
    marcarGp.checked = reserva.gp;
    marcarGp.disabled = !login;
    marcarGp.addEventListener('change', () => {
      reserva.gp = marcarGp.checked;
      atualizarResumo();
    });
    const minhaAgenda = linhaDeMarcar(
      marcarGp,
      login ? 'Reservar também a minha agenda' : 'Minha agenda',
      login ?? 'Login do ERP não identificado',
    );
    const marcarMeet = el('input');
    marcarMeet.type = 'checkbox';
    marcarMeet.checked = reserva.comMeet;
    marcarMeet.addEventListener('change', () => {
      reserva.comMeet = marcarMeet.checked;
      atualizarResumo();
    });
    const comMeet = linhaDeMarcar(
      marcarMeet,
      'Gerar Meet junto',
      'Um por dia, com as pessoas marcadas convidadas.',
    );

    const limpar = botao('btn tiny ghost equipe-link', 'Limpar seleção', () => {
      reserva.dias.clear();
      contexto.redesenharAgenda();
    });
    const gerenciarFases = botao('btn tiny ghost equipe-link', 'Gerenciar fases ↗', () =>
      contexto.abrirConfiguracao(),
    );
    const reservar = botao('btn primario', 'Reservar', () => {});
    reservar.type = 'submit';
    const meet = botao('btn primario', 'Gerar Meet', () => void gerarMeetDosDias(contexto, meet));
    meet.title = 'Um Meet por dia selecionado, com as pessoas marcadas como convidadas';
    // ponytail: Nova Tarefa (OS na Experience) segue uma pessoa e um dia por vez; virar lote
    // junto do Reservar quando a Experience for validada com a GP.
    const novaTarefa = botao('btn primario', 'Nova Tarefa', () => {
      const pessoa =
        executantesMarcados(contexto)[0] ??
        equipe.pessoas.find((p) => p.codusu !== null && !p.usuarioChave);
      if (!pessoa) {
        exibirAviso('Adicione uma pessoa à equipe antes de lançar a Nova Tarefa.', 'erro');
        return;
      }
      abrirReserva(contexto, pessoa, {
        data: [...reserva.dias].sort()[0],
        horaInicio: reserva.inicio,
        horaFim: reserva.fim,
        titulo: reserva.fase
          ? tituloDaReserva(contexto.cliente.nome, reserva.fase, reserva.observacao)
          : '',
        // O modal monta o título com a Etapa e os módulos marcados nele; leva só a observação.
        observacao: reserva.observacao,
        etapa: reserva.fase,
      });
    });
    novaTarefa.title =
      'Lança a OS na Experience para a primeira pessoa marcada, no primeiro dia selecionado';
    const acoes = el('div', 'equipe-reserva-acoes');
    acoes.append(reservar, novaTarefa, meet);
    const situacaoDaReserva = el('p', 'equipe-reserva-situacao');
    const rodape = el('div', 'equipe-reserva-rodape');
    rodape.append(limpar, gerenciarFases);

    function atualizarResumo() {
      const lista = [...reserva.dias].sort();
      contagem.textContent = `${lista.length} dia${lista.length === 1 ? '' : 's'}`;
      caixaDosDias.classList.toggle('ativa', lista.length > 0);
      tituloDosDias.textContent = lista.length
        ? `${lista.length} dia(s) selecionado(s)`
        : 'Nenhum dia selecionado';
      chipsDosDias.replaceChildren(
        ...(lista.length
          ? lista.map((d) => el('span', 'equipe-reserva-chip', dia(d).slice(0, 5)))
          : [
              el('span', 'texto-auxiliar', 'Clique nos dias da agenda para selecionar um ou mais.'),
            ]),
      );
      contagemDosModulos.textContent = reserva.modulos.length
        ? `${reserva.modulos.length} selecionado(s)`
        : '';
      const marcadas = equipe.pessoas.filter((p) => reserva.pessoas.has(chaveDaPessoa(p)));
      pessoas.textContent = marcadas.length
        ? marcadas.map((p) => (p.usuarioChave ? `${p.nomeusu} (só Meet)` : p.nomeusu)).join(', ')
        : 'Nenhuma pessoa marcada · marque nos cards da Equipe para reservar e convidar no Meet.';
      titulo.textContent = reserva.fase
        ? tituloDaReserva(contexto.cliente.nome, reserva.fase, reserva.observacao, reserva.modulos)
        : 'Escolha a fase para montar o título.';
      const { marcados: agendas, comGp } = agendasDaReserva(contexto);
      const total = lista.length * (agendas.length + (comGp ? 1 : 0));
      if (!contexto.reservando)
        reservar.textContent = total
          ? `Reservar ${total} evento(s)${reserva.comMeet ? ' + Meet' : ''}`
          : 'Reservar agenda';
      reservar.title = reserva.comMeet
        ? 'Agenda de Recursos e um Meet por dia selecionado, com as pessoas marcadas convidadas'
        : 'Só na Agenda de Recursos: um evento por dia selecionado e pessoa marcada';
      reservar.disabled = Boolean(contexto.reservando) || !total || !reserva.fase;
      if (!contexto.reservando)
        meet.textContent = lista.length ? `Gerar Meet (${lista.length} dia(s))` : 'Gerar Meet';
      meet.disabled = Boolean(contexto.reservando) || !lista.length || !marcadas.length;
      limpar.disabled = Boolean(contexto.reservando) || !lista.length;
      situacaoDaReserva.textContent = lista.length
        ? ''
        : 'Selecione ao menos um dia para continuar.';
    }
    contexto.atualizarReserva = atualizarResumo;
    atualizarResumo();
    painel.addEventListener('submit', (evento) => {
      evento.preventDefault();
      void reservarDias(contexto, reservar);
    });
    painel.append(
      cabecalho,
      el('p', 'texto-auxiliar', 'Selecione os dias e defina a reserva.'),
      caixaDosDias,
      campoFase,
      linhaModulos,
      linhaHorario,
      campoObservacao,
      caixaDoTitulo,
      cabecalhoPessoas,
      pessoas,
      minhaAgenda,
      comMeet,
      el('hr', 'equipe-divisor'),
      acoes,
      situacaoDaReserva,
      rodape,
    );
    return painel;
  }

  /**
   * Agenda da equipe no topo: OS de cada pessoa, eventos da Agenda de Recursos e o que a
   * planilha importada planejou por fase. Clicar nos dias monta a reserva logo abaixo.
   */
  function agendaDaEquipe(contexto, equipe) {
    const membroDe = new Map(
      equipe.pessoas.filter((p) => p.codusu !== null).map((p) => [p.codusu, p]),
    );
    const primeiroNome = (nome = '') => nome.split(/[\s.]+/)[0] ?? '';
    const itens = [
      ...equipe.os.map((os) => ({
        data: os.dia.slice(0, 10),
        texto: `OS #${os.id} · ${primeiroNome(os.pessoa)}`,
        title: `OS #${os.id} · ${os.pessoa} · ${horas(os.horas)} · ${os.statusOriginal}`,
        cor: corDe(membroDe.get(os.codusu)),
        classe: 'os',
        quem: [os.codusu],
      })),
      ...equipe.reservas.map((reserva) => {
        const membro = membroDe.get(reserva.codusu);
        const horario =
          reserva.proprio && !reserva.diaTodo
            ? `${reserva.inicio.slice(11, 16)}–${reserva.fim.slice(11, 16)} `
            : '';
        return {
          data: reserva.inicio.slice(0, 10),
          texto: `${horario}${primeiroNome(membro?.nomeusu)}: ${reserva.oque}`,
          title: `Agenda de Recursos · ${membro?.nomeusu ?? ''} · ${reserva.oque}${reserva.doCliente ? '' : ' · outro cliente'}`,
          cor: corDe(membro),
          classe: reserva.doCliente ? 'agenda' : 'agenda outro-cliente',
          tipo: reserva.doCliente ? 'agenda' : 'outro-cliente',
          quem: [reserva.codusu],
        };
      }),
      ...contexto.planejado.map((linha) => ({
        data: linha.data,
        texto: `${linha.etapa} · ${primeiroNome(linha.consultor)}`,
        title: `Planejado na planilha · ${linha.etapa} · ${linha.titulo} · ${linha.consultor} · ${linha.horaInicio}–${linha.horaFim}`,
        cor: 'var(--aviso)',
        classe: 'planejado',
        quem: [linha.codUsu ?? linha.codusu],
      })),
      ...(equipe.meets ?? []).map((meet) => ({
        data: meet.data,
        texto: `Meet ${meet.inicio} ${meet.titulo ?? ''}`.trim(),
        title: [
          `Meet ${meet.inicio}–${meet.fim}`,
          meet.titulo,
          meet.convidados?.map((c) => c.nome).join(', '),
          meet.link ? null : 'sem link (salvo à mão no Google)',
        ]
          .filter(Boolean)
          .join(' · '),
        cor: 'var(--marca)',
        classe: 'meet',
        quem: (meet.convidados ?? []).map((c) => c.codusu ?? `nome:${c.nome}`),
      })),
    ].filter(
      // Pessoas marcadas nos cards filtram a agenda; sem marcação, mostra tudo. Tipo
      // desligado na legenda some da agenda.
      (item) =>
        (!contexto.reserva.pessoas.size ||
          item.quem.some((codusu) => contexto.reserva.pessoas.has(codusu))) &&
        !contexto.tiposOcultos.has(item.tipo ?? item.classe),
    );
    const legenda = el('div', 'equipe-agenda-legenda');
    for (const [classe, rotulo] of [
      ['os', 'OS na Experience'],
      ['agenda', 'Agenda de Recursos'],
      ['meet', 'Meet'],
      ['planejado', 'Planejado na planilha (por fase)'],
      ['outro-cliente', 'Agenda de outro cliente'],
    ]) {
      // Cada item da legenda liga/desliga o próprio tipo na agenda com um clique.
      const visivel = !contexto.tiposOcultos.has(classe);
      const chip = el(
        'button',
        `equipe-calendario-evento equipe-legenda-filtro ${classe === 'outro-cliente' ? 'agenda outro-cliente' : classe}`,
        rotulo,
      );
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(visivel));
      chip.title = visivel ? `Ocultar ${rotulo} da agenda` : `Mostrar ${rotulo} na agenda`;
      chip.addEventListener('click', () => {
        if (visivel) contexto.tiposOcultos.add(classe);
        else contexto.tiposOcultos.delete(classe);
        contexto.redesenharAgenda();
      });
      legenda.append(chip);
    }
    if (contexto.planejado.length)
      legenda.append(
        botao('btn tiny ghost', 'Ocultar planejado', () => {
          contexto.planejado = [];
          contexto.redesenharAgenda();
        }),
      );
    const rodapeDaAgenda = el(
      'p',
      'equipe-calendario-rodape',
      'Clique para selecionar dias · Duplo clique para ver e excluir lançamentos',
    );
    if (equipe.reservas.some((r) => !r.proprio))
      rodapeDaAgenda.append(
        el(
          'span',
          null,
          'Eventos de outro GP ou sem autoria confirmada: apenas dia e demanda são exibidos.',
        ),
      );
    return [
      calendario({
        titulo: contexto.reserva.pessoas.size
          ? `Agenda de ${contexto.reserva.pessoas.size} pessoa(s) marcada(s) · selecione os dias`
          : 'Agenda da equipe · selecione os dias',
        itens,
        periodo: contexto.periodo,
        selecao: {
          dias: contexto.reserva.dias,
          alternar: (iso) => {
            if (contexto.reserva.dias.has(iso)) contexto.reserva.dias.delete(iso);
            else contexto.reserva.dias.add(iso);
            contexto.atualizarReserva();
          },
        },
        mes: contexto.mesAgenda,
        extra: [legenda],
        abrirDia: (iso) => void abrirLancamentosDoDia(contexto, iso),
        rodape: rodapeDaAgenda,
      }),
      painelDeReserva(contexto, equipe),
    ];
  }

  /** Com `escolher`, a busca só devolve a pessoa (executante da planilha); não mexe na equipe. */
  async function abrirBusca(contexto, termo = '', substituir = null, escolher = null) {
    if (!podeGerenciar()) return;
    contextoBusca = contexto;
    substituirNaBusca = substituir;
    escolherNaBusca = escolher;
    tituloBusca.textContent = escolher ? 'Escolher executante' : 'Adicionar pessoa à equipe';
    avisoBusca.hidden = Boolean(escolher);
    busca.value = termo;
    erro(erroBusca);
    adicionar.showModal();
    busca.focus();
    await atualizarBusca();
  }

  async function atualizarBusca() {
    const contexto = contextoBusca;
    const leitura = ++versaoBusca;
    if (!contexto) return;
    resultados.replaceChildren(el('p', 'texto-auxiliar', 'Buscando pessoas…'));
    erro(erroBusca);
    try {
      const { recursos: pessoas, aviso } = await dados.buscarRecursos(
        busca.value,
        contexto.periodo,
      );
      if (leitura !== versaoBusca || contexto !== contextoBusca || !podeGerenciar()) return;
      resultados.replaceChildren();
      erro(erroBusca, aviso ?? '');
      for (const pessoa of pessoas) {
        if (escolherNaBusca) {
          const escolher = escolherNaBusca;
          const linha = el('div', 'equipe-resultado');
          linha.append(
            avatar(pessoa),
            identidade(pessoa),
            botao('btn tiny primario', 'Escolher', () => {
              escolher(pessoa);
              adicionar.close();
            }),
          );
          resultados.append(linha);
          continue;
        }
        const naEquipe = contexto.equipe.pessoas.some((r) => r.codusu === pessoa.codusu);
        const linha = el('div', `equipe-resultado${naEquipe ? ' equipe-ja-adicionada' : ''}`);
        const acao = botao(
          'btn tiny primario',
          naEquipe ? 'Na equipe' : '+ Adicionar',
          async () => {
            if (!podeGerenciar()) return;
            acao.disabled = true;
            try {
              const herdado = substituirNaBusca
                ? {
                    usuarioChave: Boolean(substituirNaBusca.usuarioChave),
                    personId: substituirNaBusca.personId ?? null,
                  }
                : {};
              await dados.adicionarPessoa(contexto.cliente.id, contexto.projeto.id, {
                ...pessoa,
                ...herdado,
              });
              if (substituirNaBusca) {
                await dados.removerPessoa(
                  contexto.cliente.id,
                  contexto.projeto.id,
                  substituirNaBusca,
                );
                substituirNaBusca = null;
              }
              await contexto.atualizar();
              if (contexto === contextoBusca) {
                acao.textContent = 'Na equipe';
              }
              exibirAviso(`${pessoa.nomeusu} adicionada à equipe.`);
            } catch (falha) {
              erro(erroBusca, mensagemDaFalha(falha));
              acao.disabled = false;
            }
          },
        );
        acao.disabled = naEquipe;
        const quem = identidade(pessoa);
        if (pessoa.foraDaAgenda)
          quem.append(el('span', 'equipe-cargo', 'Fora da sua Agenda: sem eventos no card'));
        linha.append(avatar(pessoa), quem, acao);
        resultados.append(linha);
      }
      if (!pessoas.length)
        resultados.append(
          el(
            'p',
            'secao-vazia',
            'Nenhuma pessoa encontrada. Para nome completo, a busca tenta o login nome.sobrenome; tente também só o login ou o código do usuário.',
          ),
        );
    } catch (falha) {
      if (leitura === versaoBusca) {
        resultados.replaceChildren();
        erro(erroBusca, mensagemDaFalha(falha));
      }
    }
  }

  function lerReserva() {
    return {
      stageId: Number(campo('etapa').value),
      procedureIds: procedimentosMarcados(),
      titulo: campo('titulo').value.trim(),
      // Só na Agenda de Recursos; a tarefa da Experience não muda.
      descricao: textoDosModulos(modulosMarcados()),
      data: campo('data').value,
      horaInicio: campo('horaInicio').value,
      horaFim: campo('horaFim').value,
      codUsu: Number(campo('codUsu').value),
      personId: Number(campo('personId').value),
      implantationId: contextoReserva?.projeto.implantationId,
      applicationId: Number(campo('applicationId').value),
      observacao: campo('observacao').value.trim(),
    };
  }

  function atualizarPrevia() {
    if (!contextoReserva) return;
    const tarefa = lerReserva();
    const pessoa = contextoReserva.equipe.pessoas.find((p) => p.codusu === tarefa.codUsu);
    const periodo =
      tarefa.data && tarefa.horaInicio && tarefa.horaFim
        ? `${dia(tarefa.data)} · ${tarefa.horaInicio}–${tarefa.horaFim}`
        : 'Informe a data e os horários';
    previa.replaceChildren(el('h3', null, 'Confira antes de lançar'));
    for (const [rotulo, valor] of [
      ['Agenda de Recursos', `${pessoa?.nomeusu ?? 'Executante'} · ${periodo}`],
      ['Atividade', tarefa.titulo || 'Informe o título'],
      ['Descrição completa na Agenda', tarefa.descricao || 'Marque um módulo'],
      ['Processo na Experience', resumoDaEscolha() || 'Marque um módulo ou procedimento'],
      ['Implantação', tarefa.implantationId ? String(tarefa.implantationId) : 'Não cadastrada'],
      ['Usuário na Experience', campo('personId').value || 'Informe o ID'],
      [
        'Pedido na Experience',
        campo('applicationId').selectedOptions[0]?.textContent || 'Escolha o pedido',
      ],
    ]) {
      const linha = el('div', 'equipe-previa-linha');
      linha.append(el('span', null, rotulo), el('strong', null, valor));
      previa.append(linha);
    }
    confirmar.disabled =
      enviando ||
      resultadoIndeterminado ||
      Boolean(pendenciasDaNovaTarefa(contextoReserva.projeto));
  }

  // Sugestão a partir do login do executante; o GP ainda pode corrigir o campo.
  let versaoPersonId = 0;
  async function sugerirPersonId() {
    const versao = ++versaoPersonId;
    const ajuda = document.getElementById('equipe-ajuda-person-ids');
    const pessoa = contextoReserva?.equipe.pessoas.find(
      (p) => p.codusu === Number(campo('codUsu').value),
    );
    campo('personId').value = '';
    if (!pessoa) return;
    ajuda.textContent = `Procurando ${pessoa.nomeusu} na Experience…`;
    try {
      const { personId, email } = await dados.personIdDoLogin(pessoa.nomeusu);
      if (versao !== versaoPersonId) return;
      campo('personId').value = String(personId);
      ajuda.textContent = `Encontrado pelo e-mail ${email}. Confira antes de lançar.`;
    } catch (falha) {
      if (versao !== versaoPersonId) return;
      ajuda.textContent = `${mensagemDaFalha(falha)} Informe o person_id manualmente.`;
    }
    atualizarPrevia();
  }

  // O "Código" que aparece no nome do pedido é a OS, não o application_id (12/11): por isso
  // o pedido vem da Experience em vez de ser digitado.
  let versaoPedidos = 0;
  async function carregarPedidos() {
    const versao = ++versaoPedidos;
    const contexto = contextoReserva;
    const pedido = campo('applicationId');
    const ajuda = document.getElementById('equipe-ajuda-pedido');
    const stageId = Number(campo('etapa').value);
    const procedureIds = procedimentosMarcados();
    pedido.replaceChildren();
    pedido.disabled = true;
    atualizarPrevia();
    if (!contexto || !stageId || !procedureIds.length) {
      ajuda.textContent = 'Marque um módulo ou procedimento para ver os pedidos.';
      return;
    }
    ajuda.textContent = 'Procurando pedidos na Experience…';
    try {
      const { pedidos } = await dados.pedidosDaNovaTarefa(
        contexto.cliente.id,
        contexto.projeto.id,
        stageId,
        procedureIds,
      );
      if (versao !== versaoPedidos) return;
      pedido.replaceChildren(
        ...pedidos.map((p) => {
          const opcao = el('option', null, p.nome);
          opcao.value = String(p.id);
          return opcao;
        }),
      );
      pedido.disabled = !pedidos.length;
      ajuda.textContent = !pedidos.length
        ? 'A Experience não tem pedido para esta etapa e procedimento.'
        : pedidos.length > 1
          ? 'Mais de um pedido: escolha o certo.'
          : '';
    } catch (falha) {
      if (versao !== versaoPedidos) return;
      ajuda.textContent = mensagemDaFalha(falha);
    }
    atualizarPrevia();
  }

  // Igual à tela Etapas da Experience: Etapa → módulos em cards → opções (procedimentos).
  // Marcar o módulo marca todas as opções dele; abrir e marcar algumas lança só essas.
  const modulos = document.getElementById('equipe-modulos');
  let arvore = [];
  let esperaPedidos;

  function procedimentosMarcados() {
    return [
      ...new Set(
        [...modulos.querySelectorAll('input[data-procedimento]:checked')].flatMap((c) =>
          c.value.split(',').map(Number),
        ),
      ),
    ];
  }

  function resumoDaEscolha() {
    const partes = [...modulos.querySelectorAll('.equipe-modulo')].flatMap((caixa) => {
      const opcoes = caixa.querySelectorAll('input[data-procedimento]');
      const marcadas = caixa.querySelectorAll('input[data-procedimento]:checked').length;
      if (!marcadas) return [];
      const nome = caixa.dataset.modulo;
      return [
        marcadas === opcoes.length
          ? `${nome} (todas)`
          : `${nome} (${marcadas} de ${opcoes.length})`,
      ];
    });
    if (!partes.length) return '';
    return `${campo('etapa').selectedOptions[0]?.textContent ?? ''} › ${partes.join(', ')}`;
  }

  /** Módulos com alguma opção marcada, na ordem da tela. */
  function modulosMarcados() {
    return [...modulos.querySelectorAll('.equipe-modulo')]
      .filter((caixa) => caixa.querySelector('input[data-procedimento]:checked'))
      .map((caixa) => caixa.dataset.modulo);
  }

  // Título `<Cliente> - <Etapa> : <Módulos> | <Obs>` (pedido da GP em 17/11), refeito a cada
  // marcação até o GP editar o campo à mão.
  let tituloEditado = false;
  let observacaoDoTitulo = '';
  function sugerirTitulo() {
    const etapa = campo('etapa').selectedOptions[0]?.textContent;
    if (tituloEditado || !contextoReserva || !etapa) return;
    campo('titulo').value = tituloDaReserva(
      contextoReserva.cliente.nome,
      etapa,
      observacaoDoTitulo,
      modulosMarcados(),
    );
  }
  campo('titulo').addEventListener('input', () => {
    tituloEditado = true;
  });

  function aoMarcar() {
    sugerirTitulo();
    atualizarPrevia();
    clearTimeout(esperaPedidos);
    esperaPedidos = setTimeout(() => void carregarPedidos(), 300);
  }

  function marcador(texto, atributo) {
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    if (atributo) caixa.dataset[atributo] = '';
    const rotulo = el('label');
    rotulo.append(caixa, el('span', null, texto));
    return { caixa, rotulo };
  }

  // Marcado se todas as opções estão; "−" (indeterminate) se só algumas.
  function sincronizar(caixa, opcoes) {
    const marcadas = opcoes.filter((o) => o.checked).length;
    caixa.checked = marcadas > 0 && marcadas === opcoes.length;
    caixa.indeterminate = marcadas > 0 && marcadas < opcoes.length;
  }

  function alternar(botao, alvo, abrir = alvo.hidden) {
    alvo.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
  }

  /** Card do módulo; dentro, as atividades (agrupadores da Experience) com as opções. */
  function marcadorDoModulo(modulo) {
    const caixa = el('div', 'equipe-modulo');
    caixa.dataset.modulo = modulo.nome;
    const todas = marcador(modulo.nome);
    const total = modulo.atividades.reduce((n, a) => n + a.procedimentos.length, 0);
    const abrir = el('button', 'btn tiny ghost', `${total} opções`);
    abrir.type = 'button';
    abrir.setAttribute('aria-expanded', 'false');
    const lista = el('div', 'equipe-procedimentos');
    lista.hidden = true;

    const opcaoDe = (p) => {
      const { caixa: opcao, rotulo } = marcador(p.nome, 'procedimento');
      opcao.value = p.ids.join(',');
      return rotulo;
    };
    const grupos = [];
    for (const atividade of modulo.atividades) {
      const opcoes = el('div', 'equipe-atividade-opcoes');
      opcoes.append(...atividade.procedimentos.map(opcaoDe));
      // Mapeamento importado antes de 12/11 não tem atividade: opções soltas no módulo.
      if (!atividade.nome) {
        lista.append(opcoes);
        continue;
      }
      const grupo = el('div', 'equipe-atividade');
      const { caixa: marcaGrupo, rotulo } = marcador(atividade.nome, 'atividade');
      const seta = el('button', 'equipe-atividade-seta', '›');
      seta.type = 'button';
      seta.setAttribute('aria-label', `Opções de ${atividade.nome}`);
      alternar(seta, opcoes, false);
      seta.addEventListener('click', () => alternar(seta, opcoes));
      const cabeca = el('div', 'equipe-atividade-cabeca');
      cabeca.append(seta, rotulo);
      grupo.append(cabeca, opcoes);
      grupos.push({ grupo, marcaGrupo, seta, opcoes });
      lista.append(grupo);
    }
    if (grupos.length > 1) {
      const expandir = el('button', 'btn tiny ghost equipe-expandir', 'Expandir todos');
      expandir.type = 'button';
      expandir.addEventListener('click', () => {
        const abrirTodos = grupos.some((g) => g.opcoes.hidden);
        for (const g of grupos) alternar(g.seta, g.opcoes, abrirTodos);
        expandir.textContent = abrirTodos ? 'Recolher todos' : 'Expandir todos';
      });
      lista.prepend(expandir);
    }

    const opcoes = [...lista.querySelectorAll('input[data-procedimento]')];
    caixa.addEventListener('change', (evento) => {
      const alvo = evento.target;
      const alcance =
        alvo === todas.caixa
          ? lista
          : 'atividade' in alvo.dataset
            ? alvo.closest('.equipe-atividade')
            : null;
      if (alcance)
        for (const o of alcance.querySelectorAll('input[data-procedimento]'))
          o.checked = alvo.checked;
      for (const g of grupos)
        sincronizar(g.marcaGrupo, [...g.grupo.querySelectorAll('input[data-procedimento]')]);
      sincronizar(todas.caixa, opcoes);
      aoMarcar();
    });
    abrir.addEventListener('click', () => alternar(abrir, lista));
    const cabeca = el('div', 'equipe-modulo-cabeca');
    cabeca.append(todas.rotulo, abrir);
    caixa.append(cabeca, lista);
    return caixa;
  }

  function preencherModulos() {
    const etapa = arvore.find((e) => String(e.stageId) === campo('etapa').value);
    modulos.replaceChildren(...(etapa?.modulos ?? []).map(marcadorDoModulo));
    aoMarcar();
  }

  function preencherProcessos() {
    const mapeamento = contextoReserva.projeto.mapeamentoExperience ?? [];
    arvore = arvoreDoMapeamento(mapeamento);
    campo('etapa').replaceChildren(
      ...arvore.map((e) => {
        const opcao = el('option', null, e.etapa);
        opcao.value = String(e.stageId);
        return opcao;
      }),
    );
    campo('etapa').disabled = !arvore.length;
    preencherModulos();
    importarProcessos.textContent = mapeamento.length
      ? 'Atualizar processos da Experience'
      : 'Importar processos da Experience';
  }

  importarProcessos.addEventListener('click', async () => {
    const contexto = contextoReserva;
    if (!contexto || enviando || !podeGerenciar()) return;
    importarProcessos.disabled = true;
    const rotulo = importarProcessos.textContent;
    importarProcessos.textContent = 'Lendo Etapas e Procedimentos na Experience…';
    try {
      const projeto = await dados.importarMapeamento(contexto.cliente.id, contexto.projeto.id);
      contexto.projeto.mapeamentoExperience = projeto.mapeamentoExperience;
      contexto.redesenharAgenda(); // caixa "Módulos" do Reservar lê o mapeamento novo
      if (contextoReserva !== contexto) return;
      preencherProcessos();
      erro(erroReserva, pendenciasDaNovaTarefa(contexto.projeto));
      exibirAviso(`${projeto.mapeamentoExperience.length} processos importados da Experience.`);
    } catch (falha) {
      importarProcessos.textContent = rotulo;
      erro(erroReserva, mensagemDaFalha(falha));
    } finally {
      importarProcessos.disabled = false;
    }
  });

  /** `sugestao` (data, horas, título) vem da seleção da agenda; o GP confere no modal. */
  function abrirReserva(contexto, pessoa, sugestao = {}) {
    if (!podeGerenciar() || enviando) return;
    contextoReserva = contexto;
    resultadoIndeterminado = false;
    formulario.reset();
    tituloEditado = false;
    observacaoDoTitulo = sugestao.observacao ?? '';
    erro(erroReserva, pendenciasDaNovaTarefa(contexto.projeto));
    campo('codUsu').replaceChildren(
      ...contexto.equipe.pessoas
        .filter((p) => p.codusu !== null && !p.usuarioChave)
        .map((p) => {
          const opcao = el('option', null, `${p.codusu} — ${p.nomeusu}`);
          opcao.value = String(p.codusu);
          return opcao;
        }),
    );
    campo('codUsu').value = String(pessoa.codusu);
    preencherProcessos();
    // Abre na Etapa escolhida no Reservar; os módulos o GP marca aqui (viram procedimentos da OS).
    const etapa = arvore.find(
      (e) => e.etapa.toLocaleLowerCase('pt-BR') === sugestao.etapa?.toLocaleLowerCase('pt-BR'),
    );
    if (etapa) {
      campo('etapa').value = String(etapa.stageId);
      preencherModulos();
    }
    const hoje = new Date();
    campo('data').value =
      `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    if (sugestao.data) campo('data').value = sugestao.data;
    campo('horaInicio').value = sugestao.horaInicio || '09:00';
    campo('horaFim').value = sugestao.horaFim || '18:00';
    // Sem Etapa (processos não importados), fica o título da Fase.
    if (sugestao.titulo) campo('titulo').value = sugestao.titulo;
    sugerirTitulo();
    atualizarPrevia();
    reservar.showModal();
    campo('titulo').focus();
    void sugerirPersonId();
  }

  campo('codUsu').addEventListener('change', () => void sugerirPersonId());
  campo('etapa').addEventListener('change', preencherModulos);
  formulario.addEventListener('input', atualizarPrevia);
  formulario.addEventListener('change', atualizarPrevia);
  reservar.addEventListener('cancel', (evento) => {
    if (enviando) evento.preventDefault();
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (confirmar.disabled || !contextoReserva || !podeGerenciar() || enviando) return;
    erro(erroReserva);
    if (!formulario.reportValidity()) return;
    const tarefa = lerReserva();
    const mensagem = validarNovaTarefa(tarefa, contextoReserva.projeto);
    if (mensagem) {
      erro(erroReserva, mensagem);
      return;
    }
    const contexto = contextoReserva;
    if (!contexto.equipe.pessoas.some((p) => p.codusu === tarefa.codUsu)) {
      erro(erroReserva, 'Selecione um executante da equipe deste projeto.');
      return;
    }
    enviando = true;
    confirmar.disabled = true;
    confirmar.textContent = 'Lançando…';
    for (const fechar of reservar.querySelectorAll('[data-equipe-fechar]')) fechar.disabled = true;
    try {
      const { mensagem } = await dados.reservarHorario(
        contexto.cliente.id,
        contexto.projeto.id,
        tarefa,
      );
      reservar.close();
      exibirAviso(mensagem);
      await contexto.atualizar();
    } catch (falha) {
      resultadoIndeterminado = Boolean(falha.indeterminado);
      erro(erroReserva, mensagemDaFalha(falha));
    } finally {
      enviando = false;
      confirmar.textContent = 'Criar evento e tarefa';
      for (const fechar of reservar.querySelectorAll('[data-equipe-fechar]'))
        fechar.disabled = false;
      if (contextoReserva === contexto) atualizarPrevia();
    }
  });
  function abrirPlanilha(contexto) {
    if (!podeGerenciar() || gravandoPlanilha) return;
    if (!contexto.projeto.implantationId) {
      exibirAviso(
        'Cadastre o ID da implantação da Experience nas configurações deste projeto antes de importar a planilha.',
        'erro',
      );
      return;
    }
    contextoPlanilha = contexto;
    previaPlanilha = null;
    // Padrão a cada abertura: grava na Agenda; Experience e Meet só se o GP marcar.
    agendaDaPlanilha.checked = true;
    experienceDaPlanilha.checked = false;
    meetDaPlanilha.checked = false;
    arquivoPlanilha.value = '';
    conteudoPlanilha.replaceChildren();
    erro(erroPlanilha);
    gravarPlanilha.disabled = true;
    planilha.showModal();
  }

  const SITUACAO_DO_LOTE = {
    gravado: ['Gravado', 'ok'],
    'ja-existia': ['Já estava na Agenda', 'ok'],
    erro: ['Erro', 'erro'],
  };

  /** "Gravar" faz só o que está marcado: Agenda de Recursos, tarefa na Experience ou os dois. */
  function atualizarBotaoDaPlanilha() {
    const total = previaPlanilha ? eventosDoLote(previaPlanilha.linhas).length : 0;
    const agenda = agendaDaPlanilha.checked;
    const experience = experienceDaPlanilha.checked;
    const semMapeamento = !contextoPlanilha?.projeto.mapeamentoExperience?.length;
    experienceDaPlanilha.disabled = gravandoPlanilha || semMapeamento;
    experienceDaPlanilha.parentElement.title = semMapeamento
      ? 'Importe os processos da Experience (botão Nova Tarefa) para lançar tarefas.'
      : '';
    agendaDaPlanilha.disabled = gravandoPlanilha;
    meetDaPlanilha.disabled = gravandoPlanilha;
    const destinos = [
      agenda && 'Agenda',
      experience && 'Experience',
      meetDaPlanilha.checked && 'Meet',
    ].filter(Boolean);
    gravarPlanilha.disabled = gravandoPlanilha || !total || !destinos.length;
    gravarPlanilha.textContent = destinos.length
      ? `Gravar ${total} · ${destinos.join(' + ')}`
      : 'Marque o que gerar';
  }
  meetDaPlanilha.addEventListener('change', atualizarBotaoDaPlanilha);
  agendaDaPlanilha.addEventListener('change', atualizarBotaoDaPlanilha);
  // A coluna do processo da Experience só aparece com a marcação.
  experienceDaPlanilha.addEventListener('change', () => desenharPrevia());

  /** Executantes possíveis: equipe com codusu + quem a planilha casou com o ERP. */
  function executantesDaPrevia(contexto) {
    const executantes = new Map();
    for (const p of contexto.equipe?.pessoas ?? [])
      if (p.codusu !== null && !p.usuarioChave) executantes.set(p.codusu, p.nomeusu);
    for (const c of previaPlanilha.consultores)
      if (c.recurso) executantes.set(c.recurso.codusu, c.recurso.nomeusu);
    for (const [codusu, nome] of previaPlanilha.buscados) executantes.set(codusu, nome);
    return executantes;
  }

  async function incluirNaEquipe(contexto, recurso, acao) {
    if (!podeGerenciar()) return;
    acao.disabled = true;
    try {
      await dados.adicionarPessoa(contexto.cliente.id, contexto.projeto.id, recurso);
      await contexto.atualizar();
      exibirAviso(`${recurso.nomeusu} adicionada à equipe.`);
      if (contexto === contextoPlanilha) desenharPrevia();
    } catch (falha) {
      erro(erroPlanilha, mensagemDaFalha(falha));
      acao.disabled = false;
    }
  }

  function desenharConsultores(contexto) {
    const pessoas = contexto.equipe?.pessoas ?? [];
    const linhas = previaPlanilha.consultores.map(({ texto, pessoa, recurso }) => {
      let situacao;
      let acao = '';
      if (!pessoa) {
        situacao = selo('cancelado', 'Não encontrado na Experience');
        const naEquipe = pessoas.some(
          (p) =>
            p.codusu === null &&
            p.nomeusu.toLocaleLowerCase('pt-BR') === texto.toLocaleLowerCase('pt-BR'),
        );
        acao = naEquipe
          ? 'Na equipe, sem correspondência'
          : botao('btn tiny', '+ Inserir na equipe sem correspondência', (evento) =>
              incluirNaEquipe(contexto, membroSemCorrespondencia(texto), evento.currentTarget),
            );
      } else if (!recurso) {
        situacao = selo('em-edicao', `${pessoa.nome} · sem usuário no ERP`);
      } else {
        situacao = selo('confirmado', `${pessoa.nome} · ${recurso.nomeusu}`);
        acao = pessoas.some((p) => p.codusu === recurso.codusu)
          ? 'Na equipe'
          : botao('btn tiny', '+ Adicionar à equipe', (evento) =>
              incluirNaEquipe(contexto, recurso, evento.currentTarget),
            );
      }
      return [texto, situacao, acao];
    });
    return tabela(
      'Consultores da planilha',
      ['Na planilha', 'Na Experience · ERP', ''],
      linhas,
      'Nenhum consultor na planilha.',
    );
  }

  /** Fases (coluna Etapa) que a planilha trouxe; as novas entram no projeto com um clique. */
  function desenharFasesDaPlanilha(contexto) {
    const bloco = el('section', 'equipe-bloco-tabela');
    bloco.append(el('h4', null, 'Fases da planilha (coluna Etapa)'));
    const todas = fasesNovas(previaPlanilha.linhas, []);
    const novas = fasesNovas(previaPlanilha.linhas, contexto.projeto.fases ?? []);
    bloco.append(
      el('p', 'texto-auxiliar', todas.length ? todas.join(' · ') : 'Nenhuma fase na planilha.'),
    );
    if (novas.length)
      bloco.append(
        botao(
          'btn tiny primario',
          `Importar ${novas.length} fase(s) nova(s) para o projeto`,
          async (evento) => {
            if (!podeGerenciar()) return;
            const acao = evento.currentTarget;
            acao.disabled = true;
            try {
              await salvarFases(contexto, [...(contexto.projeto.fases ?? []), ...novas]);
              exibirAviso(`${novas.length} fase(s) importada(s) para o projeto.`);
              contexto.redesenharAgenda();
              if (contexto === contextoPlanilha) desenharPrevia();
            } catch (falha) {
              erro(erroPlanilha, mensagemDaFalha(falha));
              acao.disabled = false;
            }
          },
        ),
      );
    else if (todas.length)
      bloco.append(el('p', 'texto-auxiliar', 'Todas as fases já estão no projeto.'));
    return bloco;
  }

  function desenharPrevia() {
    const contexto = contextoPlanilha;
    if (!contexto || !previaPlanilha) return;
    const executantes = executantesDaPrevia(contexto);
    const comExperience = experienceDaPlanilha.checked;
    const processos = processosDoMapeamento(contexto.projeto.mapeamentoExperience);
    const seletorDeProcesso = (atual, rotulo, aoEscolher) => {
      const select = el('select', 'equipe-processo-planilha');
      select.setAttribute('aria-label', rotulo);
      const vazio = el('option', null, '— processo da Experience —');
      vazio.value = '';
      select.append(
        vazio,
        ...processos.map((p) => {
          const opcao = el('option', null, p.rotulo);
          opcao.value = p.valor;
          return opcao;
        }),
      );
      select.value = atual?.valor ?? '';
      select.disabled = gravandoPlanilha;
      select.addEventListener('change', () =>
        aoEscolher(processos.find((p) => p.valor === select.value) ?? null),
      );
      return select;
    };
    const linhas = previaPlanilha.linhas.map((linha) => {
      const incluir = el('input', 'interruptor');
      incluir.type = 'checkbox';
      incluir.setAttribute('role', 'switch');
      incluir.checked = linha.incluir;
      incluir.disabled = linha.codUsu === null || gravandoPlanilha;
      incluir.setAttribute('aria-label', `Lançar a linha ${linha.linha}`);
      incluir.addEventListener('change', () => {
        linha.incluir = incluir.checked;
        atualizarBotaoDaPlanilha();
      });

      // Os executantes da prévia são as sugestões; "Buscar" acha o resto na Agenda de Recursos.
      const rotuloDe = (codusu) => `${codusu} — ${executantes.get(codusu)}`;
      const sugestoes = el('datalist');
      sugestoes.id = `equipe-executantes-${linha.linha}`;
      const sugerir = () =>
        sugestoes.replaceChildren(
          ...[...executantes.keys()].map((codusu) => {
            const opcao = el('option');
            opcao.value = rotuloDe(codusu);
            return opcao;
          }),
        );
      sugerir();
      const executante = el('input');
      executante.type = 'text';
      executante.setAttribute('list', sugestoes.id);
      executante.placeholder = '— sem executante —';
      executante.setAttribute('aria-label', `Executante da linha ${linha.linha}`);
      executante.value = linha.codUsu === null ? '' : rotuloDe(linha.codUsu);
      executante.addEventListener('focus', () => executante.select());
      executante.addEventListener('input', () => {
        const escolhido = [...executantes.keys()].find((c) => rotuloDe(c) === executante.value);
        const antes = linha.codUsu;
        linha.codUsu = escolhido ?? null;
        incluir.disabled = linha.codUsu === null;
        if (linha.codUsu === null) linha.incluir = false;
        else if (antes === null) linha.incluir = true;
        incluir.checked = linha.incluir;
        atualizarBotaoDaPlanilha();
      });
      const buscar = botao('btn tiny', 'Buscar', () =>
        abrirBusca(contexto, linha.consultor, null, (pessoa) => {
          if (contexto !== contextoPlanilha) return;
          executantes.set(pessoa.codusu, pessoa.nomeusu);
          previaPlanilha.buscados.set(pessoa.codusu, pessoa.nomeusu);
          sugerir();
          executante.value = rotuloDe(pessoa.codusu);
          executante.dispatchEvent(new Event('input'));
        }),
      );
      buscar.setAttribute('aria-label', `Buscar executante da linha ${linha.linha}`);

      const editavel = (chave, tipo, rotulo) => {
        const input = el('input');
        input.type = tipo;
        input.value = linha[chave];
        input.required = true;
        if (tipo === 'text') input.maxLength = 200;
        input.setAttribute('aria-label', `${rotulo} da linha ${linha.linha}`);
        input.addEventListener('input', () => {
          linha[chave] = input.value;
        });
        return input;
      };

      const celulaExecutante = el('div', 'equipe-executante');
      celulaExecutante.append(executante, sugestoes, buscar);

      const [rotulo, classe] = SITUACAO_DO_LOTE[linha.resultado?.situacao] ?? ['', ''];
      const resultado = el('div', 'equipe-resultado-planilha');
      if (linha.resultado)
        resultado.append(el('span', `selo-situacao ${classe}`, linha.resultado.mensagem ?? rotulo));
      if (linha.resultadoExperience)
        resultado.append(
          el(
            'span',
            `selo-situacao ${linha.resultadoExperience.situacao === 'gravado' ? 'ok' : 'erro'}`,
            linha.resultadoExperience.situacao === 'gravado'
              ? 'Tarefa lançada na Experience'
              : `Experience: ${linha.resultadoExperience.mensagem ?? 'erro'}`,
          ),
        );
      return [
        incluir,
        String(linha.linha),
        linha.etapa,
        linha.consultor,
        celulaExecutante,
        editavel('titulo', 'text', 'O quê'),
        editavel('data', 'date', 'Data'),
        editavel('horaInicio', 'time', 'Início'),
        editavel('horaFim', 'time', 'Fim'),
        ...(comExperience
          ? [
              seletorDeProcesso(
                linha.processoExperience,
                `Processo da Experience da linha ${linha.linha}`,
                (processo) => {
                  linha.processoExperience = processo;
                },
              ),
            ]
          : []),
        resultado,
      ];
    });

    const blocos = [desenharFasesDaPlanilha(contexto), desenharConsultores(contexto)];
    if (previaPlanilha.erros.length)
      blocos.push(
        tabela(
          'Linhas não lidas',
          ['Linha', 'Motivo'],
          previaPlanilha.erros.map((e) => [String(e.linha), e.motivo]),
          '',
        ),
      );
    if (comExperience) {
      // Atalho: o mesmo processo em todas as linhas marcadas; cada linha ainda pode trocar.
      const todas = el('label', 'equipe-processo-todas');
      todas.append(
        el('span', null, 'Processo da Experience para todas as linhas marcadas'),
        seletorDeProcesso(null, 'Processo da Experience para todas as linhas', (processo) => {
          for (const linha of previaPlanilha.linhas)
            if (linha.incluir) linha.processoExperience = processo;
          desenharPrevia();
        }),
      );
      blocos.push(todas);
    }
    blocos.push(
      tabela(
        'O que será lançado',
        [
          '',
          'Linha',
          'Fase',
          'Consultor',
          'Executante',
          'O quê',
          'Data',
          'Início',
          'Fim',
          ...(comExperience ? ['Processo na Experience'] : []),
          'Resultado',
        ],
        linhas,
        'Nenhuma linha válida na planilha.',
      ),
      el(
        'p',
        'texto-auxiliar',
        'Gravar faz só o que está marcado no rodapé. Na Agenda, evento deste cliente já no horário é reaproveitado e horário ocupado por outro agendamento é recusado. A tarefa da Experience só é lançada sobre agenda já criada: só com "Gerar tarefa na Experience" marcado, se alguma linha não tiver agenda nada é gravado.',
      ),
    );
    conteudoPlanilha.replaceChildren(...blocos);
    atualizarBotaoDaPlanilha();
  }

  arquivoPlanilha.addEventListener('change', async () => {
    const contexto = contextoPlanilha;
    const arquivo = arquivoPlanilha.files?.[0];
    if (!contexto || !arquivo) return;
    previaPlanilha = null;
    atualizarBotaoDaPlanilha();
    erro(erroPlanilha);
    conteudoPlanilha.replaceChildren(
      el('p', 'texto-auxiliar', 'Lendo a planilha e comparando com a Experience…'),
    );
    try {
      const resposta = await dados.previaDaPlanilha(
        contexto.cliente.id,
        contexto.projeto.id,
        paraBase64(await arquivo.arrayBuffer()),
      );
      if (contexto !== contextoPlanilha) return;
      previaPlanilha = {
        ...resposta,
        linhas: linhasDaPrevia(resposta, contexto.cliente.nome),
        buscados: new Map(),
      };
      // A agenda da equipe mostra o planejado de cada fase até outra importação ou "Ocultar".
      contexto.planejado = previaPlanilha.linhas;
      contexto.redesenharAgenda();
      desenharPrevia();
    } catch (falha) {
      if (contexto !== contextoPlanilha) return;
      conteudoPlanilha.replaceChildren();
      erro(erroPlanilha, mensagemDaFalha(falha));
    }
  });

  gravarPlanilha.addEventListener('click', async () => {
    const contexto = contextoPlanilha;
    if (!contexto || !previaPlanilha || gravandoPlanilha || !podeGerenciar()) return;
    const agenda = agendaDaPlanilha.checked;
    const experience = experienceDaPlanilha.checked;
    const comMeet = meetDaPlanilha.checked;
    if (!agenda && !experience && !comMeet) return;
    const enviadas = previaPlanilha.linhas.filter((l) => eventosDoLote([l]).length);
    if (!enviadas.length) return;
    if (experience) {
      const semProcesso = enviadas.filter((l) => !l.processoExperience);
      if (semProcesso.length) {
        erro(
          erroPlanilha,
          `Escolha o processo da Experience nas linhas ${semProcesso.map((l) => l.linha).join(', ')}.`,
        );
        return;
      }
    }
    gravandoPlanilha = true;
    erro(erroPlanilha);
    for (const linha of enviadas) {
      linha.resultado = null;
      linha.resultadoExperience = null;
    }
    atualizarBotaoDaPlanilha();
    gravarPlanilha.textContent = 'Gravando…';
    for (const fechar of planilha.querySelectorAll('[data-equipe-fechar]')) fechar.disabled = true;
    const partes = [];
    let falhou = false;
    try {
      let paraExperience = enviadas;
      let gravados = 0;
      if (agenda) {
        const { resultados } = await dados.lancarNaAgenda(
          contexto.cliente.id,
          contexto.projeto.id,
          eventosDoLote(enviadas),
        );
        enviadas.forEach((linha, i) => {
          linha.resultado = resultados[i];
        });
        gravados = resultados.filter((r) => r.situacao === 'gravado').length;
        const falhas = resultados.filter((r) => r.situacao === 'erro').length;
        falhou ||= falhas > 0;
        partes.push(
          `${gravados} evento(s) gravado(s) na Agenda${falhas ? `, ${falhas} com erro` : ''}`,
        );
        // A tarefa vai só sobre a agenda que existe: linha com erro na Agenda fica de fora.
        paraExperience = enviadas.filter((_, i) => resultados[i]?.situacao !== 'erro');
      }
      if (experience && paraExperience.length) {
        gravarPlanilha.textContent = 'Lançando tarefas na Experience…';
        try {
          const { resultados } = await dados.lancarNaExperience(
            contexto.cliente.id,
            contexto.projeto.id,
            tarefasDoLote(paraExperience),
          );
          paraExperience.forEach((linha, i) => {
            linha.resultadoExperience = resultados[i];
          });
          const erros = resultados.filter((r) => r.situacao === 'erro').length;
          falhou ||= erros > 0;
          partes.push(
            `${resultados.length - erros} tarefa(s) lançada(s) na Experience${erros ? `, ${erros} com erro` : ''}`,
          );
        } catch (falha) {
          // Lote recusado inteiro (ex.: linha sem agenda): nada gravado, motivo em cada linha.
          for (const { indice, motivo } of falha.pendencias ?? [])
            if (paraExperience[indice])
              paraExperience[indice].resultadoExperience = { situacao: 'erro', mensagem: motivo };
          falhou = true;
          partes.push(mensagemDaFalha(falha));
          erro(erroPlanilha, mensagemDaFalha(falha));
        }
      }
      // Com a Agenda, Meet só das linhas gravadas agora ("já estava na Agenda" pode já ter o
      // Meet); sem ela, de todas as linhas marcadas.
      const doMeet = agenda
        ? enviadas.filter((linha) => linha.resultado?.situacao === 'gravado')
        : enviadas;
      if (comMeet && doMeet.length) {
        gravarPlanilha.textContent = 'Salvando Meet no Google…';
        const nomes = executantesDaPrevia(contexto);
        const meets = meetsDoLote(doMeet, (codusu) => nomes.get(codusu)).map((m) => ({
          ...m,
          logins: m.convidados.map((c) => c.nome),
        }));
        const meet = await salvarMeets(contexto, meets);
        falhou ||= meet.falhou;
        partes.push(meet.texto);
      }
      // Pronta em tudo o que foi pedido sai da seleção; reenviar não duplica, mas não precisa.
      for (const linha of enviadas)
        if (
          (!agenda || linha.resultado?.situacao !== 'erro') &&
          (!experience || linha.resultadoExperience?.situacao === 'gravado')
        )
          linha.incluir = false;
      exibirAviso(`${partes.join('; ')}.`, falhou ? 'erro' : undefined);
      void contexto.atualizar();
    } catch (falha) {
      erro(erroPlanilha, mensagemDaFalha(falha));
    } finally {
      gravandoPlanilha = false;
      for (const fechar of planilha.querySelectorAll('[data-equipe-fechar]'))
        fechar.disabled = false;
      if (contexto === contextoPlanilha) desenharPrevia();
    }
  });
  planilha.addEventListener('cancel', (evento) => {
    if (gravandoPlanilha) evento.preventDefault();
  });
  planilha.addEventListener('close', () => {
    contextoPlanilha = null;
    previaPlanilha = null;
  });

  busca.addEventListener('input', () => {
    clearTimeout(temporizadorBusca);
    versaoBusca++;
    temporizadorBusca = setTimeout(atualizarBusca, 400);
  });
  document.getElementById('equipe-repetir-busca').addEventListener('click', () => {
    clearTimeout(temporizadorBusca);
    void atualizarBusca();
  });
  adicionar.addEventListener('close', () => {
    contextoBusca = null;
    substituirNaBusca = null;
    escolherNaBusca = null;
    clearTimeout(temporizadorBusca);
    versaoBusca++;
  });
  reservar.addEventListener('close', () => {
    contextoReserva = null;
  });
  function abrirCronograma(contexto) {
    const { para, sugestoes } = destinatariosDoCronograma(
      contexto.equipe.pessoasExperience,
      contexto.equipe.pessoas,
    );
    estadoCronograma = {
      contexto,
      equipe: contexto.equipe,
      periodo: { ...contexto.periodo },
      para: new Set(para),
      fases: null,
      codusus: null,
      assuntoEditado: false,
      versao: 0,
      enviando: false,
    };
    noCronograma('de').value = estadoCronograma.periodo.de;
    noCronograma('ate').value = estadoCronograma.periodo.ate;
    noCronograma('para-input').value = '';
    noCronograma('sugestoes').replaceChildren(
      ...sugestoes.map((pessoa) => {
        const opcao = el('option');
        opcao.value = pessoa.email;
        opcao.label = pessoa.nome;
        return opcao;
      }),
    );
    erro(noCronograma('erro'));
    desenharCronograma();
    cronograma.showModal();
  }

  /** Marcadores de fase/pessoa: `null` no estado = todos marcados (primeira abertura). */
  function marcadores(alvo, opcoes, marcados, aoMudar) {
    alvo.replaceChildren(
      ...(opcoes.length
        ? opcoes.map(([valor, rotulo]) => {
            const item = el('label', 'equipe-fase cronograma-opcao');
            const caixa = el('input');
            caixa.type = 'checkbox';
            caixa.checked = marcados.has(valor);
            caixa.addEventListener('change', () => {
              if (caixa.checked) marcados.add(valor);
              else marcados.delete(valor);
              aoMudar();
            });
            item.append(caixa, el('span', null, rotulo));
            return item;
          })
        : [el('span', 'texto-auxiliar', 'Nenhuma reserva deste cliente no período.')]),
    );
  }

  function desenharCronograma() {
    const estado = estadoCronograma;
    const { contexto, equipe, periodo } = estado;
    const linhas = linhasDoCronograma({
      eventos: equipe.eventos ?? [],
      cliente: contexto.cliente.nome,
      meets: equipe.meets,
      pessoasExperience: equipe.pessoasExperience,
    }).filter((linha) => linha.data >= periodo.de && linha.data <= periodo.ate);
    const fases = [...new Set(linhas.map((linha) => linha.fase))];
    estado.fases ??= new Set(fases);
    marcadores(
      noCronograma('fases'),
      fases.map((fase) => [fase, fase]),
      estado.fases,
      desenharCronograma,
    );
    const pessoas = new Map();
    for (const linha of linhas.filter((l) => estado.fases.has(l.fase)))
      linha.codusus.forEach((codusu, i) => pessoas.set(codusu, linha.participantes[i]));
    estado.codusus ??= new Set(pessoas.keys());
    marcadores(noCronograma('pessoas'), [...pessoas], estado.codusus, desenharCronograma);

    const entrada = noCronograma('para-input');
    noCronograma('para').replaceChildren(
      ...[...estado.para].map((email) => {
        const chip = el('span', 'equipe-fase cronograma-chip', email);
        const remover = el('button', 'btn tiny ghost', '×');
        remover.type = 'button';
        remover.setAttribute('aria-label', `Remover ${email}`);
        remover.addEventListener('click', () => {
          estado.para.delete(email);
          desenharCronograma();
        });
        chip.append(remover);
        return chip;
      }),
      entrada,
    );
    if (!estado.assuntoEditado) noCronograma('assunto').value = assuntoDoCronograma(periodo);

    estado.selecionadas = filtrarCronograma(linhas, estado);
    const previaDoEmail = noCronograma('previa');
    // A tabela vem de htmlDoCronograma, que escapa todo texto vindo da Agenda.
    if (estado.selecionadas.length) previaDoEmail.innerHTML = htmlDoCronograma(estado.selecionadas);
    else
      previaDoEmail.replaceChildren(
        el('p', 'texto-auxiliar', 'Nenhum meet com as fases e pessoas marcadas.'),
      );
    noCronograma('enviar').disabled =
      estado.enviando || !estado.para.size || !estado.selecionadas.length;
  }

  function incluirEmailDigitado() {
    const entrada = noCronograma('para-input');
    const emails = entrada.value.split(/[\s,;]+/).filter(Boolean);
    if (!emails.length || !estadoCronograma) return;
    const invalidos = emails.filter((email) => !emailValido(email));
    for (const email of emails.filter(emailValido)) estadoCronograma.para.add(email.toLowerCase());
    entrada.value = invalidos.join(', ');
    erro(noCronograma('erro'), invalidos.length ? `E-mail inválido: ${invalidos.join(', ')}` : '');
    desenharCronograma();
    entrada.focus();
  }

  noCronograma('para-input').addEventListener('keydown', (evento) => {
    if (!['Enter', ',', ';'].includes(evento.key)) return;
    evento.preventDefault();
    incluirEmailDigitado();
  });
  // Escolher na lista de sugestões (datalist) só dispara `change`.
  noCronograma('para-input').addEventListener('change', incluirEmailDigitado);
  noCronograma('assunto').addEventListener('input', () => {
    if (estadoCronograma) estadoCronograma.assuntoEditado = true;
  });
  for (const id of ['de', 'ate'])
    noCronograma(id).addEventListener('change', async () => {
      const estado = estadoCronograma;
      const de = noCronograma('de').value;
      const ate = noCronograma('ate').value;
      if (!estado) return;
      if (!de || !ate || de > ate) {
        erro(noCronograma('erro'), 'Informe o período com o fim igual ou depois do início.');
        return;
      }
      erro(noCronograma('erro'));
      estado.periodo = { de, ate };
      const versao = ++estado.versao;
      noCronograma('previa').replaceChildren(el('p', 'texto-auxiliar', 'Consultando a Agenda…'));
      try {
        const equipe = await dados.lerEquipe(
          estado.contexto.cliente.id,
          estado.contexto.projeto.id,
          estado.periodo,
        );
        if (versao !== estado.versao || estado !== estadoCronograma) return;
        Object.assign(estado, { equipe, fases: null, codusus: null });
        desenharCronograma();
      } catch (falha) {
        if (versao === estado.versao) erro(noCronograma('erro'), mensagemDaFalha(falha));
      }
    });
  noCronograma('enviar').addEventListener('click', async () => {
    const estado = estadoCronograma;
    if (!estado || estado.enviando) return;
    estado.enviando = true;
    desenharCronograma();
    const { cliente, projeto } = estado.contexto;
    try {
      const { destinatarios } = await dados.enviarCronograma(cliente.id, projeto.id, {
        para: [...estado.para],
        assunto: noCronograma('assunto').value,
        html: htmlDoCronograma(estado.selecionadas),
        texto: textoDoCronograma(estado.selecionadas),
      });
      exibirAviso(`Cronograma enviado para ${destinatarios.length} e-mail(s).`);
      cronograma.close();
    } catch (falha) {
      erro(noCronograma('erro'), falha.message);
    } finally {
      estado.enviando = false;
      if (estado === estadoCronograma && cronograma.open) desenharCronograma();
    }
  });
  cronograma.addEventListener('close', () => {
    estadoCronograma = null;
  });

  dialogoDia.addEventListener('close', () => {
    const estado = estadoDia;
    estadoDia = null;
    if (estado?.alterou) void estado.contexto.atualizar();
  });

  for (const modal of [adicionar, reservar, planilha, cronograma, dialogoDia]) {
    for (const fechar of modal.querySelectorAll('[data-equipe-fechar]'))
      fechar.addEventListener('click', () => modal.close());
  }

  return {
    selecionarEquipe(clienteId, projetoId) {
      if (podeGerenciar()) abasAtivas.set(JSON.stringify([clienteId, projetoId]), 1);
    },
    aplicarAcessos() {
      if (!podeGerenciar()) {
        adicionar.close();
        reservar.close();
        planilha.close();
        cronograma.close();
        dialogoDia.close();
      }
    },
    criarAbasDoProjeto(cliente, projeto, geral) {
      const chave = JSON.stringify([cliente.id, projeto.id]);
      const id = `equipe-projeto-${++sequencia}`;
      const conjunto = el('div', 'equipe-abas-container');
      const barra = el('div', 'abas-modal equipe-abas');
      barra.setAttribute('role', 'tablist');
      barra.setAttribute('aria-label', `Seções de ${projeto.nome}`);
      const paineis = [el('div', 'painel-aba'), el('div', 'painel-aba')];
      paineis[0].append(geral);
      // Clicar na aba já montada consulta de novo; re-renderizar a tela só reaproveita.
      const selecionar = (indice, porClique = false) => {
        if (!podeGerenciar() && indice === 1) return;
        const anterior = abasAtivas.get(chave);
        abasAtivas.set(chave, indice);
        if (indice === 1 && !paineis[1].hasChildNodes()) {
          const existente = secoes.get(chave);
          if (existente) {
            Object.assign(existente, { cliente, projeto });
            if (porClique) void existente.atualizar();
          } else secoes.set(chave, criarSecaoDoProjeto(cliente, projeto));
          paineis[1].append(secoes.get(chave).secao);
        } else if (indice === 1 && porClique && anterior !== 1) {
          void secoes.get(chave)?.atualizar();
        }
        [...barra.children].forEach((aba, i) => {
          aba.classList.toggle('ativa', i === indice);
          aba.setAttribute('aria-selected', String(i === indice));
          aba.tabIndex = i === indice ? 0 : -1;
          paineis[i].hidden = i !== indice;
        });
      };
      ['Visão geral', 'Equipe do Projeto'].forEach((rotulo, i) => {
        const aba = botao('aba', rotulo, () => selecionar(i, true));
        aba.id = `${id}-aba-${i}`;
        aba.setAttribute('role', 'tab');
        aba.setAttribute('aria-controls', `${id}-painel-${i}`);
        paineis[i].id = `${id}-painel-${i}`;
        paineis[i].setAttribute('role', 'tabpanel');
        paineis[i].setAttribute('aria-labelledby', aba.id);
        barra.append(aba);
      });
      barra.addEventListener('keydown', (evento) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(evento.key)) return;
        evento.preventDefault();
        const indice =
          evento.key === 'Home' ? 0 : evento.key === 'End' ? 1 : 1 - (abasAtivas.get(chave) ?? 0);
        selecionar(indice, true);
        barra.children[indice].focus();
      });
      selecionar(abasAtivas.get(chave) ?? 0);
      conjunto.append(barra, ...paineis);
      return conjunto;
    },
  };
}
