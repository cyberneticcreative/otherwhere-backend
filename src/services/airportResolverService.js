/**
 * Airport Resolver Service
 * Converts city names to IATA airport codes for Duffel API
 */

class AirportResolverService {
  constructor() {
    // Common airport codes mapping (city name → IATA code)
    this.commonAirports = {
      // North America
      'toronto': [{ code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada' }],
      'vancouver': [{ code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada' }],
      'montreal': [{ code: 'YUL', name: 'Montreal-Pierre Elliott Trudeau International Airport', city: 'Montreal', country: 'Canada' }],
      'calgary': [{ code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', country: 'Canada' }],
      'ottawa': [{ code: 'YOW', name: 'Ottawa Macdonald-Cartier International Airport', city: 'Ottawa', country: 'Canada' }],
      'new york': [{ code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA' }, { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', country: 'USA' }],
      'nyc': [{ code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA' }],
      'los angeles': [{ code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA' }],
      'la': [{ code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA' }],
      'chicago': [{ code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'USA' }],
      'san francisco': [{ code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA' }],
      'sf': [{ code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', country: 'USA' }],
      'miami': [{ code: 'MIA', name: 'Miami International Airport', city: 'Miami', country: 'USA' }],
      'seattle': [{ code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'USA' }],
      'boston': [{ code: 'BOS', name: 'Logan International Airport', city: 'Boston', country: 'USA' }],
      'dallas': [{ code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'USA' }],
      'houston': [{ code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'USA' }],
      'denver': [{ code: 'DEN', name: 'Denver International Airport', city: 'Denver', country: 'USA' }],
      'atlanta': [{ code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'USA' }],
      'las vegas': [{ code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'USA' }],
      'vegas': [{ code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'USA' }],
      'orlando': [{ code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', country: 'USA' }],
      'phoenix': [{ code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'USA' }],
      'philadelphia': [{ code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', country: 'USA' }],
      'san diego': [{ code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', country: 'USA' }],
      'portland': [{ code: 'PDX', name: 'Portland International Airport', city: 'Portland', country: 'USA' }],
      'nashville': [{ code: 'BNA', name: 'Nashville International Airport', city: 'Nashville', country: 'USA' }],
      'austin': [{ code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', country: 'USA' }],
      'washington': [{ code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington', country: 'USA' }],
      'dc': [{ code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington DC', country: 'USA' }],

      // Europe
      'london': [{ code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'UK' }, { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'UK' }],
      'paris': [{ code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' }],
      'madrid': [{ code: 'MAD', name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country: 'Spain' }],
      'barcelona': [{ code: 'BCN', name: 'Barcelona-El Prat Airport', city: 'Barcelona', country: 'Spain' }],
      'rome': [{ code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country: 'Italy' }],
      'amsterdam': [{ code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands' }],
      'frankfurt': [{ code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany' }],
      'dublin': [{ code: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland' }],
      'berlin': [{ code: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany' }],
      'munich': [{ code: 'MUC', name: 'Munich Airport', city: 'Munich', country: 'Germany' }],
      'vienna': [{ code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', country: 'Austria' }],
      'zurich': [{ code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland' }],
      'brussels': [{ code: 'BRU', name: 'Brussels Airport', city: 'Brussels', country: 'Belgium' }],
      'lisbon': [{ code: 'LIS', name: 'Lisbon Portela Airport', city: 'Lisbon', country: 'Portugal' }],
      'copenhagen': [{ code: 'CPH', name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark' }],
      'stockholm': [{ code: 'ARN', name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden' }],
      'oslo': [{ code: 'OSL', name: 'Oslo Airport', city: 'Oslo', country: 'Norway' }],
      'helsinki': [{ code: 'HEL', name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'Finland' }],
      'reykjavik': [{ code: 'KEF', name: 'Keflavík International Airport', city: 'Reykjavik', country: 'Iceland' }],
      'athens': [{ code: 'ATH', name: 'Athens International Airport', city: 'Athens', country: 'Greece' }],
      'istanbul': [{ code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey' }],
      'prague': [{ code: 'PRG', name: 'Václav Havel Airport Prague', city: 'Prague', country: 'Czech Republic' }],
      'warsaw': [{ code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland' }],
      'bucharest': [{ code: 'OTP', name: 'Henri Coandă International Airport', city: 'Bucharest', country: 'Romania' }],
      'budapest': [{ code: 'BUD', name: 'Budapest Ferenc Liszt International Airport', city: 'Budapest', country: 'Hungary' }],
      'milan': [{ code: 'MXP', name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy' }],
      'venice': [{ code: 'VCE', name: 'Venice Marco Polo Airport', city: 'Venice', country: 'Italy' }],
      'edinburgh': [{ code: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', country: 'UK' }],
      'manchester': [{ code: 'MAN', name: 'Manchester Airport', city: 'Manchester', country: 'UK' }],

      // Asia & Oceania
      'tokyo': [{ code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan' }, { code: 'HND', name: 'Haneda Airport', city: 'Tokyo', country: 'Japan' }],
      'singapore': [{ code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore' }],
      'sydney': [{ code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia' }],
      'melbourne': [{ code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia' }],
      'brisbane': [{ code: 'BNE', name: 'Brisbane Airport', city: 'Brisbane', country: 'Australia' }],
      'auckland': [{ code: 'AKL', name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand' }],
      'dubai': [{ code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE' }],
      'bangkok': [{ code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand' }],
      'hong kong': [{ code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong' }],
      'seoul': [{ code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea' }],
      'beijing': [{ code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China' }],
      'shanghai': [{ code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China' }],
      'delhi': [{ code: 'DEL', name: 'Indira Gandhi International Airport', city: 'Delhi', country: 'India' }],
      'mumbai': [{ code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India' }],
      'kuala lumpur': [{ code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia' }],
      'jakarta': [{ code: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'Indonesia' }],
      'manila': [{ code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'Philippines' }],
      'taipei': [{ code: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'Taiwan' }],
      'bali': [{ code: 'DPS', name: 'Ngurah Rai International Airport', city: 'Denpasar', country: 'Indonesia' }],
      'phuket': [{ code: 'HKT', name: 'Phuket International Airport', city: 'Phuket', country: 'Thailand' }],

      // South America
      'mexico city': [{ code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', country: 'Mexico' }],
      'cancun': [{ code: 'CUN', name: 'Cancún International Airport', city: 'Cancun', country: 'Mexico' }],
      'sao paulo': [{ code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'Brazil' }],
      'rio de janeiro': [{ code: 'GIG', name: 'Rio de Janeiro/Galeão International Airport', city: 'Rio de Janeiro', country: 'Brazil' }],
      'rio': [{ code: 'GIG', name: 'Rio de Janeiro/Galeão International Airport', city: 'Rio de Janeiro', country: 'Brazil' }],
      'buenos aires': [{ code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina' }],
      'santiago': [{ code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'Chile' }],
      'bogota': [{ code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', country: 'Colombia' }],
      'lima': [{ code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', country: 'Peru' }],

      // Africa & Middle East
      'johannesburg': [{ code: 'JNB', name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa' }],
      'cape town': [{ code: 'CPT', name: 'Cape Town International Airport', city: 'Cape Town', country: 'South Africa' }],
      'cairo': [{ code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt' }],
      'doha': [{ code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar' }],
      'tel aviv': [{ code: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'Israel' }],
    };
  }

  /**
   * Resolve a city name or IATA code to an IATA code
   * @param {string} location - City name or IATA code
   * @returns {string} IATA code (3 letters)
   */
  resolveAirportCode(location) {
    if (!location) {
      throw new Error('Location is required');
    }

    const normalized = location.toLowerCase().trim();

    // FIRST: Check if it's in our commonAirports mapping (handles city names AND city codes like "NYC")
    const airports = this.commonAirports[normalized];

    if (airports && airports.length > 0) {
      // Return first airport code (primary airport for the city)
      const code = airports[0].code;
      console.log(`[AirportResolver] Resolved "${location}" → ${code}`);
      return code;
    }

    // SECOND: If not in mapping and it looks like a 3-letter IATA code, assume it's valid
    // This allows users to use actual IATA codes that aren't in our mapping
    if (/^[A-Z]{3}$/i.test(normalized)) {
      const code = normalized.toUpperCase();
      console.log(`[AirportResolver] Assuming "${location}" is a valid IATA code: ${code}`);
      return code;
    }

    // If not found, throw error
    throw new Error(`Could not resolve airport code for: ${location}. Please use a 3-letter IATA code (e.g., JFK, LAX) or a major city name.`);
  }

  /**
   * Get airport info for a location
   * @param {string} location - City name or IATA code
   * @returns {Object|null} Airport info or null if not found
   */
  getAirportInfo(location) {
    const normalized = location.toLowerCase().trim();
    const airports = this.commonAirports[normalized];

    if (airports && airports.length > 0) {
      return airports[0];
    }

    return null;
  }

  /**
   * Check if a location can be resolved
   * @param {string} location - City name or IATA code
   * @returns {boolean} True if resolvable
   */
  canResolve(location) {
    if (!location) return false;

    const normalized = location.toLowerCase().trim();

    // 3-letter IATA code
    if (/^[A-Z]{3}$/i.test(normalized)) {
      return true;
    }

    // In commonAirports mapping
    return !!this.commonAirports[normalized];
  }
}

// Export as singleton instance
module.exports = new AirportResolverService();
