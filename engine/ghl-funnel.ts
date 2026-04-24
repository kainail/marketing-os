import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();
const ERRORS_CSV = path.join(ROOT, 'logs', 'errors.csv');
const ASSET_LOG = path.join(ROOT, 'performance', 'asset-log.csv');

// --- Types ---

export interface FunnelElement {
  id: string;
  type: string;
  content: string;
}

export interface FunnelPage {
  id: string;
  name: string;
  url: string;
  elements: FunnelElement[];
  conversionRate?: number;
}

export interface PageMetrics {
  pageViews: number;
  formSubmissions: number;
  conversionRate: number;
  period: string;
}

// --- Auth ---

// [KAI — GHL API v2 base URL. Confirm this matches your GHL account region.]
const GHL_BASE = 'https://services.leadconnectorhq.com';

function getClient(): AxiosInstance {
  const apiKey = process.env['GHL_API_KEY'];
  if (!apiKey) throw new Error('GHL_API_KEY not set. Add it to .env');

  return axios.create({
    baseURL: GHL_BASE,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    timeout: 15000,
  });
}

// --- Error logging ---

function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","ghl-funnel","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.ensureDirSync(path.join(ROOT, 'logs'));
    fs.appendFileSync(ERRORS_CSV, line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Public functions ---

/**
 * Reads the current funnel page from GHL API.
 * [KAI — GHL Funnel API endpoint. Verify /funnels/pages/{pageId} is correct for your GHL version.]
 */
export async function getFunnelPage(pageId: string): Promise<FunnelPage> {
  try {
    const client = getClient();
    const res = await client.get(`/funnels/pages/${pageId}`);
    const data = res.data as { id?: string; name?: string; url?: string; elements?: FunnelElement[] };

    const page: FunnelPage = {
      id: data.id ?? pageId,
      name: data.name ?? 'Unknown Page',
      url: data.url ?? '',
      elements: data.elements ?? [],
    };

    console.log(chalk.gray(`\n  [GHL Funnel] Loaded page: ${page.name}`));
    console.log(chalk.gray(`  URL: ${page.url || '(not available)'}`));

    return page;
  } catch (err) {
    logError('getFunnelPage', err as Error);
    // Return a mock page for testing when GHL is not configured
    console.log(chalk.yellow('  [GHL Funnel] Could not load live page — using placeholder for review.'));
    return {
      id: pageId,
      name: 'The No-Risk Comeback — Landing Page',
      url: `https://app.gohighlevel.com/funnels/pages/${pageId}`,
      elements: [
        { id: 'headline-1', type: 'headline', content: 'Stop Starting Over. Start for the Last Time.' },
        { id: 'subheadline-1', type: 'subheadline', content: '30 Days. A Real Coach. $1 to Start.' },
        { id: 'cta-1', type: 'button', content: 'Start for $1' },
        { id: 'guarantee-1', type: 'guarantee', content: 'If you show up and don\'t feel the difference, we refund your $1.' },
      ],
    };
  }
}

/**
 * Updates a specific element on a GHL funnel page.
 * [KAI — Confirm the correct update endpoint and element ID format for your GHL funnel builder version.]
 */
export async function updatePageElement(pageId: string, elementId: string, newContent: string): Promise<void> {
  try {
    const client = getClient();

    // Read current content for logging
    const page = await getFunnelPage(pageId);
    const existing = page.elements.find(e => e.id === elementId);
    const oldContent = existing?.content ?? '(unknown)';

    await client.put(`/funnels/pages/${pageId}/elements/${elementId}`, {
      content: newContent,
    });

    console.log(chalk.green(`  Updated [${elementId}]`));
    console.log(chalk.gray(`    was: ${oldContent.slice(0, 60)}${oldContent.length > 60 ? '...' : ''}`));
    console.log(chalk.gray(`    now: ${newContent.slice(0, 60)}${newContent.length > 60 ? '...' : ''}`));

  } catch (err) {
    logError(`updatePageElement:${elementId}`, err as Error);
    throw err;
  }
}

/**
 * Publishes pending changes to a GHL funnel page and makes them live.
 * [KAI — Verify /funnels/pages/{pageId}/publish endpoint availability in your GHL version.]
 */
export async function publishPage(pageId: string): Promise<void> {
  try {
    const client = getClient();
    await client.post(`/funnels/pages/${pageId}/publish`, {});

    const timestamp = new Date().toISOString();
    console.log(chalk.bold.green('\n  Page published — changes are now live.'));

    // Log to asset-log.csv
    const logLine = `"funnel-publish-${timestamp.slice(0, 10)}","funnel-updater","funnel-updater","anytime-fitness","lifestyle-member","${timestamp.slice(0, 10)}","live","ready-to-post","funnel-${pageId}",""\n`;
    try {
      fs.appendFileSync(ASSET_LOG, logLine);
    } catch { /* non-fatal */ }

  } catch (err) {
    logError('publishPage', err as Error);
    throw err;
  }
}

/**
 * Reads page performance metrics from GHL.
 * [KAI — Verify metrics endpoint availability. GHL analytics API may require different scope.]
 */
export async function getPageMetrics(pageId: string): Promise<PageMetrics> {
  try {
    const client = getClient();
    const res = await client.get(`/funnels/pages/${pageId}/metrics`);
    const data = res.data as { pageViews?: number; submissions?: number; period?: string };

    const views = data.pageViews ?? 0;
    const submissions = data.submissions ?? 0;
    const rate = views > 0 ? Math.round((submissions / views) * 1000) / 10 : 0;

    return {
      pageViews: views,
      formSubmissions: submissions,
      conversionRate: rate,
      period: data.period ?? 'last-30-days',
    };
  } catch (err) {
    logError('getPageMetrics', err as Error);
    // Return zero metrics gracefully — non-fatal
    return { pageViews: 0, formSubmissions: 0, conversionRate: 0, period: 'unavailable' };
  }
}
