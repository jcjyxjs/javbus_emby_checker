let embyCache = {
  items: [],
  serverId: null,
  lastUpdate: 0,
  cacheDuration: 5 * 60 * 1000
};

const DEFAULT_DOMAINS = ['javbus.com', 'www.javbus.com'];

const DEFAULT_CONFIG = {
  emby: {
    apiKey: '',
    userId: '',
    serverUrl: ''
  },
  customDomains: [],
  selectors: {
    photoInfoDate: '.photo-info date:first-of-type',
    xpathSpan: '/html/body/div[5]/div[1]/div[2]/p[1]/span[2]'
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get('config');
  if (!result.config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
});

async function getConfig() {
  const result = await chrome.storage.local.get('config');
  const config = result.config || DEFAULT_CONFIG;
  
  const allDomains = [...DEFAULT_DOMAINS, ...(config.customDomains || [])];
  config.targetPages = allDomains.map(domain => ({
    name: domain,
    urlPattern: `*://${domain}/*`,
    enabled: true
  }));
  
  return config;
}

async function fetchEmbyItems(config) {
  const { apiKey, userId, serverUrl } = config.emby;
  
  try {
    const systemInfoUrl = `${serverUrl}/System/Info?api_key=${apiKey}`;
    const systemInfoResponse = await fetch(systemInfoUrl);
    const systemInfoData = await systemInfoResponse.json();
    const serverId = systemInfoData.Id;
    
    const moviesUrl = `${serverUrl}/Users/${userId}/Items?api_key=${apiKey}&IncludeItemTypes=Movie&Fields=Name,OriginalTitle,ProductionYear&Recursive=true`;
    const moviesResponse = await fetch(moviesUrl);
    const moviesData = await moviesResponse.json();
    
    const seriesUrl = `${serverUrl}/Users/${userId}/Items?api_key=${apiKey}&IncludeItemTypes=Series&Fields=Name,OriginalTitle,ProductionYear&Recursive=true`;
    const seriesResponse = await fetch(seriesUrl);
    const seriesData = await seriesResponse.json();
    
    const allItems = [
      ...(moviesData.Items || []),
      ...(seriesData.Items || [])
    ];
    
    const exactIndex = new Map();
    const cleanIndex = new Map();
    
    allItems.forEach(item => {
      const itemInfo = {
        id: item.Id,
        name: item.Name,
        year: item.ProductionYear,
        type: item.Type
      };
      
      const titles = [item.Name, item.OriginalTitle].filter(Boolean);
      
      titles.forEach(title => {
        const lowerTitle = title.toLowerCase().trim();
        if (lowerTitle && !exactIndex.has(lowerTitle)) {
          exactIndex.set(lowerTitle, itemInfo);
        }
        
        const cleanedTitle = cleanTitleForMatch(title);
        if (cleanedTitle && !cleanIndex.has(cleanedTitle)) {
          cleanIndex.set(cleanedTitle, itemInfo);
        }
      });
    });
    
    embyCache = {
      items: allItems,
      serverId: serverId,
      exactIndex: exactIndex,
      cleanIndex: cleanIndex,
      lastUpdate: Date.now(),
      cacheDuration: 5 * 60 * 1000
    };
    
    return { success: true, count: allItems.length, serverId: serverId };
  } catch (error) {
    console.error('Emby data fetch error:', error);
    return { success: false, error: error.message };
  }
}

function cleanTitleForMatch(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*/g, '')
    .replace(/\s*\[\d{4}\]\s*/g, '')
    .replace(/[【】《》「」『』]/g, '')
    .replace(/[:：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCode(title) {
  if (!title) return null;
  const match = title.match(/([a-zA-Z]{2,6})[-_]?(\d{3,5})/i);
  if (match) {
    return {
      prefix: match[1].toUpperCase(),
      number: match[2],
      full: match[1].toUpperCase() + '-' + match[2]
    };
  }
  return null;
}

function checkMovieExists(title) {
  if (!embyCache.exactIndex || Date.now() - embyCache.lastUpdate > embyCache.cacheDuration) {
    return { exists: false, needRefresh: true };
  }
  
  const searchTitle = title.trim();
  const lowerSearch = searchTitle.toLowerCase();
  const cleanSearch = cleanTitleForMatch(searchTitle);
  const searchCode = extractCode(searchTitle);
  
  let item = embyCache.exactIndex.get(lowerSearch);
  if (item) {
    return { exists: true, item: item, needRefresh: false, matchType: 'exact' };
  }
  
  item = embyCache.cleanIndex.get(cleanSearch);
  if (item) {
    return { exists: true, item: item, needRefresh: false, matchType: 'clean' };
  }
  
  if (searchCode) {
    for (const [key, value] of embyCache.exactIndex) {
      const embyCode = extractCode(key);
      if (embyCode && embyCode.full === searchCode.full) {
        return { exists: true, item: value, needRefresh: false, matchType: 'code_exact' };
      }
    }
  }
  
  for (const [key, value] of embyCache.exactIndex) {
    const keyCode = extractCode(key);
    
    if (searchCode && keyCode && searchCode.full !== keyCode.full) {
      continue;
    }
    
    if (cleanSearch.length >= 4 && key.includes(cleanSearch)) {
      return { exists: true, item: value, needRefresh: false, matchType: 'contains' };
    }
  }
  
  return { exists: false, needRefresh: false };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    const config = await getConfig();
    
    switch (request.action) {
      case 'getConfig':
        sendResponse({ success: true, config });
        break;
        
      case 'saveConfig':
        const newConfig = {
          emby: request.config.emby,
          customDomains: request.config.customDomains || [],
          selectors: DEFAULT_CONFIG.selectors
        };
        await chrome.storage.local.set({ config: newConfig });
        embyCache.lastUpdate = 0;
        sendResponse({ success: true });
        break;
        
      case 'saveDomains':
        const currentConfig = await chrome.storage.local.get('config');
        const updatedConfig = currentConfig.config || DEFAULT_CONFIG;
        updatedConfig.customDomains = request.customDomains;
        await chrome.storage.local.set({ config: updatedConfig });
        sendResponse({ success: true });
        break;
        
      case 'refreshEmbyData':
        const result = await fetchEmbyItems(config);
        sendResponse(result);
        break;
        
      case 'checkExists':
        if (!embyCache.exactIndex || Date.now() - embyCache.lastUpdate > embyCache.cacheDuration) {
          await fetchEmbyItems(config);
        }
        const checkResult = checkMovieExists(request.title);
        sendResponse(checkResult);
        break;
        
      case 'getEmbyDirectLink':
        if (request.itemId && embyCache.serverId) {
          const directUrl = `${config.emby.serverUrl}/web/index.html#!/item?id=${request.itemId}&serverId=${embyCache.serverId}`;
          sendResponse({ success: true, url: directUrl });
        } else {
          sendResponse({ success: false });
        }
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  })();
  
  return true;
});
