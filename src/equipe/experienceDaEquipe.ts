/**
 * O que a Equipe do Projeto (GP) usa da API do Sankhya Experience: pessoas e Sankhya ID do
 * projeto, parceiro da implantação, tarefas (ver, criar, excluir), pedidos e procedimentos.
 *
 * Fala com a API por conta própria sobre a porta `ApiDaExperience` — só a requisição
 * autenticada e duas leituras que o Hub já tem (`descobrirPersonId`, `ordens`). Assim o módulo
 * não depende do formato interno do cliente da Experience do Hub (`src/sankhya/experience.ts`).
 */
import { SessaoExpiradaError } from '../sankhya/experience.ts';
import type { OrdemExperience, TarefaExperience } from '../tipos.ts';

/** Porta: o que o Hub precisa oferecer para o módulo falar com a Experience. */
export interface ApiDaExperience {
  /**
   * Requisição autenticada com a sessão da Experience (mesma fila e timeout do Hub), com o
   * `caminho` relativo à API (`/tasks/insert`). Sem sessão, ou 401/403, lança
   * `SessaoExpiradaError`; qualquer outra resposta volta crua para o módulo interpretar.
   */
  requisitar(caminho: string, init?: RequestInit): Promise<Response>;
  /** `person_id` de quem está logado na Experience; `null` sem e-mail no token. */
  descobrirPersonId(): Promise<number | null>;
  /** OS do projeto no período (de toda a equipe com `personId` nulo). */
  ordens(
    projetoId: number,
    personId: number | null,
    de: string,
    ate: string,
  ): Promise<OrdemExperience[]>;
}

/** Status confirmados do filtro de tarefas. A tela tem mais valores, estes são os que vimos. */
const STATUS_TAREFA = ['Hoje', 'Futura', 'Atrasada'];
const MAX_PAGINAS = 20;
const POR_PAGINA = 100;

/**
 * A Experience respondeu com recusa (HTTP 4xx ou `response.error`): validou e não gravou —
 * ex.: 409 "O agendamento identificado no OM ainda não está confirmado" no `/tasks/insert`.
 * Diferente de timeout/5xx, aqui se sabe que nada foi escrito.
 */
export class RecusaDaExperienceError extends Error {}

/**
 * Pergunta de confirmação da tela, não sucesso: a Experience responde 200 com
 * `response.error: false` ("Inserido com sucesso"), mas `data: {error: true, error_code}` e
 * **não grava**. A tela abre um diálogo e reenvia com a flag de "já perguntado". Códigos vistos
 * (gravação da GP, spec seção 4.4): `confirm_creation` (`/tasks/insert`, reenviar com
 * `already_asked: true`), `confirm_update_all_tasks` (`PUT /tasks/{id}`) e
 * `confirmed_include` (`POST /persons/{id}/implantation/{id}`).
 */
export class ConfirmacaoDaExperienceError extends RecusaDaExperienceError {
  readonly codigo: string;

  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

/**
 * Payload de `POST /tasks/insert`, capturado ao vivo em 2026-10-27 (spec seção 4.2). A
 * resposta nunca foi inspecionada (só uma execução, acesso emprestado) — `criarTarefa`
 * devolve o corpo cru em vez de tentar tipar um `taskId` não confirmado.
 */
export interface DadosDaNovaTarefa {
  implantationId: number;
  stageId: number;
  processesIds: number[];
  procedureIds: number[];
  /** Uma pessoa por tarefa — regra da GP, mesmo a API aceitando lista (spec seção 4.2). */
  personId: number;
  /** "Pedido" da tela — sem resolução automática ainda (spec seção 4.2). */
  applicationId: number;
  dataDaTarefa: string;
  horaInicio: string;
  horaFim: string;
  /** "Observação" da tela (até 500 caracteres) — vai em `additional_information`. */
  observacao?: string;
}

export interface PessoaDoProjetoExperience {
  personId: number;
  nome: string;
  /** Minúsculo; o login do ERP é a parte antes do `@` nos e-mails `@sankhya.com.br`. */
  email: string;
  papel: string;
  /**
   * Situação do Sankhya ID (`account_status`): `ativo`, `aguardando_verificacao`,
   * `inexistente` ou `null` (quase sempre gente da Sankhya). Só vem atualizada com
   * `atualizarConta`.
   */
  situacaoConta?: string | null;
  /** `has_uni_error`: conta ativa, mas com erro no Sankhya ID. */
  erroSankhyaId?: boolean;
  /** Coluna "Processo" da aba Usuários (ex.: "Atendimento Avulso"); vazio sem processo. */
  processo?: string;
}

function texto(valor: unknown): string {
  return typeof valor === 'string'
    ? valor
    : valor === null || valor === undefined
      ? ''
      : String(valor);
}

/** `DD/MM/YYYY` -> `YYYY-MM-DD`. Devolve `''` no que não casar. */
function paraIso(data: string): string {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data ?? '');
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : '';
}

