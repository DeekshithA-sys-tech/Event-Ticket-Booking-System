export const EventCardSkeleton = () => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm animate-pulse">
      {/* Banner Skeleton */}
      <div className="w-full h-48 bg-slate-200" />

      {/* Content Skeleton */}
      <div className="p-5 space-y-4">
        {/* Category & Status */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 bg-slate-200 rounded-full" />
          <div className="h-4 w-16 bg-slate-200 rounded-full" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <div className="h-5 w-4/5 bg-slate-200 rounded" />
          <div className="h-4 w-1/2 bg-slate-200 rounded" />
        </div>

        {/* Location & Date */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="h-3.5 w-3/4 bg-slate-200 rounded" />
          <div className="h-3.5 w-2/3 bg-slate-200 rounded" />
        </div>

        {/* Price & Action */}
        <div className="flex items-center justify-between pt-3">
          <div className="h-6 w-24 bg-slate-200 rounded" />
          <div className="h-9 w-28 bg-slate-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
