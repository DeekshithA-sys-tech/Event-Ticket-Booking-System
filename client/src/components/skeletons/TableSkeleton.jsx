export const TableSkeleton = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm animate-pulse">
      {/* Table Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={`th-${i}`} className="h-4 bg-slate-200 rounded flex-1" />
        ))}
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-slate-100 px-6">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`tr-${r}`} className="py-4 flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={`td-${r}-${c}`}
                className={`h-4 bg-slate-200 rounded ${c === 0 ? 'w-1/3' : 'flex-1'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
