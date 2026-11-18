# Enviar cronograma ao cliente (visão do GP)

Origem: pedido direto em 2026-11-05. Complementa [`reserva-agenda-recursos-gp.md`](./reserva-agenda-recursos-gp.md)
(Equipe do Projeto, reservas e Meet). Planejado antes de código.

## 1. Objetivo

Botão **Enviar cronograma** na guia Equipe do Projeto. O GP escolhe período, uma ou mais fases e
uma ou mais pessoas; o Hub abre um modal no estilo "Nova mensagem" do Gmail com o cronograma em
tabela HTML no corpo e envia pelo SMTP já configurado para todos os e-mails do "Para".

## 2. Fonte dos meets: ler da Agenda, guardar só o link do Meet

| Opção                    | Cobre                                                      | Falta                                 |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------- |
| Ler da Agenda de Recursos | reservas feitas pelo Hub, pela planilha e direto no Sankhya | link do Meet (Agenda não guarda)      |
| Guardar meets no Hub     | link do Meet                                               | tudo que foi reservado antes/fora do Hub |

**Decisão (aprovada pelo usuário em 2026-11-05)**: base = eventos da Agenda que a guia Equipe já carrega
(`GET .../equipe`, `eventos` filtrados pelos `codusu` da equipe). Quando `criarMeetNoGoogle`
devolve o link, o Hub grava `{ inicio, fim, link, convidados }` em `Projeto.meets` e a linha do
cronograma ganha o link casando por `inicio`+`fim`. Sem meet gravado, coluna Meet fica "—".

- **Meets gerados pelo Hub (pedido do usuário, 2026-11-05)**: o cronograma é a agenda do Google
  que o Hub gera. O Hub não lê o Google (iCal secreto desligado pelo admin), então **guarda cada
  Meet com data no momento em que gera** — `Projeto.meets` com `data`, `inicio`, `fim`,
  `titulo`, `fase`, `convidados` (`codusu`/`nomeusu`) e `link` (`null` quando a janela oculta
  falhou e o link abriu no navegador para o GP salvar). Vale para os dois botões: "Gerar Meet"
  do cabeçalho e o Meet dos dias selecionados na agenda da equipe (este leva a fase). Meet sem
  reserva no mesmo horário vira linha própria; com reserva, junta link e convidados a ela.
  **Meets gerados antes desta versão não estão guardados** e não aparecem.
- **Quais reservas** (corrigido em 2026-11-05 com dados reais): as do cliente na prática vêm
  como `[SAR #1445] AMATOOLS COMERCIAL E IMPORTA`, parceiro `AMATOOLS COMERCIAL E IMPORTADORA
  LTDA` — quase nunca no formato do Hub. O backend marca `doCliente` (`eventoDoCliente`) quando
  o parceiro ou o título (sem `[SAR #n]`) casa com o nome do cliente, mesmo critério da aba
  Agenda e das OS (`chaveNome`/`nomesCorrespondem`, `nomesCompletos`). Evento de outro cliente
  na agenda da mesma pessoa fica de fora.
- **Fase**: sai do título no formato do Hub `<Cliente> - <Fase> | <Observação>`; reserva do
  cliente fora desse formato entra como **Sem fase**, com o título como assunto.
- **Pessoas do meet**: eventos de `codusu` diferentes com mesmo `inicio`, `fim` e título viram uma
  linha só, com todos os nomes.

## 3. Regras de interface

1. Botão **Enviar cronograma** no bloco de ações do cabeçalho da Equipe (`equipeDoProjeto.js`,
   `acoes`), ao lado de Gerar Meet.
2. Um modal só (implementação): no topo período (abre com o da Equipe; mudar reconsulta a
   Agenda), Fases e Pessoas (marcadores, todos marcados ao abrir; pessoas = quem tem reserva
   nas fases marcadas). Embaixo a mensagem com a prévia da tabela ao vivo.
3. Mensagem tipo Gmail (`<dialog>`, mesmo padrão dos modais da Equipe):
   - **Para**: chips removíveis. Vêm marcados os **usuários chave** do projeto na Experience
     (`pessoasDoProjeto`, papel "Usuário(a) Chave"). Campo aceita digitar qualquer e-mail
     (Enter/vírgula vira chip, inválido fica vermelho) e sugere o resto da equipe (pessoas da
     Experience + membros com `login@sankhya.com.br`).
   - **Assunto**: `Cronograma dd/mm/aaaa a dd/mm/aaaa` (editável).
   - **Corpo**: só a tabela por enquanto (texto em volta: a discutir).
   - **Enviar** desabilita até ter 1 e-mail válido; um envio por vez.
4. Tabela (HTML com estilo inline, compatível com Gmail/Outlook), ordenada por data/hora:
   `Data | Início | Fim | Fase | Assunto | Participantes | Meet`.

## 4. Backend

- `src/tipos.ts`: `Projeto.meets: MeetDoProjeto[]` (`inicio`, `fim`, `link`, `convidados`);
  registro antigo carrega `[]`.
- `POST /api/google/meet` (já existe): ao voltar `ok`, grava em `Projeto.meets`.
- `POST /api/clientes/:id/projetos/:idProjeto/cronograma/enviar` `{ para[], assunto, html }`:
  Zod valida e-mails (1..50), manda via `EnviadorDeEmail` com `para`; 409 se já há envio do
  projeto em andamento. Assinatura: reaproveita `emailDoCliente.assinatura`.
- HTML montado no frontend por função pura em `equipeDoProjetoDados.js` (agrupar eventos,
  extrair fase, montar tabela com escape) — o Hub é local e de um usuário só.

## 5. Testes

- `equipeDoProjetoDados.test.js`: agrupamento por horário, fase do título, "Sem fase", filtro
  por fase/pessoa, escape de HTML na tabela.
- Teste da rota: e-mail inválido 400, lista vazia 400, envio chama o enviador com `para`.

## 6. Em aberto

- Texto do corpo antes/depois da tabela.
- Cc/Cco: fora até alguém pedir.
- Assinatura do Gmail não é acessível pelo SMTP; vale a assinatura de Configurações.
