// Service Worker (Background Script) for LCA Extension
// Handles job queue, API communication, and job lifecycle management

'use strict';

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  POLL_INTERVAL_MS: 2000,
  POLL_MAX_ATTEMPTS: 60,
  BACKOFF_MULTIPLIER: 1.5
};

// Message handlers
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ success: false, error: error.message }));
  
  return true; // Keep message channel open for async response
});

/**
 * Main message handler
 */
async function handleMessage(request, sender) {
  switch (request.action) {
    case 'submitJob':
      return await submitJob(request.payload, request.mockMode);
    
    case 'getJobStatus':
      return await getJobStatus(request.jobId);
    
    case 'cancelJob':
      return await cancelJob(request.jobId);
    
    case 'getMockResponse':
      return await getMockResponse();
    
    default:
      throw new Error('Unknown action: ' + request.action);
  }
}

/**
 * Submit a new LCA analysis job
 */
async function submitJob(payload, mockMode = false) {
  try {
    // Check mock mode
    if (mockMode) {
      const mockResult = await getMockResponse();
      return {
        success: true,
        mockMode: true,
        jobId: generateJobId(),
        result: mockResult.result
      };
    }
    
    // Get backend configuration
    const { backendUrl, apiKey } = await chrome.storage.local.get(['backendUrl', 'apiKey']);
    
    if (!backendUrl) {
      throw new Error('Backend URL not configured. Please set it in Options.');
    }
    
    if (!apiKey) {
      throw new Error('API Key not configured. Please set it in Options.');
    }
    
    // Generate job ID
    const jobId = generateJobId();
    
    // Create job object
    const job = {
      id: jobId,
      url: payload.url,
      payload: {
        ...payload,
        job_id: jobId
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retries: 0,
      error: null,
      result: null
    };
    
    // Save job to storage
    await saveJob(job);
    
    // Submit to backend
    try {
      const response = await fetch(`${backendUrl}/lca/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(job.payload)
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update job status
      job.status = 'pending';
      job.backendJobId = data.job_id || jobId;
      job.updatedAt = new Date().toISOString();
      await updateJob(job);
      
      // Start polling for status
      pollJobStatus(job.id, backendUrl, apiKey);
      
      return {
        success: true,
        jobId: job.id,
        backendJobId: job.backendJobId
      };
    } catch (error) {
      // Update job with error
      job.status = 'error';
      job.error = error.message;
      job.updatedAt = new Date().toISOString();
      await updateJob(job);
      
      throw error;
    }
  } catch (error) {
    console.error('Submit job error:', error);
    throw error;
  }
}

/**
 * Poll job status until complete or max attempts reached
 */
async function pollJobStatus(jobId, backendUrl, apiKey, attempt = 0) {
  if (attempt >= CONFIG.POLL_MAX_ATTEMPTS) {
    console.log(`Max poll attempts reached for job ${jobId}`);
    const job = await getJobById(jobId);
    if (job && (job.status === 'pending' || job.status === 'running')) {
      job.status = 'error';
      job.error = 'Timeout: Job did not complete in time';
      job.updatedAt = new Date().toISOString();
      await updateJob(job);
    }
    return;
  }
  
  try {
    const job = await getJobById(jobId);
    if (!job) return;
    
    // Skip if job already done or error
    if (job.status === 'done' || job.status === 'error') {
      return;
    }
    
    const backendJobId = job.backendJobId || job.id;
    
    // Query status
    const response = await fetch(`${backendUrl}/lca/status/${backendJobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    const statusData = await response.json();
    
    // Update job
    job.status = statusData.status;
    job.progress = statusData.progress;
    job.updatedAt = new Date().toISOString();
    
    if (statusData.status === 'done') {
      // Fetch result
      const resultResponse = await fetch(`${backendUrl}/lca/result/${backendJobId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (resultResponse.ok) {
        job.result = await resultResponse.json();
      }
    } else if (statusData.status === 'error') {
      job.error = statusData.error || 'Unknown error';
    }
    
    await updateJob(job);
    
    // Continue polling if still running
    if (job.status === 'running' || job.status === 'pending') {
      const delay = CONFIG.POLL_INTERVAL_MS * Math.pow(CONFIG.BACKOFF_MULTIPLIER, Math.min(attempt, 5));
      setTimeout(() => pollJobStatus(jobId, backendUrl, apiKey, attempt + 1), delay);
    }
  } catch (error) {
    console.error(`Poll error for job ${jobId}:`, error);
    
    // Retry with backoff
    const delay = CONFIG.POLL_INTERVAL_MS * Math.pow(CONFIG.BACKOFF_MULTIPLIER, attempt);
    setTimeout(() => pollJobStatus(jobId, backendUrl, apiKey, attempt + 1), delay);
  }
}

/**
 * Get job status
 */
async function getJobStatus(jobId) {
  try {
    const job = await getJobById(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    return {
      success: true,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error
    };
  } catch (error) {
    console.error('Get job status error:', error);
    throw error;
  }
}

/**
 * Cancel a job
 */
async function cancelJob(jobId) {
  try {
    const job = await getJobById(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }
    
    // Frontend-only cancel (no backend API for cancellation in spec)
    job.status = 'error';
    job.error = 'Cancelled by user';
    job.updatedAt = new Date().toISOString();
    await updateJob(job);
    
    return { success: true };
  } catch (error) {
    console.error('Cancel job error:', error);
    throw error;
  }
}

/**
 * Get mock response for testing
 */
async function getMockResponse() {
  // Return hardcoded mock response
  // In production, this could load from _mock/mock_response.json
  return {
    success: true,
    result: {
      job_id: 'mock-' + Date.now(),
      material: 'aluminium',
      co2_kg: 123.45,
      circularity_score: 67,
      recycled_percent: 30,
      recommendations: [
        'Increase recycled content to 50% to reduce CO₂ emissions by 25%',
        'Switch to renewable energy sources for production',
        'Optimize transportation routes to reduce distance by 20%',
        'Implement closed-loop recycling system'
      ],
      raw_json: {
        material_composition: {
          primary_material: 'aluminium',
          alloy_type: '6061',
          recycled_content: 30,
          virgin_content: 70
        },
        energy_analysis: {
          total_energy_kwh: 100,
          renewable_percentage: 45,
          grid_intensity_gco2_kwh: 400
        },
        transport_analysis: {
          distance_km: 50,
          mode: 'truck',
          emissions_kg: 15.5
        },
        lifecycle_phases: {
          extraction: 45.2,
          processing: 52.8,
          transport: 15.5,
          use_phase: 0,
          end_of_life: 10.0
        }
      }
    }
  };
}

// Job storage helpers

async function saveJob(job) {
  const { jobs = [] } = await chrome.storage.local.get(['jobs']);
  jobs.push(job);
  await chrome.storage.local.set({ jobs });
}

async function updateJob(updatedJob) {
  const { jobs = [] } = await chrome.storage.local.get(['jobs']);
  const index = jobs.findIndex(j => j.id === updatedJob.id);
  
  if (index !== -1) {
    jobs[index] = updatedJob;
    await chrome.storage.local.set({ jobs });
  }
}

async function getJobById(jobId) {
  const { jobs = [] } = await chrome.storage.local.get(['jobs']);
  return jobs.find(j => j.id === jobId);
}

// Utility functions

function generateJobId() {
  return 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

console.log('LCA Service Worker loaded');
