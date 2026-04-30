module.exports = {
  locations: {
    bloomington: {
      id: "bloomington",
      name: "Anytime Fitness Bloomington",
      city: "Bloomington",
      state: "IN",
      zip: "47401",
      gymName: "Anytime Fitness Bloomington",
      address: process.env.GYM_ADDRESS_BLOOMINGTON,
      phone: process.env.GYM_PHONE_BLOOMINGTON,
      managerName: process.env.MANAGER_NAME_BLOOMINGTON,
      reviewCount: process.env.REVIEW_COUNT_BLOOMINGTON,
      reviewRating: process.env.REVIEW_RATING_BLOOMINGTON,
      cohortStartDate: process.env.COHORT_START_DATE_BLOOMINGTON,
      spotsRemaining: process.env.SPOTS_REMAINING_BLOOMINGTON,
      specialPromo: process.env.SPECIAL_PROMO_BLOOMINGTON,
      hoursOfOperation: process.env.HOURS_OF_OPERATION_BLOOMINGTON,
      offer: {
        name: "30-Day Kickstart",
        price: "$1",
        duration: "30 days",
        description: "30 days of coached fitness for $1",
      },
      ghl: {
        apiKey: process.env.GHL_BLOOMINGTON_API_KEY,
        locationId: process.env.GHL_BLOOMINGTON_LOCATION_ID,
      },
      meta: {
        adAccountId: process.env.META_AD_ACCOUNT_ID_BLOOMINGTON,
        pageId: process.env.META_PAGE_ID_BLOOMINGTON,
        pixelId: process.env.META_PIXEL_ID_BLOOMINGTON,
        accessToken: process.env.META_ACCESS_TOKEN_BLOOMINGTON,
        geoKey: '2418779', // Meta internal geo key for Bloomington, IN
        geoRegion: 'Indiana',
        geoCountry: 'US',
      },
      drive: {
        rawFolderId: process.env.GOOGLE_DRIVE_RAW_FOLDER_ID_BLOOMINGTON,
      },
      keys: {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY_BLOOMINGTON,
        elevenLabsApiKey: process.env.ELEVENLABS_API_KEY_BLOOMINGTON,
        elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID_BLOOMINGTON,
        falAiKey: process.env.FAL_AI_KEY_BLOOMINGTON,
        manusApiKey: process.env.MANUS_API_KEY_BLOOMINGTON,
        googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY_BLOOMINGTON,
      },
      alertEmail: process.env.ALERT_EMAIL_BLOOMINGTON,
      franchiseUrl: "https://www.anytimefitness.com/locations/bloomington-indiana-2822/",
      webhookPath: "/api/webhooks/ghl/bloomington",
      landingPagePath: "/?location=bloomington",
      active: true,
    },
    eaton: {
      id: "eaton",
      name: "Anytime Fitness Eaton",
      city: "Eaton",
      state: "OH",
      zip: "45320",
      gymName: "Anytime Fitness Eaton",
      address: process.env.GYM_ADDRESS_EATON,
      phone: process.env.GYM_PHONE_EATON,
      managerName: process.env.MANAGER_NAME_EATON,
      reviewCount: process.env.REVIEW_COUNT_EATON,
      reviewRating: process.env.REVIEW_RATING_EATON,
      cohortStartDate: process.env.COHORT_START_DATE_EATON,
      spotsRemaining: process.env.SPOTS_REMAINING_EATON,
      specialPromo: process.env.SPECIAL_PROMO_EATON,
      hoursOfOperation: process.env.HOURS_OF_OPERATION_EATON,
      offer: {
        name: "30-Day Kickstart",
        price: "$1",
        duration: "30 days",
        description: "30 days of coached fitness for $1",
      },
      ghl: {
        apiKey: process.env.GHL_EATON_API_KEY,
        locationId: process.env.GHL_EATON_LOCATION_ID,
      },
      meta: {
        adAccountId: process.env.META_AD_ACCOUNT_ID_EATON,
        pageId: process.env.META_PAGE_ID_EATON,
        pixelId: process.env.META_PIXEL_ID_EATON,
        accessToken: process.env.META_ACCESS_TOKEN_EATON,
        geoKey: process.env.META_GEO_KEY_EATON, // TODO: Kai — find via Meta Geo API or Ads Manager location search
        geoRegion: 'Ohio',
        geoCountry: 'US',
      },
      drive: {
        rawFolderId: process.env.GOOGLE_DRIVE_RAW_FOLDER_ID_EATON,
      },
      keys: {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY_EATON,
        elevenLabsApiKey: process.env.ELEVENLABS_API_KEY_EATON,
        elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID_EATON,
        falAiKey: process.env.FAL_AI_KEY_EATON,
        manusApiKey: process.env.MANUS_API_KEY_EATON,
        googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY_EATON,
      },
      alertEmail: process.env.ALERT_EMAIL_EATON,
      franchiseUrl: null,
      webhookPath: "/api/webhooks/ghl/eaton",
      landingPagePath: "/?location=eaton",
      active: false,
    },
  },
  getLocation(id) {
    return this.locations[id] || null;
  },
  getActiveLocations() {
    return Object.values(this.locations).filter(l => l.active);
  },
  getAllLocations() {
    return Object.values(this.locations);
  },
};
