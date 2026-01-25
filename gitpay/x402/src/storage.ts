import Database from "better-sqlite3";

export type FundedBounty = {
  owner: string;
  repo: string;
  issueNumber: number;
  asset: string;
  amountBaseUnits: string;
  treasuryWallet: string;
  fundedTxHash: string;
  fundedFrom: string;
  fundedAt: string;
};

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS funded_bounties (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        issue_number INTEGER NOT NULL,
        asset TEXT NOT NULL,
        amount_base_units TEXT NOT NULL,
        treasury_wallet TEXT NOT NULL,
        funded_tx_hash TEXT NOT NULL,
        funded_from TEXT NOT NULL,
        funded_at TEXT NOT NULL,
        PRIMARY KEY (owner, repo, issue_number)
      );
    `);
  }

  getFunded(owner: string, repo: string, issueNumber: number): FundedBounty | null {
    const row = this.db
      .prepare(`SELECT * FROM funded_bounties WHERE owner = ? AND repo = ? AND issue_number = ?`)
      .get(owner, repo, issueNumber);
    return (row as FundedBounty) || null;
  }

  upsertFunded(b: FundedBounty) {
    this.db.prepare(`
      INSERT INTO funded_bounties (
        owner, repo, issue_number, asset, amount_base_units, treasury_wallet,
        funded_tx_hash, funded_from, funded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner, repo, issue_number) DO UPDATE SET
        asset=excluded.asset,
        amount_base_units=excluded.amount_base_units,
        treasury_wallet=excluded.treasury_wallet,
        funded_tx_hash=excluded.funded_tx_hash,
        funded_from=excluded.funded_from,
        funded_at=excluded.funded_at
    `).run(
      b.owner,
      b.repo,
      b.issueNumber,
      b.asset,
      b.amountBaseUnits,
      b.treasuryWallet,
      b.fundedTxHash,
      b.fundedFrom,
      b.fundedAt
    );
  }
}