export function getSiteConfig(host) {
    return new Promise(resolve => {
      chrome.storage.sync.get(host, data => resolve(data[host]));
    });
  }
  
  export function setSiteConfig(host, config) {
    return new Promise(resolve => {
      chrome.storage.sync.set({ [host]: config }, resolve);
    });
  }