/**
 * Dados do projeto que só a Equipe do Projeto (GP) mantém — mapeamento Etapa/Procedimento da
 * Experience, fases e fase atual, `implantation_id`, membros da equipe — e o envio do
 * cronograma ao cliente por e-mail.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ClienteNaoEncontradoError,
  ProcessoDeMapeamentoDuplicadoError,
  ProjetoNaoEncontradoError,
} from '../repositorio/repositorioClientes.ts';
import type { EmailDaEquipe, RepositorioDaEquipe } from './portas.ts';
import { EmailNaoConfiguradoError } from './portas.ts';

const TAMANHO_MAXIMO_DO_ASSUNTO = 300;
const TAMANHO_MAXIMO_DO_TEXTO = 100_000;

const esquemaDeParametrosDeProjeto = z.object({
  id: z.string().uuid('Identificador de cliente inválido.'),
  idProjeto: z.string().uuid('Identificador de projeto inválido.'),
});

const esquemaDeParametrosDeMembro = esquemaDeParametrosDeProjeto.extend({
  /** `codusu`, ou o nome de quem está sem correspondência (`codusu` nulo). */
  codUsu: z
    .string()
    .trim()
    .min(1, 'Identificador de membro inválido.')
    .transform((valor) => (/^\d+$/.test(valor) ? Number(valor) : valor)),
});

/**
 * De-para Processo → Etapa/Procedimento da Sankhya Experience (seção 4.2 da spec de
 * reserva de agenda). Substitui a lista inteira: é tabela pequena, mantida pelo GP.
 */
const esquemaDeMapeamentoExperience = z.object({
  mapeamento: z.array(
    z.object({
      processo: z
        .string({ error: 'Informe o nome do Processo.' })
        .trim()
        .min(1, 'Informe o nome do Processo.'),
      stageId: z.number({ error: 'Informe o id da Etapa (stage_id).' }).int().positive(),
      processesIds: z
        .array(z.number().int().positive())
        .min(1, 'Informe ao menos um id de Processo (processes_ids).'),
      procedureIds: z
        .array(z.number().int().positive())
        .min(1, 'Informe ao menos um id de Procedimento (procedure_ids).'),
    }),
  ),
});

/** Sem repetida (caixa/espaço não contam) nem vazia; a ordem do GP fica. */
const esquemaDeFases = z.object({
  fases: z
    .array(z.string().trim().max(80, 'Fase com até 80 caracteres.'))
    .max(100, 'No máximo 100 fases por projeto.')
    .transform((fases) => {
      const vistas = new Set<string>();
      return fases.filter((fase) => {
        const chave = fase.toLocaleLowerCase('pt-BR');
        if (!fase || vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      });
    }),
  /** Omitida: mantém a atual. Fora da lista de fases vira `null`. */
  faseAtual: z.string().trim().max(80).nullable().optional(),
});

/** `implantation_id` da Experience para este projeto — digitado à mão (seção "passo 9" da spec). */
const esquemaDeImplantationId = z.object({
  implantationId: z.number({ error: 'Informe o implantation_id.' }).int().positive().nullable(),
});

/**
 * Snapshot do `RecursoAgenda` (Agenda de Recursos) de quem entra na equipe do projeto —
 * mesmo formato devolvido pela busca "Adicionar pessoa".
 */
const esquemaDeMembro = z.object({
  /** `null`: inserido pela planilha sem correspondência na Experience/ERP — bloqueia a Agenda. */
  codusu: z.number({ error: 'Informe o codusu.' }).int().positive().nullable(),
  nomeusu: z.string().trim().min(1, 'Informe o nome do recurso.'),
  codcargo: z.number().int().nullable().default(null),
  descrcargo: z.string().default(''),
  corHex: z.string().default(''),
  corConflitoHex: z.string().default(''),
  problemaConexao: z.string().default(''),
  usuarioChave: z.boolean().default(false),
  personId: z.number().int().positive().nullable().default(null),
  /** Convite do Meet de quem não tem usuário no Sankhya (usuário chave do cliente). */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((email) => email === '' || /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email), {
      error: 'E-mail inválido.',
    })
    .default(''),
});

const esquemaDoCronograma = z.object({
  para: z
    .array(z.string().trim().toLowerCase().email('E-mail inválido no "Para".'))
    .min(1, 'Informe ao menos um e-mail no "Para".')
    .max(50, 'No máximo 50 destinatários.'),
  assunto: z.string().trim().min(1, 'Informe o assunto.').max(TAMANHO_MAXIMO_DO_ASSUNTO),
  /* Montados pela tela a partir das reservas da Agenda (o Hub é local, de um usuário só). */
  html: z.string().min(1, 'Selecione ao menos um meet.').max(TAMANHO_MAXIMO_DO_TEXTO),
  texto: z.string().min(1, 'Selecione ao menos um meet.').max(TAMANHO_MAXIMO_DO_TEXTO),
});

