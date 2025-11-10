/**
 * White-Label Health Check Service
 *
 * Monitors the Aviasales white-label host availability and performance.
 * Tracks rolling metrics to determine when to use fallback providers.
 */

const axios = require('axios');

const AVIASALES_WL_HOST = process.env.AVIASALES_WL_HOST || 'book.otherwhere.world';
const CHECK_INTERVAL = 15000; // 15 seconds
const HEALTH_TIMEOUT = 5000;  // 5 second timeout for health checks
const FAILURE_THRESHOLD = 3;  // Consecutive failures before marking unhealthy
const SLOW_THRESHOLD = 3000;  // p95 TTFB threshold (3s)

class WhiteLabelHealthCheck {
  constructor() {
    this.isHealthy = true;
    this.lastCheckTime = null;
    this.consecutiveFailures = 0;

    // Rolling metrics (last 60 seconds)
    this.metrics = [];
    this.maxMetricsAge = 60000; // 60 seconds

    // Stats
    this.totalChecks = 0;
    this.totalFailures = 0;

    // Don't start automatically - will be started by app.js
    this.intervalId = null;
  }

  /**
   * Start the health check interval
   */
  start() {
    if (this.intervalId) {
      console.log('[WL-Health] Health check already running');
      return;
    }

    console.log(`[WL-Health] Starting health checks for ${AVIASALES_WL_HOST}`);
    console.log(`[WL-Health] Check interval: ${CHECK_INTERVAL}ms, Timeout: ${HEALTH_TIMEOUT}ms`);

    // Run initial check immediately
    this.performCheck();

    // Then schedule regular checks
    this.intervalId = setInterval(() => {
      this.performCheck();
    }, CHECK_INTERVAL);
  }

  /**
   * Stop the health check interval
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[WL-Health] Health checks stopped');
    }
  }

  /**
   * Perform a single health check
   */
  async performCheck() {
    const startTime = Date.now();
    this.totalChecks++;

    try {
      // Check robots.txt (lightweight endpoint that should always respond)
      const response = await axios.get(`https://${AVIASALES_WL_HOST}/robots.txt`, {
        timeout: HEALTH_TIMEOUT,
        validateStatus: (status) => status < 500 // Accept 200-499
      });

      const latency = Date.now() - startTime;

      // Record successful check
      this.recordMetric({
        timestamp: Date.now(),
        success: true,
        latency
      });

      // Reset failure counter on success
      this.consecutiveFailures = 0;

      // Check if we were previously unhealthy
      if (!this.isHealthy) {
        console.log(`[WL-Health] ✅ White-label host recovered (latency: ${latency}ms)`);
        this.isHealthy = true;
      }

      this.lastCheckTime = Date.now();

    } catch (error) {
      const latency = Date.now() - startTime;

      // Record failed check
      this.recordMetric({
        timestamp: Date.now(),
        success: false,
        latency,
        error: error.message
      });

      this.consecutiveFailures++;
      this.totalFailures++;

      // Mark as unhealthy if we hit failure threshold
      if (this.consecutiveFailures >= FAILURE_THRESHOLD && this.isHealthy) {
        console.error(`[WL-Health] ⚠️ White-label host unhealthy (${this.consecutiveFailures} consecutive failures)`);
        console.error(`[WL-Health] Last error: ${error.message}`);
        this.isHealthy = false;
      }

      this.lastCheckTime = Date.now();
    }
  }

