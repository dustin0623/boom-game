# Native payout signing verification and recovery

## SDK 1.2.2 listener cleanup upgrade (2026-10-22)

The application and separate worker now use published `hivexph-sdk` 1.2.2 through the exact package manifest pin and matching lockfile. The installed release passes all eight currently discovered native-signing gate cases with synthetic credentials and intercepted RPC. The original 1.2.0 reproduction and 1.2.1 verification below remain historical evidence.

The published patch cleans up abort listeners after completed sleeps and disposes reader-stream merged-signal listeners. An offline check of the packaged sleep helper ran 100 completed waits on one signal and found zero remaining abort listeners, then verified an already-aborted wait returns immediately. The application retains its finality wait, canonical reread and direct SDK signing path; no installed dependency patch or listener-limit increase is used. This check does not establish long-running live worker health.

Frozen-lockfile installation, TypeScript and production build pass. Application-source ESLint reports zero errors and 16 existing warnings. Existing tooling also reports Vite configuration and Mongoose option deprecations, ignored dependency build scripts, and a pure-JavaScript secp256k1 fallback during build. No live payment, operational database write, deployment or worker restart was performed. Deployment requires matching application/worker dependencies, review of outstanding work and verified lease/readiness after restart; uncertain payouts remain parked without rebroadcast.

The full suite passes all 1,849 tests across 147 files with `pnpm test --maxWorkers=2`, including isolated MongoDB integration and architecture checks. The initial default-concurrency run alongside other validation jobs failed three leaderboard/statistics cases (two import timeouts and a follow-on spy-count failure); the full bounded-concurrency rerun passes without changing assertions or timeouts. The eight-case signing gate also passed independently.

Verified on 2026-10-15: published `hivexph-sdk` 1.2.1 passes all five independent signing checks (four native HIVE/HBD cases and one Engine Custom JSON control). The release was staged separately and passed the unchanged gate before the application and lockfile were pinned exactly to 1.2.1. The published JavaScript differs from 1.2.0 only in its internal native-asset symbol encoding; bundled public type declarations are identical. Public transfer inputs, HIVE/HBD JSON symbols, amounts, memo envelopes, account aliases and returned transaction IDs remain unchanged. The application continues using the direct SDK native-transfer method, without a replacement serializer, currency conversion, dependency patch or dhive payment implementation.

## Historical 1.2.0 reproduction

Run the [native signing integration suite](../tests/integration/hive-native-signing.test.ts):

```text
pnpm exec vitest run tests/integration/hive-native-signing.test.ts
```

All RPC calls are intercepted before transport. Credentials are derived from a fixed test seed, and no application database, environment credential or live wallet is used. Against 1.2.0, the public `payments.hive.transfer` API produced the expected operation, public currency symbol, memo and transaction-ID result, but the resulting signatures failed independent Hive verification. HIVE 7.500, 0.500 and 0.005 and HBD 0.500 failed. An Engine Custom JSON transfer through the same SDK passed the same independent verification, providing a control for the fixture and signing key. All five cases now pass against 1.2.1; keep the test command above in normal discovery for future releases.

Standalone reproduction with `hivexph-sdk@1.2.0` and `@hiveio/dhive@1.3.6`:

```js
import { HiveClient } from 'hivexph-sdk';
import { PrivateKey, Signature, cryptoUtils } from '@hiveio/dhive';

const key = PrivateKey.fromSeed('public-sdk-native-signing-fixture');
const client = new HiveClient({
  accounts: { treasury: { account: 'treasury', key: key.toString() } },
});
let captured;
client.rpc.call = async (method, params) => {
  if (method === 'condenser_api.get_dynamic_global_properties') return {
    head_block_number: 65537,
    head_block_id: '0001000111223344000000000000000000000000',
    time: '2026-01-01T00:00:00',
  };
  if (method === 'condenser_api.broadcast_transaction_synchronous') {
    captured = params[0]; // Intercepted only: never forwarded to a real RPC.
    return { id: 'a'.repeat(40) };
  }
  throw new Error(`Unexpected intercepted RPC: ${method}`);
};
await client.payments.hive.transfer({
  from: client.accounts.treasury, account: 'referrer',
  amount: '7.500', symbol: 'HIVE', action: 'refund',
  metadata: { memo: 'public signing fixture' },
});
const signature = Signature.fromString(captured.signatures[0]);
const digest = cryptoUtils.transactionDigest(captured);
console.log(key.createPublic().verify(digest, signature));
// Expected: true. SDK 1.2.0: false. HBD reproduces the same failure.
```

The independent verifier is test infrastructure only; it adds no production dhive signing or payment path. The exact exception from the earlier live payout was not retained, so this reproduction proves a signing defect without claiming to recover that original RPC response.

## Verified upstream release and future upgrades

The package links to [rhiaji/hivex-sdk](https://github.com/rhiaji/hivex-sdk). The original attempt to submit this synthetic reproduction as an issue on 2026-10-15 returned HTTP 403, "Resource not accessible by integration"; no issue was created. The maintainer subsequently published 1.2.1 with the correction. Both the published package and current repository source include the internal native-asset encoding fix; the changelog records unchanged public interfaces and no new runtime dependencies. This document retains the original report as historical evidence, not as an outstanding upstream release blocker.

For future upgrades, require direct HIVE/HBD transfers to pass all four verification cases and the existing Custom JSON control. Preserve the public API, HIVE/HBD symbols, action/metadata memo envelope, account routing and transaction IDs. Pin a verified release exactly in the application and update its lockfile only after those tests pass. Do not weaken the cases, apply local SDK patches or substitute another signer.

## Operator recovery

The application's existing internal [reconciliation operation](../server/game-smart-contract/features/events/treasury/reconcile.ts) remains the only recovery entrypoint. It is not an endpoint, CLI, script or automatic task. A dependency upgrade never resets a broadcasting claim or resends parked work.

For each parked payout, preserve the parent job, source receipt, obligation and transfer intent. Review exact on-chain evidence first. If a matching transfer exists, use its transaction ID for normal irreversible verification and reconciliation. An independently authorized manual payout is permitted only after operator review establishes no prior execution; it must match the saved sender, recipient, amount and exact expected JSON memo envelope, not just its human-readable label. Reconcile the resulting transfer before counting paid earnings and normal archive-before-delete cleanup. Uncertain cases remain parked. Never replay registration, repeat stock fulfillment or starting HASH, change attribution or create replacement financial records.

The SDK signing gate is resolved by 1.2.1. Deployment still requires normal application validation, coordinated application/worker dependency updates and full process restart. This upgrade does not deploy, start a worker, broadcast a controlled payout or reconcile existing records. Automated validation must never send payments or modify application records.

## Application validation evidence

Before the upgrade on 2026-10-15, the normal discovered suite ran 1,435 cases: 1,431 passed and the four native-signature cases above failed against 1.2.0. The Custom JSON control passed. Those cases remain ordinary assertions, without skips, exclusions or expected-failure annotations.

After the exact 1.2.1 upgrade, all 137 test files and 1,435 cases pass, including the unchanged five-case signing gate and existing isolated standalone-MongoDB suites. The focused installed-SDK signing, native-transfer and financial-recovery run also passes all 107 cases across six files. Frozen-lockfile installation, TypeScript and production build pass; application-source ESLint reports no errors and 16 existing warnings. The lockfile changes only the SDK version, exact specifier and package integrity; runtime dependency versions remain unchanged. The 17 routes, seven collection owners and seven production hooks remain unchanged. No application database records or real payment broadcasts were involved; no deployment, worker restart or live payout was performed by this upgrade.
