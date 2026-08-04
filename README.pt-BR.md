# spec-trace

[![npm version](https://img.shields.io/npm/v/%40leviutima%2Fspec-trace.svg)](https://www.npmjs.com/package/@leviutima/spec-trace)
[![license](https://img.shields.io/npm/l/%40leviutima%2Fspec-trace.svg)](./LICENSE)

🇺🇸 [English](./README.md) | 🇧🇷 Português

**O agente não pode ser o juiz do próprio teste.**

Hoje, agentes de IA escrevem tanto o código quanto os testes que provam que
esse código está correto. Isso quebra a única garantia que o TDD oferecia: o
teste como oráculo independente. O agente otimiza para o verde, porque é
literalmente o que foi pedido — e converge para testes que passam sem provar
nada (`expect(x).toBeDefined()`, mock do próprio módulo sob teste, asserts
que apenas espelham a implementação).

O resultado não é código quebrado, que seria visível. É código **verde e
errado**, que só aparece em produção.

O `spec-trace` é o juiz externo. Ele não escreve teste e não escreve código.
Ele responde três perguntas, de forma verificável por máquina:

1. Todo requisito da spec tem um teste que o cobre?
2. Todo teste aponta de volta para algum requisito?
3. Esses testes realmente provam alguma coisa, ou são decorativos?

## O que isto NÃO é

- **Não é um scaffolder.** Não gera projeto nem estrutura de pastas de
  aplicação, e não existe `init` que despeja template de app.
- **Não é um framework de testes.** Roda em cima do Vitest; não o substitui.
- **Não é um agente, e não chama LLM.** Nenhuma dependência de SDK de IA.
  Determinístico: mesma entrada, mesma saída, sempre.
- **Não compete com o GitHub Spec Kit.** Complementa. Um projeto que usa
  `specify` deve conseguir plugar o `spec-trace` sem mudar nada da estrutura
  de specs dele.
- **Não impõe formato de spec proprietário.** Só exige que requisitos
  tenham um ID estável.

## Instalação

```sh
npm install --save-dev @leviutima/spec-trace vitest
```

`typescript` é uma peerDependency opcional, usada só para a análise de
AST do `weak-test`. A maioria dos projetos já tem; se o seu não tiver,
`verify`/`report` continuam funcionando — só pulam o `weak-test` com um
aviso de uma linha explicando como habilitar.

## Exemplo de ponta a ponta

Comece com um requisito:

```md
<!-- specs/cart.md -->

## REQ-014 — Cart rejects non-positive quantity

**When** the user submits a quantity less than or equal to zero,
**the system shall** reject the item and return the error code `INVALID_QUANTITY`.
```

Um agente implementa, e escreve um teste que referencia o requisito pelo ID
no `describe`:

```ts
// test/cart.test.ts
import { describe, expect, it } from 'vitest'
import { addItem } from '../src/cart'

describe('REQ-014: cart quantity validation', () => {
  it('rejects a non-positive quantity', () => {
    const result = addItem({ quantity: 0 })
    expect(result).toBeDefined()
  })
})
```

A implementação não rejeita nada de fato, e o teste não verifica o erro
`INVALID_QUANTITY` — só checa que *alguma coisa* voltou. O Vitest fica
verde:

```
✓ test/cart.test.ts (1 test)
```

Configure o reporter no `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new SpecTraceReporter()],
  },
})
```

Rode sua suíte uma vez para gerar `.spec-trace/results.json`, e então
pergunte ao juiz externo. `weak-test` é `warn` por padrão porque é uma
heurística (mais sobre isso abaixo) — `--fail-on warn` é o que faz ela
realmente barrar:

```sh
$ npx spec-trace verify --fail-on warn
[warn] weak-test Test "REQ-014: cart quantity validation > rejects a non-positive quantity" looks weak: non-discriminant-assertions (test/cart.test.ts:5)

0 errors, 1 warning
$ echo $?
1
```

Teste verde, código errado, e o `spec-trace` é a única coisa no fluxo que
percebeu — e com `--fail-on warn`, a única coisa que realmente impediu
isso de ser mergeado.

## Como funciona

### Specs

Qualquer heading de markdown (`##` até `######`) que comece com um ID no
padrão `REQ-\d+` é um requisito:

```md
## REQ-014 — Cart rejects non-positive quantity

**When** the user submits a quantity less than or equal to zero,
**the system shall** reject the item and return the error code `INVALID_QUANTITY`.
```

- O ID é o primeiro token depois dos marcadores do heading.
- Tudo depois do ID naquela linha é o título.
- O corpo é tudo até o próximo heading de nível igual ou superior —
  subheadings aninhados continuam fazendo parte do corpo.
- Um ID duplicado em qualquer lugar do diretório de specs é um erro fatal
  que lista cada ocorrência.
- Marque um requisito como fora de escopo com `<!-- spec-trace:ignore -->`
  em qualquer lugar do corpo dele.

### Testes declaram cobertura pelo nome

Um teste declara qual requisito ele prova colocando o ID no próprio nome ou
em qualquer `describe` ancestral:

```ts
describe('REQ-014: cart quantity validation', () => {
  it('rejects a non-positive quantity', () => { /* ... */ })
})

// ou direto no it
it('[REQ-014] rejects a negative quantity', () => { /* ... */ })
```

Nome, não metadado do runner, de propósito: é greppável, sobrevive a
refactor, não depende da API de nenhum runner específico e funciona com
qualquer runner de teste que aparecer no futuro. Um teste pode cobrir mais
de um requisito, e IDs declarados num `describe` são herdados por todo
teste dentro dele.

### Coleta

Um reporter customizado do Vitest (`@leviutima/spec-trace/reporter`)
escreve `.spec-trace/results.json` enquanto sua suíte roda, registrando o
estado real — `passed`, `failed`, `skipped` ou `todo`. **Um teste pulado
não conta como cobertura.** Um requisito coberto só por `it.skip` está
descoberto.

## CLI

### `spec-trace verify`

O comando principal. Rápido, feito para rodar em todo commit. Compara
`specs/` com `.spec-trace/results.json` e aplica estas regras:

| Regra | O que ela pega | Padrão |
| --- | --- | --- |
| `uncovered-requirement` | Requisito sem nenhum teste apontando pra ele | error |
| `orphan-test` | Teste sem nenhum `REQ-` no nome ou nos ancestrais | warn |
| `unknown-requirement` | Teste aponta pra um ID que não existe na spec | error |
| `skipped-coverage` | Requisito coberto só por testes skipped/todo | error |
| `failing-coverage` | Requisito cujos testes que o cobrem estão falhando | error |
| `duplicate-requirement` | O mesmo ID declarado mais de uma vez | error |
| `weak-test` | Teste que bate com uma das heurísticas abaixo | warn |

Flags: `--json`, `--markdown <path>`, `--reporter <human\|json>`,
`--config <path>`, `--fail-on <error\|warn>`.

Sai com código 1 se alguma violação estiver no nível de `--fail-on` ou
acima (padrão: `error`).

### `spec-trace report`

Gera um `.spec-trace/report.md` legível por agente — uma tabela de
requisitos mais uma seção por violação, com o arquivo, a linha e uma
instrução acionável em uma frase, escrita para um agente agir no próximo
turno. Nunca define exit code de falha; não é um gate de CI.

### `spec-trace mutate`

**Roadmap, ainda não implementado.** Veja [Roadmap](#roadmap).

## weak-test: o que ele pega, e por que é uma heurística

Análise estática do AST do arquivo de teste, nada é executado. Um teste é
sinalizado se:

1. Tem zero chamadas de `expect`.
2. **Todas** as asserções são não-discriminantes: `toBeDefined`,
   `toBeTruthy`, `toBeFalsy`, `not.toThrow`, ou um `toBeInstanceOf`
   isolado.
3. O módulo sob teste está mockado — o alvo de uma chamada `vi.mock()`
   coincide com um módulo que o teste importa e exercita.
4. Uma asserção compara valores literais idênticos dos dois lados
   (`expect(2).toBe(2)`).

**Isto é uma heurística, e vai ter falso positivo.** Por isso o padrão é
`warn`, não `error`, e dá pra silenciar linha a linha:

```ts
// spec-trace-disable-next-line weak-test
it('a test spec-trace misjudges', () => { /* ... */ })
```

`weak-test` é um detector de cheiro, não prova. Prova de verdade — saber
que uma asserção realmente falharia se a implementação estivesse errada —
é o que a mutação de testes entrega, e é o item de roadmap abaixo.

## Configuração

`spec-trace.config.ts` é opcional; todo default abaixo funciona sem
nenhum arquivo de config.

```ts
import { defineConfig } from '@leviutima/spec-trace'

export default defineConfig({
  specDir: 'specs',
  resultsFile: '.spec-trace/results.json',
  idPattern: 'REQ-\\d+',
  testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
  testIgnore: [],
  rules: {
    'orphan-test': 'warn',
    'weak-test': 'warn',
  },
  ignore: ['REQ-001'],
})
```

`testIgnore` é uma exclusão simples por prefixo de caminho (não é glob)
para diretórios que legitimamente contêm arquivos `*.test.ts` que nunca
são executados diretamente — o próprio `test/fixtures/` deste projeto é
exatamente esse caso.

## Integração com agente

Por padrão o spec-trace é passivo: alguém precisa lembrar de chamá-lo.
O valor real aparece quando ele entra no loop que o agente já segue em
toda task. Veja [`AGENTS.md`](./AGENTS.md) para as regras deste
repositório, e copie o bloco abaixo no `AGENTS.md` / `CLAUDE.md` do seu
projeto:

```md
## Definition of done

Uma task só está pronta quando:

1. `npm test` roda a suíte completa (gera `.spec-trace/results.json`)
2. `npx spec-trace report` escreve `.spec-trace/report.md`
3. Você leu `.spec-trace/report.md` e corrigiu tudo até `npx spec-trace verify` sair limpo

Nunca marque uma task como concluída com violações abertas.
Nunca silencie `weak-test` com `spec-trace-disable-next-line` só para
fechar o gate — silencie apenas quando conseguir explicar por que o
teste é forte apesar da heurística sinalizar.
```

## Roadmap

- **Mutation testing (`spec-trace mutate`).** Fase 2. Em vez de chutar se
  um teste é fraco pelo formato dele, muta a implementação e checa se o
  teste realmente falha. É aí que "esse teste prova alguma coisa?" ganha
  uma resposta em vez de uma heurística.

## Desenvolvimento

Este repositório faz dogfooding em si mesmo: [`specs/`](./specs) contém os
próprios requisitos do spec-trace, todo teste em [`test/`](./test) está
marcado com o(s) ID(s) de requisito que ele prova, e o CI roda
`spec-trace verify` contra este repositório em todo push.

```sh
npm install
npm run typecheck
npm run lint
npm test        # builda primeiro, depois roda a suíte (gera .spec-trace/results.json)
npm run verify  # roda a CLI buildada contra as próprias specs deste repositório
```

## Licença

MIT — veja [LICENSE](./LICENSE).
