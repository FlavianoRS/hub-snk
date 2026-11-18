import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { chaveNome, nomesCorrespondem } from '../sankhya/agenda.ts';
import {
  consultarAgendaCompleta,
  pessoasCorrespondem,
  type AgendaDaEquipe,
} from './agendaDaEquipe.ts';
import { SessaoExpiradaError } from '../sankhya/experience.ts';
import {
  RecusaDaExperienceError,
  type ExperienceDaEquipe,
  type PessoaDoProjetoExperience,
} from './experienceDaEquipe.ts';
import {
  gerarModeloEquipeXlsx,
  interpretarPlanilhaEquipe,
  type ResultadoLeituraPlanilha,
} from './modeloEquipePlanilha.ts';
import { PonteDoDesktopError, PonteDoDesktopIndisponivelError } from '../sankhya/ponteDoDesktop.ts';
import { responderErroDoShell } from '../rotas/comum/respostasDoShell.ts';
import { descreverEvento, paraDataHoraSankhya, situacaoNaAgenda } from './rotasNovaTarefa.ts';
import type {
  Cliente,
  EventoAgenda,
  MeetDoProjeto,
  OrdemExperience,
  RecursoAgenda,
} from '../tipos.ts';
import type { RepositorioDaEquipe } from './portas.ts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const esquemaDoPeriodo = z.object({
  de: z.string().regex(ISO, 'Informe "de" no formato YYYY-MM-DD.'),
  ate: z.string().regex(ISO, 'Informe "ate" no formato YYYY-MM-DD.'),
});

const esquemaDaBusca = esquemaDoPeriodo.extend({
  termo: z.string().trim().default(''),
});

const esquemaDeParametrosDeProjeto = z.object({
  id: z.string().uuid('Identificador de cliente inválido.'),
  idProjeto: z.string().uuid('Identificador de projeto inválido.'),
});

const HORA = /^\d{2}:\d{2}$/;

const esquemaDaPrevia = z.object({
  arquivoBase64: z.string().min(1, 'Envie a planilha preenchida.'),
});

/** O que o GP confirmou na prévia — só Agenda por enquanto (Experience espera o mapeamento). */
const esquemaDoLote = z.object({
  eventos: z
    .array(
      z
        .object({
          // DESCRABREV é VARCHAR2(400); DESCRLONGA, 4000.
          titulo: z.string().trim().min(1, 'Informe o "O quê" de cada evento.').max(400),
          /** "Descrição completa": módulos escolhidos pelo GP. */
          descricao: z.string().trim().max(4000).default(''),
          data: z.string().regex(ISO, 'Data no formato YYYY-MM-DD.'),
          horaInicio: z.string().regex(HORA, 'Hora inicial no formato HH:MM.'),
          horaFim: z.string().regex(HORA, 'Hora final no formato HH:MM.'),
          codUsu: z.number().int().positive('Executante (codUsu) inválido.'),
        })
        .refine((evento) => evento.horaFim > evento.horaInicio, {
          message: 'A hora final tem que ser depois da inicial.',
        }),
    )
    .min(1, 'Nenhum evento para lançar.')
    .max(300, 'No máximo 300 eventos por vez.'),
});

const LIMITE_DA_PLANILHA_BYTES = 5 * 1024 * 1024;

function responderErroDeValidacao(resposta: FastifyReply, erro: z.ZodError): FastifyReply {
  return resposta.status(400).send({ mensagem: erro.issues[0]?.message ?? 'Dados inválidos.' });
}

function responderErroDaAgenda(resposta: FastifyReply, erro: unknown): FastifyReply {
  if (erro instanceof PonteDoDesktopError || erro instanceof PonteDoDesktopIndisponivelError) {
    return responderErroDoShell(resposta, erro);
  }
  return resposta.status(502).send({ mensagem: (erro as Error).message });
}

/** `dd/MM/yyyy`+hora no formato `YYYY-MM-DD HH:mm:ss` -> casa por nome com a Agenda. */
function bate(termo: string, recurso: RecursoAgenda): boolean {
  if (!termo) return true;
  const alvo = chaveNome(termo);
  if (!alvo) return true;
  if (String(recurso.codusu ?? '').includes(termo.trim())) return true;
  return (
    pessoasCorrespondem(recurso.nomeusu, termo) ||
    nomesCorrespondem(chaveNome(recurso.nomeusu), alvo) ||
    chaveNome(recurso.nomeusu).includes(alvo)
  );
}

