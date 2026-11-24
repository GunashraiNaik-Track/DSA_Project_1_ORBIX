export const CHANAKYA_SCHOOLS = [
  'School of Engineering',
  'School of Arts, Humanities and Social Sciences',
  'School of Management Sciences',
  'School of Mathematics and Natural Sciences',
  'School of Law, Governance and Public Policy',
  'School of Biosciences',
] as const;

export type ChanakyaSchool = (typeof CHANAKYA_SCHOOLS)[number];

export const COMMUNITY_CATEGORIES = [
  ...CHANAKYA_SCHOOLS,
  'Cross-School / University-Wide',
] as const;

export const SCHOOL_PROGRAMMES: Record<string, string[]> = {
  'School of Engineering': [
    'B.Tech. in Robotics & Automation',
    'B.Tech. in Electronics & Communication Engineering',
    'B.Tech. in Computer Science & Engineering',
    'BCA (Hons.) – Data Science / Cyber Security',
    'B.Tech. in Computer Science & Artificial Intelligence',
    'B.Tech. in Electronics Engineering (VLSI & Embedded Systems)',
    'B.Tech. in Electrical Engineering & Computer Science',
    'B.Tech. in Mechanical & Aerospace Engineering',
    'B.Tech. in Civil Engineering',
  ],
  'School of Arts, Humanities and Social Sciences': [
    'B.A. Political Science and International Relations',
    'B.A. (Hons.) Economics',
    'B.Sc. (Hons.) Psychology',
    'CSEP( Civil Services Examination Preparation) Training Programme',
  ],
  'School of Management Sciences': [
    'B. Com. Honours',
    'Bachelor of Business Administration (B.B.A. Honours)',
  ],
  'School of Mathematics and Natural Sciences': [
    'B.Sc. Hons. Physics',
    'B.Sc. Hons. Mathematics',
    'B.Sc. Hons. Data Science',
    'B.Sc. Hons. Chemistry',
  ],
  'School of Law, Governance and Public Policy': [
    '5-years B.A., LL.B. (Hons.)',
    '5-years B.B.A., LL.B. (Hons.)',
  ],
  'School of Biosciences': [
    'B.Tech. in Biotechnology & Bioengineering',
    'B.Sc. Hons. Biotechnology',
  ],
};

export const STUDENT_YEARS = [
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
  '5th Year',
  'Postgraduate',
];

export const FACULTY_DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'Visiting Faculty',
  'Research Fellow',
];
