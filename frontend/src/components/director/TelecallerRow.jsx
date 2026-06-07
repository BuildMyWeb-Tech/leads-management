/**
 * TelecallerRow — one row in the telecaller activity table.
 * Shows per-telecaller lead counts across key statuses.
 */
export default function TelecallerRow({ tc, rank }) {
  const convRate = parseFloat(tc.conversionRate);
  const rateColor =
    convRate >= 10 ? 'text-emerald-600' :
    convRate >= 5  ? 'text-blue-600'    :
    convRate > 0   ? 'text-orange-500'  : 'text-gray-400';

  const lastSeen = tc.lastActivity
    ? new Date(tc.lastActivity).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Rank */}
      <td className="table-td w-8">
        <span className={`text-xs font-bold ${rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-gray-400' : 'text-gray-300'}`}>
          #{rank}
        </span>
      </td>

      {/* Name */}
      <td className="table-td">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
            {tc.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 leading-tight">{tc.name}</p>
            <p className="text-xs text-gray-400">{tc.email}</p>
          </div>
        </div>
      </td>

      {/* Total */}
      <td className="table-td text-center">
        <span className="text-sm font-bold text-gray-800">{tc.totalLeads}</span>
      </td>

      {/* Called */}
      <td className="table-td text-center hidden sm:table-cell">
        <span className="text-sm text-yellow-600 font-medium">{tc.called}</span>
      </td>

      {/* Follow Up */}
      <td className="table-td text-center hidden md:table-cell">
        <span className="text-sm text-orange-500 font-medium">{tc.followUp}</span>
      </td>

      {/* Interested */}
      <td className="table-td text-center hidden lg:table-cell">
        <span className="text-sm text-green-600 font-medium">{tc.interested}</span>
      </td>

      {/* Booked */}
      <td className="table-td text-center hidden lg:table-cell">
        <span className="text-sm text-emerald-600 font-bold">{tc.booked}</span>
      </td>

      {/* Conversion */}
      <td className="table-td text-center">
        <span className={`text-sm font-bold ${rateColor}`}>{tc.conversionRate}%</span>
      </td>

      {/* Last active */}
      <td className="table-td hidden xl:table-cell text-xs text-gray-400 whitespace-nowrap">
        {lastSeen}
      </td>
    </tr>
  );
}
