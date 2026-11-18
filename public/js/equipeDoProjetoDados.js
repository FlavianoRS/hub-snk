const inteiroPositivo = (valor) => Number.isSafeInteger(valor) && valor > 0;
const normalizar = (texto) => (texto ?? '').trim().toLocaleLowerCase('pt-BR');
const semAcento = (texto) =>
  normalizar(texto).normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');

export function periodoAtualDaEquipe(hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const data = (dia) =>
    `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { de: data(1), ate: data(new Date(ano, mes + 1, 0).getDate()) };
}

/** Fatia `{ de, ate }` em meses (`YYYY-MM-DD`), cada um recortado aos limites do período. */
export function mesesDoPeriodo({ de, ate }) {
  const meses = [];
  for (let [ano, mes] = de.split('-').map(Number); ; mes === 12 ? (ano++, (mes = 1)) : mes++) {
    const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
    if (prefixo > ate.slice(0, 7)) return meses;
    const ultimo = `${prefixo}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
    meses.push({
      de: `${prefixo}-01` < de ? de : `${prefixo}-01`,
      ate: ultimo > ate ? ate : ultimo,
    });
  }
}

export function resumirOs(ordens) {
  return {
    horas: ordens.reduce((total, os) => total + os.horas, 0),
    abertas: ordens.filter((os) => os.status === 'aberta').length,
    concluidas: ordens.filter((os) => os.status === 'concluida').length,
  };
}

export function traduzirOs(ordem) {
  const partes = /^(\d+):([0-5]\d)$/.exec(ordem.horasFeitas?.trim() ?? '');
  const status = normalizar(ordem.statusAceite);
  return {
    id: ordem.id,
    codusu: ordem.codusuResolvido,
    pessoa: ordem.pessoa,
    dia: ordem.dia,
    horas: partes ? Number(partes[1]) + Number(partes[2]) / 60 : 0,
    status:
      status === 'concluído' ? 'concluida' : status.includes('rejeit') ? 'rejeitada' : 'aberta',
    statusOriginal: ordem.statusAceite || 'Sem status',
  };
}

// Sem identidade confirmada, mantém apenas dia e demanda, como nos eventos de outro GP.
function traduzirEvento(evento, usuario) {
  const proprio =
    Boolean(normalizar(usuario)) && normalizar(evento.usulancador) === normalizar(usuario);
  const base = {
    codusu: evento.codusu,
    inicio: proprio ? evento.inicio : evento.inicio.slice(0, 10),
    oque: evento.descrabrev || evento.descrlonga || '(sem demanda)',
    proprio,
    // Parceiro ou título casam com o cliente (backend): o filtro da agenda separa os outros.
    doCliente: Boolean(evento.doCliente),
  };
  return proprio
    ? {
        ...base,
        fim: evento.fim,
        diaTodo: evento.allday === 'S',
        status: evento.confirmado === 'S' ? 'confirmado' : 'em-edicao',
      }
    : base;
}

export function pendenciasDaNovaTarefa(projeto) {
  const pendencias = [];
  if (!inteiroPositivo(projeto.implantationId))
    pendencias.push(
      'Cadastre o ID da implantação da Experience nas configurações deste projeto antes de lançar.',
    );
  if (!projeto.mapeamentoExperience?.length)
    pendencias.push(
      'Este projeto não tem mapeamento de processos cadastrado. Cadastre o mapeamento Etapa/Procedimento antes de lançar.',
    );
  return pendencias.join(' ');
}

/**
 * Mapeamento ("Etapa › Módulo › Atividade › Procedimento") → árvore da tela Etapas da
 * Experience: Etapa → módulos (cards) → atividades (agrupadores) → procedimentos. Rótulo sem
 * atividade (importação até 12/11) fica com atividade "" (opções soltas no módulo); sem
 * módulo, cai em "Procedimentos".
 */
