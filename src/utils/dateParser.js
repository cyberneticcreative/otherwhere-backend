const dayjs = require('dayjs');

/**
 * Natural Language Date Parser
 *
 * Converts vague date expressions into concrete date ranges
 *
 * Examples:
 * - "March" → Mid-March for 7 nights
 * - "next month" → Mid-next-month for 7 nights
 * - "summer" → Mid-July for 7 nights
 * - "this weekend" → Upcoming Fri-Mon
 */

const DEFAULT_TRIP_LENGTH_DAYS = 7; // Default to 1 week trips

/**
 * Parse vague date input into concrete date range
 * @param {string} input - Natural language date input
 * @returns {Object|null} {checkIn, checkOut, confidence, matched} or null if can't parse
 */
function parseVagueDate(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const lowerInput = input.toLowerCase().trim();
  const now = dayjs();

  // Pattern: "March", "April", "December" - specific month name
  const monthNames = {
    'january': 0, 'jan': 0,
    'february': 1, 'feb': 1,
    'march': 2, 'mar': 2,
    'april': 3, 'apr': 3,
    'may': 4,
    'june': 5, 'jun': 5,
    'july': 6, 'jul': 6,
    'august': 7, 'aug': 7,
    'september': 8, 'sep': 8, 'sept': 8,
    'october': 9, 'oct': 9,
    'november': 10, 'nov': 10,
    'december': 11, 'dec': 11
  };

  for (const [monthName, monthNum] of Object.entries(monthNames)) {
    if (lowerInput.includes(monthName)) {
      // Determine year - if month has passed this year, use next year
      const currentMonth = now.month();
      let year = now.year();

      if (monthNum < currentMonth) {
        year += 1; // Month has passed, use next year
      }

      // Default to mid-month (15th)
      const checkIn = dayjs().year(year).month(monthNum).date(15).format('YYYY-MM-DD');
      const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

      return {
        checkIn,
        checkOut,
        confidence: 'high',
        matched: `${monthName} (mid-month)`
      };
    }
  }

  // Pattern: "next month"
  if (lowerInput.includes('next month')) {
    const checkIn = now.add(1, 'month').date(15).format('YYYY-MM-DD');
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');
    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'next month (mid-month)'
    };
  }

  // Pattern: "this month"
  if (lowerInput.includes('this month')) {
    const checkIn = now.date(15).format('YYYY-MM-DD');
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');
    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'this month (mid-month)'
    };
  }

  // Pattern: "this weekend", "next weekend"
  if (lowerInput.includes('weekend')) {
    let targetWeekend = now;

    if (lowerInput.includes('next')) {
      targetWeekend = now.add(1, 'week');
    }

    // Find upcoming Friday
    const daysUntilFriday = (5 - targetWeekend.day() + 7) % 7;
    const checkIn = targetWeekend.add(daysUntilFriday, 'day').format('YYYY-MM-DD');
    const checkOut = dayjs(checkIn).add(3, 'day').format('YYYY-MM-DD'); // Fri-Mon

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: lowerInput.includes('next') ? 'next weekend' : 'this weekend'
    };
  }

  // Pattern: "summer"
  if (lowerInput.includes('summer')) {
    let year = now.year();

    // If we're past July, assume next summer
    if (now.month() > 7) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(6).date(15).format('YYYY-MM-DD'); // July 15
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'summer (mid-July)'
    };
  }

  // Pattern: "winter"
  if (lowerInput.includes('winter')) {
    let year = now.year();

    // Winter is Dec-Feb, if we're past Feb, assume next winter
    if (now.month() > 1) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(0).date(15).format('YYYY-MM-DD'); // January 15
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'winter (mid-January)'
    };
  }

  // Pattern: "fall" or "autumn"
  if (lowerInput.includes('fall') || lowerInput.includes('autumn')) {
    let year = now.year();

    // Fall is Sept-Nov, if we're past November, assume next fall
    if (now.month() > 10) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(9).date(15).format('YYYY-MM-DD'); // October 15
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'fall (mid-October)'
    };
  }

  // Pattern: "spring"
  if (lowerInput.includes('spring')) {
    let year = now.year();

    // Spring is March-May, if we're past May, assume next spring
    if (now.month() > 4) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(3).date(15).format('YYYY-MM-DD'); // April 15
    const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'spring (mid-April)'
    };
  }

  // Pattern: "christmas"
  if (lowerInput.includes('christmas') || lowerInput.includes('xmas')) {
    let year = now.year();

    // If we're past December 20, assume next Christmas
    if (now.month() === 11 && now.date() > 20) {
      year += 1;
    } else if (now.month() === 11 && now.date() <= 20) {
      // Keep current year if before Dec 20
    } else if (now.month() < 11) {
      // Keep current year if before December
    } else {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(11).date(23).format('YYYY-MM-DD'); // Dec 23
    const checkOut = dayjs(checkIn).add(7, 'day').format('YYYY-MM-DD'); // Through New Year

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'Christmas week'
    };
  }

  // Pattern: "thanksgiving"
  if (lowerInput.includes('thanksgiving')) {
    let year = now.year();

    // If we're past November, assume next Thanksgiving
    if (now.month() > 10) {
      year += 1;
    }

    // Thanksgiving is 4th Thursday in November (around Nov 22-28)
    const checkIn = dayjs().year(year).month(10).date(23).format('YYYY-MM-DD');
    const checkOut = dayjs(checkIn).add(4, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'Thanksgiving weekend'
    };
  }

  // Pattern: "spring break"
  if (lowerInput.includes('spring break')) {
    let year = now.year();

    // If we're past March, assume next spring break
    if (now.month() > 2) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(2).date(15).format('YYYY-MM-DD'); // March 15
    const checkOut = dayjs(checkIn).add(7, 'day').format('YYYY-MM-DD');

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: 'spring break'
    };
  }

  // Pattern: "new years", "new year's"
  if (lowerInput.includes('new year')) {
    let year = now.year();

    // If we're past Jan 5, assume next New Years
    if (now.month() > 0 || (now.month() === 0 && now.date() > 5)) {
      year += 1;
    }

    const checkIn = dayjs().year(year).month(11).date(30).format('YYYY-MM-DD'); // Dec 30
    const checkOut = dayjs().year(year + 1).month(0).date(2).format('YYYY-MM-DD'); // Jan 2

    return {
      checkIn,
      checkOut,
      confidence: 'high',
      matched: "New Year's"
    };
  }

  // No match found
  return null;
}

/**
 * Get default date range (30 days out, 7 day trip)
 * @returns {Object} {checkIn, checkOut}
 */
function getDefaultDateRange() {
  const checkIn = dayjs().add(30, 'day').format('YYYY-MM-DD');
  const checkOut = dayjs(checkIn).add(DEFAULT_TRIP_LENGTH_DAYS, 'day').format('YYYY-MM-DD');

  return {
    checkIn,
    checkOut,
    confidence: 'default',
    matched: '30 days from now'
  };
}

module.exports = {
  parseVagueDate,
  getDefaultDateRange,
  DEFAULT_TRIP_LENGTH_DAYS
};
