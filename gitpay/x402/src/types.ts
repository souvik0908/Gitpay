export type PaymentRequirements = {
  scheme: "exact";
  network: "cronos-testnet" | "cronos";
  payTo: string;
  asset: string;
  description?: string;
  mimeType?: string;
  maxAmountRequired: string;      // base units as string
  maxTimeoutSeconds: number;
};

export type FundIntentResponse = {
  error: "Payment Required";
  x402Version: 1;
  paymentRequirements: PaymentRequirements;
};

export type FundRequestBody = {
  owner: string;
  repo: string;
  issueNumber: number;
  amountBaseUnits: string;        // e.g. "50000000" for 50 USDCe
  paymentHeader: string;          // base64 X-PAYMENT header
};