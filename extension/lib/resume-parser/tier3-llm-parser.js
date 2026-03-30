/**
 * Tier 3 LLM-based Resume Parser
 * 
 * Uses cloud LLM APIs (OpenRouter/DeepSeek/OpenAI/Gemini) for accurate
 * resume parsing. This handles complex extraction that regex can't do.
 * 
 * Advantages:
 * - Handles any resume format
 * - Extracts context-dependent information
 * - No need for format-specific regex patterns
 * - Works with ALL CAPS, Title Case, any layout
 */

/**
 * LLM Provider configurations
 */
const PROVIDERS = {
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        models: {
            cheap: 'deepseek/deepseek-chat',
            balanced: 'openai/gpt-4o-mini',
            best: 'openai/gpt-4o'
        },
        getHeaders: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': chrome.runtime.getURL(''),
            'X-Title': 'Resume Autofill Pro'
        })
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        models: {
            cheap: 'gpt-4o-mini',
            balanced: 'gpt-4o-mini',
            best: 'gpt-4o'
        },
        getHeaders: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        })
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        models: {
            // Use stable model names that are widely available
            cheap: 'gemini-1.5-flash-latest',
            balanced: 'gemini-1.5-flash-latest',
            best: 'gemini-1.5-pro-latest'
        },
        getHeaders: () => ({
            'Content-Type': 'application/json'
        })
    }
};

/**
 * System prompt for resume parsing
 */
const RESUME_PARSING_PROMPT = `You are a precise resume parser. Extract ONLY information that is EXPLICITLY written in the resume text.

Return a JSON object with these fields. Use null for ANY field not explicitly found in the resume:

{
  "firstName": "string or null",
  "lastName": "string or null", 
  "middleName": "string or null",
  "email": "string or null",
  "phone": "string or null - include country code if present",
  "currentCity": "string or null - city name only",
  "currentState": "string or null - 2-letter state code (e.g., NJ, CA, NY)",
  "zipCode": "string or null - 5-digit US ZIP code ONLY if explicitly written as address",
  "country": "string or null",
  "linkedinUrl": "FULL URL starting with https://linkedin.com/in/ or null",
  "githubUrl": "FULL URL starting with https://github.com/ or null",
  "portfolioWebsite": "FULL URL or null",
  "schoolName": "string or null - most recent institution name",
  "degreeType": "One of: Bachelor of Science, Bachelor of Arts, Bachelor of Engineering, Master of Science, Master of Arts, Master of Engineering, Master of Business Administration, Doctor of Philosophy, Associate, High School, or null",
  "major": "string or null - field of study",
  "gpa": "string or null - format as X.X or X.X/4.0",
  "educationStartDate": "string or null - format as Month Year (e.g., Aug 2021)",
  "educationEndDate": "string or null - format as Month Year or 'Expected Month Year' or 'Present'",
  "currentEmployer": "string or null - most recent company name",
  "currentJobTitle": "string or null - most recent job title",
  "jobStartDate": "string or null - format as Month Year",
  "jobEndDate": "string or null - format as Month Year or 'Present'",
  "jobDescription": "string or null - brief summary of responsibilities and achievements",
  "skills": "comma-separated string or null",
  "certifications": ["array of strings"] or null
}

CRITICAL RULES - MUST FOLLOW:
1. NEVER invent, guess, or fabricate ANY information. If data is not in the resume, return null.
2. ZIP CODE: Only extract if a 5-digit ZIP code explicitly appears as part of an address. 
   - Phone numbers are NOT ZIP codes.
   - If no ZIP code in address, return null.
3. URLS: Only extract if the FULL URL appears in the text.
   - If you see just "LinkedIn" or "GitHub" text without a URL, return null.
   - If you see "linkedin.com/in/username", prepend "https://".
   - NEVER create placeholder URLs.
4. DATES: Extract dates in "Month Year" format (e.g., "Jan 2023", "May 2024").
   - Look for date ranges near education and work experience entries.
   - If ongoing, use "Present".
5. JOB DESCRIPTION: Summarize the bullet points under the job title (max 200 chars).
6. Return ONLY valid JSON, no markdown, no explanation.`;

/**
 * Parse resume using LLM API
 * @param {string} resumeText - The resume text content
 * @param {Object} options - Parsing options
 * @param {string} options.provider - 'openrouter', 'openai', or 'gemini'
 * @param {string} options.apiKey - API key for the provider
 * @param {string} options.quality - 'cheap', 'balanced', or 'best'
 * @returns {Promise<Object>} Parsed resume data
 */
