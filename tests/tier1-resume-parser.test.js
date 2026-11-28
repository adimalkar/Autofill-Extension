import test from 'node:test';
import assert from 'node:assert/strict';

import {
    extractName,
    extractPhones,
    extractLocation,
    extractPortfolio,
    extractGPA,
    extractDegreeInfo,
    extractAll
} from '../extension/lib/resume-parser/tier1-regex.js';

test('extractName preserves line boundaries on multi-line resumes and handles ALL CAPS and separators', () => {
    const standardResume = [
        'Ada Lovelace',
        'Senior Software Engineer',
        'ada@analyticalengine.org | (555) 234-5678',
        'Experience',
        'Built analytical algorithms.'
    ].join('\n');
    assert.equal(extractName(standardResume), 'Ada Lovelace');

    const allCapsResume = [
        'JOHN MICHAEL DOE',
        'San Francisco, CA 94105',
        'john.doe@gmail.com'
    ].join('\r\n');
    assert.equal(extractName(allCapsResume), 'John Michael Doe');

    const headerWithContact = 'Mary-Jane O\'Connor | mary@acm.org | https://github.com/mjoconnor\nSoftware Engineer';
    assert.equal(extractName(headerWithContact), 'Mary-Jane O\'Connor');

    const withDocumentTitle = '\n\nRESUME\nAda M. Lovelace\nExperience\n...';
    assert.equal(extractName(withDocumentTitle), 'Ada M. Lovelace');

    assert.equal(extractName('Software Engineer\nExperience\n2020-2024'), null);
});

test('extractPhones ignores year ranges and does not split international numbers into substrings', () => {
    const resumeWithDatesAndIntl = [
        'Work Experience',
        'Acme Corp (2020-2024)',
        'Phone: +91 98765 43210',
        'UK Office: +44 20 7946 0958',
        'US Contact: (555) 123-4567',
        'ZIP+4: 12345-6789'
    ].join('\n');

    assert.deepEqual(extractPhones(resumeWithDatesAndIntl), [
        '+91 98765 43210',
        '+44 20 7946 0958',
        '(555) 123-4567'
    ]);

    assert.deepEqual(extractPhones('Experience 2019-2023 and 2023-2025'), []);
    assert.deepEqual(extractPhones('Call +1-800-555-0199 or 555.234.5678'), [
        '+1-800-555-0199',
        '555.234.5678'
    ]);
});

test('extractLocation validates US state codes and only binds adjacent ZIP codes', () => {
    const textWithFalseTwoLetterCodes = [
        'Ada Lovelace',
        'Machine Learning, AI',
        'Acme Corp, US',
        'San Francisco, CA 94105'
    ].join('\n');

    assert.deepEqual(extractLocation(textWithFalseTwoLetterCodes), {
        city: 'San Francisco',
        state: 'CA',
        zip: '94105'
    });

    const textWithUnrelatedFiveDigits = [
        'New York, NY',
        'Employee badge 90210'
    ].join('\n');

    assert.deepEqual(extractLocation(textWithUnrelatedFiveDigits), {
        city: 'New York',
        state: 'NY',
        zip: null
    });

    assert.deepEqual(extractLocation('Salt Lake City, UT 84101-1234'), {
        city: 'Salt Lake City',
        state: 'UT',
        zip: '84101-1234'
    });
});

test('extractPortfolio trims trailing punctuation and filters by hostname', () => {
    const text = 'LinkedIn: https://linkedin.com/in/adalovelace, GitHub: https://github.com/ada, Site: (https://adalovelace.dev/?ref=linkedin.com).';
    assert.equal(extractPortfolio(text), 'https://adalovelace.dev/?ref=linkedin.com');
    assert.equal(extractPortfolio('Only https://github.com/ada and https://linkedin.com/in/ada'), null);
});

test('extractGPA parses valid GPAs and rejects version numbers or out-of-range ratios', () => {
    assert.deepEqual(extractGPA('CGPA – 3.85/4.0'), { value: '3.85', scale: '4.0' });
    assert.deepEqual(extractGPA('GPA: 3.7'), { value: '3.7', scale: '4.0' });
    assert.deepEqual(extractGPA('Honors (3.92/4.0)'), { value: '3.92', scale: '4.0' });
    assert.equal(extractGPA('Skills: Python 3.10/3.11, TensorFlow 2.0/3.0'), null);
    assert.equal(extractGPA('GPA: 4.5/4.0'), null);
});

test('extractDegreeInfo stops before dates/delimiters and matches comma-separated majors', () => {
    assert.deepEqual(
        extractDegreeInfo('M.S. in Computer Science May 2024\nGPA: 3.9'),
        { degree: 'M.S.', major: 'Computer Science' }
    );
    assert.deepEqual(
        extractDegreeInfo('B.S., Electrical Engineering | MIT'),
        { degree: 'B.S.', major: 'Electrical Engineering' }
    );
});

test('extractAll handles full multi-line resume and guards null/empty inputs', () => {
    const resume = [
        'ADA LOVELACE',
        'San Francisco, CA 94105 | +1 (415) 555-0142 | ada@analytical.org',
        'https://linkedin.com/in/ada-lovelace | https://github.com/adalovelace | https://adalovelace.dev,',
        '',
        'EDUCATION',
        'University of Cambridge',
        'Master of Science in Mathematics May 2024 | GPA: 3.95/4.0',
        '',
        'EXPERIENCE',
        'Analytical Engine Corp – San Francisco, CA (Jan 2021 - Present)',
        'Senior Software Engineer',
        'Skills: Python, TypeScript, React, PostgreSQL'
    ].join('\n');

    const extracted = extractAll(resume);
    assert.equal(extracted.firstName, 'Ada');
    assert.equal(extracted.lastName, 'Lovelace');
    assert.equal(extracted.email, 'ada@analytical.org');
    assert.equal(extracted.phone, '+1 (415) 555-0142');
    assert.equal(extracted.currentCity, 'San Francisco');
    assert.equal(extracted.currentState, 'CA');
    assert.equal(extracted.zipCode, '94105');
    assert.equal(extracted.portfolioWebsite, 'https://adalovelace.dev');
    assert.equal(extracted.gpa, '3.95/4.0');
    assert.equal(extracted.degreeType, 'Master of Science');
    assert.equal(extracted.major, 'Mathematics');

    const emptyResult = extractAll(null);
    assert.equal(emptyResult.fullName, null);
    assert.equal(emptyResult.email, null);
    assert.equal(emptyResult.phone, null);
    assert.deepEqual(emptyResult.dates, []);
    assert.equal(extractAll('').fullName, null);
});
