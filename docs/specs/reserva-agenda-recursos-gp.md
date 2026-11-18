# Reserva da Agenda de Recursos pelo GP

Origem: pedido direto (não vem do DS-hub). Planejamento iniciado em 2026-10-26, ainda sem
código — só levantamento + spike ao vivo contra o ERP corporativo.

## 1. Objetivo e escopo

Perfil `gerente-de-projeto` ganha, dentro do HUB, uma tela pra reservar a agenda de um
desenvolvedor e acompanhar o trabalho da equipe num projeto de cliente.

### MVP (definido com o usuário em 2026-10-26)

1. **Adicionar pessoas** ao projeto, buscadas direto na Agenda de Recursos.
2. **Ver as OS já lançadas pro Experience** de cada pessoa — status de cada uma.
3. **Lançar nova OS**: cria o evento na Agenda de Recursos **e** a "Nova Tarefa" na Sankhya
   Experience — ver distinção de papéis abaixo, é diferente do "Gerar OS" que já existe no Hub.
   Entrada por dois caminhos (seção 2.1): preencher à mão, **ou** importar uma planilha de
   cronograma (uma linha = uma reserva, em lote) — os dois caem no mesmo lançamento.
4. **Horas totais de OS do projeto** e status de cada OS, agregados.

**Fora do MVP, pra depois**: e-mail do dev e botão de gerar Meet (fase 2, seção 5).

### "Nova Tarefa" × "Gerar OS" — dois papéis, duas ações (esclarecido com o usuário)

São ações de pessoas diferentes, em momentos diferentes do mesmo fluxo:

- **Nova Tarefa** (ação do GP, é o que esta feature constrói): abre a demanda — cria o evento
  na Agenda de Recursos e a tarefa na Etapa certa da Experience. É o "lançar a OS" do ponto de
  vista do GP: reserva o trabalho que vai acontecer.
- **Gerar OS** (ação do dev/consultor, **já existe** no Hub —
  [`gerar-os-experience.md`](./gerar-os-experience.md), `src/sankhya/experience.ts`,
  `src/rotas/rotasGerarOs.ts`): é o fechamento — quem executou aponta o que foi feito e fecha a
  OS daquela tarefa. Não é ação do GP, e esta feature nova **não implementa isso de novo** — só
  lê o resultado (status, horas) pra mostrar na tela da equipe.

O botão "Gerar OS" que apareceu nos protótipos (HTML e FigCraft) foi um nome provisório pro
botão do GP — com essa distinção clara, o botão do GP deveria se chamar **"Nova Tarefa"** (ou
"Abrir OS"), não "Gerar OS". Ajustar o rótulo nos protótipos antes de seguir.

## 2. O que já existe no hub-snk-desenv (leitura)

- `AgendaRecursosSP.carregarAgendas` (ERP) já devolve **todos os recursos e eventos** de uma
  vez — não é "a minha agenda", é a agenda inteira, com `CODCARGO`/`DESCRCARGO`/cor por
  recurso incluídos no próprio payload (`src/sankhya/agendaParser.ts`). O Hub hoje recorta pro
  `CODUSU` configurado (`codusuAlvo`, em `src/sankhya/consultasDaAgenda.ts`) — é escolha do
  Hub, não limite do ERP. Pra "ver disponibilidade de todos" basta importar sem esse filtro.
- `src/sankhya/demandas.ts`: já sabe ler `ID 2996` de um texto solto — é o padrão que os
  consultores escrevem hoje, à mão, na descrição do evento.
- `src/tipos.ts`: `RecursoAgenda`, `EventoAgenda`, `EventoComRecurso`, `EstadoAgendaRecursos`,
  `ParceiroAgenda` já modelam o dado. `EventoAgenda.usulancador` já existe — dá pra basear a
  regra "só meus lançamentos completos, dos outros só dia + demanda" nisso, comparado ao
  usuário logado (igual o Hub já faz pra "minha agenda" hoje).

### 2.1. Terceira via de entrada: importar planilha de cronograma (além de manual)

Pedido do usuário (2026-10-26): a reserva aceita dois jeitos de entrada — preencher à mão (já
no MVP) ou **importar uma planilha de cronograma**. Formato real conferido
(`OACO_..._Cronograma_FastTrack (1).xlsx`, de um cliente real): é exatamente o "Modelo A" de 3
abas que a skill Elo já descrevia (seção 4.1), confirmado linha a linha:

- Aba **"Cópia de Cronograma_FAP"**: cabeçalho `Etapa | Processo | Consultor | Usuário Chave |
  Data | Hr início | Hr fim | Planejado | Realizado`. `Planejado` é fórmula (Hr fim − Hr
  início). `Etapa` só vem preenchida na primeira linha de cada bloco — as seguintes herdam dela
  (mesma regra de "encaixar no bloco existente" que o Elo já documenta pra planilhas assim).
- Aba **"Painel"**: agregados por fórmula da própria planilha (Total Planejado, Horas Pedido
  contratadas, Saldo, % Avanço) — isso é **plano/contratado**, não o que foi de fato lançado no
  Sankhya. Não substitui a leitura ao vivo de OS (item 4 do MVP): são números diferentes.
- Aba **"USUARIOS "**: contatos do **lado do cliente** (Patrocinador, Líder do Projeto,
  Usuários Chave) — não tem e-mail de dev/consultor Sankhya, não ajuda a pendência de e-mail da
  Fase 2.

**Referência de padrão atualizada (2026-10-26, conversa com a dona da skill Elo)**: o modelo
mais usado entre os GPs da matriz é parecido com `ELLIX - Cronograma.xlsx` (outro arquivo real,
Downloads do usuário), não o OACO acima — GPs fora da matriz podem usar outro modelo, mas este
vira a referência primária do template do Hub. Mesma aba de trabalho (`Cópia de
Cronograma_FAP`), **duas colunas a mais** no cabeçalho:
`Etapa | Processo | Consultor | Usuário Chave | Data | Hr início | Hr fim | Planejado |
Realizado | Agenda meet | Tarefa`.

`Agenda meet` e `Tarefa` são marcadores manuais (`OK`/vazio) que os GPs **já usam hoje** pra
controlar se aquele item foi lançado no Google Meet e na Experience — o mesmo papel do
`Sincronizado` que a Elo documenta, só que dividido em duas colunas por sistema em vez de uma.
Isso é achado importante pra Fase 2 (Meet): confirma que os GPs já sentem essa necessidade na
prática, e dá o nome de coluna certo pra reaproveitar quando chegar a vez. Outras diferenças
vistas: `Data` vem como texto (`"22/10/2026"`) nesse arquivo, não como data — o parser precisa
aceitar os dois formatos; há abas extras (`Cronograma_Resumido`, `Cronograma Macro`) com visão
agregada por Etapa que não entram no parser (são summary, não linha-a-linha).

**Decisão (2026-10-26): o Hub exporta o próprio modelo pra preencher, em vez de aceitar
qualquer cronograma existente.** Botão "Baixar modelo" gera um `.xlsx` baseado no padrão
ELLIX acima: `Etapa | Processo | Consultor | Data | Hr início | Hr fim` pro GP preencher, **mais
`Agenda meet` e `Tarefa`** — só que essas duas o Hub escreve de volta sozinho depois de
processar cada linha (status real, não marcação manual), em vez do GP ter que lembrar de marcar
"OK". Sem `Painel`, `USUARIOS`, `Cronograma Macro` nem `Cronograma_Resumido` — são do lado do
cliente ou visão agregada, não entram no parser. O GP preenche esse modelo e reimporta.

**Por quê**: garante formato sempre igual — zero ambiguidade, zero modelo de IA pra "entender"
a planilha, só parser determinístico (mesma lib que lê escreve o modelo, ex. `exceljs`). A
alternativa (aceitar as planilhas de cronograma que os GPs já usam hoje, que variam — Modelo A
de 3 abas × Modelo B de aba única, por cliente) exigiria suportar mais de um formato fixo ou
alguma heurística de detecção — nenhum dos dois precisa de IA (já conhecemos as duas formas,
ver seção 4.1), mas é mais parser pra manter. Fica de fora do MVP: só o modelo próprio do Hub
por enquanto; aceitar o cronograma "de fora" como o Elo faz é um reforço possível depois, não
bloqueia nada.

**Revisão (2026-10-29, pedido do usuário): modelo = aba `Cópia de Cronograma_FAP` do ELLIX, e
importação aceita cronograma de fora.** O "Baixar modelo" agora gera essa aba com o mesmo layout
e cores do ELLIX (blocos por Etapa: título "Agendas" verde mesclado em C:H, total Planejado roxo
e Realizado laranja, cabeçalho azul-petróleo `Etapa | Processo | Consultor | Usuário Chave | Data
| Hr início | Hr fim | Planejado | Realizado | Agenda meet | Tarefa`, Etapa mesclada na
vertical). Na importação o parser procura a aba `Cópia de Cronograma_FAP` em qualquer `.xlsx`
(sem ela, a primeira aba com esse cabeçalho) e lê as colunas **pelo nome** — cada cabeçalho
redefine as colunas do bloco abaixo, aceita `Analista` no lugar de `Consultor`, e pula título
mesclado, totais e linhas só com Etapa. Data com formato mês-primeiro (`mm/dd/yyyy`, Sheets em
locale en-US — o ELLIX tem) é lida como o GP vê na tela (dd/mm), senão "03/11" virava 11/mar.

De/para planilha → Hub → sistemas:

| Coluna da planilha | Campo no Hub | Agenda de Recursos | Experience (Nova Tarefa) |
| --- | --- | --- | --- |
| Etapa | Etapa (herdada do bloco) | — | Etapa (seleção, mapeamento por cliente, seção 4.2) |
| Processo | Processo/Atividade | "O quê" / Descrição completa | parte da Observação |
| Consultor | Dev/consultor | Executante — resolvido por nome contra a Agenda de Recursos | Usuários |
| Usuário Chave | contato do cliente | — | parte da Observação |
| Data / Hr início / Hr fim | Início/Fim | Início / Fim | Data da Tarefa + Hora Inicial/Final |
| Planejado | informativo só | — | — |
| Realizado | **não usado** — OS vem do sistema, não da planilha | — | — |
| Agenda meet | escrito de volta pelo Hub (status real) | — | — (fase 2) |
| Tarefa | escrito de volta pelo Hub (status real) | — | — |

