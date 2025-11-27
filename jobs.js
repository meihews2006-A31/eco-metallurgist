// Jobs page logic

// DOM Elements
const jobsGrid = document.getElementById('jobsGrid');
const refreshBtn = document.getElementById('refreshBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const statusFilter = document.getElementById('statusFilter');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadJobs();
  
  // Auto-refresh every 5 seconds for running jobs
  setInterval(checkRunningJobs, 5000);
});

// Event Listeners
refreshBtn.addEventListener('click', loadJobs);
clearAllBtn.addEventListener('click', clearAllJobs);
statusFilter.addEventListener('change', loadJobs);

// Load and display jobs
async function loadJobs() {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const filterStatus = statusFilter.value;
    
    // Filter jobs
    const filteredJobs = filterStatus === 'all' 
      ? jobs 
      : jobs.filter(job => job.status === filterStatus);
    
    // Sort by creation date (newest first)
    filteredJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (filteredJobs.length === 0) {
      showEmptyState();
      return;
    }
    
    renderJobs(filteredJobs);
  } catch (error) {
    console.error('Error loading jobs:', error);
    jobsGrid.innerHTML = '<p class="text-error text-center">Error loading jobs</p>';
  }
}

// Render jobs grid
function renderJobs(jobs) {
  jobsGrid.innerHTML = jobs.map(job => `
    <div class="job-card status-${job.status}" data-job-id="${job.id}">
      <div class="job-card-header">
        <div class="job-id">${job.id}</div>
        <span class="badge badge-${job.status}">${job.status}</span>
      </div>
      
      <div class="job-url" title="${job.url || 'No URL'}">${job.url || 'No URL'}</div>
      
      ${job.status === 'running' && job.progress ? `
        <div class="job-progress">
          <div class="job-progress-label">
            <span>Progress</span>
            <span>${job.progress}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${job.progress}%;"></div>
          </div>
        </div>
      ` : ''}
      
      <div class="job-meta">
        <span>Created: ${formatDate(job.createdAt)}</span>
        <span>Updated: ${formatDate(job.updatedAt)}</span>
      </div>
      
      <div class="job-actions">
        ${job.status === 'done' ? `
          <button class="btn btn-sm btn-primary" onclick="viewJob('${job.id}')">
            View Result
          </button>
        ` : ''}
        ${job.status === 'running' || job.status === 'pending' ? `
          <button class="btn btn-sm btn-secondary" onclick="cancelJob('${job.id}')">
            Cancel
          </button>
          <button class="btn btn-sm btn-secondary" onclick="refreshJobStatus('${job.id}')">
            Refresh
          </button>
        ` : ''}
        ${job.status === 'error' ? `
          <button class="btn btn-sm btn-secondary" onclick="viewJobError('${job.id}')">
            View Error
          </button>
        ` : ''}
        <button class="btn btn-sm btn-secondary" onclick="deleteJob('${job.id}')">
          Delete
        </button>
      </div>
    </div>
  `).join('');
}

