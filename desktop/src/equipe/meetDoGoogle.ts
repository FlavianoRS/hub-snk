/**
 * "Gerar Meet" sem o clique do GP no Salvar: abre o evento pré-preenchido do Google Agenda
 * numa janela oculta da partição do Google — a mesma do painel do Gmail/Chat, já logada —,
 * lê o link do Meet do formulário e clica Salvar. Seletores conferidos ao vivo em 2026-10-29
 * (`#xSaveBu`, aria-label "Salvar"; o Meet aparece no texto do formulário antes de salvar).
 * O diálogo "enviar convite?" (evento com convidados) não foi visto ao vivo: procura o botão
 * pelo texto. Qualquer falha devolve erro e a tela cai no fluxo manual (link no navegador).
 */
import { session } from 'electron';
import { PARTICAO_GOOGLE } from '../config';
import { userAgentDeNavegador } from '../interface/comunicacao';
import { logEvento } from '../log';
import { criarJanelaOculta } from '../sankhya/loginOcultoSankhya';

export const PREFIXO_DO_EVENTO_GOOGLE = 'https://calendar.google.com/calendar/render?';
const LIMITE_MS = 30_000;
const INTERVALO_MS = 500;

export interface ResultadoDoMeet {
  ok: boolean;
  meet?: string;
  erro?: string;
}

/** Botões de Meet do editor, só para o diagnóstico (clicar em "Google Meet" não gerou o link). */
const BOTOES_DE_MEET = String.raw`[...document.querySelectorAll('button, [role=button]')]
  .filter((b) => /videoconfer|google meet/i.test((b.getAttribute('aria-label') ?? '') + ' ' + b.textContent)
    && !/participar|join|meet\.google\.com/i.test((b.getAttribute('aria-label') ?? '') + ' ' + b.textContent))`;

/** Formulário pronto: devolve o link do Meet; `'login'` se o Google pediu login. */
const LER_FORMULARIO = String.raw`(() => {
  if (location.hostname !== 'calendar.google.com') return 'login';
  const meet = document.body.innerText.match(/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
  const salvar = document.querySelector('#xSaveBu');
  if (meet && salvar) return meet[0];
  return null;
})()`;

/** Responde o diálogo de convite, se houver; `'ok'` quando a página sai do editor. */
const ACOMPANHAR_SALVAMENTO = String.raw`(() => {
  const enviar = [...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')]
    .find((b) => /^(Enviar|Send)$/.test(b.textContent.trim()));
  if (enviar) { enviar.click(); return null; }
  return location.pathname.includes('eventedit') ? null : 'ok';
})()`;

/** Retrato da página quando algo não confirma: caminho, diálogo aberto e botões visíveis. */
const DIAGNOSTICO = String.raw`(() => {
  const salvar = document.querySelector('#xSaveBu');
  const dialogo = document.querySelector('[role=dialog], [role=alertdialog]');
  return {
    host: location.hostname,
    caminho: location.pathname,
    salvar: salvar ? { desabilitado: salvar.getAttribute('aria-disabled') ?? salvar.disabled ?? null } : null,
    meetNoTexto: /meet\.google\.com\//.test(document.body.innerText),
    botoesDeMeet: ${BOTOES_DE_MEET}.map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 80)).slice(0, 5),
    dialogo: dialogo ? dialogo.innerText.slice(0, 400) : null,
    botoesDoDialogo: dialogo ? [...dialogo.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 10) : [],
    alertas: [...document.querySelectorAll('[role=alert], [aria-live=assertive]')].map((a) => a.innerText.trim()).filter(Boolean).slice(0, 5),
  };
})()`;

async function falhar(
  janela: ReturnType<typeof criarJanelaOculta>,
  etapa: string,
  erro: string,
  inicio: number,
): Promise<ResultadoDoMeet> {
  const pagina = await janela.webContents.executeJavaScript(DIAGNOSTICO).catch(String);
  logEvento('google-meet-nao-confirmou', { etapa, erro, ms: Date.now() - inicio, pagina });
  return { ok: false, erro };
}

