/**
 * Report Exporter Utility
 * 
 * Export real satellite/conjunction data as CSV.
 * All data is sourced from actual API responses — no mock content.
 */

export interface ExportRow {
    [key: string]: string | number | boolean | null;
}

/**
 * Export data as CSV file download.
 */
export function exportCSV(filename: string, headers: string[], rows: ExportRow[]): void {
    const csvContent = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                const str = String(val);
                // Escape commas and quotes
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }).join(',')
        ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export conjunction data as CSV.
 */
export function exportConjunctions(conjunctions: any[]): void {
    const headers = ['sat1_norad', 'sat1_name', 'sat2_norad', 'sat2_name', 'distance_km', 'timestamp', 'risk_level'];
    const rows = conjunctions.map(c => ({
        sat1_norad: c.sat1_norad,
        sat1_name: c.sat1_name || '',
        sat2_norad: c.sat2_norad,
        sat2_name: c.sat2_name || '',
        distance_km: c.distance,
        timestamp: c.timestamp || '',
        risk_level: c.risk_level || '',
    }));
    exportCSV('conjunction_report', headers, rows);
}

/**
 * Export satellite catalog as CSV.
 */
export function exportSatelliteCatalog(satellites: any[]): void {
    const headers = ['norad_id', 'name', 'object_type', 'is_active'];
    const rows = satellites.map(s => ({
        norad_id: s.norad_id,
        name: s.name,
        object_type: s.object_type || '',
        is_active: s.is_active,
    }));
    exportCSV('satellite_catalog', headers, rows);
}

/**
 * Export orbital elements as CSV (from TLE-parsed data).
 */
export function exportOrbitalElements(elements: any): void {
    const headers = [
        'norad_id', 'inclination_deg', 'raan_deg', 'eccentricity',
        'arg_perigee_deg', 'mean_anomaly_deg', 'mean_motion_rev_day',
        'period_min', 'semi_major_axis_km', 'apogee_km', 'perigee_km',
        'orbit_type', 'epoch_date',
    ];
    const rows = [{
        norad_id: elements.satelliteNumber,
        inclination_deg: elements.inclination,
        raan_deg: elements.raan,
        eccentricity: elements.eccentricity,
        arg_perigee_deg: elements.argOfPerigee,
        mean_anomaly_deg: elements.meanAnomaly,
        mean_motion_rev_day: elements.meanMotion,
        period_min: elements.period,
        semi_major_axis_km: elements.semiMajorAxis,
        apogee_km: elements.apogee,
        perigee_km: elements.perigee,
        orbit_type: elements.orbitType,
        epoch_date: elements.epochDate?.toISOString() || '',
    }];
    exportCSV('orbital_elements', headers, rows);
}
