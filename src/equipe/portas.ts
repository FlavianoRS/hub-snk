/**
 * Pontos de encaixe do módulo Equipe do Projeto (GP) com o resto do Hub. Tudo que o módulo
 * precisa de fora passa por aqui; `adaptadoresDoHub.ts` liga cada porta ao que o Hub tem.
 *
 * - `ApiDaExperience` (`experienceDaEquipe.ts`): requisição autenticada na Experience.
 * - `PonteDoHub` (`agendaDaEquipe.ts`): rotas da ponte do desktop e leitura da Agenda.
 * - `RepositorioDaEquipe`: persistência dos dados do projeto que a Equipe mantém.
 * - `EmailDaEquipe`: envio do cronograma ao cliente pelo SMTP do Hub.
 */
import type { RepositorioClientes } from '../repositorio/repositorioClientes.ts';

export type { ApiDaExperience } from './experienceDaEquipe.ts';
export type { PonteDoHub } from './agendaDaEquipe.ts';

/**
 * Persistência: o projeto guarda equipe, fases, fase atual, `implantation_id`, mapeamento da
 * Experience, Meets e lembretes do Sankhya ID (campos em `Projeto`, `src/tipos.ts`).
 */
export type RepositorioDaEquipe = Pick<
  RepositorioClientes,
  | 'listar'
  | 'buscarPorId'
  | 'alterarProjeto'
  | 'definirMapeamentoExperienceDoProjeto'
  | 'definirFasesDoProjeto'
  | 'definirImplantationIdDoProjeto'
  | 'adicionarMembroDoProjeto'
  | 'removerMembroDoProjeto'
>;

export interface EmailDaEquipe {
  /**
   * Envia pelo SMTP configurado no Hub, com a assinatura do usuário no fim. Sem SMTP
   * configurado, lança `EmailNaoConfiguradoError`.
   */
  enviar(mensagem: { assunto: string; texto: string; html: string; para: string[] }): Promise<void>;
}

export class EmailNaoConfiguradoError extends Error {}
