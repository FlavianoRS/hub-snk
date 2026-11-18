# Status do Sankhya ID dos usuários do cliente (visão do GP)

Origem: pedido direto em 2026-11-05, gravação `fluxos-gp-2026-11-05.json`
(`G:\...\Processos Hub\`, 6024 registros, 29/10 a 05/11). Planejado antes de código.

## 1. Objetivo

O GP vê, na Equipe do Projeto, quem do cliente ainda não ativou o Sankhya ID e lembra a pessoa
sem abrir a Experience: hoje ele entra em Projeto › Usuários, abre a pessoa e clica reenviar.

## 2. O que a gravação mostra

Fluxo real (repetido em 11267, 12230, 11352):

1. `POST /persons/implantation/{id}` `{ ..., refresh_account_status: true }` — lista da aba
   Usuários com `account_status`, `has_uni_error`, `role_id`, `sinc`, `email`.
2. `GET /persons/account/user/{person_id}` — `{ status, sankhya_id_error,
   sankhya_id_error_message }`.
3. `POST /persons/account/resend-email` `{ person_id }` — resposta `"Email reenviado com
   sucesso."` (HTTP 200, `response.status` 269).

Valores vistos de `account_status` (lista):

| Valor                     | Vezes | Quem            | Ação do GP                       |
| ------------------------- | ----- | --------------- | -------------------------------- |
| `ativo`                   | 51    | cliente/Sankhya | nada                             |
| `aguardando_verificacao`  | 17    | cliente         | reenviar e-mail (visto)          |
| `inexistente`             | 5     | cliente         | a confirmar (ver §5)             |
| `ativo` + `has_uni_error` | 3     | cliente         | a confirmar (ver §5)             |
| `null`                    | 114   | quase só Sankhya | nada                            |

Achados: a GP reenviou 4× para a mesma pessoa em 3 h (27780); `account_status` da lista pode
ficar defasado (27782 aparece `inexistente` na lista e `ativo` no detalhe).

## 3. Regras de interface

Implementado (2026-11-05):

1. Tabela **Sankhya ID pendente (N)** na Equipe, logo abaixo dos totais, só quando há
   pendente: pessoa + e-mail, selo **Aguardando verificação** (amarelo) ou **Erro no Sankhya
   ID** (vermelho), último lembrete. Vale para qualquer usuário do projeto na Experience,
   esteja ou não na equipe do Hub (usuário chave costuma estar como card).
2. Botão **Reenviar e-mail** por pessoa → `resend-email` da Experience. Lembrete há menos de
   24 h: o botão vira **Confirmar reenvio** e só o segundo clique envia.
3. A Equipe pede a lista com `refresh_account_status: true` (como a aba Usuários).
4. Pedido do usuário (2026-11-05): **todo card da equipe mostra sempre o status** ao lado do
   nome — **Sankhya ID ativo** (verde), Aguardando verificação (amarelo), Erro no Sankhya ID
   (vermelho), **Sem Sankhya ID informado** (cinza: Experience não manda status — quase sempre
   gente da Sankhya — ou pessoa não achada / projeto sem implantation_id). Sem selo: só
   `inexistente`. O
   card acha a pessoa da Experience por `membroDaPessoa` (person_id, login ou nome).

Fora por ora: "Lembrar todos" e contador no Resumo das equipes — adicionar se o GP pedir.

## 4. Backend

- `experience.pessoasDoProjeto(id, atualizarConta)`: com `true` manda
  `refresh_account_status: true`; devolve `situacaoConta` e `erroSankhyaId`.
- `experience.reenviarEmailDoSankhyaId(personId)`: `GET /persons/account/user/{id}`; `ativo` →
  `RecusaDaExperienceError`; senão `POST /persons/account/resend-email`.
- `POST /api/clientes/:id/projetos/:idProjeto/pessoas/:personId/lembrete-sankhya-id`: reenvia
  e grava a data em `Projeto.lembretesSankhyaId[personId]`; conta ativa = 409.
- Testes: `pendentesDoSankhyaId` (front) e a rota (reenvio + 409).

## 5. Decisões do usuário (2026-11-05)

- Lembrete = **só o reenvio oficial da Experience** (`resend-email`); nada pelo SMTP.
- **Só no clique do GP**; nada automático.
- `inexistente`: **ignorar** — não mostra selo, não conta como pendente, sem botão.
- `has_uni_error` sem resposta: mostra o selo com a mensagem e permite reenviar (mesma ação).
