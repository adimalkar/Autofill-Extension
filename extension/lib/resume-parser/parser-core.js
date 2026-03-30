/**
 * Resume Parser Core - Orchestrator
 * 
 * Main orchestrator for the 3-tier resume parsing system.
 * Coordinates file reading, extraction, scoring, and profile generation.
 * 
 * Tier 1: Regex extraction (fast, local, limited accuracy)
 * Tier 2: Local ML/NER (placeholder for future - transformers.js)
 * Tier 3: Cloud LLM (most accurate, requires API key)
 */

import { readResumeFile, validateFile, isSupported } from './file-reader.js';
import * as tier1 from './tier1-regex.js';
import { parseWithLLM, hasApiKey, getConfiguredProvider, estimateCost } from './tier3-llm-parser.js';
import { scoreAll, getOverallConfidence, generateSummary } from './confidence-scorer.js';

/**
 * Parser configuration
 */
const CONFIG = {
    // Minimum confidence to auto-accept a field
    autoAcceptThreshold: 0.85,
    
    // Whether to use Tier 2 (local ML) - placeholder for transformers.js
    enableTier2: false,
    
    // Whether to use Tier 3 (cloud LLM) - NOW IMPLEMENTED
    enableTier3: true,
    
    // Maximum file size in bytes (10MB)
    maxFileSize: 10 * 1024 * 1024,
    
    // LLM quality level: 'cheap' (DeepSeek), 'balanced' (GPT-4o-mini), 'best' (GPT-4o)
    llmQuality: 'cheap'
};

/**
 * Parse event types for progress reporting
 */
export const PARSE_EVENTS = {
    FILE_VALIDATION: 'file_validation',
    FILE_READING: 'file_reading',
    TIER1_EXTRACTION: 'tier1_extraction',
    TIER2_EXTRACTION: 'tier2_extraction',
    TIER3_EXTRACTION: 'tier3_extraction',
    SCORING: 'scoring',
    COMPLETE: 'complete',
    ERROR: 'error'
};

/**
 * Parse a resume file and extract structured data
 * @param {File} file - Resume file (PDF, DOCX, DOC, or TXT)
 * @param {Object} options - Parsing options
 * @param {function} options.onProgress - Progress callback
 * @param {boolean} options.enableTier2 - Enable Tier 2 ML parsing
 * @param {boolean} options.enableTier3 - Enable Tier 3 LLM parsing
 * @returns {Promise<Object>} Parsed resume data
 */
