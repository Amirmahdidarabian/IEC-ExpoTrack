import { Header } from "@/components/Header";
export default function LoadingCompanies() { return <main className="app-page companies-page"><Header /><section className="database-hero company-hero"><div><p className="eyebrow">Global company intelligence</p><h1>Companies</h1><p>Loading company intelligence…</p></div></section><div className="page-container"><div className="company-loading panel" aria-label="Loading companies">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div></div></main>; }

