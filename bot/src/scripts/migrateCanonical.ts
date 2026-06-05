import "reflect-metadata";
import mongoose from "mongoose";
import { config } from "../infra/config";
import { logger } from "../infra/logger";
import { PurchaseModel } from "../models/Purchase";
import { UserModel } from "../models/User";

// Migração para identidade canônica (Fase 6): Purchase.userId passa de externalId → User._id.
//
//   Dry-run (padrão, NÃO grava):  ts-node src/scripts/migrateCanonical.ts
//   Aplicar de verdade:           ts-node src/scripts/migrateCanonical.ts --apply
//
// Idempotente: compras cujo userId já é um ObjectId (24 hex) são puladas. Compras cujo userId
// (externalId) não casa com nenhum usuário são reportadas como "órfãs" e NÃO são alteradas.

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

async function run(apply: boolean): Promise<void> {
  await mongoose.connect(config.databaseUrl);
  logger.info({ apply }, apply ? "Aplicando migração canônica" : "Dry-run (nada será gravado)");

  const purchases = await PurchaseModel.find().select("_id userId").lean();
  let migrated = 0;
  let already = 0;
  let orphan = 0;

  for (const p of purchases) {
    const current = String(p.userId);

    if (OBJECT_ID_RE.test(current)) {
      already++;
      continue; // já está canônico
    }

    const user = await UserModel.findOne({
      $or: [{ identities: { $elemMatch: { externalId: current } } }, { telegramId: current }],
    })
      .select("_id")
      .lean();

    if (!user) {
      orphan++;
      logger.warn({ purchase: String(p._id), userId: current }, "Compra órfã (sem usuário)");
      continue;
    }

    if (apply) {
      await PurchaseModel.updateOne({ _id: p._id }, { $set: { userId: String(user._id) } });
    }
    migrated++;
  }

  logger.info(
    { total: purchases.length, migrated, already, orphan, apply },
    apply ? "Migração concluída" : "Dry-run concluído (use --apply para gravar)",
  );

  await mongoose.disconnect();
}

const apply = process.argv.includes("--apply");
run(apply).catch((err) => {
  logger.error({ err }, "Falha na migração canônica");
  process.exit(1);
});
