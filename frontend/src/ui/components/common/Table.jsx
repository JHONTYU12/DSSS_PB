import React from "react";

export function Table({ columns, data, onRowClick, selectedId, emptyMessage = "Sin datos" }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className={`table ${onRowClick ? "table-clickable" : ""}`}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : {}}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={row.id || idx}
              onClick={() => onRowClick?.(row)}
              className={selectedId && row.id === selectedId ? "selected" : ""}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
