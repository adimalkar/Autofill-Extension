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
    phone: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    phoneInternational: /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    
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

/**
 * Extract email addresses from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of email addresses
 */
export function extractEmails(text) {
    const matches = text.match(PATTERNS.email) || [];
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
    const usPhones = text.match(PATTERNS.phone) || [];
    const intlPhones = text.match(PATTERNS.phoneInternational) || [];
    
    // Combine and deduplicate
    const allPhones = [...usPhones, ...intlPhones];
    
    // Clean up phone numbers
    return [...new Set(allPhones.map(phone => phone.trim()))];
}

/**
 * Extract LinkedIn URL from text
 * @param {string} text - Resume text
 * @returns {string|null} LinkedIn URL or null
 */
export function extractLinkedIn(text) {
    const matches = text.match(PATTERNS.linkedin);
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
    const matches = text.match(PATTERNS.github);
    if (matches && matches.length > 0) {
        let url = matches[0];
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        return url.replace(/\/$/, '');
    }
    return null;
}

/**
 * Extract portfolio/personal website from text
 * @param {string} text - Resume text
 * @returns {string|null} Portfolio URL or null
 */
export function extractPortfolio(text) {
    // First get all URLs
    const allUrls = text.match(PATTERNS.url) || [];
    
    // Filter out LinkedIn, GitHub, and common non-portfolio sites
    const portfolioUrls = allUrls.filter(url => {
        const lower = url.toLowerCase();
        return !lower.includes('linkedin.com') &&
               !lower.includes('github.com') &&
               !lower.includes('google.com') &&
               !lower.includes('facebook.com') &&
               !lower.includes('twitter.com') &&
               !lower.includes('instagram.com') &&
               !lower.includes('youtube.com') &&
               !lower.includes('mailto:');
    });
    
    return portfolioUrls.length > 0 ? portfolioUrls[0] : null;
}

/**
 * Extract GPA from text
 * @param {string} text - Resume text
 * @returns {{value: string, scale: string}|null} GPA object or null
 */
export function extractGPA(text) {
    // Handle various GPA formats including "GPA – 3.7", "GPA: 3.7", "GPA - 3.7"
    const gpaPattern = /(?:GPA|Grade\s*Point\s*Average|Cumulative\s*GPA|CGPA)\s*[:\-–—]?\s*(\d\.\d{1,2})(?:\s*[\/\-–—]\s*(\d\.\d{1,2}))?/i;
    const match = text.match(gpaPattern);
    
    if (match) {
        return {
            value: match[1],
            scale: match[2] || '4.0'
        };
    }
    
    // Try to find standalone GPA format like "3.8/4.0"
    const standalonePattern = /\b(\d\.\d{1,2})\s*\/\s*(\d\.\d{1,2})\s*(?:GPA)?\b/i;
    const standaloneMatch = text.match(standalonePattern);
    
    if (standaloneMatch) {
        return {
            value: standaloneMatch[1],
            scale: standaloneMatch[2]
        };
    }
    
    return null;
}

/**
 * Extract dates from text
 * @param {string} text - Resume text
 * @returns {string[]} Array of date strings
 */
export function extractDates(text) {
    const monthYearDates = text.match(PATTERNS.dateMonthYear) || [];
    return [...new Set(monthYearDates)];
}

/**
 * Extract date ranges (e.g., "Jan 2020 - Present")
 * @param {string} text - Resume text
 * @returns {Array<{start: string, end: string}>} Array of date range objects
 */
export function extractDateRanges(text) {
    const ranges = [];
    const pattern = /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(\d{4}))\s*[-–—to]+\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(\d{4})|(Present|Current))/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
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
 * @returns {{technical: string[], frameworks: string[], tools: string[], databases: string[]}} Skills object
 */
export function extractSkills(text) {
    const languages = [...new Set((text.match(PATTERNS.programmingLanguages) || []).map(s => s.trim()))];
    const frameworks = [...new Set((text.match(PATTERNS.frameworks) || []).map(s => s.trim()))];
    const tools = [...new Set((text.match(PATTERNS.tools) || []).map(s => s.trim()))];
    const databases = [...new Set((text.match(PATTERNS.databases) || []).map(s => s.trim()))];
    
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
    const matches = text.match(PATTERNS.degree) || [];
    return [...new Set(matches)];
}

