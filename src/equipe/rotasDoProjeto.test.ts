import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { SmtpNaoConfiguradoError } from '../notificacoes/enviadorDeEmail.ts';
import { emailDoHub } from './adaptadoresDoHub.ts';
import { EmailNaoConfiguradoError, type RepositorioDaEquipe } from './portas.ts';
import { registrarRotasDoProjetoDaEquipe } from './rotasDoProjeto.ts';

const ID_CLIENTE = '11111111-1111-4111-8111-111111111111';
const ID_PROJETO = '22222222-2222-4222-8222-222222222222';
const url = `/api/clientes/${ID_CLIENTE}/projetos/${ID_PROJETO}/cronograma/enviar`;

function servidorCom(enviar: (m: { para: string[]; html: string }) => Promise<void>) {
  const servidor = Fastify();
  const repositorio = {
    buscarPorId: async (id: string) =>
      id === ID_CLIENTE ? { id, projetos: [{ id: ID_PROJETO }] } : null,
  } as unknown as RepositorioDaEquipe;
  registrarRotasDoProjetoDaEquipe(servidor, repositorio, { enviar });
  return servidor;
}

describe('POST /api/clientes/:id/projetos/:idProjeto/cronograma/enviar', () => {
  it('manda a todos do "Para", sem repetir', async () => {
    const enviados: { para: string[]; html: string }[] = [];
    const resposta = await servidorCom(async (m) => {
      enviados.push(m);
    }).inject({
      method: 'POST',
      url,
      payload: {
        para: ['Chave@cli.com', 'chave@cli.com', 'outro@cli.com'],
        assunto: 'Cronograma 01/11/2026 a 30/11/2026',
        html: '<table></table>',
        texto: '10/11/2026 09:00–10:00 · Compras',
      },
    });
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.deepEqual(enviados[0]?.para, ['chave@cli.com', 'outro@cli.com']);
  });

  it('recusa e-mail inválido no "Para"', async () => {
    const enviados: unknown[] = [];
    const resposta = await servidorCom(async (m) => {
      enviados.push(m);
    }).inject({
      method: 'POST',
      url,
      payload: { para: ['nao-e-email'], assunto: 'x', html: '<table></table>', texto: 'x' },
    });
    assert.equal(resposta.statusCode, 400);
    assert.equal(enviados.length, 0);
  });

  it('sem SMTP configurado responde 503 com a configuração pendente', async () => {
    const resposta = await servidorCom(async () => {
      throw new EmailNaoConfiguradoError('Configure o SMTP.');
    }).inject({
      method: 'POST',
      url,
      payload: { para: ['a@cli.com'], assunto: 'x', html: '<table></table>', texto: 'x' },
    });
    assert.equal(resposta.statusCode, 503);
    assert.equal(resposta.json().configuracaoPendente, 'smtp');
  });
});

describe('emailDoHub', () => {
  const configuracao = {
    ler: async () => ({ emailDoCliente: { assinatura: 'Eu\nDS Tech' } }),
  } as never;

  it('põe a assinatura no fim do HTML', async () => {
    const enviados: { html: string }[] = [];
    await emailDoHub(configuracao, {
      enviarPeloSmtpGravado: async (m: { html?: string }) => {
        enviados.push({ html: String(m.html) });
      },
    } as never).enviar({ assunto: 'x', texto: 'x', html: '<table></table>', para: ['a@cli.com'] });
    assert.match(enviados[0]!.html, /<table><\/table>.*Eu<br>DS Tech/);
  });

  it('SMTP não configurado vira EmailNaoConfiguradoError', async () => {
    await assert.rejects(
      emailDoHub(configuracao, {
        enviarPeloSmtpGravado: async () => {
          throw new SmtpNaoConfiguradoError();
        },
      } as never).enviar({ assunto: 'x', texto: 'x', html: 'x', para: ['a@cli.com'] }),
      EmailNaoConfiguradoError,
    );
  });
});