export function arvoreDoMapeamento(mapeamento) {
  const etapas = new Map();
  for (const m of mapeamento) {
    const partes = m.processo.split(' › ');
    if (!etapas.has(m.stageId))
      etapas.set(m.stageId, { stageId: m.stageId, etapa: partes[0], modulos: new Map() });
    const modulos = etapas.get(m.stageId).modulos;
    const modulo = partes.length > 2 ? partes[1] : 'Procedimentos';
    const atividade = partes.slice(2, -1).join(' › ');
    if (!modulos.has(modulo)) modulos.set(modulo, { nome: modulo, atividades: new Map() });
    const atividades = modulos.get(modulo).atividades;
    if (!atividades.has(atividade))
      atividades.set(atividade, { nome: atividade, procedimentos: [] });
    atividades.get(atividade).procedimentos.push({ nome: partes.at(-1), ids: m.procedureIds });
  }
  return [...etapas.values()].map((e) => ({
    ...e,
    modulos: [...e.modulos.values()].map((m) => ({ ...m, atividades: [...m.atividades.values()] })),
  }));
}

const mesmoNome = (a, b) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

/** Fases do Reservar: Etapas importadas da Experience primeiro, depois as fases criadas à mão. */
export function fasesDaReserva(projeto) {
  const etapas = arvoreDoMapeamento(projeto.mapeamentoExperience ?? []).map((e) => e.etapa);
  const manuais = (projeto.fases ?? []).filter((f) => !etapas.some((e) => mesmoNome(e, f)));
  return [...etapas, ...manuais];
}

/** Módulos da Etapa da Experience com o nome da fase; fase criada à mão não tem módulos. */
export function modulosDaFase(projeto, fase) {
  const etapa = arvoreDoMapeamento(projeto.mapeamentoExperience ?? []).find(
    (e) => fase && mesmoNome(e.etapa, fase),
  );
  return etapa ? etapa.modulos.map((m) => m.nome) : [];
}

