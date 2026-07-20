import React, { useState } from 'react';

export default function CaseSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const search = () => {
    // Demo: return mock results
    setResults([
      { id: 1, title: `Case matching "${query}" - Acme v. State`, snippet: 'Key holding: example law applied.' },
      { id: 2, title: `Case matching "${query}" - Smith v. Jones`, snippet: 'Outcome: favorable to plaintiff.' }
    ]);
  };

  return (
    <div className="page case-search">
      <h2>Case Search</h2>
      <div className="search-bar">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search cases, keywords, citations..." />
        <button className="btn" onClick={search}>Search</button>
      </div>
      <div className="results">
        {results.map(r => (
          <div key={r.id} className="case-result">
            <h3>{r.title}</h3>
            <p>{r.snippet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