/**
 * Coluna "Processo" da aba Usuários (pedido da GP em 17/11). O nome do campo na resposta não
 * foi capturado (só a tela): lê toda chave com "process" que não seja id — texto, ou lista de
 * textos/objetos com `name`. Conferir no log `equipe: usuários da Experience` na homologação.
 */
export function processoDaLinha(linha: Record<string, unknown>): string {
  const nomes = Object.entries(linha)
    .filter(([chave]) => /process/i.test(chave) && !/ids?$/i.test(chave))
    .flatMap(([, valor]) => (Array.isArray(valor) ? valor : [valor]))
    .map((valor) => {
      if (typeof valor === 'string') return valor;
      if (valor && typeof valor === 'object') {
        const objeto = valor as Record<string, unknown>;
        return texto(objeto['name'] ?? objeto['process_name'] ?? '');
      }
      return '';
    })
    .map((nome) => nome.trim())
    .filter(Boolean);
  return [...new Set(nomes)].join(', ');
}

/** `company_name` da implantação: `"85482 - OACO PRODUTOS DE ACO"` -> 85482 (CODPARC do ERP). */
export function codparcDaEmpresa(valor: unknown): number | null {
  const numero = /^\s*(\d+)\s*-/.exec(typeof valor === 'string' ? valor : '')?.[1];
  return numero ? Number(numero) : null;
}

export class ExperienceDaEquipe {
  readonly #api: ApiDaExperience;

  constructor(api: ApiDaExperience) {
    this.#api = api;
  }

  descobrirPersonId(): Promise<number | null> {
    return this.#api.descobrirPersonId();
  }

  ordens(
    projetoId: number,
    personId: number | null,
    de: string,
    ate: string,
  ): Promise<OrdemExperience[]> {
    return this.#api.ordens(projetoId, personId, de, ate);
  }

  /** Uma chamada avulsa, fora do padrão paginado. */
  async #chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
    const resposta = await this.#api.requisitar(caminho, init);
    const corpo = (await resposta.json().catch(() => ({}))) as {
      data?: unknown;
      response?: { error?: boolean; message?: string };
    };

