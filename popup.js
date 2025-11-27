// Popup UI Logic

let currentPageData = null;

// DOM Elements
const scanBtn = document.getElementById('scanBtn');
const submitBtn = document.getElementById('submitBtn');
const jobsBtn = document.getElementById('jobsBtn');
const optionsBtn = document.getElementById('optionsBtn');
const mockModeCheckbox = document.getElementById('mockMode');
const useMockBtn = document.getElementById('useMockBtn');
const extractedText = document.getElementById('extractedText');
const charCount = document.getElementById('charCount');
const pageInfo = document.getElementById('pageInfo');
const submitStatus = document.getElementById('submitStatus');
const resultsSection = document.getElementById('resultsSection');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load mock mode preference
  const { mockMode = false } = await chrome.storage.local.get(['mockMode']);
  mockModeCheckbox.checked = mockMode;
  toggleMockUI(mockMode);
  
  // Update char count on input
  extractedText.addEventListener('input', updateCharCount);
});

// Event Listeners
scanBtn.addEventListener('click', handleScan);
submitBtn.addEventListener('click', handleSubmit);
jobsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
mockModeCheckbox.addEventListener('change', handleMockModeToggle);
useMockBtn.addEventListener('click', handleUseMock);

// Scan current page
async function handleScan() {
  try {
    setButtonLoading(scanBtn, true, 'Scanning...');
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      throw new Error('No active tab found');
    }
    
    // Execute content script to extract page data
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractPageContent
    });
    
    if (result?.result) {
      currentPageData = result.result;
      displayPageData(currentPageData);
      submitBtn.disabled = false;
      showStatus('✓ Page scanned successfully', 'success');
    } else {
      throw new Error('Failed to extract page content');
    }
  } catch (error) {
    console.error('Scan error:', error);
    showStatus('✗ ' + error.message, 'error');
    submitBtn.disabled = true;
  } finally {
    setButtonLoading(scanBtn, false, 'Scan Page');
  }
}

// Function injected into page to extract content
function extractPageContent() {
  try {
    // Extract main text content
    const rawText = document.body.innerText
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50000); // Limit to 50k chars
    
    // Extract metadata
    const title = document.title || '';
    const url = window.location.href;
    const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
    
    // Try to extract structured data
    const structuredData = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        structuredData.push(JSON.parse(script.textContent));
      } catch (e) {
        // Skip invalid JSON
      }
    });
    
    return {
      raw_text: rawText,
      title,
      url,
      meta_description: metaDescription,
      structured_data: structuredData,
      extracted_at: new Date().toISOString()
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Display extracted page data
function displayPageData(data) {
  extractedText.value = data.raw_text || '';
  updateCharCount();
  
  document.getElementById('pageUrl').textContent = `URL: ${data.url}`;
  document.getElementById('pageTitle').textContent = `Title: ${data.title}`;
  pageInfo.style.display = 'block';
  
  // Hide previous results
  resultsSection.style.display = 'none';
}

// Update character count
function updateCharCount() {
  const count = extractedText.value.length;
  charCount.textContent = `${count.toLocaleString()} chars`;
  
  if (count > 20000) {
    charCount.style.color = 'var(--warning)';
  } else {
    charCount.style.color = 'var(--gray-500)';
  }
}

// Handle form submission
async function handleSubmit() {
  try {
    setButtonLoading(submitBtn, true, 'Submitting...');
    submitStatus.style.display = 'none';
    resultsSection.style.display = 'none';
    
    // Gather form data
    const payload = {
      url: currentPageData?.url || '',
      raw_text: extractedText.value.trim(),
      title: currentPageData?.title || '',
      user_inputs: {
        material: document.getElementById('material').value,
        recycled_percent: parseInt(document.getElementById('recycledPercent').value) || 0,
        energy_kwh: parseInt(document.getElementById('energyKwh').value) || 0,
        transport_km: parseInt(document.getElementById('transportKm').value) || 0
      },
      options: {
        require_selenium: document.getElementById('requireSelenium').checked
      }
    };
    
    // Validate
    if (!payload.raw_text) {
      throw new Error('No content to analyze. Please scan a page first.');
    }
    
    // Check mock mode
    const mockMode = mockModeCheckbox.checked;
    
    // Send to background service worker
    const response = await chrome.runtime.sendMessage({
      action: 'submitJob',
      payload,
      mockMode
    });
    
    if (response.success) {
      if (mockMode) {
        showStatus('✓ Mock response loaded', 'success');
        displayResults(response.result);
      } else {
        showStatus('✓ Job submitted! ID: ' + response.jobId, 'success');
        // Poll for results
        pollJobStatus(response.jobId);
      }
    } else {
      throw new Error(response.error || 'Submission failed');
    }
  } catch (error) {
    console.error('Submit error:', error);
    showStatus('✗ ' + error.message, 'error');
  } finally {
    setButtonLoading(submitBtn, false, 'Send to Backend');
  }
}

// Poll job status
async function pollJobStatus(jobId) {
  const maxAttempts = 20;
  let attempts = 0;
  
  const poll = async () => {
    attempts++;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getJobStatus',
        jobId
      });
      
      if (response.success) {
        const status = response.status;
        
        if (status === 'done') {
          showStatus('✓ Analysis complete!', 'success');
          displayResults(response.result);
        } else if (status === 'error') {
          showStatus('✗ Analysis failed: ' + (response.error || 'Unknown error'), 'error');
        } else if (status === 'running' || status === 'pending') {
          showStatus(`⏳ Processing... (${status})`, 'info');
          
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000); // Poll every 2 seconds
          } else {
            showStatus('⏱ Timeout waiting for results. Check Jobs page.', 'error');
          }
        }
      } else {
        throw new Error(response.error || 'Failed to check status');
      }
    } catch (error) {
      console.error('Poll error:', error);
      showStatus('✗ Error checking status: ' + error.message, 'error');
    }
  };
  
  poll();
}

