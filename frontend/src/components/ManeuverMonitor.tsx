import React, { useEffect, useRef } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { fetchAnomalyAnalysis } from '../services/api';

interface ManeuverMonitorProps {
    watchedSatellites: number[]; // List of NORAD IDs to monitor
    pollInterval?: number; // ms, default 5 minutes
}

export const ManeuverMonitor: React.FC<ManeuverMonitorProps> = ({
    watchedSatellites,
    pollInterval = 300000
}) => {
    const { addNotification } = useNotifications();
    const lastChecked = useRef<Record<number, Date>>({});

    useEffect(() => {
        if (watchedSatellites.length === 0) return;

        const checkAnomalies = async () => {
            console.log("Checking for maneuvers...", watchedSatellites);

            for (const noradId of watchedSatellites) {
                try {
                    // Skip if checked recently (within last poll interval - 10s)
                    const last = lastChecked.current[noradId];
                    if (last && (new Date().getTime() - last.getTime() < pollInterval - 10000)) {
                        continue;
                    }

                    const data = await fetchAnomalyAnalysis(noradId);
                    if (!data) continue;

                    lastChecked.current[noradId] = new Date();

                    if (data.status === 'anomalies_detected' && data.anomalies.length > 0) {
                        // Get most recent anomaly
                        const latest = data.anomalies[0];
                        const date = new Date(latest.epoch);

                        // Only notify if anomaly is recent (e.g. within last 3 days)
                        // Otherwise we spam users with old history
                        const threeDaysAgo = new Date();
                        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

                        if (date > threeDaysAgo) {
                            addNotification(
                                'maneuver',
                                'warning',
                                `Maneuver Detected: ${data.name || noradId}`,
                                `${latest.description} detected on ${date.toLocaleDateString()}`,
                                noradId,
                                latest
                            );
                        }
                    }
                } catch (err) {
                    console.error(`Failed to check anomalies for ${noradId}`, err);
                }
            }
        };

        // Initial check
        checkAnomalies();

        // Polling
        const interval = setInterval(checkAnomalies, pollInterval);
        return () => clearInterval(interval);
    }, [watchedSatellites, pollInterval, addNotification]);

    return null; // Logic-only component
};
