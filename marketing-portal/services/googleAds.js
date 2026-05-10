'use strict';

const path = require('path');
const fs = require('fs');

class GoogleAdsService {
  _getCredentials(locationId) {
    const K = locationId.toUpperCase();
    const customerId    = process.env[`GOOGLE_ADS_CUSTOMER_ID_${K}`];
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const clientId      = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret  = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken  = process.env[`GOOGLE_ADS_REFRESH_TOKEN_${K}`];

    if (!customerId || !developerToken || !clientId || !clientSecret || !refreshToken) {
      const missing = [
        !customerId     && `GOOGLE_ADS_CUSTOMER_ID_${K}`,
        !developerToken && 'GOOGLE_ADS_DEVELOPER_TOKEN',
        !clientId       && 'GOOGLE_ADS_CLIENT_ID',
        !clientSecret   && 'GOOGLE_ADS_CLIENT_SECRET',
        !refreshToken   && `GOOGLE_ADS_REFRESH_TOKEN_${K}`,
      ].filter(Boolean);
      throw new Error(`Google Ads credentials missing for location "${locationId}": ${missing.join(', ')}`);
    }

    return { customerId, developerToken, clientId, clientSecret, refreshToken, managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID || null };
  }

  _getCustomer(creds) {
    const { GoogleAdsApi } = require('google-ads-api');
    console.log('[GADS CLIENT CONFIG]', {
      client_id: creds.clientId ? 'set' : 'missing',
      client_secret: creds.clientSecret ? 'set' : 'missing',
      developer_token: creds.developerToken ? 'set' : 'missing',
      customer_id: creds.customerId.replace(/-/g, ''),
      login_customer_id: creds.managerCustomerId,
      refresh_token_prefix: creds.refreshToken ? creds.refreshToken.substring(0, 10) : 'missing'
    });
    const client = new GoogleAdsApi({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      developer_token: creds.developerToken,
    });
    return client.Customer({
      customer_id: creds.customerId.replace(/-/g, ''),
      refresh_token: creds.refreshToken,
      login_customer_id: creds.managerCustomerId,
    });
  }

  async testConnection(locationId) {
    try {
      const creds = this._getCredentials(locationId);
      console.log('[GADS CREDS CHECK]', {
        customerId: creds.customerId,
        managerCustomerId: creds.managerCustomerId,
        hasDeveloperToken: !!creds.developerToken,
        hasRefreshToken: !!creds.refreshToken
      });
      const customer = this._getCustomer(creds);
      const result = await customer.query(
        'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1'
      );
      const row = result[0];
      return {
        connected: true,
        customerId: creds.customerId,
        accountName: row?.customer?.descriptive_name || 'Unknown',
      };
    } catch (err) {
      console.error(`[GoogleAds] testConnection error (${locationId}):`, err.message);
      console.error('[GADS TEST ERROR]', err);
      throw err;
    }
  }

