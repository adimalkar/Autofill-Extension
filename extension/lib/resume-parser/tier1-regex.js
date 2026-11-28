/**
 * Tier 1 Regex Extraction for Resume Parsing
 * 
 * Extracts structured data from resume text using regex patterns.
 * This is the first tier - fast, free, and handles common patterns.
 * 
 * Extracts: email, phone, URLs (LinkedIn, GitHub, Portfolio), dates, GPA
 */

/**
 * Regex patterns for extracting resume data
 */
export const PATTERNS = {
    // Contact Information
    email: /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
    phone: /(?<!\d)(?:\+?1[-.\s]?)?(?:\(\d{3}\)[-.\s]?|\d{3}[-.\s])\d{3}[-.\s]\d{4}(?!\d)|(?<!\d)(?:\+?1[-.\s]?)?\d{10}(?!\d)|(?<!\d)\d{3}[-.\s]\d{4}(?!\d)/g,
    phoneInternational: /(?<!\d)\+\d{1,3}(?:[-.\s]?\(?\d{1,5}\)?){1,3}[-.\s]?\d{1,10}(?!\d)/g,
    
    // Professional Links
    linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/gi,
    github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/gi,
    portfolio: /(?:https?:\/\/)?(?!(?:www\.)?(?:linkedin|github|google|facebook|twitter|instagram)\.com)[\w-]+\.[\w.-]+(?:\/[\w.-]*)*\/?/gi,
    
    // URLs (generic)
    url: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
    
    // Dates
    dateMonthYear: /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}/gi,
    dateYearOnly: /\b(19|20)\d{2}\b/g,
    dateRange: /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}\s*[-–—to]+\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*\d{4}|Present|Current)/gi,
    
    // Education
    gpa: /(?:GPA|Grade\s*Point\s*Average|Cumulative\s*GPA)[:\s]*(\d\.\d{1,2})(?:\s*\/\s*(\d\.\d{1,2}))?/gi,
    degree: /(?:Bachelor(?:'s)?|Master(?:'s)?|Ph\.?D\.?|M\.?B\.?A\.?|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Associate(?:'s)?|Doctorate|J\.?D\.?|M\.?D\.?)/gi,
    
    // Skills (common programming languages and technologies)
    programmingLanguages: /\b(?:JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust|Swift|Kotlin|PHP|Scala|R|MATLAB|SQL|HTML|CSS|Sass|LESS)\b/gi,
    frameworks: /\b(?:React|Angular|Vue|Next\.js|Node\.js|Express|Django|Flask|Spring|Rails|Laravel|\.NET|FastAPI|NestJS|Svelte|Nuxt)\b/gi,
    tools: /\b(?:Git|Docker|Kubernetes|AWS|Azure|GCP|Jenkins|CircleCI|Travis|Terraform|Ansible|Webpack|Babel|npm|yarn|pip|Maven|Gradle)\b/gi,
    databases: /\b(?:MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|SQLite|Oracle|SQL Server|DynamoDB|Cassandra|Firebase)\b/gi,
    
    // Name patterns (less reliable, needs context)
    nameAtStart: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/m,
    
    // Location patterns
    usState: /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/g,
    zipCode: /\b\d{5}(?:-\d{4})?\b/g,
    cityState: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/g
};

/**
 * Section header patterns to identify resume sections
 */
export const SECTION_HEADERS = {
    experience: /\b(?:experience|work\s*history|employment|professional\s*experience|work\s*experience)\b/i,
    education: /\b(?:education|academic|qualifications|degrees?)\b/i,
    skills: /\b(?:skills?|technical\s*skills?|competenc(?:ies|y)|expertise|technologies)\b/i,
    projects: /\b(?:projects?|portfolio|personal\s*projects?)\b/i,
    certifications: /\b(?:certifications?|certificates?|licenses?|credentials?)\b/i,
    summary: /\b(?:summary|objective|profile|about\s*me|professional\s*summary)\b/i,
    contact: /\b(?:contact|personal\s*info(?:rmation)?)\b/i
};

const US_STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC'
]);

const NON_PORTFOLIO_HOSTS = new Set([
    'linkedin.com',
    'github.com',
    'google.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'youtube.com'
]);

const RECOGNIZED_GPA_SCALES = new Set(['4', '4.0', '4.00', '4.3', '4.33', '4.5', '5', '5.0', '10', '10.0']);

function asText(text) {
    return typeof text === 'string' ? text : '';
}

