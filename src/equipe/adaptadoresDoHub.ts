/**
 * Liga as portas do módulo Equipe do Projeto (`portas.ts`) ao que este Hub tem. É o único
 * arquivo do módulo que conhece as classes do Hub: numa versão do Hub com outra estrutura,
 * só ele muda.
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { SmtpNaoConfiguradoError, type EnviadorDeEmail } from '../notificacoes/enviadorDeEmail.ts';
import type { RepositorioClientes } from '../repositorio/repositorioClientes.ts';
import type { RepositorioConfiguracao } from '../repositorio/repositorioConfiguracao.ts';
import type { Credenciais } from '../sankhya/credenciais.ts';
import type { Experience } from '../sankhya/experience.ts';
import { registrarEquipe } from './index.ts';
import { EmailNaoConfiguradoError, type EmailDaEquipe } from './portas.ts';

const escaparHtml = (texto: string) => texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Envio pelo SMTP gravado no Hub, com a assinatura do e-mail ao cliente no fim. */
export function emailDoHub(
  configuracao: Pick<RepositorioConfiguracao, 'ler'>,
  enviadorDeEmail: Pick<EnviadorDeEmail, 'enviarPeloSmtpGravado'>,
): EmailDaEquipe {
  return {
    async enviar({ assunto, texto, html, para }) {
      const { emailDoCliente } = await configuracao.ler();
      const assinatura = emailDoCliente.assinatura.trim();
      try {
        await enviadorDeEmail.enviarPeloSmtpGravado({
          assunto,
          texto,
          html: assinatura
            ? `${html}<p style="font-family:Arial,sans-serif;font-size:13px;">--<br>${escaparHtml(assinatura).replaceAll('\n', '<br>')}</p>`
            : html,
          para,
          assinatura,
        });
      } catch (erro) {
        if (erro instanceof SmtpNaoConfiguradoError)
          throw new EmailNaoConfiguradoError(erro.message);
        throw erro;
      }
    },
  };
}

/** Registra a Equipe do Projeto neste Hub: uma chamada em `src/index.ts`. */
export function registrarEquipeNoHub(
  servidor: FastifyInstance,
  hub: {
    credenciais: Credenciais;
    experience: Experience;
    clientes: RepositorioClientes;
    configuracao: RepositorioConfiguracao;
    enviadorDeEmail: EnviadorDeEmail;
    log: FastifyBaseLogger;
  },
): void {
  registrarEquipe(servidor, {
    ponte: hub.credenciais,
    experience: hub.experience,
    repositorio: hub.clientes,
    email: emailDoHub(hub.configuracao, hub.enviadorDeEmail),
    log: hub.log,
  });
}
