/**
 * Popup Script for Resume Autofill Pro
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const autofillBtn = document.getElementById('autofillBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const humanModeToggle = document.getElementById('humanMode');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const siteType = document.getElementById('siteType');
    const resultDiv = document.getElementById('result');
    
    // Profile preview elements
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    const profileLocation = document.getElementById('profileLocation');
    
    // Load profile and settings
    await loadProfilePreview();
    await loadSettings();
    await checkCurrentTab();
    
    // Event listeners
    autofillBtn.addEventListener('click', handleAutofill);
    settingsBtn.addEventListener('click', openSettings);
    humanModeToggle.addEventListener('change', saveSettings);
    
    document.getElementById('helpLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://github.com/your-repo/autofill-pro#readme' });
    });
    
    document.getElementById('statsLink').addEventListener('click', async (e) => {
        e.preventDefault();
        const stats = await chrome.runtime.sendMessage({ action: 'getStatistics' });
        showResult(`Filled ${stats.totalFieldsFilled || 0} fields across ${stats.totalApplications || 0} applications`, 'success');
    });
    
    /**
     * Load profile preview
     */
    async function loadProfilePreview() {
        try {
            const profile = await chrome.runtime.sendMessage({ action: 'getProfile' });
            
            if (profile && Object.keys(profile).length > 0) {
                const firstName = profile.firstName || profile.personalInfo?.firstName || '';
                const lastName = profile.lastName || profile.personalInfo?.lastName || '';
                const email = profile.email || profile.contactInfo?.email || '';
                const phone = profile.phone || profile.contactInfo?.phone || '';
                const city = profile.currentCity || profile.location?.currentCity || '';
                
                profileName.textContent = firstName || lastName 
                    ? `${firstName} ${lastName}`.trim() 
                    : '-';
                profileName.classList.toggle('empty', !firstName && !lastName);
                
                profileEmail.textContent = email || '-';
                profileEmail.classList.toggle('empty', !email);
                
                profilePhone.textContent = phone || '-';
                profilePhone.classList.toggle('empty', !phone);
                
                profileLocation.textContent = city || '-';
                profileLocation.classList.toggle('empty', !city);
            } else {
                setEmptyProfile();
            }
        } catch (err) {
            console.error('Failed to load profile:', err);
            setEmptyProfile();
        }
    }
    
    function setEmptyProfile() {
        profileName.textContent = 'Not set';
        profileName.classList.add('empty');
        profileEmail.textContent = 'Not set';
        profileEmail.classList.add('empty');
        profilePhone.textContent = 'Not set';
        profilePhone.classList.add('empty');
        profileLocation.textContent = 'Not set';
        profileLocation.classList.add('empty');
    }
    
    /**
     * Load settings
     */
    async function loadSettings() {
        try {
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            humanModeToggle.checked = settings.useHumanEmulation ?? true;
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }
    
    /**
     * Save settings
     */
    async function saveSettings() {
        try {
            await chrome.runtime.sendMessage({
                action: 'saveSettings',
                settings: {
                    useHumanEmulation: humanModeToggle.checked
                }
            });
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    }
    
    /**
     * Check current tab status
     */
    async function checkCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url) {
                setStatus('inactive', 'No active tab');
                return;
            }
            
            // Check if it's a supported URL
            const url = new URL(tab.url);
            const hostname = url.hostname.toLowerCase();
            
            // Detect site type
            let site = 'Generic';
            if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) site = 'Workday';
            else if (hostname.includes('greenhouse.io')) site = 'Greenhouse';
            else if (hostname.includes('lever.co')) site = 'Lever';
            else if (hostname.includes('linkedin.com')) site = 'LinkedIn';
            else if (hostname.includes('indeed.com')) site = 'Indeed';
            else if (hostname.includes('icims.com')) site = 'iCIMS';
            else if (hostname.includes('smartrecruiters.com')) site = 'SmartRecruiters';
            
            siteType.textContent = site;
            
            // Try to ping content script
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                if (response && response.status === 'ok') {
                    setStatus('active', 'Ready');
                } else {
                    setStatus('inactive', 'Initializing...');
                }
            } catch (err) {
                // Content script not loaded yet
                setStatus('inactive', 'Page not ready');
            }
        } catch (err) {
            console.error('Failed to check tab:', err);
            setStatus('error', 'Error');
        }
    }
    
    /**
     * Set status indicator
     */
    function setStatus(type, text) {
        statusDot.className = 'status-dot';
        if (type === 'inactive') statusDot.classList.add('inactive');
        if (type === 'error') statusDot.classList.add('error');
        statusText.textContent = text;
    }
    
    /**
     * Handle autofill button click
     */
    async function handleAutofill() {
        const originalText = autofillBtn.innerHTML;
        
        try {
            // Update button to loading state
            autofillBtn.disabled = true;
            autofillBtn.innerHTML = '<span class="spinner"></span> Filling...';
            setStatus('active', 'Filling...');
            hideResult();
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                showResult('No active tab found', 'error');
                return;
            }
            
            // Send autofill message to content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'autofill',
                options: {
                    useHumanEmulation: humanModeToggle.checked
                }
            });
            
            if (response.success) {
                showResult(`✓ Filled ${response.filled} of ${response.total} fields`, 'success');
                setStatus('active', 'Complete');
                
                // Update statistics
                await chrome.runtime.sendMessage({
                    action: 'updateStatistics',
                    filled: response.filled,
                    total: response.total
                });
            } else if (response.error) {
                showResult(`Error: ${response.error}`, 'error');
                setStatus('error', 'Error');
            } else {
                showResult('No fields were filled', 'warning');
                setStatus('inactive', 'No matches');
            }
        } catch (err) {
            console.error('Autofill error:', err);
            showResult('Failed to autofill. Try refreshing the page.', 'error');
            setStatus('error', 'Error');
        } finally {
            // Restore button
            autofillBtn.disabled = false;
            autofillBtn.innerHTML = originalText;
        }
    }
    
    /**
     * Open settings/options page
     */
    function openSettings() {
        chrome.runtime.openOptionsPage();
    }
    
    /**
     * Show result message
     */
    function showResult(message, type) {
        resultDiv.textContent = message;
        resultDiv.className = `result ${type}`;
    }
    
    /**
     * Hide result message
     */
    function hideResult() {
        resultDiv.className = 'result';
    }
});
