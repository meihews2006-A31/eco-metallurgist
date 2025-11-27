// Options page logic

// DOM Elements
const backendUrlInput = document.getElementById('backendUrl');
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const requireSeleniumDefaultCheckbox = document.getElementById('requireSeleniumDefault');
const mockModeDefaultCheckbox = document.getElementById('mockModeDefault');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const clearJobsBtn = document.getElementById('clearJobsBtn');
const testResult = document.getElementById('testResult');
const statusMessage = document.getElementById('statusMessage');
const jobsList = document.getElementById('jobsList');

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);

// Event Listeners
saveBtn.addEventListener('click', saveSettings);
clearBtn.addEventListener('click', clearAllData);
testConnectionBtn.addEventListener('click', testConnection);
clearJobsBtn.addEventListener('click', clearJobs);
toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);

// Load saved settings
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'backendUrl',
      'apiKey',
      'requireSeleniumDefault',
      'mockMode'
    ]);
    
    backendUrlInput.value = settings.backendUrl || '';
    apiKeyInput.value = settings.apiKey || '';
    requireSeleniumDefaultCheckbox.checked = settings.requireSeleniumDefault !== false;
    mockModeDefaultCheckbox.checked = settings.mockMode || false;
    
    // Load jobs
    await loadJobs();
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save settings
async function saveSettings() {
  try {
    const settings = {
      backendUrl: backendUrlInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      requireSeleniumDefault: requireSeleniumDefaultCheckbox.checked,
      mockMode: mockModeDefaultCheckbox.checked
    };
    
    // Validate backend URL
    if (settings.backendUrl && !isValidUrl(settings.backendUrl)) {
      throw new Error('Invalid backend URL format');
    }
    
    await chrome.storage.local.set(settings);
    showStatus('✓ Settings saved successfully', 'success');
    
    // Auto-hide success message
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('✗ ' + error.message, 'error');
  }
}

// Clear all data
async function clearAllData() {
  if (!confirm('Are you sure you want to clear all settings and job history? This cannot be undone.')) {
    return;
  }
  
  try {
    await chrome.storage.local.clear();
    
    // Reset form
    backendUrlInput.value = '';
    apiKeyInput.value = '';
    requireSeleniumDefaultCheckbox.checked = true;
    mockModeDefaultCheckbox.checked = false;
    
    // Clear jobs list
    jobsList.innerHTML = '<p class="text-muted text-center">No jobs yet</p>';
    
    showStatus('✓ All data cleared', 'success');
  } catch (error) {
    console.error('Error clearing data:', error);
    showStatus('✗ Failed to clear data', 'error');
  }
}

// Test connection to backend
async function testConnection() {
  const backendUrl = backendUrlInput.value.trim();
  
  if (!backendUrl) {
    showTestResult('Please enter a backend URL first', 'error');
    return;
  }
  
  if (!isValidUrl(backendUrl)) {
    showTestResult('Invalid URL format', 'error');
    return;
  }
  
  try {
    setButtonLoading(testConnectionBtn, true, 'Testing...');
    testResult.style.display = 'none';
    
    // Try to ping the backend
    const response = await fetch(`${backendUrl}/lca/ping`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.ok) {
        showTestResult('✓ Connection successful!', 'success');
      } else {
        showTestResult('✗ Backend responded but returned error', 'error');
      }
    } else {
      showTestResult(`✗ Server error: ${response.status} ${response.statusText}`, 'error');
    }
  } catch (error) {
    console.error('Connection test error:', error);
    showTestResult('✗ Connection failed: ' + error.message, 'error');
  } finally {
    setButtonLoading(testConnectionBtn, false, 'Test Connection');
  }
}

// Load jobs from storage
async function loadJobs() {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    
    if (jobs.length === 0) {
      jobsList.innerHTML = '<p class="text-muted text-center">No jobs yet</p>';
      return;
    }
    
    // Sort by creation date (newest first)
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    jobsList.innerHTML = jobs.map(job => `
      <div class="job-item">
        <div class="job-info">
          <div class="job-id">ID: ${job.id}</div>
          <div class="job-url">${job.url || 'No URL'}</div>
          <div class="job-meta">
            ${new Date(job.createdAt).toLocaleString()} • 
            Updated: ${new Date(job.updatedAt).toLocaleString()}
          </div>
        </div>
        <div class="job-actions">
          <span class="badge badge-${job.status}">${job.status}</span>
          ${job.status === 'done' ? `<button class="btn btn-sm btn-secondary" onclick="viewJobResult('${job.id}')">View</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// Clear job history
async function clearJobs() {
  if (!confirm('Clear all job history?')) {
    return;
  }
  
  try {
    await chrome.storage.local.set({ jobs: [] });
    jobsList.innerHTML = '<p class="text-muted text-center">No jobs yet</p>';
    showStatus('✓ Job history cleared', 'success');
  } catch (error) {
    console.error('Error clearing jobs:', error);
    showStatus('✗ Failed to clear jobs', 'error');
  }
}

// View job result (called from inline onclick)
window.viewJobResult = async function(jobId) {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const job = jobs.find(j => j.id === jobId);
    
    if (!job || !job.result) {
      alert('No result available for this job');
      return;
    }
    
    // Open a new window/tab to display result
    const resultWindow = window.open('', '_blank', 'width=800,height=600');
    resultWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job Result: ${jobId}</title>
        <link rel="stylesheet" href="shared.css">
        <style>
          body { padding: 20px; }
          pre { background: #1f2937; color: #10b981; padding: 16px; border-radius: 8px; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>Job Result</h1>
        <p><strong>Job ID:</strong> ${jobId}</p>
        <p><strong>Status:</strong> ${job.status}</p>
        <p><strong>URL:</strong> ${job.url}</p>
        <h2>Result Data</h2>
        <pre>${JSON.stringify(job.result, null, 2)}</pre>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error viewing result:', error);
    alert('Failed to load result: ' + error.message);
  }
};

// Toggle API key visibility
function toggleApiKeyVisibility() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleApiKeyBtn.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleApiKeyBtn.textContent = '👁️';
  }
}

// Utility functions
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.style.display = 'block';
}

function showTestResult(message, type) {
  testResult.textContent = message;
  testResult.className = `test-result ${type}`;
  testResult.style.display = 'block';
}

function setButtonLoading(button, loading, text) {
  if (loading) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${text}`;
  } else {
    button.disabled = false;
    const icon = '🔍';
    button.innerHTML = `<span>${icon}</span> ${text}`;
  }
}
