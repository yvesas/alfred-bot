import { randomUUID } from "node:crypto";
import { injectable } from "inversify";
import { JobLockModel } from "../models/JobLock";
import { logger } from "../infra/logger";

// Exclusão mútua entre instâncias para jobs periódicos (C3).
//
// A garantia vem de UMA operação atômica do Mongo — um `findOneAndUpdate` com upsert
// que só casa quando o lock está livre ou vencido. Duas instâncias que acordam no
// mesmo milissegundo disputam a mesma linha; o Mongo serializa, uma vence e a outra
// recebe o erro de chave duplicada. Não há janela entre "ler" e "escrever" porque não
// existe leitura separada.
//
// O lock **vence sozinho**: se a instância que o segurava morreu no meio do ciclo, a
// próxima o toma quando `lockedUntil` passa. É por isso que o TTL é a duração máxima
// tolerável de um ciclo, não a do intervalo entre ciclos.
@injectable()
export class JobLockService {
  /** Identifica esta instância nos logs. Não participa da exclusão mútua. */
  private readonly owner = randomUUID();

  // A exclusão mútua É o índice único em `job`: sem ele, dois upserts concorrentes
  // passam os dois e o lock não tranca. O Mongoose constrói índice de forma
  // assíncrona (e `autoIndex` costuma vir desligado em produção), então esperamos
  // uma vez, na primeira tentativa, em vez de torcer.
  private indexesReady?: Promise<unknown>;

  private ensureIndexes(): Promise<unknown> {
    this.indexesReady ??= JobLockModel.init();
    return this.indexesReady;
  }

  /**
   * Tenta segurar o lock do job por `ttlMs`. `true` se conseguiu — e só quem
   * conseguiu deve rodar o ciclo.
   */
  async acquire(job: string, ttlMs: number, now: Date = new Date()): Promise<boolean> {
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
      await this.ensureIndexes();
      await JobLockModel.findOneAndUpdate(
        // Só casa se ninguém segura, ou se o lock de quem segurava já venceu.
        { job, lockedUntil: { $lte: now } },
        { $set: { owner: this.owner, lockedUntil } },
        { upsert: true, new: true },
      ).exec();
      return true;
    } catch (err) {
      // E11000: outra instância inseriu a mesma linha primeiro, ou o lock ainda é
      // dela e o filtro não casou. Perder a disputa é o caminho normal, não erro.
      if (isDuplicateKey(err)) return false;
      logger.error({ err, job }, "Falha ao tentar obter o lock do job");
      return false;
    }
  }

  /**
   * Devolve o lock ao terminar, para a próxima instância não esperar o TTL inteiro.
   * Só libera se ainda for nosso — senão estaríamos liberando o ciclo de outra.
   */
  async release(job: string): Promise<void> {
    try {
      await JobLockModel.updateOne(
        { job, owner: this.owner },
        { $set: { lockedUntil: new Date(0) } },
      ).exec();
    } catch (err) {
      // Não liberar é seguro: o TTL resolve. Falhar aqui não pode derrubar o ciclo.
      logger.warn({ err, job }, "Falha ao liberar o lock do job");
    }
  }

  /**
   * Roda `run` apenas se conseguir o lock, e o devolve no fim — inclusive se `run`
   * lançar. Devolve `false` quando outra instância estava com o ciclo.
   */
  async runExclusively(job: string, ttlMs: number, run: () => Promise<void>): Promise<boolean> {
    if (!(await this.acquire(job, ttlMs))) {
      logger.debug({ job }, "Ciclo pulado: outra instância está com o lock");
      return false;
    }
    try {
      await run();
    } finally {
      await this.release(job);
    }
    return true;
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
