const DEFAULT_DOMAINS = ['javbus.com', 'www.javbus.com'];

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  document.getElementById('refreshBtn').addEventListener('click', refreshEmbyData);
  document.getElementById('addDomainBtn').addEventListener('click', addDomain);
  document.getElementById('newDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addDomain();
  });
});

async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  if (response && response.success) {
    const config = response.config;
    document.getElementById('serverUrl').value = config.emby?.serverUrl || '';
    document.getElementById('apiKey').value = config.emby?.apiKey || '';
    document.getElementById('userId').value = config.emby?.userId || '';
    renderDomainList(config.customDomains || []);
  }
}

function renderDomainList(customDomains) {
  const listEl = document.getElementById('domainList');
  listEl.innerHTML = '';
  
  DEFAULT_DOMAINS.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'domain-item default';
    item.innerHTML = `
      <span>${domain}</span>
      <button class="delete-btn" disabled title="Default domain">×</button>
    `;
    listEl.appendChild(item);
  });
  
  customDomains.forEach((domain, index) => {
    const item = document.createElement('div');
    item.className = 'domain-item';
    item.innerHTML = `
      <span>${domain}</span>
      <button class="delete-btn" data-index="${index}" title="Delete">×</button>
    `;
    listEl.appendChild(item);
  });
  
  listEl.querySelectorAll('.delete-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deleteDomain(index);
    });
  });
}

async function addDomain() {
  const input = document.getElementById('newDomain');
  const domain = input.value.trim().toLowerCase();
  
  if (!domain) {
    showStatus('Please enter domain', 'error');
    return;
  }
  
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  const customDomains = response.config?.customDomains || [];
  const allDomains = [...DEFAULT_DOMAINS, ...customDomains];
  
  if (allDomains.includes(domain)) {
    showStatus('Domain already exists', 'error');
    return;
  }
  
  customDomains.push(domain);
  await saveCustomDomains(customDomains);
  renderDomainList(customDomains);
  input.value = '';
  showStatus('Domain added', 'success');
}

async function deleteDomain(index) {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  const customDomains = response.config?.customDomains || [];
  customDomains.splice(index, 1);
  await saveCustomDomains(customDomains);
  renderDomainList(customDomains);
  showStatus('Domain deleted', 'success');
}

async function saveCustomDomains(customDomains) {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  const config = response.config || {};
  config.customDomains = customDomains;
  await chrome.runtime.sendMessage({ action: 'saveDomains', customDomains: customDomains });
}

async function saveConfig() {
  const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
  const customDomains = response.config?.customDomains || [];
  
  const config = {
    emby: {
      serverUrl: document.getElementById('serverUrl').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      userId: document.getElementById('userId').value.trim()
    },
    customDomains: customDomains
  };
  
  const saveResponse = await chrome.runtime.sendMessage({ 
    action: 'saveConfig', 
    config: config 
  });
  
  if (saveResponse && saveResponse.success) {
    showStatus('Saved', 'success');
    await refreshEmbyData();
  } else {
    showStatus('Failed', 'error');
  }
}

async function refreshEmbyData() {
  showStatus('Refreshing...', 'success');
  
  const response = await chrome.runtime.sendMessage({ action: 'refreshEmbyData' });
  
  if (response && response.success) {
    document.getElementById('movieCount').textContent = response.count;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    showStatus(`Loaded ${response.count} items`, 'success');
  } else {
    showStatus('Failed: ' + (response?.error || 'Unknown error'), 'error');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 2000);
}
