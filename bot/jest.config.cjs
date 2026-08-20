/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
  // O default do Jest é 5 s, pensado para teste puro. As suítes de repositório, do
  // JobLockService e do ConversationStateStore sobem um `mongod` efêmero no
  // `beforeAll` — cinco deles em paralelo num runner de 2 núcleos passam folgado dos
  // 5 s, e o CI quebrava enquanto a máquina local (disco rápido, cache quente) passava.
  testTimeout: 30_000,
  // Catraca, não meta: os valores são os de hoje, arredondados para baixo. Servem para
  // impedir queda silenciosa — foi assim que o BotCore chegou a 58 %. Ao subir a
  // cobertura de verdade, suba o limiar junto.
  coverageThreshold: {
    global: { statements: 78, branches: 63, functions: 77, lines: 78 },
  },
};
