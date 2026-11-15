// Gráfico em recharts (biblioteca pesada): carregado só quando uma tela com gráfico abre (ver GraficoSimples em inteligencia.jsx)
import React from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { BLUE, RED } from "./lib/constantes";
const moeda = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function GraficoRecharts({ T, tipo = "barras", dados, formato, altura = 210, cor = BLUE }) {
  const fmt = (v) => (formato === "moeda" ? moeda(v) : Number(v).toLocaleString("pt-BR"));
  const comum = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,150,.18)" vertical={false} />
      <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: T.subtext }} interval={0} angle={dados.length > 6 ? -30 : 0} textAnchor={dados.length > 6 ? "end" : "middle"} height={dados.length > 6 ? 58 : 26} />
      <YAxis tick={{ fontSize: 10, fill: T.subtext }} width={formato === "moeda" ? 62 : 32} tickFormatter={(v) => (formato === "moeda" ? `R$${Math.round(v / 100) / 10}k` : v)} />
      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: T.card, border: "none", borderRadius: 12, fontSize: 12, color: T.text }} labelStyle={{ color: T.text }} />
    </>
  );
  return (
    <div style={{ width: "100%", height: altura }}>
      <ResponsiveContainer>
        {tipo === "linha" ? (
          <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{comum}<Line type="monotone" dataKey="valor" stroke={cor} strokeWidth={2.5} dot={{ r: 2.5 }} /></LineChart>
        ) : (
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>{comum}
            <Bar dataKey="valor" radius={[6, 6, 0, 0]}>{dados.map((d, i) => <Cell key={i} fill={i === 0 && dados.length > 1 && tipo === "ranking" ? RED : cor} />)}</Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
