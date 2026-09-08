import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ChatGraph({ chartData }) {
  if (!chartData || !chartData.grafico || !chartData.data) {
    return null;
  }

  return (
    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 my-3 text-white">
      <h4 className="text-sm font-semibold text-sky-400 mb-3">
        {chartData.titulo || 'Análise Gráfica'}
      </h4>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData.data}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                color: '#fff',
              }}
            />
            <Bar dataKey="valor" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
} 