export async function parseResume(file, options = {}) {
    const { onProgress = () => {}, enableTier2 = false, enableTier3 = false } = options;
    
    const result = {
        success: false,
        data: null,
        scores: null,
        summary: null,
        rawText: null,
        errors: [],
        warnings: [],
        tiersUsed: ['tier1']
    };
    
    try {
        // Step 1: Validate file
        onProgress({ 
            event: PARSE_EVENTS.FILE_VALIDATION, 
            message: 'Validating file...',
            progress: 0.05
        });
        
        const validation = validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        // Step 2: Read file and extract text
        onProgress({ 
            event: PARSE_EVENTS.FILE_READING, 
            message: 'Reading file...',
            progress: 0.10
        });
        
        const fileResult = await readResumeFile(file, (status) => {
            onProgress({ 
                event: PARSE_EVENTS.FILE_READING, 
                message: status.message,
                progress: 0.10 + (status.progress || 0) * 0.30
            });
        });
        
        result.rawText = fileResult.text;
        
        if (!fileResult.text || fileResult.text.trim().length < 50) {
            throw new Error('Could not extract enough text from the file. Please check if the file contains readable text.');
        }
        
        // Step 3: Tier 1 - Regex extraction
        onProgress({ 
            event: PARSE_EVENTS.TIER1_EXTRACTION, 
            message: 'Extracting basic information (Tier 1)...',
            progress: 0.45
        });
        
        const tier1Data = tier1.extractAll(fileResult.text);
        
        // Initialize extracted data with Tier 1 results
        let extractedData = { ...tier1Data };
        
        // Step 4: Tier 2 - Local ML (placeholder)
        if (enableTier2 && CONFIG.enableTier2) {
            onProgress({ 
                event: PARSE_EVENTS.TIER2_EXTRACTION, 
                message: 'Running ML extraction (Tier 2)...',
                progress: 0.60
            });
            
            // TODO: Implement Tier 2 NER extraction
            // const tier2Data = await runTier2Extraction(fileResult.text, extractedData);
            // extractedData = mergeExtractions(extractedData, tier2Data);
            
            result.tiersUsed.push('tier2');
            result.warnings.push('Tier 2 ML extraction not yet implemented');
        }
        
        // Step 5: Tier 3 - Cloud LLM (IMPLEMENTED)
        console.log('[Parser] Tier 3 check - enableTier3:', enableTier3, 'CONFIG.enableTier3:', CONFIG.enableTier3);
        
        if (enableTier3 && CONFIG.enableTier3) {
            console.log('[Parser] Tier 3 enabled, getting provider config...');
            const providerConfig = await getConfiguredProvider();
            console.log('[Parser] Provider config:', providerConfig ? providerConfig.provider : 'null');
            
            if (providerConfig) {
                onProgress({ 
                    event: PARSE_EVENTS.TIER3_EXTRACTION, 
                    message: 'Running AI-powered extraction (Tier 3)...',
                    progress: 0.60
                });
                
                try {
                    const tier3Result = await parseWithLLM(fileResult.text, {
                        provider: providerConfig.provider,
                        apiKey: providerConfig.apiKey,
                        quality: CONFIG.llmQuality
                    });
                    
                    if (tier3Result.success) {
                        // LLM data takes priority - merge with Tier 1 as fallback
                        extractedData = mergeExtractions(extractedData, tier3Result.data);
                        result.tiersUsed.push('tier3');
                        result.llmInfo = {
                            provider: tier3Result.provider,
                            model: tier3Result.model,
                            tokensUsed: tier3Result.tokensUsed
                        };
                        
                        onProgress({ 
                            event: PARSE_EVENTS.TIER3_EXTRACTION, 
                            message: `AI extraction complete (${tier3Result.model})`,
                            progress: 0.80
                        });
                    } else {
                        result.warnings.push(`LLM extraction failed: ${tier3Result.error}. Using regex fallback.`);
                    }
                } catch (tier3Error) {
                    console.error('[Parser] Tier 3 error:', tier3Error);
                    result.warnings.push(`LLM extraction error: ${tier3Error.message}. Using regex fallback.`);
                }
            } else {
                console.warn('[Parser] No provider config found - API keys may not be saved');
                result.warnings.push('No API key configured. Using regex-only parsing. Add an API key in Settings for better accuracy.');
            }
        } else {
            console.log('[Parser] Tier 3 skipped - enableTier3:', enableTier3, 'CONFIG.enableTier3:', CONFIG.enableTier3);
        }
        
        // Step 6: Score extracted data
        onProgress({ 
            event: PARSE_EVENTS.SCORING, 
            message: 'Analyzing extraction quality...',
            progress: 0.85
        });
        
        const scores = scoreAll(extractedData, fileResult.text);
        const summary = generateSummary(extractedData, scores);
        
        // Step 7: Build final result
        result.success = true;
        result.data = extractedData;
        result.scores = scores;
        result.summary = summary;
        result.fileInfo = {
            name: fileResult.fileName,
            format: fileResult.format,
            size: fileResult.fileSize,
            pages: fileResult.pages
        };
        
        onProgress({ 
            event: PARSE_EVENTS.COMPLETE, 
            message: 'Parsing complete!',
            progress: 1.0,
            result: result
        });
        
    } catch (error) {
        result.success = false;
        result.errors.push(error.message);
        
        onProgress({ 
            event: PARSE_EVENTS.ERROR, 
            message: error.message,
            progress: 0,
            error: error
        });
    }
    
    return result;
}

/**
 * Merge extractions from different tiers
 * Later tier (higher quality) takes priority for non-null values
 * @param {Object} baseData - Base extraction (e.g., Tier 1)
 * @param {Object} newData - New extraction to merge (e.g., Tier 3)
 * @returns {Object} Merged data
 */
