/**
 * Rotas da ponte do desktop que só a Equipe do Projeto (GP) usa: gravar e cancelar evento na
 * Agenda de Recursos, salvar o Meet no Google e pesquisar usuários do ERP. O backend chama
 * estas rotas por `src/equipe/agendaDaEquipe.ts`. Entram na ponte com uma linha em
 * `backend/bridgeServer.ts` (`tratarRotaDaEquipe`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logEvento } from '../log';
import {
  cancelarEvento,
  pesquisarUsuarios,
  salvarEvento,
  type ChamadorDoErp,
  type ResultadoDoErp,
} from './agendaDaEquipe';
import { criarMeetNoGoogle } from './meetDoGoogle';

/** O que a ponte empresta às rotas do módulo: ler o corpo e responder. */
export interface FerramentasDaPonte {
  lerCorpo(req: IncomingMessage): Promise<string>;
  responderJson(res: ServerResponse, status: number, corpo: unknown): void;
  /** Falha da janela oculta é 409 com a mensagem; sucesso devolve `{ conteudo }`. */
  responderConsultaNaGuia(res: ServerResponse, resultado: ResultadoDoErp, consulta: string): void;
}

/** Trata a requisição se a rota for da Equipe; devolve `false` para a ponte seguir. */
export async function tratarRotaDaEquipe(
  req: IncomingMessage,
  res: ServerResponse,
  erp: ChamadorDoErp,
  { lerCorpo, responderJson, responderConsultaNaGuia }: FerramentasDaPonte,
): Promise<boolean> {
  if (req.method !== 'POST') return false;

  if (req.url === '/agenda/salvar-evento') {
    try {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}') as {
        titulo?: unknown;
        descricao?: unknown;
        start?: unknown;
        end?: unknown;
        codUsu?: unknown;
        confirmado?: unknown;
        codParc?: unknown;
      };
      const codUsu = Number(corpo.codUsu);
      const codParc = Number(corpo.codParc);
      if (
        typeof corpo.titulo !== 'string' ||
        typeof corpo.start !== 'string' ||
        typeof corpo.end !== 'string' ||
        !Number.isInteger(codUsu)
      ) {
        responderJson(res, 400, {
          erro: 'informe { titulo, start, end: "dd/MM/yyyy HH:mm:ss", codUsu }',
        });
        return true;
      }
      const resultado = await salvarEvento(erp, {
        titulo: corpo.titulo,
        descricao: typeof corpo.descricao === 'string' ? corpo.descricao : '',
        start: corpo.start,
        end: corpo.end,
        codUsu,
        confirmado: corpo.confirmado === true,
        codParc: Number.isInteger(codParc) && codParc > 0 ? codParc : null,
      });
      if (resultado.ok) logEvento('agenda-evento-gravado');
      responderConsultaNaGuia(res, resultado, 'salvar-evento');
    } catch (err) {
      responderJson(res, 500, { erro: String(err) });
    }
    return true;
  }

  if (req.url === '/agenda/cancelar-evento') {
    try {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}') as { nuEvento?: unknown };
      const nuEvento = Number(corpo.nuEvento);
      if (!Number.isInteger(nuEvento) || nuEvento <= 0) {
        responderJson(res, 400, { erro: 'informe { nuEvento } numérico' });
        return true;
      }
      const resultado = await cancelarEvento(erp, nuEvento);
      if (resultado.ok) logEvento('agenda-evento-cancelado', { nuEvento });
      responderConsultaNaGuia(res, resultado, 'cancelar-evento');
    } catch (err) {
      responderJson(res, 500, { erro: String(err) });
    }
    return true;
  }

  if (req.url === '/google/meet') {
    try {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}') as { url?: unknown };
      if (typeof corpo.url !== 'string') {
        responderJson(res, 400, { erro: 'informe { url }' });
        return true;
      }
      const resultado = await criarMeetNoGoogle(corpo.url);
      if (resultado.ok) responderJson(res, 200, { meet: resultado.meet });
      else responderJson(res, 409, { erro: resultado.erro });
    } catch (err) {
      responderJson(res, 500, { erro: String(err) });
    }
    return true;
  }

  if (req.url === '/usuarios/pesquisar') {
    try {
      const corpo = JSON.parse((await lerCorpo(req)) || '{}') as { termo?: unknown };
      if (typeof corpo.termo !== 'string' || !corpo.termo.trim()) {
        responderJson(res, 400, { erro: 'informe { termo }' });
        return true;
      }
      responderConsultaNaGuia(
        res,
        await pesquisarUsuarios(erp, corpo.termo.trim()),
        'pesquisar-usuarios',
      );
    } catch (err) {
      responderJson(res, 500, { erro: String(err) });
    }
    return true;
  }

  return false;
}