/** OS da Experience com o `codusu` do membro, resolvido por nome (sem id compartilhado entre os dois sistemas). */
interface OrdemComMembro extends OrdemExperience {
  codusuResolvido: number | null;
}

/**
 * Termos para a pesquisa no cadastro de usuários do ERP. Login Sankhya é
 * `nome.ultimo_sobrenome` e a pesquisa não acha nome completo com várias palavras: tenta o
 * login montado e, sem resultado, só o sobrenome (filtrado depois por `bate`).
 */
export function termosDaPesquisaDeUsuario(termo: string): string[] {
  const palavras = termo.trim().split(/\s+/).filter(Boolean);
  const primeiro = palavras[0];
  const ultimo = palavras.at(-1);
  if (palavras.length < 2 || !primeiro || !ultimo) return palavras.length ? [termo.trim()] : [];
  return [`${primeiro}.${ultimo}`, ultimo];
}

interface UsuarioPesquisado {
  codusu: number;
  nomeusu: string;
  nomeCompleto: string;
  descrcargo: string;
}

/** Quem não está na lista de executantes da Agenda do usuário logado (spec seção 6). */
async function pesquisarForaDaAgenda(
  agendaDaEquipe: AgendaDaEquipe,
  termo: string,
): Promise<RecursoAgenda[]> {
  for (const consulta of termosDaPesquisaDeUsuario(termo)) {
    const { conteudo } = await agendaDaEquipe.pesquisarUsuariosDoErp(consulta);
    const { usuarios } = JSON.parse(conteudo) as { usuarios: UsuarioPesquisado[] };
    const achados = usuarios
      .filter(
        (u) =>
          Number.isSafeInteger(u.codusu) &&
          u.codusu > 0 &&
          (pessoasCorrespondem(u.nomeCompleto, termo) ||
            bate(termo, { codusu: u.codusu, nomeusu: u.nomeusu } as RecursoAgenda)),
      )
      .map((u) => ({
        codusu: u.codusu,
        nomeusu: u.nomeusu,
        codcargo: null,
        descrcargo: u.descrcargo,
        corHex: '',
        corConflitoHex: '',
        problemaConexao: '',
      }));
    if (achados.length) return achados;
  }
  return [];
}

function resolverMembroDaOrdem(ordem: OrdemExperience, membros: RecursoAgenda[]): number | null {
  // Mais de um membro candidato fica sem dono: melhor "fora da equipe" que OS na pessoa errada.
  const achados = membros.filter((membro) => pessoasCorrespondem(membro.nomeusu, ordem.pessoa));
  return achados.length === 1 ? (achados[0]?.codusu ?? null) : null;
}

/** Consultor da planilha → quem está no projeto na Experience; mais de um candidato fica sem dono. */
export function pessoaDoConsultor(
  texto: string,
  pessoas: PessoaDoProjetoExperience[],
): PessoaDoProjetoExperience | null {
  const achados = pessoas.filter((pessoa) => pessoasCorrespondem(pessoa.nome, texto));
  return achados.length === 1 ? (achados[0] ?? null) : null;
}

/** Login do ERP = parte antes do `@` no e-mail corporativo. Gente do cliente não tem. */
export function loginDoEmail(email: string): string | null {
  return /^([\w.-]+)@sankhya\.com\.br$/i.exec(email)?.[1]?.toLowerCase() ?? null;
}

/** Executante da Agenda pelo login: primeiro na equipe, senão no cadastro de usuários do ERP. */
async function executanteDoLogin(
  login: string,
  membros: RecursoAgenda[],
  agendaDaEquipe: AgendaDaEquipe,
): Promise<RecursoAgenda | null> {
  const membro = membros.find((m) => m.codusu !== null && m.nomeusu.toLowerCase() === login);
  if (membro) return membro;
  const { conteudo } = await agendaDaEquipe.pesquisarUsuariosDoErp(login);
  const { usuarios } = JSON.parse(conteudo) as { usuarios: UsuarioPesquisado[] };
  const usuario = usuarios.find((u) => u.nomeusu.toLowerCase() === login);
  return usuario
    ? {
        codusu: usuario.codusu,
        nomeusu: usuario.nomeusu,
        codcargo: null,
        descrcargo: usuario.descrcargo,
        corHex: '',
        corConflitoHex: '',
        problemaConexao: '',
      }
    : null;
}

