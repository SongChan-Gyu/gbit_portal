import { Skeleton } from "@/components/ui/Skeleton";

export default function EmployeesLoading() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              {["", "이름", "팀", "이메일", ""].map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                <td className="px-4 py-3"><Skeleton className="h-8 w-16" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
