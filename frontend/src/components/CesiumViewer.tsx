import React, { useEffect, useRef, useState, useCallback, MutableRefObject } from 'react';
import { useSimulation } from '../context/SimulationContext';

import {
    Viewer,
    Cartesian3,
    Cartesian2,
    Color,
    Ion,
    PointPrimitiveCollection,
    PolylineCollection,
    BillboardCollection,
    LabelCollection,
    Viewer as CesiumViewerType,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    HorizontalOrigin,
    VerticalOrigin,
    JulianDate,
    ClockViewModel,
    Material,
    EllipsoidGraphics,
    Math as CesiumMath,
    HeadingPitchRange,
    DistanceDisplayCondition,
    NearFarScalar,
    CallbackProperty,
    Rectangle,
    ColorMaterialProperty,
    Quaternion
} from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { fetchAllPositions, Position, connectToPositionStream, fetchSatelliteOrbit, OrbitPoint } from '../services/api';
import { ConjunctionEvent, getRiskColor, getRiskLevel } from '../services/conjunctions';
import { computeDensityGrid, getHeatmapColor } from '../utils/densityHeatmap';
import { detectStarlinkTrains, getTrainPolyline } from '../utils/starlinkTrain';
import { createProceduralISS, createProceduralHubble, createProceduralStarlink } from '../utils/satelliteModels';

Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1N2EzNTUzNy1mOGY0LTRlMTgtYjM3NC1hOTkzMWUwM2ZmZDIiLCJpZCI6MzkxMjA5LCJpYXQiOjE3NzEyODI2NzB9.3gbMjb7yByTzSQp5J3ec4K2xfEu7UpD-_dn10CPDWvQ';

interface CesiumViewerProps {
    conjunctions: ConjunctionEvent[];
    onSelectSat?: (sat: Position | null) => void;
    selectedConjunction?: ConjunctionEvent | null;
    visibleSatNoradIds?: Set<number>;
    onFocusSatRef?: MutableRefObject<((noradId: number) => void) | null>;
    cinematicMode?: boolean;
    filterPreset?: string;
    debrisFragments?: { id: string, fragments: any[], color: string }[];
    showHeatmap?: boolean;
    watchedNoradIds?: Set<number>;
    flyToTarget?: { lat: number; lon: number; alt: number } | null;
}

