/**
 * Escritas da Equipe do Projeto (GP) na Agenda de Recursos e a pesquisa de usuários do ERP,
 * feitas na janela oculta do ERP. Só os payloads (capturados ao vivo, spec
 * `docs/specs/reserva-agenda-recursos-gp.md` seções 4 e 6): a janela, a fila e o relogin são
 * do shell e chegam pela porta `ChamadorDoErp`.
 */

/** O que a janela oculta devolve de uma chamada ao `service.sbr`. */
export interface ResultadoDoErp {
  ok: boolean;
  conteudo?: string;
  erro?: string;
}

/** Porta: o que o shell precisa oferecer para o módulo chamar serviços do ERP. */
export interface ChamadorDoErp {
  /**
   * Chama o serviço na janela oculta já logada (com fila e relogin) e devolve `ok: false`
   * quando o ERP recusa — o `service.sbr` recusa com HTTP 200 e `status` 0/3/4.
   */
  chamarServico(serviceName: string, requestBody: unknown): Promise<ResultadoDoErp>;
}

/**
 * O que a Nova Tarefa do GP precisa gravar na Agenda. Campos fora daqui (Motivo, vínculo com
 * OS) ficam de fora do payload real capturado — `cancelado` sempre `'N'`, igual ao evento de
 * teste mantido em 2026-10-26 (spec seções 3-4).
 */
export interface EventoAgendaRecursos {
  /** "O quê" da tela — vira `descrAbrev`. */
  titulo: string;
  /** "Descrição completa" da tela — vira `descricao` (módulos escolhidos pelo GP). */
  descricao?: string;
  /**
   * Status "Confirmado" do evento. A Nova Tarefa da Experience recusa (409) quando o evento
   * do OM no mesmo horário não está confirmado (spec seção 4.2). Sem ele, `'N'`.
   */
  confirmado?: boolean;
  /** `dd/MM/yyyy HH:mm:ss`. */
  start: string;
  /** `dd/MM/yyyy HH:mm:ss`. */
  end: string;
  /** `CODUSU` do executante. */
  codUsu: number;
  /** `CODPARC` do cliente: a Experience liga o evento ao projeto por ele (gravação de 16/11). */
  codParc?: number | null;
}

/** O que sai da pesquisa de usuários: só esta lista branca, nunca a linha inteira. */
export interface UsuarioPesquisado {
  codusu: number;
  nomeusu: string;
  nomeCompleto: string;
  descrcargo: string;
}

const CLIENT_EVENT = { clientEvent: [{ $: 'br.com.sankhya.mgeserv.event.envio.email' }] };

/**
 * A linha de `PesquisaSP.getSuggestion` traz os 101 campos de TSIUSU, alguns sensíveis
 * (tokens, valores de ajuda de custo): aqui fica só o que a busca de pessoas usa.
 */
export function usuariosDaPesquisa(conteudo: string): {
  usuarios: UsuarioPesquisado[];
  temMais: boolean;
} {
  const raiz = JSON.parse(conteudo) as {
    statusMessage?: string;
    responseBody?: { json?: { $?: string } };
  };
  const texto = raiz.responseBody?.json?.$;
  if (!texto) throw new Error(raiz.statusMessage ?? 'resposta sem responseBody.json');
  const dados = JSON.parse(texto) as { data?: Record<string, unknown>[]; hasMore?: boolean };
  const valor = (campo: unknown): string => {
    const bruto = campo && typeof campo === 'object' && '$' in campo ? campo.$ : campo;
    return bruto === null || bruto === undefined ? '' : String(bruto);
  };
  return {
    temMais: Boolean(dados.hasMore),
    usuarios: (dados.data ?? []).map((linha) => ({
      codusu: Number(valor(linha['CODUSU'])),
      nomeusu: valor(linha['NOMEUSU']),
      nomeCompleto: valor(linha['NOMEUSUCPLT']),
      descrcargo: valor(linha['Cargo.DESCRCARGO']),
    })),
  };
}

/**
 * Cria o evento (Nova Tarefa / reserva do GP) na Agenda de Recursos. Payload real capturado
 * ao vivo em 2026-10-26 (spec seção 4) — campos fora de `EventoAgendaRecursos` ficam
 * exatamente como no evento de teste (`cancelado: 'N'`, resto vazio).
 */
export function salvarEvento(
  erp: ChamadorDoErp,
  evento: EventoAgendaRecursos,
): Promise<ResultadoDoErp> {
  return erp.chamarServico('mgeos@AgendaRecursosSP.salvarEvento', {
    evento: {
      descricao: { $: evento.descricao ?? '' },
      descrAbrev: { $: evento.titulo },
      diaTodo: 'N',
      nuEventoPai: '',
      dhInicioPai: '',
      start: evento.start,
      end: evento.end,
      codUsu: String(evento.codUsu),
      codParc: evento.codParc ? String(evento.codParc) : '',
      codPap: '',
      numOs: '',
      subOs: '',
      nuFap: '',
      numEtapa: '',
      numContr: '',
      nuSelecao: '',
      nuCurriculo: '',
      codEtapa: '',
      confirmado: evento.confirmado ? 'S' : 'N',
      cancelado: 'N',
      motivo: '',
    },
  });
}

/** Exclui o evento: payload capturado ao vivo em 2026-10-26 (spec seção 4). */
export function cancelarEvento(erp: ChamadorDoErp, nuEvento: number): Promise<ResultadoDoErp> {
  return erp.chamarServico('mgeos@AgendaRecursosSP.cancelarEvento', {
    evento: { nuEvento: String(nuEvento), confirmado: 'N', cancelado: '', motivo: '' },
  });
}

/**
 * Pesquisa no cadastro de usuários (TSIUSU) — a mesma do "+ Adicionar" do filtro de
 * executantes da Agenda, capturada ao vivo em 2026-10-28 (spec seção 6). Acha quem não está
 * na lista de executantes do usuário.
 */
export async function pesquisarUsuarios(
  erp: ChamadorDoErp,
  termo: string,
): Promise<ResultadoDoErp> {
  const resultado = await erp.chamarServico('mge@PesquisaSP.getSuggestion', {
    criteria: {
      entityName: 'Executante',
      compacted: false,
      ignoreEntityCriteria: false,
      limit: 100,
      query: { $: termo },
      orderByDesc: false,
      options: {
        keepOpenOnSelect: true,
        allowShowHierarchicalMode: false,
        handleOnlyAnalytics: false,
      },
      externalCriteria: { query: {}, params: { param: [] } },
    },
    ...CLIENT_EVENT,
  });
  if (!resultado.ok) return resultado;
  try {
    return { ok: true, conteudo: JSON.stringify(usuariosDaPesquisa(resultado.conteudo ?? '')) };
  } catch (erro) {
    return { ok: false, erro: `pesquisa de usuários respondeu fora do esperado: ${String(erro)}` };
  }
}