function cloneGlobalRegex(regex) {
    return new RegExp(regex.source, regex.flags);
}

/**
 * Extract email addresses from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of email addresses
 */
export function extractEmails(text) {
    const input = asText(text);
    if (!input) return [];

    const matches = input.match(PATTERNS.email) || [];
    // Deduplicate and filter out common false positives
    return [...new Set(matches)].filter(email => {
        const lower = email.toLowerCase();
        // Filter out common false positives
        return !lower.includes('example.com') && 
               !lower.includes('email.com') &&
               !lower.includes('domain.com');
    });
}

/**
 * Extract phone numbers from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of phone numbers
 */
export function extractPhones(text) {
    const input = asText(text);
    if (!input) return [];

    const candidates = [];

    // Match international numbers first so partial US/local patterns don't split them
    for (const match of input.matchAll(cloneGlobalRegex(PATTERNS.phoneInternational))) {
        const value = match[0].trim();
        const digits = value.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
            candidates.push({
                value,
                start: match.index,
                end: match.index + match[0].length
            });
        }
    }

    for (const match of input.matchAll(cloneGlobalRegex(PATTERNS.phone))) {
        const value = match[0].trim();
        const digits = value.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) continue;

        const start = match.index;
        const end = start + match[0].length;
        const overlapsExisting = candidates.some(
            c => start < c.end && end > c.start
        );
        if (!overlapsExisting) {
            candidates.push({ value, start, end });
        }
    }

    candidates.sort((a, b) => a.start - b.start);
    return [...new Set(candidates.map(c => c.value))];
}

/**
 * Extract LinkedIn URL from text
 * @param {string} text - Resume text
 * @returns {string|null} LinkedIn URL or null
 */
export function extractLinkedIn(text) {
    const input = asText(text);
    if (!input) return null;

    const matches = input.match(PATTERNS.linkedin);
    if (matches && matches.length > 0) {
        let url = matches[0];
        // Ensure https prefix
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        // Remove trailing slash
        return url.replace(/\/$/, '');
    }
    return null;
}

/**
 * Extract GitHub URL from text
 * @param {string} text - Resume text
 * @returns {string|null} GitHub URL or null
 */
export function extractGitHub(text) {
    const input = asText(text);
    if (!input) return null;

    const matches = input.match(PATTERNS.github);
    if (matches && matches.length > 0) {
        let url = matches[0];
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        return url.replace(/\/$/, '');
    }
    return null;
}

function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Extract portfolio/personal website from text
 * @param {string} text - Resume text
 * @returns {string|null} Portfolio URL or null
 */
export function extractPortfolio(text) {
    const input = asText(text);
    if (!input) return null;

    const allUrls = input.match(PATTERNS.url) || [];
    
    const portfolioUrls = allUrls
        .map(url => url.replace(/[.,;:!?)\]]+$/, ''))
        .filter(url => {
            const host = getHostname(url);
            if (!host) return false;
            for (const excluded of NON_PORTFOLIO_HOSTS) {
                if (host === excluded || host.endsWith(`.${excluded}`)) {
                    return false;
                }
            }
            return true;
        });
    
    return portfolioUrls.length > 0 ? portfolioUrls[0] : null;
}

/**
 * Extract GPA from text
 * @param {string} text - Resume text
 * @returns {{value: string, scale: string}|null} GPA object or null
 */
export function extractGPA(text) {
    const input = asText(text);
    if (!input) return null;

    // Handle various GPA formats including "GPA – 3.7", "GPA: 3.7", "GPA - 3.7"
    const gpaPattern = /(?:GPA|Grade\s*Point\s*Average|Cumulative\s*GPA|CGPA)\s*[:\-–—]?\s*(\d+(?:\.\d{1,2})?)(?:\s*\/\s*(\d+(?:\.\d{1,2})?))?/i;
    const match = input.match(gpaPattern);
    
    if (match) {
        const valueNum = parseFloat(match[1]);
        const scale = match[2] || '4.0';
        const scaleNum = parseFloat(scale);
        if (valueNum > 0 && (!match[2] || valueNum <= scaleNum)) {
            return {
                value: match[1],
                scale
            };
        }
    }
    
    // Standalone GPA format like "3.8/4.0" (require recognized GPA scale to avoid version ratios like "2.0/3.0")
    const standalonePattern = /\b(\d\.\d{1,2})\s*\/\s*(\d+(?:\.\d{1,2})?)\s*(?:GPA)?\b/gi;
    let standaloneMatch;
    while ((standaloneMatch = standalonePattern.exec(input)) !== null) {
        const valueNum = parseFloat(standaloneMatch[1]);
        const scaleStr = standaloneMatch[2];
        const scaleNum = parseFloat(scaleStr);
        if (valueNum > 0 && valueNum <= scaleNum && RECOGNIZED_GPA_SCALES.has(scaleStr)) {
            return {
                value: standaloneMatch[1],
                scale: scaleStr
            };
        }
    }
    
    return null;
}

