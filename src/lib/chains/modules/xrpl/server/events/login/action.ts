/** XRPL login (server side): GemWallet + Joey signature checks and the Xaman REST sign-in. */
import { deriveAddress, verify } from "ripple-keypairs";
import { decode, encodeForSigning } from "ripple-binary-codec";
import { chainEnv, xrplChainConfig } from "@/lib/chains/modules/config";
import { toHex, fromHex } from "../../../utils";
import type { XamanStatus } from "../../../types";

export { buildLoginTx } from "../../../utils";

/** Server: verify a GemWallet message signature and that the key owns the address. */
export function verifyXrplSignature(address: string, publicKey: string, message: string, signature: string) {
  try {
    if (deriveAddress(publicKey) !== address) return false;
    return verify(toHex(message), signature, publicKey);
  } catch {
    return false;
  }
}

function xamanHeaders() {
  const key = process.env[chainEnv.xrpl.xamanApiKey];
  const secret = process.env[chainEnv.xrpl.xamanApiSecret];
  if (!key || !secret) throw new Error("Xaman sign-in is not configured yet (missing API key/secret).");
  return { "Content-Type": "application/json", "X-API-Key": key, "X-API-Secret": secret };
}

type XamanPayload = {
  meta?: { signed?: boolean; resolved?: boolean; expired?: boolean; cancelled?: boolean };
  response?: { account?: string | null };
  custom_meta?: { blob?: { token?: string } | null };
};

/** Server: create a Xaman SignIn request bound to our challenge token. */
export async function createXamanSignIn(message: string, token: string, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`${xrplChainConfig.xamanApiUrl}/payload`, {
    method: "POST",
    headers: xamanHeaders(),
    body: JSON.stringify({
      txjson: { TransactionType: "SignIn" },
      options: { expire: xrplChainConfig.xamanExpireMinutes },
      custom_meta: { instruction: message, blob: { token } },
    }),
  });
  if (!res.ok) throw new Error(`Xaman request failed (${res.status})`);
  const p = (await res.json()) as { uuid: string; next: { always: string }; refs: { qr_png: string } };
  return { uuid: p.uuid, qrImage: p.refs.qr_png, deeplink: p.next.always };
}

async function fetchXamanPayload(uuid: string, fetcher: typeof fetch) {
  const res = await fetcher(`${xrplChainConfig.xamanApiUrl}/payload/${encodeURIComponent(uuid)}`, {
    headers: xamanHeaders(),
  });
  if (!res.ok) throw new Error(`Xaman lookup failed (${res.status})`);
  return (await res.json()) as XamanPayload;
}

/** Server: poll a Xaman request. */
export async function getXamanStatus(uuid: string, fetcher: typeof fetch = fetch): Promise<XamanStatus> {
  const p = await fetchXamanPayload(uuid, fetcher);
  if (p.meta?.signed && p.response?.account) return { status: "signed", account: p.response.account };
  if (p.meta?.expired) return { status: "expired" };
  if (p.meta?.cancelled || p.meta?.resolved) return { status: "rejected" };
  return { status: "pending" };
}

/** Server: confirm with Xaman that the request was signed for this challenge; returns the account. */
export async function verifyXamanSignIn(uuid: string, token: string, fetcher: typeof fetch = fetch) {
  try {
    const p = await fetchXamanPayload(uuid, fetcher);
    if (!p.meta?.signed || !p.response?.account) return null;
    if (p.custom_meta?.blob?.token !== token) return null;
    return p.response.account;
  } catch {
    return null;
  }
}

/** Server: verify a signed login transaction blob (Joey). */
export function verifyXrplSignedTx(address: string, message: string, blob: string) {
  try {
    const tx = decode(blob) as Record<string, unknown> & {
      Account?: string;
      SigningPubKey?: string;
      TxnSignature?: string;
      Memos?: { Memo: { MemoType?: string; MemoData?: string } }[];
    };
    if (tx["TransactionType"] !== "AccountSet" || tx.Account !== address) return false;
    if (!tx.SigningPubKey || !tx.TxnSignature) return false;
    if (deriveAddress(tx.SigningPubKey) !== address) return false;
    const memo = tx.Memos?.find((m) => m.Memo.MemoType && fromHex(m.Memo.MemoType) === "login");
    if (!memo?.Memo.MemoData || fromHex(memo.Memo.MemoData) !== message) return false;
    const { TxnSignature, ...unsigned } = tx;
    return verify(encodeForSigning(unsigned as never), TxnSignature, tx.SigningPubKey);
  } catch {
    return false;
  }
}
