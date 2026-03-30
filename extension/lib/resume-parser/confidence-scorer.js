/**
 * Confidence Scorer for Resume Parsing
 * 
 * Assigns confidence scores to extracted data based on:
 * - Pattern match quality
 * - Context validation
 * - Multiple confirmations
 * 
 * Scores range from 0.0 (no confidence) to 1.0 (high confidence)
 */

/**
 * Confidence thresholds
 */
export const THRESHOLDS = {
    HIGH: 0.85,      // Auto-accept, no review needed
    MEDIUM: 0.60,    // Likely correct, quick review
    LOW: 0.40,       // Needs verification
    VERY_LOW: 0.20   // Likely incorrect, manual entry preferred
};

/**
 * Field-specific validation rules and scoring weights
 */
const FIELD_VALIDATORS = {
    email: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Basic email format
            const basicMatch = /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(value);
            if (!basicMatch) return { valid: false, score: 0.1 };
            
            // Check for common providers (higher confidence)
            const commonProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
                                     'icloud.com', 'protonmail.com', 'edu', 'org'];
            const hasCommonProvider = commonProviders.some(p => value.toLowerCase().includes(p));
            
            // Check for personal domain (medium confidence)
            const parts = value.split('@');
            const domain = parts[1]?.toLowerCase() || '';
            
            // Penalize obviously fake emails
            const fakePatterns = ['example', 'test', 'fake', 'sample', 'your', 'email'];
            const isFake = fakePatterns.some(p => value.toLowerCase().includes(p));
            if (isFake) return { valid: false, score: 0.15 };
            
            return {
                valid: true,
                score: hasCommonProvider ? 0.95 : 0.80
            };
        },
        weight: 1.0
    },
    
    phone: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Remove all non-numeric characters
            const digits = value.replace(/\D/g, '');
            
            // US phone numbers: 10 or 11 digits
            if (digits.length === 10) {
                return { valid: true, score: 0.90 };
            }
            if (digits.length === 11 && digits.startsWith('1')) {
                return { valid: true, score: 0.90 };
            }
            
            // International: 7-15 digits
            if (digits.length >= 7 && digits.length <= 15) {
                return { valid: true, score: 0.75 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.9
    },
    
    linkedinUrl: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            const hasLinkedIn = value.toLowerCase().includes('linkedin.com/in/');
            if (!hasLinkedIn) return { valid: false, score: 0.1 };
            
            // Check for valid username format
            const usernameMatch = value.match(/linkedin\.com\/in\/([\w-]+)/i);
            if (usernameMatch && usernameMatch[1].length >= 3) {
                return { valid: true, score: 0.95 };
            }
            
            return { valid: true, score: 0.70 };
        },
        weight: 0.8
    },
    
    githubUrl: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            const hasGitHub = value.toLowerCase().includes('github.com/');
            if (!hasGitHub) return { valid: false, score: 0.1 };
            
            // Check for valid username format
            const usernameMatch = value.match(/github\.com\/([\w-]+)/i);
            if (usernameMatch && usernameMatch[1].length >= 1) {
                // Filter out common GitHub paths that aren't usernames
                const notUsernames = ['about', 'features', 'pricing', 'enterprise', 'login', 'signup'];
                if (notUsernames.includes(usernameMatch[1].toLowerCase())) {
                    return { valid: false, score: 0.1 };
                }
                return { valid: true, score: 0.95 };
            }
            
            return { valid: true, score: 0.70 };
        },
        weight: 0.8
    },
    
    portfolioWebsite: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Basic URL format
            const urlPattern = /^https?:\/\/[\w.-]+\.[a-zA-Z]{2,}/;
            if (!urlPattern.test(value)) {
                return { valid: false, score: 0.2 };
            }
            
            // Exclude known non-portfolio sites
            const excluded = ['linkedin.com', 'github.com', 'google.com', 'facebook.com'];
            if (excluded.some(e => value.toLowerCase().includes(e))) {
                return { valid: false, score: 0.1 };
            }
            
            return { valid: true, score: 0.75 };
        },
        weight: 0.6
    },
    
    firstName: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Should be a single capitalized word
            const isProperName = /^[A-Z][a-z]{1,20}$/.test(value);
            if (isProperName) {
                return { valid: true, score: 0.85 };
            }
            
            // Accept names with hyphens or apostrophes
            const isCompoundName = /^[A-Z][a-z'-]{1,25}$/.test(value);
            if (isCompoundName) {
                return { valid: true, score: 0.80 };
            }
            
            // Fallback for other formats
            if (value.length >= 2 && value.length <= 30) {
                return { valid: true, score: 0.50 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.9
    },
    
    lastName: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Similar to firstName but allow longer names
            const isProperName = /^[A-Z][a-z]{1,30}$/.test(value);
            if (isProperName) {
                return { valid: true, score: 0.85 };
            }
            
            // Accept compound last names
            const isCompoundName = /^[A-Z][a-z'-]{1,35}(\s+[A-Z][a-z'-]+)?$/.test(value);
            if (isCompoundName) {
                return { valid: true, score: 0.80 };
            }
            
            if (value.length >= 2 && value.length <= 40) {
                return { valid: true, score: 0.50 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.9
    },
    
    gpa: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Parse GPA format like "3.8" or "3.8/4.0"
            const match = value.match(/^(\d\.\d{1,2})(?:\/(\d\.\d{1,2}))?$/);
            if (!match) return { valid: false, score: 0.2 };
            
            const gpa = parseFloat(match[1]);
            const scale = parseFloat(match[2] || '4.0');
            
            // Validate GPA is within reasonable range
            if (gpa > 0 && gpa <= scale && scale <= 10) {
                // Common 4.0 scale
                if (scale === 4.0 && gpa <= 4.0) {
                    return { valid: true, score: 0.90 };
                }
                // Other scales
                return { valid: true, score: 0.75 };
            }
            
            return { valid: false, score: 0.3 };
        },
        weight: 0.7
    },
    
    currentCity: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Should be capitalized words
            const isCityFormat = /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(value);
            if (isCityFormat && value.length >= 2 && value.length <= 50) {
                return { valid: true, score: 0.75 };
            }
            
            // Accept any reasonable string
            if (value.length >= 2 && value.length <= 50) {
                return { valid: true, score: 0.50 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.6
    },
    
    currentState: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // US state abbreviation
            const stateAbbrevs = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
                                  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                                  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
                                  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                                  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
            
            if (stateAbbrevs.includes(value.toUpperCase())) {
                return { valid: true, score: 0.95 };
            }
            
            // Full state name
            if (value.length >= 4 && value.length <= 20) {
                return { valid: true, score: 0.70 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.6
    },
    
    zipCode: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // US ZIP code format
            const isValidZip = /^\d{5}(-\d{4})?$/.test(value);
            if (isValidZip) {
                return { valid: true, score: 0.95 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.5
    },
    
    skills: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Should be a comma-separated list or similar
            const skillCount = value.split(/[,;]/).length;
            
            if (skillCount >= 3) {
                return { valid: true, score: 0.85 };
            }
            if (skillCount >= 1) {
                return { valid: true, score: 0.60 };
            }
            
            return { valid: false, score: 0.3 };
        },
        weight: 0.7
    },
    
    middleName: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Middle name can be a single letter or full name
            if (/^[A-Z][a-z'-]*$/.test(value) || /^[A-Z]\.?$/.test(value)) {
                return { valid: true, score: 0.85 };
            }
            
            if (value.length >= 1 && value.length <= 30) {
                return { valid: true, score: 0.60 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.6
    },
    
    schoolName: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Should contain "University", "College", "Institute", or "School"
            const hasInstitutionWord = /University|College|Institute|School|Academy/i.test(value);
            
            if (hasInstitutionWord && value.length >= 10 && value.length <= 100) {
                return { valid: true, score: 0.90 };
            }
            
            if (value.length >= 5 && value.length <= 100) {
                return { valid: true, score: 0.60 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.8
    },
    
    degreeType: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Check for common degree types
            const degreePatterns = /Bachelor|Master|Ph\.?D|MBA|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|B\.?E\.?|M\.?E\.?|Associate|Doctorate/i;
            
            if (degreePatterns.test(value)) {
                return { valid: true, score: 0.90 };
            }
            
            if (value.length >= 2 && value.length <= 50) {
                return { valid: true, score: 0.50 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.8
    },
    
    major: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Common majors/fields
            const commonFields = /Computer|Science|Engineering|Business|Data|Information|Technology|Mathematics|Physics|Chemistry|Biology|Psychology|Economics|Finance|Marketing|Design|Art|Music|Communication/i;
            
            if (commonFields.test(value) && value.length >= 3 && value.length <= 60) {
                return { valid: true, score: 0.85 };
            }
            
            if (value.length >= 3 && value.length <= 60) {
                return { valid: true, score: 0.65 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.7
    },
    
    currentJobTitle: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Common job title words
            const jobTitlePatterns = /Engineer|Developer|Manager|Analyst|Designer|Architect|Consultant|Specialist|Lead|Director|Associate|Intern|Scientist|Administrator|Coordinator/i;
            
            if (jobTitlePatterns.test(value) && value.length >= 3 && value.length <= 80) {
                return { valid: true, score: 0.85 };
            }
            
            if (value.length >= 3 && value.length <= 80) {
                return { valid: true, score: 0.55 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.7
    },
    
    currentEmployer: {
        validate: (value) => {
            if (!value) return { valid: false, score: 0 };
            
            // Company names are harder to validate, just check length
            if (value.length >= 2 && value.length <= 80) {
                return { valid: true, score: 0.70 };
            }
            
            return { valid: false, score: 0.2 };
        },
        weight: 0.6
    }
};

/**
 * Calculate confidence score for a single field
 * @param {string} fieldName - Name of the field
 * @param {*} value - Extracted value
 * @param {Object} context - Additional context (full text, other extracted fields)
 * @returns {{score: number, valid: boolean, confidence: string, needsReview: boolean}}
 */
export function scoreField(fieldName, value, context = {}) {
    // Get field-specific validator
    const validator = FIELD_VALIDATORS[fieldName];
    
    if (!validator) {
        // Unknown field - return medium confidence if value exists
        if (value && typeof value === 'string' && value.trim().length > 0) {
            return {
                score: 0.50,
                valid: true,
                confidence: 'medium',
                needsReview: true
            };
        }
        return {
            score: 0,
            valid: false,
            confidence: 'none',
            needsReview: false
        };
    }
    
    // Validate the field
    const result = validator.validate(value);
    
    // Apply context-based adjustments
    let adjustedScore = result.score;
    
    // Boost score if value appears multiple times in text
    if (context.fullText && value) {
        const occurrences = (context.fullText.match(new RegExp(escapeRegex(value), 'gi')) || []).length;
        if (occurrences > 1) {
            adjustedScore = Math.min(1.0, adjustedScore + 0.05);
        }
    }
    
    // Determine confidence level
    let confidence;
    if (adjustedScore >= THRESHOLDS.HIGH) {
        confidence = 'high';
    } else if (adjustedScore >= THRESHOLDS.MEDIUM) {
        confidence = 'medium';
    } else if (adjustedScore >= THRESHOLDS.LOW) {
        confidence = 'low';
    } else {
        confidence = 'very_low';
    }
    
    return {
        score: adjustedScore,
        valid: result.valid,
        confidence,
        needsReview: adjustedScore < THRESHOLDS.HIGH
    };
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score all extracted fields
 * @param {Object} extractedData - Object containing extracted fields
 * @param {string} fullText - Original resume text
 * @returns {Object} Object with scores for each field
 */
export function scoreAll(extractedData, fullText) {
    const scores = {};
    const context = { fullText };
    
    for (const [fieldName, value] of Object.entries(extractedData)) {
        // Skip internal/raw fields
        if (fieldName.startsWith('_') || fieldName === 'sections' || 
            fieldName === 'skillsDetailed' || fieldName === 'dates' || 
            fieldName === 'dateRanges' || fieldName === 'degrees') {
            continue;
        }
        
        scores[fieldName] = scoreField(fieldName, value, context);
    }
    
    return scores;
}

/**
 * Get overall parsing confidence
 * @param {Object} scores - Field scores from scoreAll
 * @returns {{overall: number, fieldsFound: number, highConfidence: number, needsReview: number}}
 */
export function getOverallConfidence(scores) {
    const fields = Object.values(scores);
    const validFields = fields.filter(f => f.valid);
    
    if (validFields.length === 0) {
        return {
            overall: 0,
            fieldsFound: 0,
            highConfidence: 0,
            needsReview: 0,
            confidence: 'none'
        };
    }
    
    const totalScore = validFields.reduce((sum, f) => sum + f.score, 0);
    const avgScore = totalScore / validFields.length;
    
    const highConfidenceCount = validFields.filter(f => f.confidence === 'high').length;
    const needsReviewCount = validFields.filter(f => f.needsReview).length;
    
    let confidence;
    if (avgScore >= THRESHOLDS.HIGH) {
        confidence = 'high';
    } else if (avgScore >= THRESHOLDS.MEDIUM) {
        confidence = 'medium';
    } else if (avgScore >= THRESHOLDS.LOW) {
        confidence = 'low';
    } else {
        confidence = 'very_low';
    }
    
    return {
        overall: avgScore,
        fieldsFound: validFields.length,
        highConfidence: highConfidenceCount,
        needsReview: needsReviewCount,
        confidence
    };
}

/**
 * Get fields that need human review
 * @param {Object} extractedData - Extracted data
 * @param {Object} scores - Field scores
 * @returns {Array} Array of fields needing review with their data and scores
 */
export function getFieldsForReview(extractedData, scores) {
    const forReview = [];
    
    for (const [fieldName, scoreData] of Object.entries(scores)) {
        if (scoreData.needsReview && extractedData[fieldName]) {
            forReview.push({
                field: fieldName,
                value: extractedData[fieldName],
                score: scoreData.score,
                confidence: scoreData.confidence
            });
        }
    }
    
    // Sort by score (lowest first - needs most attention)
    return forReview.sort((a, b) => a.score - b.score);
}

/**
 * Get fields that were extracted with high confidence
 * @param {Object} extractedData - Extracted data
 * @param {Object} scores - Field scores
 * @returns {Array} Array of high-confidence fields
 */
export function getHighConfidenceFields(extractedData, scores) {
    const highConf = [];
    
    for (const [fieldName, scoreData] of Object.entries(scores)) {
        if (scoreData.confidence === 'high' && extractedData[fieldName]) {
            highConf.push({
                field: fieldName,
                value: extractedData[fieldName],
                score: scoreData.score
            });
        }
    }
    
    return highConf;
}

/**
 * Generate a summary of parsing results
 * @param {Object} extractedData - Extracted data
 * @param {Object} scores - Field scores
 * @returns {Object} Summary object
 */
export function generateSummary(extractedData, scores) {
    const overall = getOverallConfidence(scores);
    const forReview = getFieldsForReview(extractedData, scores);
    const highConf = getHighConfidenceFields(extractedData, scores);
    
    // Identify missing critical fields
    const criticalFields = ['firstName', 'lastName', 'email', 'phone'];
    const missingCritical = criticalFields.filter(f => !extractedData[f] || !scores[f]?.valid);
    
    return {
        ...overall,
        highConfidenceFields: highConf,
        fieldsForReview: forReview,
        missingCriticalFields: missingCritical,
        recommendation: missingCritical.length > 0 
            ? 'Manual entry needed for some critical fields'
            : forReview.length > 3
            ? 'Review recommended before saving'
            : 'Parsing looks good, quick review suggested'
    };
}