/**
 * Cada Consultor distinto da planilha: `pessoa` nula = não está no projeto da Experience (o
 * GP pode inserir na equipe sem correspondência); `recurso` nulo = sem executante no ERP, e
 * as linhas dele ficam bloqueadas na hora de gravar na Agenda.
 */
export interface ConsultorDaPlanilha {
  texto: string;
  pessoa: PessoaDoProjetoExperience | null;
  recurso: RecursoAgenda | null;
}

async function resolverConsultores(
  leitura: ResultadoLeituraPlanilha,
  pessoas: PessoaDoProjetoExperience[],
  membros: RecursoAgenda[],
  agendaDaEquipe: AgendaDaEquipe,
): Promise<ConsultorDaPlanilha[]> {
  const consultores: ConsultorDaPlanilha[] = [];
  // Em sequência: a janela oculta do ERP atende uma pesquisa por vez.
  for (const texto of new Set(leitura.linhas.map((linha) => linha.consultorTexto))) {
    const pessoa = pessoaDoConsultor(texto, pessoas);
    const login = pessoa && loginDoEmail(pessoa.email);
    const recurso = login ? await executanteDoLogin(login, membros, agendaDaEquipe) : null;
    consultores.push({ texto, pessoa, recurso });
  }
  return consultores;
}

/**
 * Reserva deste cliente: parceiro da reserva ou "O quê" (sem o prefixo `[SAR #n]`, e no
 * formato do Hub `<Cliente> - <Fase>`) casam com o nome do cliente — mesmo critério da aba
 * Agenda e das OS do cliente. Sem isso o cronograma levaria a agenda de outros clientes.
 * Com o `codParc` da implantação, o parceiro igual basta.
 */
export function eventoDoCliente(
  evento: Pick<EventoAgenda, 'nomeparc' | 'descrabrev'> & Partial<Pick<EventoAgenda, 'codparc'>>,
  cliente: Pick<Cliente, 'nome' | 'nomesCompletos'>,
  codParc: number | null = null,
): boolean {
  // Lançado direto no OM: descrição livre e razão social que nem sempre bate com o cadastro.
  // O parceiro da implantação é o vínculo seguro.
  if (codParc !== null && evento.codparc === codParc) return true;
  const chaves = (cliente.nomesCompletos.length ? cliente.nomesCompletos : [cliente.nome]).map(
    chaveNome,
  );
  return [evento.nomeparc, evento.descrabrev.replace(/^\s*\[[^\]]*\]\s*/, '')].some((nome) =>
    chaves.some((chave) => nomesCorrespondem(chave, chaveNome(nome))),
  );
}

/** Base para o evento que o lote acabou de gravar entrar na conferência das próximas linhas. */
const eventoVazio: EventoAgenda = {
  nuevento: null,
  codusu: null,
  nomeusu: '',
  nomeparc: '',
  codparc: null,
  allday: 'N',
  inicio: '',
  fim: '',
  descrabrev: '',
  descrlonga: '',
  tipo: '',
  confirmado: 'S',
  sincronizar: '',
  usulancador: '',
  dhlcto: '',
  numetapa: null,
  nufap: null,
  nueventopai: null,
  financiallate: '',
  diastraso: null,
};

/**
 * Dados reais da Equipe do Projeto (`docs/specs/reserva-agenda-recursos-gp.md` passo 9):
 * quem está na equipe (persistido), a agenda de cada um (ao vivo, não pelo snapshot SQLite
 * — ver `consultarAgendaCompleta`) e as OS do projeto na Experience (quando o projeto já tem
 * `implantationId` cadastrado). Sem tradução para o formato de card do mock: quem lê aqui
 * monta a tela a partir dos tipos reais (`RecursoAgenda`, `EventoAgenda`, `OrdemExperience`).
 */
const esquemaDoMeet = z.object({
  url: z.string().startsWith('https://calendar.google.com/calendar/render?'),
  /** Presente (Meet com data), o Meet fica no projeto: é a fonte do cronograma do cliente. */
  projeto: z
    .object({
      id: z.string().uuid(),
      idProjeto: z.string().uuid(),
      data: z.string().regex(ISO),
      inicio: z.string().regex(HORA),
      fim: z.string().regex(HORA),
      titulo: z.string().trim().max(300).optional(),
      fase: z.string().trim().max(200).optional(),
      convidados: z
        .array(
          z.object({ codusu: z.number().int().positive().nullable(), nome: z.string().max(200) }),
        )
        .max(100)
        .optional(),
    })
    .nullish(),
});

