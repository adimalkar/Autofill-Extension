/**
 * Options Page Script for Resume Autofill Pro
 * 
 * Features:
 * - Profile management (load, save, export, import)
 * - Resume parsing with Tier 1 regex extraction
 * - Settings configuration
 */

// Import resume parser (dynamically loaded to avoid bundling issues)
let parserCore = null;

async function loadParserModule() {
    try {
        parserCore = await import('./lib/resume-parser/parser-core.js');
        console.log('[Options] Resume parser module loaded');
        return true;
    } catch (err) {
        console.error('[Options] Failed to load parser module:', err);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load parser module
    await loadParserModule();
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.querySelector(`.tab-content[data-tab="${targetTab}"]`).classList.add('active');
        });
    });
    
    // Form field IDs
    const profileFields = [
        // Personal
        'firstName', 'lastName', 'middleName', 'preferredName',
        'email', 'phone',
        'currentCity', 'currentState', 'zipCode', 'country',
        // Professional
        'linkedinUrl', 'githubUrl', 'portfolioWebsite',
        'currentEmployer', 'currentJobTitle', 'jobStartDate', 'jobEndDate',
        'jobDescription', 'reasonForLeaving', 'skills',
        // Education
        'schoolName', 'degreeType', 'major', 'gpa', 
        'educationStartDate', 'educationEndDate',
        // Preferences
        'workAuthorization', 'sponsorshipRequired',
        'desiredSalary', 'noticePeriod', 'relocationPreference', 'howDidYouHear',
        'coverLetterTemplate'
    ];
    
    const settingsFields = [
        'useHumanEmulation', 'showNotifications', 'highlightFilledFields', 'tier3Enabled'
    ];
    
    // Load data
    await loadProfile();
    await loadSettings();
    
    // Event listeners
    document.getElementById('saveBtn').addEventListener('click', saveAll);
    document.getElementById('cancelBtn').addEventListener('click', () => window.close());
    document.getElementById('exportBtn').addEventListener('click', exportProfile);
    document.getElementById('resetBtn').addEventListener('click', resetData);
    document.getElementById('importFile').addEventListener('change', importProfile);
    
    // Toggle API key section
    document.getElementById('tier3Enabled').addEventListener('change', (e) => {
        document.getElementById('apiKeySection').style.display = e.target.checked ? 'block' : 'none';
    });
    
    // Resume import functionality
    setupResumeImport();
    
    /**
     * Load profile from storage
     */
    async function loadProfile() {
        try {
            const profile = await chrome.runtime.sendMessage({ action: 'getProfile' });
            
            if (profile) {
                profileFields.forEach(field => {
                    const element = document.getElementById(field);
                    if (element && profile[field] !== undefined) {
                        if (element.type === 'checkbox') {
                            element.checked = profile[field];
                        } else {
                            element.value = profile[field];
                        }
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load profile:', err);
        }
    }
    
    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            const apiKeys = await chrome.runtime.sendMessage({ action: 'getApiKeys' });
            
            if (settings) {
                settingsFields.forEach(field => {
                    const element = document.getElementById(field);
                    if (element && settings[field] !== undefined) {
                        element.checked = settings[field];
                    }
                });
                
                // Show API key section if tier3 is enabled
                if (settings.tier3Enabled) {
                    document.getElementById('apiKeySection').style.display = 'block';
                }
                
                // Load preferred provider
                if (settings.preferredProvider) {
                    const providerSelect = document.getElementById('preferredProvider');
                    if (providerSelect) {
                        providerSelect.value = settings.preferredProvider;
                    }
                }
            }
            
            if (apiKeys) {
                if (apiKeys.openrouter) document.getElementById('openrouterKey').value = apiKeys.openrouter;
                if (apiKeys.openai) document.getElementById('openaiKey').value = apiKeys.openai;
                if (apiKeys.gemini) document.getElementById('geminiKey').value = apiKeys.gemini;
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }
    
    /**
     * Save all data
     */
    async function saveAll() {
        try {
            // Collect profile data
            const profile = {};
            profileFields.forEach(field => {
                const element = document.getElementById(field);
                if (element) {
                    if (element.type === 'checkbox') {
                        profile[field] = element.checked;
                    } else {
                        profile[field] = element.value;
                    }
                }
            });
            
            // Collect settings
            const settings = {};
            settingsFields.forEach(field => {
                const element = document.getElementById(field);
                if (element) {
                    settings[field] = element.checked;
                }
            });
            
            // Add preferred provider
            const providerSelect = document.getElementById('preferredProvider');
            if (providerSelect) {
                settings.preferredProvider = providerSelect.value;
            }
            
            // Collect API keys
            const apiKeys = {
                openrouter: document.getElementById('openrouterKey').value,
                openai: document.getElementById('openaiKey').value,
                gemini: document.getElementById('geminiKey').value
            };
            
            // Save everything
            await chrome.runtime.sendMessage({ action: 'saveProfile', profile });
            await chrome.runtime.sendMessage({ action: 'saveSettings', settings });
            await chrome.runtime.sendMessage({ action: 'saveApiKeys', keys: apiKeys });
            
            showMessage('Settings saved successfully!', 'success');
        } catch (err) {
            console.error('Failed to save:', err);
            showMessage('Failed to save settings: ' + err.message, 'error');
        }
    }
    
    /**
     * Export profile to JSON file
     */
    async function exportProfile() {
        try {
            const profile = await chrome.runtime.sendMessage({ action: 'getProfile' });
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            
            const exportData = {
                profile,
                settings,
                exportDate: new Date().toISOString(),
                version: '2.0.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `autofill-pro-profile-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            showMessage('Profile exported successfully!', 'success');
        } catch (err) {
            console.error('Export failed:', err);
            showMessage('Failed to export: ' + err.message, 'error');
        }
    }
    
    /**
     * Import profile from JSON file
     */
    async function importProfile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.profile) {
                await chrome.runtime.sendMessage({ action: 'saveProfile', profile: data.profile });
            }
            
            if (data.settings) {
                await chrome.runtime.sendMessage({ action: 'saveSettings', settings: data.settings });
            }
            
            // Reload the page to show imported data
            await loadProfile();
            await loadSettings();
            
            showMessage('Profile imported successfully!', 'success');
        } catch (err) {
            console.error('Import failed:', err);
            showMessage('Failed to import: ' + err.message, 'error');
        }
        
        // Reset file input
        event.target.value = '';
    }
    
    /**
     * Reset all data
     */
    async function resetData() {
        if (!confirm('Are you sure you want to reset all data? This cannot be undone.')) {
            return;
        }
        
        try {
            await chrome.storage.sync.clear();
            await chrome.storage.local.clear();
            
            showMessage('All data has been reset.', 'success');
            
            // Reload page
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            console.error('Reset failed:', err);
            showMessage('Failed to reset: ' + err.message, 'error');
        }
    }
    
    /**
     * Show message
     */
    function showMessage(text, type) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }
    
    // =====================================================
    // Resume Import Functionality
    // =====================================================
    
    let lastParsedData = null;
    
    /**
     * Setup resume import handlers
     */
    function setupResumeImport() {
        const dropZone = document.getElementById('resumeDropZone');
        const fileInput = document.getElementById('resumeFileInput');
        const modal = document.getElementById('parsingResultsModal');
        const closeBtn = document.getElementById('closeModal');
        const discardBtn = document.getElementById('discardParsed');
        const applyBtn = document.getElementById('applyParsed');
        
        // Click to open file dialog
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        // File selected
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await handleResumeFile(file);
            }
            // Reset input for same file selection
            e.target.value = '';
        });
        
        // Drag and drop handlers
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                await handleResumeFile(file);
            }
        });
        
        // Modal close
        closeBtn.addEventListener('click', closeModal);
        discardBtn.addEventListener('click', closeModal);
        
        // Apply parsed data
        applyBtn.addEventListener('click', applyParsedData);
        
        // Close modal on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    /**
     * Handle resume file upload
     */
    async function handleResumeFile(file) {
        if (!parserCore) {
            showMessage('Resume parser not loaded. Please refresh the page.', 'error');
            return;
        }
        
        const progressContainer = document.getElementById('parsingProgress');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        
        // Show progress
        progressContainer.classList.add('active');
        progressBar.style.width = '0%';
        progressText.textContent = 'Starting...';
        
        try {
            // Check if Tier 3 is enabled and API keys are configured
            const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
            const enableTier3 = settings?.tier3Enabled || false;
            
            console.log('[Options] Settings received:', settings);
            console.log('[Options] enableTier3:', enableTier3);
            
            // Parse the resume with appropriate options
            const result = await parserCore.parseResume(file, {
                enableTier3: enableTier3,
                onProgress: (info) => {
                    progressBar.style.width = `${Math.round(info.progress * 100)}%`;
                    progressText.textContent = info.message;
                }
            });
            
            // Hide progress
            setTimeout(() => {
                progressContainer.classList.remove('active');
            }, 500);
            
            if (result.success) {
                lastParsedData = result;
                showParsingResults(result);
                
                // Show LLM info if used
                if (result.llmInfo) {
                    console.log('[Options] LLM used:', result.llmInfo);
                }
                
                // Show tiers used
                console.log('[Options] Tiers used:', result.tiersUsed);
                
                // Show warnings if any
                if (result.warnings && result.warnings.length > 0) {
                    console.warn('[Options] Parsing warnings:', result.warnings);
                    // Also show to user if significant
                    result.warnings.forEach(w => console.warn('[Options] Warning:', w));
                }
            } else {
                console.error('[Options] Parsing failed:', result.errors);
                showMessage(`Parsing failed: ${result.errors.join(', ')}`, 'error');
            }
            
        } catch (err) {
            console.error('[Options] Resume parsing error:', err);
            progressContainer.classList.remove('active');
            showMessage(`Error parsing resume: ${err.message}`, 'error');
        }
    }
    
    /**
     * Display parsing results in modal
     */
    function showParsingResults(result) {
        const modal = document.getElementById('parsingResultsModal');
        
        // Update file info
        if (result.fileInfo) {
            document.getElementById('parsedFileName').textContent = result.fileInfo.name || 'Resume';
            const meta = [];
            if (result.fileInfo.format) meta.push(result.fileInfo.format.toUpperCase());
            if (result.fileInfo.pages) meta.push(`${result.fileInfo.pages} page${result.fileInfo.pages > 1 ? 's' : ''}`);
            if (result.fileInfo.size) meta.push(formatFileSize(result.fileInfo.size));
            document.getElementById('parsedFileMeta').textContent = meta.join(' • ');
        }
        
        // Update stats
        const summary = result.summary || {};
        document.getElementById('statFieldsFound').textContent = summary.fieldsFound || 0;
        document.getElementById('statHighConfidence').textContent = summary.highConfidence || 0;
        document.getElementById('statNeedsReview').textContent = summary.needsReview || 0;
        
        // Update recommendation with tier info
        const recEl = document.getElementById('parsingRecommendation');
        let recommendation = summary.recommendation || 'Review the extracted information below.';
        
        // Add tier info
        if (result.tiersUsed && result.tiersUsed.includes('tier3')) {
            const llmInfo = result.llmInfo || {};
            recommendation = `AI-powered parsing used (${llmInfo.model || 'LLM'}). ` + recommendation;
            recEl.className = 'message success';
        } else {
            recommendation = 'Basic parsing used. For better accuracy, enable AI parsing in Settings and add an API key. ' + recommendation;
            recEl.className = `message ${summary.confidence === 'high' ? 'success' : ''}`;
        }
        
        recEl.textContent = recommendation;
        
        // Populate fields list
        populateFieldsList(result.data, result.scores);
        
        // Show modal
        modal.classList.add('active');
    }
    
    /**
     * Populate the parsed fields list in modal
     */
    function populateFieldsList(data, scores) {
        const container = document.getElementById('parsedFieldsList');
        container.innerHTML = '';
        
        // Field display name mapping
        const fieldLabels = {
            firstName: 'First Name',
            lastName: 'Last Name',
            middleName: 'Middle Name',
            fullName: 'Full Name',
            email: 'Email',
            phone: 'Phone',
            linkedinUrl: 'LinkedIn URL',
            githubUrl: 'GitHub URL',
            portfolioWebsite: 'Portfolio Website',
            currentCity: 'City',
            currentState: 'State',
            zipCode: 'ZIP Code',
            country: 'Country',
            gpa: 'GPA',
            skills: 'Skills',
            schoolName: 'School/University',
            degreeType: 'Degree Type',
            major: 'Major/Field of Study',
            educationStartDate: 'Education Start Date',
            educationEndDate: 'Education End Date',
            currentJobTitle: 'Job Title',
            currentEmployer: 'Employer',
            jobStartDate: 'Job Start Date',
            jobEndDate: 'Job End Date',
            jobDescription: 'Job Description'
        };
        
        // Priority order for display
        const priorityFields = [
            'firstName', 'lastName', 'middleName', 'email', 'phone',
            'linkedinUrl', 'githubUrl', 'portfolioWebsite',
            'currentCity', 'currentState', 'zipCode', 'country',
            'currentEmployer', 'currentJobTitle', 'jobStartDate', 'jobEndDate', 'jobDescription',
            'schoolName', 'degreeType', 'major', 'gpa', 'educationStartDate', 'educationEndDate',
            'skills'
        ];
        
        // Add fields in priority order, then remaining
        const displayedFields = new Set();
        
        for (const field of priorityFields) {
            if (data[field] && data[field].toString().trim()) {
                addFieldRow(container, field, data[field], scores[field], fieldLabels[field] || formatFieldName(field));
                displayedFields.add(field);
            }
        }
        
        // Add remaining fields
        for (const [field, value] of Object.entries(data)) {
            if (displayedFields.has(field)) continue;
            if (field.startsWith('_') || typeof value === 'object') continue;
            if (!value || !value.toString().trim()) continue;
            
            addFieldRow(container, field, value, scores[field], fieldLabels[field] || formatFieldName(field));
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #64748b; padding: 24px;">No fields were extracted from the resume.</p>';
        }
    }
    
    /**
     * Add a field row to the container
     */
    function addFieldRow(container, fieldId, value, scoreData, label) {
        const row = document.createElement('div');
        row.className = 'parsed-field-row';
        
        const confidenceClass = scoreData?.confidence || 'medium';
        const confidenceLabel = (scoreData?.confidence || 'medium').replace('_', ' ');
        
        row.innerHTML = `
            <div class="parsed-field-label">${label}</div>
            <div class="parsed-field-value">
                <input type="text" data-field="${fieldId}" value="${escapeHtml(value.toString())}" />
            </div>
            <div>
                <span class="confidence-badge confidence-${confidenceClass}">${confidenceLabel}</span>
            </div>
        `;
        
        container.appendChild(row);
    }
    
    /**
     * Apply parsed data to profile fields
     */
    async function applyParsedData() {
        if (!lastParsedData || !lastParsedData.data) {
            closeModal();
            return;
        }
        
        // Get values from modal inputs (user may have edited them)
        const modalInputs = document.querySelectorAll('#parsedFieldsList input[data-field]');
        const correctedData = {};
        
        modalInputs.forEach(input => {
            const field = input.dataset.field;
            const value = input.value.trim();
            if (value) {
                correctedData[field] = value;
            }
        });
        
        // Map parsed fields to form fields
        const fieldMapping = {
            firstName: 'firstName',
            lastName: 'lastName',
            middleName: 'middleName',
            email: 'email',
            phone: 'phone',
            linkedinUrl: 'linkedinUrl',
            githubUrl: 'githubUrl',
            portfolioWebsite: 'portfolioWebsite',
            currentCity: 'currentCity',
            currentState: 'currentState',
            zipCode: 'zipCode',
            country: 'country',
            gpa: 'gpa',
            skills: 'skills',
            schoolName: 'schoolName',
            degreeType: 'degreeType',
            major: 'major',
            educationStartDate: 'educationStartDate',
            educationEndDate: 'educationEndDate',
            currentJobTitle: 'currentJobTitle',
            currentEmployer: 'currentEmployer',
            jobStartDate: 'jobStartDate',
            jobEndDate: 'jobEndDate',
            jobDescription: 'jobDescription'
        };
        
        // Degree type mapping for dropdown
        const degreeTypeMap = {
            'bachelor of science': 'Bachelor of Science',
            'bs': 'Bachelor of Science',
            'bsc': 'Bachelor of Science',
            'b.s.': 'Bachelor of Science',
            'b.sc.': 'Bachelor of Science',
            'bachelor of arts': 'Bachelor of Arts',
            'ba': 'Bachelor of Arts',
            'b.a.': 'Bachelor of Arts',
            'bachelor of engineering': 'Bachelor of Engineering',
            'be': 'Bachelor of Engineering',
            'btech': 'Bachelor of Engineering',
            'b.tech': 'Bachelor of Engineering',
            'b.e.': 'Bachelor of Engineering',
            'master of science': 'Master of Science',
            'ms': 'Master of Science',
            'msc': 'Master of Science',
            'm.s.': 'Master of Science',
            'm.sc.': 'Master of Science',
            'master of arts': 'Master of Arts',
            'ma': 'Master of Arts',
            'm.a.': 'Master of Arts',
            'master of engineering': 'Master of Engineering',
            'me': 'Master of Engineering',
            'mtech': 'Master of Engineering',
            'm.tech': 'Master of Engineering',
            'm.e.': 'Master of Engineering',
            'master of business administration': 'Master of Business Administration',
            'mba': 'Master of Business Administration',
            'm.b.a.': 'Master of Business Administration',
            'doctor of philosophy': 'Doctor of Philosophy',
            'phd': 'Doctor of Philosophy',
            'ph.d.': 'Doctor of Philosophy',
            'doctorate': 'Doctor of Philosophy',
            'associate': 'Associate',
            "associate's": 'Associate',
            'high school': 'High School',
            'high school diploma': 'High School',
            'certificate': 'Certificate',
            'bootcamp': 'Bootcamp'
        };
        
        // Apply to form fields
        let fieldsApplied = 0;
        for (const [parsedField, formField] of Object.entries(fieldMapping)) {
            let value = correctedData[parsedField];
            if (value) {
                const element = document.getElementById(formField);
                if (element) {
                    // Special handling for dropdown fields
                    if (element.tagName === 'SELECT') {
                        // Map the value to dropdown option
                        if (parsedField === 'degreeType') {
                            const normalizedValue = value.toLowerCase().trim();
                            const mappedValue = degreeTypeMap[normalizedValue];
                            if (mappedValue) {
                                value = mappedValue;
                            }
                            // Try to find matching option
                            const options = Array.from(element.options);
                            const matchingOption = options.find(opt => 
                                opt.value.toLowerCase() === value.toLowerCase() ||
                                opt.text.toLowerCase().includes(value.toLowerCase()) ||
                                value.toLowerCase().includes(opt.value.toLowerCase())
                            );
                            if (matchingOption) {
                                element.value = matchingOption.value;
                            } else {
                                console.warn(`[Options] No matching dropdown option for ${parsedField}:`, value);
                                continue;
                            }
                        }
                    } else {
                        element.value = value;
                    }
                    // Visual highlight
                    element.style.backgroundColor = '#dcfce7';
                    setTimeout(() => {
                        element.style.backgroundColor = '';
                    }, 2000);
                    fieldsApplied++;
                }
            }
        }
        
        // Close modal
        closeModal();
        
        // Show success message
        showMessage(`Applied ${fieldsApplied} fields from resume. Review and save your profile.`, 'success');
        
        // Switch to personal tab to show results
        document.querySelector('.tab[data-tab="personal"]').click();
    }
    
    /**
     * Close the modal
     */
    function closeModal() {
        document.getElementById('parsingResultsModal').classList.remove('active');
    }
    
    /**
     * Format field name for display
     */
    function formatFieldName(field) {
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }
    
    /**
     * Format file size
     */
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    /**
     * Escape HTML for safe display
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