  /**
   * Record a metric and clean old ones
   */
  recordMetric(metric) {
    this.metrics.push(metric);

    // Clean metrics older than 60 seconds
    const cutoff = Date.now() - this.maxMetricsAge;
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get current health status
   * @returns {boolean} True if healthy
   */
  getHealthStatus() {
    // If we haven't checked yet, assume healthy
    if (this.metrics.length === 0) {
      return true;
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      return false;
    }

    // Check p95 latency
    const p95Latency = this.getP95Latency();
    if (p95Latency > SLOW_THRESHOLD) {
      return false;
    }

    return this.isHealthy;
  }

  /**
   * Get p95 latency from recent metrics
   * @returns {number} p95 latency in ms
   */
  getP95Latency() {
    const successfulMetrics = this.metrics
      .filter(m => m.success)
      .map(m => m.latency)
      .sort((a, b) => a - b);

    if (successfulMetrics.length === 0) {
      return SLOW_THRESHOLD + 1; // Return high value if no successful checks
    }

    const p95Index = Math.floor(successfulMetrics.length * 0.95);
    return successfulMetrics[p95Index] || successfulMetrics[successfulMetrics.length - 1];
  }

  /**
   * Get p50 (median) latency
   * @returns {number} p50 latency in ms
   */
  getP50Latency() {
    const successfulMetrics = this.metrics
      .filter(m => m.success)
      .map(m => m.latency)
      .sort((a, b) => a - b);

    if (successfulMetrics.length === 0) {
      return 0;
    }

    const p50Index = Math.floor(successfulMetrics.length * 0.50);
    return successfulMetrics[p50Index] || 0;
  }

  /**
   * Get rolling failure rate (last 60s)
   * @returns {number} Failure rate (0-1)
   */
  getFailureRate() {
    if (this.metrics.length === 0) {
      return 0;
    }

    const failures = this.metrics.filter(m => !m.success).length;
    return failures / this.metrics.length;
  }

  /**
   * Get comprehensive stats
   * @returns {Object} Health statistics
   */
  getStats() {
    const recentMetrics = this.metrics.slice(-20); // Last 20 checks
    const successfulChecks = recentMetrics.filter(m => m.success).length;

    return {
      isHealthy: this.getHealthStatus(),
      host: AVIASALES_WL_HOST,
      lastCheckTime: this.lastCheckTime,
      consecutiveFailures: this.consecutiveFailures,

      // Rolling metrics (60s window)
      rolling60s: {
        totalChecks: this.metrics.length,
        successRate: this.metrics.length > 0
          ? (this.metrics.filter(m => m.success).length / this.metrics.length)
          : 1,
        failureRate: this.getFailureRate(),
        p50Latency: this.getP50Latency(),
        p95Latency: this.getP95Latency()
      },

      // Recent history (last 20 checks)
      recent: {
        totalChecks: recentMetrics.length,
        successfulChecks,
        failedChecks: recentMetrics.length - successfulChecks
      },

      // Lifetime stats
      lifetime: {
        totalChecks: this.totalChecks,
        totalFailures: this.totalFailures,
        failureRate: this.totalChecks > 0 ? (this.totalFailures / this.totalChecks) : 0
      },

      // Thresholds
      thresholds: {
        failureThreshold: FAILURE_THRESHOLD,
        slowThreshold: SLOW_THRESHOLD,
        checkInterval: CHECK_INTERVAL
      }
    };
  }

  /**
   * Force a manual health check (useful for testing)
   * @returns {Promise<Object>} Check result
   */
  async manualCheck() {
    const startTime = Date.now();

    try {
      const response = await axios.get(`https://${AVIASALES_WL_HOST}/robots.txt`, {
        timeout: HEALTH_TIMEOUT,
        validateStatus: (status) => status < 500
      });

      const latency = Date.now() - startTime;

      return {
        success: true,
        latency,
        status: response.status,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        success: false,
        latency,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get reason for unhealthy status
   * @returns {string|null} Reason or null if healthy
   */
  getUnhealthyReason() {
    if (this.isHealthy) {
      return null;
    }

    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      return `consecutive_failures_${this.consecutiveFailures}`;
    }

    const p95 = this.getP95Latency();
    if (p95 > SLOW_THRESHOLD) {
      return `slow_response_p95_${p95}ms`;
    }

    return 'unknown';
  }
}

// Export singleton instance
module.exports = new WhiteLabelHealthCheck();
