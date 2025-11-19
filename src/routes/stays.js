const express = require('express');
const router = express.Router();
const staysService = require('../services/staysService');

/**
 * Get mock test data for development
 * GET /api/stays/test/mock
 */
router.get('/test/mock', async (req, res) => {
  try {
    const mockData = staysService.getMockData();
    res.json(mockData);
  } catch (error) {
    console.error('[Stays API] Error getting mock data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get search results by ID
 * GET /api/stays/:searchId
 */
router.get('/:searchId', async (req, res) => {
  try {
    const { searchId } = req.params;

    console.log(`[Stays API] Fetching search results for: ${searchId}`);

    const results = await staysService.getSearchResults(searchId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Search results not found or expired'
      });
    }

    res.json(results);
  } catch (error) {
    console.error(`[Stays API] Error fetching search ${req.params.searchId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific hotel details
 * GET /api/stays/hotel/:hotelId
 */
router.get('/hotel/:hotelId', async (req, res) => {
  try {
    const { hotelId } = req.params;

    console.log(`[Stays API] Fetching hotel details for: ${hotelId}`);

    const hotel = await staysService.getHotelDetails(hotelId);

    if (!hotel) {
      return res.status(404).json({
        success: false,
        error: 'Hotel not found'
      });
    }

    res.json(hotel);
  } catch (error) {
    console.error(`[Stays API] Error fetching hotel ${req.params.hotelId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Handle user selection of an accommodation
 * POST /api/stays/select
 * Body: { searchId, hotelId, phoneNumber, hotelDetails }
 */
router.post('/select', async (req, res) => {
  try {
    const { searchId, hotelId, phoneNumber, hotelDetails } = req.body;

    console.log(`[Stays API] User selection - Phone: ${phoneNumber}, Hotel: ${hotelId}`);

    if (!phoneNumber || !hotelId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber and hotelId'
      });
    }

    const selection = await staysService.saveSelection({
      searchId,
      hotelId,
      phoneNumber,
      hotelDetails,
      selectedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Selection saved successfully',
      selection
    });
  } catch (error) {
    console.error('[Stays API] Error saving selection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