export function registrarRotasDeEquipeDoProjeto(
  servidor: FastifyInstance,
  agendaDaEquipe: AgendaDaEquipe,
  experience: ExperienceDaEquipe,
  repositorioClientes: RepositorioDaEquipe,
): void {
  /** Parceiro do projeto na Experience; falha cai no casamento por nome (comportamento antigo). */
  const parceiroDoProjeto = async (implantationId: number | null): Promise<number | null> => {
    if (implantationId === null) return null;
    try {
      return await experience.parceiroDaImplantacao(implantationId);
    } catch {
      return null;
    }
  };

  /** Salva o Meet pela janela oculta do shell; erro = a tela abre o link para o GP salvar. */
  servidor.post('/api/google/meet', async (requisicao, resposta) => {
    const dados = esquemaDoMeet.safeParse(requisicao.body ?? {});
    if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
    let resultado: { meet: string } | null = null;
    let falha: unknown = null;
    try {
      resultado = await agendaDaEquipe.criarMeetNoGoogle(dados.data.url);
    } catch (erro) {
      falha = erro;
    }
    const alvo = dados.data.projeto;
    if (alvo) {
      // Sem salvar sozinho a tela abre o link para o GP salvar: guarda assim mesmo, sem link.
      const { id, idProjeto, ...meet } = { ...alvo, link: resultado?.meet || null };
      const mesmo = (m: MeetDoProjeto) =>
        m.data === meet.data &&
        m.inicio === meet.inicio &&
        m.fim === meet.fim &&
        (m.titulo ?? '') === (meet.titulo ?? '');
      // O Meet já está no Google: falha ao guardar só o tira do cronograma.
      await repositorioClientes
        .alterarProjeto(id, idProjeto, (projeto) => ({
          meets: [...(projeto.meets ?? []).filter((m) => !mesmo(m)), meet],
        }))
        .catch((erro: Error) => requisicao.log.warn({ erro }, 'meet-nao-gravado-no-projeto'));
    }
    return falha ? responderErroDaAgenda(resposta, falha) : resultado;
  });

  servidor.get('/api/equipes/resumo', async (requisicao, resposta) => {
    const periodo = esquemaDoPeriodo.safeParse(requisicao.query);
    if (!periodo.success) return responderErroDeValidacao(resposta, periodo.error);
    if (periodo.data.de > periodo.data.ate)
      return resposta
        .status(400)
        .send({ mensagem: 'O fim deve ser igual ou posterior ao início.' });

    try {
      const cadastrados = await repositorioClientes.listar();
      const clientes = await Promise.all(
        cadastrados.map(async (cliente) => ({
          id: cliente.id,
          nome: cliente.nome,
          projetos: await Promise.all(
            cliente.projetos
              .filter((p) => p.membros.length > 0)
              .map(async (projeto) => {
                const base = {
                  id: projeto.id,
                  nome: projeto.nome,
                  faseAtual: projeto.faseAtual ?? null,
                  membros: projeto.membros,
                };
                if (projeto.implantationId == null)
                  return {
                    ...base,
                    os: null,
                    avisoOs:
                      'Projeto sem implantation_id da Experience cadastrado — sem OS pra mostrar.',
                  };
                try {
                  const ordens = await experience.ordens(
                    projeto.implantationId,
                    null,
                    periodo.data.de,
                    periodo.data.ate,
                  );
                  return {
                    ...base,
                    os: ordens.map((ordem) => ({
                      ...ordem,
                      codusuResolvido: resolverMembroDaOrdem(ordem, projeto.membros),
                    })),
                    avisoOs: null,
                  };
                } catch (erro) {
                  if (erro instanceof SessaoExpiradaError) throw erro;
                  return { ...base, os: null, avisoOs: (erro as Error).message };
                }
              }),
          ),
        })),
      );
      return { clientes: clientes.filter((cliente) => cliente.projetos.length > 0) };
    } catch (erro) {
      if (erro instanceof SessaoExpiradaError)
        return resposta.status(409).send({
          mensagem: erro.message,
          sessaoExpirada: true,
          configuracaoPendente: 'sessao-experience',
        });
      throw erro;
    }
  });

  /** "Adicionar pessoa": busca ao vivo entre todos os executantes com evento no período. */
  servidor.get('/api/agenda/recursos', async (requisicao, resposta) => {
    const dados = esquemaDaBusca.safeParse(requisicao.query);
    if (!dados.success) return responderErroDeValidacao(resposta, dados.error);

    try {
      const agenda = await consultarAgendaCompleta(agendaDaEquipe, dados.data);
      const recursos = agenda.recursos
        .map((item) => item.recurso)
        .filter((recurso) => recurso.codusu !== null && bate(dados.data.termo, recurso));
      if (!dados.data.termo) return { recursos };
      // Falha aqui não derruba a busca: a lista da Agenda já respondeu.
      try {
        const naAgenda = new Set(recursos.map((recurso) => recurso.codusu));
        const fora = (await pesquisarForaDaAgenda(agendaDaEquipe, dados.data.termo))
          .filter((recurso) => !naAgenda.has(recurso.codusu))
          .map((recurso) => ({ ...recurso, foraDaAgenda: true }));
        return { recursos: [...recursos, ...fora] };
      } catch (erro) {
        return {
          recursos,
          aviso: `Não foi possível pesquisar fora da sua Agenda de Recursos: ${(erro as Error).message}`,
        };
      }
    } catch (erro) {
      return responderErroDaAgenda(resposta, erro);
    }
  });

  servidor.get('/api/clientes/:id/projetos/:idProjeto/equipe', async (requisicao, resposta) => {
    const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
    if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);

    const periodo = esquemaDoPeriodo.safeParse(requisicao.query);
    if (!periodo.success) return responderErroDeValidacao(resposta, periodo.error);

    const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
    if (!cliente) return resposta.status(404).send({ mensagem: 'Cliente não encontrado.' });

    const projeto = cliente.projetos.find((p) => p.id === parametros.data.idProjeto);
    if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

    let eventos: (EventoAgenda & { doCliente: boolean })[];
    try {
      const codususDaEquipe = new Set(projeto.membros.map((membro) => membro.codusu));
      const [agenda, codParc] = await Promise.all([
        consultarAgendaCompleta(agendaDaEquipe, periodo.data),
        parceiroDoProjeto(projeto.implantationId),
      ]);
      eventos = agenda.recursos
        .filter((item) => item.recurso.codusu !== null && codususDaEquipe.has(item.recurso.codusu))
        .flatMap((item) => item.eventos)
        .map((evento) => ({ ...evento, doCliente: eventoDoCliente(evento, cliente, codParc) }));
    } catch (erro) {
      return responderErroDaAgenda(resposta, erro);
    }

    if (projeto.implantationId === null) {
      return {
        membros: projeto.membros,
        eventos,
        meets: projeto.meets ?? [],
        implantationId: null,
        os: null,
        avisoOs: 'Projeto sem implantation_id da Experience cadastrado — sem OS pra mostrar.',
      };
    }

    try {
      const [ordens, pessoas] = await Promise.all([
        experience.ordens(projeto.implantationId, null, periodo.data.de, periodo.data.ate),
        // Sem a lista de pessoas a tela ainda mostra equipe e OS: o erro vira aviso.
        experience
          .pessoasDoProjeto(projeto.implantationId, true)
          .then((lista) => ({ lista, aviso: null }))
          .catch((erro: Error) => {
            if (erro instanceof SessaoExpiradaError) throw erro;
            return { lista: [], aviso: `Usuários do projeto na Experience: ${erro.message}` };
          }),
      ]);
      // Homologação com a GP: a resposta não vai para o log; sem isto, lista vazia e erro
      // ficam iguais vistos de fora.
      requisicao.log.info(
        {
          equipe: {
            projeto: projeto.nome,
            implantationId: projeto.implantationId,
            pessoasExperience: pessoas.lista.length,
            // 0 com usuário chave no projeto = o campo "Processo" tem outro nome na resposta.
            comProcesso: pessoas.lista.filter((p) => p.processo).length,
            os: ordens.length,
            aviso: pessoas.aviso,
          },
        },
        'equipe: usuários da Experience',
      );
      const os: OrdemComMembro[] = ordens.map((ordem) => ({
        ...ordem,
        codusuResolvido: resolverMembroDaOrdem(ordem, projeto.membros),
      }));
      return {
        membros: projeto.membros,
        eventos,
        meets: projeto.meets ?? [],
        implantationId: projeto.implantationId,
        os,
        pessoasExperience: pessoas.lista,
        avisoPessoas: pessoas.aviso,
        lembretesSankhyaId: projeto.lembretesSankhyaId ?? {},
      };
    } catch (erro) {
      if (erro instanceof SessaoExpiradaError) {
        return resposta.status(409).send({
          mensagem: erro.message,
          sessaoExpirada: true,
          configuracaoPendente: 'sessao-experience',
        });
      }
      return resposta.status(502).send({ mensagem: (erro as Error).message });
    }
  });

  /** Reenvio do e-mail de verificação do Sankhya ID pela Experience; só no clique do GP. */
  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/pessoas/:personId/lembrete-sankhya-id',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto
        .extend({ personId: z.coerce.number().int().positive('person_id inválido.') })
        .safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const { id, idProjeto, personId } = parametros.data;

      const cliente = await repositorioClientes.buscarPorId(id);
      if (!cliente?.projetos.some((p) => p.id === idProjeto))
        return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

      try {
        await experience.reenviarEmailDoSankhyaId(personId);
      } catch (erro) {
        if (erro instanceof SessaoExpiradaError)
          return resposta.status(409).send({
            mensagem: erro.message,
            sessaoExpirada: true,
            configuracaoPendente: 'sessao-experience',
          });
        if (erro instanceof RecusaDaExperienceError)
          return resposta.status(409).send({ mensagem: erro.message });
        return resposta.status(502).send({ mensagem: (erro as Error).message });
      }
      const enviadoEm = new Date().toISOString();
      await repositorioClientes.alterarProjeto(id, idProjeto, (projeto) => ({
        lembretesSankhyaId: { ...projeto.lembretesSankhyaId, [personId]: enviadoEm },
      }));
      return { enviadoEm };
    },
  );

  /**
   * Duplo clique no dia: exclui um evento da Agenda de Recursos. Conferido ao vivo antes —
   * só evento do dia, de quem está na equipe e deste cliente (não apaga agenda de outro cliente).
   */
  servidor.delete(
    '/api/clientes/:id/projetos/:idProjeto/agenda/eventos/:nuEvento',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto
        .extend({ nuEvento: z.coerce.number().int().positive('Evento inválido.') })
        .safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const data = z
        .string()
        .regex(ISO, 'Informe "data" no formato YYYY-MM-DD.')
        .safeParse((requisicao.query as { data?: unknown }).data);
      if (!data.success) return responderErroDeValidacao(resposta, data.error);
      const { id, idProjeto, nuEvento } = parametros.data;

      const cliente = await repositorioClientes.buscarPorId(id);
      const projeto = cliente?.projetos.find((p) => p.id === idProjeto);
      if (!cliente || !projeto)
        return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

      try {
        const [agenda, codParc] = await Promise.all([
          consultarAgendaCompleta(agendaDaEquipe, { de: data.data, ate: data.data }),
          parceiroDoProjeto(projeto.implantationId),
        ]);
        const evento = agenda.recursos
          .flatMap((item) => item.eventos)
          .find((e) => e.nuevento === nuEvento);
        if (!evento)
          return resposta.status(404).send({ mensagem: 'Evento não está mais na Agenda.' });
        const daEquipe = projeto.membros.some(
          (m) => m.codusu !== null && m.codusu === evento.codusu,
        );
        if (!daEquipe || !eventoDoCliente(evento, cliente, codParc))
          return resposta
            .status(403)
            .send({ mensagem: 'Só dá para excluir evento deste cliente, de quem está na equipe.' });
        await agendaDaEquipe.cancelarEventoNaAgenda(nuEvento);
        requisicao.log.info(
          { equipe: { projeto: projeto.nome, nuEvento, evento: descreverEvento(evento) } },
          'equipe: evento excluído da Agenda',
        );
        return { mensagem: `Evento ${descreverEvento(evento)} excluído da Agenda de Recursos.` };
      } catch (erro) {
        return responderErroDaAgenda(resposta, erro);
      }
    },
  );

  servidor.get('/api/equipes/planilha-modelo', async (_requisicao, resposta) =>
    resposta
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="modelo-equipe-hub.xlsx"')
      .send(await gerarModeloEquipeXlsx()),
  );

  /**
   * Importar planilha = só prévia: lê as linhas e casa cada Consultor com quem está no
   * projeto da Experience. Nada é gravado aqui; o GP edita e confirma pelo lote abaixo.
   */
  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/planilha/previa',
    { bodyLimit: LIMITE_DA_PLANILHA_BYTES },
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);

      const dados = esquemaDaPrevia.safeParse(requisicao.body ?? {});
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
      if (projeto.implantationId === null)
        return resposta.status(400).send({
          mensagem:
            'Cadastre o ID do projeto na Experience (implantation_id) antes de importar a planilha.',
        });

      let leitura: ResultadoLeituraPlanilha;
      try {
        leitura = await interpretarPlanilhaEquipe(Buffer.from(dados.data.arquivoBase64, 'base64'));
      } catch {
        return resposta.status(400).send({
          mensagem:
            'Não foi possível ler o arquivo. Envie um .xlsx (modelo do Hub ou cronograma com a aba "Cópia de Cronograma_FAP").',
        });
      }

      let pessoas: PessoaDoProjetoExperience[];
      try {
        pessoas = await experience.pessoasDoProjeto(projeto.implantationId);
      } catch (erro) {
        if (erro instanceof SessaoExpiradaError)
          return resposta.status(409).send({
            mensagem: erro.message,
            sessaoExpirada: true,
            configuracaoPendente: 'sessao-experience',
          });
        return resposta.status(502).send({ mensagem: (erro as Error).message });
      }

      try {
        const consultores = await resolverConsultores(
          leitura,
          pessoas,
          projeto.membros,
          agendaDaEquipe,
        );
        return { linhas: leitura.linhas, erros: leitura.erros, consultores };
      } catch (erro) {
        return responderErroDaAgenda(resposta, erro);
      }
    },
  );

  /**
   * Grava na Agenda o que o GP confirmou na prévia, um evento por vez (a janela oculta é
   * uma só). Falha numa linha não para as outras; o que já existe é pulado.
   */
  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/agenda/lote',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);

      const dados = esquemaDoLote.safeParse(requisicao.body ?? {});
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
      const { eventos } = dados.data;

      const cliente = await repositorioClientes.buscarPorId(parametros.data.id);
      const projeto = cliente?.projetos.find((p) => p.id === parametros.data.idProjeto);
      if (!projeto) return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

      const datas = eventos.map((evento) => evento.data).sort();
      let existentes: EventoAgenda[];
      let codParc: number | null = null;
      try {
        // Parceiro do projeto: a Experience só aceita tarefa sobre evento com ele.
        if (projeto.implantationId !== null)
          codParc = await experience.parceiroDaImplantacao(projeto.implantationId);
        const agenda = await consultarAgendaCompleta(agendaDaEquipe, {
          de: datas[0]!,
          ate: datas.at(-1)!,
        });
        existentes = agenda.recursos.flatMap((item) => item.eventos);
      } catch (erro) {
        if (erro instanceof SessaoExpiradaError)
          return resposta.status(409).send({ mensagem: erro.message, sessaoExpirada: true });
        return responderErroDaAgenda(resposta, erro);
      }

      const resultados: { situacao: 'gravado' | 'ja-existia' | 'erro'; mensagem?: string }[] = [];
      for (const evento of eventos) {
        const situacao = situacaoNaAgenda(existentes, evento, codParc);
        if (situacao.tipo === 'existente') {
          resultados.push({ situacao: 'ja-existia' });
          continue;
        }
        if (situacao.tipo === 'ocupado') {
          resultados.push({
            situacao: 'erro',
            mensagem: `${evento.data.split('-').reverse().join('/')} já tem ${situacao.eventos.map(descreverEvento).join('; ')}`,
          });
          continue;
        }
        try {
          await agendaDaEquipe.salvarEventoNaAgenda({
            titulo: evento.titulo,
            descricao: evento.descricao,
            start: paraDataHoraSankhya(evento.data, evento.horaInicio),
            end: paraDataHoraSankhya(evento.data, evento.horaFim),
            codUsu: evento.codUsu,
            codParc,
          });
          // O mesmo lote não grava duas vezes o mesmo horário.
          existentes.push({
            ...eventoVazio,
            codusu: evento.codUsu,
            codparc: codParc,
            inicio: `${evento.data} ${evento.horaInicio}:00`,
            fim: `${evento.data} ${evento.horaFim}:00`,
            descrabrev: evento.titulo,
          });
          resultados.push({ situacao: 'gravado' });
        } catch (erro) {
          resultados.push({ situacao: 'erro', mensagem: (erro as Error).message });
        }
      }
      return { resultados };
    },
  );
}
