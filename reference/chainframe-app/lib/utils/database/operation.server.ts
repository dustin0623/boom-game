import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import { connectDatabase } from "@/lib/config/database";

export class DatabaseOperationUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "Database writes did not finish; operator review is required before retrying",
      { cause },
    );
    this.name = "DatabaseOperationUncertainError";
  }
}

type OperationOptions = {
  beforeWrite?: () => Promise<void>;
  afterSuccess?: () => Promise<void>;
};
type OperationContext = OperationOptions & {
  writeAttempted: boolean;
  effectAttempted: boolean;
  preparation?: Promise<void>;
};

// Reuse context and ordering across Next development module reloads.
const stateKey = Symbol.for("chainframe.database.operations.v1");
const globals = globalThis as typeof globalThis & {
  [stateKey]?: {
    context: AsyncLocalStorage<OperationContext>;
    preparing: AsyncLocalStorage<boolean>;
    preparationOnly: AsyncLocalStorage<boolean>;
    tail: Promise<void>;
    installed: boolean;
  };
};
const state = (globals[stateKey] ??= {
  context: new AsyncLocalStorage<OperationContext>(),
  preparing: new AsyncLocalStorage<boolean>(),
  preparationOnly: new AsyncLocalStorage<boolean>(),
  tail: Promise.resolve(),
  installed: false,
});

/** Observe actual writes so validation/read failures do not become partial settlements. */
function observeWrites() {
  if (state.installed) return;
  const prototype = mongoose.mongo.Collection.prototype;
  const methods = [
    "insertOne",
    "insertMany",
    "bulkWrite",
    "updateOne",
    "updateMany",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
  ] as const;
  for (const method of methods) {
    const original = prototype[method] as (
      ...args: unknown[]
    ) => Promise<unknown>;
    Object.defineProperty(prototype, method, {
      configurable: true,
      writable: true,
      value: async function (this: unknown, ...args: unknown[]) {
        const context = state.context.getStore();
        if (context && !state.preparing.getStore() && !context.writeAttempted) {
          context.preparation ??= state.preparing.run(true, async () => {
            try {
              await context.beforeWrite?.();
            } catch (error) {
              throw new DatabaseOperationUncertainError(error);
            }
          });
          await context.preparation;
          context.writeAttempted = true;
        }
        if (
          context &&
          !state.preparing.getStore() &&
          !state.preparationOnly.getStore()
        )
          context.effectAttempted = true;
        try {
          return await original.apply(this, args);
        } catch (error) {
          // Even a preparation write can have an ambiguous result on network failure.
          if (context && !state.preparing.getStore())
            context.effectAttempted = true;
          throw error;
        }
      },
    });
  }
  state.installed = true;
}

/** Ordered direct writes, not a transaction. Nested workflows join the same operation. */
export function withDatabaseOperation<T>(
  execute: () => Promise<T>,
  options: OperationOptions = {},
): Promise<T> {
  if (state.context.getStore()) return execute();
  const operation = state.tail.then(async () => {
    await connectDatabase();
    observeWrites();
    const context: OperationContext = {
      ...options,
      writeAttempted: false,
      effectAttempted: false,
    };
    return state.context.run(context, async () => {
      try {
        const result = await execute();
        await options.afterSuccess?.();
        return result;
      } catch (error) {
        if (
          context.effectAttempted &&
          !(error instanceof DatabaseOperationUncertainError)
        )
          throw new DatabaseOperationUncertainError(error);
        // Successful tick/charge refreshes do not spend or grant game resources.
        // Clear their guard before recording an ordinary game-rule rejection.
        if (context.writeAttempted && !context.effectAttempted) {
          try {
            await options.afterSuccess?.();
          } catch (cause) {
            throw new DatabaseOperationUncertainError(cause);
          }
        }
        throw error;
      }
    });
  });
  state.tail = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

/** Only for single-document mining/charge refreshes, never rewards or spending. */
export function withDatabasePreparation<T>(
  execute: () => Promise<T>,
): Promise<T> {
  return state.preparationOnly.run(true, execute);
}

/** A guarded, non-upserting update with an acknowledged zero-match result changed no document.
 * Failed/ambiguous acknowledgments still count as uncertain effects, and earlier
 * effects in the enclosing operation are never cleared.
 */
export async function withDatabaseConditionalWrite<
  T extends {
    acknowledged: boolean;
    matchedCount: number;
    upsertedCount: number;
  },
>(execute: () => Promise<T>): Promise<T> {
  const context = state.context.getStore();
  try {
    const result = await state.preparationOnly.run(true, execute);
    if (!result.acknowledged)
      throw new Error("Guarded update acknowledgment is unavailable");
    if (context && (result.matchedCount !== 0 || result.upsertedCount !== 0))
      context.effectAttempted = true;
    return result;
  } catch (error) {
    if (context) context.effectAttempted = true;
    throw error;
  }
}

/** Queue bookkeeping only: never wrap player, inventory, log or counter effects. */
export function withDatabaseBookkeeping<T>(
  execute: () => Promise<T>,
): Promise<T> {
  return state.preparing.run(true, execute);
}
