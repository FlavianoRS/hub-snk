# Resumo das equipes (visão do GP)

Origem: pedido direto (não vem do DS-hub). Planejado em 2026-10-29 sobre protótipo FigCraft, antes
de qualquer código. Complementa [`reserva-agenda-recursos-gp.md`](./reserva-agenda-recursos-gp.md):
lá é a equipe de **um** projeto; aqui é o panorama de **todos** os projetos do GP.

## 1. Objetivo

Uma visualização nova no Hub em que o GP enxerga, num quadro estilo kanban, todos os seus
clientes, os projetos de cada cliente e as equipes de cada projeto, só com o nome dos
integrantes e o resumo das OS no período: horas, OS abertas, OS concluídas e pessoas.

## 2. Protótipo de referência (validado com o usuário)

FigCraft v3: `C:\Users\flaviano.santos_sank\Documents\Projetos\Artcraft_portable\prototypes\`

- `resumo-equipes-v3.figcraft` (abrir no `figcraft.exe`; modo protótipo tem os cliques ligados)
- `export-resumo-v3\*.png` — 4 frames: **Resumo das equipes** (tela principal), **Seletor
  Pessoa (aberto)**, **Resumo — filtro Pessoa: Marina Alves, Diego Fontes**, **Destino — guia do
  projeto no cliente**
- `resumo-equipes-gerar.py` — gerador do arquivo (dados de exemplo e paleta no topo)

Mesma paleta e tokens da tela da Equipe do Projeto (FigCraft v3 da equipe), que já está em
`public/css/styles.css` na seção "Equipe do Projeto — FigCraft v3".

## 3. Regras de interface (decididas com o usuário em 2026-10-29)

1. **Quadro**: uma coluna por cliente (nome, `N projetos · X h no período`); dentro, um cartão
   por projeto com HORAS · ABERTAS · CONCLUÍDAS · PESSOAS, um divisor e os nomes da equipe em
   etiquetas que quebram linha. Nome longo de projeto quebra linha, não corta.
2. **Muitos clientes: o quadro rola na horizontal** (colunas de largura fixa, setas ‹ › no
   cabeçalho do quadro e barra de rolagem).
3. **GP = usuário logado** no Sankhya/Experience. Só aparecem os projetos dele; **não há filtro
   de GP**. Subtítulo: `Seus projetos como GP · N clientes · N projetos · N pessoas`.
4. **Pessoa em mais de um projeto** (no conjunto inteiro, não só no filtrado): etiqueta em violeta
   discreto, só como indicativo — nunca vermelho, amarelo ou verde (essas cores já significam
   OS abertas/concluídas). Legenda "Pessoa em mais de um projeto" à direita da barra de filtros.
5. **Clique no cartão** (e no "Abrir projeto ›" do rodapé) leva à guia do projeto dentro do
   cliente — a guia Equipe já existente.
6. **Filtros**: Cliente, Projeto e Pessoa, cada um com **seleção múltipla** (lista com caixas de
   marcar, busca no topo, marcadas primeiro, "Aplicar (N)"). Seletor ativo fica verde com `×` e
   aparece "Limpar filtros". A busca de texto do cabeçalho continua.
7. **Filtro por pessoa soma só as horas/OS daquela(s) pessoa(s)** — KPIs do topo, cabeçalho de
   coluna e números do cartão. No cartão, PESSOAS vira `filtradas/total` (ex.: `1/6`); as
   etiquetas das pessoas filtradas ganham contorno branco; a barra mostra "horas e OS somente
   das pessoas filtradas". Projetos sem nenhuma pessoa filtrada somem; clientes sem projeto
   restante somem.
8. **Sem dados é "—", nunca 0**: horas, abertas e concluídas zeradas (ou OS indisponíveis)
   aparecem como `—` em cinza. **Cliente sem OS no período continua no quadro** com `—`.
9. **Período**: o mesmo seletor de período da Equipe (padrão: mês corrente).

## 4. De onde vêm os dados (o que já existe)

Nada novo no Sankhya. Tudo é a mesma leitura da guia Equipe, repetida por projeto:

- **Clientes e projetos**: `RepositorioClientes` (estado local do Hub). O Hub é local, de um
  usuário só: os projetos cadastrados nele são os do GP logado. Entram no quadro os projetos com
  **equipe definida** (`Projeto.membros.length > 0`); projeto sem equipe não aparece.
- **Integrantes**: `Projeto.membros` (snapshot de `RecursoAgenda`, `nomeusu`).
- **OS por pessoa**: `experience.ordens(implantationId, null, de, ate)` por projeto, cada OS com
  `codusuResolvido = resolverMembroDaOrdem(ordem, projeto.membros)` (casamento por nome — não há
  id comum entre Agenda e Experience; mesma ressalva da spec da Equipe).
- **Horas / aberta / concluída**: exatamente `traduzirOs` + `resumirOs` de
  `public/js/equipeDoProjetoDados.js` (horas de `horasFeitas` `H:MM`; `statusAceite`
  "Concluído" = concluída, "rejeit…" = rejeitada, resto = aberta). Reusar, não reimplementar.
- OS cuja pessoa não casou com nenhum membro (`codusuResolvido === null`) **não entram** nos
  números de pessoa; entram nos totais do projeto (sem filtro de pessoa), igual à guia Equipe.
- Projeto sem `implantationId` ou com Experience indisponível: números `—` e um aviso discreto no
  cartão ("sem implantation_id" / mensagem original), sem derrubar o quadro inteiro.

## 5. Contrato da rota nova

`GET /api/equipes/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD`

```json
{
  "clientes": [
    {
      "id": "uuid",
      "nome": "Horizonte Logística",
      "projetos": [
        {
          "id": "uuid",
          "nome": "Implantação ERP — Fiscal & Financeiro",
          "membros": [{ "codusu": 123, "nomeusu": "Marina Alves" }],
          "os": [/* OrdemExperience + codusuResolvido, como na rota /equipe */],
          "avisoOs": null
        }
      ]
    }
  ]
}
```

- `os: null` + `avisoOs` quando o projeto não tem `implantationId` ou a Experience falhou para
  aquele projeto (erro por projeto, não 502 da rota inteira). Sessão expirada da Experience
  continua sendo 409 com `sessaoExpirada: true` (mesmo tratamento da rota `/equipe`).
- **Sem Agenda** nesta rota: o resumo não mostra eventos, só OS — não chama
  `consultarAgendaCompleta`.
- Agregação (totais, filtro por pessoa, "em mais de um projeto") é **no frontend**, a partir de
  `os` traduzidas por pessoa — o filtro precisa recalcular sem nova chamada.
- Consultas da Experience por projeto em paralelo (`Promise.all`), uma por projeto com equipe.
  ponytail: N chamadas por abertura; se ficar lento com muitos projetos, cachear por
  `implantationId+período` no servidor.

## 6. Onde fica na interface

Visualização nova na barra principal: botão `btn-visualizacao-equipes` com rótulo **"Equipes"**
(não "Resumo": `btn-visualizacao-resumo` já existe e é outra tela). Arquivos novos sugeridos:
`public/js/resumoEquipes.js` (tela) e `public/js/resumoEquipesDados.js` (adaptador + agregação
pura, testável em `resumoEquipesDados.test.js`), rota em `src/rotas/rotasEquipeDoProjeto.ts`
(reaproveita `resolverMembroDaOrdem` e os esquemas de período).

## 7. Testes mínimos

- Agregação: totais por projeto/cliente/geral; filtro por 1 e por 2 pessoas soma só delas;
  `PESSOAS` `filtradas/total`; pessoa em mais de um projeto; zero vira `—`; cliente sem OS
  continua; projeto sem pessoa filtrada some.
- Rota: projeto sem `implantationId` volta `os: null` com aviso sem derrubar os outros.

## 8. Situação

Implementado em 2026-10-29 (tela pela sessão lich Codex 20; spec e calendário mensal da guia
Equipe por esta sessão) e validado na interface pelo usuário no mesmo dia. Junto entrou o ajuste
da Agenda de Recursos na guia Equipe: período com mais de um mês mostra um mês por vez, com ‹ ›
(`mesesDoPeriodo` em `equipeDoProjetoDados.js`).

## 9. Pendências

- **"Meus projetos como GP"** está resolvido como "projetos com equipe neste Hub" (Hub local).
  Se um dia o Hub for compartilhado, filtrar por `OrdemExperience.coordenador` contra o usuário
  logado — hoje não precisa.
- Filtros de Cliente/Projeto não foram desenhados abertos no protótipo; seguem o padrão do
  seletor de Pessoa.