function responderErroDeValidacao(resposta: FastifyReply, erro: z.ZodError): FastifyReply {
  const primeiraMensagem = erro.issues[0]?.message ?? 'Dados inválidos.';
  return resposta.status(400).send({ mensagem: primeiraMensagem });
}

function responderErroDeDominio(resposta: FastifyReply, erro: unknown): FastifyReply {
  if (erro instanceof ClienteNaoEncontradoError)
    return resposta.status(404).send({ mensagem: 'Cliente não encontrado.' });
  if (erro instanceof ProjetoNaoEncontradoError)
    return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });
  if (erro instanceof ProcessoDeMapeamentoDuplicadoError)
    return resposta.status(409).send({ mensagem: erro.message });
  throw erro;
}

export function registrarRotasDoProjetoDaEquipe(
  servidor: FastifyInstance,
  repositorio: RepositorioDaEquipe,
  email: EmailDaEquipe,
): void {
  servidor.put(
    '/api/clientes/:id/projetos/:idProjeto/mapeamento-experience',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const dados = esquemaDeMapeamentoExperience.safeParse(requisicao.body);
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
      try {
        return await repositorio.definirMapeamentoExperienceDoProjeto(
          parametros.data.id,
          parametros.data.idProjeto,
          dados.data.mapeamento,
        );
      } catch (erro) {
        return responderErroDeDominio(resposta, erro);
      }
    },
  );

  servidor.put('/api/clientes/:id/projetos/:idProjeto/fases', async (requisicao, resposta) => {
    const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
    if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
    const dados = esquemaDeFases.safeParse(requisicao.body);
    if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
    try {
      return await repositorio.definirFasesDoProjeto(
        parametros.data.id,
        parametros.data.idProjeto,
        dados.data.fases,
        dados.data.faseAtual,
      );
    } catch (erro) {
      return responderErroDeDominio(resposta, erro);
    }
  });

  servidor.put(
    '/api/clientes/:id/projetos/:idProjeto/implantation-id',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const dados = esquemaDeImplantationId.safeParse(requisicao.body);
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
      try {
        return await repositorio.definirImplantationIdDoProjeto(
          parametros.data.id,
          parametros.data.idProjeto,
          dados.data.implantationId,
        );
      } catch (erro) {
        return responderErroDeDominio(resposta, erro);
      }
    },
  );

  servidor.post('/api/clientes/:id/projetos/:idProjeto/membros', async (requisicao, resposta) => {
    const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
    if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
    const dados = esquemaDeMembro.safeParse(requisicao.body);
    if (!dados.success) return responderErroDeValidacao(resposta, dados.error);
    try {
      return await repositorio.adicionarMembroDoProjeto(
        parametros.data.id,
        parametros.data.idProjeto,
        dados.data,
      );
    } catch (erro) {
      return responderErroDeDominio(resposta, erro);
    }
  });

  servidor.delete(
    '/api/clientes/:id/projetos/:idProjeto/membros/:codUsu',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeMembro.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      try {
        return await repositorio.removerMembroDoProjeto(
          parametros.data.id,
          parametros.data.idProjeto,
          parametros.data.codUsu,
        );
      } catch (erro) {
        return responderErroDeDominio(resposta, erro);
      }
    },
  );

  /* Um envio por projeto de cada vez: o segundo clique não pode mandar o e-mail duas vezes. */
  const enviando = new Set<string>();

  /** Cronograma do projeto (guia Equipe) para os e-mails que o GP escolheu no "Para". */
  servidor.post(
    '/api/clientes/:id/projetos/:idProjeto/cronograma/enviar',
    async (requisicao, resposta) => {
      const parametros = esquemaDeParametrosDeProjeto.safeParse(requisicao.params);
      if (!parametros.success) return responderErroDeValidacao(resposta, parametros.error);
      const dados = esquemaDoCronograma.safeParse(requisicao.body);
      if (!dados.success) return responderErroDeValidacao(resposta, dados.error);

      const cliente = await repositorio.buscarPorId(parametros.data.id);
      if (!cliente?.projetos.some((p) => p.id === parametros.data.idProjeto))
        return resposta.status(404).send({ mensagem: 'Projeto não encontrado.' });

      const chave = `cronograma:${parametros.data.idProjeto}`;
      if (enviando.has(chave))
        return resposta
          .status(409)
          .send({ mensagem: 'O cronograma deste projeto já está sendo enviado.' });
      enviando.add(chave);
      try {
        const para = [...new Set(dados.data.para)];
        await email.enviar({
          assunto: dados.data.assunto,
          texto: dados.data.texto,
          html: dados.data.html,
          para,
        });
        return { destinatarios: para };
      } catch (erro) {
        if (erro instanceof EmailNaoConfiguradoError)
          return resposta
            .status(503)
            .send({ mensagem: erro.message, configuracaoPendente: 'smtp' });
        const motivo = erro instanceof Error ? erro.message : String(erro);
        return resposta.status(502).send({ mensagem: `Falha no envio pelo SMTP: ${motivo}` });
      } finally {
        enviando.delete(chave);
      }
    },
  );
}