**Resolver "Consultor" por nome** reaproveita a correspondência de nome que já existe pra
parceiros (`chaveNome`/`nomesCorrespondem` em `src/sankhya/agenda.ts`) — mesmo problema (nome
digitado à mão × nome oficial no ERP), mesma solução.

**O que muda, o que não muda**: a planilha é só mais um jeito de **preencher o formulário de
reserva em lote** (uma linha = uma reserva) — gerar a Nova Tarefa (Agenda de Recursos +
Experience) e puxar as OS lançadas de cada pessoa continuam exatamente como no MVP, sem
mudança nenhuma nelas. Precisa de: upload de arquivo no Hub (novo — nada no stack hoje lê
`.xlsx` no backend, precisa de lib tipo `exceljs`), parser do formato acima, e a mesma tela de
pré-visualização já desenhada — só que com N linhas em vez de uma.

### 2.2. Importação = prévia editável, gravação só na Agenda (decidido em 2026-10-29)

Revisa parte da 2.1. Implementado:
- **Importar não grava nada.** `POST /api/clientes/:id/projetos/:idProjeto/planilha/previa`
  (corpo `{ arquivoBase64 }`) lê o modelo e devolve `linhas`, `erros` e `consultores`. O modal
  "Importar planilha" (aba Equipe do Projeto) mostra tudo editável — executante, "O quê"
  (começa como o `Processo`), data e horas, e marcar ou desmarcar a linha — e só "Gravar na Agenda"
  escreve, por `POST .../agenda/lote` (um `salvarEvento` por vez; falha numa linha não para as
  outras; evento igual já na Agenda — executante, início e "O quê" — é pulado, então
  reimportar não duplica). O pulo só enxerga quem está na lista de executantes do GP
  (limite de `carregarAgendas`, seção 6).
- **Só Agenda por enquanto.** A tarefa na Experience espera o mapeamento Etapa/Procedimento
  que as GPs estão capturando. O Hub não escreve de volta `Agenda meet`/`Tarefa` na planilha: o resultado de
  cada linha aparece no próprio modal.
- **Exige o `implantationId` do projeto** (o GP cria o projeto e informa o ID): sem ele a
  prévia é recusada.
- **Consultor ↔ Experience ↔ ERP.** `POST /persons/implantation/{id}` (paginado, capturado
  em 2026-10-29 pelo `gravador-fluxos-gp`) lista quem está no projeto: `id` (= `person_id`),
  `person_name`, `email`, `role`, Sankhya e cliente juntos. `Experience.pessoasDoProjeto`. Cada
  Consultor distinto casa por `pessoasCorrespondem` (mais de um candidato = sem dono); o
  login do ERP é o e-mail `@sankhya.com.br` sem domínio, e o `CODUSU` vem da equipe ou da
  `PesquisaSP.getSuggestion`.
- **Não encontrado na Experience**: o nome fica anotado na prévia com "Inserir na equipe sem
  correspondência" — membro com `codusu: null`, identificado pelo nome
  (`DELETE .../membros/:nome`). As linhas dele ficam **bloqueadas** até escolher um executante
  na própria linha; no card, "Vincular usuário do ERP" abre a busca e troca o membro pelo
  usuário escolhido. Encontrado na Experience mas sem usuário no ERP (gente do cliente):
  também bloqueado.
- **Pessoas do projeto, uma seleção só** (2026-10-29, substitui a lista de usuários chave nas
  configurações e os cards "fora da equipe"): com o `implantationId`, `GET .../equipe` também
  traz `pessoasExperience` (`/persons/implantation`, 10 por página — pedindo 100 a Experience
  devolve 10, e o `#paginar` agora para pelo total recebido, não pelo pedido). A tabela "Pessoas
  do projeto" junta esses usuários com quem tem OS no período (casando por nome), com horas e
  OS de cada um e duas caixas: **Na equipe** (executa: acha o `codusu` pelo login do e-mail;
  sem achado, abre a busca já com o nome) e **Usuário chave** (quantos quiser). Desmarcar "Na
  equipe" de quem também é chave mantém só a chave. O usuário chave é um membro com
  `usuarioChave: true` (+ `personId`), em geral sem `codusu` (cliente): não aparece como
  executante, não recebe OS nem evento, e o card não oferece Nova Tarefa nem vínculo com o ERP.
  Se já era membro com `codusu` (achado pelo `person_id`, pelo login do e-mail ou pelo nome), só
  ganha a marca. Desmarcar a chave tira da equipe quem não tem `codusu`; quem tem só perde a
  marca.
  Chave dourada (`iconeDeUsuarioChave`) no nome, na equipe do projeto e no resumo das equipes.
- Limites aceitos: membro sem `codusu` não mostra OS nem eventos no card — as OS dele seguem
  na tabela "Pessoas do projeto". Um 403 em `/persons/implantation` (GP fora da implantação) cai como
  "sessão expirada", porque `#paginar` não distingue os dois casos.

## 3. Escrita — spike ao vivo em 2026-10-26

Testado contra o ERP real (`skw.sankhya.com.br`, aba "Agenda de Recursos"), com o usuário
logado. Caminho pra abrir o editor: clicar no ícone "+" ao lado do nome do recurso (expande a
linha e mostra os eventos como texto) e dar duplo clique num evento, ou num espaço vazio da
grade pra criar um novo. Abre o popup **"Edição de Evento"**.

Campos do formulário:

| Campo        | Tipo                          | Obrigatório? | Observação |
| ------------ | ------------------------------ | --- | --- |
| Início / Fim | data + hora                    | sim | |
| Parceiro     | código + busca                 | não | cliente do evento |
| Prospect     | busca                          | não | alternativa a Parceiro |
| O quê        | texto livre                    | sim | título |
| Executante   | código + busca                 | sim | **aqui entra o `CODUSU` do dev** |
| Dia todo?    | toggle                         | — | |
| Status       | Confirmado / Cancelado (toggles) | — | |
| Motivo       | texto livre (textarea)          | rotulado com `*`, mas **salvou vazio** no teste — provável que só é exigido ao cancelar | |
| Lançar OS    | botão                          | — | ação nativa do ERP, não é o botão que esta feature precisa |

Confirmado ao vivo: dá pra **criar** e **excluir** evento sem passar por nenhuma aprovação —
Salvar grava na hora. Um evento de teste foi criado e excluído sem deixar rastro (26/10).

**Evento mantido de propósito**, a pedido, pra ver como os dados aparecem na leitura:
- Início: 02/11/2026 09:00 — Fim: 02/11/2026 16:00
- Executante: `12229` (FLAVIANO.SANTOS)
- O quê: `DEMO INTEGRAÇÃO HUB`
- Sem Parceiro, sem Motivo, Status não confirmado

## 4. Decisão de arquitetura: chamada direta ao serviço (payload real capturado), não UI automation

**Revisado em 2026-10-26** — isto substitui a decisão original desta seção (UI automation),
que foi tomada só porque a ferramenta de automação de navegador desta sessão **redaciona
sempre** o `serviceName` de qualquer chamada `AgendaRecursosSP.*` no painel de rede (inclusive
o já conhecido `carregarAgendas`). A redação é da ferramenta de captura de rede, não do
Sankhya — então o jeito de contornar não é desistir da API, é parar de depender da aba de
Network pra lê-la.

**Técnica que funcionou**: interceptar a própria chamada dentro da página, não a rede. Via
`executeJavaScript` (o mesmo mecanismo que `scriptChamarServico` em `janelaErpOculta.ts` já usa
pra achar o `ServiceProxy` da tela), sobrescreve-se `serviceProxy.callService` por uma versão
que loga `serviceName`+corpo antes de chamar a original de verdade:

```js
const original = serviceProxy.callService.bind(serviceProxy);
serviceProxy.callService = function (serviceName, requestBody, opcoes) {
  console.log('[CAPTURA]', serviceName, JSON.stringify(requestBody));
  return original(serviceName, requestBody, opcoes);
};
```

Isso roda **na página**, então nada de rede é inspecionado — a redação da ferramenta de
automação não tem como alcançar. Testado ao vivo em 2026-10-26: criado um evento descartável
(Executante 12229, 31/10/2026 08:00–18:00, "O quê": `TESTE AUTOMACAO HUB (apagar)`), confirmado
na tela e via `carregarAgendas`, depois excluído — zero rastro deixado. Capturou os dois
serviços que faltavam:

| Ação | `serviceName` | `requestBody` |
| --- | --- | --- |
| Criar/editar evento | `mgeos@AgendaRecursosSP.salvarEvento` | `{"evento":{"descricao":{"$":""},"descrAbrev":{"$":"<O quê>"},"diaTodo":"N","nuEventoPai":"","dhInicioPai":"","start":"<dd/MM/yyyy HH:mm:ss>","end":"<dd/MM/yyyy HH:mm:ss>","codUsu":"<executante>","codParc":"","codPap":"","numOs":"","subOs":"","nuFap":"","numEtapa":"","numContr":"","nuSelecao":"","nuCurriculo":"","codEtapa":"","confirmado":"N","cancelado":"N","motivo":""}}` |
| Excluir evento | `mgeos@AgendaRecursosSP.cancelarEvento` | `{"evento":{"nuEvento":"<id do evento>","confirmado":"N","cancelado":"","motivo":""}}` |

**Decisão**: escrever chamando esses dois serviços direto, reaproveitando **o mesmo mecanismo
que `buscar()` já usa pra leitura** em `janelaErpOculta.ts` (`scriptChamarServico`) — nenhuma
automação de DOM, nenhum popup, nenhum clique simulado. Zero dependência de seletor de UI que
quebra a cada atualização visual do Sankhya.

