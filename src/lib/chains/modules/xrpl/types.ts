export type XrplWallet = "xaman" | "joey" | "gemwallet";

export type XrplWalletMeta = { id: XrplWallet; label: string; installUrl: string };

export const XRPL_WALLETS: XrplWalletMeta[] = [
  { id: "xaman", label: "Xaman", installUrl: "https://xaman.app" },
  { id: "joey", label: "Joey Wallet", installUrl: "https://joeywallet.xyz" },
  { id: "gemwallet", label: "GemWallet", installUrl: "https://gemwallet.app" },
];

/** QR / deep link shown while a mobile wallet signs. */
export type XrplQrPrompt = {
  wallet: XrplWallet;
  /** Ready-made QR image (Xaman). */
  qrImage?: string;
  /** Raw value to encode as a QR (WalletConnect URI for Joey). */
  qrValue?: string;
  /** Opens the wallet directly on mobile. */
  deeplink: string;
};

export type XamanStatus =
  | { status: "pending" }
  | { status: "signed"; account: string }
  | { status: "rejected" | "expired" };
