# Convenções de código

**Analisado:** 2026-08-14 — extraído do código existente, não do ideal.
Onde há divergência entre projetos, está anotado.

## Idioma

- **Código em inglês:** nomes de classe, método, variável, tipo, campo de schema.
- **Comentário e log em português.** Sem exceção observada.
- **String de usuário sempre pelo catálogo i18n** (`t(lang, "chave", params)`) —
  nunca literal no `BotCore`. Duas exceções vivas: a validação de compra devolve
  `reason` em pt-BR cru (`purchaseConverter.ts`) e o `TelegramAdapter` tem um
  `"Por favor, compartilhe o seu próprio contato. 🙂"` hardcoded.
- **Mensagem de commit em inglês**, imperativo (regra do workspace).

## Nomenclatura

**Arquivos**

| Tipo | Padrão | Exemplos |
|---|---|---|
| Classe (bot) | `PascalCase.ts`, 1 classe por arquivo, nome = classe | `BotCore.ts`, `PurchaseRepository.ts` |
| Interface pura | `PascalCase.ts` com prefixo `I` | `IOcrProvider.ts`, `IMessagingAdapter.ts` |
| Módulo de funções | `camelCase.ts` | `fiscalKey.ts`, `purchaseConverter.ts`, `commands.ts` |
| Teste (bot) | `<Alvo>.test.ts` em `src/tests/` (espelhando subpastas) | `MergeService.test.ts` |
| Componente React | `PascalCase.tsx` | `LoginModal.tsx`, `MessageBubble.tsx` |
| Hook / lib (web) | `camelCase.ts(x)` | `useChatSocket.ts`, `api.ts`, `i18n.tsx` |
| Teste (web) | `<Alvo>.test.ts(x)` **ao lado** do arquivo | `lib/auth.test.ts` |

**Símbolos**

- Classes/interfaces/tipos: `PascalCase`. Interfaces de modelo levam `I`
  (`IUser`, `IPurchase`, `IBudget`); tipos de união não levam (`Platform`,
  `Language`, `Plan`, `MessageKey`).
- Funções e variáveis: `camelCase`. Métodos privados são realmente `private`.
- Constantes de módulo: `SCREAMING_SNAKE_CASE` — `KNOWN_COMMANDS`, `TTL_MS`,
  `WARN_RATIO`, `MAX_PAYLOAD_BYTES`, `EMAIL_REGEX`, `AFFIRMATIVE`/`NEGATIVE`.
- Tokens de DI: `Symbol.for("...")` em `SCREAMING_SNAKE_CASE` — `OCR_PROVIDER_TOKEN`.
- Booleano lê como pergunta: `isValidAccessKey`, `canRegister`, `canVerifyEmail`,
  `hasWebIdentity`, `isAuthEnabled`.

## Organização dentro do arquivo

**Ordem de import** (consistente em todo o bot):

```ts
import "reflect-metadata";                      // 1. side-effect (onde há decorator)
import { inject, injectable } from "inversify"; // 2. externos
import { BotCore } from "../core/BotCore";      // 3. internos, do mais "alto" ao mais "baixo":
import { UserService } from "./UserService";    //    core → services → repositories → models
import { config } from "../infra/config";       // 4. infra (config, logger, metrics) por último
```

**Ordem dentro da classe:** campos privados → construtor (com `@inject`) → método
público de entrada → privados, agrupados por assunto e separados por um comentário
de seção:

```ts
// ---------- Confirmação de compra (A1) ----------
```

Funções auxiliares puras ficam **fora da classe**, no fim do arquivo, e são
exportadas quando o teste precisa (`unionIdentities`, `mergeCategories`,
`mergeBudgets`, `encodeState`/`decodeState`, `telegramDeepLink`).

## Tipagem

- `strict: true` nos dois projetos; o web ainda liga `noUnusedLocals`,
  `noUnusedParameters` e `noFallthroughCasesInSwitch`.
- **Nada de validador de schema** (Zod/class-validator). A validação de entrada
  externa é manual: `typeof x === "string"` no `WebAdapter`/`authServer`, e
  `validateAndConvertModelResponse` para o JSON da IA.
- `any` é permitido **só com `eslint-disable` explícito no topo do arquivo**, e
  apenas onde o SDK não tipa: `GeminiProcessor`, `GeminiOcrProvider`, `WebAdapter`,
  `modelResponseConverter`. Fora disso, `Record<string, unknown>` + narrowing.
- Tipos derivados em vez de duplicados: `Omit<IUserBase, "_id">` → `IUserCreate`,
  `Partial<IPurchaseCreate>` nos patches.
- Assinatura pública sempre com retorno explícito (`Promise<void>`, `IUser | null`).

## Tratamento de erro

Três padrões, escolhidos pelo que o chamador pode fazer:

1. **Propagar e abortar** — falha de configuração ou de conexão inicial.
   `Database.connect()` não tem try/catch de propósito; `index.ts` faz `exit(1)`.
2. **Capturar, logar com contexto e degradar** — a maioria. Sempre
   `logger.error({ err }, "mensagem em português")` seguido de uma resposta
   amigável pelo i18n. Exemplos: `savePurchase`, `handlePhoto`, `QrService.decode`
   (devolve `null`), `OutboundRegistry.send` (devolve `false`).
3. **Retornar `null` como resultado esperado** — `AuthService.authenticateEmail`,
   `verifyJwt`, `LinkTokenService.consume`. `catch {}` vazio só aqui, quando "não
   autenticou" **é** a resposta, nunca para engolir erro.

Erros de domínio herdam de `BaseError` (`utils/errors.ts`): `ValidationError`,
`DatabaseError`, `NetworkError`. Na prática só `ValidationError` é usado.

## Comentários

Explicam **por quê**, não o quê — e a densidade é alta e deliberada:

- Toda classe e todo arquivo de contrato abre com um bloco de 2-4 linhas dizendo
  o papel dele e o que ele **não** faz ("Não contém regra de conversa").
- Decisão não-óbvia é justificada na linha: *"Não aguardamos `launch()`: em
  long-polling ele só resolve quando o bot é parado"*, *"Usa `||` (não `??`) para
  que variáveis vazias no .env caiam no default"*.
- Dívida conhecida é anotada no ponto exato: *"o estado é por instância — para
  escalar horizontalmente, migrar para Redis"*.
- Correções de bug carregam o identificador do ROADMAP (`B4`, `B7`) e features
  carregam a fase (`Fase 6`, `A1`, `A3`) — rastreabilidade informal para o plano.
- Sem JSDoc/TSDoc em nenhum lugar. Sem comentário que repete o código.

## Configuração

- **Todo `process.env` fica em `infra/config.ts`** e em lugar nenhum mais.
- Obrigatória → `assertRequiredConfig()` no startup, falhando com a lista do que
  falta. Opcional por provider → validada no uso.
- Flag booleana usa string com default explícito:
  `(process.env.X ?? "true").toLowerCase() !== "false"`.
- No front, variável de build é `VITE_*` lida via `import.meta.env` com fallback
  literal (`?? "http://localhost:3001"`).

## Formatação

Prettier + ESLint flat config (`eslint.config.mjs` por projeto); `prettier/prettier`
é **erro**. `no-console` é `warn` no bot (zero ocorrências — tudo passa pelo `logger`).
`@typescript-eslint/no-unused-vars` é `warn` com `argsIgnorePattern: "^_"`.
