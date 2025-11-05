const axios = require('axios');

/**
 * Currency Conversion Service
 *
 * Converts USD flight prices to local currencies based on origin airport
 * Uses exchangerate-api.com (free tier: 1500 requests/month)
 */
class CurrencyService {
  constructor() {
    // Free exchange rate API (no key required for basic usage)
    this.API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

    // Cache exchange rates (refresh every 24 hours)
    this.ratesCache = null;
    this.cacheTimestamp = 0;
    this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    // Map of airport codes to their currencies
    this.airportToCurrency = {
      // North America
      'YYZ': 'CAD', 'YVR': 'CAD', 'YUL': 'CAD', 'YYC': 'CAD', 'YOW': 'CAD', // Canada
      'LAX': 'USD', 'JFK': 'USD', 'SFO': 'USD', 'ORD': 'USD', 'MIA': 'USD', // USA
      'ATL': 'USD', 'DEN': 'USD', 'SEA': 'USD', 'BOS': 'USD', 'LAS': 'USD',
      'DFW': 'USD', 'IAH': 'USD', 'PHX': 'USD', 'MCO': 'USD', 'EWR': 'USD',
      'MEX': 'MXN', 'CUN': 'MXN', 'GDL': 'MXN', // Mexico

      // Europe
      'LHR': 'GBP', 'LGW': 'GBP', 'MAN': 'GBP', 'EDI': 'GBP', // UK
      'CDG': 'EUR', 'ORY': 'EUR', // France
      'FRA': 'EUR', 'MUC': 'EUR', 'BER': 'EUR', // Germany
      'AMS': 'EUR', // Netherlands
      'MAD': 'EUR', 'BCN': 'EUR', // Spain
      'FCO': 'EUR', 'MXP': 'EUR', 'VCE': 'EUR', // Italy
      'DUB': 'EUR', // Ireland
      'BRU': 'EUR', // Belgium
      'VIE': 'EUR', // Austria
      'LIS': 'EUR', 'OPO': 'EUR', // Portugal
      'ARN': 'SEK', 'CPH': 'DKK', 'OSL': 'NOK', // Scandinavia
      'ZRH': 'CHF', 'GVA': 'CHF', // Switzerland
      'IST': 'TRY', // Turkey
      'WAW': 'PLN', 'KRK': 'PLN', // Poland
      'PRG': 'CZK', // Czech Republic

      // Asia
      'NRT': 'JPY', 'HND': 'JPY', 'KIX': 'JPY', // Japan
      'ICN': 'KRW', // South Korea
      'PEK': 'CNY', 'PVG': 'CNY', 'CAN': 'CNY', // China
      'HKG': 'HKD', // Hong Kong
      'SIN': 'SGD', // Singapore
      'BKK': 'THB', 'DMK': 'THB', // Thailand
      'DEL': 'INR', 'BOM': 'INR', 'BLR': 'INR', // India

      // Oceania
      'SYD': 'AUD', 'MEL': 'AUD', 'BNE': 'AUD', 'PER': 'AUD', // Australia
      'AKL': 'NZD', 'WLG': 'NZD', // New Zealand

      // Middle East
      'DXB': 'AED', 'AUH': 'AED', // UAE
      'DOH': 'QAR', // Qatar
      'TLV': 'ILS', // Israel

      // South America
      'GRU': 'BRL', 'GIG': 'BRL', // Brazil
      'EZE': 'ARS', 'AEP': 'ARS', // Argentina
      'SCL': 'CLP', // Chile
      'BOG': 'COP', // Colombia
      'LIM': 'PEN', // Peru

      // Africa
      'JNB': 'ZAR', 'CPT': 'ZAR', // South Africa
      'CAI': 'EGP', // Egypt
    };

    // Currency symbols
    this.currencySymbols = {
      'USD': '$', 'CAD': 'CA$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
      'AUD': 'A$', 'NZD': 'NZ$', 'CHF': 'CHF', 'SEK': 'kr', 'NOK': 'kr',
      'DKK': 'kr', 'CNY': '¥', 'INR': '₹', 'KRW': '₩', 'SGD': 'S$',
      'HKD': 'HK$', 'MXN': 'MX$', 'BRL': 'R$', 'ZAR': 'R', 'TRY': '₺',
      'AED': 'AED', 'QAR': 'QAR', 'ILS': '₪', 'THB': '฿', 'PLN': 'zł',
      'CZK': 'Kč', 'ARS': 'AR$', 'CLP': 'CL$', 'COP': 'CO$', 'PEN': 'S/',
      'EGP': 'E£'
    };
  }

