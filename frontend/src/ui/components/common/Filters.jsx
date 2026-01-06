import React from "react";

export function FilterChips({ filters, activeFilter, onFilterChange }) {
  return (
    <div className="filters-bar">
      {filters.map((filter) => (
        <button
          key={filter.value}
          className={`filter-chip ${activeFilter === filter.value ? "active" : ""}`}
          onClick={() => onFilterChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`tab ${activeTab === tab.value ? "active" : ""}`}
          onClick={() => onTabChange(tab.value)}
        >
          {tab.icon && <tab.icon size={16} style={{ marginRight: 6 }} />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