export async function parseWithLLM(resumeText, options = {}) {
    const {
        provider = 'openrouter',
        apiKey,
        quality = 'cheap'
    } = options;
    
    if (!apiKey) {
        throw new Error('API key is required for LLM parsing. Please add your API key in Settings.');
    }
    
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
        throw new Error(`Unknown provider: ${provider}. Use 'openrouter', 'openai', or 'gemini'.`);
    }
    
    const model = providerConfig.models[quality] || providerConfig.models.cheap;
    
    // Truncate resume if too long (save tokens)
    const maxChars = 8000;
    const truncatedText = resumeText.length > maxChars 
        ? resumeText.substring(0, maxChars) + '\n[Resume truncated...]'
        : resumeText;
    
    try {
        let response;
        
        if (provider === 'gemini') {
            response = await callGeminiAPI(truncatedText, model, apiKey);
        } else {
            response = await callOpenAICompatibleAPI(
                truncatedText, 
                model, 
                providerConfig.baseUrl, 
                providerConfig.getHeaders(apiKey)
            );
        }
        
        // Parse the JSON response
        const parsed = parseJSONResponse(response);
        
        // Add confidence scores (LLM responses get high confidence)
        const withConfidence = addConfidenceScores(parsed);
        
        return {
            success: true,
            data: withConfidence.data,
            scores: withConfidence.scores,
            provider,
            model,
            tokensUsed: response.tokensUsed || null
        };
        
    } catch (error) {
        console.error('[Tier3] LLM parsing error:', error);
        return {
            success: false,
            error: error.message,
            provider,
            model
        };
    }
}

/**
 * Call OpenAI-compatible API (OpenRouter, OpenAI)
 */
async function callOpenAICompatibleAPI(resumeText, model, baseUrl, headers) {
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: RESUME_PARSING_PROMPT },
                { role: 'user', content: `Parse this resume:\n\n${resumeText}` }
            ],
            temperature: 0.1, // Low temperature for consistent output
            max_tokens: 1500
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
        content: data.choices[0]?.message?.content || '',
        tokensUsed: data.usage?.total_tokens
    };
}

/**
 * Call Google Gemini API
 */
