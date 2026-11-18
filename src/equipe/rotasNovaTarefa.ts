import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { consultarAgendaCompleta, type AgendaDaEquipe } from './agendaDaEquipe.ts';
import { SessaoExpiradaError } from '../sankhya/experience.ts';
import { RecusaDaExperienceError, type ExperienceDaEquipe } from './experienceDaEquipe.ts';
import { PonteDoDesktopError, PonteDoDesktopIndisponivelError } from '../sankhya/ponteDoDesktop.ts';
import { responderErroDoShell } from '../rotas/comum/respostasDoShell.ts';
import type { RepositorioDaEquipe } from './portas.ts';
import type { EventoAgenda } from '../tipos.ts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

const esquemaDeParametros = z.object({
  id: z.string().uuid('Identificador de cliente inválido.'),
  idProjeto: z.string().uuid('Identificador de projeto inválido.'),
});

const esquemaDaNovaTarefa = z
  .object({
    /** Etapa da Experience; os procedimentos têm que estar nela no mapeamento do projeto. */
    stageId: z.number().int().positive('Escolha a Etapa.'),
    /**
     * Procedimentos marcados no modal: módulo inteiro (todos os dele) ou só alguns — como a
     * tela da Experience, que manda os módulos em `processes_ids` e a união em `procedure_ids`.
     */
    procedureIds: z
      .array(z.number().int().positive())
      .min(1, 'Escolha ao menos um módulo ou procedimento.')
      .max(1000),
    /** "O quê" do evento na Agenda de Recursos. */
    titulo: z.string().trim().min(1, 'Informe o "O quê" do evento.').max(400),
    /** "Descrição completa" do evento na Agenda: os módulos marcados. Não vai à Experience. */
    descricao: z.string().trim().max(4000).default(''),
    data: z.string().regex(ISO, 'Informe "data" no formato YYYY-MM-DD.'),
    horaInicio: z.string().regex(HORA, 'Hora inicial no formato HH:MM.'),
    horaFim: z.string().regex(HORA, 'Hora final no formato HH:MM.'),
    /** Executante na Agenda de Recursos (CODUSU do ERP). */
    codUsu: z.number().int().positive('Executante (codUsu) inválido.'),
    /**
     * `person_id` da Experience — o modal sugere por `GET /api/experience/pessoas/por-login`.
     * Um só: a GP não lança a mesma tarefa para mais de uma pessoa (spec seção 4.2).
     */
    personId: z.number().int().positive('Informe o person_id da Experience.'),
    /** `implantation_id` da Experience (o "projeto" de lá) — sem resolução automática ainda. */
    implantationId: z.number().int().positive('implantation_id inválido.'),
    /** "Pedido" da tela — o modal oferece os de `GET …/nova-tarefa/pedidos`. */
    applicationId: z.number().int().positive('Informe o Pedido (application_id).'),
    /** "Observação" da tarefa na Experience (`additional_information`). */
    observacao: z.string().trim().max(500, 'Observação com até 500 caracteres.').optional(),
  })
  .refine((dados) => dados.horaFim > dados.horaInicio, {
    message: 'A hora final tem que ser depois da inicial.',
  });

/** Linhas da planilha para a Experience; o processo é escolhido por linha no modal. */
const esquemaDoLoteDaExperience = z.object({
  tarefas: z
    .array(
      z
        .object({
          codUsu: z.number().int().positive('Executante (codUsu) inválido.'),
          titulo: z.string().trim().max(200).default(''),
          data: z.string().regex(ISO, 'Data no formato YYYY-MM-DD.'),
          horaInicio: z.string().regex(HORA, 'Hora inicial no formato HH:MM.'),
          horaFim: z.string().regex(HORA, 'Hora final no formato HH:MM.'),
          stageId: z.number().int().positive('Escolha o processo da Experience.'),
          procedureIds: z.array(z.number().int().positive()).min(1).max(1000),
          observacao: z.string().trim().max(500).optional(),
        })
        .refine((t) => t.horaFim > t.horaInicio, {
          message: 'A hora final tem que ser depois da inicial.',
        }),
    )
    .min(1, 'Nenhuma tarefa para lançar.')
    .max(300, 'No máximo 300 tarefas por vez.'),
});