**Por quê**: o risco que motivou a decisão original (contrato não documentado podendo mudar) não
muda — mas o preço de UI automation (seletor frágil, autocomplete que não repinta, mais lento)
some, e o mecanismo de chamada já existe e já é testado (`buscar()`). Se o contrato mudar num
deploy futuro, o sintoma é o mesmo dos dois jeitos (erro na chamada), só que a correção é trocar
um payload JSON, não re-caçar seletor.

**Falta** (pequeno, não bloqueia o design): capturar a **resposta** de `salvarEvento` — só o
corpo da chamada foi logado acima, não a resposta. Pelo teste, o `nuEvento` do evento recém-
criado precisa vir de algum lugar pra permitir cancelar/editar em seguida sem precisar reler
`carregarAgendas` inteiro primeiro; confirmar se a própria resposta do `salvarEvento` já traz
esse id (mais provável) antes de implementar, com a mesma técnica de interceptação.

Depois de descoberto, isso é **código determinístico só do Hub** — zero LLM, zero custo de
Claude em produção. Claude entrou só pra descobrir o contrato (e documentá-lo aqui).

### 4.1. Achado: skill "Elo" confirma o formulário (referência, não mais o caminho de escrita)

`sincroniza-agendamentos-sankhya.skill` (terceiros, achado em Downloads) é um Skill Claude que
já faz exatamente este tipo de automação — Agenda de Recursos + Sankhya Experience + Google
Agenda, via Claude in Chrome. Não documenta a API (mesma limitação nossa, também só clica na
tela), mas confirma campo a campo o formulário (bate 100% com o que vimos ao vivo: `Motivo` só
habilita com Status=Cancelado, `O quê`→nome do cliente) e os riscos de UI automation nesse
sistema (autocomplete que não limpa entre uma busca e outra — "regra de ouro": sempre re-buscar
Cód. Parceiro/Executante do zero antes de cada Salvar, nunca confiar em valor exibido).

Também mostra como eles resolvem o Google Agenda: `Google Calendar:create_event`, um conector
nativo do Claude — **não serve pra nossa arquitetura** (Hub é app próprio, não roda dentro de
uma conversa Claude), mas confirma que o lado Google é tratado à parte do lado Sankhya, reforça
a decisão da seção 5.

### 4.2. A segunda escrita: Nova Tarefa na Sankhya Experience

Diferente da Agenda de Recursos, o hub-snk-desenv **já fala REST direto** com a Experience
(`src/sankhya/experience.ts`, `desktop/src/sankhya/janelaExperienceOculta.ts` — essa janela
oculta só extrai o JWT, quem chama a API é o backend). `docs/specs/gerar-os-experience.md`
documenta endpoints de **ler** tarefas e **gerar OS** a partir delas, mas nenhum de **criar**
uma tarefa — essa chamada REST ainda não foi mapeada em nenhum dos dois repos.

O Elo (`references/sankhya-experience-nova-tarefa.md`) **documenta sim a criação**, mas por
navegação de tela (não captura de API): entrar em
`experience.sankhya.com.br/projeto/<id>?screen=etapas` → Etapas → marcar os Procedimentos
certos → botão verde "Novo" → modal "Nova Tarefa" (Etapa fixa, Pedido geralmente autopreenche
ao entrar na Etapa — se não, ou tiver mais de uma opção, não dá pra decidir sozinho, precisa
perguntar —, Usuários pelo dev/consultor, Data, Hora Inicial/Final, Observação até 500
caracteres) → Salvar → mensagem "Cadastro realizado com sucesso". O próprio Elo registra que
há um passo depois dessa mensagem que **nem eles confirmaram ao vivo** ainda.

**Resolvido em 2026-10-27, ao vivo**: o usuário do hub-snk-desenv não tem papel que habilite
"Nova Tarefa" na Experience — pediu pra uma colega com acesso (Raphaela Borges, dona original
da skill Elo) logar numa aba preparada com a mesma técnica de interceptação da seção 4 (desta
vez via `window.fetch`/`XMLHttpRequest`, não precisou nem do truque do `ServiceProxy` — a
Experience é REST puro, nada redacionado) e lançar uma tarefa real no projeto AMATOOLS
(`implantation_id` 11267). Capturado:

```
POST https://d83n39pk6d.execute-api.sa-east-1.amazonaws.com/prod/tasks/insert
{
  "stage_id": 128,
  "application_id": 34644,
  "person_id": [25258],
  "date_to_do": "2026-10-26",
  "hour_to_start": "08:00",
  "hour_to_finish": "08:30",
  "implantation_id": 11267,
  "processes_ids": [191],
  "procedure_ids": [9754],
  "already_asked": false
}
```

Mesma API base que `src/sankhya/experience.ts` já usa (`d83n39pk6d.execute-api...`) — dá pra
estender o client existente, não precisa de cliente HTTP novo. `application_id` é o "Pedido" da
tela (confirma o nome que o Elo já suspeitava); `person_id` é array (permite mais de um
executante na mesma tarefa, útil de saber); `already_asked` provavelmente é a flag que evita o
"se tiver mais de uma opção, perguntar" do Pedido quando já resolvido — não confirmado o que
acontece com `true` nem com mais de um Pedido possível, só visto o caminho feliz.

Chamadas de resolução capturadas antes do `tasks/insert` (preenchem os ids acima a partir da
navegação Etapa→Procedimento→Processo, antes de abrir o modal):
- `POST /procedures/ids` `{"procedure_ids":[9754],"implantation_id":11267}`
- `POST /stages/implantation/{implantation_id}/procedures` `{"procedure_ids":[9754]}`
- `POST /persons/list/role-responsible`
  `{"procedure_ids":[9754],"implantation_id":11267,"processes_ids":[191]}` — é esta que resolve
  o dropdown "Usuários" pra `person_id`; dá pra reaproveitar pra resolver "Consultor" por nome
  em vez de só `chaveNome` textual, se o nome bater com algum resultado dela.

**Conferido em 2026-10-28, só leitura, com a conta do usuário (sem o papel de Nova Tarefa)**:
- `role-responsible` responde 200 com `data: [{ id, person_name_role }]`, ex.
  `{ id: 25258, person_name_role: "Raphaela Borges | Sankhya | Responsável" }` — só 7 pessoas no
  AMATOOLS, os responsáveis do procedimento. Depende do mapeamento (procedure/processes ids).
- `POST /persons/information-by-email` `{email}` devolve o `user_id` (= `person_id`) de
  **qualquer** pessoa, não só do dono do token (`gustavo.pinto@` → 23504, `andre.segatto@` →
  1831); e-mail desconhecido volta `data: {}`. Como o login do ERP é `nome.sobrenome`, o modal
  sugere o `person_id` por `login@sankhya.com.br` (`GET /api/experience/pessoas/por-login`),
  editável. Não testado: se `/tasks/insert` aceita pessoa fora da lista de `role-responsible`.

**Só coube uma execução ao vivo** (pedido explícito do usuário: acesso de outra pessoa é
recurso raro, não repetir por capricho) — então nenhuma variação foi testada (mais de um Pedido
possível, erro de validação, `already_asked: true`). Documentar e tentar de novo só quando o
MVP já estiver perto de precisar escrever de verdade. *Superado em parte pela gravação da GP
abaixo (4.3).*

### 4.3. Gravação da GP em 2026-10-29 (`gravador-fluxos-gp`)

A GP (Raphaela) trabalhou um dia normal com a extensão `ferramentas/gravador-fluxos-gp`
ligada; exportações em `G:\...\Processos Hub\fluxos-gp-2026-10-29*.json` (acumulativas — a
`(8)` contém as outras: 815 chamadas + 2 notas). Projetos 11267, 11268, 11441, 12230. Achados:

