import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const GoogleSheetsConfigurationSchema = z.object({
  serviceAccountEmail: z.string().email(),
  privateKey: z.string().min(1),
  identitySpreadsheetId: z.string().min(1),
  feedbackSpreadsheetId: z.string().min(1),
});

export type GoogleSheetsConfiguration = z.infer<typeof GoogleSheetsConfigurationSchema>;

export function googleSheetsConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_FILE
      || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY))
    && process.env.GOOGLE_IDENTITY_SPREADSHEET_ID
    && process.env.GOOGLE_FEEDBACK_SPREADSHEET_ID,
  );
}

export function readGoogleSheetsConfiguration(): GoogleSheetsConfiguration {
  let fileCredentials: unknown = {};
  if (process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_FILE) {
    const credentialsPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_FILE);
    fileCredentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
  }
  const parsedFile = z.object({
    client_email: z.string().email().optional(),
    private_key: z.string().min(1).optional(),
  }).parse(fileCredentials);
  return GoogleSheetsConfigurationSchema.parse({
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? parsedFile.client_email,
    // Vercel and .env files generally store PEM newlines as the two characters
    // "\\n". GoogleAuth needs the original multi-line key.
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? parsedFile.private_key)?.replace(/\\n/g, "\n"),
    identitySpreadsheetId: process.env.GOOGLE_IDENTITY_SPREADSHEET_ID,
    feedbackSpreadsheetId: process.env.GOOGLE_FEEDBACK_SPREADSHEET_ID,
  });
}

type FetchLike = typeof fetch;
type AccessTokenProvider = () => Promise<string>;

type ValueRange = {
  range?: string;
  majorDimension?: "ROWS" | "COLUMNS";
  values?: unknown[][];
};

export class GoogleSheetsRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "GoogleSheetsRequestError";
  }
}

export class GoogleSheetsClient {
  constructor(
    private readonly accessToken: AccessTokenProvider,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async readValues(spreadsheetId: string, range: string): Promise<unknown[][]> {
    const response = await this.request<ValueRange>(
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    return response.values ?? [];
  }

  async writeValues(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
    const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`);
    url.searchParams.set("valueInputOption", "RAW");
    await this.request(url.toString(), {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
  }

  async appendValues(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
    const url = new URL(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`);
    url.searchParams.set("valueInputOption", "RAW");
    url.searchParams.set("insertDataOption", "INSERT_ROWS");
    await this.request(url.toString(), {
      method: "POST",
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
  }

  async batchWriteValues(
    spreadsheetId: string,
    data: { range: string; values: unknown[][] }[],
  ): Promise<void> {
    await this.request(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  private async request<T = unknown>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : {}) as T;
    }
    const responseBody = await response.text();
    if (RETRYABLE_STATUS.has(response.status) && attempt < 3) {
      const delayMs = Math.min(4_000, 250 * (2 ** attempt)) + Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.request<T>(url, init, attempt + 1);
    }
    throw new GoogleSheetsRequestError(
      `Google Sheets request failed with status ${response.status}.`,
      response.status,
      responseBody.slice(0, 1_000),
    );
  }
}

export function createGoogleSheetsClient(
  configuration = readGoogleSheetsConfiguration(),
): GoogleSheetsClient {
  const auth = new GoogleAuth({
    credentials: {
      client_email: configuration.serviceAccountEmail,
      private_key: configuration.privateKey,
    },
    scopes: [SHEETS_SCOPE],
  });
  return new GoogleSheetsClient(async () => {
    const token = await auth.getAccessToken();
    if (!token) throw new Error("Google did not return an access token for the configured service account.");
    return token;
  });
}
