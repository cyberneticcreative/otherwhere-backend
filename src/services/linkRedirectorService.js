const { v4: uuidv4 } = require('uuid');
const { buildLinkBundle, validateLink } = require('../lib/links');

/**
 * Link Redirector Service
 *
 * Manages link bundles with tokens for smart redirection
 */

class LinkRedirectorService {
  constructor() {
    // In-memory storage for link bundles
    // Key: token, Value: { bundle, timestamp, trip, userCountry }
    this.bundles = new Map();

    // Cleanup old bundles every hour
    this.BUNDLE_TTL = 24 * 60 * 60 * 1000; // 24 hours
    setInterval(() => this.cleanupOldBundles(), 60 * 60 * 1000);
  }

  /**
   * Create a link bundle and return a token
   * @param {Object} trip - Trip data
   * @param {string} userCountry - "US" or "CA"
   * @returns {Promise<{token: string, bundle: Object}>}
   */
  async createBundle(trip, userCountry = 'US') {
    const token = uuidv4().split('-')[0]; // Use first segment for shorter URL

    console.log(`[LinkRedirector] Creating bundle with token: ${token}`);

    const bundle = await buildLinkBundle(trip, userCountry);

    this.bundles.set(token, {
      bundle,
      trip,
      userCountry,
      timestamp: Date.now(),
      clicks: 0
    });

    return { token, bundle };
  }

  /**
   * Get the best available link for a token
   * @param {string} token - Bundle token
   * @returns {Promise<{url: string, provider: string, wasRevalidated: boolean}>}
   */
  async resolveLink(token) {
    const entry = this.bundles.get(token);

    if (!entry) {
      throw new Error('Link token not found or expired');
    }

    entry.clicks++;
    const { bundle, trip, userCountry } = entry;

    console.log(`[LinkRedirector] Resolving token ${token} (click #${entry.clicks})`);

    // Try primary link first
    if (bundle.primary.health === 'healthy') {
      console.log(`[LinkRedirector] Using cached primary: ${bundle.primary.provider}`);
      return {
        url: bundle.primary.url,
        provider: bundle.primary.provider,
        wasRevalidated: false
      };
    }

    // Primary is unknown or unhealthy, revalidate all candidates
    console.log(`[LinkRedirector] Primary not healthy, revalidating candidates...`);

    for (const candidate of bundle.candidates) {
      const validation = await validateLink(candidate.url);
      candidate.health = validation.health;
      candidate.details = validation.details;

      if (validation.health === 'healthy') {
        console.log(`[LinkRedirector] ✅ Found healthy link: ${candidate.provider}`);

        // Update primary
        bundle.primary = candidate;

        return {
          url: candidate.url,
          provider: candidate.provider,
          wasRevalidated: true
        };
      }
    }

    // If all failed, return first candidate (usually Kayak)
    console.log(`[LinkRedirector] ⚠️ All links unhealthy, returning first candidate`);
    return {
      url: bundle.candidates[0].url,
      provider: bundle.candidates[0].provider,
      wasRevalidated: true,
      allFailed: true
    };
  }

  /**
   * Get bundle info for a token (without resolving)
   */
  getBundleInfo(token) {
    const entry = this.bundles.get(token);
    if (!entry) return null;

    return {
      token,
      primary: entry.bundle.primary,
      candidateCount: entry.bundle.candidates.length,
      clicks: entry.clicks,
      age: Date.now() - entry.timestamp,
      trip: entry.trip
    };
  }

  /**
   * Cleanup old bundles
   */
  cleanupOldBundles() {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, entry] of this.bundles.entries()) {
      if ((now - entry.timestamp) > this.BUNDLE_TTL) {
        this.bundles.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[LinkRedirector] Cleaned up ${cleaned} old bundles`);
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    const bundles = Array.from(this.bundles.values());

    return {
      totalBundles: this.bundles.size,
      totalClicks: bundles.reduce((sum, b) => sum + b.clicks, 0),
      providerDistribution: this.getProviderDistribution(bundles),
      oldestBundle: bundles.length > 0
        ? Math.max(...bundles.map(b => Date.now() - b.timestamp))
        : 0
    };
  }

  /**
   * Get provider distribution for analytics
   */
  getProviderDistribution(bundles) {
    const dist = {};

    for (const bundle of bundles) {
      const provider = bundle.bundle.primary.provider;
      dist[provider] = (dist[provider] || 0) + 1;
    }

    return dist;
  }
}

module.exports = new LinkRedirectorService();
