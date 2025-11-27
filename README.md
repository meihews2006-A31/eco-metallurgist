# LCA & Circularity Assistant - Chrome Extension

A Chrome Extension (Manifest V3) for Life Cycle Assessment and Circularity analysis of metallurgical products. Extract web page content, submit to backend analysis, and visualize environmental impact metrics.

## Features

- 📄 **Page Content Extraction** - Extract text and metadata from any webpage
- 🔄 **LCA Analysis** - Send data to backend for deep Selenium-based extraction and LLM analysis
- 📊 **Metrics Visualization** - View Circularity Score, CO₂ emissions, and recommendations
- 📋 **Job Management** - Track analysis jobs with status updates and history
- 🧪 **Mock Mode** - Test frontend without backend (demo mode)
- 🔐 **Secure Storage** - API keys stored locally in browser

## Installation

### Load in Chrome (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the extension folder

### Required Icons (Placeholders)

Create placeholder icons in an `icons/` folder:
- `icon16.png` (16x16px)
- `icon48.png` (48x48px)
- `icon128.png` (128x128px)

## Usage

### 1. Configure Backend (Options Page)

1. Click the extension icon and select **⚙️ Options**
2. Enter your backend URL (e.g., `https://your-backend.com`)
3. Enter your API key
4. Click **Save Settings**
5. Test connection with **Test Connection** button

### 2. Analyze a Page

1. Navigate to any webpage with material/product information
2. Click the extension icon
3. Click **📄 Scan Page** to extract content
4. Adjust LCA parameters:
   - Material type (Aluminium, Copper, Steel, Other)
   - Recycled content percentage
   - Energy consumption (kWh)
   - Transport distance (km)
5. Click **🚀 Send to Backend**
6. Results will appear automatically when analysis completes

### 3. Mock Mode (Testing)

To test without a backend:

1. Enable **Mock Mode** checkbox in popup
2. Click **Use Mock Response** to load sample data
3. Or submit normally - it will use mock data instead of calling backend

### 4. View Jobs

- Click **📋 Jobs** button in popup to view all analysis jobs
- See status (pending, running, done, error)
- View completed results
- Cancel running jobs
- Clear job history

## Backend API Contract

The extension expects these endpoints:

### Submit Job
```http
POST ${backendUrl}/lca/submit
Authorization: Bearer <apiKey>
Content-Type: application/json

{
  "job_id": "job-123",
  "url": "https://example.com/product",
  "raw_text": "extracted page text...",
  "title": "Page Title",
  "user_inputs": {
    "material": "aluminium",
    "recycled_percent": 30,
    "energy_kwh": 100,
    "transport_km": 50
  },
  "options": {
    "require_selenium": true
  }
}

Response:
{
  "job_id": "job-123",
  "status": "accepted"
}
```

### Check Status
```http
GET ${backendUrl}/lca/status/{job_id}
Authorization: Bearer <apiKey>

Response:
{
  "job_id": "job-123",
  "status": "pending|running|done|error",
  "progress": 42
}
```

### Get Result
```http
GET ${backendUrl}/lca/result/{job_id}
Authorization: Bearer <apiKey>

Response:
{
  "job_id": "job-123",
  "material": "aluminium",
  "co2_kg": 123.45,
  "circularity_score": 67,
  "recycled_percent": 30,
  "recommendations": [
    "Increase recycled content to 50%",
    "Switch to renewable energy"
  ],
  "raw_json": { ... }
}
```

### Ping (Health Check)
```http
GET ${backendUrl}/lca/ping

Response:
{
  "ok": true
}
```

## File Structure

```
lca-extension/
├── manifest.json           # Extension manifest (MV3)
├── shared.css             # Shared design system
├── popup.html/css/js      # Main popup interface
├── options.html/css/js    # Settings page
├── jobs.html/css/js       # Jobs management page
├── content.js             # Content script (page extraction)
├── service_worker.js      # Background worker (job queue)
├── _mock/
│   └── mock_response.json # Sample response for testing
├── icons/
│   ├── icon16.png         # (Create these)
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Testing

### Manual Test Cases

#### 1. Content Extraction
- Visit a product page
- Click "Scan Page"
- Verify extracted text appears in textarea
- Check character count updates
- Verify URL and title display correctly

#### 2. Options Storage
- Go to Options page
- Enter backend URL and API key
- Save settings
- Refresh extension
- Verify settings persist

#### 3. Mock Mode
- Enable Mock Mode in popup
- Click "Use Mock Response"
- Verify metrics display:
  - Circularity Score: 67
  - CO₂: 123.45 kg
  - Recycled: 30%
- Check recommendations appear
- Verify raw JSON is viewable

#### 4. Job Lifecycle (with backend)
- Submit real job
- Check job appears in Jobs page
- Verify status updates (pending → running → done)
- View completed result
- Test error handling (invalid URL/key)

#### 5. Error Handling
- Try submitting without scanning page
- Try submitting with no backend URL configured
- Test connection with invalid backend URL
- Test with invalid API key

## Troubleshooting

### CORS Errors
If you see CORS errors in console:
- Backend must allow extension origin: `chrome-extension://<extension-id>`
- Or use `Access-Control-Allow-Origin: *` for testing (not production)

### Extension ID Changes
- Extension ID changes when you reload unpacked extension
- Update backend CORS config or use wildcard for development

### Jobs Not Updating
- Check service worker console: `chrome://extensions/` → "service worker" link
- Verify backend endpoints return correct status
- Check polling interval (default: 2 seconds)

### Content Extraction Issues
- Some sites block content scripts with CSP
- Try enabling Selenium option for complex pages
- Check page loads completely before scanning

## Security Considerations

⚠️ **API Keys**: Currently stored in `chrome.storage.local`. For production:
- Use short-lived tokens
- Implement OAuth flow
- Never commit API keys to git

⚠️ **HTTPS**: Always use HTTPS for backend in production

⚠️ **Permissions**: Extension requests broad permissions. Review before publishing.

## Customization

### Polling Intervals
Edit `service_worker.js`:
```javascript
const CONFIG = {
  POLL_INTERVAL_MS: 2000,  // Change polling frequency
  POLL_MAX_ATTEMPTS: 60,   // Change max attempts
};
```

### Content Extraction
Edit `content.js`:
```javascript
// Adjust text limit
if (text.length > 50000) {
  text = text.substring(0, 50000);
}

// Add custom selectors to filter
const unwantedSelectors = [
  'script', 'style',
  '.your-custom-class'  // Add here
];
```

### UI Colors
Edit `shared.css`:
```css
:root {
  --primary: #1e40af;      /* Change primary color */
  --secondary: #0891b2;    /* Change secondary color */
  --accent-green: #10b981; /* Change success color */
}
```

## Backend Implementation Notes

This extension is **frontend only**. You need to implement:

1. **Job Queue** - Store submitted jobs
2. **Selenium Service** - Extract full page HTML/data
3. **LLM Analysis** - Extract LCA data from text
4. **Result Storage** - Store analysis results
5. **Status API** - Track job progress

See API contract above for expected endpoints.

## License

MIT License - See LICENSE file

## Support

For issues or questions:
- Open an issue on GitHub
- Check console logs (F12 → Console)
- Check service worker logs (chrome://extensions → service worker)

---

**Version**: 1.0.0  
**Target**: Metallurgists, Engineers, Environmental Analysts  
**Tech Stack**: Vanilla JS, Chrome Extension MV3
