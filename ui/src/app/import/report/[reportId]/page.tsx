
"use client";


import { useParams } from 'next/navigation';

export default function ReportPage() {
  const params = useParams();
  const reportId = params?.reportId;

  return (
    <div>
      <h1 className="text-xl font-bold">Report: {reportId}</h1>

    </div>
  );
}