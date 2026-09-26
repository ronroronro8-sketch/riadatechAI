import React from "react";
import { Database, ExternalLink } from "lucide-react";

import openDataSources from "../data/openDataSources";
import "./DataSources.css";

function DataSources({ locale = "ar" }) {
  const isArabic = locale === "ar";
  const labels = {
    badge: isArabic ? "Open Data Lab" : "Open Data Lab Edition",
    title: isArabic ? "Official Data Sources" : "Official Data Sources",
    subtitle: isArabic
      ? "Official datasets used by RiadaTech for the location analysis model."
      : "Official datasets used by RiadaTech for the location analysis model.",
    dataset: "Dataset Name",
    publisher: "Publisher",
    purpose: "Purpose",
    sourceUrl: "Source URL",
  };

  return (
    <main className="rt-data-sources-page" dir={isArabic ? "rtl" : "ltr"}>
      <section className="rt-data-sources-hero">
        <div className="rt-data-sources-badge">
          <Database size={18} />
          <span>{labels.badge}</span>
        </div>
        <h1>{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </section>

      <section className="rt-data-sources-table-wrap" aria-label={labels.title}>
        <table className="rt-data-sources-table">
          <thead>
            <tr>
              <th>{labels.dataset}</th>
              <th>{labels.publisher}</th>
              <th>{labels.purpose}</th>
              <th>{labels.sourceUrl}</th>
            </tr>
          </thead>
          <tbody>
            {openDataSources.map((source) => (
              <tr key={source.portalUrl}>
                <td>
                  <strong>{source.title}</strong>
                </td>
                <td>{source.publisher}</td>
                <td>{source.purpose}</td>
                <td>
                  <a href={source.portalUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    {source.portalUrl}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default DataSources;
