// Single source of truth for lead pipeline — used across all pages and components

export const LEAD_STATUSES = [
  'New',
  'Allocated',
  'Called',
  'Follow Up',
  'Site Visit Planned',
  'Site Visit Done',
  'Interested',
  'Negotiation',
  'Booked',
  'Wrong Number',
  'Not Interested',
  'Closed',
];

export const LEAD_SOURCES = [
  'YouTube',
  'Google Ads',
  'Facebook',
  'Instagram',
  'Referral',
  'Walk-in',
  'Website',
  'Other',
];

// Which statuses each role is allowed to set
export const ALLOWED_STATUS_TRANSITIONS = {
  admin:      LEAD_STATUSES,
  director:   LEAD_STATUSES,
  telecaller: [
    'Called',
    'Follow Up',
    'Site Visit Planned',
    'Site Visit Done',
    'Interested',
    'Negotiation',
    'Wrong Number',
    'Not Interested',
  ],
};

// Visual config for pipeline stages
export const STATUS_CONFIG = {
  'New':                { color: 'blue',   stage: 1, group: 'intake'     },
  'Allocated':          { color: 'indigo', stage: 2, group: 'intake'     },
  'Called':             { color: 'yellow', stage: 3, group: 'engagement' },
  'Follow Up':          { color: 'orange', stage: 4, group: 'engagement' },
  'Site Visit Planned': { color: 'purple', stage: 5, group: 'visit'      },
  'Site Visit Done':    { color: 'violet', stage: 6, group: 'visit'      },
  'Interested':         { color: 'green',  stage: 7, group: 'conversion' },
  'Negotiation':        { color: 'teal',   stage: 8, group: 'conversion' },
  'Booked':             { color: 'emerald',stage: 9, group: 'conversion' },
  'Wrong Number':       { color: 'red',    stage: 0, group: 'dead'       },
  'Not Interested':     { color: 'red',    stage: 0, group: 'dead'       },
  'Closed':             { color: 'gray',   stage: 0, group: 'dead'       },
};

// Tailwind classes per status color token
export const STATUS_BADGE_CLASSES = {
  'New':                'bg-blue-100 text-blue-700 ring-blue-200',
  'Allocated':          'bg-indigo-100 text-indigo-700 ring-indigo-200',
  'Called':             'bg-yellow-100 text-yellow-700 ring-yellow-200',
  'Follow Up':          'bg-orange-100 text-orange-700 ring-orange-200',
  'Site Visit Planned': 'bg-purple-100 text-purple-700 ring-purple-200',
  'Site Visit Done':    'bg-violet-100 text-violet-700 ring-violet-200',
  'Interested':         'bg-green-100 text-green-700 ring-green-200',
  'Negotiation':        'bg-teal-100 text-teal-700 ring-teal-200',
  'Booked':             'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'Wrong Number':       'bg-red-100 text-red-400 ring-red-200',
  'Not Interested':     'bg-red-100 text-red-700 ring-red-200',
  'Closed':             'bg-gray-100 text-gray-500 ring-gray-200',
};

export const STATUS_BAR_COLORS = {
  'New':                'bg-blue-500',
  'Allocated':          'bg-indigo-500',
  'Called':             'bg-yellow-500',
  'Follow Up':          'bg-orange-500',
  'Site Visit Planned': 'bg-purple-500',
  'Site Visit Done':    'bg-violet-500',
  'Interested':         'bg-green-500',
  'Negotiation':        'bg-teal-500',
  'Booked':             'bg-emerald-500',
  'Wrong Number':       'bg-red-400',
  'Not Interested':     'bg-red-500',
  'Closed':             'bg-gray-400',
};
