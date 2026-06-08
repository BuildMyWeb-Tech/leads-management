/**
 * TcStatStrip — compact KPI strip for telecaller dashboard.
 */
export default function TcStatStrip({ kpis }) {
  const items = [
    { label: 'Total',        value: kpis.totalLeads,   color: 'text-gray-900',    bg: 'bg-gray-50'    },
    { label: 'Called',       value: kpis.called,       color: 'text-yellow-600',  bg: 'bg-yellow-50'  },
    { label: 'Follow Up',    value: kpis.followUp,     color: 'text-orange-600',  bg: 'bg-orange-50'  },
    { label: 'Site Visits',  value: kpis.siteVisit,    color: 'text-purple-600',  bg: 'bg-purple-50'  },
    { label: 'Interested',   value: kpis.interested,   color: 'text-green-600',   bg: 'bg-green-50'   },
    { label: 'Booked',       value: kpis.booked,       color: 'text-emerald-700', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map((item) => (
        <div key={item.label} className={`${item.bg} rounded-xl p-3 text-center`}>
          <p className={`text-xl font-bold ${item.color}`}>{item.value ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