function mergeExtractions(baseData, newData) {
    const merged = { ...baseData };
    
    for (const [key, value] of Object.entries(newData)) {
        // Skip null, undefined, empty strings, and empty arrays
        if (value === null || value === undefined) continue;
        if (value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        
        // New data takes priority
        merged[key] = value;
    }
    
    return merged;
}

/**
 * Convert parsed resume data to profile format
 * @param {Object} parsedData - Data from parseResume
 * @returns {Object} Profile object matching user-profile.schema.json
 */
export function convertToProfile(parsedData) {
    if (!parsedData || !parsedData.data) {
        return null;
    }
    
    const data = parsedData.data;
    
    // Parse skills from string or array
    const parseSkills = (skillsData) => {
        if (!skillsData) return [];
        if (Array.isArray(skillsData)) return skillsData;
        if (typeof skillsData === 'string') {
            return skillsData.split(',').map(s => s.trim()).filter(s => s);
        }
        return [];
    };
    
    // Build profile matching the schema
    const profile = {
        personalInfo: {
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            middleName: data.middleName || '',
            preferredName: data.preferredName || ''
        },
        contactInfo: {
            email: data.email || '',
            phone: data.phone || '',
            countryCode: data.countryCode || ''
        },
        location: {
            currentCity: data.currentCity || '',
            currentState: data.currentState || '',
            zipCode: data.zipCode || '',
            countryOfResidence: data.country || ''
        },
        professionalLinks: {
            linkedinUrl: data.linkedinUrl || '',
            githubUrl: data.githubUrl || '',
            portfolioWebsite: data.portfolioWebsite || ''
        },
        education: [], // Populated below
        workExperience: [], // Populated below
        projects: [], // Populated below
        skills: {
            technical: parseSkills(data.skills) || data.skillsDetailed?.technical || [],
            frameworks: data.skillsDetailed?.frameworks || [],
            tools: data.skillsDetailed?.tools || [],
            databases: data.skillsDetailed?.databases || [],
            other: []
        },
        certifications: Array.isArray(data.certifications) ? data.certifications : [],
        legalCompliance: {
            workAuthorizationStatus: data.workAuthorizationStatus || '',
            sponsorshipRequirement: data.sponsorshipRequirement || '',
            willingToRelocate: data.willingToRelocate || null
        },
        demographics: {
            race: '',
            ethnicity: '',
            gender: '',
            veteranStatus: '',
            disabilityStatus: ''
        },
        applicationPreferences: {
            desiredSalary: '',
            noticePeriod: ''
        },
        longFormContent: {
            coverLetterTemplate: '',
            whyWorkHereTemplate: '',
            behavioralResponses: {},
            howDidYouHear: ''
        }
    };
    
    // If LLM extracted top-level education fields, create an education entry
    if (data.schoolName || data.degreeType || data.major) {
        profile.education.push({
            schoolName: data.schoolName || '',
            degreeType: data.degreeType || '',
            major: data.major || '',
            gpa: data.gpa || '',
            startDate: data.educationStartDate || '',
            endDate: data.educationEndDate || ''
        });
    }
    
    // If LLM extracted top-level work experience fields, create an entry
    if (data.currentEmployer || data.currentJobTitle) {
        profile.workExperience.push({
            employer: data.currentEmployer || '',
            jobTitle: data.currentJobTitle || '',
            startDate: data.jobStartDate || '',
            endDate: data.jobEndDate || '',
            jobDescription: data.jobDescription || ''
        });
    }
    
    // Parse education from sections if available
    if (data.sections?.education) {
        const eduEntry = parseEducationSection(data.sections.education, data);
        if (eduEntry) {
            profile.education.push(eduEntry);
        }
    }
    
    // Parse work experience from sections if available
    if (data.sections?.experience) {
        const expEntries = parseExperienceSection(data.sections.experience, data);
        profile.workExperience.push(...expEntries);
    }
    
    // Parse projects from sections if available
    if (data.sections?.projects) {
        const projEntries = parseProjectsSection(data.sections.projects);
        profile.projects.push(...projEntries);
    }
    
    return profile;
}

/**
 * Parse education section text into structured entries
 * @param {string} text - Education section text
 * @param {Object} data - Additional extracted data
 * @returns {Object|null} Education entry
 */
function parseEducationSection(text, data) {
    if (!text || text.trim().length < 10) {
        return null;
    }
    
    // Try to extract degree and school
    const degrees = data.degrees || [];
    const dates = data.dateRanges || [];
    
    // Basic education entry
    const entry = {
        schoolName: '',
        degreeType: degrees[0] || '',
        major: '',
        gpa: data.gpa || '',
        graduationDate: ''
    };
    
    // Try to find school name (usually capitalized, may include "University", "College", "Institute")
    const schoolPattern = /([A-Z][a-zA-Z\s&]+(?:University|College|Institute|School)[a-zA-Z\s]*)/;
    const schoolMatch = text.match(schoolPattern);
    if (schoolMatch) {
        entry.schoolName = schoolMatch[1].trim();
    }
    
    // Try to find major
    const majorPatterns = [
        /(?:Major|Degree|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?)\s+(?:in\s+)?([A-Za-z\s]+?)(?:\.|,|\n|$)/i,
        /(?:Computer Science|Engineering|Business|Finance|Mathematics|Physics|Chemistry|Biology|Psychology)/i
    ];
    
    for (const pattern of majorPatterns) {
        const match = text.match(pattern);
        if (match) {
            entry.major = match[1]?.trim() || match[0].trim();
            break;
        }
    }
    
    // Use first date range for graduation
    if (dates.length > 0) {
        entry.graduationDate = dates[0].end === 'Present' ? '' : dates[0].end;
    }
    
    return entry;
}

/**
 * Parse experience section text into structured entries
 * @param {string} text - Experience section text
 * @param {Object} data - Additional extracted data
 * @returns {Array} Array of work experience entries
 */
function parseExperienceSection(text, data) {
    if (!text || text.trim().length < 20) {
        return [];
    }
    
    const entries = [];
    const dateRanges = data.dateRanges || [];
    
    // Try to split by date ranges or common separators
    const lines = text.split('\n').filter(l => l.trim());
    
    // Look for job titles (common patterns)
    const titlePattern = /(?:Software\s*Engineer|Developer|Manager|Analyst|Designer|Consultant|Intern|Associate|Director|Lead|Senior|Junior|Principal)/i;
    
    // Simple heuristic: find lines that look like job titles
    let currentEntry = null;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Check if this looks like a job title line
        if (titlePattern.test(trimmedLine) && trimmedLine.length < 80) {
            // Save previous entry if exists
            if (currentEntry && currentEntry.jobTitle) {
                entries.push(currentEntry);
            }
            
            currentEntry = {
                currentEmployer: '',
                currentJobTitle: trimmedLine,
                startDate: '',
                endDate: '',
                jobDescription: ''
            };
        } else if (currentEntry) {
            // This might be company name or description
            if (!currentEntry.currentEmployer && trimmedLine.length < 60) {
                currentEntry.currentEmployer = trimmedLine;
            } else {
                // Add to description
                currentEntry.jobDescription += (currentEntry.jobDescription ? '\n' : '') + trimmedLine;
            }
        }
    }
    
    // Don't forget the last entry
    if (currentEntry && currentEntry.currentJobTitle) {
        entries.push(currentEntry);
    }
    
    // If we found date ranges, try to assign them
    if (dateRanges.length > 0 && entries.length > 0) {
        entries.forEach((entry, i) => {
            if (dateRanges[i]) {
                entry.startDate = dateRanges[i].start;
                entry.endDate = dateRanges[i].end;
            }
        });
    }
    
    return entries;
}