function responderErroDeValidacao(resposta: FastifyReply, erro: z.ZodError): FastifyReply {
  return resposta.status(400).send({ mensagem: erro.issues[0]?.message ?? 'Dados inválidos.' });
}

/** `2026-10-27` + `08:00` -> `27/10/2026 08:00:00`, formato do `salvarEvento`. */
export function paraDataHoraSankhya(data: string, hora: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano} ${hora}:00`;
}

export interface PedidoNaAgenda {
  codUsu: number;
  data: string;
  horaInicio: string;
  horaFim: string;
  titulo: string;
}

/**
 * Antes de gravar na Agenda (pedido da GP em 16/11, havia duplicidade): olha o executante no
 * período. `existente` = já há evento deste cliente (mesmo parceiro; sem parceiro conhecido,
 * mesmo "O quê") cobrindo o horário — reaproveita, não grava outro. `ocupado` = qualquer outro
 * agendamento que encosta no horário (outro cliente, férias, evento parcial) — não grava.
 */
export function situacaoNaAgenda(
  existentes: EventoAgenda[],
  pedido: PedidoNaAgenda,
  codParc: number | null,
):
  | { tipo: 'livre' }
  | { tipo: 'existente'; evento: EventoAgenda }
  | { tipo: 'ocupado'; eventos: EventoAgenda[] } {
  const inicio = `${pedido.data} ${pedido.horaInicio}:00`;
  const fim = `${pedido.data} ${pedido.horaFim}:00`;
  const sobrepostos = existentes.filter(
    (e) => e.codusu === pedido.codUsu && e.inicio < fim && e.fim > inicio,
  );
  const mesmo = sobrepostos.find(
    (e) =>
      (codParc ? e.codparc === codParc : e.descrabrev.trim() === pedido.titulo.trim()) &&
      e.inicio <= inicio &&
      e.fim >= fim,
  );
  if (mesmo) return { tipo: 'existente', evento: mesmo };
  return sobrepostos.length ? { tipo: 'ocupado', eventos: sobrepostos } : { tipo: 'livre' };
}

/** "OACO - Simulação (GUSTAVO.PARAGUAI, 09:00–12:00, lançado por RAPHAELA.BORGES)". */
export function descreverEvento(evento: EventoAgenda): string {
  const oque = evento.descrabrev || evento.nomeparc || 'evento sem descrição';
  const horario = `${evento.inicio.slice(11, 16)}–${evento.fim.slice(11, 16)}`;
  return `"${oque}" (${evento.nomeusu}, ${horario}, lançado por ${evento.usulancador || '?'})`;
}

/** Mesmo critério de comparação de `RepositorioClientesArquivo`: aparado, sem diferença de caixa. */
function normalizarProcesso(valor: string): string {
  return valor.trim().toLocaleLowerCase('pt-BR');
}

type ItemDoMapeamento = {
  processo: string;
  stageId: number;
  processesIds: number[];
  procedureIds: number[];
};

/**
 * Procedimentos marcados no modal → o que vai para `/tasks/insert`: os módulos de onde vêm
 * (`processes_ids`) e os procedimentos. Todos têm que estar na Etapa, no mapeamento do projeto.
 */
export function escolhaNoMapeamento(
  mapeamento: ItemDoMapeamento[],
  stageId: number,
  procedureIds: number[],
): ItemDoMapeamento | { faltando: number[] } {
  const marcados = new Set(procedureIds);
  const escolhidos = mapeamento.filter(
    (m) => m.stageId === stageId && m.procedureIds.some((id) => marcados.has(id)),
  );
  const cobertos = new Set(escolhidos.flatMap((m) => m.procedureIds));
  const faltando = [...marcados].filter((id) => !cobertos.has(id));
  if (faltando.length) return { faltando };
  const modulos = new Set(escolhidos.map((m) => m.processo.split(' › ').slice(0, 2).join(' › ')));
  return {
    processo:
      escolhidos.length === 1
        ? escolhidos[0]!.processo
        : `${[...modulos].join(', ')} (${marcados.size} procedimentos)`,
    stageId,
    processesIds: [...new Set(escolhidos.flatMap((m) => m.processesIds))],
    procedureIds: [...marcados],
  };
}

function responderErroDaAgenda(resposta: FastifyReply, erro: unknown): FastifyReply {
  if (erro instanceof PonteDoDesktopError || erro instanceof PonteDoDesktopIndisponivelError) {
    return responderErroDoShell(resposta, erro);
  }
  return resposta.status(502).send({ mensagem: (erro as Error).message });
}

/**
 * "Nova Tarefa" do GP: grava o par de lançamentos — evento na Agenda de Recursos e tarefa
 * na Experience — na Etapa/Procedimento do `processo` dado, resolvidos contra o mapeamento
 * do projeto. As duas escritas são chamadas REST independentes, não uma transação: se a
 * Agenda gravar e a Experience falhar depois, o evento fica sem a tarefa correspondente —
 * sem `nuEvento` confirmado (spec seção 4) não dá para desfazer sozinho, então o aviso pede
 * conferência manual em vez de tentar reverter.
 */
/**
 * Procedimentos da Experience → mapeamento do projeto. Um item por Etapa + módulo (processo
 * da Experience) + Procedimento, rotulado "Etapa › Módulo › Atividade › Procedimento" — a GP escolhe pelo
 * módulo (10/11: "tem que aparecer o módulo"); o modal agrupa por "Etapa › Módulo".
 */
export function mapeamentoDosProcedimentos(
  procedimentos: {
    etapa: string;
    stageId: number;
    processoId: number;
    modulo: string;
    atividade?: string;
    procedimento: string;
    procedimentoId: number;
  }[],
): { processo: string; stageId: number; processesIds: number[]; procedureIds: number[] }[] {
  const porChave = new Map<
    string,
    { processo: string; stageId: number; processesIds: number[]; procedureIds: number[] }
  >();
  for (const item of procedimentos) {
    const chave = `${item.stageId}:${item.processoId}:${item.procedimentoId}`;
    if (porChave.has(chave)) continue;
    const partes = [
      item.etapa,
      item.modulo || `Processo ${item.processoId}`,
      ...(item.atividade?.trim() ? [item.atividade] : []),
      item.procedimento,
    ];
    porChave.set(chave, {
      processo: partes.map((parte) => parte.trim().replaceAll('›', '-')).join(' › '),
      stageId: item.stageId,
      processesIds: [item.processoId],
      procedureIds: [item.procedimentoId],
    });
  }
  const itens = [...porChave.values()];
  const repetidos = new Set(
    itens
      .map((m) => normalizarProcesso(m.processo))
      .filter((rotulo, i, todos) => todos.indexOf(rotulo) !== i),
  );
  for (const m of itens)
    if (repetidos.has(normalizarProcesso(m.processo))) m.processo += ` (${m.procedureIds[0]})`;
  return itens;
}

export function registrarRotasDeNovaTarefa(
  servidor: FastifyInstance,
  agendaDaEquipe: AgendaDaEquipe,
  experience: ExperienceDaEquipe,
  repositorioClientes: RepositorioDaEquipe,
  registrador?: FastifyBaseLogger,
): void {
  /**
   * `person_id` sugerido para o executante: o login do ERP segue `nome.sobrenome`, o
   * mesmo do e-mail corporativo. É sugestão — o GP confere no modal antes de lançar.
   */
  servidor.get('/api/experience/pessoas/por-login', async (requisicao, resposta) => {
    const login = z
      .string()
      .trim()
      .regex(/^[\w.-]+$/, 'Login inválido.')
      .safeParse((requisicao.query as { login?: unknown }).login);
    if (!login.success) return responderErroDeValidacao(resposta, login.error);

    const email = `${login.data.toLowerCase()}@sankhya.com.br`;
    try {
      const personId = await experience.personIdDoEmail(email);
      if (!personId) {
        return resposta
          .status(404)
          .send({ mensagem: `Nenhum usuário da Experience com o e-mail ${email}.` });
      }
      return { personId, email };
    } catch (erro) {
      if (erro instanceof SessaoExpiradaError) {
        return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
      }
      return resposta.status(502).send({ mensagem: (erro as Error).message });
    }
  });

  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/nova-tarefa',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametros.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);

      const dados = esquemaDaNovaTarefa.safeParse(requisicao.body ?? {});
      if (!dados.success) {
        registrador?.warn(
          { novaTarefa: { recusa: 'validacao', mensagem: dados.error.issues[0]?.message } },
          'nova-tarefa: pedido inválido',
        );
        return responderErroDeValidacao(resposta, dados.error);
      }
      const pedido = dados.data;

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      if (!cliente) return resposta.status(404).send({ mensagem: 'Cliente não encontrado.' });

      const projeto = cliente.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

      const mapeamento = escolhaNoMapeamento(
        projeto.mapeamentoExperience,
        pedido.stageId,
        pedido.procedureIds,
      );
      if ('faltando' in mapeamento) {
        registrador?.warn(
          {
            novaTarefa: {
              recusa: 'processo-nao-mapeado',
              projeto: projeto.nome,
              stageId: pedido.stageId,
              faltando: mapeamento.faltando,
            },
          },
          'nova-tarefa: processo não mapeado',
        );
        return resposta.status(404).send({
          mensagem: `Procedimentos fora do mapeamento desta Etapa (${mapeamento.faltando.join(', ')}). Atualize os processos da Experience e escolha de novo.`,
        });
      }

      const start = paraDataHoraSankhya(pedido.data, pedido.horaInicio);
      const end = paraDataHoraSankhya(pedido.data, pedido.horaFim);

      // Homologação com a GP (spec 4.4): uma linha por etapa, procurável por "nova-tarefa".
      const contexto = {
        cliente: cliente.nome,
        projeto: projeto.nome,
        processo: mapeamento.processo,
        implantationId: pedido.implantationId,
        stageId: mapeamento.stageId,
        processesIds: mapeamento.processesIds,
        procedureIds: mapeamento.procedureIds,
        applicationId: pedido.applicationId,
        personId: pedido.personId,
        codUsu: pedido.codUsu,
        data: pedido.data,
        horario: `${pedido.horaInicio}-${pedido.horaFim}`,
      };
      registrador?.info({ novaTarefa: contexto }, 'nova-tarefa: início');

      const inicio = Date.now();
      const eventosDoDia = async () =>
        (
          await consultarAgendaCompleta(agendaDaEquipe, { de: pedido.data, ate: pedido.data })
        ).recursos.flatMap((item) => item.eventos);

      // Conferência antes de escrever: parceiro do projeto (sem ele a Experience recusa) e o que
      // o executante já tem no horário (sem isso o Hub duplicava evento a cada tentativa).
      let codParc: number | null;
      let situacao: ReturnType<typeof situacaoNaAgenda>;
      try {
        codParc = await experience.parceiroDaImplantacao(pedido.implantationId);
        situacao = situacaoNaAgenda(await eventosDoDia(), pedido, codParc);
      } catch (erro) {
        registrador?.warn(
          { novaTarefa: { ...contexto, etapa: 'conferencia', mensagem: (erro as Error).message } },
          'nova-tarefa: falhou',
        );
        if (erro instanceof SessaoExpiradaError)
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        return responderErroDaAgenda(resposta, erro);
      }
      if (!codParc) {
        return resposta.status(409).send({
          mensagem: `A Experience não informou o parceiro (código do cliente) da implantação ${pedido.implantationId} — sem ele a tarefa é recusada. Nada foi gravado.`,
        });
      }
      if (situacao.tipo === 'ocupado') {
        registrador?.warn(
          { novaTarefa: { ...contexto, ocupado: situacao.eventos.map((e) => e.nuevento) } },
          'nova-tarefa: horário ocupado na Agenda',
        );
        return resposta.status(409).send({
          mensagem: `O executante já tem agendamento nesse horário: ${situacao.eventos.map(descreverEvento).join('; ')}. Nada foi gravado — escolha outro horário ou exclua o agendamento (duplo clique no dia da agenda).`,
        });
      }
      const existente = situacao.tipo === 'existente' ? situacao.evento : null;
      const reaproveitado = existente !== null;
      const naAgenda = existente
        ? `Evento já existia na Agenda de Recursos (${descreverEvento(existente)}) e foi reaproveitado`
        : 'Evento criado na Agenda de Recursos';

      /** Recusa da Experience com evento criado agora: cancela o evento para não ficar órfão. */
      const desfazerEvento = async (): Promise<boolean> => {
        if (reaproveitado) return false;
        try {
          const criado = (await eventosDoDia()).find(
            (e) =>
              e.codusu === pedido.codUsu &&
              e.codparc === codParc &&
              e.inicio === `${pedido.data} ${pedido.horaInicio}:00` &&
              e.fim === `${pedido.data} ${pedido.horaFim}:00` &&
              e.descrabrev.trim() === pedido.titulo,
          );
          if (!criado?.nuevento) return false;
          await agendaDaEquipe.cancelarEventoNaAgenda(criado.nuevento);
          return true;
        } catch {
          return false;
        }
      };

      let escreveuNaAgenda = reaproveitado;
      try {
        if (existente) {
          registrador?.info(
            { novaTarefa: { ...contexto, nuEvento: existente.nuevento } },
            'nova-tarefa: evento já existia na Agenda',
          );
        } else {
          const agenda = await agendaDaEquipe.salvarEventoNaAgenda({
            titulo: pedido.titulo,
            descricao: pedido.descricao,
            start,
            end,
            codUsu: pedido.codUsu,
            // Sem confirmar, o `/tasks/insert` recusa com 409 (spec seção 4.2).
            confirmado: true,
            codParc,
          });
          escreveuNaAgenda = true;
          registrador?.info(
            { novaTarefa: { ...contexto, codParc, agenda, ms: Date.now() - inicio } },
            'nova-tarefa: evento gravado na Agenda',
          );
        }

        const tarefa = await experience.criarTarefa({
          implantationId: pedido.implantationId,
          stageId: mapeamento.stageId,
          processesIds: mapeamento.processesIds,
          procedureIds: mapeamento.procedureIds,
          personId: pedido.personId,
          applicationId: pedido.applicationId,
          dataDaTarefa: pedido.data,
          horaInicio: pedido.horaInicio,
          horaFim: pedido.horaFim,
          observacao: pedido.observacao,
        });

        registrador?.info(
          {
            novaTarefa: {
              ...contexto,
              confirmacaoAutomatica: tarefa.confirmacaoAutomatica,
              ms: Date.now() - inicio,
            },
          },
          'nova-tarefa: tarefa gravada na Experience',
        );
        return {
          mensagem: tarefa.confirmacaoAutomatica
            ? `${naAgenda} e tarefa lançada na Experience (a Experience pediu confirmação — "${tarefa.confirmacaoAutomatica}" — e o Hub confirmou).`
            : `${naAgenda} e tarefa lançada na Experience.`,
          confirmacaoAutomatica: tarefa.confirmacaoAutomatica,
        };
      } catch (erro) {
        registrador?.warn(
          {
            novaTarefa: {
              ...contexto,
              etapa: escreveuNaAgenda ? 'experience' : 'agenda',
              tipo: (erro as Error).name,
              ms: Date.now() - inicio,
              codigo: (erro as { codigo?: string }).codigo,
              mensagem: (erro as Error).message,
            },
          },
          'nova-tarefa: falhou',
        );
        if (!escreveuNaAgenda) return responderErroDaAgenda(resposta, erro);

        // Sessão expirada: o evento fica (reenviar depois reaproveita, não duplica).
        if (erro instanceof SessaoExpiradaError) {
          return resposta.status(409).send({
            mensagem: `${naAgenda}, mas a sessão da Experience expirou: ${erro.message}. Capture a sessão de novo e lance outra vez — o evento será reaproveitado.`,
            sessaoExpirada: true,
            configuracaoPendente: 'sessao-experience',
          });
        }
        // Recusa limpa: a Experience não gravou nada; o evento criado agora é desfeito.
        if (erro instanceof RecusaDaExperienceError) {
          const desfeito = await desfazerEvento();
          registrador?.info(
            { novaTarefa: { ...contexto, desfeito } },
            'nova-tarefa: recusa tratada',
          );
          return resposta.status(409).send({
            mensagem: desfeito
              ? `A Experience recusou a tarefa: ${erro.message} O evento criado agora na Agenda foi excluído — nada ficou gravado.`
              : `${naAgenda}, mas a Experience recusou a tarefa: ${erro.message} Nada foi gravado na Experience; o evento continua na Agenda (exclua pelo duplo clique no dia, se não for usar).`,
          });
        }
        return resposta.status(502).send({
          mensagem: `${naAgenda}, mas a Nova Tarefa da Experience falhou: ${(erro as Error).message}. Confira a Experience antes de lançar de novo — reenviar reaproveita o evento.`,
          indeterminado: true,
        });
      }
    },
  );

  /**
   * Tarefas da planilha na Experience, sem gravar na Agenda: cada linha precisa de evento deste
   * cliente na Agenda de Recursos cobrindo o horário. Tudo é conferido antes — com qualquer
   * pendência (sem agenda, pessoa ou Pedido) nada é gravado e volta o motivo de cada linha.
   */
  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/experience/lote',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametros.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const dados = esquemaDoLoteDaExperience.safeParse(requisicao.body ?? {});
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
      const { tarefas } = dados.data;

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
      const implantationId = projeto.implantationId;
      if (implantationId === null)
        return resposta
          .status(409)
          .send({ mensagem: 'Cadastre o ID da implantação da Experience no projeto.' });

      type Pronta = Parameters<ExperienceDaEquipe['criarTarefa']>[0];
      const prontas: Pronta[] = [];
      const pendencias: { indice: number; motivo: string }[] = [];
      try {
        const codParc = await experience.parceiroDaImplantacao(implantationId);
        const datas = tarefas.map((t) => t.data).sort();
        const existentes = (
          await consultarAgendaCompleta(agendaDaEquipe, { de: datas[0]!, ate: datas.at(-1)! })
        ).recursos.flatMap((item) => item.eventos);
        const pessoas = new Map<string, number | null>();
        const pedidos = new Map<string, { id: number }[]>();

        for (const [indice, tarefa] of tarefas.entries()) {
          const pendente = (motivo: string) => pendencias.push({ indice, motivo });
          const escolha = escolhaNoMapeamento(
            projeto.mapeamentoExperience,
            tarefa.stageId,
            tarefa.procedureIds,
          );
          if ('faltando' in escolha) {
            pendente('processo fora do mapeamento da Experience');
            continue;
          }
          const situacao = situacaoNaAgenda(existentes, tarefa, codParc);
          if (situacao.tipo !== 'existente') {
            pendente(
              situacao.tipo === 'ocupado'
                ? `a Agenda tem outro agendamento no horário: ${situacao.eventos.map(descreverEvento).join('; ')}`
                : 'não há agenda deste cliente na Agenda de Recursos nesse dia e horário',
            );
            continue;
          }
          const login = situacao.evento.nomeusu.toLowerCase();
          if (!pessoas.has(login))
            pessoas.set(login, await experience.personIdDoEmail(`${login}@sankhya.com.br`));
          const personId = pessoas.get(login);
          if (!personId) {
            pendente(`${login}@sankhya.com.br não está na Experience`);
            continue;
          }
          const chave = `${escolha.stageId}:${escolha.procedureIds.join(',')}`;
          if (!pedidos.has(chave))
            pedidos.set(
              chave,
              await experience.pedidosDaEtapa(
                implantationId,
                escolha.stageId,
                escolha.procedureIds,
              ),
            );
          const doProcesso = pedidos.get(chave)!;
          if (doProcesso.length !== 1) {
            pendente(
              doProcesso.length
                ? 'a Experience tem mais de um Pedido para esse processo — lance pela Nova Tarefa'
                : 'a Experience não tem Pedido para esse processo',
            );
            continue;
          }
          prontas[indice] = {
            implantationId,
            stageId: escolha.stageId,
            processesIds: escolha.processesIds,
            procedureIds: escolha.procedureIds,
            personId,
            applicationId: doProcesso[0]!.id,
            dataDaTarefa: tarefa.data,
            horaInicio: tarefa.horaInicio,
            horaFim: tarefa.horaFim,
            observacao: tarefa.observacao,
          };
        }
      } catch (erro) {
        if (erro instanceof SessaoExpiradaError)
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        return responderErroDaAgenda(resposta, erro);
      }

      if (pendencias.length) {
        registrador?.warn(
          { novaTarefa: { projeto: projeto.nome, pendencias } },
          'nova-tarefa: lote recusado',
        );
        return resposta.status(409).send({
          mensagem: `Nada foi gravado na Experience: ${pendencias.length} linha(s) com pendência. A tarefa só é lançada sobre agenda já criada na Agenda de Recursos — marque também "Gerar na Agenda de Recursos" ou corrija as linhas.`,
          pendencias,
        });
      }

      // Uma por vez: a fila da Experience é uma só, e falha numa linha não para as outras.
      const resultados: { situacao: 'gravado' | 'erro'; mensagem?: string }[] = [];
      for (const pronta of prontas) {
        try {
          await experience.criarTarefa(pronta);
          resultados.push({ situacao: 'gravado' });
        } catch (erro) {
          if (erro instanceof SessaoExpiradaError)
            return resposta.status(409).send({
              mensagem: `${erro.message} — ${resultados.length} tarefa(s) já lançada(s); reenvie só as que faltam.`,
              sessaoExpirada: true,
              indeterminado: true,
            });
          resultados.push({ situacao: 'erro', mensagem: (erro as Error).message });
        }
      }
      registrador?.info(
        {
          novaTarefa: {
            projeto: projeto.nome,
            gravadas: resultados.filter((r) => r.situacao === 'gravado').length,
            erros: resultados.filter((r) => r.situacao === 'erro').length,
          },
        },
        'nova-tarefa: lote gravado na Experience',
      );
      return { resultados };
    },
  );

  /**
   * Monta o mapeamento Etapa/Procedimento do projeto direto da Experience (sem digitar ids):
   * lê todos os procedimentos da implantação pela sessão de quem está logado e substitui a
   * lista do projeto.
   */
  /** Pedidos da Experience para Etapa + procedimentos marcados no modal — o GP escolhe, não digita. */
  servidor.get(
    '/api/clientes/:id/projetos/:idProjeto/nova-tarefa/pedidos',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametros.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const consulta = requisicao.query as { stageId?: unknown; procedimentos?: unknown };
      const stageId = Number(consulta.stageId);
      const procedureIds = String(consulta.procedimentos ?? '')
        .split(',')
        .map(Number);

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
      if (projeto.implantationId === null) {
        return resposta
          .status(409)
          .send({ mensagem: 'Cadastre o ID da implantação da Experience no projeto.' });
      }
      if (!Number.isInteger(stageId) || procedureIds.some((id) => !Number.isInteger(id) || id <= 0))
        return resposta.status(400).send({ mensagem: 'Etapa ou procedimentos inválidos.' });
      const mapeamento = escolhaNoMapeamento(projeto.mapeamentoExperience, stageId, procedureIds);
      if ('faltando' in mapeamento)
        return resposta
          .status(404)
          .send({ mensagem: 'Procedimentos fora do mapeamento desta Etapa.' });

      try {
        const pedidos = await experience.pedidosDaEtapa(
          projeto.implantationId,
          mapeamento.stageId,
          mapeamento.procedureIds,
        );
        return { pedidos };
      } catch (erro) {
        registrador?.warn(
          { novaTarefa: { stageId, procedureIds, mensagem: (erro as Error).message } },
          'nova-tarefa: pedidos da Experience falharam',
        );
        if (erro instanceof SessaoExpiradaError) {
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        }
        return resposta.status(502).send({ mensagem: (erro as Error).message });
      }
    },
  );

  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/mapeamento-experience/importar',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametros.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!cliente || !projeto)
        return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
      if (projeto.implantationId === null) {
        return resposta.status(409).send({
          mensagem: 'Cadastre o ID da implantação da Experience no projeto antes de importar.',
        });
      }

      const inicio = Date.now();
      try {
        const personId = await experience.descobrirPersonId();
        if (!personId) {
          return resposta.status(409).send({
            mensagem: 'Entre na Experience pelo Hub antes de importar os processos.',
            sessaoExpirada: true,
          });
        }
        const { itens, avisos } = await experience.procedimentosDaImplantacao(
          projeto.implantationId,
          personId,
        );
        if (avisos.length) {
          registrador?.warn(
            {
              novaTarefa: { projeto: projeto.nome, implantationId: projeto.implantationId, avisos },
            },
            'nova-tarefa: importação com respostas fora do formato',
          );
        }
        const mapeamento = mapeamentoDosProcedimentos(itens);
        if (!mapeamento.length) {
          registrador?.warn(
            {
              novaTarefa: {
                projeto: projeto.nome,
                implantationId: projeto.implantationId,
                personId,
              },
            },
            'nova-tarefa: importação sem procedimentos',
          );
          return resposta.status(404).send({
            mensagem: `A Experience não devolveu procedimentos da implantação ${projeto.implantationId} para este login.`,
          });
        }
        const atualizado = await repositorioClientes.definirMapeamentoExperienceDoProjeto(
          cliente.id,
          projeto.id,
          mapeamento,
        );
        registrador?.info(
          {
            novaTarefa: {
              projeto: projeto.nome,
              implantationId: projeto.implantationId,
              personId,
              processos: mapeamento.length,
              ms: Date.now() - inicio,
            },
          },
          'nova-tarefa: mapeamento importado',
        );
        return atualizado;
      } catch (erro) {
        registrador?.warn(
          {
            novaTarefa: {
              projeto: projeto.nome,
              implantationId: projeto.implantationId,
              mensagem: (erro as Error).message,
              ms: Date.now() - inicio,
            },
          },
          'nova-tarefa: importação do mapeamento falhou',
        );
        if (erro instanceof SessaoExpiradaError) {
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        }
        return resposta.status(502).send({ mensagem: (erro as Error).message });
      }
    },
  );

  /** Tarefas abertas de uma pessoa no projeto, vistas pela sessão de quem está logado (a GP). */
  servidor.get(
    '/api/clientes/:id/projetos/:idProjeto/tarefas-experience',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametros.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const personId = z.coerce
        .number()
        .int()
        .positive('Informe o personId.')
        .safeParse((requisicao.query as { personId?: unknown }).personId);
      if (!personId.success) return responderErroDeValidacao(resposta, personId.error);

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
      if (projeto.implantationId === null) {
        return resposta.status(409).send({
          mensagem: 'Projeto sem implantation_id da Experience cadastrado.',
        });
      }

      try {
        const quemConsulta = (await experience.descobrirPersonId()) ?? personId.data;
        const tarefas = await experience.tarefas(
          projeto.implantationId,
          personId.data,
          quemConsulta,
        );
        registrador?.info(
          {
            novaTarefa: {
              projeto: projeto.nome,
              personId: personId.data,
              quemConsulta,
              tarefas: tarefas.length,
            },
          },
          'nova-tarefa: tarefas listadas',
        );
        return {
          tarefas: tarefas.map(({ bruto: _bruto, ...tarefa }) => tarefa),
        };
      } catch (erro) {
        registrador?.warn(
          { novaTarefa: { personId: personId.data, mensagem: (erro as Error).message } },
          'nova-tarefa: listagem falhou',
        );
        if (erro instanceof SessaoExpiradaError) {
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        }
        return resposta.status(502).send({ mensagem: (erro as Error).message });
      }
    },
  );

  /** Exclusão de tarefa pela GP — remarcar é excluir e lançar de novo (spec 4.4). */
  servidor.delete('/api/experience/tarefas/:idTarefa', async (requisicao, resposta) => {
    const idTarefa = z.coerce
      .number()
      .int()
      .positive('Tarefa inválida.')
      .safeParse((requisicao.params as { idTarefa?: unknown }).idTarefa);
    if (!idTarefa.success) return responderErroDeValidacao(resposta, idTarefa.error);

    try {
      await experience.excluirTarefa(idTarefa.data);
      registrador?.info(
        { novaTarefa: { idTarefa: idTarefa.data } },
        'nova-tarefa: tarefa excluída',
      );
      return { mensagem: `Tarefa ${idTarefa.data} excluída na Experience.` };
    } catch (erro) {
      registrador?.warn(
        { novaTarefa: { idTarefa: idTarefa.data, mensagem: (erro as Error).message } },
        'nova-tarefa: exclusão falhou',
      );
      if (erro instanceof SessaoExpiradaError) {
        return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
      }
      if (erro instanceof RecusaDaExperienceError) {
        return resposta.status(409).send({ mensagem: erro.message });
      }
      return resposta.status(502).send({ mensagem: (erro as Error).message, indeterminado: true });
    }
  });
}