- **`/tasks/insert` exige o evento do OM confirmado.** Duas vezes (#230, #814) veio
  `409 {"data":false,"response":{"error":true,"message":"O agendamento identificado no OM
  ainda não está confirmado. Confirme o agendamento para gerar a tarefa."}}`; o mesmo corpo
  deu 200 logo depois de confirmar o evento. A Experience casa a tarefa com um evento da
  Agenda de Recursos (mesma pessoa/dia/horário) e o vincula (`schedule_id` na tarefa).
  **Corrigido no Hub (2026-10-30)**: a Nova Tarefa grava o evento com `confirmado: 'S'`
  (`EventoAgendaRecursos.confirmado`); a importação em lote (2.2) continua `'N'`. ~~Não se sabe
  se a Experience aceita a tarefa **sem** evento nenhum no OM.~~ Não aceita (422, seção 4.4).
- **A confirmação em si não foi gravada**: nenhuma chamada `AgendaRecursosSP.*` no arquivo
  (aba do ERP provavelmente sem a extensão carregada). Supõe-se que `salvarEvento` com
  `confirmado: 'S'` basta — **homologar**.
- **Resposta do `/tasks/insert`**: `{"data":{},"response":{"message":"Inserido com sucesso"}}`
  — **não devolve o id da tarefa**. Para achá-la, reler `tasks/filtering` (dia/hora/pessoa).
- **Recusa = nada gravado.** 4xx com `response.error` agora vira `RecusaDaExperienceError`
  (`experience.ts`); a rota responde 409 dizendo que a Agenda gravou e a Experience não (trava
  de reenvio mantida, o evento já existe). 5xx/timeout seguem como indeterminado (502).
- **Uma pessoa por tarefa** (confirmado com a GP em 2026-10-30): a tela da Experience não lança
  a mesma tarefa para mais de uma pessoa, embora `person_id` seja array. Nas 5 chamadas, sempre
  um só. O Hub passou de `personIds` para `personId` (rota, modal e `criarTarefa`, que envia
  `[personId]`). A nota "dois consultores envolvidos" = duas tarefas separadas.
- **Pedido (`application_id`)**: vem de
  `GET /applications/implantation/{id}/stage/{stageId}?procedures_ids=1,2,…` →
  `data: [{ id, name: "Código: … / Saldo: … / Tipo: … / Serviço: …", nature, operation_type,
  remain_minutes }]`. 1 opção em 3 casos, **3 opções** em 1 (#229, a GP escolheu à mão — a de
  maior saldo). `already_asked` ficou `false` mesmo assim: não é a flag do Pedido ambíguo, e
  `true` nunca apareceu. A lista de Pedidos do projeto inteiro (tela "Pedidos") é
  `POST /applications/implantation/{id}` (paginado; `negotiated_hours`, `consumed_hours`,
  `remaining_hours`). **Falta no Hub**: trocar o campo manual por esse `<select>`.
- **Navegação Etapa → Procedimento** (base para a tela do mapeamento, sem digitar ids):
  `GET /implantations/{id}/stages` → `GET /processes/implantation/{id}/stage/{s}/person/{p}` →
  `GET /activities/implantation/{id}/process/{proc}/stage/{s}/person/{p}` →
  `GET /procedures/implantation/{id}/activity/{a}/person/{p}/stage/{s}`; depois
  `POST /procedures/ids`, `POST /stages/implantation/{id}/procedures`,
  `POST /persons/list/role-responsible` (iguais à captura de 2026-10-27).
- **Editar tarefa** (menu ⋮): `GET /tasks/{id}` e `PUT /tasks/{id}` com
  `{additional_information, already_asked, already_asked_update_all_tasks, application_id,
  change_all_tasks, date_to_do, hour_to_start, hour_to_finish, implantation_id, person_id
  (número, não array), procedure_id, processes_ids, stage_id}`. A primeira volta 200 com
  `data: {error: true, error_code: "confirm_update_all_tasks"}` (pergunta se altera todas); a
  segunda, com `already_asked_update_all_tasks: true` e `change_all_tasks: true`, "Alterado com
  sucesso". Excluir não foi gravado. Não implementado no Hub.
- **Status de tarefa**: cada linha de `tasks/filtering` traz `status` (`PENDING`/`CONCLUDED`) e
  `task_status` (`Hoje`/`Finalizada`/…). As opções do filtro vêm de
  `GET /tasks/implantation/{id}/filter/status` (só os valores presentes no projeto); pessoas, de
  `GET /tasks/implantation/{id}/filter/persons`.
- **Agenda da Experience** (`?screen=agenda`): `POST /calendar`
  `{start_date, end_date, implantation_ids, person_ids, process_ids, stage_ids}` devolve os
  eventos do OM por pessoa/dia com `nuevento`, `confirmed`, `schedule_id`, `task_id`;
  `POST /calendar/appointment` traz o detalhe. Serve para checar a confirmação **antes** do
  insert — não usado ainda.
- Gerar OS / aceite / aprovadores: `POST /orders` → `accepted-os` → `accepted-os/send-email` e
  `get-approvers` (200) iguais ao que `experience.ts` já faz.

**Ainda sem gravação**: `already_asked: true`; excluir tarefa; OS do projeto sem filtro de
pessoa; de onde vem "Você não está inserido nessa implantação"; e as 4 perguntas da Agenda de
Recursos (salvar novo — e se a resposta traz o `nuEvento` —, editar, excluir, confirmar).
Próxima rodada: GP recarrega a aba da Agenda de Recursos com a extensão e cria + confirma um
evento.

**Pendência nova**: mapeamento Etapa/Procedimento **por cliente/projeto** — não existe hoje no
hub-snk-desenv. O Elo guarda isso em `references/mapeamentos/<cliente>.md`, preenchido na
primeira vez e reaproveitado depois. Precisamos de equivalente (campo no cadastro do cliente,
ou tabela própria) antes de automatizar — sem saber a Etapa certa, a tarefa cai no lugar errado.

**Resolvido em 2026-10-27 — infraestrutura de guarda do mapeamento**: ficou **por Projeto**, não
por Cliente (um cliente pode ter vários projetos/implantações na Experience, cada um com sua
própria Etapa/Procedimento). Implementado:
- `MapeamentoEtapaExperience` (`src/tipos.ts`): `{ id, processo, stageId, processesIds,
  procedureIds }` — `processo` é a chave de busca (nome do Processo do cronograma, igual à
  coluna `Processo` da planilha, seção 2.1).
- Novo campo `Projeto.mapeamentoExperience: MapeamentoEtapaExperience[]`.
- `RepositorioClientes.definirMapeamentoExperienceDoProjeto(idCliente, idProjeto, mapeamento[])`
  — substitui a lista inteira de uma vez (mesmo padrão de `definirAnotacoes`), porque é uma
  tabela pequena mantida à mão pelo GP, sem necessidade de CRUD por linha. Recusa `processo`
  repetido no mesmo lote (`ProcessoDeMapeamentoDuplicadoError`, ignorando caixa).
- Rota `PUT /api/clientes/:id/projetos/:idProjeto/mapeamento-experience`.
- Registros antigos (sem o campo) carregam com `mapeamentoExperience: []`.
Isso só guarda o de-para — **ainda falta** a tela/UX pro GP preencher esse mapeamento (hoje só
dá pra gravar via API) e o código que, na hora de montar o `POST /tasks/insert`, busca o
`processo` da linha (manual ou da planilha) nessa lista do projeto certo.

### 4.4. Gravações de 2026-10-30 a 2026-11-03 + vídeo do Lich

Fontes: `G:\...\Processos Hub\fluxos-gp-2026-11-03 (1).json` (acumulativo: 2378 chamadas + 2
notas, 29/10 a 03/11, projetos 11266, 11267, 11268, 11441, 12230, 12235, 12466) e
`Gravação Lich fazendo os agendamentos.mp4` (30 s: o Lich, num Chrome automatizado, cria
"Nova Tarefa" uma a uma pela tela da Experience — 11441, Operação assistida, várias pessoas e
dias, Observação "Operação assistida — Backoffice — Todos"). Só o que é novo em relação à 4.3.

**Confirmação disfarçada de sucesso (corrigido no Hub em 2026-11-03).** A Experience pergunta
"tem certeza?" respondendo **200** com `response.error: false` e `data: {error: true,
error_code}` — e não grava. A tela abre um diálogo e reenvia com a flag de "já perguntado".
Três casos gravados:

| Chamada | `error_code` | Reenvio que grava |
| --- | --- | --- |
| `POST /tasks/insert` | `confirm_creation` (mensagem "Inserido com sucesso"!) | mesmo corpo com `already_asked: true` (01/11 02:22 e 02:24, proj. 11268) |
| `PUT /tasks/{id}` | `confirm_update_all_tasks` | `already_asked_update_all_tasks: true` + `change_all_tasks: true` (4.3) |
| `POST /persons/{id}/implantation/{id}` | `confirmed_include` + `error_title` ("Os processos … já possui responsáveis Sankhya.") | `confirmed_include: true` |

Antes o Hub tratava o primeiro como sucesso: dizia "tarefa lançada" sem tarefa. Agora o
`#chamar` de `experience.ts` (por onde passam todas as chamadas avulsas) lança
`ConfirmacaoDaExperienceError` (`codigo`, mensagem = `error_title` quando vem), subclasse de
`RecusaDaExperienceError` — para quem não trata, é "recusou, nada gravado". `criarTarefa`
reenvia sozinho com `already_asked: true` no `confirm_creation` (a GP confirmou as duas vezes) e
devolve `{confirmacaoAutomatica}`; a rota avisa na mensagem. **O texto do diálogo não vem na
API** — se ele avisar algo que o GP deveria decidir (saldo do Pedido?), trocar a confirmação
automática por pergunta no modal.

**Observação da tarefa (corrigido no Hub em 2026-11-03).** `/tasks/insert` aceita
`additional_information` (até 500 caracteres, a "Observação" da tela); a GP preenche em todos os
lançamentos de 30/10 em diante, e a tela omite o campo quando vazio. Modal ganhou o campo,
rota aceita `observacao` (opcional, ≤ 500) e `criarTarefa` só envia quando preenchido.

**Recusa do ERP no `salvarEvento` passava como gravado (corrigido em 2026-11-04).** O
`service.sbr` recusa com HTTP 200 e `status: "0"`; `janelaErpOculta.salvarEvento` só olhava
HTML/vazio, então a Nova Tarefa seguia para a Experience e o lote marcava "gravado". Agora passa
pelo `interpretar` de `servico/respostaSankhya.ts` (já testado) e vira 409 na ponte. A resposta
de sucesso (com o `nuEvento`?) continua descartada pela rota — sem ela não há desfazer.

**Tarefa sem evento no OM: recusada.** `422 "Não é possível criar esta Tarefa pois uma agenda
deve ser previamente criada através da aplicação Gestão de Recursos."` (31/10 06:13 e 06:14,
proj. 11266, tarefa retroativa de 29/10). A GP criou a agenda e às 06:20 o mesmo corpo deu 200.
Dois erros diferentes, então: **422** = nenhum evento; **409** = evento achado, não confirmado
(continua aparecendo: 30/10 20:48 e 01/11 02:32, proj. 11441).

**Risco aberto — o evento do Hub serve?** Os eventos que a Experience reconhece vêm, no
`POST /calendar/appointment`, com `type: "OM"`, `user_launcher_om: "SANKHYAEXPERIENCE"`,
`implantation_id`, `schedule_id` e observação "… Agenda criada por: RAPHAELA.BORGES" — criados
pela aplicação **Gestão de Recursos**, que grava no OM pelo usuário de integração e guarda o
vínculo do lado da Experience (`source: "database"`). O Hub grava direto via
`AgendaRecursosSP.salvarEvento`, sem parceiro/FAP/implantação. **Homologar antes de qualquer
outra coisa**: evento pelo Hub (confirmado) → `/tasks/insert` → 200 ou 422?

**Teste manual em 2026-11-04 (Flaviano):** evento criado direto na Agenda de Recursos do ERP
("Edição de Evento", mesmo serviço do Hub): 10/11/2026 08:00–18:00, "TESTE HUB", executante
12229, sem parceiro/projeto, **Confirmado**. Na Experience (projeto 12456 LARIFO,
`?screen=agenda`, filtro no usuário) **o evento aparece**, com o ícone de confirmado — a
Experience lê o OM, não só o que a Gestão de Recursos grava. Mas, comparado a um evento da
Gestão de Recursos no mesmo card (06/11, "LARIFO TRANSPOR… 09:00h–18:00h", azul-claro, barra
verde):
- horário aparece **00:00h–00:00h** (no detalhe: "00:00 Até 00:00"), não 08:00–18:00;
- **Projeto** vazio no detalhe; "Lançado por: FLAVIANO.SANTOS"; observação "TESTE HUB -";
- cor escura e barra cinza (evento fora deste projeto / sem tarefa?).
Hipótese: a tarefa casa com o evento por pessoa + dia + **horário** + projeto; sem horário
lido e sem projeto, a Nova Tarefa tende a 422/409. O formulário do ERP tem **Projeto**,
**Etapa do Projeto** e **Contrato** — no payload, provavelmente `nuFap`, `numEtapa`/`codEtapa`
e `numContr`, que o Hub manda vazios. Próximo teste: mesmo evento com Projeto (FAP) preenchido.

**Horário 00:00 explicado:** o evento tinha sido criado pelo formulário completo ("Editar
detalhes >>", grade da entidade), não pelo popup "Edição de Evento" da grade da agenda.
Reabrindo pelo popup e salvando, a Experience passa a mostrar o horário certo. O popup é o
`AgendaRecursosSP.salvarEvento` — **o mesmo caminho do Hub**, então o horário do Hub sai certo.
O popup não tem Projeto/Etapa/Contrato (só no formulário completo); o `salvarEvento` aceita
`nuFap`/`numEtapa`/`numContr` no corpo, ainda não testados preenchidos.
Depois de salvo pelo popup: card "TESTE HUB 08:00h – 18:00h", barra verde (igual ao evento da
Gestão de Recursos), mas ainda **azul-escuro** (o da Gestão de Recursos é azul-claro). Leitura
provável: a barra é a ocupação do dia; a cor do card diz se o evento é **desta implantação**
(`implantation_id` do `/calendar`) — o evento do Hub fica como "de fora do projeto".
**Projeto não grava pelo ERP:** preenchendo Projeto/Etapa no formulário completo e salvando, os
campos voltam vazios. Pela Agenda de Recursos do OM não dá para ligar o evento ao projeto — o
vínculo (`implantation_id`/`schedule_id`) só nasce na Gestão de Recursos da Experience. Mandar
`nuFap` no `salvarEvento` provavelmente não resolve. Dois caminhos: (a) testar a Nova Tarefa do
GP sobre o evento "de fora" — se der 200, o caminho atual serve; (b) se der 422/409, o Hub tem
de criar a agenda pela API da Gestão de Recursos (gravar o fluxo dela para achar rota e corpo).

**Releitura das gravações (2026-11-04), buscando evento nativo do ERP aceito pela tarefa:**
nenhum caso. Nas 16 chamadas de `/tasks/insert`, toda agenda usada nasceu fora do que o
gravador cobre: entre o 409 e o 200 seguinte não há chamada gravada (29/10 20:07:56 → 20:08:10,
14 s; 19:07 → 19:08), nem entre os 422 e o 200 de 31/10 (06:14 → 06:20). O `/calendar` de
20:04 mostrava 09:00–14:00 livre para a pessoa 21042; às 20:07 já havia um evento 09:00–12:00
não confirmado "no OM". Ou seja: a GP cria (e confirma) a agenda num app fora de
`experience`/`skw` — a Gestão de Recursos —, e o evento que ela grava no OM nasce **não
confirmado**. A tela `os.mov.agenda.recursos` do ERP foi aberta 2× e não gerou nenhuma chamada
(as outras telas `mgeos/*.xhtml5` gravam normalmente). As gravações não provam nem descartam o
evento nativo; só o teste da GP decide. Se der 422, cada Nova Tarefa do Hub deixa um evento
órfão na Agenda (a rota já avisa com `indeterminado: true`).

**Teste 1 da GP (2026-11-05, `fluxos-gp-2026-11-05.json`, gravador 0.2.0):** Nova Tarefa na
Experience, implantação 11441, Etapa 45 "Operação assistida", `processes_ids [120]`,
`procedure_ids [4652]`, Pedido 34851, pessoa 865, dia 05/11. `09:00–17:00` → **409 sem
`codigo`**: "O Consultor selecionado não está disponível para o agendamento desta tarefa.
Verifique agenda disponível." `09:00–16:40` (4 min depois) → **200 "Inserido com sucesso"**,
`data: {}`. Entre as duas não houve nenhuma chamada de escrita gravada (nem Gestão de
Recursos, nem `AgendaRecursosSP`): a agenda já existia, e a Experience confere a janela da
tarefa contra ela. É uma terceira recusa, distinta do 422 (sem agenda) e do 409
`confirm_creation`; o Hub a trata como `RecusaDaExperienceError` (sem retry). Falta saber da GP
como aquela agenda nasceu (ERP ou Gestão de Recursos) e qual era a janela dela — é isso que
diz se o evento do Hub basta. Também ficou gravado um `DELETE /tasks/4630241` (19:06:15),
tarefa excluída pela GP antes do lançamento.

**Teste 2A da GP (2026-11-10, HUB SNK Teste GP, `backend.log` dela):** implantação 12230
(OACO), pessoa 21042 (GUSTAVO.PARAGUAI, codusu 11678), Pedido 5837727, 09:00–18:00. 20:09 —
16/11, Homologação (proc. 218, processo 30): evento gravado pelo `salvarEvento`, Experience
**409** "Consultor selecionado não está disponível" (ele já tinha tarefas 09:00–12:00 de Compras
nesse dia, lançadas fora do Hub). 20:10 — 16/11 de novo: o ERP recusou (`ORA-20001 … mesmos
dados`, gatilho `TRG_INC_UPD_TCSEAG_DUPLICIDADE`), Experience não chamada. 20:11 — 18/11,
Simulação (proc. 9028, processo 23): evento gravado, Experience **422** "…previamente criada
através da aplicação Gestão de Recursos". **Resposta: o evento do Hub não serve** — nenhuma
tarefa criada, dois eventos órfãos (16/11 e 18/11). Segue o Teste 2B
(`ferramentas/gravador-fluxos-gp/ROTEIRO-TESTE-2B.md`): gravar a Gestão de Recursos e trocar o
`salvarEvento` pela chamada dela. Na mesma rodada: o mapeamento importado passou a mostrar o
módulo (processo da Experience) — "Etapa › Módulo › Procedimento", agrupado no modal.

**Teste da GP em 12/11 — pedido errado.** O Hub gravou o evento (Gustavo, 13/11 14:00–17:00) e a Experience respondeu "Ocorreu um erro de sistema… Código do Erro: 2292302". O `application_id` enviado foi 5837727: o "Código" que aparece no nome do pedido (é a OS), não o `id` do pedido (36835). A gravação do mesmo dia mostra a tela buscando os pedidos em `GET /applications/implantation/{id}/stage/{s}?procedures_ids=…` e enviando o `id`. Correção: o campo Pedido do modal virou lista preenchida por essa chamada (`Experience.pedidosDaEtapa`, rota `GET …/nova-tarefa/pedidos`); o GP escolhe, não digita. Sobrou um evento na Agenda (13/11 14–17) sem tarefa.

**Causa do 422 achada — o parceiro (16/11, `fluxos-gp-2026-11-16 (1).json` + `backend.log` da GP).**
A gravação não pegou a Gestão de Recursos (nenhum domínio novo), mas mostra o que importa: todo
evento de cliente que a Experience aceitou tem `CODPARC`; os sem parceiro são pessoais (férias,
terapia). O caso decisivo: evento 48702366 (Leticia, 17/11 09–13, implantação 12466) aparece no
`/calendar` com `source: "om"`, `schedule_id: null` e **`implantation_id: 12466`** — a Experience
ligou o evento do OM ao projeto sozinha, pelo parceiro; o `/tasks/insert` deu 200 e o evento virou
`source: "database"`. O Hub mandava `codParc: ''`. O parceiro sai do `company_name` da implantação
(`/implantations/filters`: `"85482 - OACO PRODUTOS DE ACO"` → 85482; EMMIG 293 e TOTALTEC 83069
batem com os eventos aceitos). Correção: `Experience.parceiroDaImplantacao` → `codParc` no
`salvarEvento` (Nova Tarefa e lote). **Homologar com a GP.**

**Antes de gravar, conferir a agenda (pedido da GP em 16/11 — havia duplicidade).** Nova Tarefa e
lote leem a Agenda do dia ao vivo: evento do mesmo parceiro cobrindo o horário é reaproveitado
(não grava outro, segue para a tarefa); qualquer outro agendamento que encosta no horário (outro
cliente, férias, evento parcial) recusa sem gravar, dizendo o quê, de quem e quem lançou
(`situacaoNaAgenda`). Recusa da Experience depois de criar o evento agora o **desfaz**
(`AgendaRecursosSP.cancelarEvento`, achado pela releitura do dia) — não sobra órfão. Também no
pedido: duplo clique num dia da agenda abre os lançamentos do projeto naquele dia (eventos deste
cliente de quem está na equipe + tarefas abertas na Experience) com Excluir em cada um
(`DELETE …/agenda/eventos/:nuEvento?data=`, conferido ao vivo: só evento do cliente e da equipe);
e o filtro da agenda separa "Só <cliente>" de "Só outros clientes" (agenda de outro cliente fica
apagada, borda pontilhada).

**Importar planilha: Agenda e Experience por marcação (16/11).** Rodapé do modal ganhou "Gerar na
Agenda de Recursos" e "Gerar tarefa na Experience"; Gravar faz só o marcado (Meet só junto da
Agenda). Com a Experience marcada aparece a coluna "Processo na Experience" (Etapa › Módulo do
mapeamento = módulo inteiro) e um atalho para todas as linhas. `POST …/experience/lote` confere
tudo antes de gravar: agenda deste cliente cobrindo o horário (`situacaoNaAgenda` = existente),
pessoa pelo login do executante do evento e Pedido único da Etapa+procedimentos. Qualquer
pendência = 409 com `pendencias[{indice, motivo}]` e **nada gravado** (pedido da GP: só tarefa
marcada e sem agenda → avisa e não grava). Com as duas marcações, a Agenda grava primeiro e só
as linhas sem erro nela vão para a Experience. Mais de um Pedido no processo: a linha pede a Nova
Tarefa (escolha manual do Pedido).

**Escolha do processo como na Experience (12/11).** A lista única de procedimentos (875 na OACO) estourava a tela. O modal agora tem Etapa → módulos em cards (como a tela Etapas) → opções de cada módulo. Marcar o módulo cobre todas as opções dele; abrir e marcar algumas lança só essas. A Nova Tarefa manda `stageId` + `procedureIds`; o servidor confere tudo no mapeamento da Etapa e une os módulos em `processes_ids`, como a gravação de 12/11 (`processes_ids: [23, 24]` com a união dos procedimentos). Dentro do módulo, as opções ficam nos agrupadores (atividades) da Experience, com "Expandir todos" e marcar o agrupador inteiro; a importação passou a guardar o nome da atividade no rótulo ("Etapa › Módulo › Atividade › Procedimento"). Mapeamento importado antes disso mostra as opções soltas até a GP clicar em "Atualizar processos da Experience".

**Onde a GP cria a agenda: fora do gravador.** Entre 06:14 e 06:20 de 31/10 não há nenhuma
chamada gravada, e em 5 dias não há nenhuma `AgendaRecursosSP.*` (a tela
`os.mov.agenda.recursos` foi só restaurada pelo workspace). A Gestão de Recursos está num
domínio que o `manifest.json` não cobre (só `experience.sankhya.com.br` e
`skw.sankhya.com.br`). Perguntar à GP a URL e incluí-la. O Chrome do Lich também roda sem a
extensão — o lote do vídeo não está em nenhum JSON.

**Excluir tarefa:** `DELETE /tasks/{id}` → `267 "Deletado com sucesso"`, sem corpo (03/11
01:00). Não se sabe se libera/apaga o evento no OM. Em 05/11 a GP excluiu a 4630241 (pessoa
865, 09:00–17:00) e relançou 09:00–16:40: remarcar tarefa ligada à agenda é excluir + lançar.
**No Hub (2026-11-05):** card da pessoa na Equipe → "Ver tarefas na Experience"
(`GET .../tarefas-experience?personId=`, `/tasks/filtering` com a sessão da GP no caminho e a
pessoa em `users` — formato da gravação, não validado para pessoa ≠ sessão) → "Excluir" com
segundo clique (`DELETE /api/experience/tarefas/:id`). Só a tarefa; o evento do ERP fica.

**Editar tarefa ligada à agenda:** `PUT /tasks/{id}` →
`422 {error_code: "linked_by_app_blocked", message: "Esta tarefa está vinculada a uma agenda
criada pela Aplicação Gestão de Recursos. A alteração só é permitida dentro do horário reservado
da agenda."}` (03/11 01:55, 2×). Tarefas sem esse vínculo mudaram de dia/etapa normalmente
(01:01). Ordem provável para remarcar: mover a agenda, depois a tarefa.

**Agenda da Experience serve de checagem prévia.** `POST /calendar` devolve, por pessoa/dia, os
eventos (`nuevento`, `confirmed`, `schedule_id`, `task_id`, `implantation_id`) e `intervals`
livre/ocupado; `failed_connection_om: true` em todas as respostas (lê da base própria). Base
para: não duplicar evento que o GP já criou, checar confirmação antes do insert e mostrar
disponibilidade.

**Outros fluxos vistos (candidatos, nada implementado):**
- *Saldo do Pedido × horas*: `POST /stages-gantt` → `448 "O total de horas dos pedidos do
  projeto é insuficiente … Total pedidos: 287:00. Total Horas Alocadas: 876:37."` (11441); etapa
  Operação assistida com 0h18 prevista recebendo dias inteiros no vídeo. Saldo por Pedido em
  `POST /applications/implantation/{id}` (`remaining_hours`).
- *Importar Pedido novo do OM*: `GET /applications/om/implantation/{id}` (`474 "Não existem
  pedidos disponíveis para o parceiro N"` quando não há) → `POST
  /applications/om/fap_number/{fap}` `[{nu_nota, qtd_horas, top, nature, …}]` → `POST
  /applications/insert-update-by-om {has_new_hours: true, implantation_id}`.
- *Equipe na implantação*: `GET /persons/find?email=…` (`490` "Usuário já está cadastrado como
  …"), `POST /persons/account/create`, `POST|PUT /persons/{id}/implantation/{id}` (com
  `confirmed_include`), `POST /persons/processes/client` (`441 uni_integration_error` na
  matrícula UNI). "Adicionar pessoa" no Hub hoje não inclui a pessoa na implantação.
- *Tarefa retroativa*: tarefa com data passada e ata longa na observação, agenda criada depois
  (31/10, proj. 11266).
- *Replanejamento de prazo*: `stages-gantt/need-approval` → `stages-gantt` com `reason`/
  `responsible`/`observation` + termo `PRINT_REPORT_CHANGE_REQUEST_DEADLINE`.
- *Lote*: o vídeo mostra o caso de uso — várias pessoas × dias na mesma etapa — feito por
  automação de tela; pela API seria uma chamada por linha a partir da prévia da planilha (2.2).

## 5. Fase 2: Google Meet por link de evento pré-preenchido (opção vigente até achar melhor)

**Decisão revista em 2026-10-29, validada ao vivo pelo usuário (com convidados)**: o GP marca
as pessoas nos cards da Equipe do Projeto, escolhe data/início/fim e clica **Gerar Meet**. O Hub
abre no navegador padrão (já logado no Google) um evento novo do Google Agenda pré-preenchido:
`https://calendar.google.com/calendar/render?action=TEMPLATE&text=<Cliente · Projeto>
&add=<login>@sankhya.com.br,...&dates=AAAAMMDDTHHMMSS/AAAAMMDDTHHMMSS&vcon=meet`.
`vcon=meet` (parâmetro não documentado) gera o link do Meet; `dates` sem `Z` é lido no fuso da
agenda de quem abre; sem data, o Google abre no próximo horário cheio de hoje. O GP clica
Salvar no Google. Código: `enderecoDoMeet` em `public/js/equipeDoProjetoDados.js`.

Zero credencial, zero projeto no Google Cloud, zero LLM. RPA no Google (Playwright/janela
oculta) foi descartado: o Google bloqueia login em navegador embutido/automatizado, a tela é
ofuscada e muda sem aviso, e automatizar a UI vai contra os termos.

**Limites conhecidos**: um clique em Salvar é obrigatório; o link do Meet não volta pro Hub
(coluna "Agenda meet" não é escrita sozinha); só convida quem tem login no ERP (usuário chave do
cliente fica de fora — o membro não guarda e-mail).

**Salvar sozinho — construído em 2026-10-29 (falta homologar no shell)**: a tela manda o link
pra `POST /api/google/meet` → ponte `/google/meet` → `desktop/src/sankhya/meetDoGoogle.ts`, que
abre o link numa janela oculta na partição `persist:hub-google` (a do painel Gmail/Chat, já
logada no Google), espera o Meet aparecer no formulário, clica `#xSaveBu` (aria-label "Salvar"),
responde "Enviar" no diálogo de convite e devolve o link do Meet. Seletores conferidos ao vivo
num evento de teste (criado e apagado); o diálogo de convite (só com convidados) não foi visto.
Qualquer falha (Gmail não logado no Hub, tela do Google mudou, 30 s) → a tela abre o link no
navegador como antes. Automatizar a UI do Google é contra os termos de uso; aceito pelo usuário
(conta do próprio GP, um clique dele, volume baixo). Link do Meet volta no aviso, não é gravado.

**Confirmação de que o GP salvou — o que já foi descartado (2026-10-29)**: endereço *secreto*
iCal da agenda não aparece na conta Sankhya (admin do Workspace desligou); endereço *público*
iCal exige tornar a agenda pública na internet — não. Colar o link do Meet de volta no Hub à mão
foi recusado pelo usuário. Apps Script (5.1) descartado pelo usuário na leitura. **Decisão do
usuário (2026-10-29)**: o link pré-preenchido fica como a opção do Meet, sem confirmação
automática, até aparecer alternativa melhor; a busca continua em aberto.

### 5.1. Descartado (2026-10-29): Apps Script como "API própria" no Google

Descrito pra registro; o usuário avaliou que não funcionará no ambiente Sankhya. Não reabrir
sem fato novo (ex.: admin liberar web app).

Um script do Google Apps Script publicado como **web app** vira um endpoint HTTP que roda dentro
do Google, já autorizado na conta Google, sem projeto no Google Cloud nem client OAuth no Hub. O
Hub (ou qualquer agente, por `curl`) chama esse endpoint. Serve pros dois buracos da opção atual:

- **confirmar**: procurar na agenda o evento salvo pelo link (marca única na descrição) e devolver
  o link do Meet — o fluxo atual continua igual, o script só lê;
- **zero clique** (opcional): criar o evento já com Meet e convidados, sem abrir o Google.

**Script** (Editor do Apps Script › Serviços › adicionar "Google Calendar API" — o serviço
avançado, porque o `CalendarApp` simples não cria Meet):

```js
// Contrato: POST JSON. Resposta: { ok, id?, meet?, erro? }.
//   { acao: 'confirmar', marca: 'hub:<uuid>', de: ISO, ate: ISO }
//   { acao: 'criar', marca, titulo, inicio: ISO, fim: ISO, convidados: ['a@sankhya.com.br'] }
function doPost(e) {
  const pedido = JSON.parse(e.postData.contents);
  const responder = (corpo) =>
    ContentService.createTextOutput(JSON.stringify(corpo)).setMimeType(ContentService.MimeType.JSON);
  if (pedido.acao === 'confirmar') {
    const { items = [] } = Calendar.Events.list('primary', {
      q: pedido.marca, timeMin: pedido.de, timeMax: pedido.ate, singleEvents: true,
    });
    const evento = items.find((ev) => (ev.description || '').includes(pedido.marca));
    return responder(evento ? { ok: true, id: evento.id, meet: evento.hangoutLink } : { ok: false });
  }
  if (pedido.acao === 'criar') {
    const evento = Calendar.Events.insert({
      summary: pedido.titulo,
      description: pedido.marca,
      start: { dateTime: pedido.inicio }, end: { dateTime: pedido.fim },
      attendees: pedido.convidados.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: pedido.marca } },
    }, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
    return responder({ ok: true, id: evento.id, meet: evento.hangoutLink });
  }
  return responder({ ok: false, erro: 'acao desconhecida' });
}
```

**Publicação — o que decide quem é o organizador e como o Hub se autentica**:

| Modo | Executar como | Quem acessa | Organizador | Como o Hub chama |
| --- | --- | --- | --- | --- |
| A (preferido) | Usuário que acessa | Qualquer pessoa da Sankhya | o próprio GP | com a sessão Google do GP já logada no Hub (partição do painel de Comunicação/Gmail, `net.request` com `useSessionCookies`) |
| B | Eu (quem publicou) | Qualquer pessoa da Sankhya | conta que publicou | idem A |
| C | Eu | Qualquer pessoa (anônimo) + segredo no corpo, guardado no cofre | conta que publicou | direto do backend, sem cookie |

- Modo A: **uma publicação central** mantida por alguém (não uma por GP); cada GP autoriza o
  script uma vez (tela de consentimento do Google, no navegador). Lê/cria na agenda do próprio GP.
- Modo C só se o admin permitir web app anônimo; o segredo protege o endpoint, e a agenda exposta
  é a de quem publicou — usar conta de serviço tipo `agenda-projetos@`, nunca a pessoal.

**Fluxo no Hub com o script (modo A, só confirmação)**: `enderecoDoMeet` ganha `details=hub:<uuid>`
(marca guardada no Hub junto com data/hora e convidados); depois do Gerar Meet o Hub chama
`confirmar` (ao voltar o foco pra tela ou num botão "Conferir") e, achando, grava o link do Meet e
marca "Agenda meet" = OK. Sem achar, fica "aguardando salvar no Google".

**A validar antes de construir** (nenhum testado):
1. Admin do Workspace permite Apps Script e publicar web app (pra domínio ou anônimo)?
2. Serviço avançado Calendar habilita sem projeto Cloud próprio (deve, usa o projeto padrão)?
3. Modo A/B: requisição do Electron com os cookies da partição do Gmail passa pelo redirecionamento
   do `/exec` (302 pra `script.googleusercontent.com`) e chega como o GP?
4. `Events.list` com `q` acha a marca na descrição logo após salvar (atraso de indexação)?

### 5.2. Decisão anterior (2026-10-26, substituída): Calendar API direta

Calendar API **não é paga** no volume desta feature (poucos eventos/dia, dentro da cota
gratuita do Google). A alternativa cogitada ("botão aciona uma sessão Claude oculta que roda o
conector Calendar") teria custo recorrente de tokens por clique, dependeria da conta Claude de
quem clicou ter o conector Google Calendar autorizado, e não é um "botão de app" de verdade —
por isso descartada.

**Decisão**: OAuth2/Service Account feito uma vez (Google Cloud project), Calendar API chamada
direto do backend do Hub (`conferenceData.createRequest` pra gerar o link do Meet), credencial
guardada no cofre como as outras integrações do Hub. Zero LLM em produção.

## 6. Pendências do MVP (ainda sem resposta)

- ~~**Escrita na Agenda de Recursos (criar/excluir evento)**~~ — resolvido em 2026-10-26: payload
  real de `AgendaRecursosSP.salvarEvento`/`cancelarEvento` capturado e testado ao vivo (seção 4).
  Falta só confirmar se a resposta do `salvarEvento` já traz o `nuEvento` novo (ver seção 4).
- ~~**Mapeamento Etapa/Procedimento por cliente**~~ (seção 4.2) — infraestrutura de guarda
  resolvida em 2026-10-27: campo `Projeto.mapeamentoExperience` + rota
  `PUT .../projetos/:idProjeto/mapeamento-experience`. Falta a tela pro GP preencher e o código
  de busca na hora de montar a Nova Tarefa (não bloqueia mais o design, só a implementação).
  2026-11-10: a GP travou aqui no 1º teste (cópia do cadastro sem mapeamento). Virou botão
  "Importar processos da Experience" no modal: `POST .../mapeamento-experience/importar` lê
  Etapas → processos → atividades → procedimentos pela sessão logada e grava um item por
  Etapa+Procedimento, rotulado "Etapa › Procedimento" (substitui a lista).
- ~~**Endpoint de criar a Nova Tarefa na Experience**~~ — resolvido em 2026-10-27, ao vivo (seção
  4.2): `POST /tasks/insert` capturado com payload completo, mesma API que `experience.ts` já
  usa. Só uma execução testada (sem acesso próprio, pediu pra outra pessoa logar uma vez) —
  casos de borda (`already_asked: true`, Pedido ambíguo) ficam sem confirmar por enquanto.
  Atualizado pela gravação de 2026-10-29 (4.3): exige evento do OM confirmado, não devolve
  id, Pedido ambíguo visto; `already_asked: true` segue sem caso.
- ~~**Leitura de OS por pessoa/projeto (itens 2 e 4 do MVP)**~~ — resolvido em 2026-10-26, por
  leitura de código (sem precisar de spike ao vivo): `Experience.ordens(projetoId, personId,
  de, ate)` em `src/sankhya/experience.ts` **já devolve tudo que falta**, pronto pra reaproveitar:
  - `personId: null` traz as OS de **todo mundo** do projeto (item 2 do MVP: por pessoa);
  - cada `OrdemExperience` já vem com `statusAceite` (status da OS) e `horasFeitas` (`diff_time`);
  - `totalProjetoPrevisto`/`totalProjetoFeito` já vêm por linha, agregados pelo próprio
    `/orders/filtering` (item 4 do MVP: horas totais do projeto) — não precisa somar na mão.
  - `Experience.minhasOrdens(personId, de, ate)` faz o mesmo por pessoa, em todos os projetos.
  Falta só decidir o período (`de`/`ate`) a passar pra "todas as OS do projeto até hoje" na hora
  de ligar a tela de verdade (passo 9) — não é mais uma pendência de endpoint.
- ~~**Quem conta como "desenvolvedor"**~~ — resolvido em 2026-10-26 (decisão do usuário): **sem
  filtro por cargo**. A busca de "Adicionar pessoa" lista todo mundo que aparece na Agenda de
  Recursos; o GP escolhe manualmente quem entra na equipe do projeto. `CODCARGO`/`DESCRCARGO`
  continuam disponíveis no payload (úteis pra exibir na busca), só não viram filtro.
- ~~**Lib de leitura de `.xlsx` no backend**~~ — resolvido em 2026-10-26: `exceljs` adicionado
  (`package.json`). Implementado `src/sankhya/modeloEquipePlanilha.ts`:
  `gerarModeloEquipeXlsx()` (gera o `.xlsx` do modelo, cabeçalho + 1 linha de exemplo) e
  `interpretarPlanilhaEquipe()` (lê, valida cabeçalho, aplica herança de Etapa, devolve
  `linhas`/`erros` por número de linha). Testado (`modeloEquipePlanilha.test.ts`, 6 casos).
  Ainda falta: rota HTTP (download do modelo + upload), e resolver "Consultor" por nome
  contra a Agenda de Recursos (`chaveNome`/`nomesCorrespondem`) — isso só faz sentido depois
  que a leitura de pessoas da Agenda estiver ligada na tela de verdade (passo 9 do MVP).

**Rota de orquestração da Nova Tarefa, construída em 2026-10-27**: `POST
/api/clientes/:id/projetos/:idProjeto/nova-tarefa` (`src/rotas/rotasNovaTarefa.ts`) grava o
par de lançamentos (Agenda + Experience) numa chamada só. Pipeline completo:
- **Desktop** (`desktop/src/sankhya/janelaErpOculta.ts`): `salvarEvento()` monta o payload
  real capturado (seção 4) e chama pelo mesmo `scriptChamarServico`/`#chamarComRelogin` que
  `buscar()` já usa. Nova rota do bridge `POST /agenda/salvar-evento`
  (`desktop/src/backend/bridgeServer.ts`), reaproveitando `responderConsultaNaGuia`.
- **Backend**: `Credenciais.salvarEventoNaAgenda()` (`src/sankhya/credenciais.ts`) chama o
  bridge; `Experience.criarTarefa()` (`src/sankhya/experience.ts`) chama `POST /tasks/insert`
  pelo `#chamar` padrão (mesma fila/timeout/tratamento de sessão expirada dos outros métodos).
- **Orquestração**: a rota resolve `processo` (texto) contra `Projeto.mapeamentoExperience`
  pra pegar `stageId`/`processesIds`/`procedureIds`, grava primeiro na Agenda, só então na
  Experience. Falha na Agenda = erro direto. Falha na Experience **depois** da Agenda já ter
  gravado = 502 com `indeterminado: true` avisando pra conferir manualmente — sem `nuEvento`
  confirmado (pendência ainda aberta, ver seção 4) não dá pra desfazer sozinho.
  **2026-10-30 (seção 4.3)**: o evento sai com `confirmado: 'S'` (sem isso a Experience recusa
  com 409); recusa 4xx da Experience vira 409 "a Experience recusou, nada gravado lá" (ainda com
  `indeterminado: true` para travar o reenvio, que duplicaria o evento); `personIds` virou
  `personId` (uma pessoa por tarefa).

**Deliberadamente fora desta rota** (entrada ainda vem pronta de quem chama, não resolvida
aqui): `codUsu` (executante na Agenda) e `personIds` (Experience) são parâmetros diretos —
sem resolução automática por nome ainda, porque a busca de pessoas na tela (passo 9) não
existe; `implantationId` (projeto na Experience) também é parâmetro direto — a cadeia
`Cliente.nomesCompletos → codparc → FAP → implantation_id` já existe em código
(`consultasDaAgenda.ts`/`Experience.implantacoesDosFaps`), mas nenhum projeto do Hub guarda
qual FAP/implantação é dele, então essa resolução automática é um design ainda em aberto, não
assumido aqui; `applicationId` ("Pedido") idem — sem resolução automática, caso ambíguo nunca
testado (seção 4.2). Sem testes automatizados ainda (precisa de fake de `Credenciais`/
`Experience`, não feito nesta rodada) — validado só por `tsc` + suíte inteira verde.

**Passo 9, backend construído em 2026-10-27**: persistência e leitura real por trás da tela
(a UI ainda fala com `equipeDoProjetoMock.js` — falta o adaptador real e o redesenho do
modal "Nova Tarefa", ver pendência abaixo).

- **Equipe nunca tinha sido persistida.** `Projeto.membros: RecursoAgenda[]` (snapshot
  completo do recurso, não só o `codusu`) — decisão deliberada: a Agenda só lista um
  executante quando ele tem evento na janela de datas da consulta, guardar o `codusu` sozinho
  faria a equipe "sumir" quando a janela não pegasse ninguém daquele membro. `POST
  /api/clientes/:id/projetos/:idProjeto/membros` (corpo = um `RecursoAgenda`, idempotente por
  `codusu`) e `DELETE .../membros/:codUsu`.
- **`implantationId` por Projeto**, decidido com o usuário: campo manual (`Projeto.
  implantationId: number | null`), não resolução automática por FAP — um cliente pode ter
  mais de uma implantação, igual já valia pro mapeamento Etapa/Procedimento. `PUT
  /api/clientes/:id/projetos/:idProjeto/implantation-id`.
- **Busca de pessoas ("Adicionar pessoa") resolvida sem precisar de endpoint novo no
  Sankhya**: o snapshot SQLite (`AgendaRecursos`) só guarda a agenda do usuário configurado
  (`codusuAlvo`), não o roster da empresa — mas `buscar()`/`carregarAgendas` já trazem TODOS
  os executantes (`mostraUsuarioLogado: false`); o snapshot é que filtra na importação.
  `consultarAgendaCompleta()` (`src/sankhya/consultasDaAgenda.ts`) chama a mesma consulta ao
  vivo sem passar pelo SQLite. Rota `GET /api/agenda/recursos?de=&ate=&termo=`.
  **Corrigido em 2026-10-28, conferido ao vivo**: "todos os executantes" era falso.
  `carregarAgendas` devolve só a lista de executantes configurada pelo usuário logado na tela
  Agenda de Recursos (`resourceIdListaUsuarios: ...list.Executante`) — 12 devs, iguais no ano
  inteiro. Quem tem OS no projeto mas não está nessa lista (consultores) não aparece na busca.
  Contorno atual: o GP adiciona a pessoa na própria lista da Agenda no Sankhya.
  **Busca fora da lista, capturada ao vivo em 2026-10-28** (diálogo "Filtrar executantes" →
  "+ Adicionar" da própria Agenda): `mge@PesquisaSP.getSuggestion`, corpo
  `{criteria:{entityName:"Executante", compacted:false, ignoreEntityCriteria:false, limit:100,
  query:{$:"<texto>"}, orderByDesc:false, options:{...}, externalCriteria:{query:{},
  params:{param:[]}}}}`. Resposta: `responseBody.json.$` é um JSON em texto com `data[]`
  (objeto por campo, valor em `{$}`), `hasMore`, `fieldsMetadata` (101 campos de TSIUSU).
  Achados:
  - Lê **qualquer** usuário, sem bloqueio de ACL (testado: NAIANE.COSTA 12901, ANDRE.SEGATTO
    7145, GUSTAVO.PINTO 12469, busca por código `12229` também funciona).
  - Busca por várias palavras do nome completo ("Gustavo Ricardo Pinto") volta **vazia**;
    `gustavo.pinto` (login) acha; primeiro nome sozinho ("gustavo", "andre") estoura o
    `limit` de 100 (`hasMore: true`). Estratégia: tentar `primeiro.ultimo`, depois sobrenome,
    filtrar localmente com `pessoasCorrespondem`.
  - Campos úteis: `CODUSU`, `NOMEUSU`, `Cargo.DESCRCARGO`, `NOMEUSUCPLT` (vazio na maioria).
    `AD_ATIVO` não é confiável (vazio para ANDRE.SEGATTO, que está ativo) — não filtrar.
  - **A resposta traz campos sensíveis** (ex.: `AD_MITRA_TOKEN`, valores de ajuda de custo):
    a implementação tem que extrair só a lista branca acima, nunca repassar a linha inteira.
  - Pessoa adicionada por aqui que não está na lista de executantes do GP **não terá eventos
    da Agenda no card** (`carregarAgendas` só devolve a lista); OS da Experience aparecem
    normalmente. Gravar evento para ela (`salvarEvento` com o `codUsu`) não foi testado.
- **`GET /api/clientes/:id/projetos/:idProjeto/equipe?de=&ate=`**
  (`src/rotas/rotasEquipeDoProjeto.ts`): devolve `membros` (persistidos), `eventos` (Agenda ao
  vivo dos membros no período, via `consultarAgendaCompleta`), e `os` (Experience
  `experience.ordens(implantationId, null, de, ate)`, `null` com aviso se o projeto não tem
  `implantationId`). Cada OS ganha `codusuResolvido`: casamento por nome (`chaveNome`/
  `nomesCorrespondem`, mesmo critério de cliente↔parceiro) entre `OrdemExperience.pessoa` e
  `membro.nomeusu` — não existe id comum entre Agenda (`codusu`) e Experience (`person_id`)
  pra ligar os dois de outro jeito.
- Devolve os tipos reais (`RecursoAgenda`, `EventoAgenda`, `OrdemExperience`), não o formato
  de card do mock — sem tradução nenhuma pro lado do Hub.

**Passo 9, UI ligada em 2026-10-27** (sessão lich `UI-feature-gp`): `equipeDoProjetoMock.js`
removido (órfão), `public/js/equipeDoProjetoDados.js` é o adaptador real — chama as rotas
acima e traduz pro formato que `equipeDoProjeto.js` desenha. "Nova Tarefa" redesenhado pro
corpo real: `processo` via `<select>` do `mapeamentoExperience` do projeto (desabilitado sem
mapeamento), `implantationId` bloqueia o envio quando ausente (com campo simples na própria
tela pra cadastrar, chama `PUT .../implantation-id`), `personIds`/`applicationId` pedidos à
mão com aviso explícito de que não há resolução automática — nada fingido. Erro parcial
(Agenda gravou, Experience falhou) mostra a mensagem original pedindo conferência manual e
trava reenvio duplicado (sem auto-retry). `proprio` de cada evento (pra decidir se mostra
detalhe completo ou só dia+demanda) é inferido comparando `usulancador` do evento com o
usuário logado no ERP — sem id comum confirmado, é heurística, não garantia.

Testado: 9 casos novos em `equipeDoProjetoDados.test.js` + suíte inteira, `tsc` e Prettier
limpos. **Falta**: homologação visual/real com o shell desktop rodando (as rotas fazem
chamada real no Sankhya, não dá pra validar só com `npm run dev` sem o shell) e uma tela para
editar `mapeamentoExperience` (hoje só a API `PUT .../mapeamento-experience` existe, sem UI).

## 7. Pendências da Fase 2 (fora do MVP, não bloqueiam agora)

- **E-mail de outro usuário**: `loadRecords Usuario` com `EMAIL` só foi confirmado pro próprio
  usuário logado (`erp-dados-disponiveis.md` do DS-hub). Pra outro `CODUSU` (o dev visto por um
  GP) ninguém testou — pode esbarrar em ACL por campo/linha.
- ~~Setup do OAuth/Service Account da Calendar API (seção 5)~~ — dispensado em 2026-10-29 (link
  pré-preenchido, seção 5).
- E-mail do usuário chave do cliente pra convidar no Meet (hoje só quem tem login no ERP).
- Confirmação automática de que o GP salvou o evento + link do Meet de volta: sem caminho.
  Descartados: iCal secreto/público, colar link à mão, Apps Script (5.1). Link pré-preenchido
  segue como opção vigente.

## 8. Próximos passos (ordem do MVP)

1. ~~Prototipar a escrita na Agenda de Recursos num evento descartável~~ — feito em 2026-10-26:
   payload real capturado (`salvarEvento`/`cancelarEvento`), testado ao vivo, zero rastro
   deixado (seção 4). Virou chamada direta de serviço, não automação de UI.
2. ~~Descobrir o endpoint de criar a Nova Tarefa na Experience~~ — feito em 2026-10-27: `POST
   /tasks/insert` capturado ao vivo (seção 4.2), confirmado que a Experience é REST puro (sem a
   redação vista na Agenda de Recursos) — a mesma técnica de interceptação serviu, mais simples
   ainda (`fetch`/`XMLHttpRequest` da própria aba, nem precisou do truque do `ServiceProxy`).
3. ~~Resolver o mapeamento Etapa/Procedimento por cliente~~ — guarda implementada em
   2026-10-27 (seção 4.2): campo + rota prontos. Falta a tela de preenchimento e o uso na hora
   de montar a Nova Tarefa (passo 9).
4. Confirmar os endpoints de leitura de OS por pessoa/projeto (status, horas, agregado) —
   seção 6.
5. Decidir o filtro de "quem é desenvolvedor" (cargo).
6. ~~Corrigir o rótulo "Gerar OS" → "Nova Tarefa" nos protótipos~~ — feito em 2026-10-26.
7. Fluxo manual (uma reserva por vez) primeiro, de ponta a ponta, antes de importar planilha —
   a importação (seção 2.1) é só um jeito de preencher o mesmo formulário em lote, não muda a
   escrita nem a leitura de OS.
8. Importar planilha de cronograma (seção 2.1): escolher lib de `.xlsx`, parser do formato
   `Cronograma_FAP`, resolver "Consultor" por nome contra a Agenda de Recursos.
9. ~~Ligar a tela de verdade no backend~~ — feito em 2026-10-27 (seção 6): backend (persistência
   de equipe/`implantationId`, busca de pessoas, leitura real de agenda+OS) e UI (adaptador
   real + modal "Nova Tarefa" redesenhado). Falta homologação com o shell desktop rodando e
   uma tela pra editar `mapeamentoExperience` (hoje só API).