// Display analysis results
function displayResults(result) {
  if (!result) return;
  
  // Show results section
  resultsSection.style.display = 'block';
  
  // Update metrics
  const circularityScore = result.circularity_score || 0;
  document.getElementById('circularityScore').textContent = circularityScore;
  document.getElementById('circularityProgress').style.width = circularityScore + '%';
  
  const co2 = result.co2_kg || 0;
  document.getElementById('co2Value').textContent = co2.toFixed(2);
  
  const recycled = result.recycled_percent || 0;
  document.getElementById('recycledValue').textContent = recycled;
  
  // Recommendations
  const recommendations = result.recommendations || [];
  if (recommendations.length > 0) {
    const recommendationsSection = document.getElementById('recommendationsSection');
    const recommendationsList = document.getElementById('recommendationsList');
    
    recommendationsList.innerHTML = recommendations
      .map(rec => `<li>${rec}</li>`)
      .join('');
    
    recommendationsSection.style.display = 'block';
  }
  
  // Raw JSON
  document.getElementById('rawJson').textContent = JSON.stringify(result.raw_json || result, null, 2);
  
  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Mock mode toggle
async function handleMockModeToggle() {
  const mockMode = mockModeCheckbox.checked;
  await chrome.storage.local.set({ mockMode });
  toggleMockUI(mockMode);
}

function toggleMockUI(enabled) {
  useMockBtn.style.display = enabled ? 'inline-flex' : 'none';
}

// Use mock response directly
async function handleUseMock() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getMockResponse'
    });
    
    if (response.success) {
      displayResults(response.result);
      showStatus('✓ Mock response loaded', 'success');
    } else {
      throw new Error('Failed to load mock response');
    }
  } catch (error) {
    console.error('Mock error:', error);
    showStatus('✗ ' + error.message, 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  submitStatus.textContent = message;
  submitStatus.className = `status-message ${type}`;
  submitStatus.style.display = 'block';
}

// Set button loading state
function setButtonLoading(button, loading, text) {
  if (loading) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${text}`;
  } else {
    button.disabled = false;
    const icon = button.id === 'scanBtn' ? '📄' : '🚀';
    button.innerHTML = `<span>${icon}</span> ${text}`;
  }
}
