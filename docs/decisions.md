# Decisões menores

Uma linha por decisão. As estruturais viram ADR em [`adr/`](adr/).
As desta tabela foram **reconstruídas a partir do código** em 2026-08-14 (os
planos originais não foram commitados), por isso as datas são aproximadas.

| Data | Decisão | Por quê | Onde |
|---|---|---|---|
| 2026-02 | Monorepo com três projetos independentes, sem workspace pnpm | cada um tem ciclo, imagem e CI próprios; o `ocr-service` nem é Node | raiz |
| 2026-02 | Inversify como container de DI | clients de IA/OCR são caros e não podem ser recriados por mensagem | `infra/Container.ts` |
| 2026-02 | pino no lugar de `console.*` | log estruturado em prod, legível em dev; `no-console` virou lint | `infra/logger.ts` |
| 2026-02 | `process.env` lido num arquivo só, validado no startup | falhar cedo e claro em vez de `undefined` no meio do fluxo | `infra/config.ts` |
| 2026-03 | Erro de conexão do Mongo **não** é capturado | processo com banco morto deve morrer, não fingir que subiu (B2) | `infra/Database.ts` |
| 2026-03 | Somatório de gasto por `$facet` no Mongo | somar em memória não escala com o histórico | `PurchaseRepository` |
| 2026-03 | Preferência de modelo persistida em `User.aiModel` | antes era memória e sumia a cada deploy (B5) | `models/User.ts` |
| 2026-04 | Relatórios agregam por `createdAt`, não pela `date` do cupom | cupom antigo lançado hoje contava no mês errado (B4); a `date` segue como metadado | `PurchaseRepository` |
| 2026-04 | Rate limit por janela deslizante em memória | suficiente para uma instância; Redis fica para quando escalar | `RateLimiter` |
| 2026-05 | Catálogo i18n como `Record<Language, Record<Key,…>>` | o TypeScript passa a exigir pt/en/es de cada chave; tradução faltando vira erro de compilação | `i18n/index.ts` |
| 2026-05 | Chave da NFC-e só é aceita com DV mód-11 válido | OCR erra dígito; chave inválida contaminaria a dedup | `utils/fiscalKey.ts` |
| 2026-05 | Dedup de cupom por índice único **parcial** `{userId, fiscalKey}` | garantia no banco, não no código; compras sem cupom não colidem | `models/Purchase.ts` |
| 2026-05 | Confirmação de compra atrás de flag (`CONFIRM_PURCHASE`) | UX ainda em teste; desligar não pode exigir deploy | `infra/config.ts` |
| 2026-06 | Login por e-mail + OTP em telas próprias (Magic Auth), não AuthKit hospedado | não exige redirect URI e mantém o usuário dentro do app; o fluxo hospedado ficou como legado | `AuthServer` |
| 2026-06 | JWT próprio de 30 dias em vez de consultar o WorkOS a cada request | menos latência e menos cota; o preço é não ter revogação (C8) | `AuthService` |
| 2026-06 | Token de vínculo com 12 chars, TTL 10 min, em memória | precisa caber no payload de `t.me?start=` (limite de 64) | `LinkTokenService` |
| 2026-06 | Lembretes continuam chaveados por `(platform, externalId)` | o push precisa saber para onde enviar; migrar exigiria resolver a plataforma no envio | `models/Reminder.ts` |
| 2026-06 | Lembrete é reprogramado mesmo se não entregue | usuário web offline não deve travar a série mensal; a falha vira warn | `ReminderScheduler` |
| 2026-06 | Retenção LGPD desligada por padrão (`RETENTION_ENABLED=false`) | o job **apaga contas**; ligar é decisão consciente | `infra/config.ts` |
| 2026-06 | Purga de retenção só alcança sessão web anônima que nunca logou | usuário real jamais entra no critério | `UserRepository.findAnonymousInactive` |
| 2026-06 | CSV exportado com BOM UTF-8 | sem BOM o Excel corrompe acento | `AuthServer.apiExportCsv` |
| 2026-06 | PDF gerado no cliente (jsPDF), CSV no servidor | PDF é apresentação e não vale carregar no bot | `web/src/lib/pdf.ts` |
| 2026-06 | Husky mora em `bot/` mas cobre os dois projetos | um `core.hooksPath` só; o hook decide pelo que está staged | `bot/.husky/` |
| 2026-06 | CI path-filtered, um workflow por projeto | mexer no front não roda a suíte do bot | `.github/workflows/` |
| 2026-06 | Cache do binário do `mongodb-memory-server` no CI | o download dominava o tempo de execução | `.github/workflows/bot.yml` |
| 2026-08-14 | `specs/` guarda o plano, `docs/` guarda o sistema como é (D-DOC-001) | o `ROADMAP.md` na raiz misturava os dois e envelheceu junto | regra do workspace |
| 2026-08-14 | Os `PLANO-*.md` perdidos não serão reconstruídos (D-DOC-002) | o que virou estrutura virou ADR; o resto era plano já consumido | `specs/project/ROADMAP.md` |
| 2026-08-20 | Roadmap reordenado por **dependência**, não por valor percebido | Proatividade sobre um módulo só é o `ReminderScheduler` que já existe; second brain sobre um módulo só não tem o que cruzar. Mesma lição que o Niklas registrou ao reordenar o dele |
