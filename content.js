(function() {
  'use strict';
  
  let config = null;
  let observer = null;
  let isProcessing = false;
  
  async function init() {
    config = await sendMessage({ action: 'getConfig' });
    if (!config) return;
    
    if (!isTargetPage()) return;
    
    await sendMessage({ action: 'refreshEmbyData' });
    startDetection();
  }
  
  function isTargetPage() {
    if (!config.targetPages || config.targetPages.length === 0) {
      return true;
    }
    
    const currentUrl = window.location.href;
    return config.targetPages.some(page => {
      if (!page.enabled) return false;
      return matchPattern(currentUrl, page.urlPattern);
    });
  }
  
  function matchPattern(url, pattern) {
    const regex = new RegExp(
      pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?')
        .replace(/\./g, '\\.')
    );
    return regex.test(url);
  }
  
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }
  
  function startDetection() {
    detectElements();
    
    observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        debounce(detectElements, 500)();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  let debounceTimer = null;
  function debounce(func, wait) {
    return function(...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  async function detectElements() {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
      const photoInfoDates = document.querySelectorAll('.photo-info date');
      if (photoInfoDates.length > 0) {
        await checkElement(photoInfoDates[0], 'photo-info-date');
      }
      
      const xpathResult = document.evaluate(
        config.selectors?.xpathSpan || '/html/body/div[5]/div[1]/div[2]/p[1]/span[2]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      
      if (xpathResult.singleNodeValue) {
        await checkElement(xpathResult.singleNodeValue, 'xpath-span');
      }
      
      const allPhotoInfos = document.querySelectorAll('.photo-info');
      for (const photoInfo of allPhotoInfos) {
        const dateEl = photoInfo.querySelector('date');
        if (dateEl && !dateEl.dataset.embyChecked) {
          await checkElement(dateEl, 'photo-info-date');
        }
      }
      
    } catch (error) {
      console.error('Emby Checker error:', error);
    }
    
    isProcessing = false;
  }
  
  async function checkElement(element, type) {
    if (!element || element.dataset.embyChecked) return;
    
    const title = element.textContent?.trim();
    if (!title) return;
    
    element.dataset.embyChecked = 'pending';
    
    const result = await sendMessage({ 
      action: 'checkExists', 
      title: title 
    });
    
    if (result.exists) {
      markAsExists(element, result.item);
    } else if (result.needRefresh) {
      element.dataset.embyChecked = '';
    } else {
      markAsNotExists(element);
    }
  }
  
  function markAsExists(element, item) {
    element.dataset.embyChecked = 'exists';
    element.dataset.embyItemId = item.id;
    
    const badge = document.createElement('span');
    badge.className = 'emby-checker-badge emby-exists';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 1px;
      padding: 2px 6px;
      background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
      color: #fff;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.2;
      border-radius: 4px;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(82, 196, 26, 0.3);
      transition: all 0.2s ease;
      white-space: nowrap;
      vertical-align: middle;
    `;
    badge.textContent = '已收藏';
    badge.title = `${item.name}${item.year ? ` (${item.year})` : ''}\n点击在Emby中查看`;
    
    badge.addEventListener('mouseenter', () => {
      badge.style.transform = 'translateY(-1px)';
      badge.style.boxShadow = '0 2px 6px rgba(82, 196, 26, 0.4)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.transform = 'translateY(0)';
      badge.style.boxShadow = '0 1px 3px rgba(82, 196, 26, 0.3)';
    });
    
    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const response = await sendMessage({ action: 'getEmbyDirectLink', itemId: item.id });
      if (response.success) {
        window.open(response.url, '_blank');
      }
    });
    
    let insertTarget = null;
    if (element.tagName.toLowerCase() === 'date') {
      const photoInfo = element.closest('.photo-info');
      if (photoInfo) {
        insertTarget = photoInfo.querySelector('.item-tag');
      }
    }
    
    if (insertTarget && !insertTarget.querySelector('.emby-checker-badge')) {
      insertTarget.appendChild(badge);
    } else if (!element.nextElementSibling?.classList?.contains('emby-checker-badge')) {
      element.insertAdjacentElement('afterend', badge);
    }
  }
  
  function markAsNotExists(element) {
    element.dataset.embyChecked = 'not-exists';
    
    const badge = document.createElement('span');
    badge.className = 'emby-checker-badge emby-not-exists';
    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      margin-left: 1px;
      padding: 2px 6px;
      background: linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%);
      color: #fff;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.2;
      border-radius: 4px;
      white-space: nowrap;
      vertical-align: middle;
    `;
    badge.textContent = '未收藏';
    badge.title = 'Emby库中不存在';
    
    let insertTarget = null;
    if (element.tagName.toLowerCase() === 'date') {
      const photoInfo = element.closest('.photo-info');
      if (photoInfo) {
        insertTarget = photoInfo.querySelector('.item-tag');
      }
    }
    
    if (insertTarget && !insertTarget.querySelector('.emby-checker-badge')) {
      insertTarget.appendChild(badge);
    } else if (!element.nextElementSibling?.classList?.contains('emby-checker-badge')) {
      element.insertAdjacentElement('afterend', badge);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