/**
 * Extract dates from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of date strings
 */
export function extractDates(text) {
    const input = asText(text);
    if (!input) return [];
    const monthYearDates = input.match(PATTERNS.dateMonthYear) || [];
    return [...new Set(monthYearDates)];
}

/**
 * Extract date ranges (e.g., "Jan 2020 - Present")
 * @param {string} text - Resume text
 * @returns {Array<{start: string, end: string}>} Array of date range objects
 */
export function extractDateRanges(text) {
    const input = asText(text);
    if (!input) return [];

    const ranges = [];
    const pattern = /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(\d{4}))\s*[-–—to]+\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(\d{4})|(Present|Current))/gi;
    
    let match;
    while ((match = pattern.exec(input)) !== null) {
        ranges.push({
            start: `${match[1]} ${match[2]}`,
            end: match[5] || `${match[3]} ${match[4]}`
        });
    }
    
    return ranges;
}

/**
 * Extract skills from text
 * @param {string} text - Resume text
 * @returns {{technical: string[], frameworks: string[], tools: string[], databases: string[], all: string[]}} Skills object
 */
export function extractSkills(text) {
    const input = asText(text);
    if (!input) {
        return { technical: [], frameworks: [], tools: [], databases: [], all: [] };
    }

    const languages = [...new Set((input.match(PATTERNS.programmingLanguages) || []).map(s => s.trim()))];
    const frameworks = [...new Set((input.match(PATTERNS.frameworks) || []).map(s => s.trim()))];
    const tools = [...new Set((input.match(PATTERNS.tools) || []).map(s => s.trim()))];
    const databases = [...new Set((input.match(PATTERNS.databases) || []).map(s => s.trim()))];
    
    return {
        technical: languages,
        frameworks,
        tools,
        databases,
        all: [...new Set([...languages, ...frameworks, ...tools, ...databases])]
    };
}

/**
 * Extract degree information from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of degree types found
 */
export function extractDegrees(text) {
    const input = asText(text);
    if (!input) return [];
    const matches = input.match(PATTERNS.degree) || [];
    return [...new Set(matches)];
}

/**
 * Try to extract name from the beginning of the resume
 * @param {string} text - Resume text
 * @returns {string|null} Extracted name or null
 */
export function extractName(text) {
    const input = asText(text);
    if (!input.trim()) return null;

    // Split on newlines before collapsing horizontal whitespace so line boundaries stay intact
    const lines = input
        .split(/[\r\n]+/)
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);

    if (lines.length === 0) return null;

    const nonNameLinePattern = /\b(?:resume|cv|curriculum|vitae|portfolio|engineer|developer|manager|summary|objective|experience|education|skills|contact|profile)\b|@|\d/i;
    const namePattern = /^([A-Z][a-zA-Z'-]+(?:\s+(?:[A-Z]\.?|[A-Z][a-zA-Z'-]+)){1,3})$/;

    for (const rawLine of lines.slice(0, 3)) {
        const candidate = rawLine.split(/\s*[|•·]\s*/)[0].trim();
        if (!candidate || candidate.length >= 60) continue;
        if (nonNameLinePattern.test(candidate)) continue;

        const match = candidate.match(namePattern);
        if (match) {
            const words = match[1].split(/\s+/);
            const isAllCaps = words.every(w => /^[A-Z]{2,}$/.test(w) || /^[A-Z]\.?$/.test(w));
            if (isAllCaps) {
                return words
                    .map(w => (w.length <= 2 && w.endsWith('.'))
                        ? w
                        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
            }
            return match[1];
        }
    }

    return null;
}

/**
 * Extract location information from text
 * @param {string} text - Resume text
 * @returns {{city: string, state: string, zip: string|null}|null} Location object or null
 */
