import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import * as ts from "typescript";
const root = process.cwd();
const contentCache = new Map<string, string>();
const syntaxCache = new Map<string, ts.SourceFile>();
const inventoryCache = new Map<string, string[]>();
type Dependency = { target: string; names: string[] };
const dependencyCache = new Map<string, Dependency[]>();
function fileContent(file: string): string {
  let content = contentCache.get(file);
  if (content === undefined) {
    content = readFileSync(path.join(root, file), "utf8");
    contentCache.set(file, content);
  }
  return content;
}
function sourceOf(file: string): ts.SourceFile {
  let source = syntaxCache.get(file);
  if (!source) {
    source = ts.createSourceFile(
      file,
      fileContent(file),
      ts.ScriptTarget.Latest,
      true,
    );
    syntaxCache.set(file, source);
  }
  return source;
}
describe("prelaunch source hygiene", () => {
  it("keeps production modules reachable from framework, worker, or operator entrypoints", () => {
    const production = [
      "app",
      "components",
      "features",
      "hooks",
      "lib",
      "server",
    ].flatMap(files);
    const entrypoints = production.filter((file) =>
      /^app\/(?:.*\/)?(page|layout|route|loading|error|global-error|not-found|default|template|sitemap|robots)\.tsx?$/.test(
        file,
      ),
    );
    entrypoints.push(
      "server/game-smart-contract/index.ts",
      "server/game-smart-contract/features/events/treasury/reconcile.ts",
    );
    const reached = new Set<string>();
    const visit = (file: string) => {
      if (reached.has(file)) return;
      reached.add(file);
      for (const dependency of dependencies(file, true)) {
        const target = resolve(file, dependency.target);
        if (target) visit(target);
      }
    };
    entrypoints.forEach(visit);
    expect(production.filter((file) => !reached.has(file))).toEqual([]);
  });

  it("does not export imported primitives or forwarding aliases", () => {
    const violations: string[] = [];
    for (const file of [
      "app",
      "components",
      "features",
      "hooks",
      "lib",
      "server",
    ].flatMap(files)) {
      const source = sourceOf(file);
      const imported = new Set<string>();
      const aliases = new Set<string>();
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !node.importClause) continue;
        const clause = node.importClause;
        if (clause.isTypeOnly) continue;
        if (clause.name) imported.add(clause.name.text);
        const binding = clause.namedBindings;
        if (binding && ts.isNamespaceImport(binding))
          imported.add(binding.name.text);
        if (binding && ts.isNamedImports(binding))
          binding.elements
            .filter((item) => !item.isTypeOnly)
            .forEach((item) => imported.add(item.name.text));
      }
      const forwarded = (value: ts.Expression): boolean =>
        ts.isIdentifier(value)
          ? imported.has(value.text) || aliases.has(value.text)
          : ts.isPropertyAccessExpression(value) && forwarded(value.expression);
      for (const node of source.statements) {
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (
              ts.isIdentifier(declaration.name) &&
              declaration.initializer &&
              forwarded(declaration.initializer)
            ) {
              aliases.add(declaration.name.text);
              if (
                node.modifiers?.some(
                  (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
                )
              )
                violations.push(file + ": " + declaration.name.text);
            }
          }
        }
        if (ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier) violations.push(file + ": re-export");
          else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const item of node.exportClause.elements) {
              const name = item.propertyName?.text ?? item.name.text;
              if (imported.has(name) || aliases.has(name))
                violations.push(file + ": " + name);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
const frontendEvents = [
  "authenticate-wallet",
  "broadcast-game-action",
  "check-worker-readiness",
  "confirm-transaction",
  "deposit-hash",
  "execute-game-action",
  "personal-history",
  "purchase-hive-shop",
  "purchase-market-item",
  "registration-payment",
  "reset-wallet-state",
];
const backendEvents = [
  "wallet-auth",
  "player-lifecycle",
  "equipment",
  "social-actions",
  "claim-vault",
  "equip-cosmetic",
  "market-listing",
  "purchase-item",
  "raid",
  "request-withdrawal",
  "stake-vault",
  "tick-player",
  "upgrade-stat",
  "shop-pricing",
];
const contractEvents = [
  "process-game-action",
  "payment-processing",
  "treasury",
  "worker-lifecycle",
];
const contractRoot = "server/game-smart-contract/";
const contractEventRoot = contractRoot + "features/events/";
const startupModels = [
  "equipments",
  "players",
  "items",
  "logs",
  "game-stats",
  "transactions-pending",
  "transactions-processed",
].map((collection) => `@/lib/modules/${collection}/server.model`);
// GET routes may read only these repository operations; application writes stay in events.
const readRoutes: Record<string, Record<string, string[]>> = {
  "app/api/game/leaderboard/route.ts": {
    equipments: ["findEquipmentsByIds"],
    players: ["readLeaderboardPlayerBatches"],
  },
  "app/api/game/stats/route.ts": {
    equipments: ["findEquipmentsByIds"],
    players: ["readRegisteredMiningBatches"],
    logs: ["readAnalyticsLogBatches"],
    "transactions-processed": ["readAnalyticsReceipts"],
  },
  "app/api/items/route.ts": {
    equipments: ["findEquipmentsByOwner"],
    items: ["findInventoryItemsByWallet"],
  },
  "app/api/market/route.ts": { equipments: ["findListedEquipments"] },
  "app/api/player/me/route.ts": {
    equipments: ["findEquipmentsByIds"], players: ["findPlayerByWallet"] },
  "app/api/player/referrals/route.ts": {
    players: ["findPlayerByWallet", "playerRepository"],
    logs: ["getReferralHiveEarned"],
  },
  "app/api/game/raid/targets/route.ts": {
    equipments: ["findEquipmentsByIds"],
    players: ["findPlayerByWallet", "findRaidTargets"],
  },
  "app/api/logs/route.ts": { logs: ["logRepository"] },
  "app/api/logs/market/route.ts": { logs: ["logRepository"] },
  "app/api/logs/market/sales/route.ts": { logs: ["logRepository"] },
  "app/api/transactions/route.ts": {
    "transactions-pending": ["findPendingByWallet"],
    "transactions-processed": ["listProcessedHistory", "readAnalyticsReceipts"],
  },
  "app/api/health/route.ts": { "game-stats": ["getContractReadiness"] },
  "app/api/shop/prices/route.ts": {
    equipments: ["findEquipmentsByIds"],
    items: ["findInventoryItemsByWallet"],
    players: ["findPlayerByWallet"],
    "game-stats": ["gameStatsRepository"],
  },
};
const balanceRoutes = new Set([
  "app/api/wallet/balance/route.ts",
  "app/api/wallet/treasury-balance/route.ts",
]);
function sourceFiles(directory: string): string[] {
  directory = directory.replace(/\/+$/, "");
  const cached = inventoryCache.get(directory);
  if (cached) return cached;
  const inventory = readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const name = directory + "/" + entry.name;
    return entry.isDirectory()
      ? sourceFiles(name)
      : /\.[cm]?[jt]sx?$/.test(name)
        ? [name]
        : [];
  });
  inventoryCache.set(directory, inventory);
  return inventory;
}
function files(directory: string): string[] {
  return sourceFiles(directory).filter(
    (file) => /\.tsx?$/.test(file) && !/\.test\.|\/test\.ts$/.test(file),
  );
}
function dependencies(file: string, includeTypes = false): Dependency[] {
  const key = file + (includeTypes ? ":types" : ":runtime");
  const cached = dependencyCache.get(key);
  if (cached) return cached;
  const source = sourceOf(file);
  const imports: Dependency[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly && !includeTypes) continue;
      const named = clause?.namedBindings;
      const names =
        named && ts.isNamedImports(named)
          ? named.elements
              .filter((e) => includeTypes || !e.isTypeOnly)
              .map((e) => e.propertyName?.text ?? e.name.text)
          : [];
      if (named && ts.isNamedImports(named) && !names.length && !clause?.name)
        continue;
      imports.push({
        target: (node.moduleSpecifier as ts.StringLiteral).text,
        names,
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      (includeTypes || !node.isTypeOnly)
    ) {
      if (
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.every((e) => e.isTypeOnly) &&
        !includeTypes
      )
        continue;
      imports.push({
        target: (node.moduleSpecifier as ts.StringLiteral).text,
        names: [],
      });
    }
  }
  const inspectCalls = (node: ts.Node) => {
    if (
      includeTypes &&
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      imports.push({ target: node.argument.literal.text, names: [] });
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ target: node.arguments[0].text, names: [] });
    }
    ts.forEachChild(node, inspectCalls);
  };
  ts.forEachChild(source, inspectCalls);
  dependencyCache.set(key, imports);
  return imports;
}
function resolve(from: string, target: string): string | null {
  const candidate = target.startsWith("@/")
    ? target.slice(2)
    : target.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(from), target))
      : null;
  if (!candidate) return null;
  return (
    [
      candidate,
      candidate + ".ts",
      candidate + ".tsx",
      candidate + "/index.ts",
    ].find(
      (name) => existsSync(path.join(root, name)) && /\.tsx?$/.test(name),
    ) ?? null
  );
}
describe("application workflow boundaries", () => {
  it("contains exactly the assigned frontend and backend use cases", () => {
    expect(readdirSync(path.join(root, "features/events")).sort()).toEqual([
      "backend",
      "frontend",
    ]);
    for (const [owner, expected] of [
      ["frontend", frontendEvents],
      ["backend", backendEvents],
    ] as const) {
      const directory = path.join(root, "features/events", owner);
      expect(readdirSync(directory).sort()).toEqual([...expected].sort());
      expect(
        readdirSync(directory, { withFileTypes: true }).every((entry) =>
          entry.isDirectory(),
        ),
      ).toBe(true);
    }
    expect(readdirSync(path.join(root, contractEventRoot)).sort()).toEqual(
      [...contractEvents].sort(),
    );
    expect(
      readdirSync(path.join(root, contractRoot + "features/types")).sort(),
    ).toEqual(["processing.ts", "settlement.ts", "stream.ts"]);
    expect(files("lib/utils")).toHaveLength(20);
  });
  it("keeps event ownership explicit, including erased contract imports", () => {
    const violations: string[] = [];
    for (const file of [
      "app",
      "components",
      "hooks",
      "features",
      "lib",
      "server",
    ].flatMap(files)) {
      for (const dependency of dependencies(file, true)) {
        const resolved = resolve(file, dependency.target);
        const normalized =
          resolved ??
          (dependency.target.startsWith("@/")
            ? dependency.target.slice(2)
            : dependency.target);
        if (/^features\/events\/(?!frontend\/|backend\/)/.test(normalized))
          violations.push(`${file} -> obsolete ${dependency.target}`);
        const backendOwner = normalized.match(
          /^features\/events\/backend\/([^/]+)/,
        )?.[1];
        if (backendOwner && !backendEvents.includes(backendOwner))
          violations.push(
            `${file} -> retired backend owner ${dependency.target}`,
          );
        if (
          /^(app\/|components\/|hooks\/|features\/|lib\/)/.test(file) &&
          normalized.startsWith(contractRoot)
        )
          violations.push(`${file} -> worker internals ${dependency.target}`);
        const contractOwner = normalized.match(
          /^server\/game-smart-contract\/features\/events\/([^/]+)/,
        )?.[1];
        if (contractOwner && !contractEvents.includes(contractOwner))
          violations.push(
            `${file} -> unknown contract owner ${dependency.target}`,
          );
        if (
          file.startsWith("features/events/frontend/") &&
          normalized.startsWith("features/events/backend/")
        )
          violations.push(`${file} -> backend contract ${dependency.target}`);
        if (
          file.startsWith("features/events/backend/") &&
          normalized.startsWith("features/events/frontend/")
        )
          violations.push(`${file} -> frontend contract ${dependency.target}`);
        if (
          /^(components\/|hooks\/|features\/stores\/)/.test(file) &&
          normalized.startsWith("features/events/backend/")
        )
          violations.push(`${file} -> backend ${dependency.target}`);
        if (
          (file.startsWith("server/") || /^app\/.*\/route\.ts$/.test(file)) &&
          normalized.startsWith("features/events/frontend/")
        )
          violations.push(`${file} -> frontend ${dependency.target}`);
      }
    }
    expect(violations).toEqual([]);
  });
  it("keeps backend dependency graphs free of frontend state and browser coordination", () => {
    const pending = [
      ...files("features/events/backend"),
      ...files(contractEventRoot),
    ];
    const seen = new Set<string>();
    const violations: string[] = [];
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const dependency of dependencies(file)) {
        const resolved = resolve(file, dependency.target);
        if (
          /^(react(?:\/|$)|react-dom(?:\/|$)|next\/navigation$)/.test(
            dependency.target,
          ) ||
          (resolved &&
            /^(features\/events\/frontend\/|features\/stores\/|components\/|hooks\/|lib\/api\/client\.ts$|lib\/chains\/modules\/hive\/wallet\/|lib\/chains\/providers\/hive\/(connect|sign)\.ts$)/.test(
              resolved,
            ))
        )
          violations.push(`${file} -> ${dependency.target}`);
        else if (resolved) pending.push(resolved);
      }
    }
    expect(violations).toEqual([]);
  });
  it("keeps smart-contract scheduling and startup infrastructure narrowly scoped", () => {
    const violations: string[] = [];
    for (const file of files(contractRoot)) {
      const event = file.startsWith(contractEventRoot);
      for (const dependency of dependencies(file)) {
        const startup =
          /server\.model|^(mongoose|mongodb)$|^@\/lib\/config\/database$/.test(
            dependency.target,
          );
        if (
          startup &&
          !(
            file === contractRoot + "utils/database.server.ts" &&
            (startupModels.includes(dependency.target) ||
              ["mongoose", "@/lib/config/database"].includes(dependency.target))
          )
        )
          violations.push(
            `${file} -> startup infrastructure ${dependency.target}`,
          );
        if (!event && /server\.repository/.test(dependency.target))
          violations.push(
            `${file} -> persistence outside contract events ${dependency.target}`,
          );
        if (
          !event &&
          dependency.target.startsWith("@/features/events/backend/")
        )
          violations.push(
            `${file} -> gameplay outside contract events ${dependency.target}`,
          );
      }
    }
    expect(violations).toEqual([]);
    expect(
      existsSync(
        path.join(
          root,
          contractEventRoot,
          "process-game-action/action.test.ts",
        ),
      ),
    ).toBe(true);
  });
  it("keeps backend implementations behind repositories", () => {
    const violations: string[] = [];
    for (const file of [
      ...files("features/events/backend"),
      ...files(contractEventRoot),
    ]) {
      for (const dependency of dependencies(file))
        if (/server\.model|^(mongoose|mongodb)$/.test(dependency.target))
          violations.push(`${file} -> raw persistence ${dependency.target}`);
    }
    expect(violations).toEqual([]);
  });
  it("permits explicit GET reads while keeping persistence writes and privileged Hive operations behind events", () => {
    const entries = [
      ...files("app"),
      ...files("server").filter((file) => !file.startsWith(contractEventRoot)),
      ...files("components"),
      ...files("hooks"),
      ...files("features/stores"),
    ];
    const violations: string[] = [];
    for (const file of entries)
      for (const dependency of dependencies(file)) {
        if (
          /lib\/database|server\.repository|server\.model/.test(
            dependency.target,
          ) &&
          !Object.keys(readRoutes[file] ?? {}).some(
            (collection) =>
              dependency.target ===
                `@/lib/modules/${collection}/server.repository` &&
              dependency.names.length > 0 &&
              dependency.names.every((name) =>
                readRoutes[file][collection].includes(name),
              ),
          ) &&
          !(
            file === "server/game-smart-contract/utils/database.server.ts" &&
            startupModels.includes(dependency.target)
          )
        )
          violations.push(file + " → " + dependency.target);
        if (
          /lib\/chains.*\/server|lib\/chains$|lib\/chains\/providers\//.test(
            dependency.target,
          ) &&
          !(
            balanceRoutes.has(file) &&
            dependency.target ===
              "@/lib/chains/modules/hive/server/events/get-balance/action" &&
            dependency.names.length === 1 &&
            dependency.names[0] === "getBalance"
          )
        )
          violations.push(file + " → " + dependency.target);
        if (
          /lib\/chains.*\/wallet/.test(dependency.target) &&
          dependency.names.some((name) =>
            /^(transfer|connectHive|broadcast)/.test(name),
          )
        )
          violations.push(file + " → " + dependency.target);
      }
    expect(violations).toEqual([]);
  });
  it("allows only read methods on repository objects in GET routes", () => {
    const methods: Record<string, string[]> = {
      playerRepository: ["listReferred"],
      logRepository: ["listHistory", "listMarketHistory", "listMarketSales"],
      gameStatsRepository: ["get"],
    };
    const violations: string[] = [];
    for (const file of Object.keys(readRoutes)) {
      const source = sourceOf(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isIdentifier(node) &&
          methods[node.text] &&
          !ts.isImportSpecifier(node.parent)
        ) {
          const parent = node.parent;
          if (!(
            ts.isPropertyAccessExpression(parent) &&
            parent.expression === node &&
            methods[node.text].includes(parent.name.text)
          ))
            violations.push(`${file}: unsupported use of ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(source, visit);
    }
    for (const file of files("app/api"))
      for (const dependency of dependencies(file))
        if (
          /^(mongoose|mongodb)$/.test(dependency.target) ||
          /server\.model/.test(dependency.target)
        )
          violations.push(file + " -> " + dependency.target);
    expect(violations).toEqual([]);
  });
  it("keeps DTO mappings pure and removes read-event imports", () => {
    const retired =
      /features\/events\/(?:(?:frontend|backend)\/)?get-(health|inventory|market-history|marketplace|personal-history|raid-targets|referrals|wallet-balance|player-profile|shop-prices)(\/|$)/;
    for (const file of ["app", "features", "hooks", "lib", "server"].flatMap(
      files,
    )) {
      for (const dependency of dependencies(file))
        expect(dependency.target, file).not.toMatch(retired);
    }
    for (const file of files("lib/api/dto"))
      for (const dependency of dependencies(file))
        expect(dependency.target, file).not.toMatch(
          /server\.repository|server\.model|features\/events|lib\/config\/(config|database)|lib\/utils\/database|lib\/api\/client|^mongoose$|^mongodb$/,
        );
  });
  it("prevents browser dependency graphs from reaching server infrastructure", () => {
    const pending = [
      ...files("components"),
      ...files("hooks"),
      ...files("features/stores"),
      ...files("features/events/frontend"),
      ...files("lib/utils").filter(
        (file) => !file.includes("/database/") && !file.endsWith(".server.ts"),
      ),
      "features/types/game/stats.ts",
      "features/types/game/templates.ts",
      "lib/utils/game/hive-activity.ts",
      "lib/utils/hive/operation.ts",
      "lib/utils/game/payment-protocol.ts",
      "lib/utils/game/action-validation.ts",
      "lib/chains/providers/hive/connect.ts",
      "lib/chains/providers/hive/sign.ts",
      "lib/api/client.ts",
    ];
    const seen = new Set<string>(),
      violations: string[] = [];
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      expect(
        fileContent(file),
        file + " must not start a browser block watcher",
      ).not.toMatch(/\.blocks\s*\.\s*watch\s*\(/);
      for (const dependency of dependencies(file)) {
        const resolved = resolve(file, dependency.target);
        if (
          isBuiltin(dependency.target) ||
          /^(mongodb|mongoose)$/.test(dependency.target) ||
          (resolved &&
            /^(features\/events\/backend\/|server\/|lib\/database\/|lib\/utils\/database\/|lib\/modules\/|lib\/config\/(config|database)\.ts$|lib\/auth\/(jwt|session|permissions)\.ts$)|\.server\.ts$|lib\/chains\/.*\/server\//.test(
              resolved,
            ))
        )
          violations.push(file + " → " + dependency.target);
        else if (resolved) pending.push(resolved);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("consolidated utilities and direct imports", () => {
  it("keeps Submitted local and lets personal history own completion", () => {
    const panel = fileContent("components/game/GameActivityPanel.tsx");
    expect(panel).not.toMatch(
      /getTransactions|\.pending\b|waitForTransaction|setInterval|new\s+HiveClient/,
    );
    const store = fileContent("features/stores/transactionStore.ts");
    expect(store).not.toMatch(
      /localStorage|sessionStorage|persist\s*\(|server\.repository|server\.model/,
    );
    const confirmation = fileContent(
      "features/events/frontend/confirm-transaction/client.ts",
    );
    expect(confirmation).not.toMatch(
      /\bnotify\s*\(|\btoast\s*[.(]|server\.repository|server\.model/,
    );
  });
  it("has the intended runtime utility and hook inventory", () => {
    expect(files("lib/utils")).toHaveLength(20);
    expect(readdirSync(path.join(root, "lib/utils")).sort()).toEqual([
      "database",
      "game",
      "hive",
      "logs",
    ]);
    expect(files("hooks")).toHaveLength(7);
  });

  it("uses direct owner imports throughout source, tests and fixtures", () => {
    const violations: string[] = [];
    const inspect = (directory: string) => {
      for (const file of sourceFiles(directory)) {
        const source = sourceOf(file);
        const visit = (node: ts.Node) => {
          const parent = node.parent;
          const isModuleSpecifier =
            parent &&
            (((ts.isImportDeclaration(parent) ||
              ts.isExportDeclaration(parent)) &&
              parent.moduleSpecifier === node) ||
              (ts.isCallExpression(parent) &&
                parent.arguments[0] === node &&
                (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
                  (ts.isIdentifier(parent.expression) &&
                    parent.expression.text === "require") ||
                  (ts.isPropertyAccessExpression(parent.expression) &&
                    ["mock", "doMock", "importActual", "importMock"].includes(
                      parent.expression.name.text,
                    )))) ||
              (ts.isLiteralTypeNode(parent) &&
                ts.isImportTypeNode(parent.parent)));
          const target = ts.isStringLiteral(node) ? node.text : "";
          const owner = target.startsWith("@/")
            ? target.slice(2)
            : target.startsWith(".")
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(file), target),
                )
              : target;
          if (
            isModuleSpecifier &&
            ts.isStringLiteral(node) &&
            [
              "features/types",
              "features/types/index",
              "lib/auth",
              "lib/auth/index",
              "features/types/game/rng",
              "features/catalog/templates",
              "lib/utils/game/validation.server",
              "lib/utils/game/raid.server",
              "lib/utils/game/social-guard.server",
              "lib/utils/database/operation-error.server",
              "lib/utils/game-stats/emission",
              "lib/utils/game-stats/pricing",
              "lib/utils/market/suggested-price",
            ].includes(owner.replace(/\.tsx?$/, ""))
          ) {
            violations.push(file + " → " + node.text);
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    for (const directory of [
      "app",
      "components",
      "features",
      "hooks",
      "lib",
      "server",
      "tests",
    ])
      inspect(directory);
    expect(violations).toEqual([]);
  }, 15_000);
});

describe("focused Hive authentication provider", () => {
  it("has only focused authentication provider implementations", () => {
    expect(files("lib/chains/providers").sort()).toEqual([
      "lib/chains/providers/hive/connect.ts",
      "lib/chains/providers/hive/sign.ts",
      "lib/chains/providers/hive/verify.server.ts",
    ]);
    expect(
      fileContent("lib/chains/modules/hive/wallet/types.ts"),
    ).not.toContain("ConnectedWallet");
  });
  it("cannot coordinate authentication persistence, JWTs, or application workflows", () => {
    const pending = files("lib/chains/providers");
    const seen = new Set<string>();
    const violations: string[] = [];
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const dependency of dependencies(file)) {
        const resolved = resolve(file, dependency.target);
        if (
          resolved &&
          /^(features\/|lib\/modules\/|lib\/auth\/|lib\/config\/|lib\/utils\/database\/|lib\/utils\/game\/)/.test(
            resolved,
          )
        )
          violations.push(file + " → " + resolved);
        else if (resolved) pending.push(resolved);
      }
    }
    expect(violations).toEqual([]);
  });
  it("keeps application auth entrypoints delegated through feature events", () => {
    expect(
      dependencies(
        "features/events/frontend/authenticate-wallet/client.ts",
      ).filter((d) => d.target.startsWith("@/lib/chains/")),
    ).toEqual([
      { target: "@/lib/chains/providers/hive/connect", names: ["connectHive"] },
      { target: "@/lib/chains/providers/hive/sign", names: ["signHiveLogin"] },
    ]);
    const verifier = dependencies(
      "features/events/backend/wallet-auth/verify.ts",
    );
    expect(verifier).toContainEqual({
      target: "@/lib/chains/providers/hive/verify.server",
      names: ["verifyHiveLogin"],
    });
    expect(
      verifier.some((d) =>
        /signature\.server|server\/events\/get-account-authority/.test(
          d.target,
        ),
      ),
    ).toBe(false);
  });
});

describe("MongoDB-only collection ownership", () => {
  const collections = [
    "equipments",
    "players",
    "items",
    "logs",
    "game-stats",
    "transactions-pending",
    "transactions-processed",
  ];
  it("contains exactly the configured collection modules and three persistence files", () => {
    expect(readdirSync(path.join(root, "lib/modules")).sort()).toEqual(
      [...collections].sort(),
    );
    for (const collection of collections) {
      expect(
        readdirSync(path.join(root, "lib/modules", collection)).sort(),
      ).toEqual(["server.model.ts", "server.repository.ts", "server.types.ts"]);
      const model = fileContent(
        "lib/modules/" + collection + "/server.model.ts",
      );
      expect(model).toContain('collection: "' + collection + '"');
    }
  });
  it("removes runtime providers, demo workflows and test fixture dependencies", () => {
    const runtime = [
      ...files("app"),
      ...files("components"),
      ...files("features"),
      ...files("hooks"),
      ...files("lib"),
      ...files("server"),
    ];
    const violations: string[] = [];
    for (const file of runtime) {
      const source = fileContent(file);
      if (
        /game-stream-state|treasury-outbox|used-login-challenges|DATABASE_PROVIDER|APP_RUNTIME_MODE|getDatabase\(|@\/lib\/database|observe-demo-action|demoActionStore|demo-gameplay|marketplaceStore|chestStore|legacyStorage|@\/tests\//.test(
          source,
        )
      )
        violations.push(file);
    }
    expect(violations).toEqual([]);
  });
  it("repositories query only their own collection and utilities do not coordinate repositories", () => {
    const violations: string[] = [];
    for (const collection of collections)
      for (const dependency of dependencies(
        "lib/modules/" + collection + "/server.repository.ts",
      ))
        if (
          /server\.model|server\.repository/.test(dependency.target) &&
          dependency.target !== "./server.model"
        )
          violations.push(collection + " → " + dependency.target);
    for (const file of files("lib/utils"))
      for (const dependency of dependencies(file))
        if (/server\.repository/.test(dependency.target))
          violations.push(file + " → " + dependency.target);
    expect(violations).toEqual([]);
  });
});

describe("direct Hive SDK ownership", () => {
  it("defines fixed game configuration only in the shared client", () => {
    const clientFile = "lib/chains/modules/hive/client.ts";
    const names = [
      "GAME_ACTION_CUSTOM_JSON_ID",
      "GAME_ACTION_PROTOCOL_VERSION",
    ];
    const definitions: Record<string, string[]> = Object.fromEntries(
      names.map((name) => [name, []]),
    );
    const violations: string[] = [];
    for (const file of [
      "app",
      "components",
      "features",
      "hooks",
      "lib",
      "server",
    ].flatMap(files)) {
      const text = fileContent(file);
      const source = sourceOf(file);
      const visit = (node: ts.Node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          names.includes(node.name.text)
        ) {
          definitions[node.name.text].push(file);
        }
        if (
          file !== clientFile &&
          ts.isStringLiteral(node) &&
          node.text === "chainframe-game"
        ) {
          violations.push(file + " duplicates the game operation ID");
        }
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === "version" &&
          ts.isNumericLiteral(node.initializer) &&
          node.initializer.text === "1" &&
          ts.isObjectLiteralExpression(node.parent) &&
          node.parent.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              property.name.getText(source) === "action",
          )
        ) {
          violations.push(file + " duplicates the game payload version");
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      for (const dependency of dependencies(file, true)) {
        const target = resolve(file, dependency.target);
        if (target === "lib/utils/game/action-protocol.ts") {
          const forbiddenImport = source.statements.some(
            (node) =>
              ts.isImportDeclaration(node) &&
              ts.isStringLiteral(node.moduleSpecifier) &&
              resolve(file, node.moduleSpecifier.text) === target &&
              node.importClause?.namedBindings &&
              ts.isNamedImports(node.importClause.namedBindings) &&
              node.importClause.namedBindings.elements.some((entry) =>
                names.includes(entry.propertyName?.text ?? entry.name.text),
              ),
          );
          if (forbiddenImport)
            violations.push(
              file + " imports configuration from the old contract owner",
            );
        }
      }
      if (/HIVE_GAME_CUSTOM_JSON_ID|HIVE_GAME_PROTOCOL_VERSION/.test(text)) {
        violations.push(file + " retains an obsolete environment mirror");
      }
    }
    for (const name of names)
      expect(definitions[name], name).toEqual([clientFile]);
    expect(violations).toEqual([]);
    expect(fileContent(".env.example")).not.toMatch(
      /HIVE_GAME_CUSTOM_JSON_ID|HIVE_GAME_PROTOCOL_VERSION/,
    );
  });
  it("keeps application persistence free of MongoDB transactions and session requirements", () => {
    const violations = ["app", "features", "lib", "server"]
      .flatMap(files)
      .filter((file) => {
        const source = fileContent(file);
        return /\bstartSession\s*\(|\bwithTransaction\s*\(|\.connection\.transaction\s*\(|transactionAsyncLocalStorage|withDatabaseTransaction/.test(
          source,
        );
      });
    expect(violations).toEqual([]);
  });
  it("has one production Hive client construction", () => {
    const runtime = [
      ...files("app"),
      ...files("components"),
      ...files("features"),
      ...files("hooks"),
      ...files("lib"),
      ...files("server"),
    ];
    const constructors = runtime.filter((file) =>
      /new\s+HiveClient\s*\(/.test(fileContent(file)),
    );
    expect(constructors).toEqual(["lib/chains/modules/hive/client.ts"]);
  });
  it("keeps Hive events free of game rules, repositories and configuration reads", () => {
    const violations: string[] = [];
    for (const file of files("lib/chains").filter((file) =>
      /\/events\/.*\/action\.ts$/.test(file),
    )) {
      const source = fileContent(file);
      if (!source.includes("hiveClient."))
        violations.push(file + " has no SDK operation");
      for (const dependency of dependencies(file))
        if (
          /features\/|lib\/modules\/|lib\/utils\/game\/|lib\/config\//.test(
            dependency.target,
          )
        )
          violations.push(file + " → " + dependency.target);
    }
    expect(violations).toEqual([]);
    const client = fileContent("lib/chains/modules/hive/client.ts");
    expect(
      dependencies("lib/chains/modules/hive/client.ts").map((d) => d.target),
    ).toEqual(["hivexph-sdk"]);
    expect(client).not.toMatch(/process\.env|window|treasuryActiveKey|key:\s/);
  });
});
