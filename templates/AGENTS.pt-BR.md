# Trabalhando com o spec-trace

Este projeto usa o [spec-trace](https://github.com/leviutima/spec-trace)
como juiz externo: ele verifica se os testes realmente provam os
requisitos em `specs/`, não apenas se passam.

## O fluxo

1. Escreva (ou atualize) um requisito em `specs/*.md` como um heading que
   comece com um id estável (`REQ-<n>` por padrão) — antes de escrever
   qualquer código.
2. Escreva um teste cujo nome de `describe`/`it` inclua esse id, depois
   implemente o comportamento que o requisito descreve.
3. Rode a suíte de testes completa (com o reporter do spec-trace
   configurado, veja `vitest.config`) para que `.spec-trace/results.json`
   reflita todos os arquivos de teste, não um subconjunto filtrado.
4. Rode `npx spec-trace report` — ele escreve `.spec-trace/report.md`, uma
   tabela legível por agente com o status de cada requisito e uma seção
   acionável por violação.
5. Leia `.spec-trace/report.md` e corrija tudo que ele apontar até que
   `npx spec-trace verify` reporte `0 errors, 0 warnings`.

## Definição de pronto

Uma tarefa só está pronta quando:

1. `npm test` (ou o equivalente do seu projeto) roda a suíte completa e
   produz `.spec-trace/results.json`.
2. `npx spec-trace report` escreve `.spec-trace/report.md`.
3. Você leu `.spec-trace/report.md` e corrigiu tudo até
   `npx spec-trace verify` ficar limpo.

Nunca marque uma tarefa como concluída com violações abertas. Nunca
silencie `weak-test` com `// spec-trace-disable-next-line weak-test` só
para fechar o gate — silencie apenas quando conseguir explicar por que o
teste é de fato forte apesar da heurística ter marcado.

## Adotando o spec-trace numa base de código existente

Se o `verify` reportar uma parede de violações pré-existentes, isso é
esperado — rode `npx spec-trace verify --baseline` uma vez para registrar
o estado atual. Depois disso, um `verify` normal só falha em violações
novas desde o baseline, então a dívida existente não bloqueia trabalho que
não está mexendo nela.