export function extractLocation(text) {
    const input = asText(text);
    if (!input) return null;

    // Match "City, ST" with optional adjacent ZIP code, validating against real US state codes
    const cityStatePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}),\s*([A-Z]{2})\b(?:[ \t]+(\d{5}(?:-\d{4})?))?/g;
    let match;
    while ((match = cityStatePattern.exec(input)) !== null) {
        const state = match[2];
        if (!US_STATE_CODES.has(state)) {
            continue;
        }
        return {
            city: match[1],
            state,
            zip: match[3] || null
        };
    }

    return null;
}

/**
 * Extract university/school name from text
 * @param {string} text - Resume text
 * @returns {string|null} University name or null
 */
export function extractUniversity(text) {
    const input = asText(text);
    if (!input) return null;

    // Common university patterns
    const patterns = [
        // "University of X" or "X University"
        /([A-Z][a-zA-Z\s]+(?:University|Institute|College|School)(?:\s+of\s+[A-Za-z\s]+)?)/,
        // "X Institute of Technology"
        /([A-Z][a-zA-Z\s]+Institute\s+of\s+[A-Za-z\s]+)/,
    ];
    
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return null;
}

/**
 * Extract degree and major from text
 * @param {string} text - Resume text
 * @returns {{degree: string, major: string}|null} Degree info or null
 */
export function extractDegreeInfo(text) {
    const input = asText(text);
    if (!input) return null;

    const degreeTypeRegex = /(Master(?:'s)?|Bachelor(?:'s)?|Ph\.?D\.?|M\.?S\.?|B\.?S\.?|B\.?E\.?|M\.?E\.?|M\.?B\.?A\.?|B\.?A\.?|M\.?A\.?)\s*(?:of\s+)?(Science|Arts|Engineering|Business|Technology)?/i;
    const degreePattern = new RegExp(
        `(${degreeTypeRegex.source})\\s*(?:,|in)?\\s*(?:in\\s+)?([A-Za-z][A-Za-z\\s&/-]+?)(?=\\s*(?:\\||,|\\n|\\r|–|—|-|\\bGPA\\b|\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\b|\\d|$))`,
        'i'
    );
    const match = input.match(degreePattern);
    
    if (match) {
        return {
            degree: match[1].trim(),
            major: match[4].trim()
        };
    }
    
    return null;
}

/**
 * Extract company names from experience section
 * @param {string} text - Resume text (preferably just the experience section)
 * @returns {string[]} Array of company names
 */
export function extractCompanies(text) {
    const input = asText(text);
    if (!input) return [];

    const companies = [];
    
    // Pattern: "Company Name, (Role) – Location" or "Company Name – Location"
    // Common patterns for company lines
    const lines = input.split(/[\n\r]+/);
    
    for (const line of lines) {
        // Check if line contains location pattern (usually indicates company line)
        const companyPattern = /^([A-Z][A-Za-z\s&.,]+?),?\s*\(?(?:[A-Za-z\s]+(?:Intern|Engineer|Developer|Analyst|Manager|Associate|Lead|Director|Consultant))?\)?\s*[-–—]\s*[A-Za-z\s,]+(?:India|USA|UK|Canada|Remote)?/i;
        const match = line.match(companyPattern);
        
        if (match && match[1].length > 2 && match[1].length < 50) {
            companies.push(match[1].trim());
        }
    }
    
    return [...new Set(companies)];
}

/**
 * Extract job titles from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of job titles
 */
export function extractJobTitles(text) {
    const input = asText(text);
    if (!input) return [];

    const titles = [];
    
    // Common job title patterns
    const titlePatterns = [
        /\b([A-Z][a-z]+\s+(?:Engineer|Developer|Analyst|Manager|Associate|Lead|Director|Consultant|Intern|Designer|Architect|Specialist))\b/g,
        /\b(Software\s+(?:Engineer|Developer))\b/gi,
        /\b(Data\s+(?:Scientist|Engineer|Analyst))\b/gi,
        /\b(Machine\s+Learning\s+(?:Engineer|Intern))\b/gi,
        /\b(Full\s*Stack\s+Developer)\b/gi,
        /\b(Frontend|Backend)\s+(?:Developer|Engineer)\b/gi,
        /\b((?:Senior|Junior|Staff|Principal)\s+[A-Z][a-z]+\s+(?:Engineer|Developer))\b/gi,
    ];
    
    for (const pattern of titlePatterns) {
        let match;
        while ((match = pattern.exec(input)) !== null) {
            if (match[1] && !titles.includes(match[1])) {
                titles.push(match[1].trim());
            }
        }
    }
    
    return [...new Set(titles)];
}

/**
 * Extract certifications from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of certification names
 */