/**
 * Try to extract name from the beginning of the resume
 * @param {string} text - Resume text
 * @returns {string|null} Extracted name or null
 */
export function extractName(text) {
    // Clean up the text - remove excessive whitespace
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    // Try to get name from the very beginning (first line typically)
    const lines = cleanText.split(/[\n\r]+/).filter(line => line.trim());
    
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        
        // Check if first line looks like a name (2-4 capitalized words, no special chars)
        // Pattern 1: Standard case "John Doe Smith"
        const namePattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/;
        const match = firstLine.match(namePattern);
        
        if (match) {
            return match[1];
        }
        
        // Pattern 2: ALL CAPS name "JOHN DOE SMITH"
        const allCapsPattern = /^([A-Z]{2,}(?:\s+[A-Z]{2,}){1,3})$/;
        const allCapsMatch = firstLine.match(allCapsPattern);
        
        if (allCapsMatch) {
            // Convert to Title Case
            return allCapsMatch[1].toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        }
        
        // Try first line if it's short enough and doesn't contain common non-name words
        if (firstLine.length < 50 && 
            !firstLine.match(/resume|cv|curriculum|vitae|portfolio|engineer|developer|manager|summary|objective|experience/i)) {
            
            // Check if it's mostly uppercase words (likely an ALL CAPS name)
            const upperWords = firstLine.match(/\b[A-Z]{2,}\b/g);
            if (upperWords && upperWords.length >= 2 && upperWords.length <= 4) {
                // Convert to Title Case
                return upperWords.join(' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            }
            
            // Extract just the capitalized words
            const words = firstLine.match(/[A-Z][a-z]+/g);
            if (words && words.length >= 2 && words.length <= 4) {
                return words.join(' ');
            }
        }
    }
    
    return null;
}

/**
 * Extract location information from text
 * @param {string} text - Resume text
 * @returns {{city: string, state: string, zip: string}|null} Location object or null
 */
export function extractLocation(text) {
    // Try to match "City, ST" or "City, State" pattern
    const cityStatePattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/;
    const match = text.match(cityStatePattern);
    
    if (match) {
        const zipMatch = text.match(PATTERNS.zipCode);
        return {
            city: match[1],
            state: match[2],
            zip: zipMatch ? zipMatch[0] : null
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
    // Common university patterns
    const patterns = [
        // "University of X" or "X University"
        /([A-Z][a-zA-Z\s]+(?:University|Institute|College|School)(?:\s+of\s+[A-Za-z\s]+)?)/,
        // "X Institute of Technology"
        /([A-Z][a-zA-Z\s]+Institute\s+of\s+[A-Za-z\s]+)/,
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
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
    // Pattern for "Master of Science in Data Science" or "Bachelor of Engineering in Computer Engineering"
    const degreePattern = /(?:Master(?:'s)?|Bachelor(?:'s)?|Ph\.?D\.?|M\.?S\.?|B\.?S\.?|B\.?E\.?|M\.?E\.?|M\.?B\.?A\.?|B\.?A\.?|M\.?A\.?)\s*(?:of\s+)?(?:Science|Arts|Engineering|Business|Technology)?\s*(?:in\s+)?([A-Za-z\s]+?)(?:\s*\||,|\n|GPA|$)/i;
    const match = text.match(degreePattern);
    
    if (match) {
        // Extract the degree type
        const degreeTypeMatch = text.match(/(Master(?:'s)?|Bachelor(?:'s)?|Ph\.?D\.?|M\.?S\.?|B\.?S\.?|B\.?E\.?|M\.?E\.?|M\.?B\.?A\.?)\s*(?:of\s+)?(Science|Arts|Engineering|Business|Technology)?/i);
        
        return {
            degree: degreeTypeMatch ? degreeTypeMatch[0].trim() : '',
            major: match[1].trim()
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
    const companies = [];
    
    // Pattern: "Company Name, (Role) – Location" or "Company Name – Location"
    // Common patterns for company lines
    const lines = text.split(/[\n\r]+/);
    
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
        while ((match = pattern.exec(text)) !== null) {
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
        const matches = text.match(pattern);
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
    const sections = {};
    const lines = text.split(/[\n\r]+/);
    
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