async function callGeminiAPI(resumeText, model, apiKey) {
    const url = `${PROVIDERS.gemini.baseUrl}/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: PROVIDERS.gemini.getHeaders(),
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `${RESUME_PARSING_PROMPT}\n\nParse this resume:\n\n${resumeText}`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1500
            }
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        tokensUsed: null // Gemini doesn't return token count in same way
    };
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONResponse(response) {
    let content = response.content.trim();
    
    // Remove markdown code blocks if present
    if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
        return JSON.parse(content);
    } catch (e) {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Failed to parse LLM response as JSON');
    }
}

/**
 * Sanitize and validate LLM-parsed data
 * Filters out placeholder/fake data that LLMs sometimes generate
 */
function sanitizeParsedData(data) {
    const sanitized = { ...data };
    
    // Placeholder patterns to detect fake data
    const fakePlaceholders = [
        'johndoe', 'janedoe', 'john.doe', 'jane.doe',
        'example.com', 'test.com', 'sample.com',
        'yourname', 'username', 'placeholder',
        'xxx', 'abc123', 'n/a', 'not available'
    ];
    
    // Validate ZIP code - must be exactly 5 digits and not match phone number
    if (sanitized.zipCode) {
        const zip = sanitized.zipCode.toString().trim();
        const phone = (sanitized.phone || '').replace(/\D/g, ''); // Remove non-digits from phone
        
        // Check if ZIP is valid (5 digits) and not derived from phone number
        const isValidZip = /^\d{5}(-\d{4})?$/.test(zip);
        const isFromPhone = phone && phone.includes(zip.replace('-', ''));
        
        if (!isValidZip || isFromPhone) {
            console.warn(`[Tier3] Filtering invalid ZIP code: ${zip} (isValidZip: ${isValidZip}, isFromPhone: ${isFromPhone})`);
            sanitized.zipCode = null;
        }
    }
    
    // Validate and clean URLs
    const urlFields = ['linkedinUrl', 'githubUrl', 'portfolioWebsite'];
    for (const field of urlFields) {
        const value = sanitized[field];
        if (value) {
            const lowerValue = value.toLowerCase();
            
            // Check for fake placeholders
            const hasFakePlaceholder = fakePlaceholders.some(p => lowerValue.includes(p));
            
            // Check for valid URL structure
            const isValidUrl = value.startsWith('http://') || value.startsWith('https://');
            
            // LinkedIn specific validation
            if (field === 'linkedinUrl') {
                const isValidLinkedIn = lowerValue.includes('linkedin.com/in/') && 
                                        !hasFakePlaceholder;
                if (!isValidLinkedIn) {
                    console.warn(`[Tier3] Filtering invalid LinkedIn URL: ${value}`);
                    sanitized[field] = null;
                }
            }
            // GitHub specific validation
            else if (field === 'githubUrl') {
                const isValidGithub = lowerValue.includes('github.com/') && 
                                      !hasFakePlaceholder;
                if (!isValidGithub) {
                    console.warn(`[Tier3] Filtering invalid GitHub URL: ${value}`);
                    sanitized[field] = null;
                }
            }
            // General URL validation
            else if (!isValidUrl || hasFakePlaceholder) {
                console.warn(`[Tier3] Filtering invalid URL: ${value}`);
                sanitized[field] = null;
            }
        }
    }
    
    // Clean up null/undefined values
    for (const [key, value] of Object.entries(sanitized)) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined') {
            sanitized[key] = null;
        }
    }
    
    return sanitized;
}

/**
 * Add confidence scores to parsed data
 * LLM-parsed data gets high confidence
 */
function addConfidenceScores(data) {
    // First sanitize the data
    const sanitizedData = sanitizeParsedData(data);
    const scores = {};
    
    for (const [field, value] of Object.entries(sanitizedData)) {
        if (value !== null && value !== undefined && value !== '') {
            scores[field] = {
                score: 0.90, // LLM parsing is generally high confidence
                valid: true,
                confidence: 'high',
                needsReview: false
            };
        }
    }
    
    return { data: sanitizedData, scores };
}

/**
 * Estimate cost for parsing (rough estimates)
 */
export function estimateCost(textLength, provider = 'openrouter', quality = 'cheap') {
    // Rough token estimation (1 token ≈ 4 chars)
    const inputTokens = Math.ceil(textLength / 4);
    const outputTokens = 500; // Estimated output
    
    // Prices per 1M tokens (as of 2024)
    const prices = {
        openrouter: {
            cheap: { input: 0.14, output: 0.28 }, // DeepSeek
            balanced: { input: 0.15, output: 0.60 }, // GPT-4o-mini
            best: { input: 2.50, output: 10.00 } // GPT-4o
        },
        openai: {
            cheap: { input: 0.15, output: 0.60 },
            balanced: { input: 0.15, output: 0.60 },
            best: { input: 2.50, output: 10.00 }
        }
    };
    
    const providerPrices = prices[provider] || prices.openrouter;
    const tierPrices = providerPrices[quality] || providerPrices.cheap;
    
    const cost = (inputTokens * tierPrices.input + outputTokens * tierPrices.output) / 1000000;
    
    return {
        estimatedTokens: inputTokens + outputTokens,
        estimatedCost: cost.toFixed(6),
        costCurrency: 'USD'
    };
}

/**
 * Check if API key is configured for any provider
 */
export async function hasApiKey() {
    try {
        // Use chrome.storage.sync to match background.js storage location
        const result = await chrome.storage.sync.get(['apiKeys']);
        const keys = result.apiKeys || {};
        return Boolean(keys.openrouter || keys.openai || keys.gemini);
    } catch (e) {
        console.error('[Tier3] Error checking API key:', e);
        return false;
    }
}

/**
 * Get configured API provider and key
 */
export async function getConfiguredProvider() {
    try {
        // Use chrome.storage.sync to match background.js storage location
        const result = await chrome.storage.sync.get(['apiKeys', 'settings']);
        const keys = result.apiKeys || {};
        const settings = result.settings || {};
        
        console.log('[Tier3] Retrieved keys:', Object.keys(keys));
        console.log('[Tier3] Settings preferredProvider:', settings.preferredProvider);
        
        // Priority: user preference > first available
        const preferredProvider = settings.preferredProvider;
        
        if (preferredProvider && keys[preferredProvider]) {
            console.log('[Tier3] Using preferred provider:', preferredProvider);
            return { provider: preferredProvider, apiKey: keys[preferredProvider] };
        }
        
        // Default priority: openrouter (cheapest) > openai > gemini
        const providerPriority = ['openrouter', 'openai', 'gemini'];
        for (const provider of providerPriority) {
            if (keys[provider]) {
                console.log('[Tier3] Using available provider:', provider);
                return { provider, apiKey: keys[provider] };
            }
        }
        
        console.warn('[Tier3] No API keys found in storage');
        return null;
    } catch (e) {
        console.error('[Tier3] Error getting configured provider:', e);
        return null;
    }
}
