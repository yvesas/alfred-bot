import pino from "pino";
import { config } from "./config";

// Logger estruturado da aplicação. Em produção emite JSON (level "info");
// em desenvolvimento usa pino-pretty (legível e colorido).
export const logger = pino({
  level: config.logLevel,
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }),
});