  /**
   * Get currency code for an airport
   * @param {string} airportCode - IATA airport code (e.g., "YYZ")
   * @returns {string} Currency code (e.g., "CAD") or "USD" if unknown
   */
  getCurrencyForAirport(airportCode) {
    return this.airportToCurrency[airportCode] || 'USD';
  }

  /**
   * Get currency symbol
   * @param {string} currencyCode - Currency code (e.g., "CAD")
   * @returns {string} Currency symbol (e.g., "CA$")
   */
  getCurrencySymbol(currencyCode) {
    return this.currencySymbols[currencyCode] || currencyCode;
  }

  /**
   * Fetch latest exchange rates from API
   * @returns {Promise<Object>} Exchange rates object
   */
  async fetchExchangeRates() {
    const now = Date.now();

    // Return cached rates if still valid
    if (this.ratesCache && (now - this.cacheTimestamp < this.CACHE_TTL)) {
      console.log('[Currency] Using cached exchange rates');
      return this.ratesCache;
    }

    try {
      console.log('[Currency] Fetching fresh exchange rates...');
      const response = await axios.get(this.API_URL, { timeout: 5000 });

      this.ratesCache = response.data.rates;
      this.cacheTimestamp = now;

      console.log(`[Currency] Fetched rates for ${Object.keys(this.ratesCache).length} currencies`);
      return this.ratesCache;

    } catch (error) {
      console.error('[Currency] Error fetching exchange rates:', error.message);

      // Return cached rates even if expired, or default to 1:1
      if (this.ratesCache) {
        console.log('[Currency] Using expired cached rates as fallback');
        return this.ratesCache;
      }

      // Ultimate fallback: return 1:1 rates
      return { USD: 1, CAD: 1.35, EUR: 0.92, GBP: 0.79 };
    }
  }

  /**
   * Convert USD price to local currency
   * @param {number} usdPrice - Price in USD
   * @param {string} targetCurrency - Target currency code (e.g., "CAD")
   * @returns {Promise<Object>} {amount, currency, symbol, formatted}
   */
  async convertFromUSD(usdPrice, targetCurrency) {
    // If target is USD, no conversion needed
    if (targetCurrency === 'USD') {
      return {
        amount: usdPrice,
        currency: 'USD',
        symbol: '$',
        formatted: `$${usdPrice}`
      };
    }

    try {
      const rates = await this.fetchExchangeRates();
      const rate = rates[targetCurrency];

      if (!rate) {
        console.warn(`[Currency] No rate found for ${targetCurrency}, using USD`);
        return {
          amount: usdPrice,
          currency: 'USD',
          symbol: '$',
          formatted: `$${usdPrice}`
        };
      }

      const convertedAmount = Math.round(usdPrice * rate);
      const symbol = this.getCurrencySymbol(targetCurrency);

      return {
        amount: convertedAmount,
        currency: targetCurrency,
        symbol: symbol,
        formatted: `${symbol}${convertedAmount}`,
        usdAmount: usdPrice,
        exchangeRate: rate
      };

    } catch (error) {
      console.error('[Currency] Conversion error:', error.message);
      // Fallback to USD
      return {
        amount: usdPrice,
        currency: 'USD',
        symbol: '$',
        formatted: `$${usdPrice}`
      };
    }
  }

  /**
   * Convert flight prices to local currency based on origin airport
   * @param {Array} flights - Array of flight objects with price in USD
   * @param {string} originAirport - Origin airport code
   * @returns {Promise<Array>} Flights with converted prices
   */
  async convertFlightPrices(flights, originAirport) {
    const targetCurrency = this.getCurrencyForAirport(originAirport);

    console.log(`[Currency] Converting prices from USD to ${targetCurrency} for origin ${originAirport}`);

    // If already USD, no conversion needed
    if (targetCurrency === 'USD') {
      return flights.map(flight => ({
        ...flight,
        displayPrice: `$${flight.price}`,
        currency: 'USD'
      }));
    }

    // Convert all prices
    const convertedFlights = await Promise.all(
      flights.map(async (flight) => {
        const converted = await this.convertFromUSD(flight.price, targetCurrency);
        return {
          ...flight,
          displayPrice: converted.formatted,
          currency: targetCurrency,
          originalPrice: flight.price,
          originalCurrency: 'USD',
          exchangeRate: converted.exchangeRate
        };
      })
    );

    return convertedFlights;
  }
}

module.exports = new CurrencyService();