/**
 * Parse projects section text into structured entries
 * @param {string} text - Projects section text
 * @returns {Array} Array of project entries
 */
function parseProjectsSection(text) {
    if (!text || text.trim().length < 20) {
        return [];
    }
    
    const entries = [];
    const lines = text.split('\n').filter(l => l.trim());
    
    let currentProject = null;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Check if this looks like a project title (short, possibly capitalized)
        if (trimmedLine.length < 60 && /^[A-Z]/.test(trimmedLine) && 
            !trimmedLine.startsWith('•') && !trimmedLine.startsWith('-')) {
            
            // Save previous project if exists
            if (currentProject && currentProject.name) {
                entries.push(currentProject);
            }
            
            currentProject = {
                name: trimmedLine,
                description: '',
                technologies: [],
                url: ''
            };
        } else if (currentProject) {
            // Add to description
            currentProject.description += (currentProject.description ? '\n' : '') + trimmedLine;
            
            // Look for URLs
            const urlMatch = trimmedLine.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                currentProject.url = urlMatch[0];
            }
        }
    }
    
    // Don't forget the last project
    if (currentProject && currentProject.name) {
        entries.push(currentProject);
    }
    
    return entries;
}

/**
 * Get fields that should be reviewed by user
 * @param {Object} parsedData - Data from parseResume
 * @returns {Array} Array of fields needing review
 */
export function getFieldsForReview(parsedData) {
    if (!parsedData || !parsedData.scores || !parsedData.data) {
        return [];
    }
    
    const forReview = [];
    
    for (const [fieldName, scoreData] of Object.entries(parsedData.scores)) {
        if (scoreData.needsReview && parsedData.data[fieldName]) {
            forReview.push({
                field: fieldName,
                value: parsedData.data[fieldName],
                score: scoreData.score,
                confidence: scoreData.confidence
            });
        }
    }
    
    return forReview.sort((a, b) => a.score - b.score);
}

/**
 * Merge user corrections with parsed data
 * @param {Object} parsedData - Original parsed data
 * @param {Object} corrections - User-provided corrections
 * @returns {Object} Merged data
 */
export function applyCorrections(parsedData, corrections) {
    if (!parsedData || !parsedData.data) {
        return parsedData;
    }
    
    const mergedData = { ...parsedData.data };
    
    for (const [field, value] of Object.entries(corrections)) {
        mergedData[field] = value;
    }
    
    return {
        ...parsedData,
        data: mergedData,
        corrected: true
    };
}

/**
 * Export parsed data as JSON for backup/import
 * @param {Object} parsedData - Data from parseResume
 * @returns {string} JSON string
 */
export function exportAsJson(parsedData) {
    if (!parsedData || !parsedData.data) {
        return null;
    }
    
    const profile = convertToProfile(parsedData);
    return JSON.stringify(profile, null, 2);
}