// Show empty state
function showEmptyState() {
  jobsGrid.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <div class="empty-state-icon">📋</div>
      <h3>No jobs found</h3>
      <p class="text-muted">Submit an analysis from the popup to see jobs here.</p>
    </div>
  `;
}

// Check and update running jobs
async function checkRunningJobs() {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const runningJobs = jobs.filter(job => job.status === 'running' || job.status === 'pending');
    
    if (runningJobs.length === 0) return;
    
    // Request status updates from background
    for (const job of runningJobs) {
      chrome.runtime.sendMessage({
        action: 'getJobStatus',
        jobId: job.id
      });
    }
    
    // Reload jobs after a delay
    setTimeout(loadJobs, 1000);
  } catch (error) {
    console.error('Error checking running jobs:', error);
  }
}

// View job result
window.viewJob = async function(jobId) {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const job = jobs.find(j => j.id === jobId);
    
    if (!job || !job.result) {
      alert('No result available for this job');
      return;
    }
    
    // Open result in new tab
    const resultWindow = window.open('', '_blank', 'width=900,height=700');
    resultWindow.document.write(generateResultHTML(job));
  } catch (error) {
    console.error('Error viewing job:', error);
    alert('Failed to load job result');
  }
};

// View job error
window.viewJobError = async function(jobId) {
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const job = jobs.find(j => j.id === jobId);
    
    if (!job) {
      alert('Job not found');
      return;
    }
    
    alert(`Error: ${job.error || 'Unknown error occurred'}\n\nJob ID: ${job.id}\nURL: ${job.url}`);
  } catch (error) {
    console.error('Error viewing error:', error);
  }
};

// Refresh job status
window.refreshJobStatus = async function(jobId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getJobStatus',
      jobId
    });
    
    if (response.success) {
      await loadJobs();
    } else {
      alert('Failed to refresh status: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error refreshing status:', error);
    alert('Failed to refresh status');
  }
};

// Cancel job
window.cancelJob = async function(jobId) {
  if (!confirm('Cancel this job?')) return;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'cancelJob',
      jobId
    });
    
    if (response.success) {
      await loadJobs();
    } else {
      alert('Failed to cancel job: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error canceling job:', error);
    alert('Failed to cancel job');
  }
};

// Delete job
window.deleteJob = async function(jobId) {
  if (!confirm('Delete this job from history?')) return;
  
  try {
    const { jobs = [] } = await chrome.storage.local.get(['jobs']);
    const updatedJobs = jobs.filter(j => j.id !== jobId);
    
    await chrome.storage.local.set({ jobs: updatedJobs });
    await loadJobs();
  } catch (error) {
    console.error('Error deleting job:', error);
    alert('Failed to delete job');
  }
};

// Clear all jobs
async function clearAllJobs() {
  if (!confirm('Clear all job history? This cannot be undone.')) return;
  
  try {
    await chrome.storage.local.set({ jobs: [] });
    showEmptyState();
  } catch (error) {
    console.error('Error clearing jobs:', error);
    alert('Failed to clear jobs');
  }
}

// Utility functions
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }
  
  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // More than 24 hours
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function generateResultHTML(job) {
  const result = job.result || {};
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Job Result: ${job.id}</title>
      <link rel="stylesheet" href="shared.css">
      <style>
        body { padding: 40px; max-width: 1000px; margin: 0 auto; }
        .result-header { margin-bottom: 32px; }
        .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
        .metric-box { background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; }
        .metric-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #6b7280; }
        .metric-value { font-size: 36px; font-weight: 700; margin: 8px 0; }
        .recommendations { margin: 24px 0; }
        .recommendations li { padding: 12px; margin: 8px 0; background: #f9fafb; border-left: 3px solid #10b981; border-radius: 4px; }
        pre { background: #1f2937; color: #10b981; padding: 20px; border-radius: 12px; overflow: auto; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="result-header">
        <h1>LCA Analysis Result</h1>
        <p><strong>Job ID:</strong> ${job.id}</p>
        <p><strong>URL:</strong> ${job.url}</p>
        <p><strong>Completed:</strong> ${new Date(job.updatedAt).toLocaleString()}</p>
      </div>
      
      <div class="metrics">
        <div class="metric-box">
          <div class="metric-label">Circularity Score</div>
          <div class="metric-value">${result.circularity_score || 0}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">CO₂ Emissions</div>
          <div class="metric-value">${(result.co2_kg || 0).toFixed(2)}</div>
          <div style="font-size: 14px; color: #6b7280;">kg CO₂e</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Recycled Content</div>
          <div class="metric-value">${result.recycled_percent || 0}%</div>
        </div>
      </div>
      
      ${result.recommendations && result.recommendations.length > 0 ? `
        <div class="recommendations">
          <h2>Recommendations</h2>
          <ul>
            ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <h2>Raw Data</h2>
      <pre>${JSON.stringify(result.raw_json || result, null, 2)}</pre>
    </body>
    </html>
  `;
}
