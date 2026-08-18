/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
  // Catraca, não meta: os valores são os de hoje, arredondados para baixo. Servem para
  // impedir queda silenciosa — foi assim que o BotCore chegou a 58 %. Ao subir a
  // cobertura de verdade, suba o limiar junto.
  coverageThreshold: {
    global: { statements: 76, branches: 61, functions: 76, lines: 77 },
  },
};