export function validarNovaTarefa(tarefa, projeto) {
  const pendencias = pendenciasDaNovaTarefa(projeto);
  if (pendencias) return pendencias;
  if (tarefa.implantationId !== projeto.implantationId)
    return 'A implantação deve ser a cadastrada no projeto.';
  if (!inteiroPositivo(tarefa.stageId) || !tarefa.procedureIds?.length)
    return 'Escolha a Etapa e marque ao menos um módulo ou procedimento.';
  const daEtapa = new Set(
    projeto.mapeamentoExperience
      .filter((m) => m.stageId === tarefa.stageId)
      .flatMap((m) => m.procedureIds),
  );
  if (!tarefa.procedureIds.every((id) => daEtapa.has(id)))
    return 'Marque procedimentos mapeados nesta Etapa.';
  if (!tarefa.titulo?.trim() || tarefa.titulo.length > LIMITE_DO_TITULO)
    return `Informe um título com até ${LIMITE_DO_TITULO} caracteres.`;
  if (!inteiroPositivo(tarefa.codUsu)) return 'Selecione um executante.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarefa.data)) return 'Informe uma data válida.';
  const data = new Date(`${tarefa.data}T12:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== tarefa.data)
    return 'Informe uma data válida.';
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hora.test(tarefa.horaInicio) || !hora.test(tarefa.horaFim))
    return 'Informe horários válidos.';
  if (tarefa.horaFim <= tarefa.horaInicio)
    return 'O fim deve ser posterior ao início, no mesmo dia.';
  if (!inteiroPositivo(tarefa.personId))
    return 'Informe o ID do usuário da Experience (inteiro positivo).';
  if (!inteiroPositivo(tarefa.applicationId))
    return 'Informe o ID do pedido da Experience (inteiro positivo).';
  if ((tarefa.observacao ?? '').length > 500) return 'Observação com até 500 caracteres.';
  return null;
}

/** Limite do "O quê" (`TCSEAG.DESCRABREV`, VARCHAR2(400)). */
export const LIMITE_DO_TITULO = 400;

/** Módulos escolhidos, como vão na "Descrição completa": `Compras / Vendas / Pagamentos`. */
export const textoDosModulos = (modulos = []) =>
  modulos
    .map((m) => m.trim())
    .filter(Boolean)
    .join(' / ');

/**
 * Título da reserva na Agenda: `<Cliente> - <Fase> : <Módulos> | <Observação>` (pedido da GP em
 * 17/11); sem módulo, sem ` : `; sem observação, sem `|`.
 */
export function tituloDaReserva(cliente, fase, observacao = '', modulos = []) {
  const obs = observacao.trim();
  const texto = textoDosModulos(modulos);
  return `${cliente.trim()} - ${fase.trim()}${texto ? ` : ${texto}` : ''}${obs ? ` | ${obs}` : ''}`.slice(
    0,
    LIMITE_DO_TITULO,
  );
}

/** Fases da planilha (coluna Etapa) que o projeto ainda não tem, na ordem em que aparecem. */
export function fasesNovas(linhas, fasesDoProjeto) {
  const vistas = new Set(fasesDoProjeto.map(semAcento));
  const novas = [];
  for (const { etapa } of linhas) {
    const chave = semAcento(etapa);
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    novas.push(etapa.trim());
  }
  return novas;
}

/** Reserva de vários dias na Agenda: um evento por dia × executante, já no formato do lote. */
export function eventosDaReserva({ dias, codusus, horaInicio, horaFim, titulo, descricao = '' }) {
  return [...dias].sort().flatMap((data) =>
    [...new Set(codusus)].map((codUsu) => ({
      titulo,
      descricao,
      data,
      horaInicio,
      horaFim,
      codUsu,
    })),
  );
}

/**
 * Linhas editáveis da prévia da planilha. "O quê" começa como `<Cliente> - <Etapa> | <Processo>`
 * (só o Processo sem cliente); a linha cujo consultor não tem executante no ERP fica bloqueada
 * (`codUsu` nulo) até o GP escolher um.
 */
export function linhasDaPrevia({ linhas, consultores }, cliente = '') {
  const porTexto = new Map(consultores.map((c) => [c.texto, c]));
  return linhas.map((linha) => {
    const codUsu = porTexto.get(linha.consultorTexto)?.recurso?.codusu ?? null;
    return {
      linha: linha.linha,
      etapa: linha.etapa,
      consultor: linha.consultorTexto,
      titulo: cliente ? tituloDaReserva(cliente, linha.etapa, linha.processo) : linha.processo,
      data: linha.data,
      horaInicio: linha.horaInicio,
      horaFim: linha.horaFim,
      codUsu,
      incluir: codUsu !== null,
    };
  });
}

/** O que vai para `agenda/lote`: só as linhas marcadas e com executante. */
export function eventosDoLote(linhas) {
  return linhas
    .filter((linha) => linha.incluir && inteiroPositivo(linha.codUsu))
    .map(({ titulo, data, horaInicio, horaFim, codUsu }) => ({
      titulo: titulo.trim(),
      data,
      horaInicio,
      horaFim,
      codUsu,
    }));
}

/**
 * Processos que a planilha oferece por linha: um por Etapa › Módulo do mapeamento, com todos
 * os procedimentos do módulo (como marcar o módulo inteiro na Nova Tarefa).
 */
export function processosDoMapeamento(mapeamento) {
  return arvoreDoMapeamento(mapeamento ?? []).flatMap((etapa) =>
    etapa.modulos.map((modulo) => ({
      valor: `${etapa.stageId}:${modulo.nome}`,
      rotulo: `${etapa.etapa} › ${modulo.nome}`,
      stageId: etapa.stageId,
      procedureIds: [
        ...new Set(modulo.atividades.flatMap((a) => a.procedimentos.flatMap((p) => p.ids))),
      ],
    })),
  );
}

/** Linhas marcadas da planilha → tarefas da Experience (o processo escolhido em cada uma). */
export function tarefasDoLote(linhas) {
  return linhas
    .filter((linha) => linha.incluir && inteiroPositivo(linha.codUsu))
    .map(({ titulo, data, horaInicio, horaFim, codUsu, processoExperience }) => ({
      codUsu,
      titulo: titulo.trim(),
      data,
      horaInicio,
      horaFim,
      stageId: processoExperience?.stageId ?? 0,
      procedureIds: processoExperience?.procedureIds ?? [],
    }));
}

/**
 * Meets da planilha: um por dia + horário + "O quê", com os executantes dessas linhas
 * convidados (o link do Google cria um evento só). `nomeDe(codusu)` = login do ERP.
 */
export function meetsDoLote(linhas, nomeDe) {
  const meets = new Map();
  for (const linha of linhas) {
    if (!inteiroPositivo(linha.codUsu)) continue;
    const titulo = linha.titulo.trim();
    const chave = [linha.data, linha.horaInicio, linha.horaFim, titulo].join('|');
    if (!meets.has(chave))
      meets.set(chave, {
        data: linha.data,
        inicio: linha.horaInicio,
        fim: linha.horaFim,
        titulo,
        ...(linha.etapa ? { fase: linha.etapa } : {}),
        convidados: [],
      });
    const convidados = meets.get(chave).convidados;
    const nome = nomeDe(linha.codUsu);
    if (nome && !convidados.some((c) => c.codusu === linha.codUsu))
      convidados.push({ codusu: linha.codUsu, nome });
  }
  return [...meets.values()];
}

/** Quem a planilha cita e a Experience não conhece: entra na equipe só com o nome. */
export function membroSemCorrespondencia(nome) {
  return {
    codusu: null,
    nomeusu: nome.trim(),
    codcargo: null,
    descrcargo: 'Sem correspondência na Experience',
    corHex: '',
    corConflitoHex: '',
    problemaConexao: '',
  };
}

/**
 * Evento novo do Google Agenda já preenchido (Fase 2, opção 1): o GP confere e salva no
 * próprio Google. Sem credencial no Hub. E-mail = login do ERP + domínio, a mesma regra de
 * `loginDoEmail` no backend; item com `@` já é o e-mail (usuário chave do cliente). `vcon=meet` gera o Meet (confirmado ao vivo em 2026-10-29).
 * Sem `horario` ({ data, inicio, fim } dos inputs date/time) o Google abre no próximo
 * horário cheio de hoje; `dates` sem `Z` é lido no fuso da agenda de quem abre.
 */
export function enderecoDoMeet(titulo, logins, horario = null) {
  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    add: logins
      .map((login) => login.toLowerCase())
      .map((login) => (login.includes('@') ? login : `${login}@sankhya.com.br`))
      .join(','),
    vcon: 'meet',
  });
  if (horario) {
    const momento = (hora) => `${horario.data.replaceAll('-', '')}T${hora.replace(':', '')}00`;
    parametros.set('dates', `${momento(horario.inicio)}/${momento(horario.fim)}`);
  }
  return `https://calendar.google.com/calendar/render?${parametros}`;
}

/**
 * Pessoa da Experience escolhida como usuário chave: entra na equipe sem codusu, com o
 * e-mail (o da Experience ou o informado pelo GP) para receber o convite do Meet.
 */
export function membroUsuarioChave(pessoa) {
  return {
    ...membroSemCorrespondencia(pessoa.nome),
    descrcargo: pessoa.papel || 'Usuário chave',
    usuarioChave: true,
    personId: pessoa.personId,
    email: (pessoa.email ?? '').trim().toLowerCase(),
  };
}

/** Chave da seleção nos cards: `codusu`, ou o nome de quem não tem (usuário chave). */
export const chaveDaPessoa = (p) => p.codusu ?? `nome:${p.nomeusu}`;

/** Quem recebe o convite do Meet: login do ERP ou, sem codusu, o e-mail. `null` = ninguém. */
export const conviteDoMeet = (p) =>
  p.codusu !== null ? p.nomeusu : emailValido(p.email ?? '') ? p.email : null;

/**
 * Membro da equipe que é esta pessoa da Experience: pelo `person_id`, pelo login do e-mail
 * corporativo (`nome.sobrenome` = `nomeusu` do ERP) ou, sem codusu, pelo nome.
 */
export function membroDaPessoa(membros, pessoa) {
  const login = loginDoEmail(pessoa.email);
  return (
    membros.find((m) => m.personId === pessoa.personId) ??
    membros.find(
      (m) =>
        (login && m.codusu !== null && m.nomeusu.toLowerCase() === login) ||
        (m.codusu === null && semAcento(m.nomeusu) === semAcento(pessoa.nome)),
    ) ??
    null
  );
}

/**
 * Uma lista só de quem importa no projeto: usuários da Experience + quem tem OS (o nome da OS
 * vem da mesma Experience, então casa por nome sem acento). Cada linha traz o membro da
 * equipe correspondente, se houver, e as OS do período.
 */
export function pessoasDoProjeto({ pessoas: membros, pessoasExperience, os }) {
  const ordensDe = (nome) => os.filter((ordem) => semAcento(ordem.pessoa) === semAcento(nome));
  const linhas = pessoasExperience.map((pessoa) => ({
    pessoa,
    membro: membroDaPessoa(membros, pessoa),
    ordens: ordensDe(pessoa.nome),
  }));
  const conhecidos = new Set(pessoasExperience.map((p) => semAcento(p.nome)));
  for (const nome of new Set(os.map((ordem) => ordem.pessoa?.trim()).filter(Boolean))) {
    if (conhecidos.has(semAcento(nome))) continue;
    conhecidos.add(semAcento(nome));
    const pessoa = { personId: null, nome, email: '', papel: 'Só nas OS do período' };
    linhas.push({ pessoa, membro: membroDaPessoa(membros, pessoa), ordens: ordensDe(nome) });
  }
  return linhas.sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
}

/** Login do ERP (`nome.sobrenome`) a partir do e-mail corporativo; cliente não tem. */
export function loginDoEmail(email) {
  return /^([\w.-]+)@sankhya\.com\.br$/i.exec(email ?? '')?.[1]?.toLowerCase() ?? null;
}

const escaparHtml = (texto) =>
  String(texto).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const dataBr = (iso) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Cronograma do cliente: reservas no formato do Hub (`<Cliente> - <Fase> | <Obs>`) ou que o
 * backend marcou `doCliente` (parceiro/título do cliente; essas ficam "Sem fase"). Evento de
 * outro cliente na agenda da mesma pessoa não pode ir para este. Mesmo horário e
 * título em pessoas diferentes = um meet só, com todos os participantes. O link do Meet vem
 * de `meets` gravados pelo Hub, casando data+início+fim.
 */
/** Reserva do cliente lançada fora do formato `<Cliente> - <Fase>` do Hub. */
export const SEM_FASE = 'Sem fase';

export function linhasDoCronograma({ eventos, cliente, meets = [], pessoasExperience = [] }) {
  const prefixo = `${semAcento(cliente)} - `;
  const nomeDoLogin = new Map(
    pessoasExperience.map((p) => [loginDoEmail(p.email), p.nome]).filter(([login]) => login),
  );
  const faseEAssunto = (titulo) => {
    if (!semAcento(titulo).startsWith(prefixo)) return null;
    const [faseEModulos, ...resto] = titulo.slice(cliente.trim().length + 3).split(' | ');
    // `<Fase> : <Módulos>` (desde 17/11): os módulos vão para o assunto, a fase fica limpa.
    const [fase, ...modulos] = faseEModulos.split(' : ');
    const assunto = [modulos.join(' : '), resto.join(' | ')]
      .map((parte) => parte.trim())
      .filter(Boolean)
      .join(' | ');
    return { fase: fase.trim(), assunto };
  };
  const incluir = (linha, codusu, nomeusu) => {
    if (codusu === null || linha.codusus.includes(codusu)) return;
    linha.codusus.push(codusu);
    linha.participantes.push(nomeDoLogin.get(normalizar(nomeusu)) ?? nomeusu);
  };
  const linhas = new Map();
  for (const evento of eventos) {
    const titulo = (evento.descrabrev || evento.descrlonga || '').trim();
    const doHub = faseEAssunto(titulo);
    // `doCliente` vem do backend (parceiro ou título casam com o cliente).
    if (!doHub && !evento.doCliente) continue;
    const chave = `${evento.inicio}|${evento.fim}|${semAcento(titulo)}`;
    const linha = linhas.get(chave) ?? {
      data: evento.inicio.slice(0, 10),
      inicio: evento.inicio.slice(11, 16),
      fim: evento.fim.slice(11, 16),
      ...(doHub ?? { fase: SEM_FASE, assunto: titulo }),
      participantes: [],
      codusus: [],
      meet: null,
    };
    incluir(linha, evento.codusu, evento.nomeusu);
    linhas.set(chave, linha);
  }
  // Meets que o Hub gerou no Google: juntam-se à reserva do mesmo horário ou viram linha própria.
  for (const meet of meets) {
    let linha = [...linhas.values()].find(
      (l) => l.data === meet.data && l.inicio === meet.inicio && l.fim === meet.fim,
    );
    if (!linha) {
      const titulo = meet.titulo ?? '';
      linha = {
        data: meet.data,
        inicio: meet.inicio,
        fim: meet.fim,
        ...(faseEAssunto(titulo) ?? { fase: SEM_FASE, assunto: titulo }),
        participantes: [],
        codusus: [],
        meet: null,
      };
      linhas.set(`meet|${meet.data}|${meet.inicio}|${meet.fim}|${titulo}`, linha);
    }
    if (meet.fase && linha.fase === SEM_FASE) linha.fase = meet.fase;
    linha.meet ??= meet.link ?? null;
    for (const convidado of meet.convidados ?? []) incluir(linha, convidado.codusu, convidado.nome);
  }
  return [...linhas.values()].sort((a, b) =>
    `${a.data} ${a.inicio}`.localeCompare(`${b.data} ${b.inicio}`),
  );
}

/** Fases marcadas × pessoas marcadas (meet com pelo menos uma delas). Conjunto vazio = nada. */
export function filtrarCronograma(linhas, { fases, codusus }) {
  return linhas.filter(
    (linha) => fases.has(linha.fase) && linha.codusus.some((codusu) => codusus.has(codusu)),
  );
}

/** Tabela com estilo inline (Gmail/Outlook ignoram `<style>`). */
export function htmlDoCronograma(linhas) {
  const celula = 'padding:6px 10px;border:1px solid #d0d7de;font-size:13px;vertical-align:top;';
  const cabecalho = ['Data', 'Início', 'Fim', 'Fase', 'Assunto', 'Participantes', 'Meet']
    .map((t) => `<th style="${celula}background:#f1f5f9;text-align:left;">${t}</th>`)
    .join('');
  const corpo = linhas
    .map((l) => {
      const meet = l.meet ? `<a href="${escaparHtml(l.meet)}">Entrar</a>` : '—';
      return `<tr>${[
        dataBr(l.data),
        l.inicio,
        l.fim,
        escaparHtml(l.fase),
        escaparHtml(l.assunto || '—'),
        l.participantes.map(escaparHtml).join('<br>'),
        meet,
      ]
        .map((v) => `<td style="${celula}">${v}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;"><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>`;
}

/** O mesmo cronograma em texto puro, para quem não mostra HTML. */
export function textoDoCronograma(linhas) {
  return linhas
    .map(
      (l) =>
        `${dataBr(l.data)} ${l.inicio}–${l.fim} · ${l.fase}${l.assunto ? ` · ${l.assunto}` : ''} · ${l.participantes.join(', ')}${l.meet ? ` · ${l.meet}` : ''}`,
    )
    .join('\n');
}

export const assuntoDoCronograma = ({ de, ate }) => `Cronograma ${dataBr(de)} a ${dataBr(ate)}`;

export const emailValido = (email) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);

/**
 * "Para" do cronograma: usuários chave do projeto na Experience já marcados; o resto da
 * equipe (Experience + membros com login do ERP) só como sugestão.
 */
export function destinatariosDoCronograma(pessoasExperience, membros) {
  const chave = (p) => semAcento(p.papel).includes('chave');
  const marcados = pessoasExperience.filter((p) => chave(p) && emailValido(p.email));
  const sugestoes = [
    ...pessoasExperience.filter((p) => !chave(p) && emailValido(p.email)),
    ...membros
      .filter((m) => m.codusu !== null)
      .map((m) => ({ nome: m.nomeusu, email: `${m.nomeusu.toLowerCase()}@sankhya.com.br` })),
  ];
  const vistos = new Set(marcados.map((p) => p.email.toLowerCase()));
  return {
    para: [...vistos],
    sugestoes: sugestoes
      .filter((p) => !vistos.has(p.email.toLowerCase()) && vistos.add(p.email.toLowerCase()))
      .map((p) => ({ nome: p.nome, email: p.email.toLowerCase() })),
  };
}

/**
 * Quem precisa lembrar de ajustar o Sankhya ID: aguardando verificação ou com erro.
 * `inexistente` e `null` ficam de fora (decisão do usuário em 2026-11-05).
 */
export function pendentesDoSankhyaId(pessoasExperience, lembretes = {}) {
  return pessoasExperience
    .filter((p) => p.personId && situacaoDoSankhyaId(p)?.pendente)
    .map((pessoa) => ({
      pessoa,
      motivo: situacaoDoSankhyaId(pessoa).rotulo,
      ultimoLembrete: lembretes[pessoa.personId] ?? null,
    }))
    .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
}

/**
 * Selo do Sankhya ID de uma pessoa da Experience. `null` = não mostra nada, só para
 * `inexistente` (decisão do usuário). Sem situação (quase sempre gente da Sankhya) ou pessoa
 * fora da Experience = selo cinza.
 */
export function situacaoDoSankhyaId(pessoa) {
  if (pessoa?.situacaoConta === 'inexistente') return null;
  if (pessoa?.erroSankhyaId)
    return { rotulo: 'Erro no Sankhya ID', classe: 'erro', pendente: true };
  if (pessoa?.situacaoConta === 'aguardando_verificacao')
    return { rotulo: 'Aguardando verificação', classe: 'atencao', pendente: true };
  if (pessoa?.situacaoConta === 'ativo')
    return { rotulo: 'Sankhya ID ativo', classe: 'ok', pendente: false };
  return { rotulo: 'Sem Sankhya ID informado', classe: '', pendente: false };
}

/** `ArrayBuffer` → base64, em blocos (spread de um arquivo inteiro estoura a pilha). */
export function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** O transporte é o mesmo helper do app, incluindo os erros de shell e escrita parcial. */
export function criarDadosReaisDaEquipe(requisitar) {
  const caminho = (cliente, projeto) =>
    `/api/clientes/${encodeURIComponent(cliente)}/projetos/${encodeURIComponent(projeto)}`;
  const consulta = (periodo) => new URLSearchParams(periodo ?? periodoAtualDaEquipe());
  return {
    async lerEquipe(cliente, projeto, periodo) {
      const [equipe, identidade] = await Promise.all([
        requisitar(`${caminho(cliente, projeto)}/equipe?${consulta(periodo)}`),
        requisitar('/api/sankhya/credenciais').catch(() => null),
      ]);
      const usuario = identidade?.credenciais?.find((c) => c.sistema === 'sankhya-erp')?.usuario;
      const pessoasExperience = equipe.pessoasExperience ?? [];
      return {
        // Usuário chave incluído antes do e-mail ser guardado: herda o da Experience.
        pessoas: equipe.membros.map((m) =>
          m.codusu === null && !m.email
            ? { ...m, email: pessoasExperience.find((p) => membroDaPessoa([m], p))?.email ?? '' }
            : m,
        ),
        reservas: equipe.eventos.map((evento) => traduzirEvento(evento, usuario)),
        // Brutos: o cronograma do cliente precisa de início/fim de todas as reservas dele.
        eventos: equipe.eventos,
        meets: equipe.meets ?? [],
        os: (equipe.os ?? []).map(traduzirOs),
        osDisponiveis: equipe.os !== null,
        avisoOs: equipe.avisoOs,
        implantationId: equipe.implantationId,
        pessoasExperience,
        avisoPessoas: equipe.avisoPessoas ?? null,
        lembretesSankhyaId: equipe.lembretesSankhyaId ?? {},
        usuarioErp: usuario ?? null,
      };
    },
    lembrarSankhyaId: (cliente, projeto, personId) =>
      requisitar(`${caminho(cliente, projeto)}/pessoas/${personId}/lembrete-sankhya-id`, {
        metodo: 'POST',
      }),
    async buscarRecursos(termo = '', periodo) {
      const parametros = consulta(periodo);
      parametros.set('termo', termo);
      const { recursos, aviso } = await requisitar(`/api/agenda/recursos?${parametros}`);
      return { recursos, aviso };
    },
    adicionarPessoa: (cliente, projeto, recurso) =>
      requisitar(`${caminho(cliente, projeto)}/membros`, { metodo: 'POST', corpo: recurso }),
    removerPessoa: (cliente, projeto, pessoa) =>
      requisitar(
        `${caminho(cliente, projeto)}/membros/${encodeURIComponent(pessoa.codusu ?? pessoa.nomeusu)}`,
        { metodo: 'DELETE' },
      ),
    previaDaPlanilha: (cliente, projeto, arquivoBase64) =>
      requisitar(`${caminho(cliente, projeto)}/planilha/previa`, {
        metodo: 'POST',
        corpo: { arquivoBase64 },
      }),
    lancarNaExperience: (cliente, projeto, tarefas) =>
      requisitar(`${caminho(cliente, projeto)}/experience/lote`, {
        metodo: 'POST',
        corpo: { tarefas },
      }),
    lancarNaAgenda: (cliente, projeto, eventos) =>
      requisitar(`${caminho(cliente, projeto)}/agenda/lote`, {
        metodo: 'POST',
        corpo: { eventos },
      }),
    criarMeet: (url, projeto = null) =>
      requisitar('/api/google/meet', { metodo: 'POST', corpo: { url, projeto } }),
    enviarCronograma: (cliente, projeto, email) =>
      requisitar(`${caminho(cliente, projeto)}/cronograma/enviar`, {
        metodo: 'POST',
        corpo: email,
      }),
    pedidosDaNovaTarefa: (cliente, projeto, stageId, procedureIds) =>
      requisitar(
        `${caminho(cliente, projeto)}/nova-tarefa/pedidos?${new URLSearchParams({ stageId, procedimentos: procedureIds.join(',') })}`,
      ),
    personIdDoLogin: (login) =>
      requisitar(`/api/experience/pessoas/por-login?${new URLSearchParams({ login })}`),
    tarefasDaExperience: (cliente, projeto, personId) =>
      requisitar(
        `${caminho(cliente, projeto)}/tarefas-experience?${new URLSearchParams({ personId })}`,
      ),
    importarMapeamento: (cliente, projeto) =>
      requisitar(`${caminho(cliente, projeto)}/mapeamento-experience/importar`, {
        metodo: 'POST',
      }),
    excluirEventoDaAgenda: (cliente, projeto, nuEvento, data) =>
      requisitar(
        `${caminho(cliente, projeto)}/agenda/eventos/${encodeURIComponent(nuEvento)}?${new URLSearchParams({ data })}`,
        { metodo: 'DELETE' },
      ),
    excluirTarefa: (idTarefa) =>
      requisitar(`/api/experience/tarefas/${encodeURIComponent(idTarefa)}`, { metodo: 'DELETE' }),
    reservarHorario: (cliente, projeto, tarefa) =>
      requisitar(`${caminho(cliente, projeto)}/nova-tarefa`, { metodo: 'POST', corpo: tarefa }),
    definirFases: (cliente, projeto, fases, faseAtual) =>
      requisitar(`${caminho(cliente, projeto)}/fases`, {
        metodo: 'PUT',
        corpo: { fases, faseAtual },
      }),
    definirImplantacao: (cliente, projeto, implantationId) =>
      requisitar(`${caminho(cliente, projeto)}/implantation-id`, {
        metodo: 'PUT',
        corpo: { implantationId },
      }),
  };
}