  async getCampaigns(locationId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const rows = await customer.query(`
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign_budget.amount_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_micros
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY metrics.cost_micros DESC
      `);
      return rows.map(row => ({
        id: String(row.campaign.id),
        name: row.campaign.name,
        status: row.campaign.status,
        channel_type: row.campaign.advertising_channel_type,
        daily_budget: (row.campaign_budget?.amount_micros || 0) / 1e6,
        impressions: row.metrics?.impressions || 0,
        clicks: row.metrics?.clicks || 0,
        ctr: Math.round((row.metrics?.ctr || 0) * 10000) / 100,
        avg_cpc: (row.metrics?.average_cpc || 0) / 1e6,
        conversions: row.metrics?.conversions || 0,
        spend: (row.metrics?.cost_micros || 0) / 1e6,
      }));
    } catch (err) {
      console.error(`[GoogleAds] getCampaigns error (${locationId}):`, err.message);
      throw err;
    }
  }

  async getAdGroups(locationId, campaignId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const rows = await customer.query(`
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group.type,
          metrics.impressions,
          metrics.clicks,
          metrics.conversions,
          metrics.cost_micros
        FROM ad_group
        WHERE campaign.id = ${campaignId}
          AND ad_group.status != 'REMOVED'
      `);
      return rows.map(row => ({
        id: String(row.ad_group.id),
        name: row.ad_group.name,
        status: row.ad_group.status,
        type: row.ad_group.type,
        impressions: row.metrics?.impressions || 0,
        clicks: row.metrics?.clicks || 0,
        conversions: row.metrics?.conversions || 0,
        spend: (row.metrics?.cost_micros || 0) / 1e6,
      }));
    } catch (err) {
      console.error(`[GoogleAds] getAdGroups error (${locationId}):`, err.message);
      throw err;
    }
  }

  async getKeywords(locationId, campaignId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const filter = campaignId
        ? `WHERE campaign.id = ${campaignId} AND ad_group_criterion.status != 'REMOVED'`
        : `WHERE ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`;
      const rows = await customer.query(`
        SELECT
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group_criterion.quality_info.quality_score,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.cost_micros
        FROM keyword_view
        ${filter}
      `);
      return rows.map(row => ({
        keyword: row.ad_group_criterion?.keyword?.text || '',
        match_type: row.ad_group_criterion?.keyword?.match_type || '',
        quality_score: row.ad_group_criterion?.quality_info?.quality_score || null,
        impressions: row.metrics?.impressions || 0,
        clicks: row.metrics?.clicks || 0,
        ctr: Math.round((row.metrics?.ctr || 0) * 10000) / 100,
        avg_cpc: (row.metrics?.average_cpc || 0) / 1e6,
        conversions: row.metrics?.conversions || 0,
        spend: (row.metrics?.cost_micros || 0) / 1e6,
      }));
    } catch (err) {
      console.error(`[GoogleAds] getKeywords error (${locationId}):`, err.message);
      throw err;
    }
  }

  async getSearchTerms(locationId, campaignId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const filter = campaignId
        ? `WHERE campaign.id = ${campaignId} ORDER BY metrics.clicks DESC LIMIT 100`
        : `ORDER BY metrics.clicks DESC LIMIT 100`;
      const rows = await customer.query(`
        SELECT
          search_term_view.search_term,
          metrics.clicks,
          metrics.conversions,
          metrics.cost_micros
        FROM search_term_view
        ${filter}
      `);
      return rows.map(row => ({
        term: row.search_term_view?.search_term || '',
        clicks: row.metrics?.clicks || 0,
        conversions: row.metrics?.conversions || 0,
        cpl: (row.metrics?.conversions > 0)
          ? Math.round(((row.metrics?.cost_micros || 0) / 1e6) / row.metrics.conversions * 100) / 100
          : null,
      }));
    } catch (err) {
      console.error(`[GoogleAds] getSearchTerms error (${locationId}):`, err.message);
      throw err;
    }
  }

  async createCampaign(locationId, campaignConfig) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const { name, campaignType, dailyBudget } = campaignConfig;

      const budgetResult = await customer.campaignBudgets.create([{
        name: `${name} Budget`,
        amount_micros: Math.round(dailyBudget * 1e6),
        delivery_method: 2, // STANDARD
      }]);
      const budgetResourceName = budgetResult.results[0].resource_name;

      const channelMap = {
        non_branded_search: 2, // SEARCH
        branded_search:     2, // SEARCH
        remarketing_display: 3, // DISPLAY
      };

      const campaignResult = await customer.campaigns.create([{
        name,
        status: 3, // PAUSED
        advertising_channel_type: channelMap[campaignType] || 2,
        campaign_budget: budgetResourceName,
        manual_cpc: { enhanced_cpc_enabled: true },
      }]);

      return {
        campaign_id: campaignResult.results[0].resource_name,
        name,
        status: 'PAUSED',
      };
    } catch (err) {
      console.error(`[GoogleAds] createCampaign error (${locationId}):`, err.message);
      throw err;
    }
  }

  async createAdGroup(locationId, adGroupConfig) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const customerId = creds.customerId.replace(/-/g, '');
      const { campaignId, name } = adGroupConfig;

      const result = await customer.adGroups.create([{
        name,
        status: 3, // PAUSED
        campaign: `customers/${customerId}/campaigns/${campaignId}`,
        type: 2, // SEARCH_STANDARD
      }]);

      return { ad_group_id: result.results[0].resource_name, name };
    } catch (err) {
      console.error(`[GoogleAds] createAdGroup error (${locationId}):`, err.message);
      throw err;
    }
  }

  async addKeywords(locationId, adGroupId, keywords) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const customerId = creds.customerId.replace(/-/g, '');
      const matchTypeMap = { exact: 4, phrase: 3, broad: 2 };

      const criteria = keywords.map(k => ({
        ad_group: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 2, // ENABLED
        keyword: {
          text: typeof k === 'string' ? k : k.text,
          match_type: matchTypeMap[(k.match_type || 'phrase').toLowerCase()] || 3,
        },
      }));

      await customer.adGroupCriteria.create(criteria);
      return { added: keywords.length };
    } catch (err) {
      console.error(`[GoogleAds] addKeywords error (${locationId}):`, err.message);
      throw err;
    }
  }

  async addNegatives(locationId, campaignId, negatives) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const customerId = creds.customerId.replace(/-/g, '');

      const criteria = negatives.map(n => ({
        campaign: `customers/${customerId}/campaigns/${campaignId}`,
        negative: true,
        keyword: {
          text: typeof n === 'string' ? n : n.text,
          match_type: 3, // PHRASE
        },
      }));

      await customer.campaignCriteria.create(criteria);
      return { added: negatives.length };
    } catch (err) {
      console.error(`[GoogleAds] addNegatives error (${locationId}):`, err.message);
      throw err;
    }
  }

  async createRSA(locationId, adGroupId, rsaConfig) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const customerId = creds.customerId.replace(/-/g, '');
      const { headlines, descriptions, displayUrlPath1, displayUrlPath2, pinnedHeadlines } = rsaConfig;

      const headlineAssets = headlines.map((text, i) => {
        const asset = { text };
        if (pinnedHeadlines && pinnedHeadlines[i]) asset.pinned_field = pinnedHeadlines[i];
        return asset;
      });

      const result = await customer.adGroupAds.create([{
        ad_group: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 3, // PAUSED
        ad: {
          responsive_search_ad: {
            headlines: headlineAssets,
            descriptions: descriptions.map(text => ({ text })),
            path1: displayUrlPath1 || '',
            path2: displayUrlPath2 || '',
          },
        },
      }]);

      return { rsa_id: result.results[0].resource_name, ad_strength: 'PENDING' };
    } catch (err) {
      console.error(`[GoogleAds] createRSA error (${locationId}):`, err.message);
      throw err;
    }
  }

  async syncPerformance(locationId) {
    try {
      const [campaigns, keywords] = await Promise.all([
        this.getCampaigns(locationId),
        this.getKeywords(locationId, null),
      ]);

      const totalSpend       = campaigns.reduce((s, c) => s + c.spend, 0);
      const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
      const totalClicks      = campaigns.reduce((s, c) => s + c.clicks, 0);
      const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

      const data = {
        synced_at: new Date().toISOString(),
        _is_placeholder: false,
        summary: {
          spend:        Math.round(totalSpend * 100) / 100,
          impressions:  totalImpressions,
          clicks:       totalClicks,
          ctr:          totalClicks > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
          avg_cpc:      totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
          conversions:  totalConversions,
          cpl:          totalConversions > 0 ? Math.round((totalSpend / totalConversions) * 100) / 100 : 0,
        },
        campaigns,
        keywords,
      };

      const dir = path.join(__dirname, '..', 'intelligence-db', locationId, 'paid');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'google-performance.json'), JSON.stringify(data, null, 2));

      return data;
    } catch (err) {
      console.error(`[GoogleAds] syncPerformance error (${locationId}):`, err.message);
      throw err;
    }
  }

  async getQualityScores(locationId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const rows = await customer.query(`
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group_criterion.keyword.text,
          ad_group_criterion.quality_info.quality_score,
          ad_group_criterion.quality_info.creative_quality_score,
          ad_group_criterion.quality_info.post_click_quality_score,
          ad_group_criterion.quality_info.search_predicted_ctr
        FROM keyword_view
        WHERE ad_group_criterion.status != 'REMOVED'
          AND ad_group_criterion.quality_info.quality_score IS NOT NULL
        ORDER BY ad_group.id
      `);

      const groups = {};
      for (const row of rows) {
        const agId = String(row.ad_group?.id || 'unknown');
        if (!groups[agId]) groups[agId] = { id: agId, name: row.ad_group?.name || '', keywords: [] };
        groups[agId].keywords.push({
          keyword:         row.ad_group_criterion?.keyword?.text || '',
          quality_score:   row.ad_group_criterion?.quality_info?.quality_score || null,
          creative_quality: row.ad_group_criterion?.quality_info?.creative_quality_score || null,
          post_click_quality: row.ad_group_criterion?.quality_info?.post_click_quality_score || null,
          expected_ctr:    row.ad_group_criterion?.quality_info?.search_predicted_ctr || null,
        });
      }

      const adGroups = Object.values(groups).map(g => {
        const scores = g.keywords.map(k => k.quality_score).filter(Boolean);
        return {
          ...g,
          avg_qs: scores.length > 0
            ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10
            : null,
        };
      });

      const allScores = adGroups.flatMap(g => g.keywords.map(k => k.quality_score)).filter(Boolean);
      const overallAvg = allScores.length > 0
        ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length * 10) / 10
        : null;

      return { ad_groups: adGroups, overall_avg: overallAvg };
    } catch (err) {
      console.error(`[GoogleAds] getQualityScores error (${locationId}):`, err.message);
      throw err;
    }
  }

  async getConversionStatus(locationId) {
    try {
      const creds = this._getCredentials(locationId);
      const customer = this._getCustomer(creds);
      const rows = await customer.query(`
        SELECT
          conversion_action.id,
          conversion_action.name,
          conversion_action.status,
          conversion_action.type
        FROM conversion_action
        WHERE conversion_action.status = 'ENABLED'
        LIMIT 20
      `);
      return {
        conversion_actions: rows.map(r => ({
          id:     r.conversion_action?.id,
          name:   r.conversion_action?.name,
          status: r.conversion_action?.status,
          type:   r.conversion_action?.type,
        })),
        has_active_conversions: rows.length > 0,
      };
    } catch (err) {
      console.error(`[GoogleAds] getConversionStatus error (${locationId}):`, err.message);
      throw err;
    }
  }
}

module.exports = new GoogleAdsService();
