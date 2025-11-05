import { google, type sheets_v4 } from 'googleapis';
import { storage } from './storage';
import type { InsertProduct, InsertService } from '@shared/schema';

const sheetsScopes = ['https://www.googleapis.com/auth/spreadsheets'];
let sheetsClient: sheets_v4.Sheets | null = null;

interface SheetsConfig {
  spreadsheetId: string;
  productsRange: string;
  servicesRange: string;
}

interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
}

function getSheetsCredentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Sheets credentials are not configured');
  }

  const normalizedKey = privateKey.replace(/\\n/g, '\n');

  if (!sheetsClient) {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: normalizedKey,
      scopes: sheetsScopes,
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
  }

  return sheetsClient;
}

function getSheetsConfig(): SheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const productsRange = process.env.GOOGLE_SHEETS_PRODUCTS_RANGE || 'Products!A1:F';
  const servicesRange = process.env.GOOGLE_SHEETS_SERVICES_RANGE || 'Services!A1:E';

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID must be configured');
  }

  return { spreadsheetId, productsRange, servicesRange };
}

function getSheetName(range: string): string {
  const [sheetName] = range.split('!');
  return sheetName;
}

export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  );
}

function toRecords(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.trim().toLowerCase());

  return dataRows
    .filter((row) => row.some((cell) => (cell ?? '').toString().trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        if (!header) continue;
        record[header] = (row[i] ?? '').toString().trim();
      }
      return record;
    });
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const sanitized = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (!sanitized) return null;
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const sanitized = value.replace(/[^0-9-]/g, '');
  if (!sanitized) return null;
  const parsed = Number.parseInt(sanitized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return !['false', '0', 'no', 'inactive', 'off'].includes(normalized);
}

async function syncProducts(shopId: number, rows: string[][]): Promise<SyncStats> {
  const records = toRecords(rows);
  if (!records.length) {
    return { created: 0, updated: 0, skipped: 0 };
  }

  const stats: SyncStats = { created: 0, updated: 0, skipped: 0 };
  const existingProducts = await storage.getProducts(shopId);
  const productMap = new Map(existingProducts.map((product) => [product.name.toLowerCase(), product]));

  for (const record of records) {
    const name = record['name'];
    const priceValue = parseNumber(record['price']);
    const costValue = parseNumber(record['cost']);
    const stockValue = parseInteger(record['stock']);
    const activeValue = parseBoolean(record['active']);

    if (!name || priceValue === null) {
      stats.skipped++;
      continue;
    }

    const normalizedName = name.toLowerCase();
    const description = record['description'] || null;
    const productPayload: InsertProduct = {
      shopId,
      name,
      description,
      price: priceValue.toFixed(2),
      cost: (costValue ?? 0).toFixed(2),
      stock: stockValue ?? 0,
      active: activeValue ?? true,
    };

    const existing = productMap.get(normalizedName);

    if (existing) {
      const updatePayload: Partial<InsertProduct> = {
        name: productPayload.name,
        description: productPayload.description,
        price: productPayload.price,
        cost: productPayload.cost,
        stock: productPayload.stock,
      };
      if (activeValue !== undefined) {
        updatePayload.active = activeValue;
      }

      await storage.updateProduct(existing.id, shopId, updatePayload);
      stats.updated++;
    } else {
      const created = await storage.createProduct(productPayload);
      productMap.set(normalizedName, created);
      stats.created++;
    }
  }

  return stats;
}

async function syncServices(shopId: number, rows: string[][]): Promise<SyncStats> {
  const records = toRecords(rows);
  if (!records.length) {
    return { created: 0, updated: 0, skipped: 0 };
  }

  const stats: SyncStats = { created: 0, updated: 0, skipped: 0 };
  const existingServices = await storage.getServices(shopId);
  const serviceMap = new Map(existingServices.map((service) => [service.name.toLowerCase(), service]));

  for (const record of records) {
    const name = record['name'];
    const priceValue = parseNumber(record['price']);
    const durationValue = parseInteger(record['duration']);
    const activeValue = parseBoolean(record['active']);

    if (!name || priceValue === null || durationValue === null) {
      stats.skipped++;
      continue;
    }

    const normalizedName = name.toLowerCase();
    const description = record['description'] || null;

    const servicePayload: InsertService = {
      shopId,
      name,
      description,
      price: priceValue.toFixed(2),
      duration: durationValue,
      active: activeValue ?? true,
    };

    const existing = serviceMap.get(normalizedName);

    if (existing) {
      const updatePayload: Partial<InsertService> = {
        name: servicePayload.name,
        description: servicePayload.description,
        price: servicePayload.price,
        duration: servicePayload.duration,
      };
      if (activeValue !== undefined) {
        updatePayload.active = activeValue;
      }

      await storage.updateService(existing.id, shopId, updatePayload);
      stats.updated++;
    } else {
      const created = await storage.createService(servicePayload);
      serviceMap.set(normalizedName, created);
      stats.created++;
    }
  }

  return stats;
}

export async function syncCatalogFromSheets(shopId: number): Promise<{ products: SyncStats; services: SyncStats }> {
  const sheets = getSheetsCredentials();
  const { spreadsheetId, productsRange, servicesRange } = getSheetsConfig();

  const [productsResponse, servicesResponse] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId, range: productsRange }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: servicesRange }),
  ]);

  const productRows = (productsResponse.data.values as string[][]) ?? [];
  const serviceRows = (servicesResponse.data.values as string[][]) ?? [];

  const [productStats, serviceStats] = await Promise.all([
    syncProducts(shopId, productRows),
    syncServices(shopId, serviceRows),
  ]);

  return { products: productStats, services: serviceStats };
}

async function exportProducts(shopId: number, sheetsConfig: SheetsConfig): Promise<number> {
  const sheets = getSheetsCredentials();
  const items = await storage.getProducts(shopId);
  const values = [
    ['name', 'description', 'price', 'cost', 'stock', 'active'],
    ...items.map((item) => [
      item.name,
      item.description ?? '',
      item.price?.toString() ?? '',
      item.cost?.toString() ?? '',
      item.stock?.toString() ?? '0',
      item.active ? 'TRUE' : 'FALSE',
    ]),
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetsConfig.spreadsheetId,
    range: getSheetName(sheetsConfig.productsRange),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsConfig.spreadsheetId,
    range: sheetsConfig.productsRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return items.length;
}

async function exportServices(shopId: number, sheetsConfig: SheetsConfig): Promise<number> {
  const sheets = getSheetsCredentials();
  const items = await storage.getServices(shopId);
  const values = [
    ['name', 'description', 'price', 'duration', 'active'],
    ...items.map((item) => [
      item.name,
      item.description ?? '',
      item.price?.toString() ?? '',
      item.duration?.toString() ?? '',
      item.active ? 'TRUE' : 'FALSE',
    ]),
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetsConfig.spreadsheetId,
    range: getSheetName(sheetsConfig.servicesRange),
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsConfig.spreadsheetId,
    range: sheetsConfig.servicesRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return items.length;
}

export async function exportCatalogToSheets(shopId: number): Promise<{ products: number; services: number }> {
  const sheetsConfig = getSheetsConfig();

  const [productCount, serviceCount] = await Promise.all([
    exportProducts(shopId, sheetsConfig),
    exportServices(shopId, sheetsConfig),
  ]);

  return { products: productCount, services: serviceCount };
}
