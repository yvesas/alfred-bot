# Retomada — de onde paramos

**Última sessão:** 2026-08-14 a 2026-08-20
**Onde está:** fundação e endurecimento **mergeados na `main`** · produto ainda não foi ao ar
**Repositório:** [`yvesas/alfred-bot`](https://github.com/yvesas/alfred-bot) — privado

Ponto de entrada de quem volta. Estado detalhado em [`STATE.md`](STATE.md); o plano
em [`ROADMAP.md`](ROADMAP.md); a visão em [`PROJECT.md`](PROJECT.md).

> ⚠️ **O Alfred nunca rodou em produção.** Não há host, não há CD, e o conserto da
> camada de IA (`C0`) **nunca foi confirmado contra o Vertex de verdade**. Antes de
> assumir que o bot funciona, rode o `gcloud` da Fase 0.

---

## 1. Religar o ambiente

```bash
cd ~/Workspace/yaslabs/alfred/alfred-bot
cd bot && pnpm install && cd ../web && pnpm install && cd ..

./scripts/check.sh          # lint · typecheck · testes · build, nos dois projetos
```

O gate é esse comando. Se ele não passa, o trabalho não está pronto — vale para
pessoa e para agente.

⚠️ **Não suba o Docker sem precisar.** O `docker-compose.yml` monta a credencial real
do GCP e sobe Mongo, bot e front. Confira portas ocupadas antes:
`docker ps --format '{{.Names}}\t{{.Ports}}'`.

⚠️ **O arquivo de ambiente local é gitignorado.** Se sumir, copie o
`bot/.env.sample`, que versiona só os nomes. Os segredos que ele documenta são seus.

### Rodar de verdade

```bash
cd bot && pnpm dev        # nodemon + ts-node
cd web && pnpm dev        # Vite em :5173
```

---

## 2. O que está aberto agora

**Nada esperando revisão.** Os três PRs de fundação foram mergeados em 2026-08-20:
[#8](https://github.com/yvesas/alfred-bot/pull/8) (fundação, produto, governança e as
quatro fases de endurecimento), [#9](https://github.com/yvesas/alfred-bot/pull/9)
(bloco A da Fase 5 técnica) e [#10](https://github.com/yvesas/alfred-bot/pull/10)
(roadmap por fases, ADR-0007, este arquivo).

A `main` está com **327 testes**, cobertura 79,1 %, e `./scripts/check.sh` verde.

**A próxima coisa a fazer é a [Fase 0](ROADMAP.md#fase-0--colocar-no-ar-)** — e ela
está parada em você:

1. `gcloud ai models list --region=us-central1 | grep flash-lite` — confirma o `C0`
2. **Rotacionar a chave do GCP** (`C1`) — aberta desde o começo do projeto
3. Escolher o host (`BL-3`)

Só depois disso o trabalho volta a ser de código: CD por tag, primeiro deploy, e
rodar o `migrateCanonical` confirmando que não sobrou usuário sem `identities[]`.

---

## 3. Armadilhas que já morderam

Cada uma custou tempo de verdade. Estão aqui para não custarem de novo.

**"Passa na minha máquina" escondeu o CI vermelho por dois meses e meio.** O
`GeminiProcessor` estourava sem `GCP_PROJECT_ID`, que existe no ambiente do dev e não
no runner. Não havia PR, então ninguém olhava o CI. Ver `C23`.

**O bot ficou quebrado dois meses sem ninguém saber.** O modelo de IA estava
hardcoded e o fornecedor o desligou. Hoje id de modelo é configuração, e um teste
guarda a lista de aposentados. Ver `C0`.

**Índice do Mongo é assíncrono, e `autoIndex` costuma vir desligado em produção.** Um
lock cuja exclusão mútua depende de índice único **não tranca** enquanto ele não
existe. Descoberto por um teste que falhava uma vez a cada três. Ver `C3`.

**Log sujo esconde falha real.** O ruído de import dinâmico no teste do QR quase fez
a instabilidade acima passar batida. Ver `C19`.

**PR empilhado não se reaponta sozinho se a base não for apagada.** Ao mergear o #8,
o #9 continuou apontando para a branch base — que ainda existia — e acabou mergeando
nela em vez de na `main`. O conteúdo chegou pelo #10, mas o caminho foi torto. Com
`deleteBranchOnMerge=false` no repositório, **reaponte o PR de cima para a `main`
antes de mergear o de baixo**.

**Baileys é ESM puro e o Jest aqui é CommonJS.** Arquivo que importa o SDK não carrega
em teste — por isso a tradução mora em `platforms/<canal>/translate.ts`.

---

## 4. Onde ler o quê

| Pergunta | Arquivo |
|---|---|
| O que fazer agora? | [`ROADMAP.md`](ROADMAP.md) — fases por dependência |
| Qual o estado exato? | [`STATE.md`](STATE.md) |
| O que é arriscado mexer? | [`../codebase/CONCERNS.md`](../codebase/CONCERNS.md) |
| Trabalho técnico restante | [`PLANO-TECNICO.md`](PLANO-TECNICO.md) — blocos sob demanda |
| Por que foi decidido assim? | [`../../docs/adr/`](../../docs/adr/) — 7 ADRs |
| Como o sistema é hoje? | [`../../docs/architecture.md`](../../docs/architecture.md) |
| Como contribuir | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) |

**Abra o Claude Code dentro deste repositório**, não na pasta `yaslabs/` — é aqui que
estão o `CLAUDE.md`, as regras e as guardas.