let fila: Promise<unknown> = Promise.resolve();

/** Um evento por vez: cada um abre e fecha a própria janela. */
export function criarMeetNoGoogle(url: string): Promise<ResultadoDoMeet> {
  const vez = fila.then(() => executar(url));
  fila = vez.catch(() => undefined);
  return vez;
}

/**
 * O `vcon=meet` do link às vezes é ignorado pelo Google (visto ao vivo em 2026-11-03: editor
 * pronto, Salvar ativo, sem Meet, nem clicando no botão "Google Meet"). Quando dá certo o Meet
 * aparece em 2–4 s; sem ele em 7 s, a janela fecha sem salvar e o link abre de novo. Visto
 * ao vivo: 3 recusas seguidas no mesmo dia acontecem (7 Meets, 1 escapou com 3 tentativas).
 */
const TENTATIVAS = 5;
const LIMITE_DO_MEET_MS = 7_000;

async function executar(url: string): Promise<ResultadoDoMeet> {
  // A janela oculta é logada no Google: só o editor de evento entra nela.
  if (!url.startsWith(PREFIXO_DO_EVENTO_GOOGLE))
    return { ok: false, erro: 'Endereço fora do Google Agenda.' };
  const sessao = session.fromPartition(PARTICAO_GOOGLE);
  sessao.setUserAgent(userAgentDeNavegador(sessao.getUserAgent()));
  const inicio = Date.now();
  for (let tentativa = 1; ; tentativa++) {
    const resultado = await tentar(url, inicio, tentativa, tentativa === TENTATIVAS);
    if (resultado !== 'sem-meet') return resultado;
    logEvento('google-meet-repetindo', {
      tentativa,
      ms: Date.now() - inicio,
      datas: new URL(url).searchParams.get('dates'),
    });
  }
}

async function tentar(
  url: string,
  inicio: number,
  tentativa: number,
  ultima: boolean,
): Promise<ResultadoDoMeet | 'sem-meet'> {
  const janela = criarJanelaOculta(PARTICAO_GOOGLE);
  try {
    // O Google redireciona (render → eventedit); o loadURL pode rejeitar no meio disso.
    await janela.loadURL(url).catch(() => undefined);
    const meet = await esperar(
      () => janela.webContents.executeJavaScript(LER_FORMULARIO),
      LIMITE_DO_MEET_MS,
    );
    if (!meet && !ultima) return 'sem-meet';
    if (!meet)
      return await falhar(
        janela,
        'formulario',
        `O Google Agenda não montou o evento com Meet (${TENTATIVAS} tentativas).`,
        inicio,
      );
    if (meet === 'login')
      return await falhar(
        janela,
        'login',
        'Google não está logado no Hub. Entre no Gmail pelo painel.',
        inicio,
      );
    const formularioMs = Date.now() - inicio;
    await janela.webContents.executeJavaScript(`document.querySelector('#xSaveBu').click()`);
    const salvo = await esperar(() => janela.webContents.executeJavaScript(ACOMPANHAR_SALVAMENTO));
    if (!salvo)
      return await falhar(
        janela,
        'salvar',
        'O Google Agenda não confirmou o salvamento a tempo.',
        inicio,
      );
    logEvento('google-meet-criado', {
      tentativa,
      formularioMs,
      ms: Date.now() - inicio,
      datas: new URL(url).searchParams.get('dates'),
    });
    return { ok: true, meet: `https://${meet}` };
  } catch (erro) {
    logEvento('google-meet-falhou', { erro: String(erro) });
    return { ok: false, erro: String(erro) };
  } finally {
    janela.destroy();
  }
}

async function esperar(ler: () => Promise<unknown>, limite = LIMITE_MS): Promise<string | null> {
  const fim = Date.now() + limite;
  while (Date.now() < fim) {
    const valor = await ler().catch(() => null);
    if (typeof valor === 'string') return valor;
    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
  }
  return null;
}
