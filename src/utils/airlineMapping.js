/**
 * Airline Deep-Link Mapping
 *
 * Maps airline IATA codes to their booking URL patterns.
 * Supports ~70 major airlines with verified deep-link templates.
 *
 * Placeholders:
 * - {origin}: Origin airport code (e.g., LAX)
 * - {destination}: Destination airport code (e.g., JFK)
 * - {departure}: Departure date (YYYY-MM-DD)
 * - {return}: Return date (YYYY-MM-DD)
 * - {passengers}: Number of passengers
 * - {cabin}: Cabin class (economy, premium_economy, business, first)
 */

const AIRLINE_DEEPLINKS = {
  // North American Airlines
  'AA': {
    name: 'American Airlines',
    url: 'https://www.aa.com/booking/flights?tripType=roundTrip&from={origin}&to={destination}&departDate={departure}&returnDate={return}&adultPassengersCount={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'DL': {
    name: 'Delta Air Lines',
    url: 'https://www.delta.com/flight-search/book-a-flight?tripType=ROUND_TRIP&fromCity={origin}&toCity={destination}&departureDate={departure}&returnDate={return}&passengers={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'UA': {
    name: 'United Airlines',
    url: 'https://www.united.com/en/us/fsr/choose-flights?f={origin}&t={destination}&d={departure}&r={return}&px={passengers}&taxng=1&newHP=True&clm=7',
    supportsCabin: true,
    cabinParam: '&cbm={cabin}'
  },
  'WN': {
    name: 'Southwest Airlines',
    url: 'https://www.southwest.com/air/booking/select.html?originationAirportCode={origin}&destinationAirportCode={destination}&returnAirportCode=&departureDate={departure}&returnDate={return}&adultPassengersCount={passengers}',
    supportsCabin: false
  },
  'AC': {
    name: 'Air Canada',
    url: 'https://www.aircanada.com/en-ca/flights-to-{destination}?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'AS': {
    name: 'Alaska Airlines',
    url: 'https://www.alaskaair.com/booking/flights?from={origin}&to={destination}&departure={departure}&return={return}&numAdults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'B6': {
    name: 'JetBlue Airways',
    url: 'https://jb.me/2?from={origin}&to={destination}&depart={departure}&return={return}&adult={passengers}',
    supportsCabin: false
  },
  'F9': {
    name: 'Frontier Airlines',
    url: 'https://www.flyfrontier.com/flight/search/?departureDate={departure}&returnDate={return}&destinationAirport={destination}&originationAirport={origin}&passengerCount={passengers}',
    supportsCabin: false
  },
  'NK': {
    name: 'Spirit Airlines',
    url: 'https://www.spirit.com/book/flights?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: false
  },
  'WS': {
    name: 'WestJet',
    url: 'https://www.westjet.com/en-ca/flights/search?origin={origin}&destination={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },

  // European Airlines
  'BA': {
    name: 'British Airways',
    url: 'https://www.britishairways.com/travel/home/public/en_gb?eId=111001&from={origin}&to={destination}&depDate={departure}&retDate={return}&ad={passengers}',
    supportsCabin: true,
    cabinParam: '&CabinCode={cabin}'
  },
  'LH': {
    name: 'Lufthansa',
    url: 'https://www.lufthansa.com/us/en/flight-search?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'AF': {
    name: 'Air France',
    url: 'https://wwws.airfrance.us/search/flight?trip=rt&from={origin}&to={destination}&outboundDate={departure}&inboundDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'KL': {
    name: 'KLM Royal Dutch Airlines',
    url: 'https://www.klm.com/search/offers?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'IB': {
    name: 'Iberia',
    url: 'https://www.iberia.com/us/flights/{origin}-{destination}/?dates={departure},{return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AZ': {
    name: 'ITA Airways',
    url: 'https://www.ita-airways.com/en_us/fly/booking/flights.html?market=US&language=EN&origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'TP': {
    name: 'TAP Air Portugal',
    url: 'https://www.flytap.com/en-us/flights/{origin}-{destination}?outboundDate={departure}&inboundDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'SN': {
    name: 'Brussels Airlines',
    url: 'https://www.brusselsairlines.com/en-us/booking/flight-search.aspx?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&ADT={passengers}',
    supportsCabin: true,
    cabinParam: '&TravelClass={cabin}'
  },
  'LX': {
    name: 'SWISS International Air Lines',
    url: 'https://www.swiss.com/us/en/book/flights?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'OS': {
    name: 'Austrian Airlines',
    url: 'https://www.austrian.com/us/en/book-a-flight?origin={origin}&destination={destination}&outboundDate={departure}&inboundDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AY': {
    name: 'Finnair',
    url: 'https://www.finnair.com/en/flights/{origin}-{destination}?departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'SK': {
    name: 'Scandinavian Airlines (SAS)',
    url: 'https://www.flysas.com/en/book/flights?from={origin}&to={destination}&outDate={departure}&inDate={return}&adt={passengers}',
    supportsCabin: true,
    cabinParam: '&bookingFlow={cabin}'
  },
  'EI': {
    name: 'Aer Lingus',
    url: 'https://www.aerlingus.com/html/flightSearchFormContainer.html?originAirportCode={origin}&destinationAirportCode={destination}&departureDate={departure}&returnDate={return}&numAdult={passengers}',
    supportsCabin: false
  },
  'VY': {
    name: 'Vueling',
    url: 'https://www.vueling.com/en/booking/flights?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&passengers={passengers}',
    supportsCabin: false
  },
  'FR': {
    name: 'Ryanair',
    url: 'https://www.ryanair.com/gb/en/trip/flights/select?adults={passengers}&dateOut={departure}&dateIn={return}&originIata={origin}&destinationIata={destination}',
    supportsCabin: false
  },
  'U2': {
    name: 'easyJet',
    url: 'https://www.easyjet.com/en/booking/search?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&adults={passengers}',
    supportsCabin: false
  },

  // Middle Eastern Airlines
  'EK': {
    name: 'Emirates',
    url: 'https://www.emirates.com/us/english/book/?from={origin}&to={destination}&departure={departure}&return={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&class={cabin}'
  },
  'QR': {
    name: 'Qatar Airways',
    url: 'https://booking.qatarairways.com/nsp/views/booking/flight-selection.xhtml?tripType=R&origin={origin}&destination={destination}&departing={departure}&returning={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'EY': {
    name: 'Etihad Airways',
    url: 'https://www.etihad.com/en-us/book/flights?from={origin}&to={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabinClass={cabin}'
  },
  'SV': {
    name: 'Saudia',
    url: 'https://www.saudia.com/booking?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'MS': {
    name: 'EgyptAir',
    url: 'https://www.egyptair.com/en/fly/flight-search?tripType=roundTrip&from={origin}&to={destination}&depart={departure}&return={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&class={cabin}'
  },

  // Asian Airlines
  'NH': {
    name: 'All Nippon Airways (ANA)',
    url: 'https://www.ana.co.jp/en/us/book-plan/book/international/search?departure={origin}&arrival={destination}&outbound={departure}&inbound={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'JL': {
    name: 'Japan Airlines',
    url: 'https://www.jal.co.jp/en/flights/search/?dep={origin}&arr={destination}&depdate={departure}&retdate={return}&adt={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'SQ': {
    name: 'Singapore Airlines',
    url: 'https://www.singaporeair.com/en_UK/us/plan-travel/book-flight/?from={origin}&to={destination}&departdate={departure}&returndate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'CX': {
    name: 'Cathay Pacific',
    url: 'https://www.cathaypacific.com/cx/en_US/book-a-trip/flights.html?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'TG': {
    name: 'Thai Airways',
    url: 'https://www.thaiairways.com/en/book/flight/search.page?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AI': {
    name: 'Air India',
    url: 'https://www.airindia.com/us/en/book/flight-search.html?tripType=R&from={origin}&to={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&class={cabin}'
  },
  'KE': {
    name: 'Korean Air',
    url: 'https://www.koreanair.com/us/en/booking/booking-gate?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'OZ': {
    name: 'Asiana Airlines',
    url: 'https://flyasiana.com/C/US/EN/booking/booking-gate?origin={origin}&destination={destination}&departDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'CI': {
    name: 'China Airlines',
    url: 'https://www.china-airlines.com/us/en/booking/search-flight?departure={origin}&arrival={destination}&outbound={departure}&inbound={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'BR': {
    name: 'EVA Air',
    url: 'https://www.evaair.com/en-us/booking/flight-search/?departure={origin}&arrival={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'MH': {
    name: 'Malaysia Airlines',
    url: 'https://www.malaysiaairlines.com/us/en/book/search.html?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'GA': {
    name: 'Garuda Indonesia',
    url: 'https://www.garuda-indonesia.com/us/en/booking/flight-search?from={origin}&to={destination}&departure={departure}&return={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'PK': {
    name: 'Pakistan International Airlines',
    url: 'https://www.piac.com.pk/booking/flights?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: false
  },
  'VN': {
    name: 'Vietnam Airlines',
    url: 'https://www.vietnamairlines.com/us/en/book-a-trip/search?dep={origin}&des={destination}&date1={departure}&date2={return}&adt={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },

  // Oceania Airlines
  'QF': {
    name: 'Qantas',
    url: 'https://www.qantas.com/us/en/flight-search.html?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'NZ': {
    name: 'Air New Zealand',
    url: 'https://www.airnewzealand.com/flights?from={origin}&to={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },

  // Latin American Airlines
  'LA': {
    name: 'LATAM Airlines',
    url: 'https://www.latamairlines.com/us/en/offers/flight-search?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&passengers={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AM': {
    name: 'Aeroméxico',
    url: 'https://aeromexico.com/en-us/book/flights?origin={origin}&destination={destination}&departure={departure}&return={return}&passengers={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'CM': {
    name: 'Copa Airlines',
    url: 'https://www.copaair.com/en/web/us/search-flights?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AV': {
    name: 'Avianca',
    url: 'https://www.avianca.com/us/en/booking/flights?origin={origin}&destination={destination}&departure={departure}&return={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'G3': {
    name: 'GOL Linhas Aéreas',
    url: 'https://www.voegol.com.br/en/booking/flights?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: false
  },

  // African Airlines
  'SA': {
    name: 'South African Airways',
    url: 'https://www.flysaa.com/us/en/book/flights?origin={origin}&destination={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'ET': {
    name: 'Ethiopian Airlines',
    url: 'https://www.ethiopianairlines.com/us/booking/flight-search?from={origin}&to={destination}&departure={departure}&return={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'KQ': {
    name: 'Kenya Airways',
    url: 'https://www.kenya-airways.com/us/en/booking/search?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'AT': {
    name: 'Royal Air Maroc',
    url: 'https://www.royalairmaroc.com/us/en/booking/flight-search?dep={origin}&arr={destination}&outDate={departure}&inDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&class={cabin}'
  },

  // Chinese Airlines
  'CA': {
    name: 'Air China',
    url: 'https://www.airchina.us/US/GB/booking/flight-search?departure={origin}&arrival={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'CZ': {
    name: 'China Southern Airlines',
    url: 'https://www.csair.com/us/en/tourguide/booking_search/?dep={origin}&arr={destination}&depdate={departure}&arrdate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'MU': {
    name: 'China Eastern Airlines',
    url: 'https://us.ceair.com/en/booking/lowfareresult.html?DCity1={origin}&ACity1={destination}&DDate1={departure}&RDate={return}&Adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'HU': {
    name: 'Hainan Airlines',
    url: 'https://www.hainanairlines.com/us/en/booking/flight-search?departure={origin}&arrival={destination}&departureDate={departure}&returnDate={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },

  // Additional Major Airlines
  'TK': {
    name: 'Turkish Airlines',
    url: 'https://www.turkishairlines.com/en-us/flights/booking/?Origin={origin}&Destination={destination}&OriginDate={departure}&DestinationDate={return}&AdultCount={passengers}',
    supportsCabin: true,
    cabinParam: '&CabinType={cabin}'
  },
  'SU': {
    name: 'Aeroflot',
    url: 'https://www.aeroflot.ru/us-en/booking/flights?origin={origin}&destination={destination}&departDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'WY': {
    name: 'Oman Air',
    url: 'https://www.omanair.com/us/en/book/flight-search?from={origin}&to={destination}&departure={departure}&return={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'RJ': {
    name: 'Royal Jordanian',
    url: 'https://www.rj.com/en/booking/book-a-flight?origin={origin}&destination={destination}&departureDate={departure}&returnDate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'LO': {
    name: 'LOT Polish Airlines',
    url: 'https://www.lot.com/us/en/booking/flight-search?from={origin}&to={destination}&departure={departure}&return={return}&adult={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'OK': {
    name: 'Czech Airlines',
    url: 'https://www.csa.cz/us-en/booking/flight-search?origin={origin}&destination={destination}&outbound={departure}&inbound={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  },
  'A3': {
    name: 'Aegean Airlines',
    url: 'https://en.aegeanair.com/book-a-flight/?dep={origin}&dest={destination}&depdate={departure}&retdate={return}&adults={passengers}',
    supportsCabin: true,
    cabinParam: '&cabin={cabin}'
  }
};

/**
 * Airline Alliances for grouping and filtering
 */
const AIRLINE_ALLIANCES = {
  STAR_ALLIANCE: ['UA', 'AC', 'LH', 'NH', 'SQ', 'TG', 'AI', 'OZ', 'SN', 'LX', 'OS', 'TP', 'SK', 'CA', 'TK', 'SU', 'ET', 'SA', 'A3', 'AV', 'BR', 'CM', 'EY', 'LO', 'OK'],
  ONEWORLD: ['AA', 'BA', 'QF', 'CX', 'JL', 'IB', 'AY', 'QR', 'RJ', 'LA', 'AS', 'MH'],
  SKYTEAM: ['DL', 'AF', 'KL', 'AZ', 'KE', 'CI', 'VN', 'MU', 'CZ', 'SV', 'AM', 'GA', 'KQ', 'AT', 'OK']
};

/**
 * Cabin class mapping for different airline URL formats
 */
const CABIN_CLASS_MAPPING = {
  economy: {
    standard: 'economy',
    delta: 'main',
    united: 'econ',
    aa: 'coach',
    emirates: 'economy'
  },
  premium_economy: {
    standard: 'premium_economy',
    delta: 'premium',
    united: 'premiumeconomy',
    aa: 'premium_economy',
    emirates: 'premium_economy'
  },
  business: {
    standard: 'business',
    delta: 'business',
    united: 'business',
    aa: 'business',
    emirates: 'business'
  },
  first: {
    standard: 'first',
    delta: 'first',
    united: 'first',
    aa: 'first',
    emirates: 'first'
  }
};

module.exports = {
  AIRLINE_DEEPLINKS,
  AIRLINE_ALLIANCES,
  CABIN_CLASS_MAPPING
};
