// Utility functions for exporting reports

import { RepertoireReport, OpeningStats, WeakLine, GeneratedPuzzle, TimeControlBreakdownEntry } from '@/types/repertoire';

const CHESSVECTOR_LOGO_SVG = `
<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="42" height="42" rx="8" fill="#1a1a1a" />
    <rect x="53" y="5" width="42" height="42" rx="8" fill="#a3a3a3" />
    <rect x="5" y="53" width="42" height="42" rx="8" fill="#a3a3a3" />
    <rect x="53" y="53" width="42" height="42" rx="8" fill="#1a1a1a" />
</svg>
`;

/**
 * Convert repertoire report to CSV format with all sections
 */
export function exportReportToCSV(report: RepertoireReport, sourceUsernames: string[] = []): string {
  const lines: string[] = [];

  // Header information
  lines.push(`# Chessvector - Repertoire Analysis Report`);
  lines.push(`# Generated: ${new Date(report.analysis_date).toLocaleDateString()}`);
  lines.push(`# Total Games: ${report.total_games}`);
  lines.push(`# Overall Winrate: ${(report.overall_winrate * 100).toFixed(1)}%`);
  if (sourceUsernames.length > 0) {
    lines.push(`# Players: ${sourceUsernames.join(', ')}`);
  }
  lines.push('');

  // === OPENINGS SECTION ===
  lines.push('## OPENINGS');
  lines.push('Color,ECO Code,Opening Name,Category,Games,Wins,Losses,Draws,Winrate,Frequency');

  // White openings
  Object.entries(report.white_repertoire).forEach(([category, group]) => {
    group.openings.forEach((opening: OpeningStats) => {
      lines.push([
        'White',
        opening.eco_code,
        `"${opening.opening_name}"`,
        category,
        opening.games_count,
        opening.wins,
        opening.losses,
        opening.draws,
        (opening.winrate * 100).toFixed(1) + '%',
        (opening.frequency * 100).toFixed(1) + '%'
      ].join(','));
    });
  });

  // Black openings
  Object.entries(report.black_repertoire).forEach(([category, group]) => {
    group.openings.forEach((opening: OpeningStats) => {
      lines.push([
        'Black',
        opening.eco_code,
        `"${opening.opening_name}"`,
        category,
        opening.games_count,
        opening.wins,
        opening.losses,
        opening.draws,
        (opening.winrate * 100).toFixed(1) + '%',
        (opening.frequency * 100).toFixed(1) + '%'
      ].join(','));
    });
  });

  // === WEAK LINES SECTION ===
  if (report.weak_lines && report.weak_lines.length > 0) {
    lines.push('');
    lines.push('## WEAK LINES');
    lines.push('ECO,Line,Games,Winrate,Avg Eval Swing,Puzzles');

    report.weak_lines.forEach((line: WeakLine) => {
      lines.push([
        line.eco || 'N/A',
        `"${line.line.join(' ')}"`,
        line.games_count,
        (line.winrate * 100).toFixed(1) + '%',
        line.avg_eval_swing.toFixed(2),
        line.puzzle_ids.length
      ].join(','));
    });
  }

  // === PUZZLES SUMMARY SECTION ===
  if (report.generated_puzzles && report.generated_puzzles.length > 0) {
    lines.push('');
    lines.push('## PUZZLES SUMMARY');

    // Count by ECO
    const puzzlesByEco: Record<string, number> = {};
    const puzzlesByType: Record<string, number> = {};

    report.generated_puzzles.forEach((puzzle: GeneratedPuzzle) => {
      const eco = puzzle.eco || 'Unknown';
      puzzlesByEco[eco] = (puzzlesByEco[eco] || 0) + 1;

      const type = puzzle.mistake_type || 'unknown';
      puzzlesByType[type] = (puzzlesByType[type] || 0) + 1;
    });

    lines.push(`Total Puzzles: ${report.generated_puzzles.length}`);
    lines.push('');
    lines.push('By Mistake Type:');
    Object.entries(puzzlesByType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      lines.push(`  ${type}: ${count}`);
    });

    lines.push('');
    lines.push('By Opening (Top 10):');
    Object.entries(puzzlesByEco).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([eco, count]) => {
      lines.push(`  ${eco}: ${count}`);
    });
  }

  // === TIME CONTROL BREAKDOWN ===
  if (report.time_control_breakdown && report.time_control_breakdown.length > 0) {
    lines.push('');
    lines.push('## TIME CONTROL BREAKDOWN');
    lines.push('Time Control,Games,Wins,Losses,Draws,Winrate,Losses On Time');

    report.time_control_breakdown.forEach((entry: TimeControlBreakdownEntry) => {
      const winrate = entry.games > 0
        ? ((entry.wins + 0.5 * entry.draws) / entry.games * 100).toFixed(1)
        : '0.0';
      lines.push([
        entry.label,
        entry.games,
        entry.wins,
        entry.losses,
        entry.draws,
        winrate + '%',
        entry.losses_on_time || 0
      ].join(','));
    });
  }

  // === PLAYSTYLE SECTION ===
  if (report.playstyle_profile) {
    lines.push('');
    lines.push('## PLAYSTYLE PROFILE');
    const s = report.playstyle_profile.overall;
    lines.push(`Tactical: ${(s.tactical * 100).toFixed(0)}%`);
    lines.push(`Positional: ${(s.positional * 100).toFixed(0)}%`);
    lines.push(`Aggressive: ${(s.aggressive * 100).toFixed(0)}%`);
    lines.push(`Defensive: ${(s.defensive * 100).toFixed(0)}%`);
    lines.push(`Open Positions: ${(s.open_positions * 100).toFixed(0)}%`);
    lines.push(`Closed Positions: ${(s.closed_positions * 100).toFixed(0)}%`);

    if (report.playstyle_profile.recommendations.length > 0) {
      lines.push('');
      lines.push('Recommendations:');
      report.playstyle_profile.recommendations.forEach(rec => {
        lines.push(`  - ${rec}`);
      });
    }
  }

  // === INSIGHTS SECTION ===
  if (report.insights && report.insights.length > 0) {
    lines.push('');
    lines.push('## INSIGHTS');
    report.insights.forEach(insight => {
      lines.push(`[${insight.priority.toUpperCase()}] ${insight.type}: ${insight.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Generate a filename for the exported report
 */
export function generateExportFilename(
  report: RepertoireReport,
  sourceUsernames: string[] = [],
  extension: string = 'csv'
): string {
  const date = new Date(report.analysis_date).toISOString().split('T')[0];

  if (sourceUsernames.length === 0) {
    return `repertoire-analysis-${date}.${extension}`;
  } else if (sourceUsernames.length === 1) {
    return `${sourceUsernames[0]}-analysis-${date}.${extension}`;
  } else {
    return `multi-account-analysis-${date}.${extension}`;
  }
}

/**
 * Download content as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Export report as CSV file
 */
export function exportReportAsCSV(report: RepertoireReport, sourceUsernames: string[] = []): void {
  const csvContent = exportReportToCSV(report, sourceUsernames);
  const filename = generateExportFilename(report, sourceUsernames, 'csv');
  downloadFile(csvContent, filename, 'text/csv');
}

/**
 * Export report as JSON file (complete data export)
 */
export function exportReportAsJSON(report: RepertoireReport, sourceUsernames: string[] = []): void {
  const exportData = {
    meta: {
      exported_at: new Date().toISOString(),
      source_usernames: sourceUsernames,
    },
    report: report
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  const filename = generateExportFilename(report, sourceUsernames, 'json');
  downloadFile(jsonContent, filename, 'application/json');
}

/**
 * Generate a comprehensive HTML report
 */
export function generateHTMLReport(report: RepertoireReport, sourceUsernames: string[] = []): string {
  const date = new Date(report.analysis_date).toLocaleDateString();

  // Helper to generate puzzle summary HTML
  const generatePuzzleSummary = () => {
    if (!report.generated_puzzles || report.generated_puzzles.length === 0) return '';

    const puzzlesByType: Record<string, number> = {};
    report.generated_puzzles.forEach((puzzle: GeneratedPuzzle) => {
      const type = puzzle.mistake_type || 'unknown';
      puzzlesByType[type] = (puzzlesByType[type] || 0) + 1;
    });

    return `
    <div class="section puzzles-section">
        <h2>🧩 Generated Puzzles (${report.generated_puzzles.length})</h2>
        <div class="stats-grid">
            ${Object.entries(puzzlesByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `
                <div class="stat-box">
                    <strong>${count}</strong>
                    <span>${type}</span>
                </div>
            `).join('')}
        </div>
    </div>
    `;
  };

  // Helper to generate weak lines HTML
  const generateWeakLinesHTML = () => {
    if (!report.weak_lines || report.weak_lines.length === 0) return '';

    return `
    <div class="section weak-lines-section">
        <h2>⚠️ Weak Lines (${report.weak_lines.length})</h2>
        <table>
            <tr>
                <th>ECO</th>
                <th>Line</th>
                <th>Games</th>
                <th>Winrate</th>
                <th>Eval Swing</th>
            </tr>
            ${report.weak_lines.slice(0, 15).map((line: WeakLine) => `
                <tr>
                    <td>${line.eco || 'N/A'}</td>
                    <td class="line-moves">${line.line.slice(0, 6).join(' ')}${line.line.length > 6 ? '...' : ''}</td>
                    <td>${line.games_count}</td>
                    <td class="${line.winrate < 0.4 ? 'text-red' : ''}">${(line.winrate * 100).toFixed(1)}%</td>
                    <td>${line.avg_eval_swing.toFixed(2)}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    `;
  };

  // Helper to generate playstyle HTML
  const generatePlaystyleHTML = () => {
    if (!report.playstyle_profile) return '';

    const s = report.playstyle_profile.overall;
    const traits = [
      { name: 'Tactical', value: s.tactical },
      { name: 'Positional', value: s.positional },
      { name: 'Aggressive', value: s.aggressive },
      { name: 'Defensive', value: s.defensive },
      { name: 'Open Positions', value: s.open_positions },
      { name: 'Closed Positions', value: s.closed_positions },
    ];

    return `
    <div class="section playstyle-section">
        <h2>🎯 Playstyle Profile</h2>
        <div class="playstyle-bars">
            ${traits.map(t => `
                <div class="playstyle-bar">
                    <span class="label">${t.name}</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${(t.value * 100)}%"></div>
                    </div>
                    <span class="value">${(t.value * 100).toFixed(0)}%</span>
                </div>
            `).join('')}
        </div>
        ${report.playstyle_profile.recommendations.length > 0 ? `
        <div class="recommendations">
            <h4>Recommendations</h4>
            <ul>
                ${report.playstyle_profile.recommendations.map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
    `;
  };

  // Helper to generate time control breakdown HTML
  const generateTimeControlHTML = () => {
    if (!report.time_control_breakdown || report.time_control_breakdown.length === 0) return '';

    return `
    <div class="section time-control-section">
        <h2>⏱️ Time Control Breakdown</h2>
        <table>
            <tr>
                <th>Time Control</th>
                <th>Games</th>
                <th>Win</th>
                <th>Draw</th>
                <th>Loss</th>
                <th>Winrate</th>
            </tr>
            ${report.time_control_breakdown.map((entry: TimeControlBreakdownEntry) => {
      const winrate = entry.games > 0 ? ((entry.wins + 0.5 * entry.draws) / entry.games * 100).toFixed(1) : '0.0';
      return `
                <tr>
                    <td><strong>${entry.label}</strong></td>
                    <td>${entry.games}</td>
                    <td class="text-green">${entry.wins}</td>
                    <td>${entry.draws}</td>
                    <td class="text-red">${entry.losses}</td>
                    <td>${winrate}%</td>
                </tr>
              `;
    }).join('')}
        </table>
    </div>
    `;
  };

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Repertoire Analysis Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; max-width: 1000px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .branding { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px; }
        .branding svg { width: 40px; height: 40px; }
        .branding-name { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; color: #1a1a1a; }
        .header h1 { margin-bottom: 5px; font-size: 20px; color: #666; }
        .summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px; }
        .summary h2 { margin-top: 0; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
        .summary-item { text-align: center; }
        .summary-item .value { font-size: 24px; font-weight: bold; }
        .summary-item .label { opacity: 0.9; font-size: 14px; }
        .section { margin-bottom: 30px; }
        .section h2 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: 600; }
        tr:nth-child(even) { background-color: #fafafa; }
        .category-header { background-color: #e8f4f8; font-weight: bold; margin-top: 15px; }
        .white-section { border-left: 4px solid #22c55e; padding-left: 15px; }
        .black-section { border-left: 4px solid #3b82f6; padding-left: 15px; }
        .text-red { color: #ef4444; }
        .text-green { color: #22c55e; }
        .insight { padding: 10px; margin: 8px 0; border-radius: 5px; border-left: 4px solid; }
        .insight-warning { background: #fef3c7; border-color: #f59e0b; }
        .insight-suggestion { background: #dbeafe; border-color: #3b82f6; }
        .insight-strength { background: #dcfce7; border-color: #22c55e; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; }
        .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-box strong { display: block; font-size: 20px; color: #1f2937; }
        .stat-box span { font-size: 12px; color: #6b7280; text-transform: capitalize; }
        .playstyle-bars { display: flex; flex-direction: column; gap: 10px; }
        .playstyle-bar { display: flex; align-items: center; gap: 10px; }
        .playstyle-bar .label { width: 120px; font-size: 14px; }
        .playstyle-bar .bar-container { flex: 1; height: 20px; background: #e5e7eb; border-radius: 10px; overflow: hidden; }
        .playstyle-bar .bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 10px; }
        .playstyle-bar .value { width: 50px; text-align: right; font-weight: 600; }
        .line-moves { font-family: monospace; font-size: 12px; }
        .recommendations { margin-top: 15px; background: #f0fdf4; padding: 15px; border-radius: 8px; }
        .recommendations h4 { margin-top: 0; color: #166534; }
        @media print { body { margin: 0; } .section { page-break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="branding">
            ${CHESSVECTOR_LOGO_SVG}
            <span class="branding-name">Chessvector</span>
        </div>
        <h1>Repertoire Analysis Report</h1>
        <p>Generated on ${date}</p>
        ${sourceUsernames.length > 0 ? `<p><strong>Players:</strong> ${sourceUsernames.join(', ')}</p>` : ''}
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="value">${report.total_games}</div>
                <div class="label">Total Games</div>
            </div>
            <div class="summary-item">
                <div class="value">${report.white_games}</div>
                <div class="label">White Games</div>
            </div>
            <div class="summary-item">
                <div class="value">${report.black_games}</div>
                <div class="label">Black Games</div>
            </div>
            <div class="summary-item">
                <div class="value">${(report.overall_winrate * 100).toFixed(1)}%</div>
                <div class="label">Overall Winrate</div>
            </div>
        </div>
    </div>

    ${generatePlaystyleHTML()}

    ${generateTimeControlHTML()}

    <div class="section white-section">
        <h2>♔ White Repertoire</h2>
        ${Object.entries(report.white_repertoire).map(([category, group]) => `
            <h3 class="category-header">${category.charAt(0).toUpperCase() + category.slice(1)} (${group.total_games} games, ${(group.avg_winrate * 100).toFixed(1)}% avg winrate)</h3>
            <table>
                <tr>
                    <th>ECO</th>
                    <th>Opening</th>
                    <th>Games</th>
                    <th>W-D-L</th>
                    <th>Winrate</th>
                    <th>Frequency</th>
                </tr>
                ${group.openings.map((opening: OpeningStats) => `
                    <tr>
                        <td>${opening.eco_code}</td>
                        <td>${opening.opening_name}</td>
                        <td>${opening.games_count}</td>
                        <td>${opening.wins}-${opening.draws}-${opening.losses}</td>
                        <td>${(opening.winrate * 100).toFixed(1)}%</td>
                        <td>${(opening.frequency * 100).toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </table>
        `).join('')}
    </div>

    <div class="section black-section">
        <h2>♚ Black Repertoire</h2>
        ${Object.entries(report.black_repertoire).map(([category, group]) => `
            <h3 class="category-header">${category.charAt(0).toUpperCase() + category.slice(1)} (${group.total_games} games, ${(group.avg_winrate * 100).toFixed(1)}% avg winrate)</h3>
            <table>
                <tr>
                    <th>ECO</th>
                    <th>Opening</th>
                    <th>Games</th>
                    <th>W-D-L</th>
                    <th>Winrate</th>
                    <th>Frequency</th>
                </tr>
                ${group.openings.map((opening: OpeningStats) => `
                    <tr>
                        <td>${opening.eco_code}</td>
                        <td>${opening.opening_name}</td>
                        <td>${opening.games_count}</td>
                        <td>${opening.wins}-${opening.draws}-${opening.losses}</td>
                        <td>${(opening.winrate * 100).toFixed(1)}%</td>
                        <td>${(opening.frequency * 100).toFixed(1)}%</td>
                    </tr>
                `).join('')}
            </table>
        `).join('')}
    </div>

    ${generateWeakLinesHTML()}

    ${generatePuzzleSummary()}

    ${report.insights && report.insights.length > 0 ? `
    <div class="section">
        <h2>💡 Key Insights</h2>
        ${report.insights.map(insight => `
            <div class="insight insight-${insight.type}">
                <strong>${insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}:</strong> ${insight.message}
            </div>
        `).join('')}
    </div>
    ` : ''}
</body>
</html>
`;
}

/**
 * Export report as HTML file (can be printed to PDF)
 */
export function exportReportAsHTML(report: RepertoireReport, sourceUsernames: string[] = []): void {
  const htmlContent = generateHTMLReport(report, sourceUsernames);
  const filename = generateExportFilename(report, sourceUsernames, 'html');
  downloadFile(htmlContent, filename, 'text/html');
}

/**
 * Print report (opens print dialog with HTML content)
 */
export function printReport(report: RepertoireReport, sourceUsernames: string[] = []): void {
  const htmlContent = generateHTMLReport(report, sourceUsernames);

  // Create a new window with the report content
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }
}