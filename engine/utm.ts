import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';

const ROOT = process.cwd();

// --- Types ---

export interface UTMParams {
  source: string;   // facebook | instagram | google | email | referral
  medium: string;   // paid_social | organic_social | search | email | sms
  campaign: string; // offer slug: no-risk-comeback | 30day-kickstart
  content: string;  // asset ID from asset-log.csv
  term: string;     // hook ID
}

export interface CampaignConfig {
  baseUrl: string;
  campaign: string;
  content: string; // asset ID that generated this campaign
  term: string;    // hook ID
}

export interface CampaignURLSet {
  facebook: string;
  instagram: string;
  google: string;
  email: string;
}

// --- Utilities ---

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Append one line to logs/errors.csv */
function logError(operation: string, error: Error): void {
  const line = `"${new Date().toISOString()}","${operation}","utm","${error.message.replace(/"/g, "'")}","false"\n`;
  try {
    fs.appendFileSync(path.join(ROOT, 'logs', 'errors.csv'), line);
  } catch {
    process.stderr.write(`[LOG FAIL] ${operation}: ${error.message}\n`);
  }
}

// --- Core Functions ---

/**
 * Build a complete URL with UTM parameters appended.
 * Validates all required params, URL-encodes all values,
 * and logs the generated URL to performance/asset-log.csv.
 */
export function generateUTM(baseUrl: string, params: UTMParams): string {
  const required: (keyof UTMParams)[] = ['source', 'medium', 'campaign', 'content', 'term'];
  for (const key of required) {
    if (!params[key]) throw new Error(`UTM param missing or empty: utm_${key}`);
  }

  const qs = new URLSearchParams({
    utm_source: params.source,
    utm_medium: params.medium,
    utm_campaign: params.campaign,
    utm_content: params.content,
    utm_term: params.term,
  });

  const separator = baseUrl.includes('?') ? '&' : '?';
  const fullUrl = `${baseUrl}${separator}${qs.toString()}`;

  // Log alongside the creative asset that generated this URL
  const assetId = `utm-${params.campaign}-${params.source}-${Date.now()}`;
  const line = `"${assetId}","utm-link","utm","${params.campaign}","lifestyle-member","${today()}","","active","${params.content}","source:${params.source} hook:${params.term}"\n`;
  try {
    fs.appendFileSync(path.join(ROOT, 'performance', 'asset-log.csv'), line);
  } catch (err) {
    logError('generateUTM-log', err as Error);
  }

  return fullUrl;
}

/**
 * Extract all UTM parameters from a URL as a structured object.
 * Used when a GHL webhook fires with the lead source URL.
 * Returns empty strings for any missing parameters.
 */
export function parseUTM(url: string): UTMParams {
  const qIndex = url.indexOf('?');
  const searchStr = qIndex !== -1 ? url.slice(qIndex) : '';
  const params = new URLSearchParams(searchStr);

  return {
    source: params.get('utm_source') ?? '',
    medium: params.get('utm_medium') ?? '',
    campaign: params.get('utm_campaign') ?? '',
    content: params.get('utm_content') ?? '',
    term: params.get('utm_term') ?? '',
  };
}

/**
 * Generate a complete set of tagged URLs for one campaign across all four platforms.
 * Logs each URL to performance/channel-performance.csv.
 */
export function buildCampaignURLs(config: CampaignConfig): CampaignURLSet {
  const platforms: { key: keyof CampaignURLSet; source: string; medium: string }[] = [
    { key: 'facebook', source: 'facebook', medium: 'paid_social' },
    { key: 'instagram', source: 'instagram', medium: 'paid_social' },
    { key: 'google', source: 'google', medium: 'search' },
    { key: 'email', source: 'email', medium: 'email' },
  ];

  const urls: CampaignURLSet = {
    facebook: '',
    instagram: '',
    google: '',
    email: '',
  };

  for (const platform of platforms) {
    try {
      urls[platform.key] = generateUTM(config.baseUrl, {
        source: platform.source,
        medium: platform.medium,
        campaign: config.campaign,
        content: config.content,
        term: config.term,
      });
    } catch (err) {
      logError(`buildCampaignURLs-${platform.source}`, err as Error);
    }
  }

  // Log campaign entry to channel-performance.csv
  const week = today();
  for (const platform of platforms) {
    const line = `"${week}","${platform.source}","","","","","","","campaign:${config.campaign} hook:${config.term}"\n`;
    try {
      fs.appendFileSync(path.join(ROOT, 'performance', 'channel-performance.csv'), line);
    } catch (err) {
      logError('buildCampaignURLs-csv', err as Error);
    }
  }

  return urls;
}

// --- Main (--test mode) ---

function main(): void {
  const isTest = process.argv.includes('--test');

  if (!isTest) {
    console.log('UTM Attribution Engine');
    console.log('Usage: npx tsx engine/utm.ts --test');
    console.log('');
    console.log('Functions exported for use in other engine files:');
    console.log('  generateUTM(baseUrl, params)     → tagged URL string');
    console.log('  parseUTM(url)                    → UTMParams object');
    console.log('  buildCampaignURLs(config)        → CampaignURLSet (all 4 platforms)');
    return;
  }

  console.log('UTM Attribution Engine — Test Run');
  console.log('─'.repeat(60));

  // Test 1: buildCampaignURLs for the active offer
  const testConfig: CampaignConfig = {
    baseUrl: 'https://[YOUR-GHL-LANDING-PAGE-URL]',
    campaign: 'no-risk-comeback',
    content: 'ad-copy-20260423-B-WH6Y',
    term: 'hook-parent-child-moment',
  };

  console.log('\nCampaign: no-risk-comeback');
  console.log('Creative: ad-copy-20260423-B-WH6Y (Variant B — parent/child cold hook)');
  console.log('Hook ID:  hook-parent-child-moment\n');

  const urls = buildCampaignURLs(testConfig);
  console.log('Facebook:  ', urls.facebook);
  console.log('Instagram: ', urls.instagram);
  console.log('Google:    ', urls.google);
  console.log('Email:     ', urls.email);

  // Test 2: parseUTM round-trip
  console.log('\n' + '─'.repeat(60));
  console.log('Round-trip parse test:');
  const parsed = parseUTM(urls.facebook);
  console.log('  source:   ', parsed.source);
  console.log('  medium:   ', parsed.medium);
  console.log('  campaign: ', parsed.campaign);
  console.log('  content:  ', parsed.content);
  console.log('  term:     ', parsed.term);

  // Test 3: generateUTM with email override
  console.log('\n' + '─'.repeat(60));
  console.log('Single URL test (email, identity-reframe hook):');
  const emailUrl = generateUTM('[YOUR-GHL-LANDING-PAGE-URL]', {
    source: 'email',
    medium: 'email',
    campaign: 'no-risk-comeback',
    content: 'email-seq-day1',
    term: 'hook-identity-reframe',
  });
  console.log(' ', emailUrl);

  console.log('\n' + '─'.repeat(60));
  console.log('✓ All URLs logged to performance/asset-log.csv');
  console.log('✓ Channel performance entries logged to performance/channel-performance.csv');
  console.log('\nBefore launch: replace [YOUR-GHL-LANDING-PAGE-URL] with the real GHL page URL.');
}

main();
