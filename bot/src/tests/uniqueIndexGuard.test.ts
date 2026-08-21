import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Uma guarda contra a armadilha que já mordeu três vezes.
//
// Quando a garantia de um código **é** um índice único — exclusão mútua no
// `JobLockService`, sobrescrita no `ConversationStateStore`, deduplicação no
// `ProactiveLogRepository` — o código precisa esperar o índice existir antes da
// primeira escrita. O Mongoose constrói índice de forma assíncrona, e `autoIndex`
// costuma vir **desligado em produção**.
//
// Sem isso, duas escritas concorrentes passam as duas: o lock não tranca, o estado
// duplica, o aviso repete. E o sintoma é um teste que falha uma vez a cada três — foi
// assim nas três vezes.
//
// Este teste lê o fonte de propósito. É grosseiro, mas pega o padrão em vez do caso, e
// falha na hora em que alguém escreve o quarto.
describe("quem depende de índice único espera ele existir", () => {
  const src = (relative: string) => readFileSync(join(__dirname, "..", relative), "utf8");

  const guarded: Array<[string, string]> = [
    ["services/JobLockService.ts", "JobLockModel"],
    ["core/ConversationStateStore.ts", "ConversationStateModel"],
    ["repositories/ProactiveLogRepository.ts", "ProactiveLogModel"],
  ];

  it.each(guarded)("%s espera o índice antes de escrever", (file, model) => {
    const code = src(file);

    expect(code).toContain(`${model}.init()`);
    expect(code).toContain("ensureIndexes");
  });

  // Se um destes deixar de declarar índice único, o teste acima vira decoração —
  // este garante que a premissa continua válida.
  it.each([
    ["models/JobLock.ts", "unique: true"],
    ["models/ConversationState.ts", "{ unique: true }"],
    ["models/ProactiveLog.ts", "{ unique: true }"],
  ])("%s ainda declara o índice único que justifica a espera", (file, marker) => {
    expect(src(file)).toContain(marker);
  });
});
