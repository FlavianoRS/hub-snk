# Equipe do Projeto (GP) — módulo e pontos de encaixe

Mapa de onde mora o código da Equipe do Projeto e de onde ele encosta no resto do Hub.
As regras de negócio estão nas specs `reserva-agenda-recursos-gp.md`, `resumo-equipes-gp.md`,
`cronograma-cliente-gp.md` e `status-sankhya-id-gp.md`.

## O que é só da Equipe (entra inteiro)

| Camada   | Onde                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | `src/equipe/` — rotas (equipe, Nova Tarefa, Resumo, planilha-modelo, dados do projeto, cronograma), `ExperienceDaEquipe`, `AgendaDaEquipe`, portas e testes |
| Desktop  | `desktop/src/equipe/` — gravar/cancelar evento, pesquisar usuários, Meet do Google e as rotas da ponte                                                      |
| Frontend | `public/js/equipeDoProjeto.js`, `equipeDoProjetoDados.js`, `resumoEquipes.js`, `resumoEquipesDados.js` (+ testes) e `public/css/equipe.css`                 |

## Portas (`src/equipe/portas.ts`)

Tudo que o módulo precisa do Hub passa por quatro portas, ligadas em
`src/equipe/adaptadoresDoHub.ts` — o único arquivo do módulo que conhece as classes do Hub:

| Porta                 | Contrato                                                                                                                                                                                           | Neste Hub                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ApiDaExperience`     | `requisitar(caminho, init)` autenticado (401/403 → `SessaoExpiradaError`), `descobrirPersonId()`, `ordens(...)`                                                                                    | `Experience` (`src/sankhya/experience.ts`)          |
| `PonteDoHub`          | `requisitarNaPonte(caminho, corpo)` (POST JSON na ponte do desktop), `consultarAgendaDeRecursos(de, ate)`                                                                                          | `Credenciais` (`src/sankhya/credenciais.ts`)        |
| `RepositorioDaEquipe` | `listar`, `buscarPorId`, `alterarProjeto`, `definirMapeamentoExperienceDoProjeto`, `definirFasesDoProjeto`, `definirImplantationIdDoProjeto`, `adicionarMembroDoProjeto`, `removerMembroDoProjeto` | `RepositorioClientes`                               |
| `EmailDaEquipe`       | `enviar({ assunto, texto, html, para })`, sem SMTP → `EmailNaoConfiguradoError`                                                                                                                    | `EnviadorDeEmail` + assinatura do e-mail ao cliente |

No desktop, a porta é `ChamadorDoErp.chamarServico(serviceName, requestBody)`
(`desktop/src/equipe/agendaDaEquipe.ts`): chama o `service.sbr` na janela oculta logada e devolve
`ok: false` quando o ERP recusa.

## Pontos de encaixe fora do módulo

| Arquivo                                                                            | O que a Equipe acrescenta                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`                                                                     | `registrarEquipeNoHub(servidor, { credenciais, experience, clientes, configuracao, enviadorDeEmail, log })`                                                                                                                                                  |
| `src/sankhya/experience.ts`                                                        | método `requisitar` (porta `ApiDaExperience`)                                                                                                                                                                                                                |
| `src/sankhya/credenciais.ts`                                                       | método `requisitarNaPonte` (porta `PonteDoHub`)                                                                                                                                                                                                              |
| `src/tipos.ts`                                                                     | campos do `Projeto`: `membros`, `implantationId`, `mapeamentoExperience`, `fases`, `faseAtual`, `meets`, `lembretesSankhyaId`; tipos `MembroDoProjeto`, `MapeamentoEtapaExperience` e `MeetDoProjeto`                                                        |
| `src/repositorio/repositorioClientes.ts` e `arquivo/repositorioClientesArquivo.ts` | métodos da porta `RepositorioDaEquipe`, `ProcessoDeMapeamentoDuplicadoError` e a leitura dos campos novos com valor padrão para projetos antigos                                                                                                             |
| `package.json`                                                                     | dependência `exceljs` (planilha-modelo)                                                                                                                                                                                                                      |
| `desktop/src/backend/bridgeServer.ts`                                              | uma linha: `tratarRotaDaEquipe(req, res, agenda, { lerCorpo, responderJson, responderConsultaNaGuia })`                                                                                                                                                      |
| `desktop/src/sankhya/janelaErpOculta.ts`                                           | método `chamarServico` (porta `ChamadorDoErp`)                                                                                                                                                                                                               |
| `desktop/src/config.ts`                                                            | `PARTICAO_GOOGLE` exportado (Meet)                                                                                                                                                                                                                           |
| `desktop/src/interface/comunicacao.ts`                                             | `userAgentDeNavegador` exportado (Meet)                                                                                                                                                                                                                      |
| `public/index.html`                                                                | `<link>` do `equipe.css`, botão e área da aba "Equipes" (Resumo), modais da Equipe                                                                                                                                                                           |
| `public/js/app.js`                                                                 | imports, aba "equipes" em `alternarVisualizacao`, abas do card de projeto, `podeGerenciarEquipeDoProjeto` (perfil GP, sem Terceiro), `aplicarAcessos`, inicialização de `iniciarEquipeDoProjeto` e `iniciarResumoEquipes`, `erro.pendencias` em `requisitar` |

## Fora do PR

O instalador de teste "HUB SNK Teste GP" (`desktop/electron-builder.teste-gp.yml`,
`EDICAO_DE_TESTE` em `desktop/src/config.ts`, `main.ts`, `atualizacao.ts` e `release-teste-gp/`
no `.gitignore`) é ferramenta de homologação, não funcionalidade.
