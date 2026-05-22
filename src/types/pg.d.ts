declare module "pg" {
  const pg: {
    Client: new (options: {
      connectionString?: string;
      ssl?: { rejectUnauthorized: boolean };
    }) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(queryText: string, values?: unknown[]): Promise<{
        rowCount: number | null;
        rows: Array<Record<string, unknown>>;
      }>;
    };
  };

  export default pg;
}
