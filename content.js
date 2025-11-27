// Content script - runs in the context of web pages
// Extracts page content for LCA analysis

(function() {
  'use strict';
  
  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      try {
        const pageData = extractPageContent();
        sendResponse({ success: true, data: pageData });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    
    return true; // Keep message channel open for async response
  });
  
  /**
   * Extract comprehensive page content
   * @returns {Object} Page data including text, metadata, and structured data
   */
  function extractPageContent() {
    // Extract main text content
    const rawText = extractText();
    
    // Extract metadata
    const metadata = extractMetadata();
    
    // Extract structured data
    const structuredData = extractStructuredData();
    
    // Detect page type and extract relevant data
    const pageType = detectPageType();
    
    return {
      raw_text: rawText,
      title: metadata.title,
      url: window.location.href,
      meta_description: metadata.description,
      meta_keywords: metadata.keywords,
      structured_data: structuredData,
      page_type: pageType,
      extracted_at: new Date().toISOString(),
      word_count: countWords(rawText),
      char_count: rawText.length
    };
  }
  
  /**
   * Extract visible text from page
   * Filters out scripts, styles, and hidden elements
   */
  function extractText() {
    // Clone the body to avoid modifying the actual page
    const bodyClone = document.body.cloneNode(true);
    
    // Remove unwanted elements
    const unwantedSelectors = [
      'script', 'style', 'noscript', 'iframe',
      'nav', 'header', 'footer', '.advertisement',
      '[aria-hidden="true"]', '.hidden'
    ];
    
    unwantedSelectors.forEach(selector => {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Get text content
    let text = bodyClone.innerText || bodyClone.textContent || '';
    
    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .trim();
    
    // Limit to 50k characters to avoid overwhelming the backend
    if (text.length > 50000) {
      text = text.substring(0, 50000) + '\n\n[Content truncated at 50,000 characters. Enable Selenium for full extraction.]';
    }
    
    return text;
  }
  
  /**
   * Extract page metadata
   */
  function extractMetadata() {
    const getMeta = (name) => {
      const meta = document.querySelector(`meta[name="${name}"]`) || 
                   document.querySelector(`meta[property="${name}"]`);
      return meta ? meta.getAttribute('content') : '';
    };
    
    return {
      title: document.title || '',
      description: getMeta('description') || getMeta('og:description'),
      keywords: getMeta('keywords'),
      author: getMeta('author'),
      publisher: getMeta('publisher'),
      ogTitle: getMeta('og:title'),
      ogType: getMeta('og:type'),
      ogImage: getMeta('og:image')
    };
  }
  
  /**
   * Extract structured data (JSON-LD, microdata, etc.)
   */
  function extractStructuredData() {
    const structuredData = [];
    
    // Extract JSON-LD
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        structuredData.push({
          type: 'json-ld',
          data: data
        });
      } catch (e) {
        console.warn('Failed to parse JSON-LD:', e);
      }
    });
    
    // Extract microdata (basic support)
    const itemScopes = document.querySelectorAll('[itemscope]');
    if (itemScopes.length > 0) {
      structuredData.push({
        type: 'microdata',
        count: itemScopes.length
      });
    }
    
    return structuredData;
  }
  
  /**
   * Detect page type for better analysis
   */
  function detectPageType() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const text = document.body.textContent.toLowerCase();
    
    // Keywords that might indicate product/material pages
    const productKeywords = ['aluminium', 'aluminum', 'copper', 'steel', 'metal', 'alloy', 'material', 'product'];
    const dataKeywords = ['specification', 'datasheet', 'technical', 'properties', 'composition'];
    
    // Check for product indicators
    if (productKeywords.some(kw => title.includes(kw) || url.includes(kw))) {
      if (dataKeywords.some(kw => text.includes(kw))) {
        return 'technical_datasheet';
      }
      return 'product_page';
    }
    
    // Check for e-commerce
    if (url.includes('/product/') || url.includes('/item/') || 
        document.querySelector('[itemtype*="Product"]')) {
      return 'ecommerce_product';
    }
    
    // Check for documentation
    if (url.includes('/docs/') || url.includes('/documentation/') || 
        title.includes('documentation')) {
      return 'documentation';
    }
    
    // Default
    return 'general_webpage';
  }
  
  /**
   * Count words in text
   */
  function countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Extract selected element (if user highlights something)
   */
  function extractSelectedElement() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    if (container.nodeType === Node.TEXT_NODE) {
      return container.parentElement.innerText;
    } else if (container.nodeType === Node.ELEMENT_NODE) {
      return container.innerText;
    }
    
    return null;
  }
  
  // Expose utility functions to window for debugging (optional)
  if (typeof window !== 'undefined') {
    window.lcaExtractor = {
      extractPageContent,
      extractText,
      extractMetadata,
      extractStructuredData
    };
  }
  
  console.log('LCA Content Script loaded');
})();
