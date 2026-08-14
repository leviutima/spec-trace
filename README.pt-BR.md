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

- **Não é um scaffolder de app.** O `init` só conecta o próprio spec-trace a
  um projeto que você já tem — `specs/`, um config do vitest, um par de
  scripts do npm. Ele não gera código de aplicação, e não existe nada que
  despeje um template de projeto.
- **Não é um framework de testes.** Roda em cima do Vitest; não o substitui.
- **Não é um agente, e não chama LLM.** Nenhuma dependência de SDK de IA.
  Determinístico: mesma entrada, mesma saída, sempre.
- **Não compete com o GitHub Spec Kit.** Complementa. Um projeto que usa
  `specify` deve conseguir plugar o `spec-trace` sem mudar nada da estrutura
  de specs dele.
- **Não impõe formato de spec proprietário.** Só exige que requisitos
  tenham um ID estável.

## Começo rápido

```sh
npm install --save-dev @leviutima/spec-trace vitest
npx spec-trace init
```

`typescript` é uma peerDependency opcional, usada só para a análise de AST
do `weak-test`. A maioria dos projetos já tem; se o seu não tiver,
`verify`/`report` continuam funcionando — só pulam o `weak-test` com um
aviso de uma linha explicando como habilitar.

O `init` detecta se o seu projeto é ESM ou CommonJS, se o Vitest já está
configurado, e em qual idioma escrever, e então gera exatamente o que
está faltando: `specs/AGENTS.md` (o manual do agente), um config do vitest
com o reporter já conectado se você ainda não tiver um, `.spec-trace/`, os
scripts `verify`/`report`/`check` no npm, e uma entrada no `.gitignore`.
Ele nunca sobrescreve nada que você já tem — veja
[`spec-trace init`](#spec-trace-init) abaixo para as flags e as garantias
exatas.

Ele não roda `npm install` por você nem escreve código de aplicação — as
duas linhas acima são a configuração inteira.

## O fluxo

1. **Escreva o requisito primeiro.** Um novo heading `REQ-<n>` entra em
   `specs/*.md` antes de qualquer código — esse é o primeiro portão de
   aprovação: o requisito diz o que você realmente quer dizer?
2. **Escreva um teste que declara o ID**, no nome do `describe` ou `it`,
   depois implemente o comportamento. Esse é o segundo portão: o
   `spec-trace verify` checa se o ID que você acabou de escrever é real, e
   se o teste não é decorativo.
3. Rode a suíte, depois `npx spec-trace report` e `npx spec-trace verify`
   até ficar limpo.

Isso está detalhado por completo, com o bloco exato de "definição de
pronto" para copiar no seu próprio `AGENTS.md`/`CLAUDE.md`, em
[`specs/AGENTS.md`](./specs/AGENTS.md) assim que o `init` o gerar para o
seu projeto. (O equivalente deste próprio repositório — as regras que o
desenvolvimento do spec-trace segue — fica em [`AGENTS.md`](./AGENTS.md)
na raiz do repo; `specs/AGENTS.md` é o nome que o `init` dá a esse manual
*dentro* de um projeto que adota o spec-trace.)

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

`weak-test` é `warn` por padrão porque é uma heurística (mais sobre isso
abaixo) — `--fail-on warn` é o que faz ela realmente barrar:

```sh
$ npx spec-trace verify --fail-on warn
[warn] weak-test Test "REQ-014: cart quantity validation > rejects a non-positive quantity" looks weak: non-discriminant-assertions (test/cart.test.ts:5)

0 errors, 1 warning
1 requirements | 1 covered (100%) | 0 uncovered | 1 weak
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
descoberto. **Uma suíte que não produziu nenhum resultado é uma violação,
não um estado neutro** — veja `empty-suite` abaixo, que é exatamente o que
pega um `vitest run --passWithNoTests` deixando passar um build verde sem
provar nada.

## CLI

### `spec-trace init`

Conecta o spec-trace ao projeto atual — veja [Começo rápido](#começo-rápido).
Detecta o seu tipo de módulo (`"type": "module"` no `package.json`) e se o
Vitest já está configurado, e gera só o que está faltando.

Flags: `--lang <en|pt-BR>` (padrão é o locale do seu ambiente, depois
inglês), `--dry-run` (imprime o plano, não escreve nada), `--force`
(sobrescreve arquivos que o `init` gerou antes — nunca outro
`specs/*.md`), `--verbose`.

Garantias: **idempotente** — rodar duas vezes não faz nenhuma mudança na
segunda vez. **Não-destrutivo** — só cria ou acrescenta, nunca apaga, e o
`--force` fica restrito ao conjunto exato de arquivos que o próprio `init`
gera. Se já existe um config do vitest, ele nunca é reescrito; se está
faltando o reporter, o `init` imprime o trecho a adicionar em vez de
editar o seu config por conta própria.

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
| `stale-results` | `results.json` não bate com os arquivos de teste que existem no disco | error |
| `empty-suite` | A suíte produziu zero resultados de teste — não prova nada | error |

Flags: `--json`, `--markdown <path>`, `--reporter <human\|json>`,
`--config <path>`, `--fail-on <error\|warn>`, `--baseline`, `--verbose`.

Toda execução — humana ou `--json` — termina com um resumo quantitativo:

```
27 requirements | 0 covered (0%) | 27 uncovered | 0 weak
```

O `--json` retorna `{ "requirements": { ...esses mesmos números }, "violations": [...] }`.

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

## Configurando num projeto CommonJS

Se o seu `package.json` não tem o campo `"type": "module"`, um
`vitest.config.ts` comum é carregado via `require()` — o que quebra contra
`@leviutima/spec-trace/reporter`, um import ESM-only, com um erro pouco
útil de "This package is ESM only". A correção é usar a extensão `.mts`
em vez de `.ts`: o carregador de config do Vitest sempre avalia um arquivo
`.mts` como ESM, independente do campo `"type"` do próprio pacote.

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new SpecTraceReporter()],
  },
})
```

O `spec-trace init` faz isso automaticamente — é exatamente por isso que
o `init` inspeciona o campo `"type"` do `package.json` antes de decidir
qual extensão gerar. Se você estiver conectando o reporter num config
CommonJS existente à mão, renomear para `.mts` é a correção.

## Adotando o spec-trace num projeto existente

Colocar o `verify` num projeto com meses de histórico sem teste faz a
primeira execução reportar todo requisito descoberto de uma vez — o que é
correto, mas não é algo que dá pra corrigir numa sentada só, e "só coloca
tudo em warn" é como uma ferramenta de cobertura silenciosamente para de
importar.

```sh
npx spec-trace verify --baseline
```

Isso registra as violações atuais em `.spec-trace/baseline.json` e sempre
sai com código 0 — estabelecer um baseline não é, em si, uma falha. A
partir daí, um `spec-trace verify` normal só reporta e falha em violações
que são **novas** desde que o baseline foi registrado; tudo que já estava
no baseline é filtrado tanto da saída quanto do exit code. A dívida
existente continua visível no `.spec-trace/report.md` (que nunca barra)
sem bloquear trabalho não relacionado, e só diminui quando alguém corrige
algo de propósito e roda `--baseline` de novo para mover a linha para
frente.

## Integração com agente

Por padrão o spec-trace é passivo: alguém precisa lembrar de chamá-lo.
O valor real aparece quando ele entra no loop que o agente já segue em
toda task. O `spec-trace init` já escreve isso para você em
`specs/AGENTS.md`; o bloco que ele gera é:

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

Se `AGENTS.md` ou `CLAUDE.md` já existe na raiz do seu projeto, o `init`
acrescenta uma linha apontando para `specs/AGENTS.md` nele; se nenhum dos
dois existe, ele só sugere criar um.

## Roadmap

- **Mutation testing (`spec-trace mutate`).** Fase 2. Em vez de chutar se
  um teste é fraco pelo formato dele, muta a implementação e checa se o
  teste realmente falha. É aí que "esse teste prova alguma coisa?" ganha
  uma resposta em vez de uma heurística.

## Desenvolvimento

Este repositório faz dogfooding em si mesmo: [`specs/`](./specs) contém os
próprios requisitos do spec-trace, todo teste em [`test/`](./test) está
marcado com o(s) ID(s) de requisito que ele prova, e o CI roda
`spec-trace verify` contra este repositório — em Linux e Windows — em todo
push.

```sh
npm install
npm run typecheck
npm run lint
npm test        # builda primeiro, depois roda a suíte (gera .spec-trace/results.json)
npm run verify  # roda a CLI buildada contra as próprias specs deste repositório
```

## Licença

MIT — veja [LICENSE](./LICENSE).