    if (!resposta.ok || corpo.response?.error) {
      const mensagem =
        corpo.response?.message ?? `Experience respondeu HTTP ${resposta.status} em ${caminho}`;
      throw resposta.status < 500 ? new RecusaDaExperienceError(mensagem) : new Error(mensagem);
    }
    const dados = corpo.data as { error?: unknown; error_code?: unknown; error_title?: unknown };
    if (dados && typeof dados === 'object' && dados.error === true) {
      const codigo = typeof dados.error_code === 'string' ? dados.error_code : '';
      throw new ConfirmacaoDaExperienceError(
        codigo,
        typeof dados.error_title === 'string' && dados.error_title
          ? dados.error_title
          : `A Experience pediu confirmação (${codigo || 'sem código'}) em ${caminho} e não gravou nada.`,
      );
    }
    return corpo as T;
  }

  /**
   * Uma consulta paginada. `full_count` vem em CADA item, então o critério de
   * parada sai do primeiro item de cada página.
   */
  async #paginar<T>(
    caminho: string,
    filtros: Record<string, unknown>,
    converter: (linha: Record<string, unknown>) => T,
    porPagina = POR_PAGINA,
    extras: Record<string, unknown> = {},
  ): Promise<T[]> {
    const itens: T[] = [];

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const resposta = await this.#api.requisitar(caminho, {
        method: 'POST',
        body: JSON.stringify({
          columns: [],
          page: pagina,
          length: porPagina,
          order: {},
          filters: filtros,
          ...extras,
        }),
      });
      if (!resposta.ok) {
        throw new Error(`Experience respondeu HTTP ${resposta.status} em ${caminho}`);
      }

      const corpo = (await resposta.json()) as { data?: { result?: Record<string, unknown>[] } };
      const linhas = corpo.data?.result ?? [];
      if (!linhas.length) break;

      itens.push(...linhas.map(converter));

      const total = Number(linhas[0]?.['full_count'] ?? 0);
      // Pelo que veio, não pelo pedido: há endpoint que devolve menos que `length`.
      if (!total || itens.length >= total) break;
    }

    return itens;
  }

  /**
   * O `person_id` de qualquer pessoa pelo e-mail — a mesma consulta de `consultorLogado`,
   * que não se restringe ao dono do token (conferido ao vivo em 2026-10-28). E-mail
   * desconhecido volta `data` vazio: `null`.
   */
  async personIdDoEmail(email: string): Promise<number | null> {
    const corpo = await this.#chamar<{ data?: Record<string, unknown> }>(
      '/persons/information-by-email',
      { method: 'POST', body: JSON.stringify({ email }) },
    );
    const personId = Number(corpo.data?.['user_id']);
    return Number.isSafeInteger(personId) && personId > 0 ? personId : null;
  }

  /**
   * Quem está no projeto (aba "Usuários" da Experience): `POST` paginado, capturado em
   * 2026-10-29 (`fluxos-gp`). Traz Sankhya e cliente juntos — `email` separa um do outro.
   */
  pessoasDoProjeto(
    implantationId: number,
    atualizarConta = false,
  ): Promise<PessoaDoProjetoExperience[]> {
    // 10 por página, como a tela: pedindo 100, a Experience devolve 10 mesmo assim.
    return this.#paginar(
      `/persons/implantation/${implantationId}`,
      {},
      (linha) => ({
        personId: Number(linha['id']),
        nome: texto(linha['person_name']),
        email: texto(linha['email']).toLowerCase(),
        papel: texto(linha['role']),
        situacaoConta: texto(linha['account_status']) || null,
        erroSankhyaId: linha['has_uni_error'] === true,
        processo: processoDaLinha(linha),
      }),
      10,
      // A aba Usuários da Experience pede assim para reconsultar o Sankhya ID de cada um.
      atualizarConta ? { refresh_account_status: true } : {},
    );
  }

  /**
   * Reenvia o e-mail de verificação do Sankhya ID (botão da aba Usuários). Antes confere a
   * conta: `GET /persons/account/user/{id}` (gravação GP 2026-11-05).
   */
  async reenviarEmailDoSankhyaId(personId: number): Promise<void> {
    const conta = await this.#chamar<{ data?: { status?: unknown } }>(
      `/persons/account/user/${personId}`,
    );
    if (conta.data?.status === 'ativo')
      throw new RecusaDaExperienceError('O Sankhya ID desta pessoa já está ativo.');
    await this.#chamar('/persons/account/resend-email', {
      method: 'POST',
      body: JSON.stringify({ person_id: personId }),
    });
  }

  /**
   * Parceiro (CODPARC do ERP) da implantação. A Experience só aceita a tarefa sobre evento do
   * OM com o parceiro do projeto: todo evento de cliente aceito na gravação de 16/11 tem
   * `CODPARC`, e o do Hub, sem ele, dava 422 "agenda deve ser previamente criada…". O CODPARC é
   * o prefixo do `company_name` da implantação (`/implantations/filters`).
   */
  async parceiroDaImplantacao(implantationId: number): Promise<number | null> {
    const colunas = [
      { name: 'impl.id', alias: 'id' },
      { name: 'impl.company_name', alias: 'company_name' },
    ];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const corpo = await this.#chamar<{ data?: { result?: Record<string, unknown>[] } }>(
        '/implantations/filters',
        {
          method: 'POST',
          body: JSON.stringify({
            columns: colunas,
            page: pagina,
            length: POR_PAGINA,
            order: {},
            filters: {},
          }),
        },
      );
      const linhas = corpo.data?.result ?? [];
      if (!linhas.length) break;
      const achada = linhas.find((l) => Number(l['id']) === implantationId);
      if (achada) return codparcDaEmpresa(achada['company_name']);
      const total = Number(linhas[0]?.['full_count'] ?? 0);
      if (!total || pagina * POR_PAGINA >= total) break;
    }
    return null;
  }

  /**
   * Tarefas abertas de `personId`. `quemConsulta` vai no caminho: na tela da GP é o
   * `person_id` dela, com a pessoa consultada só no filtro `users` (gravação 2026-11-05).
   */
  tarefas(
    projetoId: number,
    personId: number,
    quemConsulta = personId,
  ): Promise<TarefaExperience[]> {
    return this.#paginar(
      `/tasks/filtering/implantation/${projetoId}/person/${quemConsulta}`,
      { status: STATUS_TAREFA, users: [personId] },
      (linha) => ({
        id: Number(linha['id']),
        taskDate: texto(linha['task_date']),
        dia: paraIso(texto(linha['task_date'])),
        procedimento: texto(linha['procedure_name']),
        etapa: texto(linha['stage_name']),
        processo: texto(linha['process_name']),
        taskStatus: texto(linha['task_status']),
        horaInicio: texto(linha['task_hour_to_start']),
        horaFim: texto(linha['task_hour_to_finish']),
        pedido: texto(linha['application_code']),
        observacoes: texto(linha['additional_information']),
        bruto: linha,
      }),
    );
  }

  /**
   * "Nova Tarefa" do GP: agenda o trabalho na Etapa/Procedimento certos. Escrita
   * irreversível, uma chamada só. `stageId`/`processesIds`/`procedureIds` vêm do mapeamento
   * Etapa/Procedimento do projeto (`Projeto.mapeamentoExperience`); `applicationId`
   * ("Pedido") vem de `pedidosDaEtapa`.
   *
   * A resposta não traz o id da tarefa (spec 4.3). `confirm_creation` é a pergunta de
   * confirmação da tela: reenvia com `already_asked: true`, como a GP fez nas duas vezes
   * gravadas, e devolve o código para quem chamou avisar.
   */
  async criarTarefa(dados: DadosDaNovaTarefa): Promise<{ confirmacaoAutomatica: string | null }> {
    const inserir = (alreadyAsked: boolean) =>
      this.#chamar('/tasks/insert', {
        method: 'POST',
        body: JSON.stringify({
          stage_id: dados.stageId,
          application_id: dados.applicationId,
          person_id: [dados.personId],
          date_to_do: dados.dataDaTarefa,
          hour_to_start: dados.horaInicio,
          hour_to_finish: dados.horaFim,
          implantation_id: dados.implantationId,
          processes_ids: dados.processesIds,
          procedure_ids: dados.procedureIds,
          // A tela omite o campo quando a Observação está vazia.
          ...(dados.observacao ? { additional_information: dados.observacao } : {}),
          already_asked: alreadyAsked,
        }),
      });

    try {
      await inserir(false);
      return { confirmacaoAutomatica: null };
    } catch (erro) {
      // ponytail: confirma às cegas — o texto do diálogo não vem na API (spec 4.4, validar).
      // Se ele avisar algo que o GP deveria decidir, trocar por pergunta no modal.
      if (!(erro instanceof ConfirmacaoDaExperienceError) || erro.codigo !== 'confirm_creation')
        throw erro;
      await inserir(true);
      return { confirmacaoAutomatica: erro.codigo };
    }
  }

  /**
   * Pedidos que a tela Nova Tarefa oferece para a Etapa e os procedimentos escolhidos
   * (gravação de 12/11): `GET /applications/implantation/{id}/stage/{s}?procedures_ids=…`.
   * O `id` é o `application_id`; o "Código: 5837727" do nome é a OS e não serve — em 12/11
   * a GP digitou esse código e a Experience respondeu "erro de sistema" (2292302).
   */
  async pedidosDaEtapa(
    implantationId: number,
    stageId: number,
    procedureIds: number[],
  ): Promise<{ id: number; nome: string }[]> {
    const { data } = await this.#chamar<{ data?: unknown }>(
      `/applications/implantation/${implantationId}/stage/${stageId}?procedures_ids=${procedureIds.join(',')}`,
    );
    if (!Array.isArray(data)) return [];
    return data.flatMap((p: { id?: unknown; name?: unknown }) =>
      Number.isInteger(p?.id) && (p.id as number) > 0
        ? [{ id: p.id as number, nome: String(p.name ?? p.id) }]
        : [],
    );
  }

  /**
   * Exclui a tarefa na Experience: `DELETE /tasks/{id}` → `267 "Deletado com sucesso"`
   * (gravações de 03/11 e 05/11). Irreversível; não se sabe se mexe no evento do OM.
   */
  async excluirTarefa(id: number): Promise<void> {
    await this.#chamar(`/tasks/${id}`, { method: 'DELETE' });
  }

  /**
   * Procedimentos da implantação, um por Etapa, para montar o mapeamento sem digitar ids.
   * Mesma navegação da tela "Etapas" (gravação de 05/11): menu de Etapas → processos →
   * atividades → procedimentos, vistos por `personId` (quem está logado). Um item por
   * procedimento ativo, com o processo de onde veio.
   */
  async procedimentosDaImplantacao(
    implantationId: number,
    personId: number,
  ): Promise<{
    itens: {
      etapa: string;
      stageId: number;
      processoId: number;
      /** Nome do processo da Experience — o "módulo" que a GP enxerga (Compras, Fiscal…). */
      modulo: string;
      /** Agrupador dentro do módulo na tela da Experience ("Registro e histórico das compras"). */
      atividade: string;
      procedimento: string;
      procedimentoId: number;
    }[];
    /** Respostas fora do formato e Etapas puladas — vão para o log, a importação segue. */
    avisos: string[];
  }> {
    const avisos: string[] = [];
    // A GP pegou `data` que não era lista em alguma Etapa (10/11, implantações 12230 e
    // 11611): aceita lista aninhada num objeto e guarda o formato para conferir.
    const lista = async <T>(caminho: string): Promise<T[]> => {
      const { data } = await this.#chamar<{ data?: unknown }>(caminho);
      if (data == null || Array.isArray(data)) return (data ?? []) as T[];
      avisos.push(`${caminho}: ${JSON.stringify(data).slice(0, 300)}`);
      const aninhada =
        typeof data === 'object' ? Object.values(data).find((v) => Array.isArray(v)) : undefined;
      return (aninhada ?? []) as T[];
    };
    const base = `implantation/${implantationId}`;
    const etapas = (
      await lista<{ stages?: { id: number; title: string }[] }>(
        `/stages/${base}/adapt-to-menu/true`,
      )
    ).flatMap((item) => item.stages ?? []);

    const porEtapa = await Promise.all(
      etapas.map(async (etapa) => {
        const itens = [];
        try {
          const processos = await lista<{ id: number; name?: string; pack_deactivated?: boolean }>(
            `/processes/${base}/stage/${etapa.id}/person/${personId}?isBetterPractices=false`,
          );
          for (const processo of processos.filter((p) => !p.pack_deactivated)) {
            const atividades = await lista<{ id: number; name?: string }>(
              `/activities/${base}/process/${processo.id}/stage/${etapa.id}/person/${personId}`,
            );
            for (const atividade of atividades) {
              const procedimentos = await lista<{
                id: number;
                name: string;
                pack_deactivated?: boolean;
              }>(
                `/procedures/${base}/activity/${atividade.id}/person/${personId}/stage/${etapa.id}`,
              );
              for (const procedimento of procedimentos) {
                if (procedimento.pack_deactivated) continue;
                itens.push({
                  etapa: etapa.title,
                  stageId: etapa.id,
                  processoId: processo.id,
                  modulo: processo.name ?? '',
                  atividade: atividade.name ?? '',
                  procedimento: procedimento.name,
                  procedimentoId: procedimento.id,
                });
              }
            }
          }
        } catch (erro) {
          if (erro instanceof SessaoExpiradaError) throw erro;
          avisos.push(`Etapa ${etapa.id} "${etapa.title}" pulada: ${(erro as Error).message}`);
        }
        return itens;
      }),
    );
    return { itens: porEtapa.flat(), avisos };
  }
}