const CesiumViewer: React.FC<CesiumViewerProps> = ({
    conjunctions,
    onSelectSat,
    selectedConjunction,
    visibleSatNoradIds,
    onFocusSatRef,
    cinematicMode = false,
    filterPreset,
    debrisFragments = [],
    showHeatmap = false,
    watchedNoradIds,
    flyToTarget
}) => {
    const { cesiumClock } = useSimulation();
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<CesiumViewerType | null>(null);

    const pointsRef = useRef<PointPrimitiveCollection | null>(null);
    const linesRef = useRef<PolylineCollection | null>(null);
    const billboardsRef = useRef<BillboardCollection | null>(null);
    const labelsRef = useRef<LabelCollection | null>(null);
    const gsLinesRef = useRef<PolylineCollection | null>(null);
    const debrisPointsRef = useRef<PointPrimitiveCollection | null>(null);
    const terminatorEntitiesRef = useRef<string[]>([]);
    const starlinkEntitiesRef = useRef<string[]>([]);
    const starlinkBillboardsRef = useRef<BillboardCollection | null>(null);

    const [selectedSat, setSelectedSat] = useState<Position | null>(null);
    const latestPositionsRef = useRef<Position[]>([]);
    const watchedIdsRef = useRef(watchedNoradIds);
    const [heatmapTrigger, setHeatmapTrigger] = useState(0); // Force heatmap update
    const showHeatmapRef = useRef(showHeatmap);
    const cinematicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const cinematicIndexRef = useRef<number>(0);

    // Sync ref with prop
    useEffect(() => {
        showHeatmapRef.current = showHeatmap;
        watchedIdsRef.current = watchedNoradIds;
        if (showHeatmap) {
            setHeatmapTrigger(prev => prev + 1);
        }
    }, [showHeatmap, watchedNoradIds]);

    // Ground station constants (Ankara)
    const GS_LAT = 39.9334;
    const GS_LON = 32.8597;
    const GS_ALT = 0.938; // km

    // ═══════════════════════════════════════════════════
    // Initial Setup
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (!containerRef.current) return;

        const viewer = new Viewer(containerRef.current, {
            terrainProvider: undefined,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            sceneModePicker: false,
            selectionIndicator: false,
            timeline: false,
            navigationHelpButton: false,
            animation: false,
            fullscreenButton: false,
            creditContainer: document.createElement("div"),
            clockViewModel: new ClockViewModel(cesiumClock),
            shouldAnimate: true
        });

        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.depthTestAgainstTerrain = false; // Allow orbit lines behind globe
        viewer.scene.backgroundColor = Color.BLACK;
        viewer.canvas.style.cursor = 'crosshair';
        viewerRef.current = viewer;

        // Primitive collections
        pointsRef.current = viewer.scene.primitives.add(new PointPrimitiveCollection());
        linesRef.current = viewer.scene.primitives.add(new PolylineCollection());
        billboardsRef.current = viewer.scene.primitives.add(new BillboardCollection());
        labelsRef.current = viewer.scene.primitives.add(new LabelCollection());
        gsLinesRef.current = viewer.scene.primitives.add(new PolylineCollection());
        debrisPointsRef.current = viewer.scene.primitives.add(new PointPrimitiveCollection());
        starlinkBillboardsRef.current = viewer.scene.primitives.add(new BillboardCollection());

        // ── Ground Station Marker ──
        const gsPoints = viewer.scene.primitives.add(new PointPrimitiveCollection());
        gsPoints.add({
            position: Cartesian3.fromDegrees(GS_LON, GS_LAT, GS_ALT * 1000),
            color: Color.fromCssColorString('#00FF88'),
            pixelSize: 10,
            outlineColor: Color.WHITE,
            outlineWidth: 2,
        });

        // ── Sensor FOV Cone (Ground Station) ──
        const fovHalfAngle = 70; // degrees, typical ground station antenna
        const fovHeight = 2000000; // 2000km sensor reach
        const fovTopRadius = fovHeight * Math.tan(CesiumMath.toRadians(fovHalfAngle));
        viewer.entities.add({
            id: 'gs-fov-cone',
            position: Cartesian3.fromDegrees(GS_LON, GS_LAT, GS_ALT * 1000 + fovHeight / 2),
            cylinder: {
                length: fovHeight,
                topRadius: fovTopRadius,
                bottomRadius: 500,
                material: Color.fromCssColorString('#00FF88').withAlpha(0.04),
                outline: true,
                outlineColor: Color.fromCssColorString('#00FF88').withAlpha(0.15),
                numberOfVerticalLines: 16,
            }
        });

        // ── Picking Handler ──
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
            const pickedObject = viewer.scene.pick(click.position);
            // Robust check: Only proceed if picked object has a valid Position identity (norad_id)
            if (pickedObject && pickedObject.id && typeof pickedObject.id === 'object' && 'norad_id' in pickedObject.id) {
                const sat = pickedObject.id as Position;
                setSelectedSat(sat);
                if (onSelectSat) onSelectSat(sat);
            } else {
                // Ignore clicks on heatmap or orbit lines for selection purposes
                // Or if you want to DESELECT when clicking empty space:
                if (!pickedObject) {
                    setSelectedSat(null);
                    if (onSelectSat) onSelectSat(null);
                }
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        // ── Expose focus callback to parent ──
        if (onFocusSatRef) {
            onFocusSatRef.current = (noradId: number) => {
                const positions = latestPositionsRef.current;
                const sat = positions.find(p => p.norad_id === noradId);
                if (sat && viewerRef.current) {
                    const destination = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000 + 500000);
                    viewerRef.current.camera.flyTo({ destination, duration: 1.5 });
                    setSelectedSat(sat);
                    if (onSelectSat) onSelectSat(sat);
                }
            };
        }

        return () => {
            handler.destroy();
            viewer.destroy();
            if (onFocusSatRef) onFocusSatRef.current = null;
        };
    }, []);

    // ═══════════════════════════════════════════════════
    // Conjunction Lines
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    // Conjunction Lines & Labels
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (!linesRef.current || !billboardsRef.current || !labelsRef.current) return;
        const lines = linesRef.current;
        const billboards = billboardsRef.current;
        const labels = labelsRef.current;

        lines.removeAll();
        billboards.removeAll();
        labels.removeAll();

        conjunctions.forEach(event => {
            const color = Color.fromCssColorString(getRiskColor(getRiskLevel(event.distance)));
            const p1 = Cartesian3.fromDegrees(event.sat1_position.x, event.sat1_position.y, event.sat1_position.z * 1000);
            const p2 = Cartesian3.fromDegrees(event.sat2_position.x, event.sat2_position.y, event.sat2_position.z * 1000);
            const midpoint = Cartesian3.midpoint(p1, p2, new Cartesian3());

            lines.add({
                positions: [p1, p2],
                width: 2,
                material: Material.fromType('Color', { color })
            });

            billboards.add({
                position: midpoint,
                image: '/warning-icon.png',
                color: color,
                scale: 0.8,
                verticalOrigin: VerticalOrigin.BOTTOM,
                heightReference: 0 // NONE
            });

            labels.add({
                position: midpoint,
                text: `${event.distance.toFixed(3)} km`,
                font: '16px monospace',
                fillColor: Color.WHITE,
                showBackground: true,
                backgroundColor: color.withAlpha(0.7),
                backgroundPadding: new Cartesian2(4, 2),
                pixelOffset: new Cartesian2(0, 20),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 50000000),
                scaleByDistance: new NearFarScalar(1e2, 1.5, 1e7, 0.5),
                verticalOrigin: VerticalOrigin.TOP
            });
        });
    }, [conjunctions]);

    // ═══════════════════════════════════════════════════
    // Focus Camera on Selected Conjunction
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (selectedConjunction && viewerRef.current) {
            const p1 = Cartesian3.fromDegrees(selectedConjunction.sat1_position.x, selectedConjunction.sat1_position.y, selectedConjunction.sat1_position.z * 1000);
            const p2 = Cartesian3.fromDegrees(selectedConjunction.sat2_position.x, selectedConjunction.sat2_position.y, selectedConjunction.sat2_position.z * 1000);
            const midpoint = Cartesian3.midpoint(p1, p2, new Cartesian3());
            viewerRef.current.camera.flyTo({ destination: midpoint, duration: 1.5, maximumHeight: 20000000 });
        }
    }, [selectedConjunction]);

    // ═══════════════════════════════════════════════════
    // Procedural 3D Models & Orbit Path
    // ═══════════════════════════════════════════════════
    const modelEntitiesRef = useRef<any[]>([]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Clean up old models
        modelEntitiesRef.current.forEach(e => viewer.entities.remove(e));
        modelEntitiesRef.current = [];

        const orbitId = "selected-sat-orbit";
        viewer.entities.removeById(orbitId);

        // Validation: Ensure selectedSat exists and has valid numerical coordinates
        if (selectedSat &&
            typeof selectedSat.lat === 'number' &&
            typeof selectedSat.lon === 'number' &&
            !isNaN(selectedSat.lat) &&
            !isNaN(selectedSat.lon)
        ) {
            // 1. Orbit Path (Past + Future)
            fetchSatelliteOrbit(selectedSat.norad_id, 90, 90).then((orbitPoints: OrbitPoint[]) => {
                if (!orbitPoints || orbitPoints.length === 0) return;

                const positions = orbitPoints.map(p =>
                    Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000)
                );

                viewer.entities.add({
                    id: orbitId,
                    polyline: {
                        positions: positions,
                        width: 3,
                        material: Color.CYAN.withAlpha(0.6),
                        depthFailMaterial: Color.CYAN.withAlpha(0.15),
                    }
                });
            }).catch((err: any) => console.error("Orbit fetch error:", err));

            // 2. Procedural 3D Model (if applicable)
            // We need a live position property for the model
            // For now, we fix it to the latest known position (static model for the moment of selection)
            // Ideally, we'd use SampledPositionProperty, but for a "WOW" snapshot, static is okay if updated.
            // BETTER: Use the orbit points to create a SampledPositionProperty!

            // 2. Procedural 3D Model (if applicable)
            if (viewer && selectedSat) {
                const position = Cartesian3.fromDegrees(selectedSat.lon, selectedSat.lat, selectedSat.alt * 1000);
                const orientation = Quaternion.IDENTITY;

                let entities: any[] = [];
                try {
                    if (selectedSat.norad_id === 25544) {
                        entities = createProceduralISS(viewer, position, orientation);
                    } else if (selectedSat.norad_id === 20580) {
                        entities = createProceduralHubble(viewer, position, orientation);
                    } else if (selectedSat.name?.toUpperCase().includes('STARLINK')) {
                        entities = createProceduralStarlink(viewer, position, orientation, `starlink-model-${selectedSat.norad_id}`);
                    }
                } catch (e) {
                    console.error("Failed to generate procedural model:", e);
                    entities = [];
                }

                if (entities && entities.length > 0) {
                    modelEntitiesRef.current = entities;
                }
            }
        }
    }, [selectedSat]);

    // ═══════════════════════════════════════════════════
    // Eclipse / Shadow Analysis
    // ═══════════════════════════════════════════════════
    const isEclipsed = (satPos: Cartesian3, sunPos: Cartesian3): boolean => {
        // Simple cylinder shadow model
        // 1. Project sat vector onto sun vector (inverse)
        // Earth is at (0,0,0)

        // Vector from Earth to Sun (normalized)
        const sunDir = Cartesian3.normalize(sunPos, new Cartesian3());

        // Projection of Sat along Sun direction
        const dot = Cartesian3.dot(satPos, sunDir);

        // If dot > 0, satellite is on the sun-side of the plane perpendicular to sun-earth line
        // But we want to be strict. Eclipse happens when sat is "behind" earth.
        // Actually, simpler:
        // Angle between Sat vector and Sun vector must be > 90 deg (dot < 0)
        // AND distance from line < Earth Radius

        if (dot >= 0) return false; // In front of Earth (Sun side)

        // Distance from central axis
        // dist^2 = |Sat|^2 - dot^2
        const satMagSq = Cartesian3.magnitudeSquared(satPos);
        const distSq = satMagSq - (dot * dot);

        // Earth Radius approx 6371 km -> 6371000 m
        // Atmosphere can extend shadow, let's use 6400km effective
        const EARTH_RADIUS_SQ = 6400000 * 6400000;

        return distSq < EARTH_RADIUS_SQ;
    };

    // ═══════════════════════════════════════════════════
    // Update Satellite Points (type-based coloring)
    // ═══════════════════════════════════════════════════
    const getSatColor = useCallback((objectType?: string, eclipsed?: boolean): Color => {
        const baseAlpha = eclipsed ? 0.3 : 0.85; // Dim if eclipsed
        let color: Color;

        switch (objectType) {
            case 'PAYLOAD': color = Color.CYAN; break;
            case 'ROCKET_BODY': color = Color.ORANGE; break;
            case 'DEBRIS': color = Color.RED; break;
            default: color = new Color(0.7, 0.7, 0.7); break;
        }

        return eclipsed ? color.darken(0.6, new Color()).withAlpha(baseAlpha) : color.withAlpha(baseAlpha);
    }, []);

    const updateSatelliteVisuals = useCallback((data: Position[]) => {
        if (!pointsRef.current) return;

        latestPositionsRef.current = data;
        const points = pointsRef.current;
        points.removeAll();

        // Calculate Sun Position for this frame (approximate)
        const nowJs = new Date();
        const dayOfYear = Math.floor((nowJs.getTime() - new Date(nowJs.getFullYear(), 0, 0).getTime()) / 86400000);
        const hourUTC = nowJs.getUTCHours() + nowJs.getUTCMinutes() / 60;
        const declination = -23.44 * Math.cos(CesiumMath.toRadians((360 / 365) * (dayOfYear + 10)));
        const solarLon = (12 - hourUTC) * 15;
        const sunPos = Cartesian3.fromDegrees(solarLon, declination, 149600000000); // 1 AU

        data.forEach((sat: Position) => {
            const position = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
            const eclipsed = isEclipsed(position, sunPos);

            const isWatched = watchedIdsRef.current?.has(sat.norad_id);
            points.add({
                position,
                color: isWatched
                    ? Color.YELLOW.withAlpha(1.0)
                    : getSatColor(sat.object_type, eclipsed),
                pixelSize: isWatched ? 7 : (sat.object_type === 'DEBRIS' ? 3 : 4),
                id: { ...sat, eclipsed } // Attach eclipse state to ID for picker
            });
        });

        // Trigger heatmap update occasionally (every 100 frames approx, or just when data size changes significantly)
        // Since this runs on WS stream, we can just throttle it.
        // Simple throttle: check if we should update heatmap
        if (showHeatmapRef.current && Math.random() < 0.05) { // ~5% chance per update (approx every few seconds)
            setHeatmapTrigger(prev => prev + 1);
        }
    }, [getSatColor]);

    // ═══════════════════════════════════════════════════
    // Density Heatmap Layer (uses REAL positions)
    // ═══════════════════════════════════════════════════
    const heatmapEntitiesRef = useRef<string[]>([]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Clear old heatmap entities
        for (const id of heatmapEntitiesRef.current) {
            viewer.entities.removeById(id);
        }
        heatmapEntitiesRef.current = [];

        if (!showHeatmap || latestPositionsRef.current.length === 0) return;

        let positions = latestPositionsRef.current;

        // Apply filter to heatmap data if a preset is active
        if (filterPreset === 'debris') {
            positions = positions.filter(p => p.object_type === 'DEBRIS' || p.object_type === 'ROCKET_BODY');
        } else if (filterPreset === 'starlink') {
            positions = positions.filter(p => p.name?.toUpperCase().includes('STARLINK'));
        } else if (filterPreset === 'active' || filterPreset === 'payload') {
            positions = positions.filter(p => p.object_type === 'PAYLOAD');
        }

        const cells = computeDensityGrid(positions, 36, 72);

        cells.forEach((cell, idx) => {
            const entityId = `heatmap-${idx}`;
            const colorStr = getHeatmapColor(cell.intensity);
            // Parse rgba
            const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (!match) return;
            const [, r, g, b, a] = match.map(Number);
            const cesiumColor = new Color(r / 255, g / 255, b / 255, a);

            viewer.entities.add({
                id: entityId,
                rectangle: {
                    coordinates: Rectangle.fromDegrees(
                        cell.lonMin, cell.latMin, cell.lonMax, cell.latMax
                    ),
                    material: cesiumColor,
                    height: 500, // Elevated to prevent Z-fighting with surface
                    outline: false,
                },
            });
            heatmapEntitiesRef.current.push(entityId);
        });
    }, [showHeatmap, latestPositionsRef.current.length, filterPreset, heatmapTrigger]);

    // ═══════════════════════════════════════════════════
    // Day/Night Terminator (real sun position)
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Clear old terminator entities
        for (const id of terminatorEntitiesRef.current) {
            viewer.entities.removeById(id);
        }
        terminatorEntitiesRef.current = [];

        // Compute sub-solar point from current simulation time
        const now = cesiumClock.currentTime;
        const jsDate = JulianDate.toDate(now);
        const dayOfYear = Math.floor((jsDate.getTime() - new Date(jsDate.getFullYear(), 0, 0).getTime()) / 86400000);
        const hourUTC = jsDate.getUTCHours() + jsDate.getUTCMinutes() / 60;

        // Solar declination (simplified)
        const declination = -23.44 * Math.cos(CesiumMath.toRadians((360 / 365) * (dayOfYear + 10)));
        // Sub-solar longitude 
        const solarLon = (12 - hourUTC) * 15; // 15°/hour

        // Generate terminator arc — the circle 90° from sub-solar point
        const terminatorPoints: Cartesian3[] = [];
        const subSolarLatRad = CesiumMath.toRadians(declination);
        const subSolarLonRad = CesiumMath.toRadians(solarLon);

        for (let i = 0; i <= 360; i += 2) {
            const bearing = CesiumMath.toRadians(i);
            const angDist = Math.PI / 2; // 90° from sub-solar point

            const lat = Math.asin(
                Math.sin(subSolarLatRad) * Math.cos(angDist) +
                Math.cos(subSolarLatRad) * Math.sin(angDist) * Math.cos(bearing)
            );
            const lon = subSolarLonRad + Math.atan2(
                Math.sin(bearing) * Math.sin(angDist) * Math.cos(subSolarLatRad),
                Math.cos(angDist) - Math.sin(subSolarLatRad) * Math.sin(lat)
            );

            terminatorPoints.push(
                Cartesian3.fromRadians(lon, lat, 50000) // slight elevation so it's visible
            );
        }

        if (terminatorPoints.length > 2) {
            const termId = 'day-night-terminator';
            viewer.entities.add({
                id: termId,
                polyline: {
                    positions: terminatorPoints,
                    width: 2,
                    material: Color.fromCssColorString('#FFB800').withAlpha(0.5),
                    clampToGround: false,
                }
            });
            terminatorEntitiesRef.current.push(termId);
        }

        // Update every 60 seconds
        const interval = setInterval(() => {
            // Force re-render by updating state (next render cycle will recompute)
        }, 60000);

        return () => clearInterval(interval);
    }, [cesiumClock.currentTime]);

    // ═══════════════════════════════════════════════════
    // Starlink Train Rendering (real cluster detection)
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    // Starlink Train Rendering (Pearl Formation)
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !starlinkBillboardsRef.current) return;

        const starlinkBillboards = starlinkBillboardsRef.current;

        // Clear old Starlink entities and billboards
        for (const id of starlinkEntitiesRef.current) {
            viewer.entities.removeById(id);
        }
        starlinkEntitiesRef.current = [];
        starlinkBillboards.removeAll();

        const positions = latestPositionsRef.current;
        if (positions.length === 0) return;

        const trains = detectStarlinkTrains(positions, 10, 15);

        trains.forEach((cluster, idx) => {
            const polyline = getTrainPolyline(cluster);
            if (polyline.length < 2) return;

            const cesiumPositions = polyline.map(p =>
                Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000)
            );

            // 1. Draw Polyline (The "String")
            const entityId = `starlink-train-${idx}`;
            viewer.entities.add({
                id: entityId,
                polyline: {
                    positions: cesiumPositions,
                    width: 1,
                    material: Color.WHITE.withAlpha(0.2), // Faint line
                }
            });
            starlinkEntitiesRef.current.push(entityId);

            // 2. Draw "Pearls" (Bright Billboards)
            cluster.satellites.forEach(sat => {
                starlinkBillboards.add({
                    position: Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000),
                    image: '/satellite-icon.png', // Fallback, but white pixel works too if no image
                    pixelOffset: new Cartesian2(0, 0),
                    scale: 0.5,
                    color: Color.WHITE.withAlpha(0.9),
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 8000000),
                    scaleByDistance: new NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5),
                });
                // Add a glow point
                starlinkBillboards.add({
                    position: Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000),
                    image: `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuOSkiIGZpbHRlciM9ImJsdXIiIC8+CiAgPGRlZnM+CiAgICA8ZmlsdGVyIGlkPSJibHVyIj4KICAgICAgPGZlR2F1c3NpYW5CbHVyIGluPSJTb3VyY2VHcmFwaGljIiBzdGREZXZpYXRpb249IjIiIC8+CiAgICA8L2ZpbHRlcj4KICA8L2RlZnM+Cjwvc3ZnPg==`,
                    scale: 1.0,
                    color: Color.CYAN.withAlpha(0.6),
                });
            });

            // Add label for the train
            const labelId = `starlink-label-${idx}`;
            const midIdx = Math.floor(polyline.length / 2);
            viewer.entities.add({
                id: labelId,
                position: Cartesian3.fromDegrees(
                    polyline[midIdx].lon, polyline[midIdx].lat, polyline[midIdx].alt * 1000 + 50000
                ),
                label: {
                    text: `${cluster.name}`,
                    font: '12px monospace',
                    fillColor: Color.CYAN,
                    outlineColor: Color.BLACK,
                    outlineWidth: 3,
                    style: 2, // FILL_AND_OUTLINE
                    pixelOffset: new Cartesian2(0, -30),
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 10000000),
                }
            });
            starlinkEntitiesRef.current.push(labelId);
        });
    }, [latestPositionsRef.current.length]);

    // ═══════════════════════════════════════════════════
    // Debris Cloud Rendering
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (!debrisPointsRef.current) return;
        const debrisPoints = debrisPointsRef.current;
        debrisPoints.removeAll();

        debrisFragments.forEach(field => {
            const color = Color.fromCssColorString(field.color).withAlpha(0.5);
            field.fragments.forEach((frag: any) => {
                debrisPoints.add({
                    position: Cartesian3.fromDegrees(frag.lon, frag.lat, frag.alt * 1000),
                    color,
                    pixelSize: 2,
                });
            });
        });
    }, [debrisFragments]);

    // ═══════════════════════════════════════════════════
    // WebSocket Position Stream
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        const ws = connectToPositionStream((data) => {
            updateSatelliteVisuals(data);
        }, 5);

        return () => { ws.close(); };
    }, [updateSatelliteVisuals]);

    // ═══════════════════════════════════════════════════
    // Ground Station Visibility Lines
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        if (!gsLinesRef.current) return;
        const gsLines = gsLinesRef.current;
        gsLines.removeAll();

        if (!visibleSatNoradIds || visibleSatNoradIds.size === 0) return;

        const gsPos = Cartesian3.fromDegrees(GS_LON, GS_LAT, GS_ALT * 1000);
        const positions = latestPositionsRef.current;

        positions.forEach((sat) => {
            if (visibleSatNoradIds.has(sat.norad_id)) {
                const satPos = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
                gsLines.add({
                    positions: [gsPos, satPos],
                    width: 1.5,
                    material: Material.fromType('Color', { color: Color.fromCssColorString('#00FF88').withAlpha(0.6) }),
                });
            }
        });
    }, [visibleSatNoradIds]);

    // ═══════════════════════════════════════════════════
    // Cinematic Camera Mode
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        if (cinematicMode) {
            cinematicTimerRef.current = setInterval(() => {
                const positions = latestPositionsRef.current;
                if (positions.length === 0) return;

                // Cycle through conjunctions first, then random satellites
                if (conjunctions.length > 0 && cinematicIndexRef.current < conjunctions.length) {
                    const event = conjunctions[cinematicIndexRef.current];
                    const midpoint = Cartesian3.fromDegrees(
                        (event.sat1_position.x + event.sat2_position.x) / 2,
                        (event.sat1_position.y + event.sat2_position.y) / 2,
                        ((event.sat1_position.z + event.sat2_position.z) / 2) * 1000 + 500000
                    );
                    viewer.camera.flyTo({ destination: midpoint, duration: 3.0 });
                } else {
                    // Pick a random satellite from top 50
                    const idx = Math.floor(Math.random() * Math.min(50, positions.length));
                    const sat = positions[idx];
                    const destination = Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000 + 800000);
                    viewer.camera.flyTo({ destination, duration: 3.0 });
                    setSelectedSat(sat);
                }

                cinematicIndexRef.current = (cinematicIndexRef.current + 1) % (conjunctions.length + 5);
            }, 8000); // Switch every 8 seconds
        }

        return () => {
            if (cinematicTimerRef.current) {
                clearInterval(cinematicTimerRef.current);
                cinematicTimerRef.current = null;
            }
        };
    }, [cinematicMode, conjunctions]);

    // ═══════════════════════════════════════════════════
    // Fly To Target (Simulated "Go To Location")
    // ═══════════════════════════════════════════════════
    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer || !flyToTarget) return;

        if (
            typeof flyToTarget.lat !== 'number' ||
            typeof flyToTarget.lon !== 'number' ||
            isNaN(flyToTarget.lat) ||
            isNaN(flyToTarget.lon)
        ) return;

        try {
            viewer.camera.flyTo({
                destination: Cartesian3.fromDegrees(
                    flyToTarget.lon,
                    flyToTarget.lat,
                    (flyToTarget.alt || 500) * 1000 + 500000 // Add 500km elevation for better view
                ),
                orientation: {
                    heading: CesiumMath.toRadians(0),
                    pitch: CesiumMath.toRadians(-45),
                    roll: 0
                },
                duration: 3.0
            });
        } catch (e) {
            console.error("FlyTo error:", e);
        }

        // Add a temporary marker for the launch site
        const markerId = 'launch-site-marker';
        viewer.entities.removeById(markerId);
        viewer.entities.add({
            id: markerId,
            position: Cartesian3.fromDegrees(flyToTarget.lon, flyToTarget.lat),
            point: {
                pixelSize: 10,
                color: Color.CYAN,
                outlineColor: Color.WHITE,
                outlineWidth: 2
            },
            label: {
                text: 'LAUNCH SITE',
                font: '12px monospace',
                style: 2, // FILL_AND_OUTLINE
                fillColor: Color.CYAN,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                pixelOffset: new Cartesian2(0, -20),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 5000000)
            }
        });

    }, [flyToTarget]);



    return (
        <div className="w-full h-full relative group">
            <div ref={containerRef} className="w-full h-full" />

            {/* Cinematic Mode Indicator */}
            {cinematicMode && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 border border-cyber-blue/30 rounded-full px-4 py-1.5 backdrop-blur-md z-50 animate-pulse">
                    <span className="text-[10px] font-bold text-cyber-blue uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full" />
                        Cinematic_Mode // Auto-Cycling
                    </span>
                </div>
            )}

            {/* Selection Overlay — Compact info bar */}
            {selectedSat && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-panel/90 border border-cyber-blue/40 rounded-lg p-3 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 z-50 shadow-2xl">
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                            <div className="w-3 h-3 bg-cyber-blue rounded-full animate-pulse ring-4 ring-cyber-blue/20" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Target Locked</div>
                            <div className="text-xs font-mono text-white truncate">
                                NORAD #{selectedSat.norad_id} · {selectedSat.alt.toFixed(0)}km · {selectedSat.velocity.toFixed(2)}km/s
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                className="px-3 py-1.5 bg-cyber-blue/10 border border-cyber-blue/30 text-cyber-blue text-[9px] font-bold rounded hover:bg-cyber-blue/20 transition-colors uppercase tracking-widest"
                                onClick={() => {
                                    if (onSelectSat) onSelectSat(selectedSat);
                                }}
                            >
                                Detail
                            </button>
                            <button
                                className="px-2 py-1.5 bg-white/5 border border-white/10 text-white/40 text-[9px] font-bold rounded hover:bg-white/10 transition-colors"
                                onClick={() => { setSelectedSat(null); if (onSelectSat) onSelectSat(null); }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CesiumViewer;

