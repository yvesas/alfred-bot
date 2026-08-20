## O que muda

<!-- Uma ou duas frases. O diff mostra o quê; aqui vale o porquê. -->

## Por quê

<!-- O problema que isto resolve. Se corrige algo do CONCERNS.md, cite o id (C6, C12...). -->

## Como testar

<!-- Passos concretos. "Rodei os testes" não é como testar. -->

## Checklist

- [ ] `./scripts/check.sh` passa (lint · typecheck · testes · build)
- [ ] Teste novo cobre o comportamento novo — na mesma mudança, não depois
- [ ] Documentação atualizada: `STATE.md` sempre; `ROADMAP.md` se mudou o plano;
      ADR em `docs/adr/` se a decisão é estrutural; linha em `docs/decisions.md`
      se é menor
- [ ] `CHANGELOG.md` atualizado, se o usuário percebe a mudança
- [ ] **Sem atribuição de IA** — nem no commit, nem neste PR
- [ ] Sem segredo em código, log, teste ou fixture

<!-- Referencie a issue: Closes #NN -->
