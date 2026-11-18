/**
 * O que a Equipe do Projeto (GP) usa da Agenda de Recursos e do Google, pela ponte do desktop:
 * ler a agenda de todas as pessoas, gravar e cancelar evento, criar o Meet e pesquisar
 * usuários do ERP. As rotas da ponte que escrevem são do próprio módulo
 * (`desktop/src/equipe/rotasDaPonte.ts`); a leitura da agenda já existe no Hub.
 */
import { parsearAgenda, type AgendaImportada } from '../sankhya/agendaParser.ts';
import { chaveNome, nomesCorrespondem } from '../sankhya/agenda.ts';
import { RespostaDoSankhyaInvalidaError } from '../sankhya/consultasDaAgenda.ts';

/** O que a janela oculta do ERP devolve: o JSON do Sankhya, ainda em texto. */
export interface ConsultaNaGuia {
  conteudo: string;
}

/** Porta: o que o Hub precisa oferecer para o módulo falar com a ponte do desktop. */
export interface PonteDoHub {
  /**
   * `POST` com corpo JSON numa rota da ponte do desktop (`/agenda/salvar-evento`…), com a
   * mesma autenticação e o timeout das consultas na janela oculta. Erro de transporte ou da
   * ponte lança `PonteDoDesktopError` / `PonteDoDesktopIndisponivelError`.
   */
  requisitarNaPonte<T>(caminho: string, corpo: unknown): Promise<T>;
  /** Agenda de Recursos crua do período (`DD/MM/YYYY`), com todos os executantes. */
  consultarAgendaDeRecursos(de: string, ate: string): Promise<ConsultaNaGuia>;
}

export interface EventoDaEquipe {
  titulo: string;
  /** "Descrição completa" do evento (módulos escolhidos); vazio sem módulo. */
  descricao?: string;
  start: string;
  end: string;
  codUsu: number;
  /** Status "Confirmado" — a Nova Tarefa da Experience exige (spec seção 4.2). */
  confirmado?: boolean;
  /** Parceiro do cliente: sem ele a Experience não liga o evento ao projeto (422). */
  codParc?: number | null;
}

export class AgendaDaEquipe {
  readonly #ponte: PonteDoHub;

  constructor(ponte: PonteDoHub) {
    this.#ponte = ponte;
  }

  consultarAgendaDeRecursos(de: string, ate: string): Promise<ConsultaNaGuia> {
    return this.#ponte.consultarAgendaDeRecursos(de, ate);
  }

  /**
   * Cria o evento na Agenda de Recursos (`AgendaRecursosSP.salvarEvento`). Escrita: sem
   * repetição automática aqui, quem decide se tenta de novo é a rota.
   */
  salvarEventoNaAgenda(evento: EventoDaEquipe): Promise<ConsultaNaGuia> {
    return this.#ponte.requisitarNaPonte('/agenda/salvar-evento', evento);
  }

  /** Exclui (cancela) o evento na Agenda de Recursos — `AgendaRecursosSP.cancelarEvento`. */
  cancelarEventoNaAgenda(nuEvento: number): Promise<ConsultaNaGuia> {
    return this.#ponte.requisitarNaPonte('/agenda/cancelar-evento', { nuEvento });
  }

  /**
   * Salva no Google Agenda o evento do link pré-preenchido, pela janela oculta logada no
   * Google (`desktop/src/equipe/meetDoGoogle.ts`). Devolve o link do Meet.
   */
  criarMeetNoGoogle(url: string): Promise<{ meet: string }> {
    return this.#ponte.requisitarNaPonte('/google/meet', { url });
  }

  /**
   * Cadastro de usuários do ERP (fora da lista de executantes da Agenda). A ponte já devolve
   * só a lista branca de campos.
   */
  pesquisarUsuariosDoErp(termo: string): Promise<ConsultaNaGuia> {
    return this.#ponte.requisitarNaPonte('/usuarios/pesquisar', { termo });
  }
}

/** `YYYY-MM-DD` -> `DD/MM/YYYY`, formato que o Sankhya ERP espera. */
function paraFormatoBrasileiro(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Todos os recursos (executantes) com algum evento no período, e os eventos de cada um —
 * direto do ERP, sem o snapshot SQLite (`AgendaRecursos`), que só guarda a agenda do usuário
 * configurado. "Buscar pessoa" lê só os recursos; "ler equipe" lê recurso+eventos de quem já
 * está na equipe. Quem não tem nenhum evento no período não aparece, limitação aceita por ora.
 */
export async function consultarAgendaCompleta(
  agenda: Pick<AgendaDaEquipe, 'consultarAgendaDeRecursos'>,
  periodo: { de: string; ate: string },
): Promise<AgendaImportada> {
  const resultado = await agenda.consultarAgendaDeRecursos(
    paraFormatoBrasileiro(periodo.de),
    paraFormatoBrasileiro(periodo.ate),
  );
  let bruto: unknown;
  try {
    bruto = JSON.parse(resultado.conteudo);
  } catch {
    throw new RespostaDoSankhyaInvalidaError();
  }
  return parsearAgenda(bruto);
}

/**
 * Mesma pessoa no login da Agenda (`FLAVIANO.SANTOS`) e no nome completo da Experience
 * (`Flaviano Rodrigues Dos Santos`): mesmo primeiro nome, e as palavras do nome mais curto
 * aparecem, na ordem, no mais longo. Cai no critério de prefixo de `nomesCorrespondem`
 * para logins sem separador.
 */
export function pessoasCorrespondem(nomeA: string, nomeB: string): boolean {
  const palavras = (nome: string) =>
    nome
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean);
  const a = palavras(nomeA);
  const b = palavras(nomeB);
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  if (curto.length > 1 && curto[0] === longo[0]) {
    let i = 1;
    for (const palavra of longo.slice(1)) if (palavra === curto[i]) i++;
    if (i === curto.length) return true;
  }
  return nomesCorrespondem(chaveNome(nomeA), chaveNome(nomeB));
}