export function extractCertifications(text) {
    const input = asText(text);
    if (!input) return [];

    const certs = [];
    
    // Look for common certification patterns
    const certPatterns = [
        /AWS\s+Certified\s+[A-Za-z\s]+(?:Associate|Professional|Practitioner)?/gi,
        /Google\s+(?:Cloud\s+)?Certified\s+[A-Za-z\s]+/gi,
        /Azure\s+(?:Certified\s+)?[A-Za-z\s]+/gi,
        /Certified\s+[A-Za-z\s]+(?:Developer|Engineer|Architect|Professional|Associate)/gi,
        /PMP|Scrum\s+Master|CISSP|CPA|CFA/gi,
    ];
    
    for (const pattern of certPatterns) {
        const matches = input.match(pattern);
        if (matches) {
            certs.push(...matches.map(m => m.trim()));
        }
    }
    
    return [...new Set(certs)];
}

/**
 * Split text into sections based on common resume headers
 * @param {string} text - Resume text
 * @returns {Object} Object with section names as keys and content as values
 */
export function splitIntoSections(text) {
    const input = asText(text);
    if (!input) return {};

    const sections = {};
    const lines = input.split(/[\n\r]+/);
    
    let currentSection = 'header';
    let currentContent = [];
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Check if this line is a section header
        let foundSection = null;
        for (const [sectionName, pattern] of Object.entries(SECTION_HEADERS)) {
            if (pattern.test(trimmedLine) && trimmedLine.length < 50) {
                foundSection = sectionName;
                break;
            }
        }
        
        if (foundSection) {
            // Save previous section
            if (currentContent.length > 0) {
                sections[currentSection] = currentContent.join('\n').trim();
            }
            currentSection = foundSection;
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }
    
    // Save last section
    if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
    }
    
    return sections;
}

/**
 * Run all Tier 1 extractions on text
 * @param {string} text - Resume text
 * @returns {Object} Extracted data object
 */
export function extractAll(text) {
    const emails = extractEmails(text);
    const phones = extractPhones(text);
    const name = extractName(text);
    const location = extractLocation(text);
    const gpa = extractGPA(text);
    const skills = extractSkills(text);
    const degrees = extractDegrees(text);
    const dates = extractDates(text);
    const dateRanges = extractDateRanges(text);
    const sections = splitIntoSections(text);
    
    // New extractions
    const university = extractUniversity(text);
    const degreeInfo = extractDegreeInfo(text);
    const jobTitles = extractJobTitles(text);
    const companies = extractCompanies(text);
    const certifications = extractCertifications(text);
    
    // Split name into first/last/middle
    let firstName = '';
    let lastName = '';
    let middleName = '';
    if (name) {
        const nameParts = name.split(/\s+/);
        if (nameParts.length === 2) {
            firstName = nameParts[0] || '';
            lastName = nameParts[1] || '';
        } else if (nameParts.length >= 3) {
            firstName = nameParts[0] || '';
            middleName = nameParts.slice(1, -1).join(' ') || '';
            lastName = nameParts[nameParts.length - 1] || '';
        } else {
            firstName = nameParts[0] || '';
        }
    }
    
    return {
        // Personal Info
        firstName,
        lastName,
        middleName,
        fullName: name,
        
        // Contact
        email: emails[0] || null,
        phone: phones[0] || null,
        
        // Location
        currentCity: location?.city || null,
        currentState: location?.state || null,
        zipCode: location?.zip || null,
        
        // Links
        linkedinUrl: extractLinkedIn(text),
        githubUrl: extractGitHub(text),
        portfolioWebsite: extractPortfolio(text),
        
        // Education
        gpa: gpa ? `${gpa.value}/${gpa.scale}` : null,
        degrees,
        schoolName: university,
        degreeType: degreeInfo?.degree || (degrees.length > 0 ? degrees[0] : null),
        major: degreeInfo?.major || null,
        
        // Work Experience
        currentJobTitle: jobTitles.length > 0 ? jobTitles[0] : null,
        currentEmployer: companies.length > 0 ? companies[0] : null,
        allJobTitles: jobTitles,
        allCompanies: companies,
        
        // Certifications
        certifications,
        
        // Skills
        skills: skills.all.join(', '),
        skillsDetailed: skills,
        
        // Dates (for reference)
        dates,
        dateRanges,
        
        // Sections (for Tier 2/3 processing)
        sections,
        
        // Raw data for debugging
        _raw: {
            allEmails: emails,
            allPhones: phones,
            allDegrees: degrees
        }
    };
}
