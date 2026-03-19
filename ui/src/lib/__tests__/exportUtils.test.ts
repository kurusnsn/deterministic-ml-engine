import { describe, it, expect } from 'vitest';
import { exportReportToCSV, generateHTMLReport } from '../exportUtils';
import { RepertoireReport } from '@/types/repertoire';

describe('exportUtils Branding', () => {
    const mockReport: RepertoireReport = {
        id: 'test-report',
        user_id: 'test-user',
        name: 'Test Report',
        total_games: 100,
        white_games: 50,
        black_games: 50,
        overall_winrate: 0.55,
        analysis_date: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        white_repertoire: {},
        black_repertoire: {},
        weak_lines: [],
        generated_puzzles: [],
        insights: [],
        time_control_breakdown: [],
    };

    describe('exportReportToCSV', () => {
        it('should include "Chessvector" in the header', () => {
            const csv = exportReportToCSV(mockReport);
            expect(csv).toContain('# Chessvector - Repertoire Analysis Report');
        });
    });

    describe('generateHTMLReport', () => {
        it('should include "Chessvector" name and logo SVG', () => {
            const html = generateHTMLReport(mockReport);
            expect(html).toContain('Chessvector');
            expect(html).toContain('<svg');
            expect(html).toContain('rect');
            expect(html).toContain('branding-name');
        });

        it('should have updated styles for branding', () => {
            const html = generateHTMLReport(mockReport);
            expect(html).toContain('.branding {');
            expect(html).toContain('.branding-name {');
        });
    });
});
