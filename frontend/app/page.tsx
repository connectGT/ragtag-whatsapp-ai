"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState<string>("Loading...");

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/hello")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => setMessage("Error connecting to backend"));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-50 text-gray-900">
      <h1 className="text-4xl font-bold mb-4">Macro Project Dashboard</h1>
      <div className="p-6 bg-white rounded shadow-md border border-gray-200">
        <p className="text-xl">
          Backend says: <span className="font-semibold text-blue-600">{message}</span>
        </p>
      </div>
    </div>
  );
}
